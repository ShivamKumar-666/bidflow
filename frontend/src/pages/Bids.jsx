import React, { useState, useEffect, useRef, useCallback, useContext, useMemo } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { io } from "socket.io-client";
import { useTranslation } from "react-i18next";
import {
  Tag, MessageSquare, FileDown, Trash2, Brain, TrendingUp, TrendingDown,
  Minus, Info, Send, X, Search, Filter, Loader2, AlertTriangle, Pencil, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { TagInput } from "@/components/TagInput";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const defaultIndustryTags = {
  Technology: ["software", "saas", "hardware", "consulting", "cloud", "devops", "cybersecurity"],
  Banking: ["loan", "credit", "securities", "compliance", "fintech", "retail-banking", "asset-management"],
  Manufacturing: ["machinery", "materials", "logistics", "supply-chain", "automotive", "quality-control"],
  Retail: ["e-commerce", "inventory", "merchandising", "pos", "supply-chain", "customer-loyalty"],
  Healthcare: ["medical-devices", "pharma", "compliance", "telehealth", "clinical-trials", "patient-care"],
  Other: ["general", "consulting", "services", "miscellaneous"],
};

const statusVariants = {
  "Order Received": "success",
  "Completed": "success",
  "Rejected": "destructive",
  "Negotiation": "info",
  "Submitted": "info",
  "Quotation Prepared": "review",
  "Under Review": "warning",
};

const STATUSES = ["Quotation Prepared", "Under Review", "Negotiation", "Order Received", "Rejected"];

function ShapBar({ explanation }) {
  const maxAbs = 15;
  const pct = Math.min(Math.abs(explanation.shap_value) / maxAbs * 100, 100);
  const isPositive = explanation.impact === "positive";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground capitalize">{explanation.feature.replace(/_/g, " ")}</span>
        <span className={cn("font-mono font-semibold text-xs", isPositive ? "text-emerald-600" : "text-rose-600")}>
          {isPositive ? "+" : ""}{explanation.shap_value}%
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("absolute top-0 h-full rounded-full transition-all", isPositive ? "bg-emerald-500" : "bg-rose-500")}
          style={{ width: `${pct}%`, left: isPositive ? "50%" : `${50 - pct}%` }}
        />
        <div className="absolute top-0 left-1/2 w-px h-full bg-border" />
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{explanation.text}</p>
    </div>
  );
}

