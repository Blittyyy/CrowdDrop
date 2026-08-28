/** Showcase-only motion tokens — fast, purposeful, participant-dot centric. */

export const MOTION_EASE = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  inOut: 'cubic-bezier(0.45, 0, 0.55, 1)',
} as const

export const DOT = {
  size: 10,
  gap: 7,
  border: 1.5,
  orange: '#C94E12',
  green: '#1F7A45',
  divider: '#E2E2DE',
} as const

/** Drop Created — target ~650–800ms for 10 slots */
export const CREATED_TIMING = {
  dotMs: 200,
  staggerMs: 38,
  titleDelayMs: 580,
  restDelayMs: 660,
  fadeMs: 180,
  totalMs(visibleDots: number) {
    const lastDotEnd = (visibleDots - 1) * this.staggerMs + this.dotMs
    return Math.max(lastDotEnd + 120, this.restDelayMs + this.fadeMs)
  },
} as const

/** Drop Success — target ~900ms–1.1s (max ~1.2s) */
export function successTiming(visibleDots: number) {
  const finalFillMs = 180
  const pauseMs = 60
  const sweepStartMs = finalFillMs + pauseMs
  const staggerMs = 40
  const greenMs = 200
  const pulseMs = 160
  const fadeMs = 160

  const sweepEndMs = sweepStartMs + Math.max(visibleDots - 1, 0) * staggerMs
  const greenStartMs = sweepEndMs
  const pulseStartMs = greenStartMs + 140
  const titleStartMs = pulseStartMs + pulseMs - 20
  const restStartMs = titleStartMs + 50
  const totalMs = restStartMs + fadeMs

  return {
    finalFillMs,
    pauseMs,
    sweepStartMs,
    staggerMs,
    confirmMs: 120,
    greenStartMs,
    greenMs,
    pulseStartMs,
    pulseMs,
    titleStartMs,
    restStartMs,
    fadeMs,
    totalMs,
  }
}

/** Claim Complete — target ~900ms–1.2s */
export const CLAIM_TIMING = {
  compressMs: 250,
  holdMs: 100,
  expandMs: 250,
  pulseMs: 120,
  titleDelayMs: 450,
  restDelayMs: 550,
  fadeMs: 160,
  totalMs: 1100,
} as const

export const REDUCED_MOTION_MS = 80

/**
 * Production trigger semantics (showcase demos call play() explicitly via Replay).
 *
 * DROP CREATED — play() once after a confirmed successful Create transaction receipt.
 * SUCCESS — play() when UI observes previousStatus !== 'Successful' && newStatus === 'Successful'.
 *   Do NOT replay on refresh, route mount, or revisiting an already-successful Drop.
 * CLAIM COMPLETE — play() once after seller Claim transaction receipt succeeds.
 *   Do NOT replay when revisiting an already-claimed Drop.
 */
export type MotionTriggerKind = 'drop-created' | 'drop-success' | 'claim-complete'

export const MOTION_TRIGGER_DOCS: Record<
  MotionTriggerKind,
  { when: string; never: string }
> = {
  'drop-created': {
    when: 'Confirmed successful Create transaction receipt.',
    never: 'Route mount, refresh, or reopening an existing Drop.',
  },
  'drop-success': {
    when: 'Live transition into Successful (was not Successful → now Successful).',
    never: 'Opening an already-successful Drop, refresh, or route remount.',
  },
  'claim-complete': {
    when: 'Confirmed successful Claim transaction receipt.',
    never: 'Revisiting an already-claimed Drop or refresh.',
  },
}
