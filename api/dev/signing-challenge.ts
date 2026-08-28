import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Matches src/signing/crowdDropAuthTypedData.ts AUTH_CHALLENGE_TTL_SECONDS. */
const CHALLENGE_TTL_SECONDS = 5 * 60

type ApiRequest = IncomingMessage & { method?: string }

export default function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  try {
    const nonce = randomBytes(32).toString('hex')
    const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS
    res.statusCode = 200
    res.end(JSON.stringify({ nonce, expiresAt }))
  }
  catch (error) {
    console.error('[signing-challenge]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'challenge_generation_failed' }))
  }
}
