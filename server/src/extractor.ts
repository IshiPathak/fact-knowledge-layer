import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { extractFactsFromChunk } from './llmClient';
import { getEmbedding } from './embedding';
import { findCandidatesForFact } from './retrieval';
import { processCandidatePairs } from './judge';
import pLimit from 'p-limit';

// Process up to 5 chunks concurrently — matches LLM concurrency in llmClient.ts
const chunkLimit = pLimit(5);

async function processOneChunk(chunk: any, documentId: string): Promise<string[]> {
  // Verify document still exists (user may have reset DB mid-run)
  if (!db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId)) {
    console.log(`Document ${documentId} was reset. Aborting chunk.`);
    return [];
  }

  console.log(`[Chunk ${chunk.id}] Extracting facts (length: ${chunk.raw_text.length})...`);
  const facts = await extractFactsFromChunk(chunk.raw_text);
  console.log(`[Chunk ${chunk.id}] ${facts?.length || 0} facts found`);
  if (!facts || facts.length === 0) return [];

  const insertedFactIds: string[] = [];

  for (const fact of facts) {
    const typeName = fact.fact_type || 'general';
    const existingType = db.prepare('SELECT name FROM fact_types WHERE name = ?').get(typeName);
    if (!existingType) {
      db.prepare(`INSERT OR IGNORE INTO fact_types (name, first_seen_document, first_seen_at) VALUES (?, ?, ?)`)
        .run(typeName, null, new Date().toISOString());
    }

    const factId = uuidv4();
    const valueStr = typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value);
    const embeddingText = `${fact.subject || ''} ${fact.attribute || ''} ${fact.raw_quote || ''}`.trim();
    const embedding = await getEmbedding(embeddingText);

    db.prepare(`
      INSERT INTO facts (id, document_id, chunk_id, fact_type, subject, attribute, value, unit, time_scope, qualifiers, raw_quote, confidence, embedding, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      factId,
      documentId,
      chunk.id,
      typeName,
      fact.subject || 'unknown',
      fact.attribute || 'unknown',
      valueStr,
      fact.unit || null,
      fact.time_scope || null,
      fact.qualifiers ? JSON.stringify(fact.qualifiers) : null,
      fact.raw_quote || '',
      fact.confidence || 0.5,
      Buffer.from(embedding.buffer),
      new Date().toISOString()
    );

    // Guardrail: quote mismatch → review queue
    if (fact.raw_quote && !chunk.raw_text.includes(fact.raw_quote)) {
      db.prepare(`INSERT INTO review_queue (id, fact_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), factId, 'quote_mismatch', `Extracted quote not found in chunk. Quote: "${fact.raw_quote}"`, new Date().toISOString());
    } else if ((fact.confidence || 0) < 0.7) {
      db.prepare(`INSERT INTO review_queue (id, fact_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), factId, 'low_confidence_extraction', `Confidence: ${fact.confidence}`, new Date().toISOString());
    }

    insertedFactIds.push(factId);
  }

  return insertedFactIds;
}

export async function extractFactsForDocument(documentId: string) {
  try {
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('extracting', documentId);

    const chunks = db.prepare('SELECT id, page, raw_text FROM chunks WHERE document_id = ?').all(documentId) as any[];
    const existingChunkIds = new Set(
      (db.prepare('SELECT DISTINCT chunk_id FROM facts WHERE document_id = ?').all(documentId) as any[]).map(r => r.chunk_id)
    );

    const docExists = db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
    if (!docExists) {
      console.log(`Document ${documentId} does not exist. Skipping.`);
      return;
    }

    const FACT_KEYWORD_REGEX = /(revenue|growth|ebitda|profit|loss|gdp|inflation|deficit|shares?|margin|crore|million|percent|%|₹|\$|expenditure|director|turnover|pat|inr|usd|assets|liabilities|capital)/i;

    // Score chunks by density of numbers and financial/business keywords
    const scoredChunks = chunks
      .filter(c => c.raw_text.trim().length >= 40 && !existingChunkIds.has(c.id) && /\d/.test(c.raw_text))
      .map(c => {
        const text = c.raw_text;
        const numberMatches = (text.match(/\d+(?:[.,]\d+)?/g) || []).length;
        const keywordMatches = (text.match(new RegExp(FACT_KEYWORD_REGEX.source, 'gi')) || []).length;
        const score = numberMatches * 2 + keywordMatches * 3;
        return { chunk: c, score };
      })
      .filter(item => item.score >= 5)
      .sort((a, b) => b.score - a.score);

    // Take top 25 richest chunks per document to guarantee fast extraction (< 45s per doc)
    const eligibleChunks = scoredChunks.slice(0, 25).map(item => item.chunk);

    console.log(`Starting extraction for doc ${documentId}: ${eligibleChunks.length} high-density chunks out of ${chunks.length} total`);

    // PHASE 1: Extract all facts in parallel (bounded by chunkLimit)
    const allFactIdArrays = await Promise.all(
      eligibleChunks.map(chunk => chunkLimit(() => processOneChunk(chunk, documentId)))
    );
    const allFactIds = allFactIdArrays.flat();

    console.log(`Extraction phase done: ${allFactIds.length} facts inserted. Starting relationship judging...`);

    // PHASE 2: Judge relationships for all new facts (also runs concurrently via pLimit inside processCandidatePairs)
    const judgeLimit = pLimit(2);
    await Promise.all(
      allFactIds.map(factId => judgeLimit(async () => {
        if (!db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId)) return;
        const candidates = findCandidatesForFact(factId, 2);
        if (candidates.length === 0) return;
        const pairs = candidates.map((c: any) => ({
          factA: db.prepare('SELECT * FROM facts WHERE id = ?').get(factId),
          factB: db.prepare('SELECT * FROM facts WHERE id = ?').get(c.id)
        }));
        await processCandidatePairs(pairs);
      }))
    );

    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('done', documentId);
    console.log(`Extraction + judging complete for document ${documentId}`);
  } catch (err) {
    console.error('Error extracting facts for document:', err);
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('error', documentId);
  }
}
