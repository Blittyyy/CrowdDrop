import type { IncomingMessage, ServerResponse } from 'node:http'
import { createSigningChallenge } from '../../src/signing/signChallenge.ts'

type ApiRequest = IncomingMessage & { method?: string }

export default function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  const challenge = createSigningChallenge()
  res.statusCode = 200
  res.end(JSON.stringify(challenge))
}
