<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { crowdDropAbi } from './crowdDropAbi'
import {
  activeCrowdDropNetwork,
  CROWDDROP_DURATION_OPTIONS,
} from './escrowConfig'
import {
  dropIdFromCreateReceipt,
  sendTx,
  waitForReceipt,
} from './evm'
import { ensureLeadingZeroAmount, parseTokenAmount } from './tokenMath'
import { developerErrorDetail, friendlyUserError } from './userErrors'
import { formatWalletError } from './wallet'
import { isUserRejection } from './txRequest'
import { saveLastOpenedDrop } from './lastOpenedDrop'
import { openDropById } from './appNavigation'
import DropLists from './DropLists.vue'
import DropCreatedMotionContent from './motion/DropCreatedMotionContent.vue'
import WalletBar from './WalletBar.vue'
import {
  switchWalletNetwork,
  walletAccount,
  walletBusy,
  walletChecking,
  walletOnActiveNetwork,
  walletReady,
} from './walletSession'
import {
  PRODUCT_ASSET_ACCEPT,
  PRODUCT_COVER_ACCEPT,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_TITLE_MAX,
} from './products/constants'
import { stageLabel, type CreateFlowStage, recoveryBannerCopy } from './products/createFlow'
import {
  clearFinalizeRecovery,
  readFinalizeRecovery,
  recoveryForSeller,
  writeFinalizeRecovery,
  type FinalizeRecoveryRecord,
} from './products/finalizeRecovery'
import { finalizeProductWithRetries } from './products/finalizeRetry'
import {
  productDraftFingerprint,
  shouldReuseCachedDraft,
  validateProductFormFields,
  type CachedProductDraft,
} from './products/productForm'
import {
  ensureSellerUploadSession,
  type SellerSessionMemory,
} from './products/sellerAuth'
import {
  createProductDraft,
  friendlyUploadFailure,
} from './products/upload'
import { fetchProductByDrop } from './products/finalizeClient'

const network = activeCrowdDropNetwork

/** Compact chip labels aligned to production CROWDDROP_DURATION_OPTIONS order. */
const DURATION_CHIP_LABELS = ['1h', '4h', '24h', '3d', '7d', '30d'] as const

const showCreate = ref(false)
const contributionInput = ref('1')
const goalInput = ref('2')
const durationSeconds = ref<number>(CROWDDROP_DURATION_OPTIONS[2].seconds)

const productTitle = ref('')
const productDescription = ref('')
const productCover = ref<File | null>(null)
const productAsset = ref<File | null>(null)
const coverPreviewUrl = ref<string | null>(null)

const busy = ref(false)
const flowStage = ref<CreateFlowStage>('idle')
const errorMessage = ref<string | null>(null)
const errorDetail = ref<string | null>(null)
const createdDropId = ref<string | null>(null)
const lastTxHash = ref<string | null>(null)
const createdProductTitle = ref<string | null>(null)
const createdCoverUrl = ref<string | null>(null)
const createdFileTypeLabel = ref<string | null>(null)
const copied = ref(false)
/** Set true only after Create receipt succeeds; cleared after motion play(). */
const confirmedCreateForMotion = ref(false)
const createdMotionRef = ref<InstanceType<typeof DropCreatedMotionContent> | null>(null)

const sellerSession = ref<SellerSessionMemory | null>(null)
const cachedDraft = ref<CachedProductDraft | null>(null)

const recoveryPending = ref(false)
const recoveryRecord = ref<FinalizeRecoveryRecord | null>(null)
const recoveryBusy = ref(false)

const shareUrl = computed(() => {
  if (!createdDropId.value)
    return ''
  return `${window.location.origin}/?drop=${createdDropId.value}`
})

const txExplorerUrl = computed(() => {
  if (!lastTxHash.value)
    return ''
  const base = network.blockExplorerUrls[0] ?? 'https://polygonscan.com'
  return `${base}/tx/${lastTxHash.value}`
})

/** Wrong-network full-width CTA only (header Connect handles disconnect). */
const needsNetworkSwitchCta = computed(() =>
  !walletChecking.value && !!walletAccount.value && !walletOnActiveNetwork.value,
)

/** Soften + New Drop when wallet is not ready (disconnected or wrong network). */
const needsWalletSystemCta = computed(() =>
  !walletChecking.value && !walletReady.value,
)

