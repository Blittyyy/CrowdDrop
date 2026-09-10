export const POLYGON_CHAIN_ID = 137
export const POLYGON_CROWDDROP_ADDRESS = '0xCd9fAa04F12B3BcF926359057e1Ff445E7e75c12' as const

export const AUTH_TEST_ACTION = 'auth_test'
export const SELLER_UPLOAD_ACTION = 'seller_upload'
export const PRODUCT_DOWNLOAD_ACTION = 'product_download'

export const AUTH_CHALLENGE_TTL_SECONDS = 5 * 60
export const SELLER_SESSION_TTL_SECONDS = 30 * 60
/** Short-lived private asset download URL (seconds). */
export const PRODUCT_DOWNLOAD_URL_TTL_SECONDS = 5 * 60

/** Digital Products V1 upload limits (server-authoritative). */
export const MAX_COVER_BYTES = 2 * 1024 * 1024
export const MAX_ASSET_BYTES = 25 * 1024 * 1024
export const COVER_MAX_BYTES = MAX_COVER_BYTES
export const ASSET_MAX_BYTES = MAX_ASSET_BYTES

export const MAX_ACTIVE_UPLOAD_INTENTS_PER_WALLET = 3
export const MAX_UPLOAD_INTENTS_PER_WALLET_PER_HOUR = 5
export const MAX_UPLOAD_INTENTS_PER_IP_PER_HOUR = 10

export const UPLOAD_INTENT_TTL_MINUTES = 60
export const UPLOAD_INTENT_TTL_SECONDS = UPLOAD_INTENT_TTL_MINUTES * 60

export const PRODUCT_COVER_BUCKET = 'product-covers'
export const PRODUCT_ASSET_BUCKET = 'product-assets'

export const SESSION_COOKIE_NAME = 'crowddrop_seller_upload'
/** HttpOnly buyer product-download access (scoped per Drop). */
export const BUYER_ACCESS_COOKIE_NAME = 'crowddrop_buyer_access'
/** Purchaser access session lifetime — re-sign only after this expires. */
export const BUYER_ACCESS_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

export const TITLE_MAX_LENGTH = 80
export const DESCRIPTION_MAX_LENGTH = 500

export const CLEANUP_SECRET_ENV = 'CROWDDROP_CLEANUP_SECRET'
