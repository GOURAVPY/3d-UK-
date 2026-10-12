import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { Flight } from "./types";

// Live aircraft from the server, pushed every 10 s.
export function useFlights() {
  const [flights, setFlights] = useState<Flight[]>([]);
  useEffect(() => {
    const socket = io();
    socket.on("flights", (f: Flight[]) => setFlights(f));
    return () => void socket.close();
  }, []);
  return flights;
}
