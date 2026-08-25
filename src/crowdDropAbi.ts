export const crowdDropAbi = [
  {
    type: 'function',
    name: 'createDrop',
    inputs: [
      { name: 'contribution', type: 'uint256' },
      { name: 'goal', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
    ],
    outputs: [{ name: 'dropId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'join',
    inputs: [{ name: 'dropId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'dropId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [{ name: 'dropId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
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
    name: 'depositOf',
    inputs: [
      { name: 'dropId', type: 'uint256' },
      { name: 'buyer', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
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
    name: 'token',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
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
  {
    type: 'event',
    name: 'Joined',
    inputs: [
      { name: 'dropId', type: 'uint256', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'nextDropId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export const DROP_STATUS_LABELS = ['Active', 'Successful', 'Expired', 'Claimed'] as const
export type DropStatusLabel = (typeof DROP_STATUS_LABELS)[number]
