<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { crowdDropAbi, DROP_STATUS_LABELS } from './crowdDropAbi'
import { erc20Abi } from './erc20Abi'
import { activeCrowdDropNetwork } from './escrowConfig'
import {
  decodeCall,
  ethCall,
  sendTx,
  waitForReceipt,
} from './evm'
import { formatTokenAmount } from './tokenMath'
import { planTokenApproval, reusableApprovalAmount } from './tokenAllowance'
import {
  developerErrorDetail,
  friendlyUserError,
  isTransientReadError,
  isUnknownDropError,
} from './userErrors'
import { isUserRejection, sameAddress, shortenAddress } from './wallet'
import { goToCreateDrop, goToHome, saveLastOpenedDrop } from './lastOpenedDrop'
import WalletBar from './WalletBar.vue'
import {
  confirmActiveChain,
  walletAccount,
  walletBusy,
  walletChecking,
  walletOnActiveNetwork,
  walletReady,
} from './walletSession'

const props = defineProps<{
  dropParam: string
}>()

const network = activeCrowdDropNetwork

type DropData = {
  seller: `0x${string}`
  contribution: bigint
  goal: bigint
  deadline: bigint
  buyerCount: bigint
  escrowed: bigint
  claimed: boolean
}

const busy = ref(false)
const waitingLabel = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const errorDetail = ref<string | null>(null)
const loadError = ref<string | null>(null)
const drop = ref<DropData | null>(null)
const statusLabel = ref<string | null>(null)
const deposit = ref<bigint>(0n)
const tokenBalance = ref<bigint>(0n)
const allowance = ref<bigint>(0n)
const lastTxHash = ref<string | null>(null)
const nowSec = ref(Math.floor(Date.now() / 1000))
const dropStatus = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let loadGeneration = 0
let chainSettleRetries = 0

const dropId = computed(() => {
  if (!/^\d+$/.test(props.dropParam.trim()))
    return null
  try {
    const value = BigInt(props.dropParam.trim())
    return value > 0n ? value : null
  }
  catch {
    return null
  }
})

const isSeller = computed(() => sameAddress(walletAccount.value, drop.value?.seller))
const hasDeposit = computed(() => deposit.value > 0n)
const needsApproval = computed(() => {
  if (!drop.value)
    return false
  return allowance.value < drop.value.contribution
})
const canJoin = computed(() => {
  if (!drop.value || !walletAccount.value || isSeller.value || hasDeposit.value)
    return false
  return statusLabel.value === 'Active' && !needsApproval.value && tokenBalance.value >= drop.value.contribution
})
const canApprove = computed(() => {
  if (!drop.value || !walletAccount.value || isSeller.value || hasDeposit.value)
    return false
  return statusLabel.value === 'Active' && needsApproval.value
})
const approvalPlan = computed(() => {
  if (!drop.value)
    return { kind: 'none' as const }
  return planTokenApproval(
    allowance.value,
    drop.value.contribution,
    network.reusableAllowanceUnits,
    network.requiresAllowanceReset,
  )
})
const needsApprovalReset = computed(() => approvalPlan.value.kind === 'reset-then-approve')
const canWithdraw = computed(() => {
  if (!hasDeposit.value || isSeller.value)
    return false
  return statusLabel.value === 'Active' || statusLabel.value === 'Expired'
})
const canClaim = computed(() => isSeller.value && statusLabel.value === 'Successful')
const tokenLabel = computed(() => network.tokenSymbol)
const insufficientBalance = computed(() => {
  if (!drop.value)
    return false
  return tokenBalance.value < drop.value.contribution
})
const requiredAction = computed(() => {
  if (walletChecking.value || walletBusy.value)
    return null
  if (!walletAccount.value)
    return 'Reconnect wallet to join, withdraw, or claim.'
  if (!walletOnActiveNetwork.value)
    return `Switch to ${network.chainName} to continue.`
  return null
})

const remaining = computed(() => {
  if (!drop.value || statusLabel.value !== 'Active')
    return null
  const left = Number(drop.value.deadline) - nowSec.value
  if (left <= 0)
    return 'ending now'
  const hours = Math.floor(left / 3600)
  const minutes = Math.floor((left % 3600) / 60)
  const seconds = left % 60
  if (hours >= 48)
    return `${Math.floor(hours / 24)}d ${hours % 24}h left`
  if (hours >= 1)
    return `${hours}h ${minutes}m left`
  return `${minutes}m ${seconds}s left`
})

function setError(error: unknown) {
  errorMessage.value = friendlyUserError(error)
  errorDetail.value = developerErrorDetail(error)
}

