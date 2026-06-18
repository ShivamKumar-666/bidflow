import { useState, useEffect, useCallback } from "react";
import api from "@/services/api";

export function useUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/auth/users");
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { users, loading, refetch: fetchUsers };
}
