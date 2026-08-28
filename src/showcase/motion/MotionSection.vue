<script setup lang="ts">
import ClaimCompleteMotion from './ClaimCompleteMotion.vue'
import DropCreatedMotion from './DropCreatedMotion.vue'
import DropSuccessMotion from './DropSuccessMotion.vue'
</script>

<template>
  <section class="motion-lab">
    <header class="motion-head">
      <h2 class="section-title">Motion</h2>
      <p class="section-lede">
        Final participant-dot motion · explicit <code>play()</code> event triggers ·
        CSS only · ~650ms–1.1s · <code>prefers-reduced-motion</code> respected
      </p>
    </header>

    <DropCreatedMotion />
    <DropSuccessMotion variant="buyer" />
    <DropSuccessMotion variant="seller" />
    <ClaimCompleteMotion />
  </section>
</template>

<style scoped>
.motion-lab {
  max-width: 420px;
  margin: 0 auto 36px;
  padding-top: 8px;
  border-top: 1px solid #333;
}
.motion-head {
  margin-bottom: 20px;
}
.section-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #f0f0f0;
}
.section-lede {
  margin: 0;
  font-size: 12px;
  color: #8a8a8a;
  line-height: 1.45;
}
.section-lede code {
  font-size: 11px;
  color: #aaa;
}
</style>
