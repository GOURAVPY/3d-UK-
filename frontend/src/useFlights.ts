import { useEffect, useState } from "react";
import { socket } from "./socket";
import type { Flight } from "./types";

// Live aircraft from the server, pushed every 10 s.
export function useFlights() {
  const [flights, setFlights] = useState<Flight[]>([]);
  useEffect(() => {
    const s = socket();
    const onFlights = (f: Flight[]) => setFlights(f);
    s.on("flights", onFlights);
    return () => void s.off("flights", onFlights);
  }, []);
  return flights;
}
