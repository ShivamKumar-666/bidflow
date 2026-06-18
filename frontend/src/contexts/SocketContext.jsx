import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!user?._id) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const newSocket = io(import.meta.env.VITE_SOCKET_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    newSocket.on("connect", () => {
      newSocket.emit("join", { room: `user_${user._id}` });
    });

    if (import.meta.env.DEV) {
      newSocket.on("connect_error", (err) => {
        console.debug("Socket connection error:", err.message);
      });
      newSocket.on("disconnect", (reason) => {
        console.debug("Socket disconnected:", reason);
      });
    }

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (ctx === undefined) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
};
