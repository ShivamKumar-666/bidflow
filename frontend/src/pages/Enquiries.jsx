import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

const Enquiries = () => {
  const { t } = useTranslation();
  const [enquiries, setEnquiries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    customerName: '',
    contactInformation: '',
    productServiceRequired: '',
    priority: 'Medium',
    notes: ''
  });

  const fetchEnquiries = async () => {
    try {
      const res = await api.get('/enquiries/');
      setEnquiries(res.data);
    } catch (err) {
      toast.error(t('enquiries.failedFetch'));
    }
  };

  useEffect(() => {
    fetchEnquiries();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/enquiries/', formData);
      setShowModal(false);
      fetchEnquiries();
      setFormData({ customerName: '', contactInformation: '', productServiceRequired: '', priority: 'Medium', notes: '' });
      toast.success(t('enquiries.createSuccess'));
    } catch (err) {
      toast.error(t('enquiries.createFailed'));
    }
  };

  return (
    <div className="enquiries-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('enquiries.title')}</h1>
        <button className="btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
          {t('enquiries.newEnquiry')}
        </button>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {enquiries.map(enq => (
              <tr key={enq._id}>
                <td style={{ fontWeight: 600 }}>{enq.enquiryId}</td>
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
              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
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
