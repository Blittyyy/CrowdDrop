<script setup lang="ts">
import { ref } from 'vue'
import PhoneFrame from '../PhoneFrame.vue'
import { DROP_SUCCESS, SHOWCASE_WALLET } from '../fixtures'
import DropSuccessMotionContent from '../../motion/DropSuccessMotionContent.vue'
import MotionDemoShell from './MotionDemoShell.vue'
import { successTiming } from '../../motion/motionTokens'

defineProps<{
  variant: 'buyer' | 'seller'
}>()

const GOAL = DROP_SUCCESS.goal
const wallet = SHOWCASE_WALLET
const motionRef = ref<InstanceType<typeof DropSuccessMotionContent> | null>(null)
const visibleDots = GOAL
const timing = successTiming(visibleDots)

function play() {
  motionRef.value?.play()
}
</script>

<template>
  <MotionDemoShell
    :label="variant === 'seller' ? 'Drop Successful — Seller' : 'Drop Successful — Buyer'"
    :hint="`Final slot fills → ${visibleDots}-dot sweep (40ms stagger) → green → pulse — ~${timing.totalMs}ms · play() on Successful transition`"
    @replay="play"
  >
    <PhoneFrame :network-line="`${wallet.network} · ${wallet.addressShort}`">
      <DropSuccessMotionContent ref="motionRef" :goal="GOAL">
        <p class="progress">{{ GOAL }} / {{ GOAL }} joined</p>
        <p class="pooled">{{ DROP_SUCCESS.pooledUsdt }} USDT pooled</p>

        <template v-if="variant === 'seller'">
          <p class="note">The goal was reached. You can claim the pooled funds.</p>
          <button type="button" class="btn primary success">
            Claim {{ DROP_SUCCESS.pooledUsdt }} USDT
          </button>
        </template>
        <template v-else>
          <p class="note">
            You joined this Drop. The seller can now claim the pooled funds.
          </p>
        </template>
      </DropSuccessMotionContent>
    </PhoneFrame>
  </MotionDemoShell>
</template>

<style scoped>
.progress,
.pooled,
.note {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.4;
}
.progress,
.pooled {
  color: #141414;
  font-weight: 500;
}
.note {
  color: #6A6A6A;
  margin-bottom: 12px;
}
.btn {
  width: 100%;
  min-height: 44px;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: default;
  padding: 10px 12px;
}
.btn.success {
  border: 1px solid #1F7A45;
  background: #1F7A45;
  color: #fff;
}
</style>
