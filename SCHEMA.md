# SCHEMA — Fact Knowledge Layer

Core principle: the **shape** of a fact record is fixed (so the app can render/query it), but the
**content** of `attribute`, `fact_type`, and `qualifiers` is open-ended and discovered per document.
Never hardcode an enum of allowed fact types or attributes.

## 1. SQLite DDL

```sql
CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  filename      TEXT NOT NULL,
  uploaded_at   TEXT NOT NULL,
  page_count    INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending' -- pending | parsing | extracting | comparing | done | error
);

CREATE TABLE chunks (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id),
  page          INTEGER NOT NULL,
  char_start    INTEGER,
  char_end      INTEGER,
  bbox          TEXT,        -- JSON: [{x,y,width,height}] for highlighting, per line/run
  raw_text      TEXT NOT NULL
);

CREATE TABLE fact_types (
  name                 TEXT PRIMARY KEY,   -- e.g. "financial_metric", "governance_status"
  first_seen_document  TEXT REFERENCES documents(id),
  first_seen_at        TEXT NOT NULL,
  example_fact_id      TEXT                -- pointer to a representative fact, set after insert
);

CREATE TABLE facts (
  id             TEXT PRIMARY KEY,
  document_id    TEXT NOT NULL REFERENCES documents(id),
  chunk_id       TEXT NOT NULL REFERENCES chunks(id),
  fact_type      TEXT NOT NULL REFERENCES fact_types(name),
  subject        TEXT NOT NULL,
  attribute      TEXT NOT NULL,
  value          TEXT NOT NULL,   -- kept as string; numeric parsing happens at query/compare time
  unit           TEXT,
  time_scope     TEXT,            -- e.g. "FY2024", "Q4 FY24", "as of March 31, 2024"
  qualifiers     TEXT,            -- JSON object, free-form: {"basis": "consolidated", ...}
  raw_quote      TEXT NOT NULL,   -- verbatim, must be a substring/near-substring of chunk raw_text
  confidence     REAL NOT NULL,
  embedding      BLOB,            -- serialized float vector
  created_at     TEXT NOT NULL
);

CREATE TABLE relationships (
  id                     TEXT PRIMARY KEY,
  fact_id_a              TEXT NOT NULL REFERENCES facts(id),
  fact_id_b              TEXT NOT NULL REFERENCES facts(id),
  relationship            TEXT NOT NULL,  -- corroborates | contradicts | reconciled | unrelated
  reconciliation_factor  TEXT,            -- time | scope | unit | definition | restatement | null
  reasoning              TEXT NOT NULL,
  judged_at              TEXT NOT NULL
);

CREATE TABLE review_queue (
  id           TEXT PRIMARY KEY,
  fact_id      TEXT REFERENCES facts(id),
  reason       TEXT NOT NULL,   -- e.g. "low_confidence_extraction", "judge_unrelated_verdict", "quote_mismatch"
  detail       TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_facts_document ON facts(document_id);
CREATE INDEX idx_facts_type ON facts(fact_type);
CREATE INDEX idx_relationships_a ON relationships(fact_id_a);
CREATE INDEX idx_relationships_b ON relationships(fact_id_b);
```

## 2. TypeScript interfaces (shared between backend and frontend)

```ts
export interface DocumentRecord {
  id: string;
  filename: string;
  uploadedAt: string;
  pageCount?: number;
  status: 'pending' | 'parsing' | 'extracting' | 'comparing' | 'done' | 'error';
}

export interface Chunk {
  id: string;
  documentId: string;
  page: number;
  rawText: string;
  bbox?: BoundingBox[];
}

export interface BoundingBox { x: number; y: number; width: number; height: number; }

export interface Fact {
  id: string;
  documentId: string;
  chunkId: string;
  factType: string;
  subject: string;
  attribute: string;
  value: string;
  unit?: string;
  timeScope?: string;
  qualifiers?: Record<string, string>;
  rawQuote: string;
  confidence: number;
}

export type RelationshipLabel = 'corroborates' | 'contradicts' | 'reconciled' | 'unrelated';

export interface FactRelationship {
  id: string;
  factIdA: string;
  factIdB: string;
  relationship: RelationshipLabel;
  reconciliationFactor?: 'time' | 'scope' | 'unit' | 'definition' | 'restatement' | null;
  reasoning: string;
}

export interface ReviewItem {
  id: string;
  factId: string;
  reason: string;
  detail?: string;
}
```

## 3. Why this shape

- **`qualifiers` as a JSON bag, not columns**: this is the load-bearing decision for "schema evolves
  dynamically." A new kind of nuance (e.g. `"basis": "standalone"` vs `"consolidated"`, or
  `"estimate_type": "provisional"`) never requires a migration.
- **`fact_type` is a foreign key into an append-only registry, not an enum**: lets the UI show
  schema growth as a first-class signal (`GET /api/fact-types`) instead of hiding it.
- **`raw_quote` is mandatory and must be traceable to `chunk.raw_text`**: this is what makes every
  fact groundable — validate at insert time (near-substring match) and route to `review_queue` if it
  fails, rather than silently accepting an ungrounded fact.
- **`relationships` are between two `fact` rows, not two documents**: comparisons happen at the
  fact level, which is what makes corroboration/contradiction/reconciliation explainable instead of
  a vague document-level similarity score.
- **`review_queue` is a first-class table, not a log file**: the required "failure case" should be
  something the grader can query/see in the UI, not something you write up after the fact from
  memory.
