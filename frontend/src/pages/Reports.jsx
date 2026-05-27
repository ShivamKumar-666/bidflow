import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useTranslation } from 'react-i18next';
import { Brain, Cpu, Play, Calendar, AlertTriangle, RefreshCw, History, Undo2, CheckCircle } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';

const Reports = () => {
  const { t } = useTranslation();
  const { user } = useContext(AuthContext);
  const [metrics, setMetrics] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [retraining, setRetraining] = useState(false);
  const [loadingModel, setLoadingModel] = useState(true);

  // Model versioning
  const [modelVersions, setModelVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [rollingBack, setRollingBack] = useState(null); // version number being rolled back

  const [slaReport, setSlaReport] = useState(null);
  const [loadingSla, setLoadingSla] = useState(true);
  const [scanningSla, setScanningSla] = useState(false);

  const fetchSlaReport = async () => {
    if (user?.role !== 'Admin') return;
    setLoadingSla(true);
    try {
      const res = await api.get('/admin/sla/report');
      setSlaReport(res.data);
    } catch (err) {
      console.error('Failed to load SLA report', err);
    } finally {
      setLoadingSla(false);
    }
  };

  const handleScanSla = async () => {
    setScanningSla(true);
    try {
      await api.post('/admin/sla/check');
      toast.success(t('reports.slaScanSuccess', 'SLA scan completed!'));
      await fetchSlaReport();
      const metricsRes = await api.get('/analytics/dashboard');
      setMetrics(metricsRes.data);
    } catch (err) {
      toast.error(err.response?.data?.msg || t('reports.slaScanFailed', 'Failed to run SLA scan'));
    } finally {
      setScanningSla(false);
    }
  };

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
    fetchModelVersions();
    if (user?.role === 'Admin') {
      fetchSlaReport();
    }
  }, [t, user]);

  const fetchModelVersions = async () => {
    if (!user || user.role !== 'Admin') return;
    setLoadingVersions(true);
    try {
      const res = await api.get('/admin/models');
      setModelVersions(res.data);
    } catch (err) {
      console.error('Failed to load model versions', err);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRollback = async (version) => {
    setRollingBack(version);
    try {
      const res = await api.post('/admin/models/rollback', { version });
      toast.success(res.data.msg || `Rolled back to version ${version}`);
      await fetchModelVersions();
      await fetchModelStatus();
    } catch (err) {
      toast.error(err.response?.data?.msg || 'Rollback failed');
    } finally {
      setRollingBack(null);
    }
  };

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

      {user?.role === 'Admin' && (
        <>
          <div className="reports-section-divider" style={{ margin: '32px 0 24px 0', borderTop: '1px solid var(--border-color)' }} />
          
          <div className="glass-card sla-report-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                <AlertTriangle size={24} style={{ color: 'var(--danger)' }} />
                {t('reports.slaReport', 'SLA Breach Analysis')}
              </h2>
              <button
                className="btn-primary"
                onClick={handleScanSla}
                disabled={scanningSla}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px',
                  width: 'auto',
                  padding: '8px 16px',
                  background: scanningSla ? 'rgba(255,255,255,0.05)' : 'var(--danger)',
                  borderColor: 'transparent'
                }}
              >
                <RefreshCw className={scanningSla ? "animate-spin" : ""} size={16} />
                {scanningSla ? t('reports.slaScanning', 'Scanning...') : t('reports.slaScan', 'Trigger SLA Scan')}
              </button>
            </div>
            
            {loadingSla ? (
              <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading', 'Loading...')}</p>
            ) : slaReport ? (
              <>
                {/* SLA Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('reports.slaActiveBreaches', 'Active SLA Breaches')}</span>
                    <div className="sla-stat-number" style={{ color: 'var(--danger)' }}>{slaReport.details?.length || 0}</div>
                  </div>
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('reports.slaBreachFrequencyByStage', 'Breach Frequency by Status Stage')}</span>
                    <div style={{ fontWeight: 600, fontSize: '1.25rem', marginTop: '12px', color: 'var(--text-primary)' }}>
                      {slaReport.by_stage && slaReport.by_stage.length > 0 ? 
                        `${slaReport.by_stage.reduce((max, cur) => cur.count > max.count ? cur : max, slaReport.by_stage[0]).stage} (${slaReport.by_stage.reduce((max, cur) => cur.count > max.count ? cur : max, slaReport.by_stage[0]).count})` 
                        : 'N/A'
                      }
                    </div>
                  </div>
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('reports.slaBreachFrequencyByEmployee', 'Breach Frequency by Employee')}</span>
                    <div style={{ fontWeight: 600, fontSize: '1.25rem', marginTop: '12px', color: 'var(--text-primary)' }}>
                      {slaReport.by_employee && slaReport.by_employee.length > 0 ? 
                        `${slaReport.by_employee.reduce((max, cur) => cur.count > max.count ? cur : max, slaReport.by_employee[0]).employee} (${slaReport.by_employee.reduce((max, cur) => cur.count > max.count ? cur : max, slaReport.by_employee[0]).count})` 
                        : 'N/A'
                      }
                    </div>
                  </div>
                </div>

                {/* Stage and Employee Frequencies Charts Grid */}
                <div className="sla-report-grid">
                  <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>{t('reports.slaBreachFrequencyByStage', 'Breach Frequency by Status Stage')}</h3>
                    {slaReport.by_stage && slaReport.by_stage.length > 0 ? (
                      slaReport.by_stage.map(item => {
                        const maxVal = Math.max(1, ...slaReport.by_stage.map(x => x.count));
                        return (
                          <div key={item.stage} className="sla-list-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.stage}</span>
                              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{item.count}</span>
                            </div>
                            <div className="sla-chart-bar-container">
                              <div className="sla-chart-bar" style={{ width: `${(item.count / maxVal) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No breach data by stage.</p>
                    )}
                  </div>

                  <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>{t('reports.slaBreachFrequencyByEmployee', 'Breach Frequency by Employee')}</h3>
                    {slaReport.by_employee && slaReport.by_employee.length > 0 ? (
                      slaReport.by_employee.map(item => {
                        const maxVal = Math.max(1, ...slaReport.by_employee.map(x => x.count));
                        return (
                          <div key={item.employee} className="sla-list-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.employee}</span>
                              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{item.count}</span>
                            </div>
                            <div className="sla-chart-bar-container">
                              <div className="sla-chart-bar" style={{ width: `${(item.count / maxVal) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No breach data by employee.</p>
                    )}
                  </div>
                </div>

                {/* Overdue Bids Details Table */}
                <div style={{ marginTop: '24px', overflowX: 'auto' }}>
                  <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>{t('reports.slaActiveBreaches', 'Active SLA Breaches')} Details</h3>
                  {slaReport.details && slaReport.details.length > 0 ? (
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>{t('bids.bidId', 'Bid ID')}</th>
                          <th>{t('bids.assignedTo', 'Assigned Representative')}</th>
                          <th>{t('bids.status', 'Status Stage')}</th>
                          <th>{t('reports.slaLimit', 'SLA Limit')}</th>
                          <th>{t('reports.slaElapsed', 'Time Elapsed')}</th>
                          <th>{t('reports.slaDays', 'Days Overdue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slaReport.details.map(bid => (
                          <tr key={bid._id}>
                            <td style={{ fontWeight: 600 }}>{bid.bidId}</td>
                            <td>{bid.assignedEmployee || 'Unassigned'}</td>
                            <td>
                              <span className="status-badge review" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                                {bid.status}
                              </span>
                            </td>
                            <td>{bid.slaThresholdDays} {t('common.days', 'days')}</td>
                            <td>{bid.slaElapsedDays} {t('common.days', 'days')}</td>
                            <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
                              +{bid.slaElapsedDays - bid.slaThresholdDays} {t('common.days', 'days')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '16px 0' }}>No active SLA breaches detected.</p>
                  )}
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>{t('reports.slaScanFailed', 'Failed to load SLA report')}</p>
            )}
          </div>
        </>
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

      {/* Model Version Control Section — Admin only */}
      {user?.role === 'Admin' && (
        <div className="glass-card" style={{ padding: '24px', marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
              <History size={22} style={{ color: 'var(--accent-primary)' }} />
              Model Version History
            </h2>
            <button
              className="btn-outline"
              style={{ width: 'auto', padding: '7px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={fetchModelVersions}
              disabled={loadingVersions}
            >
              <RefreshCw size={14} className={loadingVersions ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {loadingVersions ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading versions…</p>
          ) : modelVersions.length === 0 ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '12px',
              border: '1px dashed var(--border-color)'
            }}>
              <History size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
              <p style={{ fontSize: '0.9rem' }}>No versioned models found. Retrain to create the first version.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Accuracy</th>
                    <th>Records Used</th>
                    <th>Trained At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {modelVersions.map(v => (
                    <tr key={v._id} style={{
                      background: v.isActive ? 'rgba(59,130,246,0.04)' : 'transparent',
                      borderLeft: v.isActive ? '3px solid var(--accent-primary)' : '3px solid transparent'
                    }}>
                      <td style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        v{v.version}
                      </td>
                      <td>
                        {v.isActive ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '4px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700,
                            background: 'rgba(16,185,129,0.12)', color: 'var(--success)',
                            border: '1px solid rgba(16,185,129,0.3)'
                          }}>
                            <CheckCircle size={12} /> Active
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '4px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
                            background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
                            border: '1px solid var(--border-color)'
                          }}>
                            Inactive
                          </span>
                        )}
                      </td>
                      <td style={{
                        fontWeight: 700,
                        color: v.accuracy >= 0.7 ? 'var(--success)' : (v.accuracy >= 0.5 ? 'var(--warning)' : 'var(--danger)')
                      }}>
                        {v.accuracy != null ? `${(v.accuracy * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {v.records ?? 'N/A'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {v.trainedAt ? new Date(v.trainedAt).toLocaleString() : 'N/A'}
                      </td>
                      <td>
                        {!v.isActive ? (
                          <button
                            className="btn-outline"
                            style={{
                              padding: '5px 12px', fontSize: '0.8rem', width: 'auto',
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.4)'
                            }}
                            onClick={() => handleRollback(v.version)}
                            disabled={rollingBack === v.version}
                          >
                            {rollingBack === v.version
                              ? <RefreshCw size={12} className="animate-spin" />
                              : <Undo2 size={12} />}
                            {rollingBack === v.version ? 'Rolling back…' : 'Rollback'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;
