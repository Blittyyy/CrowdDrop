<script setup lang="ts">
import ParticipantDots from '../ParticipantDots.vue'
import PhoneFrame from '../PhoneFrame.vue'
import {
  DROP_ACTIVE,
  DROP_COMMUNITY_2,
  DROP_YOURS,
  SHOWCASE_WALLET,
} from '../fixtures'

const community = [DROP_ACTIVE, DROP_COMMUNITY_2]
const yours = [DROP_YOURS]
const recent = [DROP_ACTIVE]
const wallet = SHOWCASE_WALLET

</script>

<template>
  <PhoneFrame :network-line="`${wallet.network} · ${wallet.addressShort}`">
    <div class="intro">
      <p class="tagline">Pool together. Unlock the deal.</p>
      <button type="button" class="new">+ New Drop</button>
    </div>

    <section class="section">
      <h2>Community</h2>
      <button v-for="d in community" :key="'c' + d.id" type="button" class="row">
        <div class="row-top">
          <span class="lead">${{ d.contributionUsdt }} USDT · #{{ d.id }}</span>
          <span class="status">{{ d.status }}</span>
        </div>
        <ParticipantDots :joined="d.joined" :goal="d.goal" />
        <div class="row-meta">
          <span>{{ d.joined }} joined · {{ d.spotsLeft }} spots</span>
          <span>{{ d.remaining }}</span>
        </div>
      </button>
    </section>

    <section class="section">
      <h2>Your Drops</h2>
      <button v-for="d in yours" :key="'y' + d.id" type="button" class="row">
        <div class="row-top">
          <span class="lead">${{ d.contributionUsdt }} USDT · #{{ d.id }}</span>
          <span class="status">{{ d.status }}</span>
        </div>
        <ParticipantDots :joined="d.joined" :goal="d.goal" />
        <div class="row-meta">
          <span>{{ d.joined }} joined · {{ d.spotsLeft }} spots</span>
          <span>{{ d.remaining }}</span>
        </div>
      </button>
    </section>

    <section class="section">
      <h2>Recent</h2>
      <button v-for="d in recent" :key="'r' + d.id" type="button" class="row">
        <div class="row-top">
          <span class="lead">${{ d.contributionUsdt }} USDT · #{{ d.id }}</span>
          <span class="status">{{ d.status }}</span>
        </div>
        <ParticipantDots :joined="d.joined" :goal="d.goal" />
        <div class="row-meta">
          <span>{{ d.joined }} joined</span>
          <span>{{ d.remaining }}</span>
        </div>
      </button>
    </section>
  </PhoneFrame>
</template>

<style scoped>
.intro {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 16px;
}
.tagline {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  max-width: 13.5rem;
}
.new {
  border: 1px solid #C94E12;
  background: transparent;
  color: #C94E12;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
  min-height: 36px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.section + .section {
  margin-top: 18px;
}
h2 {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #6A6A6A;
}
.row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid #E2E2DE;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-height: 44px;
}
.row:last-child {
  border-bottom: none;
}
.row-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.lead {
  font-size: 14px;
  font-weight: 600;
}
.status {
  font-size: 12px;
  font-weight: 500;
  color: #C94E12;
}
.row-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6A6A6A;
}
</style>
