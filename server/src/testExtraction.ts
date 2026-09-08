import { db } from './db';
import { extractFactsFromChunk } from './llmClient';

async function testExtraction() {
  const chunk = db.prepare('SELECT id, document_id, raw_text FROM chunks WHERE raw_text LIKE ? LIMIT 1').get('%Revenue from services%') as any;
  if (!chunk) {
    console.log("No suitable chunk found.");
    return;
  }

  console.log("Extracting facts from chunk:", chunk.id);
  console.log("Chunk Text:", chunk.raw_text);

  const facts = await extractFactsFromChunk(chunk.raw_text);
  console.log("Extracted Facts:", JSON.stringify(facts, null, 2));

  // Validate raw_quote
  facts.forEach((fact: any) => {
    const isSubstring = chunk.raw_text.includes(fact.raw_quote);
    console.log(`Fact: ${fact.subject} - ${fact.attribute}`);
    console.log(`  raw_quote valid (is substring)? ${isSubstring}`);
    if (!isSubstring) {
      console.log(`  Quote: "${fact.raw_quote}"`);
    }
  });
}

testExtraction().catch(console.error);
