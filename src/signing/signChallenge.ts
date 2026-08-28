import { AUTH_CHALLENGE_TTL_SECONDS } from './crowdDropAuthTypedData.ts'

export type SigningChallenge = {
  nonce: string
  expiresAt: number
}

function randomNonceHex(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Dev smoke-test challenge (no persistence). */
export function createSigningChallenge(nowMs = Date.now()): SigningChallenge {
  const nonce = randomNonceHex()
  const expiresAt = Math.floor(nowMs / 1000) + AUTH_CHALLENGE_TTL_SECONDS
  return { nonce, expiresAt }
}
