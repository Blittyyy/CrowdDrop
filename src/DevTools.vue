<script setup lang="ts">
import { init } from '@nimiq/mini-app-sdk'
import { onMounted, ref } from 'vue'
import EscrowTest from './EscrowTest.vue'
import TokenEscrowTest from './TokenEscrowTest.vue'
import { formatChainId, formatWalletError, getProviderErrorMessage } from './wallet'

let nimiqPromise: ReturnType<typeof init> | null = null

const nimiqConnecting = ref(true)
const nimiqReady = ref(false)
const nimiqInitError = ref<string | null>(null)
const nimiqAddress = ref<string | null>(null)
const nimiqRequestError = ref<string | null>(null)
const nimiqRequesting = ref(false)

const ethereumAvailable = ref(false)
const evmAddress = ref<string | null>(null)
const evmChainId = ref<string | null>(null)
const evmChainName = ref<string | null>(null)
const evmRequestError = ref<string | null>(null)
const evmRequesting = ref(false)

onMounted(async () => {
  ethereumAvailable.value = Boolean(window.ethereum)

  try {
    nimiqPromise = init({ timeout: 10_000 })
    await nimiqPromise
    nimiqReady.value = true
  }
  catch (error) {
    nimiqInitError.value = error instanceof Error ? error.message : String(error)
    nimiqPromise = null
  }
  finally {
    nimiqConnecting.value = false
  }
})

async function requestNimiqAddress() {
  nimiqRequestError.value = null

  if (!nimiqPromise) {
    nimiqRequestError.value = 'Nimiq provider unavailable. Open this app inside Nimiq Pay.'
    return
  }

  nimiqRequesting.value = true

  try {
    const nimiq = await nimiqPromise
    const accountsResult = await nimiq.listAccounts()
    const accountsError = getProviderErrorMessage(accountsResult)
    if (accountsError)
      throw new Error(accountsError)

    const accounts = accountsResult as string[]
    if (!accounts.length)
      throw new Error('No Nimiq addresses returned.')

    nimiqAddress.value = accounts[0]
  }
  catch (error) {
    nimiqRequestError.value = formatWalletError(error)
  }
  finally {
    nimiqRequesting.value = false
  }
}

async function connectEvmWallet() {
  evmRequestError.value = null

  const provider = window.ethereum
  if (!provider) {
    ethereumAvailable.value = false
    evmRequestError.value = 'Ethereum provider unavailable. Open this app inside Nimiq Pay.'
    return
  }

  evmRequesting.value = true

  try {
    const accounts = await provider.request({
      method: 'eth_requestAccounts',
    }) as string[]

    if (!accounts.length)
      throw new Error('No EVM addresses returned.')

    evmAddress.value = accounts[0]

    const chainId = await provider.request({ method: 'eth_chainId' }) as string
    const formatted = formatChainId(chainId)
    evmChainId.value = formatted.hex
    evmChainName.value = formatted.name
  }
  catch (error) {
    evmRequestError.value = formatWalletError(error)
  }
  finally {
    evmRequesting.value = false
  }
}
</script>

<template>
  <main>
    <p><a href="/">← CrowdDrop app</a></p>
    <h1>Development tools</h1>
    <p>Sepolia feasibility only. Native ETH escrow and old TestTokenEscrow. Not the product UI.</p>

    <section>
      <h2>Nimiq provider</h2>
      <p>
        Status:
        <strong v-if="nimiqConnecting">connecting</strong>
        <strong v-else-if="nimiqReady">connected</strong>
        <strong v-else>unavailable</strong>
      </p>
      <p v-if="nimiqInitError">Init error: {{ nimiqInitError }}</p>
      <p>Address: {{ nimiqAddress ?? 'not requested' }}</p>
      <p v-if="nimiqRequestError">{{ nimiqRequestError }}</p>
      <button type="button" :disabled="nimiqRequesting || !nimiqReady" @click="requestNimiqAddress">
        {{ nimiqRequesting ? 'Requesting…' : 'Request Nimiq address' }}
      </button>
    </section>

    <section>
      <h2>Ethereum provider</h2>
      <p>
        Status:
        <strong v-if="ethereumAvailable">detected</strong>
        <strong v-else>unavailable</strong>
      </p>
      <p>Address: {{ evmAddress ?? 'not connected' }}</p>
      <p>Chain ID: {{ evmChainId ?? 'unknown' }}</p>
      <p>Network: {{ evmChainName ?? 'unknown' }}</p>
      <p v-if="evmRequestError">{{ evmRequestError }}</p>
      <button type="button" :disabled="evmRequesting || !ethereumAvailable" @click="connectEvmWallet">
        {{ evmRequesting ? 'Connecting…' : 'Connect EVM wallet' }}
      </button>
    </section>

    <EscrowTest />
    <TokenEscrowTest />
  </main>
</template>

<style scoped>
section {
  margin: 1.25rem 0;
  padding: 1rem;
  background: #fff;
  border: 1px solid #ddd;
}

button {
  min-height: 44px;
  min-width: 44px;
  padding: 0.75rem 1rem;
  font-size: 1rem;
}

p,
h1,
h2 {
  overflow-wrap: anywhere;
}
</style>
