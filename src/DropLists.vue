<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import DropCard from './DropCard.vue'
import { loadCommunityDrops, loadDropSummary, loadMyDrops, type DropSummary } from './dropCatalog'
import {
  ACTIVE_DROP_POLL_MS,
  canStartPollTick,
  shouldPausePolling,
} from './dropDetailPolling'
import {
  mergePolledSummary,
  patchSummaryList,
  pollableSummaryIds,
  shouldPollHomeLists,
} from './homeListPolling'
import { activeCrowdDropNetwork } from './escrowConfig'
import { readRecentDropIds, removeRecentDropId } from './lastOpenedDrop'
import {
  walletAccount,
  walletChecking,
  walletOnActiveNetwork,
} from './walletSession'

const community = ref<DropSummary[]>([])
const recent = ref<DropSummary[]>([])
const mine = ref<DropSummary[]>([])
const communityStatus = ref<string | null>(null)
const communityFailed = ref(false)
const recentStatus = ref<string | null>(null)
const myStatus = ref<string | null>(null)
const refreshing = ref(false)
const refreshError = ref<string | null>(null)
let communityGen = 0
let recentGen = 0
let myGen = 0
let refreshGen = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
let pollInFlight = false

function visibleSummaries(): DropSummary[] {
  return [...community.value, ...recent.value, ...mine.value]
}

function statusRank(status: DropSummary['status']): number {
  if (status === 'Active')
    return 0
  if (status === 'Successful')
    return 1
  if (status === 'Expired')
    return 2
  if (status === 'Claimed')
    return 3
  return 4
}

const mineSorted = computed(() =>
  [...mine.value].sort((a, b) => {
    const byStatus = statusRank(a.status) - statusRank(b.status)
    if (byStatus !== 0)
      return byStatus
    return BigInt(b.id) > BigInt(a.id) ? 1 : -1
  }),
)

const communitySorted = computed(() =>
  [...community.value].sort((a, b) => {
    const byStatus = statusRank(a.status) - statusRank(b.status)
    if (byStatus !== 0)
      return byStatus
    return BigInt(b.id) > BigInt(a.id) ? 1 : -1
  }),
)

/** Public on-chain list — independent of wallet connection / network. */
async function loadCommunity() {
  const gen = ++communityGen
  communityFailed.value = false
  communityStatus.value = null
  try {
    const rows = await loadCommunityDrops()
    if (gen !== communityGen)
      return
    community.value = rows
    communityStatus.value = rows.length === 0 ? 'No active Drops yet.' : null
  }
  catch {
    if (gen !== communityGen)
      return
    community.value = []
    communityFailed.value = true
    communityStatus.value = 'Couldn’t load Community.'
  }
}

/** Recent IDs are local; drop payloads resolve via public RPC. */
async function loadRecent() {
  const gen = ++recentGen
  const ids = readRecentDropIds()
  if (ids.length === 0) {
    recent.value = []
    recentStatus.value = 'No recently viewed Drops.'
    return
  }

  const loaded: DropSummary[] = []
  for (const id of ids) {
    try {
      const summary = await loadDropSummary(BigInt(id))
      if (gen !== recentGen)
        return
      if (summary === 'missing') {
        removeRecentDropId(id)
        continue
      }
      loaded.push(summary)
    }
    catch {
      // Skip one bad id; keep resolving the rest via public reads.
      if (gen !== recentGen)
        return
    }
  }
  if (gen !== recentGen)
    return
  recent.value = loaded
  recentStatus.value = loaded.length === 0 ? 'No recently viewed Drops.' : null
}

async function loadMine() {
  const gen = ++myGen
  if (walletChecking.value) {
    myStatus.value = null
    mine.value = []
    return
  }
  if (!walletAccount.value) {
    mine.value = []
    myStatus.value = 'Connect to see Your Drops.'
    return
  }
  if (!walletOnActiveNetwork.value) {
    mine.value = []
    myStatus.value = `Switch to ${activeCrowdDropNetwork.chainName} to see Your Drops.`
    return
  }
  myStatus.value = null
  try {
    const rows = await loadMyDrops(walletAccount.value)
    if (gen !== myGen)
      return
    mine.value = rows
    myStatus.value = rows.length === 0 ? 'You haven’t created or joined a Drop yet.' : null
  }
  catch {
    if (gen !== myGen)
      return
    mine.value = []
    myStatus.value = 'You haven’t created or joined a Drop yet.'
  }
}

function applySummaryUpdate(id: string, fresh: DropSummary) {
  community.value = patchSummaryList(community.value, id, mergePolledSummary(
    community.value.find(row => row.id === id) ?? fresh,
    fresh,
  ))
  recent.value = patchSummaryList(recent.value, id, mergePolledSummary(
    recent.value.find(row => row.id === id) ?? fresh,
    fresh,
  ))
  mine.value = patchSummaryList(mine.value, id, mergePolledSummary(
    mine.value.find(row => row.id === id) ?? fresh,
    fresh,
  ))
}

function stopHomePolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startHomePolling() {
  stopHomePolling()
  if (shouldPausePolling(document.visibilityState))
    return
  if (!shouldPollHomeLists(visibleSummaries()))
    return
  pollTimer = setInterval(() => {
    void pollHomeLists()
  }, ACTIVE_DROP_POLL_MS)
}

