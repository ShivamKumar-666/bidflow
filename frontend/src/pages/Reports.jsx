import React, { useState, useEffect, useCallback } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { useTranslation } from "react-i18next";
import {
  Brain, Cpu, Play, Calendar, AlertTriangle, RefreshCw, History, Undo2,
  CheckCircle, FileDown, FileSpreadsheet, TrendingUp, Wallet, Clock,
  Activity,
} from "lucide-react";
import { AuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MetricCard = ({ title, value, icon: Icon, tone = "default" }) => {
  const toneStyles = {
    success: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    warning: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    info: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    default: "text-primary bg-primary/10",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <div className={cn("h-8 w-8 rounded-lg grid place-items-center", toneStyles[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
};

const Reports = () => {
  const { t } = useTranslation();
  const { user } = useContext(AuthContext);
  const [metrics, setMetrics] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [retraining, setRetraining] = useState(false);
  const [loadingModel, setLoadingModel] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const [modelVersions, setModelVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [rollingBack, setRollingBack] = useState(null);

  const [slaReport, setSlaReport] = useState(null);
  const [loadingSla, setLoadingSla] = useState(true);
  const [scanningSla, setScanningSla] = useState(false);

  const isAdmin = user?.role === "Admin";

  const fetchSlaReport = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingSla(true);
    try {
      const res = await api.get("/admin/sla/report");
      setSlaReport(res.data);
    } catch (err) {
      console.error("Failed to load SLA report", err);
    } finally {
      setLoadingSla(false);
    }
  }, [isAdmin]);

  const handleScanSla = async () => {
    setScanningSla(true);
    try {
      await api.post("/admin/sla/check");
      toast.success(t("reports.slaScanSuccess", "SLA scan completed!"));
      await fetchSlaReport();
      const metricsRes = await api.get("/analytics/dashboard");
      setMetrics(metricsRes.data);
    } catch (err) {
      toast.error(err.response?.data?.msg || t("reports.slaScanFailed", "Failed to run SLA scan"));
    } finally {
      setScanningSla(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const fetchMetrics = async () => {
      try {
        const res = await api.get("/analytics/dashboard", { signal: controller.signal });
        setMetrics(res.data);
      } catch (err) {
        if (err?.name === 'CanceledError') return;
        toast.error(t("dashboard.failedLoad"));
      } finally {
        setLoadingMetrics(false);
      }
    };
    fetchMetrics();
    fetchModelStatus();
    if (isAdmin) {
      fetchSlaReport();
      fetchModelVersions();
    }
    return () => controller.abort();
  }, [t, isAdmin, fetchSlaReport, fetchModelStatus, fetchModelVersions]);

  const fetchModelVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const res = await api.get("/admin/models");
      setModelVersions(res.data);
    } catch (err) {
      console.error("Failed to load model versions", err);
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  const handleRollback = async (version) => {
    setRollingBack(version);
    try {
      const res = await api.post("/admin/models/rollback", { version });
      toast.success(res.data.msg || `Rolled back to version ${version}`);
      await fetchModelVersions();
      await fetchModelStatus();
    } catch (err) {
      toast.error(err.response?.data?.msg || "Rollback failed");
    } finally {
      setRollingBack(null);
    }
  };

  const fetchModelStatus = useCallback(async () => {
    setLoadingModel(true);
    try {
      const res = await api.get("/admin/model-status");
      setModelStatus(res.data);
    } catch (err) {
      console.error("Failed to load model status", err);
    } finally {
      setLoadingModel(false);
    }
  }, []);

  const handleRetrainModel = async () => {
    setRetraining(true);
    try {
      const res = await api.post("/admin/retrain");
      if (res.data.status === "success") {
        toast.success(t("mlModel.successToast", { accuracy: (res.data.accuracy * 100).toFixed(2) }));
      } else {
        toast.error(t("mlModel.skippedToast", { message: res.data.message || t("mlModel.notFound") }));
      }
      await fetchModelStatus();
    } catch (err) {
      toast.error(err.response?.data?.msg || t("mlModel.failedToast"));
    } finally {
      setRetraining(false);
    }
  };

  const handleExport = async () => {
    let url;
    try {
      const response = await api.get("/analytics/export/csv", { responseType: "blob" });
      url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "bids_export.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t("reports.csvSuccess"));
    } catch (err) {
      toast.error(t("reports.csvFailed"));
    } finally {
      if (url) window.URL.revokeObjectURL(url);
    }
  };

  const handleExportPDF = async () => {
    try {
      const res = await api.get("/bids/");
      const bidsData = Array.isArray(res.data) ? res.data : (res.data.items || []);

      const doc = new jsPDF();
      doc.text(t("reports.pdfTitle"), 14, 15);

      const tableColumn = [
        t("bids.bidId"),
        t("bids.enquiryId"),
        t("bids.amount"),
        t("bids.status"),
        t("bids.assignedTo"),
      ];
      const tableRows = [];

      bidsData.forEach(bid => {
        const bidData = [
          bid.bidId || "N/A",
          bid.enquiryId || "N/A",
          `$${bid.amount || 0}`,
          bid.status || "N/A",
          bid.assignedEmployee || "N/A",
        ];
        tableRows.push(bidData);
      });

      doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 20,
      });

      doc.save("bids_report.pdf");
      toast.success(t("reports.pdfSuccess"));
    } catch (err) {
      toast.error(t("reports.pdfFailed"));
    }
  };

  const slaTopStage = slaReport?.by_stage?.length
    ? slaReport.by_stage.reduce((max, cur) => cur.count > max.count ? cur : max, slaReport.by_stage[0])
    : null;
  const slaTopEmployee = slaReport?.by_employee?.length
    ? slaReport.by_employee.reduce((max, cur) => cur.count > max.count ? cur : max, slaReport.by_employee[0])
    : null;

  const renderSlaBars = (items) => {
    if (!items || items.length === 0) {
      return <p className="text-sm text-muted-foreground">No breach data available.</p>;
    }
    const maxVal = Math.max(1, ...items.map(x => x.count));
    const labelKey = items === slaReport?.by_stage ? "stage" : "employee";
    return (
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item[labelKey]} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{item[labelKey]}</span>
              <span className="font-semibold text-destructive">{item.count}</span>
            </div>
            <div className="h-1.5 w-full bg-destructive/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-destructive rounded-full transition-all"
                style={{ width: `${(item.count / maxVal) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">Performance metrics, SLA analysis and AI model management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <FileDown className="h-4 w-4" />
            {t("reports.exportPdf")}
          </Button>
          <Button onClick={handleExport}>
            <FileSpreadsheet className="h-4 w-4" />
            {t("reports.exportCsv")}
          </Button>
        </div>
      </div>

      {loadingMetrics ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title={t("reports.winRate")}
            value={`${metrics.winRate}%`}
            icon={TrendingUp}
            tone="success"
          />
          <MetricCard
            title={t("reports.avgBidSize")}
            value={`$${Math.round(metrics.avgBidSize || 0).toLocaleString()}`}
            icon={Activity}
            tone="info"
          />
          <MetricCard
            title={t("reports.totalRevenue")}
            value={`$${(metrics.revenueGenerated || 0).toLocaleString()}`}
            icon={Wallet}
            tone="default"
          />
          <MetricCard
            title={t("reports.pendingApprovals")}
            value={metrics.pendingApprovals ?? 0}
            icon={Clock}
            tone="warning"
          />
        </div>
      ) : null}

      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive grid place-items-center">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">{t("reports.slaReport", "SLA Breach Analysis")}</CardTitle>
                  <CardDescription>Identify overdue bids and bottlenecks</CardDescription>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={handleScanSla}
                disabled={scanningSla}
              >
                <RefreshCw className={cn("h-4 w-4", scanningSla && "animate-spin")} />
                {scanningSla ? t("reports.slaScanning", "Scanning...") : t("reports.slaScan", "Trigger SLA Scan")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingSla ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : slaReport ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-lg border bg-card">
                    <p className="text-xs text-muted-foreground">{t("reports.slaActiveBreaches", "Active SLA Breaches")}</p>
                    <p className="text-2xl font-bold text-destructive mt-1">
                      {slaReport.details?.length || 0}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border bg-card">
                    <p className="text-xs text-muted-foreground">{t("reports.slaBreachFrequencyByStage")}</p>
                    <p className="text-base font-semibold mt-1 truncate">
                      {slaTopStage ? `${slaTopStage.stage} (${slaTopStage.count})` : "N/A"}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border bg-card">
                    <p className="text-xs text-muted-foreground">{t("reports.slaBreachFrequencyByEmployee")}</p>
                    <p className="text-base font-semibold mt-1 truncate">
                      {slaTopEmployee ? `${slaTopEmployee.employee} (${slaTopEmployee.count})` : "N/A"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border bg-card">
                    <h3 className="text-sm font-semibold mb-3">{t("reports.slaBreachFrequencyByStage")}</h3>
                    {renderSlaBars(slaReport.by_stage)}
                  </div>
                  <div className="p-4 rounded-lg border bg-card">
                    <h3 className="text-sm font-semibold mb-3">{t("reports.slaBreachFrequencyByEmployee")}</h3>
                    {renderSlaBars(slaReport.by_employee)}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3">
                    {t("reports.slaActiveBreaches", "Active SLA Breaches")} — Details
                  </h3>
                  {slaReport.details && slaReport.details.length > 0 ? (
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("bids.bidId", "Bid ID")}</TableHead>
                            <TableHead>{t("bids.assignedTo", "Assigned")}</TableHead>
                            <TableHead>{t("bids.status")}</TableHead>
                            <TableHead>{t("reports.slaLimit", "SLA Limit")}</TableHead>
                            <TableHead>{t("reports.slaElapsed", "Elapsed")}</TableHead>
                            <TableHead className="text-right">{t("reports.slaDays", "Overdue")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {slaReport.details.map((bid) => (
                            <TableRow key={bid._id}>
                              <TableCell className="font-semibold">{bid.bidId}</TableCell>
                              <TableCell>{bid.assignedEmployee || "Unassigned"}</TableCell>
                              <TableCell>
                                <Badge variant="review">{bid.status}</Badge>
                              </TableCell>
                              <TableCell>{bid.slaThresholdDays}d</TableCell>
                              <TableCell>{bid.slaElapsedDays}d</TableCell>
                              <TableCell className="text-right font-semibold text-destructive">
                                +{bid.slaElapsedDays - bid.slaThresholdDays}d
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-sm text-muted-foreground rounded-lg border border-dashed">
                      No active SLA breaches detected.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("reports.slaScanFailed", "Failed to load SLA report")}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("mlModel.modelHeader")}</CardTitle>
              <CardDescription>AI model that predicts win probability</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingModel ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : modelStatus ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    <span className="text-muted-foreground">{t("mlModel.modelStatusLabel")} </span>
                    {modelStatus.model?.exists ? (
                      <Badge variant="success">{t("mlModel.active")}</Badge>
                    ) : (
                      <Badge variant="destructive">{t("mlModel.notFound")}</Badge>
                    )}
                  </span>
                </div>
                {modelStatus.model?.exists && (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{t("mlModel.lastUpdated", { time: new Date(modelStatus.model.last_modified).toLocaleString() })}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t("mlModel.modelSize", { size: modelStatus.model.size_kb })}
                    </div>
                  </>
                )}
                <Separator />
                <div className="p-3 rounded-lg bg-muted/40 space-y-2">
                  <p className="text-sm font-semibold">{t("mlModel.dataNextTraining")}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("mlModel.terminalBids")}</span>
                    <span className="font-semibold">
                      {modelStatus.terminal_bids} / {modelStatus.min_to_retrain}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, (modelStatus.terminal_bids / modelStatus.min_to_retrain) * 100)}
                    className="h-1.5"
                    indicatorClassName={modelStatus.ready_to_retrain ? "bg-emerald-500" : "bg-primary"}
                  />
                </div>
              </div>
              <div className="space-y-3 flex flex-col justify-center">
                <p className="text-sm text-muted-foreground">{t("mlModel.modelExplanation")}</p>
                <Button
                  onClick={handleRetrainModel}
                  disabled={retraining || !modelStatus.ready_to_retrain}
                  className="w-full"
                >
                  {retraining ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {t("mlModel.retraining")}
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      {t("mlModel.retrainNow")}
                    </>
                  )}
                </Button>
                {!modelStatus.ready_to_retrain && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{t("mlModel.requiresBids", { count: modelStatus.min_to_retrain })}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("mlModel.failedLoadStatus")}</p>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Model Version History</CardTitle>
                  <CardDescription>Roll back to any previous trained version</CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchModelVersions}
                disabled={loadingVersions}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loadingVersions && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingVersions ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : modelVersions.length === 0 ? (
              <div className="p-8 text-center rounded-lg border border-dashed bg-muted/20">
                <History className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No versioned models found. Retrain to create the first version.</p>
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Accuracy</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Trained At</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelVersions.map((v) => (
                      <TableRow key={v._id} className={cn(v.isActive && "bg-primary/5")}>
                        <TableCell className="font-bold">v{v.version}</TableCell>
                        <TableCell>
                          {v.isActive ? (
                            <Badge variant="success">
                              <CheckCircle className="h-3 w-3" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className={cn(
                          "font-semibold",
                          v.accuracy >= 0.7 ? "text-emerald-600" :
                          v.accuracy >= 0.5 ? "text-amber-600" : "text-destructive"
                        )}>
                          {v.accuracy != null ? `${(v.accuracy * 100).toFixed(1)}%` : "N/A"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {v.records ?? "N/A"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {v.trainedAt ? new Date(v.trainedAt).toLocaleString() : "N/A"}
                        </TableCell>
                        <TableCell className="text-right">
                          {!v.isActive ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRollback(v.version)}
                              disabled={rollingBack === v.version}
                              className="text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                            >
                              {rollingBack === v.version ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Undo2 className="h-3 w-3" />
                              )}
                              {rollingBack === v.version ? "Rolling back…" : "Rollback"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Reports;
