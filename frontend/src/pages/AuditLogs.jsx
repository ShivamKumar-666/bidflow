import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.get('/audit/');
        setLogs(res.data);
      } catch (err) {
        toast.error("Failed to fetch audit logs");
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="audit-logs-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Audit Logs</h1>
      </div>

      <div className="glass-card data-table-container">
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading logs...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                  </td>
                  <td style={{ fontWeight: 600 }}>{log.user}</td>
                  <td>
                    <span className="status-badge info" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                      {log.action}
                    </span>
                  </td>
                  <td>{log.details}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No audit logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
