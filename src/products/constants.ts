/** Frontend mirrors of server V1 product limits (server remains authoritative). */
export const PRODUCT_TITLE_MAX = 80
export const PRODUCT_DESCRIPTION_MAX = 500
export const PRODUCT_COVER_MAX_BYTES = 2 * 1024 * 1024
export const PRODUCT_ASSET_MAX_BYTES = 25 * 1024 * 1024

export const PRODUCT_COVER_ACCEPT = 'image/png,image/jpeg,image/webp'
export const PRODUCT_ASSET_ACCEPT = [
  'application/pdf',
  'application/zip',
  '.zip',
  '.docx',
  '.xlsx',
  'text/csv',
  'text/plain',
  'text/markdown',
  '.md',
  'image/png',
  'image/jpeg',
  'image/webp',
].join(',')

export const COVER_MIME_ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp'])
