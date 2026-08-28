import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  SELLER_SESSION_TTL_SECONDS,
  SELLER_UPLOAD_ACTION,
  SESSION_COOKIE_NAME,
} from './crowdDropConstants.ts'

export const CROWDDROP_AUTH_SECRET_ENV = 'CROWDDROP_AUTH_SECRET'

export type SellerSessionPayload = {
  wallet: string
  action: typeof SELLER_UPLOAD_ACTION
  exp: number
  iat: number
}

export type SellerSessionResult =
  | { ok: true, payload: SellerSessionPayload }
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

export function signSellerSession(
  payload: SellerSessionPayload,
  secret: string,
): string {
  const body = encodeBase64Url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifySellerSessionToken(
  token: string | undefined | null,
  options: { nowSeconds?: number, env?: NodeJS.ProcessEnv } = {},
): SellerSessionResult {
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

  let payload: SellerSessionPayload
  try {
    payload = JSON.parse(decodeBase64Url(body)) as SellerSessionPayload
  }
  catch {
    return { ok: false, reason: 'invalid_session_payload' }
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (payload.action !== SELLER_UPLOAD_ACTION)
    return { ok: false, reason: 'invalid_session_action' }
  if (!payload.wallet || payload.exp <= nowSeconds)
    return { ok: false, reason: 'session_expired' }

  return { ok: true, payload }
}

export function createSellerSessionToken(
  wallet: string,
  options: { nowSeconds?: number, env?: NodeJS.ProcessEnv } = {},
): { ok: true, token: string, expiresAt: number } | { ok: false, reason: string } {
  const secret = readAuthSecret(options.env)
  if (!secret)
    return { ok: false, reason: 'auth_secret_not_configured' }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const payload: SellerSessionPayload = {
    wallet: wallet.toLowerCase(),
    action: SELLER_UPLOAD_ACTION,
    iat: nowSeconds,
    exp: nowSeconds + SELLER_SESSION_TTL_SECONDS,
  }

  return {
    ok: true,
    token: signSellerSession(payload, secret),
    expiresAt: payload.exp,
  }
}

export function buildSessionCookie(token: string, maxAgeSeconds = SELLER_SESSION_TTL_SECONDS): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
}

export function readSellerSessionFromCookie(
  cookieHeader: string | undefined,
  options: { nowSeconds?: number, env?: NodeJS.ProcessEnv } = {},
): SellerSessionResult {
  const cookies = cookieHeader ?? ''
  const match = cookies.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE_NAME}=`))
  const token = match ? decodeURIComponent(match.slice(SESSION_COOKIE_NAME.length + 1)) : undefined
  return verifySellerSessionToken(token, options)
}
