import React, { useRef, useCallback, useState } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TagInput } from "@/components/TagInput";
import LivePrediction from "./LivePrediction";
import { defaultIndustryTags } from "@/hooks/useBids";

const INDUSTRY_TEAM_LIMITS = {
  Technology: 50,
  Healthcare: 30,
  Construction: 100,
  Energy: 40,
  Finance: 25,
  Banking: 25,
  Manufacturing: 100,
  Retail: 40,
  Other: 50,
};

export default function CreateBidDialog({ open, onOpenChange, enquiries, uniqueTags, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    enquiryId: "", amount: "", industry: "Technology",
    submissionDate: "", assignedEmployee: "", teamSize: "1", remarks: "", tags: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [livePredict, setLivePredict] = useState(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const predictDebounce = useRef(null);

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
          submissionDate: data.submissionDate,
          industry: data.industry,
          assignedEmployee: data.assignedEmployee,
          teamSize: parseInt(data.teamSize) || 1,
          priority_encoded: 1,
        });
        setLivePredict(res.data);
      } catch {
        setLivePredict(null);
      } finally {
        setPredictLoading(false);
      }
    }, 600);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.post("/bids/", { ...form, teamSize: parseInt(form.teamSize) || 1 });
      toast.success(t("bids.createSuccess"));
      onOpenChange(false);
      setLivePredict(null);
      setForm({ enquiryId: "", amount: "", industry: "Technology", submissionDate: "", assignedEmployee: "", teamSize: "1", remarks: "", tags: [] });
      onCreated();
    } catch {
      toast.error(t("bids.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (o) => {
    onOpenChange(o);
    if (!o) {
      setLivePredict(null);
      setForm({ enquiryId: "", amount: "", industry: "Technology", submissionDate: "", assignedEmployee: "", teamSize: "1", remarks: "", tags: [] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("bids.createTitle")}</DialogTitle>
          <DialogDescription>Build a new bid against an existing enquiry.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
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
              <Label>{t("bids.teamSize", "Team Size")} (people)</Label>
              <Input
                type="number"
                min="1"
                max={INDUSTRY_TEAM_LIMITS[form.industry] || 50}
                value={form.teamSize}
                onChange={(e) => {
                  const val = e.target.value;
                  const maxVal = INDUSTRY_TEAM_LIMITS[form.industry] || 50;
                  if (val === "" || (parseInt(val) >= 1 && parseInt(val) <= maxVal)) {
                    const updated = { ...form, teamSize: val };
                    setForm(updated);
                    triggerLivePredict(updated);
                  }
                }}
                placeholder={`1 - ${INDUSTRY_TEAM_LIMITS[form.industry] || 50}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("bids.clientIndustry")}</Label>
              <Select value={form.industry} onValueChange={(v) => {
                const updated = { ...form, industry: v, teamSize: "1" };
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
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
