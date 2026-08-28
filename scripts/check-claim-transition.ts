/**
 * Seller Claim transition lifecycle — no chain calls.
 */
import assert from 'node:assert/strict'
import {
  claimDotTowardCenterPx,
  formatClaimSuccessMessage,
  isSmallGoalClaimMotion,
  readyToCommitClaimedState,
  shouldDeferDropReload,
  shouldShowStaticClaimedUi,
  SMALL_GOAL_DOT_SCALE,
  visibleStatusLabel,
} from '../src/motion/claimTransition.ts'
import { CLAIM_TIMING } from '../src/motion/motionTokens.ts'
import { shouldAnimateClaim } from '../src/motion/motionTriggers.ts'
import { shouldSkipMotionEvaluation } from '../src/motion/motionPlayback.ts'

const SELLER = '0xB02862445f89cE966B1AdAac06C21D013891af28'
const BUYER = '0xbcf16183Da0F9bd69d5882940Ea4cAD579d789B0'

let passed = 0
function check(cond: unknown, msg: string) {
  assert.ok(cond, msg)
  passed += 1
}

check(
  visibleStatusLabel('Claimed', true) === 'Successful',
  'confirmed claim keeps Successful visible during transition',
)
check(
  !shouldShowStaticClaimedUi('Claimed', true, true),
  'static Claimed UI hidden before claim motion finishes',
)
check(
  shouldShowStaticClaimedUi('Claimed', false, true),
  'static Claimed UI after transition completes',
)
check(shouldDeferDropReload(true), 'defer reload during transition')
check(!shouldDeferDropReload(false), 'normal reload when idle')

check(
  formatClaimSuccessMessage('0.20', 'USDT') === '0.20 USDT sent to your wallet.',
  'claim complete message uses actual claimed amount',
)

check(isSmallGoalClaimMotion(2), 'goal 2 uses small-goal motion treatment')
check(isSmallGoalClaimMotion(4), 'goal 4 uses small-goal motion treatment')
check(!isSmallGoalClaimMotion(5), 'goal 5 uses normal motion treatment')
check(SMALL_GOAL_DOT_SCALE === 1.2, 'small-goal dot scale stays in place')
check(claimDotTowardCenterPx(0, 2, true) === 4, '2-dot left dot shifts +4px toward center')
check(claimDotTowardCenterPx(1, 2, true) === -4, '2-dot right dot shifts -4px toward center')
check(claimDotTowardCenterPx(0, 2, false) !== 4, 'large-goal keeps separate compress shift')
check(Math.abs(claimDotTowardCenterPx(0, 2, true)) <= 5, 'small-goal shift stays within few px')

check(shouldSkipMotionEvaluation(false, false, true), 'skip motion eval during claim transition')

check(
  readyToCommitClaimedState({ drop: { buyerCount: 2n, escrowed: 1n, claimed: true }, statusLabel: 'Claimed' }, true),
  'animation ends with atomic Claimed commit',
)

check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, false),
  'revisit already Claimed no animation',
)
check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, false),
  'poll detects Claimed static only',
)
check(
  !shouldAnimateClaim('Claimed', BUYER, false, false, false),
  'buyer never gets Claim Complete',
)
check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, false),
  'cancelled claim no receipt no transition',
)
check(
  shouldAnimateClaim('Claimed', SELLER, true, true, false),
  'confirmed receipt triggers seller transition',
)

check(CLAIM_TIMING.totalMs >= 900 && CLAIM_TIMING.totalMs <= 1200, 'claim timing within 900ms–1.2s')
check(CLAIM_TIMING.titleDelayMs >= 450, 'claim complete title appears mid-motion')
check(CLAIM_TIMING.restDelayMs >= 550, 'wallet line follows title')

console.log(`claimTransition: ${passed} checks passed`)
