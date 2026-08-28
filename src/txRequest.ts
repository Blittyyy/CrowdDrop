/** User dismissed / cancelled a wallet confirmation before a tx was submitted. */
export class TxCancelledError extends Error {
  readonly code = 4001
  constructor(message = 'Transaction cancelled.') {
    super(message)
    this.name = 'TxCancelledError'
  }
}

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/

export function isTxHash(value: unknown): value is string {
  return typeof value === 'string' && TX_HASH_RE.test(value)
}

/** Throws TxCancelledError when the provider returned no usable hash. */
export function requireTxHash(value: unknown): string {
  if (isTxHash(value))
    return value
  throw new TxCancelledError()
}

const CANCEL_MESSAGE_RE = /reject|denied|cancel|dismiss|closed|abort|declin|user.?refus|action_rejected|request.?reset|user.?reject/i

/**
 * True when the user cancelled/dismissed confirmation, or when no tx was submitted.
 * Does not treat generic failures as cancellation.
 */
export function isUserRejection(error: unknown): boolean {
  if (error instanceof TxCancelledError)
    return true
  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error ? (error as { code?: unknown }).code : undefined
    if (code === 4001 || code === '4001' || code === 'ACTION_REJECTED')
      return true
    const message = 'message' in error ? (error as { message?: unknown }).message : undefined
    if (typeof message === 'string' && CANCEL_MESSAGE_RE.test(message))
      return true
    const reason = 'reason' in error ? (error as { reason?: unknown }).reason : undefined
    if (typeof reason === 'string' && CANCEL_MESSAGE_RE.test(reason))
      return true
  }
  if (typeof error === 'string' && CANCEL_MESSAGE_RE.test(error))
    return true
  return error instanceof Error && CANCEL_MESSAGE_RE.test(error.message)
}

export type SendTxRequestOptions = {
  /** Grace after returning to the app / interacting again while still pending (ms). */
  dismissGraceMs?: number
  /** Absolute max wait for user confirmation (ms). */
  absoluteTimeoutMs?: number
  /**
   * Delay before treating app interaction as “sheet dismissed” (ms).
   * Avoids cancelling on the same tap that opened confirmation.
   */
  interactionArmMs?: number
  /** Abort from the UI (e.g. Refresh while confirming) voids the pending send. */
  signal?: AbortSignal
}

/**
 * eth_sendTransaction with:
 * - hash validation (null / undefined / garbage → cancelled)
 * - dismiss detection when the mini-app is usable again without a hash
 *   (visibility/focus often never fire for Nimiq Pay overlay sheets)
 * - AbortSignal so Refresh can void a stuck confirmation
 * - absolute safety timeout
 *
 * If a real hash is returned, the promise resolves and callers should wait for receipt.
 */
export async function requestSendTransaction(
  provider: EthereumProvider,
  tx: { from: string, to: string, data: string },
  options?: SendTxRequestOptions,
): Promise<string> {
  const dismissGraceMs = options?.dismissGraceMs ?? 1_500
  const absoluteTimeoutMs = options?.absoluteTimeoutMs ?? 2 * 60_000
  const interactionArmMs = options?.interactionArmMs ?? 450
  const signal = options?.signal

  if (signal?.aborted)
    throw new TxCancelledError()

  const request = provider.request({
    method: 'eth_sendTransaction',
    params: [tx],
  })

  return await new Promise<string>((resolve, reject) => {
    let settled = false
    let leftForeground = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    let interactionArmed = false
    let graceTimer: ReturnType<typeof setTimeout> | null = null
    let absoluteTimer: ReturnType<typeof setTimeout> | null = null
    let armTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (graceTimer) {
        clearTimeout(graceTimer)
        graceTimer = null
      }
      if (absoluteTimer) {
        clearTimeout(absoluteTimer)
        absoluteTimer = null
      }
      if (armTimer) {
        clearTimeout(armTimer)
        armTimer = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
        document.removeEventListener('pointerdown', onAppInteraction, true)
        document.removeEventListener('touchstart', onAppInteraction, true)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('pageshow', onPageShow)
        window.removeEventListener('pagehide', onPageHide)
      }
      signal?.removeEventListener('abort', onAbort)
    }

    const finish = (fn: () => void) => {
      if (settled)
        return
      settled = true
      cleanup()
      fn()
    }

    const cancelPending = () => {
      finish(() => reject(new TxCancelledError()))
    }

    const scheduleDismissCancel = () => {
      if (settled)
        return
      if (graceTimer)
        clearTimeout(graceTimer)
      graceTimer = setTimeout(() => {
        // Still no hash after the confirmation sheet is gone → treat as dismiss.
        cancelPending()
      }, dismissGraceMs)
    }

    const onVisibility = () => {
      if (typeof document === 'undefined')
        return
      if (document.visibilityState === 'hidden') {
        leftForeground = true
        return
      }
      if (document.visibilityState === 'visible' && leftForeground)
        scheduleDismissCancel()
    }

    const onFocus = () => {
      if (leftForeground)
        scheduleDismissCancel()
    }

    const onPageHide = () => {
      leftForeground = true
    }

    const onPageShow = () => {
      if (leftForeground)
        scheduleDismissCancel()
    }

    /**
     * Nimiq Pay confirmation is often a native overlay: the WebView stays "visible"
     * and eth_sendTransaction hangs after swipe-dismiss. Once the user can touch the
     * mini-app again with no hash, void immediately so Join / Refresh work again.
     */
    const onAppInteraction = () => {
      if (!interactionArmed || settled)
        return
      cancelPending()
    }

    const onAbort = () => {
      cancelPending()
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
      document.addEventListener('pointerdown', onAppInteraction, true)
      document.addEventListener('touchstart', onAppInteraction, true)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus)
      window.addEventListener('pageshow', onPageShow)
      window.addEventListener('pagehide', onPageHide)
    }

    armTimer = setTimeout(() => {
      interactionArmed = true
    }, interactionArmMs)

    absoluteTimer = setTimeout(() => {
      cancelPending()
    }, absoluteTimeoutMs)

    if (signal) {
      if (signal.aborted)
        cancelPending()
      else
        signal.addEventListener('abort', onAbort, { once: true })
    }

    request.then(
      (raw) => {
        try {
          const hash = requireTxHash(raw)
          finish(() => resolve(hash))
        }
        catch (error) {
          finish(() => reject(error))
        }
      },
      (error) => {
        finish(() => reject(error))
      },
    )
  })
}
