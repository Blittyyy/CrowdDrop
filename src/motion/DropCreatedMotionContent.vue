<script setup lang="ts">
import { computed, watch } from 'vue'
import { participantDotPlan } from '../uiFormat'
import { CREATED_TIMING } from './motionTokens'
import { useMotionPlay } from './useMotionPlay'

const props = defineProps<{
  dropId: string
  goal: number | bigint
}>()

const emit = defineEmits<{
  motionComplete: []
}>()

const plan = computed(() => participantDotPlan(0n, BigInt(props.goal)))
const visibleDots = computed(() => plan.value.filled + plan.value.empty)
const totalMs = CREATED_TIMING.totalMs(visibleDots.value)

const { phaseClass, play, phase } = useMotionPlay(totalMs)

const timingStyle = computed(() => ({
  '--created-dot-ms': `${CREATED_TIMING.dotMs}ms`,
  '--created-stagger-ms': `${CREATED_TIMING.staggerMs}ms`,
  '--created-title-delay-ms': `${CREATED_TIMING.titleDelayMs}ms`,
  '--created-rest-delay-ms': `${CREATED_TIMING.restDelayMs}ms`,
  '--created-fade-ms': `${CREATED_TIMING.fadeMs}ms`,
}))

watch(phase, (value) => {
  if (value === 'complete')
    emit('motionComplete')
})

defineExpose({ play })
</script>

<template>
  <div
    class="motion-created"
    :class="phaseClass"
    :style="timingStyle"
  >
    <div class="motion-dots-wrap">
      <div class="motion-dots" aria-hidden="true">
        <span
          v-for="n in plan.empty"
          :key="n"
          class="motion-dot"
          :style="{ '--i': n - 1 }"
        />
        <span v-if="plan.countLabel" class="motion-dot-count">{{ plan.countLabel }}</span>
      </div>
    </div>

    <h1 class="motion-title created-heading">Drop #{{ dropId }} created</h1>

    <div class="motion-rest">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@import './motionDots.css';

.created-heading {
  margin: 16px 0 8px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #141414;
}
</style>
