/**
 * Home list polling helpers — no chain calls.
 */
import assert from 'node:assert/strict'
import type { DropSummary } from '../src/dropCatalog.ts'
import {
  mergePolledSummary,
  patchSummaryList,
  pollableSummaryIds,
  shouldPollHomeLists,
  uniqueSummariesById,
} from '../src/homeListPolling.ts'

function row(
  id: string,
  status: DropSummary['status'],
  buyerCount: bigint,
  escrowed: bigint,
  relation: DropSummary['relation'] = null,
): DropSummary {
  return {
    id,
    status,
    relation,
    drop: {
      seller: '0x0000000000000000000000000000000000000001',
      contribution: 1n,
      goal: 2n,
      deadline: 9999999999n,
      buyerCount,
      escrowed,
      claimed: status === 'Claimed',
    },
  }
}

let passed = 0
function check(cond: unknown, msg: string) {
  assert.ok(cond, msg)
  passed += 1
}

check(shouldPollHomeLists([row('1', 'Active', 0n, 0n)]), 'active community row polls')
check(shouldPollHomeLists([row('1', 'Successful', 2n, 2n)]), 'successful unclaimed polls')
check(shouldPollHomeLists([row('1', 'Expired', 1n, 1n)]), 'expired with escrow polls')
check(!shouldPollHomeLists([row('1', 'Claimed', 2n, 0n)]), 'claimed rows stop polling')
check(!shouldPollHomeLists([row('1', 'Expired', 0n, 0n)]), 'expired empty stops polling')
check(!shouldPollHomeLists([]), 'empty lists do not poll')

const community = [row('5', 'Active', 1n, 1n)]
const mine = [row('5', 'Active', 1n, 1n, 'seller')]
const recent: DropSummary[] = []
check(uniqueSummariesById(community, mine, recent).size === 1, 'dedupe same id across sections')
check(pollableSummaryIds(community, mine, recent).join(',') === '5', 'pollable ids from visible rows')

const merged = mergePolledSummary(mine[0], row('5', 'Active', 2n, 2n))
check(merged.relation === 'seller', 'merge keeps seller relation')
check(merged.drop.buyerCount === 2n, 'merge updates buyer count')

const patched = patchSummaryList(community, '5', merged)
check(patched[0].drop.buyerCount === 2n, 'patch updates list row')

console.log(`homeListPolling: ${passed} checks passed`)