function syncHomePolling() {
  if (shouldPausePolling(document.visibilityState) || !shouldPollHomeLists(visibleSummaries())) {
    stopHomePolling()
    return
  }
  startHomePolling()
}

async function pollHomeLists() {
  if (!shouldPollHomeLists(visibleSummaries()))
    return
  if (!canStartPollTick(pollInFlight, refreshing.value))
    return

  pollInFlight = true
  try {
    const ids = pollableSummaryIds(community.value, recent.value, mine.value)
    for (const id of ids) {
      const existing = community.value.find(row => row.id === id)
        ?? recent.value.find(row => row.id === id)
        ?? mine.value.find(row => row.id === id)
      if (!existing)
        continue
      const fresh = await loadDropSummary(BigInt(id))
      if (fresh === 'missing')
        continue
      applySummaryUpdate(id, fresh)
    }
    syncHomePolling()
  }
  catch {
    // Quiet background poll — keep last known good rows.
  }
  finally {
    pollInFlight = false
  }
}

function resumeHomeFromBackground() {
  if (shouldPausePolling(document.visibilityState))
    return
  if (shouldPollHomeLists(visibleSummaries())) {
    void pollHomeLists().finally(() => syncHomePolling())
  }
}

function onVisibilityChange() {
  if (shouldPausePolling(document.visibilityState)) {
    stopHomePolling()
    return
  }
  resumeHomeFromBackground()
}

function reloadHomeLists() {
  void loadCommunity()
  void loadRecent()
  void loadMine()
}

/** Manual Home refresh — Community first, plus Your Drops / Recent. Keeps last good Community rows on failure. */
async function refreshHome() {
  if (refreshing.value)
    return
  const gen = ++refreshGen
  refreshing.value = true
  refreshError.value = null
  const previousCommunity = [...community.value]

  await Promise.all([loadCommunity(), loadRecent(), loadMine()])
  if (gen !== refreshGen)
    return

  if (communityFailed.value) {
    if (previousCommunity.length > 0) {
      community.value = previousCommunity
      communityFailed.value = false
      communityStatus.value = null
    }
    refreshError.value = 'Couldn’t refresh. Try again.'
  }

  refreshing.value = false
  syncHomePolling()
}

watch([walletAccount, walletOnActiveNetwork, walletChecking], () => {
  // Community / Recent are public; still refresh Your Drops on wallet changes.
  void loadMine()
})

watch([community, recent, mine], () => {
  syncHomePolling()
}, { deep: true })

onMounted(() => {
  reloadHomeLists()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', resumeHomeFromBackground)
})

onUnmounted(() => {
  stopHomePolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', resumeHomeFromBackground)
})
</script>

<template>
  <section class="lists">
    <div class="block">
      <div class="section-head">
        <h2>Community</h2>
        <button
          type="button"
          class="refresh-btn"
          :disabled="refreshing"
          :aria-busy="refreshing"
          @click="refreshHome"
        >
          <span class="refresh-hit">{{ refreshing ? '↻ Refreshing…' : '↻ Refresh' }}</span>
        </button>
      </div>
      <p v-if="refreshError" class="refresh-error">{{ refreshError }}</p>
      <p v-if="communityStatus" class="empty">{{ communityStatus }}</p>
      <button v-if="communityFailed" type="button" class="retry" @click="loadCommunity">Retry</button>
      <div v-if="communitySorted.length" class="rows">
        <DropCard v-for="row in communitySorted" :key="'community-' + row.id" :summary="row" />
      </div>
    </div>

    <div class="block">
      <h2>Your Drops</h2>
      <p v-if="myStatus" class="empty">{{ myStatus }}</p>
      <div v-if="mineSorted.length" class="rows">
        <DropCard v-for="row in mineSorted" :key="'mine-' + row.id" :summary="row" />
      </div>
    </div>

    <div class="block">
      <h2>Recent</h2>
      <p v-if="recentStatus" class="empty">{{ recentStatus }}</p>
      <div v-if="recent.length" class="rows">
        <DropCard v-for="row in recent" :key="'recent-' + row.id" :summary="row" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.lists {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 14px;
  font-family: Inter, system-ui, sans-serif;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
}
.section-head h2 {
  margin: 0;
}
.rows {
  display: flex;
  flex-direction: column;
}
.rows :deep(.drop-row) {
  border-bottom: 1px solid #E2E2DE;
}
.rows :deep(.drop-row:last-child) {
  border-bottom: none;
}
h2 {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 600;
  color: #6A6A6A;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  border: none;
  background: transparent;
  color: #8A8A8A;
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  padding: 0;
  min-height: 44px;
  min-width: 44px;
  cursor: pointer;
  text-align: right;
  flex: 0 0 auto;
}
.refresh-hit {
  display: inline-block;
  padding: 2px 0;
  line-height: 1.3;
}
.refresh-btn:hover:not(:disabled) {
  color: #6A6A6A;
}
.refresh-btn:active:not(:disabled) {
  color: #141414;
  opacity: 0.85;
}
.refresh-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.refresh-error {
  margin: 0 0 4px;
  font-size: 11px;
  color: #B9430E;
  line-height: 1.35;
}
.empty {
  margin: 6px 0 0;
  color: #6A6A6A;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
}
.retry {
  margin-top: 8px;
  align-self: flex-start;
  min-height: 32px;
  border-radius: 8px;
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #6A6A6A;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}
</style>
