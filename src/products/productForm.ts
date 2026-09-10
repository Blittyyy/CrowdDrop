import {
  COVER_MIME_ALLOWED,
  PRODUCT_ASSET_MAX_BYTES,
  PRODUCT_COVER_MAX_BYTES,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_TITLE_MAX,
} from './constants.ts'

export type ProductFormFields = {
  title: string
  description: string
  cover: File | null
  asset: File | null
}

export type ProductValidationResult =
  | { ok: true }
  | { ok: false, reason: string }

export function validateProductFormFields(fields: ProductFormFields): ProductValidationResult {
  const title = fields.title.trim()
  if (!title)
    return { ok: false, reason: 'Product title is required.' }
  if (title.length > PRODUCT_TITLE_MAX)
    return { ok: false, reason: `Product title must be at most ${PRODUCT_TITLE_MAX} characters.` }

  const description = fields.description.trim()
  if (!description)
    return { ok: false, reason: 'Description is required.' }
  if (description.length > PRODUCT_DESCRIPTION_MAX)
    return { ok: false, reason: `Description must be at most ${PRODUCT_DESCRIPTION_MAX} characters.` }

  if (!fields.cover)
    return { ok: false, reason: 'Cover image is required.' }
  if (fields.cover.size > PRODUCT_COVER_MAX_BYTES)
    return { ok: false, reason: 'Cover image must be 2 MB or smaller.' }
  if (fields.cover.type && !COVER_MIME_ALLOWED.has(fields.cover.type))
    return { ok: false, reason: 'Cover image must be PNG, JPEG, or WebP.' }

  if (!fields.asset)
    return { ok: false, reason: 'Digital product is required.' }
  if (fields.asset.size > PRODUCT_ASSET_MAX_BYTES)
    return { ok: false, reason: 'Digital product must be 25 MB or smaller.' }

  return { ok: true }
}

/** Stable fingerprint of product payload (not financial fields). */
export function productDraftFingerprint(fields: {
  title: string
  description: string
  cover: File
  asset: File
}): string {
  return [
    fields.title.trim(),
    fields.description.trim(),
    fields.cover.name,
    String(fields.cover.size),
    fields.cover.type,
    fields.asset.name,
    String(fields.asset.size),
    fields.asset.type,
    // lastModified distinguishes re-selected identical names/sizes when possible
    String(fields.cover.lastModified),
    String(fields.asset.lastModified),
  ].join('\u0001')
}

export type CachedProductDraft = {
  draftId: string
  fingerprint: string
  fileTypeLabel: string | null
  title: string
}

export function shouldReuseCachedDraft(
  cached: CachedProductDraft | null | undefined,
  fingerprint: string,
): boolean {
  return Boolean(cached && cached.draftId && cached.fingerprint === fingerprint)
}
