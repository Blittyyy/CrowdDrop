<script setup lang="ts">
import { activeCrowdDropNetwork } from './escrowConfig'
import {
  connectWallet,
  switchWalletNetwork,
  walletAccount,
  walletBusy,
  walletChecking,
  walletError,
  walletErrorDetail,
  walletOnActiveNetwork,
  walletSeenAccount,
  walletShortAddress,
  walletStatus,
} from './walletSession'

defineProps<{
  extraBusy?: boolean
  compact?: boolean
}>()

const network = activeCrowdDropNetwork
</script>

<template>
  <div class="wallet" :class="{ compact, wrong: !!walletAccount && !walletOnActiveNetwork }">
    <div v-if="compact" class="compact-row">
      <span class="meta">
        <template v-if="walletChecking">Checking…</template>
        <template v-else>
          {{ network.chainName }}<template v-if="walletShortAddress"> · {{ walletShortAddress }}</template>
          <template v-else> · not connected</template>
        </template>
      </span>
      <button
        v-if="!walletChecking && (!walletAccount || !walletOnActiveNetwork)"
        type="button"
        class="ghost"
        :disabled="walletBusy || extraBusy"
        @click="walletAccount && !walletOnActiveNetwork ? switchWalletNetwork() : connectWallet()"
      >
        {{ walletAccount && !walletOnActiveNetwork ? `Switch to ${network.chainName}` : (walletAccount || walletSeenAccount ? 'Reconnect' : 'Connect') }}
      </button>
    </div>

    <template v-else>
      <p v-if="walletChecking" class="wait">Checking wallet…</p>
      <template v-else>
        <p class="meta">
          {{ network.chainName }}
          <template v-if="walletShortAddress"> · {{ walletShortAddress }}</template>
          <template v-else> · not connected</template>
        </p>
        <p v-if="walletAccount && !walletOnActiveNetwork" class="warn">
          Switch to {{ network.chainName }} before continuing.
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
          class="secondary"
          :disabled="walletBusy || extraBusy"
          @click="connectWallet"
        >
          {{ walletAccount || walletSeenAccount ? 'Reconnect wallet' : 'Connect EVM wallet' }}
        </button>
        <button
          v-if="!walletChecking && walletAccount && !walletOnActiveNetwork"
          type="button"
          class="primary"
          :disabled="walletBusy || extraBusy"
          @click="switchWalletNetwork"
        >
          Switch to {{ network.chainName }}
        </button>
      </div>
    </template>

    <p v-if="compact && walletError" class="error">{{ walletError }}</p>
    <p v-if="compact && walletAccount && !walletOnActiveNetwork" class="warn">
      Wrong network — switch to {{ network.chainName }}.
    </p>
    <p v-if="compact && walletStatus && !walletChecking" class="wait">{{ walletStatus }}</p>
  </div>
</template>

<style scoped>
.wallet {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.compact-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.meta {
  margin: 0;
  color: var(--cd-tan);
  font-size: 0.78rem;
  letter-spacing: 0.01em;
}
.wait {
  margin: 0;
  color: var(--cd-cream);
  font-size: 0.85rem;
  font-weight: 600;
}
.warn {
  margin: 0;
  color: var(--cd-orange);
  font-size: 0.85rem;
  font-weight: 600;
}
.error {
  margin: 0;
  color: var(--cd-error);
  font-size: 0.85rem;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.5rem;
}
button {
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid transparent;
  padding: 0.75rem 1rem;
  cursor: pointer;
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.primary {
  background: var(--cd-orange);
  color: var(--cd-cream);
  font-weight: 600;
}
.secondary {
  background: transparent;
  color: var(--cd-cream);
  border-color: var(--cd-border);
}
.ghost {
  min-height: 28px;
  padding: 0.25rem 0.55rem;
  font-size: 0.72rem;
  background: transparent;
  color: var(--cd-tan);
  border: 1px solid var(--cd-border);
  border-radius: 999px;
}
.wrong .meta {
  color: var(--cd-orange);
}
.dev {
  margin: 0.35rem 0;
  color: var(--cd-muted);
}
pre {
  white-space: pre-wrap;
  font-size: 0.75rem;
  color: var(--cd-muted);
}
</style>
