/**
 * Product finalize + public metadata tests (mocked RPC / Supabase).
 */
import assert from 'node:assert/strict'
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  parseAbiParameters,
  type Hex,
  type TransactionReceipt,
} from 'viem'
import { crowdDropServerAbi } from '../server/crowdDropAbi.ts'
import {
  POLYGON_CHAIN_ID,
  POLYGON_CROWDDROP_ADDRESS,
} from '../server/crowdDropConstants.ts'
import {
  extractDropCreatedEvent,
  normalizeTxHash,
  assertValidOnChainDrop,
} from '../server/polygonRpc.ts'
import {
  finalizeProductDraft,
  getLockedProductByDrop,
  publicCoverUrl,
} from '../server/productFinalize.ts'

process.env.CROWDDROP_AUTH_SECRET = 'test-secret-for-finalize-only'

const seller = '0x1111111111111111111111111111111111111111'
const otherSeller = '0x2222222222222222222222222222222222222222'
const sellerChecksum = getAddress(seller)
const txHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex
const draftId = '11111111-1111-4111-8111-111111111111'

assert.equal(normalizeTxHash(txHash), txHash)
assert.throws(() => normalizeTxHash('0xabc'), /Invalid transaction hash/)

function dropCreatedLog(args: {
  dropId: bigint
  seller: `0x${string}`
  contribution: bigint
  goal: bigint
  deadline: bigint
}) {
  const topics = encodeEventTopics({
    abi: crowdDropServerAbi,
    eventName: 'DropCreated',
    args: {
      dropId: args.dropId,
      seller: args.seller,
    },
  })
  const data = encodeAbiParameters(
    parseAbiParameters('uint256 contribution, uint256 goal, uint256 deadline'),
    [args.contribution, args.goal, args.deadline],
  )
  return {
    address: POLYGON_CROWDDROP_ADDRESS,
    topics: topics as [`0x${string}`, ...`0x${string}`[]],
    data,
    blockHash: '0x' + '11'.repeat(32) as Hex,
    blockNumber: 1n,
    logIndex: 0,
    transactionHash: txHash,
    transactionIndex: 0,
    removed: false,
  }
}

function makeReceipt(options: {
  status?: 'success' | 'reverted'
  to?: string
  logs?: TransactionReceipt['logs']
}): TransactionReceipt {
  return {
    status: options.status ?? 'success',
    to: (options.to ?? POLYGON_CROWDDROP_ADDRESS) as Hex,
    from: sellerChecksum,
    logs: options.logs ?? [
      dropCreatedLog({
        dropId: 42n,
        seller: sellerChecksum,
        contribution: 1_000_000n,
        goal: 5n,
        deadline: 2_000_000_000n,
      }),
    ],
    blockHash: '0x' + '11'.repeat(32) as Hex,
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 1n,
    effectiveGasPrice: 1n,
    gasUsed: 1n,
    logsBloom: '0x',
    transactionHash: txHash,
    transactionIndex: 0,
    type: 'eip1559',
    blobGasUsed: undefined,
    blobGasPrice: undefined,
    root: undefined,
  } as TransactionReceipt
}

{
  const event = extractDropCreatedEvent(makeReceipt({}))
  assert.equal(event.dropId, 42n)
  assert.equal(event.seller.toLowerCase(), seller)
  assert.equal(event.contribution, 1_000_000n)
  assert.equal(event.goal, 5n)
}

assert.throws(
  () => extractDropCreatedEvent(makeReceipt({ status: 'reverted' })),
  /failed on-chain/i,
)
assert.throws(
  () => extractDropCreatedEvent(makeReceipt({ to: otherSeller })),
  /not sent to the CrowdDrop registry/i,
)
assert.throws(
  () => extractDropCreatedEvent(makeReceipt({ logs: [] })),
  /does not contain a DropCreated/i,
)

{
  const wrongSellerLog = dropCreatedLog({
    dropId: 7n,
    seller: getAddress(otherSeller),
    contribution: 1n,
    goal: 2n,
    deadline: 2_000_000_000n,
  })
  const event = extractDropCreatedEvent(makeReceipt({ logs: [wrongSellerLog] }))
  assert.throws(
    () => assertValidOnChainDrop({
      dropId: event.dropId,
      seller: event.seller,
      contribution: event.contribution,
      goal: event.goal,
      deadline: event.deadline,
      buyerCount: 0n,
      escrowed: 0n,
      claimed: false,
    }, seller),
    /seller does not match/i,
  )
}

