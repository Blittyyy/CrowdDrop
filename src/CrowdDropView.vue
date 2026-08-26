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
import { goToHome, saveLastOpenedDrop } from './lastOpenedDrop'
import {
  approvalCapLabel,
  formatMoneyLabel,
  formatRemainingShort,
  objectiveStatusLabel,
  progressRatio,
  spotsLeft,
} from './uiFormat'
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
  const short = formatRemainingShort(drop.value.deadline, nowSec.value)
  return short ? `${short} left` : null
})

const contributionMoney = computed(() =>
  drop.value ? formatMoneyLabel(drop.value.contribution, network.tokenDecimals) : '',
)
const escrowedMoney = computed(() =>
  drop.value ? formatMoneyLabel(drop.value.escrowed, network.tokenDecimals) : '',
)
const depositMoney = computed(() => formatMoneyLabel(deposit.value, network.tokenDecimals))
const progress = computed(() =>
  drop.value ? progressRatio(drop.value.buyerCount, drop.value.goal) : 0,
)
const spots = computed(() =>
  drop.value ? spotsLeft(drop.value.buyerCount, drop.value.goal) : 0,
)
const badge = computed(() => {
  if (!drop.value || !statusLabel.value)
    return 'UNKNOWN'
  return objectiveStatusLabel(statusLabel.value as 'Active' | 'Successful' | 'Expired' | 'Claimed' | 'Unknown', drop.value)
})
const progressMeta = computed(() => {
  if (!drop.value)
    return ''
  const joined = `${drop.value.buyerCount.toString()} of ${drop.value.goal.toString()} joined`
  if (statusLabel.value === 'Active')
    return `${joined} · ${spots.value} spot${spots.value === 1 ? '' : 's'} left${remaining.value ? ` · ${remaining.value}` : ''}`
  return joined
})
const sellerCopied = ref(false)

async function copySeller() {
  if (!drop.value)
    return
  try {
    await navigator.clipboard.writeText(drop.value.seller)
    sellerCopied.value = true
    window.setTimeout(() => {
      sellerCopied.value = false
    }, 1500)
  }
  catch {
    /* ignore */
  }
}

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
  <section class="drop-view">
    <header class="top">
      <a class="back" href="/?home=1" @click.prevent="goToHome">←</a>
      <p class="drop-meta">
        Drop #{{ dropId?.toString() ?? dropParam }}
        <template v-if="statusLabel"> · {{ statusLabel }}</template>
      </p>
    </header>

    <WalletBar compact :extra-busy="busy" />

    <p v-if="dropStatus || (requiredAction && !drop)" class="wait">
      {{ dropStatus ?? requiredAction }}
    </p>
    <p v-else-if="requiredAction && drop" class="wait warn">{{ requiredAction }}</p>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <details v-if="errorDetail" class="dev">
      <summary>Developer details</summary>
      <pre>{{ errorDetail }}</pre>
    </details>
    <p v-if="waitingLabel" class="wait">{{ waitingLabel }}</p>

    <div v-if="drop" class="hero-block">
      <template v-if="statusLabel === 'Successful'">
        <p class="state-kicker success-tone">{{ badge }}</p>
        <h1 class="headline">Drop Unlocked.</h1>
        <p class="hero-sub">
          {{ drop.buyerCount.toString() }} joined · {{ escrowedMoney }} pooled
        </p>
      </template>
      <template v-else-if="statusLabel === 'Claimed'">
        <p class="state-kicker success-tone">{{ badge }}</p>
        <h1 class="headline">Claimed.</h1>
        <p class="hero-sub">The seller has claimed the pooled funds.</p>
      </template>
      <template v-else-if="statusLabel === 'Expired'">
        <p class="state-kicker expired-tone">{{ badge }}</p>
        <h1 class="headline">Drop Expired.</h1>
        <p v-if="hasDeposit" class="hero-sub">Your contribution is available to withdraw.</p>
        <p v-else class="hero-sub">This Drop did not reach its goal.</p>
      </template>
      <template v-else>
        <h1 class="amount-hero">
          <span class="dollars">{{ contributionMoney }}</span>
          <span class="per">USDT per person</span>
        </h1>
        <div class="bar" aria-hidden="true">
          <span class="fill" :style="{ width: `${progress}%` }" />
        </div>
        <p class="progress-meta">{{ progressMeta }}</p>
        <div class="info-row">
          <span>{{ escrowedMoney }} pooled</span>
          <span>approval up to {{ approvalCapLabel() }}</span>
        </div>
        <p class="trust">
          Funds stay in the CrowdDrop contract until the goal is reached or the Drop expires. Only the creator can claim a successful Drop.
        </p>
      </template>

      <div class="seller">
        <span>Created by {{ shortenAddress(drop.seller) }}<template v-if="isSeller"> (you)</template></span>
        <button type="button" class="copy" :title="sellerCopied ? 'Copied' : 'Copy address'" @click="copySeller">
          {{ sellerCopied ? '✓' : '⎘' }}
        </button>
      </div>
    </div>

    <div v-if="drop" class="divider" />

    <div v-if="drop && isSeller && walletReady" class="actions">
      <p v-if="statusLabel === 'Active'" class="note">Waiting for buyers.</p>
      <p v-if="statusLabel === 'Successful'" class="note">Goal reached. Funds are ready to claim.</p>
      <p v-if="statusLabel === 'Expired'" class="note">Buyers can withdraw their deposits. You cannot claim.</p>
      <p v-if="statusLabel === 'Claimed'" class="note">This Drop is complete.</p>
      <button
        v-if="canClaim"
        type="button"
        class="primary success"
        :disabled="busy"
        @click="claim"
      >
        Claim {{ escrowedMoney }} USDT
      </button>
    </div>

    <div v-else-if="drop && walletReady" class="actions">
      <div v-if="hasDeposit && statusLabel === 'Active'" class="joined">
        <p class="joined-title">✓ You’re in this Drop</p>
        <p class="joined-copy">
          Your {{ formatTokenAmount(deposit, network.tokenDecimals) }} USDT is pooled and waiting on the rest.
        </p>
      </div>

      <p v-if="statusLabel === 'Successful' && hasDeposit" class="note">
        This Drop succeeded. Funds are locked for the seller to claim.
      </p>
      <p v-if="statusLabel === 'Claimed'" class="note">This Drop is complete.</p>

      <p v-if="canApprove && insufficientBalance" class="error">
        Not enough {{ tokenLabel }} to join.
      </p>
      <p v-if="canApprove && needsApprovalReset" class="note">
        Nimiq Pay will ask you to confirm twice: first to reset the old allowance, then to enable CrowdDrop.
      </p>

      <button
        v-if="canApprove"
        type="button"
        class="primary"
        :disabled="busy"
        @click="approve"
      >
        Enable CrowdDrop
      </button>
      <p v-if="canApprove" class="support">
        One-time approval, reusable across future Drops up to {{ approvalCapLabel() }} USDT.
      </p>

      <button
        v-if="canJoin"
        type="button"
        class="primary"
        :disabled="busy"
        @click="join"
      >
        Join for {{ contributionMoney }} USDT
      </button>

      <p v-if="statusLabel === 'Active' && !hasDeposit && !needsApproval && insufficientBalance" class="error">
        Not enough {{ tokenLabel }} to join.
      </p>

      <button
        v-if="canWithdraw"
        type="button"
        class="ghost"
        :disabled="busy"
        @click="withdraw"
      >
        Withdraw {{ depositMoney }} USDT
      </button>
    </div>

    <div class="footer-actions">
      <button type="button" class="text-btn" :disabled="busy || walletBusy" @click="loadDrop">Refresh</button>
      <p v-if="lastTxHash" class="hash">Last tx: {{ lastTxHash }}</p>
    </div>
  </section>
