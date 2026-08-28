<script setup lang="ts">
import { ref } from 'vue'
import PhoneFrame from '../PhoneFrame.vue'
import { DROP_CLAIMED, SHOWCASE_WALLET } from '../fixtures'
import ClaimCompleteMotionContent from '../../motion/ClaimCompleteMotionContent.vue'
import MotionDemoShell from './MotionDemoShell.vue'

const GOAL = DROP_CLAIMED.goal
const wallet = SHOWCASE_WALLET
const motionRef = ref<InstanceType<typeof ClaimCompleteMotionContent> | null>(null)

function play() {
  motionRef.value?.play()
}
</script>

<template>
  <MotionDemoShell
    label="Claim Complete"
    hint="Pool resolves — compress 250ms · hold 100ms · expand 250ms · pulse · ~1.1s · play() after Claim receipt"
    @replay="play"
  >
    <PhoneFrame :network-line="`${wallet.network} · ${wallet.addressShort}`">
      <ClaimCompleteMotionContent ref="motionRef" :goal="GOAL">
        <p class="progress">{{ GOAL }} / {{ GOAL }} joined</p>
        <p class="pooled">{{ DROP_CLAIMED.pooledUsdt }} USDT pooled</p>
        <p class="seller">Seller {{ DROP_CLAIMED.sellerShort }}</p>
        <p class="note">The seller has claimed the pooled funds.</p>
        <button type="button" class="btn text">Back to Home</button>
      </ClaimCompleteMotionContent>
    </PhoneFrame>
  </MotionDemoShell>
</template>

<style scoped>
.progress,
.pooled,
.seller,
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
.seller {
  color: #6A6A6A;
}
.note {
  color: #6A6A6A;
  margin-bottom: 8px;
}
.btn.text {
  display: inline-block;
  border: none;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 0;
  min-height: 32px;
  cursor: default;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