type ProductState = Record<string, unknown>

function makeDb(products: ProductState[]) {
  const rows = products.map(row => ({ ...row }))
  return {
    client: {
      from(table: string) {
        assert.equal(table, 'products')
        return {
          select(_cols?: string) {
            const filters: Array<(row: ProductState) => boolean> = []
            const api = {
              eq(col: string, value: unknown) {
                filters.push(row => row[col] === value || String(row[col]) === String(value))
                return api
              },
              is(col: string, value: null) {
                filters.push(row => row[col] == null)
                return api
              },
              async maybeSingle() {
                const match = rows.find(row => filters.every(fn => fn(row))) ?? null
                return { data: match, error: null }
              },
            }
            return api
          },
          update(patch: Record<string, unknown>) {
            const filters: Array<(row: ProductState) => boolean> = []
            const api = {
              eq(col: string, value: unknown) {
                filters.push(row => row[col] === value || String(row[col]) === String(value))
                return api
              },
              is(col: string, value: null) {
                filters.push(row => row[col] == null)
                return api
              },
              select() {
                return {
                  async maybeSingle() {
                    const row = rows.find(item => filters.every(fn => fn(item)))
                    if (!row)
                      return { data: null, error: null }
                    Object.assign(row, patch)
                    return {
                      data: {
                        id: row.id,
                        drop_id: row.drop_id,
                        locked_contribution: row.locked_contribution,
                        locked_goal: row.locked_goal,
                        create_tx_hash: row.create_tx_hash,
                      },
                      error: null,
                    }
                  },
                }
              },
            }
            return api
          },
        }
      },
    } as never,
    rows,
  }
}

const onChainDrop = {
  dropId: 42n,
  seller: sellerChecksum,
  contribution: 1_000_000n,
  goal: 5n,
  deadline: 2_000_000_000n,
  buyerCount: 0n,
  escrowed: 0n,
  claimed: false,
}

{
  const { client, rows } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'draft',
    title: 'Guide',
    description: 'Desc',
    cover_path: `covers/${seller}/a.png`,
    asset_path: `assets/${seller}/a.pdf`,
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: null,
    contract_address: null,
    drop_id: null,
    create_tx_hash: null,
    locked_contribution: null,
    locked_goal: null,
    finalized_at: null,
  }])

  const result = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({}),
    readDrop: async () => onChainDrop,
    nowIso: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.dropId, '42')
    assert.equal(result.contribution, '1000000')
    assert.equal(result.goal, 5)
  }
  assert.equal(rows[0]!.status, 'locked')
  assert.equal(rows[0]!.chain_id, POLYGON_CHAIN_ID)
  assert.equal(rows[0]!.contract_address, POLYGON_CROWDDROP_ADDRESS.toLowerCase())
  assert.equal(rows[0]!.drop_id, 42)
  assert.equal(rows[0]!.create_tx_hash, txHash)
  assert.equal(rows[0]!.locked_contribution, '1000000')
  assert.equal(rows[0]!.locked_goal, 5)
  assert.equal(rows[0]!.finalized_at, '2026-01-01T00:00:00.000Z')
  assert.equal(rows[0]!.title, 'Guide')
  assert.equal(rows[0]!.cover_path, `covers/${seller}/a.png`)
}

{
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: otherSeller,
    status: 'draft',
    title: 'Guide',
    description: 'Desc',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/a.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: null,
    contract_address: null,
    drop_id: null,
    create_tx_hash: null,
    locked_contribution: null,
    locked_goal: null,
    finalized_at: null,
  }])
  const rejected = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({}),
    readDrop: async () => onChainDrop,
  })
  assert.equal(rejected.ok, false)
  if (rejected.ok === false)
    assert.match(rejected.reason, /does not belong/i)
}

{
  const { client } = makeDb([])
  const missing = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  })
  assert.equal(missing.ok, false)
  if (missing.ok === false)
    assert.equal(missing.status, 404)
}

{
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'draft',
    title: 'Guide',
    description: 'Desc',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/a.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: null,
    contract_address: null,
    drop_id: null,
    create_tx_hash: null,
    locked_contribution: null,
    locked_goal: null,
    finalized_at: null,
  }])
  const failedTx = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({ status: 'reverted' }),
  })
  assert.equal(failedTx.ok, false)
}

