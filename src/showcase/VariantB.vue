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

function slots(drop: FakeDrop) {
  return Array.from({ length: drop.goal }, (_, i) => i < drop.joined)
}
</script>

<template>
  <!--
    VARIANT B — Participant-slot / berth map
    Grammar: each Drop is a set of seats. Visual capacity is the primary signal.
  -->
  <div class="phone b">
    <header class="head">
      <div>
        <p class="brand">CrowdDrop</p>
        <p class="wallet">{{ wallet.network }} · {{ wallet.addressShort }}</p>
      </div>
      <button type="button" class="new">+ Drop</button>
    </header>

    <section>
      <div class="sec-head">
        <h2>Community</h2>
        <span>{{ community.length }} open</span>
      </div>

      <button v-for="d in community" :key="'c' + d.id" type="button" class="berth">
        <div class="berth-top">
          <span class="money">${{ d.contributionUsdt }} <small>/ person</small></span>
          <span class="meta">#{{ d.id }} · {{ d.remaining }}</span>
        </div>
        <div class="seats" aria-label="`${d.joined} of ${d.goal} seats filled`">
          <span
            v-for="(filled, i) in slots(d)"
            :key="i"
            class="seat"
            :class="{ filled }"
          />
        </div>
        <div class="berth-foot">
          <span>{{ d.joined }} seated · {{ d.spotsLeft }} open</span>
          <span class="st">{{ d.status }}</span>
        </div>
      </button>
    </section>

    <section>
      <h2>Your Drops</h2>
      <button v-for="d in yours" :key="'y' + d.id" type="button" class="berth soft">
        <div class="berth-top">
          <span class="money">${{ d.contributionUsdt }} <small>/ person</small></span>
          <span class="meta">#{{ d.id }} · you sell</span>
        </div>
        <div class="seats">
          <span
            v-for="(filled, i) in slots(d)"
            :key="i"
            class="seat"
            :class="{ filled }"
          />
        </div>
        <div class="berth-foot">
          <span>{{ d.joined }} of {{ d.goal }} seated</span>
          <span class="st">{{ d.status }}</span>
        </div>
      </button>
    </section>

    <section>
      <h2>Recent</h2>
      <button v-for="d in recent" :key="'r' + d.id" type="button" class="berth soft">
        <div class="berth-top">
          <span class="money">${{ d.contributionUsdt }} <small>/ person</small></span>
          <span class="meta">#{{ d.id }}</span>
        </div>
        <div class="seats">
          <span
            v-for="(filled, i) in slots(d)"
            :key="i"
            class="seat"
            :class="{ filled }"
          />
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
  background: #161412;
  color: #f4efe7;
  font-family: Inter, system-ui, sans-serif;
  padding: 14px 14px 18px;
  border: 1px solid #2b2723;
  border-radius: 10px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}
.brand {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.wallet {
  margin: 2px 0 0;
  font-size: 11px;
  color: #9b9082;
}
.new {
  border: none;
  background: #d2652f;
  color: #fff8f2;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 12px;
  min-height: 40px;
  border-radius: 8px;
  cursor: pointer;
}
section + section {
  margin-top: 18px;
}
.sec-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.sec-head span,
h2 {
  margin: 0;
  font-size: 12px;
  color: #9b9082;
  font-weight: 600;
}
.berth {
  display: block;
  width: 100%;
  text-align: left;
  margin: 0 0 10px;
  padding: 12px 0;
  border: none;
  border-top: 1px solid #2a2622;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.berth:last-child {
  margin-bottom: 0;
}
.berth-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.money {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.money small {
  font-size: 11px;
  font-weight: 500;
  color: #9b9082;
}
.meta {
  font-size: 11px;
  color: #9b9082;
  text-align: right;
}
.seats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.seat {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1.5px solid #d2652f;
  background: transparent;
}
.seat.filled {
  background: #d2652f;
}
.berth-foot {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #a89c8d;
}
.st {
  color: #d2652f;
  font-weight: 600;
}
.soft {
  opacity: 0.92;
}
</style>
