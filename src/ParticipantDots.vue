<script setup lang="ts">
import { computed } from 'vue'
import { participantDotPlan } from './uiFormat'

const props = defineProps<{
  joined: number | bigint
  goal: number | bigint
  tone?: 'orange' | 'success' | 'expired' | 'muted'
}>()

const plan = computed(() =>
  participantDotPlan(BigInt(props.joined), BigInt(props.goal)),
)
</script>

<template>
  <div class="dots" :class="tone || 'orange'" aria-hidden="true">
    <span
      v-for="n in plan.filled"
      :key="'f' + n"
      class="dot filled"
    />
    <span
      v-for="n in plan.empty"
      :key="'e' + n"
      class="dot"
    />
    <span v-if="plan.countLabel" class="count">{{ plan.countLabel }}</span>
  </div>
</template>

<style scoped>
.dots {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  background: transparent;
  flex: 0 0 auto;
}
.dot.filled {
  background: currentColor;
}
.count {
  margin-left: 4px;
  font-size: 11px;
  color: #6A6A6A;
}
.orange { color: #C94E12; }
.success { color: #1F7A45; }
.expired { color: #B07A2E; }
.muted { color: #6A6A6A; }
</style>
