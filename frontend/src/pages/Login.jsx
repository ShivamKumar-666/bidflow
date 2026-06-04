import React, { useState, useContext, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Shield, ArrowLeft, AlertCircle, Eye, EyeOff, Sparkles, Mail, Lock, UserPlus, LogIn, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function parseError(err, isRegistering, t) {
  const status = err?.response?.status;
  const serverMsg = err?.response?.data?.msg;
  if (status === 429) return t("errors.tooManyAttempts");
  if (status === 401 || status === 400) {
    if (!isRegistering) return t("login.loginFailed");
    return serverMsg || t("login.registerFailed");
  }
  if (!err?.response) return t("errors.cannotReachServer");
  if (status >= 500) return `Server error (${status}). Check the backend terminal for details.`;
  return serverMsg || (isRegistering ? t("login.registerFailed") : t("login.loginFailed"));
}

function PasswordStrength({ password }) {
  const checks = [
    { label: "8+ characters", pass: password.length >= 8 },
    { label: "One uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "One number", pass: /[0-9]/.test(password) },
    { label: "One special character", pass: /[^a-zA-Z0-9]/.test(password) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][passed];
  const strengthColor = ["", "bg-rose-500", "bg-amber-500", "bg-cyan-500", "bg-emerald-500"][passed];

  if (!password) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= passed ? strengthColor : "bg-muted")} />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Password strength</span>
        <span className={cn("font-semibold", passed === 4 ? "text-emerald-600" : passed >= 2 ? "text-amber-600" : "text-rose-600")}>
          {strengthLabel}
        </span>
      </div>
      <div className="space-y-1">
        {checks.map(({ label, pass }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            {pass ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className={pass ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoogleButton({ onClick, isRegistering }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="w-full"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.74 5.74 0 0 1-2.48 3.77v3.13h3.97c2.33-2.14 3.67-5.3 3.67-8.75z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.97-3.13c-1.1.74-2.5 1.18-3.99 1.18-3.07 0-5.67-2.08-6.6-4.88H1.31v3.23A12 12 0 0 0 12 24z"/>
        <path fill="#FBBC05" d="M5.4 14.26a7.14 7.14 0 0 1 0-4.52V6.51H1.31a12 12 0 0 0 0 10.98l4.09-3.23z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.92 11.92 0 0 0 12 0 12 12 0 0 0 1.31 6.51l4.09 3.23c.93-2.8 3.53-4.99 6.6-4.99z"/>
      </svg>
      {isRegistering ? "Sign up with Google" : "Sign in with Google"}
    </Button>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const { login, register, verify2FA, cancelTwoFA, twoFAPending, loginWithGoogle } = useAuth();

  const [mode, setMode] = useState("login"); // login | register | 2fa
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleInitialized, setGoogleInitialized] = useState(false);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef([]);

  const isRegistering = mode === "register";

  useEffect(() => {
    if (twoFAPending) setMode("2fa");
  }, [twoFAPending]);

  useEffect(() => {
    if (mode === "2fa" && otpRefs.current[0]) {
      otpRefs.current[0].focus();
    }
  }, [mode]);

  const allChecksPassed = !isRegistering || (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^a-zA-Z0-9]/.test(password)
  );

  const handleGoogleCredentialResponse = async (response) => {
    setError("");
    setLoading(true);
    try {
      const result = await loginWithGoogle(response.credential);
      if (result?.step === "setup") {
        toast("Please set up Two-Factor Authentication to secure your Admin account.", { icon: "🔐" });
      }
    } catch (err) {
      setError(parseError(err, false, t));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initGoogle = async () => {
      try {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (clientId && window.google) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse,
          });
          setGoogleInitialized(true);
          setTimeout(() => {
            const btnEl = document.getElementById("google-signin-btn");
            if (btnEl && window.google) {
              window.google.accounts.id.renderButton(btnEl, {
                theme: "outline",
                size: "large",
                width: 320,
                shape: "pill",
                text: isRegistering ? "signup_with" : "signin_with",
              });
            }
          }, 50);
        }
      } catch (err) {
        console.error("Failed to initialize Google Sign-In", err);
      }
    };
    const timer = setTimeout(initGoogle, 500);
    return () => clearTimeout(timer);
  }, [isRegistering, mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegistering) {
        if (!name.trim()) {
          setError("Please enter your full name.");
          return;
        }
        const result = await register(name.trim(), email.trim().toLowerCase(), password);
        toast.success(result?.msg || "Account created. Please check your email to verify your account.");
        setMode("login");
      } else {
        const result = await login(email.trim().toLowerCase(), password);
        if (result?.step === "setup") {
          toast("Please set up Two-Factor Authentication to secure your Admin account.", { icon: "🔐" });
        }
      }
    } catch (err) {
      setError(parseError(err, isRegistering, t));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (idx, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[idx] = digit;
    setOtpDigits(newDigits);
    setError("");
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (digit && idx === 5) {
      const full = newDigits.join("");
      if (full.length === 6) handleVerify2FA(full);
    }
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !otpDigits[idx] && idx > 0) {
      const newDigits = [...otpDigits];
      newDigits[idx - 1] = "";
      setOtpDigits(newDigits);
      otpRefs.current[idx - 1]?.focus();
    } else if (e.key === "Enter") {
      const code = otpDigits.join("");
      if (code.length === 6) handleVerify2FA(code);
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtpDigits(pasted.split(""));
      otpRefs.current[5]?.focus();
      handleVerify2FA(pasted);
    }
  };

  const handleVerify2FA = async (code) => {
    setError("");
    setLoading(true);
    try {
      const result = await verify2FA(code);
      if (result.backupCodeUsed) {
        toast.success(`✅ Backup code used. ${result.backupCodesRemaining} remaining.`);
      }
    } catch (err) {
      setError(err?.response?.data?.msg || "Invalid code. Please try again.");
      setOtpDigits(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // 2FA view
  if (mode === "2fa") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-chart-2 flex items-center justify-center text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">BidFlow</span>
          </div>
          <div className="rounded-2xl border bg-card p-8 shadow-lg">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Shield className="h-7 w-7 text-primary" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">{t("security.twoFactorAuth")}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t("security.otpPrompt")}</p>
            </div>

            <div className="flex justify-center gap-2 mb-4">
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  onPaste={i === 0 ? handleOtpPaste : undefined}
                  aria-label={`Digit ${i + 1}`}
                  className={cn(
                    "h-12 w-12 text-center text-lg font-bold rounded-lg border-2 border-input bg-background transition-colors",
                    "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                    digit && "border-primary"
                  )}
                />
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs mb-3">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              onClick={() => handleVerify2FA(otpDigits.join(""))}
              disabled={loading || otpDigits.join("").length !== 6}
              className="w-full"
              size="lg"
            >
              {loading ? t("security.verifying") : t("security.verifySignIn")}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => { cancelTwoFA(); setOtpDigits(["", "", "", "", "", ""]); setMode("login"); }}
              className="w-full mt-2"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("security.differentAccount")}
            </Button>

            <p className="text-xs text-muted-foreground text-center mt-4">
              {t("security.lostAccessHint")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-sidebar-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-chart-2/10 blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-chart-2 flex items-center justify-center text-white shadow-lg">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">BidFlow</span>
        </div>

        <div className="rounded-2xl border bg-card p-8 shadow-xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">{t("login.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isRegistering ? t("login.subtitleRegister") : t("login.subtitleLogin")}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />
                  {t("login.nameLabel")}
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isRegistering}
                  autoComplete="name"
                  placeholder="Jane Cooper"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {t("login.emailLabel")}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                {t("login.passwordLabel")}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isRegistering ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("security.hidePassword") : t("security.showPassword")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {isRegistering && <PasswordStrength password={password} />}
            </div>

            <Button
              type="submit"
              disabled={loading || !allChecksPassed}
              className="w-full"
              size="lg"
            >
              {loading ? (
                isRegistering ? "Creating account…" : "Signing in…"
              ) : isRegistering ? (
                <><UserPlus className="h-4 w-4" /> {t("login.registerBtn")}</>
              ) : (
                <><LogIn className="h-4 w-4" /> {t("login.signInBtn")}</>
              )}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {googleInitialized ? (
            <div id="google-signin-btn" className="flex justify-center" />
          ) : (
            <GoogleButton
              isRegistering={isRegistering}
              onClick={() => toast.error("Google Client ID is not configured on the server. Set GOOGLE_CLIENT_ID env var.")}
            />
          )}

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isRegistering ? t("login.alreadyHaveAccount") : t("login.dontHaveAccount")}
            <button
              type="button"
              onClick={() => { setMode(isRegistering ? "login" : "register"); setError(""); }}
              className="ml-1 text-primary font-semibold hover:underline"
            >
              {isRegistering ? t("login.signInHere") : t("login.registerHere")}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing you agree to BidFlow's Terms of Service
        </p>
      </div>
    </div>
  );
}
