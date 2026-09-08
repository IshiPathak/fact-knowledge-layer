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

export function findCandidatesForFact(factId: string, limit = 10): any[] {
  // Get the target fact
  const target = db.prepare('SELECT id, document_id, embedding, subject, attribute, fact_type FROM facts WHERE id = ?').get(factId) as any;
  if (!target || !target.embedding) {
    return [];
  }

  const targetEmbedding = new Float32Array(target.embedding.buffer, target.embedding.byteOffset, target.embedding.length / 4);

  // Get all other facts from DIFFERENT documents that have embeddings
  // We can loosely pre-filter by fact_type or just score them all if the dataset is small.
  // The TRD says "restricted to facts NOT from the same document" and "loose subject/attribute overlap".
  // Since SQLite has no vector index, we just pull everything from other documents.
  // At this scale, pulling a few hundred facts and computing cosine similarity is extremely fast in JS.
  const candidates = db.prepare('SELECT id, document_id, embedding, subject, attribute, raw_quote FROM facts WHERE document_id != ? AND embedding IS NOT NULL').all(target.document_id) as any[];

  const scoredCandidates = candidates.map(c => {
    const cEmbedding = new Float32Array(c.embedding.buffer, c.embedding.byteOffset, c.embedding.length / 4);
    const score = cosineSimilarity(targetEmbedding, cEmbedding);
    
    // Loose subject/attribute overlap bonus
    let overlapBonus = 0;
    if (c.subject && target.subject && c.subject.toLowerCase() === target.subject.toLowerCase()) {
      overlapBonus += 0.1;
    }
    if (c.attribute && target.attribute && c.attribute.toLowerCase() === target.attribute.toLowerCase()) {
      overlapBonus += 0.1;
    }
    
    return {
      fact: c,
      score: score + overlapBonus
    };
  });

  // Sort descending by score
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Return top N
  return scoredCandidates.slice(0, limit).map(sc => ({
    ...sc.fact,
    similarityScore: sc.score
  }));
}
