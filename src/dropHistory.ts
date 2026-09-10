import type { DropSummary } from './dropCatalog.ts'

/** Keep recently resolved Drops on Home for this long after resolution. */
export const HISTORY_RECENCY_SECONDS = 7 * 24 * 60 * 60

export type HistoryDropRow = DropSummary & {
  resolvedAtSec: number
}

export function walletDepositOf(summary: DropSummary): bigint {
  return summary.walletDeposit ?? 0n
}

/**
 * Actionable for the connected wallet — must never age out of Home.
 * Successful = unclaimed goal reached (statusOf never returns Successful once claimed).
 */
export function isActionableYourDrop(summary: DropSummary): boolean {
  if (summary.status === 'Active' || summary.status === 'Successful')
    return true
  if (summary.status === 'Expired' && walletDepositOf(summary) > 0n)
    return true
  return false
}

/** Fully resolved for this wallet — eligible to move to History after the recency window. */
export function isResolvedYourDrop(summary: DropSummary): boolean {
  if (isActionableYourDrop(summary))
    return false
  return summary.status === 'Claimed' || summary.status === 'Expired'
}

/**
 * Authoritative resolution time when known:
 * - Claimed → Claimed event block timestamp (via claimTimestamps map)
 * - Resolved Expired → on-chain deadline (when statusOf flips to Expired)
 * Returns null when Claimed time is unavailable — caller must not invent one.
 */
export function resolutionTimestampSec(
  summary: DropSummary,
  claimTimestamps: ReadonlyMap<string, number>,
): number | null {
  if (summary.status === 'Claimed') {
    const ts = claimTimestamps.get(summary.id)
    return typeof ts === 'number' && Number.isFinite(ts) ? ts : null
  }
  if (summary.status === 'Expired') {
    const deadline = Number(summary.drop.deadline)
    return Number.isFinite(deadline) ? deadline : null
  }
  return null
}

/**
 * Home Your Drops membership after applying actionable overrides + 7-day recency.
 * Missing claim timestamps keep Claimed rows on Home (safe — never invent times).
 */
export function belongsInHomeYourDrops(
  summary: DropSummary,
  nowSec: number,
  claimTimestamps: ReadonlyMap<string, number>,
  recencySec: number = HISTORY_RECENCY_SECONDS,
): boolean {
  if (isActionableYourDrop(summary))
    return true
  if (!isResolvedYourDrop(summary))
    return true
  const resolvedAt = resolutionTimestampSec(summary, claimTimestamps)
  if (resolvedAt == null)
    return true
  return nowSec - resolvedAt < recencySec
}

export function partitionYourDrops(
  summaries: readonly DropSummary[],
  nowSec: number,
  claimTimestamps: ReadonlyMap<string, number>,
  recencySec: number = HISTORY_RECENCY_SECONDS,
): { home: DropSummary[], history: HistoryDropRow[] } {
  const home: DropSummary[] = []
  const history: HistoryDropRow[] = []
  for (const row of summaries) {
    if (belongsInHomeYourDrops(row, nowSec, claimTimestamps, recencySec)) {
      home.push(row)
      continue
    }
    const resolvedAt = resolutionTimestampSec(row, claimTimestamps)
    if (resolvedAt == null || !isResolvedYourDrop(row))
      continue
    history.push({ ...row, resolvedAtSec: resolvedAt })
  }
  history.sort((a, b) => {
    if (b.resolvedAtSec !== a.resolvedAtSec)
      return b.resolvedAtSec - a.resolvedAtSec
    return BigInt(b.id) > BigInt(a.id) ? 1 : -1
  })
  return { home, history }
}