const creating = computed(() => showCreate.value || !!createdDropId.value || recoveryPending.value)

const selectedDurationLabel = computed(() => {
  const idx = CROWDDROP_DURATION_OPTIONS.findIndex(o => o.seconds === durationSeconds.value)
  const option = CROWDDROP_DURATION_OPTIONS[idx >= 0 ? idx : 0]
  return option?.label ?? ''
})

const contributionDisplay = computed(() => ensureLeadingZeroAmount(contributionInput.value))

const waitingLabel = computed(() => {
  if (recoveryPending.value && !createdDropId.value)
    return recoveryBannerCopy(recoveryRecord.value?.dropIdHint).body
  return stageLabel(flowStage.value)
})

const primaryCtaLabel = computed(() => {
  if (busy.value)
    return waitingLabel.value || 'Working…'
  return 'Create Drop'
})

const coverFileLabel = computed(() => productCover.value?.name ?? 'Choose cover image')
const assetFileLabel = computed(() => productAsset.value?.name ?? 'Choose digital product')

const recoveryCopy = computed(() => recoveryBannerCopy(recoveryRecord.value?.dropIdHint))

function setError(error: unknown) {
  if (isUserRejection(error)) {
    errorMessage.value = 'Transaction cancelled.'
    errorDetail.value = null
    return
  }
  errorMessage.value = friendlyUserError(error)
  errorDetail.value = developerErrorDetail(error)
}

function clearActionUi() {
  flowStage.value = 'idle'
  busy.value = false
}

function revokeCoverPreview() {
  if (coverPreviewUrl.value) {
    URL.revokeObjectURL(coverPreviewUrl.value)
    coverPreviewUrl.value = null
  }
}

function onCoverChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  productCover.value = file
  cachedDraft.value = null
  revokeCoverPreview()
  if (file)
    coverPreviewUrl.value = URL.createObjectURL(file)
}

function onAssetChange(event: Event) {
  const input = event.target as HTMLInputElement
  productAsset.value = input.files?.[0] ?? null
  cachedDraft.value = null
}

watch(productTitle, () => {
  cachedDraft.value = null
})
watch(productDescription, () => {
  cachedDraft.value = null
})

function openCreate() {
  showCreate.value = true
  recoveryPending.value = false
  errorMessage.value = null
  errorDetail.value = null
}

function backToHome() {
  showCreate.value = false
  createdDropId.value = null
  lastTxHash.value = null
  createdProductTitle.value = null
  createdCoverUrl.value = null
  createdFileTypeLabel.value = null
  copied.value = false
  confirmedCreateForMotion.value = false
  recoveryPending.value = false
  errorMessage.value = null
  errorDetail.value = null
  clearActionUi()
}

function selectDuration(seconds: number) {
  if (!busy.value)
    durationSeconds.value = seconds
}

async function runFinalize(params: {
  draftId: string
  createTxHash: string
  sellerWallet: string
  dropIdHint?: string
}): Promise<boolean> {
  writeFinalizeRecovery({
    draftId: params.draftId,
    createTxHash: params.createTxHash,
    sellerWallet: params.sellerWallet,
    createdAt: Date.now(),
    dropIdHint: params.dropIdHint,
  })

  flowStage.value = recoveryPending.value ? 'recovery' : 'finishing'
  const result = await finalizeProductWithRetries({
    draftId: params.draftId,
    createTxHash: params.createTxHash,
  })

  if (result.ok === false) {
    recoveryPending.value = true
    recoveryRecord.value = {
      draftId: params.draftId,
      createTxHash: params.createTxHash,
      sellerWallet: params.sellerWallet,
      createdAt: Date.now(),
      dropIdHint: params.dropIdHint,
    }
    errorMessage.value = recoveryBannerCopy(params.dropIdHint).title
    errorDetail.value = null
    return false
  }

  clearFinalizeRecovery()
  recoveryPending.value = false
  recoveryRecord.value = null

  const lockedTitle = cachedDraft.value?.title || productTitle.value.trim() || createdProductTitle.value
  const lockedFileType = cachedDraft.value?.fileTypeLabel ?? createdFileTypeLabel.value
  cachedDraft.value = null

  createdDropId.value = result.dropId
  lastTxHash.value = params.createTxHash
  createdProductTitle.value = lockedTitle
  createdFileTypeLabel.value = lockedFileType
  if (coverPreviewUrl.value)
    createdCoverUrl.value = coverPreviewUrl.value

  try {
    const meta = await fetchProductByDrop(result.dropId)
    if (meta) {
      createdProductTitle.value = meta.title || createdProductTitle.value
      createdFileTypeLabel.value = meta.fileTypeLabel ?? createdFileTypeLabel.value
      if (meta.coverUrl)
        createdCoverUrl.value = meta.coverUrl
    }
  }
  catch {
    // Created screen can proceed without enrichment.
  }

  saveLastOpenedDrop(createdDropId.value)
  confirmedCreateForMotion.value = true
  showCreate.value = true
  return true
}

