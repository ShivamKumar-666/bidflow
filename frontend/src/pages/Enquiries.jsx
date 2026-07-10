import { useState, useEffect, useMemo, useCallback } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { formatDate } from "@/utils/date";
import { useTranslation } from "react-i18next";
import {
  Tag as TagIcon, Share2, Search, Filter, X, MessageSquare, Globe, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/TagInput";

const priorityVariants = {
  High: "destructive", Medium: "review", Low: "info",
};

const statusVariants = {
  "Under Review": "review", "Quotation Prepared": "info",
  "Order Received": "success", "Rejected": "destructive",
};

export default function Enquiries() {
  const { t } = useTranslation();
  const [enquiries, setEnquiries] = useState([]);
  const [uniqueTags, setUniqueTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState([]);
  const [sortBy, setSortBy] = useState("priority");
  const [editTags, setEditTags] = useState([]);

  const [form, setForm] = useState({
    customerName: "", contactInformation: "",
    productServiceRequired: "", priority: "Medium", notes: "", tags: [],
    negotiable: true, visibility: true, industry: "Technology",
  });

  const INDUSTRIES = ["Technology", "Healthcare", "Construction", "Energy", "Finance", "Banking", "Manufacturing", "Retail", "Other"];

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const enq = await api.get("/enquiries/");
      setEnquiries(Array.isArray(enq.data) ? enq.data : (enq.data.items || []));
    } catch {
      toast.error(t("enquiries.failedFetch"));
    }
    try {
      const tg = await api.get("/tags/");
      setUniqueTags(tg.data);
    } catch { /* ignore */
    }
    setLoading(false);
  }, [t]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetch(); }, [fetch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/enquiries/", { ...form, industry: form.industry, visibility: form.visibility ? "public" : "internal" });
      toast.success(t("enquiries.createSuccess"));
      setShowModal(false);
      setForm({ customerName: "", contactInformation: "", productServiceRequired: "", priority: "Medium", notes: "", tags: [], negotiable: true, visibility: true, industry: "Technology" });
      fetch();
    } catch (err) {
      toast.error(err.response?.data?.msg || t("enquiries.createFailed"));
    }
  };

  const handleUpdateTags = async (e) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await api.put(`/enquiries/${selected._id}`, { tags: editTags });
      toast.success("Tags updated");
      setShowTagsModal(false);
      fetch();
    } catch {
      toast.error("Failed to update tags");
    }
  };

  const share = useCallback(async (id) => {
    try {
      const res = await api.post(`/enquiries/${id}/share`);
      const url = `${window.location.origin}/share/${res.data.shareToken}`;
      await navigator.clipboard.writeText(url);
      toast.success(t("enquiries.shareSuccess", "Public link copied to clipboard!"));
    } catch {
      toast.error(t("enquiries.shareFailed", "Failed to generate share link"));
    }
  }, [t]);

  const toggleVisibility = async (id, currentVisibility) => {
    try {
      const newVisibility = currentVisibility === "public" ? "internal" : "public";
      await api.put(`/enquiries/${id}`, { visibility: newVisibility });
      toast.success(newVisibility === "public" ? "Listed on marketplace" : "Removed from marketplace");
      fetch();
    } catch {
      toast.error("Failed to update visibility");
    }
  };


  const removeFilter = (tag) => {
    setFilters((p) => p.filter((x) => x !== tag));
  };

  const filtered = useMemo(() => {
    let result = enquiries.filter((e) => {
      if (filters.length > 0 && !(e.tags || []).some((t) => filters.includes(t))) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          e.customerName?.toLowerCase().includes(s) ||
          e.productServiceRequired?.toLowerCase().includes(s) ||
          e.enquiryId?.toLowerCase().includes(s) ||
          (e.tags || []).some((t) => t.toLowerCase().includes(s))
        );
      }
      return true;
    });

    const priorityOrder = { High: 0, Medium: 1, Low: 2 };
    switch (sortBy) {
      case "priority":
        result.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
        break;
      case "date":
        result.sort((a, b) => new Date(b.date) - new Date(a.date));
        break;
      case "customer":
        result.sort((a, b) => (a.customerName || "").localeCompare(b.customerName || ""));
        break;
      case "status":
        result.sort((a, b) => (a.status || "").localeCompare(b.status || ""));
        break;
      default:
        break;
    }
    return result;
  }, [enquiries, filters, search, sortBy]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("enquiries.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} {t("enquiries.of", "of")} {enquiries.length} {t("enquiries.enquiries", "enquiries")}
          </p>
        </div>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogTrigger asChild>
            <Button>
              {t("enquiries.newEnquiry")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("enquiries.createTitle")}</DialogTitle>
              <DialogDescription>{t("enquiries.captureNew", "Capture a new customer enquiry.")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust">{t("enquiries.customerName")}</Label>
                <Input id="cust" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact">{t("enquiries.contactInfo")}</Label>
                <Input id="contact" required value={form.contactInformation} onChange={(e) => setForm({ ...form, contactInformation: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod">{t("enquiries.productServiceRequired")}</Label>
                <Input id="prod" required value={form.productServiceRequired} onChange={(e) => setForm({ ...form, productServiceRequired: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("enquiries.priority")}</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">{t("enquiries.low")}</SelectItem>
                    <SelectItem value="Medium">{t("enquiries.medium")}</SelectItem>
                    <SelectItem value="High">{t("enquiries.high")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("enquiries.industry", "Industry")}</Label>
                <Select value={form.industry} onValueChange={(v) => {
                  const cleaned = form.tags.filter((t) => !INDUSTRIES.includes(t.toLowerCase().charAt(0).toUpperCase() + t.slice(1)));
                  setForm({ ...form, industry: v, tags: [v.toLowerCase(), ...cleaned] });
                }}>
                  <SelectTrigger aria-label="Industry"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{t("enquiries.allowNegotiation", "Allow Negotiation")}</Label>
                  <p className="text-xs text-muted-foreground">{t("enquiries.negotiationDesc", "Bids on this enquiry can be negotiated")}</p>
                </div>
                <Switch checked={form.negotiable} onCheckedChange={(v) => setForm({ ...form, negotiable: v })} aria-label="Allow negotiation" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{t("enquiries.listMarketplace", "List on Marketplace")}</Label>
                  <p className="text-xs text-muted-foreground">{t("enquiries.marketplaceDesc", "Visible to bidders when enabled")}</p>
                </div>
                <Switch checked={form.visibility} onCheckedChange={(v) => setForm({ ...form, visibility: v })} aria-label="List on marketplace" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.tags")}</Label>
                <TagInput
                  tags={form.tags}
                  onChange={(tags) => setForm({ ...form, tags })}
                  suggestions={uniqueTags}
                  placeholder={t("common.tagPlaceholder")}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit">{t("common.save")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("enquiries.filter", "Filter")}</span>
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("enquiries.searchPlaceholder", "Search enquiries...")}
              className="ps-8 h-8"
              aria-label="Search enquiries"
            />
          </div>
          {uniqueTags.length > 0 && (
            <Select
              value=""
              onValueChange={(tag) => {
                if (tag && !filters.includes(tag)) setFilters((p) => [...p, tag]);
              }}
            >
              <SelectTrigger className="h-8 w-[160px]" aria-label="Filter by tag">
                <TagIcon className="h-3.5 w-3.5 me-1.5 text-muted-foreground" />
                <SelectValue placeholder={t("common.filterByTags", "Filter by tag")} />
              </SelectTrigger>
              <SelectContent>
                {uniqueTags.map((tag) => (
                  <SelectItem key={tag} value={tag} disabled={filters.includes(tag)}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[160px]" aria-label="Sort enquiries">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority (High First)</SelectItem>
              <SelectItem value="date">Date (Newest)</SelectItem>
              <SelectItem value="customer">Customer Name</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
          {filters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {filters.map((tg) => (
                <button
                  key={tg}
                  type="button"
                  onClick={() => removeFilter(tg)}
                  className="text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1 bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                >
                  {tg}
                  <X className="h-2.5 w-2.5" />
                </button>
              ))}
            </div>
          )}
          {(filters.length > 0 || search) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilters([]); setSearch(""); }} className="ms-auto">
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
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyIcon><MessageSquare className="h-5 w-5" /></EmptyIcon>
              <EmptyTitle>No enquiries found</EmptyTitle>
              <EmptyDescription>Create your first enquiry to get started.</EmptyDescription>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e._id}>
                    <TableCell>
                      <div className="font-mono text-xs font-semibold">{e.enquiryId}</div>
                      {e.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {e.tags.slice(0, 3).map((tg) => (
                            <Badge key={tg} variant="secondary" className="text-[10px] font-normal">{tg}</Badge>
                          ))}
                          {e.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{e.tags.length - 3}</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{e.customerName}</div>
                      <div className="text-xs text-muted-foreground">{e.contactInformation}</div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="truncate">{e.productServiceRequired}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityVariants[e.priority]}>{e.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[e.status] || "secondary"}>{e.status}</Badge>
                      {e.visibility === "public" ? (
                        <Badge variant="success" className="ms-1">Public</Badge>
                      ) : (
                        <Badge variant="secondary" className="ms-1">Private</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(new Date(e.date), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleVisibility(e._id, e.visibility)}
                          title={e.visibility === "public" ? "Remove from marketplace" : "List on marketplace"}
                          aria-label={e.visibility === "public" ? "Remove from marketplace" : "List on marketplace"}
                        >
                          {e.visibility === "public" ? (
                            <Globe className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setSelected(e); setEditTags(e.tags || []); setShowTagsModal(true); }}
                          aria-label="Edit tags"
                        >
                          <TagIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => share(e._id)}
                          aria-label="Share enquiry"
                        >
                          <Share2 className="h-3.5 w-3.5" />
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

      <Dialog open={showTagsModal} onOpenChange={setShowTagsModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.editTagsTitle", { id: selected?.enquiryId })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateTags} className="space-y-4">
            <TagInput
              tags={editTags}
              onChange={setEditTags}
              suggestions={uniqueTags}
              placeholder={t("common.tagPlaceholder")}
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setShowTagsModal(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
