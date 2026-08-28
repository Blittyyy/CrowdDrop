/**
 * Seller auth + product draft foundation tests (no live Supabase required).
 */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import {
  challengeExpiresAtSeconds,
  createChallengeNonce,
  sha256Hex,
} from '../api/lib/authChallengeStore.ts'
import { SELLER_UPLOAD_ACTION } from '../api/lib/crowdDropConstants.ts'
import {
  buildStoragePath,
  sniffMime,
  validateAssetFile,
  validateCoverFile,
  validateDescription,
  validateTitle,
} from '../api/lib/productDraftValidation.ts'
import { normalizeWallet } from '../api/lib/productFoundation.ts'
import {
  createSellerSessionToken,
  signSellerSession,
  verifySellerSessionToken,
} from '../api/lib/sellerSession.ts'

const TEST_SECRET = 'test-secret-for-seller-session-only'
process.env.CROWDDROP_AUTH_SECRET = TEST_SECRET

assert.match(createChallengeNonce(), /^[0-9a-f]{64}$/)
assert.equal(challengeExpiresAtSeconds(1_700_000_000_000), 1_700_000_000 + 5 * 60)

assert.equal(normalizeWallet('0x1234567890123456789012345678901234567890'), '0x1234567890123456789012345678901234567890')
assert.throws(() => normalizeWallet('bad'), /Invalid wallet/)

assert.equal(validateTitle('  My Guide  ').ok, true)
assert.equal(validateTitle('').ok, false)
assert.equal(validateTitle('x'.repeat(81)).ok, false)
assert.equal(validateDescription('Hello world').ok, true)
assert.equal(validateDescription('').ok, false)

const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])
const pdfBuffer = Buffer.from('%PDF-1.4\n', 'utf8')

assert.equal(sniffMime(pngBuffer, 'cover.png'), 'image/png')
assert.equal(sniffMime(pdfBuffer, 'guide.pdf'), 'application/pdf')

const coverOk = validateCoverFile(pngBuffer, 'cover.png', 'image/png')
assert.equal(coverOk.ok, true)
assert.equal(validateCoverFile(pdfBuffer, 'bad.png', 'application/pdf').ok, false)

const assetOk = validateAssetFile(pdfBuffer, 'guide.pdf', 'application/pdf')
assert.equal(assetOk.ok, true)
assert.equal(assetOk.label, 'PDF')
assert.equal(validateAssetFile(Buffer.from('MZ'), 'virus.exe', 'application/octet-stream').ok, false)

const hashInput = Buffer.from('crowddrop-test-asset')
assert.equal(sha256Hex(hashInput), createHash('sha256').update(hashInput).digest('hex'))

const wallet = '0x1234567890123456789012345678901234567890'
assert.match(buildStoragePath('covers', wallet), /^covers\/0x1234567890123456789012345678901234567890\//)

const session = createSellerSessionToken(wallet, { nowSeconds: 1_700_000_000, env: process.env })
assert.equal(session.ok, true)
if (session.ok) {
  const verified = verifySellerSessionToken(session.token, { nowSeconds: 1_700_000_000, env: process.env })
  assert.equal(verified.ok, true)
  if (verified.ok) {
    assert.equal(verified.payload.wallet, wallet)
    assert.equal(verified.payload.action, SELLER_UPLOAD_ACTION)
  }

  const expired = verifySellerSessionToken(session.token, { nowSeconds: session.expiresAt + 1, env: process.env })
  assert.equal(expired.ok, false)

  const tampered = `${session.token}x`
  assert.equal(verifySellerSessionToken(tampered, { env: process.env }).ok, false)
}

const forgedPayload = {
  wallet,
  action: SELLER_UPLOAD_ACTION,
  iat: 1_700_000_000,
  exp: 1_700_000_000 + 1800,
}
const wrongSig = `${Buffer.from(JSON.stringify(forgedPayload)).toString('base64url')}.bad`
assert.equal(verifySellerSessionToken(wrongSig, { nowSeconds: 1_700_000_000, env: process.env }).ok, false)

const wrongActionToken = signSellerSession({
  wallet,
  action: 'auth_test' as typeof SELLER_UPLOAD_ACTION,
  iat: 1_700_000_000,
  exp: 1_700_000_000 + 1800,
}, TEST_SECRET)
assert.equal(verifySellerSessionToken(wrongActionToken, { nowSeconds: 1_700_000_000, env: process.env }).ok, false)

let consumeCalls = 0
const mockClient = {
  from(table: string) {
    assert.equal(table, 'auth_challenges')
    return {
      update(row: unknown) {
        assert.ok(row)
        return {
          eq(_col: string, nonce: string) {
            assert.match(nonce, /^[0-9a-f]+$/)
            return {
              is(_c: string, _v: null) {
                return {
                  select(_cols: string) {
                    return {
                      async maybeSingle() {
                        consumeCalls += 1
                        if (consumeCalls > 1)
                          return { data: null, error: null }
                        return {
                          data: {
                            wallet,
                            action: SELLER_UPLOAD_ACTION,
                            chain_id: 137,
                            contract_address: '0xcd9faa04f12b3bcf926359057e1ff445e7e75c12',
                            expires_at: new Date(Date.now() + 60_000).toISOString(),
                          },
                          error: null,
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
    }
  },
}

const { consumeAuthChallenge } = await import('../api/lib/authChallengeStore.ts')
const first = await consumeAuthChallenge(mockClient, {
  nonce: randomBytes(16).toString('hex'),
  wallet,
  action: SELLER_UPLOAD_ACTION,
})
assert.equal(first.ok, true)
const second = await consumeAuthChallenge(mockClient, {
  nonce: randomBytes(16).toString('hex'),
  wallet,
  action: SELLER_UPLOAD_ACTION,
})
assert.equal(second.ok, false)

console.log('seller-product-draft: 28 checks passed')
