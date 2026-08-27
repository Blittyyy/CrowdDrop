<script setup lang="ts">
import PhoneFrame from '../PhoneFrame.vue'
import { DROP_ACTIVE, DROP_COMMUNITY_2 } from '../fixtures'
import ParticipantDots from '../ParticipantDots.vue'

defineProps<{
  mode: 'disconnected' | 'wrong-network'
}>()

const community = [DROP_ACTIVE, DROP_COMMUNITY_2]
</script>

<template>
  <PhoneFrame
    :network-line="mode === 'disconnected' ? 'Polygon · Not connected' : 'Wrong network'"
  >
    <div class="sys">
      <button
        v-if="mode === 'disconnected'"
        type="button"
        class="sys-btn"
      >
        Connect
      </button>
      <button
        v-else
        type="button"
        class="sys-btn warn"
      >
        Switch to Polygon
      </button>
    </div>

    <div class="intro">
      <p class="tagline">Pool together. Unlock the deal.</p>
      <button type="button" class="new subdued">+ New Drop</button>
    </div>

    <section>
      <h2>Community</h2>
      <div v-for="d in community" :key="d.id" class="row">
        <div class="row-top">
          <span class="lead">${{ d.contributionUsdt }} USDT · #{{ d.id }}</span>
          <span class="status">{{ d.status }}</span>
        </div>
        <ParticipantDots :joined="d.joined" :goal="d.goal" />
        <div class="row-meta">
          <span>{{ d.joined }} joined · {{ d.spotsLeft }} spots</span>
          <span>{{ d.remaining }}</span>
        </div>
      </div>
    </section>
  </PhoneFrame>
</template>

<style scoped>
.sys {
  margin: -2px 0 12px;
}
.sys-btn {
  width: 100%;
  border: 1px solid #C94E12;
  background: #C94E12;
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 12px;
  min-height: 40px;
  border-radius: 8px;
  cursor: pointer;
}
.sys-btn.warn {
  border-color: #C94E12;
  background: #C94E12;
  color: #fff;
}
.intro {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}
.tagline {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  max-width: 13.5rem;
  line-height: 1.35;
}
.new {
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 8px 10px;
  min-height: 36px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.new.subdued {
  opacity: 0.72;
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
  padding: 12px 0;
  border-bottom: 1px solid #E2E2DE;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row:last-child {
  border-bottom: none;
}
.row-top {
  display: flex;
  justify-content: space-between;
}
.lead { font-size: 14px; font-weight: 600; }
.status { font-size: 12px; color: #C94E12; font-weight: 500; }
.row-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6A6A6A;
}
</style>
