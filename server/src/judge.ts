import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { callGroqWithRetry, callGemini, parseJsonSafeExport as parseJsonSafe } from './llmClient';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const JUDGE_PROMPT = `
You are a rigorous business & macroeconomic fact synthesis engine.
Compare two extracted facts from different documents and determine their relationship.
Return strictly a JSON object matching this schema. Do not wrap the JSON in markdown code blocks or add any other text.

{
  "relationship": "Must be exactly one of: 'corroborates', 'contradicts', 'reconciled', or 'unrelated'",
  "reconciliation_factor": "If relationship is 'reconciled', specify 'time', 'scope', 'unit', or 'definition'. Otherwise null.",
  "reasoning": "Clear 1-2 sentence explanation of why this relationship was chosen",
  "confidence": 0.95
}

STRICT CLASSIFICATION RULES:

1. 'corroborates':
- Both facts state the same or substantially identical metric, finding, or data point for the same underlying time period.
- EQUIVALENT NOTATIONS MUST BE CLASSIFIED AS 'corroborates':
  * "FY24" and "2023-24" are the same fiscal year.
  * "FY25" and "2024-25" are the same fiscal year.
  * Minor phrasing/formatting variations (e.g. "5.4%" vs "5.4 per cent", "₹8,142 Cr" vs "₹8,142 crores", "8.2%" vs "8.20%") are CORROBORATION.
  * If both documents agree on the figure or core factual statement, choose 'corroborates' (reconciliation_factor must be null). NEVER mark this as 'reconciled'.

2. 'contradicts':
- The facts make mutually incompatible, conflicting, or opposing claims about the SAME subject and metric for the SAME time period or target year.
- DIVERGENT FORECASTS / PROJECTIONS: When two official reports or agencies give different projections or estimates for the same period (e.g. Economic Survey estimating FY25 growth at 6.4% vs RBI projecting FY25 growth at 7.2%), this is an analytical conflict/divergence -> classify as 'contradicts' (reconciliation_factor must be null).
- Opposing numbers for the same metric, period, and scope with no genuine structural reconciling factor MUST be classified as 'contradicts'.

3. 'reconciled':
- Use 'reconciled' ONLY when the two values differ, but there is a clear, legitimate explanatory dimension:
  * "time": distinctly DIFFERENT time periods (e.g. FY23 vs FY24, Q3 vs Q4, 2013 vs 2024, prospectus baseline vs annual report). Not just different notation of the same year!
  * "scope": different organizational or operational scopes (e.g. Consolidated vs Standalone, Express Parcel revenue vs Total revenue, Central Govt vs General Govt).
  * "unit": different units of measurement (e.g. USD vs INR, Millions vs Crores, percent of GDP vs absolute billions).
  * "definition": different economic definitions (e.g. Nominal GDP at current prices vs Real GDP at constant prices, Headline CPI vs Core CPI).
- If 'reconciled', reconciliation_factor MUST be one of: "time", "scope", "unit", or "definition".
- NEVER use 'reconciled' if the facts agree (that is 'corroborates') or if they directly conflict on the same scope/time (that is 'contradicts').

4. 'unrelated':
- The facts discuss completely different subjects, metrics, or contexts with no meaningful comparative relationship.
`;

// Kept for backward compat
export const limiter = {
  acquire: async () => {}
};

function cleanFactForJudge(fact: any) {
  if (!fact) return {};
  return {
    subject: fact.subject,
    attribute: fact.attribute,
    value: fact.value,
    unit: fact.unit,
    time_scope: fact.time_scope,
    qualifiers: fact.qualifiers ? (typeof fact.qualifiers === 'string' ? JSON.parse(fact.qualifiers) : fact.qualifiers) : undefined,
    raw_quote: fact.raw_quote,
    confidence: fact.confidence
  };
}

export async function judgeRelationship(factA: any, factB: any): Promise<any> {
  const cleanA = cleanFactForJudge(factA);
  const cleanB = cleanFactForJudge(factB);
  const content = `Fact A:\n${JSON.stringify(cleanA, null, 2)}\n\nFact B:\n${JSON.stringify(cleanB, null, 2)}\n\nReturn JSON object:`;

  // Primary: Gemini Flash
  try {
    const responseText = await callGemini(JUDGE_PROMPT, content);
    const parsed = parseJsonSafe(responseText);
    if (parsed.relationship) return parsed;
  } catch (err: any) {
    console.warn(`Gemini judge failed (${err?.message || err}), trying Groq...`);
  }

  // Fallback: Groq
  try {
    const chatCompletion = await callGroqWithRetry(() =>
      groq.chat.completions.create({
        messages: [
          { role: 'system', content: JUDGE_PROMPT },
          { role: 'user', content }
        ],
        model: 'qwen/qwen3.8-27b',
        max_tokens: 300,
        temperature: 0
      })
    );
    const responseText = chatCompletion.choices[0]?.message?.content || '{}';
    return parseJsonSafe(responseText);
  } catch (error: any) {
    console.error('All judge attempts failed:', error?.message || error);
    return null;
  }
}

export async function processCandidatePairs(candidates: { factA: any, factB: any }[]) {
  for (const pair of candidates) {
    const existing = db.prepare('SELECT id FROM relationships WHERE (fact_id_a = ? AND fact_id_b = ?) OR (fact_id_a = ? AND fact_id_b = ?)').get(pair.factA.id, pair.factB.id, pair.factB.id, pair.factA.id);
    if (existing) continue;

    const judgment = await judgeRelationship(pair.factA, pair.factB);
    if (!judgment || !judgment.relationship) continue;

    if (judgment.relationship === 'unrelated') continue;

    const relId = uuidv4();
    db.prepare(`
      INSERT INTO relationships (id, fact_id_a, fact_id_b, relationship, reconciliation_factor, reasoning, judged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      relId,
      pair.factA.id,
      pair.factB.id,
      judgment.relationship,
      judgment.reconciliation_factor || null,
      judgment.reasoning || '',
      new Date().toISOString()
    );

    console.log(`Judged [${judgment.relationship}]: ${pair.factA.subject} ↔ ${pair.factB.subject}. ${judgment.reasoning}`);

    if ((judgment.confidence || 0) < 0.8) {
      db.prepare(`INSERT INTO review_queue (id, fact_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(
          uuidv4(),
          pair.factA.id,
          'low_confidence_relationship',
          `Relationship with ${pair.factB.id}: Confidence ${judgment.confidence}. ${judgment.reasoning}`,
          new Date().toISOString()
        );
    }
  }
}
