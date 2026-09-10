export type SellerSessionMemory = {
  wallet: string
  expiresAt: number
}

export function sellerSessionStillValid(
  session: SellerSessionMemory | null | undefined,
  wallet: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!session)
    return false
  if (session.wallet.toLowerCase() !== wallet.toLowerCase())
    return false
  // Refresh a bit early so mid-flow expiry is less likely.
  return session.expiresAt > nowSeconds + 30
}
