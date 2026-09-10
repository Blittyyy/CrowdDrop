import {
  buildCrowdDropAuthTypedData,
  SELLER_UPLOAD_ACTION,
  toProviderTypedDataPayload,
} from '../signing/crowdDropAuthTypedData.ts'
import {
  requestSignTypedDataV4,
  SignCancelledError,
} from '../signing/requestTypedDataSignature.ts'
import {
  sellerSessionStillValid,
  type SellerSessionMemory,
} from './sellerSessionMemory.ts'

export type { SellerSessionMemory } from './sellerSessionMemory.ts'
export { sellerSessionStillValid } from './sellerSessionMemory.ts'

export type EnsureSellerSessionResult =
  | { ok: true, session: SellerSessionMemory, skipped: boolean }
  | { ok: false, cancelled: true }
  | { ok: false, cancelled: false, reason: string }

export async function ensureSellerUploadSession(params: {
  wallet: string
  provider: EthereumProvider
  existing?: SellerSessionMemory | null
  fetchImpl?: typeof fetch
  nowSeconds?: number
}): Promise<EnsureSellerSessionResult> {
  const wallet = params.wallet
  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (sellerSessionStillValid(params.existing, wallet, nowSeconds)) {
    return { ok: true, session: params.existing!, skipped: true }
  }

  const fetchFn = params.fetchImpl ?? fetch
  try {
    const challengeResponse = await fetchFn('/api/auth/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ wallet, action: SELLER_UPLOAD_ACTION }),
    })
    const challenge = await challengeResponse.json() as {
      ok?: boolean
      nonce?: string
      expiresAt?: number
      reason?: string
    }
    if (!challengeResponse.ok || !challenge.nonce || typeof challenge.expiresAt !== 'number') {
      return {
        ok: false,
        cancelled: false,
        reason: challenge.reason ?? 'Could not prepare product setup.',
      }
    }

    const typedData = buildCrowdDropAuthTypedData({
      action: SELLER_UPLOAD_ACTION,
      wallet,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    })
    const signature = await requestSignTypedDataV4(params.provider, wallet, typedData)
    const providerPayload = toProviderTypedDataPayload(typedData)

    const verifyResponse = await fetchFn('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        typedData: providerPayload,
        signature,
      }),
    })
    const verifyPayload = await verifyResponse.json() as {
      ok?: boolean
      wallet?: string
      expiresAt?: number
      reason?: string
    }

    if (!verifyResponse.ok || !verifyPayload.ok || !verifyPayload.wallet) {
      return {
        ok: false,
        cancelled: false,
        reason: verifyPayload.reason ?? 'Could not prepare product setup.',
      }
    }

    return {
      ok: true,
      skipped: false,
      session: {
        wallet: verifyPayload.wallet,
        expiresAt: verifyPayload.expiresAt ?? (nowSeconds + 30 * 60),
      },
    }
  }
  catch (error) {
    if (error instanceof SignCancelledError)
      return { ok: false, cancelled: true }
    const message = error instanceof Error ? error.message : 'Could not prepare product setup.'
    return { ok: false, cancelled: false, reason: message }
  }
}
