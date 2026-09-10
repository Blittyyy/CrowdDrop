import type { SupabaseClient } from '@supabase/supabase-js'
import type { Hex } from 'viem'
import { getAddress } from 'viem'
import { consumeAuthChallenge } from './authChallengeStore.js'
import {
  PRODUCT_DOWNLOAD_ACTION,
  PRODUCT_DOWNLOAD_URL_TTL_SECONDS,
  PRODUCT_ASSET_BUCKET,
  POLYGON_CHAIN_ID,
  POLYGON_CROWDDROP_ADDRESS,
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
}

export type UnlockResult =
  | {
    ok: true
    downloadUrl: string
    expiresIn: number
    fileTypeLabel: string | null
    productTitle: string
    productId: string
    dropId: string
  }
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

  let status: number
  let deposit: bigint
  let onChain: OnChainDrop
  try {
    status = await (deps.readStatus
      ? deps.readStatus(dropId)
      : readDropStatus(dropId))
    deposit = await (deps.readDeposit
      ? deps.readDeposit(dropId, wallet)
      : readDepositOf(dropId, wallet))
    onChain = await (deps.readDrop
      ? deps.readDrop(dropId)
      : readOnChainDrop(dropId))
  }
  catch {
    return { ok: false, reason: 'Could not verify Drop on-chain.', status: 503 }
  }

  const entitlement = buyerEntitlementAllowed({
    status,
    deposit,
    seller: onChain.seller,
    wallet,
  })
  if (entitlement.ok === false)
    return { ok: false, reason: entitlement.reason, status: 403 }

  // Optional hardening: deposit should equal contribution for this Drop.
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
    dropId: dropIdNum,
    wallet,
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
    dropId: String(dropIdNum),
  }
}
