import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const Dashboard = () => {
  const [metrics, setMetrics] = useState({
    totalEnquiries: 0,
    activeBids: 0,
    wonBids: 0,
    lostBids: 0,
    revenueGenerated: 0,
    pendingApprovals: 0
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await api.get('/analytics/dashboard');
        setMetrics(res.data);
      } catch (err) {
        toast.error("Failed to load dashboard metrics");
      }
    };
    fetchMetrics();
  }, []);

  const chartData = {
    labels: ['Won Bids', 'Lost Bids', 'Active Bids', 'Pending Approvals'],
    datasets: [
      {
        label: 'Bid Status Overview',
        data: [metrics.wonBids, metrics.lostBids, metrics.activeBids, metrics.pendingApprovals],
        backgroundColor: [
          'rgba(16, 185, 129, 0.7)',
          'rgba(239, 68, 68, 0.7)',
          'rgba(59, 130, 246, 0.7)',
          'rgba(245, 158, 11, 0.7)',
        ],
        borderColor: [
          'rgba(16, 185, 129, 1)',
          'rgba(239, 68, 68, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(245, 158, 11, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: { color: '#94a3b8' }
      },
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: { color: '#94a3b8' }
      }
    }
  };

  return (
    <div className="dashboard-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Dashboard Overview</h1>
      </div>
      
      <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div className="glass-card metric-card">
          <h3>Total Enquiries</h3>
          <div className="value">{metrics.totalEnquiries}</div>
        </div>
        <div className="glass-card metric-card">
          <h3>Active Bids</h3>
          <div className="value">{metrics.activeBids}</div>
        </div>
        <div className="glass-card metric-card">
          <h3>Won Bids</h3>
          <div className="value" style={{ color: 'var(--success)' }}>{metrics.wonBids}</div>
        </div>
        <div className="glass-card metric-card">
          <h3>Revenue Generated</h3>
          <div className="value" style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block' }}>
            ${metrics.revenueGenerated.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="glass-card chart-container" style={{ padding: '32px' }}>
        <h3 style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>Performance Analytics</h3>
        <div style={{ height: '300px' }}>
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
