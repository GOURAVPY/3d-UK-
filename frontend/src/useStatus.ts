import { useEffect, useState } from "react";
import { socket } from "./socket";
import type { LineStatus } from "./types";

// Line service status, pushed by the server every 2 minutes.
export function useStatus() {
  const [status, setStatus] = useState<LineStatus[]>([]);
  useEffect(() => {
    const s = socket();
    const onStatus = (st: LineStatus[]) => setStatus(st);
    s.on("status", onStatus);
    return () => void s.off("status", onStatus);
  }, []);
  return status;
}
