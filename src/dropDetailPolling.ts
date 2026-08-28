/** Active Drop Detail polling helpers — testable, no DOM. */

export const ACTIVE_DROP_POLL_MS = 5000

export type DropPublicSnapshot = {
  buyerCount: bigint
  escrowed: bigint
  statusLabel: string
  claimed: boolean
}

export function shouldPollDrop(
  statusLabel: string | null,
  escrowed: bigint,
): boolean {
  if (!statusLabel)
    return false
  if (statusLabel === 'Claimed')
    return false
  if (statusLabel === 'Active' || statusLabel === 'Successful')
    return true
  if (statusLabel === 'Expired')
    return escrowed > 0n
  return false
}

/** @deprecated Use shouldPollDrop */
export function shouldPollActiveDrop(statusLabel: string | null): boolean {
  return shouldPollDrop(statusLabel, 1n)
}

export function shouldPausePolling(visibilityState: string): boolean {
  return visibilityState !== 'visible'
}

/** Skip a poll tick when a refresh is already in flight. */
export function canStartPollTick(pollInFlight: boolean, manualRefreshInFlight: boolean): boolean {
  return !pollInFlight && !manualRefreshInFlight
}

/** Reload Participants only when public counters/status changed. */
export function participantsNeedReload(
  before: DropPublicSnapshot | null,
  after: DropPublicSnapshot,
): boolean {
  if (!before)
    return true
  return before.buyerCount !== after.buyerCount
    || before.escrowed !== after.escrowed
    || before.statusLabel !== after.statusLabel
    || before.claimed !== after.claimed
}

export function snapshotFromDrop(
  drop: {
    buyerCount: bigint
    escrowed: bigint
    claimed: boolean
  } | null,
  statusLabel: string | null,
): DropPublicSnapshot | null {
  if (!drop || !statusLabel)
    return null
  return {
    buyerCount: drop.buyerCount,
    escrowed: drop.escrowed,
    statusLabel,
    claimed: drop.claimed,
  }
}
