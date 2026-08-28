/**
 * Drop Detail polling helpers — no chain calls.
 */
import assert from 'node:assert/strict'
import {
  ACTIVE_DROP_POLL_MS,
  canStartPollTick,
  participantsNeedReload,
  shouldPausePolling,
  shouldPollDrop,
  snapshotFromDrop,
} from '../src/dropDetailPolling.ts'

let passed = 0
function check(cond: unknown, msg: string) {
  assert.ok(cond, msg)
  passed += 1
}

check(ACTIVE_DROP_POLL_MS === 5000, 'poll interval is 5s')

// Polling lifecycle by status
check(shouldPollDrop('Active', 100n), 'active drop polls')
check(shouldPollDrop('Successful', 100n), 'successful unclaimed continues polling')
check(shouldPollDrop('Successful', 0n), 'successful with zero escrow still polls until claimed')
check(shouldPollDrop('Expired', 100n), 'expired with escrow continues polling')
check(!shouldPollDrop('Expired', 0n), 'expired with no escrow stops polling')
check(!shouldPollDrop('Claimed', 100n), 'claimed stops polling')
check(!shouldPollDrop('Claimed', 0n), 'claimed with zero escrow stops polling')
check(!shouldPollDrop(null, 0n), 'null status does not poll')

check(shouldPausePolling('hidden'), 'hidden pauses polling')
check(!shouldPausePolling('visible'), 'visible allows polling')

check(canStartPollTick(false, false), 'can start when idle')
check(!canStartPollTick(true, false), 'skip when poll in flight')
check(!canStartPollTick(false, true), 'skip when manual refresh running')
check(!canStartPollTick(true, true), 'skip when both running')

const snap = (buyerCount: bigint, escrowed: bigint, status: string, claimed = false) => ({
  buyerCount,
  escrowed,
  statusLabel: status,
  claimed,
})

check(participantsNeedReload(null, snap(1n, 100n, 'Active')), 'initial reload')
check(
  !participantsNeedReload(snap(1n, 100n, 'Active'), snap(1n, 100n, 'Active')),
  'unchanged counters skip reload',
)
check(
  participantsNeedReload(snap(1n, 100n, 'Active'), snap(2n, 100n, 'Active')),
  'buyerCount change reloads',
)
check(
  participantsNeedReload(snap(1n, 100n, 'Active'), snap(1n, 200n, 'Active')),
  'escrowed change reloads',
)
check(
  participantsNeedReload(snap(1n, 100n, 'Active'), snap(1n, 100n, 'Successful')),
  'status change reloads',
)
check(
  participantsNeedReload(snap(1n, 100n, 'Successful'), snap(1n, 100n, 'Claimed')),
  'successful to claimed status change reloads',
)

check(
  snapshotFromDrop({ buyerCount: 2n, escrowed: 200n, claimed: false }, 'Active')?.buyerCount === 2n,
  'snapshot from drop',
)
check(snapshotFromDrop(null, 'Active') === null, 'null drop snapshot')

console.log(`dropDetailPolling: ${passed} checks passed`)
