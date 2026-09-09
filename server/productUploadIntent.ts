import { createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAX_ACTIVE_UPLOAD_INTENTS_PER_WALLET,
  MAX_ASSET_BYTES,
  MAX_COVER_BYTES,
  MAX_UPLOAD_INTENTS_PER_IP_PER_HOUR,
  MAX_UPLOAD_INTENTS_PER_WALLET_PER_HOUR,
  PRODUCT_ASSET_BUCKET,
  PRODUCT_COVER_BUCKET,
  UPLOAD_INTENT_TTL_SECONDS,
} from './crowdDropConstants.js'
import {
  buildStoragePath,
  storageExtension,
  validateAssetMetadata,
  validateAssetSha256,
  validateCoverMetadata,
  validateDescription,
  validateTitle,
} from './productDraftValidation.js'

export type FileMetaInput = {
  name: string
  size: number
  type: string
}

export type UploadIntentRequest = {
  sellerWallet: string
  title: string
  description: string
  cover: FileMetaInput
  asset: FileMetaInput
  assetSha256: string
  /** HMAC hex of client IP; never raw IP. */
  ipHash?: string | null
  nowMs?: number
}

export type SignedUploadTarget = {
  bucket: string
  path: string
  token: string
  signedUrl: string
  contentType: string
}

export type CreateUploadIntentResult =
  | {
    ok: true
    uploadIntentId: string
    expiresAt: string
    cover: SignedUploadTarget
    asset: SignedUploadTarget
  }
  | { ok: false, reason: string, code?: string, status?: number }

export type CompleteUploadResult =
  | {
    ok: true
    draftId: string
    fileTypeLabel: string
    assetSizeBytes: number
    assetSha256: string
  }
  | { ok: false, reason: string, status?: number }

export type UploadIntentRow = {
  id: string
  seller_wallet: string
  title: string
  description: string
  cover_path: string
  cover_expected_mime: string
  cover_expected_size: number
  asset_path: string
  asset_expected_mime: string
  asset_expected_size: number
  asset_original_name: string | null
  asset_expected_sha256: string
  file_type_label: string
  ip_hash: string | null
  expires_at: string
  completed_at: string | null
  cleaned_at: string | null
}

export function uploadIntentExpiresAt(nowMs = Date.now()): Date {
  return new Date(nowMs + UPLOAD_INTENT_TTL_SECONDS * 1000)
}

export function buildObjectPath(
  kind: 'covers' | 'assets',
  sellerWallet: string,
  mime: string,
  filename: string,
): string {
  return `${buildStoragePath(kind, sellerWallet)}.${storageExtension(mime, filename)}`
}

/** Hash client IP with server secret. Never persist raw IP. */
export function hashClientIp(
  ip: string | null | undefined,
  secret: string | null | undefined,
): string | null {
  const trimmed = ip?.trim()
  if (!trimmed || !secret?.trim())
    return null
  return createHmac('sha256', secret.trim()).update(trimmed).digest('hex')
}

/**
 * Prefer Vercel-provided client IP.
 * On Vercel, x-forwarded-for is set by the platform; use the first hop.
 */
export function extractClientIp(headers: {
  'x-forwarded-for'?: string | string[] | undefined
  'x-real-ip'?: string | string[] | undefined
}): string | null {
  const real = headers['x-real-ip']
  if (typeof real === 'string' && real.trim())
    return real.split(',')[0]?.trim() || null
  if (Array.isArray(real) && real[0])
    return String(real[0]).split(',')[0]?.trim() || null

  const forwarded = headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (typeof raw === 'string' && raw.trim())
    return raw.split(',')[0]?.trim() || null
  return null
}

export async function countActiveUploadIntents(
  client: SupabaseClient,
  sellerWallet: string,
  nowMs = Date.now(),
): Promise<number> {
  const nowIso = new Date(nowMs).toISOString()
  const { count, error } = await client
    .from('product_upload_intents')
    .select('id', { count: 'exact', head: true })
    .eq('seller_wallet', sellerWallet.toLowerCase())
    .is('completed_at', null)
    .is('cleaned_at', null)
    .gt('expires_at', nowIso)

  if (error)
    throw new Error(error.message)
  return count ?? 0
}

export async function countUploadIntentsSince(
  client: SupabaseClient,
  column: 'seller_wallet' | 'ip_hash',
  value: string,
  sinceMs: number,
): Promise<number> {
  const sinceIso = new Date(sinceMs).toISOString()
  const { count, error } = await client
    .from('product_upload_intents')
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .gte('created_at', sinceIso)

  if (error)
    throw new Error(error.message)
  return count ?? 0
}

type ObjectMeta = {
  size: number | null
  mimetype: string | null
}

