<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { crowdDropAbi, DROP_STATUS_LABELS, type DropStatusLabel } from './crowdDropAbi'
import { erc20Abi } from './erc20Abi'
import { activeCrowdDropNetwork, REUSABLE_ALLOWANCE_TOKENS } from './escrowConfig'
import {
  decodeCall,
  ethCall,
  sendTx,
  waitForReceipt,
} from './evm'
import { formatTokenAmount, dropClaimedTotalUnits } from './tokenMath'
import { planTokenApproval, reusableApprovalAmount } from './tokenAllowance'
import {
  developerErrorDetail,
  friendlyUserError,
  isTransientReadError,
  isUnknownDropError,
} from './userErrors'
import { sameAddress, shortenAddress } from './wallet'
import { goBackOrHome, saveLastOpenedDrop } from './lastOpenedDrop'
import {
  formatHomeAmount,
  formatRemainingShort,
  spotsLeft,
} from './uiFormat'
import ParticipantDots from './ParticipantDots.vue'
import DropParticipants from './DropParticipants.vue'
import ClaimCompleteMotionContent from './motion/ClaimCompleteMotionContent.vue'
import DropSuccessMotionContent from './motion/DropSuccessMotionContent.vue'
import {
  createLocalMotionSeenStorage,
  hasSeenClaimMotion,
  hasSeenSuccessMotion,
  markClaimMotionSeen,
  markSuccessMotionSeen,
  type MotionSeenScope,
} from './motion/motionSeenStorage'
import { shouldAnimateClaim, shouldAnimateSuccess } from './motion/motionTriggers'
import {
  MOTION_MOUNT_TICKS,
  motionPlaySideEffects,
  nextMotionPlayAttempt,
  shouldSkipMotionEvaluation,
} from './motion/motionPlayback'
import {
  shouldShowStaticClaimedUi,
  visibleStatusLabel as resolveVisibleStatus,
} from './motion/claimTransition'
import {
  ACTIVE_DROP_POLL_MS,
  canStartPollTick,
  participantsNeedReload,
  shouldPausePolling,
  shouldPollDrop,
  snapshotFromDrop,
} from './dropDetailPolling'
import { dropShareUrl, shareDropLink } from './shareDrop'
import { isUserRejection } from './txRequest'
import WalletBar from './WalletBar.vue'
import {
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
const refreshError = ref<string | null>(null)
const refreshing = ref(false)
const participantReloadToken = ref(0)
const drop = ref<DropData | null>(null)
const statusLabel = ref<DropStatusLabel | 'Unknown' | null>(null)
const deposit = ref<bigint>(0n)
const tokenBalance = ref<bigint>(0n)
const allowance = ref<bigint>(0n)
const lastTxHash = ref<string | null>(null)
const nowSec = ref(Math.floor(Date.now() / 1000))
const dropStatus = ref<string | null>(null)
const personalReady = ref(false)
const successMotionActive = ref(false)
const successUiReady = ref(true)
const claimMotionActive = ref(false)
const claimUiReady = ref(true)
const claimReceiptConfirmed = ref(false)
const claimTransitionActive = ref(false)
const claimTransitionAmount = ref('')
const claimingInFlight = ref(false)
const pendingClaimedDrop = ref<DropData | null>(null)
const pendingClaimedStatus = ref<DropStatusLabel | 'Unknown' | null>(null)
const successMotionRef = ref<InstanceType<typeof DropSuccessMotionContent> | null>(null)
const claimMotionRef = ref<InstanceType<typeof ClaimCompleteMotionContent> | null>(null)
const motionSeen = createLocalMotionSeenStorage()
/** True while waiting for Nimiq Pay to return a tx hash (swipe-dismiss recoverable). */
const awaitingWalletConfirm = ref(false)
let clockTimer: ReturnType<typeof setInterval> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let pollInFlight = false
let loadGeneration = 0
let actionAbort: AbortController | null = null
let claimPlayToken = 0
let successPlayToken = 0

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
const canClaim = computed(() =>
  isSeller.value
  && statusLabel.value === 'Successful'
  && !claimTransitionActive.value
  && !claimingInFlight.value
  && !claimMotionActive.value,
)
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
  return formatRemainingShort(drop.value.deadline, nowSec.value)
})

