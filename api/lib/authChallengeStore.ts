import { createHash, randomBytes } from 'node:crypto'
import {
  AUTH_CHALLENGE_TTL_SECONDS,
  POLYGON_CHAIN_ID,
  POLYGON_CROWDDROP_ADDRESS,
  SELLER_UPLOAD_ACTION,
} from './crowdDropConstants.ts'
import { normalizeWallet } from './productFoundation.ts'

export type StoredAuthChallenge = {
  nonce: string
  expiresAt: number
  wallet: string
  action: string
  chainId: number
  verifyingContract: string
}

export function createChallengeNonce(): string {
  return randomBytes(32).toString('hex')
}

export function challengeExpiresAtSeconds(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000) + AUTH_CHALLENGE_TTL_SECONDS
}

export function challengePolicyFields(): {
  chainId: number
  verifyingContract: string
  action: string
} {
  return {
    chainId: POLYGON_CHAIN_ID,
    verifyingContract: POLYGON_CROWDDROP_ADDRESS,
    action: SELLER_UPLOAD_ACTION,
  }
}

export async function insertAuthChallenge(
  client: {
    from: (table: string) => {
      insert: (row: unknown) => PromiseLike<{ error: { message: string } | null }>
    }
  },
  params: { wallet: string, nonce: string, expiresAtSeconds: number },
): Promise<{ ok: true } | { ok: false, reason: string }> {
  const wallet = normalizeWallet(params.wallet)
  const expiresAt = new Date(params.expiresAtSeconds * 1000).toISOString()

  const { error } = await client.from('auth_challenges').insert({
    nonce: params.nonce,
    wallet,
    action: SELLER_UPLOAD_ACTION,
    chain_id: POLYGON_CHAIN_ID,
    contract_address: POLYGON_CROWDDROP_ADDRESS.toLowerCase(),
    expires_at: expiresAt,
  })

  if (error)
    return { ok: false, reason: error.message }

  return { ok: true }
}

export async function consumeAuthChallenge(
  client: {
    from: (table: string) => {
      update: (row: unknown) => {
        eq: (col: string, val: string) => {
          is: (col: string, val: null) => {
            select: (cols: string) => {
              maybeSingle: () => Promise<{ data: { wallet: string, action: string, chain_id: number, contract_address: string, expires_at: string } | null, error: { message: string } | null }>
            }
          }
        }
      }
    }
  },
  params: {
    nonce: string
    wallet: string
    action: string
    nowMs?: number
  },
): Promise<{ ok: true } | { ok: false, reason: string }> {
  const wallet = normalizeWallet(params.wallet)
  const nowIso = new Date(params.nowMs ?? Date.now()).toISOString()

  const { data, error } = await client.from('auth_challenges')
    .update({ used_at: nowIso })
    .eq('nonce', params.nonce)
    .is('used_at', null)
    .select('wallet, action, chain_id, contract_address, expires_at')
    .maybeSingle()

  if (error)
    return { ok: false, reason: error.message }
  if (!data)
    return { ok: false, reason: 'Challenge nonce already used or not found.' }

  if (data.wallet !== wallet)
    return { ok: false, reason: 'Challenge wallet mismatch.' }
  if (data.action !== params.action)
    return { ok: false, reason: 'Challenge action mismatch.' }
  if (Number(data.chain_id) !== POLYGON_CHAIN_ID)
    return { ok: false, reason: 'Challenge chain mismatch.' }
  if (data.contract_address !== POLYGON_CROWDDROP_ADDRESS.toLowerCase())
    return { ok: false, reason: 'Challenge contract mismatch.' }
  if (new Date(data.expires_at).getTime() < Date.now())
    return { ok: false, reason: 'Challenge expired.' }

  return { ok: true }
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
