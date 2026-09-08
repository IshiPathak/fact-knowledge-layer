# TASKS — Build Plan

Read `PRD.md`, `TRD.md`, and `SCHEMA.md` first. Build in this order; each phase should leave the app
in a runnable state. Don't jump ahead to brownie points before Phase 1–5 work end-to-end on the
starter dataset.

## Phase 0 — Scaffold
- [ ] Node/Express/TypeScript backend, React+TS (Vite) frontend, in one repo (`/server`, `/client`).
- [ ] SQLite file created from `SCHEMA.md` DDL on startup (simple migration runner, no ORM needed).
- [ ] `.env.example` with `GROQ_API_KEY` / `GEMINI_API_KEY` placeholders. No real keys committed.
- [ ] `POST /api/documents` accepts a PDF upload and stores it to disk; returns a `documentId`
      immediately with `status: pending`.

## Phase 1 — Parse & chunk
- [ ] Integrate `pdfjs-dist`; extract per-page text + bounding boxes.
- [ ] Chunk by paragraph/section (heuristic: blank-line or heading-style breaks; fall back to ~500
      word windows only if no structure is detected).
- [ ] Persist `chunks` rows. Verify on one starter PDF that chunk boundaries look sane (spot check).
- [ ] `GET /api/documents/:id/evidence/:chunkId` returns chunk text + bbox.

## Phase 2 — Extraction
- [ ] Write the extraction prompt (see TRD §2) and a thin LLM client wrapping Groq (fallback Gemini).
- [ ] Run one chunk through it manually, confirm JSON parses and `raw_quote` is actually a substring
      of the chunk (build the validator now, not later — it's what feeds `review_queue`).
- [ ] Batch/stream through all chunks of one document; persist `facts` + register new `fact_types`.
- [ ] Sanity-check output on the Delhivery Q4 presentation (smallest doc) before running the larger
      100-page excerpts.

## Phase 3 — Embedding + candidate retrieval
- [ ] Integrate `@xenova/transformers`, embed each fact on insert, store as BLOB.
- [ ] Implement nearest-neighbor retrieval (cosine similarity in JS is fine at this scale) restricted
      to facts from *other* documents, pre-filtered by loose subject/attribute overlap.
- [ ] Manually inspect candidate pairs for a handful of facts — this is where you'll first see
      whether extraction quality is good enough to compare meaningfully.

## Phase 4 — Judge & relationships
- [ ] Write the judge prompt (TRD §2), call it per candidate pair, persist to `relationships`.
- [ ] Route `unrelated` verdicts and low-confidence facts to `review_queue` instead of discarding.
- [ ] Run the full pipeline on **all 6 starter PDFs** end to end.

## Phase 5 — Find and confirm the four cases
- [ ] Query `relationships` for `corroborates`, `contradicts`, `reconciled` examples; manually verify
      each against the source PDFs (open the page, confirm the quote is real and the reasoning
      makes sense). Pick the clearest real one of each for the demo — don't hand-pick facts, pick
      among what the system actually found.
- [ ] Review `review_queue` for a genuine failure; if nothing interesting surfaced yet, that's a
      signal to look harder at extraction on a table-heavy page (financial statements are the
      likely weak point) — don't manufacture a fake failure.

## Phase 6 — Frontend
- [ ] Upload panel with processing status polling.
- [ ] Fact list/table with filters (document, type, confidence).
- [ ] Fact detail view: evidence rendered over the actual PDF page (`react-pdf` + bbox overlay),
      relationship panel with color coding + reasoning text.
- [ ] Fact-types panel showing when each type first appeared.
- [ ] Review-queue panel.

## Phase 7 — Brownie points (only after 1–6 work solidly)
- [ ] Confirm large-PDF handling is already satisfied by the streaming design (Phase 1–2); note this
      in the README rather than re-engineering.
- [ ] Confirm incremental ingestion works: upload a 7th unseen PDF, verify only its facts get
      extracted and only new-vs-existing comparisons run (check timestamps/counts, don't just assume).
- [ ] Add a small "schema growth" test: process macro docs first, then Delhivery docs, confirm new
      `fact_type`s appear and old ones aren't touched.

## Phase 8 — Package for submission
- [ ] README with the 5 required sections (Setup, Video, Approach, Limitations, Additional Notes).
- [ ] Record the 3-minute demo: one upload, then walk through the four cases directly in the UI.
- [ ] Double-check no API keys are committed; `.env` is gitignored.

## Explicitly do not do
- Don't hardcode fact types, document names, or expected values anywhere in extraction/comparison
  logic — the grader will test with unseen PDFs.
- Don't build entity resolution or table-parsing perfection — name these as known limitations
  instead of quietly working around them with special-cased code.
- Don't skip the `review_queue`/failure-case work to save time — it's a required deliverable, not
  optional polish.
