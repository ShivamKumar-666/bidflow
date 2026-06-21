import { useState, useCallback } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Users, Shield, KeyRound, Search, RefreshCw, CheckCircle,
  XCircle, Lock, Mail, Calendar,
} from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const AdminUsers = () => {
  const { t } = useTranslation();
  const { users, loading, refetch } = useUsers();
  const [search, setSearch] = useState("");

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const filtered = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.role?.toLowerCase().includes(search.toLowerCase())
  );

  const openResetDialog = useCallback((user) => {
    setResetTarget(user);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setResetDialogOpen(true);
  }, []);

  const closeResetDialog = useCallback(() => {
    setResetDialogOpen(false);
    setResetTarget(null);
    setNewPassword("");
    setConfirmPassword("");
  }, []);

  const handleResetPassword = async () => {
    if (!newPassword) {
      toast.error(t("adminUsers.passwordRequired", "Please enter a new password"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("adminUsers.passwordMismatch", "Passwords do not match"));
      return;
    }

    setResetting(true);
    try {
      await api.post("/auth/admin/reset-password", {
        user_id: resetTarget._id,
        new_password: newPassword,
      });
      toast.success(
        t("adminUsers.resetSuccess", {
          name: resetTarget.name,
          defaultValue: `Password reset for ${resetTarget.name} successfully`,
        })
      );
      closeResetDialog();
    } catch (err) {
      toast.error(
        err.response?.data?.msg ||
          t("adminUsers.resetFailed", "Failed to reset password")
      );
    } finally {
      setResetting(false);
    }
  };

  const roleBadgeVariant = (role) => {
    switch (role) {
      case "Admin":
        return "destructive";
      case "Company":
        return "default";
      case "Bidder":
        return "success";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("adminUsers.title", "User Management")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("adminUsers.subtitle", "Manage users and reset passwords")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refetch} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("adminUsers.refresh", "Refresh")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">
                  {t("adminUsers.allUsers", "All Users")}
                </CardTitle>
                <CardDescription>
                  {t("adminUsers.userCount", {
                    count: filtered.length,
                    defaultValue: `${filtered.length} user(s) found`,
                  })}
                </CardDescription>
              </div>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("adminUsers.searchPlaceholder", "Search users...")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center rounded-lg border border-dashed bg-muted/20">
              <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {t("adminUsers.noUsers", "No users found")}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("adminUsers.name", "Name")}</TableHead>
                    <TableHead>{t("adminUsers.email", "Email")}</TableHead>
                    <TableHead>{t("adminUsers.role", "Role")}</TableHead>
                    <TableHead>{t("adminUsers.verified", "Verified")}</TableHead>
                    <TableHead>{t("adminUsers.2fa", "2FA")}</TableHead>
                    <TableHead>{t("adminUsers.joined", "Joined")}</TableHead>
                    <TableHead className="text-right">
                      {t("adminUsers.actions", "Actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((user) => (
                    <TableRow key={user._id}>
                      <TableCell className="font-semibold">{user.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(user.role)}>
                          <Shield className="h-3 w-3 mr-1" />
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.is_verified ? (
                          <Badge variant="success">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t("adminUsers.yes", "Yes")}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            {t("adminUsers.no", "No")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.totp_enabled ? (
                          <Badge variant="success">
                            <Lock className="h-3 w-3 mr-1" />
                            {t("adminUsers.enabled", "Enabled")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            {t("adminUsers.disabled", "Off")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {user.created_at
                            ? new Date(user.created_at).toLocaleDateString()
                            : "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openResetDialog(user)}
                          className="text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1" />
                          {t("adminUsers.resetPassword", "Reset Password")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("adminUsers.resetDialogTitle", "Reset User Password")}
            </DialogTitle>
            <DialogDescription>
              {t("adminUsers.resetDialogDesc", {
                name: resetTarget?.name,
                defaultValue: `Set a new password for ${resetTarget?.name || "this user"}. They will need to use the new password to log in.`,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">
                {t("adminUsers.newPassword", "New Password")}
              </Label>
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("adminUsers.newPasswordPlaceholder", "Enter new password")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">
                {t("adminUsers.confirmPassword", "Confirm Password")}
              </Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("adminUsers.confirmPasswordPlaceholder", "Confirm new password")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("adminUsers.passwordRequirements", "Must be 8+ characters with uppercase, number, and special character")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeResetDialog} disabled={resetting}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleResetPassword} disabled={resetting}>
              {resetting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                  {t("adminUsers.resetting", "Resetting...")}
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-1" />
                  {t("adminUsers.confirmReset", "Reset Password")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
