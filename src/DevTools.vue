<script setup lang="ts">
import { init } from '@nimiq/mini-app-sdk'
import { onMounted, ref } from 'vue'
import EscrowTest from './EscrowTest.vue'
import TokenEscrowTest from './TokenEscrowTest.vue'
import {
  AUTH_TEST_ACTION,
  buildCrowdDropAuthTypedData,
  toProviderTypedDataPayload,
} from './signing/crowdDropAuthTypedData'
import { SignCancelledError, requestSignTypedDataV4 } from './signing/requestTypedDataSignature'
import { formatChainId, formatWalletError, getProviderErrorMessage, sameAddress, shortenAddress } from './wallet'

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

type SigningUiState = 'idle' | 'running' | 'success' | 'failure' | 'cancelled'

const signingState = ref<SigningUiState>('idle')
const signingError = ref<string | null>(null)
const signingRecovered = ref<string | null>(null)
const signingWalletMatch = ref<boolean | null>(null)
const signingDevDetails = ref<string | null>(null)

type SupabaseHealthUiState = 'idle' | 'running' | 'success' | 'failure'

const supabaseState = ref<SupabaseHealthUiState>('idle')
const supabaseError = ref<string | null>(null)
const supabaseHealth = ref<Record<string, unknown> | null>(null)

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

function resetSigningResult() {
  signingState.value = 'idle'
  signingError.value = null
  signingRecovered.value = null
  signingWalletMatch.value = null
  signingDevDetails.value = null
}

async function testEip712Signing() {
  resetSigningResult()
  signingState.value = 'running'

  const provider = window.ethereum
  if (!provider) {
    signingState.value = 'failure'
    signingError.value = 'Ethereum provider unavailable.'
    return
  }

  if (!evmAddress.value) {
    signingState.value = 'failure'
    signingError.value = 'Connect an EVM wallet first.'
    return
  }

  const wallet = evmAddress.value

  try {
    const challengeResponse = await fetch('/api/dev/signing-challenge')
    if (!challengeResponse.ok)
      throw new Error('Could not fetch signing challenge.')

    const challenge = await challengeResponse.json() as { nonce?: string, expiresAt?: number }
    if (!challenge.nonce || typeof challenge.expiresAt !== 'number')
      throw new Error('Challenge response was invalid.')

    const typedData = buildCrowdDropAuthTypedData({
      action: AUTH_TEST_ACTION,
      wallet,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    })

    const signature = await requestSignTypedDataV4(provider, wallet, typedData)
    const providerPayload = toProviderTypedDataPayload(typedData)

    const verifyResponse = await fetch('/api/dev/verify-signature', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        typedData: providerPayload,
        signature,
      }),
    })

    const verifyPayload = await verifyResponse.json() as {
      ok?: boolean
      reason?: string
      recovered?: string
      walletMatch?: boolean
    }

    if (!verifyResponse.ok || !verifyPayload.ok) {
      signingState.value = 'failure'
      signingError.value = verifyPayload.reason ?? 'Server verification failed.'
      signingDevDetails.value = JSON.stringify({ typedData: providerPayload, signature }, null, 2)
      return
    }

    signingState.value = 'success'
    signingRecovered.value = verifyPayload.recovered ?? null
    signingWalletMatch.value = sameAddress(verifyPayload.recovered, wallet)
    signingDevDetails.value = JSON.stringify({ typedData: providerPayload, signature }, null, 2)
  }
  catch (error) {
    if (error instanceof SignCancelledError) {
      signingState.value = 'cancelled'
      signingError.value = 'Signature cancelled.'
      return
    }
    signingState.value = 'failure'
    signingError.value = formatWalletError(error)
  }
}

function resetSupabaseResult() {
  supabaseState.value = 'idle'
  supabaseError.value = null
  supabaseHealth.value = null
}

