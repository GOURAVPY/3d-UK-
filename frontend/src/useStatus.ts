import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { LineStatus } from "./types";

// Line service status, pushed by the server every 2 minutes.
export function useStatus() {
  const [status, setStatus] = useState<LineStatus[]>([]);
  useEffect(() => {
    const socket = io();
    socket.on("status", (s: LineStatus[]) => setStatus(s));
    return () => void socket.close();
  }, []);
  return status;
}
