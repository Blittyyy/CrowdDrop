import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseCookies, readJsonBody } from '../../server/httpBody.js'

type ApiRequest = IncomingMessage & { method?: string, body?: unknown }

export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  try {
    const cookies = parseCookies(req.headers.cookie)
    const { SESSION_COOKIE_NAME } = await import('../../server/crowdDropConstants.js')
    const { verifySellerSessionToken } = await import('../../server/sellerSession.js')
    const session = verifySellerSessionToken(cookies[SESSION_COOKIE_NAME])
    if (session.ok === false) {
      res.statusCode = 401
      res.end(JSON.stringify({ ok: false, reason: 'Seller authentication required.' }))
      return
    }

    const body = await readJsonBody(req)
    if (!body || typeof body !== 'object') {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'Request body required.' }))
      return
    }

    const uploadIntentId = 'uploadIntentId' in body
      ? String((body as { uploadIntentId?: unknown }).uploadIntentId ?? '')
      : ''
    if (!uploadIntentId) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'uploadIntentId is required.' }))
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
    const { completeUploadIntent } = await import('../../server/productUploadIntent.js')
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const result = await completeUploadIntent(client, {
      uploadIntentId,
      sellerWallet: session.payload.wallet,
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
      directUpload: true,
      privateAssetStored: true,
    }))
  }
  catch (error) {
    console.error('[products/complete-upload]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, reason: 'Product draft finalization failed.' }))
  }
}
