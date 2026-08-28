/**
 * Smoke-check product public Polygon RPC reads (no window.ethereum).
 */
import assert from 'node:assert/strict'
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeEventTopics,
  encodeFunctionData,
  numberToHex,
} from 'viem'
import { crowdDropAbi } from '../src/crowdDropAbi.ts'
import {
  currentParticipantsFromDeposits,
  uniqueJoinersInOrder,
} from '../src/dropParticipants.ts'
import {
  ACTIVE_CROWDDROP_NETWORK_ID,
  activeCrowdDropNetwork,
} from '../src/escrowConfig.ts'

assert.equal(ACTIVE_CROWDDROP_NETWORK_ID, 'polygonUsdt')
assert.ok(activeCrowdDropNetwork.rpcUrls.length > 0)

const rpcUrl = activeCrowdDropNetwork.rpcUrls[0]

function isRecoverableLogQueryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('history has been pruned')
    || lower.includes('pruned')
    || lower.includes('exceed maximum block range')
    || lower.includes('block range')
}

async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  assert.equal(response.ok, true, `RPC HTTP ${response.status}`)
  const payload = await response.json() as { result?: unknown, error?: { message?: string } }
  if (payload.error)
    throw new Error(payload.error.message || 'RPC error')
  return payload.result
}

async function ethGetLogsResilient(
  fromBlock: bigint,
  toBlock: bigint,
  topics: readonly (string | null)[],
): Promise<Array<{ data: `0x${string}`, topics: `0x${string}`[] }>> {
  const chunk = 9999n
  const logs: Array<{ data: `0x${string}`, topics: `0x${string}`[] }> = []
  let start = fromBlock
  while (start <= toBlock) {
    const end = start + chunk - 1n < toBlock ? start + chunk - 1n : toBlock
    try {
      const part = await rpc('eth_getLogs', [{
        address: activeCrowdDropNetwork.crowdDropAddress,
        topics: [...topics],
        fromBlock: numberToHex(start),
        toBlock: numberToHex(end),
      }]) as typeof logs
      logs.push(...(part ?? []))
    }
    catch (error) {
      if (!isRecoverableLogQueryError(error))
        throw error
    }
    start = end + 1n
  }
  return logs
}

const chainId = await rpc('eth_chainId') as string
assert.equal(chainId.toLowerCase(), activeCrowdDropNetwork.chainId.toLowerCase())

const blockHex = await rpc('eth_blockNumber') as string
const latest = BigInt(blockHex)
assert.ok(latest > 0n)

const data = encodeFunctionData({
  abi: crowdDropAbi,
  functionName: 'nextDropId',
  args: [],
})
const result = await rpc('eth_call', [{
  to: activeCrowdDropNetwork.crowdDropAddress,
  data,
}, 'latest']) as `0x${string}`
const nextId = decodeFunctionResult({
  abi: crowdDropAbi,
  functionName: 'nextDropId',
  data: result,
}) as bigint
assert.ok(nextId >= 1n)

// Expired Drop #3: participant load must succeed on public RPC (no wallet).
const dropId = 3n
const statusData = encodeFunctionData({ abi: crowdDropAbi, functionName: 'statusOf', args: [dropId] })
const statusRaw = await rpc('eth_call', [{
  to: activeCrowdDropNetwork.crowdDropAddress,
  data: statusData,
}, 'latest']) as `0x${string}`
const status = Number(decodeFunctionResult({ abi: crowdDropAbi, functionName: 'statusOf', data: statusRaw }))
assert.equal(status, 2, 'Drop #3 is Expired on Polygon')

const joinedTopics = encodeEventTopics({
  abi: crowdDropAbi,
  eventName: 'Joined',
  args: { dropId },
})
const start = BigInt(activeCrowdDropNetwork.eventFromBlock)
const joinedLogs = await ethGetLogsResilient(start, latest, joinedTopics as unknown as readonly (string | null)[])
assert.ok(joinedLogs.length >= 1, 'Drop #3 Joined logs found despite pruned history')

const joinOrder: string[] = []
for (const log of joinedLogs) {
  const parsed = decodeEventLog({
    abi: crowdDropAbi,
    data: log.data,
    topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    eventName: 'Joined',
  })
  joinOrder.push(String(parsed.args.buyer))
}

const candidates = uniqueJoinersInOrder(joinOrder)
const deposits = new Map<string, bigint>()
for (const address of candidates) {
  const depData = encodeFunctionData({
    abi: crowdDropAbi,
    functionName: 'depositOf',
    args: [dropId, address],
  })
  const depRaw = await rpc('eth_call', [{
    to: activeCrowdDropNetwork.crowdDropAddress,
    data: depData,
  }, 'latest']) as `0x${string}`
  const amount = decodeFunctionResult({
    abi: crowdDropAbi,
    functionName: 'depositOf',
    data: depRaw,
  }) as bigint
  deposits.set(address.toLowerCase(), amount)
}

const participants = currentParticipantsFromDeposits(candidates, deposits)
assert.equal(participants.length, 1, 'Drop #3 shows one wallet with active deposit')
assert.equal(
  participants[0]!.toLowerCase(),
  '0xb02862445f89ce966b1adaac06c21d013891af28',
  'Drop #3 participant is the joined buyer',
)
assert.equal(deposits.get(participants[0]!.toLowerCase()), 100_000n, 'Drop #3 deposit is 0.10 USDT')

console.log('publicRpc/dropCatalog: 12 checks passed (no wallet required)')
