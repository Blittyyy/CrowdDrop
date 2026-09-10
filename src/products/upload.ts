import { sha256HexOfFile } from './hash.ts'

export async function putToSignedUploadUrl(
  signedUrl: string,
  file: File,
  contentType: string,
): Promise<void> {
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType || file.type || 'application/octet-stream',
    },
    body: file,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `Direct upload failed (${response.status}).`)
  }
}

export type ProductDraftInput = {
  title: string
  description: string
  cover: File
  asset: File
}

export type UploadStage =
  | 'preparing'
  | 'uploading_cover'
  | 'uploading_asset'
  | 'completing'

export type CreateProductDraftResult =
  | {
    ok: true
    draftId: string
    fileTypeLabel: string | null
    assetSizeBytes: number | null
  }
  | {
    ok: false
    reason: string
    code?: string
  }

export async function createProductDraft(
  input: ProductDraftInput,
  options: {
    onStage?: (stage: UploadStage) => void
    fetchImpl?: typeof fetch
  } = {},
): Promise<CreateProductDraftResult> {
  const fetchFn = options.fetchImpl ?? fetch
  const title = input.title.trim()
  const description = input.description.trim()
  const { cover, asset } = input

  options.onStage?.('preparing')
  const assetSha256 = await sha256HexOfFile(asset)

  const intentResponse = await fetchFn('/api/products/upload-intent', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title,
      description,
      cover: {
        name: cover.name,
        size: cover.size,
        type: cover.type,
      },
      asset: {
        name: asset.name,
        size: asset.size,
        type: asset.type,
      },
      assetSha256,
    }),
  })
  const intent = await intentResponse.json() as {
    ok?: boolean
    reason?: string
    code?: string
    uploadIntentId?: string
    cover?: { signedUrl: string, contentType: string }
    asset?: { signedUrl: string, contentType: string }
  }

  if (!intentResponse.ok || intent.ok !== true || !intent.uploadIntentId || !intent.cover || !intent.asset) {
    return {
      ok: false,
      reason: intent.reason ?? 'Product upload failed. Try again.',
      code: intent.code,
    }
  }

  options.onStage?.('uploading_cover')
  await putToSignedUploadUrl(intent.cover.signedUrl, cover, intent.cover.contentType)

  options.onStage?.('uploading_asset')
  await putToSignedUploadUrl(intent.asset.signedUrl, asset, intent.asset.contentType)

  options.onStage?.('completing')
  const completeResponse = await fetchFn('/api/products/complete-upload', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uploadIntentId: intent.uploadIntentId }),
  })
  const payload = await completeResponse.json() as {
    ok?: boolean
    reason?: string
    draftId?: string
    fileTypeLabel?: string
    assetSizeBytes?: number
  }

  if (!completeResponse.ok || payload.ok !== true || typeof payload.draftId !== 'string') {
    return {
      ok: false,
      reason: typeof payload.reason === 'string'
        ? payload.reason
        : 'Product upload failed. Try again.',
    }
  }

  return {
    ok: true,
    draftId: payload.draftId,
    fileTypeLabel: typeof payload.fileTypeLabel === 'string' ? payload.fileTypeLabel : null,
    assetSizeBytes: typeof payload.assetSizeBytes === 'number' ? payload.assetSizeBytes : null,
  }
}

export function friendlyUploadFailure(result: { reason: string, code?: string }): string {
  if (result.code === 'too_many_active_uploads') {
    return 'You have too many unfinished uploads. Finish or wait for them to expire before starting another.'
  }
  if (result.code === 'upload_rate_limited')
    return 'Too many upload attempts. Try again later.'
  return result.reason || 'Product upload failed. Try again.'
}
