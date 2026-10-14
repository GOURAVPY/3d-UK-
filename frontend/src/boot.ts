// Drives the loading screen that index.html draws before React starts.
const STEPS = ["app", "map", "track", "trains"] as const;
export type BootStep = (typeof STEPS)[number];

const el = () => document.getElementById("boot");
let current = 0;
let slowTimer: number | undefined;

function hint(text: string) {
  const h = document.getElementById("boot-hint");
  if (!h) return;
  h.textContent = text;
  h.classList.toggle("show", !!text);
}

/** Marks every step before `step` done and `step` itself as in progress. */
export function bootStep(step: BootStep) {
  const n = STEPS.indexOf(step);
  if (n < current || !el()) return; // never go backwards
  current = n;
  document.querySelectorAll<HTMLLIElement>("#boot-steps li").forEach((li, i) => {
    li.className = i < n ? "done" : i === n ? "active" : "";
  });
  const bar = document.getElementById("boot-bar");
  if (bar) bar.style.width = `${12 + (n / STEPS.length) * 80}%`;
  // The free backend sleeps when idle and takes up to a minute to wake: say so instead of looking stuck.
  window.clearTimeout(slowTimer);
  hint("");
  if (step === "track") slowTimer = window.setTimeout(() => hint("Waking up the server. This can take up to a minute."), 6000);
  if (step === "trains") slowTimer = window.setTimeout(() => hint("Waiting for the first live update from TfL…"), 8000);
}

/** Fills the bar, fades the screen out and removes it. Safe to call more than once. */
export function bootDone() {
  const b = el();
  if (!b || b.classList.contains("gone")) return;
  window.clearTimeout(slowTimer);
  document.querySelectorAll<HTMLLIElement>("#boot-steps li").forEach((li) => (li.className = "done"));
  const bar = document.getElementById("boot-bar");
  if (bar) bar.style.width = "100%";
  window.setTimeout(() => b.classList.add("gone"), 250);
  window.setTimeout(() => b.remove(), 1000);
}
