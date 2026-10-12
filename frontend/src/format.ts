// "Brixton Underground Station" -> "Brixton"
export function shortName(name: string): string {
  return name.replace(/\s+(Underground|DLR|Rail|Overground)?\s*Station$/i, "").trim();
}

// seconds -> "due", "3 min"
export function minutes(seconds: number): string {
  if (seconds < 45) return "due";
  return `${Math.round(seconds / 60)} min`;
}
