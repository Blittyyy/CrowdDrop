<script setup lang="ts">
import { computed } from 'vue'
import { activeCrowdDropNetwork } from './escrowConfig'
import {
  connectWallet,
  switchWalletNetwork,
  walletAccount,
  walletBusy,
  walletChainName,
  walletChecking,
  walletError,
  walletErrorDetail,
  walletOnActiveNetwork,
  walletReady,
  walletSeenAccount,
  walletShortAddress,
  walletStatus,
} from './walletSession'

const props = defineProps<{
  extraBusy?: boolean
  compact?: boolean
  /** Light / Orange utility header treatment (Home). Default keeps legacy dark styling for Detail/Create. */
  utility?: boolean
}>()

const network = activeCrowdDropNetwork
const walletChainLabel = computed(() => walletChainName.value ?? 'Unknown')

const compactMeta = computed(() => {
  if (walletChecking.value)
    return 'Checking…'
  if (walletShortAddress.value && walletOnActiveNetwork.value)
    return `${network.chainName} · ${walletShortAddress.value}`
  if (walletShortAddress.value)
    return props.utility ? 'Wrong network' : `${walletChainLabel.value} · ${walletShortAddress.value}`
  return props.utility ? `${network.chainName} · Not connected` : `${network.chainName} · not connected`
})

const compactAction = computed(() => {
  if (walletChecking.value || (walletAccount.value && walletOnActiveNetwork.value))
    return null
  if (walletAccount.value && !walletOnActiveNetwork.value)
    return `Switch to ${network.chainName}`
  return walletAccount.value || walletSeenAccount.value ? 'Reconnect' : 'Connect'
})
</script>

<template>
  <div
    class="wallet"
    :class="{
      compact,
      utility,
      wrong: !!walletAccount && !walletOnActiveNetwork,
    }"
  >
    <div v-if="compact" class="compact-row">
      <span class="meta">{{ compactMeta }}</span>
      <button
        v-if="compactAction"
        type="button"
        class="ghost"
        :disabled="walletBusy || extraBusy"
        @click="walletAccount && !walletOnActiveNetwork ? switchWalletNetwork() : connectWallet()"
      >
        {{ compactAction }}
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
      <p v-if="walletStatus && !walletChecking && !walletReady" class="wait">{{ walletStatus }}</p>
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

    <p v-if="compact && !utility && walletError" class="error">{{ walletError }}</p>
    <p v-if="compact && !utility && walletAccount && !walletOnActiveNetwork" class="warn">
      Wrong network — switch to {{ network.chainName }}.
    </p>
    <p v-if="compact && !utility && walletBusy && walletStatus && !walletChecking && !walletReady" class="wait">
      {{ walletStatus }}
    </p>
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

/* Approved Home / utility header */
.utility.compact {
  gap: 0;
}
.utility .meta {
  color: #6A6A6A;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}
.utility.wrong .meta {
  color: #B9430E;
}
.utility .ghost {
  min-height: 32px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #141414;
  border: 1px solid #E2E2DE;
  border-radius: 8px;
  background: #fff;
}
.utility.wrong .ghost {
  border-color: #C94E12;
  color: #C94E12;
}
</style>
