import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/services/api";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [twoFAPending, setTwoFAPending] = useState(false);
  const [twoFASetup, setTwoFASetup] = useState(false);
  const [tempToken, setTempToken] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const res = await api.get("/auth/me");
          setUser(res.data);
        } catch {
          localStorage.removeItem("token");
        }
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    const data = res.data;

    if (data.requires_2fa) {
      setTempToken(data.temp_token);
      setTwoFAPending(true);
      return { step: "2fa" };
    }

    localStorage.setItem("token", data.access_token);
    setUser(data.user);

    if (data.requires_2fa_setup) {
      setTwoFASetup(true);
      return { step: "setup" };
    }

    return { step: "done" };
  };

  const loginWithGoogle = async (credential) => {
    const res = await api.post("/auth/google-login", { credential });
    const data = res.data;

    if (data.requires_2fa) {
      setTempToken(data.temp_token);
      setTwoFAPending(true);
      return { step: "2fa" };
    }

    localStorage.setItem("token", data.access_token);
    setUser(data.user);

    if (data.requires_2fa_setup) {
      setTwoFASetup(true);
      return { step: "setup" };
    }

    return { step: "done" };
  };

  const verify2FA = async (code) => {
    const res = await api.post("/2fa/verify", { temp_token: tempToken, code });
    const data = res.data;
    localStorage.setItem("token", data.access_token);
    setUser(data.user);
    setTwoFAPending(false);
    setTempToken(null);

    if (data.backup_code_used) {
      return {
        backupCodeUsed: true,
        backupCodesRemaining: data.backup_codes_remaining,
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
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const res = await api.get("/auth/me");
        setUser(res.data);
        return res.data;
      } catch {
        localStorage.removeItem("token");
        setUser(null);
      }
    }
  };

  const register = async (name, email, password) => {
    await api.post("/auth/register", { name, email, password, role: "Sales Executive" });
    await login(email, password);
  };

  const updateProfile = async (profileData) => {
    const res = await api.put("/auth/profile", profileData);
    setUser(res.data);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("token");
    setUser(null);
    setTwoFAPending(false);
    setTwoFASetup(false);
    setTempToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user, login, loginWithGoogle, register, logout, updateProfile,
        loading, twoFAPending, twoFASetup, verify2FA, cancelTwoFA,
        dismissTwoFASetup, refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
