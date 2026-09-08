import { db } from './db';

function setupMocks() {
  const doc1 = 'mock-doc-a';
  const doc2 = 'mock-doc-b';
  const chunk1 = 'mock-chunk-a';
  const chunk2 = 'mock-chunk-b';
  const fact1 = 'mock-fact-a';
  const fact2 = 'mock-fact-b';

  // Cleanup old mocks
  db.prepare('DELETE FROM relationships').run();
  db.prepare('DELETE FROM review_queue').run();
  db.prepare('DELETE FROM facts WHERE id IN (?, ?)').run(fact1, fact2);
  db.prepare('DELETE FROM chunks WHERE id IN (?, ?)').run(chunk1, chunk2);
  db.prepare('DELETE FROM documents WHERE id IN (?, ?)').run(doc1, doc2);

  // Insert mock docs
  const now = new Date().toISOString();
  db.prepare('INSERT INTO documents (id, filename, uploaded_at, status) VALUES (?, ?, ?, ?)').run(doc1, 'docA.pdf', now, 'done');
  db.prepare('INSERT INTO documents (id, filename, uploaded_at, status) VALUES (?, ?, ?, ?)').run(doc2, 'docB.pdf', now, 'done');

  // Insert mock chunks
  db.prepare('INSERT INTO chunks (id, document_id, page, raw_text) VALUES (?, ?, ?, ?)').run(chunk1, doc1, 1, 'Revenue was $10M in FY23.');
  db.prepare('INSERT INTO chunks (id, document_id, page, raw_text) VALUES (?, ?, ?, ?)').run(chunk2, doc2, 1, 'FY23 consolidated revenue hit $10 million.');

  // Insert mock fact types
  db.prepare('INSERT OR IGNORE INTO fact_types (name, first_seen_at) VALUES (?, ?)').run('financial_metric', now);

  // Insert mock facts
  db.prepare(`
    INSERT INTO facts (id, document_id, chunk_id, fact_type, subject, attribute, value, unit, raw_quote, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(fact1, doc1, chunk1, 'financial_metric', 'Company', 'Revenue', '10', 'USD Million', 'Revenue was $10M', 0.95, now);

  db.prepare(`
    INSERT INTO facts (id, document_id, chunk_id, fact_type, subject, attribute, value, unit, raw_quote, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(fact2, doc2, chunk2, 'financial_metric', 'Company', 'consolidated revenue', '10', 'USD million', 'consolidated revenue hit $10 million', 0.95, now);

  console.log("Mock data inserted.");
}

setupMocks();
