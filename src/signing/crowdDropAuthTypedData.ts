import {
  getAddress,
  recoverTypedDataAddress,
  verifyTypedData,
  type Hex,
} from 'viem'
import { POLYGON_CROWDDROP_ADDRESS, POLYGON_CHAIN_DECIMAL } from '../escrowConfig.ts'

/** Reusable CrowdDrop auth actions (V1 smoke test uses auth_test). */
export type CrowdDropAuthAction = 'auth_test' | 'seller_upload' | 'product_download'

export const AUTH_TEST_ACTION = 'auth_test' as const satisfies CrowdDropAuthAction

export const AUTH_CHALLENGE_TTL_SECONDS = 5 * 60

export const CROWDDROP_AUTH_DOMAIN = {
  name: 'CrowdDrop',
  version: '1',
  chainId: POLYGON_CHAIN_DECIMAL,
  verifyingContract: POLYGON_CROWDDROP_ADDRESS,
} as const

export const CROWDDROP_AUTH_TYPES = {
  Auth: [
    { name: 'action', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'expiresAt', type: 'uint256' },
  ],
} as const

export const CROWDDROP_AUTH_EIP712_DOMAIN_TYPES = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const

export type CrowdDropAuthMessage = {
  action: string
  wallet: `0x${string}`
  nonce: string
  expiresAt: bigint
}

export type CrowdDropAuthTypedData = {
  domain: typeof CROWDDROP_AUTH_DOMAIN
  types: typeof CROWDDROP_AUTH_TYPES
  primaryType: 'Auth'
  message: CrowdDropAuthMessage
}

/** JSON payload shape for eth_signTypedData_v4 (uint256 as decimal string). */
export type CrowdDropAuthProviderPayload = {
  types: {
    EIP712Domain: Array<{ name: string, type: string }>
    Auth: Array<{ name: string, type: string }>
  }
  primaryType: 'Auth'
  domain: {
    name: string
    version: string
    chainId: number
    verifyingContract: `0x${string}`
  }
  message: {
    action: string
    wallet: `0x${string}`
    nonce: string
    expiresAt: string
  }
}

export function buildCrowdDropAuthTypedData(params: {
  action: string
  wallet: string
  nonce: string
  expiresAt: number
}): CrowdDropAuthTypedData {
  return {
    domain: CROWDDROP_AUTH_DOMAIN,
    types: CROWDDROP_AUTH_TYPES,
    primaryType: 'Auth',
    message: {
      action: params.action,
      wallet: getAddress(params.wallet),
      nonce: params.nonce,
      expiresAt: BigInt(params.expiresAt),
    },
  }
}

export function toProviderTypedDataPayload(data: CrowdDropAuthTypedData): CrowdDropAuthProviderPayload {
  return {
    types: {
      EIP712Domain: [...CROWDDROP_AUTH_EIP712_DOMAIN_TYPES],
      Auth: [...CROWDDROP_AUTH_TYPES.Auth],
    },
    primaryType: data.primaryType,
    domain: {
      name: data.domain.name,
      version: data.domain.version,
      chainId: data.domain.chainId,
      verifyingContract: data.domain.verifyingContract,
    },
    message: {
      action: data.message.action,
      wallet: data.message.wallet,
      nonce: data.message.nonce,
      expiresAt: data.message.expiresAt.toString(),
    },
  }
}

export function serializeProviderTypedData(payload: CrowdDropAuthProviderPayload): string {
  return JSON.stringify(payload)
}

export function parseProviderTypedData(input: unknown): CrowdDropAuthTypedData {
  if (!input || typeof input !== 'object')
    throw new Error('Typed data must be an object.')

  const raw = input as CrowdDropAuthProviderPayload
  if (raw.primaryType !== 'Auth')
    throw new Error('Unexpected primaryType.')

  const expiresRaw = raw.message?.expiresAt
  const expiresAt = typeof expiresRaw === 'string' || typeof expiresRaw === 'number'
    ? BigInt(expiresRaw)
    : null
  if (expiresAt === null || expiresAt < 0n)
    throw new Error('Invalid expiresAt.')

  return buildCrowdDropAuthTypedData({
    action: String(raw.message?.action ?? ''),
    wallet: String(raw.message?.wallet ?? ''),
    nonce: String(raw.message?.nonce ?? ''),
    expiresAt: Number(expiresAt),
  })
}

export type VerifyCrowdDropAuthResult =
  | { ok: true, recovered: `0x${string}` }
  | { ok: false, reason: string }

export async function verifyCrowdDropAuthSignature(
  typedData: CrowdDropAuthTypedData,
  signature: Hex,
  options: {
    expectedAction?: string
    nowSeconds?: number
  } = {},
): Promise<VerifyCrowdDropAuthResult> {
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const expectedAction = options.expectedAction ?? AUTH_TEST_ACTION

  if (typedData.domain.chainId !== POLYGON_CHAIN_DECIMAL)
    return { ok: false, reason: 'Invalid chainId.' }

  if (typedData.domain.verifyingContract.toLowerCase() !== POLYGON_CROWDDROP_ADDRESS.toLowerCase())
    return { ok: false, reason: 'Invalid verifyingContract.' }

  if (typedData.message.action !== expectedAction)
    return { ok: false, reason: 'Invalid action.' }

  if (typedData.message.expiresAt < BigInt(nowSeconds))
    return { ok: false, reason: 'Challenge expired.' }

  let recovered: `0x${string}`
  try {
    recovered = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      signature,
    })
  }
  catch {
    return { ok: false, reason: 'Invalid signature.' }
  }

  const walletMatch = recovered.toLowerCase() === typedData.message.wallet.toLowerCase()
  if (!walletMatch)
    return { ok: false, reason: 'Recovered wallet does not match message wallet.' }

  const valid = await verifyTypedData({
    address: typedData.message.wallet,
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
    signature,
  })

  if (!valid)
    return { ok: false, reason: 'Signature verification failed.' }

  return { ok: true, recovered }
}
