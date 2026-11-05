const meResponseCache = new Map<string, { at: number; body: unknown }>();

export const ME_CACHE_MS = 15_000;

export function getMeCached(cacheKey: string) {
  return meResponseCache.get(cacheKey);
}

export function setMeCached(cacheKey: string, body: unknown) {
  meResponseCache.set(cacheKey, { at: Date.now(), body });
}

export function invalidateMeCacheForUser(userId: string) {
  for (const key of [...meResponseCache.keys()]) {
    if (key.startsWith(`${userId}:`)) meResponseCache.delete(key);
  }
}
