import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../lib/httpBody.js'

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

    const wallet = 'wallet' in body ? String((body as { wallet?: unknown }).wallet ?? '') : ''
    const action = 'action' in body ? String((body as { action?: unknown }).action ?? '') : ''

    const {
      challengeExpiresAtSeconds,
      challengePolicyFields,
      createChallengeNonce,
      insertAuthChallenge,
    } = await import('../lib/authChallengeStore.js')
    const { SELLER_UPLOAD_ACTION } = await import('../lib/crowdDropConstants.js')
    const { normalizeWallet, isValidAuthChallengeAction } = await import('../lib/productFoundation.js')

    if (action !== SELLER_UPLOAD_ACTION || !isValidAuthChallengeAction(action)) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'Unsupported action.' }))
      return
    }

    let normalizedWallet: string
    try {
      normalizedWallet = normalizeWallet(wallet)
    }
    catch {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'Invalid wallet address.' }))
      return
    }

    const nonce = createChallengeNonce()
    const expiresAt = challengeExpiresAtSeconds()
    const policy = challengePolicyFields()

    const url = process.env.SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !key) {
      res.statusCode = 503
      res.end(JSON.stringify({ ok: false, error: 'supabase_not_configured' }))
      return
    }

    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const stored = await insertAuthChallenge(client, {
      wallet: normalizedWallet,
      nonce,
      expiresAtSeconds: expiresAt,
    })
    if (!stored.ok) {
      res.statusCode = 500
      res.end(JSON.stringify({ ok: false, reason: 'Could not store auth challenge.' }))
      return
    }

    res.statusCode = 200
    res.end(JSON.stringify({
      ok: true,
      nonce,
      expiresAt,
      wallet: normalizedWallet,
      ...policy,
    }))
  }
  catch (error) {
    console.error('[auth/challenge]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, error: 'challenge_creation_failed' }))
  }
}