async function readObjectMeta(
  client: SupabaseClient,
  bucket: string,
  objectPath: string,
): Promise<{ ok: true, meta: ObjectMeta } | { ok: false, reason: string }> {
  const slash = objectPath.lastIndexOf('/')
  const folder = slash >= 0 ? objectPath.slice(0, slash) : ''
  const filename = slash >= 0 ? objectPath.slice(slash + 1) : objectPath

  const { data, error } = await client.storage.from(bucket).list(folder, {
    search: filename,
    limit: 100,
  })
  if (error)
    return { ok: false, reason: `Could not verify ${bucket} object.` }

  const match = data?.find(item => item.name === filename)
  if (!match)
    return { ok: false, reason: `Expected object missing: ${bucket}/${objectPath}` }

  const metadata = (match.metadata ?? {}) as Record<string, unknown>
  const sizeRaw = metadata.size ?? metadata.contentLength ?? match.metadata?.size
  const size = typeof sizeRaw === 'number'
    ? sizeRaw
    : typeof sizeRaw === 'string'
      ? Number(sizeRaw)
      : null
  const mimetypeRaw = metadata.mimetype ?? metadata.contentType
  const mimetype = typeof mimetypeRaw === 'string' ? mimetypeRaw.toLowerCase() : null

  return {
    ok: true,
    meta: {
      size: Number.isFinite(size) ? size : null,
      mimetype,
    },
  }
}

