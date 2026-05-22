import React, { useContext } from 'react';
import { ThemeContext } from '../contexts/ThemeContext';
import { LogOut, User, Globe, Sun, Moon } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { t, i18n } = useTranslation();

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
        {/* Placeholder for future search */}
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
    </div>
  );
};

export default Navbar;