const contributionHome = computed(() =>
  drop.value ? formatHomeAmount(drop.value.contribution, network.tokenDecimals) : '',
)
const contributionPlain = computed(() =>
  drop.value ? formatTokenAmount(drop.value.contribution, network.tokenDecimals) : '',
)
const escrowedPlain = computed(() =>
  drop.value ? formatTokenAmount(drop.value.escrowed, network.tokenDecimals) : '',
)
const claimedPlain = computed(() =>
  drop.value
    ? formatTokenAmount(dropClaimedTotalUnits(drop.value.contribution, drop.value.goal), network.tokenDecimals)
    : '',
)
const showClaimedFundsLine = computed(() =>
  statusLabel.value === 'Claimed' || visibleStatusLabel.value === 'Claimed',
)
const fundsLine = computed(() =>
  showClaimedFundsLine.value
    ? `${claimedPlain.value} ${tokenLabel.value} claimed`
    : `${escrowedPlain.value} ${tokenLabel.value} pooled`,
)
const depositPlain = computed(() => formatTokenAmount(deposit.value, network.tokenDecimals))
const spots = computed(() =>
  drop.value ? spotsLeft(drop.value.buyerCount, drop.value.goal) : 0,
)
const progressLine = computed(() => {
  if (!drop.value)
    return ''
  const base = `${drop.value.buyerCount.toString()} / ${drop.value.goal.toString()} joined`
  if (visibleStatusLabel.value === 'Active')
    return `${base} · ${spots.value} spot${spots.value === 1 ? '' : 's'} left`
  return base
})
const dotsTone = computed(() => {
  const status = visibleStatusLabel.value
  if (status === 'Successful' || status === 'Claimed')
    return 'success' as const
  if (status === 'Expired')
    return 'expired' as const
  return 'orange' as const
})

const visibleStatusLabel = computed(() =>
  resolveVisibleStatus(statusLabel.value, claimTransitionActive.value),
)

const showStaticClaimedUi = computed(() =>
  shouldShowStaticClaimedUi(statusLabel.value, claimTransitionActive.value, claimUiReady.value),
)
const waitingBuyersLine = computed(() => {
  const n = spots.value
  if (n <= 0)
    return 'Goal reached.'
  return `Waiting for ${n} more buyer${n === 1 ? '' : 's'}.`
})

/** Active Drop, non-seller — shared utility Drop Detail chrome (prospective or joined). */
const isActiveBuyerDetail = computed(() =>
  Boolean(drop.value)
  && statusLabel.value === 'Active'
  && !isSeller.value,
)

const isActiveSellerDetail = computed(() =>
  Boolean(drop.value)
  && statusLabel.value === 'Active'
  && isSeller.value,
)

/** Confirmed deposit > 0 on Active Drop — Joined Buyer personal state. */
const isJoinedBuyerSurface = computed(() =>
  isActiveBuyerDetail.value
  && personalReady.value
  && hasDeposit.value,
)

/** Active Drop, buyer role, not yet joined — Enable / Join surface. */
const isActiveBuyerSurface = computed(() =>
  isActiveBuyerDetail.value
  && !hasDeposit.value,
)

const buyerEligibilityPending = computed(() =>
  isActiveBuyerDetail.value
  && Boolean(walletAccount.value)
  && (walletChecking.value || !personalReady.value),
)

const showEnableCrowdDrop = computed(() =>
  isActiveBuyerSurface.value
  && personalReady.value
  && !walletChecking.value
  && Boolean(walletAccount.value)
  && walletOnActiveNetwork.value
  && canApprove.value,
)

const showJoinCrowdDrop = computed(() =>
  isActiveBuyerSurface.value
  && personalReady.value
  && !walletChecking.value
  && Boolean(walletAccount.value)
  && walletOnActiveNetwork.value
  && canJoin.value,
)

const showJoinedWithdraw = computed(() =>
  isJoinedBuyerSurface.value
  && canWithdraw.value
  && Boolean(walletAccount.value)
  && walletOnActiveNetwork.value
  && !walletChecking.value,
)

const showExpiredWithdraw = computed(() =>
  statusLabel.value === 'Expired'
  && hasDeposit.value
  && !isSeller.value
  && personalReady.value
  && Boolean(walletAccount.value)
  && walletOnActiveNetwork.value
  && !walletChecking.value
  && canWithdraw.value,
)

const sellerCopied = ref(false)
const shareFeedback = ref<string | null>(null)

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

async function shareDrop() {
  if (!dropId.value)
    return
  shareFeedback.value = null
  const url = dropShareUrl(dropId.value)
  try {
    const result = await shareDropLink(url)
    shareFeedback.value = result === 'copied' ? 'Link copied' : null
    if (shareFeedback.value) {
      window.setTimeout(() => {
        shareFeedback.value = null
      }, 1600)
    }
  }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError')
      return
    try {
      await navigator.clipboard.writeText(url)
      shareFeedback.value = 'Link copied'
      window.setTimeout(() => {
        shareFeedback.value = null
      }, 1600)
    }
    catch {
      shareFeedback.value = 'Couldn’t share'
      window.setTimeout(() => {
        shareFeedback.value = null
      }, 1600)
    }
  }
}

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
  awaitingWalletConfirm.value = false
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

