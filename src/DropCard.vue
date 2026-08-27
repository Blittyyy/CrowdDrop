<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { activeCrowdDropNetwork } from './escrowConfig'
import type { DropSummary } from './dropCatalog'
import { openDropById } from './lastOpenedDrop'
import {
  formatHomeAmount,
  formatRemainingShort,
  homeStatusLabel,
  participantDotPlan,
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
const dots = computed(() =>
  participantDotPlan(props.summary.drop.buyerCount, props.summary.drop.goal),
)
const joinedLine = computed(() => {
  const joined = `${props.summary.drop.buyerCount.toString()} joined`
  if (props.summary.status !== 'Active')
    return joined
  return `${joined} · ${left.value} spot${left.value === 1 ? '' : 's'} left`
})
const statusTone = computed(() => {
  if (props.summary.status === 'Successful' || props.summary.status === 'Claimed')
    return 'success'
  if (props.summary.status === 'Expired')
    return 'expired'
  return 'active'
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
    :class="{ quiet: isQuiet, success: statusTone === 'success' }"
    @click="openDropById(summary.id)"
  >
    <div class="row-top">
      <p class="amount">
        <span class="value">{{ amount }}</span>
        <span class="unit">{{ network.tokenSymbol }}</span>
      </p>
      <p class="status" :class="statusTone">{{ statusText }}</p>
    </div>

    <div class="dots" aria-hidden="true">
      <span
        v-for="n in dots.filled"
        :key="'f' + n"
        class="dot filled"
      />
      <span
        v-for="n in dots.empty"
        :key="'e' + n"
        class="dot"
      />
      <span v-if="dots.countLabel" class="dot-count">{{ dots.countLabel }}</span>
    </div>

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
  gap: 0.35rem;
  width: 100%;
  margin: 0;
  padding: 0.7rem 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.drop-row:active {
  opacity: 0.85;
}
.drop-row.quiet {
  opacity: 0.62;
}
.row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.amount {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.28rem;
}
.value {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--cd-cream);
  letter-spacing: -0.01em;
}
.unit {
  font-size: 0.72rem;
  color: var(--cd-tan);
  font-weight: 500;
}
.status {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--cd-orange);
  white-space: nowrap;
}
.status.success {
  color: var(--cd-success-text);
}
.status.expired {
  color: var(--cd-expired);
}
.dots {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.28rem;
  min-height: 0.55rem;
}
.dot {
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 50%;
  border: 1px solid var(--cd-orange);
  background: transparent;
  flex: 0 0 auto;
}
.dot.filled {
  background: var(--cd-orange);
}
.quiet .dot {
  border-color: var(--cd-muted);
}
.quiet .dot.filled {
  background: var(--cd-muted);
  border-color: var(--cd-muted);
}
.drop-row.success .dot {
  border-color: var(--cd-success-text);
}
.drop-row.success .dot.filled {
  background: var(--cd-success-text);
}
.dot-count {
  margin-left: 0.2rem;
  font-size: 0.68rem;
  color: var(--cd-muted);
}
.row-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.72rem;
  color: var(--cd-tan);
}
</style>
