import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const Reports = () => {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await api.get('/analytics/dashboard');
        setMetrics(res.data);
      } catch (err) {
        toast.error("Failed to fetch metrics");
      }
    };
    fetchMetrics();
  }, []);

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
      toast.success("Export successful!");
    } catch (err) {
      toast.error("Export failed");
    }
  };

  return (
    <div className="reports-page animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Reports & Analytics</h1>
        <button className="btn-primary" onClick={handleExport} style={{ width: 'auto' }}>
          Export Bids to CSV
        </button>
      </div>
      
      {metrics ? (
        <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginTop: '24px' }}>
          <div className="glass-card metric-card">
            <h3>Win Rate</h3>
            <div className="value" style={{ color: 'var(--success)' }}>{metrics.winRate}%</div>
          </div>
          <div className="glass-card metric-card">
            <h3>Average Bid Size</h3>
            <div className="value" style={{ color: 'var(--accent-primary)' }}>${Math.round(metrics.avgBidSize).toLocaleString()}</div>
          </div>
          <div className="glass-card metric-card">
            <h3>Total Revenue Pipeline</h3>
            <div className="value">${metrics.revenueGenerated.toLocaleString()}</div>
          </div>
          <div className="glass-card metric-card">
            <h3>Pending Approvals</h3>
            <div className="value" style={{ color: 'var(--warning)' }}>{metrics.pendingApprovals}</div>
          </div>
        </div>
      ) : (
        <div className="glass-card">
          <p style={{ color: 'var(--text-secondary)' }}>Loading analytics...</p>
        </div>
      )}
    </div>
  );
};

export default Reports;
