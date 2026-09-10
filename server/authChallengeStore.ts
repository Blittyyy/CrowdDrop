import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AUTH_CHALLENGE_TTL_SECONDS,
  POLYGON_CHAIN_ID,
  POLYGON_CROWDDROP_ADDRESS,
  PRODUCT_DOWNLOAD_ACTION,
  SELLER_UPLOAD_ACTION,
} from './crowdDropConstants.js'
import { normalizeWallet } from './productFoundation.js'

export type StoredAuthChallenge = {
  nonce: string
  expiresAt: number
  wallet: string
  action: string
  chainId: number
  verifyingContract: string
  dropId?: number | null
}

export function createChallengeNonce(): string {
  return randomBytes(32).toString('hex')
}

export function challengeExpiresAtSeconds(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000) + AUTH_CHALLENGE_TTL_SECONDS
}

export function challengePolicyFields(action: string = SELLER_UPLOAD_ACTION): {
  chainId: number
  verifyingContract: string
  action: string
} {
  return {
    chainId: POLYGON_CHAIN_ID,
    verifyingContract: POLYGON_CROWDDROP_ADDRESS,
    action,
  }
}

export async function insertAuthChallenge(
  client: SupabaseClient,
  params: {
    wallet: string
    nonce: string
    expiresAtSeconds: number
    action?: string
    dropId?: number | null
  },
): Promise<{ ok: true } | { ok: false, reason: string }> {
  const wallet = normalizeWallet(params.wallet)
  const action = params.action ?? SELLER_UPLOAD_ACTION
  const expiresAt = new Date(params.expiresAtSeconds * 1000).toISOString()

  if (action === PRODUCT_DOWNLOAD_ACTION) {
    if (params.dropId === undefined || params.dropId === null || !Number.isInteger(params.dropId) || params.dropId <= 0)
      return { ok: false, reason: 'dropId is required for product download.' }
  }

  const row: Record<string, unknown> = {
    nonce: params.nonce,
    wallet,
    action,
    chain_id: POLYGON_CHAIN_ID,
    contract_address: POLYGON_CROWDDROP_ADDRESS.toLowerCase(),
    expires_at: expiresAt,
  }
  if (action === PRODUCT_DOWNLOAD_ACTION)
    row.drop_id = params.dropId

  const { error } = await client.from('auth_challenges').insert(row)

  if (error)
    return { ok: false, reason: error.message }

  return { ok: true }
}

export async function consumeAuthChallenge(
  client: SupabaseClient,
  params: {
    nonce: string
    wallet: string
    action: string
    dropId?: number | null
    nowMs?: number
  },
): Promise<{ ok: true } | { ok: false, reason: string }> {
  const wallet = normalizeWallet(params.wallet)
  const nowIso = new Date(params.nowMs ?? Date.now()).toISOString()

  let query = client.from('auth_challenges')
    .update({ used_at: nowIso })
    .eq('nonce', params.nonce)
    .eq('wallet', wallet)
    .eq('action', params.action)
    .is('used_at', null)

  if (params.action === PRODUCT_DOWNLOAD_ACTION) {
    if (params.dropId === undefined || params.dropId === null)
      return { ok: false, reason: 'dropId is required for product download.' }
    query = query.eq('drop_id', params.dropId)
  }

  const { data, error } = await query
    .select('wallet, action, chain_id, contract_address, expires_at, drop_id')
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
  if (new Date(data.expires_at).getTime() < (params.nowMs ?? Date.now()))
    return { ok: false, reason: 'Challenge expired.' }

  if (params.action === PRODUCT_DOWNLOAD_ACTION) {
    if (Number(data.drop_id) !== Number(params.dropId))
      return { ok: false, reason: 'Challenge drop mismatch.' }
  }

  return { ok: true }
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
