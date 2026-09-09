/**
 * Direct-to-Supabase upload intent + quota/cleanup tests (no live Supabase required).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  ASSET_MAX_BYTES,
  COVER_MAX_BYTES,
  MAX_ACTIVE_UPLOAD_INTENTS_PER_WALLET,
  MAX_ASSET_BYTES,
  MAX_COVER_BYTES,
  MAX_UPLOAD_INTENTS_PER_IP_PER_HOUR,
  MAX_UPLOAD_INTENTS_PER_WALLET_PER_HOUR,
  UPLOAD_INTENT_TTL_MINUTES,
  UPLOAD_INTENT_TTL_SECONDS,
} from '../server/crowdDropConstants.ts'
import {
  validateAssetMetadata,
  validateAssetSha256,
  validateCoverMetadata,
} from '../server/productDraftValidation.ts'
import {
  buildObjectPath,
  cleanupExpiredUploadIntents,
  completeUploadIntent,
  countActiveUploadIntents,
  createUploadIntent,
  extractClientIp,
  hashClientIp,
  uploadIntentExpiresAt,
} from '../server/productUploadIntent.ts'

process.env.CROWDDROP_AUTH_SECRET = 'test-secret-for-direct-upload-only'

const seller = '0x1111111111111111111111111111111111111111'
const assetSha = createHash('sha256').update('guide-bytes').digest('hex')

assert.equal(MAX_COVER_BYTES, COVER_MAX_BYTES)
assert.equal(MAX_ASSET_BYTES, ASSET_MAX_BYTES)
assert.equal(MAX_ASSET_BYTES, 25 * 1024 * 1024)
assert.equal(MAX_COVER_BYTES, 2 * 1024 * 1024)
assert.equal(UPLOAD_INTENT_TTL_MINUTES, 60)
assert.equal(UPLOAD_INTENT_TTL_SECONDS, 60 * 60)
assert.equal(MAX_ACTIVE_UPLOAD_INTENTS_PER_WALLET, 3)
assert.equal(MAX_UPLOAD_INTENTS_PER_WALLET_PER_HOUR, 5)
assert.equal(MAX_UPLOAD_INTENTS_PER_IP_PER_HOUR, 10)

assert.equal(validateCoverMetadata('cover.png', MAX_COVER_BYTES, 'image/png').ok, true)
assert.equal(validateCoverMetadata('cover.png', MAX_COVER_BYTES + 1, 'image/png').ok, false)
assert.equal(validateAssetMetadata('guide.pdf', MAX_ASSET_BYTES, 'application/pdf').ok, true)
assert.equal(validateAssetMetadata('guide.pdf', MAX_ASSET_BYTES + 1, 'application/pdf').ok, false)
assert.equal(validateAssetSha256(assetSha).ok, true)

const expires = uploadIntentExpiresAt(1_700_000_000_000)
assert.equal(expires.getTime(), 1_700_000_000_000 + UPLOAD_INTENT_TTL_SECONDS * 1000)

const coverPath = buildObjectPath('covers', seller, 'image/png', 'cover.png')
assert.match(coverPath, new RegExp(`^covers/${seller}/[0-9a-f-]{36}\\.png$`))
assert.equal(coverPath.includes('cover.png'), false)

assert.equal(extractClientIp({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }), '1.2.3.4')
assert.equal(extractClientIp({ 'x-real-ip': '5.6.7.8' }), '5.6.7.8')
const ipHash = hashClientIp('1.2.3.4', process.env.CROWDDROP_AUTH_SECRET)
assert.match(ipHash!, /^[a-f0-9]{64}$/)
assert.equal(hashClientIp('1.2.3.4', process.env.CROWDDROP_AUTH_SECRET), ipHash)
assert.equal(hashClientIp(null, process.env.CROWDDROP_AUTH_SECRET), null)

type IntentRow = {
  id: string
  seller_wallet: string
  created_at: string
  expires_at: string
  completed_at: string | null
  cleaned_at: string | null
  ip_hash: string | null
  cover_path?: string
  asset_path?: string
  title?: string
  description?: string
  cover_expected_mime?: string
  cover_expected_size?: number
  asset_expected_mime?: string
  asset_expected_size?: number
  asset_original_name?: string | null
  asset_expected_sha256?: string
  file_type_label?: string
}

function makeQuotaClient(options: {
  intents?: IntentRow[]
  coverObjects?: Array<{ name: string, metadata: { size: number, mimetype: string } }>
  assetObjects?: Array<{ name: string, metadata: { size: number, mimetype: string } }>
  productPaths?: Set<string>
}) {
  const intents = options.intents ? [...options.intents] : []
  const removedCovers: string[] = []
  const removedAssets: string[] = []
  let nextId = intents.length + 1
  let signedCalls = 0

  const client = {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUploadUrl(path: string) {
            signedCalls += 1
            return {
              data: {
                path,
                token: `tok-${bucket}`,
                signedUrl: `https://example.test/upload/${bucket}/${path}?token=tok`,
              },
              error: null,
            }
          },
          async list(_folder: string, opts: { search?: string }) {
            const search = opts.search ?? ''
            const list = bucket === 'product-covers'
              ? (options.coverObjects ?? [])
              : (options.assetObjects ?? [])
            return { data: list.filter(item => item.name === search), error: null }
          },
          async remove(paths: string[]) {
            for (const path of paths) {
              if (options.productPaths?.has(path))
                throw new Error('must not delete completed product path')
              if (bucket === 'product-covers')
                removedCovers.push(path)
              else
                removedAssets.push(path)
            }
            return { data: paths, error: null }
          },
          async createSignedUrl() {
            return { data: null, error: { message: 'unused' } }
          },
        }
      },
    },
    from(table: string) {
      if (table !== 'product_upload_intents' && table !== 'products')
        throw new Error(`unexpected table ${table}`)

      if (table === 'products') {
        return {
          insert() {
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: 'draft-1' }, error: null }
                  },
                }
              },
            }
          },
        }
      }

      return {
        select(_cols?: string, opts?: { count?: string, head?: boolean }) {
          const filters: Array<(row: IntentRow) => boolean> = []
          const api = {
            eq(col: string, value: string) {
              filters.push(row => String((row as Record<string, unknown>)[col]) === value)
              return api
            },
            is(col: string, value: null) {
              filters.push(row => (row as Record<string, unknown>)[col] == null)
              return api
            },
            gt(col: string, value: string) {
              filters.push(row => String((row as Record<string, unknown>)[col]) > value)
              return api
            },
            gte(col: string, value: string) {
              filters.push(row => String((row as Record<string, unknown>)[col]) >= value)
              return api
            },
            lt(col: string, value: string) {
              filters.push(row => String((row as Record<string, unknown>)[col]) < value)
              return api
            },
            limit(_n: number) {
              return {
                then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
                  const data = intents.filter(row => filters.every(fn => fn(row)))
                  return Promise.resolve({ data, error: null }).then(resolve, reject)
                },
              }
            },
            maybeSingle() {
              const data = intents.filter(row => filters.every(fn => fn(row)))[0] ?? null
              return Promise.resolve({ data, error: null })
            },
            then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
              const matched = intents.filter(row => filters.every(fn => fn(row)))
              if (opts?.count === 'exact' && opts.head) {
                return Promise.resolve({ count: matched.length, error: null }).then(resolve, reject)
              }
              return Promise.resolve({ data: matched, error: null }).then(resolve, reject)
            },
          }
          return api
        },
        insert(row: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  const id = `intent-${nextId++}`
                  intents.push({
                    id,
                    seller_wallet: String(row.seller_wallet),
                    created_at: new Date().toISOString(),
                    expires_at: String(row.expires_at),
                    completed_at: null,
                    cleaned_at: null,
                    ip_hash: (row.ip_hash as string | null) ?? null,
                    cover_path: String(row.cover_path),
                    asset_path: String(row.asset_path),
                    title: String(row.title),
                    description: String(row.description),
                    cover_expected_mime: String(row.cover_expected_mime),
                    cover_expected_size: Number(row.cover_expected_size),
                    asset_expected_mime: String(row.asset_expected_mime),
                    asset_expected_size: Number(row.asset_expected_size),
                    asset_original_name: (row.asset_original_name as string | null) ?? null,
                    asset_expected_sha256: String(row.asset_expected_sha256),
                    file_type_label: String(row.file_type_label),
                  })
                  return { data: { id }, error: null }
                },
              }
            },
          }
        },
        update(patch: Record<string, unknown>) {
          const filters: Array<(row: IntentRow) => boolean> = []
          const api = {
            eq(col: string, value: string) {
              filters.push(row => String((row as Record<string, unknown>)[col]) === value)
              return api
            },
            is(col: string, value: null) {
              filters.push(row => (row as Record<string, unknown>)[col] == null)
              return api
            },
            select() {
              return {
                async maybeSingle() {
                  const row = intents.find(item => filters.every(fn => fn(item)))
                  if (!row)
                    return { data: null, error: null }
                  Object.assign(row, patch)
                  return { data: { id: row.id }, error: null }
                },
              }
            },
            then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
              const row = intents.find(item => filters.every(fn => fn(item)))
              if (row)
                Object.assign(row, patch)
              return Promise.resolve({ data: row ? { id: row.id } : null, error: null }).then(resolve, reject)
            },
          }
          return api
        },
        delete() {
          return {
            eq() {
              return {
                is() {
                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        },
      }
    },
  }

  return { client: client as never, intents, removedCovers, removedAssets, getSignedCalls: () => signedCalls }
}

{
  const now = Date.now()
  const { client } = makeQuotaClient({
    intents: [
      {
        id: 'a1',
        seller_wallet: seller,
        created_at: new Date(now - 1000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
        completed_at: null,
        cleaned_at: null,
        ip_hash: null,
      },
      {
        id: 'a2',
        seller_wallet: seller,
        created_at: new Date(now - 1000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
        completed_at: null,
        cleaned_at: null,
        ip_hash: null,
      },
      {
        id: 'a3',
        seller_wallet: seller,
        created_at: new Date(now - 1000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
        completed_at: null,
        cleaned_at: null,
        ip_hash: null,
      },
      {
        id: 'expired',
        seller_wallet: seller,
        created_at: new Date(now - 10_000).toISOString(),
        expires_at: new Date(now - 1000).toISOString(),
        completed_at: null,
        cleaned_at: null,
        ip_hash: null,
      },
      {
        id: 'done',
        seller_wallet: seller,
        created_at: new Date(now - 1000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
        completed_at: new Date(now).toISOString(),
        cleaned_at: null,
        ip_hash: null,
      },
    ],
  })
  assert.equal(await countActiveUploadIntents(client, seller, now), 3)

  const blocked = await createUploadIntent(client, {
    sellerWallet: seller,
    title: 'Guide',
    description: 'Desc',
    cover: { name: 'cover.png', size: 1000, type: 'image/png' },
    asset: { name: 'guide.pdf', size: 2000, type: 'application/pdf' },
    assetSha256: assetSha,
    nowMs: now,
  })
  assert.equal(blocked.ok, false)
  if (blocked.ok === false) {
    assert.equal(blocked.code, 'too_many_active_uploads')
    assert.equal(blocked.status, 429)
  }
}

{
  const now = Date.now()
  const intents: IntentRow[] = []
  for (let i = 0; i < 5; i += 1) {
    intents.push({
      id: `h${i}`,
      seller_wallet: seller,
      created_at: new Date(now - i * 1000).toISOString(),
      expires_at: new Date(now - 1000).toISOString(),
      completed_at: new Date(now - i * 1000).toISOString(),
      cleaned_at: null,
      ip_hash: null,
    })
  }
  const { client, getSignedCalls } = makeQuotaClient({ intents })
  const limited = await createUploadIntent(client, {
    sellerWallet: seller,
    title: 'Guide',
    description: 'Desc',
    cover: { name: 'cover.png', size: 1000, type: 'image/png' },
    asset: { name: 'guide.pdf', size: 2000, type: 'application/pdf' },
    assetSha256: assetSha,
    nowMs: now,
  })
  assert.equal(limited.ok, false)
  if (limited.ok === false)
    assert.equal(limited.code, 'upload_rate_limited')
  assert.equal(getSignedCalls(), 0)

  // After window rolls past oldest creations, allow again.
  const later = now + 60 * 60 * 1000 + 1
  const okLater = await createUploadIntent(client, {
    sellerWallet: seller,
    title: 'Guide',
    description: 'Desc',
    cover: { name: 'cover.png', size: 1000, type: 'image/png' },
    asset: { name: 'guide.pdf', size: 2000, type: 'application/pdf' },
    assetSha256: assetSha,
    nowMs: later,
  })
  assert.equal(okLater.ok, true)
}

{
  const now = Date.now()
  const hash = hashClientIp('9.9.9.9', process.env.CROWDDROP_AUTH_SECRET)!
  const intents: IntentRow[] = []
  for (let i = 0; i < 10; i += 1) {
    intents.push({
      id: `ip${i}`,
      seller_wallet: `0x${String(i).padStart(40, '2')}`,
      created_at: new Date(now - i * 1000).toISOString(),
      expires_at: new Date(now - 1000).toISOString(),
      completed_at: new Date(now).toISOString(),
      cleaned_at: null,
      ip_hash: hash,
    })
  }
  const { client, getSignedCalls } = makeQuotaClient({ intents })
  const limited = await createUploadIntent(client, {
    sellerWallet: seller,
    title: 'Guide',
    description: 'Desc',
    cover: { name: 'cover.png', size: 1000, type: 'image/png' },
    asset: { name: 'guide.pdf', size: 2000, type: 'application/pdf' },
    assetSha256: assetSha,
    ipHash: hash,
    nowMs: now,
  })
  assert.equal(limited.ok, false)
  if (limited.ok === false)
    assert.equal(limited.code, 'upload_rate_limited')
  assert.equal(getSignedCalls(), 0)
}

{
  const { client, getSignedCalls } = makeQuotaClient({})
  const oversized = await createUploadIntent(client, {
    sellerWallet: seller,
    title: 'Guide',
    description: 'Desc',
    cover: { name: 'cover.png', size: 1000, type: 'image/png' },
    asset: { name: 'guide.pdf', size: MAX_ASSET_BYTES + 1, type: 'application/pdf' },
    assetSha256: assetSha,
  })
  assert.equal(oversized.ok, false)
  assert.equal(getSignedCalls(), 0)
}

{
  const now = Date.now()
  const coverName = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png'
  const assetName = 'ffffffff-1111-2222-3333-444444444444.pdf'
  const coverPath = `covers/${seller}/${coverName}`
  const assetPath = `assets/${seller}/${assetName}`
  const { client, removedCovers, removedAssets, intents } = makeQuotaClient({
    intents: [
      {
        id: 'orphan-1',
        seller_wallet: seller,
        created_at: new Date(now - 10_000).toISOString(),
        expires_at: new Date(now - 1000).toISOString(),
        completed_at: null,
        cleaned_at: null,
        ip_hash: null,
        cover_path: coverPath,
        asset_path: assetPath,
      },
      {
        id: 'completed-1',
        seller_wallet: seller,
        created_at: new Date(now - 10_000).toISOString(),
        expires_at: new Date(now - 1000).toISOString(),
        completed_at: new Date(now - 5000).toISOString(),
        cleaned_at: null,
        ip_hash: null,
        cover_path: `covers/${seller}/keep-cover.png`,
        asset_path: `assets/${seller}/keep-asset.pdf`,
      },
    ],
    productPaths: new Set([`covers/${seller}/keep-cover.png`, `assets/${seller}/keep-asset.pdf`]),
  })

  const first = await cleanupExpiredUploadIntents(client, { nowMs: now })
  assert.equal(first.cleaned, 1)
  assert.equal(removedCovers.includes(coverPath), true)
  assert.equal(removedAssets.includes(assetPath), true)
  assert.equal(intents.find(row => row.id === 'completed-1')?.cleaned_at, null)
  assert.ok(intents.find(row => row.id === 'orphan-1')?.cleaned_at)

  const second = await cleanupExpiredUploadIntents(client, { nowMs: now })
  assert.equal(second.cleaned, 0)
}

{
  const coverName = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png'
  const assetName = 'ffffffff-1111-2222-3333-444444444444.pdf'
  const now = Date.now()
  const { client } = makeQuotaClient({
    coverObjects: [{ name: coverName, metadata: { size: 1200, mimetype: 'image/png' } }],
    assetObjects: [{ name: assetName, metadata: { size: 4096, mimetype: 'application/pdf' } }],
    intents: [{
      id: 'intent-exp',
      seller_wallet: seller,
      created_at: new Date(now - 10_000).toISOString(),
      expires_at: new Date(now - 1).toISOString(),
      completed_at: null,
      cleaned_at: null,
      ip_hash: null,
      cover_path: `covers/${seller}/${coverName}`,
      asset_path: `assets/${seller}/${assetName}`,
      title: 'Guide',
      description: 'Desc',
      cover_expected_mime: 'image/png',
      cover_expected_size: 1200,
      asset_expected_mime: 'application/pdf',
      asset_expected_size: 4096,
      asset_expected_sha256: assetSha,
      file_type_label: 'PDF',
    }],
  })
  const expired = await completeUploadIntent(client, {
    uploadIntentId: 'intent-exp',
    sellerWallet: seller,
    nowMs: now,
  })
  assert.equal(expired.ok, false)
  if (expired.ok === false)
    assert.match(expired.reason, /expired/i)
}

// Legacy production guard: multipart draft must not be available as a production bypass.
{
  const prev = process.env.VERCEL_ENV
  process.env.VERCEL_ENV = 'production'
  delete process.env.ALLOW_LEGACY_PRODUCT_DRAFT
  const mod = await import('../api/products/draft.ts')
  const chunks: Buffer[] = []
  const res = {
    statusCode: 0,
    setHeader() {},
    end(payload: string) {
      chunks.push(Buffer.from(payload))
    },
  }
  await mod.default({ method: 'POST', headers: {} } as never, res as never)
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { code?: string, ok?: boolean }
  assert.equal(res.statusCode, 410)
  assert.equal(body.code, 'legacy_draft_disabled')
  if (prev === undefined)
    delete process.env.VERCEL_ENV
  else
    process.env.VERCEL_ENV = prev
}

{
  const now = Date.now()
  const other = '0x2222222222222222222222222222222222222222'
  const { client, intents, removedCovers } = makeQuotaClient({
    intents: [
      {
        id: 'mine-expired',
        seller_wallet: seller,
        created_at: new Date(now - 10_000).toISOString(),
        expires_at: new Date(now - 1000).toISOString(),
        completed_at: null,
        cleaned_at: null,
        ip_hash: null,
        cover_path: `covers/${seller}/mine.png`,
        asset_path: `assets/${seller}/mine.pdf`,
      },
      {
        id: 'other-expired',
        seller_wallet: other,
        created_at: new Date(now - 10_000).toISOString(),
        expires_at: new Date(now - 1000).toISOString(),
        completed_at: null,
        cleaned_at: null,
        ip_hash: null,
        cover_path: `covers/${other}/other.png`,
        asset_path: `assets/${other}/other.pdf`,
      },
    ],
  })

  const scoped = await cleanupExpiredUploadIntents(client, {
    nowMs: now,
    sellerWallet: seller,
  })
  assert.equal(scoped.cleaned, 1)
  assert.equal(removedCovers.includes(`covers/${seller}/mine.png`), true)
  assert.equal(intents.find(row => row.id === 'mine-expired')?.cleaned_at != null, true)
  assert.equal(intents.find(row => row.id === 'other-expired')?.cleaned_at, null)

  // createUploadIntent opportunistically cleans this seller only, then allows a new intent.
  const created = await createUploadIntent(client, {
    sellerWallet: seller,
    title: 'Guide',
    description: 'Desc',
    cover: { name: 'cover.png', size: 1000, type: 'image/png' },
    asset: { name: 'guide.pdf', size: 2000, type: 'application/pdf' },
    assetSha256: assetSha,
    nowMs: now,
  })
  assert.equal(created.ok, true)
  assert.equal(intents.find(row => row.id === 'other-expired')?.cleaned_at, null)
}

{
  const vercelJson = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      new URL('../vercel.json', import.meta.url),
      'utf8',
    ),
  ) as { crons?: Array<{ path: string, schedule: string }> }
  assert.equal(vercelJson.crons?.[0]?.path, '/api/products/cleanup-expired-uploads')
  assert.equal(vercelJson.crons?.[0]?.schedule, '0 3 * * *')
  assert.notEqual(vercelJson.crons?.[0]?.schedule, '0 * * * *')
}

assert.equal(JSON.stringify({ uploadIntentId: 'x' }).includes('Buffer'), false)

console.log('direct-upload: checks passed')