async function retryFinalizeSetup() {
  const record = recoveryRecord.value
  if (!record || recoveryBusy.value)
    return

  recoveryBusy.value = true
  errorMessage.value = null
  errorDetail.value = null
  busy.value = true
  flowStage.value = 'recovery'
  try {
    const ok = await runFinalize({
      draftId: record.draftId,
      createTxHash: record.createTxHash,
      sellerWallet: record.sellerWallet,
      dropIdHint: record.dropIdHint,
    })
    if (!ok) {
      // keep recovery UI
    }
  }
  catch (error) {
    setError(error)
    recoveryPending.value = true
  }
  finally {
    recoveryBusy.value = false
    clearActionUi()
  }
}

async function createDrop() {
  errorMessage.value = null
  errorDetail.value = null
  copied.value = false

  if (!walletAccount.value) {
    errorMessage.value = 'Connect your wallet before creating a drop.'
    return
  }
  if (!walletOnActiveNetwork.value) {
    errorMessage.value = `Switch to ${network.chainName} before creating a drop.`
    return
  }

  const provider = window.ethereum
  if (!provider) {
    errorMessage.value = 'Open this app inside Nimiq Pay to create a Drop.'
    return
  }

  const productCheck = validateProductFormFields({
    title: productTitle.value,
    description: productDescription.value,
    cover: productCover.value,
    asset: productAsset.value,
  })
  if (productCheck.ok === false) {
    errorMessage.value = productCheck.reason
    return
  }

  let contribution: bigint
  let goal: number
  try {
    contribution = parseTokenAmount(contributionInput.value, network.tokenDecimals)
    goal = Number.parseInt(goalInput.value, 10)
    if (!Number.isInteger(goal) || goal < network.minGoal || goal > network.maxGoal)
      throw new Error(`Buyers required must be an integer from ${network.minGoal} to ${network.maxGoal}.`)

    const duration = durationSeconds.value
    if (duration < network.minDurationSeconds || duration > network.maxDurationSeconds)
      throw new Error('Choose a duration between 1 hour and 90 days.')
  }
  catch (error) {
    setError(error)
    return
  }

  const cover = productCover.value!
  const asset = productAsset.value!
  const fingerprint = productDraftFingerprint({
    title: productTitle.value,
    description: productDescription.value,
    cover,
    asset,
  })

  busy.value = true
  flowStage.value = 'preparing'

  try {
    const auth = await ensureSellerUploadSession({
      wallet: walletAccount.value,
      provider,
      existing: sellerSession.value,
    })
    if (auth.ok === false) {
      if (auth.cancelled) {
        errorMessage.value = null
        errorDetail.value = null
        return
      }
      errorMessage.value = auth.reason
      return
    }
    sellerSession.value = auth.session

    let draftId = shouldReuseCachedDraft(cachedDraft.value, fingerprint)
      ? cachedDraft.value!.draftId
      : null

    if (draftId && cachedDraft.value) {
      createdFileTypeLabel.value = cachedDraft.value.fileTypeLabel
      createdProductTitle.value = cachedDraft.value.title
    }

    if (!draftId) {
      const uploaded = await createProductDraft(
        {
          title: productTitle.value,
          description: productDescription.value,
          cover,
          asset,
        },
        {
          onStage: (stage) => {
            if (stage === 'preparing')
              flowStage.value = 'preparing'
            else if (stage === 'uploading_cover')
              flowStage.value = 'uploading_cover'
            else if (stage === 'uploading_asset')
              flowStage.value = 'uploading_product'
            else
              flowStage.value = 'preparing'
          },
        },
      )
      if (uploaded.ok === false) {
        errorMessage.value = friendlyUploadFailure(uploaded)
        return
      }
      draftId = uploaded.draftId
      cachedDraft.value = {
        draftId,
        fingerprint,
        fileTypeLabel: uploaded.fileTypeLabel,
        title: productTitle.value.trim(),
      }
      createdFileTypeLabel.value = uploaded.fileTypeLabel
      createdProductTitle.value = productTitle.value.trim()
    }

    flowStage.value = 'creating_drop'
    const hash = await sendTx(
      network.crowdDropAddress,
      crowdDropAbi,
      'createDrop',
      [contribution, BigInt(goal), BigInt(durationSeconds.value)],
    )
    lastTxHash.value = hash

    const receipt = await waitForReceipt(hash)
    const dropIdHint = dropIdFromCreateReceipt(receipt, network.crowdDropAddress).toString()

    await runFinalize({
      draftId,
      createTxHash: hash,
      sellerWallet: walletAccount.value,
      dropIdHint,
    })
  }
  catch (error) {
    // createDrop cancel/failure: keep reusable draft; do not finalize.
    setError(error)
  }
  finally {
    clearActionUi()
  }
}

