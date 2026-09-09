import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import { Upload, RotateCcw, CheckCircle2, FileText, GitCompare, Search, Loader2, AlertTriangle, ShieldAlert, Layers } from 'lucide-react';

interface Relationship {
  id: string;
  fact_id_a: string;
  fact_id_b: string;
  relationship: 'corroborates' | 'contradicts' | 'reconciled';
  reconciliation_factor: string | null;
  reasoning: string;
  judged_at: string;
  a_subject: string;
  a_attribute: string;
  a_value: string;
  a_unit?: string;
  a_quote: string;
  b_subject: string;
  b_attribute: string;
  b_value: string;
  b_unit?: string;
  b_quote: string;
}

interface Fact {
  id: string;
  document_id: string;
  fact_type: string;
  subject: string;
  attribute: string;
  value: string;
  unit?: string;
  time_scope?: string;
  raw_quote: string;
  confidence: number;
  created_at: string;
  filename: string;
}

interface DocItem {
  id: string;
  filename: string;
  uploaded_at: string;
  page_count: number | null;
  status: string;
}

interface ReviewItem {
  id: string;
  fact_id: string;
  reason: string;
  detail: string;
  created_at: string;
  subject: string;
  attribute: string;
  value: string;
  unit?: string;
  raw_quote: string;
  confidence: number;
  filename: string;
}

interface Stats {
  documents: number;
  facts: number;
  relationships: number;
  reviews: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<'relationships' | 'facts' | 'documents' | 'reviews'>('relationships');
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<Stats>({ documents: 0, facts: 0, relationships: 0, reviews: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAllData = async () => {
    try {
      const [statsRes, relsRes, factsRes, docsRes, reviewsRes] = await Promise.all([
        fetch('http://localhost:3001/api/stats').then(r => r.json()).catch(() => null),
        fetch('http://localhost:3001/api/relationships').then(r => r.json()).catch(() => []),
        fetch('http://localhost:3001/api/facts').then(r => r.json()).catch(() => []),
        fetch('http://localhost:3001/api/documents').then(r => r.json()).catch(() => []),
        fetch('http://localhost:3001/api/reviews').then(r => r.json()).catch(() => [])
      ]);

      if (statsRes) setStats(statsRes);
      if (relsRes) setRelationships(relsRes);
      if (factsRes) setFacts(factsRes);
      if (docsRes) setDocuments(docsRes);
      if (reviewsRes) setReviews(reviewsRes);

      const hasActive = docsRes?.some((d: DocItem) => d.status === 'parsing' || d.status === 'extracting');
      if (!hasActive && isUploading) {
        setIsUploading(false);
        setStatusMessage('Processing complete!');
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };



  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 3500);
    return () => clearInterval(interval);
  }, [isUploading]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatusMessage(`Uploading "${file.name}" (${i + 1}/${files.length})...`);
      const formData = new FormData();
      formData.append('file', file);

      try {
        await fetch('http://localhost:3001/api/documents', {
          method: 'POST',
          body: formData,
        });
      } catch (err) {
        console.error('Upload failed for', file.name, err);
      }
    }

    setStatusMessage(`Uploaded ${files.length} document(s). Processing pipeline in background...`);
    fetchAllData();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetDatabase = async () => {
    if (!window.confirm('Reset database? This will clear all documents, facts, and relationships so you can start fresh.')) return;
    try {
      await fetch('http://localhost:3001/api/reset', { method: 'POST' });
      fetchAllData();
      setStatusMessage('Database reset successfully. Clean slate ready.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Failed to reset:', err);
    }
  };

  const handleRejudge = async () => {
    try {
      setStatusMessage('Re-judging all facts across documents...');
      const res = await fetch('http://localhost:3001/api/rejudge', { method: 'POST' });
      const data = await res.json();
      setStatusMessage(data.message || 'Re-judging started in background. Check Relationships tab.');
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err) {
      console.error('Rejudge failed:', err);
    }
  };

  const filteredRelationships = relationships.filter(rel => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (rel.a_subject?.toLowerCase() || '').includes(term) ||
      (rel.a_attribute?.toLowerCase() || '').includes(term) ||
      (rel.b_subject?.toLowerCase() || '').includes(term) ||
      (rel.b_attribute?.toLowerCase() || '').includes(term) ||
      (rel.reasoning?.toLowerCase() || '').includes(term);
    const matchesFilter = filterType === 'all' || rel.relationship === filterType;
    return matchesSearch && matchesFilter;
  });

