/** Server-only Supabase bucket names (Digital Products V1). */
export const PRODUCT_COVER_BUCKET = 'product-covers'
export const PRODUCT_ASSET_BUCKET = 'product-assets'

export const PRODUCT_STATUSES = ['draft', 'locked'] as const
export type ProductStatus = typeof PRODUCT_STATUSES[number]

export const AUTH_CHALLENGE_ACTIONS = [
  'auth_test',
  'seller_upload',
  'product_download',
] as const
export type AuthChallengeAction = typeof AUTH_CHALLENGE_ACTIONS[number]

const WALLET_RE = /^0x[a-f0-9]{40}$/
const CONTRACT_RE = /^0x[a-f0-9]{40}$/

/** Normalize EVM wallet/contract addresses to lowercase checksummed storage form. */
export function normalizeWallet(address: string): `0x${string}` {
  const trimmed = address.trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed))
    throw new Error('Invalid wallet address.')
  return trimmed.toLowerCase() as `0x${string}`
}

export function normalizeContractAddress(address: string): `0x${string}` {
  return normalizeWallet(address)
}

export function isValidProductStatus(status: string): status is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(status)
}

export function isValidAuthChallengeAction(action: string): action is AuthChallengeAction {
  return (AUTH_CHALLENGE_ACTIONS as readonly string[]).includes(action)
}

export function isNormalizedWallet(value: string): boolean {
  return WALLET_RE.test(value)
}

export function isNormalizedContractAddress(value: string): boolean {
  return CONTRACT_RE.test(value)
}

export function assertLockedProductIdentity(params: {
  chainId: bigint | number | null | undefined
  contractAddress: string | null | undefined
  dropId: bigint | number | null | undefined
}): void {
  if (params.chainId === null || params.chainId === undefined)
    throw new Error('Locked product requires chain_id.')
  if (!params.contractAddress)
    throw new Error('Locked product requires contract_address.')
  if (params.dropId === null || params.dropId === undefined)
    throw new Error('Locked product requires drop_id.')
  if (!isNormalizedContractAddress(params.contractAddress))
    throw new Error('contract_address must be lowercase.')
}
