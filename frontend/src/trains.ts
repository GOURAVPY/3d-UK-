import * as THREE from "three";
import { MercatorCoordinate } from "maplibre-gl";
import type { CustomLayerInterface, Map } from "maplibre-gl";
import type { Train } from "./types";

// Each update says where a train is now and where it will be one poll later.
// The browser glides every train from its current spot to that target.
const GLIDE_MS = 30_000;
const MAX_TRAINS = 3000;

// Real train size in metres. When zoomed out we draw it larger so it stays visible.
const REAL = { length: 110, width: 3.2, height: 3.8 };
const SCREEN_PX = { length: 22, width: 7, height: 6 };

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

// One instanced box per train, drawn inside the map's own WebGL scene so
// buildings hide trains correctly and everything shares one camera.
export function createTrainsLayer() {
  const glides = new globalThis.Map<string, Glide>();
  let map: Map;
  let renderer: THREE.WebGLRenderer;
  let mesh: THREE.InstancedMesh;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const white = new THREE.Color(0xffffff);

  const position = (g: Glide, now: number): [number, number] => {
    const f = Math.min(Math.max((now - g.start) / GLIDE_MS, 0), 1);
    return [g.fromLon + (g.toLon - g.fromLon) * f, g.fromLat + (g.toLat - g.fromLat) * f];
  };

  const layer: CustomLayerInterface = {
    id: "trains-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;

      // box whose base sits on the ground, long side along +y (north)
      const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      mesh = new THREE.InstancedMesh(geo, mat, MAX_TRAINS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(0.4, -0.7, 1);
      scene.add(sun);
    },
    render(_gl, args) {
      const now = performance.now();
      const metresPerPx = (78271.517 * Math.cos((51.5 * Math.PI) / 180)) / 2 ** map.getZoom();
      const length = Math.max(REAL.length, SCREEN_PX.length * metresPerPx);
      const width = Math.max(REAL.width, SCREEN_PX.width * metresPerPx);
      const height = Math.max(REAL.height, SCREEN_PX.height * metresPerPx);

      let i = 0;
      for (const g of glides.values()) {
        if (i >= MAX_TRAINS) break;
        const [lon, lat] = position(g, now);
        const [x, y] = toLocal(lon, lat);
        dummy.position.set(x, y, 1);
        dummy.rotation.set(0, 0, (-g.heading * Math.PI) / 180);
        dummy.scale.set(width, length, height);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tint.set(g.colour).lerp(white, 0.12));
        i++;
      }
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      const toWorld = new THREE.Matrix4()
        .makeTranslation(ORIGIN.x, ORIGIN.y, ORIGIN.z)
        .scale(new THREE.Vector3(METRE, -METRE, METRE));
      camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
        .multiply(toWorld);

      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint(); // keep animating
    },
    onRemove() {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
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
