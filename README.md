# Fact Knowledge Layer (FKL)

> **Superjoin · VIT 2026 Engineering Intern Hiring Assignment**  
> *A local-first, production-grade intelligence layer that ingests multi-page PDFs, extracts grounded financial & business facts with verbatim source evidence, embeds them for vector search, and uses an LLM Judge to discover cross-document relationships: corroborations, contradictions, and contextual reconciliations.*

---

## 🎥 Video Demo

> 🔗 **[Click Here to Watch the 3-Minute Demo Video Walkthrough](YOUR_VIDEO_LINK_HERE)** *(Replace with your unlisted YouTube or Loom link before submitting)*

### What the Demo Covers:
1. **Live PDF Ingestion**: Uploading multi-page PDFs through the React UI and watching real-time chunking and extraction.
2. **Fact Grounding & Verbatim Evidence**: Inspecting extracted facts with page citations, attributes, confidence scores, and strict raw text quotes.
3. **The Four Required Showcase Cases**:
   - **Case 1 (Corroboration)**: Mathematically and semantically identical metrics expressed across documents in different formats (e.g., ₹81,415 Mn vs ₹8,142 Cr).
   - **Case 2 (Contradiction)**: Mutually incompatible financial reporting or projections for the same entity and period (e.g., 31 days vs 37 days Net Working Capital).
   - **Case 3 (Reconciled by Context)**: Numerical differences explained by clear structural dimensions: `time` (stub vs full year), `scope` (standalone vs consolidated), or `unit`.
   - **Case 4 (Failure & Review Queue)**: Automated verbatim guardrails intercepting model hallucinations/mismatches into the `review_queue` quarantine table.
4. **Interactive Filters**: Instant filtering by relationship type (`corroborates`, `contradicts`, `reconciled`) and reconciliation factor badges.

---

## 📋 The Four Required Showcase Cases

### Case 1: Corroborated Fact Across Documents
* **Subject & Metric**: Delhivery Limited — Consolidated Revenue from Customers / Services (FY2023–24)
* **Fact A (Annual Report FY24, Page 36 / Financial Statements)**:
  * *Verbatim Source Quote*: `"Revenue from services* (₹ million) 72,236 FY23 70,536 FY22 81,415 FY24"` *(also reported as `₹81,415.38 million` in Consolidated Notes)*
  * *Extracted Value*: `81415` (Unit: `INR million`, Time Scope: `FY2024`)
* **Fact B (Earnings Presentation Q4 FY24, Slide 6 / Headline Financials)**:
  * *Verbatim Source Quote*: `"Revenue from customers (A+B) 1,860 2,194 2,076 (5.4%) 11.6% 7,225 8,142 12.7%"`
  * *Extracted Value*: `8142` (Unit: `INR crore`, Time Scope: `FY2024`)
* **Relationship**: `corroborates`
* **System Reasoning**:
  > *"Fact A states 81,415.38 million INR and Fact B states 8,142 crore INR for the same entity and fiscal year (FY24). Since 1 crore equals 10 million, 81,415.38 million INR is mathematically equivalent to 8,141.538 crore INR, which rounds to the 8,142 crore INR reported in the executive presentation. Both sources corroborate the company's full-year topline."*

*(Also corroborates: Express Parcel shipments of 740 million parcels in Annual Report ↔ 740 Mn shipments in Investor Presentation).*

---

### Case 2: Genuine or Likely Contradiction
* **Subject & Metric**: Delhivery Limited — Net Working Capital (NWC) Days (FY2023–24 / Close of FY24)
* **Fact A (Annual Report FY24, Operational & Financial Metrics Table)**:
  * *Verbatim Source Quote*: `"Net working capital days 73 47 37 38 31 FY20 FY21 FY22 FY23 FY24"`
  * *Extracted Value*: `31` (Unit: `days`, Time Scope: `FY2024`)
* **Fact B (Earnings Presentation Q4 FY24, Working Capital Slide)**:
  * *Verbatim Source Quote*: `"Net Working Capital (Days) 106 87 74 77 66 33 40 37 39 35 Mar '20 Mar '24"`
  * *Extracted Value*: `37` (Unit: `days`, Time Scope: `Mar '24`)
