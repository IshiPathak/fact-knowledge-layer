// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Define expected interface since we might not have perfect types
interface TextItem {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
  hasEOL: boolean;
}

export async function processDocument(documentId: string) {
  try {
    const docRecord = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as any;
    if (!docRecord) {
      throw new Error('Document not found');
    }

    // Update status to parsing
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('parsing', documentId);

    const uploadDir = path.resolve(__dirname, '../../uploads');
    const filePath = path.join(uploadDir, docRecord.filename);

    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({ 
      data,
      standardFontDataUrl: path.join(__dirname, '../node_modules/pdfjs-dist/standard_fonts/')
    });
    const pdfDocument = await loadingTask.promise;

    const numPages = pdfDocument.numPages;
    db.prepare('UPDATE documents SET page_count = ? WHERE id = ?').run(numPages, documentId);

    const insertChunk = db.prepare(`
      INSERT INTO chunks (id, document_id, page, char_start, char_end, bbox, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Process page by page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as TextItem[];
      
      let pageText = '';
      let bboxes: any[] = [];
      for (const item of items) {
        if (!item.str || item.str.trim() === '') continue;
        pageText += item.str + ' ';
        bboxes.push({
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.transform[3]
        });
      }

      const trimmed = pageText.trim();
      if (trimmed.length < 30) continue; // Skip empty pages

      if (trimmed.length <= 2500) {
        insertChunk.run(
          uuidv4(),
          documentId,
          pageNum,
          0,
          trimmed.length,
          JSON.stringify(bboxes.slice(0, 30)),
          trimmed
        );
      } else {
        for (let start = 0; start < trimmed.length; start += 2000) {
          const piece = trimmed.slice(start, start + 2000).trim();
          if (piece.length > 30) {
            insertChunk.run(
              uuidv4(),
              documentId,
              pageNum,
              start,
              start + piece.length,
              JSON.stringify(bboxes.slice(0, 30)),
              piece
            );
          }
        }
      }
    }

    // Set back to pending extraction
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('pending_extraction', documentId);
    console.log(`Document ${documentId} parsed successfully. Starting extraction...`);
    
    // Auto-trigger extraction pipeline
    // using dynamic import or require to avoid circular dependencies if any
    const { extractFactsForDocument } = require('./extractor');
    extractFactsForDocument(documentId).catch(console.error);
  } catch (error) {
    console.error(`Failed to parse document ${documentId}:`, error);
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('error', documentId);
  }
}
