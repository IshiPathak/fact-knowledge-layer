import { db } from './db';

// Cosine similarity between two float32 arrays
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function subjectOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aLow = a.toLowerCase();
  const bLow = b.toLowerCase();
  if (aLow === bLow) return true;
  if (aLow.includes(bLow) || bLow.includes(aLow)) return true;
  // Check word overlap (words > 3 chars)
  const aWords = aLow.split(/\s+/).filter(w => w.length > 3);
  const bWords = new Set(bLow.split(/\s+/).filter(w => w.length > 3));
  return aWords.some(w => bWords.has(w));
}

export function findCandidatesForFact(factId: string, limit = 3): any[] {
  const target = db.prepare(
    'SELECT id, document_id, embedding, subject, attribute, fact_type FROM facts WHERE id = ?'
  ).get(factId) as any;
  if (!target || !target.embedding) return [];

  const targetEmbedding = new Float32Array(
    target.embedding.buffer, target.embedding.byteOffset, target.embedding.length / 4
  );

  // Get all facts from OTHER documents (cross-doc only)
  const candidates = db.prepare(
    'SELECT id, document_id, embedding, subject, attribute, raw_quote FROM facts WHERE document_id != ? AND embedding IS NOT NULL'
  ).all(target.document_id) as any[];

  if (candidates.length === 0) return [];

  const stopWords = new Set(["the", "and", "for", "from", "with", "total", "net", "per", "our", "all", "delhivery", "limited", "company", "india"]);
  const targetAttr = (target.attribute || '').toLowerCase();
  const targetAttrWords = targetAttr.split(/[\s_\-,/]+/).filter((w: string) => w.length > 2 && !stopWords.has(w));

  const scored = candidates.map(c => {
    const cAttr = (c.attribute || '').toLowerCase();
    const cAttrWords = new Set(cAttr.split(/[\s_\-,/]+/).filter((w: string) => w.length > 2 && !stopWords.has(w)));
    const cEmbedding = new Float32Array(c.embedding.buffer, c.embedding.byteOffset, c.embedding.length / 4);
    const cosine = cosineSimilarity(targetEmbedding, cEmbedding);

    const isExactAttr = targetAttr.length > 2 && targetAttr === cAttr;
    const hasAttrWordMatch = targetAttrWords.length > 0 && targetAttrWords.some((w: string) => cAttrWords.has(w));

    // Score: prioritize attribute match, backed by cosine similarity
    let score = cosine;
    if (isExactAttr) score += 0.60;
    else if (hasAttrWordMatch) score += 0.35;

    return { candidate: c, score, cosine, isExactAttr, hasAttrWordMatch };
  });

  // Only qualify candidate pairs that have genuine metric or semantic overlap
  const qualifying = scored.filter(s =>
    s.isExactAttr ||
    s.hasAttrWordMatch ||
    s.cosine >= 0.52
  );

  // Sort by composite score descending
  qualifying.sort((a, b) => b.score - a.score);

  return qualifying
    .slice(0, limit)
    .map(s => ({ ...s.candidate, similarityScore: s.score }));
}
