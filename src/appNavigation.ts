import { clearLastOpenedDrop, normalizeDropId, saveLastOpenedDrop } from './lastOpenedDropStorage.ts'

export type NavigationSync = () => void

type CrowdDropHistoryState = {
  crowddropNav?: number
}

let syncNavigation: NavigationSync | null = null

/** Set by tests to assert SPA navigation (never full document reload). */
export let lastNavigationWasSpa = false
/** Set by tests to detect accidental full reloads. */
export let lastNavigationUsedAssign = false

export function registerNavigationSync(fn: NavigationSync): void {
  syncNavigation = fn
}

export function homePath(): string {
  return '/?home=1'
}

export function dropPath(dropId: string): string {
  return `/?drop=${encodeURIComponent(dropId)}`
}

function nextHistoryState(): CrowdDropHistoryState {
  const prev = (window.history.state as CrowdDropHistoryState | null)?.crowddropNav ?? 0
  return { crowddropNav: prev + 1 }
}

function applyHistory(path: string, replace: boolean): void {
  lastNavigationWasSpa = true
  lastNavigationUsedAssign = false
  const state = nextHistoryState()
  if (replace)
    window.history.replaceState(state, '', path)
  else
    window.history.pushState(state, '', path)
  syncNavigation?.()
}

/** SPA transition — updates URL without reloading the document. */
export function navigateToPath(path: string, replace = false): void {
  applyHistory(path, replace)
}

export function goToHome(options?: { replace?: boolean }): void {
  applyHistory(homePath(), options?.replace ?? false)
}

export function goHome(): void {
  goToHome()
}

export function goToCreateDrop(): void {
  clearLastOpenedDrop()
  goToHome()
}

export function openDropById(dropId: string): void {
  const id = normalizeDropId(dropId)
  if (!id)
    return
  saveLastOpenedDrop(id)
  applyHistory(dropPath(id), false)
}

/** True when this Drop was opened via in-app pushState (safe to history.back()). */
export function canSpaBack(): boolean {
  const state = window.history.state as CrowdDropHistoryState | null
  return typeof state?.crowddropNav === 'number' && state.crowddropNav > 0
}

export function goBackOrHome(): void {
  if (canSpaBack()) {
    window.history.back()
    return
  }
  goToHome({ replace: true })
}

/** @deprecated Test-only reset */
export function resetNavigationTestFlags(): void {
  lastNavigationWasSpa = false
  lastNavigationUsedAssign = false
}
