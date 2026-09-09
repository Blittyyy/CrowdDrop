/** Minimal CrowdDrop ABI for server-side finalize verification (Polygon). */
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
