/**
 * Lazily loaded WebGL stage for the telephone-booth model in the contact
 * section. Kept in its own module so `three` only ships in a chunk that is
 * fetched when the visitor approaches the end of the page.
 *
 * Contract with the scroll choreography: the host element is
 * `.contact-booth-canvas`, mounted inside `.contact-booth`. GSAP owns the
 * wrapper's transform (scale / travel / full-turn) and this module owns what
 * happens inside it (slow self-rotation, drag, framing), so scrubbing the
 * entrance never fights the render loop.
 */
import {
  ACESFilmicToneMapping,
  Box3,
  Clock,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type MeshStandardMaterial,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type BoothHandle = {
  /** Stop rendering while the section is off screen or the tab is hidden. */
  setPaused: (paused: boolean) => void;
  dispose: () => void;
};

export type BoothOptions = {
  url: string;
  /** Radians per second of idle self-rotation. */
  spin?: number;
  reduceMotion?: boolean;
};

const FOV = 32;
const CAMERA_DISTANCE = 2.16;
/** Fraction of the framed height the booth occupies, so it never clips. */
const FRAME_FILL = 1.16;

export async function mountBooth(host: HTMLElement, options: BoothOptions): Promise<BoothHandle> {
  const spin = options.reduceMotion ? 0 : (options.spin ?? 0.42);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  const canvas = renderer.domElement;
  canvas.className = "contact-booth-webgl";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 40);
  const cameraTarget = new Vector3(0, 0.5, 0);
  camera.position.set(0, 0.56, CAMERA_DISTANCE);
  camera.lookAt(cameraTarget);

  // Studio-ish lighting: a warm key from the page's right, a cool fill and a
  // rim that separates the dark timber from the white contact sheet.
  const hemi = new HemisphereLight(0xffffff, 0x2b2b2b, 1.15);
  const key = new DirectionalLight(0xfff3e2, 2.5);
  key.position.set(2.6, 3.4, 2.9);
  const fill = new DirectionalLight(0xc2d8ff, 0.9);
  fill.position.set(-3.2, 1.3, 1.7);
  const rim = new DirectionalLight(0xffffff, 1.5);
  rim.position.set(-0.6, 2.2, -3.4);
  scene.add(hemi, key, fill, rim);

  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;

  const pivot = new Group();
  pivot.rotation.x = 0.05;
  const stage = new Group();
  pivot.add(stage);
  scene.add(pivot);

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(options.url);
  const model = gltf.scene;
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  model.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standard = material as MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial) continue;
      standard.envMapIntensity = 0.5;
      if (standard.map) standard.map.anisotropy = maxAnisotropy;
      if (standard.normalMap) standard.normalMap.anisotropy = maxAnisotropy;
      if (standard.metalnessMap) standard.metalnessMap.anisotropy = maxAnisotropy;
    }
  });

  // Normalise: bounding-box centre to the origin, then scale to a height of 1
  // with the feet on y = 0, so the camera framing never depends on the source
  // units the model was authored in.
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  model.position.set(-center.x, -center.y, -center.z);
  stage.add(model);
  stage.scale.setScalar(1 / Math.max(size.y, 1e-4));
  stage.position.y = 0.5;

  const frameCamera = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    const aspect = width / height;
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    // The booth is tall and narrow; keep it filling the height and let the
    // horizontal margin absorb narrow layouts.
    const visible = FRAME_FILL / (2 * Math.tan(MathUtils.degToRad(FOV) / 2));
    camera.position.set(0, 0.56, visible);
    camera.lookAt(cameraTarget);
    camera.updateProjectionMatrix();
  };
  frameCamera();

  const resizeObserver = new ResizeObserver(frameCamera);
  resizeObserver.observe(host);

  // ---- interaction ------------------------------------------------------
  // Mouse drag spins the booth; touch stays native scrolling.
  let dragYaw = 0;
  let dragPitch = 0;
  let yawVelocity = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastMoveAt = 0;

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    lastMoveAt = performance.now();
    yawVelocity = 0;
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging || event.pointerType === "touch") return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    dragYaw += dx * 0.011;
    dragPitch = MathUtils.clamp(dragPitch - dy * 0.004, -0.26, 0.26);
    const now = performance.now();
    const dt = Math.max(now - lastMoveAt, 16);
    yawVelocity = (dx * 0.011) / (dt / 1000);
    lastMoveAt = now;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  // ---- loop -------------------------------------------------------------
  const clock = new Clock();
  let yaw = 0;
  let elapsed = 0;
  let frame = 0;
  let paused = false;

  const render = () => {
    frame = 0;
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    if (!dragging) {
      yawVelocity *= 0.94;
      if (Math.abs(yawVelocity) < 0.002) yawVelocity = 0;
      yaw += dt * spin + yawVelocity * dt;
      dragPitch *= 0.995;
    }

    pivot.rotation.y = yaw + dragYaw;
    pivot.rotation.x = 0.05 + dragPitch;
    // A slow vertical breath keeps the booth from feeling like a static mesh.
    stage.position.y = 0.5 + Math.sin(elapsed * 0.62) * (spin ? 0.006 : 0);

    renderer.render(scene, camera);
    if (!paused) frame = requestAnimationFrame(render);
  };

  const start = () => {
    if (frame || paused) return;
    clock.getDelta();
    frame = requestAnimationFrame(render);
  };

  const setPaused = (next: boolean) => {
    paused = next;
    if (paused) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    } else {
      start();
    }
  };

  // Paint one frame immediately so the canvas is never blank while the
  // entrance tween is already running.
  renderer.render(scene, camera);
  start();

  const onVisibility = () => setPaused(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);

  return {
    setPaused,
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      paused = true;
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      resizeObserver.disconnect();
      scene.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.dispose();
      });
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
