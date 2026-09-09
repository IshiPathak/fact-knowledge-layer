import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { processDocument } from './pdfParser';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Setup multer for file uploads
const uploadDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// POST /api/documents
app.post('/api/documents', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const documentId = uuidv4();
  const filename = req.file.filename;
  const uploadedAt = new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO documents (id, filename, uploaded_at, status)
    VALUES (?, ?, ?, 'pending')
  `);
  
  insertStmt.run(documentId, filename, uploadedAt);

  // Return immediately
  res.json({ documentId, status: 'pending' });

  // Processing will be kicked off here in Phase 1
  processDocument(documentId).catch(console.error);
});

// GET /api/documents/:id/evidence/:chunkId
app.get('/api/documents/:id/evidence/:chunkId', (req, res) => {
  const { id, chunkId } = req.params;
  const chunk = db.prepare('SELECT raw_text, bbox FROM chunks WHERE document_id = ? AND id = ?').get(id, chunkId) as any;
  if (!chunk) {
    return res.status(404).json({ error: 'Chunk not found' });
  }
  
  res.json({
    rawText: chunk.raw_text,
    bbox: chunk.bbox ? JSON.parse(chunk.bbox) : null
  });
});

// GET /api/documents
app.get('/api/documents', (req, res) => {
  const docs = db.prepare('SELECT * FROM documents ORDER BY uploaded_at DESC').all();
  res.json(docs);
});

// GET /api/relationships
app.get('/api/relationships', (req, res) => {
  const rels = db.prepare(`
    SELECT r.*, 
      fa.subject as a_subject, fa.attribute as a_attribute, fa.value as a_value, fa.unit as a_unit, fa.raw_quote as a_quote,
      fb.subject as b_subject, fb.attribute as b_attribute, fb.value as b_value, fb.unit as b_unit, fb.raw_quote as b_quote
    FROM relationships r
    JOIN facts fa ON r.fact_id_a = fa.id
    JOIN facts fb ON r.fact_id_b = fb.id
    ORDER BY r.judged_at DESC
  `).all();
  res.json(rels);
});

// GET /api/facts
app.get('/api/facts', (req, res) => {
  const { document_id } = req.query;
  let facts;
  if (document_id) {
    facts = db.prepare(`
      SELECT f.id, f.document_id, f.fact_type, f.subject, f.attribute, f.value, f.unit, f.time_scope, f.raw_quote, f.confidence, f.created_at, d.filename
      FROM facts f
      JOIN documents d ON f.document_id = d.id
      WHERE f.document_id = ?
      ORDER BY f.created_at DESC
    `).all(document_id);
  } else {
    facts = db.prepare(`
      SELECT f.id, f.document_id, f.fact_type, f.subject, f.attribute, f.value, f.unit, f.time_scope, f.raw_quote, f.confidence, f.created_at, d.filename
      FROM facts f
      JOIN documents d ON f.document_id = d.id
      ORDER BY f.created_at DESC
      LIMIT 200
    `).all();
  }
  res.json(facts);
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const docCount = (db.prepare('SELECT count(*) as count FROM documents').get() as any)?.count || 0;
  const factCount = (db.prepare('SELECT count(*) as count FROM facts').get() as any)?.count || 0;
  const relCount = (db.prepare('SELECT count(*) as count FROM relationships').get() as any)?.count || 0;
  const reviewCount = (db.prepare('SELECT count(*) as count FROM review_queue').get() as any)?.count || 0;
  res.json({ documents: docCount, facts: factCount, relationships: relCount, reviews: reviewCount });
});

// GET /api/reviews
app.get('/api/reviews', (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, f.subject, f.attribute, f.value, f.unit, f.raw_quote, f.confidence, d.filename
    FROM review_queue r
    JOIN facts f ON r.fact_id = f.id
    JOIN documents d ON f.document_id = d.id
    ORDER BY r.created_at DESC
  `).all();
  res.json(reviews);
});


// POST /api/reset
app.post('/api/reset', (req, res) => {
  try {
    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM relationships').run();
    db.prepare('DELETE FROM review_queue').run();
    db.prepare('DELETE FROM facts').run();
    db.prepare('DELETE FROM chunks').run();
    db.prepare('DELETE FROM fact_types').run();
    db.prepare('DELETE FROM documents').run();
    db.pragma('foreign_keys = ON');
    res.json({ success: true, message: 'Database reset successfully' });
  } catch (err: any) {
    console.error('Reset error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rejudge — re-run relationship judging for all existing facts across documents
app.post('/api/rejudge', async (req, res) => {
  try {
    const { findCandidatesForFact } = require('./retrieval');
    const { processCandidatePairs } = require('./judge');

    const facts = db.prepare("SELECT id FROM facts WHERE embedding IS NOT NULL").all() as any[];
    console.log(`[Rejudge] Starting re-judge pass for ${facts.length} facts...`);
    res.json({ success: true, message: `Re-judging ${facts.length} facts in background...` });

    // Run in background, don't block response
    (async () => {
      let judged = 0;
      for (const { id } of facts) {
        const candidates = findCandidatesForFact(id, 3);
        if (candidates.length > 0) {
          const factA = db.prepare('SELECT * FROM facts WHERE id = ?').get(id);
          const pairs = candidates.map((c: any) => ({
            factA,
            factB: db.prepare('SELECT * FROM facts WHERE id = ?').get(c.id)
          }));
          await processCandidatePairs(pairs);
          judged += pairs.length;
        }
      }
      console.log(`[Rejudge] Complete — evaluated ${judged} candidate pairs`);
    })().catch(console.error);
  } catch (err: any) {
    console.error('Rejudge error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reextract/:id — reset and re-run extraction for a specific document
app.post('/api/reextract/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const doc = db.prepare('SELECT id, filename FROM documents WHERE id = ?').get(id) as any;
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    // Clear existing facts/relationships for this doc
    db.prepare('DELETE FROM relationships WHERE fact_id_a IN (SELECT id FROM facts WHERE document_id = ?) OR fact_id_b IN (SELECT id FROM facts WHERE document_id = ?)').run(id, id);
    db.prepare('DELETE FROM review_queue WHERE fact_id IN (SELECT id FROM facts WHERE document_id = ?)').run(id);
    db.prepare('DELETE FROM facts WHERE document_id = ?').run(id);
    db.prepare("UPDATE documents SET status = 'pending_extraction' WHERE id = ?").run(id);
    res.json({ success: true, message: `Re-extracting ${doc.filename}...` });
    const { extractFactsForDocument } = require('./extractor');
    extractFactsForDocument(id).catch(console.error);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);

  // Automatically resume any interrupted or pending documents
  const pendingDocs = db.prepare("SELECT id, filename, status FROM documents WHERE status NOT IN ('done', 'error')").all() as any[];
  if (pendingDocs.length > 0) {
    console.log(`Resuming extraction pipeline for ${pendingDocs.length} document(s)...`);
    const { extractFactsForDocument } = require('./extractor');
    for (const doc of pendingDocs) {
      extractFactsForDocument(doc.id).catch(console.error);
    }
  }
});

