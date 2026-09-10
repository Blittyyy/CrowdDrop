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
  | { ok: false, cancelled: false, reason: string, authRequired?: boolean }

function parseUnlockSuccess(payload: {
  ok?: boolean
  reason?: string
  downloadUrl?: string
  expiresIn?: number
  fileTypeLabel?: string | null
  productTitle?: string
}, responseOk: boolean): UnlockProductResult {
  if (!responseOk || payload.ok !== true || typeof payload.downloadUrl !== 'string') {
    const reason = payload.reason ?? 'Could not unlock product.'
    return {
      ok: false,
      cancelled: false,
      reason,
      authRequired: reason === 'buyer_auth_required',
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

/** Session-mode unlock — no EIP-712. Uses HttpOnly crowddrop_buyer_access cookie. */
export async function restoreProductUnlock(params: {
  dropId: string | number
  connectedWallet: string
  fetchImpl?: typeof fetch
}): Promise<UnlockProductResult> {
  const fetchFn = params.fetchImpl ?? fetch
  const dropId = Number(params.dropId)
  if (!Number.isInteger(dropId) || dropId <= 0)
    return { ok: false, cancelled: false, reason: 'Invalid Drop.', authRequired: true }

  try {
    const unlockResponse = await fetchFn('/api/products/unlock', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dropId,
        connectedWallet: params.connectedWallet,
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
    return parseUnlockSuccess(payload, unlockResponse.ok)
  }
  catch (error) {
    return {
      ok: false,
      cancelled: false,
      reason: error instanceof Error ? error.message : 'Could not unlock product.',
      authRequired: true,
    }
  }
}

/** First-time unlock via EIP-712; sets buyer access session cookie. */
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
      credentials: 'include',
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

    return parseUnlockSuccess(payload, unlockResponse.ok)
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
