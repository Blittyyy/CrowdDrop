import { formatUnits } from 'viem'
import type { DropStatusLabel } from './crowdDropAbi'
import type { DropRecord } from './dropCatalog'
import { REUSABLE_ALLOWANCE_TOKENS } from './escrowConfig'

/** Display-only money label. Not used for transaction amounts. */
export function formatMoneyLabel(value: bigint, decimals: number): string {
  const raw = formatUnits(value, decimals)
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [whole, fraction = ''] = unsigned.split('.')
  const trimmedFrac = fraction.replace(/0+$/, '')
  const shown = trimmedFrac.length === 0
    ? `${whole}.00`
    : trimmedFrac.length === 1
      ? `${whole}.${trimmedFrac}0`
      : trimmedFrac.length <= 2
        ? `${whole}.${trimmedFrac}`
        : `${whole}.${trimmedFrac.slice(0, 6).replace(/0+$/, '') || '00'}`
  return `${negative ? '-' : ''}$${shown}`
}

export function formatUsdtPlain(value: bigint, decimals: number): string {
  return formatUnits(value, decimals)
}

export function progressRatio(buyerCount: bigint, goal: bigint): number {
  if (goal <= 0n)
    return 0
  const pct = Number((buyerCount * 1000n) / goal) / 10
  return Math.max(0, Math.min(100, pct))
}

export function spotsLeft(buyerCount: bigint, goal: bigint): number {
  const left = goal - buyerCount
  return left > 0n ? Number(left) : 0
}

export function objectiveStatusLabel(
  status: DropStatusLabel | 'Unknown',
  drop: DropRecord,
): string {
  if (status === 'Claimed')
    return 'CLAIMED'
  if (status === 'Successful')
    return 'SUCCESSFUL'
  if (status === 'Expired')
    return 'EXPIRED'
  if (status === 'Active') {
    const pct = Math.floor(progressRatio(drop.buyerCount, drop.goal))
    if (pct >= 70)
      return `${pct}% FILLED`
    return 'ACTIVE'
  }
  return 'UNKNOWN'
}

/** Compact Home-list status. Plain text — no pills. */
export function homeStatusLabel(
  status: DropStatusLabel | 'Unknown',
  _drop: DropRecord,
): string {
  if (status === 'Claimed')
    return 'Claimed'
  if (status === 'Successful')
    return 'Successful'
  if (status === 'Expired')
    return 'Expired'
  if (status === 'Active')
    return 'Active'
  return 'Unknown'
}

/** Display-only compact money for Home rows, e.g. $5 or $0.10 */
export function formatHomeAmount(value: bigint, decimals: number): string {
  const raw = formatUnits(value, decimals)
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [whole, fraction = ''] = unsigned.split('.')
  const trimmedFrac = fraction.replace(/0+$/, '')
  const shown = trimmedFrac.length === 0 ? whole : `${whole}.${trimmedFrac}`
  return `${negative ? '-' : ''}$${shown}`
}

export const MAX_PARTICIPANT_DOTS = 20

export type ParticipantDotPlan = {
  filled: number
  empty: number
  /** Shown when goal is too large for one-dot-per-slot. */
  countLabel: string | null
}

/** Signature Home progress: one circle per slot, or a capped set for large goals. */
export function participantDotPlan(buyerCount: bigint, goal: bigint): ParticipantDotPlan {
  const joined = Number(buyerCount < 0n ? 0n : buyerCount)
  const total = Number(goal < 0n ? 0n : goal)
  if (!Number.isFinite(total) || total <= 0)
    return { filled: 0, empty: 0, countLabel: null }

  if (total <= MAX_PARTICIPANT_DOTS) {
    const filled = Math.min(joined, total)
    return {
      filled,
      empty: Math.max(total - filled, 0),
      countLabel: null,
    }
  }

  const cappedFilled = Math.round((Math.min(joined, total) / total) * MAX_PARTICIPANT_DOTS)
  const filled = Math.max(0, Math.min(MAX_PARTICIPANT_DOTS, cappedFilled))
  return {
    filled,
    empty: Math.max(0, MAX_PARTICIPANT_DOTS - filled),
    countLabel: `${Math.min(joined, total)}/${total}`,
  }
}

export function formatRemainingShort(deadlineSec: bigint | number, nowSec: number): string | null {
  const left = Number(deadlineSec) - nowSec
  if (left <= 0)
    return 'ending now'
  const hours = Math.floor(left / 3600)
  const minutes = Math.floor((left % 3600) / 60)
  if (hours >= 48)
    return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours >= 1)
    return `${hours}h ${minutes}m`
  if (minutes >= 1)
    return `${minutes}m`
  return `${left}s`
}

export function approvalCapLabel(): string {
  return `$${REUSABLE_ALLOWANCE_TOKENS}`
}
