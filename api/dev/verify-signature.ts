import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Hex } from 'viem'
import {
  AUTH_TEST_ACTION,
  parseProviderTypedData,
  verifyCrowdDropAuthSignature,
} from '../lib/crowdDropAuthVerify'

type ApiRequest = IncomingMessage & {
  method?: string
  body?: unknown
}

async function readJsonBody(req: ApiRequest): Promise<unknown> {
  if (req.body !== undefined && req.body !== null)
    return req.body

  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    })
    req.on('end', () => resolve())
    req.on('error', reject)
  })

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw)
    return null
  return JSON.parse(raw) as unknown
}

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

    const result = await verifyCrowdDropAuthSignature(
      typedData,
      signatureRaw as Hex,
      { expectedAction: AUTH_TEST_ACTION },
    )

    if (!result.ok) {
      res.statusCode = 400
      res.end(JSON.stringify({ ok: false, reason: result.reason }))
      return
    }

    res.statusCode = 200
    res.end(JSON.stringify({
      ok: true,
      recovered: result.recovered,
      walletMatch: true,
    }))
  }
  catch (error) {
    console.error('[verify-signature]', error)
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'verification_failed' }))
  }
}