  const filteredFacts = facts.filter(f => {
    const term = searchTerm.toLowerCase();
    return (
      (f.subject?.toLowerCase() || '').includes(term) ||
      (f.attribute?.toLowerCase() || '').includes(term) ||
      (f.value?.toLowerCase() || '').includes(term) ||
      (f.raw_quote?.toLowerCase() || '').includes(term) ||
      (f.filename?.toLowerCase() || '').includes(term)
    );
  });

  return (
    <div className="app-container">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={24} style={{ color: '#2563eb' }} />
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Fact Knowledge Layer</h1>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                Cross-Document Intelligence & Fact Synthesis
              </span>
            </div>
          </div>

          <div className="stats-bar">
            <div className="stat-chip">
              Docs: <strong>{stats.documents}</strong>
            </div>
            <div className="stat-chip">
              Facts: <strong>{stats.facts}</strong>
            </div>
            <div className="stat-chip">
              Relationships: <strong>{stats.relationships}</strong>
            </div>
            <div className="stat-chip" style={{ color: stats.reviews > 0 ? '#eab308' : 'inherit' }}>
              Reviews: <strong>{stats.reviews}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleRejudge}
            title="Re-run relationship judging across all existing facts"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              backgroundColor: 'transparent',
              color: 'var(--color-reconciled)',
              border: '1px solid var(--color-reconciled)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.85rem'
            }}
          >
            <GitCompare size={14} />
            Re-Judge All
          </button>
          <button
            onClick={handleResetDatabase}
            title="Clear all documents, facts, and relationships to start fresh"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.85rem'
            }}
          >
            <RotateCcw size={14} />
            Reset Data
          </button>
          <input
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              backgroundColor: 'var(--text-primary)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            {isUploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
            {isUploading ? 'Upload More PDFs' : 'Upload PDF(s)'}
          </button>
        </div>
      </header>

      <main className="main-content">
        {/* Navigation Tabs */}
        <div className="tabs-nav">
          <button
            className={`tab-btn ${activeTab === 'relationships' ? 'active' : ''}`}
            onClick={() => setActiveTab('relationships')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitCompare size={16} />
              Relationships & Conflicts ({relationships.length})
            </span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'facts' ? 'active' : ''}`}
            onClick={() => setActiveTab('facts')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} />
              Extracted Facts ({facts.length})
            </span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={16} />
              Documents ({documents.length})
            </span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={16} />
              Review Queue & Failures ({reviews.length})
            </span>
          </button>
        </div>

        {/* Status / Live Activity Banner */}
        {(isUploading || statusMessage) && (
          <div
            style={{
              backgroundColor: 'var(--color-corroborates-bg)',
              color: 'var(--text-primary)',
              padding: '14px 20px',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '24px',
              border: '1px solid var(--color-corroborates)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Loader2 size={20} className="spin" style={{ color: 'var(--color-corroborates)' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem' }}>
                  {statusMessage || 'Processing document chunks in real time...'}
                </strong>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Extracting facts, computing embeddings, and running LLM Judge sequentially without rate limits.
                </span>
              </div>
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-corroborates)' }}>
              Live Polling Active
            </span>
          </div>
        )}

        {/* Search & Filter Bar */}
        {activeTab !== 'documents' && (
          <div className="filters-container">
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={18}
                style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-tertiary)' }}
              />
              <input
                type="text"
                className="search-input"
                placeholder={
                  activeTab === 'relationships'
                    ? 'Search by company, metric, or reasoning...'
                    : 'Search facts by subject, metric, quote, or value...'
                }
                style={{ paddingLeft: '38px', width: '100%' }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {activeTab === 'relationships' && (
              <select
                className="select-input"
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
              >
                <option value="all">All Relationships</option>
                <option value="corroborates">Corroborates</option>
                <option value="contradicts">Contradicts</option>
                <option value="reconciled">Reconciled</option>
              </select>
            )}
          </div>
        )}

        {/* TAB 1: Relationships */}
        {activeTab === 'relationships' && (
          <div className="relationships-grid">
            {filteredRelationships.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-tertiary)' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>No relationships found matching criteria.</p>
                <span style={{ fontSize: '0.9rem' }}>
                  Upload additional PDFs to compare facts across documents.
                </span>
              </div>
            ) : (
              filteredRelationships.map(rel => (
                <div key={rel.id} className="relationship-card">
                  <div className="card-header">
                    <span className={`badge ${rel.relationship}`}>
                      {rel.relationship} {rel.reconciliation_factor ? `(${rel.reconciliation_factor})` : ''}
                    </span>
                    <span className="card-date">
                      {new Date(rel.judged_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="card-body">
                    <div className="fact-column">
                      <h3>Fact A</h3>
                      <div className="fact-metric">
                        {rel.a_subject} &bull; {rel.a_attribute}:{' '}
                        <span style={{ color: '#2563eb' }}>
                          {rel.a_value} {rel.a_unit || ''}
                        </span>
                      </div>
                      <div className="fact-quote">&ldquo;{rel.a_quote}&rdquo;</div>
                    </div>

                    <div className="fact-column">
                      <h3>Fact B</h3>
                      <div className="fact-metric">
                        {rel.b_subject} &bull; {rel.b_attribute}:{' '}
                        <span style={{ color: '#2563eb' }}>
                          {rel.b_value} {rel.b_unit || ''}
                        </span>
                      </div>
                      <div className="fact-quote">&ldquo;{rel.b_quote}&rdquo;</div>
                    </div>
                  </div>

                  {rel.reasoning && (
                    <div className="reasoning-box">
                      <strong>Judge Reasoning</strong>
                      {rel.reasoning}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: Extracted Facts */}
        {activeTab === 'facts' && (
          <div className="facts-grid">
            {filteredFacts.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', gridColumn: '1 / -1', padding: '48px 0' }}>
                No facts found matching your search.
              </p>
            ) : (
              filteredFacts.map(fact => (
                <div key={fact.id} className="fact-item-card">
                  <div className="fact-item-header">
                    <span className="fact-tag">{fact.fact_type || 'fact'}</span>
                    <span className="fact-doc-name" title={fact.filename}>
                      {fact.filename}
                    </span>
                  </div>

                  <div>
                    <div className="fact-item-title">{fact.subject}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{fact.attribute}</div>
                  </div>

                  <div className="fact-item-value">
                    {fact.value} {fact.unit || ''}
                    {fact.time_scope && (
                      <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                        ({fact.time_scope})
                      </span>
                    )}
                  </div>

                  {fact.raw_quote && (
                    <div className="fact-item-quote">
                      &ldquo;{fact.raw_quote}&rdquo;
                    </div>
                  )}

                  <div className="fact-item-meta">
                    <span>Confidence: {(fact.confidence * 100).toFixed(0)}%</span>
                    <span>{new Date(fact.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: Documents */}
        {activeTab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {documents.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '48px 0' }}>
                No documents uploaded yet. Click "Upload PDF" above.
              </p>
            ) : (
              documents.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <FileText size={22} style={{ color: '#2563eb' }} />
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.95rem' }}>{doc.filename}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                        Uploaded: {new Date(doc.uploaded_at).toLocaleString()}
                        {doc.page_count ? ` &bull; ${doc.page_count} pages` : ''}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        backgroundColor:
                          doc.status === 'done'
                            ? 'var(--color-corroborates-bg)'
                            : doc.status === 'error'
                            ? 'var(--color-contradicts-bg)'
                            : 'var(--color-reconciled-bg)',
                        color:
                          doc.status === 'done'
                            ? 'var(--color-corroborates)'
                            : doc.status === 'error'
                            ? 'var(--color-contradicts)'
                            : 'var(--color-reconciled)'
                      }}
                    >
                      {doc.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 4: Review Queue & Failure Handling (Case 4) */}
        {activeTab === 'reviews' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              lineHeight: 1.5
            }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#eab308', marginBottom: '4px' }}>
                <ShieldAlert size={18} />
                Case 4: Extraction & Reasoning Failure Interception
              </strong>
              <span>
                To prevent hallucinations and flawed inferences from polluting the Knowledge Graph, the system runs strict automated guardrails (verbatim continuous substring matching, confidence thresholds &lt; 0.70). Any extraction failure is quarantined here for human inspection before being judged.
              </span>
            </div>

            {reviews.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '48px 0' }}>
                No items in review queue. All extractions passed verbatim guardrails!
              </p>
            ) : (
              reviews.map(item => (
                <div
                  key={item.id}
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    backgroundColor: 'var(--bg-secondary)',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444'
                        }}
                      >
                        {item.reason}
                      </span>
                      <strong style={{ fontSize: '0.95rem' }}>{item.subject} &bull; {item.attribute}</strong>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                      Source: {item.filename}
                    </span>
                  </div>

                  <div style={{
                    backgroundColor: 'var(--bg-primary)',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    borderLeft: '4px solid #ef4444'
                  }}>
                    <strong style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Intercepted Failure Detail:
                    </strong>
                    <p style={{ fontSize: '0.88rem', margin: 0, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {item.detail}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                    <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                      <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '0.78rem' }}>Extracted Value & Unit:</span>
                      <strong>{item.value} {item.unit || ''}</strong> (Confidence: {item.confidence})
                    </div>
                    <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                      <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '0.78rem' }}>Claimed Raw Quote:</span>
                      <em>"{item.raw_quote}"</em>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
