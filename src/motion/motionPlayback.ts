/** Mount/play lifecycle helpers for production motion — testable without Vue DOM. */

export function shouldSkipMotionEvaluation(
  claimMotionActive: boolean,
  successMotionActive: boolean,
  claimTransitionActive = false,
): boolean {
  return claimMotionActive || successMotionActive || claimTransitionActive
}

export type MotionPlayAttempt = 'wait' | 'play' | 'give-up'

/** Decide whether to play, wait another mount tick, or abort without marking seen. */
export function nextMotionPlayAttempt(
  motionStillRequested: boolean,
  refAvailable: boolean,
  mountTicksRemaining: number,
): MotionPlayAttempt {
  if (!motionStillRequested)
    return 'give-up'
  if (refAvailable)
    return 'play'
  if (mountTicksRemaining > 0)
    return 'wait'
  return 'give-up'
}

export type MotionPlaySideEffects = {
  /** Persist replay protection — only when play actually begins. */
  markSeen: boolean
  /** Clear session receipt flag — only for claim after play begins. */
  clearClaimReceipt: boolean
  /** Hide motion layer and show static UI — only when mount/play failed. */
  resetMotionUi: boolean
}

export function motionPlaySideEffects(
  attempt: MotionPlayAttempt,
  kind: 'claim' | 'success',
): MotionPlaySideEffects {
  if (attempt === 'play') {
    return {
      markSeen: true,
      clearClaimReceipt: kind === 'claim',
      resetMotionUi: false,
    }
  }
  if (attempt === 'give-up') {
    return {
      markSeen: false,
      clearClaimReceipt: false,
      resetMotionUi: true,
    }
  }
  return {
    markSeen: false,
    clearClaimReceipt: false,
    resetMotionUi: false,
  }
}

/** Max extra nextTick waits after the motion layer is requested (v-if mount). */
export const MOTION_MOUNT_TICKS = 2
