<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { activeCrowdDropNetwork } from './escrowConfig'
import type { DropSummary } from './dropCatalog'
import { openDropById } from './lastOpenedDrop'
import ParticipantDots from './ParticipantDots.vue'
import {
  formatHomeAmount,
  formatRemainingShort,
  homeStatusLabel,
  spotsLeft,
} from './uiFormat'

const props = defineProps<{
  summary: DropSummary
}>()

const nowSec = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | null = null
const network = activeCrowdDropNetwork

const statusText = computed(() => homeStatusLabel(props.summary.status, props.summary.drop))
const left = computed(() => spotsLeft(props.summary.drop.buyerCount, props.summary.drop.goal))
const remaining = computed(() => {
  if (props.summary.status !== 'Active')
    return null
  return formatRemainingShort(props.summary.drop.deadline, nowSec.value)
})
const amount = computed(() =>
  formatHomeAmount(props.summary.drop.contribution, network.tokenDecimals),
)
const joinedLine = computed(() => {
  const joined = props.summary.drop.buyerCount.toString()
  const goal = props.summary.drop.goal.toString()
  if (props.summary.status !== 'Active')
    return `${joined} / ${goal} joined`
  return `${joined} / ${goal} joined · ${left.value} spot${left.value === 1 ? '' : 's'} left`
})
const statusTone = computed(() => {
  if (props.summary.status === 'Successful' || props.summary.status === 'Claimed')
    return 'success' as const
  if (props.summary.status === 'Expired')
    return 'expired' as const
  return 'orange' as const
})
const isQuiet = computed(() =>
  props.summary.status === 'Claimed' || props.summary.status === 'Expired',
)

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
  <button
    type="button"
    class="drop-row"
    :class="{ quiet: isQuiet }"
    @click="openDropById(summary.id)"
  >
    <div class="row-top">
      <p class="lead">
        {{ amount }} {{ network.tokenSymbol }} · #{{ summary.id }}
      </p>
      <p class="status" :class="statusTone">{{ statusText }}</p>
    </div>

    <ParticipantDots
      :joined="summary.drop.buyerCount"
      :goal="summary.drop.goal"
      :tone="isQuiet && statusTone === 'expired' ? 'expired' : (statusTone === 'success' ? 'success' : (isQuiet ? 'muted' : 'orange'))"
    />

    <div class="row-meta">
      <span>{{ joinedLine }}</span>
      <span v-if="remaining">{{ remaining }}</span>
    </div>
  </button>
</template>

<style scoped>
.drop-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 12px 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #141414;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
}
.drop-row:active {
  opacity: 0.85;
}
.drop-row.quiet {
  opacity: 0.72;
}
.row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.lead {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #141414;
}
.status {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: #B9430E;
  white-space: nowrap;
}
.status.success {
  color: #1F7A45;
}
.status.expired {
  color: #A65A16;
}
.row-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: #6A6A6A;
}
</style>
