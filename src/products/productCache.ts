import {
  fetchProductByDrop,
  type PublicProductMetadata,
} from './finalizeClient.ts'

const cache = new Map<string, PublicProductMetadata | null>()
const inflight = new Map<string, Promise<PublicProductMetadata | null>>()

export function clearProductByDropCache(): void {
  cache.clear()
  inflight.clear()
}

export async function getCachedProductByDrop(
  dropId: string,
  options: { fetchImpl?: typeof fetch, force?: boolean } = {},
): Promise<PublicProductMetadata | null> {
  const key = String(dropId)
  if (!options.force && cache.has(key))
    return cache.get(key) ?? null

  const existing = inflight.get(key)
  if (existing && !options.force)
    return existing

  const promise = fetchProductByDrop(key, { fetchImpl: options.fetchImpl })
    .then((product) => {
      cache.set(key, product)
      inflight.delete(key)
      return product
    })
    .catch(() => {
      cache.set(key, null)
      inflight.delete(key)
      return null
    })

  inflight.set(key, promise)
  return promise
}

export async function loadProductsForDropIds(
  dropIds: string[],
  options: { fetchImpl?: typeof fetch } = {},
): Promise<Map<string, PublicProductMetadata>> {
  const unique = [...new Set(dropIds.map(String))]
  await Promise.all(unique.map(id => getCachedProductByDrop(id, options)))
  const out = new Map<string, PublicProductMetadata>()
  for (const id of unique) {
    const product = cache.get(id)
    if (product)
      out.set(id, product)
  }
  return out
}
