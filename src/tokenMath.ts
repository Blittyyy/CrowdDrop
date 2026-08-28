import { formatUnits } from 'viem'

const INVALID_AMOUNT = 'Enter a valid token amount, such as 0.10, 5, or 10.5.'

/**
 * Parse a human token amount into base units using exact bigint math.
 * Accepts values below 1 (e.g. 0.10 USDT → 100000 with 6 decimals).
 * Does not use floating-point arithmetic for the amount.
 */
export function parseTokenAmount(input: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new Error(`Unsupported token decimals: ${decimals}`)

  const trimmed = input.trim().replace(/[\u00a0\u202f]/g, '')
  if (!trimmed)
    throw new Error('Enter a contribution amount.')

  // Locale decimal comma → period. Reject thousands separators.
  const normalized = trimmed.includes(',') && !trimmed.includes('.')
    ? trimmed.replace(',', '.')
    : trimmed

  if (normalized.includes(','))
    throw new Error(INVALID_AMOUNT)

  // Allow ".10" as "0.10"
  const dotted = normalized.startsWith('.') ? `0${normalized}` : normalized

  if (!/^\d+(\.\d+)?$/.test(dotted))
    throw new Error(INVALID_AMOUNT)

  const [wholePart, fractionPart = ''] = dotted.split('.')
  if (fractionPart.length > decimals)
    throw new Error(`Use at most ${decimals} decimal places.`)

  // Exact base units: whole * 10^decimals + fraction padded to decimals.
  const whole = BigInt(wholePart)
  const fraction = BigInt(fractionPart.padEnd(decimals, '0') || '0')
  const scale = 10n ** BigInt(decimals)
  const value = whole * scale + fraction

  if (value <= 0n)
    throw new Error('Contribution must be greater than 0.')

  return value
}

export function formatTokenAmount(value: bigint, decimals: number): string {
  return formatUnits(value, decimals)
}

/** Total paid on claim: contribution × goal (exact base units). */
export function dropClaimedTotalUnits(contribution: bigint, goal: bigint): bigint {
  return contribution * goal
}
