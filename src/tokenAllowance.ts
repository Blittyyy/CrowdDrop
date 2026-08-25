export const MAX_UINT256 = (1n << 256n) - 1n

export type ApprovalPlan =
  | { kind: 'none' }
  | { kind: 'approve', amount: bigint }
  | { kind: 'reset-then-approve', amount: bigint }

export function reusableApprovalAmount(contribution: bigint, defaultReusableUnits: bigint): bigint {
  if (contribution <= 0n)
    throw new Error('Contribution must be greater than 0.')
  if (defaultReusableUnits <= 0n)
    throw new Error('Reusable allowance must be greater than 0.')
  const scaled = contribution * 5n
  const amount = contribution <= defaultReusableUnits ? defaultReusableUnits : (scaled > defaultReusableUnits ? scaled : defaultReusableUnits)
  if (amount === MAX_UINT256 || amount <= 0n)
    throw new Error('Unlimited approval is not allowed.')
  return amount
}

export function remainingAfterJoin(allowance: bigint, contribution: bigint): bigint {
  if (allowance < contribution)
    throw new Error('Allowance is below the contribution.')
  return allowance - contribution
}

export function withdrawalRestoresAllowance(): boolean {
  return false
}

export function planTokenApproval(
  allowance: bigint,
  contribution: bigint,
  defaultReusableUnits: bigint,
  requiresAllowanceReset: boolean,
): ApprovalPlan {
  if (allowance >= contribution)
    return { kind: 'none' }
  const amount = reusableApprovalAmount(contribution, defaultReusableUnits)
  if (requiresAllowanceReset && allowance > 0n)
    return { kind: 'reset-then-approve', amount }
  return { kind: 'approve', amount }
}
