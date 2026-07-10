import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "@/services/api";
import { useTranslation } from "react-i18next";
import { ArrowLeft, AlertCircle, Sparkles, Mail, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const location = useLocation();
  const passedEmail = location.state?.email || "";
  const [email, setEmail] = useState(passedEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");


  useEffect(() => {
    if (!passedEmail || sent) return;
    let mounted = true;
    setLoading(true);
    api.post("/auth/forgot-password", { email: passedEmail.trim().toLowerCase() })
      .then(() => { if (mounted) setSent(true); })
      .catch((err) => {
        if (!mounted) return;
        const msg = err?.response?.data?.msg;
        if (err?.response?.status === 429) {
          setError(t("errors.tooManyAttempts"));
        } else {
          setError(msg || t("forgotPassword.failed", "Something went wrong. Please try again."));
        }
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  // passedEmail is stable (derived from location.state which doesn't change after mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      const msg = err?.response?.data?.msg;
      if (err?.response?.status === 429) {
        setError(t("errors.tooManyAttempts"));
      } else {
        setError(msg || t("forgotPassword.failed", "Something went wrong. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -end-32 h-96 w-96 rounded-full bg-sidebar-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -start-32 h-96 w-96 rounded-full bg-chart-2/10 blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-chart-2 flex items-center justify-center text-white shadow-lg">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">BidFlow</span>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-xl">
          <div className="mb-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {t("forgotPassword.title", "Forgot Password")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("forgotPassword.subtitle", "Enter your email and we'll send you a reset link")}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {sent ? (
            <div className="text-center py-4 space-y-4">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("forgotPassword.sent", "If that email exists, a password reset link has been sent. Check your inbox.")}
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="h-4 w-4 me-1" />
                  {t("forgotPassword.backToLogin", "Back to Login")}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  autoFocus
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </div>

              <Button type="submit" disabled={loading || !email} className="w-full" size="lg">
                {loading
                  ? t("forgotPassword.sending", "Sending...")
                  : t("forgotPassword.sendLink", "Send Reset Link")}
              </Button>

              <Link to="/login">
                <Button type="button" variant="ghost" className="w-full" size="sm">
                  <ArrowLeft className="h-4 w-4 me-1" />
                  {t("forgotPassword.backToLogin", "Back to Login")}
                </Button>
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
