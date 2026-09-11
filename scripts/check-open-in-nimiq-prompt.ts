/**
 * Automatic Open in Nimiq Pay prompt (mobile Drop, no provider).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getNimiqPayDropUrl,
  isMobileShareContext,
} from '../src/shareDrop.ts'
import {
  openInNimiqPromptDismissKey,
  readOpenInNimiqPromptDismissed,
  shouldShowOpenInNimiqPrompt,
  writeOpenInNimiqPromptDismissed,
} from '../src/openInNimiqPrompt.ts'

const root = join(import.meta.dirname, '..')
const viewSrc = readFileSync(join(root, 'src/CrowdDropView.vue'), 'utf8')
const createSrc = readFileSync(join(root, 'src/CrowdDropCreate.vue'), 'utf8')
const historySrc = readFileSync(join(root, 'src/DropHistory.vue'), 'utf8')
const promptSrc = readFileSync(join(root, 'src/OpenInNimiqPrompt.vue'), 'utf8')
const helperSrc = readFileSync(join(root, 'src/openInNimiqPrompt.ts'), 'utf8')
const barSrc = readFileSync(join(root, 'src/WalletBar.vue'), 'utf8')
const appSrc = readFileSync(join(root, 'src/App.vue'), 'utf8')
const routeSrc = readFileSync(join(root, 'src/appRoute.ts'), 'utf8')

const memoryStore = () => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

// 1. mobile Drop + no provider => prompt appears
{
  assert.equal(shouldShowOpenInNimiqPrompt({
    walletChecking: false,
    providerAvailable: false,
    mobile: true,
    hasDropId: true,
    dismissed: false,
  }), true)
  assert.equal(isMobileShareContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), true)
}

// 2. provider present => absent
{
  assert.equal(shouldShowOpenInNimiqPrompt({
    walletChecking: false,
    providerAvailable: true,
    mobile: true,
    hasDropId: true,
    dismissed: false,
  }), false)
}

// 3. desktop + no provider => absent
{
  assert.equal(shouldShowOpenInNimiqPrompt({
    walletChecking: false,
    providerAvailable: false,
    mobile: false,
    hasDropId: true,
    dismissed: false,
  }), false)
  assert.equal(isMobileShareContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    maxTouchPoints: 0,
    mobileUaData: false,
    matchMediaMatches: false,
  }), false)
}

// wallet still checking => absent
{
  assert.equal(shouldShowOpenInNimiqPrompt({
    walletChecking: true,
    providerAvailable: false,
    mobile: true,
    hasDropId: true,
    dismissed: false,
  }), false)
}

// 4. Home / History / Create => prompt component not mounted there
{
  assert.doesNotMatch(createSrc, /OpenInNimiqPrompt|showOpenInNimiqPrompt/)
  assert.doesNotMatch(historySrc, /OpenInNimiqPrompt|showOpenInNimiqPrompt/)
  assert.match(viewSrc, /OpenInNimiqPrompt/)
  assert.match(viewSrc, /showOpenInNimiqPrompt/)
  assert.match(appSrc, /route\.name === 'drop'/)
}

// 5–7. Continue dismisses; scoped by Drop; does not immediately return
{
  const store = memoryStore()
  assert.equal(openInNimiqPromptDismissKey(11), 'crowddrop_open_prompt_dismissed_11')
  assert.equal(readOpenInNimiqPromptDismissed(11, store), false)
  writeOpenInNimiqPromptDismissed(11, store)
  assert.equal(readOpenInNimiqPromptDismissed(11, store), true)
  assert.equal(readOpenInNimiqPromptDismissed(12, store), false)
  assert.equal(shouldShowOpenInNimiqPrompt({
    walletChecking: false,
    providerAvailable: false,
    mobile: true,
    hasDropId: true,
    dismissed: true,
  }), false)
  assert.match(helperSrc, /sessionStorage|getItem|setItem/)
  assert.match(viewSrc, /writeOpenInNimiqPromptDismissed/)
  assert.match(viewSrc, /dismissOpenInNimiqPrompt/)
  assert.match(promptSrc, /Continue in browser/)
  assert.match(promptSrc, /@dismiss|emit\('dismiss'\)/)
}

// 8. Open button uses exact Nimiq Pay deeplink
{
  const deeplink = getNimiqPayDropUrl(11)
  assert.equal(
    deeplink,
    'nimiqpay://miniapp?url=https%3A%2F%2Fwww.usecrowddrop.xyz%2F%3Fdrop%3D11',
  )
  assert.match(viewSrc, /getNimiqPayDropUrl/)
  assert.match(viewSrc, /:open-href="nimiqPayOpenHref"/)
  assert.match(promptSrc, /:href="openHref"/)
  assert.match(promptSrc, /Open in Nimiq Pay/)
}

// 9. existing in-page Open in Nimiq Pay CTA remains (WalletBar)
{
  assert.match(viewSrc, /nimiq-pay-open-href="nimiqPayOpenHref"/)
  assert.match(barSrc, /Open in Nimiq Pay/)
  assert.match(barSrc, /showOpenInNimiqPay/)
}

// 10. Share Drop remains
{
  assert.match(viewSrc, /Share Drop/)
  assert.match(viewSrc, /shareCrowdDrop/)
}

// 11. no automatic custom-scheme launch
{
  assert.doesNotMatch(viewSrc, /location\.href\s*=\s*nimiqPay|window\.location\s*=\s*getNimiqPay/)
  assert.doesNotMatch(promptSrc, /onMounted[\s\S]*location\.href|window\.location/)
  assert.match(promptSrc, /<a[\s\S]*:href="openHref"/)
  assert.doesNotMatch(helperSrc, /nimiqpay:\/\//)
}

// 12. direct ?drop= navigation remains intact
{
  assert.match(routeSrc, /name: 'drop'/)
  assert.match(routeSrc, /dropParam/)
  assert.match(appSrc, /CrowdDropView[\s\S]*drop-param="route\.dropParam"/)
}

// Copy + a11y basics
{
  assert.match(promptSrc, /Open in Nimiq Pay\?/)
  assert.match(promptSrc, /Open this Drop in Nimiq Pay to connect your wallet and participate\./)
  assert.match(promptSrc, /role="dialog"/)
  assert.match(promptSrc, /Escape/)
  assert.match(promptSrc, /prefers-reduced-motion/)
}

console.log('check-open-in-nimiq-prompt: ok')
