/**
 * Serverless API smoke checks (no Vercel CLI required).
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  AUTH_TEST_ACTION,
  parseProviderTypedData,
  verifyCrowdDropAuthSignature,
} from '../api/lib/crowdDropAuthVerify.ts'

const CHALLENGE_TTL_SECONDS = 5 * 60

function createChallenge(nowMs = Date.now()) {
  return {
    nonce: randomBytes(32).toString('hex'),
    expiresAt: Math.floor(nowMs / 1000) + CHALLENGE_TTL_SECONDS,
  }
}

const challenge = createChallenge(1_700_000_000 * 1000)
assert.match(challenge.nonce, /^[0-9a-f]{64}$/)
assert.equal(challenge.expiresAt, 1_700_000_000 + CHALLENGE_TTL_SECONDS)

const account = privateKeyToAccount(generatePrivateKey())
const typedData = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Auth: [
      { name: 'action', type: 'string' },
      { name: 'wallet', type: 'address' },
      { name: 'nonce', type: 'string' },
      { name: 'expiresAt', type: 'uint256' },
    ],
  },
  primaryType: 'Auth' as const,
  domain: {
    name: 'CrowdDrop',
    version: '1',
    chainId: 137,
    verifyingContract: '0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12',
  },
  message: {
    action: AUTH_TEST_ACTION,
    wallet: account.address,
    nonce: challenge.nonce,
    expiresAt: String(challenge.expiresAt),
  },
}

const parsed = parseProviderTypedData(typedData)
const signature = await account.signTypedData({
  domain: parsed.domain,
  types: parsed.types,
  primaryType: parsed.primaryType,
  message: parsed.message,
})

const ok = await verifyCrowdDropAuthSignature(parsed, signature, {
  expectedAction: AUTH_TEST_ACTION,
  nowSeconds: 1_700_000_000,
})
assert.equal(ok.ok, true)

const badBody = await verifyCrowdDropAuthSignature(parsed, signature, {
  expectedAction: AUTH_TEST_ACTION,
  nowSeconds: challenge.expiresAt + 1,
})
assert.equal(badBody.ok, false)

console.log('api-signing: 5 checks passed')
