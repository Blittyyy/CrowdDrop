<script setup lang="ts">
import { encodeFunctionData, formatEther, hexToBigInt, type Hex } from 'viem'
import { onMounted, ref } from 'vue'
import { testEscrowAbi } from './escrowAbi'
import { SEPOLIA_CHAIN_ID, TEST_ESCROW_ADDRESS } from './escrowConfig'
import {
  formatChainId,
  formatWalletError,
  getEthereumProvider,
  isSepolia,
  isUnrecognizedChainError,
} from './wallet'

const SEPOLIA_CHAIN = {
  chainId: SEPOLIA_CHAIN_ID,
  chainName: 'Sepolia',
  nativeCurrency: {
    name: 'SepoliaETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://rpc.sepolia.org'],
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
}

const busy = ref(false)
const errorMessage = ref<string | null>(null)
const lastTxHash = ref<string | null>(null)
const evmAddress = ref<string | null>(null)
const chainId = ref<string | null>(null)
const chainName = ref<string | null>(null)
const balanceEth = ref<string | null>(null)
const buyerCount = ref<string | null>(null)
const statusLabel = ref<string | null>(null)
const committedEth = ref<string | null>(null)
const contributionWei = ref<bigint | null>(null)
const contributionEth = ref<string | null>(null)
const sellerAddress = ref<string | null>(null)
const yourDepositEth = ref<string | null>(null)
const deadlineIso = ref<string | null>(null)
const contractConfigured = Boolean(TEST_ESCROW_ADDRESS)

function onSepolia(): boolean {
  return isSepolia(chainId.value)
}

async function readChain(): Promise<string> {
  const provider = getEthereumProvider()
  const raw = await provider.request({ method: 'eth_chainId' }) as string
  const formatted = formatChainId(raw)
  chainId.value = formatted.hex
  chainName.value = formatted.name
  return formatted.hex
}

async function requireSepolia(): Promise<void> {
  const current = await readChain()
  if (!isSepolia(current)) {
    throw new Error(`Escrow actions are blocked. Wallet is on ${current} (${formatChainId(current).name}), not Sepolia (${SEPOLIA_CHAIN_ID}).`)
  }
}

async function callView(
  functionName: 'seller' | 'contribution' | 'deadline' | 'buyerCount' | 'sellerClaimed' | 'committedAmount' | 'isSuccessful' | 'isExpired' | 'deposits',
  args: readonly unknown[] = [],
): Promise<Hex> {
  const provider = getEthereumProvider()
  const data = encodeFunctionData({
    abi: testEscrowAbi,
    functionName,
    args: args as never,
  })
  return await provider.request({
    method: 'eth_call',
    params: [{ to: TEST_ESCROW_ADDRESS, data }, 'latest'],
  }) as Hex
}

async function refreshStatus() {
  errorMessage.value = null
  const provider = getEthereumProvider()

  const accounts = await provider.request({ method: 'eth_accounts' }) as string[]
  evmAddress.value = accounts[0] ?? null
  await readChain()

  if (evmAddress.value) {
    const balanceHex = await provider.request({
      method: 'eth_getBalance',
      params: [evmAddress.value, 'latest'],
    }) as Hex
    balanceEth.value = formatEther(hexToBigInt(balanceHex))
  }
  else {
    balanceEth.value = null
  }

  if (!contractConfigured || !onSepolia()) {
    buyerCount.value = null
    statusLabel.value = onSepolia() ? 'contract address not set' : 'not on Sepolia'
    committedEth.value = null
    contributionEth.value = null
    contributionWei.value = null
    sellerAddress.value = null
    yourDepositEth.value = null
    deadlineIso.value = null
    return
  }

  const [
    sellerHex,
    contributionHex,
    deadlineHex,
    countHex,
    committedHex,
    successfulHex,
    expiredHex,
  ] = await Promise.all([
    callView('seller'),
    callView('contribution'),
    callView('deadline'),
    callView('buyerCount'),
    callView('committedAmount'),
    callView('isSuccessful'),
    callView('isExpired'),
  ])

  sellerAddress.value = `0x${sellerHex.slice(-40)}`
  contributionWei.value = hexToBigInt(contributionHex)
  contributionEth.value = formatEther(contributionWei.value)
  deadlineIso.value = new Date(Number(hexToBigInt(deadlineHex)) * 1000).toISOString()
  buyerCount.value = `${hexToBigInt(countHex).toString()} / 2`
  committedEth.value = formatEther(hexToBigInt(committedHex))

  const successful = hexToBigInt(successfulHex) === 1n
  const expired = hexToBigInt(expiredHex) === 1n
  statusLabel.value = successful ? 'successful' : expired ? 'expired' : 'active'

  if (evmAddress.value) {
    const depositHex = await callView('deposits', [evmAddress.value])
    yourDepositEth.value = formatEther(hexToBigInt(depositHex))
  }
}

