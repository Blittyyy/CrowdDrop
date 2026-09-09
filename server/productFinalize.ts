import type { SupabaseClient } from '@supabase/supabase-js'
import { getAddress, type Hex, type TransactionReceipt } from 'viem'
import {
  POLYGON_CHAIN_ID,
  POLYGON_CROWDDROP_ADDRESS,
  PRODUCT_COVER_BUCKET,
} from './crowdDropConstants.js'
import { normalizeWallet } from './productFoundation.js'
import {
  assertValidOnChainDrop,
  extractDropCreatedEvent,
  fetchSuccessfulCreateReceipt,
  normalizeTxHash,
  readOnChainDrop,
  type DropCreatedEventArgs,
  type OnChainDrop,
} from './polygonRpc.js'

export type ProductRow = {
  id: string
  seller_wallet: string
  status: string
  title: string
  description: string
  cover_path: string
  asset_path: string
  asset_mime: string
  asset_size_bytes: number
  asset_sha256: string
  file_type_label: string | null
  chain_id: number | null
  contract_address: string | null
  drop_id: number | null
  create_tx_hash: string | null
  locked_contribution: string | null
  locked_goal: number | null
  finalized_at: string | null
}

export type FinalizeResult =
  | {
    ok: true
    productId: string
    dropId: string
    createTxHash: Hex
    contribution: string
    goal: number
    idempotent?: boolean
  }
  | { ok: false, reason: string, status?: number }

export type FinalizeDeps = {
  fetchReceipt?: (txHash: Hex) => Promise<TransactionReceipt>
  readDrop?: (dropId: bigint) => Promise<OnChainDrop>
  nowIso?: string
}

function sameLockedAssociation(
  row: ProductRow,
  params: {
    dropId: bigint
    createTxHash: Hex
  },
): boolean {
  return row.status === 'locked'
    && Number(row.chain_id) === POLYGON_CHAIN_ID
    && (row.contract_address ?? '').toLowerCase() === POLYGON_CROWDDROP_ADDRESS.toLowerCase()
    && Number(row.drop_id) === Number(params.dropId)
    && (row.create_tx_hash ?? '').toLowerCase() === params.createTxHash.toLowerCase()
}

