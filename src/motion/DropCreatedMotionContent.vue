<script setup lang="ts">
import { computed, watch } from 'vue'
import { participantDotPlan } from '../uiFormat'
import { CREATED_TIMING } from './motionTokens'
import { useMotionPlay } from './useMotionPlay'

const props = defineProps<{
  dropId: string
  goal: number | bigint
  productTitle?: string
  coverUrl?: string
  fileTypeLabel?: string
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

    <div v-if="coverUrl || productTitle" class="product-identity">
      <img
        v-if="coverUrl"
        class="product-cover"
        :src="coverUrl"
        alt=""
      >
      <p v-if="productTitle" class="product-title">{{ productTitle }}</p>
      <p v-if="fileTypeLabel" class="product-file">{{ fileTypeLabel }}</p>
    </div>

    <h1 class="motion-title created-heading">Drop #{{ dropId }} created</h1>

    <div class="motion-rest">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@import './motionDots.css';

.product-identity {
  margin: 12px 0 0;
}
.product-cover {
  display: block;
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #E2E2DE;
  margin: 0 0 10px;
}
.product-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: #141414;
  overflow-wrap: anywhere;
}
.product-file {
  margin: 0 0 4px;
  font-size: 12px;
  color: #6A6A6A;
}
.created-heading {
  margin: 16px 0 8px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #141414;
}
</style>
