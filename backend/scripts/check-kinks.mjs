// Sanity check against the running server: sharpest bend under each live train's carriages.
const get = (p) => fetch("http://localhost:3001" + p).then((r) => r.json());
const [lines, shapes, trains] = await Promise.all([get("/api/lines"), get("/api/tracks"), get("/api/trains")]);
const at = new Map(lines.flatMap((l) => l.stations.map((s) => [s.id, [s.lon, s.lat]])));
const K = 111320; // metres per degree of latitude
const xy = ([lon, lat]) => [lon * K * Math.cos((51.5 * Math.PI) / 180), lat * K];

function link(lineId, a, b) {
  const fwd = a < b;
  const shape = shapes[fwd ? `${lineId}|${a}|${b}` : `${lineId}|${b}|${a}`];
  const pts = shape ? (fwd ? shape : [...shape].reverse()) : [at.get(a), at.get(b)];
  return pts.map(xy);
}
function bend(c, from, to) {
  // sharpest direction change between consecutive segments inside [from, to]
  let worst = 0,
    s = 0;
  for (let i = 1; i < c.length - 1; i++) {
    const l1 = Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
    s += l1;
    if (s < from || s > to) continue;
    const a1 = Math.atan2(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
    const a2 = Math.atan2(c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1]);
    let d = (Math.abs(a2 - a1) * 180) / Math.PI;
    if (d > 180) d = 360 - d;
    worst = Math.max(worst, d);
  }
  return worst;
}
let n = 0,
  sharp = 0,
  veryShar = 0;
const examples = [];
for (const t of trains) {
  if (t.ids.length < 2) continue;
  let pts = [],
    off = 0;
  for (let i = 0; i < t.ids.length - 1; i++) {
    const seg = link(t.lineId, t.ids[i], t.ids[i + 1]);
    if (i === t.fromIndex)
      off = pts.length
        ? pts.reduce((a, p, j) => (j ? a + Math.hypot(p[0] - pts[j - 1][0], p[1] - pts[j - 1][1]) : 0), 0)
        : 0;
    pts.push(...(i === 0 ? seg : seg.slice(1)));
  }
  const s = off + t.d0;
  const w = bend(pts, s - 60, s + 60);
  n++;
  if (w > 45) sharp++;
  if (w > 90) {
    veryShar++;
    if (examples.length < 3) examples.push(`${t.lineId} ${Math.round(w)}deg`);
  }
}
console.log(`trains checked ${n}: bend >45 deg under the train ${sharp}, >90 deg ${veryShar}`, examples.join(", "));
