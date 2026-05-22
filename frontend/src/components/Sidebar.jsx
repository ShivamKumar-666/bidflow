import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FileText, BarChart2, Shield, Activity, User } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import './Sidebar.css';

const Sidebar = () => {
  const { user } = useContext(AuthContext);
  const { t } = useTranslation();

  return (
    <div className="sidebar glass-panel">
      <div className="sidebar-header">
        <h2>BidFlow</h2>
      </div>
      <nav className="sidebar-nav">
        <ul>
          <li>
            <NavLink to="/dashboard" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <LayoutDashboard size={20} />
              <span>{t('sidebar.dashboard')}</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/enquiries" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <MessageSquare size={20} />
              <span>{t('sidebar.enquiries')}</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/bids" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <FileText size={20} />
              <span>{t('sidebar.bids')}</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/profile" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <User size={20} />
              <span>{t('sidebar.profile')}</span>
            </NavLink>
          </li>
          {user && user.role === 'Admin' && (
            <>
              <li>
                <NavLink to="/reports" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                  <BarChart2 size={20} />
                  <span>{t('sidebar.reports')}</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/audit-logs" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                  <Activity size={20} />
                  <span>{t('sidebar.auditLogs')}</span>
                </NavLink>
              </li>
            </>
          )}
          {user && user.role === 'Admin' && (
            <li>
              <div className="nav-link" style={{ pointerEvents: 'none', opacity: 0.7 }}>
                <Shield size={20} />
                <span>{t('sidebar.adminPrivileges')}</span>
              </div>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
