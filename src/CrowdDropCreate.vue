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

function setError(error: unknown) {
  errorMessage.value = friendlyUserError(error)
  errorDetail.value = developerErrorDetail(error)
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
  <section class="card">
    <h1>Create a CrowdDrop</h1>
    <p class="lede">Sellers create a drop, then share the link. Buyers enable CrowdDrop once, then join separately.</p>
    <p>{{ network.tokenSymbol }} on {{ network.chainName }}</p>

    <WalletBar :extra-busy="busy" />

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <details v-if="errorDetail" class="dev">
      <summary>Developer details</summary>
      <pre>{{ errorDetail }}</pre>
    </details>
    <p v-if="waitingLabel" class="wait">{{ waitingLabel }}</p>

    <form class="form" @submit.prevent="createDrop">
      <label>
        Contribution per person ({{ network.tokenSymbol }})
        <input v-model="contributionInput" type="text" inputmode="decimal" autocomplete="off" :disabled="busy">
      </label>
      <label>
        Number of buyers required
        <input v-model="goalInput" type="number" :min="network.minGoal" :max="network.maxGoal" step="1" :disabled="busy">
      </label>
      <label>
        Duration
        <select v-model.number="durationSeconds" :disabled="busy">
          <option v-for="option in CROWDDROP_DURATION_OPTIONS" :key="option.seconds" :value="option.seconds">
            {{ option.label }}
          </option>
        </select>
      </label>
      <button type="submit" :disabled="busy || walletBusy || !walletReady">
        {{ busy ? 'Working…' : 'Create Drop' }}
      </button>
    </form>

    <div v-if="createdDropId" class="success">
      <p><strong>Drop {{ createdDropId }} created.</strong></p>
      <p>Share this link:</p>
      <p class="link">{{ shareUrl }}</p>
      <p v-if="lastTxHash" class="hash">Tx: {{ lastTxHash }}</p>
      <div class="actions">
        <button type="button" @click="copyLink">{{ copied ? 'Copied' : 'Copy Link' }}</button>
        <button type="button" @click="openDrop">Open Drop</button>
      </div>
    </div>
  </section>

  <DropLists />
</template>

<style scoped>
.card {
  background: #fff;
  border: 1px solid #ddd;
  padding: 1rem;
}
.lede,
p,
h1 {
  overflow-wrap: anywhere;
}
.error {
  color: #a40000;
}
.wait {
  font-weight: 600;
}
.form,
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
}
input,
select,
button {
  min-height: 44px;
  font-size: 1rem;
  padding: 0.75rem;
}
.success {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid #ddd;
}
.link,
.hash {
  font-size: 0.9rem;
}
.dev {
  margin: 0.5rem 0;
}
pre {
  white-space: pre-wrap;
  font-size: 0.75rem;
}
</style>
