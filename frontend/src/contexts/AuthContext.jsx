import React, { createContext, useState, useEffect } from 'react';
import api from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // 2FA flow state
  const [twoFAPending, setTwoFAPending] = useState(false);   // show 6-digit input
  const [twoFASetup, setTwoFASetup] = useState(false);       // show setup QR modal
  const [tempToken, setTempToken] = useState(null);           // short-lived 2FA token

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data);
        } catch (err) {
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const data = res.data;

    if (data.requires_2fa) {
      // Admin with 2FA enabled — need TOTP code
      setTempToken(data.temp_token);
      setTwoFAPending(true);
      return { step: '2fa' };
    }

    // Store full token
    localStorage.setItem('token', data.access_token);
    setUser(data.user);

    if (data.requires_2fa_setup) {
      // Admin who hasn't set up 2FA yet
      setTwoFASetup(true);
      return { step: 'setup' };
    }

    return { step: 'done' };
  };

  const loginWithGoogle = async (credential) => {
    const res = await api.post('/auth/google-login', { credential });
    const data = res.data;

    if (data.requires_2fa) {
      setTempToken(data.temp_token);
      setTwoFAPending(true);
      return { step: '2fa' };
    }

    localStorage.setItem('token', data.access_token);
    setUser(data.user);

    if (data.requires_2fa_setup) {
      setTwoFASetup(true);
      return { step: 'setup' };
    }

    return { step: 'done' };
  };

  const verify2FA = async (code) => {

    const res = await api.post('/2fa/verify', { temp_token: tempToken, code });
    const data = res.data;
    localStorage.setItem('token', data.access_token);
    setUser(data.user);
    setTwoFAPending(false);
    setTempToken(null);

    if (data.backup_code_used) {
      return {
        backupCodeUsed: true,
        backupCodesRemaining: data.backup_codes_remaining
      };
    }
    return { backupCodeUsed: false };
  };

  const cancelTwoFA = () => {
    setTwoFAPending(false);
    setTempToken(null);
  };

  const dismissTwoFASetup = () => {
    setTwoFASetup(false);
  };

  const refreshUser = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
        return res.data;
      } catch (err) {
        localStorage.removeItem('token');
        setUser(null);
      }
    }
  };

  const register = async (name, email, password) => {
    await api.post('/auth/register', { name, email, password, role: 'Sales Executive' });
    await login(email, password);
  };

  const updateProfile = async (profileData) => {
    const res = await api.put('/auth/profile', profileData);
    setUser(res.data);
  };

  const logout = async () => {
    // Revoke the token server-side (adds JTI to blocklist)
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Always clear local state even if the server call fails
    }
    localStorage.removeItem('token');
    setUser(null);
    setTwoFAPending(false);
    setTwoFASetup(false);
    setTempToken(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      loginWithGoogle,
      register,
      logout,
      updateProfile,
      loading,
      twoFAPending,
      twoFASetup,
      verify2FA,
      cancelTwoFA,
      dismissTwoFASetup,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};
