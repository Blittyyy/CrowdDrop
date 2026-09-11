<script setup lang="ts">
import { computed } from 'vue'
import { activeCrowdDropNetwork } from './escrowConfig'
import { isMobileShareContext } from './shareDrop'
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
  walletProviderAvailable,
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
  /** Nimiq Pay deeplink for Open in Nimiq Pay when no EIP-1193 provider. */
  nimiqPayOpenHref?: string | null
}>()

const network = activeCrowdDropNetwork
const showDevDetails = import.meta.env.DEV
const walletChainLabel = computed(() => walletChainName.value ?? 'Unknown')

const showOpenInNimiqPay = computed(() =>
  !walletChecking.value
  && !walletProviderAvailable.value
  && isMobileShareContext()
  && !!props.nimiqPayOpenHref,
)

const showConnect = computed(() =>
  !walletChecking.value
  && walletProviderAvailable.value
  && !(walletAccount.value && walletOnActiveNetwork.value),
)

const compactMeta = computed(() => {
  if (walletChecking.value)
    return 'Checking…'
  if (!walletProviderAvailable.value)
    return 'Nimiq Pay required'
  if (walletShortAddress.value && walletOnActiveNetwork.value)
    return `${network.chainName} · ${walletShortAddress.value}`
  if (walletShortAddress.value)
    return props.utility ? 'Wrong network' : `${walletChainLabel.value} · ${walletShortAddress.value}`
  return props.utility ? `${network.chainName} · Not connected` : `${network.chainName} · not connected`
})

const compactAction = computed(() => {
  if (!showConnect.value)
    return null
  if (walletAccount.value && !walletOnActiveNetwork.value)
    return `Switch to ${network.chainName}`
  return walletAccount.value || walletSeenAccount.value ? 'Reconnect' : 'Connect'
})

const noProviderHint = computed(() => {
  if (walletChecking.value || walletProviderAvailable.value)
    return null
  return 'Open CrowdDrop in Nimiq Pay to connect your wallet.'
})

function onCompactAction() {
  if (walletAccount.value && !walletOnActiveNetwork.value)
    void switchWalletNetwork()
  else
    void connectWallet()
}
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
    <template v-if="compact">
      <div class="compact-row">
        <span class="meta">{{ compactMeta }}</span>
        <a
          v-if="showOpenInNimiqPay"
          class="ghost open-nimiq"
          :href="nimiqPayOpenHref!"
        >
          Open in Nimiq Pay
        </a>
        <button
          v-else-if="compactAction"
          type="button"
          class="ghost"
          :disabled="walletBusy || extraBusy"
          @click="onCompactAction"
        >
          {{ walletBusy ? 'Connecting…' : compactAction }}
        </button>
      </div>
      <p v-if="utility && noProviderHint && !showOpenInNimiqPay" class="utility-wait">{{ noProviderHint }}</p>
      <p v-if="utility && walletBusy && walletStatus" class="utility-wait">{{ walletStatus }}</p>
      <p v-if="utility && walletError" class="utility-error">{{ walletError }}</p>
      <p v-if="!utility && walletError" class="error">{{ walletError }}</p>
      <p v-if="!utility && walletAccount && !walletOnActiveNetwork" class="warn">
        Wrong network — switch to {{ network.chainName }}.
      </p>
      <p v-if="!utility && walletBusy && walletStatus && !walletChecking && !walletReady" class="wait">
        {{ walletStatus }}
      </p>
    </template>

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
      <p v-if="noProviderHint" class="wait">{{ noProviderHint }}</p>
      <p v-if="walletStatus && !walletChecking && !walletReady && walletProviderAvailable" class="wait">{{ walletStatus }}</p>
      <p v-if="walletError" class="error">{{ walletError }}</p>
      <details v-if="showDevDetails && walletErrorDetail" class="dev">
        <summary>Developer details</summary>
        <pre>{{ walletErrorDetail }}</pre>
      </details>
      <div class="actions">
        <a
          v-if="showOpenInNimiqPay"
          class="secondary open-nimiq"
          :href="nimiqPayOpenHref!"
        >
          Open in Nimiq Pay
        </a>
        <button
          v-else-if="!walletChecking && walletProviderAvailable"
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
  </div>
</template>

<style scoped>
.wallet {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: Inter, system-ui, sans-serif;
}
.wallet.compact {
  align-items: flex-end;
  text-align: right;
  gap: 2px;
  min-width: 0;
}
.compact-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-height: 44px;
}
.meta {
  margin: 0;
  font-size: 11px;
  font-weight: 400;
  color: #6A6A6A;
  line-height: 1.3;
}
.wallet.compact .meta {
  font-size: 11px;
}
.wallet.utility .meta {
  color: #6A6A6A;
}
.wallet.wrong.utility .meta {
  color: #B9430E;
}
.ghost,
a.open-nimiq.ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #E2E2DE;
  background: #fff;
  color: #141414;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  min-height: 32px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  touch-action: manipulation;
}
.wallet.utility .ghost,
.wallet.utility a.open-nimiq.ghost {
  border-color: #C94E12;
  color: #C94E12;
  background: transparent;
}
.ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.utility-wait,
.wait {
  margin: 0;
  font-size: 11px;
  color: #6A6A6A;
  line-height: 1.35;
  max-width: 14rem;
}
.utility-error,
.error {
  margin: 0;
  font-size: 11px;
  color: #B9430E;
  line-height: 1.35;
}
.warn {
  margin: 0;
  font-size: 11px;
  color: #B9430E;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.secondary,
a.open-nimiq.secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border: 1px solid #E2E2DE;
  background: #F6F6F4;
  color: #141414;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
}
.primary {
  min-height: 44px;
  border: 1px solid #C94E12;
  background: #C94E12;
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.dev {
  font-size: 11px;
  color: #6A6A6A;
}
.dev pre {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 4px 0 0;
}
</style>
