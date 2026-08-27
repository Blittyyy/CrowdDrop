<script setup lang="ts">
import type { FakeDrop } from './fixtures'
import { SHOWCASE_COMMUNITY, SHOWCASE_RECENT, SHOWCASE_WALLET, SHOWCASE_YOURS } from './fixtures'

defineProps<{
  label: string
  thesis: string
}>()

const community = SHOWCASE_COMMUNITY
const yours = SHOWCASE_YOURS
const recent = SHOWCASE_RECENT
const wallet = SHOWCASE_WALLET

function fill(drop: FakeDrop) {
  return `${drop.joined}/${drop.goal}`
}
</script>

<template>
  <!--
    VARIANT A — Dense payment ledger
    Grammar: tabular statement rows. Money + ID first. Progress as fraction text, not bars.
  -->
  <div class="phone a">
    <header class="head">
      <span class="brand">CrowdDrop</span>
      <span class="wallet">{{ wallet.network }} · {{ wallet.addressShort }}</span>
    </header>

    <div class="toolbar">
      <span class="hint">Open pools</span>
      <button type="button" class="new">New Drop</button>
    </div>

    <section>
      <h2>Community</h2>
      <div class="table-head" aria-hidden="true">
        <span>Drop</span>
        <span>Each</span>
        <span>Fill</span>
        <span>Left</span>
      </div>
      <button v-for="d in community" :key="'c' + d.id" type="button" class="row">
        <span class="id">#{{ d.id }}</span>
        <span class="amt">{{ d.contributionUsdt }} <small>USDT</small></span>
        <span class="fill">{{ fill(d) }}</span>
        <span class="time">{{ d.remaining }}</span>
      </button>
    </section>

    <section>
      <h2>Your Drops</h2>
      <button v-for="d in yours" :key="'y' + d.id" type="button" class="row mine">
        <span class="id">#{{ d.id }} <em>seller</em></span>
        <span class="amt">{{ d.contributionUsdt }} <small>USDT</small></span>
        <span class="fill">{{ fill(d) }}</span>
        <span class="time">{{ d.remaining }}</span>
      </button>
    </section>

    <section>
      <h2>Recent</h2>
      <button v-for="d in recent" :key="'r' + d.id" type="button" class="row">
        <span class="id">#{{ d.id }}</span>
        <span class="amt">{{ d.contributionUsdt }} <small>USDT</small></span>
        <span class="fill">{{ fill(d) }}</span>
        <span class="time">{{ d.remaining }}</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.phone {
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
  background: #111;
  color: #f3eee6;
  font-family: Inter, system-ui, sans-serif;
  padding: 14px 14px 20px;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #2c2c2c;
}
.brand {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.wallet {
  font-size: 11px;
  color: #9a9184;
  font-variant-numeric: tabular-nums;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 10px 0 14px;
}
.hint {
  font-size: 11px;
  color: #7d7468;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.new {
  border: 1px solid #c45d2c;
  background: transparent;
  color: #e06a35;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
  min-height: 36px;
  border-radius: 6px;
  cursor: pointer;
}
section + section {
  margin-top: 16px;
}
h2 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: #8a8175;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.table-head,
.row {
  display: grid;
  grid-template-columns: 1.1fr 1.1fr 0.7fr 0.9fr;
  gap: 6px;
  align-items: baseline;
  width: 100%;
  text-align: left;
}
.table-head {
  font-size: 10px;
  color: #6f675c;
  padding: 0 0 4px;
  border-bottom: 1px solid #242424;
}
.row {
  margin: 0;
  padding: 10px 0;
  border: none;
  border-bottom: 1px solid #222;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  min-height: 44px;
}
.row:active {
  background: #171717;
}
.id {
  font-size: 12px;
  color: #cfc6b8;
  font-variant-numeric: tabular-nums;
}
.id em {
  font-style: normal;
  color: #7d7468;
  margin-left: 4px;
  font-size: 10px;
}
.amt {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.amt small {
  font-size: 10px;
  font-weight: 500;
  color: #9a9184;
}
.fill,
.time {
  font-size: 12px;
  color: #b7ae9f;
  font-variant-numeric: tabular-nums;
}
.time {
  text-align: right;
  color: #e06a35;
}
</style>
