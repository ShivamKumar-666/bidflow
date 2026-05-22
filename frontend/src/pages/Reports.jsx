import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useTranslation } from 'react-i18next';
import { Brain, Cpu, Play, Calendar, AlertTriangle, RefreshCw } from 'lucide-react';

const Reports = () => {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [retraining, setRetraining] = useState(false);
  const [loadingModel, setLoadingModel] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await api.get('/analytics/dashboard');
        setMetrics(res.data);
      } catch (err) {
        toast.error(t('dashboard.failedLoad'));
      }
    };
    fetchMetrics();
    fetchModelStatus();
  }, [t]);

  const fetchModelStatus = async () => {
    setLoadingModel(true);
    try {
      const res = await api.get('/admin/model-status');
      setModelStatus(res.data);
    } catch (err) {
      console.error('Failed to load model status', err);
    } finally {
      setLoadingModel(false);
    }
  };

  const handleRetrainModel = async () => {
    setRetraining(true);
    try {
      const res = await api.post('/admin/retrain');
      if (res.data.status === 'success') {
        toast.success(t('mlModel.successToast', { accuracy: (res.data.accuracy * 100).toFixed(2) }));
      } else {
        toast.error(t('mlModel.skippedToast', { message: res.data.message || t('mlModel.notFound') }));
      }
      await fetchModelStatus();
    } catch (err) {
      toast.error(err.response?.data?.msg || t('mlModel.failedToast'));
    } finally {
      setRetraining(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/analytics/export/excel', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'bids_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t('reports.csvSuccess'));
    } catch (err) {
      toast.error(t('reports.csvFailed'));
    }
  };

  const handleExportPDF = async () => {
    try {
      const res = await api.get('/bids/');
      const bidsData = res.data;
      
      const doc = new jsPDF();
      doc.text(t('reports.pdfTitle'), 14, 15);
      
      const tableColumn = [
        t('bids.bidId'), 
        t('bids.enquiryId'), 
        t('bids.amount'), 
        t('bids.status'), 
        t('bids.assignedTo')
      ];
      const tableRows = [];

      bidsData.forEach(bid => {
        const bidData = [
          bid.bidId || "N/A",
          bid.enquiryId || "N/A",
          `$${bid.amount || 0}`,
          bid.status || "N/A",
          bid.assignedEmployee || "N/A"
        ];
        tableRows.push(bidData);
      });

      doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 20,
      });

      doc.save("bids_report.pdf");
      toast.success(t('reports.pdfSuccess'));
    } catch (err) {
      toast.error(t('reports.pdfFailed'));
    }
  };

  return (
    <div className="reports-page animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">{t('reports.title')}</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-outline" onClick={handleExportPDF} style={{ width: 'auto' }}>
            {t('reports.exportPdf')}
          </button>
          <button className="btn-primary" onClick={handleExport} style={{ width: 'auto' }}>
            {t('reports.exportCsv')}
          </button>
        </div>
      </div>
      
      {metrics ? (
        <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginTop: '24px' }}>
          <div className="glass-card metric-card">
            <h3>{t('reports.winRate')}</h3>
            <div className="value" style={{ color: 'var(--success)' }}>{metrics.winRate}%</div>
          </div>
          <div className="glass-card metric-card">
            <h3>{t('reports.avgBidSize')}</h3>
            <div className="value" style={{ color: 'var(--accent-primary)' }}>${Math.round(metrics.avgBidSize).toLocaleString()}</div>
          </div>
          <div className="glass-card metric-card">
            <h3>{t('reports.totalRevenue')}</h3>
            <div className="value">${metrics.revenueGenerated.toLocaleString()}</div>
          </div>
          <div className="glass-card metric-card">
            <h3>{t('reports.pendingApprovals')}</h3>
            <div className="value" style={{ color: 'var(--warning)' }}>{metrics.pendingApprovals}</div>
          </div>
        </div>
      ) : (
        <div className="glass-card">
          <p style={{ color: 'var(--text-secondary)' }}>{t('reports.loading')}</p>
        </div>
      )}

      <div className="reports-section-divider" style={{ margin: '32px 0 24px 0', borderTop: '1px solid var(--border-color)' }} />

      <div className="glass-card ml-model-card" style={{ padding: '24px', marginTop: '24px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Brain size={24} style={{ color: 'var(--accent-primary)' }} />
          {t('mlModel.modelHeader')}
        </h2>
        
        {loadingModel ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('mlModel.loadingStatus')}</p>
        ) : modelStatus ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            <div className="model-info-column" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={16} style={{ color: 'var(--text-secondary)' }} />
                <span>
                  <strong>{t('mlModel.modelStatusLabel')}</strong>{' '}
                  {modelStatus.model?.exists ? (
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>{t('mlModel.active')}</span>
                  ) : (
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{t('mlModel.notFound')}</span>
                  )}
                </span>
              </div>
              
              {modelStatus.model?.exists && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <Calendar size={16} />
                    <span>{t('mlModel.lastUpdated', { time: new Date(modelStatus.model.last_modified).toLocaleString() })}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <span>{t('mlModel.modelSize', { size: modelStatus.model.size_kb })}</span>
                  </div>
                </>
              )}
              
              <div style={{ marginTop: '8px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.9rem' }}>
                <strong>{t('mlModel.dataNextTraining')}:</strong>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span>{t('mlModel.terminalBids')}</span>
                  <span><strong>{modelStatus.terminal_bids}</strong> / {modelStatus.min_to_retrain}</span>
                </div>
                <div 
                  role="progressbar"
                  aria-valuenow={modelStatus.terminal_bids}
                  aria-valuemin={0}
                  aria-valuemax={modelStatus.min_to_retrain}
                  aria-label={t('mlModel.dataNextTraining')}
                  style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}
                >
                  <div 
                    style={{ 
                      width: `${Math.min(100, (modelStatus.terminal_bids / modelStatus.min_to_retrain) * 100)}%`, 
                      height: '100%', 
                      background: modelStatus.ready_to_retrain ? 'var(--success)' : 'var(--accent-primary)',
                      transition: 'width 0.3s ease'
                    }} 
                  />
                </div>
              </div>
            </div>

            <div className="model-actions-column" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {t('mlModel.modelExplanation')}
              </p>
              
              <button 
                className="btn-primary" 
                onClick={handleRetrainModel}
                disabled={retraining || !modelStatus.ready_to_retrain}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px',
                  background: modelStatus.ready_to_retrain ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                  cursor: modelStatus.ready_to_retrain ? 'pointer' : 'not-allowed',
                  color: modelStatus.ready_to_retrain ? '#fff' : 'var(--text-secondary)',
                  width: '100%',
                  padding: '10px'
                }}
              >
                {retraining ? (
                  <>
                    <RefreshCw className="animate-spin" size={16} style={{ marginRight: '6px' }} />
                    {t('mlModel.retraining')}
                  </>
                ) : (
                  <>
                    <Play size={16} style={{ marginRight: '6px' }} />
                    {t('mlModel.retrainNow')}
                  </>
                )}
              </button>
              
              {!modelStatus.ready_to_retrain && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--warning)', marginTop: '4px' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  <span>{t('mlModel.requiresBids', { count: modelStatus.min_to_retrain })}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>{t('mlModel.failedLoadStatus')}</p>
        )}
      </div>
    </div>
  );
};

export default Reports;
