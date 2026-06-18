import { useState, useEffect, useContext, useRef, useCallback, Fragment } from "react";
import { AuthContext } from "@/contexts/AuthContext";
import api from "@/services/api";
import { toast } from "sonner";
import {
  Shield, Copy, Download, CheckCircle, AlertTriangle, RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STEPS = ["scanQr", "verify", "backupCodes"];

const TwoFASetup = ({ onClose }) => {
  const { t, i18n } = useTranslation();
  const { dismissTwoFASetup, refreshUser } = useContext(AuthContext);
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState("loading");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const copiedTimerRef = useRef(null);

  useEffect(() => {
    return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current); };
  }, []);

  const fetchSetup = useCallback(async () => {
    setStep("loading");
    setError("");
    try {
      const res = await api.get("/2fa/setup");
      setQrCode(res.data.qr_code);
      setSecret(res.data.secret);
      setStep("qr");
    } catch {
      setError(t("security.failedGenerate", "Failed to generate 2FA setup. Please try again."));
      setStep("error");
    }
  }, [t]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchSetup();
  }, [fetchSetup]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) {
      setTimeout(() => {
        dismissTwoFASetup();
        if (onClose) onClose();
      }, 200);
    }
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setError("Please enter the full 6-digit code.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await api.post("/2fa/enable", { code: verifyCode });
      setBackupCodes(res.data.backup_codes);
      setStep("backup");
      toast.success("2FA enabled successfully!");
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      setError(err.response?.data?.msg || "Invalid code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeInput = (e) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setVerifyCode(val);
    setError("");
  };

  const copyAllBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedAll(true);
    toast.success("Backup codes copied!");
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadBackupCodes = () => {
    const content = `BidFlow 2FA Backup Codes\nGenerated: ${new Date().toLocaleString(i18n.language)}\n\nStore these codes somewhere safe. Each can only be used once.\n\n${backupCodes.join("\n")}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bidflow-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDone = () => {
    handleOpenChange(false);
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    toast.success("Secret key copied!");
  };

  const stepIndex = (() => {
    if (step === "loading" || step === "error" || step === "qr") return 0;
    if (step === "verify") return 1;
    if (step === "backup") return 2;
    return 0;
  })();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-chart-2 text-primary-foreground grid place-items-center shadow-md">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl">{t("security.twoFactorAuth")}</DialogTitle>
              <DialogDescription>{t("security.setupInstructions")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 py-2">
          {STEPS.map((label, i) => {
            const active = i === stepIndex;
            const done = i < stepIndex;
            return (
              <Fragment key={label}>
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full grid place-items-center text-xs font-semibold border-2 transition-colors",
                      done && "bg-emerald-500 border-emerald-500 text-white",
                      active && !done && "bg-primary border-primary text-primary-foreground",
                      !active && !done && "border-border text-muted-foreground"
                    )}
                  >
                    {done ? <CheckCircle className="h-4 w-4" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium text-center",
                      (active || done) ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {t(`security.${label}`)}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 -mt-4 transition-colors",
                      done ? "bg-emerald-500" : "bg-border"
                    )}
                  />
                )}
              </Fragment>
            );
          })}
        </div>

        {step === "loading" && (
          <div className="py-10 flex flex-col items-center gap-3">
            <RefreshCw className="h-10 w-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{t("security.generatingQr")}</p>
          </div>
        )}

        {step === "error" && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="h-14 w-14 rounded-full bg-destructive/10 text-destructive grid place-items-center">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
            <Button onClick={fetchSetup}>
              <RefreshCw className="h-4 w-4" />
              {t("security.tryAgain")}
            </Button>
          </div>
        )}

        {step === "qr" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold flex-shrink-0">1</div>
              <p className="text-sm text-foreground">{t("security.authenticatorAppInstructions")}</p>
            </div>
            <div className="flex justify-center p-5 rounded-xl border bg-background">
              <img src={qrCode} alt="2FA QR Code" className="h-48 w-48" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("security.manualKey")}</Label>
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30 font-mono text-sm">
                <code className="flex-1 break-all tracking-wider">
                  {secret?.match(/.{1,4}/g)?.join(" ")}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={copySecret}
                  aria-label={t("security.copySecret")}
                  className="h-7 w-7"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Button onClick={() => setStep("verify")} className="w-full">
              {t("security.scannedQr")}
            </Button>
          </div>
        )}

        {step === "verify" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold flex-shrink-0">2</div>
              <p className="text-sm text-foreground">{t("security.confirmSetupInstructions")}</p>
            </div>
            <div>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={handleCodeInput}
                placeholder="000000"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                aria-label="Enter 6-digit verification code"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => { setStep("qr"); setVerifyCode(""); setError(""); }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleVerify}
                disabled={submitting || verifyCode.length !== 6}
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t("security.verifying")}
                  </>
                ) : t("security.enable2faConfirm")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "backup" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10">
              <div className="h-7 w-7 rounded-full bg-emerald-500 text-white grid place-items-center flex-shrink-0">
                <CheckCircle className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium">{t("security.activeSuccess")}</p>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              {t("security.backupCodesWarning")}
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
              {backupCodes.map((code, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-md border bg-muted/30 font-mono text-xs"
                >
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <code className="flex-1">{code}</code>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
              <Button variant="outline" size="sm" onClick={downloadBackupCodes}>
                <Download className="h-3.5 w-3.5" />
                {t("security.download")}
              </Button>
              <Button variant="outline" size="sm" onClick={copyAllBackupCodes}>
                {copiedAll ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedAll ? t("security.copied") : t("security.copyAll")}
              </Button>
              <Button onClick={handleDone}>
                {t("security.savedBackupCodesButton")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TwoFASetup;
