import { applySavedDrop, resolveAppRoute, wantsHomeScreen, APP_ROUTE_CASES } from '../src/appRoute.ts'
import assert from 'node:assert/strict'

for (const { href, route } of APP_ROUTE_CASES) {
  assert.deepEqual(resolveAppRoute(href), route, href)
}

assert.deepEqual(resolveAppRoute('http://10.0.0.148:5173/?drop=3'), { name: 'drop', dropParam: '3' })
assert.deepEqual(resolveAppRoute('http://10.0.0.148:5173/'), { name: 'create' })
assert.deepEqual(resolveAppRoute('http://10.0.0.148:5173/?drop=999'), { name: 'drop', dropParam: '999' })
assert.deepEqual(resolveAppRoute('http://10.0.0.148:5173/dev'), { name: 'dev' })

assert.deepEqual(
  applySavedDrop(resolveAppRoute('http://10.0.0.148:5173/'), '3'),
  { name: 'drop', dropParam: '3' },
)
assert.deepEqual(
  applySavedDrop(resolveAppRoute('http://10.0.0.148:5173/?drop=7'), '3'),
  { name: 'drop', dropParam: '7' },
)
assert.deepEqual(
  applySavedDrop(resolveAppRoute('http://10.0.0.148:5173/dev'), '3'),
  { name: 'dev' },
)
assert.deepEqual(
  applySavedDrop(resolveAppRoute('http://10.0.0.148:5173/'), null),
  { name: 'create' },
)
assert.equal(wantsHomeScreen('http://10.0.0.148:5173/?home=1'), true)
assert.equal(wantsHomeScreen('http://10.0.0.148:5173/'), false)
assert.equal(wantsHomeScreen('http://10.0.0.148:5173/?drop=3'), false)
assert.deepEqual(resolveAppRoute('http://10.0.0.148:5173/?home=1'), { name: 'create' })

console.log(`appRoute: ${APP_ROUTE_CASES.length + 12} checks passed`)
