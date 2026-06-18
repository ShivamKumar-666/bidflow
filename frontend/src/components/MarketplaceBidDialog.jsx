import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Handshake, Ban, Loader2, FileText, FileDown, Download,
} from "lucide-react";
import api from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CURRENCIES, CURRENCY_SYMBOLS } from "@/utils/formatCurrency";

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

function getIndustryFromEnquiry(enquiry) {
  const tags = enquiry.tags || [];
  if (tags.length > 0) {
    for (const tag of tags) {
      if (INDUSTRY_TEAM_LIMITS[tag]) return tag;
    }
  }
  return "Other";
}

const MarketplaceBidDialog = ({ open, onOpenChange, enquiry, onSubmitSuccess }) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [remarks, setRemarks] = useState("");
  const [submissionDate, setSubmissionDate] = useState("");
  const [teamSize, setTeamSize] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [documents, setDocuments] = useState([]);
  const loadingDocsRef = useRef(false);
  const predictDebounce = useRef(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open && enquiry?.enquiryId) {
      loadingDocsRef.current = true;
      api.get(`/marketplace/${enquiry.enquiryId}`).then((res) => {
        setDocuments(res.data.documents || []);
      }).catch(() => {}).finally(() => { loadingDocsRef.current = false; });
    } else {
      setDocuments([]);
    }
  }, [open, enquiry]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const triggerLivePredict = useCallback((newAmount, newSubmissionDate) => {
    if (predictDebounce.current) clearTimeout(predictDebounce.current);
    if (!newAmount || parseFloat(newAmount) <= 0) {
      setPrediction(null);
      setPredictions(null);
      return;
    }

    predictDebounce.current = setTimeout(async () => {
      setLoadingPrediction(true);
      try {
        const industry = getIndustryFromEnquiry(enquiry);
        const res = await api.post("/bids/predict", {
          amount: parseFloat(newAmount),
          currency,
          submissionDate: newSubmissionDate || undefined,
          industry,
          teamSize: parseInt(teamSize) || 1,
          priority_encoded: enquiry.priority === "Critical" ? 3 : enquiry.priority === "High" ? 2 : enquiry.priority === "Medium" ? 1 : 0,
        });
        setPrediction(res.data.win_probability);
        setPredictions(res.data.shap_explanations || []);
      } catch (err) {
        console.error("Prediction failed", err);
      } finally {
        setLoadingPrediction(false);
      }
    }, 600);
  }, [enquiry, teamSize, currency]);

  if (!enquiry) return null;

  const resetForm = () => {
    setAmount("");
    setCurrency("USD");
    setRemarks("");
    setSubmissionDate("");
    setTeamSize("1");
    setPrediction(null);
    setPredictions(null);
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error(t("marketplace.amountRequired", "Bid amount is required"));
      return;
    }

    setSubmitting(true);
    try {
      const industry = getIndustryFromEnquiry(enquiry);
      await api.post(`/marketplace/${enquiry.enquiryId}/bid`, {
        amount: parseFloat(amount),
        currency,
        remarks,
        submissionDate: submissionDate || undefined,
        industry,
        teamSize: parseInt(teamSize) || 1,
      });
      toast.success(t("marketplace.bidSubmitted", "Bid submitted successfully!"));
      onSubmitSuccess();
      resetForm();
    } catch (err) {
      toast.error(err.response?.data?.msg || t("marketplace.bidFailed", "Failed to submit bid"));
    } finally {
      setSubmitting(false);
    }
  };

  const predColor = prediction !== null
    ? prediction >= 70 ? "text-emerald-500"
    : prediction >= 40 ? "text-amber-500"
    : "text-red-500"
    : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("marketplace.submitBid", "Submit Bid")}</DialogTitle>
          <DialogDescription>
            {enquiry.customerName} — {enquiry.productServiceRequired}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            {enquiry.negotiable === false ? (
              <Badge variant="destructive" className="gap-1">
                <Ban className="h-3 w-3" />
                {t("marketplace.fixedPrice", "Fixed Price")}
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1">
                <Handshake className="h-3 w-3" />
                {t("marketplace.negotiable", "Negotiable")}
              </Badge>
            )}
            <Badge variant="secondary">
              {enquiry.bidCount || 0} {t("marketplace.existingBids", "existing bids")}
            </Badge>
          </div>

          {documents.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Attached Documents ({documents.length})
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {documents.map((doc) => (
                    <div key={doc._id} className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/20">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs truncate">{doc.filename}</span>
                      </div>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                      >
                        <a
                          href={`${import.meta.env.VITE_API_BASE_URL}/api/v1/documents/download/${doc._id}`}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">{t("marketplace.bidAmount", "Bid Amount")} *</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  const newAmount = e.target.value;
                  setAmount(newAmount);
                  triggerLivePredict(newAmount, submissionDate);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="submissionDate">{t("marketplace.submissionDate", "Submission Date")}</Label>
            <Input
              id="submissionDate"
              type="date"
              value={submissionDate}
              onChange={(e) => {
                const newDate = e.target.value;
                setSubmissionDate(newDate);
                triggerLivePredict(amount, newDate);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="teamSize">{t("marketplace.teamSize", "Team Size")} (people)</Label>
            <Input
              id="teamSize"
              type="number"
              min="1"
              max={INDUSTRY_TEAM_LIMITS[getIndustryFromEnquiry(enquiry)] || 50}
              value={teamSize}
              onChange={(e) => {
                const val = e.target.value;
                const maxVal = INDUSTRY_TEAM_LIMITS[getIndustryFromEnquiry(enquiry)] || 50;
                if (val === "" || (parseInt(val) >= 1 && parseInt(val) <= maxVal)) {
                  setTeamSize(val);
                }
              }}
              placeholder={`1 - ${INDUSTRY_TEAM_LIMITS[getIndustryFromEnquiry(enquiry)] || 50}`}
            />
            <p className="text-xs text-muted-foreground">
              Max {INDUSTRY_TEAM_LIMITS[getIndustryFromEnquiry(enquiry)] || 50} for {getIndustryFromEnquiry(enquiry)} industry
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">{t("marketplace.remarks", "Remarks")}</Label>
            <Textarea
              id="remarks"
              placeholder={t("marketplace.remarksPlaceholder", "Describe your proposal...")}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
            />
          </div>

          {loadingPrediction && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Calculating prediction...
            </div>
          )}

          {prediction !== null && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("marketplace.winProbability", "Win Probability")}</span>
                <span className={cn("text-lg font-bold", predColor)}>
                  {Math.round(prediction)}%
                </span>
              </div>
              {predictions && predictions.length > 0 && (
                <div className="space-y-1">
                  {predictions.slice(0, 5).map((exp, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[60%]">{exp.text}</span>
                      <span className={cn(
                        "font-medium",
                        exp.impact === "positive" ? "text-emerald-500" : "text-red-500"
                      )}>
                        {exp.shap_value > 0 ? "+" : ""}{exp.shap_value}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !amount}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("marketplace.submitBid", "Submit Bid")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MarketplaceBidDialog;