{
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'draft',
    title: 'Guide',
    description: 'Desc',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/a.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: null,
    contract_address: null,
    drop_id: null,
    create_tx_hash: null,
    locked_contribution: null,
    locked_goal: null,
    finalized_at: null,
  }])
  const wrongContract = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({ to: otherSeller }),
  })
  assert.equal(wrongContract.ok, false)
}

{
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'draft',
    title: 'Guide',
    description: 'Desc',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/a.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: null,
    contract_address: null,
    drop_id: null,
    create_tx_hash: null,
    locked_contribution: null,
    locked_goal: null,
    finalized_at: null,
  }])
  const noEvent = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({ logs: [] }),
  })
  assert.equal(noEvent.ok, false)
}

{
  const mismatchSellerLog = dropCreatedLog({
    dropId: 42n,
    seller: getAddress(otherSeller),
    contribution: 1_000_000n,
    goal: 5n,
    deadline: 2_000_000_000n,
  })
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'draft',
    title: 'Guide',
    description: 'Desc',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/a.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: null,
    contract_address: null,
    drop_id: null,
    create_tx_hash: null,
    locked_contribution: null,
    locked_goal: null,
    finalized_at: null,
  }])
  const sellerMismatch = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({ logs: [mismatchSellerLog] }),
  })
  assert.equal(sellerMismatch.ok, false)
  if (sellerMismatch.ok === false)
    assert.match(sellerMismatch.reason, /seller/i)
}

{
  // Authoritative dropId comes from event (42), not from any client field.
  const { client, rows } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'draft',
    title: 'Guide',
    description: 'Desc',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/a.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: null,
    contract_address: null,
    drop_id: null,
    create_tx_hash: null,
    locked_contribution: null,
    locked_goal: null,
    finalized_at: null,
  }])
  await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({}),
    readDrop: async id => {
      assert.equal(id, 42n)
      return onChainDrop
    },
  })
  assert.equal(rows[0]!.drop_id, 42)
}

{
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'locked',
    title: 'Guide',
    description: 'Desc',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/a.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: POLYGON_CHAIN_ID,
    contract_address: POLYGON_CROWDDROP_ADDRESS.toLowerCase(),
    drop_id: 42,
    create_tx_hash: txHash,
    locked_contribution: '1000000',
    locked_goal: 5,
    finalized_at: '2026-01-01T00:00:00.000Z',
  }])
  const again = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({}),
    readDrop: async () => onChainDrop,
  })
  assert.equal(again.ok, true)
  if (again.ok)
    assert.equal(again.idempotent, true)
}

{
  const otherTx = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'locked',
    title: 'Guide',
    description: 'Desc',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/a.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: POLYGON_CHAIN_ID,
    contract_address: POLYGON_CROWDDROP_ADDRESS.toLowerCase(),
    drop_id: 42,
    create_tx_hash: txHash,
    locked_contribution: '1000000',
    locked_goal: 5,
    finalized_at: '2026-01-01T00:00:00.000Z',
  }])
  const rebound = await finalizeProductDraft(client, {
    draftId,
    createTxHash: otherTx,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({
      logs: [dropCreatedLog({
        dropId: 99n,
        seller: sellerChecksum,
        contribution: 1n,
        goal: 2n,
        deadline: 2_000_000_000n,
      })],
    }),
    readDrop: async () => ({ ...onChainDrop, dropId: 99n, contribution: 1n, goal: 2n }),
  })
  assert.equal(rebound.ok, false)
  if (rebound.ok === false)
    assert.match(rebound.reason, /already locked to a different Drop/i)
}

{
  const { client } = makeDb([
    {
      id: draftId,
      seller_wallet: seller,
      status: 'draft',
      title: 'Guide',
      description: 'Desc',
      cover_path: 'covers/x/a.png',
      asset_path: 'assets/x/a.pdf',
      asset_mime: 'application/pdf',
      asset_size_bytes: 100,
      asset_sha256: 'a'.repeat(64),
      file_type_label: 'PDF',
      chain_id: null,
      contract_address: null,
      drop_id: null,
      create_tx_hash: null,
      locked_contribution: null,
      locked_goal: null,
      finalized_at: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      seller_wallet: seller,
      status: 'locked',
      title: 'Other',
      description: 'Desc',
      cover_path: 'covers/x/b.png',
      asset_path: 'assets/x/b.pdf',
      asset_mime: 'application/pdf',
      asset_size_bytes: 100,
      asset_sha256: 'b'.repeat(64),
      file_type_label: 'PDF',
      chain_id: POLYGON_CHAIN_ID,
      contract_address: POLYGON_CROWDDROP_ADDRESS.toLowerCase(),
      drop_id: 42,
      create_tx_hash: txHash,
      locked_contribution: '1000000',
      locked_goal: 5,
      finalized_at: '2026-01-01T00:00:00.000Z',
    },
  ])
  const dup = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({}),
    readDrop: async () => onChainDrop,
  })
  assert.equal(dup.ok, false)
  if (dup.ok === false)
    assert.match(dup.reason, /already locked to this Drop/i)
}

