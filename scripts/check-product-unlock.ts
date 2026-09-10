/**
 * Product unlock authorization + signed URL issuance (mocked chain / storage).
 */
import assert from 'node:assert/strict'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildProductDownloadTypedData,
  PRODUCT_DOWNLOAD_ACTION,
  toProviderTypedDataPayload,
  verifyCrowdDropAuthSignature,
} from '../src/signing/crowdDropAuthTypedData.ts'
import { ensureLeadingZeroAmount, formatTokenAmount } from '../src/tokenMath.ts'
import { DROP_STATUS } from '../server/crowdDropAbi.ts'
import {
  buyerEntitlementAllowed,
  unlockProductDownload,
  unlockProductWithBuyerSession,
} from '../server/productUnlock.ts'
import {
  BUYER_ACCESS_COOKIE_NAME,
  BUYER_ACCESS_SESSION_TTL_SECONDS,
  PRODUCT_DOWNLOAD_URL_TTL_SECONDS,
} from '../server/crowdDropConstants.ts'
import {
  buildBuyerAccessCookie,
  createBuyerAccessSessionToken,
  readBuyerAccessSessionFromCookie,
  verifyBuyerAccessSessionToken,
} from '../server/buyerAccessSession.ts'

process.env.CROWDDROP_AUTH_SECRET = 'test-secret-for-product-unlock-only'

const buyer = privateKeyToAccount(generatePrivateKey())
const seller = privateKeyToAccount(generatePrivateKey())
const other = privateKeyToAccount(generatePrivateKey())
const nowSeconds = 1_700_000_000
const dropId = 9n

// --- Leading zero formatting ---
{
  assert.equal(ensureLeadingZeroAmount('.00001'), '0.00001')
  assert.equal(ensureLeadingZeroAmount('0.00001'), '0.00001')
  assert.equal(formatTokenAmount(10n, 6), '0.00001')
  assert.doesNotMatch(formatTokenAmount(10n, 6), /^\./)
}

// --- Typed data binds dropId ---
{
  const typed = buildProductDownloadTypedData({
    wallet: buyer.address,
    dropId,
    nonce: 'ab'.repeat(32),
    expiresAt: nowSeconds + 300,
  })
  assert.equal(typed.message.action, PRODUCT_DOWNLOAD_ACTION)
  assert.equal(typed.message.dropId, dropId)
  const payload = toProviderTypedDataPayload(typed)
  assert.equal(payload.message.dropId, '9')
  assert.ok(payload.types.Auth.some(f => f.name === 'dropId'))

  const signature = await buyer.signTypedData({
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
  })
  const ok = await verifyCrowdDropAuthSignature(typed, signature, {
    expectedAction: PRODUCT_DOWNLOAD_ACTION,
    nowSeconds,
  })
  assert.equal(ok.ok, true)

  const wrongSigner = await verifyCrowdDropAuthSignature(typed, await other.signTypedData({
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: { ...typed.message, wallet: other.address },
  }), {
    expectedAction: PRODUCT_DOWNLOAD_ACTION,
    nowSeconds,
  })
  // recovered wallet won't match message.wallet after we keep buyer wallet in message
  const mismatched = await verifyCrowdDropAuthSignature(typed, await other.signTypedData({
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
  }), {
    expectedAction: PRODUCT_DOWNLOAD_ACTION,
    nowSeconds,
  })
  assert.equal(mismatched.ok, false)
  void wrongSigner
}

