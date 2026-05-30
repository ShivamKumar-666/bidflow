import React, { useState, useContext, useRef, useEffect } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Shield, ArrowLeft, WifiOff, AlertCircle, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import './Login.css';

/**
 * Translate an Axios error into a user-facing message.
 *
 * Priority:
 *  1. Server returned a JSON { msg } we can display
 *  2. 429 → rate limit message
 *  3. No response (backend down / reloading) → friendly message
 *  4. Fallback generic message
 */
function parseError(err, isRegistering, t) {
  const status   = err?.response?.status;
  const serverMsg = err?.response?.data?.msg;

  if (status === 429) {
    return t('errors.tooManyAttempts');
  }
  if (status === 401 || status === 400) {
    if (!isRegistering) {
      return t('login.loginFailed');
    }
    return serverMsg || t('login.registerFailed');
  }
  if (!err?.response) {
    // Network error — backend may be starting up after a code change
    return t('errors.cannotReachServer');
  }
  if (status >= 500) {
    return `Server error (${status}). Check the backend terminal for details.`;
  }
  return serverMsg || (isRegistering ? t('login.registerFailed') : t('login.loginFailed'));
}

const Login = () => {
  const { t } = useTranslation();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,        setError]       = useState('');
  const [loading,      setLoading]     = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleInitialized, setGoogleInitialized] = useState(false);

  // 2FA state
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  const { login, register, verify2FA, cancelTwoFA, twoFAPending, loginWithGoogle } = useContext(AuthContext);

  const allChecksPassed = !isRegistering || (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^a-zA-Z0-9]/.test(password)
  );

  const handleGoogleCredentialResponse = async (response) => {
    setError('');
    setLoading(true);
    try {
      const result = await loginWithGoogle(response.credential);
      if (result?.step === 'setup') {
        toast('Please set up Two-Factor Authentication to secure your Admin account.',
              { icon: '🔐', duration: 5000 });
      } else if (result?.step === 'done') {
        toast.success("Signed in successfully!");
      }
    } catch (err) {
      setError(parseError(err, false, t));
    } finally {
      setLoading(false);
    }
  };

  // Focus first OTP box when 2FA step appears
  useEffect(() => {
    if (twoFAPending && otpRefs[0].current) {
      otpRefs[0].current.focus();
    }
  }, [twoFAPending]);  // eslint-disable-line

  // Initialize Google Sign-In SDK button
  useEffect(() => {
    const initGoogle = async () => {
      try {
        const res = await api.get('/auth/google-client-id');
        const clientId = res.data.client_id;
        
        if (clientId && window.google) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse
          });
          
          setGoogleInitialized(true);
          
          // Wait a tick for the React render cycle to output the container element
          setTimeout(() => {
            const btnEl = document.getElementById("google-signin-btn");
            if (btnEl && window.google) {
              window.google.accounts.id.renderButton(
                btnEl,
                { 
                  theme: document.documentElement.getAttribute('data-theme') === 'dark' ? "filled_black" : "outline",
                  size: "large",
                  width: 320,
                  shape: "pill"
                }
              );
            }
          }, 50);
        } else {
          setGoogleInitialized(false);
        }
      } catch (err) {
        console.error("Failed to load Google Client ID", err);
        setGoogleInitialized(false);
      }
    };
    
    // Give it a tiny delay to ensure the Google GSI script is loaded
    const timer = setTimeout(initGoogle, 500);
    return () => clearTimeout(timer);
  }, [isRegistering, twoFAPending]); // Reinitialize on switch or 2FA cancel

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        // ── Registration flow ─────────────────────────────────────────────
        if (!name.trim()) {
          setError('Please enter your full name.');
          return;
        }
        await register(name.trim(), email.trim().toLowerCase(), password);
        // register() auto-logs-in on success — user lands on dashboard
      } else {
        // ── Login flow ────────────────────────────────────────────────────
        const result = await login(email.trim().toLowerCase(), password);
        if (result?.step === 'setup') {
          // 2FA setup modal appears via App.jsx — nothing to do here
          toast('Please set up Two-Factor Authentication to secure your Admin account.',
                { icon: '🔐', duration: 5000 });
        }
      }
    } catch (err) {
      setError(parseError(err, isRegistering, t));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (idx, val) => {
    const digit     = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[idx]  = digit;
    setOtpDigits(newDigits);
    setError('');

    if (digit && idx < 5) {
      otpRefs[idx + 1].current?.focus();
    }
    // Auto-submit when all 6 digits filled
    if (digit && idx === 5) {
      const full = [...newDigits.slice(0, 5), digit].join('');
      if (full.length === 6) handleVerify2FA(full);
    }
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[idx] && idx > 0) {
        const newDigits     = [...otpDigits];
        newDigits[idx - 1]  = '';
        setOtpDigits(newDigits);
        otpRefs[idx - 1].current?.focus();
      }
    }
    if (e.key === 'Enter') {
      const code = otpDigits.join('');
      if (code.length === 6) handleVerify2FA(code);
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtpDigits(pasted.split(''));
      otpRefs[5].current?.focus();
      handleVerify2FA(pasted);
    }
  };

  const handleVerify2FA = async (code) => {
    setError('');
    setLoading(true);
    try {
      const result = await verify2FA(code);
      if (result.backupCodeUsed) {
        toast.success(`✅ Backup code used. ${result.backupCodesRemaining} remaining.`,
                      { duration: 5000 });
      }
    } catch (err) {
      setError(err?.response?.data?.msg || 'Invalid code. Please try again.');
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Decide which icon to show in the error banner
  const ErrorBanner = ({ msg }) => {
    if (!msg) return null;
    const isNetworkError = msg.includes('server') || msg.includes('backend') || msg.includes('reach');
    return (
      <div className="error-message" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isNetworkError
          ? <WifiOff size={16} style={{ flexShrink: 0 }} />
          : <AlertCircle size={16} style={{ flexShrink: 0 }} />}
        <span>{msg}</span>
      </div>
    );
  };

  // ===== 2FA VERIFICATION STEP =====
  if (twoFAPending) {
    return (
      <div className="login-container">
        <div className="login-card glass-panel">
          <div className="login-header">
            <div className="twofa-login-icon">
              <Shield size={32} />
            </div>
            <h1 className="twofa-login-title">{t('security.twoFactorAuth')}</h1>
            <p>{t('security.otpPrompt')}</p>
          </div>

          <div className="otp-boxes">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={otpRefs[i]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onPaste={i === 0 ? handleOtpPaste : undefined}
                className={`otp-box ${digit ? 'filled' : ''}`}
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>

          <ErrorBanner msg={error} />

          <button
            className="btn-primary"
            style={{ marginTop: '20px' }}
            onClick={() => handleVerify2FA(otpDigits.join(''))}
            disabled={loading || otpDigits.join('').length !== 6}
          >
            {loading ? t('security.verifying') : t('security.verifySignIn')}
          </button>

          <button
            type="button"
            onClick={() => { cancelTwoFA(); setOtpDigits(['', '', '', '', '', '']); }}
            className="twofa-back-btn"
          >
            <ArrowLeft size={14} /> {t('security.differentAccount')}
          </button>

          <p className="twofa-hint">
            {t('security.lostAccessHint')}
          </p>
        </div>
      </div>
    );
  }

  // ===== NORMAL LOGIN / REGISTER =====
  return (
    <div className="login-container">
      <div className="login-card glass-panel">
        <div className="login-header">
          <h1>{t('login.title')}</h1>
          <p>{isRegistering ? t('login.subtitleRegister') : t('login.subtitleLogin')}</p>
        </div>

        <ErrorBanner msg={error} />

        <form onSubmit={handleSubmit} className="login-form">
          {isRegistering && (
            <div className="input-group">
              <label>{t('login.nameLabel')}</label>
              <input
                type="text"
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={isRegistering}
                autoComplete="name"
              />
            </div>
          )}

          <div className="input-group">
            <label>{t('login.emailLabel')}</label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="input-group">
            <label>{t('login.passwordLabel')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? t('security.hidePassword') : t('security.showPassword')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  borderRadius: '4px',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {isRegistering && <PasswordStrength password={password} />}
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ 
              marginTop: '16px',
              opacity: allChecksPassed ? 1 : 0.5,
              cursor: allChecksPassed ? 'pointer' : 'not-allowed'
            }}
            disabled={loading || !allChecksPassed}
          >
            {loading
              ? (isRegistering ? 'Creating Account…' : 'Signing In…')
              : (isRegistering ? t('login.registerBtn') : t('login.signInBtn'))
            }
          </button>
        </form>

        <div className="oauth-divider">
          <span>{t('login.oauthDivider', 'or')}</span>
        </div>

        <div className="google-btn-wrapper">
          {!googleInitialized ? (
            <button 
              type="button" 
              className="mock-google-btn"
              onClick={() => toast.error("Google Client ID is not configured on the server. Please set the GOOGLE_CLIENT_ID environment variable.")}
            >
              <svg className="google-icon-svg" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.74 5.74 0 0 1-2.48 3.77v3.13h3.97c2.33-2.14 3.67-5.3 3.67-8.75z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.97-3.13c-1.1.74-2.5 1.18-3.99 1.18-3.07 0-5.67-2.08-6.6-4.88H1.31v3.23A12 12 0 0 0 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.4 14.26a7.14 7.14 0 0 1 0-4.52V6.51H1.31a12 12 0 0 0 0 10.98l4.09-3.23z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.92 11.92 0 0 0 12 0 12 12 0 0 0 1.31 6.51l4.09 3.23c.93-2.8 3.53-4.99 6.6-4.99z"
                />
              </svg>
              <span>{isRegistering ? "Sign up with Google" : "Sign in with Google"}</span>
            </button>
          ) : (
            <div id="google-signin-btn"></div>
          )}
        </div>

        <div style={{ marginTop: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {isRegistering ? t('login.alreadyHaveAccount') : t('login.dontHaveAccount')}
          <button
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isRegistering ? t('login.signInHere') : t('login.registerHere')}
          </button>
        </div>
      </div>
    </div>
  );
};

function PasswordStrength({ password }) {
  const checks = [
    { label: "8+ characters",          pass: password.length >= 8 },
    { label: "One uppercase letter",   pass: /[A-Z]/.test(password) },
    { label: "One number",             pass: /[0-9]/.test(password) },
    { label: "One special character",  pass: /[^a-zA-Z0-9]/.test(password) },
  ];

  const passed = checks.filter(c => c.pass).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][passed];
  const strengthColor = ["", "#ef4444", "#f59e0b", "#06b6d4", "#10b981"][passed];

  if (!password) return null;

  return (
    <div style={{ marginTop: 12 }}>
      {/* Strength bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= passed ? strengthColor : "var(--border-color)",
            transition: "background .3s ease"
          }} />
        ))}
      </div>

      {/* Label */}
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: '0.8rem', color: "var(--text-secondary)" }}>Password strength</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: strengthColor }}>
          {strengthLabel}
        </span>
      </div>

      {/* Individual checks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {checks.map(({ label, pass }) => (
          <div key={label} style={{ display: "flex", alignItems: "center",
                                    gap: 8, fontSize: '0.8rem' }}>
            <span style={{ color: pass ? "var(--success)" : "var(--text-secondary)", fontSize: 14 }}>
              {pass ? "✓" : "○"}
            </span>
            <span style={{ color: pass ? "var(--text-primary)" : "var(--text-secondary)", transition: "color 0.2s" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Login;