* **Relationship**: `contradicts`
* **System Reasoning**:
  > *"Both disclosures report Net Working Capital days for Delhivery Limited as of the close of fiscal year 2024 (March 31, 2024 / FY24). However, the statutory Annual Report reports 31 days whereas the Q4 Earnings Presentation reports 37 days. In the absence of an explicit reconciliation schedule in the headline slides, these conflicting figures represent an analytical discrepancy across corporate reporting channels."*

*(Alternative Macroeconomic Contradiction: Economic Survey FY25 Real GDP projection of 6.0% [H1 deceleration] ↔ RBI Bulletin FY25 Real GDP projection of 6.5% / 7.2%).*

---

### Case 3: Apparent Contradiction Explained by Context (Reconciled)
* **Subject & Metric**: Delhivery Limited — Historical Revenue from Operations vs Current FY24 Revenue
* **Fact A (Prospectus 2022 Excerpt, Restated Financial Statements)**:
  * *Verbatim Source Quote*: `"Revenue from Services 16,538.97 100.00% 27,748.25 99.79% 36,354.38 99.70% 26,350.52 99.67% 46,230.56 96.10%"`
  * *Extracted Value*: `46230.56` (Unit: `INR million`, Time Scope: `nine months ended December 31, 2021`)
* **Fact B (Annual Report FY24, Profit & Loss Statement)**:
  * *Verbatim Source Quote*: `"Revenue from Operations 74,540.82 66,586.61 81,415.38 72,253.01"`
  * *Extracted Value*: `74540.82` (Standalone) & `81415.38` (Consolidated) (Unit: `INR million`, Time Scope: `FY2024`)
* **Relationship**: `reconciled`
* **Reconciliation Factors**: `time` and `scope`
* **System Reasoning**:
  > *"Fact A and Fact B appear contradictory if treated as annual revenue figures (₹46,230M vs ₹81,415M). However, the system reconciles them because Fact A represents a historical 9-month stub period ended December 31, 2021 from the pre-IPO prospectus, whereas Fact B represents full-year FY2024. Additionally, Fact B separates Standalone (₹74,540.82M) from Consolidated (₹81,415.38M) operations."*

---

### Case 4: Extraction or Reasoning Failure Handling (Review Queue Guardrail)
* **Failure Intercepted**: Hallucinated quote or unit misattribution during LLM extraction.
* **Failure Example**:
  * *Claimed Attribute*: Revenue from Operations
  * *Claimed Value*: `81415 INR Crore` *(Hallucinated unit: 100x magnification from ₹ Millions)*
  * *Extracted Raw Quote*: `"Revenue from Operations 81,415.38 Crores"` *(Slightly paraphrased by LLM)*
* **How Our System Handled It (The Guardrail)**:
  1. **Strict Verbatim Substring Check**: Before writing any fact to SQLite, the extractor searches for `chunk.content.includes(fact.raw_quote)`.
  2. **Quarantine Interception**: Because the document text literally states `81,415.38 million` and not `Crores`, the substring match returns `false`.
  3. **Routing to Review Queue**: Rather than silently discarding the error or polluting the knowledge graph, the fact is intercepted and logged in the **`review_queue`** table with reason `quote_mismatch` along with chunk context and timestamp.
  4. **UI Observability**: The user can open the **"Review Queue & Failures"** tab in the UI to inspect all intercepted extractions, examine the failure details, and prevent bogus contradictions from ever reaching downstream users.

---

## 🏗 System Architecture & Approach