// --- Entitlement matrix ---
{
  assert.equal(buyerEntitlementAllowed({
    status: DROP_STATUS.Successful,
    deposit: 1n,
    seller: seller.address,
    wallet: buyer.address,
  }).ok, true)
  assert.equal(buyerEntitlementAllowed({
    status: DROP_STATUS.Claimed,
    deposit: 1n,
    seller: seller.address,
    wallet: buyer.address,
  }).ok, true)
  assert.equal(buyerEntitlementAllowed({
    status: DROP_STATUS.Active,
    deposit: 1n,
    seller: seller.address,
    wallet: buyer.address,
  }).ok, false)
  assert.equal(buyerEntitlementAllowed({
    status: DROP_STATUS.Expired,
    deposit: 1n,
    seller: seller.address,
    wallet: buyer.address,
  }).ok, false)
  assert.equal(buyerEntitlementAllowed({
    status: DROP_STATUS.Successful,
    deposit: 0n,
    seller: seller.address,
    wallet: buyer.address,
  }).ok, false)
  assert.equal(buyerEntitlementAllowed({
    status: DROP_STATUS.Successful,
    deposit: 1n,
    seller: seller.address,
    wallet: seller.address,
  }).ok, false)
}

type ChallengeRow = {
  nonce: string
  wallet: string
  action: string
  drop_id: number | null
  chain_id: number
  contract_address: string
  expires_at: string
  used_at: string | null
}

type ProductRow = {
  id: string
  title: string
  file_type_label: string | null
  asset_path: string
  seller_wallet: string
  drop_id: number
  status: string
  chain_id: number
  contract_address: string
}

function makeClient(state: {
  challenges: ChallengeRow[]
  products: ProductRow[]
  grants: Array<Record<string, unknown>>
}) {
  return {
    from(table: string) {
      if (table === 'auth_challenges') {
        return {
          update(patch: { used_at: string }) {
            const filters: Record<string, unknown> = {}
            const api = {
              eq(key: string, value: unknown) {
                filters[key] = value
                return api
              },
              is(key: string, value: null) {
                filters[`is:${key}`] = value
                return api
              },
              select() {
                return {
                  async maybeSingle() {
                    const row = state.challenges.find((c) => {
                      if (c.nonce !== filters.nonce)
                        return false
                      if (filters.wallet && c.wallet !== filters.wallet)
                        return false
                      if (filters.action && c.action !== filters.action)
                        return false
                      if (filters.drop_id !== undefined && Number(c.drop_id) !== Number(filters.drop_id))
                        return false
                      if (`is:used_at` in filters && c.used_at !== null)
                        return false
                      return true
                    })
                    if (!row)
                      return { data: null, error: null }
                    row.used_at = patch.used_at
                    return { data: { ...row }, error: null }
                  },
                }
              },
            }
            return api
          },
        }
      }
      if (table === 'products') {
        const filters: Record<string, unknown> = {}
        const api = {
          select() { return api },
          eq(key: string, value: unknown) {
            filters[key] = value
            return api
          },
          async maybeSingle() {
            const row = state.products.find(p =>
              (!filters.status || p.status === filters.status)
              && (!filters.chain_id || p.chain_id === filters.chain_id)
              && (!filters.contract_address || p.contract_address === filters.contract_address)
              && (!filters.drop_id || Number(p.drop_id) === Number(filters.drop_id)),
            )
            return { data: row ?? null, error: null }
          },
        }
        return api
      }
      if (table === 'download_grants') {
        return {
          async insert(row: Record<string, unknown>) {
            state.grants.push(row)
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from() {
        return {
          async createSignedUrl() {
            return { data: { signedUrl: 'https://example.com/signed' }, error: null }
          },
        }
      },
    },
  } as never
}

async function signedUnlock(params: {
  account: typeof buyer
  dropId: bigint
  nonce: string
  expiresAt?: number
}) {
  const typed = buildProductDownloadTypedData({
    wallet: params.account.address,
    dropId: params.dropId,
    nonce: params.nonce,
    expiresAt: params.expiresAt ?? nowSeconds + 300,
  })
  const signature = await params.account.signTypedData({
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
  })
  return { typedData: toProviderTypedDataPayload(typed), signature, typed }
}

const contribution = 1_000_000n
const product: ProductRow = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Guide',
  file_type_label: 'PDF',
  asset_path: 'assets/secret.pdf',
  seller_wallet: seller.address.toLowerCase(),
  drop_id: 9,
  status: 'locked',
  chain_id: 137,
  contract_address: '0xcd9faa04f12b3bcf926359057e1ff445e7e75c12',
}

function challenge(nonce: string, wallet: string, used = false): ChallengeRow {
  return {
    nonce,
    wallet: wallet.toLowerCase(),
    action: PRODUCT_DOWNLOAD_ACTION,
    drop_id: 9,
    chain_id: 137,
    contract_address: '0xcd9faa04f12b3bcf926359057e1ff445e7e75c12',
    expires_at: new Date((nowSeconds + 300) * 1000).toISOString(),
    used_at: used ? new Date(nowSeconds * 1000).toISOString() : null,
  }
}

const chainOk = {
  readStatus: async () => DROP_STATUS.Successful,
  readDeposit: async () => contribution,
  readDrop: async () => ({
    dropId,
    seller: seller.address as `0x${string}`,
    contribution,
    goal: 2n,
    deadline: 2_000_000_000n,
    buyerCount: 2n,
    escrowed: contribution * 2n,
    claimed: false,
  }),
  createSignedUrl: async () => 'https://example.com/dl?sig=1',
  nowMs: nowSeconds * 1000,
}

// Successful unlock
{
  const nonce = '11'.repeat(32)
  const state = { challenges: [challenge(nonce, buyer.address)], products: [product], grants: [] as Array<Record<string, unknown>> }
  const { typedData, signature } = await signedUnlock({ account: buyer, dropId, nonce })
  const result = await unlockProductDownload(makeClient(state), { typedData, signature }, chainOk)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.expiresIn, PRODUCT_DOWNLOAD_URL_TTL_SECONDS)
    assert.equal(result.expiresIn, 300)
    assert.equal(result.productTitle, 'Guide')
    assert.equal(JSON.stringify(result).includes('asset_path'), false)
    assert.equal(JSON.stringify(result).includes('secret.pdf'), false)
    assert.ok(result.buyerAccessToken)
    assert.equal(result.buyerAccessMaxAge, BUYER_ACCESS_SESSION_TTL_SECONDS)
    const session = verifyBuyerAccessSessionToken(result.buyerAccessToken, {
      nowSeconds,
      expectedDropId: 9,
    })
    assert.equal(session.ok, true)
    if (session.ok) {
      assert.equal(session.payload.wallet, buyer.address.toLowerCase())
      assert.equal(session.payload.dropId, 9)
      assert.equal(session.payload.chainId, 137)
      assert.equal(session.payload.action, PRODUCT_DOWNLOAD_ACTION)
    }
  }
  assert.equal(state.grants.length, 1)
  assert.equal(state.challenges[0]!.used_at !== null, true)
}

