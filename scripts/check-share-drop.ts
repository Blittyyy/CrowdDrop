/**
 * Share Drop (HTTPS) + Open in Nimiq Pay (custom deeplink) checks.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CANONICAL_CROWDDROP_ORIGIN,
  dropShareText,
  dropShareTitle,
  getCanonicalDropUrl,
  getCanonicalHomeUrl,
  getNimiqPayDropUrl,
  getNimiqPayHomeUrl,
  getNimiqPayMiniAppUrl,
  isMobileShareContext,
  preferredDropShareUrl,
  shareCrowdDrop,
} from '../src/shareDrop.ts'

const root = join(import.meta.dirname, '..')

// 1–2. Share always uses canonical HTTPS; Drop #11 exact
{
  assert.equal(getCanonicalDropUrl(11), 'https://www.usecrowddrop.xyz/?drop=11')
  assert.equal(preferredDropShareUrl(11), 'https://www.usecrowddrop.xyz/?drop=11')
  assert.equal(preferredDropShareUrl('11'), getCanonicalDropUrl(11))
  assert.equal(getCanonicalHomeUrl(), 'https://www.usecrowddrop.xyz/')
  assert.equal(CANONICAL_CROWDDROP_ORIGIN, 'https://www.usecrowddrop.xyz')
  assert.doesNotMatch(preferredDropShareUrl(11), /nimiqpay:/i)
}

// 3–4. Mobile share + clipboard never expose nimiqpay://
{
  const shared = await shareCrowdDrop({
    dropId: 11,
    productTitle: 'Demo Pack',
    shareFn: async (data) => {
      assert.equal(data.url, 'https://www.usecrowddrop.xyz/?drop=11')
      assert.doesNotMatch(String(data.url), /nimiqpay:/i)
      assert.equal(data.title, 'CrowdDrop — Demo Pack')
      assert.equal(data.text, 'Join this CrowdDrop for Demo Pack.')
    },
  })
  assert.equal(shared.status, 'shared')

  let clipped = ''
  const copied = await shareCrowdDrop({
    dropId: 11,
    shareFn: null,
    clipboardWrite: async (text) => {
      clipped = text
    },
  })
  assert.equal(copied.status, 'copied')
  assert.equal(clipped, 'https://www.usecrowddrop.xyz/?drop=11')
  assert.doesNotMatch(clipped, /nimiqpay:/i)

  const desktop = await shareCrowdDrop({
    dropId: 11,
    shareFn: async (data) => {
      assert.equal(data.url, getCanonicalDropUrl(11))
      assert.equal(data.title, dropShareTitle(null))
      assert.equal(data.text, dropShareText(null))
    },
  })
  assert.equal(desktop.status, 'shared')

  const cancelled = await shareCrowdDrop({
    dropId: 11,
    shareFn: async () => {
      const err = new Error('dismiss')
      err.name = 'AbortError'
      throw err
    },
  })
  assert.equal(cancelled.status, 'cancelled')
}

// 7–9. Open in Nimiq Pay still uses verified custom deeplink
{
  const raw = getCanonicalDropUrl(11)
  const deeplink = getNimiqPayDropUrl(11)
  assert.equal(
    deeplink,
    'nimiqpay://miniapp?url=https%3A%2F%2Fwww.usecrowddrop.xyz%2F%3Fdrop%3D11',
  )
  assert.equal(deeplink, `nimiqpay://miniapp?url=${encodeURIComponent(raw)}`)
  assert.equal(deeplink.indexOf('?'), deeplink.lastIndexOf('?'))
  assert.match(deeplink, /%3Fdrop%3D11/)
  assert.equal(getNimiqPayMiniAppUrl(raw), deeplink)
  assert.equal(
    getNimiqPayHomeUrl(),
    `nimiqpay://miniapp?url=${encodeURIComponent(getCanonicalHomeUrl())}`,
  )
  assert.equal(isMobileShareContext({ userAgent: 'iPhone' }), true)
}

// Wiring
{
  const createSrc = readFileSync(join(root, 'src/CrowdDropCreate.vue'), 'utf8')
  const viewSrc = readFileSync(join(root, 'src/CrowdDropView.vue'), 'utf8')
  const listsSrc = readFileSync(join(root, 'src/DropLists.vue'), 'utf8')
  const barSrc = readFileSync(join(root, 'src/WalletBar.vue'), 'utf8')
  const shareSrc = readFileSync(join(root, 'src/shareDrop.ts'), 'utf8')
  const routeSrc = readFileSync(join(root, 'src/appRoute.ts'), 'utf8')

  // 5–6 Created + Detail Share use HTTPS helper path
  assert.match(createSrc, /Share Drop/)
  assert.match(createSrc, /shareCrowdDrop/)
  assert.match(viewSrc, /Share Drop/)
  assert.match(viewSrc, /shareCrowdDrop/)
  assert.match(shareSrc, /Always uses the canonical HTTPS/)
  assert.match(shareSrc, /preferredDropShareUrl[\s\S]*getCanonicalDropUrl/)
  assert.doesNotMatch(shareSrc, /mobile \? getNimiqPayDropUrl/)

  // 7–9 Open in Nimiq Pay CTA + deeplink helpers preserved
  assert.match(viewSrc, /getNimiqPayDropUrl/)
  assert.match(viewSrc, /showNimiqPayHandoff/)
  assert.match(viewSrc, /Open this Drop in Nimiq Pay to connect your wallet and participate/)
  assert.match(createSrc, /showNimiqPayHandoff/)
  assert.match(createSrc, /getNimiqPayHomeUrl/)
  assert.match(barSrc, /Open in Nimiq Pay/)

  // 10–11 public Drop visible; mobile no-provider handoff
  assert.match(viewSrc, /product-block|productMeta/)
  assert.match(viewSrc, /showNimiqPayHandoff/)

  // 12 desktop EIP-1193
  assert.match(barSrc, /walletProviderAvailable/)
  assert.match(barSrc, /connectWallet/)

  // 13 cancellation silent
  assert.match(viewSrc, /result\.status === 'cancelled'/)

  // 14 no private data in URL helpers
  assert.doesNotMatch(shareSrc, /walletAccount|signature|cookie|asset_path|supabase|session/i)

  assert.doesNotMatch(listsSrc, /Share Drop/)
  assert.match(routeSrc, /name: 'drop'/)
}

console.log('check-share-drop: ok')
