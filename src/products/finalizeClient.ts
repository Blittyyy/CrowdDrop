export type FinalizeProductResult =
  | {
    ok: true
    productId: string
    dropId: string
    createTxHash: string
    contribution: string
    goal: number
    idempotent?: boolean
  }
  | { ok: false, reason: string, status?: number }

export async function finalizeProductDraftClient(
  params: { draftId: string, createTxHash: string },
  options: { fetchImpl?: typeof fetch } = {},
): Promise<FinalizeProductResult> {
  const fetchFn = options.fetchImpl ?? fetch
  const response = await fetchFn('/api/products/finalize', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      draftId: params.draftId,
      createTxHash: params.createTxHash,
    }),
  })
  const payload = await response.json() as Record<string, unknown>
  if (!response.ok || payload.ok !== true) {
    return {
      ok: false,
      reason: typeof payload.reason === 'string'
        ? payload.reason
        : 'Product setup could not finish.',
      status: response.status,
    }
  }

  return {
    ok: true,
    productId: String(payload.productId ?? ''),
    dropId: String(payload.dropId ?? ''),
    createTxHash: String(payload.createTxHash ?? params.createTxHash),
    contribution: String(payload.contribution ?? ''),
    goal: Number(payload.goal ?? 0),
    ...(payload.idempotent === true ? { idempotent: true } : {}),
  }
}

export type PublicProductMetadata = {
  id: string
  dropId: string
  title: string
  description: string
  coverUrl: string
  fileTypeLabel: string | null
  sellerWallet: string
}

export async function fetchProductByDrop(
  dropId: string | number,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<PublicProductMetadata | null> {
  const fetchFn = options.fetchImpl ?? fetch
  const response = await fetchFn(`/api/products/by-drop?dropId=${encodeURIComponent(String(dropId))}`, {
    method: 'GET',
    credentials: 'omit',
  })
  if (response.status === 404)
    return null
  if (!response.ok)
    throw new Error('Could not load product details.')
  const payload = await response.json() as {
    ok?: boolean
    product?: PublicProductMetadata
  }
  if (payload.ok !== true || !payload.product)
    throw new Error('Could not load product details.')

  // Hard guard: never surface private storage fields even if API regresses.
  const product = payload.product
  return {
    id: product.id,
    dropId: String(product.dropId),
    title: product.title,
    description: product.description,
    coverUrl: product.coverUrl,
    fileTypeLabel: product.fileTypeLabel ?? null,
    sellerWallet: product.sellerWallet,
  }
}
