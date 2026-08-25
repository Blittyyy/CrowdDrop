const LAST_KEY = 'crowddrop:lastOpenedDrop'
const RECENT_KEY = 'crowddrop:recentDropIds'
const MAX_RECENT = 10

export function normalizeDropId(value: string | null | undefined): string | null {
  if (value == null)
    return null
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed))
    return null
  try {
    return BigInt(trimmed) > 0n ? trimmed : null
  }
  catch {
    return null
  }
}

function readJsonIds(raw: string | null): string[] {
  if (!raw)
    return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed))
      return []
    const seen = new Set<string>()
    const ids: string[] = []
    for (const item of parsed) {
      const id = normalizeDropId(typeof item === 'string' || typeof item === 'number' ? String(item) : null)
      if (!id || seen.has(id))
        continue
      seen.add(id)
      ids.push(id)
    }
    return ids
  }
  catch {
    return []
  }
}

function writeRecent(ids: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)))
  }
  catch {
    // Ignore quota / private-mode failures.
  }
}

export function readRecentDropIds(): string[] {
  try {
    const ids = readJsonIds(window.localStorage.getItem(RECENT_KEY))
    if (ids.length > 0)
      return ids.slice(0, MAX_RECENT)
    const last = normalizeDropId(window.localStorage.getItem(LAST_KEY))
    return last ? [last] : []
  }
  catch {
    return []
  }
}

export function readLastOpenedDrop(): string | null {
  try {
    return normalizeDropId(window.localStorage.getItem(LAST_KEY)) ?? readRecentDropIds()[0] ?? null
  }
  catch {
    return null
  }
}

export function saveLastOpenedDrop(dropId: string): void {
  const id = normalizeDropId(dropId)
  if (!id)
    return
  try {
    window.localStorage.setItem(LAST_KEY, id)
  }
  catch {
    // Ignore storage failures; routing still works from the URL.
  }
  const rest = readRecentDropIds().filter(existing => existing !== id)
  writeRecent([id, ...rest])
}

export function removeRecentDropId(dropId: string): void {
  const id = normalizeDropId(dropId)
  if (!id)
    return
  writeRecent(readRecentDropIds().filter(existing => existing !== id))
  try {
    if (normalizeDropId(window.localStorage.getItem(LAST_KEY)) === id)
      window.localStorage.removeItem(LAST_KEY)
  }
  catch {
    // Ignore storage failures.
  }
}

export function clearLastOpenedDrop(): void {
  try {
    window.localStorage.removeItem(LAST_KEY)
  }
  catch {
    // Ignore storage failures.
  }
}

export function goToHome(): void {
  const url = new URL(window.location.href)
  url.pathname = '/'
  url.search = '?home=1'
  url.hash = ''
  window.location.assign(url.toString())
}

export function goToCreateDrop(): void {
  clearLastOpenedDrop()
  goToHome()
}

export function openDropById(dropId: string): void {
  const id = normalizeDropId(dropId)
  if (!id)
    return
  saveLastOpenedDrop(id)
  const url = new URL(window.location.href)
  url.pathname = '/'
  url.search = `?drop=${id}`
  url.hash = ''
  window.location.assign(url.toString())
}
