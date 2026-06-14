import React, { useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, Filter, Clock, DollarSign, Users, ArrowUpDown,
  Handshake, Ban, Tag, ChevronRight, Loader2,
} from "lucide-react";
import { AuthContext } from "@/contexts/AuthContext";
import useMarketplace from "@/hooks/useMarketplace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import MarketplaceBidDialog from "@/components/MarketplaceBidDialog";

const priorityColors = {
  Low: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  Medium: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  High: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Critical: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const Marketplace = () => {
  const { t } = useTranslation();
  const { user } = useContext(AuthContext);
  const {
    enquiries, loading, total, page, setPage,
    search, setSearch, sort, setSort,
    priorityFilter, setPriorityFilter,
    industryFilter, setIndustryFilter,
    refetch,
  } = useMarketplace();

  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [bidDialogOpen, setBidDialogOpen] = useState(false);

  const isBidder = user?.role === "Bidder";
  const totalPages = Math.ceil(total / 20);

  const handleBidClick = (enquiry) => {
    setSelectedEnquiry(enquiry);
    setBidDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("marketplace.title", "Marketplace")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("marketplace.subtitle", "Browse public enquiries and submit competitive bids")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("marketplace.searchPlaceholder", "Search enquiries...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("marketplace.allPriorities", "All Priorities")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("marketplace.allPriorities", "All Priorities")}</SelectItem>
            <SelectItem value="Low">{t("priority.low", "Low")}</SelectItem>
            <SelectItem value="Medium">{t("priority.medium", "Medium")}</SelectItem>
            <SelectItem value="High">{t("priority.high", "High")}</SelectItem>
            <SelectItem value="Critical">{t("priority.critical", "Critical")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={industryFilter || "all"} onValueChange={(v) => setIndustryFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("marketplace.allIndustries", "All Industries")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("marketplace.allIndustries", "All Industries")}</SelectItem>
            <SelectItem value="Technology">Technology</SelectItem>
            <SelectItem value="Healthcare">Healthcare</SelectItem>
            <SelectItem value="Construction">Construction</SelectItem>
            <SelectItem value="Energy">Energy</SelectItem>
            <SelectItem value="Finance">Finance</SelectItem>
            <SelectItem value="Banking">Banking</SelectItem>
            <SelectItem value="Manufacturing">Manufacturing</SelectItem>
            <SelectItem value="Retail">Retail</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[160px]">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-date">{t("marketplace.newest", "Newest First")}</SelectItem>
            <SelectItem value="date">{t("marketplace.oldest", "Oldest First")}</SelectItem>
            <SelectItem value="-bidCount">{t("marketplace.mostBids", "Most Bids")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto text-sm text-muted-foreground">
          {total} {t("marketplace.enquiries", "enquiries")}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : enquiries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">{t("marketplace.noEnquiries", "No public enquiries yet")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("marketplace.noEnquiriesHint", "Check back later or contact your admin")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {enquiries.map((enq) => (
              <Card
                key={enq._id}
                className="group hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
                onClick={() => handleBidClick(enq)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold leading-tight line-clamp-2">
                      {enq.customerName}
                    </CardTitle>
                    <Badge className={cn("shrink-0 text-[10px]", priorityColors[enq.priority] || priorityColors.Medium)}>
                      {enq.priority}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-1">
                    {enq.enquiryId}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {enq.productServiceRequired}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(enq.tags || []).slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">
                        <Tag className="h-2.5 w-2.5 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {enq.bidCount || 0} {t("marketplace.bids", "bids")}
                      </span>
                      <span className={cn(
                        "flex items-center gap-1",
                        enq.negotiable === false ? "text-red-500" : "text-emerald-500"
                      )}>
                        {enq.negotiable === false ? (
                          <><Ban className="h-3 w-3" /> {t("marketplace.fixedPrice", "Fixed")}</>
                        ) : (
                          <><Handshake className="h-3 w-3" /> {t("marketplace.negotiable", "Negotiable")}</>
                        )}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {t("common.previous", "Previous")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                {t("common.next", "Next")}
              </Button>
            </div>
          )}
        </>
      )}

      <MarketplaceBidDialog
        open={bidDialogOpen}
        onOpenChange={setBidDialogOpen}
        enquiry={selectedEnquiry}
        onSubmitSuccess={() => {
          refetch();
          setBidDialogOpen(false);
        }}
      />
    </div>
  );
};

export default Marketplace;
