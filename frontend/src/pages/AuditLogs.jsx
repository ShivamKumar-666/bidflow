import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

const AuditLogs = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.get('/audit/');
        setLogs(res.data);
      } catch (err) {
        toast.error(t('audit.failedFetch'));
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [t]);

  return (
    <div className="audit-logs-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('audit.title')}</h1>
      </div>

      <div className="glass-card data-table-container">
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('audit.loading')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('audit.timestamp')}</th>
                <th>{t('audit.user')}</th>
                <th>{t('audit.action')}</th>
                <th>{t('audit.details')}</th>
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
                    {t('audit.noLogs')}
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
