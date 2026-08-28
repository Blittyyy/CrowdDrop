import type { DropStatusLabel } from '../crowdDropAbi'

/** Visible status defers Claimed while the seller claim transition plays. */
export function visibleStatusLabel(
  chainStatus: DropStatusLabel | 'Unknown' | null,
  claimTransitionActive: boolean,
): DropStatusLabel | 'Unknown' | null {
  if (claimTransitionActive)
    return 'Successful'
  return chainStatus
}

/** Static Claimed UI must not render before the claim motion finishes. */
export function shouldShowStaticClaimedUi(
  chainStatus: DropStatusLabel | 'Unknown' | null,
  claimTransitionActive: boolean,
  claimUiReady: boolean,
): boolean {
  if (claimTransitionActive)
    return false
  return chainStatus === 'Claimed' && claimUiReady
}

export function shouldShowSuccessfulSellerUi(
  visibleStatus: DropStatusLabel | 'Unknown' | null,
  successUiReady: boolean,
): boolean {
  return visibleStatus === 'Successful' && successUiReady
}

/** Skip background reloads that would swap UI mid-transition. */
export function shouldDeferDropReload(claimTransitionActive: boolean): boolean {
  return claimTransitionActive
}

export function formatClaimSuccessMessage(amount: string, tokenLabel: string): string {
  return `${amount} ${tokenLabel} sent to your wallet.`
}

/** Small-goal Drops use in-place dot motion — no row repositioning. */
export function isSmallGoalClaimMotion(visibleDotCount: number): boolean {
  return visibleDotCount > 0 && visibleDotCount <= 4
}

/** Peak dot scale during small-goal claim — applied via transform on each dot only. */
export const SMALL_GOAL_DOT_SCALE = 1.2

/** Per-dot toward-center shift in px; left dots move right, right dots move left. */
export function claimDotTowardCenterPx(
  index: number,
  total: number,
  smallGoal: boolean,
): number {
  if (total <= 1)
    return 0
  const center = (total - 1) / 2
  const offset = index - center
  if (smallGoal) {
    const pxPerUnit = 4 / Math.max((total - 1) / 2, 0.5)
    return -offset * pxPerUnit
  }
  return offset * -3.5
}

export type PendingClaimSnapshot = {
  drop: {
    buyerCount: bigint
    escrowed: bigint
    claimed: boolean
  }
  statusLabel: DropStatusLabel | 'Unknown'
}

/** Atomically commit pending chain snapshot after motion completes. */
export function readyToCommitClaimedState(
  pending: PendingClaimSnapshot | null,
  motionComplete: boolean,
): boolean {
  return motionComplete && pending !== null && pending.statusLabel === 'Claimed'
}