// Session mode: refresh without signature
{
  const session = createBuyerAccessSessionToken(
    { wallet: buyer.address, dropId: 9 },
    { nowSeconds },
  )
  assert.equal(session.ok, true)
  if (!session.ok)
    throw new Error('session required')
  const cookie = buildBuyerAccessCookie(session.token)
  assert.match(cookie, new RegExp(`^${BUYER_ACCESS_COOKIE_NAME}=`))
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /Path=\//)
  assert.doesNotMatch(cookie, /localStorage/)

  const state = { challenges: [] as ChallengeRow[], products: [product], grants: [] as Array<Record<string, unknown>> }
  const restored = await unlockProductWithBuyerSession(
    makeClient(state),
    { dropId: 9, cookieHeader: cookie, connectedWallet: buyer.address },
    chainOk,
  )
  assert.equal(restored.ok, true)
  if (restored.ok) {
    assert.equal(restored.expiresIn, 300)
    assert.equal(JSON.stringify(restored).includes('asset_path'), false)
  }
  assert.equal(state.grants.length, 1)

  // Claimed still works via session
  const claimed = await unlockProductWithBuyerSession(
    makeClient({ challenges: [], products: [product], grants: [] }),
    { dropId: 9, cookieHeader: cookie, connectedWallet: buyer.address },
    {
      ...chainOk,
      readStatus: async () => DROP_STATUS.Claimed,
      readDrop: async () => ({
        dropId,
        seller: seller.address as `0x${string}`,
        contribution,
        goal: 2n,
        deadline: 2_000_000_000n,
        buyerCount: 2n,
        escrowed: 0n,
        claimed: true,
      }),
    },
  )
  assert.equal(claimed.ok, true)

  // Drop B rejected with Drop A session
  const wrongDrop = await unlockProductWithBuyerSession(
    makeClient({ challenges: [], products: [{ ...product, drop_id: 10 }], grants: [] }),
    { dropId: 10, cookieHeader: cookie, connectedWallet: buyer.address },
    chainOk,
  )
  assert.equal(wrongDrop.ok, false)
  if (wrongDrop.ok === false)
    assert.equal(wrongDrop.reason, 'buyer_auth_required')

  // Connected wallet mismatch
  const mismatch = await unlockProductWithBuyerSession(
    makeClient({ challenges: [], products: [product], grants: [] }),
    { dropId: 9, cookieHeader: cookie, connectedWallet: other.address },
    chainOk,
  )
  assert.equal(mismatch.ok, false)
  if (mismatch.ok === false)
    assert.equal(mismatch.reason, 'buyer_auth_required')

  // Expired session
  const expiredToken = createBuyerAccessSessionToken(
    { wallet: buyer.address, dropId: 9 },
    { nowSeconds: nowSeconds - BUYER_ACCESS_SESSION_TTL_SECONDS - 10 },
  )
  assert.equal(expiredToken.ok, true)
  if (expiredToken.ok) {
    const expired = await unlockProductWithBuyerSession(
      makeClient({ challenges: [], products: [product], grants: [] }),
      { dropId: 9, cookieHeader: buildBuyerAccessCookie(expiredToken.token), connectedWallet: buyer.address },
      { ...chainOk, nowMs: nowSeconds * 1000 },
    )
    assert.equal(expired.ok, false)
    if (expired.ok === false)
      assert.equal(expired.reason, 'buyer_auth_required')
  }

  // Missing cookie
  const missing = await unlockProductWithBuyerSession(
    makeClient({ challenges: [], products: [product], grants: [] }),
    { dropId: 9, cookieHeader: '', connectedWallet: buyer.address },
    chainOk,
  )
  assert.equal(missing.ok, false)
  if (missing.ok === false)
    assert.equal(missing.reason, 'buyer_auth_required')

  // Seller wallet session still fails entitlement (deposit path)
  const sellerSession = createBuyerAccessSessionToken(
    { wallet: seller.address, dropId: 9 },
    { nowSeconds },
  )
  assert.equal(sellerSession.ok, true)
  if (sellerSession.ok) {
    const sellerUnlock = await unlockProductWithBuyerSession(
      makeClient({ challenges: [], products: [product], grants: [] }),
      {
        dropId: 9,
        cookieHeader: buildBuyerAccessCookie(sellerSession.token),
        connectedWallet: seller.address,
      },
      {
        ...chainOk,
        readDeposit: async () => contribution,
      },
    )
    assert.equal(sellerUnlock.ok, false)
  }

  // deposit 0 rejected
  const zeroDeposit = await unlockProductWithBuyerSession(
    makeClient({ challenges: [], products: [product], grants: [] }),
    { dropId: 9, cookieHeader: cookie, connectedWallet: buyer.address },
    { ...chainOk, readDeposit: async () => 0n },
  )
  assert.equal(zeroDeposit.ok, false)

  const parsed = readBuyerAccessSessionFromCookie(cookie, { nowSeconds, expectedDropId: 9 })
  assert.equal(parsed.ok, true)
}

