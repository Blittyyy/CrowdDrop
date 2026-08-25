<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { activeCrowdDropNetwork } from './escrowConfig'
import type { DropSummary } from './dropCatalog'
import { formatTokenAmount } from './tokenMath'
import { shortenAddress } from './wallet'
import { openDropById } from './lastOpenedDrop'

const props = defineProps<{
  summary: DropSummary
}>()

const nowSec = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | null = null
const network = activeCrowdDropNetwork

const remaining = computed(() => {
  if (props.summary.status !== 'Active')
    return null
  const left = Number(props.summary.drop.deadline) - nowSec.value
  if (left <= 0)
    return 'ending now'
  const hours = Math.floor(left / 3600)
  const minutes = Math.floor((left % 3600) / 60)
  if (hours >= 48)
    return `${Math.floor(hours / 24)}d ${hours % 24}h remaining`
  if (hours >= 1)
    return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
})

const youLabel = computed(() => {
  if (props.summary.relation === 'seller')
    return 'You: Seller'
  if (props.summary.relation === 'joined')
    return 'You: Joined'
  return `Seller: ${shortenAddress(props.summary.drop.seller)}`
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
  <article class="drop-card">
    <p class="title">Drop #{{ summary.id }}</p>
    <p>
      {{ summary.status }} · {{ summary.drop.buyerCount.toString() }} / {{ summary.drop.goal.toString() }} joined
    </p>
    <p>{{ formatTokenAmount(summary.drop.contribution, network.tokenDecimals) }} {{ network.tokenSymbol }} per person</p>
    <p>{{ youLabel }}</p>
    <p v-if="remaining">{{ remaining }}</p>
    <button type="button" @click="openDropById(summary.id)">Open Drop</button>
  </article>
</template>

<style scoped>
.drop-card {
  border: 1px solid #ddd;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.title {
  font-weight: 700;
  margin: 0;
}
p {
  margin: 0;
  overflow-wrap: anywhere;
}
button {
  min-height: 44px;
  font-size: 1rem;
  margin-top: 0.35rem;
}
</style>
