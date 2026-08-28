/**
 * Motion mount/play lifecycle — no chain calls, no Vue DOM.
 */
import assert from 'node:assert/strict'
import {
  motionPlaySideEffects,
  MOTION_MOUNT_TICKS,
  nextMotionPlayAttempt,
  shouldSkipMotionEvaluation,
} from '../src/motion/motionPlayback.ts'
import {
  shouldAnimateClaim,
  shouldAnimateSuccess,
} from '../src/motion/motionTriggers.ts'

const SELLER = '0xB02862445f89cE966B1AdAac06C21D013891af28'
const BUYER = '0xbcf16183Da0F9bd69d5882940Ea4cAD579d789B0'

let passed = 0
function check(cond: unknown, msg: string) {
  assert.ok(cond, msg)
  passed += 1
}

check(shouldSkipMotionEvaluation(true, false), 'skip eval while claim motion active')
check(shouldSkipMotionEvaluation(false, true), 'skip eval while success motion active')
check(shouldSkipMotionEvaluation(false, false, true), 'skip eval during claim transition')
check(!shouldSkipMotionEvaluation(false, false), 'eval proceeds when idle')

check(nextMotionPlayAttempt(true, true, 2) === 'play', 'ref ready → play')
check(nextMotionPlayAttempt(true, false, 2) === 'wait', 'ref missing with ticks → wait')
check(nextMotionPlayAttempt(true, false, 0) === 'give-up', 'ref missing exhausted → give-up')
check(nextMotionPlayAttempt(false, true, 2) === 'give-up', 'motion cancelled → give-up')

const claimPlayFx = motionPlaySideEffects('play', 'claim')
check(claimPlayFx.markSeen && claimPlayFx.clearClaimReceipt && !claimPlayFx.resetMotionUi, 'claim play marks seen clears receipt')
const claimGiveUpFx = motionPlaySideEffects('give-up', 'claim')
check(!claimGiveUpFx.markSeen && !claimGiveUpFx.clearClaimReceipt && claimGiveUpFx.resetMotionUi, 'claim give-up no seen no receipt clear')

const successPlayFx = motionPlaySideEffects('play', 'success')
check(successPlayFx.markSeen && !successPlayFx.clearClaimReceipt, 'success play marks seen only')
const successGiveUpFx = motionPlaySideEffects('give-up', 'success')
check(!successGiveUpFx.markSeen && successGiveUpFx.resetMotionUi, 'success give-up no seen resets ui')

check(MOTION_MOUNT_TICKS === 2, 'mount tick budget')

// Simulated claim receipt lifecycle
check(
  shouldAnimateClaim('Claimed', SELLER, true, true, false),
  'confirmed claim receipt sets up motion',
)
check(
  nextMotionPlayAttempt(true, true, MOTION_MOUNT_TICKS) === 'play',
  'motion ref available before playback',
)
const noPlayFx = motionPlaySideEffects(
  nextMotionPlayAttempt(true, false, 0),
  'claim',
)
check(!noPlayFx.markSeen, 'seen marker not written if play never starts')
const beginFx = motionPlaySideEffects('play', 'claim')
check(beginFx.markSeen, 'seen marker written when play begins')

// Static / poll semantics unchanged
check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, false),
  'already claimed initial load no play',
)
check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, false),
  'poll successful to claimed no play',
)
check(
  !shouldAnimateClaim('Claimed', BUYER, false, false, false),
  'buyer never gets claim complete',
)
check(
  !shouldAnimateClaim('Claimed', SELLER, true, false, false),
  'cancelled claim no receipt no play',
)

// Success mid-animation reopen (mark-at-start already in triggers test)
check(
  !shouldAnimateSuccess('Successful', SELLER, true),
  'success seen at begin prevents replay after leave',
)

console.log(`motionPlayback: ${passed} checks passed`)
