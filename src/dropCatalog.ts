import { decodeEventLog, encodeEventTopics } from 'viem'
import { crowdDropAbi, DROP_STATUS_LABELS, type DropStatusLabel } from './crowdDropAbi'
import { activeCrowdDropNetwork } from './escrowConfig'
import { decodeCall, ethBlockNumber, ethCall, ethGetLogs } from './evm'
import { isUnknownDropError } from './userErrors'
import { sameAddress } from './wallet'

export type DropRecord = {
  seller: `0x${string}`
  contribution: bigint
  goal: bigint
  deadline: bigint
  buyerCount: bigint
  escrowed: bigint
  claimed: boolean
}

export type DropSummary = {
  id: string
  drop: DropRecord
  status: DropStatusLabel | 'Unknown'
  relation: 'seller' | 'joined' | null
}

const ZERO = '0x0000000000000000000000000000000000000000'
const NEXT_ID_FALLBACK_WINDOW = 50n

export function asDrop(decoded: DropRecord | readonly unknown[]): DropRecord {
  if (Array.isArray(decoded)) {
    return {
      seller: decoded[0] as `0x${string}`,
      contribution: decoded[1] as bigint,
      goal: decoded[2] as bigint,
      deadline: decoded[3] as bigint,
      buyerCount: decoded[4] as bigint,
      escrowed: decoded[5] as bigint,
      claimed: Boolean(decoded[6]),
    }
  }
  return decoded as DropRecord
}

export async function loadDropSummary(id: bigint): Promise<DropSummary | 'missing'> {
  const network = activeCrowdDropNetwork
  try {
    const dropHex = await ethCall(network.crowdDropAddress, crowdDropAbi, 'getDrop', [id])
    const drop = asDrop(decodeCall<DropRecord | readonly unknown[]>(crowdDropAbi, 'getDrop', dropHex))
    if (drop.seller.toLowerCase() === ZERO)
      return 'missing'
    const statusHex = await ethCall(network.crowdDropAddress, crowdDropAbi, 'statusOf', [id])
    const status = Number(decodeCall<bigint | number>(crowdDropAbi, 'statusOf', statusHex))
    return {
      id: id.toString(),
      drop,
      status: DROP_STATUS_LABELS[status] ?? 'Unknown',
      relation: null,
    }
  }
  catch (error) {
    if (isUnknownDropError(error))
      return 'missing'
    throw error
  }
}

function logDropId(log: { data: `0x${string}`, topics: `0x${string}`[] }, eventName: 'DropCreated' | 'Joined'): string | null {
  try {
    const parsed = decodeEventLog({
      abi: crowdDropAbi,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      eventName,
    })
    const dropId = parsed.args.dropId
    return dropId != null ? dropId.toString() : null
  }
  catch {
    return null
  }
}

async function logQueryRange(): Promise<{ start: bigint, latest: bigint }> {
  const network = activeCrowdDropNetwork
  const latest = await ethBlockNumber()
  const configured = BigInt(network.eventFromBlock)
  const start = configured > 0n && configured <= latest
    ? configured
    : (latest > 50_000n ? latest - 50_000n : 0n)
  return { start, latest }
}

async function eventDropIds(
  eventName: 'DropCreated' | 'Joined',
  account?: `0x${string}`,
): Promise<string[]> {
  const network = activeCrowdDropNetwork
  const { start, latest } = await logQueryRange()
  const topics = encodeEventTopics({
    abi: crowdDropAbi,
    eventName,
    args: account
      ? (eventName === 'DropCreated' ? { seller: account } : { buyer: account })
      : undefined,
  })
  const logs = await ethGetLogs({
    address: network.crowdDropAddress,
    topics: topics as unknown as readonly (string | null)[],
    fromBlock: start,
    toBlock: latest,
  })
  const ids: string[] = []
  const seen = new Set<string>()
  for (const log of logs) {
    const id = logDropId(log, eventName)
    if (!id || seen.has(id))
      continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function newestFirst(ids: string[]): string[] {
  return [...ids].sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : -1))
}

export const COMMUNITY_DROP_LIMIT = 40

function isCommunityDefaultStatus(status: DropSummary['status']): boolean {
  return status === 'Active' || status === 'Successful'
}