function asDrop(decoded: DropData | readonly unknown[]): DropData {
  if (Array.isArray(decoded)) {
    return {
      seller: decoded[0] as `0x${string}`,
      contribution: decoded[1] as bigint,
      goal: decoded[2] as bigint,
      deadline: decoded[3] as bigint,
      buyerCount: decoded[4] as bigint,
      escrowed: decoded[5] as bigint,
      claimed: Boolean(decoded[6]),
    }
  }
  return decoded as DropData
}

async function loadPersonalState(id: bigint) {
  if (!walletAccount.value) {
    deposit.value = 0n
    tokenBalance.value = 0n
    allowance.value = 0n
    return
  }
  const [depositHex, balanceHex, allowanceHex] = await Promise.all([
    ethCall(network.crowdDropAddress, crowdDropAbi, 'depositOf', [id, walletAccount.value]),
    ethCall(network.tokenAddress, erc20Abi, 'balanceOf', [walletAccount.value]),
    ethCall(network.tokenAddress, erc20Abi, 'allowance', [walletAccount.value, network.crowdDropAddress]),
  ])
  deposit.value = decodeCall<bigint>(crowdDropAbi, 'depositOf', depositHex)
  tokenBalance.value = decodeCall<bigint>(erc20Abi, 'balanceOf', balanceHex)
  allowance.value = decodeCall<bigint>(erc20Abi, 'allowance', allowanceHex)
}

async function readPublicDrop(id: bigint): Promise<DropData> {
  const dropHex = await ethCall(network.crowdDropAddress, crowdDropAbi, 'getDrop', [id])
  const parsed = asDrop(decodeCall<DropData | readonly unknown[]>(crowdDropAbi, 'getDrop', dropHex))
  if (parsed.seller === '0x0000000000000000000000000000000000000000')
    throw new Error('unknown drop')
  const statusHex = await ethCall(network.crowdDropAddress, crowdDropAbi, 'statusOf', [id])
  const status = Number(decodeCall<bigint | number>(crowdDropAbi, 'statusOf', statusHex))
  statusLabel.value = DROP_STATUS_LABELS[status] ?? 'Unknown'
  return parsed
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function loadDrop() {
  const gen = ++loadGeneration
  loadError.value = null
  errorDetail.value = null

  if (!dropId.value) {
    loadError.value = 'This drop ID is not valid.'
    drop.value = null
    dropStatus.value = null
    return
  }

  const id = dropId.value

  if (walletChecking.value || walletBusy.value || !window.ethereum) {
    dropStatus.value = walletBusy.value
      ? `Waiting for ${network.chainName}…`
      : `Loading Drop ${id.toString()}…`
    return
  }

  dropStatus.value = `Waiting for ${network.chainName}…`
  let onActiveChain = false
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (gen !== loadGeneration)
      return
    try {
      onActiveChain = await confirmActiveChain()
      if (onActiveChain)
        break
      if (attempt < 3) {
        await sleep(400)
        continue
      }
    }
    catch (error) {
      if (gen !== loadGeneration)
        return
      if (isUserRejection(error)) {
        loadError.value = 'Request cancelled.'
        errorDetail.value = developerErrorDetail(error)
        dropStatus.value = null
        return
      }
      if (attempt < 3) {
        await sleep(400)
        continue
      }
      dropStatus.value = `Waiting for ${network.chainName}…`
      return
    }
  }
  if (gen !== loadGeneration)
    return
  if (!onActiveChain) {
    if ((walletOnActiveNetwork.value || walletBusy.value) && chainSettleRetries < 6) {
      chainSettleRetries += 1
      dropStatus.value = `Waiting for ${network.chainName}…`
      window.setTimeout(() => {
        if (gen === loadGeneration)
          void loadDrop()
      }, 400)
      return
    }
    chainSettleRetries = 0
    dropStatus.value = `Switch to ${network.chainName} to load this drop.`
    return
  }
  chainSettleRetries = 0

  dropStatus.value = `Loading Drop ${id.toString()}…`
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (gen !== loadGeneration)
      return
    try {
      const stillActive = await confirmActiveChain()
      if (gen !== loadGeneration)
        return
      if (!stillActive) {
        dropStatus.value = `Waiting for ${network.chainName}…`
        return
      }
      const parsed = await readPublicDrop(id)
      if (gen !== loadGeneration)
        return
      drop.value = parsed
      await loadPersonalState(id)
      if (gen !== loadGeneration)
        return
      dropStatus.value = null
      loadError.value = null
      return
    }
    catch (error) {
      if (gen !== loadGeneration)
        return
      if (isUserRejection(error)) {
        loadError.value = 'Request cancelled.'
        errorDetail.value = developerErrorDetail(error)
        dropStatus.value = null
        return
      }
      if (isUnknownDropError(error)) {
        loadError.value = 'Drop not found.'
        errorDetail.value = developerErrorDetail(error)
        dropStatus.value = null
        return
      }
      const chainOk = await confirmActiveChain().catch(() => false)
      if (gen !== loadGeneration)
        return
      if (!chainOk) {
        dropStatus.value = `Waiting for ${network.chainName}…`
        return
      }
      const canRetry = isTransientReadError(error) && attempt < maxAttempts
      if (canRetry) {
        dropStatus.value = `Loading Drop ${id.toString()}…`
        await sleep(400)
        continue
      }
      loadError.value = 'Could not load this drop. Try again.'
      errorDetail.value = developerErrorDetail(error)
      dropStatus.value = null
      return
    }
  }
}

