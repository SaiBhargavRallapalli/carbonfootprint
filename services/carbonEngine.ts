import { EMISSION_FACTORS, AVERAGES } from '../data/carbonData';
import { EXCELLENT_THRESHOLD_FACTOR } from '../constants';
import type {
  Category, CO2Result, AggregateResult, CategoryTotals, ComparisonResult, Activity,
} from '../types';

export function calculateCO2(category: string, type: string, quantity: number): CO2Result {
  if (!category || !type) throw new Error('category and type are required');
  if (typeof quantity !== 'number' || quantity < 0) throw new Error('quantity must be a non-negative number');

  const categoryFactors = EMISSION_FACTORS[category as Category];
  if (!categoryFactors) throw new Error(`Unknown category: ${category}`);

  const entry = categoryFactors[type];
  if (!entry) throw new Error(`Unknown type '${type}' in category '${category}'`);

  const co2 = parseFloat((entry.factor * quantity).toFixed(3));
  return { co2, unit: entry.unit, label: entry.label };
}

export function aggregateByCategory(activities: Activity[]): AggregateResult {
  const totals: CategoryTotals = { transport: 0, energy: 0, food: 0, shopping: 0, waste: 0 };

  for (const act of activities) {
    if (act.category in totals) {
      totals[act.category as Category] += act.co2;
    }
  }

  for (const cat of Object.keys(totals) as Category[]) {
    totals[cat] = parseFloat(totals[cat].toFixed(2));
  }

  const grandTotal = parseFloat(
    Object.values(totals).reduce((s, v) => s + v, 0).toFixed(2),
  );
  return { totals, grandTotal };
}

export function compareToAverages(monthlyKg: number): ComparisonResult {
  const india_diff_pct  = parseFloat((((monthlyKg - AVERAGES.india_monthly)  / AVERAGES.india_monthly)  * 100).toFixed(1));
  const global_diff_pct = parseFloat((((monthlyKg - AVERAGES.global_monthly) / AVERAGES.global_monthly) * 100).toFixed(1));
  const paris_diff_pct  = parseFloat((((monthlyKg - AVERAGES.paris_monthly)  / AVERAGES.paris_monthly)  * 100).toFixed(1));

  let rating: ComparisonResult['rating'];
  if (monthlyKg <= AVERAGES.india_monthly * EXCELLENT_THRESHOLD_FACTOR) rating = 'excellent';
  else if (monthlyKg <= AVERAGES.india_monthly)  rating = 'good';
  else if (monthlyKg <= AVERAGES.paris_monthly)  rating = 'average';
  else                                            rating = 'high';

  return { india_diff_pct, global_diff_pct, paris_diff_pct, rating };
}

export function topCategory(totals: CategoryTotals): string {
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  if (entries.length === 0) return 'none';
  return entries.reduce((max, cur) => cur[1] > max[1] ? cur : max)[0];
}
