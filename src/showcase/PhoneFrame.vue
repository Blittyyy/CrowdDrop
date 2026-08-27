<script setup lang="ts">
withDefaults(defineProps<{
  networkLine?: string
  brand?: string
  /** When false, phone starts with page content (no CrowdDrop wordmark row). */
  showAppHeader?: boolean
}>(), {
  showAppHeader: true,
  networkLine: '',
})
</script>

<template>
  <div class="phone">
    <header v-if="showAppHeader" class="head">
      <span class="brand">{{ brand || 'CrowdDrop' }}</span>
      <span class="wallet">{{ networkLine }}</span>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.phone {
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
  min-height: 640px;
  padding: 14px 16px 24px;
  background: #F6F6F4;
  color: #141414;
  font-family: Inter, system-ui, sans-serif;
  border: 1px solid #E2E2DE;
  border-radius: 0;
  box-shadow: none;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.brand {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.wallet {
  font-size: 11px;
  color: #6A6A6A;
  font-variant-numeric: tabular-nums;
}
</style>
