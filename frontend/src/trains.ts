import * as THREE from "three";
import type { CustomLayerInterface, Map } from "maplibre-gl";
import type { Train } from "./types";
import {
  METRE,
  ORIGIN,
  fromLocal,
  laneAt,
  laneSpacingMetres,
  pointAt,
  project,
  stubChain,
  toLocal,
  type Chain,
  type TrackIndex,
} from "./tracks";

// Each update says where a train is now and where it will be one poll later, as
// distances along a run of real track. The browser slides every train along that
// track, and each carriage is placed on its own stretch of it, so trains bend round curves.
const GLIDE_MS = 30_000;
const MAX_TRAINS = 3000;
const CARS = 6;

// Trains run on the left, as in the UK: each direction sits a quarter of a lane to the
// left of travel, so trains passing each other no longer overlap on one centre line.
const KEEP_LEFT = 0.25;

// Train size in metres, a little chunkier than real so it reads as 3D. When zoomed
// out it is drawn larger so it stays visible.
const REAL = { length: 72, width: 4.6, height: 5.6 };
const SCREEN_PX = { length: 16, width: 5, height: 4.5 };

interface Glide {
  colour: string;
  heading: number;
  chain: Chain;
  fromS: number;
  toS: number;
  start: number;
}

// Unit carriage: 1 wide, 1 long (along +y, centred), 1 tall, rounded roof, base on z = 0.
function carriageGeometry(): THREE.BufferGeometry {
  const r = 0.2;
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0.5, 1 - r);
  s.quadraticCurveTo(0.5, 1, 0.5 - r, 1);
  s.lineTo(-0.5 + r, 1);
  s.quadraticCurveTo(-0.5, 1, -0.5, 1 - r);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape y -> up, extrusion -> along y
  g.translate(0, 0.5, 0);
  return g;
}

// Unit box with its base on z = 0, for the window band, skirt and lights.
function bandGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
}