export async function finalizeProductDraft(
  client: SupabaseClient,
  params: {
    draftId: string
    createTxHash: string
    sellerWallet: string
  },
  deps: FinalizeDeps = {},
): Promise<FinalizeResult> {
  let sellerWallet: string
  try {
    sellerWallet = normalizeWallet(params.sellerWallet)
  }
  catch {
    return { ok: false, reason: 'Invalid seller wallet.', status: 400 }
  }

  let createTxHash: Hex
  try {
    createTxHash = normalizeTxHash(params.createTxHash)
  }
  catch {
    return { ok: false, reason: 'Invalid create transaction hash.', status: 400 }
  }

  const draftId = params.draftId.trim()
  if (!/^[0-9a-f-]{36}$/i.test(draftId))
    return { ok: false, reason: 'Invalid draft ID.', status: 400 }

  const { data: product, error: loadError } = await client
    .from('products')
    .select('*')
    .eq('id', draftId)
    .maybeSingle()

  if (loadError)
    return { ok: false, reason: 'Could not load product draft.', status: 500 }
  if (!product)
    return { ok: false, reason: 'Product draft not found.', status: 404 }

  const row = product as ProductRow

  if (row.seller_wallet !== sellerWallet)
    return { ok: false, reason: 'Product draft does not belong to this seller.', status: 403 }

  // Idempotent success for same lock association.
  if (row.status === 'locked') {
    // Need event dropId for comparison — if already locked, compare stored fields to tx after verify.
    // First verify tx still matches stored association when hashes match path.
    try {
      const receipt = await (deps.fetchReceipt
        ? deps.fetchReceipt(createTxHash)
        : fetchSuccessfulCreateReceipt(createTxHash))
      const event = extractDropCreatedEvent(receipt)
      if (event.seller.toLowerCase() !== sellerWallet)
        return { ok: false, reason: 'DropCreated seller does not match authenticated seller.', status: 400 }

      if (sameLockedAssociation(row, { dropId: event.dropId, createTxHash })) {
        return {
          ok: true,
          productId: row.id,
          dropId: event.dropId.toString(),
          createTxHash,
          contribution: row.locked_contribution ?? event.contribution.toString(),
          goal: row.locked_goal ?? Number(event.goal),
          idempotent: true,
        }
      }
      return { ok: false, reason: 'Product is already locked to a different Drop.', status: 409 }
    }
    catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'Could not verify locked product transaction.',
        status: 400,
      }
    }
  }

  if (row.status !== 'draft')
    return { ok: false, reason: 'Product is not a draft.', status: 400 }
  if (row.drop_id !== null && row.drop_id !== undefined)
    return { ok: false, reason: 'Product draft is already associated with a Drop.', status: 409 }
  if (row.finalized_at)
    return { ok: false, reason: 'Product draft is already finalized.', status: 409 }

  let event: DropCreatedEventArgs
  let onChain: OnChainDrop
  try {
    const receipt = await (deps.fetchReceipt
      ? deps.fetchReceipt(createTxHash)
      : fetchSuccessfulCreateReceipt(createTxHash))
    event = extractDropCreatedEvent(receipt)
    if (event.seller.toLowerCase() !== sellerWallet)
      return { ok: false, reason: 'DropCreated seller does not match authenticated seller.', status: 400 }

    onChain = await (deps.readDrop
      ? deps.readDrop(event.dropId)
      : readOnChainDrop(event.dropId))
    assertValidOnChainDrop(onChain, sellerWallet)

    // Cross-check event vs live drop fields.
    if (onChain.contribution !== event.contribution || onChain.goal !== event.goal)
      return { ok: false, reason: 'On-chain Drop does not match DropCreated event.', status: 400 }
  }
  catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Transaction verification failed.',
      status: 400,
    }
  }

  const { data: existingLocked, error: existingError } = await client
    .from('products')
    .select('id')
    .eq('status', 'locked')
    .eq('chain_id', POLYGON_CHAIN_ID)
    .eq('contract_address', POLYGON_CROWDDROP_ADDRESS.toLowerCase())
    .eq('drop_id', Number(event.dropId))
    .maybeSingle()

  if (existingError)
    return { ok: false, reason: 'Could not check Drop product uniqueness.', status: 500 }
  if (existingLocked && existingLocked.id !== row.id)
    return { ok: false, reason: 'Another product is already locked to this Drop.', status: 409 }

  const nowIso = deps.nowIso ?? new Date().toISOString()
  const { data: updated, error: updateError } = await client
    .from('products')
    .update({
      status: 'locked',
      chain_id: POLYGON_CHAIN_ID,
      contract_address: POLYGON_CROWDDROP_ADDRESS.toLowerCase(),
      drop_id: Number(event.dropId),
      create_tx_hash: createTxHash,
      locked_contribution: event.contribution.toString(),
      locked_goal: Number(event.goal),
      finalized_at: nowIso,
    })
    .eq('id', row.id)
    .eq('status', 'draft')
    .is('drop_id', null)
    .is('finalized_at', null)
    .select('id, drop_id, locked_contribution, locked_goal, create_tx_hash')
    .maybeSingle()

  if (updateError) {
    // Unique index race: another product locked this Drop.
    if (updateError.message?.toLowerCase().includes('unique')
      || updateError.code === '23505') {
      return { ok: false, reason: 'Another product is already locked to this Drop.', status: 409 }
    }
    return { ok: false, reason: 'Could not lock product draft.', status: 500 }
  }
  if (!updated)
    return { ok: false, reason: 'Product draft could not be locked (already changed).', status: 409 }

  return {
    ok: true,
    productId: updated.id,
    dropId: String(updated.drop_id),
    createTxHash,
    contribution: String(updated.locked_contribution),
    goal: Number(updated.locked_goal),
  }
}

export function publicCoverUrl(supabaseUrl: string, coverPath: string): string {
  const base = supabaseUrl.replace(/\/$/, '')
  const path = coverPath.replace(/^\/+/, '')
  return `${base}/storage/v1/object/public/${PRODUCT_COVER_BUCKET}/${path}`
}

export type PublicProductMetadata = {
  id: string
  dropId: string
  title: string
  description: string
  coverUrl: string
  fileTypeLabel: string | null
  sellerWallet: string
}

export async function getLockedProductByDrop(
  client: SupabaseClient,
  params: {
    dropId: string | number
    supabaseUrl: string
    chainId?: number
    contractAddress?: string
  },
): Promise<{ ok: true, product: PublicProductMetadata } | { ok: false, reason: string, status?: number }> {
  const dropIdNum = typeof params.dropId === 'number' ? params.dropId : Number(params.dropId)
  if (!Number.isInteger(dropIdNum) || dropIdNum <= 0)
    return { ok: false, reason: 'Invalid dropId.', status: 400 }

  const chainId = params.chainId ?? POLYGON_CHAIN_ID
  const contractAddress = (params.contractAddress ?? POLYGON_CROWDDROP_ADDRESS).toLowerCase()

  const { data, error } = await client
    .from('products')
    .select('id, title, description, cover_path, file_type_label, seller_wallet, drop_id, status')
    .eq('status', 'locked')
    .eq('chain_id', chainId)
    .eq('contract_address', contractAddress)
    .eq('drop_id', dropIdNum)
    .maybeSingle()

  if (error)
    return { ok: false, reason: 'Could not load product.', status: 500 }
  if (!data)
    return { ok: false, reason: 'No locked product for this Drop.', status: 404 }

  return {
    ok: true,
    product: {
      id: data.id,
      dropId: String(data.drop_id),
      title: data.title,
      description: data.description,
      coverUrl: publicCoverUrl(params.supabaseUrl, data.cover_path),
      fileTypeLabel: data.file_type_label,
      sellerWallet: data.seller_wallet,
    },
  }
}

/** Exported for tests: checksum helper. */
export function checksumAddress(address: string): string {
  return getAddress(address)
}
