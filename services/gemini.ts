import { AVERAGES } from '../data/carbonData';
import type { CarbonProfile, GeminiContent } from '../types';
import {
  GEMINI_CHAT_TEMPERATURE, GEMINI_CHAT_MAX_TOKENS,
  GEMINI_TIPS_TEMPERATURE, GEMINI_TIPS_MAX_TOKENS,
  MIN_TIP_LINE_LENGTH, MAX_TIPS_SLICED,
  MAX_RECENT_ACTIVITIES,
} from '../constants';

const GEMINI_MODEL   = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-latest';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const DEMO_RESPONSE  = "I'm EcoSage, your AI carbon coach! (Running in demo mode — add your GEMINI_API_KEY to enable full AI responses.) Ask me anything about your carbon footprint, and I'll help you reduce it with personalised, data-driven advice.";

type GeminiBody = Record<string, unknown>;
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

async function callGeminiApi(apiKey: string, body: GeminiBody): Promise<string> {
  const res = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }
  const data = await res.json() as GeminiResponse;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

export function buildCarbonSystemPrompt(profile: Partial<CarbonProfile>): string {
  const { totals = { transport: 0, energy: 0, food: 0, shopping: 0, waste: 0 }, grandTotal = 0, topCat = 'unknown', recentActivities = [] } = profile;
  const indiaDiff = grandTotal - AVERAGES.india_monthly;
  const diffLabel = indiaDiff >= 0
    ? `${indiaDiff.toFixed(1)} kg ABOVE`
    : `${Math.abs(indiaDiff).toFixed(1)} kg BELOW`;

  const recentList = recentActivities.slice(0, MAX_RECENT_ACTIVITIES)
    .map(a => `  • ${a.label || a.type} — ${a.quantity} ${a.unit || 'units'} → ${a.co2} kg CO₂e`)
    .join('\n') || '  (no activities logged yet)';

  return `You are EcoSage, a friendly and knowledgeable AI carbon footprint coach specialising in Indian users.

USER'S CARBON PROFILE (last 30 days):
- Total footprint: ${grandTotal} kg CO₂e  |  Indian monthly average: ${AVERAGES.india_monthly} kg
- Status: ${diffLabel} the Indian average
- Biggest emission source: ${topCat}
- Category breakdown:
    Transport: ${(totals.transport || 0).toFixed(1)} kg
    Energy:    ${(totals.energy    || 0).toFixed(1)} kg
    Food:      ${(totals.food      || 0).toFixed(1)} kg
    Shopping:  ${(totals.shopping  || 0).toFixed(1)} kg
    Waste:     ${(totals.waste     || 0).toFixed(1)} kg

Recent activities logged:
${recentList}

INSTRUCTIONS:
1. Always reference the user's actual numbers — never give generic tips that ignore their profile.
2. Name specific, quantified actions (e.g. "switching your 15 km daily commute from petrol car to metro saves ~33 kg CO₂/month").
3. Prioritise advice in their biggest emission category: "${topCat}".
4. Use Indian context: Indian electricity grid (0.82 kg/kWh), Indian transport modes (metro, auto, bus), Indian food patterns.
5. Be encouraging — acknowledge low-emission wins and streaks.
6. Keep responses concise (3-5 sentences for simple questions, up to 10 sentences for detailed analysis).
7. If asked about a calculation, show the working: quantity × emission factor = result.
8. Do NOT discuss politics, religion, or anything outside carbon/sustainability.`;
}

export async function chat(
  userMessage: string,
  history: GeminiContent[] = [],
  profile: Partial<CarbonProfile> = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return DEMO_RESPONSE;

  const systemInstruction = buildCarbonSystemPrompt(profile);
  const contents: GeminiContent[] = [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const body: GeminiBody = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { temperature: GEMINI_CHAT_TEMPERATURE, maxOutputTokens: GEMINI_CHAT_MAX_TOKENS },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  return callGeminiApi(apiKey, body);
}

export async function generateTips(profile: Partial<CarbonProfile>): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return [
      'Add your GEMINI_API_KEY to unlock personalised AI tips.',
      'Try switching short car trips to walking or cycling.',
      'Set your AC to 24°C — each degree higher saves ~6% energy.',
    ];
  }

  const systemInstruction = buildCarbonSystemPrompt(profile);
  const prompt = `Based on this user's carbon profile, provide exactly 3 short, actionable tips (one sentence each) to reduce their footprint this week. Focus on their biggest emission source. Return only a JSON array of 3 strings, no extra text.`;

  const body: GeminiBody = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: GEMINI_TIPS_TEMPERATURE, maxOutputTokens: GEMINI_TIPS_MAX_TOKENS, responseMimeType: 'application/json' },
  };

  const raw = await callGeminiApi(apiKey, body);
  const cleaned = raw.replace(/```json|```/g, '').trim();

  const tryParse = (s: string): string[] | null => {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) return (parsed as string[]).slice(0, MAX_TIPS_SLICED);
    } catch { /* continue */ }
    return null;
  };

  // 1. Direct JSON parse
  const direct = tryParse(cleaned);
  if (direct) return direct;

  // 2. Extract first [...] block (handles surrounding prose)
  const match = cleaned.match(/\[[\s\S]*\]/);
  const fromMatch = match ? tryParse(match[0]) : null;
  if (fromMatch) return fromMatch;

  // 3. Model returned plain text — split numbered/bulleted lines into tips
  const lines = cleaned.split('\n')
    .map(l => l.replace(/^[\s\d\-\*•·]+\.?\s*/, '').trim())
    .filter(l => l.length >= MIN_TIP_LINE_LENGTH);
  if (lines.length >= MAX_TIPS_SLICED) return lines.slice(0, MAX_TIPS_SLICED);

  throw new Error('Could not extract tips array from Gemini response');
}
