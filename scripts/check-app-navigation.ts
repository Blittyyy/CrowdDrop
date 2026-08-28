/**
 * SPA navigation — no document reload; wallet session must survive route changes.
 */
import assert from 'node:assert/strict'
import { resolveAppRoute } from '../src/appRoute.ts'
import {
  canSpaBack,
  dropPath,
  goBackOrHome,
  goToHome,
  homePath,
  lastNavigationUsedAssign,
  lastNavigationWasSpa,
  openDropById,
  registerNavigationSync,
  resetNavigationTestFlags,
} from '../src/appNavigation.ts'

let passed = 0
function check(cond: unknown, msg: string) {
  assert.ok(cond, msg)
  passed += 1
}

// --- Pure path helpers (shareable URLs) ---
check(dropPath('3') === '/?drop=3', 'drop path')
check(dropPath('15') === '/?drop=15', 'drop path encodes id')
check(homePath() === '/?home=1', 'home path')
check(
  resolveAppRoute(`https://usecrowddrop.xyz${dropPath('3')}`).name === 'drop',
  'drop path resolves to drop route',
)
check(
  resolveAppRoute(`https://usecrowddrop.xyz${homePath()}`).name === 'create',
  'home path resolves to create route',
)

// --- Mock browser for SPA navigation (no real reload) ---
type HistoryEntry = { path: string, state: unknown }

function installBrowserMock(initialPath = '/?home=1') {
  const entries: HistoryEntry[] = [{ path: initialPath, state: null }]
  let index = 0
  let assignCalled = false
  let syncCount = 0

  const win = {
    location: {
      href: `https://usecrowddrop.xyz${initialPath}`,
      origin: 'https://usecrowddrop.xyz',
      assign(url: string) {
        assignCalled = true
        win.location.href = url
      },
    },
    history: {
      get state() {
        return entries[index]?.state ?? null
      },
      pushState(state: unknown, _title: string, path: string) {
        entries.splice(index + 1)
        index += 1
        entries[index] = { path, state }
        win.location.href = `https://usecrowddrop.xyz${path}`
      },
      replaceState(state: unknown, _title: string, path: string) {
        entries[index] = { path, state }
        win.location.href = `https://usecrowddrop.xyz${path}`
      },
      back() {
        if (index > 0)
          index -= 1
        win.location.href = `https://usecrowddrop.xyz${entries[index].path}`
      },
    },
  }

  ;(globalThis as { window?: typeof win }).window = win

  registerNavigationSync(() => {
    syncCount += 1
  })

  return {
    get assignCalled() { return assignCalled },
    get syncCount() { return syncCount },
    get path() { return entries[index].path },
    get state() { return entries[index].state },
    popBack() { win.history.back() },
  }
}

// 1–2, 7: Home ↔ Drop preserves session (SPA — no assign)
{
  resetNavigationTestFlags()
  const browser = installBrowserMock('/?home=1')
  openDropById('3')
  check(lastNavigationWasSpa, 'open drop uses SPA')
  check(!lastNavigationUsedAssign, 'open drop does not assign')
  check(!browser.assignCalled, 'open drop no location.assign')
  check(browser.path === '/?drop=3', 'url becomes drop')
  check(browser.syncCount === 1, 'route sync after open drop')

  goToHome()
  check(browser.path === '/?home=1', 'url returns home')
  check(browser.syncCount === 2, 'route sync after home')
  check(!browser.assignCalled, 'home navigation no assign')
}

// 3–5: list rows use SPA openDropById
{
  resetNavigationTestFlags()
  const browser = installBrowserMock('/?home=1')
  openDropById('14')
  check(browser.path === '/?drop=14', 'community-style open')
  openDropById('12')
  check(browser.path === '/?drop=12', 'your-drop-style open')
  openDropById('99')
  check(browser.path === '/?drop=99', 'recent-style open')
  check(!browser.assignCalled, 'list rows no assign')
}

// 6: Created → Open Drop
{
  resetNavigationTestFlags()
  installBrowserMock('/?home=1')
  openDropById('15')
  check(lastNavigationWasSpa, 'created open drop SPA')
  check(resolveAppRoute(window.location.href).dropParam === '15', 'created drop url')
}

// 8: popstate/back updates screen via sync + path
{
  resetNavigationTestFlags()
  const browser = installBrowserMock('/?home=1')
  openDropById('3')
  check(canSpaBack(), 'can spa back after push')
  browser.popBack()
  check(browser.path === '/?home=1', 'back restores home path')
}

// 9: direct /?drop=ID load still resolves
check(
  resolveAppRoute('https://usecrowddrop.xyz/?drop=3').dropParam === '3',
  'direct drop deep link',
)

// 10: appNavigation does not import wallet / requestAccounts
{
  const navSource = await import('node:fs/promises').then(fs =>
    fs.readFile(new URL('../src/appNavigation.ts', import.meta.url), 'utf8'),
  )
  check(!navSource.includes('requestAccount'), 'nav does not request accounts')
  check(!navSource.includes('eth_requestAccounts'), 'nav does not call eth_requestAccounts')
}

// 11: internal navigation does NOT reload via location.assign
{
  resetNavigationTestFlags()
  const browser = installBrowserMock('/?home=1')
  goBackOrHome()
  check(!browser.assignCalled, 'goBackOrHome fallback no assign')
  openDropById('7')
  goBackOrHome()
  check(!browser.assignCalled, 'goBackOrHome with history no assign')
}

console.log(`appNavigation: ${passed} checks passed`)
