import React, { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Tag, MessageSquare, FileDown, Trash2, Brain, TrendingUp, TrendingDown,
  Minus, Info, X, Search, Filter, AlertTriangle, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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

  if (!explanations || explanations.length === 0) return Pill;

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

const BidTable = memo(function BidTable({
  filtered, bids, loading, fmt,
  search, setSearch, sortBy, setSortBy,
  industryFilters, setIndustryFilters,
  handleSearchKeyDown, removeIndustryFilter, clearFilters,
  updateStatus, downloadQuotation, handleDelete,
  onOpenComments, onOpenTags, onExplain,
}) {
  const { t } = useTranslation();
  const [sortOpen, setSortOpen] = useState(false);
  const [industryHover, setIndustryHover] = useState(false);

  return (
    <>
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
            <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
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
                        onExplain={onExplain ? () => onExplain(bid) : null}
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
                            {STATUSES.filter((s) => s !== "Negotiation" || bid.negotiable !== false).map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => onOpenComments(bid)}>
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onOpenTags(bid)}>
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
    </>
  );
});

export default BidTable;