/** Best-effort first-bytes sniff via Range request (service role). */
export async function sniffStoredObjectPrefix(
  client: SupabaseClient,
  bucket: string,
  objectPath: string,
  byteCount = 32,
): Promise<Buffer | null> {
  try {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(objectPath, 60)
    if (error || !data?.signedUrl)
      return null

    const response = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${byteCount - 1}` },
    })
    if (!response.ok && response.status !== 206)
      return null
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
  catch {
    return null
  }
}

export async function createUploadIntent(
  client: SupabaseClient,
  input: UploadIntentRequest,
): Promise<CreateUploadIntentResult> {
  const nowMs = input.nowMs ?? Date.now()

  const titleCheck = validateTitle(input.title)
  if (titleCheck.ok === false)
    return { ok: false, reason: titleCheck.reason, status: 400 }

  const descriptionCheck = validateDescription(input.description)
  if (descriptionCheck.ok === false)
    return { ok: false, reason: descriptionCheck.reason, status: 400 }

  const coverCheck = validateCoverMetadata(input.cover.name, input.cover.size, input.cover.type || '')
  if (coverCheck.ok === false)
    return { ok: false, reason: coverCheck.reason, status: 400 }

  const assetCheck = validateAssetMetadata(input.asset.name, input.asset.size, input.asset.type || '')
  if (assetCheck.ok === false)
    return { ok: false, reason: assetCheck.reason, status: 400 }

  if (input.cover.size > MAX_COVER_BYTES)
    return { ok: false, reason: `Cover image must be at most ${MAX_COVER_BYTES / (1024 * 1024)} MB.`, status: 400 }
  if (input.asset.size > MAX_ASSET_BYTES)
    return { ok: false, reason: `Digital file must be at most ${MAX_ASSET_BYTES / (1024 * 1024)} MB.`, status: 400 }

  const shaCheck = validateAssetSha256(input.assetSha256)
  if (shaCheck.ok === false)
    return { ok: false, reason: shaCheck.reason, status: 400 }

  const sellerWallet = input.sellerWallet.toLowerCase()

  // Opportunistic: free this seller's expired orphans before active-quota check.
  // Does not weaken rolling-hour rate limits (historical rows still count).
  try {
    await cleanupExpiredUploadIntents(client, {
      nowMs,
      sellerWallet,
      limit: 20,
    })
  }
  catch (error) {
    console.error('[upload-intent] seller opportunistic cleanup failed', error)
  }

  const activeCount = await countActiveUploadIntents(client, sellerWallet, nowMs)
  if (activeCount >= MAX_ACTIVE_UPLOAD_INTENTS_PER_WALLET) {
    return {
      ok: false,
      code: 'too_many_active_uploads',
      reason: 'You have too many unfinished uploads. Finish or wait for them to expire before starting another.',
      status: 429,
    }
  }

  const hourAgo = nowMs - 60 * 60 * 1000
  const walletHourly = await countUploadIntentsSince(client, 'seller_wallet', sellerWallet, hourAgo)
  if (walletHourly >= MAX_UPLOAD_INTENTS_PER_WALLET_PER_HOUR) {
    return {
      ok: false,
      code: 'upload_rate_limited',
      reason: 'Too many upload attempts. Try again later.',
      status: 429,
    }
  }

  if (input.ipHash) {
    const ipHourly = await countUploadIntentsSince(client, 'ip_hash', input.ipHash, hourAgo)
    if (ipHourly >= MAX_UPLOAD_INTENTS_PER_IP_PER_HOUR) {
      return {
        ok: false,
        code: 'upload_rate_limited',
        reason: 'Too many upload attempts. Try again later.',
        status: 429,
      }
    }
  }

  const coverPath = buildObjectPath('covers', sellerWallet, coverCheck.mime!, input.cover.name)
  const assetPath = buildObjectPath('assets', sellerWallet, assetCheck.mime!, input.asset.name)
  const expiresAt = uploadIntentExpiresAt(nowMs)

  // No upsert — fresh UUID path only.
  const coverSigned = await client.storage
    .from(PRODUCT_COVER_BUCKET)
    .createSignedUploadUrl(coverPath)
  if (coverSigned.error || !coverSigned.data)
    return { ok: false, reason: 'Could not authorize cover upload.', status: 500 }

  const assetSigned = await client.storage
    .from(PRODUCT_ASSET_BUCKET)
    .createSignedUploadUrl(assetPath)
  if (assetSigned.error || !assetSigned.data)
    return { ok: false, reason: 'Could not authorize asset upload.', status: 500 }

  const { data, error } = await client.from('product_upload_intents').insert({
    seller_wallet: sellerWallet,
    title: input.title.trim(),
    description: input.description.trim(),
    cover_path: coverPath,
    cover_expected_mime: coverCheck.mime!,
    cover_expected_size: input.cover.size,
    asset_path: assetPath,
    asset_expected_mime: assetCheck.mime!,
    asset_expected_size: input.asset.size,
    asset_original_name: input.asset.name.slice(0, 255),
    asset_expected_sha256: shaCheck.sha256!,
    file_type_label: assetCheck.label!,
    ip_hash: input.ipHash ?? null,
    expires_at: expiresAt.toISOString(),
  }).select('id').single()

  if (error || !data)
    return { ok: false, reason: 'Could not create upload intent.', status: 500 }

  return {
    ok: true,
    uploadIntentId: data.id,
    expiresAt: expiresAt.toISOString(),
    cover: {
      bucket: PRODUCT_COVER_BUCKET,
      path: coverPath,
      token: coverSigned.data.token,
      signedUrl: coverSigned.data.signedUrl,
      contentType: coverCheck.mime!,
    },
    asset: {
      bucket: PRODUCT_ASSET_BUCKET,
      path: assetPath,
      token: assetSigned.data.token,
      signedUrl: assetSigned.data.signedUrl,
      contentType: assetCheck.mime!,
    },
  }
}

export async function completeUploadIntent(
  client: SupabaseClient,
  params: {
    uploadIntentId: string
    sellerWallet: string
    nowMs?: number
  },
): Promise<CompleteUploadResult> {
  const sellerWallet = params.sellerWallet.toLowerCase()
  const nowMs = params.nowMs ?? Date.now()

  const { data: intent, error: loadError } = await client
    .from('product_upload_intents')
    .select('*')
    .eq('id', params.uploadIntentId)
    .maybeSingle()

  if (loadError)
    return { ok: false, reason: 'Could not load upload intent.', status: 500 }
  if (!intent)
    return { ok: false, reason: 'Upload intent not found.', status: 404 }

  const row = intent as UploadIntentRow
  if (row.seller_wallet !== sellerWallet)
    return { ok: false, reason: 'Upload intent does not belong to this seller.', status: 403 }
  if (row.completed_at)
    return { ok: false, reason: 'Upload intent already completed.', status: 409 }
  if (row.cleaned_at)
    return { ok: false, reason: 'Upload intent was cleaned up.', status: 410 }
  if (new Date(row.expires_at).getTime() < nowMs)
    return { ok: false, reason: 'Upload intent expired.', status: 400 }

  if (Number(row.cover_expected_size) > MAX_COVER_BYTES)
    return { ok: false, reason: 'Cover exceeds V1 size limit.', status: 400 }
  if (Number(row.asset_expected_size) > MAX_ASSET_BYTES)
    return { ok: false, reason: 'Asset exceeds V1 size limit.', status: 400 }

  const coverMeta = await readObjectMeta(client, PRODUCT_COVER_BUCKET, row.cover_path)
  if (coverMeta.ok === false)
    return { ok: false, reason: coverMeta.reason, status: 400 }
  if (coverMeta.meta.size !== Number(row.cover_expected_size))
    return { ok: false, reason: 'Cover size mismatch.', status: 400 }
  if (coverMeta.meta.size !== null && coverMeta.meta.size > MAX_COVER_BYTES)
    return { ok: false, reason: 'Cover exceeds V1 size limit.', status: 400 }
  if (
    coverMeta.meta.mimetype
    && coverMeta.meta.mimetype !== row.cover_expected_mime
    && !coverMeta.meta.mimetype.startsWith(row.cover_expected_mime)
  ) {
    return { ok: false, reason: 'Cover MIME mismatch.', status: 400 }
  }

  const assetMeta = await readObjectMeta(client, PRODUCT_ASSET_BUCKET, row.asset_path)
  if (assetMeta.ok === false)
    return { ok: false, reason: assetMeta.reason, status: 400 }
  if (assetMeta.meta.size !== Number(row.asset_expected_size))
    return { ok: false, reason: 'Asset size mismatch.', status: 400 }
  if (assetMeta.meta.size !== null && assetMeta.meta.size > MAX_ASSET_BYTES)
    return { ok: false, reason: 'Asset exceeds V1 size limit.', status: 400 }
  if (
    assetMeta.meta.mimetype
    && assetMeta.meta.mimetype !== row.asset_expected_mime
    && !assetMeta.meta.mimetype.startsWith(row.asset_expected_mime)
  ) {
    return { ok: false, reason: 'Asset MIME mismatch.', status: 400 }
  }

  const completedAt = new Date(nowMs).toISOString()
  const { data: marked, error: markError } = await client
    .from('product_upload_intents')
    .update({ completed_at: completedAt })
    .eq('id', row.id)
    .is('completed_at', null)
    .is('cleaned_at', null)
    .select('id')
    .maybeSingle()

  if (markError)
    return { ok: false, reason: 'Could not finalize upload intent.', status: 500 }
  if (!marked)
    return { ok: false, reason: 'Upload intent already completed.', status: 409 }

  const { data: product, error: productError } = await client.from('products').insert({
    seller_wallet: sellerWallet,
    title: row.title,
    description: row.description,
    cover_path: row.cover_path,
    asset_path: row.asset_path,
    asset_mime: row.asset_expected_mime,
    asset_size_bytes: row.asset_expected_size,
    asset_sha256: row.asset_expected_sha256,
    file_type_label: row.file_type_label,
    status: 'draft',
  }).select('id').single()

  if (productError || !product) {
    await client
      .from('product_upload_intents')
      .update({ completed_at: null })
      .eq('id', row.id)
    return { ok: false, reason: 'Could not save product draft.', status: 500 }
  }

  return {
    ok: true,
    draftId: product.id,
    fileTypeLabel: row.file_type_label,
    assetSizeBytes: Number(row.asset_expected_size),
    assetSha256: row.asset_expected_sha256,
  }
}

export type CleanupResult = {
  cleaned: number
  coverDeleted: number
  assetDeleted: number
}

/**
 * Deletes orphan storage for expired incomplete intents, then marks cleaned_at.
 * Never touches completed product intents. Idempotent.
 * When sellerWallet is set, only that seller's rows are cleaned (opportunistic path).
 */
export async function cleanupExpiredUploadIntents(
  client: SupabaseClient,
  options: { nowMs?: number, limit?: number, sellerWallet?: string } = {},
): Promise<CleanupResult> {
  const nowIso = new Date(options.nowMs ?? Date.now()).toISOString()
  const limit = options.limit ?? 50

  let query = client
    .from('product_upload_intents')
    .select('id, cover_path, asset_path')
    .is('completed_at', null)
    .is('cleaned_at', null)
    .lt('expires_at', nowIso)

  if (options.sellerWallet)
    query = query.eq('seller_wallet', options.sellerWallet.toLowerCase())

  const { data, error } = await query.limit(limit)

  if (error || !data?.length)
    return { cleaned: 0, coverDeleted: 0, assetDeleted: 0 }

  let cleaned = 0
  let coverDeleted = 0
  let assetDeleted = 0

  for (const row of data) {
    // Best-effort removes: missing objects (never uploaded) must not block cleaned_at.
    const coverRemove = await client.storage.from(PRODUCT_COVER_BUCKET).remove([row.cover_path])
    if (!coverRemove.error)
      coverDeleted += 1

    const assetRemove = await client.storage.from(PRODUCT_ASSET_BUCKET).remove([row.asset_path])
    if (!assetRemove.error)
      assetDeleted += 1

    const { data: marked, error: markError } = await client
      .from('product_upload_intents')
      .update({ cleaned_at: nowIso })
      .eq('id', row.id)
      .is('completed_at', null)
      .is('cleaned_at', null)
      .select('id')
      .maybeSingle()

    if (!markError && marked)
      cleaned += 1
  }

  return { cleaned, coverDeleted, assetDeleted }
}
