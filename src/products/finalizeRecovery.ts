/**
 * Non-secret recovery for: createDrop succeeded, finalize still pending.
 * Never stores auth cookies, signatures, or private asset URLs.
 */

export const FINALIZE_RECOVERY_STORAGE_KEY = 'crowddrop:finalizeRecovery'

export type FinalizeRecoveryRecord = {
  draftId: string
  createTxHash: string
  sellerWallet: string
  createdAt: number
  /** Optional client-known drop id from receipt (may differ until finalize confirms). */
  dropIdHint?: string
}

function canUseStorage(storage: Storage | null | undefined): storage is Storage {
  return Boolean(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function')
}

export function writeFinalizeRecovery(
  record: FinalizeRecoveryRecord,
  storage: Storage | null | undefined = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!canUseStorage(storage))
    return
  try {
    storage.setItem(FINALIZE_RECOVERY_STORAGE_KEY, JSON.stringify({
      draftId: record.draftId,
      createTxHash: record.createTxHash,
      sellerWallet: record.sellerWallet.toLowerCase(),
      createdAt: record.createdAt,
      ...(record.dropIdHint ? { dropIdHint: record.dropIdHint } : {}),
    }))
  }
  catch {
    // private mode / quota
  }
}

export function readFinalizeRecovery(
  storage: Storage | null | undefined = typeof localStorage !== 'undefined' ? localStorage : null,
): FinalizeRecoveryRecord | null {
  if (!canUseStorage(storage))
    return null
  try {
    const raw = storage.getItem(FINALIZE_RECOVERY_STORAGE_KEY)
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as Partial<FinalizeRecoveryRecord>
    if (
      typeof parsed.draftId !== 'string'
      || typeof parsed.createTxHash !== 'string'
      || typeof parsed.sellerWallet !== 'string'
      || typeof parsed.createdAt !== 'number'
    ) {
      return null
    }
    return {
      draftId: parsed.draftId,
      createTxHash: parsed.createTxHash,
      sellerWallet: parsed.sellerWallet,
      createdAt: parsed.createdAt,
      ...(typeof parsed.dropIdHint === 'string' ? { dropIdHint: parsed.dropIdHint } : {}),
    }
  }
  catch {
    return null
  }
}

export function clearFinalizeRecovery(
  storage: Storage | null | undefined = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!canUseStorage(storage))
    return
  try {
    storage.removeItem(FINALIZE_RECOVERY_STORAGE_KEY)
  }
  catch {
    // ignore
  }
}

export function recoveryForSeller(
  record: FinalizeRecoveryRecord | null,
  sellerWallet: string | null | undefined,
): FinalizeRecoveryRecord | null {
  if (!record || !sellerWallet)
    return null
  if (record.sellerWallet.toLowerCase() !== sellerWallet.toLowerCase())
    return null
  return record
}