async function runAction(label: string, work: () => Promise<string>) {
  errorMessage.value = null
  errorDetail.value = null
  if (!walletAccount.value) {
    errorMessage.value = 'Reconnect wallet before continuing.'
    return
  }
  if (!walletOnActiveNetwork.value) {
    errorMessage.value = `Switch to ${network.chainName} before continuing.`
    return
  }
  busy.value = true
  waitingLabel.value = `Confirm ${label} in Nimiq Pay…`
  try {
    const hash = await work()
    lastTxHash.value = hash
    waitingLabel.value = 'Waiting for confirmation…'
    await waitForReceipt(hash)
    await loadDrop()
  }
  catch (error) {
    setError(error)
  }
  finally {
    waitingLabel.value = null
    busy.value = false
  }
}

function approve() {
  if (!drop.value)
    return
  const spender = network.crowdDropAddress
  if (!spender)
    return
  const plan = planTokenApproval(
    allowance.value,
    drop.value.contribution,
    network.reusableAllowanceUnits,
    network.requiresAllowanceReset,
  )
  if (plan.kind === 'none')
    return
  const amount = reusableApprovalAmount(drop.value.contribution, network.reusableAllowanceUnits)
  return runAction('Enable CrowdDrop', async () => {
    if (plan.kind === 'reset-then-approve') {
      waitingLabel.value = 'Confirm the reset in Nimiq Pay. A second confirmation will enable CrowdDrop…'
      const resetHash = await sendTx(network.tokenAddress, erc20Abi, 'approve', [spender, 0n])
      lastTxHash.value = resetHash
      await waitForReceipt(resetHash)
      waitingLabel.value = 'Confirm Enable CrowdDrop in Nimiq Pay…'
    }
    return sendTx(network.tokenAddress, erc20Abi, 'approve', [spender, amount])
  })
}

function join() {
  if (!dropId.value)
    return
  return runAction('Join', () => sendTx(network.crowdDropAddress, crowdDropAbi, 'join', [dropId.value]))
}

function withdraw() {
  if (!dropId.value)
    return
  return runAction('Withdraw', () => sendTx(network.crowdDropAddress, crowdDropAbi, 'withdraw', [dropId.value]))
}

function claim() {
  if (!dropId.value)
    return
  return runAction('Claim', () => sendTx(network.crowdDropAddress, crowdDropAbi, 'claim', [dropId.value]))
}

watch(
  [walletChecking, walletBusy, walletOnActiveNetwork, walletAccount],
  () => {
    void loadDrop()
  },
)

onMounted(() => {
  timer = setInterval(() => {
    nowSec.value = Math.floor(Date.now() / 1000)
  }, 1000)
  if (dropId.value)
    saveLastOpenedDrop(dropId.value.toString())
  void loadDrop()
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
})
</script>

