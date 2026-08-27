<script setup lang="ts">
import { computed } from 'vue'
import type { FakeDrop } from './fixtures'
import {
  SHOWCASE_COMMUNITY,
  SHOWCASE_RECENT,
  SHOWCASE_WALLET,
  SHOWCASE_YOURS,
} from './fixtures'
import type { ShowcaseTheme } from './themes'

const props = defineProps<{
  theme: ShowcaseTheme
}>()

const MAX_DOTS = 20

const community = SHOWCASE_COMMUNITY
const yours = SHOWCASE_YOURS
const recent = SHOWCASE_RECENT
const wallet = SHOWCASE_WALLET

const styleVars = computed(() => props.theme.vars)

function statusLabel(drop: FakeDrop): string {
  if (drop.status !== 'Active')
    return drop.status
  const pct = Math.floor((drop.joined / drop.goal) * 100)
  if (pct >= 70)
    return `${pct}%`
  return 'Active'
}

function dots(drop: FakeDrop): { filled: number, empty: number, countLabel: string | null } {
  const total = drop.goal
  const joined = Math.min(drop.joined, total)
  if (total <= 0)
    return { filled: 0, empty: 0, countLabel: null }
  if (total <= MAX_DOTS) {
    return { filled: joined, empty: total - joined, countLabel: null }
  }
  const filled = Math.round((joined / total) * MAX_DOTS)
  return {
    filled: Math.min(MAX_DOTS, Math.max(0, filled)),
    empty: Math.max(0, MAX_DOTS - filled),
    countLabel: `${joined}/${total}`,
  }
}

function metaLeft(drop: FakeDrop, section: 'community' | 'yours' | 'recent'): string {
  if (section === 'recent')
    return `${drop.joined} joined`
  return `${drop.joined} joined · ${drop.spotsLeft} spots`
}
</script>

<template>
  <!--
    Synthesized Home: Variant C utility structure + Variant B participant dots.
    Theme tokens change brand only; markup stays identical across treatments.
  -->
  <div class="home" :style="styleVars">
    <header class="head">
      <span class="brand">CrowdDrop</span>
      <span class="wallet">
        <span class="net">{{ wallet.network }}</span>
        · {{ wallet.addressShort }}
      </span>
    </header>

    <div class="intro">
      <p class="tagline">Pool together. Unlock the deal.</p>
      <button type="button" class="new">+ New Drop</button>
    </div>

    <section class="section">
      <h2>Community</h2>
      <div class="list">
        <button
          v-for="d in community"
          :key="'c' + d.id"
          type="button"
          class="row"
        >
          <div class="row-top">
            <span class="lead">${{ d.contributionUsdt }} USDT · #{{ d.id }}</span>
            <span class="status">{{ statusLabel(d) }}</span>
          </div>
          <div class="dots" aria-hidden="true">
            <span
              v-for="n in dots(d).filled"
              :key="'cf' + d.id + n"
              class="dot filled"
            />
            <span
              v-for="n in dots(d).empty"
              :key="'ce' + d.id + n"
              class="dot"
            />
            <span v-if="dots(d).countLabel" class="dot-count">{{ dots(d).countLabel }}</span>
          </div>
          <div class="row-meta">
            <span>{{ metaLeft(d, 'community') }}</span>
            <span>{{ d.remaining }}</span>
          </div>
        </button>
      </div>
    </section>

    <section class="section">
      <h2>Your Drops</h2>
      <div class="list">
        <button
          v-for="d in yours"
          :key="'y' + d.id"
          type="button"
          class="row"
        >
          <div class="row-top">
            <span class="lead">${{ d.contributionUsdt }} USDT · #{{ d.id }}</span>
            <span class="status">{{ statusLabel(d) }}</span>
          </div>
          <div class="dots" aria-hidden="true">
            <span
              v-for="n in dots(d).filled"
              :key="'yf' + d.id + n"
              class="dot filled"
            />
            <span
              v-for="n in dots(d).empty"
              :key="'ye' + d.id + n"
              class="dot"
            />
            <span v-if="dots(d).countLabel" class="dot-count">{{ dots(d).countLabel }}</span>
          </div>
          <div class="row-meta">
            <span>{{ metaLeft(d, 'yours') }}</span>
            <span>{{ d.remaining }}</span>
          </div>
        </button>
      </div>
    </section>

    <section class="section">
      <h2>Recent</h2>
      <div class="list">
        <button
          v-for="d in recent"
          :key="'r' + d.id"
          type="button"
          class="row"
        >
          <div class="row-top">
            <span class="lead">${{ d.contributionUsdt }} USDT · #{{ d.id }}</span>
            <span class="status">{{ statusLabel(d) }}</span>
          </div>
          <div class="dots" aria-hidden="true">
            <span
              v-for="n in dots(d).filled"
              :key="'rf' + d.id + n"
              class="dot filled"
            />
            <span
              v-for="n in dots(d).empty"
              :key="'re' + d.id + n"
              class="dot"
            />
            <span v-if="dots(d).countLabel" class="dot-count">{{ dots(d).countLabel }}</span>
          </div>
          <div class="row-meta">
            <span>{{ metaLeft(d, 'recent') }}</span>
            <span>{{ d.remaining }}</span>
          </div>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
  padding: 14px 14px 18px;
  background: var(--sx-bg);
  color: var(--sx-text);
  font-family: Inter, system-ui, sans-serif;
  border: 1px solid var(--sx-divider);
  border-radius: 10px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.brand {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.wallet {
  font-size: 11px;
  color: var(--sx-muted);
  font-variant-numeric: tabular-nums;
}
.net {
  color: var(--sx-support);
  font-weight: 500;
}
.intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
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
  flex: 0 0 auto;
  border: 1px solid var(--sx-accent);
  background: transparent;
  color: var(--sx-accent);
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
  color: var(--sx-muted);
}
.list {
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  flex-direction: column;
  gap: 7px;
  width: 100%;
  margin: 0;
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid var(--sx-divider);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-height: 44px;
  border-radius: 0;
  box-shadow: none;
}
.row:last-child {
  border-bottom: none;
}
.row:active {
  opacity: 0.82;
}
.row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.lead {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.status {
  font-size: 12px;
  font-weight: 500;
  color: var(--sx-status);
  white-space: nowrap;
}
.dots {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--sx-dot-empty);
  background: transparent;
  flex: 0 0 auto;
}
.dot.filled {
  background: var(--sx-dot-fill);
  border-color: var(--sx-dot-fill);
}
.dot-count {
  margin-left: 2px;
  font-size: 10px;
  color: var(--sx-muted);
}
.row-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--sx-muted);
  font-variant-numeric: tabular-nums;
}
</style>
