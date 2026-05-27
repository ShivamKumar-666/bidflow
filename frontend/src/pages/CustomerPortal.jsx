import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import './CustomerPortal.css';

const CustomerPortal = () => {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchPublicData = async () => {
      try {
        setLoading(true);
        // Direct axios request since it does not need JWT authorization headers
        const res = await axios.get(`http://localhost:5000/api/enquiries/public/share/${token}`);
        setData(res.data);
        setError(null);
      } catch (err) {
        if (err.response && err.response.status === 403) {
          setError(t('common.linkExpired', 'This share link has expired. Links are valid for 90 days.'));
        } else {
          setError(t('common.error', 'Invalid share link or enquiry not found.'));
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPublicData();
  }, [token, t]);

  const getStatusBadgeClass = (status) => {
    if (['Order Received', 'Completed', 'Approved'].includes(status)) return 'success';
    if (['Rejected', 'Lost'].includes(status)) return 'danger';
    if (['Submitted', 'Negotiation', 'Quotation Prepared'].includes(status)) return 'info';
    return 'review';
  };

  if (loading) {
    return (
      <div className="portal-loading-container">
        <div className="portal-spinner"></div>
        <p>{t('common.loading', 'Loading portal details...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portal-error-container animate-fade-in">
        <div className="portal-error-card glass-card">
          <div className="portal-error-icon">⚠️</div>
          <h2>{t('common.error', 'Access Denied')}</h2>
          <p>{error}</p>
          <div style={{ marginTop: '24px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Please contact your Sales representative to request a new link.
          </div>
        </div>
      </div>
    );
  }

  const { enquiry, bid, documents } = data || {};

  return (
    <div className="portal-page animate-fade-in">
      <div className="portal-header">
        <div className="portal-logo">BidFlow</div>
        <h1 className="portal-title">{t('common.portalTitle', 'Customer Status Portal')}</h1>
        <p className="portal-subtitle">{t('common.portalSubtitle', 'Track your proposal status and access relevant files.')}</p>
      </div>

      <div className="portal-grid">
        {/* Enquiry Summary */}
        <div className="glass-card portal-summary-card">
          <h2 className="portal-card-title">{t('enquiries.customer', 'Customer Details')}</h2>
          <div className="portal-info-row">
            <span className="info-label">{t('enquiries.customerName', 'Company Name')}:</span>
            <span className="info-value">{enquiry?.customerName}</span>
          </div>
          <div className="portal-info-row">
            <span className="info-label">{t('enquiries.productServiceRequired', 'Requested Service')}:</span>
            <span className="info-value">{enquiry?.productServiceRequired}</span>
          </div>
          <div className="portal-info-row">
            <span className="info-label">{t('enquiries.id', 'Enquiry ID')}:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{enquiry?.enquiryId}</span>
          </div>
          <div className="portal-info-row">
            <span className="info-label">{t('enquiries.date', 'Request Date')}:</span>
            <span className="info-value">
              {enquiry?.date ? format(new Date(enquiry.date), 'MMM dd, yyyy') : 'N/A'}
            </span>
          </div>
          <div className="portal-info-row" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <span className="info-label">{t('enquiries.status', 'Current Status')}:</span>
            <span className={`status-badge ${getStatusBadgeClass(bid?.status || enquiry?.status)}`}>
              {bid?.status 
                ? t(`bids.statusValue.${bid.status.toLowerCase().replace(/[^a-z0-9]/g, '_')}`, bid.status)
                : t(`enquiries.statusValue.${enquiry.status.toLowerCase().replace(/\s+/g, '_')}`, enquiry.status)
              }
            </span>
          </div>
        </div>

        {/* Timeline & Documents Layout */}
        <div className="portal-details-col">
          {/* Status Timeline */}
          <div className="glass-card portal-timeline-card">
            <h2 className="portal-card-title">{t('common.timeline', 'Status Timeline')}</h2>
            <div className="portal-timeline">
              {bid?.history && bid.history.length > 0 ? (
                bid.history.map((h, i) => (
                  <div key={i} className="timeline-item">
                    <div className="timeline-badge-container">
                      <div className={`timeline-badge-circle ${i === bid.history.length - 1 ? 'active' : ''}`}></div>
                      {i < bid.history.length - 1 && <div className="timeline-line"></div>}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-meta">
                        <span className="timeline-status-text">
                          {t(`bids.statusValue.${h.status.toLowerCase().replace(/[^a-z0-9]/g, '_')}`, h.status)}
                        </span>
                        <span className="timeline-date-text">
                          {format(new Date(h.date), 'MMM dd, yyyy h:mm a')}
                        </span>
                      </div>
                      {h.note && <p className="timeline-note-text">{h.note}</p>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="timeline-item">
                  <div className="timeline-badge-container">
                    <div className="timeline-badge-circle active"></div>
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-meta">
                      <span className="timeline-status-text">
                        {t(`enquiries.statusValue.${enquiry?.status.toLowerCase().replace(/\s+/g, '_')}`, enquiry?.status)}
                      </span>
                      <span className="timeline-date-text">
                        {enquiry?.date ? format(new Date(enquiry.date), 'MMM dd, yyyy') : ''}
                      </span>
                    </div>
                    <p className="timeline-note-text">Your enquiry is currently under review by our sales engineering team.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Uploaded Documents */}
          <div className="glass-card portal-documents-card">
            <h2 className="portal-card-title">{t('common.documents', 'Shared Documents')}</h2>
            {documents && documents.length > 0 ? (
              <div className="portal-docs-list">
                {documents.map(doc => (
                  <div key={doc._id} className="portal-doc-row">
                    <div className="portal-doc-info">
                      <span className="doc-icon">📄</span>
                      <div className="doc-meta">
                        <span className="doc-name">{doc.filename}</span>
                        <span className="doc-date">
                          {t('enquiries.date', 'Uploaded')}: {format(new Date(doc.uploadDate), 'MMM dd, yyyy')}
                        </span>
                      </div>
                    </div>
                    <a 
                      href={`http://localhost:5000/api/enquiries/public/share/${token}/download/${doc._id}`}
                      className="btn-outline" 
                      style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center' }}
                      download
                    >
                      ⬇️ Download
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="portal-no-docs">
                <span style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📂</span>
                <p>No documents have been shared for public view yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerPortal;
