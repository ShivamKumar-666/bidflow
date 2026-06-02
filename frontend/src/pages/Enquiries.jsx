import React, { useState, useEffect } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  Plus, Tag as TagIcon, Share2, Search, Filter, X, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger, DialogClose,
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
import { cn } from "@/lib/utils";

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
  const [editTags, setEditTags] = useState([]);

  const [form, setForm] = useState({
    customerName: "", contactInformation: "",
    productServiceRequired: "", priority: "Medium", notes: "", tags: [],
  });

  const fetch = async () => {
    setLoading(true);
    try {
      const [enq, tg] = await Promise.all([
        api.get("/enquiries/"),
        api.get("/tags/"),
      ]);
      setEnquiries(enq.data);
      setUniqueTags(tg.data);
    } catch {
      toast.error(t("enquiries.failedFetch"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/enquiries/", form);
      toast.success(t("enquiries.createSuccess"));
      setShowModal(false);
      setForm({ customerName: "", contactInformation: "", productServiceRequired: "", priority: "Medium", notes: "", tags: [] });
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

  const share = async (id) => {
    try {
      const res = await api.post(`/enquiries/${id}/share`);
      const url = `${window.location.origin}/share/${res.data.shareToken}`;
      await navigator.clipboard.writeText(url);
      toast.success(t("enquiries.shareSuccess", "Public link copied to clipboard!"));
    } catch {
      toast.error(t("enquiries.shareFailed", "Failed to generate share link"));
    }
  };

  const filtered = enquiries.filter((e) => {
    if (filters.length > 0 && !(e.tags || []).some((t) => filters.includes(t))) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        e.customerName?.toLowerCase().includes(s) ||
        e.productServiceRequired?.toLowerCase().includes(s) ||
        e.enquiryId?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const toggleFilter = (t) => {
    setFilters((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("enquiries.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} of {enquiries.length} enquiries
          </p>
        </div>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              {t("enquiries.newEnquiry")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("enquiries.createTitle")}</DialogTitle>
              <DialogDescription>Capture a new customer enquiry.</DialogDescription>
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">{t("enquiries.low")}</SelectItem>
                    <SelectItem value="Medium">{t("enquiries.medium")}</SelectItem>
                    <SelectItem value="High">{t("enquiries.high")}</SelectItem>
                  </SelectContent>
                </Select>
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

      {uniqueTags.length > 0 && (
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filter</span>
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-8 h-8"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {uniqueTags.slice(0, 20).map((tg) => (
                <button
                  key={tg}
                  type="button"
                  onClick={() => toggleFilter(tg)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    filters.includes(tg)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/30 border-border hover:bg-muted"
                  )}
                >
                  {tg}
                </button>
              ))}
            </div>
            {filters.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setFilters([])} className="ml-auto">
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </CardContent>
        </Card>
      )}

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
                  <TableHead className="text-right">Actions</TableHead>
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
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(e.date), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setSelected(e); setEditTags(e.tags || []); setShowTagsModal(true); }}
                        >
                          <TagIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => share(e._id)}
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
