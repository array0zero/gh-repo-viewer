import { isRepository, type RepoResult } from './github';

export const TOKEN_KEY = 'gh-repo-viewer:token';
export const CACHE_KEY = 'gh-repo-viewer:cache:v1';
export const CACHE_TTL = 10 * 60 * 1000;

export function readToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}

export function saveToken(token: string): boolean {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    return true;
  } catch { return false; }
}

// Store a digest rather than duplicating the token in cache keys or values.
export async function cacheIdentity(username: string, token: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([username.toLowerCase(), token]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readCache(identity: string, now = Date.now()): RepoResult | null {
  try {
    const entry = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (!entry || entry.identity !== identity || !Number.isFinite(entry.savedAt)
      || now < entry.savedAt || now - entry.savedAt >= CACHE_TTL) return null;
    const data = entry.data;
    if (!data || !Array.isArray(data.repositories) || !data.repositories.every(isRepository)
      || ![data.remaining, data.reset].every(value => value === null || (typeof value === 'number' && Number.isFinite(value)))
      || typeof data.truncated !== 'boolean') return null;
    return data;
  } catch { return null; }
}

export function saveCache(identity: string, data: RepoResult): boolean {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ identity, savedAt: Date.now(), data })); return true; }
  catch { return false; }
}

export function clearCache(): boolean {
  try { localStorage.removeItem(CACHE_KEY); return true; } catch { return false; }
}
