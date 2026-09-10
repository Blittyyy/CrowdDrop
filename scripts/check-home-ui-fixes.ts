/**
 * Home UI hygiene: single Connect CTA when disconnected; no $ before USDT amounts.
 * Source + formatter checks only — no chain calls.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatUnits } from 'viem'
import { ensureLeadingZeroAmount, parseTokenAmount } from '../src/tokenMath.ts'

const root = join(import.meta.dirname, '..')
const createSrc = readFileSync(join(root, 'src/CrowdDropCreate.vue'), 'utf8')
const walletBarSrc = readFileSync(join(root, 'src/WalletBar.vue'), 'utf8')
const dropCardSrc = readFileSync(join(root, 'src/DropCard.vue'), 'utf8')
const detailSrc = readFileSync(join(root, 'src/CrowdDropView.vue'), 'utf8')
const uiFormatSrc = readFileSync(join(root, 'src/uiFormat.ts'), 'utf8')

/** Mirrors src/uiFormat.ts formatHomeAmount (keeps test free of extensionless imports). */
function formatHomeAmount(value: bigint, decimals: number): string {
  const raw = ensureLeadingZeroAmount(formatUnits(value, decimals))
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [whole, fraction = ''] = unsigned.split('.')
  const trimmedFrac = fraction.replace(/0+$/, '')
  const shown = trimmedFrac.length === 0 ? whole : `${whole}.${trimmedFrac}`
  return `${negative ? '-' : ''}${shown}`
}

// --- 1. Disconnected Home: exactly one Connect CTA (header), no full-width Connect ---
{
  assert.match(walletBarSrc, /return walletAccount\.value \|\| walletSeenAccount\.value \? 'Reconnect' : 'Connect'/)
  assert.match(walletBarSrc, /compactAction/)
  assert.match(createSrc, /<WalletBar compact utility/)

  assert.match(createSrc, /needsNetworkSwitchCta/)
  const homeTemplate = createSrc.slice(createSrc.indexOf('<template>'), createSrc.indexOf('</template>') + 11)
  const sysWalletBlock = homeTemplate.match(/class="sys-wallet"[\s\S]*?<\/div>/)
  assert.ok(sysWalletBlock, 'sys-wallet block should still exist for network switch')
  assert.doesNotMatch(sysWalletBlock[0], />\s*Connect\s*</)
  assert.match(sysWalletBlock[0], /Switch to \{\{ network\.chainName \}\}/)

  assert.doesNotMatch(createSrc, /connectWallet,/)
  assert.doesNotMatch(
    homeTemplate,
    /class="sys-btn"[\s\S]*?>\s*Connect\s*</,
    'full-width sys-btn must not be a Connect CTA',
  )
}

// --- 2. Amount formatters: no $ prefix; leading zero for tiny amounts ---
{
  // Source must not prepend currency `$` before the amount.
  assert.doesNotMatch(uiFormatSrc, /\$\$\{shown\}/)
  assert.doesNotMatch(uiFormatSrc, /return `\$\$\{REUSABLE_ALLOWANCE_TOKENS\}`/)
  assert.match(uiFormatSrc, /return `\$\{negative \? '-' : ''\}\$\{shown\}`/)

  const tiny = parseTokenAmount('0.000001', 6)
  assert.equal(formatHomeAmount(tiny, 6), '0.000001')
  assert.doesNotMatch(formatHomeAmount(tiny, 6), /\$/)

  const bareFracUnits = parseTokenAmount('.00001', 6)
  assert.equal(formatHomeAmount(bareFracUnits, 6), '0.00001')

  const ten = parseTokenAmount('10', 6)
  assert.equal(formatHomeAmount(ten, 6), '10')

  // UI composes amount + token label (no $ between).
  assert.match(dropCardSrc, /\{\{\s*amount\s*\}\} \{\{\s*network\.tokenSymbol\s*\}\} per person/)
  assert.match(dropCardSrc, /formatHomeAmount/)
  assert.match(detailSrc, /contributionHome/)
  assert.match(detailSrc, /formatHomeAmount/)
  assert.match(detailSrc, /\{\{\s*contributionHome\s*\}\}/)
  assert.match(detailSrc, /\{\{\s*tokenLabel\s*\}\} per person/)

  assert.match(createSrc, /createdResult\.contributionDisplay/)
  assert.match(createSrc, /\{\{\s*createdResult\.contributionDisplay\s*\}\} \{\{\s*network\.tokenSymbol\s*\}\} per person/)
}

console.log('check-home-ui-fixes: ok')