// Nonce reused rejected
{
  const nonce = '22'.repeat(32)
  const state = { challenges: [challenge(nonce, buyer.address)], products: [product], grants: [] as Array<Record<string, unknown>> }
  const first = await signedUnlock({ account: buyer, dropId, nonce })
  const ok1 = await unlockProductDownload(makeClient(state), first, chainOk)
  assert.equal(ok1.ok, true)
  const ok2 = await unlockProductDownload(makeClient(state), first, chainOk)
  assert.equal(ok2.ok, false)
}

// Expired nonce rejected
{
  const nonce = '33'.repeat(32)
  const state = {
    challenges: [{
      ...challenge(nonce, buyer.address),
      expires_at: new Date((nowSeconds - 10) * 1000).toISOString(),
    }],
    products: [product],
    grants: [] as Array<Record<string, unknown>>,
  }
  const signed = await signedUnlock({ account: buyer, dropId, nonce, expiresAt: nowSeconds + 300 })
  // Signature message not expired, but DB challenge is — consume checks DB expiry
  const result = await unlockProductDownload(makeClient(state), signed, chainOk)
  assert.equal(result.ok, false)
}

// Wrong Drop signature / challenge mismatch
{
  const nonce = '44'.repeat(32)
  const state = { challenges: [challenge(nonce, buyer.address)], products: [product], grants: [] as Array<Record<string, unknown>> }
  const signedOtherDrop = await signedUnlock({ account: buyer, dropId: 99n, nonce })
  const result = await unlockProductDownload(makeClient(state), signedOtherDrop, {
    ...chainOk,
    readDrop: async () => ({
      dropId: 99n,
      seller: seller.address as `0x${string}`,
      contribution,
      goal: 2n,
      deadline: 2_000_000_000n,
      buyerCount: 2n,
      escrowed: contribution * 2n,
      claimed: false,
    }),
  })
  assert.equal(result.ok, false)
}

