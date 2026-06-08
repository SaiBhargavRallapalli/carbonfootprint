'use strict';

const { AVERAGES } = require('../data/carbonData');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const DEMO_RESPONSE  = "I'm EcoSage, your AI carbon coach! (Running in demo mode — add your GEMINI_API_KEY to enable full AI responses.) Ask me anything about your carbon footprint, and I'll help you reduce it with personalized, data-driven advice.";

/**
 * Build the system instruction that injects the user's carbon profile into every Gemini call.
 * @param {{ totals: Object, grandTotal: number, topCat: string, recentActivities: Array }} profile
 */
function buildCarbonSystemPrompt(profile) {
  const { totals = {}, grandTotal = 0, topCat = 'unknown', recentActivities = [] } = profile;
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

/**
 * Send a chat turn to Gemini and return the text response.
 * @param {string} userMessage
 * @param {Array<{ role: 'user'|'model', parts: [{text: string}] }>} history - prior conversation turns
 * @param {Object} profile - user's carbon profile for system prompt injection
 * @returns {Promise<string>}
 */
async function chat(userMessage, history = [], profile = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return DEMO_RESPONSE;

  const systemInstruction = buildCarbonSystemPrompt(profile);

  const contents = [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 512,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

/**
 * Generate 3 personalised weekly tips based on the user's top emission category.
 * @param {Object} profile
 * @returns {Promise<string[]>}
 */
async function generateTips(profile) {
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
    generationConfig: { temperature: 0.5, maxOutputTokens: 256 },
  };

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini tips error ${res.status}`);

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    const tips = JSON.parse(cleaned);
    if (Array.isArray(tips) && tips.length > 0) return tips.slice(0, 3);
  } catch (_) { /* fall through */ }
  return [cleaned]; // return raw text as single tip if JSON parse fails
}

module.exports = { chat, generateTips, buildCarbonSystemPrompt };
