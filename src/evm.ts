import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  numberToHex,
  type Abi,
  type Hex,
} from 'viem'
import { crowdDropAbi } from './crowdDropAbi'
import { activeCrowdDropNetwork } from './escrowConfig'
import { formatChainId, getEthereumProvider, isUnrecognizedChainError } from './wallet'
import { requestSendTransaction } from './txRequest'

export type RpcReceipt = {
  status: Hex | number | string | null
  logs: Array<{
    address: Hex
    data: Hex
    topics: Hex[]
  }>
}

/** Read-only JSON-RPC against the active CrowdDrop public RPC(s). No wallet / eth_accounts. */
export async function publicRpc(method: string, params: unknown[] = []): Promise<unknown> {
  const urls = activeCrowdDropNetwork.rpcUrls
  if (!urls.length)
    throw new Error(`No public RPC configured for ${activeCrowdDropNetwork.chainName}.`)

  let lastError: unknown
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
      })
      if (!response.ok)
        throw new Error(`Public RPC HTTP ${response.status}`)
      const payload = await response.json() as {
        result?: unknown
        error?: { message?: string, code?: number }
      }
      if (payload.error)
        throw new Error(payload.error.message || `Public RPC error ${payload.error.code ?? ''}`.trim())
      return payload.result
    }
    catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Public RPC request failed.')
}

export async function readChainHex(): Promise<string> {
  const provider = getEthereumProvider()
  const raw = await provider.request({ method: 'eth_chainId' }) as string
  return formatChainId(raw).hex
}

export async function connectedAccount(): Promise<string | null> {
  const provider = getEthereumProvider()
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[]
  return accounts[0] ?? null
}

export async function requestAccount(): Promise<string> {
  const provider = getEthereumProvider()
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
  const from = accounts[0]
  if (!from)
    throw new Error('No EVM address available.')
  return from
}

export async function ethBlockNumber(): Promise<bigint> {
  const raw = await publicRpc('eth_blockNumber') as string
  return BigInt(raw)
}

export async function ethGetLogs(filter: {
  address: string
  topics: readonly (string | null)[]
  fromBlock: bigint
  toBlock: bigint
}): Promise<Array<{ data: Hex, topics: Hex[] }>> {
  /** PublicNode Polygon caps range below 10k blocks. */
  const chunk = 9999n
  const logs: Array<{ data: Hex, topics: Hex[] }> = []
  let start = filter.fromBlock
  while (start <= filter.toBlock) {
    const end = start + chunk - 1n < filter.toBlock ? start + chunk - 1n : filter.toBlock
    try {
      const part = await publicRpc('eth_getLogs', [{
        address: filter.address,
        topics: [...filter.topics],
        fromBlock: numberToHex(start),
        toBlock: numberToHex(end),
      }]) as Array<{ data: Hex, topics: Hex[] }>
      logs.push(...(part ?? []))
    }
    catch (error) {
      // Pruned / unavailable history: skip this chunk and keep scanning forward.
      if (isRecoverableLogQueryError(error)) {
        /* continue */
      }
      else {
        throw error
      }
    }
    start = end + 1n
  }
  return logs
}

/** Pruned history or block-range limits — safe to skip the chunk and continue scanning. */
export function isRecoverableLogQueryError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message)
      : String(error)
  const lower = message.toLowerCase()
  return lower.includes('history has been pruned')
    || lower.includes('pruned')
    || lower.includes('exceed maximum block range')
    || lower.includes('block range')
    || lower.includes('query returned more than')
}

export async function ethCall(to: string, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<Hex> {
  const data = encodeFunctionData({
    abi,
    functionName: functionName as never,
    args: args as never,
  })
  return await publicRpc('eth_call', [{ to, data }, 'latest']) as Hex
}

export function decodeCall<T>(abi: Abi, functionName: string, data: Hex): T {
  return decodeFunctionResult({
    abi,
    functionName: functionName as never,
    data,
  }) as T
}

export async function sendTx(
  to: string,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  options?: { signal?: AbortSignal },
): Promise<string> {
  const network = activeCrowdDropNetwork
  if (!network.crowdDropAddress)
    throw new Error(`CrowdDrop is not configured for ${network.chainName}.`)
  const chainHex = await readChainHex()
  if (chainHex !== network.chainId)
    throw new Error(`Wallet is not on ${network.chainName}.`)
  if (
    (functionName === 'join' || functionName === 'withdraw' || functionName === 'claim' || functionName === 'createDrop')
    && to.toLowerCase() !== network.crowdDropAddress.toLowerCase()
  )
    throw new Error('Refusing to send this transaction to an unexpected contract.')
  if (functionName === 'approve' && args[0] && String(args[0]).toLowerCase() !== network.crowdDropAddress.toLowerCase())
    throw new Error('Refusing to approve a spender other than CrowdDrop.')

  const provider = getEthereumProvider()
  const from = await requestAccount()
  const data = encodeFunctionData({
    abi,
    functionName: functionName as never,
    args: args as never,
  })
  const confirmed = await readChainHex()
  if (confirmed !== network.chainId)
    throw new Error(`Wallet is not on ${network.chainName}.`)
  return await requestSendTransaction(provider, { from, to, data }, { signal: options?.signal })
}

export async function waitForReceipt(hash: string, timeoutMs = 120_000): Promise<RpcReceipt> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash))
    throw new Error('Missing transaction hash.')
  const provider = getEthereumProvider()
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [hash],
    }) as RpcReceipt | null
    if (receipt) {
      const status = receipt.status
      const failed = status === '0x0' || status === 0 || status === '0'
      if (failed)
        throw new Error('Transaction failed on-chain.')
      return receipt
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  throw new Error('Timed out waiting for the transaction to confirm.')
}

export function dropIdFromCreateReceipt(receipt: RpcReceipt, crowdDropAddress: string): bigint {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== crowdDropAddress.toLowerCase())
      continue
    try {
      const decoded = decodeEventLog({
        abi: crowdDropAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: 'DropCreated',
      })
      return decoded.args.dropId
    }
    catch {
      continue
    }
  }
  throw new Error('Could not read drop ID from the create transaction.')
}

export async function switchToChain(chain: {
  chainId: string
  chainName: string
  nativeCurrency: { name: string, symbol: string, decimals: number }
  rpcUrls: readonly string[]
  blockExplorerUrls: readonly string[]
}): Promise<void> {
  const provider = getEthereumProvider()
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainId }],
    })
  }
  catch (error) {
    const current = await readChainHex().catch(() => null)
    if (current === chain.chainId)
      return
    if (!isUnrecognizedChainError(error))
      throw error
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chain.chainId,
        chainName: chain.chainName,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: [...chain.rpcUrls],
        blockExplorerUrls: [...chain.blockExplorerUrls],
      }],
    })
  }
  const confirmed = await readChainHex()
  if (confirmed !== chain.chainId)
    throw new Error(`Wallet is still not on ${chain.chainName}.`)
}
