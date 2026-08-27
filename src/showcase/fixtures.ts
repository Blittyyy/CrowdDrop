/** Static fake data for /showcase only. No chain reads. */

export type FakeDrop = {
  id: string
  contributionUsdt: string
  joined: number
  goal: number
  spotsLeft: number
  remaining: string
  pooledUsdt: string
  status: 'Active' | 'Successful' | 'Expired' | 'Claimed'
  sellerShort: string
  relation?: 'seller' | 'joined'
}

export const SHOWCASE_WALLET = {
  network: 'Polygon',
  addressShort: '0xB028…af28',
  connected: true,
}

export const SELLER_SHORT = '0xB028…af28'
export const OTHER_SELLER_SHORT = '0x1984…871d'

export const DROP_ACTIVE: FakeDrop = {
  id: '14',
  contributionUsdt: '5',
  joined: 8,
  goal: 10,
  spotsLeft: 2,
  remaining: '3h 42m',
  pooledUsdt: '40',
  status: 'Active',
  sellerShort: OTHER_SELLER_SHORT,
}

export const DROP_YOURS: FakeDrop = {
  id: '12',
  contributionUsdt: '1',
  joined: 0,
  goal: 2,
  spotsLeft: 2,
  remaining: '11h 20m',
  pooledUsdt: '0',
  status: 'Active',
  sellerShort: SELLER_SHORT,
  relation: 'seller',
}

export const DROP_COMMUNITY_2: FakeDrop = {
  id: '13',
  contributionUsdt: '15',
  joined: 7,
  goal: 10,
  spotsLeft: 3,
  remaining: '5h 15m',
  pooledUsdt: '105',
  status: 'Active',
  sellerShort: OTHER_SELLER_SHORT,
}

export const DROP_SUCCESS: FakeDrop = {
  id: '14',
  contributionUsdt: '5',
  joined: 10,
  goal: 10,
  spotsLeft: 0,
  remaining: '',
  pooledUsdt: '50',
  status: 'Successful',
  sellerShort: OTHER_SELLER_SHORT,
}

export const DROP_CLAIMED: FakeDrop = {
  id: '14',
  contributionUsdt: '5',
  joined: 10,
  goal: 10,
  spotsLeft: 0,
  remaining: '',
  pooledUsdt: '50',
  status: 'Claimed',
  sellerShort: OTHER_SELLER_SHORT,
}

export const DROP_EXPIRED: FakeDrop = {
  id: '14',
  contributionUsdt: '5',
  joined: 6,
  goal: 10,
  spotsLeft: 4,
  remaining: '',
  pooledUsdt: '30',
  status: 'Expired',
  sellerShort: OTHER_SELLER_SHORT,
}

export const SHOWCASE_COMMUNITY: FakeDrop[] = [DROP_ACTIVE, DROP_COMMUNITY_2]
export const SHOWCASE_YOURS: FakeDrop[] = [DROP_YOURS]
export const SHOWCASE_RECENT: FakeDrop[] = [DROP_ACTIVE]

export const CREATE_DRAFT = {
  contribution: '5',
  goal: '10',
  duration: '4 hours',
}

export const CREATED_DROP = {
  id: '15',
  contributionUsdt: '5',
  goal: 10,
  duration: '4 hours',
  shareUrl: 'https://usecrowddrop.xyz/?drop=15',
}
