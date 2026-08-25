/** Native ETH Sepolia feasibility escrow. Do not use for Polygon USDT. */
export const TEST_ESCROW_ADDRESS = '0x27d551D3770d3bec6cD77d9cAb5A7AB8FC656BD3'

export const SEPOLIA_CHAIN_ID = '0xaa36a7'
export const SEPOLIA_CHAIN_DECIMAL = 11155111

export const POLYGON_CHAIN_ID = '0x89'
export const POLYGON_CHAIN_DECIMAL = 137

/** USDT and TestUSD both use 6 decimals. Always format/parse with this value. */
export const STABLECOIN_DECIMALS = 6

/** Default reusable ERC-20 allowance in whole tokens (6-decimal TUSD/USDT). Never unlimited. */
export const REUSABLE_ALLOWANCE_TOKENS = 100
export const REUSABLE_ALLOWANCE_UNITS = BigInt(REUSABLE_ALLOWANCE_TOKENS) * 10n ** BigInt(STABLECOIN_DECIMALS)

export const TEST_USD_ADDRESS = '0x19Ca66141eb5Aa3B7996EA179D0287B7B0a11141' as const
export const TEST_TOKEN_ESCROW_ADDRESS = '0x4be52198FE2Ad809DCA2C9dF56e3aFF621906194' as const
export const CROWDDROP_SEPOLIA_ADDRESS = '0xC17e2Fa96771F6b1adD541038a507C10493A7069' as const

/** Set after a Polygon CrowdDrop is deployed. */
export const POLYGON_CROWDDROP_ADDRESS = '0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12' as const

/**
 * Polygon USDT used by Nimiq Pay.
 * Verified from the installed Mini Apps skill: `.agents/skills/mini-apps/references/chains-and-tokens.md`
 * Cross-checked against Nimiq Pay's well-known token list.
 */
export const POLYGON_USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as const

/** Set after a Polygon USDT escrow is deployed. Leave empty until then. */
export const POLYGON_USDT_ESCROW_ADDRESS = '' as `0x${string}` | ''

export const ERC20_NETWORKS = {
  sepoliaTestUsd: {
    id: 'sepoliaTestUsd',
    label: 'Sepolia TestUSD',
    chainId: SEPOLIA_CHAIN_ID,
    chainDecimal: SEPOLIA_CHAIN_DECIMAL,
    chainName: 'Sepolia',
    nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.sepolia.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    tokenAddress: TEST_USD_ADDRESS,
    tokenSymbol: 'TUSD',
    tokenDecimals: STABLECOIN_DECIMALS,
    escrowAddress: TEST_TOKEN_ESCROW_ADDRESS,
    contributionDisplay: '20',
    contributionUnits: 20n * 10n ** BigInt(STABLECOIN_DECIMALS),
  },
  polygonUsdt: {
    id: 'polygonUsdt',
    label: 'Polygon USDT',
    chainId: POLYGON_CHAIN_ID,
    chainDecimal: POLYGON_CHAIN_DECIMAL,
    chainName: 'Polygon',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://polygon-bor-rpc.publicnode.com'],
    blockExplorerUrls: ['https://polygonscan.com'],
    tokenAddress: POLYGON_USDT_ADDRESS,
    tokenSymbol: 'USDT',
    tokenDecimals: STABLECOIN_DECIMALS,
    escrowAddress: POLYGON_USDT_ESCROW_ADDRESS,
    contributionDisplay: '',
    contributionUnits: 0n,
  },
} as const

/** Feasibility UI stays on Sepolia TestUSD until a Polygon escrow is deployed and this is changed. */
export const ACTIVE_ERC20_NETWORK_ID = 'sepoliaTestUsd' as const
export const activeErc20Network = ERC20_NETWORKS[ACTIVE_ERC20_NETWORK_ID]

export const CROWDDROP_DURATION_OPTIONS = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '4 hours', seconds: 4 * 60 * 60 },
  { label: '24 hours', seconds: 24 * 60 * 60 },
  { label: '3 days', seconds: 3 * 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
  { label: '30 days', seconds: 30 * 24 * 60 * 60 },
] as const

export const CROWDDROP_NETWORKS = {
  sepoliaTestUsd: {
    id: 'sepoliaTestUsd',
    label: 'Sepolia TestUSD',
    chainId: SEPOLIA_CHAIN_ID,
    chainDecimal: SEPOLIA_CHAIN_DECIMAL,
    chainName: 'Sepolia',
    nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    tokenAddress: TEST_USD_ADDRESS,
    tokenSymbol: 'TUSD',
    tokenDecimals: STABLECOIN_DECIMALS,
    crowdDropAddress: CROWDDROP_SEPOLIA_ADDRESS,
    reusableAllowanceUnits: REUSABLE_ALLOWANCE_UNITS,
    requiresAllowanceReset: false,
    /** First block to query CrowdDrop events. Update when a new deployment is used. */
    eventFromBlock: 11_000_000,
    minGoal: 2,
    maxGoal: 1000,
    minDurationSeconds: 60 * 60,
    maxDurationSeconds: 90 * 24 * 60 * 60,
  },
  polygonUsdt: {
    id: 'polygonUsdt',
    label: 'Polygon USDT',
    chainId: POLYGON_CHAIN_ID,
    chainDecimal: POLYGON_CHAIN_DECIMAL,
    chainName: 'Polygon',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://polygon-bor-rpc.publicnode.com'],
    blockExplorerUrls: ['https://polygonscan.com'],
    tokenAddress: POLYGON_USDT_ADDRESS,
    tokenSymbol: 'USDT',
    tokenDecimals: STABLECOIN_DECIMALS,
    crowdDropAddress: POLYGON_CROWDDROP_ADDRESS,
    reusableAllowanceUnits: REUSABLE_ALLOWANCE_UNITS,
    requiresAllowanceReset: true,
    eventFromBlock: 92_643_155,
    minGoal: 2,
    maxGoal: 1000,
    minDurationSeconds: 60 * 60,
    maxDurationSeconds: 90 * 24 * 60 * 60,
  },
} as const

/** Product UI is Polygon CrowdDrop + USDT. Sepolia remains available only under /dev. */
export const ACTIVE_CROWDDROP_NETWORK_ID = 'polygonUsdt' as const
export const activeCrowdDropNetwork = CROWDDROP_NETWORKS[ACTIVE_CROWDDROP_NETWORK_ID]
