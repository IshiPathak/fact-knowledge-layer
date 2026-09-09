import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import pLimit from 'p-limit';

dotenv.config();


const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// gemini-flash-lite-latest: zero usage on dashboard, fast ~800ms responses
// 5 concurrent — Gemini Flash Lite has much higher RPM headroom than 3.6 Flash
const limit = pLimit(5);

const EXTRACTION_PROMPT = `
You are an expert financial and business analyst. Extract zero or more key facts from the provided text chunk.
Return the result strictly as a JSON object containing a single key "facts" which is an array of objects. Do not wrap the JSON in markdown code blocks or add any other text.
If no relevant facts are found, return { "facts": [] }.

Each fact object in the array must adhere exactly to this JSON schema:
{
  "subject": "The entity the fact is about (e.g. 'Delhivery Limited', 'India', 'RBI')",
  "attribute": "The specific metric or property being described (e.g. 'revenue from operations', 'real GDP growth')",
  "value": "The numerical or categorical value (e.g. '8142', '7.2')",
  "unit": "The unit of measurement if applicable (e.g. 'INR crore', '%'), otherwise null",
  "time_scope": "The time period or point in time (e.g. 'FY2024', 'Q4 FY24', 'as of March 31, 2024'), otherwise null",
  "qualifiers": { "basis": "consolidated", "source_context": "earnings presentation headline figure" },
  "fact_type": "A broad, emergent category (e.g. 'financial_metric', 'governance_status', 'macro_indicator')",
  "raw_quote": "A verbatim substring from the text chunk supporting this fact, strictly < 40 words",
  "confidence": 0.95
}

Rules for 'raw_quote':
- It must be a VERBATIM substring of the provided text.
- Do not paraphrase or alter the quote in any way.
- It must be continuous (no ellipses skipping text).
`;

// Kept for backward compatibility
export const limiter = {
  acquire: async () => {}
};

function parseJsonSafe(text: string): any {
  // Strip markdown code fences if model wraps response
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return {};
  }
}

async function callGemini(systemPrompt: string, userContent: string, maxRetries = 5): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `${systemPrompt}\n\n${userContent}`,
        config: { temperature: 0, maxOutputTokens: 1024 }
      });
      return response.text ?? '';
    } catch (err: any) {
      const msg = err?.message || String(err);
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded');
      if (is429 && attempt < maxRetries) {
        let delayMs = 3500 * attempt;
        const match = msg.match(/retry in ([0-9.]+)s/i);
        if (match) {
          delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 800;
        }
        console.warn(`Gemini 429 quota reached (attempt ${attempt}/${maxRetries}), waiting ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  return '';
}

export function callGroqWithRetry<T = any>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  return limit(async () => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('tokens per day') || msg.includes('TPD')) throw err;
        const isRateLimit = err?.status === 429 || msg.includes('rate_limit') || msg.includes('TPM') || msg.includes('OTPM');
        if (isRateLimit && attempt < maxRetries) {
          const wait = 4000 * attempt;
          console.warn(`Rate limit (attempt ${attempt}/${maxRetries}), backing off ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        throw err;
      }
    }
    throw new Error('All retries failed');
  });
}

export async function extractFactsFromChunk(chunkText: string) {
  const content = `Extract facts from this chunk:\n\n${chunkText}`;

  // Primary: Gemini Flash (fast, generous free tier)
  try {
    const responseText = await limit(() => callGemini(EXTRACTION_PROMPT, content));
    const parsed = parseJsonSafe(responseText);
    if (parsed.facts && Array.isArray(parsed.facts)) {
      return parsed.facts;
    }
  } catch (err: any) {
    console.warn(`Gemini extraction failed (${err?.message || err}), trying Groq...`);
  }

  // Fallback: Groq
  try {
    const chatCompletion = await callGroqWithRetry(() =>
      groq.chat.completions.create({
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content }
        ],
        model: 'qwen/qwen3.8-27b',
        max_tokens: 650,
        temperature: 0
      })
    );
    const resultText = chatCompletion.choices[0]?.message?.content || '{}';
    const parsed = parseJsonSafe(resultText);
    return parsed.facts || [];
  } catch (fallbackErr: any) {
    console.error(`All extraction attempts failed:`, fallbackErr?.message || fallbackErr);
    return [];
  }
}

// Export callGemini for use in judge.ts
export { callGemini, parseJsonSafe as parseJsonSafeExport };
