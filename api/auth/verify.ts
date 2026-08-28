import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Hex } from 'viem'
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

    const typedDataRaw = 'typedData' in body ? (body as { typedData?: unknown }).typedData : undefined
    const signatureRaw = 'signature' in body ? (body as { signature?: unknown }).signature : undefined

    if (!typedDataRaw || typeof signatureRaw !== 'string' || !signatureRaw.startsWith('0x')) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: 'typedData and signature are required.' }))
      return
    }

    const { SELLER_UPLOAD_ACTION } = await import('../lib/crowdDropConstants.js')
    const { parseProviderTypedData, verifyCrowdDropAuthSignature } = await import('../lib/crowdDropAuthVerify.js')
    const { consumeAuthChallenge } = await import('../lib/authChallengeStore.js')
    const { createSellerSessionToken, buildSessionCookie } = await import('../lib/sellerSession.js')

    let typedData
    try {
      typedData = parseProviderTypedData(typedDataRaw)
    }
    catch (error) {
      res.statusCode = 400
      res.end(JSON.stringify({
        ok: false,
        reason: error instanceof Error ? error.message : 'Invalid typed data.',
      }))
      return
    }

    const verified = await verifyCrowdDropAuthSignature(
      typedData,
      signatureRaw as Hex,
      { expectedAction: SELLER_UPLOAD_ACTION },
    )
    if (!verified.ok) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: verified.reason }))
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
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const consumed = await consumeAuthChallenge(client, {
      nonce: typedData.message.nonce,
      wallet: typedData.message.wallet,
      action: SELLER_UPLOAD_ACTION,
    })
    if (!consumed.ok) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: consumed.reason }))
      return
    }

    const session = createSellerSessionToken(typedData.message.wallet)
    if (!session.ok) {
      res.statusCode = 503
      res.end(JSON.stringify({ ok: false, reason: session.reason }))
      return
    }

    res.setHeader('Set-Cookie', buildSessionCookie(session.token))
    res.statusCode = 200
    res.end(JSON.stringify({
      ok: true,
      wallet: typedData.message.wallet.toLowerCase(),
      expiresAt: session.expiresAt,
      recovered: verified.recovered,
    }))
  }
  catch (error) {
    console.error('[auth/verify]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, error: 'auth_verification_failed' }))
  }
}
