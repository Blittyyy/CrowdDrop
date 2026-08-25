import assert from 'node:assert/strict'
import {
  ACTIVE_CROWDDROP_NETWORK_ID,
  CROWDDROP_SEPOLIA_ADDRESS,
  POLYGON_CHAIN_DECIMAL,
  POLYGON_CHAIN_ID,
  POLYGON_CROWDDROP_ADDRESS,
  POLYGON_USDT_ADDRESS,
  REUSABLE_ALLOWANCE_UNITS,
  activeCrowdDropNetwork,
} from '../src/escrowConfig.ts'

assert.equal(ACTIVE_CROWDDROP_NETWORK_ID, 'polygonUsdt')
assert.equal(activeCrowdDropNetwork.id, 'polygonUsdt')
assert.equal(activeCrowdDropNetwork.chainId, POLYGON_CHAIN_ID)
assert.equal(activeCrowdDropNetwork.chainDecimal, POLYGON_CHAIN_DECIMAL)
assert.equal(POLYGON_CHAIN_DECIMAL, 137)
assert.equal(activeCrowdDropNetwork.chainName, 'Polygon')
assert.equal(activeCrowdDropNetwork.nativeCurrency.symbol, 'POL')
assert.equal(activeCrowdDropNetwork.tokenSymbol, 'USDT')
assert.equal(activeCrowdDropNetwork.tokenDecimals, 6)
assert.equal(activeCrowdDropNetwork.tokenAddress.toLowerCase(), POLYGON_USDT_ADDRESS.toLowerCase())
assert.equal(activeCrowdDropNetwork.crowdDropAddress.toLowerCase(), POLYGON_CROWDDROP_ADDRESS.toLowerCase())
assert.equal(activeCrowdDropNetwork.crowdDropAddress.toLowerCase(), '0xcd9faa04f12b3bcf926359057e1ff445e7e75c12')
assert.notEqual(activeCrowdDropNetwork.crowdDropAddress.toLowerCase(), CROWDDROP_SEPOLIA_ADDRESS.toLowerCase())
assert.equal(activeCrowdDropNetwork.eventFromBlock, 92_643_155)
assert.equal(activeCrowdDropNetwork.requiresAllowanceReset, true)
assert.equal(activeCrowdDropNetwork.reusableAllowanceUnits, REUSABLE_ALLOWANCE_UNITS)
assert.equal(REUSABLE_ALLOWANCE_UNITS, 100_000_000n)
assert.equal(activeCrowdDropNetwork.chainId === POLYGON_CHAIN_ID, true)
assert.equal(activeCrowdDropNetwork.chainId === '0xaa36a7', false)

console.log('activeNetwork: 18 checks passed')
