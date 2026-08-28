import { decodeEventLog, encodeEventTopics, type Hex } from 'viem'
import { crowdDropAbi } from './crowdDropAbi'
import {
  currentParticipantsFromDeposits,
  resolveParticipantDeposits,
  uniqueJoinersInOrder,
} from './dropParticipants'
import { activeCrowdDropNetwork } from './escrowConfig'
import { decodeCall, ethBlockNumber, ethCall, ethGetLogs } from './evm'

async function logQueryRange(): Promise<{ start: bigint, latest: bigint }> {
  const network = activeCrowdDropNetwork
  const latest = await ethBlockNumber()
  const configured = BigInt(network.eventFromBlock)
  const start = configured > 0n && configured <= latest
    ? configured
    : (latest > 50_000n ? latest - 50_000n : 0n)
  return { start, latest }
}

function buyerFromJoinedLog(log: { data: Hex, topics: Hex[] }): `0x${string}` | null {
  try {
    const parsed = decodeEventLog({
      abi: crowdDropAbi,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
      eventName: 'Joined',
    })
    const buyer = parsed.args.buyer
    return buyer ? (buyer as `0x${string}`) : null
  }
  catch {
    return null
  }
}

/** Joined event candidates in log order (may include re-joins / withdrawn wallets). */
export async function joinedCandidateAddresses(dropId: bigint): Promise<string[]> {
  const network = activeCrowdDropNetwork
  if (!network.crowdDropAddress)
    return []

  const { start, latest } = await logQueryRange()
  const topics = encodeEventTopics({
    abi: crowdDropAbi,
    eventName: 'Joined',
    args: { dropId },
  })

  let logs: Array<{ data: Hex, topics: Hex[] }> = []
  try {
    logs = await ethGetLogs({
      address: network.crowdDropAddress,
      topics: topics as unknown as readonly (string | null)[],
      fromBlock: start,
      toBlock: latest,
    })
  }
  catch {
    // Unrecoverable log query — treat as no candidates (empty list, not an error).
    return []
  }

  const joinOrder: string[] = []
  for (const log of logs) {
    const buyer = buyerFromJoinedLog(log)
    if (buyer)
      joinOrder.push(buyer)
  }
  return joinOrder
}

/**
 * Public RPC: Joined logs for drop → unique order → depositOf > 0.
 * Drop status (Active / Expired / Successful / Claimed) does not gate reads.
 * Empty list is success — never an error.
 */
export async function loadCurrentParticipants(dropId: bigint): Promise<`0x${string}`[]> {
  const network = activeCrowdDropNetwork
  if (!network.crowdDropAddress)
    return []

  const joinOrder = await joinedCandidateAddresses(dropId)
  const candidates = uniqueJoinersInOrder(joinOrder)
  if (candidates.length === 0)
    return []

  const deposits = await resolveParticipantDeposits(candidates, async (address) => {
    const hex = await ethCall(
      network.crowdDropAddress,
      crowdDropAbi,
      'depositOf',
      [dropId, address],
    )
    return decodeCall<bigint>(crowdDropAbi, 'depositOf', hex)
  })

  return currentParticipantsFromDeposits(candidates, deposits)
}
