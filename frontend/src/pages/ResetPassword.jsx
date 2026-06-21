import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/services/api";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft, AlertCircle, Sparkles, Lock, Eye, EyeOff, CheckCircle, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function PasswordStrength({ password, t }) {
  const checks = [
    { label: t("login.checkLength", "8+ chars"), pass: password.length >= 8 },
    { label: t("login.checkUppercase", "Uppercase"), pass: /[A-Z]/.test(password) },
    { label: t("login.checkNumber", "Number"), pass: /[0-9]/.test(password) },
    { label: t("login.checkSpecial", "Special"), pass: /[^a-zA-Z0-9]/.test(password) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const strengthLabels = ["", t("login.weak", "Weak"), t("login.fair", "Fair"), t("login.good", "Good"), t("login.strong", "Strong")];
  const strengthLabel = strengthLabels[passed];
  const strengthColor = ["", "bg-rose-500", "bg-amber-500", "bg-cyan-500", "bg-emerald-500"][passed];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= passed ? strengthColor : "bg-muted")} />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{t("login.passwordStrength", "Strength")}</span>
        <span className={cn("font-semibold", passed === 4 ? "text-emerald-600" : passed >= 2 ? "text-amber-600" : "text-rose-600")}>
          {strengthLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {checks.map(({ label, pass }) => (
          <div key={label} className="flex items-center gap-1.5 text-[11px]">
            {pass ? (
              <Check className="h-3 w-3 text-emerald-600 flex-shrink-0" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
            <span className={pass ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-chart-2 flex items-center justify-center text-white shadow-lg">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">BidFlow</span>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-xl text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold">{t("resetPassword.invalidLink", "Invalid Reset Link")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("resetPassword.invalidLinkDesc", "This password reset link is invalid or missing. Please request a new one.")}
            </p>
            <Link to="/forgot-password">
              <Button className="w-full">{t("forgotPassword.sendLink", "Send Reset Link")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError(t("resetPassword.mismatch", "Passwords do not match"));
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: newPassword });
      setSuccess(true);
      toast.success(t("resetPassword.successToast", "Password reset successfully!"));
    } catch (err) {
      const msg = err?.response?.data?.msg;
      if (err?.response?.status === 429) {
        setError(t("errors.tooManyAttempts"));
      } else {
        setError(msg || t("resetPassword.failed", "Failed to reset password. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  const allChecksPassed = newPassword.length >= 8 && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^a-zA-Z0-9]/.test(newPassword);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
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

        <div className="rounded-2xl border bg-card p-5 shadow-xl">
          <div className="mb-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {t("resetPassword.title", "Set New Password")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("resetPassword.subtitle", "Choose a strong password for your account")}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="text-center py-4 space-y-4">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("resetPassword.successDesc", "Your password has been reset. You can now log in with your new password.")}
              </p>
              <Link to="/login">
                <Button className="w-full">
                  {t("login.signInBtn", "Sign In")}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {t("resetPassword.newPassword", "New Password")}
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrength password={newPassword} t={t} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {t("resetPassword.confirmPassword", "Confirm Password")}
                </Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-[11px] text-rose-600">
                    {t("resetPassword.mismatch", "Passwords do not match")}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || !allChecksPassed || newPassword !== confirmPassword}
                className="w-full"
                size="lg"
              >
                {loading
                  ? t("resetPassword.resetting", "Resetting...")
                  : t("resetPassword.resetBtn", "Reset Password")}
              </Button>

              <Link to="/login">
                <Button type="button" variant="ghost" className="w-full" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-1" />
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
