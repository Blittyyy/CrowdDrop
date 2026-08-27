export const MAX_PARTICIPANT_DOTS = 20

export type DotPlan = {
  filled: number
  empty: number
  countLabel: string | null
}

export function participantDotPlan(joined: number, goal: number): DotPlan {
  const total = Math.max(0, goal)
  const filledRaw = Math.min(Math.max(0, joined), total)
  if (total <= 0)
    return { filled: 0, empty: 0, countLabel: null }
  if (total <= MAX_PARTICIPANT_DOTS) {
    return { filled: filledRaw, empty: total - filledRaw, countLabel: null }
  }
  const filled = Math.round((filledRaw / total) * MAX_PARTICIPANT_DOTS)
  const capped = Math.min(MAX_PARTICIPANT_DOTS, Math.max(0, filled))
  return {
    filled: capped,
    empty: Math.max(0, MAX_PARTICIPANT_DOTS - capped),
    countLabel: `${filledRaw}/${total}`,
  }
}

/** Treatment 2 — Light / Orange (locked). */
export const T2 = {
  bg: '#F6F6F4',
  text: '#141414',
  muted: '#6A6A6A',
  divider: '#E2E2DE',
  orange: '#C94E12',
  success: '#1F7A45',
  expired: '#B07A2E',
  surfaceSoft: '#EEECE8',
  joinedTint: '#F1E7DF',
} as const
