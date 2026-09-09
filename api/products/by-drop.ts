import type { IncomingMessage, ServerResponse } from 'node:http'

type ApiRequest = IncomingMessage & { method?: string, url?: string }

function readDropId(req: ApiRequest): string | null {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const value = url.searchParams.get('dropId')
  return value?.trim() || null
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'public, max-age=30')

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  try {
    const dropId = readDropId(req)
    if (!dropId) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'dropId query parameter is required.' }))
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
    const { getLockedProductByDrop } = await import('../../server/productFinalize.js')
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const result = await getLockedProductByDrop(client, {
      dropId,
      supabaseUrl: url,
    })

    if (result.ok === false) {
      res.statusCode = result.status ?? 400
      res.end(JSON.stringify({ ok: false, reason: result.reason }))
      return
    }

    res.statusCode = 200
    res.end(JSON.stringify({
      ok: true,
      product: result.product,
    }))
  }
  catch (error) {
    console.error('[products/by-drop]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, reason: 'Could not load product metadata.' }))
  }
}
