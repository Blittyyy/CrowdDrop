/**
 * LEGACY multipart draft upload (bytes through Vercel).
 * Disabled in production so it cannot bypass direct-upload quotas (25 MB, active intents, rate limits).
 * Enable only with ALLOW_LEGACY_PRODUCT_DRAFT=1 for local emergency testing.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseCookies, parseMultipart } from '../../server/httpBody.js'

type ApiRequest = IncomingMessage & { method?: string, body?: unknown }

function legacyDraftAllowed(): boolean {
  if (process.env.ALLOW_LEGACY_PRODUCT_DRAFT === '1')
    return true
  // Never available on Vercel production.
  if (process.env.VERCEL_ENV === 'production')
    return false
  return process.env.NODE_ENV !== 'production'
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  if (!legacyDraftAllowed()) {
    res.statusCode = 410
    res.end(JSON.stringify({
      ok: false,
      code: 'legacy_draft_disabled',
      reason: 'Multipart draft upload is disabled. Use direct upload intent flow.',
    }))
    return
  }

  try {
    const cookies = parseCookies(req.headers.cookie)
    const { SESSION_COOKIE_NAME, MAX_ASSET_BYTES, MAX_COVER_BYTES } = await import('../../server/crowdDropConstants.js')
    const { verifySellerSessionToken } = await import('../../server/sellerSession.js')
    const session = verifySellerSessionToken(cookies[SESSION_COOKIE_NAME])
    if (session.ok === false) {
      res.statusCode = 401
      res.end(JSON.stringify({ ok: false, reason: 'Seller authentication required.' }))
      return
    }

    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.includes('multipart/form-data')) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'Expected multipart form data.' }))
      return
    }

    const { fields, files } = await parseMultipart(req)
    const cover = files.cover
    const asset = files.asset

    if (!cover || !asset) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'Cover and asset files are required.' }))
      return
    }

    if (cover.buffer.length > MAX_COVER_BYTES || asset.buffer.length > MAX_ASSET_BYTES) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'File exceeds V1 size limit.' }))
      return
    }

    const url = process.env.SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !key) {
      res.statusCode = 503
      res.end(JSON.stringify({ ok: false, error: 'supabase_not_configured' }))
      return
    }

    const { createClient } = await import('@supabase/supabase-js')
    const { createProductDraft } = await import('../../server/productDraftUpload.js')
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const result = await createProductDraft(client, {
      sellerWallet: session.payload.wallet,
      title: fields.title ?? '',
      description: fields.description ?? '',
      cover,
      asset,
    })

    if (result.ok === false) {
      res.statusCode = result.status ?? 400
      res.end(JSON.stringify({ ok: false, reason: result.reason }))
      return
    }

    res.statusCode = 201
    res.end(JSON.stringify({
      ok: true,
      draftId: result.draftId,
      fileTypeLabel: result.fileTypeLabel,
      assetSizeBytes: result.assetSizeBytes,
      assetSha256: result.assetSha256,
      privateAssetStored: true,
      legacy: true,
    }))
  }
  catch (error) {
    console.error('[products/draft]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, reason: 'Product draft upload failed.' }))
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}
