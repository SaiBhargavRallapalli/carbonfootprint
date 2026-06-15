import { ACTIONS, AVERAGES } from '../data/carbonData';
import type { CarbonProfile, Category } from '../types';

/**
 * Deterministic, rule-based carbon advice.
 *
 * These pure functions are the graceful-degradation fallback for the Gemini
 * service: when the LLM is unavailable, rate-limited, or returns unparseable
 * output, the app still gives the user real, profile-aware guidance instead of
 * failing. They have no I/O and no external dependencies, so they are trivially
 * unit-testable and always available.
 */

const CATEGORY_LABEL: Record<string, string> = {
  transport: 'transport', energy: 'home energy', food: 'food',
  shopping: 'shopping', waste: 'waste', none: 'overall', unknown: 'overall',
};

/** Pick the highest-impact catalogue actions for a given category. */
function topActionsFor(category: string, limit: number): string[] {
  const matches = ACTIONS
    .filter(a => a.category === (category as Category))
    .sort((a, b) => b.impact_kg_month - a.impact_kg_month)
    .map(a => `${a.title} — ${a.description}`);

  if (matches.length >= limit) return matches.slice(0, limit);

  // Top category had few actions: top up with the highest-impact actions overall.
  const fallback = [...ACTIONS]
    .sort((a, b) => b.impact_kg_month - a.impact_kg_month)
    .map(a => `${a.title} — ${a.description}`);
  return [...new Set([...matches, ...fallback])].slice(0, limit);
}

/** Three actionable tips, prioritised by the user's biggest emission source. */
export function ruleBasedTips(profile: Partial<CarbonProfile>): string[] {
  const topCat = profile.topCat ?? 'none';
  if (topCat === 'none' || topCat === 'unknown') {
    return [
      'Log a few activities to unlock tips tailored to your biggest emission source.',
      'For most Indian households, home AC and petrol commutes are the largest contributors.',
      'Set your AC to 24°C and combine short trips — small habits compound over a month.',
    ];
  }
  return topActionsFor(topCat, 3);
}

/** A helpful, deterministic chat reply built from the user's actual profile. */
export function ruleBasedChatReply(profile: Partial<CarbonProfile>): string {
  const grandTotal = profile.grandTotal ?? 0;
  const topCat = profile.topCat ?? 'none';
  const label = CATEGORY_LABEL[topCat] ?? 'overall';
  const diff = grandTotal - AVERAGES.india_monthly;
  const vsAvg = diff >= 0
    ? `about ${diff.toFixed(0)} kg above`
    : `about ${Math.abs(diff).toFixed(0)} kg below`;

  const [firstTip] = ruleBasedTips(profile);
  const intro = grandTotal > 0
    ? `Your 30-day footprint is ${grandTotal.toFixed(1)} kg CO₂e — ${vsAvg} the Indian average of ${AVERAGES.india_monthly} kg. Your biggest source is ${label}.`
    : `You haven't logged much yet, so I can't see your footprint in detail.`;

  return `${intro} (AI coach is busy right now, so here's data-driven advice.) ${firstTip} Ask me again in a moment for a fuller, personalised answer.`;
}
