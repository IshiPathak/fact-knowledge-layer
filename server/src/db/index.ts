import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../data.sqlite');
export const db = new Database(dbPath);

// Initialize schema
db.pragma('journal_mode = WAL');

const schema = `
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  filename      TEXT NOT NULL,
  uploaded_at   TEXT NOT NULL,
  page_count    INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS chunks (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id),
  page          INTEGER NOT NULL,
  char_start    INTEGER,
  char_end      INTEGER,
  bbox          TEXT,
  raw_text      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_types (
  name                 TEXT PRIMARY KEY,
  first_seen_document  TEXT REFERENCES documents(id),
  first_seen_at        TEXT NOT NULL,
  example_fact_id      TEXT
);

CREATE TABLE IF NOT EXISTS facts (
  id             TEXT PRIMARY KEY,
  document_id    TEXT NOT NULL REFERENCES documents(id),
  chunk_id       TEXT NOT NULL REFERENCES chunks(id),
  fact_type      TEXT NOT NULL REFERENCES fact_types(name),
  subject        TEXT NOT NULL,
  attribute      TEXT NOT NULL,
  value          TEXT NOT NULL,
  unit           TEXT,
  time_scope     TEXT,
  qualifiers     TEXT,
  raw_quote      TEXT NOT NULL,
  confidence     REAL NOT NULL,
  embedding      BLOB,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationships (
  id                     TEXT PRIMARY KEY,
  fact_id_a              TEXT NOT NULL REFERENCES facts(id),
  fact_id_b              TEXT NOT NULL REFERENCES facts(id),
  relationship           TEXT NOT NULL,
  reconciliation_factor  TEXT,
  reasoning              TEXT NOT NULL,
  judged_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_queue (
  id           TEXT PRIMARY KEY,
  fact_id      TEXT REFERENCES facts(id),
  reason       TEXT NOT NULL,
  detail       TEXT,
  created_at   TEXT NOT NULL
);

-- Note: 'CREATE INDEX IF NOT EXISTS' is supported in SQLite
CREATE INDEX IF NOT EXISTS idx_facts_document ON facts(document_id);
CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(fact_type);
CREATE INDEX IF NOT EXISTS idx_relationships_a ON relationships(fact_id_a);
CREATE INDEX IF NOT EXISTS idx_relationships_b ON relationships(fact_id_b);
`;

db.exec(schema);
console.log('Database initialized successfully.');
