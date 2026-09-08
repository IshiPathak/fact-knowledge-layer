import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { extractFactsFromChunk } from './llmClient';
import { getEmbedding } from './embedding';

export async function extractFactsForDocument(documentId: string) {
  try {
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('extracting', documentId);
    
    const chunks = db.prepare('SELECT id, raw_text FROM chunks WHERE document_id = ?').all(documentId) as any[];
    console.log(`Starting extraction for document ${documentId} - ${chunks.length} chunks`);

    for (const chunk of chunks) {
      if (chunk.raw_text.trim().length < 20) continue; // Skip very short chunks

      const facts = await extractFactsFromChunk(chunk.raw_text);
      if (!facts || facts.length === 0) continue;

      for (const fact of facts) {
        // Validate raw_quote
        if (!fact.raw_quote || !chunk.raw_text.includes(fact.raw_quote)) {
          // Route to review_queue if quote doesn't match
          const tempFactId = uuidv4();
          
          // Try to insert fact first so we can reference it, but we might skip it or just put it in fact table anyway with a flag
          // The schema says review_queue has fact_id REFERENCES facts(id). So we must insert the fact first.
        }

        // Register new fact_type if it doesn't exist
        if (fact.fact_type) {
          const existingType = db.prepare('SELECT name FROM fact_types WHERE name = ?').get(fact.fact_type);
          if (!existingType) {
            db.prepare(`
              INSERT INTO fact_types (name, first_seen_document, first_seen_at)
              VALUES (?, ?, ?)
            `).run(fact.fact_type, documentId, new Date().toISOString());
            console.log(`Registered new fact_type: ${fact.fact_type}`);
          }
        }

        const factId = uuidv4();
        
        // Ensure values are strings
        const valueStr = typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value);
        
        const embeddingText = `${fact.subject || ''} ${fact.attribute || ''} ${fact.raw_quote || ''}`.trim();
        const embedding = await getEmbedding(embeddingText);
        
        db.prepare(`
          INSERT INTO facts (id, document_id, chunk_id, fact_type, subject, attribute, value, unit, time_scope, qualifiers, raw_quote, confidence, embedding, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          factId,
          documentId,
          chunk.id,
          fact.fact_type || 'unknown',
          fact.subject || 'unknown',
          fact.attribute || 'unknown',
          valueStr,
          fact.unit || null,
          fact.time_scope || null,
          fact.qualifiers ? JSON.stringify(fact.qualifiers) : null,
          fact.raw_quote || '',
          fact.confidence || 0.5,
          Buffer.from(embedding.buffer),
          new Date().toISOString()
        );

        // If raw_quote mismatch, insert to review_queue
        if (fact.raw_quote && !chunk.raw_text.includes(fact.raw_quote)) {
          db.prepare(`
            INSERT INTO review_queue (id, fact_id, reason, detail, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            uuidv4(),
            factId,
            'quote_mismatch',
            `Extracted quote not found in chunk. Quote: "${fact.raw_quote}"`,
            new Date().toISOString()
          );
        } else if ((fact.confidence || 0) < 0.7) {
          db.prepare(`
            INSERT INTO review_queue (id, fact_id, reason, detail, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            uuidv4(),
            factId,
            'low_confidence_extraction',
            `Confidence: ${fact.confidence}`,
            new Date().toISOString()
          );
        }
      }
    }

    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('done', documentId);
    console.log(`Extraction complete for document ${documentId}`);
  } catch (err) {
    console.error('Error extracting facts for document:', err);
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('error', documentId);
  }
}
