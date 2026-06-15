import { DEFAULT_LIMIT } from '../constants';
import type { Activity, ActivityRepository, LogActivityResult } from '../types';

/**
 * In-memory implementation of {@link ActivityRepository}.
 *
 * Used as the demo-mode fallback (when Firestore is unconfigured or
 * unavailable) and in tests. State lives in a per-instance Map keyed by
 * sessionId, so it is process-local and not durable — which is exactly what
 * demo mode wants. Not concurrency-safe; intended for single-process dev/test.
 */
export class MemoryRepository implements ActivityRepository {
  private readonly store = new Map<string, Activity[]>();
  private seq = 0;

  /** @param seed optional starting activities per session (used to seed demo data) */
  constructor(seed?: Record<string, Activity[]>) {
    if (seed) {
      for (const [sessionId, activities] of Object.entries(seed)) {
        this.store.set(sessionId, [...activities]);
      }
    }
  }

  logActivity(sessionId: string, activity: Omit<Activity, 'id'>): Promise<LogActivityResult> {
    const id = `mem-${++this.seq}`;
    const list = this.store.get(sessionId) ?? [];
    list.push({ id, ...activity });
    this.store.set(sessionId, list);
    return Promise.resolve({ id });
  }

  getHistory(sessionId: string, limitCount = DEFAULT_LIMIT): Promise<Activity[]> {
    const list = this.store.get(sessionId) ?? this.store.get('__demo__') ?? [];
    const sorted = [...list].sort((a, b) => b.timestamp - a.timestamp);
    return Promise.resolve(sorted.slice(0, limitCount));
  }

  getActivitiesSince(sessionId: string, since: Date): Promise<Activity[]> {
    const list = this.store.get(sessionId) ?? this.store.get('__demo__') ?? [];
    const cutoff = since.getTime();
    const filtered = list
      .filter(a => a.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
    return Promise.resolve(filtered);
  }
}

/** Sample activities served in demo mode so the dashboard is never empty. */
export function demoActivities(): Activity[] {
  const now = Date.now();
  const day = 86_400_000;
  return [
    { id: 'd1', category: 'transport', type: 'petrol_car',   quantity: 30, co2: 5.13, label: 'Petrol Car',                unit: 'km',      timestamp: now - day     },
    { id: 'd2', category: 'energy',    type: 'electricity',  quantity: 10, co2: 8.2,  label: 'Electricity (Indian grid)', unit: 'kWh',     timestamp: now - 2 * day },
    { id: 'd3', category: 'food',      type: 'chicken_meal', quantity:  3, co2: 3.78, label: 'Chicken Meal',              unit: 'meal',    timestamp: now - 3 * day },
    { id: 'd4', category: 'transport', type: 'metro',        quantity: 20, co2: 0.82, label: 'Metro / Local Train',       unit: 'km',      timestamp: now - 4 * day },
    { id: 'd5', category: 'food',      type: 'veg_meal',     quantity: 10, co2: 3.5,  label: 'Vegetarian Meal',           unit: 'meal',    timestamp: now - 5 * day },
  ];
}

/** A MemoryRepository pre-seeded with demo data under every session lookup. */
export function createDemoRepository(): MemoryRepository {
  return new MemoryRepository({ __demo__: demoActivities() });
}
