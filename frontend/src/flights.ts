import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CustomLayerInterface, Map } from "maplibre-gl";
import type { Flight } from "./types";
import { PICK_PX } from "./device";
import { METRE, ORIGIN, fromLocal, toLocal } from "./tracks";

const MAX_PLANES = 1500;
const CORRECT_MS = 2500; // how fast a new position pulls the drawn plane onto it
const SCREEN_PX = 15; // length on screen when zoomed out

// Length in metres by ICAO type code. Anything unknown is drawn as a narrow-body.
const LENGTH: Record<string, number> = {
  A388: 73, B744: 71, B748: 76, B77W: 74, B772: 64, B773: 74, B788: 57, B789: 63, B78X: 68,
  A359: 67, A35K: 74, A333: 63, A332: 59, A343: 63, A346: 75, B763: 55, B752: 47,
  A321: 44, A21N: 44, A320: 37, A20N: 37, A319: 34, A19N: 34, A318: 31,
  B738: 39, B38M: 39, B739: 42, B737: 33, B735: 31, E195: 39, E190: 36, E170: 30, E75L: 31,
  CRJ9: 36, CRJ7: 32, AT76: 27, AT75: 27, DH8D: 33, SF34: 20, F100: 36,
  C25A: 14, C25B: 16, C56X: 19, GLF5: 29, GL5T: 30, PC12: 14, C172: 8, PA28: 8,
};
const DEFAULT_LENGTH = 38;

// Unit aeroplane: nose towards +y, 1 long, wings along x, z up, centred on the middle.
function planeGeometries(): { body: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];

  // fuselage: a capsule lying along y
  parts.push(new THREE.CapsuleGeometry(0.052, 0.89, 4, 14).toNonIndexed());

  // swept wings, one flat polygon
  const wing = new THREE.Shape();
  wing.moveTo(-0.49, -0.1);
  wing.lineTo(-0.06, 0.1);
  wing.lineTo(0.06, 0.1);
  wing.lineTo(0.49, -0.1);
  wing.lineTo(0.49, -0.17);
  wing.lineTo(0.06, -0.05);
  wing.lineTo(-0.06, -0.05);
  wing.lineTo(-0.49, -0.17);
  wing.closePath();
  parts.push(new THREE.ExtrudeGeometry(wing, { depth: 0.014, bevelEnabled: false }).translate(0, 0, -0.03));

  // horizontal stabiliser
  const stab = new THREE.Shape();
  stab.moveTo(-0.19, -0.41);
  stab.lineTo(-0.04, -0.34);
  stab.lineTo(0.04, -0.34);
  stab.lineTo(0.19, -0.41);
  stab.lineTo(0.19, -0.45);
  stab.lineTo(0.04, -0.4);
  stab.lineTo(-0.04, -0.4);
  stab.lineTo(-0.19, -0.45);
  stab.closePath();
  parts.push(new THREE.ExtrudeGeometry(stab, { depth: 0.012, bevelEnabled: false }).translate(0, 0, 0.015));

  // two engines under the wings
  for (const x of [-0.19, 0.19]) {
    parts.push(
      new THREE.CylinderGeometry(0.03, 0.026, 0.13, 12).toNonIndexed().translate(x, 0.015, -0.062),
    );
  }

  // tail fin, drawn separately so it can carry the airline colour
  const fin = new THREE.Shape(); // x = along the aircraft, y = up
  fin.moveTo(-0.3, 0.03);
  fin.lineTo(-0.4, 0.2);
  fin.lineTo(-0.47, 0.2);
  fin.lineTo(-0.45, 0.03);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.014, bevelEnabled: false }).translate(0, 0, -0.007);
  // shape x -> world y, shape y -> world z, extrusion -> world x
  finGeo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));

  const body = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  return { body, tail: finGeo };
}

interface Plane {
  id: string;
  callsign: string;
  colour: THREE.Color;
  length: number;
  x: number; // local metres when the update arrived
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  track: number;
  roll: number;
  onGround: boolean;
  errX: number; // leftover offset from the previous estimate, fading out
  errY: number;
  recv: number;
}

