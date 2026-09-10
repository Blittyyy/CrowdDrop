<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import DropCard from './DropCard.vue'
import {
  loadClaimTimestampsForDropIds,
  loadMyDrops,
  type DropSummary,
} from './dropCatalog'
import { partitionYourDrops, type HistoryDropRow } from './dropHistory'
import { activeCrowdDropNetwork } from './escrowConfig'
import { goToHome } from './appNavigation'
import { loadProductsForDropIds } from './products/productCache'
import type { PublicProductMetadata } from './products/finalizeClient'
import {
  walletAccount,
  walletChecking,
  walletOnActiveNetwork,
} from './walletSession'
import WalletBar from './WalletBar.vue'

const rows = ref<HistoryDropRow[]>([])
const productsByDropId = ref<Record<string, PublicProductMetadata>>({})
const status = ref<string | null>(null)
const busy = ref(false)
let loadGen = 0

const title = computed(() => 'History')

async function enrichProducts(list: DropSummary[]) {
  try {
    const map = await loadProductsForDropIds(list.map(row => row.id))
    const next: Record<string, PublicProductMetadata> = {}
    for (const [id, product] of map)
      next[id] = product
    productsByDropId.value = next
  }
  catch {
    // Legacy Drops without product metadata are fine.
  }
}

async function loadHistory() {
  const gen = ++loadGen
  if (walletChecking.value) {
    status.value = null
    rows.value = []
    return
  }
  if (!walletAccount.value) {
    rows.value = []
    status.value = 'Connect to see History.'
    return
  }
  if (!walletOnActiveNetwork.value) {
    rows.value = []
    status.value = `Switch to ${activeCrowdDropNetwork.chainName} to see History.`
    return
  }

  busy.value = true
  status.value = null
  try {
    const mine = await loadMyDrops(walletAccount.value)
    if (gen !== loadGen)
      return
    const claimedIds = mine.filter(row => row.status === 'Claimed').map(row => row.id)
    const claimTs = await loadClaimTimestampsForDropIds(claimedIds)
    if (gen !== loadGen)
      return
    const nowSec = Math.floor(Date.now() / 1000)
    const { history } = partitionYourDrops(mine, nowSec, claimTs)
    rows.value = history
    status.value = history.length === 0 ? 'No completed Drops yet.' : null
    void enrichProducts(history)
  }
  catch {
    if (gen !== loadGen)
      return
    rows.value = []
    status.value = 'Couldn’t load History. Try again.'
  }
  finally {
    if (gen === loadGen)
      busy.value = false
  }
}

watch([walletAccount, walletOnActiveNetwork, walletChecking], () => {
  void loadHistory()
})

onMounted(() => {
  void loadHistory()
})
</script>

<template>
  <div class="history">
    <header class="top">
      <button type="button" class="back" @click="goToHome()">← Home</button>
      <WalletBar compact utility />
    </header>

    <h1 class="title">{{ title }}</h1>
    <p class="lede">Completed Drops from this wallet.</p>

    <p v-if="status" class="empty">{{ status }}</p>
    <p v-else-if="busy && !rows.length" class="empty">Loading…</p>

    <div v-if="rows.length" class="rows">
      <DropCard
        v-for="row in rows"
        :key="'history-' + row.id"
        :summary="row"
        :product="productsByDropId[row.id] ?? null"
      />
    </div>
  </div>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: Inter, system-ui, sans-serif;
  color: #141414;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  margin-bottom: 14px;
}
.back {
  border: none;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0;
  min-height: 44px;
  cursor: pointer;
  text-align: left;
}
.back:hover {
  color: #141414;
}
.title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
}
.lede {
  margin: 0 0 14px;
  font-size: 13px;
  font-weight: 400;
  color: #6A6A6A;
  line-height: 1.4;
}
.empty {
  margin: 6px 0 0;
  color: #6A6A6A;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
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
</style>
