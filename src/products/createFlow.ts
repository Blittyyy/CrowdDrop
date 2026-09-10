/**
 * Pure create-flow stage labels and high-level ordering helpers for tests.
 */

export type CreateFlowStage =
  | 'idle'
  | 'preparing'
  | 'uploading_cover'
  | 'uploading_product'
  | 'creating_drop'
  | 'finishing'
  | 'recovery'
  | 'created'

export function stageLabel(stage: CreateFlowStage): string | null {
  switch (stage) {
    case 'preparing':
      return 'Preparing product…'
    case 'uploading_cover':
      return 'Uploading cover…'
    case 'uploading_product':
      return 'Uploading product…'
    case 'creating_drop':
      return 'Creating Drop…'
    case 'finishing':
    case 'recovery':
      return 'Finishing product setup…'
    default:
      return null
  }
}

export type CreateOrchestrationEvent =
  | 'validate'
  | 'auth'
  | 'upload'
  | 'create_tx'
  | 'finalize'

/**
 * Required production order. Used by tests to lock sequencing invariants.
 */
export const CREATE_ORCHESTRATION_ORDER: CreateOrchestrationEvent[] = [
  'validate',
  'auth',
  'upload',
  'create_tx',
  'finalize',
]

export function assertCreateOrder(events: CreateOrchestrationEvent[]): void {
  let expectedIndex = 0
  for (const event of events) {
    const wanted = CREATE_ORCHESTRATION_ORDER[expectedIndex]
    if (event !== wanted) {
      throw new Error(`Unexpected create order: got ${event}, expected ${wanted} at step ${expectedIndex}`)
    }
    expectedIndex += 1
  }
  if (expectedIndex !== CREATE_ORCHESTRATION_ORDER.length)
    throw new Error(`Incomplete create order: stopped at ${expectedIndex}`)
}

/** Whether createDrop may run given draft readiness. */
export function canSendCreateDrop(draftId: string | null | undefined): boolean {
  return typeof draftId === 'string' && /^[0-9a-f-]{36}$/i.test(draftId.trim())
}

export function recoveryBannerCopy(dropIdHint?: string | null): {
  title: string
  body: string
  retryLabel: string
} {
  const id = dropIdHint?.trim()
  return {
    title: id ? `Drop #${id} was created, but product setup needs to finish.` : 'Drop created, but product setup needs to finish.',
    body: 'Finishing product setup…',
    retryLabel: 'Retry setup',
  }
}
