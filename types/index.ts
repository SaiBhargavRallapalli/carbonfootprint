export interface EmissionFactor {
  factor: number;
  unit: string;
  label: string;
}

export type Category = 'transport' | 'energy' | 'food' | 'shopping' | 'waste';

export type EmissionFactors = Record<Category, Record<string, EmissionFactor>>;

export interface Averages {
  india_monthly: number;
  global_monthly: number;
  paris_monthly: number;
  india_annual: number;
  global_annual: number;
  paris_annual: number;
}

export interface Action {
  id: string;
  category: Category;
  title: string;
  description: string;
  impact_kg_month: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
}

export interface Activity {
  id?: string;
  category: Category;
  type: string;
  quantity: number;
  co2: number;
  unit: string;
  label: string;
  timestamp: number;
  createdAt?: { toDate: () => Date };
}

export type CategoryTotals = Record<Category, number>;

export interface AggregateResult {
  totals: CategoryTotals;
  grandTotal: number;
}

export interface ComparisonResult {
  india_diff_pct: number;
  global_diff_pct: number;
  paris_diff_pct: number;
  rating: 'excellent' | 'good' | 'average' | 'high';
}

export interface CO2Result {
  co2: number;
  unit: string;
  label: string;
}

export interface CarbonProfile {
  totals: CategoryTotals;
  grandTotal: number;
  topCat: string;
  recentActivities: Activity[];
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface LogActivityResult {
  id: string;
}

/**
 * Persistence boundary for activity data. Routes depend on this interface,
 * not on a concrete backend — so Firestore can be swapped for an in-memory
 * store (demo mode, tests) without touching any route code.
 */
export interface ActivityRepository {
  logActivity(sessionId: string, activity: Omit<Activity, 'id'>): Promise<LogActivityResult>;
  getHistory(sessionId: string, limitCount?: number): Promise<Activity[]>;
  getActivitiesSince(sessionId: string, since: Date): Promise<Activity[]>;
}

export interface GeminiContentPart {
  text: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiContentPart[];
}