function formatSupabaseHealthSummary(payload: Record<string, unknown>): string {
  if (payload.ok === true)
    return 'Supabase backend ready'

  if (payload.error === 'supabase_not_configured') {
    const missing = Array.isArray(payload.missing) ? payload.missing.join(', ') : 'env vars'
    return `Supabase not configured (${missing})`
  }

  const parts: string[] = []
  if (payload.database !== true)
    parts.push('database')
  if (payload.productsTable !== true)
    parts.push('products table')
  if (payload.authChallengesTable !== true)
    parts.push('auth_challenges table')
  if (payload.coverBucket !== true)
    parts.push('product-covers bucket')
  if (payload.assetBucket !== true)
    parts.push('product-assets bucket')
  if (payload.assetBucketPrivate !== true)
    parts.push('private product-assets')
  if (payload.error && typeof payload.error === 'string')
    parts.push(String(payload.error))

  return parts.length ? `Missing: ${parts.join(', ')}` : 'Supabase setup incomplete'
}

async function checkSupabaseSetup() {
  resetSupabaseResult()
  supabaseState.value = 'running'

  try {
    const response = await fetch('/api/dev/supabase-health')
    const payload = await response.json() as Record<string, unknown>
    supabaseHealth.value = payload

    if (response.ok && payload.ok === true) {
      supabaseState.value = 'success'
      return
    }

    supabaseState.value = 'failure'
    supabaseError.value = formatSupabaseHealthSummary(payload)
  }
  catch (error) {
    supabaseState.value = 'failure'
    supabaseError.value = formatWalletError(error)
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

    <section>
      <h2>EIP-712 signing smoke test</h2>
      <p>Development only. Proves Nimiq Pay can sign structured auth data and recover the connected wallet server-side.</p>
      <p>Wallet: {{ evmAddress ? shortenAddress(evmAddress) : 'not connected' }}</p>

      <button
        type="button"
        :disabled="signingState === 'running' || !ethereumAvailable || !evmAddress"
        @click="testEip712Signing"
      >
        {{ signingState === 'running' ? 'Waiting for signature…' : 'Test EIP-712 Signing' }}
      </button>

      <div v-if="signingState === 'success'" class="sign-result sign-result--ok">
        <p><strong>EIP-712 signing works</strong></p>
        <p>Recovered: {{ signingRecovered }}</p>
        <p>Wallet match: {{ signingWalletMatch ? 'Yes' : 'No' }}</p>
      </div>

      <div v-else-if="signingState === 'failure'" class="sign-result sign-result--fail">
        <p><strong>EIP-712 signing failed</strong></p>
        <p>{{ signingError }}</p>
      </div>

      <div v-else-if="signingState === 'cancelled'" class="sign-result sign-result--cancel">
        <p>{{ signingError }}</p>
      </div>

      <details v-if="signingDevDetails" class="dev-details">
        <summary>Dev details</summary>
        <pre>{{ signingDevDetails }}</pre>
      </details>
    </section>

    <section>
      <h2>Digital Products Backend</h2>
      <p>Development only. Verifies Supabase tables, buckets, and server env configuration.</p>

      <button
        type="button"
        :disabled="supabaseState === 'running'"
        @click="checkSupabaseSetup"
      >
        {{ supabaseState === 'running' ? 'Checking…' : 'Check Supabase Setup' }}
      </button>

      <div v-if="supabaseState === 'success'" class="sign-result sign-result--ok">
        <p><strong>Supabase backend ready</strong></p>
      </div>

      <div v-else-if="supabaseState === 'failure'" class="sign-result sign-result--fail">
        <p><strong>Supabase setup incomplete</strong></p>
        <p>{{ supabaseError }}</p>
      </div>

      <details v-if="supabaseHealth" class="dev-details">
        <summary>Health details</summary>
        <pre>{{ JSON.stringify(supabaseHealth, null, 2) }}</pre>
      </details>
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

.sign-result {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #ddd;
}

.sign-result--ok {
  background: #eef8ef;
  border-color: #b8ddb9;
}

.sign-result--fail {
  background: #fef2f2;
  border-color: #f0c4c4;
}

.sign-result--cancel {
  background: #f8f8f8;
}

.dev-details {
  margin-top: 0.75rem;
}

.dev-details pre {
  max-height: 14rem;
  overflow: auto;
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