function resetMotionUiState() {
  claimPlayToken += 1
  successPlayToken += 1
  successMotionActive.value = false
  successUiReady.value = true
  claimMotionActive.value = false
  claimUiReady.value = true
  claimReceiptConfirmed.value = false
  claimTransitionActive.value = false
  claimTransitionAmount.value = ''
  claimingInFlight.value = false
  pendingClaimedDrop.value = null
  pendingClaimedStatus.value = null
}

function motionScope(): MotionSeenScope | null {
  if (!dropId.value || !walletAccount.value)
    return null
  return {
    chainId: network.chainDecimal,
    contractAddress: network.crowdDropAddress,
    dropId: dropId.value.toString(),
    walletAddress: walletAccount.value,
  }
}

function dropEscrowed(): bigint {
  return drop.value?.escrowed ?? 0n
}

function shouldPollNow(): boolean {
  return shouldPollDrop(statusLabel.value, dropEscrowed())
}

type MotionPlayer = { play: () => void }

async function mountAndPlayMotion(
  kind: 'claim' | 'success',
  token: number,
  motionStillActive: () => boolean,
  getRef: () => MotionPlayer | null,
  onPlayStarted: () => void,
) {
  let ticks = MOTION_MOUNT_TICKS
  while (true) {
    await nextTick()
    const currentToken = kind === 'claim' ? claimPlayToken : successPlayToken
    if (token !== currentToken || !motionStillActive())
      return

    const attempt = nextMotionPlayAttempt(motionStillActive(), getRef() !== null, ticks)
    const fx = motionPlaySideEffects(attempt, kind)

    if (attempt === 'play') {
      getRef()?.play()
      onPlayStarted()
      return
    }

    if (fx.resetMotionUi) {
      if (kind === 'claim') {
        if (pendingClaimedDrop.value)
          commitClaimedState()
        else {
          claimMotionActive.value = false
          claimUiReady.value = true
          claimTransitionActive.value = false
          claimingInFlight.value = false
        }
      }
      else {
        successMotionActive.value = false
        successUiReady.value = true
      }
      return
    }

    if (attempt === 'wait') {
      ticks -= 1
      continue
    }

    return
  }
}

function beginClaimMotionPlayback() {
  const token = ++claimPlayToken
  void mountAndPlayMotion(
    'claim',
    token,
    () => claimMotionActive.value,
    () => claimMotionRef.value,
    () => {
      claimReceiptConfirmed.value = false
      const scope = motionScope()
      if (scope)
        markClaimMotionSeen(scope, motionSeen)
    },
  )
}

function beginSuccessMotionPlayback() {
  const token = ++successPlayToken
  void mountAndPlayMotion(
    'success',
    token,
    () => successMotionActive.value,
    () => successMotionRef.value,
    () => {
      const scope = motionScope()
      if (scope)
        markSuccessMotionSeen(scope, motionSeen)
    },
  )
}

function evaluateMotions() {
  if (shouldSkipMotionEvaluation(claimMotionActive.value, successMotionActive.value, claimTransitionActive.value))
    return

  const status = statusLabel.value
  if (!status)
    return

  const scope = motionScope()
  const seenSuccess = scope ? hasSeenSuccessMotion(scope, motionSeen) : true
  const seenClaim = scope ? hasSeenClaimMotion(scope, motionSeen) : true
  const seller = isSeller.value

  if (shouldAnimateClaim(status, walletAccount.value, seller, claimReceiptConfirmed.value, seenClaim)) {
    claimMotionActive.value = true
    claimUiReady.value = false
    successMotionActive.value = false
    successUiReady.value = true
    beginClaimMotionPlayback()
    return
  }

  claimMotionActive.value = false
  claimUiReady.value = true

  if (shouldAnimateSuccess(status, walletAccount.value, seenSuccess)) {
    successMotionActive.value = true
    successUiReady.value = false
    beginSuccessMotionPlayback()
    return
  }

  successMotionActive.value = false
  successUiReady.value = true
}

function onSuccessMotionComplete() {
  successMotionActive.value = false
  successUiReady.value = true
}

function onClaimMotionComplete() {
  commitClaimedState()
}

