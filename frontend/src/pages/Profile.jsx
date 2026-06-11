import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  User, Mail, Shield, Building, Percent, DollarSign, Globe, Sun, Moon,
  Lock, Key, Copy, Download, RefreshCw, CheckCircle, Eye, EyeOff, Save,
} from "lucide-react";
import api from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TwoFASetup from "./TwoFASetup";
import { LANGUAGES } from "@/lib/utils";

const industries = ["Technology", "Healthcare", "Construction", "Energy", "Finance", "Banking", "Manufacturing", "Retail", "Other"];

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [showRegenForm, setShowRegenForm] = useState(false);
  const [disablingPassword, setDisablingPassword] = useState("");
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [disabling2FA, setDisabling2FA] = useState(false);
  const [backupCodesCount, setBackupCodesCount] = useState(null);
  const [regenOTP, setRegenOTP] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState([]);
  const [copiedAll, setCopiedAll] = useState(false);
  const copiedTimerRef = useRef(null);

  useEffect(() => {
    return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current); };
  }, []);

  const [form, setForm] = useState({
    name: "", industry: "Other", winRate: 50, targetBidValue: 10000, bio: "",
  });

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        industry: user.industry || "Other",
        winRate: user.winRate ?? 50,
        targetBidValue: user.targetBidValue ?? 10000,
        bio: user.bio || "",
      });
    }
  }, [user]);

  useEffect(() => {
    if (user?.totp_enabled) {
      api.get("/2fa/backup-codes").then((r) => setBackupCodesCount(r.data.backup_codes_remaining)).catch(() => {});
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile(form);
      toast.success(t("profile.successMessage"));
    } catch (err) {
      toast.error(err.response?.data?.msg || t("profile.failedMessage"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenOTP.length !== 6) {
      toast.error("Please enter a 6-digit TOTP code.");
      return;
    }
    setRegenerating(true);
    try {
      const res = await api.post("/2fa/regenerate-backup-codes", { code: regenOTP });
      setNewBackupCodes(res.data.backup_codes);
      toast.success("Backup codes regenerated");
      setShowRegenForm(false);
      setRegenOTP("");
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to regenerate codes");
    } finally {
      setRegenerating(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disablingPassword) {
      toast.error("Enter your password");
      return;
    }
    setDisabling2FA(true);
    try {
      await api.post("/2fa/disable", { password: disablingPassword });
      toast.success("2FA disabled");
      setShowDisableForm(false);
      setDisablingPassword("");
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to disable 2FA");
    } finally {
      setDisabling2FA(false);
    }
  };

  const copyCodes = () => {
    navigator.clipboard.writeText(newBackupCodes.join("\n"));
    setCopiedAll(true);
    toast.success("Copied");
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadCodes = () => {
    const content = `BidFlow 2FA Backup Codes\nGenerated: ${new Date().toLocaleString()}\n\n${newBackupCodes.join("\n")}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bidflow-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  const initials = (user?.name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("profile.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account settings and preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-20 w-20 mb-3">
                  <AvatarFallback className="text-2xl bg-gradient-to-br from-sidebar-primary to-chart-2 text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <h2 className="text-xl font-bold">{user?.name}</h2>
                <Badge variant={user?.role === "Admin" ? "default" : "secondary"} className="mt-2 gap-1">
                  <Shield className="h-3 w-3" />
                  {user?.role}
                </Badge>
              </div>

              <Separator className="my-5" />

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Email</div>
                    <div className="text-sm truncate">{user?.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Building className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Industry</div>
                    <div className="text-sm">{user?.industry || "Other"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Percent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Win Rate Goal</div>
                    <div className="text-sm">{user?.winRate ?? 50}%</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Target Bid Value</div>
                    <div className="text-sm">${(user?.targetBidValue ?? 10000).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profile.settingsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Globe className="h-3 w-3" />
                  Language
                </Label>
                <Tabs value={i18n.language?.slice(0, 2)} onValueChange={(v) => i18n.changeLanguage(v)}>
                  <TabsList className="grid grid-cols-4 w-full h-8">
                    {LANGUAGES.slice(0, 4).map((l) => (
                      <TabsTrigger key={l.code} value={l.code} className="text-xs">
                        {l.code.toUpperCase()}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <p className="text-[10px] text-muted-foreground">Selected: {LANGUAGES.find((l) => l.code === i18n.language?.slice(0, 2))?.name}</p>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  {theme === "dark" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                  Theme
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={theme === "light" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("light")}
                    className="w-full"
                  >
                    <Sun className="h-3.5 w-3.5" />
                    Light
                  </Button>
                  <Button
                    type="button"
                    variant={theme === "dark" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("dark")}
                    className="w-full"
                  >
                    <Moon className="h-3.5 w-3.5" />
                    Dark
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("profile.detailsTitle")}</CardTitle>
              <CardDescription>{t("profile.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("profile.name")}</Label>
                    <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("profile.industry")}</Label>
                    <select
                      value={form.industry}
                      onChange={(e) => setForm({ ...form, industry: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {industries.map((ind) => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("profile.winRate")}</Label>
                    <Input type="number" min="0" max="100" value={form.winRate} onChange={(e) => setForm({ ...form, winRate: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("profile.targetBidValue")}</Label>
                    <Input type="number" min="0" value={form.targetBidValue} onChange={(e) => setForm({ ...form, targetBidValue: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("profile.bio")}</Label>
                  <Textarea
                    rows={4}
                    placeholder={t("profile.bioPlaceholder")}
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={loading}>
                    <Save className="h-4 w-4" />
                    {loading ? t("common.saving") : t("profile.saveBtn")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {user?.role === "Admin" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  {t("security.title")}
                </CardTitle>
                <CardDescription>Two-factor authentication & backup codes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="text-sm font-semibold">2FA Status</div>
                    {user?.totp_enabled && backupCodesCount !== null && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {backupCodesCount} of 8 backup codes remaining
                      </div>
                    )}
                  </div>
                  {user?.totp_enabled ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="destructive">Not Enabled</Badge>
                  )}
                </div>

                {!user?.totp_enabled && (
                  <Button onClick={() => setShow2FASetup(true)} className="w-full">
                    <Key className="h-4 w-4" />
                    Enable 2FA
                  </Button>
                )}

                {user?.totp_enabled && !showDisableForm && !showRegenForm && newBackupCodes.length === 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setShowDisableForm(true)}>
                      Disable 2FA
                    </Button>
                    <Button variant="outline" onClick={() => setShowRegenForm(true)}>
                      <RefreshCw className="h-4 w-4" />
                      Regenerate Codes
                    </Button>
                  </div>
                )}

                {newBackupCodes.length > 0 && (
                  <div className="p-4 rounded-lg border-2 border-dashed border-emerald-500/30 bg-emerald-500/5">
                    <p className="text-sm font-semibold text-emerald-600 mb-2">New Backup Codes — save them now!</p>
                    <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                      {newBackupCodes.map((c, i) => (
                        <div key={i} className="p-2 rounded bg-background border">
                          {c}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={downloadCodes}>
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" onClick={copyCodes}>
                        {copiedAll ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedAll ? "Copied" : "Copy"}
                      </Button>
                      <Button size="sm" onClick={() => { setNewBackupCodes([]); api.get("/2fa/backup-codes").then((r) => setBackupCodesCount(r.data.backup_codes_remaining)); }}>
                        I've Saved Them
                      </Button>
                    </div>
                  </div>
                )}

                {showDisableForm && (
                  <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                    <Label className="text-xs">Enter your password to confirm</Label>
                    <div className="relative">
                      <Input
                        type={showDisablePassword ? "text" : "password"}
                        value={disablingPassword}
                        onChange={(e) => setDisablingPassword(e.target.value)}
                        placeholder="Password"
                        className="pr-10"
                      />
                      <button type="button" onClick={() => setShowDisablePassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">
                        {showDisablePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setShowDisableForm(false); setDisablingPassword(""); }}>Cancel</Button>
                      <Button variant="destructive" size="sm" onClick={handleDisable2FA} disabled={disabling2FA}>
                        {disabling2FA ? "Disabling…" : "Confirm Disable"}
                      </Button>
                    </div>
                  </div>
                )}

                {showRegenForm && (
                  <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                    <Label className="text-xs">Enter 6-digit TOTP code</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={regenOTP}
                      onChange={(e) => setRegenOTP(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setShowRegenForm(false); setRegenOTP(""); }}>Cancel</Button>
                      <Button size="sm" onClick={handleRegenerate} disabled={regenerating || regenOTP.length !== 6}>
                        {regenerating ? "Regenerating…" : "Confirm"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {show2FASetup && <TwoFASetup onClose={() => setShow2FASetup(false)} />}
    </div>
  );
}
