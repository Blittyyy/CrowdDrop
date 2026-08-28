import assert from 'node:assert/strict'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  AUTH_TEST_ACTION,
  buildCrowdDropAuthTypedData,
  CROWDDROP_AUTH_DOMAIN,
  parseProviderTypedData,
  toProviderTypedDataPayload,
  verifyCrowdDropAuthSignature,
} from '../src/signing/crowdDropAuthTypedData.ts'
import { createSigningChallenge } from '../src/signing/signChallenge.ts'
import { POLYGON_CHAIN_DECIMAL, POLYGON_CROWDDROP_ADDRESS } from '../src/escrowConfig.ts'

const account = privateKeyToAccount(generatePrivateKey())
const otherAccount = privateKeyToAccount(generatePrivateKey())

const nowSeconds = 1_700_000_000
const challenge = createSigningChallenge(nowSeconds * 1000)

assert.match(challenge.nonce, /^[0-9a-f]{64}$/)
assert.equal(challenge.expiresAt, nowSeconds + 5 * 60)

const typedData = buildCrowdDropAuthTypedData({
  action: AUTH_TEST_ACTION,
  wallet: account.address,
  nonce: challenge.nonce,
  expiresAt: challenge.expiresAt,
})

assert.equal(CROWDDROP_AUTH_DOMAIN.name, 'CrowdDrop')
assert.equal(CROWDDROP_AUTH_DOMAIN.version, '1')
assert.equal(CROWDDROP_AUTH_DOMAIN.chainId, POLYGON_CHAIN_DECIMAL)
assert.equal(CROWDDROP_AUTH_DOMAIN.chainId, 137)
assert.equal(
  CROWDDROP_AUTH_DOMAIN.verifyingContract.toLowerCase(),
  POLYGON_CROWDDROP_ADDRESS.toLowerCase(),
)
assert.equal(typedData.primaryType, 'Auth')
assert.equal(typedData.message.action, AUTH_TEST_ACTION)
assert.equal(typedData.message.wallet, account.address)

const providerPayload = toProviderTypedDataPayload(typedData)
assert.equal(providerPayload.message.expiresAt, String(challenge.expiresAt))
assert.ok(providerPayload.types.EIP712Domain.length >= 4)

const roundTrip = parseProviderTypedData(providerPayload)
assert.equal(roundTrip.message.nonce, challenge.nonce)
assert.equal(roundTrip.message.expiresAt, BigInt(challenge.expiresAt))

const signature = await account.signTypedData({
  domain: typedData.domain,
  types: typedData.types,
  primaryType: typedData.primaryType,
  message: typedData.message,
})

const ok = await verifyCrowdDropAuthSignature(typedData, signature, {
  expectedAction: AUTH_TEST_ACTION,
  nowSeconds,
})
assert.equal(ok.ok, true)
if (ok.ok)
  assert.equal(ok.recovered.toLowerCase(), account.address.toLowerCase())

const expired = buildCrowdDropAuthTypedData({
  action: AUTH_TEST_ACTION,
  wallet: account.address,
  nonce: 'deadbeef',
  expiresAt: nowSeconds - 1,
})
const expiredSig = await account.signTypedData({
  domain: expired.domain,
  types: expired.types,
  primaryType: expired.primaryType,
  message: expired.message,
})
const expiredResult = await verifyCrowdDropAuthSignature(expired, expiredSig, {
  expectedAction: AUTH_TEST_ACTION,
  nowSeconds,
})
assert.equal(expiredResult.ok, false)
if (!expiredResult.ok)
  assert.match(expiredResult.reason, /expired/i)

const wrongWallet = buildCrowdDropAuthTypedData({
  action: AUTH_TEST_ACTION,
  wallet: otherAccount.address,
  nonce: challenge.nonce,
  expiresAt: challenge.expiresAt,
})
const wrongWalletSig = await account.signTypedData({
  domain: wrongWallet.domain,
  types: wrongWallet.types,
  primaryType: wrongWallet.primaryType,
  message: wrongWallet.message,
})
const wrongWalletResult = await verifyCrowdDropAuthSignature(wrongWallet, wrongWalletSig, {
  expectedAction: AUTH_TEST_ACTION,
  nowSeconds,
})
assert.equal(wrongWalletResult.ok, false)
if (!wrongWalletResult.ok)
  assert.match(wrongWalletResult.reason, /wallet/i)

const wrongContract = buildCrowdDropAuthTypedData({
  action: AUTH_TEST_ACTION,
  wallet: account.address,
  nonce: challenge.nonce,
  expiresAt: challenge.expiresAt,
})
wrongContract.domain = {
  ...wrongContract.domain,
  verifyingContract: '0x0000000000000000000000000000000000000001',
}
const wrongContractSig = await account.signTypedData({
  domain: wrongContract.domain,
  types: wrongContract.types,
  primaryType: wrongContract.primaryType,
  message: wrongContract.message,
})
const wrongContractResult = await verifyCrowdDropAuthSignature(wrongContract, wrongContractSig, {
  expectedAction: AUTH_TEST_ACTION,
  nowSeconds,
})
assert.equal(wrongContractResult.ok, false)
if (!wrongContractResult.ok)
  assert.match(wrongContractResult.reason, /verifyingContract/i)

const wrongAction = buildCrowdDropAuthTypedData({
  action: 'seller_upload',
  wallet: account.address,
  nonce: challenge.nonce,
  expiresAt: challenge.expiresAt,
})
const wrongActionSig = await account.signTypedData({
  domain: wrongAction.domain,
  types: wrongAction.types,
  primaryType: wrongAction.primaryType,
  message: wrongAction.message,
})
const wrongActionResult = await verifyCrowdDropAuthSignature(wrongAction, wrongActionSig, {
  expectedAction: AUTH_TEST_ACTION,
  nowSeconds,
})
assert.equal(wrongActionResult.ok, false)
if (!wrongActionResult.ok)
  assert.match(wrongActionResult.reason, /action/i)

console.log('signing: 18 checks passed')