function commitClaimedState() {
  if (pendingClaimedDrop.value) {
    drop.value = pendingClaimedDrop.value
    statusLabel.value = pendingClaimedStatus.value ?? 'Claimed'
    pendingClaimedDrop.value = null
    pendingClaimedStatus.value = null
  }
  claimTransitionActive.value = false
  claimMotionActive.value = false
  claimUiReady.value = true
  claimReceiptConfirmed.value = false
  claimingInFlight.value = false
  participantReloadToken.value += 1
  syncActivePolling()
}

async function fetchPublicDrop(id: bigint): Promise<{ drop: DropData, statusLabel: DropStatusLabel | 'Unknown' }> {
  const dropHex = await ethCall(network.crowdDropAddress, crowdDropAbi, 'getDrop', [id])
  const parsed = asDrop(decodeCall<DropData | readonly unknown[]>(crowdDropAbi, 'getDrop', dropHex))
  if (parsed.seller === '0x0000000000000000000000000000000000000000')
    throw new Error('unknown drop')
  const statusHex = await ethCall(network.crowdDropAddress, crowdDropAbi, 'statusOf', [id])
  const status = Number(decodeCall<bigint | number>(crowdDropAbi, 'statusOf', statusHex))
  return {
    drop: parsed,
    statusLabel: DROP_STATUS_LABELS[status] ?? 'Unknown',
  }
}

function startClaimTransition() {
  const scope = motionScope()
  const seenClaim = scope ? hasSeenClaimMotion(scope, motionSeen) : true
  if (!shouldAnimateClaim('Claimed', walletAccount.value, isSeller.value, claimReceiptConfirmed.value, seenClaim)) {
    commitClaimedState()
    return
  }
  claimMotionActive.value = true
  claimUiReady.value = false
  beginClaimMotionPlayback()
}

async function finalizeClaimReceipt() {
  if (!dropId.value)
    return

  claimTransitionAmount.value = drop.value
    ? formatTokenAmount(dropClaimedTotalUnits(drop.value.contribution, drop.value.goal), network.tokenDecimals)
    : ''
  const fetched = await fetchPublicDrop(dropId.value)
  if (fetched.statusLabel !== 'Claimed')
    throw new Error('Claim confirmed but Drop is not Claimed on-chain.')

  pendingClaimedDrop.value = fetched.drop
  pendingClaimedStatus.value = fetched.statusLabel
  claimTransitionActive.value = true

  if (walletAccount.value) {
    try {
      await loadPersonalState(dropId.value)
    }
    catch {
      // Keep last good personal state — claim transition still proceeds.
    }
  }

  startClaimTransition()
}

function stopActivePolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startActivePolling() {
  stopActivePolling()
  if (!shouldPollNow())
    return
  pollTimer = setInterval(() => {
    void pollDropState()
  }, ACTIVE_DROP_POLL_MS)
}

function syncActivePolling() {
  if (shouldPausePolling(document.visibilityState) || !shouldPollNow()) {
    stopActivePolling()
    return
  }
  startActivePolling()
}

async function pollDropState() {
  if (!dropId.value || !shouldPollNow() || claimTransitionActive.value)
    return
  if (!canStartPollTick(pollInFlight, refreshing.value))
    return

  pollInFlight = true
  const id = dropId.value
  const before = snapshotFromDrop(drop.value, statusLabel.value)

  try {
    const parsed = await readPublicDrop(id)
    drop.value = parsed
    evaluateMotions()

    const after = snapshotFromDrop(drop.value, statusLabel.value)
    if (after && participantsNeedReload(before, after))
      participantReloadToken.value += 1

    if (!shouldPollDrop(statusLabel.value, drop.value?.escrowed ?? 0n))
      stopActivePolling()
  }
  catch {
    // Quiet background poll — keep last known good UI.
  }
  finally {
    pollInFlight = false
  }
}

function resumeFromBackground() {
  if (shouldPausePolling(document.visibilityState))
    return
  if (shouldPollNow()) {
    void pollDropState().finally(() => syncActivePolling())
  }
}

function onVisibilityChange() {
  if (shouldPausePolling(document.visibilityState)) {
    stopActivePolling()
    return
  }
  resumeFromBackground()
}

async function readPublicDrop(id: bigint): Promise<DropData> {
  const fetched = await fetchPublicDrop(id)
  statusLabel.value = fetched.statusLabel
  return fetched.drop
}

