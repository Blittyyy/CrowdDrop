/** Pure motion trigger rules for production Drop Detail. */

export function shouldAnimateCreated(confirmedCreate: boolean): boolean {
  return confirmedCreate
}

/**
 * Play success motion once per connected wallet the first time that wallet
 * sees a Drop resolved as Successful on-chain. Disconnected viewers never trigger.
 */
export function shouldAnimateSuccess(
  nextStatus: string,
  walletAddress: string | null,
  hasSeenForWallet: boolean,
): boolean {
  if (nextStatus !== 'Successful')
    return false
  if (!walletAddress)
    return false
  return !hasSeenForWallet
}

/**
 * Seller-only Claim Complete. Plays ONLY after a confirmed Claim receipt in this
 * session. Opening or connecting to an already-Claimed Drop never triggers.
 */
export function shouldAnimateClaim(
  nextStatus: string,
  walletAddress: string | null,
  isSeller: boolean,
  claimReceiptConfirmed: boolean,
  hasSeenForWallet: boolean,
): boolean {
  if (nextStatus !== 'Claimed')
    return false
  if (!walletAddress || !isSeller)
    return false
  if (!claimReceiptConfirmed || hasSeenForWallet)
    return false
  return true
}
