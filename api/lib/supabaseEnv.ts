export const SUPABASE_URL_ENV = 'SUPABASE_URL'
export const SUPABASE_SERVICE_ROLE_KEY_ENV = 'SUPABASE_SERVICE_ROLE_KEY'

/** Env var names that must never appear in the Vite client bundle. */
export const FORBIDDEN_CLIENT_ENV_KEYS = [
  SUPABASE_SERVICE_ROLE_KEY_ENV,
  'SUPABASE_SERVICE_ROLE',
  'SERVICE_ROLE_KEY',
] as const

export type SupabaseEnvResult =
  | { ok: true, url: string, serviceRoleKey: string }
  | { ok: false, error: 'supabase_not_configured', missing: string[] }

export function readSupabaseEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseEnvResult {
  const missing: string[] = []
  const url = env[SUPABASE_URL_ENV]?.trim() ?? ''
  const serviceRoleKey = env[SUPABASE_SERVICE_ROLE_KEY_ENV]?.trim() ?? ''

  if (!url)
    missing.push(SUPABASE_URL_ENV)
  if (!serviceRoleKey)
    missing.push(SUPABASE_SERVICE_ROLE_KEY_ENV)

  if (missing.length > 0) {
    return {
      ok: false,
      error: 'supabase_not_configured',
      missing,
    }
  }

  return { ok: true, url, serviceRoleKey }
}

export function formatSupabaseConfigError(result: Extract<SupabaseEnvResult, { ok: false }>): string {
  return `Missing Supabase configuration: ${result.missing.join(', ')}`
}
