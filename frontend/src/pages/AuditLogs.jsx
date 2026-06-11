import React, { useState, useEffect, useMemo } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { ScrollText, Search, User, Activity, FileText } from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

const toneForAction = (action = "") => {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("reject") || a.includes("disable")) return "destructive";
  if (a.includes("create") || a.includes("add") || a.includes("enable") || a.includes("login")) return "success";
  if (a.includes("update") || a.includes("edit") || a.includes("change") || a.includes("profile")) return "info";
  if (a.includes("share") || a.includes("export")) return "review";
  return "secondary";
};

const AuditLogs = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const fetchLogs = async () => {
      try {
        const res = await api.get("/audit/", { signal: controller.signal });
        setLogs(res.data);
      } catch (err) {
        if (err?.name === 'CanceledError') return;
        toast.error(t("audit.failedFetch"));
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
    return () => controller.abort();
  }, [t]);

  const filtered = useMemo(() => logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (log.user || "").toLowerCase().includes(q) ||
      (log.action || "").toLowerCase().includes(q) ||
      (log.details || "").toLowerCase().includes(q)
    );
  }), [logs, search]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-chart-2 text-primary-foreground grid place-items-center shadow-md">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("audit.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Complete history of system activity</p>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Activity Log</CardTitle>
              <CardDescription>
                {loading ? "Loading…" : `${filtered.length} of ${logs.length} entries`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <Empty>
                <EmptyIcon>
                  <FileText className="h-6 w-6" />
                </EmptyIcon>
                <EmptyTitle>No audit logs</EmptyTitle>
                <EmptyDescription>
                  {search ? "No entries match your search" : t("audit.noLogs", "No audit logs found.")}
                </EmptyDescription>
              </Empty>
            </div>
          ) : (
            <div className="rounded-b-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <div className="flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5" />
                        {t("audit.timestamp")}
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        {t("audit.user")}
                      </div>
                    </TableHead>
                    <TableHead>{t("audit.action")}</TableHead>
                    <TableHead>{t("audit.details")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow key={log._id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {format(new Date(log.timestamp), "MMM dd, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-semibold">{log.user}</TableCell>
                      <TableCell>
                        <Badge variant={toneForAction(log.action)}>{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-md">
                        <div className="truncate" title={log.details}>{log.details}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditLogs;
