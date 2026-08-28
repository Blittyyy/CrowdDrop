<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
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
import { parseTokenAmount } from './tokenMath'
import { developerErrorDetail, friendlyUserError } from './userErrors'
import { formatWalletError } from './wallet'
import { isUserRejection } from './txRequest'
import { saveLastOpenedDrop } from './lastOpenedDrop'
import { openDropById } from './appNavigation'
import DropLists from './DropLists.vue'
import DropCreatedMotionContent from './motion/DropCreatedMotionContent.vue'
import WalletBar from './WalletBar.vue'
import {
  connectWallet,
  switchWalletNetwork,
  walletAccount,
  walletBusy,
  walletChecking,
  walletOnActiveNetwork,
  walletReady,
} from './walletSession'

const network = activeCrowdDropNetwork

/** Compact chip labels aligned to production CROWDDROP_DURATION_OPTIONS order. */
const DURATION_CHIP_LABELS = ['1h', '4h', '24h', '3d', '7d', '30d'] as const

const showCreate = ref(false)
const contributionInput = ref('1')
const goalInput = ref('2')
const durationSeconds = ref<number>(CROWDDROP_DURATION_OPTIONS[2].seconds)
const busy = ref(false)
const waitingLabel = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const errorDetail = ref<string | null>(null)
const createdDropId = ref<string | null>(null)
const lastTxHash = ref<string | null>(null)
const copied = ref(false)
/** Set true only after Create receipt succeeds; cleared after motion play(). */
const confirmedCreateForMotion = ref(false)
const createdMotionRef = ref<InstanceType<typeof DropCreatedMotionContent> | null>(null)

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

const needsWalletSystemCta = computed(() =>
  !walletChecking.value && !walletReady.value,
)

const creating = computed(() => showCreate.value || !!createdDropId.value)

const selectedDurationLabel = computed(() => {
  const idx = CROWDDROP_DURATION_OPTIONS.findIndex(o => o.seconds === durationSeconds.value)
  const option = CROWDDROP_DURATION_OPTIONS[idx >= 0 ? idx : 0]
  return option?.label ?? ''
})

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
  waitingLabel.value = null
  busy.value = false
}

function openCreate() {
  showCreate.value = true
  errorMessage.value = null
  errorDetail.value = null
}

function backToHome() {
  showCreate.value = false
  createdDropId.value = null
  lastTxHash.value = null
  copied.value = false
  confirmedCreateForMotion.value = false
  errorMessage.value = null
  errorDetail.value = null
  clearActionUi()
}

function selectDuration(seconds: number) {
  if (!busy.value)
    durationSeconds.value = seconds
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

  busy.value = true
  waitingLabel.value = 'Confirm Create in Nimiq Pay…'
  try {
    const contribution = parseTokenAmount(contributionInput.value, network.tokenDecimals)
    const goal = Number.parseInt(goalInput.value, 10)
    if (!Number.isInteger(goal) || goal < network.minGoal || goal > network.maxGoal)
      throw new Error(`Buyers required must be an integer from ${network.minGoal} to ${network.maxGoal}.`)

    const duration = durationSeconds.value
    if (duration < network.minDurationSeconds || duration > network.maxDurationSeconds)
      throw new Error('Choose a duration between 1 hour and 90 days.')

    const hash = await sendTx(
      network.crowdDropAddress,
      crowdDropAbi,
      'createDrop',
      [contribution, BigInt(goal), BigInt(duration)],
    )
    lastTxHash.value = hash
    waitingLabel.value = 'Waiting for confirmation…'
    const receipt = await waitForReceipt(hash)
    createdDropId.value = dropIdFromCreateReceipt(receipt, network.crowdDropAddress).toString()
    saveLastOpenedDrop(createdDropId.value)
    confirmedCreateForMotion.value = true
  }
  catch (error) {
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
</script>

<template>
  <div class="home">
    <header class="top">
      <p class="brand">CrowdDrop</p>
      <WalletBar compact utility :extra-busy="busy" />
    </header>

    <template v-if="!creating">
      <div v-if="needsWalletSystemCta" class="sys-wallet">
        <button
          v-if="!walletAccount"
          type="button"
          class="sys-btn"
          :disabled="walletBusy"
          @click="connectWallet"
        >
          Connect
        </button>
        <button
          v-else
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
      <button type="button" class="back" @click="backToHome">← Back</button>
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

      <form v-if="!createdDropId" class="form" @submit.prevent="createDrop">
        <label>
          <span>Contribution per person</span>
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
          {{ busy ? 'Working…' : 'Create Drop' }}
        </button>
      </form>

      <DropCreatedMotionContent
        v-else
        ref="createdMotionRef"
        :drop-id="createdDropId"
        :goal="Number(goalInput)"
      >
        <p class="summary">
          {{ contributionInput }} {{ network.tokenSymbol }} per person<br>
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
.form {
  display: flex;
  flex-direction: column;
  gap: 0;
}
label,
.duration-block {
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
  border: 1px solid #E2E2DE;
  border-radius: 8px;
  padding: 0 12px;
  background: #fff;
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
}
.field input:disabled {
  opacity: 0.55;
}
.suffix {
  flex: 0 0 auto;
  font-size: 12px;
  color: #6A6A6A;
  font-weight: 500;
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
pre,
.tx-hash {
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
.created-title {
  margin: 0 0 8px;
  font-family: Inter, system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
}
</style>
