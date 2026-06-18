import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "@/services/api";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const socket = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!user?._id) {
      setNotifications([]);
      return;
    }

    const fetchNotifications = async () => {
      setLoading(true);
      try {
        const res = await api.get("/notifications/");
        setNotifications(res.data);
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to fetch notifications", err);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
  }, [user?._id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!socket) return;

    const handleNotification = (newNotif) => {
      setNotifications((prev) => [newNotif, ...prev]);
    };

    socket.on("notification", handleNotification);

    return () => {
      socket.off("notification", handleNotification);
    };
  }, [socket]);

  const markAsRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      if (import.meta.env.DEV) console.error("Failed to mark notification as read", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      if (import.meta.env.DEV) console.error("Failed to mark all notifications as read", err);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch (err) {
      if (import.meta.env.DEV) console.error("Failed to delete notification", err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, loading }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => useContext(NotificationContext);
