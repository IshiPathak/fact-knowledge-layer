import { db } from './db';
import { findCandidatesForFact } from './retrieval';
import { processCandidatePairs } from './judge';

async function testJudge() {
  const doc1 = db.prepare('SELECT id FROM documents WHERE filename = ?').get('test-delhivery-q4.pdf') as any;
  if (!doc1) {
    console.log("No test document found.");
    return;
  }
  
  const factA = db.prepare('SELECT * FROM facts WHERE id = ?').get('mock-fact-a');
  const factB = db.prepare('SELECT * FROM facts WHERE id = ?').get('mock-fact-b');

  if (!factA || !factB) {
      console.log("Mock facts not found.");
      return;
  }

  const pairs = [{ factA, factB }];

  console.log(`Judging ${pairs.length} candidate pairs...`);
  await processCandidatePairs(pairs);

  const relationships = db.prepare('SELECT * FROM relationships').all();
  console.log("Persisted Relationships:", relationships);
  
  const reviewQueue = db.prepare('SELECT * FROM review_queue').all();
  console.log("Review Queue:", reviewQueue);
}

testJudge().catch(console.error);
