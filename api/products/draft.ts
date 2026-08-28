import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseCookies, parseMultipart } from '../lib/httpBody.js'

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
    const { SESSION_COOKIE_NAME } = await import('../lib/crowdDropConstants.js')
    const { verifySellerSessionToken } = await import('../lib/sellerSession.js')
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

    const url = process.env.SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !key) {
      res.statusCode = 503
      res.end(JSON.stringify({ ok: false, error: 'supabase_not_configured' }))
      return
    }

    const { createClient } = await import('@supabase/supabase-js')
    const { createProductDraft } = await import('../lib/productDraftUpload.js')
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
