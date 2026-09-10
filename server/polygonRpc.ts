import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  type Hex,
  type TransactionReceipt,
} from 'viem'
import { polygon } from 'viem/chains'
import {
  CROWDDROP_MAX_GOAL,
  CROWDDROP_MIN_GOAL,
  crowdDropServerAbi,
} from './crowdDropAbi.js'
import { POLYGON_CHAIN_ID, POLYGON_CROWDDROP_ADDRESS } from './crowdDropConstants.js'

const DEFAULT_POLYGON_RPC = 'https://polygon-bor-rpc.publicnode.com'

type RpcLogLike = {
  address: string
  data: Hex
  topics: [Hex, ...Hex[]] | [] | readonly Hex[]
}

export function polygonRpcUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.POLYGON_RPC_URL?.trim() || DEFAULT_POLYGON_RPC
}

export function createPolygonPublicClient(rpcUrl = polygonRpcUrl()) {
  return createPublicClient({
    chain: polygon,
    transport: http(rpcUrl),
  })
}

export function normalizeTxHash(value: string): Hex {
  const trimmed = value.trim().toLowerCase()
  if (!/^0x[a-f0-9]{64}$/.test(trimmed))
    throw new Error('Invalid transaction hash.')
  return trimmed as Hex
}

export type DropCreatedEventArgs = {
  dropId: bigint
  seller: `0x${string}`
  contribution: bigint
  goal: bigint
  deadline: bigint
}

export function extractDropCreatedEvent(
  receipt: TransactionReceipt,
  expectedContract: string = POLYGON_CROWDDROP_ADDRESS,
): DropCreatedEventArgs {
  const contract = expectedContract.toLowerCase()
  if (receipt.to?.toLowerCase() !== contract)
    throw new Error('Transaction was not sent to the CrowdDrop registry.')

  if (receipt.status !== 'success')
    throw new Error('Transaction failed on-chain.')

  const matches: DropCreatedEventArgs[] = []
  for (const raw of receipt.logs) {
    const log = raw as unknown as RpcLogLike
    if (log.address.toLowerCase() !== contract)
      continue
    if (!Array.isArray(log.topics) || log.topics.length === 0)
      continue
    try {
      const decoded = decodeEventLog({
        abi: crowdDropServerAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        eventName: 'DropCreated',
      })
      const args = decoded.args
      matches.push({
        dropId: args.dropId,
        seller: getAddress(args.seller),
        contribution: args.contribution,
        goal: args.goal,
        deadline: args.deadline,
      })
    }
    catch {
      // not a DropCreated log
    }
  }

  if (matches.length === 0)
    throw new Error('Transaction does not contain a DropCreated event.')
  if (matches.length > 1)
    throw new Error('Transaction contains multiple DropCreated events.')

  return matches[0]!
}

export type OnChainDrop = {
  dropId: bigint
  seller: `0x${string}`
  contribution: bigint
  goal: bigint
  deadline: bigint
  buyerCount: bigint
  escrowed: bigint
  claimed: boolean
}

type GetDropResult = {
  seller: `0x${string}`
  contribution: bigint
  goal: bigint
  deadline: bigint
  buyerCount: bigint
  escrowed: bigint
  claimed: boolean
}

export async function readOnChainDrop(
  dropId: bigint,
  options: {
    client?: ReturnType<typeof createPolygonPublicClient>
    contractAddress?: `0x${string}`
  } = {},
): Promise<OnChainDrop> {
  const client = options.client ?? createPolygonPublicClient()
  const address = options.contractAddress ?? POLYGON_CROWDDROP_ADDRESS

  // Cast avoids intermittent viem ReadContractParameters authorizationList friction under Vercel tsc.
  const drop = await (client.readContract as (args: unknown) => Promise<GetDropResult>)({
    address,
    abi: crowdDropServerAbi,
    functionName: 'getDrop',
    args: [dropId],
  })

  const seller = drop.seller
  if (!seller || seller === '0x0000000000000000000000000000000000000000')
    throw new Error('Drop does not exist on-chain.')

  return {
    dropId,
    seller: getAddress(seller),
    contribution: drop.contribution,
    goal: drop.goal,
    deadline: drop.deadline,
    buyerCount: drop.buyerCount,
    escrowed: drop.escrowed,
    claimed: drop.claimed,
  }
}

export function assertValidOnChainDrop(
  drop: OnChainDrop,
  expectedSeller: string,
): void {
  if (drop.seller.toLowerCase() !== expectedSeller.toLowerCase())
    throw new Error('On-chain Drop seller does not match authenticated seller.')
  if (drop.contribution <= 0n)
    throw new Error('On-chain contribution must be greater than zero.')
  if (drop.goal < BigInt(CROWDDROP_MIN_GOAL) || drop.goal > BigInt(CROWDDROP_MAX_GOAL))
    throw new Error('On-chain goal is outside contract bounds.')
  if (drop.deadline <= 0n)
    throw new Error('On-chain deadline is invalid.')
}

export async function readDropStatus(
  dropId: bigint,
  options: {
    client?: ReturnType<typeof createPolygonPublicClient>
    contractAddress?: `0x${string}`
  } = {},
): Promise<number> {
  const client = options.client ?? createPolygonPublicClient()
  const address = options.contractAddress ?? POLYGON_CROWDDROP_ADDRESS
  const status = await (client.readContract as (args: unknown) => Promise<number | bigint>)({
    address,
    abi: crowdDropServerAbi,
    functionName: 'statusOf',
    args: [dropId],
  })
  return Number(status)
}

export async function readDepositOf(
  dropId: bigint,
  buyer: `0x${string}`,
  options: {
    client?: ReturnType<typeof createPolygonPublicClient>
    contractAddress?: `0x${string}`
  } = {},
): Promise<bigint> {
  const client = options.client ?? createPolygonPublicClient()
  const address = options.contractAddress ?? POLYGON_CROWDDROP_ADDRESS
  const deposit = await (client.readContract as (args: unknown) => Promise<bigint>)({
    address,
    abi: crowdDropServerAbi,
    functionName: 'depositOf',
    args: [dropId, buyer],
  })
  return deposit
}

export async function fetchSuccessfulCreateReceipt(
  txHash: Hex,
  options: {
    client?: ReturnType<typeof createPolygonPublicClient>
  } = {},
): Promise<TransactionReceipt> {
  const client = options.client ?? createPolygonPublicClient()
  const receipt = await client.getTransactionReceipt({ hash: txHash })
  if (!receipt)
    throw new Error('Transaction receipt not found.')
  if (Number(client.chain?.id ?? POLYGON_CHAIN_ID) !== POLYGON_CHAIN_ID) {
    // client is always polygon in createPolygonPublicClient
  }
  return receipt
}
