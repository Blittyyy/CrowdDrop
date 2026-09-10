import {
  CROWDDROP_DURATION_OPTIONS,
} from '../escrowConfig.ts'
import { ensureLeadingZeroAmount } from '../tokenMath.ts'

/** Matches brand-new Create form defaults in CrowdDropCreate.vue. */
export const DEFAULT_CREATE_CONTRIBUTION = '1'
export const DEFAULT_CREATE_GOAL = '2'
export const DEFAULT_CREATE_DURATION_SECONDS = CROWDDROP_DURATION_OPTIONS[2].seconds

export type CreateFormFieldState = {
  productTitle: string
  productDescription: string
  contributionInput: string
  goalInput: string
  durationSeconds: number
  /** True when a cover File is selected. */
  hasCoverFile: boolean
  /** True when a product File is selected. */
  hasAssetFile: boolean
  /** Cached draft id after successful product upload (reusable on retry). */
  draftId: string | null
  /** Product fingerprint tied to cached draft. */
  fingerprint: string | null
}

/** Immutable Created-screen snapshot — independent of future Create form state. */
export type CreatedResultSnapshot = {
  dropId: string
  createTxHash: string
  productTitle: string | null
  coverUrl: string | null
  fileTypeLabel: string | null
  contributionDisplay: string
  goalDisplay: string
  durationLabel: string
}

export function defaultCreateFormFields(): Pick<
  CreateFormFieldState,
  'productTitle' | 'productDescription' | 'contributionInput' | 'goalInput' | 'durationSeconds'
> {
  return {
    productTitle: '',
    productDescription: '',
    contributionInput: DEFAULT_CREATE_CONTRIBUTION,
    goalInput: DEFAULT_CREATE_GOAL,
    durationSeconds: DEFAULT_CREATE_DURATION_SECONDS,
  }
}

export function isCreateFormBlank(state: CreateFormFieldState): boolean {
  const defaults = defaultCreateFormFields()
  return (
    state.productTitle === defaults.productTitle
    && state.productDescription === defaults.productDescription
    && state.contributionInput === defaults.contributionInput
    && state.goalInput === defaults.goalInput
    && state.durationSeconds === defaults.durationSeconds
    && !state.hasCoverFile
    && !state.hasAssetFile
    && state.draftId === null
    && state.fingerprint === null
  )
}

export function durationLabelForSeconds(seconds: number): string {
  const option = CROWDDROP_DURATION_OPTIONS.find(o => o.seconds === seconds)
  return option?.label ?? CROWDDROP_DURATION_OPTIONS[0]?.label ?? ''
}

export function buildCreatedResultSnapshot(params: {
  dropId: string
  createTxHash: string
  productTitle: string | null
  coverUrl: string | null
  fileTypeLabel: string | null
  contributionInput: string
  goalInput: string
  durationSeconds: number
}): CreatedResultSnapshot {
  return {
    dropId: params.dropId,
    createTxHash: params.createTxHash,
    productTitle: params.productTitle,
    coverUrl: params.coverUrl,
    fileTypeLabel: params.fileTypeLabel,
    contributionDisplay: ensureLeadingZeroAmount(params.contributionInput),
    goalDisplay: params.goalInput,
    durationLabel: durationLabelForSeconds(params.durationSeconds),
  }
}

/**
 * Mark when Create form fields should be wiped for the next + New Drop.
 * Only after createDrop confirmed AND product finalize succeeded.
 */
export function shouldResetCreateFormAfterOutcome(outcome: {
  createDropConfirmed: boolean
  finalizeSucceeded: boolean
}): boolean {
  return outcome.createDropConfirmed && outcome.finalizeSucceeded
}
