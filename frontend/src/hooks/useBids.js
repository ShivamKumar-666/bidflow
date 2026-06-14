import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import api from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const defaultIndustryTags = {
  Technology: ["software", "saas", "hardware", "consulting", "cloud", "devops", "cybersecurity"],
  Healthcare: ["medical-devices", "pharma", "compliance", "telehealth", "clinical-trials", "patient-care"],
  Construction: ["building", "infrastructure", "civil", "electrical", "plumbing", "structural"],
  Energy: ["oil-gas", "renewables", "utilities", "solar", "wind", "power-grid"],
  Finance: ["accounting", "auditing", "tax", "advisory", "wealth-management", "insurance"],
  Banking: ["loan", "credit", "securities", "compliance", "fintech", "retail-banking", "asset-management"],
  Manufacturing: ["machinery", "materials", "logistics", "supply-chain", "automotive", "quality-control"],
  Retail: ["e-commerce", "inventory", "merchandising", "pos", "supply-chain", "customer-loyalty"],
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
  const [dateFilter, setDateFilter] = useState("all");
  const [groupByProject, setGroupByProject] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const b = await api.get("/bids/");
      setBids(Array.isArray(b.data) ? b.data : (b.data.items || []));
    } catch {
      toast.error(t("bids.failedFetch"));
    }
    try {
      const e = await api.get("/enquiries/");
      setEnquiries(Array.isArray(e.data) ? e.data : (e.data.items || []));
    } catch {
    }
    try {
      const tg = await api.get("/tags/");
      setUniqueTags(tg.data);
    } catch {
    }
    setLoading(false);
  }, [t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = search.trim().toLowerCase();
      if (!val) return;
      const industries = ["Technology", "Healthcare", "Construction", "Energy", "Finance", "Banking", "Manufacturing", "Retail", "Other"];
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
    setDateFilter("all");
  };

  const fmt = (n) => new Intl.NumberFormat(i18n.language || "en-US", { style: "currency", currency: "USD" }).format(n);

  const filtered = useMemo(() => {
    let result = bids.filter((b) => {
      if (industryFilters.length > 0 && !industryFilters.includes(b.industry)) return false;
      if (dateFilter !== "all") {
        const now = Date.now();
        const created = new Date(b.createdAt || b.history?.[0]?.date || 0).getTime();
        const daysMap = { "7d": 7, "30d": 30, "90d": 90 };
        const days = daysMap[dateFilter] || 30;
        if (now - created > days * 86400000) return false;
      }
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
  }, [bids, search, sortBy, industryFilters, dateFilter]);

  return {
    bids, setBids,
    enquiries, setEnquiries,
    uniqueTags,
    loading,
    search, setSearch,
    sortBy, setSortBy,
    industryFilters, setIndustryFilters,
    dateFilter, setDateFilter,
    groupByProject, setGroupByProject,
    filtered,
    fetchAll,
    handleSearchKeyDown,
    removeIndustryFilter,
    clearFilters,
    fmt,
  };
}
