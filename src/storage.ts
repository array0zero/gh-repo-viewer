import { isRepository, type RepoResult } from './github';

export const CACHE_KEY = 'gh-repo-viewer:cache:v2';
export const CACHE_TTL = 10 * 60 * 1000;

export function cacheIdentity(username: string): string {
  return username.trim().toLowerCase();
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
