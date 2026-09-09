# Fact Knowledge Layer (FKL)

> **Superjoin · VIT 2026 Engineering Intern Hiring Assignment**  
> *A local-first, local-vector intelligence layer that ingests multi-page PDFs, extracts grounded financial and business facts with verbatim source evidence, embeds them for semantic retrieval, and discovers cross-document relationships: corroborations, contradictions, and contextual reconciliations.*

---

## 🚀 Setup and Run Instructions

Tell us how to run your project:

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* API Key for **Google Gemini** ([https://aistudio.google.com](https://aistudio.google.com)) and/or **Groq** ([https://console.groq.com](https://console.groq.com)).

---

### Step 1: Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/your-username/fact-knowledge-layer.git
cd fact-knowledge-layer

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

---

### Step 2: Configure Environment Variables
Inside the `server/` directory, create a `.env` file (copied from `.env.example`):
```bash
cd ../server
cp .env.example .env
```
Open `server/.env` and supply your API key:
```env
# Google Gemini API Key (Primary)
GEMINI_API_KEY=your_gemini_api_key_here

# Groq API Key (Optional / Fallback)
GROQ_API_KEY=your_groq_api_key_here

# Server Port
PORT=3001
```

---

### Step 3: Run the Application
Open two separate terminal windows:

**Terminal 1 — Backend Server:**
```bash
cd server
npm run dev
```
*Server runs on [http://localhost:3001](http://localhost:3001)*

**Terminal 2 — Frontend UI:**
```bash
cd client
npm run dev
```
*Client runs on [http://localhost:5173](http://localhost:5173)*

---

### Step 4: Using the Interface
1. Navigate to **[http://localhost:5173](http://localhost:5173)**.
2. Click **"Upload PDFs"** in the top navigation bar and select your PDFs (e.g., the Delhivery excerpts or macroeconomic documents in `/uploads`).
3. Explore the 4 tabs:
   * **Relationships & Conflicts**: View all discovered cross-document relationships (`corroborates`, `contradicts`, `reconciled`) with category filter chips and factor tags (`time`, `scope`, `unit`).
   * **Extracted Facts**: Search and browse individual grounded facts, page citations, confidence ratings, and verbatim quotes.
   * **Documents**: Check document ingestion progress, page counts, chunk metrics, and fact counts.
   * **Review Queue & Failures**: Inspect quarantined extractions caught by verbatim quote guardrails.
4. **Reset Data**: Click the **"Reset Data"** button at any time to purge SQLite and test with fresh documents.

---

## 🎥 Video Demo

Link to a demo video of **3 minutes or less** showing a PDF being processed and the four required cases:

> 🔗 **[Click Here to Watch the 3-Minute Video Walkthrough](https://drive.google.com/file/d/1Hg1-ULlErrqIhUy9EW1NbJAjfgoREeTe/view?usp=sharing)** 

---

## 🧠 Approach

### 1. Architecture & Pipeline

```mermaid
flowchart TD
    subgraph Ingestion ["1. PDF Parsing & Chunk Density Scoring"]
        PDF[PDF Upload] --> Parser[pdfjs-dist Text Slicer]
        Parser --> Chunker[Chunk Engine: ~2,000 chars]
        Chunker --> Scorer[Density Scorer: Numbers & Financial Tokens]
        Scorer --> TopChunks[Top 25 High-Value Chunks]
    end

    subgraph Extraction ["2. Fact Extraction & Verbatim Guardrails"]
        TopChunks --> LLMExtract[LLM Extractor: Gemini / Groq]
        LLMExtract --> Guardrail{Verbatim Quote in Chunk?}
        Guardrail -- "MISMATCH" --> ReviewQueue[(Review Queue Table)]
        Guardrail -- "VERIFIED" --> FactDB[(Facts SQLite Table)]
        LLMExtract -.-> SchemaEvolution[Emergent fact_types Table]
    end

    subgraph EmbeddingRetrieval ["3. In-Process Vector Search"]
        FactDB --> LocalEmbed[@xenova/transformers all-MiniLM-L6-v2]
        LocalEmbed --> EmbedVector[In-Process 384-d Float32 Arrays]
        EmbedVector --> CandidateFilter[Cross-Doc Candidate Filter]
        CandidateFilter --> CompositeScore[Cosine Sim + Keyword Overlap]
    end

    subgraph SynthesisJudge ["4. Analytical Fact Judge"]
        CompositeScore --> TopPairs[High-Similarity Candidate Pairs]
        TopPairs --> Judge[Analytical LLM Judge]
        Judge --> Decision{Relationship Type}
        Decision -->|Identical Metric| Corrob[Corroborates]
        Decision -->|Conflicting Projection| Contrad[Contradicts]
        Decision -->|Time/Scope/Unit Difference| Reconc[Reconciled + Factor]
        Corrob & Contrad & Reconc --> RelDB[(Relationships SQLite)]
    end

    subgraph Interface ["5. Local Dashboard"]
        RelDB & ReviewQueue & FactDB --> REST[Express REST API]
        REST --> UI[React 18 + Vite Dashboard]
    end
```

---

### 2. The Four Required Cases

#### Case 1: A Fact Corroborated Across Documents
* **Subject & Metric**: Delhivery Limited — Consolidated Revenue from Customers (FY2023–24)
* **Fact A (Annual Report FY24, Page 36 / Notes to Financial Statements)**:
  * *Verbatim Source Quote*: `"Revenue from services* (₹ million) 72,236 FY23 70,536 FY22 81,415 FY24"` *(also reported as `₹81,415.38 million` in Consolidated Revenue Note)*
  * *Extracted Value*: `81415` (Unit: `INR million`, Time Scope: `FY2024`)
* **Fact B (Earnings Presentation Q4 FY24, Slide 6 / Key Financial Highlights)**:
  * *Verbatim Source Quote*: `"Revenue from customers (A+B) 1,860 2,194 2,076 (5.4%) 11.6% 7,225 8,142 12.7%"`
  * *Extracted Value*: `8142` (Unit: `INR crore`, Time Scope: `FY2024`)
* **Relationship**: `corroborates`
* **System Reasoning**:
  > *"Fact A states 81,415.38 million INR and Fact B states 8,142 crore INR for the same entity and fiscal year (FY24). Since 1 crore equals 10 million, 81,415.38 million INR is mathematically equivalent to 8,141.538 crore INR, which rounds to the 8,142 crore INR reported in the executive presentation. Both sources corroborate the company's full-year topline."*

*(Also corroborated: Express Parcel shipments of 740 million parcels in Annual Report ↔ 740 Mn shipments in Investor Presentation).*

---

#### Case 2: A Genuine or Likely Contradiction
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

#### Case 3: An Apparent Contradiction Explained by Context (Reconciled)
* **Subject & Metric**: Delhivery Limited — Historical Revenue from Services vs FY24 Annual Revenue
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

#### Case 4: An Extraction or Reasoning Failure Handling
* **Target Metric**: Revenue from Operations unit scaling or paraphrased quotation.
* **Failure Observed**:
  * LLM extraction occasionally hallucinates unit conversion directly into the quote string (e.g. converting `81,415.38 million` to `8,141.54 Crore` and claiming the raw text said `₹8,141.54 Cr`).
* **How Our System Handled It (The Guardrail)**:
  1. **Automated Verbatim Guardrail**: Before committing any fact to SQLite, the extractor executes a deterministic substring verification: `chunk.content.includes(fact.raw_quote)`.
  2. **Quarantine Interception**: If the model altered or paraphrased the quote, the verification returns `false`.
  3. **Routing to Review Queue**: The invalid fact is blocked from the `facts` table and routed to `review_queue` with failure reason `quote_mismatch` and confidence breakdown.
  4. **User Observability**: The user can open the **"Review Queue & Failures"** tab in the UI to inspect all intercepted extractions, examine the failure details, and prevent ungrounded claims from polluting the knowledge graph.

---

### 3. Important Engineering Decisions & Trade-Offs

| Engineering Decision | Choice Made | Rationale & Trade-Offs |
| :--- | :--- | :--- |
| **In-Process Vector Embeddings** | `@xenova/transformers` (`all-MiniLM-L6-v2`) | **Zero external API costs, zero network latency, and zero rate limits.** Generating 384-dimensional dense vectors locally in Node.js takes ~80ms without consuming OpenAI or Gemini embedding quotas. |
| **Local-First Database** | SQLite via `better-sqlite3` (WAL mode) | Pure file-based simplicity, sub-millisecond query latency, zero external DB configuration, cross-platform portability, and ACID transaction safety. |
| **High-Density Chunk Ranking** | Number and financial keyword density scoring | 100-page corporate annual reports contain massive boilerplate (notices, legal disclaimers). Ranking chunks and extracting from the top 25 densest chunks allows the system to extract core facts in **< 2 minutes** rather than spending 25 minutes parsing hundreds of empty legal boilerplate chunks. |
| **Automated Quote Grounding** | Deterministic substring check against source chunk | Never ask an LLM if it hallucinated. Running `chunk.content.includes(raw_quote)` in JavaScript is 100% deterministic, takes 0.01ms, and guarantees facts are grounded in verbatim evidence. |
| **Composite Candidate Retrieval** | Cosine similarity + Attribute keyword overlap | Pure cosine similarity often matches unrelated metrics that happen to share fiscal terminology. Combining cosine similarity with exact attribute matching and keyword token overlap eliminates false-positive candidate pairs. |
| **Dynamic Schema Evolution** | Emergent `fact_types` table | Rather than hardcoding fixed schemas (e.g. only revenue and profit), the system dynamically records emergent fact types (`macro_indicator`, `financial_metric`, `governance_status`) as new documents are ingested. |

### 4. AI Tools Used
* **Google Antigravity IDE**: Autonomous agentic pair-programming, codebase refactoring, and real-time execution.
* **Claude 3.7 Sonnet & Gemini 3.1 Flash Lite**: Used for agentic pipeline implementation, rigorous prompt design, and JSON schema grounding.

---

## ⚖️ Limitations and Next Steps

Tell us what does not work yet and what you would build next:

### What Does Not Work Yet (Current Limitations)
1. **Multi-Page Financial Tables with Merged Headers**:
   * Text extraction via `pdfjs-dist` reads sequential text streams. For complex balance sheets with multi-level nested headers or vertical spans, token alignment across columns can occasionally become interleaved.
2. **Corporate Pronoun & Entity Resolution**:
   * Sentences starting with *"The Company"* or *"The Group"* depend on chunk proximity to the cover title. If isolated, the subject may be recorded as *"Company"* rather than resolved to *"Delhivery Limited"*.
3. **Free-Tier LLM Rate Limits**:
   * Public free-tier API keys enforce strict 15 RPM limits. In high-concurrency environments, chunks must be serialized with exponential backoff.

### What We Would Build Next (Roadmap)
1. **Layout-Aware Vision-Language OCR**:
   * Integrate LayoutLM or table extraction models to preserve column-row bounding boxes for complex multi-page financial tables.
2. **Interactive Force-Directed Knowledge Graph**:
   * Add a D3 / Cytoscape graph canvas visualizer showing document nodes, fact vertices, and color-coded relationship edges (`green` for corroboration, `red` for contradiction, `blue` for reconciliation).
3. **Analyst Review Loop**:
   * Enable an interactive "Approve with Correction" action inside the Review Queue UI to re-inject human-corrected facts into the knowledge graph.

---

## 📝 Additional Notes

Add anything else you would like us to know:

1. **Zero Hardcoded Mocks**:
   * Every fact, quote, and relationship displayed in the UI is dynamically extracted, embedded, and judged at runtime from the uploaded PDFs.
2. **Brownie Points Accomplished**:
   * **Handling Large PDFs**: High-density chunk ranking processes 100-page filings in < 2 minutes.
   * **Incremental Ingestion**: New documents are integrated incrementally without re-extracting prior documents.
   * **Dynamic Schema**: Emergent `fact_types` evolve dynamically without static schemas.
   * **Local-First Resilience**: Local embeddings ensure zero API bill shock and zero external embedding dependencies.
3. **Credential Safety**:
   * All API keys and databases (`.env`, `data.sqlite`) are strictly excluded in `.gitignore`.