async function loadDrop() {
  if (claimTransitionActive.value)
    return

  const gen = ++loadGeneration
  loadError.value = null
  refreshError.value = null
  errorDetail.value = null
  personalReady.value = false

  if (!dropId.value) {
    loadError.value = 'This drop ID is not valid.'
    drop.value = null
    dropStatus.value = null
    return
  }

  const id = dropId.value
  dropStatus.value = `Loading Drop ${id.toString()}…`

  // Public Drop payload — public Polygon RPC, no wallet / eth_accounts required.
  try {
    const parsed = await readPublicDrop(id)
    if (gen !== loadGeneration)
      return
    drop.value = parsed
    loadError.value = null
    evaluateMotions()
  }
  catch (error) {
    if (gen !== loadGeneration)
      return
    if (isUnknownDropError(error)) {
      loadError.value = 'Drop not found.'
      errorDetail.value = developerErrorDetail(error)
      drop.value = null
      dropStatus.value = null
      return
    }
    if (isTransientReadError(error)) {
      dropStatus.value = `Loading Drop ${id.toString()}…`
      window.setTimeout(() => {
        if (gen === loadGeneration)
          void loadDrop()
      }, 400)
      return
    }
    loadError.value = 'Could not load this drop. Try again.'
    errorDetail.value = developerErrorDetail(error)
    dropStatus.value = null
    return
  }

  // Personal eligibility (deposit / balance / allowance) — wait until wallet check settles.
  if (walletChecking.value) {
    dropStatus.value = null
    return
  }

  if (walletAccount.value) {
    try {
      await loadPersonalState(id)
    }
    catch (error) {
      if (gen !== loadGeneration)
        return
      errorDetail.value = developerErrorDetail(error)
      deposit.value = 0n
      tokenBalance.value = 0n
      allowance.value = 0n
    }
  }
  else {
    deposit.value = 0n
    tokenBalance.value = 0n
    allowance.value = 0n
  }

  if (gen !== loadGeneration)
    return
  personalReady.value = true
  dropStatus.value = null
  participantReloadToken.value += 1
  syncActivePolling()
}

function voidPendingWalletConfirm() {
  if (!awaitingWalletConfirm.value)
    return
  actionAbort?.abort()
  actionAbort = null
}

/**
 * Manual Refresh: re-read public Drop + wallet-specific state without a full page reload.
 * If a Join/Enable/Withdraw confirmation was dismissed and left the UI stuck, Refresh
 * voids that pending send so actions are tappable again.
 * On failure, keep the last good screen data and show a quiet inline error.
 */
async function refreshDrop() {
  if (refreshing.value || !dropId.value || claimTransitionActive.value)
    return

  // Recover from swipe-dismissed confirmation sheets (provider often hangs).
  if (awaitingWalletConfirm.value)
    voidPendingWalletConfirm()

  refreshing.value = true
  refreshError.value = null
  const gen = ++loadGeneration
  const id = dropId.value

  try {
    const parsed = await readPublicDrop(id)
    if (gen !== loadGeneration)
      return
    drop.value = parsed
    evaluateMotions()

    if (!walletChecking.value && walletAccount.value) {
      await loadPersonalState(id)
      if (gen !== loadGeneration)
        return
      personalReady.value = true
    }
    else if (!walletChecking.value && !walletAccount.value) {
      deposit.value = 0n
      tokenBalance.value = 0n
      allowance.value = 0n
      personalReady.value = true
    }

    loadError.value = null
    participantReloadToken.value += 1
  }
  catch {
    if (gen !== loadGeneration)
      return
    refreshError.value = 'Couldn’t refresh. Try again.'
  }
  finally {
    if (gen === loadGeneration)
      refreshing.value = false
  }
}

