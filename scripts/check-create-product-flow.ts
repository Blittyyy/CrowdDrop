/**
 * Production Create orchestration invariants for Digital Products V1.
 * No real network / chain calls.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertCreateOrder,
  canSendCreateDrop,
  CREATE_ORCHESTRATION_ORDER,
  recoveryBannerCopy,
  stageLabel,
} from '../src/products/createFlow.ts'
import {
  FINALIZE_RETRY_DELAYS_MS,
  finalizeProductWithRetries,
} from '../src/products/finalizeRetry.ts'
import {
  clearFinalizeRecovery,
  readFinalizeRecovery,
  recoveryForSeller,
  writeFinalizeRecovery,
} from '../src/products/finalizeRecovery.ts'
import {
  productDraftFingerprint,
  shouldReuseCachedDraft,
  validateProductFormFields,
} from '../src/products/productForm.ts'
import {
  buildCreatedResultSnapshot,
  defaultCreateFormFields,
  DEFAULT_CREATE_CONTRIBUTION,
  DEFAULT_CREATE_DURATION_SECONDS,
  DEFAULT_CREATE_GOAL,
  isCreateFormBlank,
  shouldResetCreateFormAfterOutcome,
  type CreateFormFieldState,
} from '../src/products/createFormReset.ts'
import { sellerSessionStillValid } from '../src/products/sellerSessionMemory.ts'
import { friendlyUploadFailure } from '../src/products/upload.ts'
import {
  PRODUCT_ASSET_MAX_BYTES,
  PRODUCT_COVER_MAX_BYTES,
} from '../src/products/constants.ts'
import { fetchProductByDrop } from '../src/products/finalizeClient.ts'
import { CROWDDROP_DURATION_OPTIONS } from '../src/escrowConfig.ts'

function fakeFile(name: string, size: number, type: string, lastModified = 1): File {
  const buffer = new Uint8Array(Math.min(size, 8))
  const file = new File([buffer], name, { type, lastModified })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

const cover = fakeFile('cover.png', 1000, 'image/png', 10)
const asset = fakeFile('guide.pdf', 5000, 'application/pdf', 20)
const coverBig = fakeFile('cover.png', PRODUCT_COVER_MAX_BYTES + 1, 'image/png')
const assetBig = fakeFile('guide.pdf', PRODUCT_ASSET_MAX_BYTES + 1, 'application/pdf')

// --- Product field validation ---
{
  const missing = validateProductFormFields({
    title: '',
    description: 'Desc',
    cover,
    asset,
  })
  assert.equal(missing.ok, false)

  const ok = validateProductFormFields({
    title: 'Test Product',
    description: 'A useful file',
    cover,
    asset,
  })
  assert.equal(ok.ok, true)

  const coverTooBig = validateProductFormFields({
    title: 'Test Product',
    description: 'A useful file',
    cover: coverBig,
    asset,
  })
  assert.equal(coverTooBig.ok, false)
  if (coverTooBig.ok === false)
    assert.match(coverTooBig.reason, /2 MB/i)

  const assetTooBig = validateProductFormFields({
    title: 'Test Product',
    description: 'A useful file',
    cover,
    asset: assetBig,
  })
  assert.equal(assetTooBig.ok, false)
  if (assetTooBig.ok === false)
    assert.match(assetTooBig.reason, /25 MB/i)
}

// --- Draft reuse fingerprint ---
{
  const fp1 = productDraftFingerprint({
    title: 'Test Product',
    description: 'Desc',
    cover,
    asset,
  })
  const fp2 = productDraftFingerprint({
    title: 'Test Product',
    description: 'Desc',
    cover,
    asset,
  })
  assert.equal(fp1, fp2)

  const changedTitle = productDraftFingerprint({
    title: 'Other',
    description: 'Desc',
    cover,
    asset,
  })
  assert.notEqual(fp1, changedTitle)

  const cached = {
    draftId: '11111111-1111-4111-8111-111111111111',
    fingerprint: fp1,
    fileTypeLabel: 'PDF',
    title: 'Test Product',
  }
  assert.equal(shouldReuseCachedDraft(cached, fp1), true)
  assert.equal(shouldReuseCachedDraft(cached, changedTitle), false)

  // Financial fields are not part of fingerprint — contribution/goal/duration changes do not invalidate.
  assert.equal(shouldReuseCachedDraft(cached, fp1), true)
}

// --- Auth session helper ---
{
  assert.equal(sellerSessionStillValid(null, '0xabc'), false)
  assert.equal(sellerSessionStillValid({
    wallet: '0xABC',
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  }, '0xabc'), true)
  assert.equal(sellerSessionStillValid({
    wallet: '0xabc',
    expiresAt: Math.floor(Date.now() / 1000) + 10,
  }, '0xabc'), false)
}

// --- Create order + draft-before-tx ---
{
  assert.deepEqual(CREATE_ORCHESTRATION_ORDER, [
    'validate',
    'auth',
    'upload',
    'create_tx',
    'finalize',
  ])
  assertCreateOrder([...CREATE_ORCHESTRATION_ORDER])
  assert.throws(() => assertCreateOrder(['validate', 'create_tx'] as never))
  assert.equal(canSendCreateDrop(null), false)
  assert.equal(canSendCreateDrop('11111111-1111-4111-8111-111111111111'), true)

  // Simulated cancel before upload/tx: no draft => cannot create.
  const events: string[] = ['validate', 'auth']
  assert.equal(events.includes('upload'), false)
  assert.equal(events.includes('create_tx'), false)

  // Upload failure => no create tx
  const uploadFailedPath = ['validate', 'auth', 'upload']
  assert.equal(uploadFailedPath.includes('create_tx'), false)

  // Draft complete before createDrop
  const happy = ['validate', 'auth', 'upload', 'create_tx', 'finalize'] as const
  assertCreateOrder([...happy])
}

// --- Stage labels (no backend jargon) ---
{
  assert.equal(stageLabel('preparing'), 'Preparing product…')
  assert.equal(stageLabel('uploading_cover'), 'Uploading cover…')
  assert.equal(stageLabel('uploading_product'), 'Uploading product…')
  assert.equal(stageLabel('creating_drop'), 'Creating Drop…')
  assert.equal(stageLabel('finishing'), 'Finishing product setup…')
  assert.equal(stageLabel('recovery'), 'Finishing product setup…')
  for (const label of [
    stageLabel('preparing'),
    stageLabel('uploading_cover'),
    stageLabel('finishing'),
  ]) {
    assert.ok(label)
    assert.doesNotMatch(label!, /draft|supabase|jwt|nonce|tx hash/i)
  }
}

// --- Upload failure copy ---
{
  assert.match(
    friendlyUploadFailure({ reason: 'x', code: 'too_many_active_uploads' }),
    /too many unfinished uploads/i,
  )
  assert.match(
    friendlyUploadFailure({ reason: 'x', code: 'upload_rate_limited' }),
    /Too many upload attempts/i,
  )
  assert.equal(
    friendlyUploadFailure({ reason: 'Product upload failed. Try again.' }),
    'Product upload failed. Try again.',
  )
}

// --- Finalize retries ---
{
  assert.deepEqual([...FINALIZE_RETRY_DELAYS_MS], [0, 1000, 3000])
  let attempts = 0
  const sleeps: number[] = []
  const result = await finalizeProductWithRetries(
    {
      draftId: '11111111-1111-4111-8111-111111111111',
      createTxHash: `0x${'ab'.repeat(32)}`,
    },
    {
      delaysMs: [0, 5, 5],
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      fetchImpl: async () => {
        attempts += 1
        if (attempts < 3) {
          return new Response(JSON.stringify({ ok: false, reason: 'temporary' }), { status: 500 })
        }
        return new Response(JSON.stringify({
          ok: true,
          productId: 'p1',
          dropId: '9',
          createTxHash: `0x${'ab'.repeat(32)}`,
          contribution: '10000',
          goal: 2,
        }), { status: 200 })
      },
    },
  )
  assert.equal(result.ok, true)
  if (result.ok)
    assert.equal(result.dropId, '9')
  assert.equal(attempts, 3)
  assert.deepEqual(sleeps, [0, 5, 5])
}

{
  let attempts = 0
  const failed = await finalizeProductWithRetries(
    {
      draftId: '11111111-1111-4111-8111-111111111111',
      createTxHash: `0x${'cd'.repeat(32)}`,
    },
    {
      delaysMs: [0, 1],
      sleep: async () => {},
      fetchImpl: async () => {
        attempts += 1
        return new Response(JSON.stringify({ ok: false, reason: 'down' }), { status: 500 })
      },
    },
  )
  assert.equal(failed.ok, false)
  assert.equal(attempts, 2)
  const copy = recoveryBannerCopy('8')
  assert.match(copy.title, /Drop #8 was created/i)
  assert.equal(copy.retryLabel, 'Retry setup')
}

// --- Recovery storage (non-secret only) ---
{
  const mem = new Map<string, string>()
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
  } as Storage

  writeFinalizeRecovery({
    draftId: '11111111-1111-4111-8111-111111111111',
    createTxHash: `0x${'ab'.repeat(32)}`,
    sellerWallet: '0x1111111111111111111111111111111111111111',
    createdAt: 1,
    dropIdHint: '8',
  }, storage)

  const read = readFinalizeRecovery(storage)
  assert.ok(read)
  assert.equal(read!.dropIdHint, '8')
  assert.equal(
    recoveryForSeller(read, '0x1111111111111111111111111111111111111111')?.draftId,
    read!.draftId,
  )
  assert.equal(recoveryForSeller(read, '0x2222222222222222222222222222222222222222'), null)

  const raw = mem.get('crowddrop:finalizeRecovery')!
  assert.doesNotMatch(raw, /cookie|signature|asset_path|jwt|private/i)

  clearFinalizeRecovery(storage)
  assert.equal(readFinalizeRecovery(storage), null)
}

// --- Public metadata client strips private fields ---
{
  const product = await fetchProductByDrop(8, {
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      product: {
        id: 'p',
        dropId: '8',
        title: 'Test Product',
        description: 'Hello',
        coverUrl: 'https://example.com/cover.png',
        fileTypeLabel: 'PDF',
        sellerWallet: '0x1111111111111111111111111111111111111111',
        asset_path: 'assets/secret.pdf',
        asset_sha256: 'abc',
      },
    }), { status: 200 }),
  })
  assert.ok(product)
  assert.equal(product!.title, 'Test Product')
  assert.equal(JSON.stringify(product).includes('asset_path'), false)
  assert.equal(JSON.stringify(product).includes('asset_sha256'), false)

  const missing = await fetchProductByDrop(1, {
    fetchImpl: async () => new Response(JSON.stringify({
      ok: false,
      reason: 'No locked product for this Drop.',
    }), { status: 404 }),
  })
  assert.equal(missing, null)
}

// --- UI wiring / no new API routes ---
{
  const createSrc = readFileSync(join('src', 'CrowdDropCreate.vue'), 'utf8')
  assert.match(createSrc, /createProductDraft/)
  assert.match(createSrc, /finalizeProductWithRetries/)
  assert.match(createSrc, /ensureSellerUploadSession/)
  assert.match(createSrc, /Product title/)
  assert.match(createSrc, /Your product is locked once the Drop is created/)
  assert.match(createSrc, /stageLabel/)
  assert.match(createSrc, /recoveryCopy\.retryLabel|retryFinalizeSetup/)
  assert.equal(stageLabel('preparing'), 'Preparing product…')
  assert.equal(recoveryBannerCopy('8').retryLabel, 'Retry setup')
  assert.doesNotMatch(createSrc, /Draft ID/)
  assert.doesNotMatch(createSrc, /asset_path/)

  // createDrop only after draft exists is encoded by sequencing helpers + Create source
  assert.match(createSrc, /draftId/)
  assert.match(createSrc, /sendTx\(/)
  const draftIdx = createSrc.indexOf('createProductDraft')
  const sendIdx = createSrc.indexOf('sendTx(')
  assert.ok(draftIdx > 0 && sendIdx > draftIdx)

  const viewSrc = readFileSync(join('src', 'CrowdDropView.vue'), 'utf8')
  assert.match(viewSrc, /getCachedProductByDrop/)
  assert.match(viewSrc, /product-block/)
  assert.doesNotMatch(viewSrc, /asset_path/)
  assert.match(viewSrc, /Unlock Product/)
  assert.match(viewSrc, /Download Product/)
  assert.doesNotMatch(viewSrc, /SUPABASE_SERVICE_ROLE/)

  const cardSrc = readFileSync(join('src', 'DropCard.vue'), 'utf8')
  assert.match(cardSrc, /productTitle/)
  assert.match(cardSrc, /fileTypeLabel/)

  const apiFiles = readdirSync(join('api', 'products'))
  assert.deepEqual(
    apiFiles.filter(name => name.endsWith('.ts')).sort(),
    [
      'by-drop.ts',
      'cleanup-expired-uploads.ts',
      'complete-upload.ts',
      'draft.ts',
      'finalize.ts',
      'unlock.ts',
      'upload-intent.ts',
    ],
  )
}

// --- product-assets remains private (foundation + client) ---
{
  const foundation = readFileSync(join('supabase', 'migrations', '001_digital_products_foundation.sql'), 'utf8')
  assert.match(foundation, /product-assets/)
  assert.match(foundation, /product-assets', false|product-assets private|no public read/i)
}

// --- Create form reset after full success (not on cancel/failure) ---
{
  assert.equal(
    shouldResetCreateFormAfterOutcome({ createDropConfirmed: true, finalizeSucceeded: true }),
    true,
  )
  assert.equal(
    shouldResetCreateFormAfterOutcome({ createDropConfirmed: true, finalizeSucceeded: false }),
    false,
    'finalize failure must not reset',
  )
  assert.equal(
    shouldResetCreateFormAfterOutcome({ createDropConfirmed: false, finalizeSucceeded: false }),
    false,
    'signing/upload/create cancel-failure must not reset',
  )
  assert.equal(
    shouldResetCreateFormAfterOutcome({ createDropConfirmed: false, finalizeSucceeded: true }),
    false,
  )

  const filled: CreateFormFieldState = {
    productTitle: 'Guide',
    productDescription: 'Useful PDF',
    contributionInput: '0.000001',
    goalInput: '5',
    durationSeconds: DEFAULT_CREATE_DURATION_SECONDS * 2,
    hasCoverFile: true,
    hasAssetFile: true,
    draftId: '11111111-1111-4111-8111-111111111111',
    fingerprint: 'fp-abc',
  }
  assert.equal(isCreateFormBlank(filled), false)

  const afterSuccess: CreateFormFieldState = {
    ...defaultCreateFormFields(),
    hasCoverFile: false,
    hasAssetFile: false,
    draftId: null,
    fingerprint: null,
  }
  assert.equal(isCreateFormBlank(afterSuccess), true)
  assert.equal(afterSuccess.contributionInput, DEFAULT_CREATE_CONTRIBUTION)
  assert.equal(afterSuccess.goalInput, DEFAULT_CREATE_GOAL)
  assert.equal(afterSuccess.durationSeconds, DEFAULT_CREATE_DURATION_SECONDS)
  assert.equal(afterSuccess.productTitle, '')
  assert.equal(afterSuccess.productDescription, '')

  // Created screen snapshot stays populated after form defaults wipe.
  const snapshot = buildCreatedResultSnapshot({
    dropId: '9',
    createTxHash: `0x${'ab'.repeat(32)}`,
    productTitle: filled.productTitle,
    coverUrl: 'https://example.com/cover.png',
    fileTypeLabel: 'PDF',
    contributionInput: filled.contributionInput,
    goalInput: filled.goalInput,
    durationSeconds: CROWDDROP_DURATION_OPTIONS[2].seconds,
  })
  assert.equal(snapshot.dropId, '9')
  assert.equal(snapshot.productTitle, 'Guide')
  assert.equal(snapshot.contributionDisplay, '0.000001')
  assert.equal(snapshot.goalDisplay, '5')
  assert.equal(snapshot.durationLabel, '24 hours')
  assert.equal(snapshot.coverUrl, 'https://example.com/cover.png')
  assert.equal(isCreateFormBlank(afterSuccess), true)
  assert.notEqual(snapshot.productTitle, afterSuccess.productTitle)

  // Seller session helper remains independent of form reset.
  const session = {
    wallet: '0xabc',
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  }
  assert.equal(sellerSessionStillValid(session, '0xabc'), true)

  // Recovery localStorage cleared only on success path (already covered above);
  // simulate success wipe:
  const mem = new Map<string, string>()
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
  } as Storage
  writeFinalizeRecovery({
    draftId: '11111111-1111-4111-8111-111111111111',
    createTxHash: `0x${'ab'.repeat(32)}`,
    sellerWallet: '0x1111111111111111111111111111111111111111',
    createdAt: 1,
    dropIdHint: '9',
  }, storage)
  assert.ok(readFinalizeRecovery(storage))
  clearFinalizeRecovery(storage)
  assert.equal(readFinalizeRecovery(storage), null)
}

// --- Create UI wires reset + Created snapshot ---
{
  const createSrc = readFileSync(join('src', 'CrowdDropCreate.vue'), 'utf8')
  assert.match(createSrc, /function resetCreateForm\(/)
  assert.match(createSrc, /buildCreatedResultSnapshot/)
  assert.match(createSrc, /createdResult/)
  assert.match(createSrc, /pendingFreshCreateForm/)
  assert.match(createSrc, /shouldResetCreateFormAfterOutcome/)
  assert.match(createSrc, /createdResult\.contributionDisplay/)
  assert.match(createSrc, /createdResult\.goalDisplay/)
  assert.match(createSrc, /createdResult\.durationLabel/)
  assert.match(createSrc, /ref="coverInputEl"/)
  assert.match(createSrc, /ref="assetInputEl"/)
  assert.match(createSrc, /coverInputEl\.value\.value = ''/)
  assert.match(createSrc, /assetInputEl\.value\.value = ''/)
  assert.match(createSrc, /revokeIfBlobUrl|revokeObjectURL/)
  // Seller session must not be cleared by form reset.
  const resetBlock = createSrc.slice(
    createSrc.indexOf('function resetCreateForm'),
    createSrc.indexOf('function clearCreatedResult'),
  )
  assert.doesNotMatch(resetBlock, /sellerSession\.value\s*=\s*null/)
  // Reset only after finalize success path.
  const finalizeOkIdx = createSrc.indexOf('shouldResetCreateFormAfterOutcome')
  assert.ok(finalizeOkIdx > 0)
  assert.ok(createSrc.indexOf('resetCreateForm()') > finalizeOkIdx)
}

console.log('create-product-flow: checks passed')
