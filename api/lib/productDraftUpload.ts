import type { SupabaseClient } from '@supabase/supabase-js'
import { sha256Hex } from './authChallengeStore.ts'
import {
  PRODUCT_ASSET_BUCKET,
  PRODUCT_COVER_BUCKET,
} from './crowdDropConstants.ts'
import type { ParsedFile } from './httpBody.ts'
import {
  buildStoragePath,
  storageExtension,
  validateAssetFile,
  validateCoverFile,
  validateDescription,
  validateTitle,
} from './productDraftValidation.ts'

export type DraftUploadInput = {
  sellerWallet: string
  title: string
  description: string
  cover: ParsedFile
  asset: ParsedFile
}

export type DraftUploadResult =
  | {
    ok: true
    draftId: string
    fileTypeLabel: string
    assetSizeBytes: number
    assetSha256: string
  }
  | { ok: false, reason: string, status?: number }

async function removePaths(client: SupabaseClient, bucket: string, paths: string[]): Promise<void> {
  if (!paths.length)
    return
  await client.storage.from(bucket).remove(paths)
}

export async function createProductDraft(
  client: SupabaseClient,
  input: DraftUploadInput,
): Promise<DraftUploadResult> {
  const titleCheck = validateTitle(input.title)
  if (!titleCheck.ok)
    return { ok: false, reason: titleCheck.reason, status: 400 }

  const descriptionCheck = validateDescription(input.description)
  if (!descriptionCheck.ok)
    return { ok: false, reason: descriptionCheck.reason, status: 400 }

  const coverCheck = validateCoverFile(input.cover.buffer, input.cover.filename, input.cover.mimeType)
  if (!coverCheck.ok)
    return { ok: false, reason: coverCheck.reason, status: 400 }

  const assetCheck = validateAssetFile(input.asset.buffer, input.asset.filename, input.asset.mimeType)
  if (!assetCheck.ok)
    return { ok: false, reason: assetCheck.reason, status: 400 }

  const sellerWallet = input.sellerWallet.toLowerCase()
  const coverExt = storageExtension(coverCheck.mime!, input.cover.filename)
  const assetExt = storageExtension(assetCheck.mime!, input.asset.filename)
  const coverPath = `${buildStoragePath('covers', sellerWallet)}.${coverExt}`
  const assetPath = `${buildStoragePath('assets', sellerWallet)}.${assetExt}`
  const assetSha256 = sha256Hex(input.asset.buffer)

  const uploaded: Array<{ bucket: string, path: string }> = []

  try {
    const coverUpload = await client.storage.from(PRODUCT_COVER_BUCKET).upload(coverPath, input.cover.buffer, {
      contentType: coverCheck.mime!,
      upsert: false,
    })
    if (coverUpload.error)
      return { ok: false, reason: 'Cover upload failed.', status: 500 }
    uploaded.push({ bucket: PRODUCT_COVER_BUCKET, path: coverPath })

    const assetUpload = await client.storage.from(PRODUCT_ASSET_BUCKET).upload(assetPath, input.asset.buffer, {
      contentType: assetCheck.mime!,
      upsert: false,
    })
    if (assetUpload.error) {
      await removePaths(client, PRODUCT_COVER_BUCKET, [coverPath])
      return { ok: false, reason: 'Asset upload failed.', status: 500 }
    }
    uploaded.push({ bucket: PRODUCT_ASSET_BUCKET, path: assetPath })

    const { data, error } = await client.from('products').insert({
      seller_wallet: sellerWallet,
      title: input.title.trim(),
      description: input.description.trim(),
      cover_path: coverPath,
      asset_path: assetPath,
      asset_mime: assetCheck.mime!,
      asset_size_bytes: input.asset.buffer.length,
      asset_sha256: assetSha256,
      file_type_label: assetCheck.label!,
      status: 'draft',
    }).select('id').single()

    if (error || !data) {
      await removePaths(client, PRODUCT_COVER_BUCKET, [coverPath])
      await removePaths(client, PRODUCT_ASSET_BUCKET, [assetPath])
      return { ok: false, reason: 'Could not save product draft.', status: 500 }
    }

    return {
      ok: true,
      draftId: data.id,
      fileTypeLabel: assetCheck.label!,
      assetSizeBytes: input.asset.buffer.length,
      assetSha256,
    }
  }
  catch (error) {
    console.error('[product-draft]', error)
    for (const item of uploaded)
      await removePaths(client, item.bucket, [item.path])
    return { ok: false, reason: 'Product draft upload failed.', status: 500 }
  }
}
