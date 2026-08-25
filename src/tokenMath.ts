import { formatUnits, parseUnits } from 'viem'

export function parseTokenAmount(input: string, decimals: number): bigint {
  const trimmed = input.trim()
  if (!trimmed)
    throw new Error('Enter a contribution amount.')
  if (!/^\d+(\.\d+)?$/.test(trimmed))
    throw new Error('Enter a valid token amount, such as 5 or 10.50.')
  const fraction = trimmed.split('.')[1] ?? ''
  if (fraction.length > decimals)
    throw new Error(`Use at most ${decimals} decimal places.`)
  const value = parseUnits(trimmed, decimals)
  if (value <= 0n)
    throw new Error('Contribution must be greater than 0.')
  return value
}

export function formatTokenAmount(value: bigint, decimals: number): string {
  return formatUnits(value, decimals)
}