async function idsFromNextDropId(limit: bigint): Promise<string[]> {
  const network = activeCrowdDropNetwork
  const nextHex = await ethCall(network.crowdDropAddress, crowdDropAbi, 'nextDropId', [])
  const nextId = decodeCall<bigint>(crowdDropAbi, 'nextDropId', nextHex)
  const last = nextId > 1n ? nextId - 1n : 0n
  if (last === 0n)
    return []
  const first = last > limit ? last - limit + 1n : 1n
  const ids: string[] = []
  for (let id = last; id >= first; id--)
    ids.push(id.toString())
  return ids
}

export async function loadCommunityDrops(): Promise<DropSummary[]> {
  let ids: string[] = []
  try {
    ids = newestFirst(await eventDropIds('DropCreated'))
  }
  catch {
    ids = []
  }
  // Public RPCs often return an empty log set (without throwing) over large
  // block ranges. Fall back to nextDropId scanning so active Drops still appear.
  if (ids.length === 0) {
    try {
      ids = await idsFromNextDropId(BigInt(COMMUNITY_DROP_LIMIT))
    }
    catch {
      if (ids.length === 0)
        throw new Error('Could not discover community drops.')
    }
  }
  const candidates = newestFirst(ids).slice(0, COMMUNITY_DROP_LIMIT)
  const summaries: DropSummary[] = []
  for (const id of candidates) {
    const summary = await loadDropSummary(BigInt(id))
    if (summary === 'missing' || !isCommunityDefaultStatus(summary.status))
      continue
    summaries.push(summary)
  }
  return summaries
}

async function fallbackDropIds(account: string): Promise<{ sellerIds: string[], joinedIds: string[] }> {
  const network = activeCrowdDropNetwork
  const nextHex = await ethCall(network.crowdDropAddress, crowdDropAbi, 'nextDropId', [])
  const nextId = decodeCall<bigint>(crowdDropAbi, 'nextDropId', nextHex)
  const last = nextId > 1n ? nextId - 1n : 0n
  if (last === 0n)
    return { sellerIds: [], joinedIds: [] }
  const first = last > NEXT_ID_FALLBACK_WINDOW ? last - NEXT_ID_FALLBACK_WINDOW + 1n : 1n
  const sellerIds: string[] = []
  const joinedIds: string[] = []
  for (let id = last; id >= first; id--) {
    const summary = await loadDropSummary(id)
    if (summary === 'missing')
      continue
    if (sameAddress(summary.drop.seller, account))
      sellerIds.push(summary.id)
    const depositHex = await ethCall(
      network.crowdDropAddress,
      crowdDropAbi,
      'depositOf',
      [id, account],
    )
    const deposit = decodeCall<bigint>(crowdDropAbi, 'depositOf', depositHex)
    if (deposit > 0n)
      joinedIds.push(summary.id)
  }
  return { sellerIds, joinedIds }
}

export async function loadMyDrops(account: string): Promise<DropSummary[]> {
  const network = activeCrowdDropNetwork
  let sellerIds: string[] = []
  let joinedCandidateIds: string[] = []
  try {
    sellerIds = await eventDropIds('DropCreated', account as `0x${string}`)
    joinedCandidateIds = await eventDropIds('Joined', account as `0x${string}`)
  }
  catch {
    const fallback = await fallbackDropIds(account)
    sellerIds = fallback.sellerIds
    joinedCandidateIds = fallback.joinedIds
  }

  const unique = newestFirst([...new Set([...sellerIds, ...joinedCandidateIds])])

  const summaries: DropSummary[] = []
  for (const id of unique) {
    const summary = await loadDropSummary(BigInt(id))
    if (summary === 'missing')
      continue
    const isSeller = sameAddress(summary.drop.seller, account)
    let joined = false
    if (!isSeller) {
      const depositHex = await ethCall(
        network.crowdDropAddress,
        crowdDropAbi,
        'depositOf',
        [BigInt(id), account],
      )
      joined = decodeCall<bigint>(crowdDropAbi, 'depositOf', depositHex) > 0n
    }
    if (!isSeller && !joined)
      continue
    summaries.push({
      ...summary,
      relation: isSeller ? 'seller' : 'joined',
    })
  }
  return summaries
}
