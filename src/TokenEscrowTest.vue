<script setup lang="ts">
import { encodeFunctionData, formatUnits, hexToBigInt, type Hex } from 'viem'
import { onMounted, ref } from 'vue'
import { erc20Abi } from './erc20Abi'
import { activeErc20Network } from './escrowConfig'
import { testTokenEscrowAbi } from './tokenEscrowAbi'
import {
  formatChainId,
  formatWalletError,
  getEthereumProvider,
  isUnrecognizedChainError,
} from './wallet'

const network = activeErc20Network
const TOKEN_ADDRESS = network.tokenAddress
const ESCROW_ADDRESS = network.escrowAddress
const TOKEN_DECIMALS = network.tokenDecimals
const JOIN_AMOUNT = network.contributionUnits

const ADD_CHAIN = {
  chainId: network.chainId,
  chainName: network.chainName,
  nativeCurrency: network.nativeCurrency,
  rpcUrls: [...network.rpcUrls],
  blockExplorerUrls: [...network.blockExplorerUrls],
}

const busy = ref(false)
const errorMessage = ref<string | null>(null)
const lastTxHash = ref<string | null>(null)
const lastAction = ref<string | null>(null)
const evmAddress = ref<string | null>(null)
const chainId = ref<string | null>(null)
const chainName = ref<string | null>(null)
const tusdBalance = ref<string | null>(null)
const tusdAllowance = ref<string | null>(null)
const buyerCount = ref<string | null>(null)
const statusLabel = ref<string | null>(null)
const committedTusd = ref<string | null>(null)
const yourDepositTusd = ref<string | null>(null)
const sellerClaimed = ref<string | null>(null)
const contractConfigured = Boolean(TOKEN_ADDRESS && ESCROW_ADDRESS)

function onActiveNetwork(): boolean {
  return chainId.value === network.chainId
}

function formatToken(value: bigint): string {
  return formatUnits(value, TOKEN_DECIMALS)
}

async function readChain(): Promise<string> {
  const provider = getEthereumProvider()
  const raw = await provider.request({ method: 'eth_chainId' }) as string
  const formatted = formatChainId(raw)
  chainId.value = formatted.hex
  chainName.value = formatted.name
  return formatted.hex
}

async function requireActiveNetwork(): Promise<void> {
  const current = await readChain()
  if (current !== network.chainId) {
    throw new Error(`Token escrow actions are blocked. Wallet is on ${current}, not ${network.chainName} (${network.chainId}).`)
  }
}

async function call(to: string, abi: typeof erc20Abi | typeof testTokenEscrowAbi, functionName: string, args: readonly unknown[] = []): Promise<Hex> {
  const provider = getEthereumProvider()
  const data = encodeFunctionData({
    abi,
    functionName: functionName as never,
    args: args as never,
  })
  return await provider.request({
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  }) as Hex
}

async function send(to: string, abi: typeof erc20Abi | typeof testTokenEscrowAbi, functionName: string, args: readonly unknown[] = []) {
  await requireActiveNetwork()
  const provider = getEthereumProvider()
  let from = evmAddress.value
  if (!from) {
    const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
    from = accounts[0] ?? null
    evmAddress.value = from
  }
  if (!from)
    throw new Error('No EVM address available.')

  await requireActiveNetwork()

  const data = encodeFunctionData({
    abi,
    functionName: functionName as never,
    args: args as never,
  })
  const hash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to, data }],
  }) as string
  lastTxHash.value = hash
}

async function refreshStatus() {
  errorMessage.value = null
  const provider = getEthereumProvider()
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[]
  evmAddress.value = accounts[0] ?? null
  await readChain()

  if (!contractConfigured || !onActiveNetwork() || !evmAddress.value) {
    tusdBalance.value = null
    tusdAllowance.value = null
    buyerCount.value = null
    statusLabel.value = onActiveNetwork() ? (contractConfigured ? 'wallet not connected' : 'contracts not set') : `not on ${network.chainName}`
    committedTusd.value = null
    yourDepositTusd.value = null
    sellerClaimed.value = null
    return
  }

  const [balanceHex, allowanceHex, countHex, committedHex, successfulHex, expiredHex, depositHex, claimedHex] = await Promise.all([
    call(TOKEN_ADDRESS, erc20Abi, 'balanceOf', [evmAddress.value]),
    call(TOKEN_ADDRESS, erc20Abi, 'allowance', [evmAddress.value, ESCROW_ADDRESS]),
    call(ESCROW_ADDRESS, testTokenEscrowAbi, 'buyerCount'),
    call(ESCROW_ADDRESS, testTokenEscrowAbi, 'committedAmount'),
    call(ESCROW_ADDRESS, testTokenEscrowAbi, 'isSuccessful'),
    call(ESCROW_ADDRESS, testTokenEscrowAbi, 'isExpired'),
    call(ESCROW_ADDRESS, testTokenEscrowAbi, 'deposits', [evmAddress.value]),
    call(ESCROW_ADDRESS, testTokenEscrowAbi, 'sellerClaimed'),
  ])

  tusdBalance.value = formatToken(hexToBigInt(balanceHex))
  tusdAllowance.value = formatToken(hexToBigInt(allowanceHex))
  buyerCount.value = `${hexToBigInt(countHex).toString()} / 2`
  committedTusd.value = formatToken(hexToBigInt(committedHex))
  yourDepositTusd.value = formatToken(hexToBigInt(depositHex))
  sellerClaimed.value = hexToBigInt(claimedHex) === 1n ? 'yes' : 'no'
  const successful = hexToBigInt(successfulHex) === 1n
  const expired = hexToBigInt(expiredHex) === 1n
  statusLabel.value = successful ? 'successful' : expired ? 'expired' : 'active'
}

