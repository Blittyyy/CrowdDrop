import type { IncomingMessage, ServerResponse } from 'node:http'

type ApiRequest = IncomingMessage & { method?: string }

export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  try {
    const { readSupabaseEnv } = await import('../lib/supabaseEnv.js')
    const env = readSupabaseEnv()
    if (!env.ok) {
      res.statusCode = 503
      res.end(JSON.stringify(env))
      return
    }

    const { getSupabaseAdmin } = await import('../lib/supabaseServer.js')
    const admin = getSupabaseAdmin()
    if (!admin.ok) {
      res.statusCode = 503
      res.end(JSON.stringify(admin))
      return
    }

    const { checkSupabaseHealth } = await import('../lib/supabaseHealth.js')
    const health = await checkSupabaseHealth(admin.client)

    res.statusCode = health.ok ? 200 : 503
    res.end(JSON.stringify(health))
  }
  catch (error) {
    console.error('[supabase-health]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, error: 'supabase_health_check_failed' }))
  }
}