async function runAction(
  label: string,
  work: (signal: AbortSignal) => Promise<string>,
  options?: {
    onReceiptConfirmed?: () => void
    afterReceipt?: () => Promise<void>
    inlinePending?: boolean
  },
) {
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

  actionAbort?.abort()
  const ac = new AbortController()
  actionAbort = ac

  busy.value = true
  awaitingWalletConfirm.value = true
  waitingLabel.value = `Confirm ${label} in Nimiq Pay…`
  try {
    const hash = await work(ac.signal)
    if (actionAbort === ac)
      awaitingWalletConfirm.value = false
    lastTxHash.value = hash
    if (options?.inlinePending) {
      awaitingWalletConfirm.value = false
      waitingLabel.value = null
    }
    else {
      waitingLabel.value = 'Waiting for confirmation…'
    }
    await waitForReceipt(hash)
    options?.onReceiptConfirmed?.()
    if (options?.afterReceipt)
      await options.afterReceipt()
    else
      await loadDrop()
  }
  catch (error) {
    setError(error)
  }
  finally {
    if (actionAbort === ac)
      actionAbort = null
    clearActionUi()
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
  return runAction('Enable CrowdDrop', async (signal) => {
    if (plan.kind === 'reset-then-approve') {
      waitingLabel.value = 'Confirm the reset in Nimiq Pay. A second confirmation will enable CrowdDrop…'
      const resetHash = await sendTx(network.tokenAddress, erc20Abi, 'approve', [spender, 0n], { signal })
      lastTxHash.value = resetHash
      awaitingWalletConfirm.value = false
      await waitForReceipt(resetHash)
      awaitingWalletConfirm.value = true
      waitingLabel.value = 'Confirm Enable CrowdDrop in Nimiq Pay…'
    }
    return sendTx(network.tokenAddress, erc20Abi, 'approve', [spender, amount], { signal })
  })
}

function join() {
  if (!dropId.value)
    return
  return runAction('Join', signal =>
    sendTx(network.crowdDropAddress, crowdDropAbi, 'join', [dropId.value], { signal }))
}

function withdraw() {
  if (!dropId.value)
    return
  return runAction('Withdraw', signal =>
    sendTx(network.crowdDropAddress, crowdDropAbi, 'withdraw', [dropId.value], { signal }))
}

function claim() {
  if (!dropId.value)
    return
  claimingInFlight.value = true
  return runAction('Claim', signal =>
    sendTx(network.crowdDropAddress, crowdDropAbi, 'claim', [dropId.value], { signal }), {
    inlinePending: true,
    onReceiptConfirmed: () => {
      claimReceiptConfirmed.value = true
    },
    afterReceipt: finalizeClaimReceipt,
  }).finally(() => {
    if (!claimTransitionActive.value && !claimMotionActive.value)
      claimingInFlight.value = false
  })
}

watch(
  [walletChecking, walletBusy, walletOnActiveNetwork, walletAccount],
  () => {
    void loadDrop()
  },
)

watch(walletAccount, () => {
  if (drop.value && statusLabel.value)
    evaluateMotions()
})

watch(dropId, () => {
  resetMotionUiState()
  stopActivePolling()
})

watch(statusLabel, () => {
  syncActivePolling()
})

onMounted(() => {
  clockTimer = setInterval(() => {
    nowSec.value = Math.floor(Date.now() / 1000)
  }, 1000)
  if (dropId.value)
    saveLastOpenedDrop(dropId.value.toString())
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', resumeFromBackground)
  void loadDrop()
})

onUnmounted(() => {
  if (clockTimer)
    clearInterval(clockTimer)
  stopActivePolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', resumeFromBackground)
})
</script>

<template>
  <section class="drop-view utility">
    <header class="app-head">
      <p class="brand">CrowdDrop</p>
      <WalletBar compact utility :extra-busy="busy" />
    </header>

    <div class="nav">
      <a class="back-title" href="/?home=1" @click.prevent="goBackOrHome">
        <span class="chev">←</span>
        <span>Drop #{{ dropId?.toString() ?? dropParam }}</span>
      </a>
      <span
        v-if="visibleStatusLabel"
        class="nav-status"
        :class="{
          active: visibleStatusLabel === 'Active',
          success: visibleStatusLabel === 'Successful' || visibleStatusLabel === 'Claimed',
          expired: visibleStatusLabel === 'Expired',
        }"
      >{{ visibleStatusLabel }}</span>
    </div>

    <p v-if="dropStatus && !drop" class="wait">{{ dropStatus }}</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <details v-if="errorDetail" class="dev">
      <summary>Developer details</summary>
      <pre>{{ errorDetail }}</pre>
    </details>
    <p v-if="waitingLabel" class="wait">{{ waitingLabel }}</p>

    <template v-if="drop">
      <h1 class="amount">
        <span class="num">{{ contributionHome }}</span>
        <span class="per">{{ tokenLabel }} per person</span>
      </h1>

      <DropSuccessMotionContent
        v-if="successMotionActive"
        ref="successMotionRef"
        :goal="drop.goal"
        dots-only
        @motion-complete="onSuccessMotionComplete"
      />
      <ClaimCompleteMotionContent
        v-else-if="claimMotionActive"
        ref="claimMotionRef"
        :goal="drop.goal"
        :claimed-amount="claimTransitionAmount"
        :token-label="tokenLabel"
        @motion-complete="onClaimMotionComplete"
      />
      <ParticipantDots
        v-else
        :joined="drop.buyerCount"
        :goal="drop.goal"
        :tone="dotsTone"
      />

      <div class="facts">
        <p class="progress">{{ progressLine }}</p>
        <p v-if="remaining" class="meta-line">{{ remaining }} remaining</p>
        <p class="pooled">{{ fundsLine }}</p>
      </div>

      <p v-if="isActiveBuyerSurface" class="trust">
        Funds stay in the contract until the Drop succeeds or expires.
      </p>

      <p class="seller">
        <button type="button" class="seller-btn" @click="copySeller">
          Created by {{ shortenAddress(drop.seller) }}
          <span v-if="sellerCopied" class="copied">Copied</span>
        </button>
      </p>

      <div class="meta-tools">
        <button
          type="button"
          class="refresh-btn"
          :disabled="refreshing"
          :aria-busy="refreshing"
          @click="refreshDrop"
        >
          <span class="refresh-hit">{{ refreshing ? '↻ Refreshing…' : '↻ Refresh' }}</span>
        </button>
        <p v-if="refreshError" class="refresh-error">{{ refreshError }}</p>
      </div>

      <div class="rule" />

      <!-- Active Seller -->
      <template v-if="isActiveSellerDetail">
        <p class="note">You created this Drop.</p>
        <p class="note">{{ waitingBuyersLine }}</p>
        <button type="button" class="share" :disabled="busy" @click="shareDrop">
          <span class="share-icon" aria-hidden="true">↗</span>
          Share Drop
        </button>
        <p v-if="shareFeedback" class="share-feedback">{{ shareFeedback }}</p>
      </template>

      <!-- Active Buyer / Joined Buyer -->
      <template v-else-if="isActiveBuyerDetail">
        <p v-if="requiredAction" class="wait warn">{{ requiredAction }}</p>
        <p v-else-if="buyerEligibilityPending" class="wait muted">Loading…</p>

        <template v-else-if="isJoinedBuyerSurface">
          <div class="joined">
            <p class="joined-title">You’re in this Drop</p>
            <p class="joined-copy">
              Your {{ depositPlain }} {{ tokenLabel }} is pooled and waiting on the rest.
            </p>
          </div>
          <button
            v-if="showJoinedWithdraw"
            type="button"
            class="secondary"
            :disabled="busy"
            @click="withdraw"
          >
            Withdraw {{ depositPlain }} {{ tokenLabel }}
          </button>
        </template>

        <template v-else-if="walletAccount && walletOnActiveNetwork">
          <p v-if="showEnableCrowdDrop && insufficientBalance" class="error">
            Not enough {{ tokenLabel }} to join.
          </p>
          <p v-if="showEnableCrowdDrop && needsApprovalReset" class="note">
            Nimiq Pay will ask you to confirm twice: first to reset the old allowance, then to enable CrowdDrop.
          </p>
          <button
            v-if="showEnableCrowdDrop"
            type="button"
            class="primary"
            :disabled="busy"
            @click="approve"
          >
            Enable CrowdDrop
          </button>
          <p v-if="showEnableCrowdDrop" class="help">
            Approve once for future Drops, up to {{ REUSABLE_ALLOWANCE_TOKENS }} USDT.
          </p>
          <button
            v-if="showJoinCrowdDrop"
            type="button"
            class="primary"
            :disabled="busy"
            @click="join"
          >
            Join for {{ contributionPlain }} {{ tokenLabel }}
          </button>
          <p
            v-if="personalReady && !needsApproval && insufficientBalance && !showJoinCrowdDrop && !showEnableCrowdDrop"
            class="error"
          >
            Not enough {{ tokenLabel }} to join.
          </p>
        </template>
      </template>

      <!-- Successful -->
      <template v-else-if="visibleStatusLabel === 'Successful' && successUiReady && !claimMotionActive">
        <p v-if="requiredAction && (canClaim || hasDeposit)" class="wait warn">{{ requiredAction }}</p>
        <template v-else-if="isSeller && walletReady">
          <p v-if="!claimingInFlight" class="note">The goal was reached. You can claim the pooled funds.</p>
          <button
            v-if="canClaim || claimingInFlight"
            type="button"
            class="primary success"
            :disabled="busy || claimingInFlight"
            @click="claim"
          >
            {{ claimingInFlight ? 'Claiming…' : `Claim ${escrowedPlain} ${tokenLabel}` }}
          </button>
        </template>
        <p v-else-if="hasDeposit" class="note">
          You joined this Drop. The seller can now claim the pooled funds.
        </p>
        <p v-else class="note">The goal was reached.</p>
      </template>

      <!-- Claimed -->
      <template v-else-if="showStaticClaimedUi">
        <p class="note">The seller has claimed the pooled funds.</p>
        <button type="button" class="text-action" @click="goBackOrHome">Back to Home</button>
      </template>

      <!-- Expired -->
      <template v-else-if="statusLabel === 'Expired'">
        <p v-if="requiredAction && hasDeposit" class="wait warn">{{ requiredAction }}</p>
        <template v-else-if="showExpiredWithdraw">
          <p class="note">This Drop did not reach its goal.</p>
          <button type="button" class="primary" :disabled="busy" @click="withdraw">
            Withdraw {{ depositPlain }} {{ tokenLabel }}
          </button>
          <p class="help">Your contribution is available to withdraw.</p>
        </template>
        <template v-else-if="isSeller">
          <p class="note">This Drop did not reach its goal.</p>
        </template>
        <p v-else class="note">This Drop did not reach its goal.</p>
      </template>

      <DropParticipants
        :drop-id="dropId"
        :goal="drop.goal"
        :viewer-address="walletAccount"
        :reload-token="participantReloadToken"
      />
    </template>
  </section>
