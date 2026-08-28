/**
 * Cancellation / dismiss / missing-hash behavior for eth_sendTransaction UI.
 * No real chain calls.
 */
import assert from 'node:assert/strict'
import {
  isTxHash,
  isUserRejection,
  requireTxHash,
  requestSendTransaction,
  TxCancelledError,
} from '../src/txRequest.ts'

let passed = 0
function check(cond: unknown, msg: string) {
  assert.ok(cond, msg)
  passed += 1
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

// 1. Provider rejection codes / messages
check(isUserRejection({ code: 4001, message: 'User rejected the request.' }), '4001 rejection')
check(isUserRejection({ code: 'ACTION_REJECTED', message: 'rejected' }), 'ACTION_REJECTED')
check(isUserRejection(new Error('User dismissed the confirmation')), 'dismiss message')
check(isUserRejection(new TxCancelledError()), 'TxCancelledError')
check(isUserRejection({ message: 'user cancelled transaction' }), 'cancelled message')
check(!isUserRejection(new Error('insufficient funds for gas')), 'not cancel: gas')
check(!isUserRejection({ code: -32000, message: 'execution reverted' }), 'not cancel: revert')

// 2. Missing / invalid hash treated as cancellation
check(!isTxHash(undefined), 'undefined not hash')
check(!isTxHash(null), 'null not hash')
check(!isTxHash(''), 'empty not hash')
check(!isTxHash('0x1234'), 'short not hash')
check(isTxHash(`0x${'ab'.repeat(32)}`), 'valid hash')
assert.throws(() => requireTxHash(undefined), TxCancelledError)
assert.throws(() => requireTxHash(null), TxCancelledError)
assert.throws(() => requireTxHash('0xdead'), TxCancelledError)
passed += 3

// 3. Successful hash returned
{
  const hash = `0x${'11'.repeat(32)}`
  const provider = {
    request: async () => hash,
  } as EthereumProvider
  const result = await requestSendTransaction(provider, {
    from: '0xbcf16183Da0F9bd69d5882940Ea4cAD579d789B0',
    to: '0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12',
    data: '0x',
  }, { absoluteTimeoutMs: 5_000, dismissGraceMs: 50 })
  check(result === hash, 'successful hash returned')
}

// 4. Provider rejection clears as cancellation
{
  const provider = {
    request: async () => {
      throw { code: 4001, message: 'User rejected the request.' }
    },
  } as EthereumProvider
  await assert.rejects(
    () => requestSendTransaction(provider, { from: '0x1', to: '0x2', data: '0x' }, { absoluteTimeoutMs: 5_000 }),
    (err: unknown) => isUserRejection(err),
  )
  passed += 1
}

// 5. No hash / undefined → cancelled (pending UI must clear)
{
  const provider = {
    request: async () => undefined,
  } as EthereumProvider
  await assert.rejects(
    () => requestSendTransaction(provider, { from: '0x1', to: '0x2', data: '0x' }, { absoluteTimeoutMs: 5_000 }),
    (err: unknown) => err instanceof TxCancelledError && isUserRejection(err),
  )
  passed += 1
}

// 6. Absolute timeout while hanging → cancelled (retry possible)
{
  const provider = {
    request: () => new Promise(() => { /* never settles */ }),
  } as EthereumProvider
  const started = Date.now()
  await assert.rejects(
    () => requestSendTransaction(provider, { from: '0x1', to: '0x2', data: '0x' }, {
      absoluteTimeoutMs: 80,
      dismissGraceMs: 20,
    }),
    (err: unknown) => err instanceof TxCancelledError,
  )
  check(Date.now() - started < 2_000, 'timeout cancels promptly')
}

// 7. AbortSignal voids a hanging confirmation (Refresh recovery)
{
  const provider = {
    request: () => new Promise(() => { /* never settles */ }),
  } as EthereumProvider
  const ac = new AbortController()
  const pending = requestSendTransaction(provider, { from: '0x1', to: '0x2', data: '0x' }, {
    absoluteTimeoutMs: 30_000,
    signal: ac.signal,
  })
  await delay(20)
  ac.abort()
  await assert.rejects(
    () => pending,
    (err: unknown) => err instanceof TxCancelledError && isUserRejection(err),
  )
  passed += 1
}

// 8. Pre-aborted signal cancels immediately
{
  const provider = {
    request: () => new Promise(() => { /* never settles */ }),
  } as EthereumProvider
  const ac = new AbortController()
  ac.abort()
  await assert.rejects(
    () => requestSendTransaction(provider, { from: '0x1', to: '0x2', data: '0x' }, {
      absoluteTimeoutMs: 5_000,
      signal: ac.signal,
    }),
    (err: unknown) => err instanceof TxCancelledError,
  )
  passed += 1
}

// 9. App interaction after arm voids hanging send (Nimiq swipe-dismiss recovery)
{
  type Listener = EventListener
  const listeners = new Map<string, Set<Listener>>()
  const fakeDocument = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener(type: string, listener: Listener) {
      if (!listeners.has(type))
        listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? [])
        listener.call(fakeDocument, event)
      return true
    },
  }
  const previousDocument = globalThis.document
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: fakeDocument,
  })

  try {
    const provider = {
      request: () => new Promise(() => { /* never settles */ }),
    } as EthereumProvider
    const pending = requestSendTransaction(provider, { from: '0x1', to: '0x2', data: '0x' }, {
      absoluteTimeoutMs: 30_000,
      interactionArmMs: 30,
      dismissGraceMs: 20,
    })
    await delay(50)
    fakeDocument.dispatchEvent(new Event('pointerdown'))
    await assert.rejects(
      () => pending,
      (err: unknown) => err instanceof TxCancelledError && isUserRejection(err),
    )
    passed += 1
  }
  finally {
    if (previousDocument === undefined)
      Reflect.deleteProperty(globalThis, 'document')
    else
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        writable: true,
        value: previousDocument,
      })
  }
}

console.log(`txRequest: ${passed} checks passed`)
