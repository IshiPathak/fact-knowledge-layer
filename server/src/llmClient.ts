import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// @ts-ignore
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  "qualifiers": { "basis": "consolidated", "source_context": "earnings presentation headline figure" }, // Key-value pairs for any nuances
  "fact_type": "A broad, emergent category (e.g. 'financial_metric', 'governance_status', 'macro_indicator')",
  "raw_quote": "A verbatim substring from the text chunk supporting this fact, strictly < 40 words",
  "confidence": 0.95 // A float between 0.0 and 1.0 indicating your confidence in the extraction
}

Rules for 'raw_quote':
- It must be a VERBATIM substring of the provided text.
- Do not paraphrase or alter the quote in any way.
- It must be continuous (no ellipses skipping text).
`;

export async function extractFactsFromChunk(chunkText: string): Promise<any[]> {
  const content = `Text Chunk:\n"""\n${chunkText}\n"""\n\nReturn JSON array:`;

  try {
    // Try Groq first
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0,
      response_format: { type: 'json_object' } // Groq requires 'json_object' type to output JSON, but it expects an object. Wait, if we ask for an array, it might fail. Let's ask for an object with a 'facts' array.
    });

    const responseText = chatCompletion.choices[0]?.message?.content || '{}';
    let parsed = JSON.parse(responseText);
    
    // Normalize to array
    if (parsed.facts && Array.isArray(parsed.facts)) return parsed.facts;
    if (Array.isArray(parsed)) return parsed;
    
    return [];
  } catch (error) {
    console.warn('Groq extraction failed, falling back to Gemini:', error);
    try {
      // Fallback to Gemini
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: EXTRACTION_PROMPT + '\\n\\n' + content,
          config: {
              responseMimeType: 'application/json'
          }
      });
      const responseText = response.text || '[]';
      let parsed = JSON.parse(responseText);
      if (parsed.facts && Array.isArray(parsed.facts)) return parsed.facts;
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (fallbackError) {
      console.error('Both Groq and Gemini failed:', fallbackError);
      return [];
    }
  }
}