async function switchToSepolia() {
  errorMessage.value = null
  busy.value = true
  try {
    const provider = getEthereumProvider()
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      })
    }
    catch (error) {
      if (!isUnrecognizedChainError(error))
        throw error

      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [SEPOLIA_CHAIN],
      })
    }

    const current = await readChain()
    if (!isSepolia(current))
      throw new Error(`Nimiq Pay did not switch to Sepolia. Current chain is ${current}.`)

    await refreshStatus()
  }
  catch (error) {
    errorMessage.value = formatWalletError(error)
  }
  finally {
    busy.value = false
  }
}

async function sendEscrowTx(functionName: 'join' | 'withdraw' | 'claim', value?: bigint) {
  errorMessage.value = null
  lastTxHash.value = null
  busy.value = true
  try {
    if (!contractConfigured)
      throw new Error('No contract address set. Deploy TestEscrow to Sepolia and paste it into src/escrowConfig.ts.')

    await requireSepolia()
    const provider = getEthereumProvider()

    let from = evmAddress.value
    if (!from) {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
      from = accounts[0] ?? null
      evmAddress.value = from
    }
    if (!from)
      throw new Error('No EVM address available.')

    await requireSepolia()

    const data = encodeFunctionData({
      abi: testEscrowAbi,
      functionName,
    })

    const tx: Record<string, string> = {
      from,
      to: TEST_ESCROW_ADDRESS,
      data,
    }
    if (value !== undefined)
      tx.value = `0x${value.toString(16)}`

    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [tx],
    }) as string

    lastTxHash.value = hash
    await refreshStatus()
  }
  catch (error) {
    errorMessage.value = formatWalletError(error)
  }
  finally {
    busy.value = false
  }
}

async function joinDrop() {
  try {
    if (!onSepolia())
      throw new Error(`Escrow actions are blocked until the wallet is on Sepolia (${SEPOLIA_CHAIN_ID}).`)
    if (!contributionWei.value)
      await refreshStatus()
    if (!contributionWei.value)
      throw new Error('Could not read contribution amount from the contract.')
    await sendEscrowTx('join', contributionWei.value)
  }
  catch (error) {
    errorMessage.value = formatWalletError(error)
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
    <h2>Sepolia escrow test</h2>
    <p>Sepolia only. No mainnet transactions are sent from this section.</p>
    <p>Contract: {{ contractConfigured ? TEST_ESCROW_ADDRESS : 'not set — deploy first' }}</p>
    <p>Connected EVM address: {{ evmAddress ?? 'not connected' }}</p>
    <p>Chain ID: {{ chainId ?? 'unknown' }}</p>
    <p>Network: {{ chainName ?? 'unknown' }}</p>
    <p>
      Safely on testnet:
      <strong>{{ onSepolia() ? 'yes (Sepolia)' : 'no — escrow actions blocked' }}</strong>
    </p>
    <p>Test ETH balance: {{ balanceEth ?? 'unknown' }}</p>
    <p>Progress: {{ buyerCount ?? 'unknown' }}</p>
    <p>Status: {{ statusLabel ?? 'unknown' }}</p>
    <p>Amount committed: {{ committedEth ?? 'unknown' }} ETH</p>
    <p>Join amount: {{ contributionEth ?? 'unknown' }} ETH</p>
    <p>Your deposit: {{ yourDepositEth ?? 'unknown' }} ETH</p>
    <p>Seller: {{ sellerAddress ?? 'unknown' }}</p>
    <p>Deadline: {{ deadlineIso ?? 'unknown' }}</p>
    <p>Last tx: {{ lastTxHash ?? 'none' }}</p>
    <p v-if="errorMessage">{{ errorMessage }}</p>

    <div class="actions">
      <button type="button" :disabled="busy" @click="switchToSepolia">Switch to Sepolia</button>
      <button type="button" :disabled="busy || !onSepolia() || !contractConfigured" @click="joinDrop">Join Test Drop</button>
      <button type="button" :disabled="busy || !onSepolia() || !contractConfigured" @click="sendEscrowTx('withdraw')">Withdraw</button>
      <button type="button" :disabled="busy || !onSepolia() || !contractConfigured" @click="sendEscrowTx('claim')">Seller Claim</button>
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
