import { useState, useEffect, useCallback } from "react";
import api from "@/services/api";

export default function useMarketplace() {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("-date");
  const [industryFilter, setIndustryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const fetchMarketplace = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        size: "20",
        sort,
      });
      if (search) params.set("search", search);
      if (industryFilter) params.set("industry", industryFilter);
      if (priorityFilter) params.set("priority", priorityFilter);

      const res = await api.get(`/marketplace/?${params}`);
      setEnquiries(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error("Failed to fetch marketplace", err);
    } finally {
      setLoading(false);
    }
  }, [page, sort, search, industryFilter, priorityFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchMarketplace();
  }, [fetchMarketplace]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    enquiries,
    loading,
    total,
    page,
    setPage,
    search,
    setSearch,
    sort,
    setSort,
    industryFilter,
    setIndustryFilter,
    priorityFilter,
    setPriorityFilter,
    refetch: fetchMarketplace,
  };
}