</template>

<style scoped>
.drop-view {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.back {
  color: var(--cd-cream);
  text-decoration: none;
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.25rem 0.15rem;
}
.drop-meta {
  margin: 0;
  color: var(--cd-tan);
  font-size: 0.82rem;
}
.hero-block {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin-top: 0.35rem;
}
.state-kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.success-tone {
  color: var(--cd-success-text);
}
.expired-tone {
  color: var(--cd-expired);
}
.headline {
  margin: 0;
  font-family: var(--cd-font-serif);
  font-size: clamp(2rem, 7vw, 2.4rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
}
.amount-hero {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.dollars {
  font-family: var(--cd-font-serif);
  font-size: clamp(2.6rem, 10vw, 3.4rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--cd-cream);
}
.per,
.hero-sub {
  margin: 0;
  color: var(--cd-tan);
  font-size: 0.92rem;
}
.bar {
  height: 5px;
  border-radius: 999px;
  background: #2a2a2a;
  overflow: hidden;
  margin-top: 0.25rem;
}
.fill {
  display: block;
  height: 100%;
  background: var(--cd-orange);
}
.progress-meta,
.info-row,
.trust,
.seller,
.note,
.support {
  margin: 0;
  color: var(--cd-tan);
  font-size: 0.84rem;
  line-height: 1.4;
}
.info-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.trust {
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--cd-muted);
}
.seller {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
}
.copy {
  border: none;
  background: transparent;
  color: var(--cd-muted);
  cursor: pointer;
  padding: 0.15rem 0.25rem;
  font-size: 0.9rem;
}
.divider {
  height: 1px;
  background: var(--cd-border);
  margin: 0.35rem 0;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.joined {
  background: var(--cd-joined);
  border: 1px solid var(--cd-joined-border);
  border-radius: var(--cd-radius);
  padding: 1rem;
}
.joined-title {
  margin: 0 0 0.35rem;
  color: var(--cd-cream);
  font-weight: 700;
}
.joined-copy {
  margin: 0;
  color: var(--cd-tan);
  font-size: 0.88rem;
  line-height: 1.4;
}
button.primary,
button.ghost {
  min-height: 50px;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
button.primary {
  background: var(--cd-orange);
  color: var(--cd-cream);
  border: 1px solid transparent;
}
button.primary.success {
  background: var(--cd-success);
}
button.ghost {
  background: transparent;
  color: var(--cd-cream);
  border: 1px solid var(--cd-border);
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.support {
  text-align: center;
  font-size: 0.78rem;
}
.wait {
  margin: 0;
  font-weight: 600;
  color: var(--cd-cream);
}
.wait.warn {
  color: var(--cd-orange);
}
.error {
  margin: 0;
  color: var(--cd-error);
}
.footer-actions {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
.text-btn {
  align-self: flex-start;
  border: none;
  background: transparent;
  color: var(--cd-muted);
  cursor: pointer;
  padding: 0.25rem 0;
  font-size: 0.82rem;
}
.hash,
.dev {
  font-size: 0.75rem;
  color: var(--cd-muted);
  overflow-wrap: anywhere;
}
pre {
  white-space: pre-wrap;
  font-size: 0.72rem;
}
</style>