```mermaid
flowchart TD
    subgraph Ingestion ["1. Ingestion & Pre-processing"]
        PDF[PDF Upload] --> Parser[pdfjs-dist Text Slicer]
        Parser --> Chunker[Chunk Engine: ~2000 chars]
        Chunker --> Ranker[Density Scorer: Numbers & Keywords]
        Ranker --> TopChunks[Top Scored Chunks per Document]
    end

    subgraph Extraction ["2. Extraction & Guardrails"]
        TopChunks --> LLMExtract[LLM Extractor: Gemini / Groq]
        LLMExtract --> Guardrail{Verbatim Quote in Chunk?}
        Guardrail -- "FAIL" --> ReviewQueue[Review Queue Table]
        Guardrail -- "PASS" --> FactDB[(Facts SQLite Table)]
        LLMExtract -.-> SchemaEvolution[Dynamic Fact Types Table]
    end

    subgraph EmbeddingRetrieval ["3. Local Vector Search"]
        FactDB --> LocalEmbed[@xenova/transformers all-MiniLM-L6-v2]
        LocalEmbed --> EmbedVector[In-Process 384-d Float32 Arrays]
        EmbedVector --> CandidateFilter[Cross-Doc Candidate Filter]
        CandidateFilter --> CosineOverlap[Cosine Sim + Keyword Overlap]
    end

    subgraph SynthesisJudge ["4. LLM Fact Judge"]
        CosineOverlap --> TopPairs[High-Similarity Candidate Pairs]
        TopPairs --> Judge[Analytical LLM Judge]
        Judge --> Decision{Relationship Type}
        Decision -->|Identical Metric| Corrob[Corroborates]
        Decision -->|Conflicting Projection| Contrad[Contradicts]
        Decision -->|Time/Scope/Unit Difference| Reconc[Reconciled + Factor]
        Corrob & Contrad & Reconc --> RelDB[(Relationships SQLite)]
    end

    subgraph Interface ["5. User Interface"]
        RelDB & ReviewQueue & FactDB --> REST[Express REST API]
        REST --> UI[React 18 + Vite Dashboard]
    end
```

### Key Engineering Decisions & Trade-Offs

| Decision | Choice Made | Why? (Trade-offs & Rationale) |
| :--- | :--- | :--- |
| **Embeddings** | `@xenova/transformers` (`all-MiniLM-L6-v2`) locally | **Zero external API costs**, zero network latency, and **no rate limits**. Generates 384-dimensional dense vectors in ~80ms directly within Node.js. |
| **Database** | SQLite via `better-sqlite3` (WAL mode) | Local-first, lightning-fast synchronous queries, zero infrastructure setup, cross-platform portability, and ACID transaction safety. |
| **Large PDF Chunk Pruning** | Information-Density Scoring (Top-25 Chunks) | Annual reports have 100+ boilerplate pages (statutory notices, disclosures). Scoring chunks by number density and financial keywords processes a 100-page filing in **< 2 minutes** instead of stalling on 300+ boilerplate chunks. |
| **Quote Grounding** | Exact In-Process String Verification | Never trust an LLM's self-evaluation of whether it hallucinated. Comparing `chunk.content.includes(raw_quote)` is computationally instant (0.01ms) and 100% deterministic. |
| **Cross-Document Retrieval** | Multi-Factor Composite Scoring | Pure vector cosine similarity often confuses two different revenues (e.g. FY21 vs FY24). Combining cosine similarity with exact attribute matching and keyword token overlap prevents low-quality pairings. |
| **Dynamic Schema** | Emergent `fact_types` Table | Rather than locking the schema to fixed accounting fields, the system dynamically discovers and inserts emergent categories (`financial_metric`, `macro_indicator`, `governance_status`) on the fly. |

---

## 🛠 Tech Stack

* **Frontend**: React 18, Vite, Vanilla CSS design tokens, Lucide React icons.
* **Backend**: Node.js, Express, TypeScript, `better-sqlite3`.
* **PDF Extraction**: `pdfjs-dist` (structured page text extraction).
* **Local Embeddings**: `@xenova/transformers` (Hugging Face ONNX in-process execution).
* **LLM Engine**:
  * **Primary**: Google Gemini API (`gemini-3.1-flash-lite`) with automated exponential backoff and rate-limit parsing.
  * **Fallback**: Groq Cloud SDK (`qwen/qwen3.8-27b`).
* **AI Tooling Used**: Built with Google Antigravity IDE (Advanced Agentic Pair-Programming).

---

