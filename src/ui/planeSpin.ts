// Hangar 3D viewer: the playne's real model in the details card. Drag (finger or mouse) to spin
// it any way you like, pinch or scroll to look closer; it turns slowly by itself when left
// alone. The camera always backs off just enough to keep the whole playne in view.
// three.js is loaded only when a details card opens, so it costs nothing at startup.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MAX_PITCH = 1.25; // radians: nearly straight down or up at the belly
const AUTO_SPIN = 0.35; // radians per second when nobody is touching it

/**
 * Turns `host` (the big picture box) into a live 3D view of `modelUrl`. The picture already in
 * the box stays until the model is ready. Cleans itself up when the box leaves the page.
 */
export function mountPlaneSpinner(host: HTMLElement, modelUrl: string, onError?: (e: unknown) => void): void {
  const canvas = document.createElement("canvas");
  canvas.className = "plane-spin";
  canvas.setAttribute("aria-label", "3D playne: drag to spin it");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (e) {
    onError?.(e);
    return;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-6, 12, 8);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdde8ff, 0.8);
  fill.position.set(8, 4, -6);
  scene.add(fill);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 2000);
  camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);

  // The playne hangs from a pivot at its centre: tilt (towards you) outside, turn inside, so
  // dragging up and down always looks over the top or under the belly, whichever way it faces.
  const tiltNode = new THREE.Group();
  const turnNode = new THREE.Group();
  tiltNode.add(turnNode);
  scene.add(tiltNode);
  let points: THREE.Vector3[] = [];
  let yaw = 0.87; // start in the same three-quarter view as the hangar picture (nose to the right)
  let pitch = 0.32;
  let spinV = 0; // yaw speed after a flick
  let zoom = 1; // 1 = whole playne fits; smaller = closer
  let dist = 0; // smoothed camera distance
  let lastTouch = -1e9;
  let disposed = false;

  new GLTFLoader().load(
    modelUrl,
    (g) => {
      if (disposed) return;
      const m = g.scene;
      const box = new THREE.Box3().setFromObject(m);
      const centre = box.getCenter(new THREE.Vector3());
      m.position.sub(centre);
      turnNode.add(m);
      // A sample of the model's own corners, used to fit the camera to its true outline.
      m.updateMatrixWorld(true);
      const all: THREE.Vector3[] = [];
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const pos = mesh.geometry.getAttribute("position");
        const step = Math.max(1, Math.floor(pos.count / 600));
        for (let i = 0; i < pos.count; i += step) all.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
      });
      points = all;
      host.append(canvas);
      host.classList.add("spinning");
      requestAnimationFrame(() => canvas.classList.add("ready"));
    },
    undefined,
    (e) => {
      onError?.(e);
      cleanup();
    },
  );

  // ----- Touch and mouse -----
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let zoomStart = 1;
  let lastMoveT = 0;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    spinV = 0;
    lastTouch = performance.now();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      zoomStart = zoom;
    }
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = performance.now();
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastTouch = now;
    if (pointers.size === 1) {
      const k = 6 / Math.max(200, canvas.clientWidth); // a full swipe across turns it about once
      yaw += dx * k;
      pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + dy * k));
      const dt = Math.max(0.008, (now - lastMoveT) / 1000);
      spinV = 0.7 * spinV + 0.3 * ((dx * k) / dt);
      lastMoveT = now;
    } else if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()];
      zoom = Math.max(0.45, Math.min(1, zoomStart * (pinchStart / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)))));
      spinV = 0;
    }
    e.preventDefault();
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (performance.now() - lastMoveT > 80) spinV = 0; // held still before letting go: no flick
    lastTouch = performance.now();
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener(
    "wheel",
    (e) => {
      zoom = Math.max(0.45, Math.min(1, zoom * Math.exp(e.deltaY * 0.0015)));
      lastTouch = performance.now();
      e.preventDefault();
    },
    { passive: false },
  );
  // Double tap: back to the whole playne.
  canvas.addEventListener("dblclick", () => {
    zoom = 1;
  });

  // ----- Drawing -----
  const v = new THREE.Vector3();
  const fitDistance = (): number => {
    // Distance at which every sampled point fits inside the view (with a small margin).
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const th = tv * camera.aspect;
    let need = 1;
    for (const p of points) {
      v.copy(p).applyMatrix4(turnNode.matrixWorld);
      const toward = v.z; // camera looks down -Z from +Z
      need = Math.max(need, Math.abs(v.x) / th + toward, Math.abs(v.y) / tv + toward);
    }
    return need * 1.08;
  };
  let lastT = performance.now();
  const frame = (t: number) => {
    if (disposed) return;
    if (!host.isConnected) {
      cleanup();
      return;
    }
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !points.length) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (!pointers.size) {
      // Flicks coast to a stop; after a few seconds alone it turns slowly by itself.
      yaw += spinV * dt;
      spinV *= Math.exp(-dt * 2.2);
      const idle = (t - lastTouch) / 1000;
      if (idle > 3) yaw += AUTO_SPIN * Math.min(1, (idle - 3) / 1.5) * dt;
    }
    turnNode.rotation.set(0, yaw, 0);
    tiltNode.rotation.set(pitch, 0, 0);
    tiltNode.updateMatrixWorld(true);
    const want = fitDistance() * zoom;
    dist = dist ? dist + (want - dist) * Math.min(1, dt * 6) : want;
    camera.position.set(0, 0, dist);
    camera.near = Math.max(0.05, dist / 200);
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);

  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        for (const val of Object.values(m)) if (val instanceof THREE.Texture) val.dispose();
        m.dispose();
      }
    });
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    // iPad Safari allows only a few live WebGL canvases: give this one back right away.
    renderer.forceContextLoss();
    canvas.remove();
  }
}
