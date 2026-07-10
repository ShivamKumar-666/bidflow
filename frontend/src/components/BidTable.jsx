import { memo } from "react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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

function isBidDeletableByBidder(bid) {
  if (bid.status === "Rejected") return true;
  const created = bid.createdAt;
  if (!created) return false;
  const createdDate = new Date(created);
  const daysSinceCreated = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
  return daysSinceCreated >= 30;
}

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
              Constraint Analysis
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
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onExplain} aria-label="Explain prediction">
          <Info className="h-3 w-3 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

const BidTable = memo(function BidTable({
  filtered, loading, fmt,
  search, setSearch, sortBy, setSortBy,
  industryFilters, setIndustryFilters,
  dateFilter, setDateFilter,
  groupByProject, setGroupByProject,
  handleSearchKeyDown, removeIndustryFilter, clearFilters,
  updateStatus, downloadQuotation, handleDelete,
  onOpenComments, onOpenTags, onExplain,
  userRole,
}) {
  const { t } = useTranslation();

  return (
    <>
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filter</span>
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search or type an industry + Enter..."
              className="ps-8 h-8"
              aria-label="Search bids"
            />
          </div>
          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[190px]" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deadline">{t("bids.sortDeadline", "Deadline (Urgent First)")}</SelectItem>
              <SelectItem value="amount">{t("bids.sortAmount", "Amount (Highest)")}</SelectItem>
              <SelectItem value="employee">{t("bids.sortEmployee", "Assigned Employee")}</SelectItem>
              <SelectItem value="industry">{t("bids.sortIndustry", "Industry")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Date filter */}
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger
              className={cn("h-8 w-[140px]", dateFilter !== "all" && "border-primary text-primary")}
              aria-label="Filter by date range"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("bids.dateAll", "All Time")}</SelectItem>
              <SelectItem value="7d">{t("bids.date7d", "Last 7 Days")}</SelectItem>
              <SelectItem value="30d">{t("bids.date30d", "Last 30 Days")}</SelectItem>
              <SelectItem value="90d">{t("bids.date90d", "Last 90 Days")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Industry multi-select */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={industryFilters.length > 0 ? "default" : "outline"}
                size="sm"
                className="h-8"
                aria-label="Filter by industry"
              >
                <Filter className="h-3.5 w-3.5" />
                {industryFilters.length > 0
                  ? t("bids.industriesSelected", "{{count}} Industries", { count: industryFilters.length })
                  : t("bids.filterIndustry", "Industry")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {["Technology", "Banking", "Manufacturing", "Retail", "Healthcare", "Construction", "Energy", "Finance", "Other"].map((ind) => {
                const active = industryFilters.includes(ind);
                return (
                  <DropdownMenuItem
                    key={ind}
                    onSelect={(e) => {
                      e.preventDefault();
                      setIndustryFilters((p) =>
                        active ? p.filter((x) => x !== ind) : [...p, ind]
                      );
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                    aria-checked={active}
                    role="menuitemcheckbox"
                  >
                    <span className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0",
                      active ? "bg-primary border-primary text-primary-foreground" : "border-input"
                    )}>
                      {active && "✓"}
                    </span>
                    {ind}
                  </DropdownMenuItem>
                );
              })}
              {industryFilters.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setIndustryFilters([]); }}
                    className="text-muted-foreground text-xs cursor-pointer"
                  >
                    {t("bids.clearIndustries", "Clear industries")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={() => setGroupByProject((p) => !p)}
            className={cn(
              "h-8 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground",
              groupByProject && "border-primary text-primary"
            )}
            aria-pressed={groupByProject}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            {t("bids.groupByProject", "Group by Project")}
          </button>
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
          {(industryFilters.length > 0 || search || dateFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="ms-auto">
              <X className="h-3.5 w-3.5" />
              {t("bids.clearAll", "Clear All")}
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
              <EmptyTitle>{t("bids.noBids", "No bids yet")}</EmptyTitle>
              <EmptyDescription>{t("bids.createFirstBid", "Create your first bid to get started.")}</EmptyDescription>
            </Empty>
          ) : groupByProject ? (
            (() => {
              const groups = {};
              filtered.forEach((bid) => {
                const key = bid.enquiryId || "Unknown";
                if (!groups[key]) groups[key] = [];
                groups[key].push(bid);
              });
              return (
                <div className="divide-y">
                  {Object.entries(groups).map(([enquiryId, groupBids]) => (
                    <div key={enquiryId} className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="outline" className="font-mono text-xs">{enquiryId}</Badge>
                        <span className="text-xs text-muted-foreground">{groupBids.length} {t("bids.bidCount", "bid", { count: groupBids.length })}</span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("bids.bidId", "Bid ID")}</TableHead>
                            <TableHead>{t("bids.amount", "Amount")}</TableHead>
                            <TableHead>{t("bids.aiPrediction", "AI Prediction")}</TableHead>
                            <TableHead>{t("bids.status", "Status")}</TableHead>
                            <TableHead>{t("bids.assigned", "Assigned")}</TableHead>
                            <TableHead className="text-end">{t("bids.actions", "Actions")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupBids.map((bid) => (
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
                              <TableCell className="font-semibold">{fmt(bid.amount, bid.currency)}</TableCell>
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
                                      <AlertTriangle className="h-2.5 w-2.5 me-0.5" />
                                      {t("bids.sla", "SLA")}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">{bid.assignedEmployee}</TableCell>
                              <TableCell className="text-end">
                                <div className="flex items-center justify-end gap-1">
                                  {userRole !== "Bidder" && (
                                    <Select value={bid.status} onValueChange={(v) => updateStatus(bid._id, v)}>
                                      <SelectTrigger className="h-7 w-[140px] text-xs" aria-label={`Status for bid ${bid.bidId}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {STATUSES.filter((s) => s !== "Negotiation" || bid.negotiable !== false).map((s) => (
                                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                  <Button variant="ghost" size="icon" onClick={() => onOpenComments(bid)} aria-label="View comments">
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </Button>
                                  {userRole !== "Bidder" && (
                                    <Button variant="ghost" size="icon" onClick={() => onOpenTags(bid)} aria-label="Manage tags">
                                      <Tag className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {bid.status === "Quotation Prepared" && (
                                    <Button variant="ghost" size="icon" onClick={() => downloadQuotation(bid._id, bid.bidId)} aria-label="Download quotation">
                                      <FileDown className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {(userRole !== "Bidder" || isBidDeletableByBidder(bid)) && (
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(bid._id, bid.bidId)} className="text-destructive hover:text-destructive" aria-label="Delete bid">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              );
            })()
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bids.bidId", "Bid ID")}</TableHead>
                  <TableHead>{t("bids.enquiryId", "Enquiry")}</TableHead>
                  <TableHead>{t("bids.amount", "Amount")}</TableHead>
                  <TableHead>{t("bids.aiPrediction", "AI Prediction")}</TableHead>
                  <TableHead>{t("bids.status", "Status")}</TableHead>
                  <TableHead>{t("bids.assigned", "Assigned")}</TableHead>
                  <TableHead className="text-end">{t("bids.actions", "Actions")}</TableHead>
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
                    <TableCell className="font-semibold">{fmt(bid.amount, bid.currency)}</TableCell>
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
                            <AlertTriangle className="h-2.5 w-2.5 me-0.5" />
                            {t("bids.sla", "SLA")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{bid.assignedEmployee}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        {userRole !== "Bidder" && (
                          <Select value={bid.status} onValueChange={(v) => updateStatus(bid._id, v)}>
                            <SelectTrigger className="h-7 w-[140px] text-xs" aria-label={`Status for bid ${bid.bidId}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.filter((s) => s !== "Negotiation" || bid.negotiable !== false).map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => onOpenComments(bid)} aria-label="View comments">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                        {userRole !== "Bidder" && (
                          <Button variant="ghost" size="icon" onClick={() => onOpenTags(bid)} aria-label="Manage tags">
                            <Tag className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {bid.status === "Quotation Prepared" && (
                          <Button variant="ghost" size="icon" onClick={() => downloadQuotation(bid._id, bid.bidId)} aria-label="Download quotation">
                            <FileDown className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(userRole !== "Bidder" || isBidDeletableByBidder(bid)) && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(bid._id, bid.bidId)} className="text-destructive hover:text-destructive" aria-label="Delete bid">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
