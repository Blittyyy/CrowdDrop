<script setup lang="ts">
import { ref } from 'vue'
import PhoneFrame from '../PhoneFrame.vue'
import { CREATED_DROP, SHOWCASE_WALLET } from '../fixtures'
import DropCreatedMotionContent from '../../motion/DropCreatedMotionContent.vue'
import MotionDemoShell from './MotionDemoShell.vue'

const wallet = SHOWCASE_WALLET
const motionRef = ref<InstanceType<typeof DropCreatedMotionContent> | null>(null)

function play() {
  motionRef.value?.play()
}
</script>

<template>
  <MotionDemoShell
    label="Drop Created"
    hint="The Drop assembles — ~740ms · explicit play() · 200ms settle + 38ms stagger · fade 180ms"
    @replay="play"
  >
    <PhoneFrame :network-line="`${wallet.network} · ${wallet.addressShort}`">
      <DropCreatedMotionContent
        ref="motionRef"
        :drop-id="CREATED_DROP.id"
        :goal="CREATED_DROP.goal"
      >
        <p class="summary">
          {{ CREATED_DROP.contributionUsdt }} USDT per person<br>
          {{ CREATED_DROP.goal }} buyers<br>
          {{ CREATED_DROP.duration }}
        </p>
        <p class="link">{{ CREATED_DROP.shareUrl }}</p>
        <button type="button" class="btn primary">Copy link</button>
        <button type="button" class="btn secondary">Open Drop</button>
      </DropCreatedMotionContent>
    </PhoneFrame>
  </MotionDemoShell>
</template>

<style scoped>
.summary,
.link {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.45;
}
.summary {
  color: #141414;
  font-weight: 500;
}
.link {
  color: #6A6A6A;
  font-size: 12px;
  word-break: break-all;
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
.primary {
  border: 1px solid #C94E12;
  background: #C94E12;
  color: #fff;
}
.secondary {
  margin-top: 8px;
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
  font-weight: 500;
}
</style>
