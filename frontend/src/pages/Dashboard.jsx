import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/utils/formatCurrency";
import {
  TrendingUp, TrendingDown, DollarSign, FileText, CheckCircle2,
  ArrowUpRight, Activity, Briefcase, BarChart3, Brain, Cpu, Database, Hash,
  Target, Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const Bar = lazy(() => import("react-chartjs-2").then(mod => ({ default: mod.Bar })));
const Doughnut = lazy(() => import("react-chartjs-2").then(mod => ({ default: mod.Doughnut })));

let chartRegistered = false;
const registerChartJS = async () => {
  if (chartRegistered) return;
  const { Chart, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } = await import("chart.js");
  Chart.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);
  chartRegistered = true;
};

const chartDefaults = (isDark) => ({
  color: isDark ? "oklch(0.66 0.02 248)" : "oklch(0.52 0.02 263)",
  borderColor: isDark ? "oklch(0.33 0.03 258)" : "oklch(0.90 0.02 257)",
});

function MetricCard({ label, value, icon: Icon, trend, accent = "default", loading }) {
  const accents = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    danger: "text-rose-600 dark:text-rose-400",
    warning: "text-amber-600 dark:text-amber-400",
    primary: "text-primary",
  };
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        </div>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <div className="flex items-end justify-between">
            <div className={cn("text-3xl font-bold tracking-tight", accents[accent])}>
              {value}
            </div>
            {trend && (
              <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <ArrowUpRight className="h-3 w-3" />
                {trend}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === "dark";
  const [metrics, setMetrics] = useState(null);
  const [modelStats, setModelStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    registerChartJS().then(() => setChartReady(true));
  }, []);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [res, modelRes] = await Promise.all([
          api.get("/analytics/dashboard"),
          api.get("/analytics/model-stats"),
        ]);
        setMetrics(res.data);
        setModelStats(modelRes.data);
      } catch {
        toast.error(t("dashboard.failedLoad"));
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [t]);

  const fmt = useCallback((n) => formatCurrency(n), []);

  const barData = useMemo(() => ({
    labels: [
      t("dashboard.wonBids"),
      t("dashboard.lostBids", "Lost Bids"),
      t("dashboard.activeBids"),
      t("reports.pendingApprovals"),
    ],
    datasets: [{
      label: t("dashboard.bidStatusOverview"),
      data: [metrics?.wonBids, metrics?.lostBids, metrics?.activeBids, metrics?.pendingApprovals],
      backgroundColor: [
        "oklch(0.70 0.19 150)",
        "oklch(0.70 0.19 22)",
        "oklch(0.62 0.19 260)",
        "oklch(0.82 0.16 80)",
      ],
      borderRadius: 8,
      borderSkipped: false,
    }],
  }), [metrics, t]);

  const barOpts = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: chartDefaults(isDark).borderColor },
        ticks: { color: chartDefaults(isDark).color },
      },
      x: {
        grid: { display: false },
        ticks: { color: chartDefaults(isDark).color },
      },
    },
  }), [isDark]);

  const role = user?.role;
  const isBidder = role === "Bidder";
  const isCompany = role === "Company";

  const getGreeting = () => {
    if (isBidder) return t("dashboard.greetingBidder", "Track your bids and performance.");
    if (isCompany) return t("dashboard.greetingCompany", "Monitor your enquiries and incoming bids.");
    return t("dashboard.greetingDefault", "Welcome back — here's what's happening with your bids.");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{getGreeting()}</p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          <Activity className="h-3 w-3 me-1" />
          {t("dashboard.live", "LIVE")}
        </Badge>
      </div>

      {isBidder ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label={t("dashboard.totalBidsSubmitted", "Total Bids Submitted")}
            value={(metrics?.wonBids ?? 0) + (metrics?.lostBids ?? 0) + (metrics?.activeBids ?? 0)}
            icon={FileText}
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.wonBids")}
            value={metrics?.wonBids ?? 0}
            icon={CheckCircle2}
            accent="success"
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.lostBids", "Lost Bids")}
            value={metrics?.lostBids ?? 0}
            icon={TrendingDown}
            accent="danger"
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.winRate", "Win Rate")}
            value={`${metrics?.winRate ?? 0}%`}
            icon={Percent}
            accent={metrics?.winRate >= 50 ? "success" : "warning"}
            loading={loading}
          />
        </div>
      ) : isCompany ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label={t("dashboard.enquiriesPosted", "Enquiries Posted")}
            value={metrics?.totalEnquiries ?? 0}
            icon={Briefcase}
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.activeBids")}
            value={metrics?.activeBids ?? 0}
            icon={Activity}
            accent="primary"
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.wonBids")}
            value={metrics?.wonBids ?? 0}
            icon={CheckCircle2}
            accent="success"
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.conversionRate", "Conversion Rate")}
            value={`${metrics?.winRate ?? 0}%`}
            icon={Target}
            accent={metrics?.winRate >= 50 ? "success" : "warning"}
            loading={loading}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            label={t("dashboard.totalEnquiries")}
            value={metrics?.totalEnquiries ?? 0}
            icon={Briefcase}
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.activeBids")}
            value={metrics?.activeBids ?? 0}
            icon={Activity}
            accent="primary"
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.wonBids")}
            value={metrics?.wonBids ?? 0}
            icon={CheckCircle2}
            accent="success"
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.lostBids", "Lost Bids")}
            value={metrics?.lostBids ?? 0}
            icon={TrendingDown}
            accent="danger"
            loading={loading}
          />
          <MetricCard
            label={t("dashboard.revenueGenerated")}
            value={fmt(metrics?.revenueGenerated)}
            icon={DollarSign}
            accent="primary"
            loading={loading}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {t("dashboard.performanceAnalytics")}
                </CardTitle>
                <CardDescription>{t("dashboard.bidDistributionDesc", "Bid distribution across stages")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {loading ? <Skeleton className="h-full w-full" /> : (
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  {chartReady && <Bar data={barData} options={barOpts} aria-label="Bid distribution across stages bar chart" />}
                </Suspense>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t("dashboard.winRate", "Win Rate")}
            </CardTitle>
            <CardDescription>{t("dashboard.conversionEfficiency", "Conversion efficiency")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-6">
              {loading ? (
                <Skeleton className="h-32 w-32 rounded-full" />
              ) : (
                <Suspense fallback={<Skeleton className="h-32 w-32 rounded-full" />}>
                  {chartReady && (
                    <Doughnut
                      data={{
                        labels: [t("dashboard.won", "Won"), t("dashboard.lost", "Lost")],
                        datasets: [{
                          data: [metrics?.wonBids || 0, metrics?.lostBids || 0],
                          backgroundColor: ["oklch(0.70 0.19 150)", "oklch(0.70 0.19 22)"],
                          borderWidth: 0,
                        }],
                      }}
                      options={{
                        cutout: "75%",
                        plugins: { legend: { display: false } },
                      }}
                      className="h-40 w-40"
                      aria-label="Win rate doughnut chart showing won and lost bids"
                    />
                  )}
                </Suspense>
              )}
              <div className="text-center -mt-28 mb-20">
                <div className="text-4xl font-bold text-emerald-600">{metrics?.winRate || 0}%</div>
                <div className="text-xs text-muted-foreground">{t("dashboard.winRate", "Win rate")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {role === "Admin" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              {t("dashboard.aiModelStatus", "AI Model Status")}
            </CardTitle>
            <CardDescription>{t("dashboard.xgboostEngine", "XGBoost prediction engine")}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("dashboard.model", "Model")}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">XGBoost</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("dashboard.accuracy", "Accuracy")}</span>
                  <span className="text-sm font-bold text-emerald-600">
                    {modelStats?.model?.accuracy ? `${(modelStats.model.accuracy * 100).toFixed(1)}%` : t("common.na", "N/A")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("dashboard.predictionsMade", "Predictions Made")}</span>
                  <span className="text-sm font-semibold">{modelStats?.totalPredictions || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("dashboard.avgConfidence", "Avg Confidence")}</span>
                  <span className="text-sm font-semibold">{modelStats?.avgConfidence || 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("dashboard.terminalBids", "Terminal Bids")}</span>
                  <span className="text-sm font-semibold">{modelStats?.terminalBids || 0}</span>
                </div>
                <div className="pt-2 border-t space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {modelStats?.model?.trainedAt
                        ? `${t("dashboard.lastTrained", "Last trained")}: ${new Date(modelStats.model.trainedAt).toLocaleDateString(i18n.language)}`
                        : t("dashboard.noModelTrained", "No model trained yet")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {t("dashboard.trainingRecords", "Training Records")}: {modelStats?.model?.records?.toLocaleString(i18n.language) || t("common.na", "N/A")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {t("dashboard.modelVersion", "Model Version")}: v{modelStats?.model?.version ?? t("common.na", "N/A")}
                    </span>
                  </div>
                  {modelStats?.retrainReady && (
                    <Badge variant="success" className="mt-1.5 text-[10px]">
                      <Cpu className="h-2.5 w-2.5 me-1" />
                      {t("dashboard.readyToRetrain", "Ready to retrain")}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
