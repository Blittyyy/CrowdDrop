<script setup lang="ts">
import { computed, watch } from 'vue'
import { participantDotPlan } from '../uiFormat'
import { successTiming } from './motionTokens'
import { useMotionPlay } from './useMotionPlay'

const props = withDefaults(defineProps<{
  goal: number | bigint
  /** When true, only animate the participant-dot row (production Drop Detail). */
  dotsOnly?: boolean
}>(), {
  dotsOnly: false,
})

const emit = defineEmits<{
  motionComplete: []
}>()

const planBefore = computed(() =>
  participantDotPlan(BigInt(props.goal) - 1n, BigInt(props.goal)),
)
const visibleDots = computed(() => planBefore.value.filled + 1)
const timing = computed(() => successTiming(visibleDots.value))

const { phase, phaseClass, play } = useMotionPlay(timing.value.totalMs)

const timingStyle = computed(() => ({
  '--success-fill-ms': `${timing.value.finalFillMs}ms`,
  '--success-sweep-start-ms': `${timing.value.sweepStartMs}ms`,
  '--success-stagger-ms': `${timing.value.staggerMs}ms`,
  '--success-confirm-ms': `${timing.value.confirmMs}ms`,
  '--success-green-start-ms': `${timing.value.greenStartMs}ms`,
  '--success-green-ms': `${timing.value.greenMs}ms`,
  '--success-pulse-start-ms': `${timing.value.pulseStartMs}ms`,
  '--success-pulse-ms': `${timing.value.pulseMs}ms`,
  '--success-title-start-ms': `${timing.value.titleStartMs}ms`,
  '--success-rest-start-ms': `${timing.value.restStartMs}ms`,
  '--success-fade-ms': `${timing.value.fadeMs}ms`,
}))

watch(phase, (value) => {
  if (value === 'complete')
    emit('motionComplete')
})

defineExpose({ play })
</script>

<template>
  <div
    class="motion-success"
    :class="[phaseClass, { 'dots-only': dotsOnly }]"
    :style="timingStyle"
  >
    <div class="motion-dots-wrap">
      <div
        class="motion-dots"
        :class="{ 'is-success-tone': phase === 'complete' }"
        aria-hidden="true"
      >
        <span
          v-for="n in planBefore.filled"
          :key="'f' + n"
          class="motion-dot filled"
          :style="{ '--i': n - 1 }"
        />
        <span
          class="motion-dot final-slot"
          :style="{ '--i': planBefore.filled }"
        />
        <span v-if="planBefore.countLabel" class="motion-dot-count">
          {{ planBefore.countLabel }}
        </span>
      </div>
    </div>

    <p class="motion-title status">Successful</p>

    <div class="motion-rest">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@import './motionDots.css';

.motion-success.dots-only .motion-title,
.motion-success.dots-only .motion-rest {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  pointer-events: none;
}

.status {
  margin: 14px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1F7A45;
}
</style>
