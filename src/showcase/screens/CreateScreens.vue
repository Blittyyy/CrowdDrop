<script setup lang="ts">
import { ref } from 'vue'
import PhoneFrame from '../PhoneFrame.vue'
import { CREATE_DRAFT, CREATED_DROP, SHOWCASE_WALLET } from '../fixtures'

defineProps<{
  mode: 'create' | 'created'
}>()

/** Compact labels aligned to production CROWDDROP_DURATION_OPTIONS. */
const DURATION_CHIPS = [
  { id: '1h', label: '1h', seconds: 60 * 60 },
  { id: '4h', label: '4h', seconds: 4 * 60 * 60 },
  { id: '24h', label: '24h', seconds: 24 * 60 * 60 },
  { id: '3d', label: '3d', seconds: 3 * 24 * 60 * 60 },
  { id: '7d', label: '7d', seconds: 7 * 24 * 60 * 60 },
  { id: '30d', label: '30d', seconds: 30 * 24 * 60 * 60 },
] as const

const wallet = SHOWCASE_WALLET
const draft = CREATE_DRAFT
const created = CREATED_DROP
const selectedDuration = ref<(typeof DURATION_CHIPS)[number]['id']>('4h')
</script>

<template>
  <PhoneFrame :network-line="`${wallet.network} · ${wallet.addressShort}`">
    <template v-if="mode === 'create'">
      <button type="button" class="back">← Back</button>
      <h1>Create a Drop</h1>
      <p class="lede">Each buyer contributes the same amount. The seller can claim only if the goal is reached.</p>

      <label>
        <span>Contribution per person</span>
        <div class="field">
          <input :value="draft.contribution" readonly>
          <span class="suffix">USDT</span>
        </div>
      </label>
      <label>
        <span>Buyer goal</span>
        <div class="field">
          <input :value="draft.goal" readonly>
          <span class="suffix">buyers</span>
        </div>
      </label>

      <div class="duration-block">
        <span class="field-label">Duration</span>
        <div class="chips" role="listbox" aria-label="Duration">
          <button
            v-for="chip in DURATION_CHIPS"
            :key="chip.id"
            type="button"
            role="option"
            class="chip"
            :class="{ on: selectedDuration === chip.id }"
            :aria-selected="selectedDuration === chip.id"
            @click="selectedDuration = chip.id"
          >
            {{ chip.label }}
          </button>
        </div>
      </div>

      <button type="button" class="primary">Create Drop</button>
    </template>

    <template v-else>
      <h1>Drop #{{ created.id }} created</h1>
      <p class="summary">
        {{ created.contributionUsdt }} USDT per person<br>
        {{ created.goal }} buyers<br>
        {{ created.duration }}
      </p>
      <p class="link">{{ created.shareUrl }}</p>
      <button type="button" class="primary">Copy link</button>
      <button type="button" class="secondary">Open Drop</button>
      <button type="button" class="text">View transaction</button>
    </template>
  </PhoneFrame>
</template>

<style scoped>
.back {
  border: none;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 13px;
  padding: 0;
  min-height: 32px;
  cursor: pointer;
  margin-bottom: 8px;
}
h1 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.lede,
.summary,
.link {
  margin: 0 0 14px;
  font-size: 13px;
  color: #6A6A6A;
  line-height: 1.45;
}
.summary {
  color: #141414;
  font-weight: 500;
}
.link {
  font-size: 12px;
  word-break: break-all;
}
label,
.duration-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
label span,
.field-label {
  font-size: 12px;
  color: #6A6A6A;
  font-weight: 500;
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #E2E2DE;
  border-radius: 8px;
  padding: 0 12px;
  background: #fff;
  min-height: 44px;
}
input {
  flex: 1;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 15px;
  color: #141414;
  min-height: 44px;
  outline: none;
}
.suffix {
  font-size: 12px;
  color: #6A6A6A;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  padding: 8px 11px;
  min-height: 36px;
  border-radius: 8px;
  cursor: pointer;
}
.chip.on {
  border-color: #C94E12;
  color: #C94E12;
  background: #F3EBE4;
}
.primary,
.secondary,
.text {
  width: 100%;
  min-height: 44px;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
}
.primary {
  border: 1px solid #C94E12;
  background: #C94E12;
  color: #fff;
}
.secondary {
  border: 1px solid #E2E2DE;
  background: transparent;
  color: #141414;
}
.text {
  border: none;
  background: transparent;
  color: #6A6A6A;
  font-weight: 500;
  font-size: 12px;
  min-height: 36px;
}
</style>
