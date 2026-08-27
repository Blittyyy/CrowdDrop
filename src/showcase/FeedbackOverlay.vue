<script setup lang="ts">
import { computed, ref } from 'vue'

defineProps<{
  targetName: string
}>()

const open = ref(false)
const overall = ref('')
const comments = ref<Array<{ variant: string, note: string }>>([])
const draftVariant = ref('A')
const draftNote = ref('')

const summary = computed(() => {
  const lines = [
    '## Design Lab Feedback',
    '',
    `**Target:** CrowdDrop Home`,
    `**Comments:** ${comments.value.length}`,
    '',
  ]
  for (const c of comments.value) {
    lines.push(`### Variant ${c.variant}`)
    lines.push(c.note)
    lines.push('')
  }
  lines.push('### Overall Direction')
  lines.push(overall.value.trim() || '(none yet)')
  return lines.join('\n')
})

function addComment() {
  const note = draftNote.value.trim()
  if (!note)
    return
  comments.value.push({ variant: draftVariant.value, note })
  draftNote.value = ''
}

async function copyFeedback() {
  try {
    await navigator.clipboard.writeText(summary.value)
    open.value = false
  }
  catch {
    open.value = true
  }
}
</script>

<template>
  <div class="fb">
    <button type="button" class="fab" @click="open = !open">
      {{ open ? 'Close feedback' : 'Add feedback' }}
    </button>

    <div v-if="open" class="panel">
      <p class="title">Feedback for {{ targetName }}</p>
      <label>
        Variant
        <select v-model="draftVariant">
          <option>A</option>
          <option>B</option>
          <option>C</option>
          <option>D</option>
        </select>
      </label>
      <label>
        Note
        <textarea v-model="draftNote" rows="3" placeholder="What works / what to change" />
      </label>
      <button type="button" class="btn" @click="addComment">Save note</button>
      <label>
        Overall direction
        <textarea v-model="overall" rows="3" placeholder="e.g. Prefer B structure, A density" />
      </label>
      <button type="button" class="btn primary" @click="copyFeedback">Copy feedback for chat</button>
      <pre>{{ summary }}</pre>
    </div>
  </div>
</template>

<style scoped>
.fb {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 50;
  font-family: Inter, system-ui, sans-serif;
}
.fab {
  border: 1px solid #3a342e;
  background: #1a1816;
  color: #f1ebe3;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 10px 12px;
  min-height: 40px;
  border-radius: 999px;
  cursor: pointer;
}
.panel {
  position: absolute;
  right: 0;
  bottom: 48px;
  width: min(92vw, 320px);
  background: #161412;
  border: 1px solid #2a2724;
  border-radius: 10px;
  padding: 12px;
  color: #f1ebe3;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.title {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #9b9082;
}
select,
textarea {
  font: inherit;
  font-size: 13px;
  color: #f1ebe3;
  background: #0f0e0d;
  border: 1px solid #2a2724;
  border-radius: 8px;
  padding: 8px;
}
.btn {
  border: 1px solid #3a342e;
  background: transparent;
  color: #f1ebe3;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
  min-height: 36px;
  border-radius: 8px;
  cursor: pointer;
}
.btn.primary {
  border-color: #d2652f;
  color: #d2652f;
}
pre {
  margin: 0;
  max-height: 120px;
  overflow: auto;
  font-size: 10px;
  color: #8a8175;
  white-space: pre-wrap;
}
</style>
