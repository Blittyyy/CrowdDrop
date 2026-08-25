<script setup lang="ts">
import { activeCrowdDropNetwork } from './escrowConfig'
import {
  connectWallet,
  switchWalletNetwork,
  walletAccount,
  walletBusy,
  walletChecking,
  walletChainName,
  walletError,
  walletErrorDetail,
  walletOnActiveNetwork,
  walletSeenAccount,
  walletShortAddress,
  walletStatus,
} from './walletSession'

defineProps<{
  extraBusy?: boolean
}>()

const network = activeCrowdDropNetwork
</script>

<template>
  <div class="wallet">
    <p v-if="walletChecking" class="wait">Checking wallet…</p>
    <template v-else>
      <p>Wallet: {{ walletShortAddress ?? 'not connected' }}</p>
      <p>
        Network:
        <strong>{{ walletChainName ?? 'unknown' }}</strong>
        <span v-if="walletAccount && !walletOnActiveNetwork"> — switch to {{ network.chainName }}</span>
      </p>
    </template>
    <p v-if="walletStatus && !walletChecking" class="wait">{{ walletStatus }}</p>
    <p v-if="walletError" class="error">{{ walletError }}</p>
    <details v-if="walletErrorDetail" class="dev">
      <summary>Developer details</summary>
      <pre>{{ walletErrorDetail }}</pre>
    </details>
    <div class="actions">
      <button
        v-if="!walletChecking"
        type="button"
        :disabled="walletBusy || extraBusy"
        @click="connectWallet"
      >
        {{ walletAccount || walletSeenAccount ? 'Reconnect wallet' : 'Connect EVM wallet' }}
      </button>
      <button
        v-if="!walletChecking && walletAccount && !walletOnActiveNetwork"
        type="button"
        :disabled="walletBusy || extraBusy"
        @click="switchWalletNetwork"
      >
        Switch to {{ network.chainName }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.wallet {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
p {
  overflow-wrap: anywhere;
  margin: 0.25rem 0;
}
.wait {
  font-weight: 600;
}
.error {
  color: #a40000;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
button {
  min-height: 44px;
  font-size: 1rem;
  padding: 0.75rem;
}
.dev {
  margin: 0.35rem 0;
}
pre {
  white-space: pre-wrap;
  font-size: 0.75rem;
}
</style>
