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
      
      // Group items into chunks based on vertical distance
      let currentChunkText = '';
      let currentBbox: any[] = [];
      let lastY: number | null = null;
      let lastHeight = 0;
      let charCount = 0;
      let charStart = 0;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.str || item.str.trim() === '') {
          // If it's empty and we have a chunk and we hit a significant gap, we could break, but let's rely on Y distance
          continue;
        }

        const x = item.transform[4];
        const y = item.transform[5];
        const height = item.transform[3]; // scaleY usually represents height
        const width = item.width;

        // Check if new paragraph
        const isNewParagraph = lastY !== null && Math.abs(lastY - y) > lastHeight * 1.5;
        
        // Also if we reach > 500 characters, let's chunk to be safe, or wait for paragraph break
        const isTooLong = currentChunkText.length > 2000; 

        if ((isNewParagraph && currentChunkText.length > 50) || isTooLong) {
          // Save current chunk
          if (currentChunkText.trim().length > 0) {
             insertChunk.run(
               uuidv4(),
               documentId,
               pageNum,
               charStart,
               charStart + currentChunkText.length,
               JSON.stringify(currentBbox),
               currentChunkText.trim()
             );
          }
          
          charStart += currentChunkText.length;
          currentChunkText = '';
          currentBbox = [];
        }

        currentChunkText += item.str + ' ';
        currentBbox.push({ x, y, width, height });
        
        lastY = y;
        lastHeight = height;
      }
      
      // Save last chunk
      if (currentChunkText.trim().length > 0) {
        insertChunk.run(
          uuidv4(),
          documentId,
          pageNum,
          charStart,
          charStart + currentChunkText.length,
          JSON.stringify(currentBbox),
          currentChunkText.trim()
        );
      }
    }

    // Set back to pending extraction
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('pending_extraction', documentId);
    console.log(`Document ${documentId} parsed successfully.`);
    
  } catch (error) {
    console.error(`Failed to parse document ${documentId}:`, error);
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('error', documentId);
  }
}
