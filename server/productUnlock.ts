import type { SupabaseClient } from '@supabase/supabase-js'
import type { Hex } from 'viem'
import { getAddress } from 'viem'
import { consumeAuthChallenge } from './authChallengeStore.js'
import {
  createBuyerAccessSessionToken,
  readBuyerAccessSessionFromCookie,
} from './buyerAccessSession.js'
import {
  PRODUCT_DOWNLOAD_ACTION,
  PRODUCT_DOWNLOAD_URL_TTL_SECONDS,
  PRODUCT_ASSET_BUCKET,
  POLYGON_CHAIN_ID,
  POLYGON_CROWDDROP_ADDRESS,
  BUYER_ACCESS_SESSION_TTL_SECONDS,
} from './crowdDropConstants.js'
import {
  parseProductDownloadTypedData,
  verifyCrowdDropAuthSignature,
} from './crowdDropAuthVerify.js'
import { DROP_STATUS } from './crowdDropAbi.js'
import {
  readDepositOf,
  readDropStatus,
  readOnChainDrop,
  type OnChainDrop,
} from './polygonRpc.js'
import { normalizeWallet } from './productFoundation.js'

export type UnlockDeps = {
  readStatus?: (dropId: bigint) => Promise<number>
  readDeposit?: (dropId: bigint, buyer: `0x${string}`) => Promise<bigint>
  readDrop?: (dropId: bigint) => Promise<OnChainDrop>
  createSignedUrl?: (path: string, expiresIn: number) => Promise<string>
  nowMs?: number
  env?: NodeJS.ProcessEnv
}

export type UnlockSuccess = {
  ok: true
  downloadUrl: string
  expiresIn: number
  fileTypeLabel: string | null
  productTitle: string
  productId: string
  dropId: string
  /** Present after EIP-712 unlock — API sets HttpOnly cookie. */
  buyerAccessToken?: string
  buyerAccessMaxAge?: number
}

export type UnlockResult =
  | UnlockSuccess
  | { ok: false, reason: string, status?: number }

type LockedProductRow = {
  id: string
  title: string
  file_type_label: string | null
  asset_path: string
  seller_wallet: string
  drop_id: number
  status: string
}

export function buyerEntitlementAllowed(params: {
  status: number
  deposit: bigint
  seller: string
  wallet: string
}): { ok: true } | { ok: false, reason: string } {
  if (params.status !== DROP_STATUS.Successful && params.status !== DROP_STATUS.Claimed)
    return { ok: false, reason: 'Drop not successful yet.' }
  if (params.deposit <= 0n)
    return { ok: false, reason: 'Wallet did not purchase this Drop.' }
  if (params.wallet.toLowerCase() === params.seller.toLowerCase())
    return { ok: false, reason: 'Product unavailable.' }
  return { ok: true }
}

export async function insertDownloadGrant(
  client: SupabaseClient,
  params: { productId: string, dropId: number, wallet: string },
): Promise<{ ok: true } | { ok: false, reason: string }> {
  const wallet = normalizeWallet(params.wallet)
  const { error } = await client.from('download_grants').insert({
    product_id: params.productId,
    drop_id: params.dropId,
    wallet,
  })
  if (error)
    return { ok: false, reason: error.message }
  return { ok: true }
}

async function loadLockedProduct(
  client: SupabaseClient,
  dropIdNum: number,
): Promise<{ ok: true, row: LockedProductRow } | { ok: false, reason: string, status: number }> {
  const { data: product, error: productError } = await client
    .from('products')
    .select('id, title, file_type_label, asset_path, seller_wallet, drop_id, status')
    .eq('status', 'locked')
    .eq('chain_id', POLYGON_CHAIN_ID)
    .eq('contract_address', POLYGON_CROWDDROP_ADDRESS.toLowerCase())
    .eq('drop_id', dropIdNum)
    .maybeSingle()

  if (productError)
    return { ok: false, reason: 'Could not load product.', status: 500 }
  if (!product)
    return { ok: false, reason: 'Product unavailable.', status: 404 }

  const row = product as LockedProductRow
  if (!row.asset_path)
    return { ok: false, reason: 'Product unavailable.', status: 404 }
  return { ok: true, row }
}

