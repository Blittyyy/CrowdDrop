/**
 * Supabase foundation checks (no live Supabase required for most tests).
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertLockedProductIdentity,
  isNormalizedContractAddress,
  isNormalizedWallet,
  isValidAuthChallengeAction,
  isValidProductStatus,
  normalizeContractAddress,
  normalizeWallet,
  PRODUCT_ASSET_BUCKET,
  PRODUCT_COVER_BUCKET,
} from '../api/lib/productFoundation.ts'
import {
  FORBIDDEN_CLIENT_ENV_KEYS,
  readSupabaseEnv,
  SUPABASE_SERVICE_ROLE_KEY_ENV,
  SUPABASE_URL_ENV,
} from '../api/lib/supabaseEnv.ts'

const TEST_WALLET = '0x1234567890123456789012345678901234567890'
assert.equal(normalizeWallet(TEST_WALLET), TEST_WALLET)
assert.equal(normalizeContractAddress('0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12'), '0xcd9faa04f12b3bcf926359057e1ff445e7e75c12')
assert.throws(() => normalizeWallet('not-an-address'), /Invalid wallet/)

assert.equal(isValidProductStatus('draft'), true)
assert.equal(isValidProductStatus('locked'), true)
assert.equal(isValidProductStatus('published'), false)

assert.equal(isValidAuthChallengeAction('seller_upload'), true)
assert.equal(isValidAuthChallengeAction('product_download'), true)
assert.equal(isValidAuthChallengeAction('auth_test'), true)
assert.equal(isValidAuthChallengeAction('admin'), false)

const NORMALIZED_WALLET = '0x1234567890123456789012345678901234567890'
const MIXED_CASE_WALLET = '0x123456789012345678901234567890123456789A'

assert.equal(isNormalizedWallet(NORMALIZED_WALLET), true)
assert.equal(isNormalizedWallet(MIXED_CASE_WALLET), false)
assert.equal(isNormalizedContractAddress('0xcd9faa04f12b3bcf926359057e1ff445e7e75c12'), true)

assert.doesNotThrow(() => assertLockedProductIdentity({
  chainId: 137n,
  contractAddress: '0xcd9faa04f12b3bcf926359057e1ff445e7e75c12',
  dropId: 5n,
}))
assert.throws(() => assertLockedProductIdentity({
  chainId: null,
  contractAddress: '0xcd9faa04f12b3bcf926359057e1ff445e7e75c12',
  dropId: 5n,
}), /chain_id/)
assert.throws(() => assertLockedProductIdentity({
  chainId: 137n,
  contractAddress: '0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12',
  dropId: 5n,
}), /lowercase/)

const missingAll = readSupabaseEnv({})
assert.equal(missingAll.ok, false)
if (!missingAll.ok) {
  assert.deepEqual(missingAll.missing, [SUPABASE_URL_ENV, SUPABASE_SERVICE_ROLE_KEY_ENV])
  assert.equal(missingAll.error, 'supabase_not_configured')
}

const partial = readSupabaseEnv({
  [SUPABASE_URL_ENV]: 'https://example.supabase.co',
})
assert.equal(partial.ok, false)
if (!partial.ok)
  assert.deepEqual(partial.missing, [SUPABASE_SERVICE_ROLE_KEY_ENV])

const configured = readSupabaseEnv({
  [SUPABASE_URL_ENV]: 'https://example.supabase.co',
  [SUPABASE_SERVICE_ROLE_KEY_ENV]: 'test-service-role-key',
})
assert.equal(configured.ok, true)

const repoRoot = join(import.meta.dirname, '..')
const srcFiles = walkFiles(join(repoRoot, 'src'))
for (const file of srcFiles) {
  const text = readFileSync(file, 'utf8')
  for (const forbidden of FORBIDDEN_CLIENT_ENV_KEYS) {
    assert.equal(text.includes(forbidden), false, `${file} must not reference ${forbidden}`)
  }
  assert.equal(text.includes('@supabase/supabase-js'), false, `${file} must not import Supabase client`)
  assert.equal(text.includes('api/lib/supabase'), false, `${file} must not import server Supabase utilities`)
}

const migration = readFileSync(
  join(repoRoot, 'supabase/migrations/001_digital_products_foundation.sql'),
  'utf8',
)
assert.match(migration, /CREATE TABLE IF NOT EXISTS products/)
assert.match(migration, /CREATE TABLE IF NOT EXISTS auth_challenges/)
assert.match(migration, /CREATE TABLE IF NOT EXISTS download_grants/)
assert.match(migration, /product-covers/)
assert.match(migration, /product-assets/)
assert.match(migration, /ENABLE ROW LEVEL SECURITY/)

assert.equal(PRODUCT_COVER_BUCKET, 'product-covers')
assert.equal(PRODUCT_ASSET_BUCKET, 'product-assets')

const distAssets = join(repoRoot, 'dist/assets')
if (existsSync(distAssets)) {
  for (const file of readdirSync(distAssets)) {
    if (!file.endsWith('.js'))
      continue
    const bundle = readFileSync(join(distAssets, file), 'utf8')
    for (const forbidden of FORBIDDEN_CLIENT_ENV_KEYS) {
      assert.equal(bundle.includes(forbidden), false, `dist bundle must not contain ${forbidden}`)
    }
    assert.equal(bundle.includes('service_role'), false, 'dist bundle must not contain service_role')
  }
}

console.log('supabase-foundation: 32 checks passed')

function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory())
      out.push(...walkFiles(path))
    else if (/\.(vue|ts|tsx|js|jsx)$/.test(entry.name))
      out.push(path)
  }
  return out
}
