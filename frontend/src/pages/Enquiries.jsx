import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import TagInput from '../components/TagInput';

const Enquiries = () => {
  const { t } = useTranslation();
  const [enquiries, setEnquiries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [uniqueTags, setUniqueTags] = useState([]);
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [editEnquiryTags, setEditEnquiryTags] = useState([]);
  const [formData, setFormData] = useState({
    customerName: '',
    contactInformation: '',
    productServiceRequired: '',
    priority: 'Medium',
    notes: '',
    tags: []
  });

  const fetchEnquiries = async () => {
    try {
      const res = await api.get('/enquiries/');
      setEnquiries(res.data);
    } catch (err) {
      toast.error(t('enquiries.failedFetch'));
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
    fetchEnquiries();
    fetchUniqueTags();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/enquiries/', formData);
      setShowModal(false);
      fetchEnquiries();
      fetchUniqueTags();
      setFormData({ customerName: '', contactInformation: '', productServiceRequired: '', priority: 'Medium', notes: '', tags: [] });
      toast.success(t('enquiries.createSuccess'));
    } catch (err) {
      toast.error(t('enquiries.createFailed'));
    }
  };

  const handleUpdateTags = async (e) => {
    e.preventDefault();
    if (!selectedEnquiry) return;
    try {
      await api.put(`/enquiries/${selectedEnquiry._id}`, { tags: editEnquiryTags });
      setShowTagsModal(false);
      fetchEnquiries();
      fetchUniqueTags();
      toast.success(t('common.save') + " " + t('common.tags'));
    } catch (err) {
      toast.error("Failed to update tags");
    }
  };

  const shareEnquiry = async (id) => {
    try {
      const res = await api.post(`/enquiries/${id}/share`);
      const shareUrl = `${window.location.origin}/share/${res.data.shareToken}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('enquiries.shareSuccess', 'Public status link copied to clipboard!'));
    } catch (err) {
      toast.error(t('enquiries.shareFailed', 'Failed to generate share link'));
    }
  };

  const filteredEnquiries = enquiries.filter(enq => {
    if (selectedFilters.length === 0) return true;
    return enq.tags && enq.tags.some(tag => selectedFilters.includes(tag));
  });

  return (
    <div className="enquiries-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('enquiries.title')}</h1>
        <button className="btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
          {t('enquiries.newEnquiry')}
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
              <th>{t('enquiries.id')}</th>
              <th>{t('enquiries.customer')}</th>
              <th>{t('enquiries.productService')}</th>
              <th>{t('enquiries.priority')}</th>
              <th>{t('enquiries.status')}</th>
              <th>{t('enquiries.date')}</th>
              <th>{t('bids.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredEnquiries.map(enq => (
              <tr key={enq._id}>
                <td style={{ fontWeight: 600 }}>
                  {enq.enquiryId}
                  {enq.tags && enq.tags.length > 0 && (
                    <div className="table-tags-container">
                      {enq.tags.map(tag => (
                        <span key={tag} className="table-tag-badge">{tag}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td>{enq.customerName}<br/><span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{enq.contactInformation}</span></td>
                <td>{enq.productServiceRequired}</td>
                <td>
                  <span className={`status-badge ${enq.priority === 'High' ? 'danger' : 'info'}`}>
                    {t(`enquiries.${enq.priority.toLowerCase()}`, enq.priority)}
                  </span>
                </td>
                <td>
                  <span className="status-badge review">
                    {t(`enquiries.statusValue.${enq.status.toLowerCase().replace(/\s+/g, '_')}`, enq.status)}
                  </span>
                </td>
                <td>{format(new Date(enq.date), 'MMM dd, yyyy')}</td>
                <td>
                  <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => { setSelectedEnquiry(enq); setEditEnquiryTags(enq.tags || []); setShowTagsModal(true); }}>
                    {t('common.tags')}
                  </button>
                  <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => shareEnquiry(enq._id)}>
                    🔗 {t('enquiries.share', 'Share')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={modalOverlayStyle}>
          <div className="glass-card" style={modalContentStyle}>
            <h2 style={{ marginBottom: '24px' }}>{t('enquiries.createTitle')}</h2>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>{t('enquiries.customerName')}</label>
                <input className="input-field" required value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} />
              </div>
              <div className="input-group">
                <label>{t('enquiries.contactInfo')}</label>
                <input className="input-field" required value={formData.contactInformation} onChange={e => setFormData({...formData, contactInformation: e.target.value})} />
              </div>
              <div className="input-group">
                <label>{t('enquiries.productServiceRequired')}</label>
                <input className="input-field" required value={formData.productServiceRequired} onChange={e => setFormData({...formData, productServiceRequired: e.target.value})} />
              </div>
              <div className="input-group">
                <label>{t('enquiries.priority')}</label>
                <select className="input-field" value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})}>
                  <option value="Low">{t('enquiries.low')}</option>
                  <option value="Medium">{t('enquiries.medium')}</option>
                  <option value="High">{t('enquiries.high')}</option>
                </select>
              </div>
              <div className="input-group">
                <label>{t('common.tags')}</label>
                <TagInput
                  tags={formData.tags}
                  onChange={tags => setFormData({...formData, tags})}
                  suggestions={uniqueTags}
                  placeholder={t('common.tagPlaceholder')}
                />
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>{t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTagsModal && selectedEnquiry && (
        <div style={modalOverlayStyle}>
          <div className="glass-card" style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>{t('common.editTagsTitle', { id: selectedEnquiry.enquiryId })}</h2>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => setShowTagsModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdateTags}>
              <div className="input-group">
                <label>{t('common.tags')}</label>
                <TagInput
                  tags={editEnquiryTags}
                  onChange={setEditEnquiryTags}
                  suggestions={uniqueTags}
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
  zIndex: 9999
};

const modalContentStyle = {
  width: '100%',
  maxWidth: '500px',
  background: 'var(--bg-secondary)',
};

export default Enquiries;
