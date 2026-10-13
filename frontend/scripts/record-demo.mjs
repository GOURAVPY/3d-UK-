// Records the demo video by driving the running app in a real browser.
//
//   1. Rush hour: playback of this morning at 60x while the camera turns slowly.
//   2. Live: click a train and follow it.
//   3. Heathrow: fly to the airport and watch the aircraft.
//
// Needs both servers running (backend on 3001, frontend on 5173). Opens a Chrome window
// for about a minute; the video lands in docs/demo/demo.webm (and .mp4 if ffmpeg can).
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const URL = "http://localhost:5173/?view=-0.1276,51.5072,13.1";
const OUT = join(process.cwd(), "..", "docs", "demo");
const W = 1280;
const H = 720;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const tmp = join(OUT, "_rec");
rmSync(tmp, { recursive: true, force: true });

const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--window-size=1300,820"] });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: tmp, size: { width: W, height: H } },
});
// night theme looks best, and no tooltips lingering from a real mouse
await context.addInitScript(() => localStorage.setItem("theme", "night"));
const page = await context.newPage();
const t0 = Date.now(); // the video starts about here; the loading part gets cut below

// A caption strip we can write to between scenes.
const caption = (text) =>
  page.evaluate((t) => {
    let el = document.getElementById("demo-cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-cap";
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)", zIndex: 99,
        padding: "12px 22px", borderRadius: "14px", background: "rgba(10,11,16,0.78)", color: "#fff",
        font: "600 26px/1.2 system-ui, sans-serif", letterSpacing: "0.01em", backdropFilter: "blur(10px)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)", transition: "opacity 0.4s", whiteSpace: "nowrap",
      });
      document.body.appendChild(el);
    }
    el.style.opacity = t ? "1" : "0";
    if (t) el.textContent = t;
  }, text);

const map = (fn, arg) => page.evaluate(fn, arg);
const button = (tipStart) => page.locator(`button[aria-label^="${tipStart}"]`).first();
const exact = (label) => page.locator(`button[aria-label="${label}"]`).first();

console.log("opening", URL);
await page.goto(URL);
await page.waitForFunction(() => window.__layers && window.__map && window.__map.loaded(), null, { timeout: 90_000 });
await wait(6000); // let the tiles and the first train update arrive
const skip = Math.max(0, (Date.now() - t0) / 1000 - 1.5);
await caption("Every train in London, live, in 3D");
await wait(3500);

// ---- 1. rush hour playback ---------------------------------------------------------
await caption("This morning's rush hour at 60x");
await button("Playback").click();
await page.waitForSelector(".replay input[type=range]", { timeout: 20_000 });
// scrub to 07:40 London time this morning (recorded today), or the earliest we have
const info = await (await fetch("http://localhost:3001/api/history/info")).json();
const today = new Date();
const start = Math.max(info.from, Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 6, 40));
await page.$eval(".replay input[type=range]", (el, v) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(el, String(v));
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, start);
await wait(800);
await exact("Play").click().catch(() => undefined); // scrubbing pauses; start again
await map(() => window.__map.easeTo({ bearing: 25, pitch: 58, zoom: 13.4, duration: 13_000, easing: (t) => t }));
await wait(13_500);

// ---- 2. follow a train ----------------------------------------------------------------
await page.locator(".replay button", { hasText: "Live" }).click();
await wait(1500);
await caption("Click any train and ride along");
// find a spot on screen where a train is drawn, then click it like a user would
const hit = await map(() => {
  const t = window.__layers.trains;
  const c = window.__map.getCanvas();
  for (let y = 200; y < c.clientHeight - 200; y += 10) {
    for (let x = 240; x < c.clientWidth - 260; x += 10) {
      if (t.pick(x, y)) return [x, y];
    }
  }
  return null;
});
if (hit) {
  await page.mouse.click(hit[0], hit[1]);
  await wait(1200);
  await page.locator(".panel.train button", { hasText: "Follow" }).first().click({ timeout: 3000 }).catch(() => undefined);
}
await wait(12_000);

// ---- 3. aircraft at Heathrow ----------------------------------------------------------
await page.locator(".panel.train button", { hasText: "Stop following" }).first().click({ timeout: 3000 }).catch(() => undefined);
await caption("Every aircraft too: live ADS-B over London");
await button("Fly to Heathrow").click();
await wait(8000);
await caption("TfL + OpenStreetMap + adsb.lol · github.com/GOURAVPY/3d-UK-");
await wait(4000);
await caption("");
await wait(600);

await context.close();
await browser.close();

// Playwright names the file by page id; give it a proper name and try to make an mp4.
const [file] = readdirSync(tmp).filter((f) => f.endsWith(".webm"));
const webm = join(OUT, "demo.webm");
if (existsSync(webm)) rmSync(webm);
renameSync(join(tmp, file), webm);
rmSync(tmp, { recursive: true, force: true });
console.log("saved", webm);

// A full ffmpeg (with H.264) if one is around: the imageio-ffmpeg Python package ships one;
// Playwright's own build only knows VP8.
const candidates = [
  process.env.FFMPEG,
  join(homedir(), "AppData", "Local", "Programs", "Python", "Python314", "Lib", "site-packages", "imageio_ffmpeg", "binaries", "ffmpeg-win-x86_64-v7.1.exe"),
  "ffmpeg",
].filter(Boolean);
const ffmpeg = candidates.find((c) => c === "ffmpeg" || existsSync(c));
if (ffmpeg) {
  try {
    execFileSync(ffmpeg, ["-y", "-ss", skip.toFixed(1), "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(OUT, "demo.mp4")], { stdio: "ignore" });
    console.log("saved", join(OUT, "demo.mp4"));
  } catch {
    console.log("mp4 not made (this ffmpeg has no H.264 encoder); the .webm plays in any modern browser");
  }
}
