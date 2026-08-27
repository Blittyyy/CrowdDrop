<script setup lang="ts">
import SharedParticipantDots from '../ParticipantDots.vue'

defineProps<{
  joined: number | bigint
  goal: number | bigint
  tone?: 'orange' | 'success' | 'expired' | 'muted'
}>()
</script>

<template>
  <SharedParticipantDots
    :joined="joined"
    :goal="goal"
    :tone="tone"
  />
</template>