<template>
  <section class="card">
    <p class="nav">
      <a href="/?home=1" @click.prevent="goToHome">← Home</a>
      <a href="/?home=1" @click.prevent="goToCreateDrop">New Drop</a>
    </p>
    <h1>Drop {{ dropId?.toString() ?? dropParam }}</h1>

    <WalletBar :extra-busy="busy" />
    <p v-if="dropStatus || (requiredAction && !drop)" class="wait">
      {{ dropStatus ?? requiredAction }}
    </p>
    <p v-else-if="requiredAction && drop" class="wait">{{ requiredAction }}</p>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <details v-if="errorDetail" class="dev">
      <summary>Developer details</summary>
      <pre>{{ errorDetail }}</pre>
    </details>
    <p v-if="waitingLabel" class="wait">{{ waitingLabel }}</p>
    <p v-if="lastTxHash" class="hash">Last tx: {{ lastTxHash }}</p>

    <div class="actions">
      <button type="button" :disabled="busy || walletBusy" @click="loadDrop">Refresh</button>
    </div>

    <div v-if="drop" class="details">
      <p>Seller: {{ shortenAddress(drop.seller) }} <span v-if="isSeller">(you)</span></p>
      <p>Contribution: {{ formatTokenAmount(drop.contribution, network.tokenDecimals) }} {{ tokenLabel }}</p>
      <p>Buyers: {{ drop.buyerCount.toString() }} / {{ drop.goal.toString() }}</p>
      <p>Escrowed: {{ formatTokenAmount(drop.escrowed, network.tokenDecimals) }} {{ tokenLabel }}</p>
      <p>Deadline: {{ new Date(Number(drop.deadline) * 1000).toLocaleString() }}</p>
      <p v-if="remaining">Time remaining: {{ remaining }}</p>
      <p>Status: <strong>{{ statusLabel }}</strong></p>
      <p v-if="walletAccount">Your {{ tokenLabel }}: {{ formatTokenAmount(tokenBalance, network.tokenDecimals) }}</p>
    </div>

    <div v-if="drop && isSeller && walletReady" class="panel">
      <p v-if="statusLabel === 'Active'">Waiting for buyers.</p>
      <p v-if="statusLabel === 'Successful'">Goal reached. Funds are ready to claim.</p>
      <p v-if="statusLabel === 'Expired'">This drop did not reach its goal. Buyers can withdraw their deposits. You cannot claim.</p>
      <p v-if="statusLabel === 'Claimed'">This drop is complete. You claimed the escrowed funds. Escrowed is now 0 {{ tokenLabel }}.</p>
      <button
        v-if="canClaim"
        type="button"
        :disabled="busy"
        @click="claim"
      >
        Claim {{ formatTokenAmount(drop.escrowed, network.tokenDecimals) }} {{ tokenLabel }}
      </button>
    </div>

    <div v-else-if="drop && walletReady" class="panel">
      <p v-if="hasDeposit">
        You joined with {{ formatTokenAmount(deposit, network.tokenDecimals) }} {{ tokenLabel }}
      </p>
      <p v-if="statusLabel === 'Successful' && hasDeposit">
        This drop succeeded. Funds are locked for the seller to claim. You cannot withdraw.
      </p>
      <p v-if="statusLabel === 'Expired' && hasDeposit">
        This drop did not reach its goal. You can withdraw your deposit.
      </p>
      <p v-if="statusLabel === 'Claimed'">This drop is complete.</p>
      <p v-if="canApprove && insufficientBalance" class="error">
        Not enough {{ tokenLabel }} to join.
      </p>
      <p v-if="canApprove" class="note">
        Allow CrowdDrop to use {{ tokenLabel }} when you choose to join drops. You will only be charged when you join.
      </p>
      <p v-if="canApprove && needsApprovalReset" class="note">
        Nimiq Pay will ask you to confirm twice: first to reset the old allowance, then to enable CrowdDrop.
      </p>
      <button
        v-if="canApprove"
        type="button"
        :disabled="busy"
        @click="approve"
      >
        Enable CrowdDrop
      </button>
      <button
        v-if="canJoin"
        type="button"
        :disabled="busy"
        @click="join"
      >
        Join with {{ formatTokenAmount(drop.contribution, network.tokenDecimals) }} {{ tokenLabel }}
      </button>
      <p v-if="statusLabel === 'Active' && !hasDeposit && !needsApproval && insufficientBalance" class="error">
        Not enough {{ tokenLabel }} to join.
      </p>
      <button
        v-if="canWithdraw"
        type="button"
        :disabled="busy"
        @click="withdraw"
      >
        Withdraw {{ formatTokenAmount(deposit, network.tokenDecimals) }} {{ tokenLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.card {
  background: #fff;
  border: 1px solid #ddd;
  padding: 1rem;
}
.nav {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
p,
h1,
a {
  overflow-wrap: anywhere;
}
.error {
  color: #a40000;
}
.wait {
  font-weight: 600;
}
.actions,
.panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
}
.details {
  margin-top: 1rem;
}
button {
  min-height: 44px;
  font-size: 1rem;
  padding: 0.75rem;
}
.hash,
.dev,
.note {
  font-size: 0.85rem;
}
pre {
  white-space: pre-wrap;
  font-size: 0.75rem;
}
</style>
