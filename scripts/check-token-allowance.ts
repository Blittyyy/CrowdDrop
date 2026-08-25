import assert from 'node:assert/strict'
import {
  ACTIVE_CROWDDROP_NETWORK_ID,
  REUSABLE_ALLOWANCE_UNITS,
  STABLECOIN_DECIMALS,
  activeCrowdDropNetwork,
} from '../src/escrowConfig.ts'
import {
  MAX_UINT256,
  planTokenApproval,
  remainingAfterJoin,
  reusableApprovalAmount,
  withdrawalRestoresAllowance,
} from '../src/tokenAllowance.ts'

const one = 1n * 10n ** BigInt(STABLECOIN_DECIMALS)
const hundred = 100n * 10n ** BigInt(STABLECOIN_DECIMALS)
const ninetyNine = 99n * 10n ** BigInt(STABLECOIN_DECIMALS)
const oneFifty = 150n * 10n ** BigInt(STABLECOIN_DECIMALS)

assert.equal(STABLECOIN_DECIMALS, 6)
assert.equal(REUSABLE_ALLOWANCE_UNITS, hundred)
assert.equal(one, 1_000_000n)
assert.equal(hundred, 100_000_000n)

assert.equal(reusableApprovalAmount(one, hundred), hundred)
assert.deepEqual(planTokenApproval(0n, one, hundred, false), { kind: 'approve', amount: hundred })

assert.deepEqual(planTokenApproval(ninetyNine, one, hundred, false), { kind: 'none' })
assert.deepEqual(planTokenApproval(ninetyNine, one, hundred, true), { kind: 'none' })

const large = reusableApprovalAmount(oneFifty, hundred)
assert.ok(large >= oneFifty)
assert.equal(large, oneFifty * 5n)
assert.deepEqual(planTokenApproval(0n, oneFifty, hundred, false), { kind: 'approve', amount: oneFifty * 5n })

assert.equal(remainingAfterJoin(hundred, one), ninetyNine)
assert.equal(withdrawalRestoresAllowance(), false)

assert.notEqual(reusableApprovalAmount(one, hundred), MAX_UINT256)
assert.notEqual(reusableApprovalAmount(oneFifty, hundred), MAX_UINT256)
assert.throws(() => reusableApprovalAmount(1n, MAX_UINT256))

assert.deepEqual(
  planTokenApproval(one, oneFifty, hundred, true),
  { kind: 'reset-then-approve', amount: oneFifty * 5n },
)
assert.deepEqual(
  planTokenApproval(one, oneFifty, hundred, false),
  { kind: 'approve', amount: oneFifty * 5n },
)

assert.equal(ACTIVE_CROWDDROP_NETWORK_ID, 'polygonUsdt')
assert.equal(activeCrowdDropNetwork.requiresAllowanceReset, true)
assert.equal(activeCrowdDropNetwork.reusableAllowanceUnits, hundred)
assert.deepEqual(
  planTokenApproval(one, oneFifty, hundred, activeCrowdDropNetwork.requiresAllowanceReset),
  { kind: 'reset-then-approve', amount: oneFifty * 5n },
)

console.log('tokenAllowance: 18 checks passed')
