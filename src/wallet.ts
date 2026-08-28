import { POLYGON_CHAIN_ID, SEPOLIA_CHAIN_ID, activeCrowdDropNetwork } from './escrowConfig'
import { isUserRejection as isTxUserRejection } from './txRequest'

export const KNOWN_CHAINS: Record<string, string> = {
  '0x1': 'Ethereum',
  [POLYGON_CHAIN_ID]: 'Polygon',
  '0xa4b1': 'Arbitrum One',
  '0xa': 'Optimism',
  '0x2105': 'Base',
  '0x38': 'BNB Smart Chain',
  [SEPOLIA_CHAIN_ID]: 'Sepolia',
}

export function getEthereumProvider(): EthereumProvider {
  if (!window.ethereum)
    throw new Error('Ethereum provider unavailable. Open this app inside Nimiq Pay.')
  return window.ethereum
}

export function normalizeChainId(chainId: string): string {
  return chainId.startsWith('0x') ? chainId.toLowerCase() : `0x${Number(chainId).toString(16)}`
}

export function formatChainId(chainId: string): { hex: string, name: string } {
  const hex = normalizeChainId(chainId)
  return {
    hex,
    name: KNOWN_CHAINS[hex] ?? 'Unknown network',
  }
}

export function isSepolia(chainId: string | null): boolean {
  return chainId === SEPOLIA_CHAIN_ID
}

export function isPolygon(chainId: string | null): boolean {
  return chainId === POLYGON_CHAIN_ID
}

export function isActiveCrowdDropChain(chainId: string | null): boolean {
  return chainId === activeCrowdDropNetwork.chainId
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b)
    return false
  return a.toLowerCase() === b.toLowerCase()
}

export function shortenAddress(address: string): string {
  if (address.length < 12)
    return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function formatWalletError(error: unknown): string {
  if (isTxUserRejection(error))
    return 'Transaction cancelled.'

  if (typeof error === 'object' && error !== null) {
    const message = 'message' in error ? (error as { message?: unknown }).message : undefined
    const data = 'data' in error ? (error as { data?: unknown }).data : undefined

    if (typeof message === 'string' && message.trim())
      return typeof data === 'string' && data.trim() ? `${message} (${data})` : message
  }

  return error instanceof Error ? error.message : String(error)
}

export function getProviderErrorMessage(value: unknown): string | null {
  if (typeof value === 'object' && value !== null && 'error' in value) {
    const maybeError = (value as { error?: { message?: unknown } }).error
    if (maybeError && typeof maybeError.message === 'string')
      return maybeError.message
    return 'Provider request failed.'
  }
  return null
}

export function isUnrecognizedChainError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null)
    return false
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined
  return code === 4902 || code === '4902'
}

/** Re-export for existing callers. */
export function isUserRejection(error: unknown): boolean {
  return isTxUserRejection(error)
}
