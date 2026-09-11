function normalizePromptDropId(dropId: string | number | bigint): string {
  return typeof dropId === 'string' ? dropId.trim() : String(dropId)
}

/** Session-only dismissal key for the Drop open prompt. Not auth / wallet state. */
export function openInNimiqPromptDismissKey(dropId: string | number | bigint): string {
  return `crowddrop_open_prompt_dismissed_${normalizePromptDropId(dropId)}`
}

export function readOpenInNimiqPromptDismissed(
  dropId: string | number | bigint,
  storage: Pick<Storage, 'getItem'> | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
): boolean {
  if (!storage)
    return false
  try {
    return storage.getItem(openInNimiqPromptDismissKey(dropId)) === '1'
  }
  catch {
    return false
  }
}

export function writeOpenInNimiqPromptDismissed(
  dropId: string | number | bigint,
  storage: Pick<Storage, 'setItem'> | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
): void {
  if (!storage)
    return
  try {
    storage.setItem(openInNimiqPromptDismissKey(dropId), '1')
  }
  catch {
    // Ignore quota / private-mode failures; in-memory dismiss still works.
  }
}

/**
 * Whether the automatic Open in Nimiq Pay prompt should appear.
 * Never launches the custom scheme — UI only.
 */
export function shouldShowOpenInNimiqPrompt(options: {
  walletChecking: boolean
  providerAvailable: boolean
  mobile: boolean
  hasDropId: boolean
  dismissed: boolean
}): boolean {
  if (options.walletChecking)
    return false
  if (options.providerAvailable)
    return false
  if (!options.mobile)
    return false
  if (!options.hasDropId)
    return false
  if (options.dismissed)
    return false
  return true
}