function PredictionPill({ value, explanations, onExplain }) {
  if (value == null) return <span className="text-muted-foreground text-xs">N/A</span>;
  const tone = value >= 70 ? "success" : value >= 40 ? "warning" : "destructive";
  const Icon = value >= 70 ? TrendingUp : value >= 40 ? Minus : TrendingDown;

  const Pill = (
    <Badge variant={tone} className="gap-1 font-mono cursor-help">
      <Icon className="h-3 w-3" />
      {value}%
    </Badge>
  );

  if (!explanations || explanations.length === 0) {
    return Pill;
  }

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>{Pill}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs p-3">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-primary">
              <Brain className="h-3 w-3" />
              AI Explanation
            </div>
            <div className="space-y-1.5">
              {explanations.slice(0, 3).map((ex, i) => (
                <div key={i} className={cn(
                  "flex items-start gap-1.5 text-[11px] p-1.5 rounded",
                  ex.impact === "positive" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                )}>
                  {ex.impact === "positive" ? <TrendingUp className="h-3 w-3 flex-shrink-0 mt-0.5" /> : <TrendingDown className="h-3 w-3 flex-shrink-0 mt-0.5" />}
                  <span>{ex.text}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {onExplain && (
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onExplain}>
          <Info className="h-3 w-3 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

function LivePrediction({ livePredict, loading }) {
  const [showAll, setShowAll] = useState(false);
  if (!loading && !livePredict) return null;
  const value = livePredict?.win_probability ?? 0;
  const tone = value >= 70 ? "emerald" : value >= 40 ? "amber" : "rose";
  const explanations = livePredict?.shap_explanations || [];
  const visibleExplanations = showAll ? explanations : explanations.slice(0, 5);
  return (
    <div className={cn(
      "rounded-lg p-3 border",
      loading ? "bg-muted/30 border-border" : `bg-${tone}-500/10 border-${tone}-500/20`
    )}>
      <div className="flex items-center gap-2 mb-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Brain className={cn("h-4 w-4", `text-${tone}-600`)} />
        )}
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {loading ? "Calculating…" : "Live AI Estimate"}
        </span>
        {!loading && (
          <span className={cn("ml-auto text-lg font-bold", `text-${tone}-600`)}>
            {value}%
          </span>
        )}
      </div>
      {!loading && explanations.length > 0 && (
        <>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {visibleExplanations.map((ex, i) => (
              <ShapBar key={i} explanation={ex} />
            ))}
          </div>
          {explanations.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-[10px] text-primary hover:underline font-medium"
            >
              {showAll ? "Show less" : `Show ${explanations.length - 5} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function Bids() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [bids, setBids] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [uniqueTags, setUniqueTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [selected, setSelected] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("deadline");
  const [industryFilters, setIndustryFilters] = useState([]);
  const [sortOpen, setSortOpen] = useState(false);
  const [industryHover, setIndustryHover] = useState(false);
  const [editTags, setEditTags] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [livePredict, setLivePredict] = useState(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const predictDebounce = useRef(null);
  const [shapModal, setShapModal] = useState({ open: false, bidId: "", value: 0, explanations: [] });

  const [form, setForm] = useState({
    enquiryId: "", amount: "", industry: "Technology",
    submissionDate: "", assignedEmployee: "", remarks: "", tags: [],
  });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [b, e, tg] = await Promise.all([
        api.get("/bids/"),
        api.get("/enquiries/"),
        api.get("/tags/"),
      ]);
      setBids(Array.isArray(b.data) ? b.data : (b.data.items || []));
      setEnquiries(Array.isArray(e.data) ? e.data : (e.data.items || []));
      setUniqueTags(tg.data);
    } catch {
      toast.error(t("bids.failedFetch"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Socket for live comments
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL);
    socket.on("new_comment", (data) => {
      setBids((prev) => prev.map((b) => {
        if (b._id === data.bid_id) {
          const exists = (b.comments || []).some((c) => c._id === data.comment._id);
          if (exists) return b;
          return { ...b, comments: [...(b.comments || []), data.comment] };
        }
        return b;
      }));
      setSelected((prev) => {
        if (prev && prev._id === data.bid_id) {
          const exists = (prev.comments || []).some((c) => c._id === data.comment._id);
          if (exists) return prev;
          return { ...prev, comments: [...(prev.comments || []), data.comment] };
        }
        return prev;
      });
    });
    socket.on("delete_comment", (data) => {
      setBids((prev) => prev.map((b) => {
        if (b._id === data.bid_id) {
          return { ...b, comments: (b.comments || []).filter((c) => c._id !== data.comment_id) };
        }
        return b;
      }));
      setSelected((prev) => prev && prev._id === data.bid_id
        ? { ...prev, comments: (prev.comments || []).filter((c) => c._id !== data.comment_id) }
        : prev
      );
    });
    return () => {
      socket.disconnect();
      // Cancel any pending predict request so it doesn't fire after unmount
      // (CQ-21 fix).
      if (predictDebounce.current) {
        clearTimeout(predictDebounce.current);
        predictDebounce.current = null;
      }
    };
  }, []);

  const triggerLivePredict = useCallback((data) => {
    if (predictDebounce.current) clearTimeout(predictDebounce.current);
    if (!data.amount || !data.submissionDate) { setLivePredict(null); return; }
    predictDebounce.current = setTimeout(async () => {
      setPredictLoading(true);
      try {
        const sub = new Date(data.submissionDate);
        const days = Math.max(1, Math.round((sub - new Date()) / (1000 * 60 * 60 * 24)));
        const res = await api.post("/bids/predict", {
          amount: Number(data.amount),
          days_to_deadline: days,
          industry: data.industry,
          assignedEmployee: data.assignedEmployee,
          priority_encoded: 1,
          is_repeat_customer: 1,
        });
        setLivePredict(res.data);
      } catch {
        setLivePredict(null);
      } finally {
        setPredictLoading(false);
      }
    }, 600);
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.post("/bids/", form);
      toast.success(t("bids.createSuccess"));
      setShowCreate(false);
      setLivePredict(null);
      setForm({ enquiryId: "", amount: "", industry: "Technology", submissionDate: "", assignedEmployee: "", remarks: "", tags: [] });
      fetchAll();
    } catch {
      toast.error(t("bids.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id, bidId) => {
    if (!window.confirm(`Delete bid ${bidId}?`)) return;
    try {
      await api.delete(`/bids/${id}`);
      toast.success("Bid deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete bid");
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!selected) return;
    if (!window.confirm("Delete this comment?")) return;
    try {
      await api.delete(`/bids/${selected._id}/comments/${commentId}`);
      toast.success("Comment deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete comment");
    }
  };

  const handleUpdateTags = async (e) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await api.put(`/bids/${selected._id}`, { tags: editTags });
      toast.success("Tags updated");
      setShowTags(false);
      fetchAll();
    } catch {
      toast.error("Failed to update tags");
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/bids/${id}/status`, { status });
      toast.success(t("bids.statusUpdated"));
      fetchAll();
    } catch {
      toast.error(t("bids.statusUpdateFailed"));
    }
  };

  const downloadQuotation = async (id, bidId) => {
    try {
      const res = await api.get(`/bids/${id}/quotation`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `quotation_${bidId}.pdf`;
      a.click();
      toast.success("Quotation exported");
    } catch {
      toast.error("Failed to export quotation");
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!commentText || !selected) return;
    try {
      await api.post(`/bids/${selected._id}/comments`, { text: commentText });
      setCommentText("");
      toast.success(t("bids.commentAdded"));
      fetchAll();
    } catch {
      toast.error(t("bids.commentFailed"));
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = search.trim().toLowerCase();
      if (!val) return;
      const industries = ["Technology", "Banking", "Manufacturing", "Retail", "Healthcare", "Other"];
      const matching = industries.find((ind) => ind.toLowerCase() === val);
      if (matching && !industryFilters.includes(matching)) {
        setIndustryFilters((p) => [...p, matching]);
        setSearch("");
      }
    }
  };

  const removeIndustryFilter = (ind) => {
    setIndustryFilters((p) => p.filter((x) => x !== ind));
  };

  const fmt = (n) => new Intl.NumberFormat(i18n.language || "en-US", { style: "currency", currency: "USD" }).format(n);

  const filtered = useMemo(() => {
    let result = bids.filter((b) => {
      if (industryFilters.length > 0 && !industryFilters.includes(b.industry)) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          b.bidId?.toLowerCase().includes(s) ||
          b.enquiryId?.toLowerCase().includes(s) ||
          b.assignedEmployee?.toLowerCase().includes(s) ||
          b.industry?.toLowerCase().includes(s)
        );
      }
      return true;
    });

    switch (sortBy) {
      case "deadline":
        result.sort((a, b) => new Date(a.submissionDate) - new Date(b.submissionDate));
        break;
      case "amount":
        result.sort((a, b) => (b.amount || 0) - (a.amount || 0));
        break;
      case "employee":
        result.sort((a, b) => (a.assignedEmployee || "").localeCompare(b.assignedEmployee || ""));
        break;
      case "industry":
        result.sort((a, b) => (a.industry || "").localeCompare(b.industry || ""));
        break;
      default:
        break;
    }
    return result;
  }, [bids, search, sortBy, industryFilters]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("bids.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} of {bids.length} bids
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          {t("bids.createBid")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filter</span>
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search or type an industry + Enter..."
              className="pl-8 h-8"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((p) => !p)}
              className="h-8 w-[180px] inline-flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
            >
              <span className="truncate">
                {sortBy === "deadline" && "Deadline (Urgent First)"}
                {sortBy === "amount" && "Amount (Highest)"}
                {sortBy === "employee" && "Assigned Employee"}
                {sortBy === "industry" && "Industry"}
              </span>
              <svg className="ml-2 h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-50 w-[180px] rounded-md border bg-popover text-popover-foreground shadow-md">
                  <button
                    type="button"
                    onClick={() => { setSortBy("deadline"); setSortOpen(false); }}
                    className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent", sortBy === "deadline" && "bg-accent")}
                  >
                    Deadline (Urgent First)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSortBy("amount"); setSortOpen(false); }}
                    className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent", sortBy === "amount" && "bg-accent")}
                  >
                    Amount (Highest)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSortBy("employee"); setSortOpen(false); }}
                    className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent", sortBy === "employee" && "bg-accent")}
                  >
                    Assigned Employee
                  </button>
                  <div
                    className="relative"
                    onMouseEnter={() => setIndustryHover(true)}
                    onMouseLeave={() => setIndustryHover(false)}
                  >
                    <div className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between", sortBy === "industry" && "bg-accent")}>
                      <span>Industry</span>
                      <svg className="h-3 w-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                    {industryHover && (
                      <div className="absolute left-full top-0 ml-1 w-[160px] rounded-md border bg-popover text-popover-foreground shadow-md z-50">
                        {["Technology", "Banking", "Manufacturing", "Retail", "Healthcare", "Other"].map((ind) => {
                          const isActive = industryFilters.includes(ind);
                          return (
                            <button
                              key={ind}
                              type="button"
                              onClick={() => {
                                if (isActive) {
                                  setIndustryFilters((p) => p.filter((x) => x !== ind));
                                } else {
                                  setIndustryFilters((p) => [...p, ind]);
                                }
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                            >
                              {isActive && <span className="text-primary">✓</span>}
                              <span className={cn(!isActive && "ml-4")}>{ind}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          {industryFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {industryFilters.map((ind) => (
                <button
                  key={ind}
                  type="button"
                  onClick={() => removeIndustryFilter(ind)}
                  className="text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1 bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                >
                  {ind}
                  <X className="h-2.5 w-2.5" />
                </button>
              ))}
            </div>
          )}
          {(industryFilters.length > 0 || search) && (
            <Button variant="ghost" size="sm" onClick={() => { setIndustryFilters([]); setSearch(""); }} className="ml-auto">
              <X className="h-3.5 w-3.5" />
              Clear All
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyIcon><FileText className="h-5 w-5" /></EmptyIcon>
              <EmptyTitle>No bids yet</EmptyTitle>
              <EmptyDescription>Create your first bid to get started.</EmptyDescription>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bid ID</TableHead>
                  <TableHead>Enquiry</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>AI Prediction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((bid) => (
                  <TableRow key={bid._id}>
                    <TableCell>
                      <div className="font-mono text-xs font-semibold">{bid.bidId}</div>
                      {bid.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bid.tags.slice(0, 2).map((tg) => (
                            <Badge key={tg} variant="secondary" className="text-[10px] font-normal">{tg}</Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{bid.enquiryId}</TableCell>
                    <TableCell className="font-semibold">{fmt(bid.amount)}</TableCell>
                    <TableCell>
                      <PredictionPill
                        value={bid.aiPrediction}
                        explanations={bid.shapExplanations}
                        onExplain={() => setShapModal({
                          open: true,
                          bidId: bid.bidId,
                          value: bid.aiPrediction,
                          explanations: bid.shapExplanations || [],
                        })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={statusVariants[bid.status] || "secondary"}>{bid.status}</Badge>
                        {bid.slaBreached && (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                            SLA
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{bid.assignedEmployee}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Select value={bid.status} onValueChange={(v) => updateStatus(bid._id, v)}>
                          <SelectTrigger className="h-7 w-[140px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => { setSelected(bid); setShowComments(true); }}>
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setSelected(bid); setEditTags(bid.tags || []); setShowTags(true); }}>
                          <Tag className="h-3.5 w-3.5" />
                        </Button>
                        {bid.status === "Quotation Prepared" && (
                          <Button variant="ghost" size="icon" onClick={() => downloadQuotation(bid._id, bid.bidId)}>
                            <FileDown className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(bid._id, bid.bidId)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Bid Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setLivePredict(null); setForm({ enquiryId: "", amount: "", industry: "Technology", submissionDate: "", assignedEmployee: "", remarks: "", tags: [] }); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("bids.createTitle")}</DialogTitle>
            <DialogDescription>Build a new bid against an existing enquiry.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("bids.selectEnquiryLabel")}</Label>
              <Select required value={form.enquiryId} onValueChange={(v) => setForm({ ...form, enquiryId: v })}>
                <SelectTrigger><SelectValue placeholder={t("bids.selectEnquiry")} /></SelectTrigger>
                <SelectContent>
                  {enquiries.map((e) => (
                    <SelectItem key={e.enquiryId} value={e.enquiryId}>
                      {e.enquiryId} · {e.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("bids.bidAmount")}</Label>
                <Input
                  type="number"
                  required
                  value={form.amount}
                  onChange={(e) => {
                    const updated = { ...form, amount: e.target.value };
                    setForm(updated);
                    triggerLivePredict(updated);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("bids.submissionDate")}</Label>
                <Input
                  type="date"
                  required
                  value={form.submissionDate}
                  onChange={(e) => {
                    const updated = { ...form, submissionDate: e.target.value };
                    setForm(updated);
                    triggerLivePredict(updated);
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("bids.assignedEmployee")}</Label>
                <Input
                  required
                  value={form.assignedEmployee}
                  onChange={(e) => {
                    const updated = { ...form, assignedEmployee: e.target.value };
                    setForm(updated);
                    triggerLivePredict(updated);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("bids.clientIndustry")}</Label>
                <Select value={form.industry} onValueChange={(v) => {
                  const updated = { ...form, industry: v };
                  setForm(updated);
                  triggerLivePredict(updated);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(defaultIndustryTags).map((ind) => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <LivePrediction livePredict={livePredict} loading={predictLoading} />

            <div className="space-y-1.5">
              <Label>{t("common.tags")}</Label>
              <TagInput
                tags={form.tags}
                onChange={(tags) => setForm({ ...form, tags })}
                suggestions={[...new Set([...(defaultIndustryTags[form.industry] || []), ...uniqueTags])].filter((t) => !form.tags.includes(t))}
                placeholder={t("common.tagPlaceholder")}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowCreate(false); setLivePredict(null); }}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Comments Dialog */}
      <Dialog open={showComments} onOpenChange={setShowComments}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("bids.commentsTitle", { id: selected?.bidId })}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {selected?.comments?.length > 0 ? (
              selected.comments.map((c, i) => {
                const canDelete = c.author === user?.name || user?.role === "Admin";
                return (
                  <div key={i} className="flex gap-2 p-2 rounded-md bg-muted/30">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {c.author?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{c.author}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(c.date), "MMM dd, h:mm a")}
                          </span>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-destructive"
                              onClick={() => handleDeleteComment(c._id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm mt-0.5 break-words">{c.text}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">{t("bids.noComments")}</p>
            )}
          </div>
          <form onSubmit={addComment} className="flex gap-2">
            <Input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("bids.addCommentPlaceholder")}
            />
            <Button type="submit" size="icon"><Send className="h-4 w-4" /></Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tags Dialog */}
      <Dialog open={showTags} onOpenChange={setShowTags}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.editTagsTitle", { id: selected?.bidId })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateTags} className="space-y-4">
            <TagInput
              tags={editTags}
              onChange={setEditTags}
              suggestions={[...new Set([...(defaultIndustryTags[selected?.industry] || []), ...uniqueTags])].filter((t) => !editTags.includes(t))}
              placeholder={t("common.tagPlaceholder")}
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setShowTags(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SHAP Explanation Modal */}
      <Dialog open={shapModal.open} onOpenChange={(o) => setShapModal({ ...shapModal, open: o })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <Brain className="h-5 w-5 text-primary" />
              <DialogTitle className="flex items-center gap-2">
                AI Prediction Breakdown
                <Badge variant={shapModal.value >= 70 ? "success" : shapModal.value >= 40 ? "warning" : "destructive"} className="font-mono">
                  {shapModal.value}%
                </Badge>
              </DialogTitle>
            </div>
            <DialogDescription className="font-mono text-xs">{shapModal.bidId}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {shapModal.explanations.length > 0 ? (
              shapModal.explanations.map((ex, i) => (
                <ShapBar key={i} explanation={ex} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No explanation data available for this bid.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShapModal({ ...shapModal, open: false })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
