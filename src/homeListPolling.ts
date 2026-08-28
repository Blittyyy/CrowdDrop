import type { DropSummary } from './dropCatalog'
import { shouldPollDrop } from './dropDetailPolling.ts'

/** True when any visible Home row can still change on-chain (joins, status, escrow). */
export function shouldPollHomeLists(summaries: Iterable<DropSummary>): boolean {
  for (const row of summaries) {
    if (shouldPollDrop(row.status, row.drop.escrowed))
      return true
  }
  return false
}

/** Dedupe rows shown across Community / Your Drops / Recent. */
export function uniqueSummariesById(...lists: DropSummary[][]): Map<string, DropSummary> {
  const byId = new Map<string, DropSummary>()
  for (const list of lists) {
    for (const row of list) {
      if (!byId.has(row.id))
        byId.set(row.id, row)
    }
  }
  return byId
}

/** IDs whose public counters may still change — candidates for a lightweight poll tick. */
export function pollableSummaryIds(...lists: DropSummary[][]): string[] {
  const ids: string[] = []
  for (const [id, row] of uniqueSummariesById(...lists)) {
    if (shouldPollDrop(row.status, row.drop.escrowed))
      ids.push(id)
  }
  return ids
}

/** Preserve wallet relation when merging a fresh public read into Home lists. */
export function mergePolledSummary(existing: DropSummary, fresh: DropSummary): DropSummary {
  return {
    ...fresh,
    relation: existing.relation ?? fresh.relation,
  }
}

export function patchSummaryList(rows: DropSummary[], id: string, next: DropSummary): DropSummary[] {
  const idx = rows.findIndex(row => row.id === id)
  if (idx === -1)
    return rows
  const copy = [...rows]
  copy[idx] = next
  return copy
}