// Every part is an instanced mesh drawn inside the map's own WebGL scene, so all
// trains share one camera with the map.
export function createTrainsLayer(index: TrackIndex) {
  const glides = new globalThis.Map<string, Glide>();
  let map: Map;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const HEADLIGHT = new THREE.Color(0xfff2c4);
  const TAILLIGHT = new THREE.Color(0xff2a1a);
  const bright = new THREE.Color(0xffffff);
  let body: THREE.InstancedMesh;
  let windows: THREE.InstancedMesh;
  let skirt: THREE.InstancedMesh;
  let lights: THREE.InstancedMesh;
  const meshes: THREE.InstancedMesh[] = [];
  let selected: string | null = null;

  const slide = (g: Glide, now: number) => {
    const f = Math.min(Math.max((now - g.start) / GLIDE_MS, 0), 1);
    return g.fromS + (g.toS - g.fromS) * f;
  };

  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
    meshes.push(m);
    return m;
  };

  const a: [number, number] = [0, 0];
  const b: [number, number] = [0, 0];

  const layer: CustomLayerInterface = {
    id: "trains-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;

      body = make(carriageGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_TRAINS * CARS);
      windows = make(bandGeometry(), new THREE.MeshLambertMaterial({ color: 0x16222e }), MAX_TRAINS * CARS);
      skirt = make(bandGeometry(), new THREE.MeshLambertMaterial({ color: 0x2b2f33 }), MAX_TRAINS * CARS);
      lights = make(bandGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_TRAINS * 2);

      scene.add(new THREE.AmbientLight(0xffffff, 1.0));
      const sun = new THREE.DirectionalLight(0xffffff, 0.9);
      sun.position.set(0.4, -0.7, 1);
      scene.add(sun);
    },
    render(_gl, args) {
      const now = performance.now();
      const metresPerPx = (78271.517 * Math.cos((51.5 * Math.PI) / 180)) / 2 ** map.getZoom();
      const length = Math.max(REAL.length, SCREEN_PX.length * metresPerPx);
      const width = Math.max(REAL.width, SCREEN_PX.width * metresPerPx);
      const height = Math.max(REAL.height, SCREEN_PX.height * metresPerPx);
      const spacing = laneSpacingMetres(map.getZoom());
      const pitch = length / CARS; // distance between car centres
      const carLen = pitch * 0.92;

      let trains = 0;
      let cars = 0;
      let lamps = 0;
      for (const [id, g] of glides) {
        if (trains >= MAX_TRAINS) break;
        trains++;
        const isSel = id === selected;
        const w = isSel ? width * 1.4 : width;
        const h = isSel ? height * 1.4 : height;
        const s = slide(g, now);
        tint.set(g.colour);
        if (isSel) tint.lerp(bright, 0.35);

        let firstPhi = 0;
        let lastPhi = 0;
        const tailN: [number, number] = [0, 0];
        const headN: [number, number] = [0, 0];
        for (let i = 0; i < CARS; i++) {
          const centre = s + (i - (CARS - 1) / 2) * pitch;
          // each carriage spans its own stretch of track, so it turns with the curve
          const sa = centre - carLen / 2;
          const sb = centre + carLen / 2;
          pointAt(g.chain, sa, a);
          pointAt(g.chain, sb, b);
          // step sideways into the line's lane (to the left of the direction of travel)
          const cl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const nx = -(b[1] - a[1]) / cl;
          const ny = (b[0] - a[0]) / cl;
          const oa = (laneAt(g.chain, sa) + KEEP_LEFT) * spacing;
          const ob = (laneAt(g.chain, sb) + KEEP_LEFT) * spacing;
          a[0] += nx * oa;
          a[1] += ny * oa;
          b[0] += nx * ob;
          b[1] += ny * ob;
          if (i === 0) {
            tailN[0] = nx;
            tailN[1] = ny;
          }
          headN[0] = nx;
          headN[1] = ny;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const phi = Math.atan2(-dx, dy);
          if (i === 0) firstPhi = phi;
          lastPhi = phi;

          dummy.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1);
          dummy.rotation.set(0, 0, phi);

          dummy.scale.set(w, Math.hypot(dx, dy), h);
          dummy.updateMatrix();
          body.setMatrixAt(cars, dummy.matrix);
          body.setColorAt(cars, tint);

          // dark window band halfway up the side, a shade wider than the body
          dummy.position.z = 1 + h * 0.5;
          dummy.scale.set(w * 1.02, Math.hypot(dx, dy) * 0.86, h * 0.28);
          dummy.updateMatrix();
          windows.setMatrixAt(cars, dummy.matrix);

          // dark skirt over the bottom of the body
          dummy.position.z = 1;
          dummy.scale.set(w * 1.02, Math.hypot(dx, dy), h * 0.16);
          dummy.updateMatrix();
          skirt.setMatrixAt(cars, dummy.matrix);
          cars++;
        }

        // bright headlight on the front, red tail light on the back
        for (const [end, colour, phi] of [
          [s + length / 2 + 0.3, HEADLIGHT, lastPhi],
          [s - length / 2 - 0.3, TAILLIGHT, firstPhi],
        ] as const) {
          pointAt(g.chain, end, a);
          const n = phi === lastPhi && end > s ? headN : tailN;
          const side = (laneAt(g.chain, end) + KEEP_LEFT) * spacing;
          a[0] += n[0] * side;
          a[1] += n[1] * side;
          dummy.position.set(a[0], a[1], 1 + h * 0.3);
          dummy.rotation.set(0, 0, phi);
          dummy.scale.set(w * 0.6, Math.max(0.3, length * 0.012), h * 0.2);
          dummy.updateMatrix();
          lights.setMatrixAt(lamps, dummy.matrix);
          lights.setColorAt(lamps, colour);
          lamps++;
        }
      }
      body.count = windows.count = skirt.count = cars;
      lights.count = lamps;
      for (const m of meshes) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }

      const toWorld = new THREE.Matrix4()
        .makeTranslation(ORIGIN.x, ORIGIN.y, ORIGIN.z)
        .scale(new THREE.Vector3(METRE, -METRE, METRE));
      camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
        .multiply(toWorld);

      renderer.resetState();
      renderer.clearDepth(); // trains run underground, so never let buildings cut through them
      renderer.render(scene, camera);
      map.triggerRepaint(); // keep animating
    },
    onRemove() {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      renderer.dispose();
    },
  };

  // Where a train is drawn right now, in local metres, with its compass heading.
  const placeOf = (g: Glide, now: number, withLane = true) => {
    const s = slide(g, now);
    const p: [number, number] = [0, 0];
    const q: [number, number] = [0, 0];
    pointAt(g.chain, s - 6, p);
    pointAt(g.chain, s + 6, q);
    pointAt(g.chain, s, a);
    const heading = ((Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI + 360) % 360;
    const dl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const side = withLane ? (laneAt(g.chain, s) + KEEP_LEFT) * laneSpacingMetres(map.getZoom()) : 0;
    return { x: a[0] - ((q[1] - p[1]) / dl) * side, y: a[1] + ((q[0] - p[0]) / dl) * side, heading };
  };

  return {
    layer,
    select(id: string | null) {
      selected = id;
      map?.triggerRepaint();
    },
    // Where a train is drawn right now, for follow mode.
    positionOf(id: string): { lon: number; lat: number; heading: number } | null {
      const g = glides.get(id);
      if (!g) return null;
      const p = placeOf(g, performance.now());
      const [lon, lat] = fromLocal(p.x, p.y);
      return { lon, lat, heading: p.heading };
    },
    // Nearest train to a screen point, within a finger-sized radius.
    pick(x: number, y: number): string | null {
      const now = performance.now();
      let best: string | null = null;
      let bestD = 18;
      for (const [id, g] of glides) {
        const p = placeOf(g, now);
        const [lon, lat] = fromLocal(p.x, p.y);
        const sp = map.project([lon, lat]);
        const d = Math.hypot(sp.x - x, sp.y - y);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      return best;
    },
    // New data: start each slide from where the train is drawn right now, so nothing jumps.
    update(trains: Train[]) {
      const now = performance.now();
      const next = new globalThis.Map<string, Glide>();
      for (const t of trains) {
        const built = t.ids.length >= 2 ? index.chain(t.lineId, t.ids) : null;
        let chain: Chain;
        let fromS = 0;
        let toS = 0;
        if (built) {
          chain = built.chain;
          const base = built.offsets[t.fromIndex] ?? 0;
          fromS = base + t.d0;
          toS = base + t.d1;
        } else {
          // no track known: park the train at its position, facing its heading
          const [x, y] = toLocal(t.lon, t.lat);
          chain = stubChain(x, y, t.heading);
        }

        const old = glides.get(t.id);
        if (old && built) {
          // continue from where it is drawn now, if that is still on this run of track
          const p = placeOf(old, now, false); // on the track itself, without the lane offset
          const near = project(chain, p.x, p.y);
          if (near.dist < 120) fromS = near.s;
        }
        next.set(t.id, { colour: t.colour, heading: t.heading, chain, fromS, toS, start: now });
      }
      glides.clear();
      next.forEach((g, id) => glides.set(id, g));
      map?.triggerRepaint();
    },
  };
}
