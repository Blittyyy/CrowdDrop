import {
  formatSupabaseConfigError,
  readSupabaseEnv,
  type SupabaseEnvResult,
} from './supabaseEnv.js'

export type SupabaseServerClientResult =
  | { ok: true, client: unknown }
  | Extract<SupabaseEnvResult, { ok: false }>

let cachedClient: unknown = null
let cachedConfigKey: string | null = null

function configCacheKey(config: Extract<SupabaseEnvResult, { ok: true }>): string {
  return `${config.url}:${config.serviceRoleKey.length}`
}

/** Server-only Supabase admin client (service role). Never import from frontend code. */
export async function getSupabaseAdmin(): Promise<SupabaseServerClientResult> {
  const env = readSupabaseEnv()
  if (!env.ok)
    return env

  const key = configCacheKey(env)
  if (!cachedClient || cachedConfigKey !== key) {
    const { createClient } = await import('@supabase/supabase-js')
    cachedClient = createClient(env.url, env.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
    cachedConfigKey = key
  }

  return { ok: true, client: cachedClient }
}

export async function requireSupabaseAdmin(): Promise<unknown> {
  const result = await getSupabaseAdmin()
  if (!result.ok)
    throw new Error(formatSupabaseConfigError(result))
  return result.client
}

/** Reset cached client (tests only). */
export function resetSupabaseAdminCache(): void {
  cachedClient = null
  cachedConfigKey = null
}
