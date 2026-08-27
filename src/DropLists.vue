<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import DropCard from './DropCard.vue'
import { loadCommunityDrops, loadDropSummary, loadMyDrops, type DropSummary } from './dropCatalog'
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
let communityGen = 0
let recentGen = 0
let myGen = 0

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

async function loadCommunity() {
  const gen = ++communityGen
  if (walletChecking.value) {
    communityStatus.value = null
    return
  }
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
    communityStatus.value = 'Could not load community Drops.'
  }
}

async function loadRecent() {
  const gen = ++recentGen
  const ids = readRecentDropIds()
  if (ids.length === 0) {
    recent.value = []
    recentStatus.value = 'No recently viewed Drops.'
    return
  }
  if (walletChecking.value) {
    recentStatus.value = null
    return
  }
  if (!walletOnActiveNetwork.value) {
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

function reloadHomeLists() {
  void loadCommunity()
  void loadRecent()
  void loadMine()
}

watch([walletAccount, walletOnActiveNetwork, walletChecking], () => {
  reloadHomeLists()
})

onMounted(() => {
  reloadHomeLists()
})
</script>

<template>
  <section class="lists">
    <div class="block">
      <h2>Community</h2>
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
  margin-top: 16px;
  font-family: Inter, system-ui, sans-serif;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 0;
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
