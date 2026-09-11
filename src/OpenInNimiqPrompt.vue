<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  openHref: string
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const panelRef = ref<HTMLElement | null>(null)
const openBtnRef = ref<HTMLAnchorElement | null>(null)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('dismiss')
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await nextTick()
  openBtnRef.value?.focus()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

watch(() => props.openHref, () => {
  // Keep focus on primary action if href updates for the same sheet.
  void nextTick(() => openBtnRef.value?.focus())
})
</script>

<template>
  <div class="prompt" role="presentation">
    <button
      type="button"
      class="scrim"
      aria-label="Continue in browser"
      @click="emit('dismiss')"
    />
    <div
      ref="panelRef"
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="open-nimiq-prompt-title"
      aria-describedby="open-nimiq-prompt-copy"
    >
      <h2 id="open-nimiq-prompt-title" class="title">
        Open in Nimiq Pay?
      </h2>
      <p id="open-nimiq-prompt-copy" class="copy">
        Open this Drop in Nimiq Pay to connect your wallet and participate.
      </p>
      <a
        ref="openBtnRef"
        class="primary"
        :href="openHref"
      >
        Open in Nimiq Pay
      </a>
      <button type="button" class="continue" @click="emit('dismiss')">
        Continue in browser
      </button>
    </div>
  </div>
</template>

<style scoped>
.prompt {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
  font-family: Inter, system-ui, sans-serif;
}
.scrim {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  border: none;
  background: rgb(20 20 20 / 0.22);
  cursor: pointer;
  pointer-events: auto;
}
.sheet {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 480px;
  box-sizing: border-box;
  margin: 0;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  border: 1px solid #E2E2DE;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: #F6F6F4;
  pointer-events: auto;
}
.title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #141414;
}
.copy {
  margin: 0 0 14px;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  color: #6A6A6A;
}
.primary {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  margin: 0 0 8px;
  padding: 10px 12px;
  border: 1px solid #C94E12;
  border-radius: 8px;
  background: #C94E12;
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  text-align: center;
  cursor: pointer;
}
.primary:active {
  background: #B9430E;
  border-color: #B9430E;
}
.primary:focus-visible,
.continue:focus-visible,
.scrim:focus-visible {
  outline: 2px solid #C94E12;
  outline-offset: 2px;
}
.continue {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  margin: 0;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6A6A6A;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.continue:active {
  color: #141414;
  background: #EFEFEA;
}

@media (prefers-reduced-motion: reduce) {
  .scrim,
  .sheet {
    transition: none;
  }
}
</style>
