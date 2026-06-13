import type { CacheEntry } from '../types';

const store = new Map<string, CacheEntry<unknown>>();

export function set(key: string, value: unknown, ttlMs = 30_000): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function get<T = unknown>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function del(key: string): void {
  store.delete(key);
}

export function delByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function clear(): void {
  store.clear();
}
