<script setup lang="ts">
import { init } from '@nimiq/mini-app-sdk'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { applySavedDrop, resolveAppRoute, wantsHomeScreen, type AppRoute } from './appRoute'
import CrowdDropCreate from './CrowdDropCreate.vue'
import CrowdDropView from './CrowdDropView.vue'
import DevTools from './DevTools.vue'
import Showcase from './showcase/Showcase.vue'
import { readLastOpenedDrop, saveLastOpenedDrop } from './lastOpenedDrop'
import { initWalletSession } from './walletSession'

function readRoute(): AppRoute {
  const fromUrl = resolveAppRoute(window.location.href)
  if (fromUrl.name === 'drop') {
    saveLastOpenedDrop(fromUrl.dropParam)
    return fromUrl
  }
  if (fromUrl.name === 'showcase' || fromUrl.name === 'dev')
    return fromUrl
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
const isShowcase = computed(() => route.value.name === 'showcase')
const isHome = computed(() => route.value.name === 'create')
const isDrop = computed(() => route.value.name === 'drop')

function syncRoute() {
  route.value = readRoute()
}

onMounted(() => {
  // Showcase is static fake UI — skip wallet/SDK noise there.
  if (!isShowcase.value) {
    init({ timeout: 10_000 }).catch(() => undefined)
    void initWalletSession()
  }
  syncRoute()
  window.addEventListener('popstate', syncRoute)
  window.addEventListener('hashchange', syncRoute)
  window.addEventListener('pageshow', syncRoute)
})

watch(isHome, (home) => {
  document.body.classList.toggle('cd-home', home)
}, { immediate: true })

onUnmounted(() => {
  document.body.classList.remove('cd-home')
  window.removeEventListener('popstate', syncRoute)
  window.removeEventListener('hashchange', syncRoute)
  window.removeEventListener('pageshow', syncRoute)
})
</script>

<template>
  <main
    class="shell"
    :class="{
      'dev-shell': isDev,
      'home-shell': isHome,
      'product-shell': isDrop,
      'showcase-shell': isShowcase,
    }"
  >
    <Showcase v-if="route.name === 'showcase'" :key="routeKey" />
    <CrowdDropCreate v-else-if="route.name === 'create'" :key="routeKey" />
    <CrowdDropView v-else-if="route.name === 'drop'" :key="routeKey" :drop-param="route.dropParam" />
    <DevTools v-else />
    <p v-if="route.name !== 'dev' && route.name !== 'showcase'" class="dev-link">
      <details>
        <summary>More</summary>
        <a href="/showcase">Design showcase</a>
        <a href="/dev">Development tools</a>
      </details>
    </p>
  </main>
</template>

<style scoped>
.shell {
  width: min(100%, var(--cd-max));
  margin: 0 auto;
  padding: 0.85rem 1rem 1.75rem;
}
.home-shell {
  width: 100%;
  max-width: min(100%, 26rem);
  margin: 0 auto;
  padding: 14px 16px 28px;
  min-height: 100dvh;
  background: #F6F6F4;
  color: #141414;
  font-family: Inter, system-ui, sans-serif;
}
.showcase-shell {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  background: #0a0a0a;
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
  margin-top: 1.5rem;
  font-size: 0.72rem;
  color: #6A6A6A;
  opacity: 0.65;
}
.home-shell .dev-link {
  color: #6A6A6A;
}
.dev-link summary {
  cursor: pointer;
  color: inherit;
  list-style: none;
}
.dev-link summary::-webkit-details-marker {
  display: none;
}
.dev-link a {
  display: block;
  margin-top: 0.35rem;
  color: inherit;
  font-size: 0.72rem;
}
</style>
