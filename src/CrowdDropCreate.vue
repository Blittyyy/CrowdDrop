<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { saveLastOpenedDrop } from './lastOpenedDrop'
import DropLists from './DropLists.vue'
import WalletBar from './WalletBar.vue'
import {
  walletAccount,
  walletBusy,
  walletOnActiveNetwork,
  walletReady,
} from './walletSession'

const network = activeCrowdDropNetwork

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

const shareUrl = computed(() => {
  if (!createdDropId.value)
    return ''
  return `${window.location.origin}/?drop=${createdDropId.value}`
})

const creating = computed(() => showCreate.value || !!createdDropId.value)

function setError(error: unknown) {
  errorMessage.value = friendlyUserError(error)
  errorDetail.value = developerErrorDetail(error)
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
  errorMessage.value = null
  errorDetail.value = null
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
  }
  catch (error) {
    setError(error)
  }
  finally {
    waitingLabel.value = null
    busy.value = false
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
  const url = new URL(window.location.href)
  url.pathname = '/'
  url.search = `?drop=${createdDropId.value}`
  window.location.assign(url.toString())
}
</script>

<template>
  <div class="home" :class="{ creating }">
    <header class="top">
      <p class="brand">CrowdDrop</p>
      <WalletBar compact utility :extra-busy="busy" />
    </header>

    <section v-if="!creating" class="intro">
      <p class="tagline">Pool together. Unlock the deal.</p>
      <button type="button" class="new-drop" @click="openCreate">+ New Drop</button>
    </section>

    <section v-else class="create-panel">
      <button type="button" class="back" @click="backToHome">← Back</button>
      <h1 class="create-title">Create a Drop</h1>
      <p class="lede">Set the contribution, buyer goal, and duration.</p>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <details v-if="errorDetail" class="dev">
        <summary>Developer details</summary>
        <pre>{{ errorDetail }}</pre>
      </details>
      <p v-if="waitingLabel" class="wait">{{ waitingLabel }}</p>

      <form v-if="!createdDropId" class="form" @submit.prevent="createDrop">
        <label>
          <span>Contribution per person ({{ network.tokenSymbol }})</span>
          <input v-model="contributionInput" type="text" inputmode="decimal" autocomplete="off" :disabled="busy">
        </label>
        <label>
          <span>Buyer goal</span>
          <input v-model="goalInput" type="number" :min="network.minGoal" :max="network.maxGoal" step="1" :disabled="busy">
        </label>
        <label>
          <span>Duration</span>
          <select v-model.number="durationSeconds" :disabled="busy">
            <option v-for="option in CROWDDROP_DURATION_OPTIONS" :key="option.seconds" :value="option.seconds">
              {{ option.label }}
            </option>
          </select>
        </label>
        <button type="submit" class="primary" :disabled="busy || walletBusy || !walletReady">
          {{ busy ? 'Working…' : 'Create Drop' }}
        </button>
      </form>

      <div v-if="createdDropId" class="success">
        <p class="success-title">Drop {{ createdDropId }} created.</p>
        <p class="muted">Share this link:</p>
        <p class="link">{{ shareUrl }}</p>
        <p v-if="lastTxHash" class="hash">Tx: {{ lastTxHash }}</p>
        <div class="actions">
          <button type="button" class="primary" @click="copyLink">{{ copied ? 'Copied' : 'Copy Link' }}</button>
          <button type="button" class="secondary" @click="openDrop">Open Drop</button>
        </div>
      </div>
    </section>

    <DropLists />
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: Inter, system-ui, sans-serif;
  color: #141414;
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
  font-family: Inter, system-ui, sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #141414;
  letter-spacing: -0.02em;
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
  min-height: 36px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #C94E12;
  background: transparent;
  color: #C94E12;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.new-drop:active {
  background: #F3EBE4;
}
.home.creating .top {
  margin-bottom: 0.65rem;
}
.lede {
  margin: 0;
  color: var(--cd-tan);
  font-size: 0.95rem;
  line-height: 1.45;
  max-width: 22rem;
}
.create-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--cd-surface);
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  padding: 1rem;
  margin-bottom: 0.5rem;
  color: var(--cd-cream);
  font-family: var(--cd-font-sans);
}
.create-title {
  margin: 0;
  font-family: var(--cd-font-serif);
  font-size: 1.85rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.back {
  align-self: flex-start;
  min-height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--cd-tan);
  cursor: pointer;
  font-size: 0.9rem;
}
.form,
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.35rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
label span {
  color: var(--cd-tan);
  font-size: 0.82rem;
  font-weight: 500;
}
input,
select {
  min-height: 48px;
  border-radius: 14px;
  border: 1px solid var(--cd-border);
  background: var(--cd-surface-2);
  color: var(--cd-cream);
  padding: 0.75rem 0.9rem;
}
input:focus,
select:focus {
  outline: 1px solid var(--cd-orange);
  border-color: var(--cd-orange);
}
option {
  background: var(--cd-surface-2);
  color: var(--cd-cream);
}
button.primary,
button.secondary {
  min-height: 50px;
  border-radius: 14px;
  border: 1px solid transparent;
  padding: 0.85rem 1rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
button.primary {
  background: var(--cd-orange);
  color: var(--cd-cream);
}
button.primary:hover:not(:disabled) {
  background: var(--cd-orange-press);
}
button.secondary {
  background: transparent;
  color: var(--cd-cream);
  border-color: var(--cd-border);
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.error {
  margin: 0;
  color: var(--cd-error);
}
.wait {
  margin: 0;
  font-weight: 600;
}
.success-title {
  margin: 0;
  font-family: var(--cd-font-serif);
  font-size: 1.4rem;
}
.muted,
.hash,
.link {
  margin: 0.35rem 0 0;
  color: var(--cd-tan);
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}
.dev {
  color: var(--cd-muted);
}
pre {
  white-space: pre-wrap;
  font-size: 0.75rem;
}
</style>
