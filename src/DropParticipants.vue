<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  participantListPreview,
} from './dropParticipants'
import { activeCrowdDropNetwork } from './escrowConfig'
import { loadCurrentParticipants } from './loadDropParticipants'
import { sameAddress } from './wallet'

const props = defineProps<{
  dropId: bigint | null
  goal: bigint | number
  viewerAddress?: string | null
  /** Bump to force a reload (e.g. after Refresh). */
  reloadToken?: number
}>()

const addresses = ref<`0x${string}`[]>([])
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const expanded = ref(false)
const copiedKey = ref<string | null>(null)
let loadGen = 0

const explorerBase = activeCrowdDropNetwork.blockExplorerUrls[0] ?? 'https://polygonscan.com'

const explorerLinkLabel = computed(() => {
  try {
    const host = new URL(explorerBase).hostname.replace(/^www\./, '')
    if (host.includes('polygonscan'))
      return 'View on Polygonscan'
    if (host.includes('etherscan'))
      return 'View on Etherscan'
  }
  catch {
    /* fall through */
  }
  return 'View on block explorer'
})

const preview = computed(() =>
  participantListPreview(addresses.value, expanded.value),
)

const headingCount = computed(() => {
  const n = addresses.value.length
  const goal = typeof props.goal === 'bigint' ? props.goal.toString() : String(props.goal)
  return `${n} / ${goal}`
})

async function loadParticipants() {
  if (props.dropId == null) {
    addresses.value = []
    status.value = 'idle'
    return
  }
  const gen = ++loadGen
  status.value = 'loading'
  try {
    const rows = await loadCurrentParticipants(props.dropId)
    if (gen !== loadGen)
      return
    addresses.value = rows
    status.value = 'ready'
    if (rows.length <= 5)
      expanded.value = false
  }
  catch {
    if (gen !== loadGen)
      return
    addresses.value = []
    status.value = 'error'
  }
}

async function copyAddress(address: string) {
  try {
    await navigator.clipboard.writeText(address)
    copiedKey.value = address.toLowerCase()
    window.setTimeout(() => {
      if (copiedKey.value === address.toLowerCase())
        copiedKey.value = null
    }, 1400)
  }
  catch {
    /* ignore */
  }
}

function explorerAddressUrl(address: string) {
  return `${explorerBase}/address/${address}`
}

function isYou(address: string) {
  return sameAddress(address, props.viewerAddress)
}

watch(
  () => [props.dropId?.toString() ?? '', props.reloadToken ?? 0] as const,
  () => {
    expanded.value = false
    void loadParticipants()
  },
  { immediate: true },
)

defineExpose({ reload: loadParticipants })
</script>

<template>
  <section class="participants" aria-label="Participants">
    <h2 class="heading">
      Participants
      <span v-if="status === 'ready'" class="count">· {{ headingCount }}</span>
    </h2>

    <p v-if="status === 'loading'" class="muted">Loading wallets…</p>

    <template v-else-if="status === 'error'">
      <p class="muted">Couldn’t load participant wallets.</p>
      <button type="button" class="retry" @click="loadParticipants">Retry</button>
    </template>

    <template v-else-if="status === 'ready' && addresses.length === 0">
      <p class="muted">No funds currently pooled.</p>
    </template>

    <template v-else-if="status === 'ready'">
      <ul class="rows">
        <li v-for="address in preview.shown" :key="address.toLowerCase()" class="row">
          <div class="row-main">
            <div class="addr-line">
              <p class="addr-full">{{ address }}</p>
              <span v-if="isYou(address)" class="you">You</span>
            </div>
            <div class="row-actions">
              <button
                type="button"
                class="copy-btn"
                @click="copyAddress(address)"
              >
                {{ copiedKey === address.toLowerCase() ? 'Copied' : 'Copy' }}
              </button>
              <a
                class="explorer-link"
                :href="explorerAddressUrl(address)"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ explorerLinkLabel }}
              </a>
            </div>
          </div>
        </li>
      </ul>
      <button
        v-if="preview.hiddenCount > 0"
        type="button"
        class="more"
        @click="expanded = true"
      >
        View all {{ preview.total }}
      </button>
      <button
        v-else-if="expanded && addresses.length > 5"
        type="button"
        class="more"
        @click="expanded = false"
      >
        Show less
      </button>
    </template>
  </section>
</template>

<style scoped>
.participants {
  margin-top: 18px;
  font-family: Inter, system-ui, sans-serif;
  max-width: 100%;
  overflow-x: hidden;
}
.heading {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: #6A6A6A;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.count {
  font-weight: 600;
  letter-spacing: 0.04em;
}
.muted {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6A6A6A;
  line-height: 1.4;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.row {
  border-bottom: 1px solid #E2E2DE;
  padding: 10px 0;
  min-width: 0;
}
.row:last-child {
  border-bottom: none;
}
.row-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.addr-line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.addr-full {
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: #141414;
  word-break: break-all;
  overflow-wrap: anywhere;
}
.you {
  flex: 0 0 auto;
  font-family: Inter, system-ui, sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #6A6A6A;
  padding-top: 1px;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
}
.copy-btn {
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 10px 12px;
  min-height: 44px;
  border-radius: 8px;
  cursor: pointer;
}
.copy-btn:active {
  background: #EFEFEA;
}
.explorer-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 0;
  font-size: 12px;
  font-weight: 500;
  color: #6A6A6A;
  text-decoration: underline;
  text-underline-offset: 2px;
  line-height: 1.35;
}
.more,
.retry {
  margin-top: 6px;
  border: none;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 0;
  min-height: 32px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.retry {
  display: inline-block;
}
</style>
