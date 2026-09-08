import { useEffect, useState } from 'react';
import './index.css';
import { Search, Filter } from 'lucide-react';

function App() {
  const [relationships, setRelationships] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    fetch('http://localhost:3001/api/relationships')
      .then(res => res.json())
      .then(data => setRelationships(data))
      .catch(err => console.error('Failed to load relationships:', err));
  }, []);

  const filteredRelationships = relationships.filter(rel => {
    const matchesSearch = (rel.a_subject?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                          (rel.a_attribute?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (rel.b_subject?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || rel.relationship === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="app-container">
      <header className="header">
        <h1>Fact Knowledge Layer</h1>
      </header>

      <main className="main-content">
        <div className="filters-container">
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-tertiary)' }} />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search by company or metric..." 
              style={{ paddingLeft: '36px', width: '100%' }}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
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
        </div>

        <div className="relationships-grid">
          {filteredRelationships.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '48px' }}>
              No relationships found matching your criteria.
            </p>
          ) : (
            filteredRelationships.map(rel => (
              <div key={rel.id} className="relationship-card">
                <div className="card-header">
                  <span className={`badge ${rel.relationship}`}>
                    {rel.relationship} {rel.reconciliation_factor ? `(${rel.reconciliation_factor})` : ''}
                  </span>
                  <span className="card-date">
                    {new Date(rel.judged_at).toLocaleDateString()}
                  </span>
                </div>
                
                <div className="card-body">
                  <div className="fact-column">
                    <h3>Document A</h3>
                    <div className="fact-metric">
                      {rel.a_subject} - {rel.a_attribute}: {rel.a_value} {rel.a_unit}
                    </div>
                    <div className="fact-quote">"{rel.a_quote}"</div>
                  </div>
                  
                  <div className="fact-column">
                    <h3>Document B</h3>
                    <div className="fact-metric">
                      {rel.b_subject} - {rel.b_attribute}: {rel.b_value} {rel.b_unit}
                    </div>
                    <div className="fact-quote">"{rel.b_quote}"</div>
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
      </main>
    </div>
  );
}

export default App;
