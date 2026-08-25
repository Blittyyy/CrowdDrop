import { activeCrowdDropNetwork } from './escrowConfig'
import { formatWalletError } from './wallet'

const token = () => activeCrowdDropNetwork.tokenSymbol
const gas = () => activeCrowdDropNetwork.nativeCurrency.symbol

const REVERT_MESSAGES: Array<[string, string]> = [
  ['seller cannot join', 'You cannot join your own drop.'],
  ['already joined', 'You already joined this drop.'],
  ['already successful', 'This drop already reached its goal.'],
  ['expired', 'This drop has expired.'],
  ['drop successful', 'This drop succeeded, so you cannot withdraw.'],
  ['no deposit', 'You have no deposit to withdraw in this drop.'],
  ['not seller', 'Only the seller can claim this drop.'],
  ['not successful', 'This drop has not reached its goal yet.'],
  ['already claimed', 'This drop was already claimed.'],
  ['unknown drop', 'This drop does not exist.'],
  ['contribution required', 'Contribution must be greater than 0.'],
  ['goal too small', 'Need at least 2 buyers.'],
  ['goal too large', 'Buyer goal cannot exceed 1000.'],
  ['duration too short', 'Duration must be at least 1 hour.'],
  ['duration too long', 'Duration cannot exceed 90 days.'],
  ['nothing to claim', 'There is nothing left to claim.'],
]

export function friendlyUserError(error: unknown): string {
  const raw = formatWalletError(error)
  const lower = raw.toLowerCase()

  if (/insufficient funds|insufficient balance|not enough.*gas/i.test(raw))
    return `Not enough ${gas()} for gas.`

  if (/allowance/i.test(lower))
    return `Enable CrowdDrop first, then join.`

  if (/exceeds balance|insufficient.*tusd|insufficient.*usdt|insufficient.*token/i.test(lower))
    return `Not enough ${token()} to join.`

  for (const [needle, message] of REVERT_MESSAGES) {
    if (lower.includes(needle))
      return message
  }

  if (/json-rpc|failed to fetch|network error|http/i.test(raw))
    return 'Could not reach the network. Check your connection and try again.'

  const cleaned = raw
    .replace(/^error:\s*/i, '')
    .replace(/execution reverted:?\s*/i, '')
    .trim()

  if (cleaned.length > 180)
    return 'Transaction failed. Check the details below.'

  return cleaned || 'Something went wrong.'
}

export function isUnknownDropError(error: unknown): boolean {
  const raw = `${formatWalletError(error)}\n${developerErrorDetail(error)}`.toLowerCase()
  return /unknown drop|drop not found|does not exist/.test(raw)
}

export function isTransientReadError(error: unknown): boolean {
  if (isUnknownDropError(error))
    return false
  const raw = `${formatWalletError(error)}\n${developerErrorDetail(error)}`.toLowerCase()
  return /failed to fetch|network error|timeout|timed out|json-rpc|http|-32603|-32002|-32005|internal error|disconnected|coalesce|unexpected end|cannot decode|position 0|provider/.test(raw)
}

export function developerErrorDetail(error: unknown): string {
  if (error instanceof Error)
    return error.stack ? `${error.message}\n${error.stack}` : error.message
  try {
    return JSON.stringify(error, null, 2)
  }
  catch {
    return String(error)
  }
}
