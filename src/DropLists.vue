<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import DropCard from './DropCard.vue'
import { activeCrowdDropNetwork } from './escrowConfig'
import { loadCommunityDrops, loadDropSummary, loadMyDrops, type DropSummary } from './dropCatalog'
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

async function loadCommunity() {
  const gen = ++communityGen
  communityFailed.value = false
  communityStatus.value = 'Loading community drops…'
  try {
    const rows = await loadCommunityDrops()
    if (gen !== communityGen)
      return
    community.value = rows
    communityStatus.value = rows.length === 0 ? 'No active community drops yet.' : null
  }
  catch {
    if (gen !== communityGen)
      return
    community.value = []
    communityFailed.value = true
    communityStatus.value = 'Could not load community drops. Try again.'
  }
}

async function loadRecent() {
  const gen = ++recentGen
  const ids = readRecentDropIds()
  if (ids.length === 0) {
    recent.value = []
    recentStatus.value = null
    return
  }
  recentStatus.value = 'Loading recent drops…'
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
  recentStatus.value = loaded.length === 0 && ids.length > 0
    ? `Could not load recent drops. Try again after connecting to ${activeCrowdDropNetwork.chainName}.`
    : null
}

async function loadMine() {
  const gen = ++myGen
  if (walletChecking.value) {
    myStatus.value = 'Checking wallet…'
    mine.value = []
    return
  }
  if (!walletAccount.value) {
    mine.value = []
    myStatus.value = 'Reconnect wallet to view your drops'
    return
  }
  if (!walletOnActiveNetwork.value) {
    mine.value = []
    myStatus.value = `Switch to ${activeCrowdDropNetwork.chainName} to view your drops`
    return
  }
  myStatus.value = 'Loading your drops…'
  try {
    const rows = await loadMyDrops(walletAccount.value)
    if (gen !== myGen)
      return
    mine.value = rows
    myStatus.value = rows.length === 0 ? 'No drops found for this wallet yet.' : null
  }
  catch {
    if (gen !== myGen)
      return
    mine.value = []
    myStatus.value = 'Could not load your drops. Recent Drops still work.'
  }
}

watch([walletAccount, walletOnActiveNetwork, walletChecking], () => {
  void loadMine()
})

onMounted(() => {
  void loadCommunity()
  void loadRecent()
  void loadMine()
})
</script>

<template>
  <section class="lists">
    <div class="block">
      <h2>Community Drops</h2>
      <p v-if="communityStatus" class="wait">{{ communityStatus }}</p>
      <button v-if="communityFailed" type="button" class="retry" @click="loadCommunity">Retry</button>
      <div v-if="community.length" class="cards">
        <DropCard v-for="row in community" :key="'community-' + row.id" :summary="row" />
      </div>
    </div>
    <div class="block">
      <h2>My Drops</h2>
      <p v-if="myStatus" class="wait">{{ myStatus }}</p>
      <div v-if="mine.length" class="cards">
        <DropCard v-for="row in mine" :key="'mine-' + row.id" :summary="row" />
      </div>
    </div>
    <div v-if="recent.length || recentStatus" class="block">
      <h2>Recent Drops</h2>
      <p v-if="recentStatus" class="wait">{{ recentStatus }}</p>
      <div v-if="recent.length" class="cards">
        <DropCard v-for="row in recent" :key="'recent-' + row.id" :summary="row" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.lists {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-top: 1.5rem;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.cards {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
h2 {
  margin: 0;
  font-size: 1.1rem;
}
.wait {
  margin: 0;
  font-weight: 600;
}
.retry {
  min-height: 44px;
  font-size: 1rem;
  align-self: flex-start;
}
</style>
