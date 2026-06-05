import React, { useEffect, useState } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend,
} from "chart.js";
import {
  TrendingUp, TrendingDown, DollarSign, FileText, MessageSquare, CheckCircle2, Clock,
  ArrowUpRight, Activity, Briefcase, BarChart3, Brain, Cpu, Database,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/contexts/ThemeContext";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

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
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <div className="flex items-end justify-between">
            <div className={cn(value, "text-3xl font-bold tracking-tight", accents[accent])}>
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

function cn(...args) {
  return args.filter(Boolean).join(" ");
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [metrics, setMetrics] = useState(null);
  const [modelStats, setModelStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [res, modelRes] = await Promise.all([
          api.get("/analytics/dashboard"),
          api.get("/analytics/model-stats"),
        ]);
        setMetrics(res.data);
        setModelStats(modelRes.data);
      } catch (err) {
        toast.error(t("dashboard.failedLoad"));
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [t]);

  const fmt = (n) => "$" + Number(n || 0).toLocaleString();

  const barData = {
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
  };

  const barOpts = {
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
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back — here's what's happening with your bids.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          <Activity className="h-3 w-3 mr-1" />
          LIVE
        </Badge>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {t("dashboard.performanceAnalytics")}
                </CardTitle>
                <CardDescription>Bid distribution across stages</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {loading ? <Skeleton className="h-full w-full" /> : <Bar data={barData} options={barOpts} />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              AI Model Status
            </CardTitle>
            <CardDescription>XGBoost prediction engine</CardDescription>
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
                  <span className="text-xs text-muted-foreground">Model</span>
                  <Badge variant="outline" className="font-mono text-[10px]">XGBoost</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Accuracy</span>
                  <span className="text-sm font-bold text-emerald-600">
                    {modelStats?.model?.accuracy ? `${(modelStats.model.accuracy * 100).toFixed(1)}%` : "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Predictions Made</span>
                  <span className="text-sm font-semibold">{modelStats?.totalPredictions || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg Confidence</span>
                  <span className="text-sm font-semibold">{modelStats?.avgConfidence || 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Terminal Bids</span>
                  <span className="text-sm font-semibold">{modelStats?.terminalBids || 0}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {modelStats?.model?.trainedAt
                        ? `Last trained: ${new Date(modelStats.model.trainedAt).toLocaleDateString()}`
                        : "No model trained yet"}
                    </span>
                  </div>
                  {modelStats?.retrainReady && (
                    <Badge variant="success" className="mt-1.5 text-[10px]">
                      <Cpu className="h-2.5 w-2.5 mr-1" />
                      Ready to retrain
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Win Rate
            </CardTitle>
            <CardDescription>Conversion efficiency</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-6">
              {loading ? (
                <Skeleton className="h-32 w-32 rounded-full" />
              ) : (
                <Doughnut
                  data={{
                    labels: ["Won", "Lost"],
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
                />
              )}
              <div className="text-center -mt-28 mb-20">
                <div className="text-4xl font-bold text-emerald-600">{metrics?.winRate || 0}%</div>
                <div className="text-xs text-muted-foreground">Win rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
