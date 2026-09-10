import type { FinalizeProductResult } from './finalizeClient.ts'
import { finalizeProductDraftClient } from './finalizeClient.ts'

export const FINALIZE_RETRY_DELAYS_MS = [0, 1000, 3000] as const

export async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0)
    return
  await new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Idempotent finalize with a small fixed backoff schedule.
 * Does not spam: at most delays.length attempts.
 */
export async function finalizeProductWithRetries(
  params: { draftId: string, createTxHash: string },
  options: {
    delaysMs?: readonly number[]
    fetchImpl?: typeof fetch
    sleep?: (ms: number) => Promise<void>
    onAttempt?: (attemptIndex: number) => void
  } = {},
): Promise<FinalizeProductResult> {
  const delays = options.delaysMs ?? FINALIZE_RETRY_DELAYS_MS
  const sleep = options.sleep ?? sleepMs
  let last: FinalizeProductResult = { ok: false, reason: 'Product setup could not finish.' }

  for (let i = 0; i < delays.length; i += 1) {
    options.onAttempt?.(i)
    await sleep(delays[i]!)
    last = await finalizeProductDraftClient(params, { fetchImpl: options.fetchImpl })
    if (last.ok)
      return last
  }

  return last
}
