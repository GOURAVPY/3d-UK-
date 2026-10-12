import { tfl } from "./tfl.js";

export interface LineStatus {
  lineId: string;
  lineName: string;
  severity: number; // TfL: 10 good service, 9 minor delays, 6 severe delays, 1 closed ...
  text: string; // "Minor Delays"
  reason: string; // TfL's own explanation, empty when all is well
}

interface Raw {
  id: string;
  name: string;
  lineStatuses: { statusSeverity: number; statusSeverityDescription: string; reason?: string }[];
}

const GOOD = 10;

// Service status of every line. A line with several statuses is reported by its worst one.
export async function fetchStatus(): Promise<LineStatus[]> {
  const raw = await tfl<Raw[]>("/Line/Mode/tube,dlr,overground,elizabeth-line/Status");
  return raw.map((l) => {
    const worst = [...l.lineStatuses].sort((a, b) => a.statusSeverity - b.statusSeverity)[0];
    return {
      lineId: l.id,
      lineName: l.name,
      severity: worst?.statusSeverity ?? GOOD,
      text: worst?.statusSeverityDescription ?? "Good Service",
      reason: worst && worst.statusSeverity !== GOOD ? (worst.reason ?? "").trim() : "",
    };
  });
}