async function issueDownloadForBuyer(
  client: SupabaseClient,
  params: {
    wallet: `0x${string}`
    dropId: bigint
    dropIdNum: number
  },
  deps: UnlockDeps,
): Promise<UnlockResult> {
  const loaded = await loadLockedProduct(client, params.dropIdNum)
  if (loaded.ok === false)
    return loaded

  const row = loaded.row
  let status: number
  let deposit: bigint
  let onChain: OnChainDrop
  try {
    status = await (deps.readStatus
      ? deps.readStatus(params.dropId)
      : readDropStatus(params.dropId))
    deposit = await (deps.readDeposit
      ? deps.readDeposit(params.dropId, params.wallet)
      : readDepositOf(params.dropId, params.wallet))
    onChain = await (deps.readDrop
      ? deps.readDrop(params.dropId)
      : readOnChainDrop(params.dropId))
  }
  catch {
    return { ok: false, reason: 'Could not verify Drop on-chain.', status: 503 }
  }

  const entitlement = buyerEntitlementAllowed({
    status,
    deposit,
    seller: onChain.seller,
    wallet: params.wallet,
  })
  if (entitlement.ok === false)
    return { ok: false, reason: entitlement.reason, status: 403 }

  if (deposit !== onChain.contribution)
    return { ok: false, reason: 'Wallet did not purchase this Drop.', status: 403 }

  const expiresIn = PRODUCT_DOWNLOAD_URL_TTL_SECONDS
  let downloadUrl: string
  try {
    if (deps.createSignedUrl) {
      downloadUrl = await deps.createSignedUrl(row.asset_path, expiresIn)
    }
    else {
      const { data, error } = await client.storage
        .from(PRODUCT_ASSET_BUCKET)
        .createSignedUrl(row.asset_path, expiresIn)
      if (error || !data?.signedUrl)
        throw new Error(error?.message || 'signed_url_failed')
      downloadUrl = data.signedUrl
    }
  }
  catch {
    return { ok: false, reason: 'Could not prepare download.', status: 503 }
  }

  const grant = await insertDownloadGrant(client, {
    productId: row.id,
    dropId: params.dropIdNum,
    wallet: params.wallet,
  })
  if (grant.ok === false)
    console.error('[products/unlock] download_grants insert failed', grant.reason)

  return {
    ok: true,
    downloadUrl,
    expiresIn,
    fileTypeLabel: row.file_type_label,
    productTitle: row.title,
    productId: row.id,
    dropId: String(params.dropIdNum),
  }
}

/** MODE A — first authorization via EIP-712 product_download signature. */
export async function unlockProductDownload(
  client: SupabaseClient,
  params: {
    typedData: unknown
    signature: string
  },
  deps: UnlockDeps = {},
): Promise<UnlockResult> {
  if (typeof params.signature !== 'string' || !params.signature.startsWith('0x'))
    return { ok: false, reason: 'Invalid signature.', status: 400 }

  let typedData
  try {
    typedData = parseProductDownloadTypedData(params.typedData)
  }
  catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Invalid typed data.',
      status: 400,
    }
  }

  const verified = await verifyCrowdDropAuthSignature(
    typedData,
    params.signature as Hex,
    {
      expectedAction: PRODUCT_DOWNLOAD_ACTION,
      nowSeconds: Math.floor((deps.nowMs ?? Date.now()) / 1000),
    },
  )
  if (verified.ok === false)
    return { ok: false, reason: verified.reason, status: 400 }

  const wallet = getAddress(typedData.message.wallet)
  const dropId = typedData.message.dropId
  const dropIdNum = Number(dropId)
  if (!Number.isSafeInteger(dropIdNum) || dropIdNum <= 0)
    return { ok: false, reason: 'Invalid dropId.', status: 400 }

  const consumed = await consumeAuthChallenge(client, {
    nonce: typedData.message.nonce,
    wallet,
    action: PRODUCT_DOWNLOAD_ACTION,
    dropId: dropIdNum,
    nowMs: deps.nowMs,
  })
  if (consumed.ok === false)
    return { ok: false, reason: consumed.reason, status: 400 }

  const issued = await issueDownloadForBuyer(client, { wallet, dropId, dropIdNum }, deps)
  if (issued.ok === false)
    return issued

  const session = createBuyerAccessSessionToken(
    { wallet, dropId: dropIdNum },
    {
      nowSeconds: Math.floor((deps.nowMs ?? Date.now()) / 1000),
      env: deps.env,
    },
  )
  if (session.ok === true) {
    return {
      ...issued,
      buyerAccessToken: session.token,
      buyerAccessMaxAge: BUYER_ACCESS_SESSION_TTL_SECONDS,
    }
  }

  // Download still succeeds even if session cookie cannot be minted (misconfig).
  console.error('[products/unlock] buyer access session create failed', session.reason)
  return issued
}

/**
 * MODE B — returning buyer with HttpOnly access session.
 * Wallet is taken from the verified session only — never from client authority.
 */
export async function unlockProductWithBuyerSession(
  client: SupabaseClient,
  params: {
    dropId: number
    cookieHeader?: string
    /** Optional consistency check only — never authorization. */
    connectedWallet?: string | null
  },
  deps: UnlockDeps = {},
): Promise<UnlockResult> {
  const dropIdNum = params.dropId
  if (!Number.isInteger(dropIdNum) || dropIdNum <= 0)
    return { ok: false, reason: 'Invalid dropId.', status: 400 }

  const session = readBuyerAccessSessionFromCookie(params.cookieHeader, {
    nowSeconds: Math.floor((deps.nowMs ?? Date.now()) / 1000),
    env: deps.env,
    expectedDropId: dropIdNum,
  })
  if (session.ok === false)
    return { ok: false, reason: 'buyer_auth_required', status: 401 }

  const sessionWallet = session.payload.wallet
  if (params.connectedWallet) {
    try {
      const connected = getAddress(params.connectedWallet).toLowerCase()
      if (connected !== sessionWallet.toLowerCase())
        return { ok: false, reason: 'buyer_auth_required', status: 401 }
    }
    catch {
      return { ok: false, reason: 'buyer_auth_required', status: 401 }
    }
  }

  let wallet: `0x${string}`
  try {
    wallet = getAddress(sessionWallet)
  }
  catch {
    return { ok: false, reason: 'buyer_auth_required', status: 401 }
  }

  return issueDownloadForBuyer(
    client,
    {
      wallet,
      dropId: BigInt(dropIdNum),
      dropIdNum,
    },
    deps,
  )
}
