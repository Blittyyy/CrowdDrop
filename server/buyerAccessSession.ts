import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  BUYER_ACCESS_COOKIE_NAME,
  BUYER_ACCESS_SESSION_TTL_SECONDS,
  POLYGON_CHAIN_ID,
  POLYGON_CROWDDROP_ADDRESS,
  PRODUCT_DOWNLOAD_ACTION,
} from './crowdDropConstants.js'

export const CROWDDROP_AUTH_SECRET_ENV = 'CROWDDROP_AUTH_SECRET'

export type BuyerAccessSessionPayload = {
  wallet: string
  dropId: number
  chainId: number
  contract: string
  action: typeof PRODUCT_DOWNLOAD_ACTION
  iat: number
  exp: number
}

export type BuyerAccessSessionResult =
  | { ok: true, payload: BuyerAccessSessionPayload }
  | { ok: false, reason: string }

function readAuthSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env[CROWDDROP_AUTH_SECRET_ENV]?.trim() ?? ''
  return secret || null
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

export function signBuyerAccessSession(
  payload: BuyerAccessSessionPayload,
  secret: string,
): string {
  const body = encodeBase64Url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyBuyerAccessSessionToken(
  token: string | undefined | null,
  options: {
    nowSeconds?: number
    env?: NodeJS.ProcessEnv
    expectedDropId?: number
  } = {},
): BuyerAccessSessionResult {
  const secret = readAuthSecret(options.env)
  if (!secret)
    return { ok: false, reason: 'auth_secret_not_configured' }

  if (!token || typeof token !== 'string')
    return { ok: false, reason: 'missing_session' }

  const parts = token.split('.')
  if (parts.length !== 2)
    return { ok: false, reason: 'invalid_session_format' }

  const [body, sig] = parts
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf))
    return { ok: false, reason: 'invalid_session_signature' }

  let payload: BuyerAccessSessionPayload
  try {
    payload = JSON.parse(decodeBase64Url(body)) as BuyerAccessSessionPayload
  }
  catch {
    return { ok: false, reason: 'invalid_session_payload' }
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (payload.action !== PRODUCT_DOWNLOAD_ACTION)
    return { ok: false, reason: 'invalid_session_action' }
  if (!payload.wallet || !Number.isInteger(payload.dropId) || payload.dropId <= 0)
    return { ok: false, reason: 'invalid_session_payload' }
  if (payload.chainId !== POLYGON_CHAIN_ID)
    return { ok: false, reason: 'invalid_session_chain' }
  if (typeof payload.contract !== 'string'
    || payload.contract.toLowerCase() !== POLYGON_CROWDDROP_ADDRESS.toLowerCase())
    return { ok: false, reason: 'invalid_session_contract' }
  if (payload.exp <= nowSeconds)
    return { ok: false, reason: 'session_expired' }
  if (typeof options.expectedDropId === 'number' && payload.dropId !== options.expectedDropId)
    return { ok: false, reason: 'session_drop_mismatch' }

  return { ok: true, payload }
}

export function createBuyerAccessSessionToken(
  params: { wallet: string, dropId: number },
  options: { nowSeconds?: number, env?: NodeJS.ProcessEnv } = {},
): { ok: true, token: string, expiresAt: number } | { ok: false, reason: string } {
  const secret = readAuthSecret(options.env)
  if (!secret)
    return { ok: false, reason: 'auth_secret_not_configured' }

  const dropId = params.dropId
  if (!Number.isInteger(dropId) || dropId <= 0)
    return { ok: false, reason: 'invalid_drop_id' }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const payload: BuyerAccessSessionPayload = {
    wallet: params.wallet.toLowerCase(),
    dropId,
    chainId: POLYGON_CHAIN_ID,
    contract: POLYGON_CROWDDROP_ADDRESS.toLowerCase(),
    action: PRODUCT_DOWNLOAD_ACTION,
    iat: nowSeconds,
    exp: nowSeconds + BUYER_ACCESS_SESSION_TTL_SECONDS,
  }

  return {
    ok: true,
    token: signBuyerAccessSession(payload, secret),
    expiresAt: payload.exp,
  }
}

export function buildBuyerAccessCookie(
  token: string,
  maxAgeSeconds = BUYER_ACCESS_SESSION_TTL_SECONDS,
): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${BUYER_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
}

export function readBuyerAccessTokenFromCookie(cookieHeader: string | undefined): string | undefined {
  const cookies = cookieHeader ?? ''
  const match = cookies
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${BUYER_ACCESS_COOKIE_NAME}=`))
  if (!match)
    return undefined
  return decodeURIComponent(match.slice(BUYER_ACCESS_COOKIE_NAME.length + 1))
}

export function readBuyerAccessSessionFromCookie(
  cookieHeader: string | undefined,
  options: {
    nowSeconds?: number
    env?: NodeJS.ProcessEnv
    expectedDropId?: number
  } = {},
): BuyerAccessSessionResult {
  return verifyBuyerAccessSessionToken(readBuyerAccessTokenFromCookie(cookieHeader), options)
}