async function copyLink() {
  if (!shareUrl.value)
    return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copied.value = true
  }
  catch {
    errorMessage.value = formatWalletError(new Error('Could not copy. Select the link and copy it manually.'))
  }
}

function openDrop() {
  if (!createdDropId.value)
    return
  saveLastOpenedDrop(createdDropId.value)
  openDropById(createdDropId.value)
}

watch([createdDropId, confirmedCreateForMotion], () => {
  if (!createdDropId.value || !confirmedCreateForMotion.value)
    return
  nextTick(() => {
    createdMotionRef.value?.play()
    confirmedCreateForMotion.value = false
  })
})

onMounted(() => {
  const wallet = walletAccount.value
  const record = recoveryForSeller(readFinalizeRecovery(), wallet)
  if (record) {
    recoveryRecord.value = record
    recoveryPending.value = true
    showCreate.value = true
    lastTxHash.value = record.createTxHash
  }
})

watch(walletAccount, (wallet) => {
  const record = recoveryForSeller(readFinalizeRecovery(), wallet)
  if (record) {
    recoveryRecord.value = record
    recoveryPending.value = true
    showCreate.value = true
    lastTxHash.value = record.createTxHash
  }
  else if (recoveryPending.value && recoveryRecord.value
    && wallet
    && recoveryRecord.value.sellerWallet.toLowerCase() !== wallet.toLowerCase()) {
    recoveryPending.value = false
    recoveryRecord.value = null
  }
})
</script>

