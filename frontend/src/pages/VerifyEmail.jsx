import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Mail, CheckCircle, AlertTriangle, XCircle, ArrowRight, Loader } from 'lucide-react';
import api from "../services/api";
import toast from "react-hot-toast";
import './Login.css'; // Inherit premium glassmorphism layouts

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying"); // verifying | success | expired | invalid
  const [email, setEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("invalid");
      return;
    }

    api.get(`/auth/verify-email?token=${token}`)
      .then(() => {
        setStatus("success");
      })
      .catch(err => {
        const error = err.response?.data?.error;
        if (error === "token_expired") {
          setStatus("expired");
        } else {
          setStatus("invalid");
        }
      });
  }, [searchParams]);

  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => navigate("/login"), 3000);
      return () => clearTimeout(timer);
    }
  }, [status, navigate]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email address.");
      return;
    }
    setResendLoading(true);
    try {
      await api.post("/auth/resend-verification", { email: email.trim().toLowerCase() });
      setResendSent(true);
      toast.success("Verification link resent! Check your inbox.");
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to resend link. Please try again later.");
    } finally {
      setResendLoading(false);
    }
  };

  const MESSAGES = {
    verifying: {
      title: "Verifying your email…",
      sub: "Please wait while we confirm your credentials.",
      icon: <Loader className="animate-spin" size={48} style={{ color: "var(--accent-primary)" }} />
    },
    success: {
      title: "Email verified successfully!",
      sub: "Your account is now active. Redirecting you to login…",
      icon: <CheckCircle size={48} style={{ color: "#10b981" }} />
    },
    expired: {
      title: "Verification link expired",
      sub: "Your verification link has expired. Enter your email below to request a new link.",
      icon: <AlertTriangle size={48} style={{ color: "#f59e0b" }} />
    },
    invalid: {
      title: "Invalid verification link",
      sub: "This verification link is invalid or has already been used.",
      icon: <XCircle size={48} style={{ color: "#ef4444" }} />
    },
  };

  const current = MESSAGES[status];

  return (
    <div className="login-container">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}} />
      <div className="login-card glass-panel" style={{ padding: "3rem 2.5rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
        
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>
          {current.icon}
        </div>

        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 12, textAlign: "center" }}>
          {current.title}
        </h1>
        
        <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", marginBottom: 28, textAlign: "center", lineHeight: "1.5" }}>
          {current.sub}
        </p>

        {status === "expired" && (
          <div style={{ width: "100%" }}>
            {resendSent ? (
              <div className="glass-panel" style={{ padding: "12px", borderLeft: "4px solid #10b981", background: "rgba(16, 185, 129, 0.05)", borderRadius: "8px" }}>
                <p style={{ fontSize: "0.85rem", color: "#10b981", margin: 0, fontWeight: 500, textAlign: "center" }}>
                  📧 A new verification link has been sent to your inbox if an unverified account with that email exists.
                </p>
              </div>
            ) : (
              <form onSubmit={handleResend} style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
                <div className="input-group" style={{ textAlign: "left" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>Email Address</label>
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter your registered email"
                    type="email"
                    required
                    className="input-field"
                    style={{ width: "100%" }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={resendLoading}
                  className="btn-primary"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  {resendLoading ? (
                    <>
                      <Loader className="animate-spin" size={16} /> Resending...
                    </>
                  ) : (
                    <>
                      Resend Verification Link <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {(status === "invalid" || status === "success") && (
          <button
            onClick={() => navigate("/login")}
            className="btn-primary"
            style={{ width: "100%" }}
          >
            Go to Sign In
          </button>
        )}
      </div>
    </div>
  );
}
