<script setup lang="ts">
import { SHOWCASE_COMMUNITY, SHOWCASE_RECENT, SHOWCASE_WALLET, SHOWCASE_YOURS } from './fixtures'

defineProps<{
  label: string
  thesis: string
}>()

const community = SHOWCASE_COMMUNITY
const yours = SHOWCASE_YOURS
const recent = SHOWCASE_RECENT
const wallet = SHOWCASE_WALLET
</script>

<template>
  <!--
    VARIANT C — Extreme native-wallet utility
    Grammar: almost no chrome. Plain lines. Create is a text action. Drops appear immediately.
  -->
  <div class="phone c">
    <header class="head">
      <span class="brand">CrowdDrop</span>
      <span class="wallet">{{ wallet.network }} · {{ wallet.addressShort }}</span>
    </header>

    <p class="line">
      <button type="button" class="linkish">+ New Drop</button>
    </p>

    <p class="label">Community</p>
    <button v-for="d in community" :key="'c' + d.id" type="button" class="item">
      <span class="l">
        <strong>${{ d.contributionUsdt }} USDT</strong>
        · #{{ d.id }}
      </span>
      <span class="r">{{ d.joined }}/{{ d.goal }} · {{ d.remaining }}</span>
    </button>

    <p class="label">Your Drops</p>
    <button v-for="d in yours" :key="'y' + d.id" type="button" class="item">
      <span class="l">
        <strong>${{ d.contributionUsdt }} USDT</strong>
        · #{{ d.id }} · selling
      </span>
      <span class="r">{{ d.joined }}/{{ d.goal }}</span>
    </button>

    <p class="label">Recent</p>
    <button v-for="d in recent" :key="'r' + d.id" type="button" class="item">
      <span class="l">
        <strong>${{ d.contributionUsdt }} USDT</strong>
        · #{{ d.id }}
      </span>
      <span class="r">{{ d.remaining }}</span>
    </button>

    <p class="empty-demo">Empty example: No recently viewed Drops.</p>
  </div>
</template>

<style scoped>
.phone {
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
  background: #0f0f0f;
  color: #ece7df;
  font-family: Inter, system-ui, sans-serif;
  padding: 12px 12px 16px;
  border: 1px solid #262626;
  border-radius: 8px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.brand {
  font-size: 14px;
  font-weight: 600;
}
.wallet {
  font-size: 11px;
  color: #8f877b;
}
.line {
  margin: 0 0 12px;
}
.linkish {
  border: none;
  background: transparent;
  color: #d2652f;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 0;
  min-height: 40px;
  cursor: pointer;
}
.label {
  margin: 14px 0 2px;
  font-size: 11px;
  color: #7a7268;
}
.item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 11px 0;
  border: none;
  border-bottom: 1px solid #1f1f1f;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-height: 44px;
}
.l {
  font-size: 13px;
  color: #c9c1b5;
}
.l strong {
  color: #f2ebe0;
  font-weight: 600;
}
.r {
  font-size: 12px;
  color: #9a9184;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.empty-demo {
  margin: 10px 0 0;
  font-size: 12px;
  color: #6a635a;
}
</style>
