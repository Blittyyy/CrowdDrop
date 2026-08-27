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
    VARIANT D — Deadline-first urgency index
    Grammar: time remaining is the primary column. Money is secondary. Built for “what closes soon?”
  -->
  <div class="phone d">
    <header class="head">
      <span class="brand">CrowdDrop</span>
      <span class="wallet">{{ wallet.network }} · {{ wallet.addressShort }}</span>
    </header>

    <div class="create-wrap">
      <button type="button" class="create">Create Drop</button>
    </div>

    <section>
      <h2>Community · closing soon</h2>
      <button v-for="d in community" :key="'c' + d.id" type="button" class="tick">
        <div class="clock">
          <span class="remain">{{ d.remaining }}</span>
          <span class="sub">left</span>
        </div>
        <div class="body">
          <p class="title">
            <span class="amt">${{ d.contributionUsdt }} USDT</span>
            <span class="id">Drop #{{ d.id }}</span>
          </p>
          <p class="detail">
            {{ d.joined }} of {{ d.goal }} joined
            · {{ d.spotsLeft }} spots left
          </p>
          <div class="hash" aria-hidden="true">
            <span
              v-for="i in d.goal"
              :key="i"
              class="mark"
              :class="{ on: i <= d.joined }"
            >|</span>
          </div>
        </div>
      </button>
    </section>

    <section>
      <h2>Your Drops</h2>
      <button v-for="d in yours" :key="'y' + d.id" type="button" class="tick soft">
        <div class="clock">
          <span class="remain">{{ d.remaining }}</span>
          <span class="sub">left</span>
        </div>
        <div class="body">
          <p class="title">
            <span class="amt">${{ d.contributionUsdt }} USDT</span>
            <span class="id">#{{ d.id }} · seller</span>
          </p>
          <p class="detail">{{ d.joined }} of {{ d.goal }} joined</p>
          <div class="hash" aria-hidden="true">
            <span
              v-for="i in d.goal"
              :key="i"
              class="mark"
              :class="{ on: i <= d.joined }"
            >|</span>
          </div>
        </div>
      </button>
    </section>

    <section>
      <h2>Recent</h2>
      <button v-for="d in recent" :key="'r' + d.id" type="button" class="tick soft">
        <div class="clock">
          <span class="remain">{{ d.remaining }}</span>
          <span class="sub">left</span>
        </div>
        <div class="body">
          <p class="title">
            <span class="amt">${{ d.contributionUsdt }} USDT</span>
            <span class="id">#{{ d.id }}</span>
          </p>
          <p class="detail">{{ d.joined }} of {{ d.goal }} joined</p>
        </div>
      </button>
    </section>
  </div>
</template>

<style scoped>
.phone {
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
  background: #121110;
  color: #f1ebe3;
  font-family: Inter, system-ui, sans-serif;
  padding: 14px 12px 18px;
  border: 1px solid #2a2724;
  border-radius: 10px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}
.brand {
  font-size: 15px;
  font-weight: 600;
}
.wallet {
  font-size: 11px;
  color: #958b7e;
}
.create-wrap {
  margin-bottom: 14px;
}
.create {
  width: auto;
  border: 1px solid #3a342e;
  background: #1a1816;
  color: #f1ebe3;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 12px;
  min-height: 40px;
  border-radius: 8px;
  cursor: pointer;
}
.create:active {
  border-color: #d2652f;
  color: #d2652f;
}
section + section {
  margin-top: 18px;
}
h2 {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: #8a8074;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tick {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 10px 0;
  border: none;
  border-top: 1px solid #24211e;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-height: 56px;
}
.clock {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-right: 8px;
  border-right: 2px solid #d2652f;
}
.remain {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: #f1ebe3;
}
.sub {
  font-size: 10px;
  color: #958b7e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.body {
  min-width: 0;
}
.title {
  margin: 0 0 2px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.amt {
  font-size: 14px;
  font-weight: 650;
}
.id {
  font-size: 11px;
  color: #958b7e;
}
.detail {
  margin: 0;
  font-size: 12px;
  color: #a79c8e;
}
.hash {
  margin-top: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  letter-spacing: 1px;
  line-height: 1;
}
.mark {
  color: #3a342e;
}
.mark.on {
  color: #d2652f;
}
.soft {
  opacity: 0.9;
}
.soft .clock {
  border-right-color: #5a5248;
}
</style>
