/** Build the canonical Drop share URL used in production. */
export function dropShareUrl(dropId: string | bigint, origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  const id = typeof dropId === 'bigint' ? dropId.toString() : dropId.trim()
  const base = origin.replace(/\/$/, '')
  return `${base}/?drop=${id}`
}

/**
 * Share a Drop link: Web Share API when available, otherwise clipboard copy.
 * Never sends a blockchain transaction.
 */
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
      // User dismissed the share sheet — not a failure that should fall through to copy noise.
      if (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError')
        throw error
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
