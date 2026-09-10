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

    const wallet = 'wallet' in body ? String((body as { wallet?: unknown }).wallet ?? '') : ''
    const action = 'action' in body ? String((body as { action?: unknown }).action ?? '') : ''
    const dropIdRaw = 'dropId' in body ? (body as { dropId?: unknown }).dropId : undefined

    const {
      challengeExpiresAtSeconds,
      challengePolicyFields,
      createChallengeNonce,
      insertAuthChallenge,
    } = await import('../../server/authChallengeStore.js')
    const {
      PRODUCT_DOWNLOAD_ACTION,
      SELLER_UPLOAD_ACTION,
    } = await import('../../server/crowdDropConstants.js')
    const { normalizeWallet, isValidAuthChallengeAction } = await import('../../server/productFoundation.js')

    if (!isValidAuthChallengeAction(action)
      || (action !== SELLER_UPLOAD_ACTION && action !== PRODUCT_DOWNLOAD_ACTION)) {
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

    let dropId: number | null = null
    if (action === PRODUCT_DOWNLOAD_ACTION) {
      const parsed = typeof dropIdRaw === 'number'
        ? dropIdRaw
        : Number.parseInt(String(dropIdRaw ?? ''), 10)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, reason: 'dropId is required for product download.' }))
        return
      }
      dropId = parsed
    }

    const nonce = createChallengeNonce()
    const expiresAt = challengeExpiresAtSeconds()
    const policy = challengePolicyFields(action)

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
      action,
      dropId,
    })
    if (stored.ok === false) {
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
      ...(dropId !== null ? { dropId } : {}),
    }))
  }
  catch (error) {
    console.error('[auth/challenge]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, error: 'challenge_creation_failed' }))
  }
}
