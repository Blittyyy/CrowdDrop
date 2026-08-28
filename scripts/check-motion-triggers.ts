/**
 * Motion trigger + seen-key semantics — no chain calls.
 */
import assert from 'node:assert/strict'
import {
  claimMotionSeenKey,
  hasSeenClaimMotion,
  hasSeenSuccessMotion,
  markClaimMotionSeen,
  markSuccessMotionSeen,
  successMotionSeenKey,
  type MotionSeenStorage,
} from '../src/motion/motionSeenStorage.ts'
import {
  shouldAnimateClaim,
  shouldAnimateCreated,
  shouldAnimateSuccess,
} from '../src/motion/motionTriggers.ts'

const CONTRACT = '0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12'
const SELLER = '0xB02862445f89cE966B1AdAac06C21D013891af28'
const BUYER_1 = '0xbcf16183Da0F9bd69d5882940Ea4cAD579d789B0'
const BUYER_2 = '0x1984153FeE3256FF4d813Db5370A8ea1082871dd'
const DROP = '5'

function memoryStorage(): MotionSeenStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    has(key) { return map.get(key) === '1' },
    mark(key) { map.set(key, '1') },
  }
}

function scope(wallet: string) {
  return {
    chainId: 137,
    contractAddress: CONTRACT,
    dropId: DROP,
    walletAddress: wallet,
  }
}

/** Mirrors production: mark seen when animation is about to play. */
function beginSuccessMotion(wallet: string, store: MotionSeenStorage) {
  markSuccessMotionSeen(scope(wallet), store)
}

/** Mirrors production: mark seen when claim animation is about to play. */
function beginClaimMotion(wallet: string, store: MotionSeenStorage) {
  markClaimMotionSeen(scope(wallet), store)
}

let passed = 0
function check(cond: unknown, msg: string) {
  assert.ok(cond, msg)
  passed += 1
}

check(shouldAnimateCreated(true), 'confirmed create triggers')
check(!shouldAnimateCreated(false), 'cancelled create no flag')

// SUCCESS — per wallet, first Successful view
check(
  shouldAnimateSuccess('Successful', SELLER, false),
  'seller first sees successful',
)
check(
  !shouldAnimateSuccess('Successful', SELLER, true),
  'seller reopen no replay',
)
check(
  shouldAnimateSuccess('Successful', BUYER_1, false),
  'buyer 1 first sees successful',
)
check(
  shouldAnimateSuccess('Successful', BUYER_2, false),
  'buyer 2 first sees successful',
)
check(
  !shouldAnimateSuccess('Successful', null, false),
  'disconnected successful no animation',
)
check(
  !shouldAnimateSuccess('Active', SELLER, false),
  'active status no success animation',
)
check(
  shouldAnimateSuccess('Successful', BUYER_1, false),
  'polling discovers successful for unseen wallet',
)
check(
  !shouldAnimateSuccess('Successful', BUYER_1, true),
  'later poll successful no replay',
)

// Seen keys scoped by chain + contract + drop + wallet
const sellerKey = successMotionSeenKey(scope(SELLER))
check(
  sellerKey === `crowddrop:motion:success:137:${CONTRACT.toLowerCase()}:5:${SELLER.toLowerCase()}`,
  'success key format',
)
const buyer1Key = successMotionSeenKey(scope(BUYER_1))
check(sellerKey !== buyer1Key, 'wallets have distinct keys')

const store = memoryStorage()
check(!hasSeenSuccessMotion(scope(SELLER), store), 'not seen initially')
beginSuccessMotion(SELLER, store)
check(hasSeenSuccessMotion(scope(SELLER), store), 'success marker written when animation begins')
check(!hasSeenSuccessMotion(scope(BUYER_1), store), 'other wallet still unseen')

// Connect afterward
check(
  shouldAnimateSuccess('Successful', BUYER_1, hasSeenSuccessMotion(scope(BUYER_1), store)),
  'connect afterward animates if unseen',
)

// Mid-animation leave → mark-at-start prevents replay on reopen
beginSuccessMotion(BUYER_1, store)
check(
  !shouldAnimateSuccess('Successful', BUYER_1, hasSeenSuccessMotion(scope(BUYER_1), store)),
  'leaving mid-animation then reopening no success replay',
)

// CLAIM — seller only, confirmed receipt in session
check(
  shouldAnimateClaim('Claimed', SELLER, true, true, false),
  'confirmed seller claim receipt triggers once',
)
check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, false),
  'seller opens already claimed unseen no claim animation',
)
check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, false),
  'seller connects on already claimed no claim animation',
)
check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, true),
  'claim seen marker prevents replay without receipt',
)
check(
  !shouldAnimateClaim('Claimed', BUYER_1, false, false, false),
  'buyer never gets claim animation',
)
check(
  !shouldAnimateClaim('Claimed', BUYER_1, false, false, false),
  'buyer sees claimed from poll no claim animation',
)
check(
  !shouldAnimateClaim('Claimed', null, true, false, false),
  'disconnected claim no animation',
)

const claimStore = memoryStorage()
beginClaimMotion(SELLER, claimStore)
check(
  claimMotionSeenKey(scope(SELLER)).includes(':claim:'),
  'claim key uses claim type',
)
check(hasSeenClaimMotion(scope(SELLER), claimStore), 'claim marker written when animation begins')

// Poll detects Successful → Claimed: no claim animation without receipt
check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, false),
  'poll successful to claimed no claim animation for seller',
)

console.log(`motion trigger checks: ${passed} passed`)
