export type AppRoute =
  | { name: 'create' }
  | { name: 'drop', dropParam: string }
  | { name: 'dev' }

function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '')
  return path === '' ? '/' : path
}

function dropFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const drop = params.get('drop')
  if (drop === null)
    return null
  const trimmed = drop.trim()
  return trimmed === '' ? null : trimmed
}

function parseHash(hash: string): { path: string, search: string } {
  if (!hash.startsWith('#'))
    return { path: '', search: '' }
  const raw = hash.slice(1)
  const queryIndex = raw.indexOf('?')
  if (queryIndex >= 0) {
    return {
      path: raw.slice(0, queryIndex) || '/',
      search: raw.slice(queryIndex),
    }
  }
  if (raw.startsWith('/'))
    return { path: raw, search: '' }
  if (raw.includes('='))
    return { path: '', search: `?${raw}` }
  return { path: raw ? `/${raw}` : '', search: '' }
}

/** URL-only route. Wallet state must never affect this. */
export function resolveAppRoute(href: string): AppRoute {
  const url = new URL(href, 'http://local.invalid')
  const path = normalizePath(url.pathname)
  const hash = parseHash(url.hash)
  const hashPath = hash.path ? normalizePath(hash.path) : ''

  if (path === '/dev' || hashPath === '/dev')
    return { name: 'dev' }

  const drop = dropFromSearch(url.search) ?? dropFromSearch(hash.search)
  if (drop !== null)
    return { name: 'drop', dropParam: drop }

  return { name: 'create' }
}

/** Explicit Home/Create (`?home=1`) skips last-opened drop restore. */
export function wantsHomeScreen(href: string): boolean {
  const url = new URL(href, 'http://local.invalid')
  const hash = parseHash(url.hash)
  const search = new URLSearchParams(url.search.startsWith('?') ? url.search.slice(1) : url.search)
  const hashSearch = new URLSearchParams(hash.search.startsWith('?') ? hash.search.slice(1) : hash.search)
  return search.get('home') === '1' || hashSearch.get('home') === '1'
}

/**
 * Apply last-opened drop only when the URL is Create (`/`) with no `?drop=`.
 * Explicit `?drop=` and `/dev` are never overridden by saved state.
 */
export function applySavedDrop(route: AppRoute, savedDrop: string | null): AppRoute {
  if (route.name !== 'create')
    return route
  const trimmed = savedDrop?.trim() ?? ''
  if (!/^\d+$/.test(trimmed))
    return route
  try {
    if (BigInt(trimmed) <= 0n)
      return route
  }
  catch {
    return route
  }
  return { name: 'drop', dropParam: trimmed }
}

export const APP_ROUTE_CASES: Array<{ href: string, route: AppRoute }> = [
  { href: 'http://10.0.0.148:5173/', route: { name: 'create' } },
  { href: 'http://10.0.0.148:5173', route: { name: 'create' } },
  { href: 'http://10.0.0.148:5173/?drop=3', route: { name: 'drop', dropParam: '3' } },
  { href: 'http://10.0.0.148:5173/?drop=999', route: { name: 'drop', dropParam: '999' } },
  { href: 'http://10.0.0.148:5173/dev', route: { name: 'dev' } },
  { href: 'http://10.0.0.148:5173/dev/', route: { name: 'dev' } },
  { href: 'http://10.0.0.148:5173/#/?drop=3', route: { name: 'drop', dropParam: '3' } },
]