{
  const cover = publicCoverUrl('https://abc.supabase.co', `covers/${seller}/a.png`)
  assert.equal(
    cover,
    `https://abc.supabase.co/storage/v1/object/public/product-covers/covers/${seller}/a.png`,
  )
  assert.equal(cover.includes('asset'), false)
}

{
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'draft',
    title: 'Secret draft',
    description: 'nope',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/secret.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: null,
    contract_address: null,
    drop_id: 42,
    create_tx_hash: null,
    locked_contribution: null,
    locked_goal: null,
    finalized_at: null,
  }])
  const draftPublic = await getLockedProductByDrop(client, {
    dropId: 42,
    supabaseUrl: 'https://abc.supabase.co',
  })
  assert.equal(draftPublic.ok, false)
}

{
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'locked',
    title: 'Guide',
    description: 'Public desc',
    cover_path: `covers/${seller}/a.png`,
    asset_path: `assets/${seller}/secret.pdf`,
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: POLYGON_CHAIN_ID,
    contract_address: POLYGON_CROWDDROP_ADDRESS.toLowerCase(),
    drop_id: 42,
    create_tx_hash: txHash,
    locked_contribution: '1000000',
    locked_goal: 5,
    finalized_at: '2026-01-01T00:00:00.000Z',
  }])
  const pub = await getLockedProductByDrop(client, {
    dropId: 42,
    supabaseUrl: 'https://abc.supabase.co',
  })
  assert.equal(pub.ok, true)
  if (pub.ok) {
    assert.equal(pub.product.dropId, '42')
    assert.equal(pub.product.title, 'Guide')
    assert.ok(pub.product.coverUrl.includes('/product-covers/'))
    assert.equal(JSON.stringify(pub.product).includes('secret.pdf'), false)
    assert.equal(JSON.stringify(pub.product).includes('asset_path'), false)
    assert.equal(JSON.stringify(pub.product).includes('asset_sha256'), false)
  }
}

{
  // On-chain getDrop seller mismatch rejected.
  const { client } = makeDb([{
    id: draftId,
    seller_wallet: seller,
    status: 'draft',
    title: 'Guide',
    description: 'Desc',
    cover_path: 'covers/x/a.png',
    asset_path: 'assets/x/a.pdf',
    asset_mime: 'application/pdf',
    asset_size_bytes: 100,
    asset_sha256: 'a'.repeat(64),
    file_type_label: 'PDF',
    chain_id: null,
    contract_address: null,
    drop_id: null,
    create_tx_hash: null,
    locked_contribution: null,
    locked_goal: null,
    finalized_at: null,
  }])
  const onChainMismatch = await finalizeProductDraft(client, {
    draftId,
    createTxHash: txHash,
    sellerWallet: seller,
  }, {
    fetchReceipt: async () => makeReceipt({}),
    readDrop: async () => ({
      ...onChainDrop,
      seller: getAddress(otherSeller),
    }),
  })
  assert.equal(onChainMismatch.ok, false)
  if (onChainMismatch.ok === false)
    assert.match(onChainMismatch.reason, /seller/i)
}

{
  // Unauthenticated finalize API rejected.
  const handler = (await import('../api/products/finalize.ts')).default
  let statusCode = 0
  let body = ''
  const req = {
    method: 'POST',
    headers: { cookie: '' },
    body: { draftId, createTxHash: txHash },
  }
  const res = {
    setHeader() {},
    end(payload: string) {
      body = payload
    },
    get statusCode() {
      return statusCode
    },
    set statusCode(value: number) {
      statusCode = value
    },
  }
  await handler(req as never, res as never)
  assert.equal(statusCode, 401)
  assert.match(body, /authentication required/i)
}

console.log('product-finalize: checks passed')
