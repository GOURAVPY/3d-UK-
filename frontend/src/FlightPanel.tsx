import type { Flight } from "./types";

const TYPE_NAMES: Record<string, string> = {
  A320: "Airbus A320", A20N: "Airbus A320neo", A319: "Airbus A319", A321: "Airbus A321", A21N: "Airbus A321neo",
  A388: "Airbus A380", A359: "Airbus A350-900", A333: "Airbus A330-300", A332: "Airbus A330-200",
  B738: "Boeing 737-800", B38M: "Boeing 737 MAX 8", B744: "Boeing 747-400", B77W: "Boeing 777-300ER",
  B772: "Boeing 777-200", B788: "Boeing 787-8", B789: "Boeing 787-9", B78X: "Boeing 787-10",
  E190: "Embraer 190", E170: "Embraer 170", AT76: "ATR 72", DH8D: "Dash 8 Q400", CRJ9: "CRJ-900",
};

// Details of one clicked aircraft.
export function FlightPanel({ flight, onClose }: { flight: Flight; onClose: () => void }) {
  const feet = Math.round((flight.altM / 0.3048) / 100) * 100;
  const knots = Math.round(flight.speedMs / 0.514444);
  const climbing = flight.climbMs > 1 ? "climbing" : flight.climbMs < -1 ? "descending" : "level";
  return (
    <div className="panel">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h3>✈ {flight.callsign || flight.id.toUpperCase()}</h3>
      <dl>
        <dt>Aircraft</dt>
        <dd>{TYPE_NAMES[flight.type] ?? (flight.type || "Unknown")}</dd>
        <dt>Registration</dt>
        <dd>{flight.reg || "Not shown"}</dd>
        <dt>Altitude</dt>
        <dd>{flight.onGround ? "On the ground" : `${feet.toLocaleString("en-GB")} ft · ${climbing}`}</dd>
        <dt>Speed</dt>
        <dd>{knots} kt</dd>
        <dt>Heading</dt>
        <dd>{Math.round(flight.track)}°</dd>
      </dl>
      <div className="row">
        <small>Live ADS-B data from adsb.lol, refreshed every 10 s</small>
      </div>
    </div>
  );
}
