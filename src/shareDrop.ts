/** Canonical production origin for shared / deeplink URLs. Never use window.location.origin. */
export const CANONICAL_CROWDDROP_ORIGIN = 'https://www.usecrowddrop.xyz'

export function normalizeDropIdForShare(dropId: string | number | bigint): string {
  return typeof dropId === 'string' ? dropId.trim() : String(dropId)
}

/** Public HTTPS Drop URL — domain + Drop ID only. Always used for Share / clipboard. */
export function getCanonicalDropUrl(dropId: string | number | bigint): string {
  const id = normalizeDropIdForShare(dropId)
  return `${CANONICAL_CROWDDROP_ORIGIN}/?drop=${encodeURIComponent(id)}`
}

/** Public HTTPS Home URL for Open-in-Nimiq-Pay when not on a Drop. */
export function getCanonicalHomeUrl(): string {
  return `${CANONICAL_CROWDDROP_ORIGIN}/`
}

/**
 * Wrap any CrowdDrop HTTPS URL in the official Nimiq Pay custom-scheme deeplink.
 * Used only for in-page "Open in Nimiq Pay" — never for OS share / clipboard.
 */
export function getNimiqPayMiniAppUrl(canonicalHttpsUrl: string): string {
  return `nimiqpay://miniapp?url=${encodeURIComponent(canonicalHttpsUrl)}`
}

export function getNimiqPayDropUrl(dropId: string | number | bigint): string {
  return getNimiqPayMiniAppUrl(getCanonicalDropUrl(dropId))
}

export function getNimiqPayHomeUrl(): string {
  return getNimiqPayMiniAppUrl(getCanonicalHomeUrl())
}

/**
 * Coarse mobile context for Open-in-Nimiq-Pay CTAs.
 * Not a Nimiq Pay detector; do not use for wallet identity.
 */
export function isMobileShareContext(
  options: {
    userAgent?: string
    maxTouchPoints?: number
    mobileUaData?: boolean | null
    matchMediaMatches?: boolean | null
  } = {},
): boolean {
  if (options.mobileUaData === true)
    return true
  if (options.mobileUaData === false && options.matchMediaMatches === false)
    return false

  const ua = options.userAgent
    ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua))
    return true

  const touch = options.maxTouchPoints
    ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0)
  const narrow = options.matchMediaMatches
    ?? (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 900px)').matches
      : false)
  return touch > 0 && narrow === true
}

/** URL placed on the share sheet / clipboard — always canonical HTTPS. */
export function preferredDropShareUrl(dropId: string | number | bigint): string {
  return getCanonicalDropUrl(dropId)
}

export function dropShareTitle(productTitle?: string | null): string {
  const title = productTitle?.trim()
  return title ? `CrowdDrop — ${title}` : 'CrowdDrop'
}

export function dropShareText(productTitle?: string | null): string {
  const title = productTitle?.trim()
  return title ? `Join this CrowdDrop for ${title}.` : 'Join this CrowdDrop.'
}

export type ShareDropResult =
  | { status: 'shared' }
  | { status: 'copied' }
  | { status: 'cancelled' }
  | { status: 'fallback', url: string }

/**
 * Share a Drop: Web Share API when available, otherwise clipboard.
 * Always uses the canonical HTTPS Drop URL (never nimiqpay://).
 */
export async function shareCrowdDrop(params: {
  dropId: string | number | bigint
  productTitle?: string | null
  /** Pass null to skip Web Share (tests / clipboard-only). Omit to use navigator.share when present. */
  shareFn?: ((data: ShareData) => Promise<void>) | null
  clipboardWrite?: (text: string) => Promise<void>
}): Promise<ShareDropResult> {
  const url = preferredDropShareUrl(params.dropId)
  const title = dropShareTitle(params.productTitle)
  const text = dropShareText(params.productTitle)
  const shareFn = Object.prototype.hasOwnProperty.call(params, 'shareFn')
    ? params.shareFn ?? null
    : (typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      ? (data: ShareData) => navigator.share(data)
      : null)
  const clipboardWrite = params.clipboardWrite
    ?? (typeof navigator !== 'undefined' && navigator.clipboard?.writeText
      ? (value: string) => navigator.clipboard.writeText(value)
      : null)

  if (shareFn) {
    try {
      await shareFn({ title, text, url })
      return { status: 'shared' }
    }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'name' in error
        && (error as { name?: string }).name === 'AbortError') {
        return { status: 'cancelled' }
      }
      // Fall through to clipboard for real share failures.
    }
  }

  if (clipboardWrite) {
    try {
      await clipboardWrite(url)
      return { status: 'copied' }
    }
    catch {
      return { status: 'fallback', url }
    }
  }

  return { status: 'fallback', url }
}

/** @deprecated Prefer getCanonicalDropUrl — kept for older call sites/tests. */
export function dropShareUrl(dropId: string | bigint): string {
  return getCanonicalDropUrl(dropId)
}

/** @deprecated Prefer shareCrowdDrop. */
export async function shareDropLink(url: string): Promise<'shared' | 'copied'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'CrowdDrop',
        text: 'Join this CrowdDrop',
        url,
      })
      return 'shared'
    }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError')
        throw error
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
