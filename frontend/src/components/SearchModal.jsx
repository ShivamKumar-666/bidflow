import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, FileText, MessageSquare, Briefcase, CornerDownLeft, Loader2 } from 'lucide-react';
import api from '../services/api';
import './SearchModal.css';

const SearchModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ enquiries: [], bids: [], documents: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef(null);

  // Debounced API search
  useEffect(() => {
    if (!query.trim()) {
      setResults({ enquiries: [], bids: [], documents: [] });
      setActiveIndex(0);
      return;
    }

    setLoading(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const response = await api.get(`/search?q=${encodeURIComponent(query)}`);
        setResults(response.data || { enquiries: [], bids: [], documents: [] });
        setActiveIndex(0);
      } catch (error) {
        console.error('Error fetching global search results:', error);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Keyboard shortcut listener to toggle modal globally
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Flatten results for keyboard navigation index mapping
  const flatResults = [];
  if (results.enquiries.length > 0) {
    results.enquiries.forEach(item => flatResults.push({ type: 'enquiry', data: item }));
  }
  if (results.bids.length > 0) {
    results.bids.forEach(item => flatResults.push({ type: 'bid', data: item }));
  }
  if (results.documents.length > 0) {
    results.documents.forEach(item => flatResults.push({ type: 'document', data: item }));
  }

  // Handle result item navigation
  const handleSelectResult = (item) => {
    onClose();
    setQuery('');
    setResults({ enquiries: [], bids: [], documents: [] });
    
    if (item.type === 'enquiry') {
      navigate('/enquiries');
    } else if (item.type === 'bid') {
      navigate('/bids');
    } else if (item.type === 'document') {
      navigate('/bids'); // Go to Bids page where documents are managed
    }
  };

  // Listen to keyboard navigation events
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatResults.length > 0) {
        setActiveIndex((prev) => (prev + 1) % flatResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatResults.length > 0) {
        setActiveIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults.length > 0 && flatResults[activeIndex]) {
        handleSelectResult(flatResults[activeIndex]);
      }
    }
  };

  if (!isOpen) return null;

  const getPriorityLabel = (priority) => {
    const p = String(priority).toLowerCase();
    if (p === 'high') return t('enquiries.high', 'High');
    if (p === 'medium') return t('enquiries.medium', 'Medium');
    return t('enquiries.low', 'Low');
  };

  const getStatusText = (status) => {
    const normalized = String(status).toLowerCase().replace(/\s+/g, '_');
    return t(`bids.statusValue.${normalized}`, status);
  };

  return (
    <div className="search-modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="search-modal-container glass-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header Input */}
        <div className="search-input-wrapper">
          {loading ? (
            <Loader2 className="search-input-icon animate-spin" size={20} />
          ) : (
            <Search className="search-input-icon" size={20} />
          )}
          <input
            ref={inputRef}
            type="text"
            className="search-modal-input"
            placeholder={t('navbar.searchPlaceholder', 'Search enquiries, bids, documents...')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="search-close-badge" onClick={onClose}>
            {t('calendar.close', 'ESC')}
          </span>
        </div>

        {/* Results List */}
        <div className="search-results-list">
          {flatResults.length === 0 && query.trim() !== '' && !loading && (
            <div className="search-no-results">
              {t('search.noResults', 'No results found for')}{' '}
              <strong style={{ color: 'var(--accent-primary)' }}>"{query}"</strong>
            </div>
          )}

          {flatResults.length === 0 && query.trim() === '' && (
            <div className="search-no-results">
              {t('search.initialHelp', 'Type to search enquiries, bids, or document attachments')}
            </div>
          )}

          {/* Group 1: Enquiries */}
          {results.enquiries.length > 0 && (
            <div className="search-group">
              <div className="search-group-header">
                {t('sidebar.enquiries', 'Enquiries')}
              </div>
              {results.enquiries.map((enq, idx) => {
                const flatIndex = flatResults.findIndex(
                  (item) => item.type === 'enquiry' && item.data._id === enq._id
                );
                return (
                  <div
                    key={enq._id}
                    className={`search-item ${activeIndex === flatIndex ? 'active' : ''}`}
                    onClick={() => handleSelectResult({ type: 'enquiry', data: enq })}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                  >
                    <div className="search-item-info">
                      <div className="search-item-title">
                        <MessageSquare size={14} style={{ marginRight: '6px', display: 'inline', verticalAlign: 'middle' }} />
                        {enq.customerName}
                      </div>
                      <div className="search-item-subtitle">{enq.productServiceRequired}</div>
                    </div>
                    <div className="search-item-meta">
                      <span className={`status-badge ${enq.priority === 'High' ? 'danger' : enq.priority === 'Medium' ? 'review' : 'info'}`}>
                        {getPriorityLabel(enq.priority)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Group 2: Bids */}
          {results.bids.length > 0 && (
            <div className="search-group">
              <div className="search-group-header">
                {t('sidebar.bids', 'Bids')}
              </div>
              {results.bids.map((bid, idx) => {
                const flatIndex = flatResults.findIndex(
                  (item) => item.type === 'bid' && item.data._id === bid._id
                );
                return (
                  <div
                    key={bid._id}
                    className={`search-item ${activeIndex === flatIndex ? 'active' : ''}`}
                    onClick={() => handleSelectResult({ type: 'bid', data: bid })}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                  >
                    <div className="search-item-info">
                      <div className="search-item-title">
                        <Briefcase size={14} style={{ marginRight: '6px', display: 'inline', verticalAlign: 'middle' }} />
                        {bid.bidId} ({bid.customerName})
                      </div>
                      <div className="search-item-subtitle">
                        {t('bids.assignedTo', 'Assigned')}: {bid.assignedEmployee || 'Unassigned'}
                      </div>
                    </div>
                    <div className="search-item-meta">
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                        ${Number(bid.amount).toLocaleString()}
                      </span>
                      <span className="status-badge info">{getStatusText(bid.status)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Group 3: Documents */}
          {results.documents.length > 0 && (
            <div className="search-group">
              <div className="search-group-header">
                {t('search.documents', 'Documents')}
              </div>
              {results.documents.map((doc, idx) => {
                const flatIndex = flatResults.findIndex(
                  (item) => item.type === 'document' && item.data._id === doc._id
                );
                return (
                  <div
                    key={doc._id}
                    className={`search-item ${activeIndex === flatIndex ? 'active' : ''}`}
                    onClick={() => handleSelectResult({ type: 'document', data: doc })}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                  >
                    <div className="search-item-info">
                      <div className="search-item-title">
                        <FileText size={14} style={{ marginRight: '6px', display: 'inline', verticalAlign: 'middle' }} />
                        {doc.filename}
                      </div>
                      <div className="search-item-subtitle">{doc.bidId}</div>
                    </div>
                    <div className="search-item-meta">
                      <span className="upcoming-date">
                        {new Date(doc.uploadDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Guides */}
        <div className="search-modal-footer">
          <div className="search-guides">
            <span className="search-guide-item">
              <span className="search-key-badge">↑↓</span> {t('search.navigate', 'Navigate')}
            </span>
            <span className="search-guide-item">
              <span className="search-key-badge">
                <CornerDownLeft size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Enter
              </span>{' '}
              {t('search.select', 'Select')}
            </span>
            <span className="search-guide-item">
              <span className="search-key-badge">Esc</span> {t('search.close', 'Close')}
            </span>
          </div>
          <div>BidFlow Global Search</div>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