async function switchToSepolia() {
  errorMessage.value = null
  busy.value = true
  try {
    const provider = getEthereumProvider()
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: network.chainId }],
      })
    }
    catch (error) {
      if (!isUnrecognizedChainError(error))
        throw error
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [ADD_CHAIN],
      })
    }
    await refreshStatus()
  }
  catch (error) {
    errorMessage.value = formatWalletError(error)
  }
  finally {
    busy.value = false
  }
}

async function approveTwenty() {
  errorMessage.value = null
  lastAction.value = 'approve'
  busy.value = true
  try {
    if (!contractConfigured)
      throw new Error('Token escrow addresses are not set.')
    await send(TOKEN_ADDRESS, erc20Abi, 'approve', [ESCROW_ADDRESS, JOIN_AMOUNT])
    await refreshStatus()
  }
  catch (error) {
    errorMessage.value = formatWalletError(error)
  }
  finally {
    busy.value = false
  }
}

async function joinWithTwenty() {
  errorMessage.value = null
  lastAction.value = 'join'
  busy.value = true
  try {
    if (!contractConfigured)
      throw new Error('Token escrow addresses are not set.')
    await send(ESCROW_ADDRESS, testTokenEscrowAbi, 'join')
    await refreshStatus()
  }
  catch (error) {
    errorMessage.value = formatWalletError(error)
  }
  finally {
    busy.value = false
  }
}

async function withdraw() {
  errorMessage.value = null
  lastAction.value = 'withdraw'
  busy.value = true
  try {
    if (!contractConfigured)
      throw new Error('Token escrow addresses are not set.')
    await send(ESCROW_ADDRESS, testTokenEscrowAbi, 'withdraw')
    await refreshStatus()
  }
  catch (error) {
    errorMessage.value = formatWalletError(error)
  }
  finally {
    busy.value = false
  }
}

async function onRefresh() {
  busy.value = true
  try {
    await refreshStatus()
  }
  catch (error) {
    errorMessage.value = formatWalletError(error)
  }
  finally {
    busy.value = false
  }
}

onMounted(() => {
  if (!window.ethereum)
    return
  refreshStatus().catch((error) => {
    errorMessage.value = formatWalletError(error)
  })
})
</script>

<template>
  <section>
    <h2>Sepolia TestUSD escrow test</h2>
    <p>Sepolia only. Fake TUSD only. Approve and Join are separate Nimiq Pay prompts.</p>
    <p>{{ network.tokenSymbol }}: {{ contractConfigured ? TOKEN_ADDRESS : 'not set' }}</p>
    <p>Token escrow: {{ contractConfigured ? ESCROW_ADDRESS : 'not set' }}</p>
    <p>Connected EVM address: {{ evmAddress ?? 'not connected' }}</p>
    <p>Chain ID: {{ chainId ?? 'unknown' }}</p>
    <p>Network: {{ chainName ?? 'unknown' }}</p>
    <p>
      Safely on testnet:
      <strong>{{ onActiveNetwork() ? `yes (${network.chainName})` : `no — token actions blocked` }}</strong>
    </p>
    <p>{{ network.tokenSymbol }} balance: {{ tusdBalance ?? 'unknown' }}</p>
    <p>Allowance for escrow: {{ tusdAllowance ?? 'unknown' }}</p>
    <p>Progress: {{ buyerCount ?? 'unknown' }}</p>
    <p>Status: {{ statusLabel ?? 'unknown' }}</p>
    <p>Your deposit: {{ yourDepositTusd ?? 'unknown' }} {{ network.tokenSymbol }}</p>
    <p>Total committed: {{ committedTusd ?? 'unknown' }} {{ network.tokenSymbol }}</p>
    <p>Seller claimed: {{ sellerClaimed ?? 'unknown' }}</p>
    <p>Last action: {{ lastAction ?? 'none' }}</p>
    <p>Last tx: {{ lastTxHash ?? 'none' }}</p>
    <p v-if="errorMessage">{{ errorMessage }}</p>

    <div class="actions">
      <button type="button" :disabled="busy" @click="switchToSepolia">Switch to Sepolia</button>
      <button type="button" :disabled="busy || !onActiveNetwork() || !contractConfigured" @click="approveTwenty">Approve 20 TestUSD</button>
      <button type="button" :disabled="busy || !onActiveNetwork() || !contractConfigured" @click="joinWithTwenty">Join with 20 TestUSD</button>
      <button type="button" :disabled="busy || !onActiveNetwork() || !contractConfigured" @click="withdraw">Withdraw</button>
      <button type="button" :disabled="busy" @click="onRefresh">Refresh Status</button>
    </div>
  </section>
</template>

<style scoped>
section {
  margin: 1.25rem 0;
  padding: 1rem;
  background: #fff;
  border: 1px solid #ddd;
}

p,
h2 {
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

button {
  min-height: 44px;
  min-width: 44px;
  padding: 0.75rem 1rem;
  font-size: 1rem;
}
</style>
