# TRD — Fact Knowledge Layer

## 1. Stack (free-tier only)

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express + TypeScript | Requested stack, fast to iterate |
| Frontend | React + TypeScript (Vite) | Requested stack |
| PDF parsing | `pdfjs-dist` | Gives per-page text **and** position/bounding-box data needed for evidence highlighting — `pdf-parse` only gives flat text |
| Embeddings | `@xenova/transformers` (`all-MiniLM-L6-v2`), runs locally in Node | Free, no API key, no rate limit, good enough for semantic fact matching at this scale |
| LLM (extraction + judging) | Groq (Llama 3.3 70B) primary, Gemini 2.0/2.5 Flash as fallback | Both have usable free tiers; Groq is fast enough for interactive use |
| Storage | SQLite via `better-sqlite3` | Zero setup, file-based, trivially portable in a demo repo; a graph DB was explicitly called out as *not* the point |
| Queue | In-process async queue (p-queue) | No infra needed at this scale; document per job |

No paid services required. If a key is missing, the system should degrade gracefully (log + skip)
rather than crash, so the grader can run it with their own free key.

## 2. Pipeline

```
PDF upload
   │
   ▼
1. Parse (pdfjs-dist)              → per-page text + bounding boxes
   │
   ▼
2. Chunk                            → paragraph/section-level chunks, not fixed token windows
   │  {docId, page, chunkId, charOffsets, rawText}
   ▼
3. Extract (LLM, per chunk/batch)   → candidate facts (structured JSON, schema-flexible)
   │
   ▼
4. Type registry update             → new fact_type seen? register it, log the schema growth event
   │
   ▼
5. Embed (transformers.js)          → vector per fact (subject+attribute+quote)
   │
   ▼
6. Candidate retrieval              → nearest neighbors by embedding + loose subject/attribute match,
   │                                   restricted to facts NOT from the same document
   ▼
7. Judge (LLM, per candidate pair)  → relationship: corroborates | contradicts | reconciled | unrelated
   │                                   + reasoning + reconciliation_factor (time/scope/unit/definition)
   ▼
8. Persist facts + relationships + evidence spans → SQLite
   │
   ▼
9. Serve via API → React UI renders facts, evidence, relationship graph per fact
```

Steps 3 and 7 are the only LLM calls in the hot path; everything else is deterministic or local, which
keeps cost and latency manageable on free tiers.

### Why chunk-then-extract, not extract-the-whole-PDF-at-once
100-page PDFs blow context budgets and produce vague, unattributable facts. Chunking keeps each
extraction call small, keeps evidence spans tight and verifiable, and lets processing be
parallelized/streamed — this also solves the "large PDFs" brownie point directly rather than as an
afterthought.

### Extraction prompt shape (not hardcoded to any topic)
Ask the model to read one chunk and return zero or more facts as JSON:
```json
{
  "subject": "Delhivery Limited",
  "attribute": "revenue from operations",
  "value": "8142",
  "unit": "INR crore",
  "time_scope": "FY2024",
  "qualifiers": {"basis": "consolidated", "source_context": "earnings presentation headline figure"},
  "fact_type": "financial_metric",
  "raw_quote": "<verbatim sentence/phrase from the chunk, <40 words>",
  "confidence": 0.0-1.0
}
```
`fact_type` is proposed by the model per-fact, not chosen from a fixed enum — this is what lets the
schema evolve (§4 in SCHEMA.md).

### Judge prompt shape
Given two facts (with their raw quotes and doc/time metadata) that share subject+attribute
similarity, ask for:
```json
{
  "relationship": "corroborates | contradicts | reconciled | unrelated",
  "reasoning": "one or two sentences, must reference the actual quotes/values",
  "reconciliation_factor": "time | scope | unit | definition | restatement | null"
}
```
`unrelated` exists so the judge can reject near-miss candidates instead of forcing a verdict — this
is how failure case #4 gets surfaced honestly (log judge disagreements/low-confidence verdicts to a
`review_queue` table instead of hiding them).

## 3. API

| Method & path | Purpose |
|---|---|
| `POST /api/documents` | Upload PDF (multipart), enqueue processing, return `{ documentId, status }` |
| `GET /api/documents/:id` | Processing status + summary counts |
| `GET /api/documents/:id/evidence/:chunkId` | Chunk text + bounding box for highlighting |
| `GET /api/facts?docId=&type=&q=` | List/filter facts |
| `GET /api/facts/:id` | Single fact + its evidence |
| `GET /api/facts/:id/relations` | Related facts with relationship + reasoning |
| `GET /api/fact-types` | Current type registry, with `firstSeenInDocumentId` per type |
| `GET /api/review-queue` | Low-confidence extractions / rejected judge calls (failure case surface) |

## 4. Frontend (React)

- **Upload panel** — drag/drop, shows per-document processing progress.
- **Fact table/list** — filterable by document, type, confidence; click-through to detail.
- **Fact detail** — raw quote highlighted over the rendered PDF page (`react-pdf` + overlay div
  positioned from the bounding box captured in step 1), plus a relationship panel: green
  (corroborates) / red (contradicts) / amber (reconciled), each with the reasoning text and a link
  to the other fact's evidence.
- **Schema panel** — list of fact types and when each first appeared, so schema evolution across
  documents is visible, not just assumed.
- **Review queue panel** — the honest "what went wrong" view for case 4.

## 5. Brownie points → concrete implementation notes

- **Large PDFs**: page-by-page streaming through the parse→chunk→extract pipeline; never load a
  full 100-page doc into one LLM call.
- **Many PDFs**: candidate retrieval (step 6) is nearest-neighbor via embeddings + type match, not
  all-pairs comparison — keeps cost near-linear as the fact store grows.
- **Incremental ingestion**: new document only triggers extraction on itself; comparison step only
  runs new-facts-vs-existing-facts, never reprocesses prior documents. This falls out naturally from
  steps 6–7 being scoped to "new fact vs. existing index," not "all facts vs. all facts."
- **Evolving schema**: type registry (§4 above) is append-only and versioned; no code change needed
  for a new `fact_type` string to show up correctly in the UI.

## 6. Known limitations to state plainly in the README

- Embedding + LLM judge matching is approximate; entity resolution (e.g. matching two differently
  worded addresses or company name variants) is best-effort, not guaranteed.
- Table-heavy pages (financial statements) are the hardest extraction case — pdfjs-dist gives text
  order that doesn't always preserve tabular structure; this should be named directly as a
  known weak point rather than obscured, and used as a real source for the required failure case.
- Free-tier LLM rate limits mean full re-runs on the 6 starter PDFs may take a few minutes.
