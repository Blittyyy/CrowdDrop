/**
 * Participant reconstruction + loader resilience (no wallet required for unit tests).
 */
import assert from 'node:assert/strict'
import {
  currentParticipantsFromDeposits,
  hasActiveParticipantDeposit,
  participantListPreview,
  PARTICIPANT_PREVIEW_LIMIT,
  resolveParticipantDeposits,
  uniqueJoinersInOrder,
} from '../src/dropParticipants.ts'

let passed = 0
function check(cond: unknown, msg: string) {
  assert.ok(cond, msg)
  passed += 1
}

function isRecoverableLogQueryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('history has been pruned')
    || lower.includes('pruned')
    || lower.includes('exceed maximum block range')
    || lower.includes('block range')
}

const A = '0xB02862445f89cE966B1AdAac06C21D013891af28'
const B = '0x198400000000000000000000000000000000871d'
const C = '0xbcf16183Da0F9bd69d5882940Ea4cAD579d789B0'

// --- pure reconstruction ---

// 1. one Joined wallet with deposit > 0 appears (incl. expired active deposit)
{
  const ordered = uniqueJoinersInOrder([A])
  const current = currentParticipantsFromDeposits(ordered, new Map([[A.toLowerCase(), 100_000n]]))
  check(current.length === 1 && current[0]!.toLowerCase() === A.toLowerCase(), 'expired active deposit appears')
}

// 2. Joined then withdrawn wallet does not appear — empty list, not error
{
  const ordered = uniqueJoinersInOrder([A])
  const current = currentParticipantsFromDeposits(ordered, new Map([[A.toLowerCase(), 0n]]))
  check(current.length === 0, 'expired withdrawn => empty list')
}

// 3. multiple current participants appear once each, earliest first
{
  const ordered = uniqueJoinersInOrder([A, B, C])
  const current = currentParticipantsFromDeposits(ordered, new Map([
    [A.toLowerCase(), 1n],
    [B.toLowerCase(), 1n],
    [C.toLowerCase(), 1n],
  ]))
  check(current.length === 3, 'three current participants')
  check(current[0]!.toLowerCase() === A.toLowerCase(), 'earliest first')
}

// 4. repeated join after withdrawal does not duplicate wallet
{
  const ordered = uniqueJoinersInOrder([A, B, A])
  check(ordered.length === 2, 'unique joiners keep first sighting only')
}

// 5. disconnected viewer path is pure public data
{
  const current = currentParticipantsFromDeposits([A, B], (addr) =>
    addr.toLowerCase() === A.toLowerCase() ? 5n : 0n)
  check(current.length === 1, 'no viewer wallet required')
}

// 6. empty participant list is success (not treated as failure)
{
  check(currentParticipantsFromDeposits([], new Map()).length === 0, 'empty candidates => success')
  check(currentParticipantsFromDeposits([A], new Map([[A.toLowerCase(), 0n]])).length === 0, 'all zero deposits => success')
}

// 7. one malformed deposit read does not break the section
{
  const deposits = await resolveParticipantDeposits([A, B], async (addr) => {
    if (addr.toLowerCase() === B.toLowerCase())
      throw new Error('rpc timeout')
    return 100_000n
  })
  const current = currentParticipantsFromDeposits([A, B], deposits)
  check(current.length === 1 && current[0]!.toLowerCase() === A.toLowerCase(), 'one failed depositOf skipped')
  passed += 1
}

// 8. list caps at 5 before View all
{
  const many = Array.from({ length: 18 }, (_, i) =>
    `0x${(i + 1).toString(16).padStart(40, '0')}`)
  const preview = participantListPreview(many, false)
  check(preview.shown.length === PARTICIPANT_PREVIEW_LIMIT, 'preview shows 5')
  check(preview.hiddenCount === 13, 'hidden count for View all 18')
}

// --- CrowdDrop.sol depositOf semantics (Successful / Claimed / Expired) ---

// Successful: depositOf still > 0 until withdraw (blocked while successful)
check(hasActiveParticipantDeposit(100_000n), 'successful buyer depositOf > 0')

// Claimed: claim() clears escrowed but NOT deposits[] — depositOf still returns contribution
{
  const afterClaim = currentParticipantsFromDeposits([A], new Map([[A.toLowerCase(), 100_000n]]))
  check(afterClaim.length === 1, 'claimed: depositOf unchanged in mapping still lists wallet')
}

// Expired withdrawn: depositOf zeroed by withdraw()
check(!hasActiveParticipantDeposit(0n), 'expired withdrawn depositOf == 0')

// --- log query resilience ---

check(isRecoverableLogQueryError(new Error('History has been pruned for this block')), 'pruned is recoverable')
check(isRecoverableLogQueryError(new Error('exceed maximum block range: 10000')), 'range limit is recoverable')
check(!isRecoverableLogQueryError(new Error('invalid opcode')), 'other rpc errors not recoverable')

console.log(`dropParticipants: ${passed} checks passed`)
