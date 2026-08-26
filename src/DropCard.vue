<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { activeCrowdDropNetwork } from './escrowConfig'
import type { DropSummary } from './dropCatalog'
import { openDropById } from './lastOpenedDrop'
import {
  formatMoneyLabel,
  formatRemainingShort,
  objectiveStatusLabel,
  progressRatio,
  spotsLeft,
} from './uiFormat'

const props = defineProps<{
  summary: DropSummary
}>()

const nowSec = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | null = null
const network = activeCrowdDropNetwork

const statusText = computed(() => objectiveStatusLabel(props.summary.status, props.summary.drop))
const progress = computed(() => progressRatio(props.summary.drop.buyerCount, props.summary.drop.goal))
const left = computed(() => spotsLeft(props.summary.drop.buyerCount, props.summary.drop.goal))
const remaining = computed(() => {
  if (props.summary.status !== 'Active')
    return null
  return formatRemainingShort(props.summary.drop.deadline, nowSec.value)
})
const amount = computed(() =>
  formatMoneyLabel(props.summary.drop.contribution, network.tokenDecimals),
)
const meta = computed(() => {
  const joined = `${props.summary.drop.buyerCount.toString()} / ${props.summary.drop.goal.toString()} joined`
  const spots = props.summary.status === 'Active'
    ? `${left.value} spot${left.value === 1 ? '' : 's'} left`
    : null
  const time = remaining.value
  return [joined, spots, time].filter(Boolean).join(' · ')
})
const statusTone = computed(() => {
  if (props.summary.status === 'Successful' || props.summary.status === 'Claimed')
    return 'success'
  if (props.summary.status === 'Expired')
    return 'expired'
  return 'active'
})

onMounted(() => {
  timer = setInterval(() => {
    nowSec.value = Math.floor(Date.now() / 1000)
  }, 1000)
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
})
</script>

<template>
  <button type="button" class="drop-card" @click="openDropById(summary.id)">
    <div class="top">
      <p class="amount">
        <span class="dollars">{{ amount }}</span>
        <span class="unit">{{ network.tokenSymbol.toLowerCase() }}</span>
      </p>
      <p class="status" :class="statusTone">{{ statusText }}</p>
    </div>
    <div class="bar" aria-hidden="true">
      <span class="fill" :style="{ width: `${progress}%` }" />
    </div>
    <p class="meta">{{ meta }}</p>
  </button>
</template>

<style scoped>
.drop-card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  width: 100%;
  text-align: left;
  background: var(--cd-surface);
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  padding: 0.95rem 1rem;
  color: inherit;
  cursor: pointer;
}
.drop-card:hover {
  border-color: #3a3a3a;
}
.top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.amount {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}
.dollars {
  font-family: var(--cd-font-serif);
  font-size: 1.55rem;
  font-weight: 600;
  color: var(--cd-cream);
  letter-spacing: -0.02em;
}
.unit {
  font-size: 0.78rem;
  color: var(--cd-tan);
  text-transform: lowercase;
}
.status {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cd-orange);
  white-space: nowrap;
}
.status.success {
  color: var(--cd-success-text);
}
.status.expired {
  color: var(--cd-expired);
}
.bar {
  height: 5px;
  border-radius: 999px;
  background: #2a2a2a;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: var(--cd-orange);
  border-radius: inherit;
}
.meta {
  margin: 0;
  font-size: 0.78rem;
  color: var(--cd-tan);
}
</style>
