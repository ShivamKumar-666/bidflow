import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Shield, Copy, Download, CheckCircle, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './TwoFASetup.css';

const TwoFASetup = ({ onClose }) => {
  const { t } = useTranslation();
  const { dismissTwoFASetup, refreshUser } = useContext(AuthContext);
  const [step, setStep] = useState('loading'); // loading | qr | verify | backup
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    fetchSetup();
  }, []);

  const fetchSetup = async () => {
    setStep('loading');
    setError('');
    try {
      const res = await api.get('/2fa/setup');
      setQrCode(res.data.qr_code);
      setSecret(res.data.secret);
      setStep('qr');
    } catch (err) {
      setError('Failed to generate 2FA setup. Please try again.');
      setStep('error');
    }
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/2fa/enable', { code: verifyCode });
      setBackupCodes(res.data.backup_codes);
      setStep('backup');
      toast.success('2FA enabled successfully!');
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      setError(err.response?.data?.msg || 'Invalid code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeInput = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setVerifyCode(val);
    setError('');
  };

  const copyAllBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedAll(true);
    toast.success('Backup codes copied!');
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadBackupCodes = () => {
    const content = `BidFlow 2FA Backup Codes\nGenerated: ${new Date().toLocaleString()}\n\nStore these codes somewhere safe. Each can only be used once.\n\n${backupCodes.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bidflow-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDone = () => {
    dismissTwoFASetup();
    if (onClose) onClose();
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    toast.success('Secret key copied!');
  };

  return (
    <div className="twofa-overlay">
      <div className="twofa-modal glass-panel">
        {/* Header */}
        <div className="twofa-header">
          <div className="twofa-header-icon">
            <Shield size={28} />
          </div>
          <div>
            <h2>{t('security.twoFactorAuth')}</h2>
            <p>{t('security.setupInstructions')}</p>
          </div>
          {step === 'backup' && (
            <button className="twofa-close-btn" onClick={handleDone} aria-label={t('common.cancel')}>
              <X size={20} />
            </button>
          )}
        </div>

        {/* Step indicators */}
        <div className="twofa-steps">
          {[t('security.scanQr'), t('security.verify'), t('security.backupCodes')].map((label, i) => {
            const stepMap = { 0: ['qr', 'loading', 'error'], 1: ['verify'], 2: ['backup'] };
            const active = stepMap[i]?.includes(step) || (i === 0 && step === 'loading');
            const done = (i === 0 && ['verify', 'backup'].includes(step)) ||
                         (i === 1 && step === 'backup');
            return (
              <div key={label} className={`twofa-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                <div className="twofa-step-dot">
                  {done ? <CheckCircle size={14} /> : i + 1}
                </div>
                <span>{label}</span>
              </div>
            );
          })}
        </div>

        {/* LOADING */}
        {step === 'loading' && (
          <div className="twofa-body twofa-center">
            <div className="twofa-spinner" />
            <p>{t('security.generatingQr')}</p>
          </div>
        )}

        {/* ERROR */}
        {step === 'error' && (
          <div className="twofa-body twofa-center">
            <div className="twofa-error-icon">
              <AlertTriangle size={48} />
            </div>
            <p>{error}</p>
            <button className="btn-primary twofa-btn" onClick={fetchSetup}>
              <RefreshCw size={16} /> {t('security.tryAgain')}
            </button>
          </div>
        )}

        {/* STEP 1: QR CODE */}
        {step === 'qr' && (
          <div className="twofa-body">
            <div className="twofa-instructions">
              <div className="twofa-step-num">1</div>
              <p>{t('security.authenticatorAppInstructions')}</p>
            </div>
            <div className="twofa-qr-container">
              <img src={qrCode} alt="2FA QR Code" className="twofa-qr" />
            </div>
            <div className="twofa-manual">
              <p>{t('security.manualKey')}</p>
              <div className="twofa-secret-box">
                <code>{secret.match(/.{1,4}/g)?.join(' ')}</code>
                <button onClick={copySecret} className="twofa-copy-inline" aria-label={t('security.copySecret')}>
                  <Copy size={14} />
                </button>
              </div>
            </div>
            <button className="btn-primary twofa-btn" onClick={() => setStep('verify')}>
              {t('security.scannedQr')}
            </button>
          </div>
        )}

        {/* STEP 2: VERIFY */}
        {step === 'verify' && (
          <div className="twofa-body">
            <div className="twofa-instructions">
              <div className="twofa-step-num">2</div>
              <p>{t('security.confirmSetupInstructions')}</p>
            </div>
            <div className="twofa-otp-container">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={handleCodeInput}
                className="twofa-otp-input"
                placeholder="000000"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              />
            </div>
            {error && (
              <div className="twofa-error">
                <AlertTriangle size={14} /> {error}
              </div>
            )}
            <div className="twofa-btn-row">
              <button className="btn-outline twofa-btn-sm" onClick={() => { setStep('qr'); setVerifyCode(''); setError(''); }}>
                ← {t('common.cancel')}
              </button>
              <button
                className="btn-primary twofa-btn"
                onClick={handleVerify}
                disabled={submitting || verifyCode.length !== 6}
              >
                {submitting ? t('security.verifying') : t('security.enable2faConfirm')}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: BACKUP CODES */}
        {step === 'backup' && (
          <div className="twofa-body">
            <div className="twofa-instructions">
              <div className="twofa-step-num" style={{ background: 'var(--success)' }}>✓</div>
              <p>{t('security.activeSuccess')}</p>
            </div>
            <div className="twofa-backup-warning">
              <AlertTriangle size={14} />
              {t('security.backupCodesWarning')}
            </div>
            <div className="twofa-backup-grid">
              {backupCodes.map((code, i) => (
                <div key={i} className="twofa-backup-code">
                  <span className="twofa-code-num">{i + 1}.</span>
                  <code>{code}</code>
                </div>
              ))}
            </div>
            <div className="twofa-btn-row">
              <button className="btn-outline twofa-btn-sm" onClick={downloadBackupCodes}>
                <Download size={14} /> {t('security.download')}
              </button>
              <button className="btn-outline twofa-btn-sm" onClick={copyAllBackupCodes}>
                {copiedAll ? <CheckCircle size={14} /> : <Copy size={14} />}
                {copiedAll ? t('security.copied') : t('security.copyAll')}
              </button>
              <button className="btn-primary twofa-btn" onClick={handleDone}>
                {t('security.savedBackupCodesButton')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TwoFASetup;