<template>
  <div class="home">
    <header class="top">
      <p class="brand">CrowdDrop</p>
      <WalletBar compact utility :extra-busy="busy || recoveryBusy" />
    </header>

    <template v-if="!creating">
      <div v-if="needsNetworkSwitchCta" class="sys-wallet">
        <button
          type="button"
          class="sys-btn"
          :disabled="walletBusy"
          @click="switchWalletNetwork"
        >
          Switch to {{ network.chainName }}
        </button>
      </div>
      <section class="intro">
        <p class="tagline">Pool together. Unlock the deal.</p>
        <button
          type="button"
          class="new-drop"
          :class="{ subdued: needsWalletSystemCta }"
          @click="openCreate"
        >
          + New Drop
        </button>
      </section>
      <DropLists />
    </template>

    <section v-else class="create">
      <button type="button" class="back" :disabled="busy || recoveryBusy" @click="backToHome">← Back</button>

      <template v-if="recoveryPending && !createdDropId">
        <h1 class="create-title">Drop created</h1>
        <p class="lede">{{ recoveryCopy.title }}</p>
        <p v-if="waitingLabel" class="wait">{{ waitingLabel }}</p>
        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        <button
          type="button"
          class="primary"
          :disabled="recoveryBusy || busy"
          @click="retryFinalizeSetup"
        >
          {{ recoveryBusy ? 'Finishing product setup…' : recoveryCopy.retryLabel }}
        </button>
      </template>

      <template v-else-if="!createdDropId">
        <h1 class="create-title">Create a Drop</h1>
        <p class="lede">
          Each buyer contributes the same amount. The seller can claim only if the goal is reached.
        </p>

        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        <details v-if="errorDetail" class="dev">
          <summary>Developer details</summary>
          <pre>{{ errorDetail }}</pre>
        </details>
        <p v-if="waitingLabel" class="wait">{{ waitingLabel }}</p>

        <form class="form" @submit.prevent="createDrop">
          <p class="section-label">Product</p>

          <label>
            <span>Product title</span>
            <div class="field">
              <input
                v-model="productTitle"
                type="text"
                :maxlength="PRODUCT_TITLE_MAX"
                autocomplete="off"
                :disabled="busy"
                required
              >
            </div>
          </label>

          <label>
            <span>Description</span>
            <textarea
              v-model="productDescription"
              class="textarea"
              :maxlength="PRODUCT_DESCRIPTION_MAX"
              rows="3"
              :disabled="busy"
              required
            />
          </label>

          <div class="file-block">
            <span class="field-label">Cover image</span>
            <p class="file-hint">Maximum 2 MB</p>
            <label class="file-pick">
              <input
                type="file"
                class="file-input"
                :accept="PRODUCT_COVER_ACCEPT"
                :disabled="busy"
                @change="onCoverChange"
              >
              <span class="file-name">{{ coverFileLabel }}</span>
            </label>
            <img
              v-if="coverPreviewUrl"
              class="cover-preview"
              :src="coverPreviewUrl"
              alt=""
            >
          </div>

          <div class="file-block">
            <span class="field-label">Digital product</span>
            <p class="file-hint">Maximum 25 MB</p>
            <label class="file-pick">
              <input
                type="file"
                class="file-input"
                :accept="PRODUCT_ASSET_ACCEPT"
                :disabled="busy"
                @change="onAssetChange"
              >
              <span class="file-name">{{ assetFileLabel }}</span>
            </label>
          </div>

          <p class="trust-note">Your product is locked once the Drop is created.</p>

          <p class="section-label drop-details">Drop details</p>

          <label>
            <span>USDT per person</span>
            <div class="field">
              <input
                v-model="contributionInput"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                :disabled="busy"
              >
              <span class="suffix">{{ network.tokenSymbol }}</span>
            </div>
          </label>

          <label>
            <span>Buyer goal</span>
            <div class="field">
              <input
                v-model="goalInput"
                type="number"
                :min="network.minGoal"
                :max="network.maxGoal"
                step="1"
                :disabled="busy"
              >
              <span class="suffix">buyers</span>
            </div>
          </label>

          <div class="duration-block">
            <span class="field-label">Duration</span>
            <div class="chips" role="listbox" aria-label="Duration">
              <button
                v-for="(option, index) in CROWDDROP_DURATION_OPTIONS"
                :key="option.seconds"
                type="button"
                role="option"
                class="chip"
                :class="{ on: durationSeconds === option.seconds }"
                :aria-selected="durationSeconds === option.seconds"
                :disabled="busy"
                @click="selectDuration(option.seconds)"
              >
                {{ DURATION_CHIP_LABELS[index] ?? option.label }}
              </button>
            </div>
          </div>

          <button type="submit" class="primary" :disabled="busy || walletBusy || !walletReady">
            {{ primaryCtaLabel }}
          </button>
        </form>
      </template>

      <DropCreatedMotionContent
        v-else
        ref="createdMotionRef"
        :drop-id="createdDropId"
        :goal="Number(goalInput)"
        :product-title="createdProductTitle || undefined"
        :cover-url="createdCoverUrl || undefined"
        :file-type-label="createdFileTypeLabel || undefined"
      >
        <p class="summary">
          {{ contributionDisplay }} {{ network.tokenSymbol }} per person<br>
          {{ goalInput }} buyers<br>
          {{ selectedDurationLabel }}
        </p>
        <p class="link">{{ shareUrl }}</p>
        <a
          v-if="lastTxHash && txExplorerUrl"
          class="text-action"
          :href="txExplorerUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          View transaction
        </a>
        <button type="button" class="primary" @click="copyLink">
          {{ copied ? 'Copied' : 'Copy link' }}
        </button>
        <button type="button" class="secondary" @click="openDrop">Open Drop</button>
      </DropCreatedMotionContent>
    </section>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: Inter, system-ui, sans-serif;
  color: #141414;
  background: #F6F6F4;
}
.top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.brand {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.sys-wallet {
  margin: 0 0 12px;
}
.sys-btn {
  width: 100%;
  min-height: 44px;
  border: 1px solid #C94E12;
  background: #C94E12;
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.sys-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 0;
}
.tagline {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #141414;
  line-height: 1.35;
  max-width: 13.5rem;
}
.new-drop {
  flex: 0 0 auto;
  box-sizing: border-box;
  min-height: 36px;
  min-width: 44px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #C94E12;
  background: transparent;
  color: #C94E12;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}
.new-drop.subdued {
  border-color: #E2E2DE;
  color: #6A6A6A;
  opacity: 0.72;
}
.new-drop:active {
  background: #F3EBE4;
}
.new-drop.subdued:active {
  background: transparent;
}

.create {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.back {
  align-self: flex-start;
  border: none;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0;
  min-height: 32px;
  cursor: pointer;
  margin-bottom: 8px;
}
.create-title {
  margin: 0 0 8px;
  font-family: Inter, system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.lede {
  margin: 0 0 14px;
  font-size: 13px;
  color: #6A6A6A;
  line-height: 1.45;
}
.section-label {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #6A6A6A;
}
.section-label.drop-details {
  margin-top: 6px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 0;
}
label,
.duration-block,
.file-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
label span,
.field-label {
  font-size: 12px;
  color: #6A6A6A;
  font-weight: 500;
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
  min-height: 44px;
}
.field input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 15px;
  color: #141414;
  min-height: 44px;
  outline: none;
  padding: 0;
  box-shadow: none;
}
.field input:disabled {
  opacity: 0.55;
}
.field:focus-within,
.textarea:focus {
  outline: none;
}
.textarea {
  width: 100%;
  box-sizing: border-box;
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  font-size: 15px;
  color: #141414;
  line-height: 1.4;
  resize: vertical;
  min-height: 88px;
  outline: none;
  box-shadow: none;
}
.textarea:disabled {
  opacity: 0.55;
}
.suffix {
  flex: 0 0 auto;
  font-size: 12px;
  color: #6A6A6A;
  font-weight: 500;
}
.file-hint {
  margin: -2px 0 0;
  font-size: 12px;
  color: #6A6A6A;
  line-height: 1.35;
}
.file-pick {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 44px;
  border: 1px solid #E2E2DE;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
  cursor: pointer;
  margin-bottom: 0;
}
.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.file-name {
  display: block;
  width: 100%;
  min-width: 0;
  font-size: 13px;
  color: #141414;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.cover-preview {
  display: block;
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #E2E2DE;
  margin-top: 2px;
}
.trust-note {
  margin: 0 0 14px;
  font-size: 12px;
  color: #6A6A6A;
  line-height: 1.4;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  padding: 8px 11px;
  min-height: 36px;
  border-radius: 8px;
  cursor: pointer;
}
.chip.on {
  border-color: #C94E12;
  color: #C94E12;
  background: #F3EBE4;
}
.chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.primary,
.secondary {
  width: 100%;
  min-height: 44px;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 12px;
}
.primary {
  margin-top: 4px;
  border: 1px solid #C94E12;
  background: #C94E12;
  color: #fff;
}
.primary:active:not(:disabled) {
  background: #B9430E;
  border-color: #B9430E;
}
.secondary {
  margin-top: 8px;
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
  font-weight: 500;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.error {
  margin: 0 0 10px;
  color: #B9430E;
  font-size: 13px;
}
.wait {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: #141414;
}
.dev {
  margin: 0 0 10px;
  font-size: 12px;
  color: #6A6A6A;
}
pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.summary,
.link {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.45;
}
.summary {
  color: #141414;
  font-weight: 500;
}
.link {
  color: #6A6A6A;
  font-size: 12px;
  word-break: break-all;
}
.text-action {
  display: inline-block;
  margin: 0 0 10px;
  border: none;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 0;
  min-height: 44px;
  line-height: 1.35;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
