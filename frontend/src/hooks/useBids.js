import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const defaultIndustryTags = {
  Technology: ["software", "saas", "hardware", "consulting", "cloud", "devops", "cybersecurity"],
  Banking: ["loan", "credit", "securities", "compliance", "fintech", "retail-banking", "asset-management"],
  Manufacturing: ["machinery", "materials", "logistics", "supply-chain", "automotive", "quality-control"],
  Retail: ["e-commerce", "inventory", "merchandising", "pos", "supply-chain", "customer-loyalty"],
  Healthcare: ["medical-devices", "pharma", "compliance", "telehealth", "clinical-trials", "patient-care"],
  Other: ["general", "consulting", "services", "miscellaneous"],
};

export { defaultIndustryTags };

export function useBids() {
  const { t, i18n } = useTranslation();
  const [bids, setBids] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [uniqueTags, setUniqueTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("deadline");
  const [industryFilters, setIndustryFilters] = useState([]);

  const fetchAll = useCallback(async () => {
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
  }, [t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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

  const clearFilters = () => {
    setIndustryFilters([]);
    setSearch("");
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

  return {
    bids, setBids,
    enquiries, setEnquiries,
    uniqueTags,
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
  };
}
