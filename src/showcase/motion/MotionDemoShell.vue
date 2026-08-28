<script setup lang="ts">
import { provide, ref } from 'vue'

defineProps<{
  label: string
  hint?: string
}>()

const emit = defineEmits<{
  replay: []
}>()

const forceReduced = ref(false)

provide('motionForceReduced', forceReduced)

function replay() {
  emit('replay')
}
</script>

<template>
  <div class="demo-shell">
    <div class="demo-meta">
      <h3 class="demo-label">{{ label }}</h3>
      <p v-if="hint" class="demo-hint">{{ hint }}</p>
    </div>
    <div class="demo-controls">
      <button type="button" class="ctrl" @click="replay">Replay</button>
      <label class="toggle">
        <input v-model="forceReduced" type="checkbox">
        Reduced motion preview
      </label>
    </div>
    <div class="demo-stage" :class="{ 'reduce-motion': forceReduced }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.demo-shell {
  margin-bottom: 20px;
}
.demo-meta {
  margin-bottom: 8px;
}
.demo-label {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #d8d8d8;
}
.demo-hint {
  margin: 0;
  font-size: 11px;
  color: #888;
  line-height: 1.35;
}
.demo-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  margin-bottom: 10px;
}
.ctrl {
  border: 1px solid #444;
  background: #2a2a2a;
  color: #eee;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  min-height: 32px;
}
.ctrl:active {
  background: #333;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
  user-select: none;
}
</style>
