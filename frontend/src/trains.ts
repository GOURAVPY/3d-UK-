import * as THREE from "three";
import { MercatorCoordinate } from "maplibre-gl";
import type { CustomLayerInterface, Map } from "maplibre-gl";
import type { Train } from "./types";

// Each update says where a train is now and where it will be one poll later.
// The browser glides every train from its current spot to that target.
const GLIDE_MS = 30_000;
const MAX_TRAINS = 3000;
const CARS = 6;

// Real train size in metres. When zoomed out we draw it larger so it stays visible.
// a little chunkier than a real tube train (2.9 m x 3.7 m) so the model reads as 3D
const REAL = { length: 100, width: 5.2, height: 6.2 };
const SCREEN_PX = { length: 14, width: 4.5, height: 4 };

// All positions are metres east/north of this point, so float32 stays precise.
const ORIGIN = MercatorCoordinate.fromLngLat([-0.1276, 51.5072], 0);
const METRE = ORIGIN.meterInMercatorCoordinateUnits();

interface Glide {
  colour: string;
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
  heading: number;
  start: number;
}

function toLocal(lon: number, lat: number): [number, number] {
  const m = MercatorCoordinate.fromLngLat([lon, lat], 0);
  return [(m.x - ORIGIN.x) / METRE, -(m.y - ORIGIN.y) / METRE];
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
export function createTrainsLayer() {
  const glides = new globalThis.Map<string, Glide>();
  let map: Map;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const HEADLIGHT = new THREE.Color(0xfff2c4);
  const TAILLIGHT = new THREE.Color(0xff2a1a);
  let body: THREE.InstancedMesh;
  let windows: THREE.InstancedMesh;
  let skirt: THREE.InstancedMesh;
  let lights: THREE.InstancedMesh;
  const meshes: THREE.InstancedMesh[] = [];

  const position = (g: Glide, now: number): [number, number] => {
    const f = Math.min(Math.max((now - g.start) / GLIDE_MS, 0), 1);
    return [g.fromLon + (g.toLon - g.fromLon) * f, g.fromLat + (g.toLat - g.fromLat) * f];
  };

  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
    meshes.push(m);
    return m;
  };

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
      const pitch = length / CARS; // distance between car centres
      const carLen = pitch * 0.94;

      let trains = 0;
      let cars = 0;
      let lamps = 0;
      for (const g of glides.values()) {
        if (trains >= MAX_TRAINS) break;
        trains++;
        const [lon, lat] = position(g, now);
        const [x, y] = toLocal(lon, lat);
        const phi = (-g.heading * Math.PI) / 180;
        const sin = Math.sin(phi);
        const cos = Math.cos(phi);
        tint.set(g.colour);

        for (let i = 0; i < CARS; i++) {
          const off = (i - (CARS - 1) / 2) * pitch;
          dummy.position.set(x - off * sin, y + off * cos, 1);
          dummy.rotation.set(0, 0, phi);

          dummy.scale.set(width, carLen, height);
          dummy.updateMatrix();
          body.setMatrixAt(cars, dummy.matrix);
          body.setColorAt(cars, tint);

          // dark window band halfway up the side, a shade wider than the body
          dummy.position.z = 1 + height * 0.5;
          dummy.scale.set(width * 1.02, carLen * 0.86, height * 0.28);
          dummy.updateMatrix();
          windows.setMatrixAt(cars, dummy.matrix);

          // dark skirt over the bottom of the body
          dummy.position.z = 1;
          dummy.scale.set(width * 1.02, carLen, height * 0.16);
          dummy.updateMatrix();
          skirt.setMatrixAt(cars, dummy.matrix);
          cars++;
        }

        // bright headlight on the front, red tail light on the back
        for (const [sign, colour] of [[1, HEADLIGHT], [-1, TAILLIGHT]] as const) {
          const end = sign * (length / 2 + pitch * 0.03);
          dummy.position.set(x - end * sin, y + end * cos, 1 + height * 0.3);
          dummy.rotation.set(0, 0, phi);
          dummy.scale.set(width * 0.6, Math.max(0.25, length * 0.012), height * 0.2);
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

  return {
    layer,
    // New data: start each glide from where the train is drawn right now, so nothing jumps.
    update(trains: Train[]) {
      const now = performance.now();
      const next = new globalThis.Map<string, Glide>();
      for (const t of trains) {
        const old = glides.get(t.id);
        const [fromLon, fromLat] = old ? position(old, now) : [t.lon, t.lat];
        next.set(t.id, {
          colour: t.colour,
          fromLon,
          fromLat,
          toLon: t.toLon,
          toLat: t.toLat,
          heading: t.heading,
          start: now,
        });
      }
      glides.clear();
      next.forEach((g, id) => glides.set(id, g));
      map?.triggerRepaint();
    },
  };
}
