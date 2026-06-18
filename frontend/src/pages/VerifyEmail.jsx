import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  Mail, CheckCircle, AlertTriangle, XCircle, ArrowRight, Loader2,
  Inbox, Send, ShieldCheck,
} from "lucide-react";
import api from "@/services/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const STYLES = {
  verifying: {
    title: "Verifying your email…",
    sub: "Please wait while we confirm your credentials.",
    icon: Loader2,
    color: "text-primary",
    bg: "bg-primary/10",
    spin: true,
  },
  success: {
    title: "Email verified successfully!",
    sub: "Your account is now active. Redirecting you to login…",
    icon: CheckCircle,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  expired: {
    title: "Verification link expired",
    sub: "Your verification link has expired. Enter your email below to request a new link.",
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  invalid: {
    title: "Invalid verification link",
    sub: "This verification link is invalid or has already been used.",
    icon: XCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
};

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying");
  const [email, setEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("invalid");
      return;
    }
    api.get(`/auth/verify-email?token=${token}`)
      .then(() => setStatus("success"))
      .catch((err) => {
        const error = err.response?.data?.error;
        if (error === "token_expired") {
          setStatus("expired");
        } else {
          setStatus("invalid");
        }
      });
  }, [searchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  const current = STYLES[status];
  const Icon = current.icon;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-chart-2 text-primary-foreground grid place-items-center shadow-lg">
            <ShieldCheck className="h-7 w-7" />
          </div>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="text-center pb-3">
            <div className={cn("h-16 w-16 rounded-full mx-auto grid place-items-center mb-3", current.bg)}>
              <Icon className={cn("h-8 w-8", current.color, current.spin && "animate-spin")} />
            </div>
            <CardTitle className="text-xl">{current.title}</CardTitle>
            <CardDescription className="text-sm">{current.sub}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {status === "expired" && (
              <>
                {resendSent ? (
                  <div className="flex items-start gap-3 p-4 rounded-lg border bg-emerald-500/5 border-emerald-500/20">
                    <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 grid place-items-center flex-shrink-0">
                      <Inbox className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Check your inbox</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        A new verification link has been sent to your email if an unverified account with that email exists.
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleResend} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="resend-email" className="text-xs">Email Address</Label>
                      <Input
                        id="resend-email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your registered email"
                        type="email"
                        required
                      />
                    </div>
                    <Button type="submit" disabled={resendLoading} className="w-full">
                      {resendLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Resending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Resend Verification Link
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </>
            )}

            {(status === "invalid" || status === "success") && (
              <Button onClick={() => navigate("/login")} className="w-full">
                <Mail className="h-4 w-4" />
                Go to Sign In
              </Button>
            )}

            {status === "verifying" && (
              <div className="space-y-2">
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-primary rounded-full animate-pulse" />
                </div>
                <p className="text-xs text-muted-foreground text-center">This will only take a moment...</p>
              </div>
            )}

            <Separator />
            <div className="text-center">
              <Link
                to="/login"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                ← Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
