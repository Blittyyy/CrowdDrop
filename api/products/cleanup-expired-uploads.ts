import type { IncomingMessage, ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'

type ApiRequest = IncomingMessage & { method?: string }

function readBearer(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw)
    return null
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return match?.[1]?.trim() || null
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length)
    return false
  return timingSafeEqual(a, b)
}

/**
 * Protected cleanup for expired incomplete upload intents + orphan storage.
 * Invoke with Authorization: Bearer <CROWDDROP_CLEANUP_SECRET>
 * or Vercel Cron Authorization: Bearer <CRON_SECRET>.
 */
export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  try {
    const { CLEANUP_SECRET_ENV } = await import('../../server/crowdDropConstants.js')
    const provided = readBearer(req.headers.authorization)
      ?? (typeof req.headers['x-crowddrop-cleanup-secret'] === 'string'
        ? req.headers['x-crowddrop-cleanup-secret']
        : null)

    const cleanupSecret = process.env[CLEANUP_SECRET_ENV]?.trim() ?? ''
    const cronSecret = process.env.CRON_SECRET?.trim() ?? ''
    const authorized = Boolean(provided) && (
      (cleanupSecret && secretsMatch(provided!, cleanupSecret))
      || (cronSecret && secretsMatch(provided!, cronSecret))
    )

    if (!authorized) {
      res.statusCode = 401
      res.end(JSON.stringify({ ok: false, reason: 'Unauthorized.' }))
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
    const { cleanupExpiredUploadIntents } = await import('../../server/productUploadIntent.js')
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const result = await cleanupExpiredUploadIntents(client)
    res.statusCode = 200
    res.end(JSON.stringify({ ok: true, ...result }))
  }
  catch (error) {
    console.error('[products/cleanup-expired-uploads]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, reason: 'Cleanup failed.' }))
  }
}
