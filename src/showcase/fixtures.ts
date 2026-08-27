/** Static fake data for /showcase only. No chain reads. */

export type FakeDrop = {
  id: string
  contributionUsdt: string
  joined: number
  goal: number
  spotsLeft: number
  remaining: string
  status: 'Active' | 'Successful' | 'Expired' | 'Claimed'
  relation?: 'seller' | 'joined'
}

export const SHOWCASE_WALLET = {
  network: 'Polygon',
  addressShort: '0xB028…af28',
  connected: true,
}

export const SHOWCASE_COMMUNITY: FakeDrop[] = [
  {
    id: '14',
    contributionUsdt: '5',
    joined: 8,
    goal: 10,
    spotsLeft: 2,
    remaining: '3h 42m',
    status: 'Active',
  },
  {
    id: '13',
    contributionUsdt: '15',
    joined: 7,
    goal: 10,
    spotsLeft: 3,
    remaining: '5h 15m',
    status: 'Active',
  },
]

export const SHOWCASE_YOURS: FakeDrop[] = [
  {
    id: '12',
    contributionUsdt: '1',
    joined: 0,
    goal: 2,
    spotsLeft: 2,
    remaining: '11h 20m',
    status: 'Active',
    relation: 'seller',
  },
]

export const SHOWCASE_RECENT: FakeDrop[] = [
  {
    id: '14',
    contributionUsdt: '5',
    joined: 8,
    goal: 10,
    spotsLeft: 2,
    remaining: '3h 42m',
    status: 'Active',
  },
]

export const SHOWCASE_EMPTY_RECENT: FakeDrop[] = []
