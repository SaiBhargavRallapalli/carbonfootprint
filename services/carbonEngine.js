'use strict';

const { EMISSION_FACTORS, AVERAGES } = require('../data/carbonData');

/**
 * Calculate CO₂e (kg) for a logged activity.
 * @param {string} category - 'transport' | 'energy' | 'food' | 'shopping' | 'waste'
 * @param {string} type     - key within the category (e.g. 'petrol_car')
 * @param {number} quantity - amount in the activity's unit (km, kWh, meals, items…)
 * @returns {{ co2: number, unit: string, label: string }}
 */
function calculateCO2(category, type, quantity) {
  if (!category || !type) throw new Error('category and type are required');
  if (typeof quantity !== 'number' || quantity < 0) throw new Error('quantity must be a non-negative number');

  const categoryFactors = EMISSION_FACTORS[category];
  if (!categoryFactors) throw new Error(`Unknown category: ${category}`);

  const entry = categoryFactors[type];
  if (!entry) throw new Error(`Unknown type '${type}' in category '${category}'`);

  const co2 = parseFloat((entry.factor * quantity).toFixed(3));
  return { co2, unit: entry.unit, label: entry.label };
}

/**
 * Aggregate a list of activity records into per-category totals.
 * @param {Array<{ category: string, co2: number }>} activities
 * @returns {{ totals: Object, grandTotal: number }}
 */
function aggregateByCategory(activities) {
  const totals = { transport: 0, energy: 0, food: 0, shopping: 0, waste: 0 };
  for (const act of activities) {
    if (totals[act.category] !== undefined) {
      totals[act.category] += act.co2;
    }
  }
  // Round to 2dp
  for (const cat of Object.keys(totals)) {
    totals[cat] = parseFloat(totals[cat].toFixed(2));
  }
  const grandTotal = parseFloat(
    Object.values(totals).reduce((s, v) => s + v, 0).toFixed(2)
  );
  return { totals, grandTotal };
}

/**
 * Compare a monthly footprint value against Indian and global averages.
 * @param {number} monthlyKg
 * @returns {{ india_diff_pct: number, global_diff_pct: number, paris_diff_pct: number, rating: string }}
 */
function compareToAverages(monthlyKg) {
  const india_diff_pct  = parseFloat((((monthlyKg - AVERAGES.india_monthly)  / AVERAGES.india_monthly)  * 100).toFixed(1));
  const global_diff_pct = parseFloat((((monthlyKg - AVERAGES.global_monthly) / AVERAGES.global_monthly) * 100).toFixed(1));
  const paris_diff_pct  = parseFloat((((monthlyKg - AVERAGES.paris_monthly)  / AVERAGES.paris_monthly)  * 100).toFixed(1));

  let rating;
  if (monthlyKg <= AVERAGES.india_monthly * 0.5) rating = 'excellent';
  else if (monthlyKg <= AVERAGES.india_monthly)  rating = 'good';
  else if (monthlyKg <= AVERAGES.paris_monthly)  rating = 'average';
  else                                            rating = 'high';

  return { india_diff_pct, global_diff_pct, paris_diff_pct, rating };
}

/**
 * Find the biggest emission category from a totals object.
 * @param {{ transport: number, energy: number, food: number, shopping: number, waste: number }} totals
 * @returns {string}
 */
function topCategory(totals) {
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
}

module.exports = { calculateCO2, aggregateByCategory, compareToAverages, topCategory };
