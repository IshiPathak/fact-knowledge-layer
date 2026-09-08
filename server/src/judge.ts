import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// @ts-ignore
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const JUDGE_PROMPT = `
You are an expert fact-checker and analyst. Given two extracted facts from different business documents, determine how they relate to each other.
Return the result strictly as a JSON object matching this schema. Do not wrap the JSON in markdown code blocks or add any other text.

{
  "relationship": "Must be exactly one of: 'corroborates', 'contradicts', 'reconciled', or 'unrelated'",
  "reconciliation_factor": "If relationship is 'reconciled', specify 'time', 'scope', 'unit', or 'definition'. Otherwise null.",
  "reasoning": "Briefly explain why you chose this relationship",
  "confidence": 0.95 // Float between 0.0 and 1.0
}

Definitions:
- corroborates: Both facts state the same or highly similar information.
- contradicts: The facts present opposing or conflicting information that cannot be true at the same time based on the provided data alone.
- reconciled: The facts seem to conflict at first glance, but the context (like different time periods, different scopes like 'consolidated' vs 'standalone', or different definitions) explains the difference.
- unrelated: The facts are talking about completely different things.
`;

export async function judgeRelationship(factA: any, factB: any): Promise<any> {
  const content = `Fact A:\n${JSON.stringify(factA, null, 2)}\n\nFact B:\n${JSON.stringify(factB, null, 2)}\n\nReturn JSON object:`;

  try {
    // Try Groq first
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: JUDGE_PROMPT },
        { role: 'user', content }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    const responseText = chatCompletion.choices[0]?.message?.content || '{}';
    return JSON.parse(responseText);
  } catch (error) {
    try {
      // Fallback to Gemini
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: JUDGE_PROMPT + '\n\n' + content,
          config: {
              responseMimeType: 'application/json'
          }
      });
      const responseText = response.text || '{}';
      return JSON.parse(responseText);
    } catch (fallbackError) {
      console.error('Both Groq and Gemini failed for judge:', fallbackError);
      return null;
    }
  }
}

export async function processCandidatePairs(candidates: { factA: any, factB: any }[]) {
  for (const pair of candidates) {
    // Check if relationship already exists
    const existing = db.prepare('SELECT id FROM relationships WHERE (fact_id_a = ? AND fact_id_b = ?) OR (fact_id_a = ? AND fact_id_b = ?)').get(pair.factA.id, pair.factB.id, pair.factB.id, pair.factA.id);
    if (existing) continue;

    const judgment = await judgeRelationship(pair.factA, pair.factB);
    if (!judgment || !judgment.relationship) continue;

    if (judgment.relationship === 'unrelated') continue; // Don't persist unrelated pairs to keep DB clean

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

    console.log(`Judged ${judgment.relationship} between ${pair.factA.subject} and ${pair.factB.subject}. Reasoning: ${judgment.reasoning}`);

    if ((judgment.confidence || 0) < 0.8) {
      db.prepare(`
        INSERT INTO review_queue (id, fact_id, reason, detail, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        pair.factA.id, // Put the first fact in queue for review, or could be a different structure
        'low_confidence_relationship',
        `Relationship with ${pair.factB.id}: Confidence ${judgment.confidence}. Reasoning: ${judgment.reasoning}`,
        new Date().toISOString()
      );
    }
  }
}
