<script setup lang="ts">
import { computed, watch } from 'vue'
import { participantDotPlan } from '../uiFormat'
import { claimDotTowardCenterPx, isSmallGoalClaimMotion } from './claimTransition'
import { CLAIM_TIMING } from './motionTokens'
import { useMotionPlay } from './useMotionPlay'

const props = withDefaults(defineProps<{
  goal: number | bigint
  dotsOnly?: boolean
  claimedAmount?: string
  tokenLabel?: string
}>(), {
  dotsOnly: false,
  claimedAmount: '',
  tokenLabel: 'USDT',
})

const emit = defineEmits<{
  motionComplete: []
}>()

const plan = computed(() => participantDotPlan(BigInt(props.goal), BigInt(props.goal)))
const visibleDots = computed(() => plan.value.filled)
const smallGoal = computed(() => isSmallGoalClaimMotion(visibleDots.value))

const { phaseClass, play, phase } = useMotionPlay(CLAIM_TIMING.totalMs)

const timingStyle = computed(() => ({
  '--claim-compress-ms': `${CLAIM_TIMING.compressMs}ms`,
  '--claim-hold-ms': `${CLAIM_TIMING.holdMs}ms`,
  '--claim-expand-ms': `${CLAIM_TIMING.expandMs}ms`,
  '--claim-pulse-ms': `${CLAIM_TIMING.pulseMs}ms`,
  '--claim-title-delay-ms': `${CLAIM_TIMING.titleDelayMs}ms`,
  '--claim-rest-delay-ms': `${CLAIM_TIMING.restDelayMs}ms`,
  '--claim-fade-ms': `${CLAIM_TIMING.fadeMs}ms`,
}))

const walletLine = computed(() => {
  if (!props.claimedAmount)
    return ''
  return `${props.claimedAmount} ${props.tokenLabel} sent to your wallet.`
})

function towardCenter(index: number, total: number) {
  return claimDotTowardCenterPx(index, total, smallGoal.value)
}

watch(phase, (value) => {
  if (value === 'complete')
    emit('motionComplete')
})

defineExpose({ play })
</script>

<template>
  <div
    class="motion-claim"
    :class="[phaseClass, { 'dots-only': dotsOnly, 'is-small-goal': smallGoal }]"
    :style="timingStyle"
  >
    <div class="motion-dots-wrap">
      <div class="motion-dots" aria-hidden="true">
        <span
          v-for="n in plan.filled"
          :key="n"
          class="motion-dot filled"
          :style="{
            '--i': n - 1,
            '--toward-center': towardCenter(n - 1, visibleDots),
          }"
        />
        <span v-if="plan.countLabel" class="motion-dot-count">{{ plan.countLabel }}</span>
      </div>
    </div>

    <p class="motion-title status">Claim complete</p>
    <p v-if="walletLine" class="motion-subtitle">{{ walletLine }}</p>

    <div class="motion-rest">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@import './motionDots.css';

.motion-claim.dots-only .motion-title,
.motion-claim.dots-only .motion-subtitle,
.motion-claim.dots-only .motion-rest {
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
  margin: 14px 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: #1F7A45;
  letter-spacing: -0.01em;
}

.motion-subtitle {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 500;
  color: #141414;
  line-height: 1.4;
}
</style>
