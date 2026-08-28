/**
 * Server-only CrowdDrop EIP-712 verification for Vercel API routes.
 * Kept separate from src/ so API handlers never import .ts-extension src modules.
 */
import {
  getAddress,
  recoverTypedDataAddress,
  verifyTypedData,
  type Hex,
} from 'viem'

export const AUTH_TEST_ACTION = 'auth_test'

const POLYGON_CHAIN_ID = 137
const POLYGON_CROWDDROP_ADDRESS = '0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12' as const

const CROWDDROP_AUTH_TYPES = {
  Auth: [
    { name: 'action', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'expiresAt', type: 'uint256' },
  ],
} as const

type CrowdDropAuthTypedData = {
  domain: {
    name: string
    version: string
    chainId: number
    verifyingContract: `0x${string}`
  }
  types: typeof CROWDDROP_AUTH_TYPES
  primaryType: 'Auth'
  message: {
    action: string
    wallet: `0x${string}`
    nonce: string
    expiresAt: bigint
  }
}

function buildTypedData(params: {
  action: string
  wallet: string
  nonce: string
  expiresAt: number
}): CrowdDropAuthTypedData {
  return {
    domain: {
      name: 'CrowdDrop',
      version: '1',
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: POLYGON_CROWDDROP_ADDRESS,
    },
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

export function parseProviderTypedData(input: unknown): CrowdDropAuthTypedData {
  if (!input || typeof input !== 'object')
    throw new Error('Typed data must be an object.')

  const raw = input as {
    primaryType?: string
    message?: {
      action?: string
      wallet?: string
      nonce?: string
      expiresAt?: string | number
    }
  }

  if (raw.primaryType !== 'Auth')
    throw new Error('Unexpected primaryType.')

  const expiresRaw = raw.message?.expiresAt
  const expiresAt = typeof expiresRaw === 'string' || typeof expiresRaw === 'number'
    ? BigInt(expiresRaw)
    : null
  if (expiresAt === null || expiresAt < 0n)
    throw new Error('Invalid expiresAt.')

  return buildTypedData({
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

  if (typedData.domain.chainId !== POLYGON_CHAIN_ID)
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

  if (recovered.toLowerCase() !== typedData.message.wallet.toLowerCase())
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
