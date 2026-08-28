import { isUserRejection } from '../txRequest'
import {
  serializeProviderTypedData,
  toProviderTypedDataPayload,
  type CrowdDropAuthTypedData,
} from './crowdDropAuthTypedData'

/** User dismissed / cancelled a wallet signing confirmation. */
export class SignCancelledError extends Error {
  readonly code = 4001
  constructor(message = 'Signature cancelled.') {
    super(message)
    this.name = 'SignCancelledError'
  }
}

const SIGNATURE_RE = /^0x[a-fA-F0-9]+$/

/**
 * Nimiq Pay eth_signTypedData_v4 parameter order (per Mini Apps docs):
 *   params: [address, JSON.stringify(typedData)]
 */
export async function requestSignTypedDataV4(
  provider: EthereumProvider,
  address: string,
  typedData: CrowdDropAuthTypedData,
): Promise<`0x${string}`> {
  const payload = toProviderTypedDataPayload(typedData)

  try {
    const raw = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [address, serializeProviderTypedData(payload)],
    })

    if (typeof raw !== 'string' || !SIGNATURE_RE.test(raw))
      throw new Error('Provider returned an invalid signature.')

    return raw as `0x${string}`
  }
  catch (error) {
    if (error instanceof SignCancelledError)
      throw error
    if (isUserRejection(error))
      throw new SignCancelledError()
    throw error
  }
}
