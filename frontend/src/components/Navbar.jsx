import React, { useContext, useState, useEffect, useRef } from 'react';
import { ThemeContext } from '../contexts/ThemeContext';
import { LogOut, User, Globe, Sun, Moon, Search, Bell, GitBranch, MessageSquare, Info } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import { NotificationContext } from '../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';
import SearchModal from './SearchModal';
import './Navbar.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function NotifIcon({ type }) {
  if (type === 'status_change') return <GitBranch size={16} />;
  if (type === 'new_comment')   return <MessageSquare size={16} />;
  return <Info size={16} />;
}

// ── Notification Bell + Dropdown ──────────────────────────────────────────────
const NotificationBell = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useContext(NotificationContext);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleItemClick = (n) => {
    if (!n.isRead) markAsRead(n._id);
  };

  const iconClass = (type) => {
    if (type === 'status_change') return 'status';
    if (type === 'new_comment')   return 'comment';
    return 'system';
  };

  return (
    <div className="notif-wrapper" ref={wrapperRef}>
      <button
        className="notif-btn"
        onClick={() => setOpen((p) => !p)}
        aria-label="Notifications"
        title="Notifications"
        id="navbar-notification-bell"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notif-badge" key={unreadCount}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" id="notification-dropdown">
          {/* Header */}
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">
              Notifications
              {unreadCount > 0 && (
                <span className="notif-count-chip">{unreadCount} new</span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                className="notif-mark-all-btn"
                onClick={() => markAllAsRead()}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <Bell size={36} className="notif-empty-icon" />
                <span className="notif-empty-text">All caught up!</span>
              </div>
            ) : (
              notifications.slice(0, 30).map((n) => (
                <div
                  key={n._id}
                  className={`notif-item${n.isRead ? '' : ' unread'}`}
                  onClick={() => handleItemClick(n)}
                  id={`notif-item-${n._id}`}
                >
                  <div className={`notif-icon-wrap ${iconClass(n.type)}`}>
                    <NotifIcon type={n.type} />
                  </div>
                  <div className="notif-content">
                    <div className="notif-title">{n.title}</div>
                    <div className="notif-message">{n.message}</div>
                    <div className="notif-time">{timeAgo(n.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main Navbar ───────────────────────────────────────────────────────────────
const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { t, i18n } = useTranslation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Ctrl+K or Cmd+K global listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLanguageChange = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'gu', name: 'ગુજરાતી' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'ar', name: 'العربية' }
  ];

  return (
    <div className="navbar glass-panel">
      <div className="navbar-search">
        <button 
          className="search-trigger-btn" 
          onClick={() => setIsSearchOpen(true)}
          title={t('navbar.searchTooltip', 'Search or browse (Ctrl+K)')}
        >
          <Search size={16} className="search-trigger-icon" />
          <span className="search-trigger-text">{t('navbar.searchPlaceholder', 'Search or browse...')}</span>
          <span className="search-shortcut">Ctrl+K</span>
        </button>
      </div>
      <div className="navbar-profile">
        <div className="language-selector-wrapper">
          <Globe size={18} className="lang-icon" />
          <select 
            value={i18n.language ? i18n.language.substring(0, 2) : 'en'} 
            onChange={handleLanguageChange}
            className="navbar-lang-select"
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
        {/* Theme toggle button */}
        <button
          onClick={toggleTheme}
          className="theme-toggle btn-icon"
          aria-label={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Notification Bell */}
        <NotificationBell />

        <div className="user-info">
          <span className="user-name">{user?.name}</span>
          <span className="user-role">{user?.role}</span>
        </div>
        <div className="avatar">
          <User size={20} />
        </div>
        <button className="logout-btn" onClick={logout} title={t('navbar.logoutTooltip')}>
          <LogOut size={20} />
        </button>
      </div>

      {/* Global Search Modal */}
      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
};


export default Navbar;
