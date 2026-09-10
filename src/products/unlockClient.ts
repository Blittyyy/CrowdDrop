import {
  buildProductDownloadTypedData,
  PRODUCT_DOWNLOAD_ACTION,
  toProviderTypedDataPayload,
} from '../signing/crowdDropAuthTypedData.ts'
import {
  requestSignTypedDataV4,
  SignCancelledError,
} from '../signing/requestTypedDataSignature.ts'

export type UnlockProductResult =
  | {
    ok: true
    downloadUrl: string
    expiresIn: number
    fileTypeLabel: string | null
    productTitle: string
  }
  | { ok: false, cancelled: true }
  | { ok: false, cancelled: false, reason: string }

export async function requestProductUnlock(params: {
  wallet: string
  dropId: string | number
  provider: EthereumProvider
  fetchImpl?: typeof fetch
}): Promise<UnlockProductResult> {
  const fetchFn = params.fetchImpl ?? fetch
  const dropId = Number(params.dropId)
  if (!Number.isInteger(dropId) || dropId <= 0)
    return { ok: false, cancelled: false, reason: 'Invalid Drop.' }

  try {
    const challengeResponse = await fetchFn('/api/auth/challenge', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: params.wallet,
        action: PRODUCT_DOWNLOAD_ACTION,
        dropId,
      }),
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
        reason: challenge.reason ?? 'Could not prepare unlock.',
      }
    }

    const typedData = buildProductDownloadTypedData({
      wallet: params.wallet,
      dropId,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    })
    const signature = await requestSignTypedDataV4(params.provider, params.wallet, typedData)
    const providerPayload = toProviderTypedDataPayload(typedData)

    const unlockResponse = await fetchFn('/api/products/unlock', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        typedData: providerPayload,
        signature,
      }),
    })
    const payload = await unlockResponse.json() as {
      ok?: boolean
      reason?: string
      downloadUrl?: string
      expiresIn?: number
      fileTypeLabel?: string | null
      productTitle?: string
    }

    if (!unlockResponse.ok || payload.ok !== true || typeof payload.downloadUrl !== 'string') {
      return {
        ok: false,
        cancelled: false,
        reason: payload.reason ?? 'Could not unlock product.',
      }
    }

    return {
      ok: true,
      downloadUrl: payload.downloadUrl,
      expiresIn: typeof payload.expiresIn === 'number' ? payload.expiresIn : 300,
      fileTypeLabel: payload.fileTypeLabel ?? null,
      productTitle: typeof payload.productTitle === 'string' ? payload.productTitle : '',
    }
  }
  catch (error) {
    if (error instanceof SignCancelledError)
      return { ok: false, cancelled: true }
    return {
      ok: false,
      cancelled: false,
      reason: error instanceof Error ? error.message : 'Could not unlock product.',
    }
  }
}
