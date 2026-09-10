import { applySavedDrop, resolveAppRoute, wantsHomeScreen, wantsHistoryScreen, APP_ROUTE_CASES } from '../src/appRoute.ts'
import assert from 'node:assert/strict'

for (const { href, route } of APP_ROUTE_CASES) {
  assert.deepEqual(resolveAppRoute(href), route, href)
}

assert.deepEqual(resolveAppRoute('https://usecrowddrop.xyz/?drop=3'), { name: 'drop', dropParam: '3' })
assert.deepEqual(resolveAppRoute('https://usecrowddrop.xyz/'), { name: 'create' })
assert.deepEqual(resolveAppRoute('https://usecrowddrop.xyz/?drop=999'), { name: 'drop', dropParam: '999' })
assert.deepEqual(resolveAppRoute('https://usecrowddrop.xyz/dev'), { name: 'dev' })
assert.deepEqual(resolveAppRoute('https://usecrowddrop.xyz/?history=1'), { name: 'history' })
assert.deepEqual(resolveAppRoute('https://usecrowddrop.xyz/history'), { name: 'history' })

assert.deepEqual(
  applySavedDrop(resolveAppRoute('https://usecrowddrop.xyz/'), '3'),
  { name: 'drop', dropParam: '3' },
)
assert.deepEqual(
  applySavedDrop(resolveAppRoute('https://usecrowddrop.xyz/?drop=7'), '3'),
  { name: 'drop', dropParam: '7' },
)
assert.deepEqual(
  applySavedDrop(resolveAppRoute('https://usecrowddrop.xyz/dev'), '3'),
  { name: 'dev' },
)
assert.deepEqual(
  applySavedDrop(resolveAppRoute('https://usecrowddrop.xyz/?history=1'), '3'),
  { name: 'history' },
)
assert.deepEqual(
  applySavedDrop(resolveAppRoute('https://usecrowddrop.xyz/'), null),
  { name: 'create' },
)
assert.equal(wantsHomeScreen('https://usecrowddrop.xyz/?home=1'), true)
assert.equal(wantsHomeScreen('https://usecrowddrop.xyz/'), false)
assert.equal(wantsHomeScreen('https://usecrowddrop.xyz/?drop=3'), false)
assert.equal(wantsHistoryScreen('https://usecrowddrop.xyz/?history=1'), true)
assert.equal(wantsHistoryScreen('https://usecrowddrop.xyz/history'), true)
assert.equal(wantsHistoryScreen('https://usecrowddrop.xyz/'), false)
assert.deepEqual(resolveAppRoute('https://usecrowddrop.xyz/?home=1'), { name: 'create' })

assert.deepEqual(resolveAppRoute('https://usecrowddrop.xyz/showcase'), { name: 'showcase' })
assert.deepEqual(resolveAppRoute('https://usecrowddrop.xyz/showcase/'), { name: 'showcase' })
assert.deepEqual(
  applySavedDrop(resolveAppRoute('https://usecrowddrop.xyz/showcase'), '3'),
  { name: 'showcase' },
)

// Direct drop URLs win over history flags if both present
assert.deepEqual(
  resolveAppRoute('https://usecrowddrop.xyz/?drop=5&history=1'),
  { name: 'drop', dropParam: '5' },
)

console.log(`appRoute: ${APP_ROUTE_CASES.length + 20} checks passed`)
