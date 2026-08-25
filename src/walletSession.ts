import { computed, ref } from 'vue'
import { activeCrowdDropNetwork } from './escrowConfig'
import { connectedAccount, readChainHex, requestAccount, switchToChain } from './evm'
import { developerErrorDetail, friendlyUserError } from './userErrors'
import { formatChainId, isActiveCrowdDropChain, isUserRejection, shortenAddress } from './wallet'

const network = activeCrowdDropNetwork

export const walletChecking = ref(true)
export const walletBusy = ref(false)
export const walletAccount = ref<string | null>(null)
export const walletSeenAccount = ref(false)
export const walletChainId = ref<string | null>(null)
export const walletChainName = ref<string | null>(null)
export const walletStatus = ref('Checking wallet…')
export const walletError = ref<string | null>(null)
export const walletErrorDetail = ref<string | null>(null)

export const walletOnActiveNetwork = computed(() => isActiveCrowdDropChain(walletChainId.value))
export const walletReady = computed(() => Boolean(walletAccount.value) && walletOnActiveNetwork.value)
export const walletShortAddress = computed(() => (
  walletAccount.value ? shortenAddress(walletAccount.value) : null
))

let started = false
let silentRefresh: Promise<void> | null = null
let resumeTimer: ReturnType<typeof setTimeout> | null = null
let providerEventsBound = false

function clearError() {
  walletError.value = null
  walletErrorDetail.value = null
}

function applyError(error: unknown, cancelledMessage: string) {
  if (isUserRejection(error)) {
    walletError.value = cancelledMessage
    walletErrorDetail.value = developerErrorDetail(error)
    return
  }
  walletError.value = friendlyUserError(error)
  walletErrorDetail.value = developerErrorDetail(error)
}

function statusFromState() {
  if (!walletAccount.value)
    return 'Reconnect wallet'
  if (!walletOnActiveNetwork.value)
    return `Wallet connected. Switch to ${network.chainName}.`
  return `${network.chainName} connected.`
}

async function waitForEthereum(timeoutMs = 8000): Promise<boolean> {
  if (window.ethereum)
    return true
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 50))
    if (window.ethereum)
      return true
  }
  return Boolean(window.ethereum)
}

async function readProviderState(): Promise<void> {
  if (!window.ethereum) {
    walletAccount.value = null
    walletChainId.value = null
    walletChainName.value = null
    return
  }
  const [account, chainHex] = await Promise.all([
    connectedAccount(),
    readChainHex(),
  ])
  if (account)
    walletSeenAccount.value = true
  walletAccount.value = account
  const formatted = formatChainId(chainHex)
  walletChainId.value = formatted.hex
  walletChainName.value = formatted.name
}

export async function refreshWalletSilent(): Promise<void> {
  if (silentRefresh)
    return silentRefresh

  silentRefresh = (async () => {
    const available = window.ethereum || await waitForEthereum()
    if (!available) {
      walletAccount.value = null
      walletChainId.value = null
      walletChainName.value = null
      walletStatus.value = 'Wallet unavailable. Open this app inside Nimiq Pay.'
      return
    }
    bindProviderEvents()
    await readProviderState()
    walletStatus.value = statusFromState()
  })().finally(() => {
    silentRefresh = null
  })

  return silentRefresh
}

function scheduleResumeRefresh() {
  if (walletBusy.value)
    return
  if (resumeTimer)
    clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    resumeTimer = null
    void refreshWalletSilent()
  }, 150)
}

function bindResumeEvents() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      scheduleResumeRefresh()
  })
  window.addEventListener('pageshow', scheduleResumeRefresh)
  window.addEventListener('focus', scheduleResumeRefresh)
}

function bindProviderEvents() {
  if (providerEventsBound || !window.ethereum)
    return
  providerEventsBound = true
  window.ethereum.on?.('accountsChanged', () => {
    void refreshWalletSilent()
  })
  window.ethereum.on?.('chainChanged', () => {
    void refreshWalletSilent()
  })
}

export async function initWalletSession(): Promise<void> {
  if (started)
    return
  started = true
  walletChecking.value = true
  walletStatus.value = 'Checking wallet…'
  bindResumeEvents()
  try {
    await refreshWalletSilent()
  }
  catch (error) {
    applyError(error, 'Could not read wallet state.')
    walletStatus.value = 'Could not read wallet state.'
  }
  finally {
    walletChecking.value = false
  }
}

async function switchToActiveNetwork(): Promise<void> {
  try {
    await switchToChain({
      chainId: network.chainId,
      chainName: network.chainName,
      nativeCurrency: network.nativeCurrency,
      rpcUrls: network.rpcUrls,
      blockExplorerUrls: network.blockExplorerUrls,
    })
  }
  catch (error) {
    if (isUserRejection(error))
      throw error
    await readProviderState()
    if (walletOnActiveNetwork.value)
      return
    throw error
  }
  await readProviderState()
  if (!walletOnActiveNetwork.value)
    throw new Error(`Wallet is still not on ${network.chainName}.`)
}

export async function connectWallet(): Promise<void> {
  clearError()
  walletBusy.value = true
  walletStatus.value = 'Connecting wallet…'
  try {
    if (!window.ethereum && !await waitForEthereum())
      throw new Error('Ethereum provider unavailable. Open this app inside Nimiq Pay.')

    walletAccount.value = await requestAccount()
    if (walletAccount.value)
      walletSeenAccount.value = true
    await readProviderState()
    walletStatus.value = 'Wallet connected.'

    if (walletOnActiveNetwork.value) {
      walletStatus.value = `${network.chainName} connected.`
      return
    }

    walletStatus.value = 'Waiting for network switch confirmation…'
    await switchToActiveNetwork()
    walletStatus.value = `${network.chainName} connected.`
  }
  catch (error) {
    await readProviderState().catch(() => undefined)
    if (walletAccount.value && walletOnActiveNetwork.value) {
      walletStatus.value = `${network.chainName} connected.`
      return
    }
    applyError(
      error,
      walletAccount.value ? 'Network switch cancelled.' : 'Request cancelled.',
    )
    walletStatus.value = statusFromState()
  }
  finally {
    walletBusy.value = false
  }
}

export async function confirmActiveChain(): Promise<boolean> {
  if (!window.ethereum)
    return false
  const hex = await readChainHex()
  const formatted = formatChainId(hex)
  walletChainId.value = formatted.hex
  walletChainName.value = formatted.name
  return isActiveCrowdDropChain(formatted.hex)
}

export async function switchWalletNetwork(): Promise<void> {
  clearError()
  walletBusy.value = true
  walletStatus.value = 'Waiting for network switch confirmation…'
  try {
    await switchToActiveNetwork()
    walletStatus.value = `${network.chainName} connected.`
  }
  catch (error) {
    await readProviderState().catch(() => undefined)
    if (walletOnActiveNetwork.value) {
      walletStatus.value = `${network.chainName} connected.`
      return
    }
    applyError(error, 'Network switch cancelled.')
    walletStatus.value = statusFromState()
  }
  finally {
    walletBusy.value = false
  }
}
