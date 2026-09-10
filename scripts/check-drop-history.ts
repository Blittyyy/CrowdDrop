/**
 * Your Drops ↔ History partition rules (no chain calls).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DropRecord, DropSummary } from '../src/dropCatalog.ts'
import {
  HISTORY_RECENCY_SECONDS,
  belongsInHomeYourDrops,
  isActionableYourDrop,
  isResolvedYourDrop,
  partitionYourDrops,
  resolutionTimestampSec,
} from '../src/dropHistory.ts'

const root = join(import.meta.dirname, '..')
const DAY = 24 * 60 * 60
const NOW = 1_700_000_000

function drop(partial: Partial<DropRecord> = {}): DropRecord {
  return {
    seller: '0x1111111111111111111111111111111111111111',
    contribution: 10_000n,
    goal: 2n,
    deadline: BigInt(NOW),
    buyerCount: 0n,
    escrowed: 0n,
    claimed: false,
    ...partial,
  }
}

function summary(
  id: string,
  status: DropSummary['status'],
  opts: { walletDeposit?: bigint, relation?: DropSummary['relation'], drop?: Partial<DropRecord> } = {},
): DropSummary {
  return {
    id,
    status,
    relation: opts.relation ?? 'seller',
    walletDeposit: opts.walletDeposit ?? 0n,
    drop: drop(opts.drop),
  }
}

// 1. Active seller stays on Home
{
  const row = summary('1', 'Active', { relation: 'seller' })
  assert.equal(isActionableYourDrop(row), true)
  assert.equal(belongsInHomeYourDrops(row, NOW, new Map()), true)
}

// 2. Active buyer stays on Home
{
  const row = summary('2', 'Active', { relation: 'joined', walletDeposit: 10_000n })
  assert.equal(isActionableYourDrop(row), true)
  assert.equal(belongsInHomeYourDrops(row, NOW, new Map()), true)
}

// 3. Successful unclaimed seller stays on Home regardless of age
{
  const oldDeadline = NOW - 40 * DAY
  const row = summary('3', 'Successful', {
    relation: 'seller',
    drop: { deadline: BigInt(oldDeadline), buyerCount: 2n, escrowed: 20_000n },
  })
  assert.equal(isActionableYourDrop(row), true)
  assert.equal(belongsInHomeYourDrops(row, NOW, new Map()), true)
}

// 4. Expired buyer with deposit stays on Home regardless of age
{
  const oldDeadline = NOW - 30 * DAY
  const row = summary('4', 'Expired', {
    relation: 'joined',
    walletDeposit: 10_000n,
    drop: { deadline: BigInt(oldDeadline), escrowed: 10_000n },
  })
  assert.equal(isActionableYourDrop(row), true)
  assert.equal(belongsInHomeYourDrops(row, NOW, new Map()), true)
  assert.equal(isResolvedYourDrop(row), false)
}

// 5. Claimed <7 days stays on Home
{
  const claimedAt = NOW - 3 * DAY
  const row = summary('5', 'Claimed', {
    relation: 'seller',
    drop: { claimed: true, buyerCount: 2n },
  })
  const ts = new Map([['5', claimedAt]])
  assert.equal(isResolvedYourDrop(row), true)
  assert.equal(belongsInHomeYourDrops(row, NOW, ts), true)
}

// 6. Claimed >7 days moves to History
{
  const claimedAt = NOW - 10 * DAY
  const row = summary('6', 'Claimed', {
    relation: 'joined',
    walletDeposit: 10_000n,
    drop: { claimed: true, buyerCount: 2n },
  })
  const ts = new Map([['6', claimedAt]])
  assert.equal(belongsInHomeYourDrops(row, NOW, ts), false)
  const { home, history } = partitionYourDrops([row], NOW, ts)
  assert.equal(home.length, 0)
  assert.equal(history.length, 1)
  assert.equal(history[0]!.id, '6')
  assert.equal(history[0]!.resolvedAtSec, claimedAt)
}

// 7. Fully resolved Expired <7 days stays on Home
{
  const deadline = NOW - 2 * DAY
  const row = summary('7', 'Expired', {
    relation: 'seller',
    walletDeposit: 0n,
    drop: { deadline: BigInt(deadline) },
  })
  assert.equal(isResolvedYourDrop(row), true)
  assert.equal(resolutionTimestampSec(row, new Map()), deadline)
  assert.equal(belongsInHomeYourDrops(row, NOW, new Map()), true)
}

// 8. Fully resolved Expired >7 days moves to History
{
  const deadline = NOW - 14 * DAY
  const row = summary('8', 'Expired', {
    relation: 'joined',
    walletDeposit: 0n,
    drop: { deadline: BigInt(deadline) },
  })
  assert.equal(belongsInHomeYourDrops(row, NOW, new Map()), false)
  const { history } = partitionYourDrops([row], NOW, new Map())
  assert.equal(history[0]!.resolvedAtSec, deadline)
}

// 9. History newest first
{
  const older = summary('9a', 'Claimed', { drop: { claimed: true } })
  const newer = summary('9b', 'Claimed', { drop: { claimed: true } })
  const ts = new Map([
    ['9a', NOW - 20 * DAY],
    ['9b', NOW - 10 * DAY],
  ])
  const { history } = partitionYourDrops([older, newer], NOW, ts)
  assert.deepEqual(history.map(r => r.id), ['9b', '9a'])
}

// Missing claim timestamp: keep on Home (do not invent)
{
  const row = summary('miss', 'Claimed', { drop: { claimed: true } })
  assert.equal(resolutionTimestampSec(row, new Map()), null)
  assert.equal(belongsInHomeYourDrops(row, NOW, new Map()), true)
  assert.equal(HISTORY_RECENCY_SECONDS, 7 * DAY)
}

// 10–12, 14–15: wiring / UI source checks
{
  const listsSrc = readFileSync(join(root, 'src/DropLists.vue'), 'utf8')
  const historySrc = readFileSync(join(root, 'src/DropHistory.vue'), 'utf8')
  const cardSrc = readFileSync(join(root, 'src/DropCard.vue'), 'utf8')
  const appSrc = readFileSync(join(root, 'src/App.vue'), 'utf8')
  const routeSrc = readFileSync(join(root, 'src/appRoute.ts'), 'utf8')
  const navSrc = readFileSync(join(root, 'src/appNavigation.ts'), 'utf8')

  // 10. History rows open Drop Detail (same DropCard → openDropById)
  assert.match(historySrc, /<DropCard/)
  assert.match(cardSrc, /openDropById\(summary\.id\)/)

  // 11–12. product-backed vs legacy via existing DropCard product prop
  assert.match(historySrc, /:product="productsByDropId\[row\.id\] \?\? null"/)
  assert.match(cardSrc, /productTitle/)
  assert.match(cardSrc, /Drop #\$\{props\.summary\.id\}/)

  // 13. disconnected users do not get wallet History data load path without wallet
  assert.match(historySrc, /Connect to see History/)
  assert.match(listsSrc, /showHistoryLink/)
  assert.match(listsSrc, /walletAccount\.value && walletOnActiveNetwork\.value && hasHistory\.value/)

  // 14. View history only when relevant
  assert.match(listsSrc, /v-if="showHistoryLink"/)
  assert.match(listsSrc, /View history →/)
  assert.match(listsSrc, /goToHistory/)

  // 15. direct Drop URLs unaffected
  assert.match(routeSrc, /dropFromSearch/)
  assert.match(routeSrc, /\?drop=/)
  assert.doesNotMatch(routeSrc, /history.*dropParam/)

  assert.match(appSrc, /DropHistory/)
  assert.match(appSrc, /route\.name === 'history'/)
  assert.match(navSrc, /historyPath/)
  assert.match(navSrc, /goToHistory/)
  assert.match(historySrc, /Completed Drops from this wallet/)
  assert.match(historySrc, /No completed Drops yet/)
  assert.match(historySrc, /← Home/)
}

console.log('check-drop-history: ok')
