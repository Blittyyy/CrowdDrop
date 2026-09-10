import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../../server/httpBody.js'

type ApiRequest = IncomingMessage & {
  method?: string
  body?: unknown
  headers: IncomingMessage['headers']
}

function parseDropId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0)
    return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim())
    if (Number.isInteger(n) && n > 0)
      return n
  }
  return null
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  try {
    const body = await readJsonBody(req)
    if (!body || typeof body !== 'object') {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'Request body required.' }))
      return
    }

    const typedData = 'typedData' in body ? (body as { typedData?: unknown }).typedData : undefined
    const signature = 'signature' in body ? String((body as { signature?: unknown }).signature ?? '') : ''
    const dropId = parseDropId('dropId' in body ? (body as { dropId?: unknown }).dropId : undefined)
    const connectedWallet = 'connectedWallet' in body
      ? String((body as { connectedWallet?: unknown }).connectedWallet ?? '')
      : ''

    const hasSignatureMode = Boolean(typedData) && Boolean(signature)
    const hasSessionMode = dropId !== null && !hasSignatureMode

    if (!hasSignatureMode && !hasSessionMode) {
      res.statusCode = 400
      res.end(JSON.stringify({
        ok: false,
        reason: 'typedData and signature are required, or dropId for session unlock.',
      }))
      return
    }

    if (hasSignatureMode && (!typedData || !signature)) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'typedData and signature are required.' }))
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
      unlockProductDownload,
      unlockProductWithBuyerSession,
    } = await import('../../server/productUnlock.js')
    const { buildBuyerAccessCookie } = await import('../../server/buyerAccessSession.js')
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const result = hasSignatureMode
      ? await unlockProductDownload(client, { typedData, signature })
      : await unlockProductWithBuyerSession(client, {
        dropId: dropId!,
        cookieHeader: typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined,
        connectedWallet: connectedWallet || null,
      })

    if (result.ok === false) {
      res.statusCode = result.status ?? 400
      res.end(JSON.stringify({ ok: false, reason: result.reason }))
      return
    }

    if (result.buyerAccessToken) {
      res.setHeader(
        'Set-Cookie',
        buildBuyerAccessCookie(result.buyerAccessToken, result.buyerAccessMaxAge),
      )
    }

    res.statusCode = 200
    res.end(JSON.stringify({
      ok: true,
      downloadUrl: result.downloadUrl,
      expiresIn: result.expiresIn,
      fileTypeLabel: result.fileTypeLabel,
      productTitle: result.productTitle,
    }))
  }
  catch (error) {
    console.error('[products/unlock]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, reason: 'Product unlock failed.' }))
  }
}
