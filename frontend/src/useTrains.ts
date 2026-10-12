import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { Train } from "./types";

// Live trains from the server. Vite proxies /socket.io to the backend.
export function useTrains() {
  const [trains, setTrains] = useState<Train[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  useEffect(() => {
    const socket = io();
    socket.on("trains", (t: Train[]) => {
      setTrains(t);
      setUpdatedAt(new Date());
    });
    return () => void socket.close();
  }, []);
  return { trains, updatedAt };
}
