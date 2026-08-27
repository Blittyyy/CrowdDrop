<script setup lang="ts">
import VariantA from './VariantA.vue'
import VariantB from './VariantB.vue'
import VariantC from './VariantC.vue'
import VariantD from './VariantD.vue'
import FeedbackOverlay from './FeedbackOverlay.vue'

const variants = [
  {
    id: 'A',
    title: 'Variant A — Ledger',
    thesis: 'Dense payment/statement grammar. Tabular rows: Drop ID, contribution, fill fraction, time left.',
  },
  {
    id: 'B',
    title: 'Variant B — Seats',
    thesis: 'Participant-slot map. Capacity circles are the primary signal; money and deadline support them.',
  },
  {
    id: 'C',
    title: 'Variant C — Utility',
    thesis: 'Extreme native-wallet minimalism. Almost no chrome; Drops appear as plain tappable lines.',
  },
  {
    id: 'D',
    title: 'Variant D — Urgency',
    thesis: 'Deadline-first index. Time remaining leads each row; money is secondary; hash marks show fill.',
  },
] as const
</script>

<template>
  <div class="lab">
    <header class="lab-head">
      <p class="kicker">CrowdDrop design lab</p>
      <h1>Home screen exploration</h1>
      <p class="brief">
        Fake static data only. No wallet calls. No chain state.
        Compare four information architectures on your phone, then tell the agent which direction to pursue.
      </p>
      <p class="path">Preview: <code>/showcase</code></p>
    </header>

    <section
      v-for="v in variants"
      :id="'variant-' + v.id"
      :key="v.id"
      class="block"
      :data-variant="v.id"
    >
      <div class="block-head">
        <h2>{{ v.title }}</h2>
        <p>{{ v.thesis }}</p>
      </div>

      <VariantA v-if="v.id === 'A'" :label="v.title" :thesis="v.thesis" />
      <VariantB v-else-if="v.id === 'B'" :label="v.title" :thesis="v.thesis" />
      <VariantC v-else-if="v.id === 'C'" :label="v.title" :thesis="v.thesis" />
      <VariantD v-else :label="v.title" :thesis="v.thesis" />
    </section>

    <footer class="lab-foot">
      Reply in chat with your preferred variant (A / B / C / D) and what to keep or change.
      Do not treat this page as production UI.
    </footer>

    <FeedbackOverlay target-name="CrowdDrop Home" />
  </div>
</template>

<style scoped>
.lab {
  width: min(100%, 440px);
  margin: 0 auto;
  padding: 16px 12px 48px;
  font-family: Inter, system-ui, sans-serif;
  color: #ece7df;
  background: #0a0a0a;
  min-height: 100vh;
}
.lab-head {
  margin-bottom: 22px;
  padding-bottom: 14px;
  border-bottom: 1px solid #262626;
}
.kicker {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a8175;
}
h1 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.03em;
}
.brief,
.path {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.45;
  color: #a89f91;
}
.path code {
  color: #e06a35;
  font-size: 12px;
}
.block {
  margin: 0 0 28px;
}
.block-head {
  margin-bottom: 10px;
}
.block-head h2 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 650;
}
.block-head p {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: #958b7e;
}
.lab-foot {
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid #262626;
  font-size: 12px;
  color: #8a8175;
  line-height: 1.45;
}
</style>
