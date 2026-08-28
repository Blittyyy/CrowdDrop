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
    const { runSupabaseHealthCheck } = await import('../lib/supabaseHealthCheck.js')
    const health = await runSupabaseHealthCheck()

    const status = health.ok
      ? 200
      : health.error === 'supabase_not_configured' ? 503 : 503

    res.statusCode = status
    res.end(JSON.stringify(health))
  }
  catch (error) {
    console.error('[supabase-health] handler', error)
    res.statusCode = 500
    res.end(JSON.stringify({
      ok: false,
      error: 'supabase_health_check_failed',
      stage: 'handler',
      detail: error instanceof Error ? error.message : 'unknown',
    }))
  }
}
