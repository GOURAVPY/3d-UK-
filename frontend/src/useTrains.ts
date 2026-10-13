import { useEffect, useState } from "react";
import { socket } from "./socket";
import type { Train } from "./types";

// Live trains from the server. Vite proxies /socket.io to the backend.
export function useTrains() {
  const [trains, setTrains] = useState<Train[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  useEffect(() => {
    const s = socket();
    const onTrains = (t: Train[]) => {
      setTrains(t);
      setUpdatedAt(new Date());
    };
    s.on("trains", onTrains);
    return () => void s.off("trains", onTrains);
  }, []);
  return { trains, updatedAt };
}
