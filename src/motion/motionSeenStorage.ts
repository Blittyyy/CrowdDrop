/** UI-only animation seen markers. Blockchain state remains authoritative. */

export type MotionSeenScope = {
  chainId: number
  contractAddress: string
  dropId: string
  walletAddress: string
}

export type MotionSeenStorage = {
  has: (key: string) => boolean
  mark: (key: string) => void
}

export function normalizeWalletAddress(address: string): string {
  return address.toLowerCase()
}

export function successMotionSeenKey(scope: MotionSeenScope): string {
  const contract = scope.contractAddress.toLowerCase()
  const wallet = normalizeWalletAddress(scope.walletAddress)
  return `crowddrop:motion:success:${scope.chainId}:${contract}:${scope.dropId}:${wallet}`
}

export function claimMotionSeenKey(scope: MotionSeenScope): string {
  const contract = scope.contractAddress.toLowerCase()
  const wallet = normalizeWalletAddress(scope.walletAddress)
  return `crowddrop:motion:claim:${scope.chainId}:${contract}:${scope.dropId}:${wallet}`
}

export function createLocalMotionSeenStorage(): MotionSeenStorage {
  return {
    has(key: string) {
      try {
        return window.localStorage.getItem(key) === '1'
      }
      catch {
        return false
      }
    },
    mark(key: string) {
      try {
        window.localStorage.setItem(key, '1')
      }
      catch {
        // Ignore quota / private-mode failures.
      }
    },
  }
}

export function hasSeenSuccessMotion(
  scope: MotionSeenScope,
  storage: MotionSeenStorage = createLocalMotionSeenStorage(),
): boolean {
  return storage.has(successMotionSeenKey(scope))
}

export function markSuccessMotionSeen(
  scope: MotionSeenScope,
  storage: MotionSeenStorage = createLocalMotionSeenStorage(),
): void {
  storage.mark(successMotionSeenKey(scope))
}

export function hasSeenClaimMotion(
  scope: MotionSeenScope,
  storage: MotionSeenStorage = createLocalMotionSeenStorage(),
): boolean {
  return storage.has(claimMotionSeenKey(scope))
}

export function markClaimMotionSeen(
  scope: MotionSeenScope,
  storage: MotionSeenStorage = createLocalMotionSeenStorage(),
): void {
  storage.mark(claimMotionSeenKey(scope))
}