// Active rejected
{
  const nonce = '55'.repeat(32)
  const state = { challenges: [challenge(nonce, buyer.address)], products: [product], grants: [] as Array<Record<string, unknown>> }
  const signed = await signedUnlock({ account: buyer, dropId, nonce })
  const result = await unlockProductDownload(makeClient(state), signed, {
    ...chainOk,
    readStatus: async () => DROP_STATUS.Active,
  })
  assert.equal(result.ok, false)
  if (result.ok === false)
    assert.match(result.reason, /not successful/i)
}

// Expired Drop rejected
{
  const nonce = '66'.repeat(32)
  const state = { challenges: [challenge(nonce, buyer.address)], products: [product], grants: [] as Array<Record<string, unknown>> }
  const signed = await signedUnlock({ account: buyer, dropId, nonce })
  const result = await unlockProductDownload(makeClient(state), signed, {
    ...chainOk,
    readStatus: async () => DROP_STATUS.Expired,
  })
  assert.equal(result.ok, false)
}

// Claimed + deposit accepted
{
  const nonce = '77'.repeat(32)
  const state = { challenges: [challenge(nonce, buyer.address)], products: [product], grants: [] as Array<Record<string, unknown>> }
  const signed = await signedUnlock({ account: buyer, dropId, nonce })
  const result = await unlockProductDownload(makeClient(state), signed, {
    ...chainOk,
    readStatus: async () => DROP_STATUS.Claimed,
    readDrop: async () => ({
      dropId,
      seller: seller.address as `0x${string}`,
      contribution,
      goal: 2n,
      deadline: 2_000_000_000n,
      buyerCount: 2n,
      escrowed: 0n,
      claimed: true,
    }),
  })
  assert.equal(result.ok, true)
}

// Seller rejected
{
  const nonce = '88'.repeat(32)
  const state = { challenges: [challenge(nonce, seller.address)], products: [product], grants: [] as Array<Record<string, unknown>> }
  const signed = await signedUnlock({ account: seller, dropId, nonce })
  const result = await unlockProductDownload(makeClient(state), signed, chainOk)
  assert.equal(result.ok, false)
}

// Non-participant / withdrawn deposit=0 rejected
{
  const nonce = '99'.repeat(32)
  const state = { challenges: [challenge(nonce, buyer.address)], products: [product], grants: [] as Array<Record<string, unknown>> }
  const signed = await signedUnlock({ account: buyer, dropId, nonce })
  const result = await unlockProductDownload(makeClient(state), signed, {
    ...chainOk,
    readDeposit: async () => 0n,
  })
  assert.equal(result.ok, false)
}

