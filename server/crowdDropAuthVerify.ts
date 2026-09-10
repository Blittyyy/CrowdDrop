/**
 * Server-only CrowdDrop EIP-712 verification for Vercel API routes.
 * Supports seller_upload Auth and product_download Auth (with dropId).
 */
import type { Hex } from 'viem'

export const AUTH_TEST_ACTION = 'auth_test'
export const SELLER_UPLOAD_ACTION = 'seller_upload'
export const PRODUCT_DOWNLOAD_ACTION = 'product_download'

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

const CROWDDROP_PRODUCT_DOWNLOAD_TYPES = {
  Auth: [
    { name: 'action', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'dropId', type: 'uint256' },
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

type CrowdDropProductDownloadTypedData = {
  domain: {
    name: string
    version: string
    chainId: number
    verifyingContract: `0x${string}`
  }
  types: typeof CROWDDROP_PRODUCT_DOWNLOAD_TYPES
  primaryType: 'Auth'
  message: {
    action: string
    wallet: `0x${string}`
    dropId: bigint
    nonce: string
    expiresAt: bigint
  }
}

async function viem() {
  return import('viem')
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
      wallet: params.wallet as `0x${string}`,
      nonce: params.nonce,
      expiresAt: BigInt(params.expiresAt),
    },
  }
}

function buildProductDownloadTypedData(params: {
  wallet: string
  dropId: bigint
  nonce: string
  expiresAt: number
}): CrowdDropProductDownloadTypedData {
  return {
    domain: {
      name: 'CrowdDrop',
      version: '1',
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: POLYGON_CROWDDROP_ADDRESS,
    },
    types: CROWDDROP_PRODUCT_DOWNLOAD_TYPES,
    primaryType: 'Auth',
    message: {
      action: PRODUCT_DOWNLOAD_ACTION,
      wallet: params.wallet as `0x${string}`,
      dropId: params.dropId,
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

  const wallet = String(raw.message?.wallet ?? '')
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet))
    throw new Error('Invalid wallet.')

  return buildTypedData({
    action: String(raw.message?.action ?? ''),
    wallet,
    nonce: String(raw.message?.nonce ?? ''),
    expiresAt: Number(expiresAt),
  })
}

export function parseProductDownloadTypedData(input: unknown): CrowdDropProductDownloadTypedData {
  if (!input || typeof input !== 'object')
    throw new Error('Typed data must be an object.')

  const raw = input as {
    primaryType?: string
    message?: {
      action?: string
      wallet?: string
      dropId?: string | number
      nonce?: string
      expiresAt?: string | number
    }
    types?: { Auth?: Array<{ name: string, type: string }> }
  }

  if (raw.primaryType !== 'Auth')
    throw new Error('Unexpected primaryType.')

  const expiresRaw = raw.message?.expiresAt
  const expiresAt = typeof expiresRaw === 'string' || typeof expiresRaw === 'number'
    ? BigInt(expiresRaw)
    : null
  if (expiresAt === null || expiresAt < 0n)
    throw new Error('Invalid expiresAt.')

  const wallet = String(raw.message?.wallet ?? '')
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet))
    throw new Error('Invalid wallet.')

  const dropRaw = raw.message?.dropId
  if (dropRaw === undefined || dropRaw === null || dropRaw === '')
    throw new Error('dropId is required.')
  const dropId = BigInt(dropRaw)
  if (dropId <= 0n)
    throw new Error('Invalid dropId.')

  const action = String(raw.message?.action ?? '')
  if (action !== PRODUCT_DOWNLOAD_ACTION)
    throw new Error('Invalid action.')

  // Require dropId field in Auth type list to prevent stripping.
  const authFields = raw.types?.Auth ?? []
  if (!authFields.some(field => field.name === 'dropId' && field.type === 'uint256'))
    throw new Error('Typed data must bind dropId.')

  return buildProductDownloadTypedData({
    wallet,
    dropId,
    nonce: String(raw.message?.nonce ?? ''),
    expiresAt: Number(expiresAt),
  })
}

export type VerifyCrowdDropAuthResult =
  | { ok: true, recovered: `0x${string}` }
  | { ok: false, reason: string }

export async function verifyCrowdDropAuthSignature(
  typedData: CrowdDropAuthTypedData | CrowdDropProductDownloadTypedData,
  signature: Hex,
  options: {
    expectedAction?: string
    nowSeconds?: number
  } = {},
): Promise<VerifyCrowdDropAuthResult> {
  const { getAddress, recoverTypedDataAddress, verifyTypedData } = await viem()
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const expectedAction = options.expectedAction ?? AUTH_TEST_ACTION

  typedData.message.wallet = getAddress(typedData.message.wallet)

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
    } as never)
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
  } as never)

  if (!valid)
    return { ok: false, reason: 'Signature verification failed.' }

  return { ok: true, recovered }
}
