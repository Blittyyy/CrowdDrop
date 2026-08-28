export const PARTICIPANT_PREVIEW_LIMIT = 5

/** Earliest Joined first; keep first sighting only (re-joins after withdraw stay one row). */
export function uniqueJoinersInOrder(joinAddressesInLogOrder: readonly string[]): `0x${string}`[] {
  const out: `0x${string}`[] = []
  const seen = new Set<string>()
  for (const raw of joinAddressesInLogOrder) {
    if (!raw || typeof raw !== 'string')
      continue
    const key = raw.toLowerCase()
    if (seen.has(key))
      continue
    seen.add(key)
    out.push(raw as `0x${string}`)
  }
  return out
}

/**
 * Authoritative current participants: Joined candidates whose depositOf > 0.
 * Preserves earliest-join order among wallets that still hold a deposit.
 */
export function currentParticipantsFromDeposits(
  orderedCandidates: readonly string[],
  depositByAddress: ReadonlyMap<string, bigint> | ((address: string) => bigint),
): `0x${string}`[] {
  const getDeposit = typeof depositByAddress === 'function'
    ? depositByAddress
    : (address: string) => depositByAddress.get(address.toLowerCase()) ?? 0n

  const out: `0x${string}`[] = []
  for (const address of uniqueJoinersInOrder(orderedCandidates)) {
    if (getDeposit(address) > 0n)
      out.push(address)
  }
  return out
}

export function participantListPreview(
  addresses: readonly string[],
  expanded: boolean,
  limit = PARTICIPANT_PREVIEW_LIMIT,
): { shown: string[], hiddenCount: number, total: number } {
  const total = addresses.length
  if (expanded || total <= limit)
    return { shown: [...addresses], hiddenCount: 0, total }
  return {
    shown: addresses.slice(0, limit),
    hiddenCount: total - limit,
    total,
  }
}

/**
 * Read depositOf for each candidate. Per-wallet failures resolve to 0n so one bad
 * address never rejects the whole participant section.
 */
export async function resolveParticipantDeposits(
  candidates: readonly string[],
  readDeposit: (address: string) => Promise<bigint>,
): Promise<Map<string, bigint>> {
  const deposits = new Map<string, bigint>()
  await Promise.all(uniqueJoinersInOrder(candidates).map(async (address) => {
    try {
      const amount = await readDeposit(address)
      deposits.set(address.toLowerCase(), amount)
    }
    catch {
      deposits.set(address.toLowerCase(), 0n)
    }
  }))
  return deposits
}

/**
 * CrowdDrop.sol deposit semantics (for UI reconstruction):
 * - Active / Successful: depositOf returns contribution until withdraw (blocked while successful).
 * - Expired: depositOf returns contribution until buyer withdraws (then 0).
 * - Claimed: claim() zeros escrowed but does NOT clear deposits[] — depositOf still returns contribution.
 */
export function hasActiveParticipantDeposit(depositAmount: bigint): boolean {
  return depositAmount > 0n
}
