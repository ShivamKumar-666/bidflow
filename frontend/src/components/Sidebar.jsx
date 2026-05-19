import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FileText, BarChart2, Shield, Activity } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import './Sidebar.css';

const Sidebar = () => {
  const { user } = useContext(AuthContext);

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
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/enquiries" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <MessageSquare size={20} />
              <span>Enquiries</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/bids" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <FileText size={20} />
              <span>Bids</span>
            </NavLink>
          </li>
          {user && user.role === 'Admin' && (
            <>
              <li>
                <NavLink to="/reports" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                  <BarChart2 size={20} />
                  <span>Reports</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/audit-logs" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                  <Activity size={20} />
                  <span>Audit Logs</span>
                </NavLink>
              </li>
            </>
          )}
          {user && user.role === 'Admin' && (
            <li>
              <div className="nav-link" style={{ pointerEvents: 'none', opacity: 0.7 }}>
                <Shield size={20} />
                <span>Admin Privileges Active</span>
              </div>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
