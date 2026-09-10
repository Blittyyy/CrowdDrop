import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../../server/httpBody.js'

type ApiRequest = IncomingMessage & { method?: string, body?: unknown }

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

    if (!typedData || !signature) {
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
    const { unlockProductDownload } = await import('../../server/productUnlock.js')
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const result = await unlockProductDownload(client, { typedData, signature })
    if (result.ok === false) {
      res.statusCode = result.status ?? 400
      res.end(JSON.stringify({ ok: false, reason: result.reason }))
      return
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