</template>

<style scoped>
.drop-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: Inter, system-ui, sans-serif;
  color: #141414;
}
.app-head {
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
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 16px;
  min-height: 36px;
}
.back-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #141414;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  min-height: 36px;
}
.chev {
  font-weight: 500;
  line-height: 1;
}
.nav-status {
  font-size: 13px;
  font-weight: 600;
  flex: 0 0 auto;
  color: #6A6A6A;
}
.nav-status.active { color: #B9430E; }
.nav-status.success { color: #1F7A45; }
.nav-status.expired { color: #A65A16; }

.amount {
  margin: 0 0 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.num {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
}
.per {
  font-size: 13px;
  color: #6A6A6A;
  font-weight: 500;
}
.facts {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.progress,
.meta-line,
.pooled,
.trust,
.note,
.help {
  margin: 0;
  font-size: 13px;
  color: #6A6A6A;
  line-height: 1.4;
}
.progress,
.pooled {
  color: #141414;
  font-weight: 500;
}
.trust {
  margin-top: 12px;
  font-size: 12px;
}
.seller {
  margin-top: 10px;
}
.seller-btn {
  border: none;
  background: transparent;
  color: #8A8A8A;
  font: inherit;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.35;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.copied {
  margin-left: 6px;
  color: #1F7A45;
  font-size: 11px;
}
.meta-tools {
  margin-top: 4px;
  margin-bottom: 2px;
}
.refresh-btn {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  color: #8A8A8A;
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  padding: 0;
  min-height: 44px;
  min-width: 44px;
  cursor: pointer;
  text-align: left;
}
.refresh-hit {
  display: inline-block;
  padding: 2px 0;
  line-height: 1.3;
}
.refresh-btn:hover:not(:disabled) { color: #6A6A6A; }
.refresh-btn:active:not(:disabled) {
  color: #141414;
  opacity: 0.85;
}
.refresh-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.refresh-error {
  margin: 0;
  font-size: 11px;
  color: #B9430E;
  line-height: 1.35;
}
.rule {
  height: 1px;
  background: #E2E2DE;
  margin: 14px 0;
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
  border: 1px solid #C94E12;
  background: #C94E12;
  color: #fff;
}
.primary.success {
  border-color: #1F7A45;
  background: #1F7A45;
}
.primary:active:not(:disabled) {
  background: #B9430E;
  border-color: #B9430E;
}
.secondary {
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
  font-weight: 500;
}
.secondary:active:not(:disabled) {
  background: #EFEFEA;
}
.share {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  padding: 8px 12px;
  min-height: 36px;
  border-radius: 8px;
  cursor: pointer;
  width: auto;
}
.share-icon {
  font-size: 13px;
  line-height: 1;
  color: #6A6A6A;
}
.share-feedback {
  margin: 6px 0 0;
  font-size: 12px;
  color: #6A6A6A;
}
.text-action {
  display: inline-block;
  margin-top: 4px;
  border: none;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 0;
  min-height: 32px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.help {
  margin-top: 8px;
  font-size: 12px;
  text-align: center;
}
.note {
  margin-bottom: 8px;
}
.status-line {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1F7A45;
}
.wait {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: #141414;
}
.wait.warn { color: #B9430E; }
.wait.muted {
  color: #6A6A6A;
  font-weight: 500;
}
.error {
  margin: 0 0 10px;
  color: #B9430E;
  font-size: 13px;
}
.dev {
  margin: 0 0 10px;
  font-size: 12px;
  color: #6A6A6A;
}
pre {
  white-space: pre-wrap;
  font-size: 11px;
}
.joined {
  margin-bottom: 12px;
  background: #F3EBE4;
  border-left: 2px solid #C94E12;
  border-radius: 0 8px 8px 0;
  padding: 10px 12px;
}
.joined-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 650;
  color: #141414;
}
.joined-copy {
  margin: 0;
  font-size: 13px;
  color: #6A6A6A;
  line-height: 1.4;
}
</style>
