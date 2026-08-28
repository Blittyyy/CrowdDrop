import { computed, inject, onUnmounted, ref, type ComputedRef, type Ref } from 'vue'
import { REDUCED_MOTION_MS } from './motionTokens'

export type MotionPlayPhase = 'idle' | 'playing' | 'complete'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia)
    return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Explicit event animation controller. Animations do not run until play() is called.
 */
export function useMotionPlay(totalDurationMs: number): {
  phase: Ref<MotionPlayPhase>
  phaseClass: ComputedRef<Record<string, boolean>>
  play: () => void
  reset: () => void
} {
  const forceReduced = inject<Ref<boolean>>('motionForceReduced', ref(false))
  const phase = ref<MotionPlayPhase>('idle')
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function durationMs() {
    if (forceReduced.value || prefersReducedMotion())
      return REDUCED_MOTION_MS
    return totalDurationMs
  }

  function play() {
    clearTimer()
    phase.value = 'idle'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        phase.value = 'playing'
        timer = setTimeout(() => {
          phase.value = 'complete'
          timer = null
        }, durationMs())
      })
    })
  }

  function reset() {
    clearTimer()
    phase.value = 'idle'
  }

  onUnmounted(clearTimer)

  const phaseClass = computed(() => ({
    'is-idle': phase.value === 'idle',
    'is-playing': phase.value === 'playing',
    'is-complete': phase.value === 'complete',
  }))

  return { phase, phaseClass, play, reset }
}
