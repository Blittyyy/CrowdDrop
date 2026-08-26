<script setup lang="ts">
import { init } from '@nimiq/mini-app-sdk'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { applySavedDrop, resolveAppRoute, wantsHomeScreen, type AppRoute } from './appRoute'
import CrowdDropCreate from './CrowdDropCreate.vue'
import CrowdDropView from './CrowdDropView.vue'
import DevTools from './DevTools.vue'
import { readLastOpenedDrop, saveLastOpenedDrop } from './lastOpenedDrop'
import { initWalletSession } from './walletSession'

function readRoute(): AppRoute {
  const fromUrl = resolveAppRoute(window.location.href)
  if (fromUrl.name === 'drop') {
    saveLastOpenedDrop(fromUrl.dropParam)
    return fromUrl
  }
  if (wantsHomeScreen(window.location.href))
    return fromUrl
  const restored = applySavedDrop(fromUrl, readLastOpenedDrop())
  if (restored.name === 'drop') {
    const next = new URL(window.location.href)
    next.searchParams.set('drop', restored.dropParam)
    const path = next.pathname.replace(/\/+$/, '') || '/'
    if (path === '/')
      window.history.replaceState(window.history.state, '', `/?drop=${encodeURIComponent(restored.dropParam)}`)
  }
  return restored
}

const route = ref<AppRoute>(readRoute())
const routeKey = computed(() => JSON.stringify(route.value))
const isDev = computed(() => route.value.name === 'dev')

function syncRoute() {
  route.value = readRoute()
}

onMounted(() => {
  init({ timeout: 10_000 }).catch(() => undefined)
  void initWalletSession()
  syncRoute()
  window.addEventListener('popstate', syncRoute)
  window.addEventListener('hashchange', syncRoute)
  window.addEventListener('pageshow', syncRoute)
})

onUnmounted(() => {
  window.removeEventListener('popstate', syncRoute)
  window.removeEventListener('hashchange', syncRoute)
  window.removeEventListener('pageshow', syncRoute)
})
</script>

<template>
  <main class="shell" :class="isDev ? 'dev-shell' : 'product-shell'">
    <CrowdDropCreate v-if="route.name === 'create'" :key="routeKey" />
    <CrowdDropView v-else-if="route.name === 'drop'" :key="routeKey" :drop-param="route.dropParam" />
    <DevTools v-else />
    <p v-if="route.name !== 'dev'" class="dev-link">
      <details>
        <summary>More</summary>
        <a href="/dev">Development tools</a>
      </details>
    </p>
  </main>
</template>

<style scoped>
.shell {
  width: min(100%, var(--cd-max));
  margin: 0 auto;
  padding: 1.1rem 1rem 2rem;
}
.dev-shell {
  width: min(100%, 40rem);
  background: #f4f4f4;
  color: #111;
  border-radius: 12px;
  padding: 1rem;
  margin-top: 0.5rem;
}
.dev-link {
  margin-top: 1.75rem;
  font-size: 0.78rem;
  color: var(--cd-muted);
}
.dev-link summary {
  cursor: pointer;
  color: var(--cd-muted);
}
.dev-link a {
  color: var(--cd-tan);
}
</style>
