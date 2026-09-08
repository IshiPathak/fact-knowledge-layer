import { db } from './db';
import { extractFactsForDocument } from './extractor';
import { findCandidatesForFact } from './retrieval';

async function testRetrieval() {
  // We need at least 2 documents with facts. Let's find two in the DB.
  // First, we'll re-run extraction on test-delhivery-q4.pdf so it has embeddings.
  const doc1 = db.prepare('SELECT id FROM documents WHERE filename = ?').get('test-delhivery-q4.pdf') as any;
  if (!doc1) {
    console.log("No test document found.");
    return;
  }
  
  // Clear old facts for this doc (and review_queue entries)
  const oldFacts = db.prepare('SELECT id FROM facts WHERE document_id = ?').all(doc1.id) as any[];
  for (const f of oldFacts) {
    db.prepare('DELETE FROM review_queue WHERE fact_id = ?').run(f.id);
  }
  db.prepare('DELETE FROM facts WHERE document_id = ?').run(doc1.id);
  
  console.log(`Re-extracting facts for ${doc1.id} to generate embeddings...`);
  await extractFactsForDocument(doc1.id);
  
  // Create a mock second document and some mock facts for it to test retrieval
  const mockDocId = 'mock-doc-123';
  db.prepare('INSERT OR IGNORE INTO documents (id, filename, status, uploaded_at) VALUES (?, ?, ?, ?)').run(mockDocId, 'mock-competitor.pdf', 'done', new Date().toISOString());
  
  // We'll generate embeddings for a couple of mock facts directly
  // We need getEmbedding from embedding.ts
  const { getEmbedding } = require('./embedding');
  
  const mockFactText = "Revenue for the quarter was INR 7500 crore";
  const mockEmbedding = await getEmbedding(mockFactText);
  
  db.prepare(`
    INSERT OR IGNORE INTO facts (id, document_id, chunk_id, fact_type, subject, attribute, value, unit, raw_quote, confidence, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'mock-fact-1', mockDocId, 'mock-chunk-1', 'financial_metric', 'Competitor Ltd', 'Revenue', '7500', 'INR crore', mockFactText, 0.9, Buffer.from(mockEmbedding.buffer), new Date().toISOString()
  );

  const mockFactText2 = "Total employees increased to 5000";
  const mockEmbedding2 = await getEmbedding(mockFactText2);

  db.prepare(`
    INSERT OR IGNORE INTO facts (id, document_id, chunk_id, fact_type, subject, attribute, value, unit, raw_quote, confidence, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'mock-fact-2', mockDocId, 'mock-chunk-1', 'operational_metric', 'Competitor Ltd', 'Total employees', '5000', null, mockFactText2, 0.9, Buffer.from(mockEmbedding2.buffer), new Date().toISOString()
  );

  // Now let's pick a fact from doc1 (delhivery) and find candidates
  const targetFact = db.prepare('SELECT id, subject, attribute, value FROM facts WHERE document_id = ? LIMIT 1').get(doc1.id) as any;
  
  if (targetFact) {
    console.log(`Finding candidates for Fact: ${targetFact.subject} - ${targetFact.attribute} = ${targetFact.value}`);
    const candidates = findCandidatesForFact(targetFact.id);
    console.log("Top Candidates:");
    candidates.forEach((c: any) => {
      console.log(` - Score: ${c.similarityScore.toFixed(4)} | ${c.subject} - ${c.attribute} = ${c.value} ("${c.raw_quote}")`);
    });
  }
}

testRetrieval().catch(console.error);
