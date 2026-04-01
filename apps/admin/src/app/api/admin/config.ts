/**
 * Shared config for admin API proxy routes.
 * Resolves the backend base URL with precedence:
 *   API_URL → NEXT_PUBLIC_API_URL → http://localhost:3000
 *
 * NEXT_PUBLIC_API_URL is a supported server-side fallback so deployments that
 * only set the public var (e.g. Vercel) don't need a separate API_URL secret.
 */
export const ADMIN_API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3000';

export const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
