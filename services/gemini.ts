import { AVERAGES } from '../data/carbonData';
import type { CarbonProfile, GeminiContent } from '../types';

const GEMINI_MODEL   = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-latest';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const DEMO_RESPONSE  = "I'm EcoSage, your AI carbon coach! (Running in demo mode — add your GEMINI_API_KEY to enable full AI responses.) Ask me anything about your carbon footprint, and I'll help you reduce it with personalised, data-driven advice.";

export function buildCarbonSystemPrompt(profile: Partial<CarbonProfile>): string {
  const { totals = { transport: 0, energy: 0, food: 0, shopping: 0, waste: 0 }, grandTotal = 0, topCat = 'unknown', recentActivities = [] } = profile;
  const indiaDiff = grandTotal - AVERAGES.india_monthly;
  const diffLabel = indiaDiff >= 0
    ? `${indiaDiff.toFixed(1)} kg ABOVE`
    : `${Math.abs(indiaDiff).toFixed(1)} kg BELOW`;

  const recentList = recentActivities.slice(0, 10)
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

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const res = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
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

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 256, responseMimeType: 'application/json' },
  };

  const res = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini tips error ${res.status}`);

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  const tryParse = (s: string): string[] | null => {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) return (parsed as string[]).slice(0, 3);
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

  // 3. Model returned plain text (numbered list / bullets) — split into tip lines
  const lines = cleaned.split('\n')
    .map(l => l.replace(/^[\s\d\-\*•·]+\.?\s*/, '').trim())
    .filter(l => l.length >= 20);
  if (lines.length >= 3) return lines.slice(0, 3);

  throw new Error('Could not extract tips array from Gemini response');
}
