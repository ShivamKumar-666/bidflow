import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { ThemeContext } from '../contexts/ThemeContext';
import toast from 'react-hot-toast';
import { User, Mail, Shield, Building, Percent, DollarSign, Globe, Sun, Moon, Lock, Key, Copy, Download, RefreshCw, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TwoFASetup from './TwoFASetup';
import api from '../services/api';
import './Profile.css';

const Profile = () => {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, refreshUser } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [loading, setLoading] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [disablingPassword, setDisablingPassword] = useState('');
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disabling2FA, setDisabling2FA] = useState(false);
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  
  // 2FA Backup codes state
  const [backupCodesCount, setBackupCodesCount] = useState(null);
  const [showRegenForm, setShowRegenForm] = useState(false);
  const [regenOTP, setRegenOTP] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState([]);
  const [copiedAllCodes, setCopiedAllCodes] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    industry: 'Other',
    winRate: 50,
    targetBidValue: 10000,
    bio: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        industry: user.industry || 'Other',
        winRate: user.winRate !== undefined ? user.winRate : 50,
        targetBidValue: user.targetBidValue !== undefined ? user.targetBidValue : 10000,
        bio: user.bio || ''
      });
    }
  }, [user]);

  useEffect(() => {
    if (user && user.totp_enabled) {
      fetchBackupCodesCount();
    } else {
      setBackupCodesCount(null);
    }
  }, [user]);

  const fetchBackupCodesCount = async () => {
    try {
      const res = await api.get('/2fa/backup-codes');
      setBackupCodesCount(res.data.backup_codes_remaining);
    } catch (err) {
      console.error('Failed to fetch backup codes count', err);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (regenOTP.length !== 6) {
      toast.error('Please enter a 6-digit TOTP code.');
      return;
    }
    setRegenerating(true);
    try {
      const res = await api.post('/2fa/regenerate-backup-codes', { code: regenOTP });
      setNewBackupCodes(res.data.backup_codes);
      toast.success('Backup codes regenerated successfully!');
      setShowRegenForm(false);
      setRegenOTP('');
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      toast.error(err.response?.data?.msg || 'Failed to regenerate backup codes.');
    } finally {
      setRegenerating(false);
    }
  };

  const copyNewBackupCodes = () => {
    navigator.clipboard.writeText(newBackupCodes.join('\n'));
    setCopiedAllCodes(true);
    toast.success('Backup codes copied!');
    setTimeout(() => setCopiedAllCodes(false), 2000);
  };

  const downloadNewBackupCodes = () => {
    const content = `BidFlow 2FA Backup Codes\nGenerated: ${new Date().toLocaleString()}\n\nStore these codes somewhere safe. Each can only be used once.\n\n${newBackupCodes.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bidflow-new-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile(formData);
      toast.success(t('profile.successMessage'));
    } catch (err) {
      toast.error(err.response?.data?.msg || t('profile.failedMessage'));
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleLanguageChange = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  const handleDisable2FA = async () => {
    if (!disablingPassword) {
      toast.error('Please enter your password to disable 2FA');
      return;
    }
    setDisabling2FA(true);
    try {
      await api.post('/2fa/disable', { password: disablingPassword });
      toast.success('2FA has been disabled.');
      setShowDisableForm(false);
      setDisablingPassword('');
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      toast.error(err.response?.data?.msg || 'Failed to disable 2FA');
    } finally {
      setDisabling2FA(false);
    }
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
    <div className="profile-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('profile.title')}</h1>
      </div>

      <div className="profile-layout">
        {/* Left Column: Summary Card */}
        <div className="glass-card profile-summary-card">
          <div className="profile-avatar-container">
            <div className="profile-avatar">
              {getInitials(user?.name)}
            </div>
            <h2>{user?.name || 'User'}</h2>
            <span className="profile-role-badge">
              <Shield size={14} style={{ marginRight: '6px', marginLeft: i18n.language === 'ar' ? '6px' : '0px' }} />
              {user?.role || 'Sales Executive'}
            </span>
          </div>

          <div className="profile-stats-divider" />

          <div className="profile-stats-list">
            <div className="profile-stat-item">
              <Mail className="stat-icon" size={18} />
              <div className="stat-info">
                <span className="stat-label">{t('profile.emailLabel')}</span>
                <span className="stat-value">{user?.email || 'N/A'}</span>
              </div>
            </div>

            <div className="profile-stat-item">
              <Building className="stat-icon" size={18} />
              <div className="stat-info">
                <span className="stat-label">{t('profile.industryLabel')}</span>
                <span className="stat-value">{user?.industry ? t(`bids.${user.industry.toLowerCase().substring(0, 5)}`, user.industry) : t('bids.other')}</span>
              </div>
            </div>

            <div className="profile-stat-item">
              <Percent className="stat-icon" size={18} />
              <div className="stat-info">
                <span className="stat-label">{t('profile.winRateLabel')}</span>
                <span className="stat-value">{user?.winRate !== undefined ? `${user.winRate}%` : '50%'}</span>
              </div>
            </div>

            <div className="profile-stat-item">
              <DollarSign className="stat-icon" size={18} />
              <div className="stat-info">
                <span className="stat-label">{t('profile.targetLabel')}</span>
                <span className="stat-value">
                  {user?.targetBidValue !== undefined 
                    ? `$${user.targetBidValue.toLocaleString()}` 
                    : '$10,000'}
                </span>
              </div>
            </div>
          </div>

          <div className="profile-stats-divider" />

          {/* System Preferences / Language Selection */}
          <div className="profile-settings-section">
            <h3>{t('profile.settingsTitle')}</h3>
            <p>{t('profile.settingsSubtitle')}</p>
            <div className="input-group" style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Globe size={14} />
                {t('profile.languageSelect')}
              </label>
              <select 
                value={i18n.language ? i18n.language.substring(0, 2) : 'en'} 
                onChange={handleLanguageChange}
                className="input-field"
                style={{ width: '100%', marginTop: '4px' }}
              >
                {languages.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                {t('profile.themeSelect', 'Theme')}
              </label>
              <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                <button
                  onClick={() => theme !== 'dark' && toggleTheme()}
                  className="input-field"
                  style={{
                    cursor: 'pointer',
                    flex: 1,
                    textAlign: 'center',
                    fontWeight: theme === 'dark' ? 700 : 400,
                    borderColor: theme === 'dark' ? 'var(--accent-primary)' : 'var(--border-color)',
                    background: theme === 'dark' ? 'rgba(59,130,246,0.15)' : 'var(--bg-secondary)'
                  }}
                >
                  🌙 {t('theme.dark', 'Dark')}
                </button>
                <button
                  onClick={() => theme !== 'light' && toggleTheme()}
                  className="input-field"
                  style={{
                    cursor: 'pointer',
                    flex: 1,
                    textAlign: 'center',
                    fontWeight: theme === 'light' ? 700 : 400,
                    borderColor: theme === 'light' ? 'var(--accent-primary)' : 'var(--border-color)',
                    background: theme === 'light' ? 'rgba(37,99,235,0.12)' : 'var(--bg-secondary)'
                  }}
                >
                  ☀️ {t('theme.light', 'Light')}
                </button>
              </div>
            </div>
          </div>

          {/* 2FA Security Section — Admin only */}
          {user?.role === 'Admin' && (
            <>
              <div className="profile-stats-divider" />
              <div className="profile-settings-section">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Lock size={14} /> {t('security.title')}
                </h3>
                <p>{t('security.twoFactorAuth')}</p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{
                    fontSize: '0.8rem',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    background: user?.totp_enabled ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
                    color: user?.totp_enabled ? 'var(--success)' : 'var(--danger)',
                    fontWeight: 600
                  }}>
                    {user?.totp_enabled ? t('security.enabled') : t('security.notEnabled')}
                  </span>
                </div>

                {user?.totp_enabled && backupCodesCount !== null && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    {t('security.backupCodesRemaining', { count: backupCodesCount })}
                  </p>
                )}

                {!user?.totp_enabled && (
                  <button
                    className="btn-primary"
                    style={{ padding: '10px', fontSize: '0.85rem' }}
                    onClick={() => setShow2FASetup(true)}
                  >
                    <Key size={14} /> {t('security.enable2fa')}
                  </button>
                )}

                {user?.totp_enabled && !showDisableForm && !showRegenForm && newBackupCodes.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      className="btn-outline"
                      style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }}
                      onClick={() => { setShowDisableForm(true); setShowDisablePassword(false); }}
                    >
                      {t('security.disable2fa')}
                    </button>
                    <button
                      className="btn-outline"
                      style={{ width: '100%', padding: '10px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      onClick={() => setShowRegenForm(true)}
                    >
                      <RefreshCw size={14} /> {t('security.regenerateBackupCodes')}
                    </button>
                  </div>
                )}

                {newBackupCodes.length > 0 && (
                  <div className="new-backup-codes-container" style={{ marginTop: '12px', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px dashed var(--success)' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600, marginBottom: '6px' }}>
                      {t('security.newBackupCodes')}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '8px' }}>
                      {newBackupCodes.map((code, idx) => (
                        <div key={idx} style={{ padding: '4px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', textAlign: 'center', color: 'var(--text-primary)' }}>
                          {code}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <button className="btn-outline" onClick={downloadNewBackupCodes} style={{ flex: 1, padding: '6px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <Download size={12} /> {t('security.save')}
                      </button>
                      <button className="btn-outline" onClick={copyNewBackupCodes} style={{ flex: 1, padding: '6px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        {copiedAllCodes ? <CheckCircle size={12} /> : <Copy size={12} />}
                        {copiedAllCodes ? t('security.copied') : t('security.copy')}
                      </button>
                    </div>
                    <button className="btn-primary" onClick={() => { setNewBackupCodes([]); fetchBackupCodesCount(); }} style={{ width: '100%', padding: '6px', fontSize: '0.75rem' }}>
                      {t('security.savedBackupCodes')}
                    </button>
                  </div>
                )}

                {showDisableForm && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ position: 'relative', marginBottom: '8px' }}>
                      <input
                        type={showDisablePassword ? 'text' : 'password'}
                        className="input-field"
                        placeholder={t('security.enterPasswordPlaceholder')}
                        value={disablingPassword}
                        onChange={(e) => setDisablingPassword(e.target.value)}
                        style={{ width: '100%', paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowDisablePassword(v => !v)}
                        aria-label={showDisablePassword ? t('security.hidePassword') : t('security.showPassword')}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '4px',
                        }}
                      >
                        {showDisablePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn-outline"
                        style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                        onClick={() => { setShowDisableForm(false); setDisablingPassword(''); setShowDisablePassword(false); }}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        className="btn-primary"
                        style={{ flex: 1, padding: '8px', fontSize: '0.8rem', background: 'var(--danger)', boxShadow: 'none' }}
                        onClick={handleDisable2FA}
                        disabled={disabling2FA}
                      >
                        {disabling2FA ? t('security.disabling') : t('security.confirmDisable')}
                      </button>
                    </div>
                  </div>
                )}

                {showRegenForm && (
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      {t('security.enterOtpInstruction')}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="input-field"
                      placeholder="000000"
                      value={regenOTP}
                      onChange={(e) => setRegenOTP(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      style={{ marginBottom: '8px', width: '100%' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn-outline"
                        style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                        onClick={() => { setShowRegenForm(false); setRegenOTP(''); }}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        className="btn-primary"
                        style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                        onClick={handleRegenerateBackupCodes}
                        disabled={regenerating || regenOTP.length !== 6}
                      >
                        {regenerating ? t('security.regenerating') : t('security.confirm')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {/* TwoFASetup Modal */}
        {show2FASetup && (
          <TwoFASetup onClose={() => setShow2FASetup(false)} />
        )}

        {/* Right Column: Edit Profile Form */}
        <div className="glass-card profile-form-card">
          <h2>{t('profile.detailsTitle')}</h2>
          <p className="profile-form-subtitle">{t('profile.subtitle')}</p>

          <form onSubmit={handleSubmit} className="profile-form">
            <div className="profile-form-grid">
              <div className="input-group">
                <label>{t('profile.name')}</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={formData.name} 
                  onChange={e => setFormData({ ...formData, name: e.target.value })} 
                  required 
                />
              </div>

              <div className="input-group">
                <label>{t('profile.industry')}</label>
                <select 
                  className="input-field" 
                  value={formData.industry} 
                  onChange={e => setFormData({ ...formData, industry: e.target.value })}
                >
                  <option value="Technology">{t('bids.tech')}</option>
                  <option value="Healthcare">{t('bids.health')}</option>
                  <option value="Construction">{t('bids.const')}</option>
                  <option value="Energy">{t('bids.energy')}</option>
                  <option value="Finance">{t('bids.fin')}</option>
                  <option value="Other">{t('bids.other')}</option>
                </select>
              </div>

              <div className="input-group">
                <label>{t('profile.winRate')}</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  className="input-field" 
                  value={formData.winRate} 
                  onChange={e => setFormData({ ...formData, winRate: parseInt(e.target.value) || 0 })} 
                  required 
                />
              </div>

              <div className="input-group">
                <label>{t('profile.targetBidValue')}</label>
                <input 
                  type="number" 
                  min="0" 
                  className="input-field" 
                  value={formData.targetBidValue} 
                  onChange={e => setFormData({ ...formData, targetBidValue: parseFloat(e.target.value) || 0 })} 
                  required 
                />
              </div>
            </div>

            <div className="input-group full-width">
              <label>{t('profile.bio')}</label>
              <textarea 
                className="input-field textarea-field" 
                rows="4"
                placeholder={t('profile.bioPlaceholder')}
                value={formData.bio} 
                onChange={e => setFormData({ ...formData, bio: e.target.value })}
              />
            </div>

            <button type="submit" className="btn-primary profile-save-btn" disabled={loading}>
              {loading ? t('common.saving') : t('profile.saveBtn')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;