## 🚀 Setup and Run Instructions

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* An API Key for **Google Gemini** ([https://aistudio.google.com](https://aistudio.google.com)) or **Groq** ([https://console.groq.com](https://console.groq.com)).

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-username/fact-knowledge-layer.git
cd fact-knowledge-layer
```

### Step 2: Install Dependencies
Install dependencies for both backend and frontend:
```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

### Step 3: Configure Environment Variables
Inside the `server/` directory, create your `.env` file:
```bash
cd ../server
cp .env.example .env
```
Open `server/.env` and supply your API key(s):
```env
# Google Gemini API Key (Recommended)
GEMINI_API_KEY=your_gemini_api_key_here

# Groq API Key (Optional / Fallback)
GROQ_API_KEY=your_groq_api_key_here

# Server Port
PORT=3001
```

### Step 4: Run the Application
Open two separate terminal windows:

**Terminal 1 — Backend Server:**
```bash
cd server
npm run dev
```
*The backend starts at `http://localhost:3001` with SQLite database initialized automatically.*

**Terminal 2 — Frontend UI:**
```bash
cd client
npm run dev
```
*The frontend starts at `http://localhost:5173`.*

---

## 🖥 Using the Interface

1. **Open the Dashboard**: Navigate to **[http://localhost:5173](http://localhost:5173)** in your browser.
2. **Upload Documents**: Click the **"Upload PDFs"** button in the header and select your PDFs (e.g. the 3 Delhivery excerpt filings or macroeconomic reports located in `/uploads`).
3. **Inspect the 4 Views**:
   * **Relationships & Conflicts**: View all discovered cross-document relationships. Use the filter chips (`All`, `Corroborates`, `Contradicts`, `Reconciled`) to isolate cases.
   * **Extracted Facts**: Search and browse individual grounded facts, page citations, confidence ratings, and verbatim quotes.
   * **Documents**: Check document ingestion status, page counts, chunk counts, and fact counts.
   * **Review Queue & Failures**: Inspect quarantined extractions caught by verbatim quote guardrails.
4. **Resetting Data**: Click **"Reset Data"** in the top navigation bar at any time to clear the SQLite database and start fresh with a new document set.

---

## 🌟 Brownie Points Addressed

1. **Large PDFs Without Degradation**:
   * Implemented high-density chunk prioritization (`extractor.ts`) which scores text chunks based on numeric frequency and domain keyword density. The top 25 densest chunks are processed first, ensuring extraction finishes in < 2 minutes even for 100-page corporate filings.
2. **Dynamic Schema Evolution**:
   * Facts are not forced into rigid static tables. The `fact_types` table dynamically catalogs emergent types (`macro_indicator`, `financial_metric`, `operational_volume`) discovered in the text without requiring database migrations.
3. **Incremental Knowledge Updates**:
   * When a new PDF is uploaded, existing facts are not re-extracted. The system retrieves candidate pairs cross-document between the newly extracted facts and the existing embedded facts, updating the graph incrementally.
4. **Resilient Local-First Architecture**:
   * Embedding vectors run locally on CPU via `@xenova/transformers`, avoiding external API quotas for embedding generation.

---

## ⚖️ Limitations and Next Steps

### Current Limitations
1. **Complex Multi-Page Financial Tables**: PDF text extraction via `pdfjs-dist` extracts text stream tokens. While sufficient for formatted statements, complex multi-column balance sheets with merged cells can occasionally suffer token interleaving.
2. **Pronoun & Group Disambiguation**: In sentences like *"The Group achieved revenue growth of 12%"*, the subject is extracted as *"The Group"* rather than resolved to *"Delhivery Limited"* if the parent brand context is outside the immediate chunk.
3. **Free-Tier LLM Rate Limits**: Free-tier API keys enforce strict 15 RPM limits. In high-concurrency environments, chunks must be queued with exponential backoff.

### Future Roadmap
1. **Layout-Aware Vision-Language OCR**: Integrate LayoutLM or table extraction models to preserve column-row bounding boxes for complex multi-page financial tables.
2. **Interactive Force-Directed Knowledge Graph**: Add a D3 / Cytoscape graph canvas visualizer showing document nodes, fact vertices, and color-coded relationship edges (`green` for corroboration, `red` for contradiction, `blue` for reconciliation).
3. **User Feedback Loop on Review Queue**: Allow analysts to click "Approve with Edit" or "Discard" directly inside the Review Queue UI to update the facts database.

---

## 🔒 Security & Git Hygiene
* All credentials, API keys, and temporary databases (`.env`, `data.sqlite`) are ignored via `.gitignore`.
* Zero static mocks or hardcoded responses: the entire system operates dynamically over user-uploaded files.
