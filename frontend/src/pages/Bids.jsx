import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { io } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import TagInput from '../components/TagInput';
import { TrendingUp, TrendingDown, Minus, Brain, Info } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';

const defaultIndustryTags = {
  Technology: ['software', 'saas', 'hardware', 'consulting', 'cloud', 'devops', 'cybersecurity'],
  Banking: ['loan', 'credit', 'securities', 'compliance', 'fintech', 'retail-banking', 'asset-management'],
  Manufacturing: ['machinery', 'materials', 'logistics', 'supply-chain', 'automotive', 'quality-control'],
  Retail: ['e-commerce', 'inventory', 'merchandising', 'pos', 'supply-chain', 'customer-loyalty'],
  Healthcare: ['medical-devices', 'pharma', 'compliance', 'telehealth', 'clinical-trials', 'patient-care'],
  Other: ['general', 'consulting', 'services', 'miscellaneous']
};

const Bids = () => {
  const { t, i18n } = useTranslation();
  const { user } = useContext(AuthContext);
  const [bids, setBids] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [selectedBid, setSelectedBid] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [uniqueTags, setUniqueTags] = useState([]);
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [editBidTags, setEditBidTags] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    enquiryId: '',
    amount: '',
    industry: 'Technology',
    submissionDate: '',
    assignedEmployee: '',
    remarks: '',
    tags: []
  });

  // SHAP tooltip state
  const [hoveredBidId, setHoveredBidId] = useState(null);
  const tooltipTimer = useRef(null);

  // Live prediction in modal
  const [livePredict, setLivePredict] = useState(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const predictDebounce = useRef(null);

  const fetchBids = async () => {
    try {
      const res = await api.get('/bids/');
      setBids(res.data);
    } catch (err) {
      toast.error(t('bids.failedFetch'));
    }
  };

  const fetchEnquiries = async () => {
    try {
      const res = await api.get('/enquiries/');
      setEnquiries(res.data);
    } catch (err) {
      toast.error(t('bids.failedFetchEnq'));
    }
  };

  const fetchUniqueTags = async () => {
    try {
      const res = await api.get('/tags/');
      setUniqueTags(res.data);
    } catch (err) {
      console.error("Failed to fetch unique tags", err);
    }
  };

  useEffect(() => {
    fetchBids();
    fetchEnquiries();
    fetchUniqueTags();
    
    const socket = io('http://localhost:5000');
    
    socket.on('new_comment', (data) => {
      setBids(prevBids => prevBids.map(bid => {
        if (bid._id === data.bid_id) {
          // Check if comment already exists (e.g., if we're the sender)
          const commentExists = bid.comments && bid.comments.some(c => 
            c.text === data.comment.text && c.author === data.comment.author && c.date === data.comment.date
          );
          if (commentExists) return bid;
          return { ...bid, comments: [...(bid.comments || []), data.comment] };
        }
        return bid;
      }));
      
      setSelectedBid(prevSelected => {
        if (prevSelected && prevSelected._id === data.bid_id) {
          const commentExists = prevSelected.comments && prevSelected.comments.some(c => 
            c.text === data.comment.text && c.author === data.comment.author && c.date === data.comment.date
          );
          if (commentExists) return prevSelected;
          return { ...prevSelected, comments: [...(prevSelected.comments || []), data.comment] };
        }
        return prevSelected;
      });
    });

    socket.on('delete_comment', (data) => {
      setBids(prevBids => prevBids.map(bid => {
        if (bid._id === data.bid_id) {
          return { ...bid, comments: (bid.comments || []).filter(c => c.date !== data.comment_date) };
        }
        return bid;
      }));
      
      setSelectedBid(prevSelected => {
        if (prevSelected && prevSelected._id === data.bid_id) {
          return { ...prevSelected, comments: (prevSelected.comments || []).filter(c => c.date !== data.comment_date) };
        }
        return prevSelected;
      });
    });
    
    return () => socket.disconnect();
  }, []);

  // Live prediction debounced call for the modal
  const triggerLivePredict = useCallback((data) => {
    if (predictDebounce.current) clearTimeout(predictDebounce.current);
    if (!data.amount || !data.submissionDate) { setLivePredict(null); return; }
    predictDebounce.current = setTimeout(async () => {
      setPredictLoading(true);
      try {
        const sub_date = new Date(data.submissionDate);
        const days_to_deadline = Math.max(1, Math.round((sub_date - new Date()) / (1000 * 60 * 60 * 24)));
        const res = await api.post('/bids/predict', {
          amount: Number(data.amount),
          days_to_deadline,
          industry: data.industry,
          assignedEmployee: data.assignedEmployee,
          priority_encoded: 1,
          is_repeat_customer: 1
        });
        setLivePredict(res.data);
      } catch (_) {
        setLivePredict(null);
      } finally {
        setPredictLoading(false);
      }
    }, 600);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.post('/bids/', formData);
      setShowModal(false);
      setLivePredict(null);
      fetchBids();
      fetchUniqueTags();
      setFormData({
        enquiryId: '',
        amount: '',
        industry: 'Technology',
        submissionDate: '',
        assignedEmployee: '',
        remarks: '',
        tags: []
      });
      toast.success(t('bids.createSuccess'));
    } catch (err) {
      toast.error(t('bids.createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBid = async (id, bidId) => {
    if (window.confirm(`Are you sure you want to delete bid ${bidId}?`)) {
      try {
        await api.delete(`/bids/${id}`);
        fetchBids();
        toast.success("Bid deleted successfully!");
      } catch (err) {
        toast.error("Failed to delete bid");
      }
    }
  };

  const handleDeleteComment = async (commentDate) => {
    if (!selectedBid) return;
    if (window.confirm("Are you sure you want to delete this comment?")) {
      try {
        const dateStr = encodeURIComponent(commentDate);
        await api.delete(`/bids/${selectedBid._id}/comments/${dateStr}`);
        toast.success("Comment deleted successfully!");
        setSelectedBid(prev => {
          if (!prev) return null;
          return {
            ...prev,
            comments: (prev.comments || []).filter(c => c.date !== commentDate)
          };
        });
        fetchBids();
      } catch (err) {
        toast.error("Failed to delete comment");
      }
    }
  };


  const handleUpdateTags = async (e) => {
    e.preventDefault();
    if (!selectedBid) return;
    try {
      await api.put(`/bids/${selectedBid._id}`, { tags: editBidTags });
      setShowTagsModal(false);
      fetchBids();
      fetchUniqueTags();
      toast.success(t('common.save') + " " + t('common.tags'));
    } catch (err) {
      toast.error("Failed to update tags");
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/bids/${id}/status`, { status });
      fetchBids();
      toast.success(t('bids.statusUpdated'));
    } catch (err) {
      toast.error(t('bids.statusUpdateFailed'));
    }
  };

  const downloadQuotation = async (id, bidId) => {
    try {
      const res = await api.get(`/bids/${id}/quotation`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `quotation_${bidId}.pdf`;
      link.click();
      toast.success(t('bids.quoteExportSuccess', 'Quotation PDF exported successfully!'));
    } catch (err) {
      toast.error(t('bids.quoteExportFailed', 'Failed to export quotation PDF'));
    }
  };

  const getStatusBadgeClass = (status) => {
    if (['Order Received', 'Completed'].includes(status)) return 'success';
    if (['Rejected', 'Lost'].includes(status)) return 'danger';
    if (['Submitted', 'Negotiation'].includes(status)) return 'info';
    return 'review';
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText || !selectedBid) return;
    try {
      await api.post(`/bids/${selectedBid._id}/comments`, { text: commentText });
      setCommentText("");
      fetchBids();
      toast.success(t('bids.commentAdded'));
      const res = await api.get('/bids/');
      const updatedBids = res.data;
      setBids(updatedBids);
      setSelectedBid(updatedBids.find(b => b._id === selectedBid._id));
    } catch (err) {
      toast.error(t('bids.commentFailed'));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat(i18n.language || 'en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const filteredBids = bids.filter(bid => {
    if (selectedFilters.length === 0) return true;
    return bid.tags && bid.tags.some(tag => selectedFilters.includes(tag));
  });

  return (
    <div className="bids-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('bids.title')}</h1>
        <button className="btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
          {t('bids.createBid')}
        </button>
      </div>

      {uniqueTags.length > 0 && (
        <div className="tag-filter-bar">
          <span className="tag-filter-title">
            🔍 {t('common.filterByTags')}:
          </span>
          {uniqueTags.map(tag => {
            const isActive = selectedFilters.includes(tag);
            return (
              <span
                key={tag}
                className={`tag-filter-pill ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (isActive) {
                    setSelectedFilters(selectedFilters.filter(f => f !== tag));
                  } else {
                    setSelectedFilters([...selectedFilters, tag]);
                  }
                }}
              >
                {tag}
              </span>
            );
          })}
          {selectedFilters.length > 0 && (
            <button 
              className="btn-outline" 
              style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '12px', marginLeft: 'auto' }}
              onClick={() => setSelectedFilters([])}
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="glass-card data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('bids.bidId')}</th>
              <th>{t('bids.enquiryId')}</th>
              <th>{t('bids.amount')}</th>
              <th>{t('bids.prediction')}</th>
              <th>{t('bids.status')}</th>
              <th>{t('bids.assignedTo')}</th>
              <th>{t('bids.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredBids.map((bid, index) => (
              <tr key={bid._id}>
                <td style={{ fontWeight: 600 }}>
                  {bid.bidId}
                  {bid.tags && bid.tags.length > 0 && (
                    <div className="table-tags-container">
                      {bid.tags.map(tag => (
                        <span key={tag} className="table-tag-badge">{tag}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td>{bid.enquiryId}</td>
                <td style={{ fontWeight: 500 }}>{formatCurrency(bid.amount)}</td>
                <td style={{ position: 'relative' }}>
                  {bid.aiPrediction ? (
                    <div
                      style={{ position: 'relative', display: 'inline-block', cursor: 'help' }}
                      onMouseEnter={() => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); setHoveredBidId(bid._id); }}
                      onMouseLeave={() => { tooltipTimer.current = setTimeout(() => setHoveredBidId(null), 200); }}
                    >
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 10px',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        background: bid.aiPrediction >= 70
                          ? 'rgba(16,185,129,0.12)'
                          : (bid.aiPrediction >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'),
                        color: bid.aiPrediction >= 70 ? 'var(--success)' : (bid.aiPrediction >= 40 ? 'var(--warning)' : 'var(--danger)'),
                        border: `1px solid ${bid.aiPrediction >= 70 ? 'rgba(16,185,129,0.3)' : (bid.aiPrediction >= 40 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)')}`
                      }}>
                        {bid.aiPrediction >= 70 ? '🟢' : (bid.aiPrediction >= 40 ? '🟡' : '🔴')} {bid.aiPrediction}%
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.78rem' }}>
                          {bid.aiPrediction >= 70 ? t('bids.lowRisk') : (bid.aiPrediction >= 40 ? t('bids.mediumRisk') : t('bids.highRisk'))}
                        </span>
                        <Info size={12} style={{ opacity: 0.5 }} />
                      </span>

                      {/* SHAP Tooltip */}
                      {hoveredBidId === bid._id && (
                        <div style={getShapTooltipStyle(index, filteredBids.length)}
                          onMouseEnter={() => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); }}
                          onMouseLeave={() => { tooltipTimer.current = setTimeout(() => setHoveredBidId(null), 200); }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: 'var(--accent-primary)' }}>
                            <Brain size={14} />
                            <span style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Explanation</span>
                          </div>
                          {bid.shapExplanations && bid.shapExplanations.length > 0 ? (
                            bid.shapExplanations.map((ex, i) => (
                              <div key={i} style={shapRowStyle(ex.impact)}>
                                {ex.impact === 'positive' ? <TrendingUp size={13} style={{ flexShrink: 0 }} /> : <TrendingDown size={13} style={{ flexShrink: 0 }} />}
                                <span style={{ fontSize: '0.8rem' }}>{ex.text}</span>
                              </div>
                            ))
                          ) : (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <Minus size={12} /> No explanation data available
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>N/A</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className={`status-badge ${getStatusBadgeClass(bid.status)}`}>
                      {t(`bids.statusValue.${bid.status.toLowerCase().replace(/[^a-z0-9]/g, '_')}`, bid.status)}
                    </span>
                    {bid.slaBreached && (
                      <span className="sla-badge" title={`${bid.slaElapsedDays} days in this stage (SLA threshold: ${bid.slaThresholdDays} days)`}>
                        ⚠️ {t('bids.slaBreach', 'SLA Breach')} {t('bids.slaDaysOverdue', { days: (bid.slaElapsedDays || 0) - (bid.slaThresholdDays || 0) })}
                      </span>
                    )}
                  </div>
                </td>
                <td>{bid.assignedEmployee}</td>
                <td style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="input-field" 
                    style={{ padding: '6px', fontSize: '0.8rem', width: 'auto' }}
                    value={bid.status}
                    onChange={(e) => updateStatus(bid._id, e.target.value)}
                  >
                    <option value="Quotation Prepared">{t('bids.statusValue.quotation_prepared', 'Quotation Prepared')}</option>
                    <option value="Submitted">{t('bids.statusValue.submitted', 'Submitted')}</option>
                    <option value="Negotiation">{t('bids.statusValue.negotiation', 'Negotiation')}</option>
                    <option value="Approved / Rejected">{t('bids.statusValue.approved___rejected', 'Approved / Rejected')}</option>
                    <option value="Order Received">{t('bids.statusValue.order_received', 'Order Received')}</option>
                    <option value="Completed">{t('bids.statusValue.completed', 'Completed')}</option>
                    <option value="Rejected">{t('bids.statusValue.rejected', 'Rejected')}</option>
                  </select>
                  <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => { setSelectedBid(bid); setShowCommentModal(true); }}>
                    {t('bids.comments')} ({bid.comments ? bid.comments.length : 0})
                  </button>
                  <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => { setSelectedBid(bid); setEditBidTags(bid.tags || []); setShowTagsModal(true); }}>
                    {t('common.tags')}
                  </button>
                  {bid.status === 'Quotation Prepared' && (
                    <button 
                      className="btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem', width: 'auto' }} 
                      onClick={() => downloadQuotation(bid._id, bid.bidId)}
                    >
                      📄 {t('bids.exportQuote')}
                    </button>
                  )}
                  <button 
                    className="btn-outline" 
                    style={{ padding: '6px 12px', fontSize: '0.8rem', borderColor: 'var(--danger)', color: 'var(--danger)' }} 
                    onClick={() => handleDeleteBid(bid._id, bid.bidId)}
                  >
                    🗑️ {t('common.delete', 'Delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={modalOverlayStyle}>
          <div className="glass-card" style={{ ...modalContentStyle, maxWidth: '540px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0 }}>{t('bids.createTitle')}</h2>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => { setShowModal(false); setLivePredict(null); }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>{t('bids.selectEnquiryLabel')}</label>
                <select className="input-field" required value={formData.enquiryId} onChange={e => setFormData({...formData, enquiryId: e.target.value})}>
                  <option value="">{t('bids.selectEnquiry')}</option>
                  {enquiries.map(enq => (
                    <option key={enq.enquiryId} value={enq.enquiryId}>{enq.enquiryId} - {enq.customerName}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>{t('bids.bidAmount')}</label>
                  <input type="number" className="input-field" required value={formData.amount}
                    onChange={e => {
                      const updated = {...formData, amount: Number(e.target.value)};
                      setFormData(updated);
                      triggerLivePredict(updated);
                    }}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>{t('bids.submissionDate')}</label>
                  <input type="date" className="input-field" required value={formData.submissionDate}
                    onChange={e => {
                      const updated = {...formData, submissionDate: e.target.value};
                      setFormData(updated);
                      triggerLivePredict(updated);
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>{t('bids.assignedEmployee')}</label>
                  <input className="input-field" required value={formData.assignedEmployee}
                    onChange={e => {
                      const updated = {...formData, assignedEmployee: e.target.value};
                      setFormData(updated);
                      triggerLivePredict(updated);
                    }}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>{t('bids.clientIndustry')}</label>
                  <select className="input-field" value={formData.industry}
                    onChange={e => {
                      const updated = {...formData, industry: e.target.value};
                      setFormData(updated);
                      triggerLivePredict(updated);
                    }}
                  >
                    <option value="Technology">{t('bids.tech')}</option>
                    <option value="Banking">{t('bids.bank')}</option>
                    <option value="Manufacturing">{t('bids.manuf')}</option>
                    <option value="Retail">{t('bids.retail')}</option>
                    <option value="Healthcare">{t('bids.health')}</option>
                    <option value="Other">{t('bids.other')}</option>
                  </select>
                </div>
              </div>

              {/* Live AI prediction panel */}
              {(predictLoading || livePredict) && (
                <div style={{
                  margin: '20px 0 4px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: livePredict
                    ? (livePredict.win_probability >= 70 ? 'rgba(16,185,129,0.08)' : (livePredict.win_probability >= 40 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'))
                    : 'rgba(255,255,255,0.04)',
                  border: livePredict
                    ? `1px solid ${livePredict.win_probability >= 70 ? 'rgba(16,185,129,0.25)' : (livePredict.win_probability >= 40 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)')}`
                    : '1px solid var(--border-color)'
                }}>
                  {predictLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      <Brain size={15} style={{ animation: 'spin 1s linear infinite' }} /> Calculating AI prediction…
                    </div>
                  ) : livePredict && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <Brain size={16} style={{ color: 'var(--accent-primary)' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live AI Estimate</span>
                        <span style={{
                          marginLeft: 'auto',
                          fontWeight: 800,
                          fontSize: '1.2rem',
                          color: livePredict.win_probability >= 70 ? 'var(--success)' : (livePredict.win_probability >= 40 ? 'var(--warning)' : 'var(--danger)')
                        }}>
                          {livePredict.win_probability}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {livePredict.shap_explanations && livePredict.shap_explanations.map((ex, i) => (
                          <div key={i} style={shapRowStyle(ex.impact)}>
                            {ex.impact === 'positive' ? <TrendingUp size={12} style={{ flexShrink: 0 }} /> : <TrendingDown size={12} style={{ flexShrink: 0 }} />}
                            <span style={{ fontSize: '0.78rem' }}>{ex.text}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="input-group" style={{ marginTop: '20px' }}>
                <label>{t('common.tags')}</label>
                <TagInput
                  tags={formData.tags}
                  onChange={tags => setFormData({...formData, tags})}
                  suggestions={[...new Set([...(defaultIndustryTags[formData.industry] || []), ...uniqueTags])].filter(t => !formData.tags.includes(t))}
                  placeholder={t('common.tagPlaceholder')}
                />
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => { setShowModal(false); setLivePredict(null); }}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                  {isSubmitting ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCommentModal && selectedBid && (
        <div style={modalOverlayStyle}>
          <div className="glass-card" style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>{t('bids.commentsTitle', { id: selectedBid.bidId })}</h2>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => setShowCommentModal(false)}>✕</button>
            </div>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedBid.comments && selectedBid.comments.length > 0 ? (
                selectedBid.comments.map((c, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <strong style={{ color: 'var(--accent-primary)' }}>{c.author}</strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{format(new Date(c.date), 'MMM dd, yyyy h:mm a')}</span>
                        {(c.author === user?.name || user?.role === 'Admin') && (
                          <button 
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--danger)',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              padding: '0',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            onClick={() => handleDeleteComment(c.date)}
                            title="Delete comment"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <div>{c.text}</div>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-secondary)' }}>{t('bids.noComments')}</div>
              )}
            </div>

            <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                className="input-field" 
                style={{ flex: 1 }} 
                placeholder={t('bids.addCommentPlaceholder')} 
                value={commentText} 
                onChange={(e) => setCommentText(e.target.value)} 
                required 
              />
              <button type="submit" className="btn-primary" style={{ width: 'auto' }}>{t('bids.send')}</button>
            </form>
          </div>
        </div>
      )}

      {showTagsModal && selectedBid && (
        <div style={modalOverlayStyle}>
          <div className="glass-card" style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>{t('common.editTagsTitle', { id: selectedBid.bidId })}</h2>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => setShowTagsModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdateTags}>
              <div className="input-group">
                <label>{t('common.tags')}</label>
                <TagInput
                  tags={editBidTags}
                  onChange={setEditBidTags}
                  suggestions={[...new Set([...(defaultIndustryTags[selectedBid.industry] || []), ...uniqueTags])].filter(t => !editBidTags.includes(t))}
                  placeholder={t('common.tagPlaceholder')}
                />
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setShowTagsModal(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>{t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.8)',
  backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 9999,
  overflowY: 'auto',
  padding: '20px'
};

const modalContentStyle = {
  width: '100%',
  maxWidth: '500px',
  background: 'var(--bg-secondary)',
};

const getShapTooltipStyle = (index, totalBids) => {
  const showAbove = totalBids > 3 && index >= totalBids - 2;
  return {
    position: 'absolute',
    [showAbove ? 'bottom' : 'top']: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10000,
    background: 'var(--bg-secondary)',
    border: '1px solid rgba(59,130,246,0.25)',
    borderRadius: '12px',
    padding: '14px 16px',
    minWidth: '280px',
    maxWidth: '340px',
    boxShadow: '0 12px 40px -8px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(16px)',
    animation: 'tooltipFadeIn 0.15s ease forwards',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    pointerEvents: 'all'
  };
};

const shapRowStyle = (impact) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '6px 8px',
  borderRadius: '8px',
  background: impact === 'positive' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
  color: impact === 'positive' ? 'var(--success)' : 'var(--danger)',
  fontSize: '0.82rem',
  lineHeight: '1.4'
});

export default Bids;
