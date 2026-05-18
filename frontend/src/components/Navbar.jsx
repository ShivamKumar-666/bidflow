import React, { useContext } from 'react';
import { LogOut, User } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);

  return (
    <div className="navbar glass-panel">
      <div className="navbar-search">
        {/* Placeholder for future search */}
      </div>
      <div className="navbar-profile">
        <div className="user-info">
          <span className="user-name">{user?.name}</span>
          <span className="user-role">{user?.role}</span>
        </div>
        <div className="avatar">
          <User size={20} />
        </div>
        <button className="logout-btn" onClick={logout} title="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </div>
  );
};

export default Navbar;