// A stable colour per airline, from the first three letters of the callsign.
function airlineColour(callsign: string): THREE.Color {
  let h = 0;
  for (const ch of callsign.slice(0, 3)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return new THREE.Color().setHSL(h / 360, 0.7, 0.5);
}

export function createFlightsLayer() {
  const planes = new globalThis.Map<string, Plane>();
  let map: Map;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const dummy = new THREE.Object3D();
  dummy.rotation.order = "ZXY"; // heading first, then nose up and bank
  const white = new THREE.Color(0xffffff);
  let body: THREE.InstancedMesh;
  let tail: THREE.InstancedMesh;
  let shadow: THREE.InstancedMesh;
  let selected: string | null = null;
  let frameGapMs = 0; // Eco Mode
  let night = false;
  let ambient: THREE.AmbientLight | undefined;
  let sunLight: THREE.DirectionalLight | undefined;
  const applyNight = () => {
    if (!ambient || !sunLight) return;
    ambient.intensity = night ? 0.85 : 1.0;
    sunLight.intensity = night ? 0.5 : 0.9;
    (body.material as THREE.MeshLambertMaterial).color.set(night ? 0xe3e9f0 : 0xc3ced8);
    (shadow.material as THREE.MeshBasicMaterial).opacity = night ? 0.35 : 0.2;
  };

  // Where a plane is drawn at time `now`: dead reckoning from its last report.
  const place = (p: Plane, now: number) => {
    const dt = (now - p.recv) / 1000;
    const fade = Math.exp(-(now - p.recv) / CORRECT_MS);
    return {
      x: p.x + p.vx * dt + p.errX * fade,
      y: p.y + p.vy * dt + p.errY * fade,
      z: Math.max(p.z + p.vz * dt, 0),
    };
  };

  const layer: CustomLayerInterface = {
    id: "flights-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      const geo = planeGeometries();
      body = new THREE.InstancedMesh(geo.body, new THREE.MeshLambertMaterial({ color: 0xc3ced8 }), MAX_PLANES);
      tail = new THREE.InstancedMesh(geo.tail, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_PLANES);
      shadow = new THREE.InstancedMesh(
        new THREE.CircleGeometry(0.5, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }),
        MAX_PLANES,
      );
      for (const mesh of [body, tail, shadow]) {
        mesh.count = 0;
        mesh.frustumCulled = false;
        scene.add(mesh);
      }
      ambient = new THREE.AmbientLight(0xffffff, 1.0);
      sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
      sunLight.position.set(0.4, -0.7, 1);
      scene.add(ambient, sunLight);
      applyNight();
    },
    render(_gl, args) {
      const now = performance.now();
      const metresPerPx = (78271.517 * Math.cos((51.5 * Math.PI) / 180)) / 2 ** map.getZoom();
      const floor = SCREEN_PX * metresPerPx; // never smaller than this many pixels

      let n = 0;
      for (const [id, p] of planes) {
        if (n >= MAX_PLANES) break;
        const isSel = id === selected;
        // the selected aircraft is drawn bigger, so its shape is easy to see
        const size = isSel ? Math.max(p.length * 1.5, floor * 4) : Math.max(p.length, floor);
        const at = place(p, now);
        const heading = (-p.track * Math.PI) / 180;
        const pitch = p.onGround ? 0 : Math.atan2(p.vz, Math.max(Math.hypot(p.vx, p.vy), 1));
        const bank = p.onGround ? 0 : (p.roll * Math.PI) / 180;

        dummy.position.set(at.x, at.y, Math.max(at.z, 1.5));
        // order ZXY: heading, then nose up/down, then bank about the aircraft's long axis
        dummy.rotation.set(pitch, bank, heading);
        dummy.scale.set(size, size, size);
        dummy.updateMatrix();
        body.setMatrixAt(n, dummy.matrix);
        tail.setMatrixAt(n, dummy.matrix);
        tail.setColorAt(n, isSel ? white : p.colour);

        // shadow straight below, flat on the ground, a little fainter the higher it is
        dummy.position.set(at.x, at.y, 0.6);
        dummy.rotation.set(0, 0, heading);
        dummy.scale.set(size * 0.95, size * 0.95, 1);
        dummy.updateMatrix();
        shadow.setMatrixAt(n, dummy.matrix);
        n++;
      }
      body.count = tail.count = shadow.count = n;
      body.instanceMatrix.needsUpdate = true;
      tail.instanceMatrix.needsUpdate = true;
      shadow.instanceMatrix.needsUpdate = true;
      if (tail.instanceColor) tail.instanceColor.needsUpdate = true;

      const toWorld = new THREE.Matrix4()
        .makeTranslation(ORIGIN.x, ORIGIN.y, ORIGIN.z)
        .scale(new THREE.Vector3(METRE, -METRE, METRE));
      camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
        .multiply(toWorld);

      renderer.resetState();
      renderer.render(scene, camera);
      if (frameGapMs) setTimeout(() => map.triggerRepaint(), frameGapMs);
      else map.triggerRepaint();
    },
    onRemove() {
      for (const mesh of [body, tail, shadow]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      renderer.dispose();
    },
  };

  return {
    layer,
    select(id: string | null) {
      selected = id;
      map?.triggerRepaint();
    },
    setEco(on: boolean) {
      frameGapMs = on ? 125 : 0;
      map?.triggerRepaint();
    },
    // Underground Mode: aircraft are above ground, so they turn translucent.
    setUnderground(on: boolean) {
      for (const m of [body, tail]) {
        const mat = m.material as THREE.MeshLambertMaterial;
        mat.transparent = on;
        mat.opacity = on ? 0.3 : 1;
        mat.depthWrite = !on;
        mat.needsUpdate = true;
      }
      map?.triggerRepaint();
    },
    setNight(value: boolean) {
      night = value;
      applyNight();
      map?.triggerRepaint();
    },
    // Where an aircraft is drawn right now, for follow mode.
    positionOf(id: string): { lon: number; lat: number; heading: number; alt: number } | null {
      const p = planes.get(id);
      if (!p) return null;
      const at = place(p, performance.now());
      const [lon, lat] = fromLocal(at.x, at.y);
      return { lon, lat, heading: p.track, alt: at.z };
    },
    // Nearest aircraft to a screen point, within a finger-sized radius.
    pick(x: number, y: number): string | null {
      const now = performance.now();
      let best: string | null = null;
      let bestD = PICK_PX + 2;
      for (const [id, p] of planes) {
        const at = place(p, now);
        const [lon, lat] = fromLocal(at.x, at.y);
        const sp = map.project([lon, lat]);
        const d = Math.hypot(sp.x - x, sp.y - y);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      return best;
    },
    update(flights: Flight[]) {
      const now = performance.now();
      const next = new globalThis.Map<string, Plane>();
      for (const f of flights) {
        const [x, y] = toLocal(f.lon, f.lat);
        const rad = (f.track * Math.PI) / 180;
        const moving = !f.onGround || f.speedMs > 3;
        const old = planes.get(f.id);
        let errX = 0;
        let errY = 0;
        if (old) {
          const at = place(old, now);
          errX = at.x - x; // pull gently from where it is drawn to where it now is
          errY = at.y - y;
        }
        next.set(f.id, {
          id: f.id,
          callsign: f.callsign,
          colour: old?.colour ?? airlineColour(f.callsign || f.id),
          // helicopters (category A7) are far smaller than the narrow-body default
          length: LENGTH[f.type] ?? (f.category === "A7" ? 14 : DEFAULT_LENGTH),
          x,
          y,
          z: f.altM,
          vx: moving ? Math.sin(rad) * f.speedMs : 0,
          vy: moving ? Math.cos(rad) * f.speedMs : 0,
          vz: f.onGround ? 0 : f.climbMs,
          track: f.track,
          roll: f.roll,
          onGround: f.onGround,
          errX,
          errY,
          recv: now,
        });
      }
      planes.clear();
      next.forEach((p, id) => planes.set(id, p));
      map?.triggerRepaint();
    },
  };
}
