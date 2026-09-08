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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// POST /api/documents
app.post('/api/documents', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const documentId = uuidv4();
  const filename = req.file.originalname;
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

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
