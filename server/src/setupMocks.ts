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

  const fact3 = 'mock-fact-c';
  const fact4 = 'mock-fact-d';
  db.prepare(`
    INSERT INTO facts (id, document_id, chunk_id, fact_type, subject, attribute, value, unit, raw_quote, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(fact3, doc1, chunk1, 'financial_metric', 'Company', 'Operating Profit', '2', 'USD Million', 'Operating profit stood at $2M', 0.9, now);

  db.prepare(`
    INSERT INTO facts (id, document_id, chunk_id, fact_type, subject, attribute, value, unit, raw_quote, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(fact4, doc2, chunk2, 'financial_metric', 'Company', 'Operating Profit', '1.5', 'USD Million', 'Standalone operating profit was $1.5M', 0.9, now);

  // Insert mock relationships
  const rel1 = 'mock-rel-1';
  db.prepare(`
    INSERT INTO relationships (id, fact_id_a, fact_id_b, relationship, reconciliation_factor, reasoning, judged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(rel1, fact1, fact2, 'corroborates', null, 'Both state the revenue is $10M.', now);

  const rel2 = 'mock-rel-2';
  db.prepare(`
    INSERT INTO relationships (id, fact_id_a, fact_id_b, relationship, reconciliation_factor, reasoning, judged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(rel2, fact3, fact4, 'reconciled', 'scope', 'Doc A shows consolidated profit ($2M), while Doc B shows standalone profit ($1.5M).', now);

  console.log("Mock data inserted.");
}

setupMocks();
