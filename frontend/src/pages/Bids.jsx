import React, { useState, useRef, useCallback, useEffect } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { cn } from "@/lib/utils";
import { useBids } from "@/hooks/useBids";
import BidTable from "@/components/BidTable";
import CreateBidDialog from "@/components/CreateBidDialog";
import CommentsDialog from "@/components/CommentsDialog";
import TagsDialog from "@/components/TagsDialog";

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

export default function Bids() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const socketRef = useSocket();

  const {
    bids, setBids,
    enquiries, uniqueTags,
    loading,
    search, setSearch,
    sortBy, setSortBy,
    industryFilters, setIndustryFilters,
    filtered,
    fetchAll,
    handleSearchKeyDown,
    removeIndustryFilter,
    clearFilters,
    fmt,
  } = useBids();

  const [showCreate, setShowCreate] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [selected, setSelected] = useState(null);
  const [shapModal, setShapModal] = useState({ open: false, bidId: "", value: 0, explanations: [] });
  const predictDebounce = useRef(null);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

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
      socket.off("new_comment");
      socket.off("delete_comment");
      if (predictDebounce.current) {
        clearTimeout(predictDebounce.current);
        predictDebounce.current = null;
      }
    };
  }, [socketRef, setBids]);

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
    let url;
    try {
      const res = await api.get(`/bids/${id}/quotation`, { responseType: "blob" });
      url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `quotation_${bidId}.pdf`;
      a.click();
      toast.success("Quotation exported");
    } catch {
      toast.error("Failed to export quotation");
    } finally {
      if (url) window.URL.revokeObjectURL(url);
    }
  };

  const handleOpenComments = (bid) => {
    setSelected(bid);
    setShowComments(true);
  };

  const handleOpenTags = (bid) => {
    setSelected(bid);
    setShowTags(true);
  };

  const handleExplain = (bid) => {
    setShapModal({
      open: true,
      bidId: bid.bidId,
      value: bid.aiPrediction || 0,
      explanations: bid.shapExplanations || [],
    });
  };

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

      <BidTable
        filtered={filtered}
        bids={bids}
        loading={loading}
        fmt={fmt}
        search={search}
        setSearch={setSearch}
        sortBy={sortBy}
        setSortBy={setSortBy}
        industryFilters={industryFilters}
        setIndustryFilters={setIndustryFilters}
        handleSearchKeyDown={handleSearchKeyDown}
        removeIndustryFilter={removeIndustryFilter}
        clearFilters={clearFilters}
        updateStatus={updateStatus}
        downloadQuotation={downloadQuotation}
        handleDelete={handleDelete}
        onOpenComments={handleOpenComments}
        onOpenTags={handleOpenTags}
        onExplain={handleExplain}
      />

      <CreateBidDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        enquiries={enquiries}
        uniqueTags={uniqueTags}
        onCreated={fetchAll}
      />

      <CommentsDialog
        open={showComments}
        onOpenChange={setShowComments}
        selected={selected}
        user={user}
        onCommentChange={fetchAll}
      />

      <TagsDialog
        open={showTags}
        onOpenChange={setShowTags}
        selected={selected}
        uniqueTags={uniqueTags}
        onTagsUpdated={fetchAll}
      />

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
