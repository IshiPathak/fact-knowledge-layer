# PRD — Fact Knowledge Layer

## 1. Problem

Important facts about a company or economy are scattered across many documents, restated in
different ways, at different times, in different units, by different authors. Nobody has a single
place to see: "here's a fact, here's the exact sentence it came from, and here's every other place
that agrees, disagrees, or needs context to reconcile with it."

We are building that layer. Not a chatbot, not a graph viewer — a system that reads PDFs, pulls out
grounded facts, and actively compares them against each other.

## 2. Goals

- Upload any PDF (not just the starter set) and get back structured facts, each tied to the exact
  text/page it came from.
- Automatically detect when two facts from different documents **corroborate**, **contradict**, or
  are only an **apparent contradiction** that context (time period, scope, units, restatement)
  resolves.
- Surface this through a simple API + UI, not a static export.
- Generalize: no hardcoded filenames, fact types, or document-specific rules. The schema should be
  discovered from the documents, not defined up front.

## 3. Non-goals

- Not building a general-purpose RAG chatbot over the PDFs.
- Not a knowledge graph visualization tool as the primary deliverable (explicitly called out as
  insufficient on its own).
- Not aiming for 100% extraction recall/precision — an honest, understandable prototype beats a
  black box.

## 4. Starter dataset (what we're actually grounding against)

Two independent 3-document sets, each internally overlapping:

**`delhivery/`** — logistics company, same entity, three disclosure types over time:
1. IPO Prospectus (2022) — restated financials, business description, pre-IPO governance
2. Annual Report FY24 — full financial statements, MD&A, ESG data, governance as of FY24
3. Q4 FY24 Earnings Presentation — investor-facing summary metrics for the same period

These three describe the *same company* at overlapping/different points in time, using different
levels of precision and sometimes different revenue definitions (e.g. "Revenue from Operations" in
the annual report's financial statements vs. "FY24 revenue from services" headline figure in the
earnings deck — same period, likely different scope). This is a natural source of case 3
(apparent contradiction reconciled by definition/scope), plus director/governance facts that can
be corroborated or shown to change between the 2022 prospectus and the FY24 annual report.

**`india-macroeconomy/`** — three independent institutions describing the same economy:
1. Economic Survey 2024-25 (Government of India)
2. RBI Annual Report 2024-25 (central bank)
3. IMF Article IV Consultation 2025 (external, international)

Same underlying economy (GDP growth, inflation, external sector), different publishers, different
data vintages/estimates, different fiscal-year vs calendar-year conventions. This is a rich source
of corroboration (multiple sources citing similar GDP/CPI figures) and genuine or apparent
contradiction (revised estimates, different reference periods, provisional vs. final data).

The system must not hardcode any of this — it should be discovered per-run. These two datasets are
just where we prove it works, and the grader will test with **additional PDFs**.

## 5. User stories

1. As a user, I upload a PDF and see a list of extracted facts with the exact source sentence(s)
   highlighted, within a reasonable time.
2. As a user, I click a fact and see every related fact from other documents, labeled
   corroborates / contradicts / reconciled, with the reasoning spelled out in plain language.
3. As a user, I can see facts organized by an emergent "type" (financial metric, governance/
   personnel, macro indicator, etc.) without that taxonomy being predefined by the developer.
4. As a grader, I can upload an unseen PDF from a similar domain and the system extracts facts and
   attempts cross-document comparison without code changes.
5. As a grader, I can see the system's own failure cases surfaced, not hidden.

## 6. The four required cases — what "done" looks like

1. **Corroboration** — e.g. a macro figure (like FY25 real GDP growth or CPI inflation) stated
   independently in two of the three macro documents in compatible terms, shown side by side with
   both source quotes and a plain-language explanation of why they agree.
2. **Contradiction** — e.g. two documents giving materially different figures for the *same*
   entity, period, and unit with no obvious reconciling factor (governance status, a revised
   estimate presented as final in one place, etc.).
3. **Apparent contradiction reconciled by context** — e.g. the annual report's "Revenue from
   Operations" vs. the earnings deck's "FY24 revenue from services" for Delhivery: different
   numbers, same company, same year, but different **scope/definition** — the system should
   articulate *why* they differ rather than just flagging a mismatch.
4. **A real failure, shown honestly** — something the extractor or judge got wrong (misread a
   table, matched two unrelated facts, mis-attributed a time period), documented with what
   happened and how it was caught/fixed/would be fixed. This must be a real observed failure, not
   staged.

## 7. Functional requirements

- **Upload**: PDF in → processing status → facts out. Works for the 6 starter PDFs (up to ~100
  pages each) and for new, unseen PDFs.
- **Fact record**: every fact has subject, attribute, value (+unit if numeric), time/scope
  qualifiers, a verbatim supporting quote, source doc + page, and a confidence score.
- **Evidence view**: clicking a fact shows the quote in context (ideally highlighted on the actual
  PDF page).
- **Relationships**: every fact that has been compared shows its relationship(s) to other facts,
  with a reasoning string — not just a label.
- **Schema visibility**: the UI shows what fact types currently exist and lets you see when a new
  one was introduced by a given document.
- **Incremental**: adding a new document should not require reprocessing/re-comparing everything
  from scratch (see brownie points).

## 8. Success criteria

- Runs end-to-end from clean clone with documented setup steps.
- Produces at least one clear, well-evidenced example of each of the 4 cases from the actual
  starter PDFs.
- Survives an unseen PDF being dropped in without code changes (schema/types adapt).
- The README explains trade-offs honestly, including where extraction/comparison is unreliable.

## 9. Out of scope / explicitly acceptable to punt on

- Perfect OCR/table extraction from scanned or image-heavy pages.
- Full formal ontology or entity resolution across arbitrarily different naming conventions —
  approximate/LLM-assisted matching is acceptable and should be described as such.
- Authentication, multi-user, production deployment.
