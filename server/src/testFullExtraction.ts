import { db } from './db';
import { extractFactsForDocument } from './extractor';

async function testFullExtraction() {
  const doc = db.prepare('SELECT id FROM documents WHERE filename = ?').get('test-delhivery-q4.pdf') as any;
  if (!doc) {
    console.log("No test document found.");
    return;
  }

  console.log(`Starting extraction for ${doc.id}`);
  await extractFactsForDocument(doc.id);
  
  const facts = db.prepare('SELECT * FROM facts WHERE document_id = ?').all(doc.id) as any[];
  console.log(`Extracted ${facts.length} facts in total.`);
  
  const types = db.prepare('SELECT * FROM fact_types').all() as any[];
  console.log(`Registered fact types:`, types.map(t => t.name));
}

testFullExtraction().catch(console.error);
