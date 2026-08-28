import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Hex } from 'viem'
import {
  AUTH_TEST_ACTION,
  parseProviderTypedData,
  verifyCrowdDropAuthSignature,
} from '../../src/signing/crowdDropAuthTypedData.ts'

type ApiRequest = IncomingMessage & {
  method?: string
  body?: unknown
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  const body = req.body
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
