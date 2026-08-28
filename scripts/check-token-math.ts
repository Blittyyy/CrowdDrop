import assert from 'node:assert/strict'
import { parseTokenAmount, formatTokenAmount, dropClaimedTotalUnits } from '../src/tokenMath.ts'
import { STABLECOIN_DECIMALS } from '../src/escrowConfig.ts'

assert.equal(STABLECOIN_DECIMALS, 6)

// Explicit requirement: 0.10 USDT → 100000 base units
assert.equal(parseTokenAmount('0.10', 6), 100_000n)
assert.equal(parseTokenAmount('0.1', 6), 100_000n)
assert.equal(parseTokenAmount('0.25', 6), 250_000n)
assert.equal(parseTokenAmount('0.000001', 6), 1n)
assert.equal(parseTokenAmount('1', 6), 1_000_000n)
assert.equal(parseTokenAmount('10.5', 6), 10_500_000n)
assert.equal(parseTokenAmount('10.50', 6), 10_500_000n)
assert.equal(parseTokenAmount(' 0.10 ', 6), 100_000n)
assert.equal(parseTokenAmount('.10', 6), 100_000n)
assert.equal(parseTokenAmount('0,10', 6), 100_000n)

assert.equal(formatTokenAmount(100_000n, 6), '0.1')

function rejects(input: string, decimals = 6) {
  assert.throws(() => parseTokenAmount(input, decimals), Error)
}

rejects('')
rejects('   ')
rejects('0')
rejects('0.0')
rejects('0.000000')
rejects('-1')
rejects('-0.10')
rejects('abc')
rejects('1.')
rejects('1.2.3')
rejects('10.1234567')
rejects('0.0000001')
rejects('1,234.56')
rejects('+1')

assert.equal(dropClaimedTotalUnits(100n, 2n), 200n)
assert.equal(formatTokenAmount(dropClaimedTotalUnits(100_000n, 2n), 6), '0.2')
assert.equal(formatTokenAmount(dropClaimedTotalUnits(100n, 2n), 6), '0.0002')
assert.equal(formatTokenAmount(dropClaimedTotalUnits(5_000_000n, 10n), 6), '50')

let passed = 0
const cases: Array<[string, bigint]> = [
  ['0.10', 100_000n],
  ['0.1', 100_000n],
  ['0.25', 250_000n],
  ['0.000001', 1n],
  ['1', 1_000_000n],
  ['10.5', 10_500_000n],
]
for (const [input, expected] of cases) {
  assert.equal(parseTokenAmount(input, STABLECOIN_DECIMALS), expected)
  passed++
}

console.log(`tokenMath: ${passed + 24} checks passed (includes 0.10 USDT → 100000)`)
