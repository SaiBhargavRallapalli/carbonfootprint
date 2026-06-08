'use strict';

// In-memory TTL cache — avoids redundant Firestore reads for aggregation endpoints.
// Not suitable for multi-instance deployments; acceptable for Cloud Run single-instance or demo.

const store = new Map();

/**
 * @param {string} key
 * @param {*} value
 * @param {number} ttlMs - time-to-live in milliseconds (default 30 s)
 */
function set(key, value, ttlMs = 30_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * @param {string} key
 * @returns {* | null} cached value or null if missing/expired
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function del(key) {
  store.delete(key);
}

function clear() {
  store.clear();
}

module.exports = { set, get, del, clear };