// Locked product required
{
  const nonce = 'aa'.repeat(32)
  const state = { challenges: [challenge(nonce, buyer.address)], products: [], grants: [] as Array<Record<string, unknown>> }
  const signed = await signedUnlock({ account: buyer, dropId, nonce })
  const result = await unlockProductDownload(makeClient(state), signed, chainOk)
  assert.equal(result.ok, false)
  if (result.ok === false)
    assert.equal(result.status, 404)
}

// Audit failure does not block download
{
  const nonce = 'bb'.repeat(32)
  const state = { challenges: [challenge(nonce, buyer.address)], products: [product], grants: [] as Array<Record<string, unknown>> }
  const client = makeClient(state)
  client.from = ((table: string) => {
    if (table === 'download_grants') {
      return {
        async insert() {
          return { error: { message: 'audit_down' } }
        },
      }
    }
    return (makeClient(state) as { from: (t: string) => unknown }).from(table)
  }) as typeof client.from
  const signed = await signedUnlock({ account: buyer, dropId, nonce })
  const result = await unlockProductDownload(client, signed, chainOk)
  assert.equal(result.ok, true)
}

// Challenge API requires dropId for product_download (source check)
{
  const challengeSrc = readFileSync(join('api', 'auth', 'challenge.ts'), 'utf8')
  assert.match(challengeSrc, /PRODUCT_DOWNLOAD_ACTION/)
  assert.match(challengeSrc, /dropId is required/)
}

// UI + privacy invariants
{
  const viewSrc = readFileSync(join('src', 'CrowdDropView.vue'), 'utf8')
  assert.match(viewSrc, /Unlock Product/)
  assert.match(viewSrc, /Download Product/)
  assert.match(viewSrc, /Unlock cancelled/)
  assert.match(viewSrc, /Available to participating buyers/)
  assert.match(viewSrc, /Your product unlocks when the Drop reaches its goal/)
  assert.match(viewSrc, /restoreProductUnlock|quietRestoreBuyerAccess|tryRestoreBuyerAccess/)
  assert.match(viewSrc, /buyerAccessReady/)
  assert.doesNotMatch(viewSrc, /asset_path/)
  assert.doesNotMatch(viewSrc, /SUPABASE_SERVICE_ROLE/)
  assert.doesNotMatch(viewSrc, /localStorage.*downloadUrl|sessionStorage.*downloadUrl/)

  const clientSrc = readFileSync(join('src', 'products', 'unlockClient.ts'), 'utf8')
  assert.match(clientSrc, /credentials: 'include'/)
  assert.match(clientSrc, /restoreProductUnlock/)
  assert.match(clientSrc, /buyer_auth_required/)
  assert.doesNotMatch(clientSrc, /localStorage/)

  const unlockApi = readFileSync(join('api', 'products', 'unlock.ts'), 'utf8')
  assert.match(unlockApi, /unlockProductWithBuyerSession/)
  assert.match(unlockApi, /buildBuyerAccessCookie/)
  assert.match(unlockApi, /Set-Cookie/)

  const createSrc = readFileSync(join('src', 'CrowdDropCreate.vue'), 'utf8')
  assert.match(createSrc, /contributionDisplay|ensureLeadingZeroAmount/)

  const apiFiles = readdirSync(join('api', 'products')).filter(n => n.endsWith('.ts')).sort()
  assert.deepEqual(apiFiles, [
    'by-drop.ts',
    'cleanup-expired-uploads.ts',
    'complete-upload.ts',
    'draft.ts',
    'finalize.ts',
    'unlock.ts',
    'upload-intent.ts',
  ])

  const foundation = readFileSync(join('supabase', 'migrations', '001_digital_products_foundation.sql'), 'utf8')
  assert.match(foundation, /download_grants/)
  assert.match(foundation, /product-assets', false|product-assets private|no public read/i)
}

console.log('product-unlock: checks passed')
