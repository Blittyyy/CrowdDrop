/** Minimal CrowdDrop ABI for server-side finalize / unlock verification (Polygon). */
export const crowdDropServerAbi = [
  {
    type: 'function',
    name: 'getDrop',
    inputs: [{ name: 'dropId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'seller', type: 'address' },
          { name: 'contribution', type: 'uint256' },
          { name: 'goal', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'buyerCount', type: 'uint256' },
          { name: 'escrowed', type: 'uint256' },
          { name: 'claimed', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'statusOf',
    inputs: [{ name: 'dropId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'depositOf',
    inputs: [
      { name: 'dropId', type: 'uint256' },
      { name: 'buyer', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'DropCreated',
    inputs: [
      { name: 'dropId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'contribution', type: 'uint256', indexed: false },
      { name: 'goal', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint256', indexed: false },
    ],
  },
] as const

export const CROWDDROP_MIN_GOAL = 2
export const CROWDDROP_MAX_GOAL = 1000

/** Mirrors DROP_STATUS_LABELS on the frontend: Active, Successful, Expired, Claimed */
export const DROP_STATUS = {
  Active: 0,
  Successful: 1,
  Expired: 2,
  Claimed: 3,
} as const
