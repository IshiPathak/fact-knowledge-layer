import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { processDocument } from './pdfParser';

async function test() {
  const samplePdf = path.resolve(__dirname, '../../starter-datasets/delhivery/03-delhivery-q4-fy24-earnings-presentation.pdf');
  const uploadDir = path.resolve(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filename = 'test-delhivery-q4.pdf';
  const destPdf = path.join(uploadDir, filename);
  fs.copyFileSync(samplePdf, destPdf);

  const documentId = uuidv4();
  db.prepare('INSERT INTO documents (id, filename, uploaded_at, status) VALUES (?, ?, ?, ?)').run(
    documentId,
    filename,
    new Date().toISOString(),
    'pending'
  );

  console.log('Processing document:', documentId);
  await processDocument(documentId);

  const chunks = db.prepare('SELECT page, raw_text FROM chunks WHERE document_id = ? ORDER BY page ASC LIMIT 10').all(documentId) as any[];
  console.log(`Generated ${chunks.length} chunks (showing first 10):`);
  chunks.forEach((c, i) => {
    console.log(`\n--- Chunk ${i + 1} (Page ${c.page}) ---`);
    console.log(c.raw_text);
  });
}

test().catch(console.error);
