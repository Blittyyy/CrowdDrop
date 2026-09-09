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

    const payload = body as {
      title?: unknown
      description?: unknown
      cover?: { name?: unknown, size?: unknown, type?: unknown }
      asset?: { name?: unknown, size?: unknown, type?: unknown }
      assetSha256?: unknown
    }

    if (!payload.cover || !payload.asset) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'Cover and asset metadata are required.' }))
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
    const {
      createUploadIntent,
      extractClientIp,
      hashClientIp,
    } = await import('../../server/productUploadIntent.js')
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const clientIp = extractClientIp({
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
    })
    const ipHash = hashClientIp(clientIp, process.env.CROWDDROP_AUTH_SECRET)

    const result = await createUploadIntent(client, {
      sellerWallet: session.payload.wallet,
      title: String(payload.title ?? ''),
      description: String(payload.description ?? ''),
      cover: {
        name: String(payload.cover.name ?? ''),
        size: Number(payload.cover.size),
        type: String(payload.cover.type ?? ''),
      },
      asset: {
        name: String(payload.asset.name ?? ''),
        size: Number(payload.asset.size),
        type: String(payload.asset.type ?? ''),
      },
      assetSha256: String(payload.assetSha256 ?? ''),
      ipHash,
    })

    if (result.ok === false) {
      res.statusCode = result.status ?? 400
      res.end(JSON.stringify({
        ok: false,
        reason: result.reason,
        ...(result.code ? { code: result.code } : {}),
      }))
      return
    }

    res.statusCode = 200
    res.end(JSON.stringify({
      ok: true,
      uploadIntentId: result.uploadIntentId,
      expiresAt: result.expiresAt,
      cover: result.cover,
      asset: result.asset,
    }))
  }
  catch (error) {
    console.error('[products/upload-intent]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, reason: 'Upload intent creation failed.' }))
  }
}
