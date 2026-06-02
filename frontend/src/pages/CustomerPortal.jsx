import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  FileText, Download, AlertTriangle, Clock, User, Briefcase, Calendar,
  Hash, FileDown, Activity, ShieldCheck,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STATUS_MAP = {
  "Order Received": "success",
  "Completed": "success",
  "Approved": "success",
  "Rejected": "destructive",
  "Lost": "destructive",
  "Submitted": "info",
  "Negotiation": "info",
  "Quotation Prepared": "info",
  "Under Review": "review",
};

const statusTone = (status) => STATUS_MAP[status] || "secondary";

const CustomerPortal = () => {
  const { token } = useParams();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchPublicData = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`http://localhost:5000/api/enquiries/public/share/${token}`);
        setData(res.data);
        setError(null);
      } catch (err) {
        if (err.response && err.response.status === 403) {
          setError(t("common.linkExpired", "This share link has expired. Links are valid for 90 days."));
        } else {
          setError(t("common.error", "Invalid share link or enquiry not found."));
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPublicData();
  }, [token, t]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="p-8 space-y-4">
            <Skeleton className="h-12 w-12 rounded-full mx-auto" />
            <Skeleton className="h-5 w-3/4 mx-auto" />
            <Skeleton className="h-3 w-1/2 mx-auto" />
            <div className="space-y-2 pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="p-8 text-center space-y-3">
            <div className="h-16 w-16 rounded-full bg-destructive/10 text-destructive grid place-items-center mx-auto">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">Access Denied</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground pt-2">
              Please contact your Sales representative to request a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { enquiry, bid, documents } = data || {};
  const currentStatus = bid?.status || enquiry?.status;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-500">
        <div className="text-center space-y-2 pb-2">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-chart-2 text-primary-foreground grid place-items-center shadow-md">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">BidFlow</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("common.portalTitle", "Customer Status Portal")}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            {t("common.portalSubtitle", "Track your proposal status and access relevant files.")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  {t("enquiries.customer", "Customer Details")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  icon={Briefcase}
                  label={t("enquiries.customerName", "Company Name")}
                  value={enquiry?.customerName}
                />
                <InfoRow
                  icon={Activity}
                  label={t("enquiries.productServiceRequired", "Requested Service")}
                  value={enquiry?.productServiceRequired}
                />
                <InfoRow
                  icon={Hash}
                  label={t("enquiries.id", "Enquiry ID")}
                  value={enquiry?.enquiryId}
                  mono
                />
                <InfoRow
                  icon={Calendar}
                  label={t("enquiries.date", "Request Date")}
                  value={enquiry?.date ? format(new Date(enquiry.date), "MMM dd, yyyy") : "N/A"}
                />
                <Separator />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    {t("enquiries.status", "Current Status")}
                  </span>
                  <Badge variant={statusTone(currentStatus)} className="text-sm px-3 py-1">
                    {currentStatus}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  {t("common.timeline", "Status Timeline")}
                </CardTitle>
                <CardDescription>Track every update to your proposal</CardDescription>
              </CardHeader>
              <CardContent>
                {bid?.history && bid.history.length > 0 ? (
                  <ol className="relative space-y-4 ms-3">
                    {bid.history.map((h, i) => (
                      <li key={i} className="relative ps-7">
                        {i < bid.history.length - 1 && (
                          <span className="absolute start-3 top-5 bottom-0 w-px bg-border" />
                        )}
                        <span
                          className={cn(
                            "absolute start-0 top-0.5 h-6 w-6 rounded-full grid place-items-center border-2",
                            i === bid.history.length - 1
                              ? "bg-primary border-primary text-primary-foreground"
                              : "bg-background border-border text-muted-foreground"
                          )}
                        >
                          <span className="h-2 w-2 rounded-full bg-current" />
                        </span>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant={statusTone(h.status)}>{h.status}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(h.date), "MMM dd, yyyy h:mm a")}
                          </span>
                        </div>
                        {h.note && (
                          <p className="text-sm text-muted-foreground">{h.note}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ol className="relative ms-3">
                    <li className="relative ps-7">
                      <span className="absolute start-0 top-0.5 h-6 w-6 rounded-full grid place-items-center bg-primary text-primary-foreground">
                        <span className="h-2 w-2 rounded-full bg-current" />
                      </span>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant={statusTone(enquiry?.status)}>{enquiry?.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {enquiry?.date ? format(new Date(enquiry.date), "MMM dd, yyyy") : ""}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Your enquiry is currently under review by our sales engineering team.
                      </p>
                    </li>
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {t("common.documents", "Shared Documents")}
                </CardTitle>
                <CardDescription>Files available for download</CardDescription>
              </CardHeader>
              <CardContent>
                {documents && documents.length > 0 ? (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc._id}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center flex-shrink-0">
                            <FileDown className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {t("enquiries.date", "Uploaded")}: {format(new Date(doc.uploadDate), "MMM dd, yyyy")}
                            </p>
                          </div>
                        </div>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                        >
                          <a
                            href={`http://localhost:5000/api/enquiries/public/share/${token}/download/${doc._id}`}
                            download
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center rounded-lg border border-dashed bg-muted/20">
                    <div className="h-12 w-12 rounded-full bg-muted grid place-items-center mx-auto mb-2">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No documents have been shared for public view yet.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoRow = ({ icon: Icon, label, value, mono = false }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <span className={cn("text-sm font-medium text-right truncate max-w-[60%]", mono && "font-mono")}>
      {value || "—"}
    </span>
  </div>
);

export default CustomerPortal;
