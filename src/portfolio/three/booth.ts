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
  Matrix4,
  CanvasTexture,
  Clock,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
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
  /**
   * Replaces the phone number that is modelled as four separate flat meshes on
   * the booth's panels (see `replacePlateLettering`). Pass an empty string to
   * leave the model untouched.
   */
  plateText?: string;
};

const FOV = 32;
/**
 * Largest |NDC| any silhouette point may reach. The booth is a box on a wider
 * plinth, so its projected width peaks somewhere around a 45° turn — fitting
 * the height alone let those corners run past the canvas edge, and because the
 * canvas is transparent over a white page the slice read as the model being
 * cut by a white slab.
 */
const SILHOUETTE_FILL = 0.88;
/** Camera height and the point it looks at, in the model's normalised units. */
const CAMERA_HEIGHT = 0.6;

/**
 * The phone number is not baked into the panel texture: the four faces of the
 * booth each carry the same flat, untextured lettering mesh (`Text`,
 * `Text.001`…), so hiding those quads and drawing the e-mail address onto a
 * plate in exactly the same spot replaces it without touching the model.
 */
function makePlateTexture(text: string, aspect: number, anisotropy: number) {
  const width = 1024;
  const height = Math.round(MathUtils.clamp(width / Math.max(aspect, 0.2), 96, 1024));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // A small enamel plaque: it covers the number baked into the panel and
  // matches the booth's white "TELEPHONE" signs instead of reading as a
  // sticker slapped on top of the door.
  const inset = height * 0.06;
  ctx.fillStyle = "rgba(243, 233, 224, 0.99)";
  ctx.beginPath();
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, height * 0.16);
  ctx.fill();
  ctx.strokeStyle = "rgba(58, 35, 32, 0.35)";
  ctx.lineWidth = Math.max(2, height * 0.02);
  ctx.stroke();

  const chars = [...text];
  const tracking = 0.05;
  let size = height * 0.52;
  const layout = () => {
    ctx.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
    const widths = chars.map((char) => ctx.measureText(char).width);
    const total = widths.reduce((sum, w) => sum + w, 0) + widths.length * size * tracking;
    return { widths, total };
  };

  let laid = layout();
  while (size > 10 && laid.total > width * 0.8) {
    size -= 1;
    laid = layout();
  }

  ctx.fillStyle = "rgba(38, 22, 20, 1)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let x = (width - laid.total) / 2;
  chars.forEach((char, index) => {
    const advance = laid.widths[index];
    ctx.fillText(char, x + advance / 2, height / 2 + size * 0.02);
    x += advance + size * tracking;
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Retypes one of the phone-number quads.
 *
 * The four source quads are coplanar with the door panels — which is why what
 * you actually see in the render is the number baked into the panel texture —
 * and two of them are rolled a few degrees. So rather than reusing them, each
 * plate is rebuilt in the stage's own frame: centred on its quad, squared to
 * the face it belongs to, and pushed a hair proud of the panel so it is never
 * z-fighting with it.
 */
function retypeLettering(
  mesh: Mesh,
  text: string,
  modelCenter: Vector3,
  stage: Group,
  anisotropy: number
) {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  const size = box.getSize(new Vector3());
  const axes: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  const flat = axes.reduce((best, axis) => (size[axis] < size[best] ? axis : best), "x" as "x" | "y" | "z");
  const [u, v] = axes.filter((axis) => axis !== flat);
  if (size[u] <= 0 || size[v] <= 0) return;


  // The source quads are a thin strip through the middle of the digits, so the
  // plate is grown off that strip until it covers the whole baked number and
  // sits inside the recessed plaque on the door.
  const axisScale = mesh.matrixWorld.getMaxScaleOnAxis();
  const worldWidth = size[u] * axisScale * 1.2;
  const worldHeight = size[v] * axisScale * 4.9;
  if (worldWidth <= 0 || worldHeight <= 0) return;

  const texture = makePlateTexture(text, worldWidth / worldHeight, anisotropy);
  if (!texture) return;

  const worldCenter = box.getCenter(new Vector3()).applyMatrix4(mesh.matrixWorld);
  // Faces are vertical, so only the horizontal part of the offset may define
  // the plate's normal — otherwise a quad sitting near the base would end up
  // tilted downwards into the door.
  const outward = new Vector3(worldCenter.x - modelCenter.x, 0, worldCenter.z - modelCenter.z);
  if (outward.lengthSq() < 1e-10) return;
  outward.normalize();

  // Stage-local space: the stage carries the normalising uniform scale, so
  // sizes are converted once and everything else is a plain direction.
  const unit = 1 / Math.abs(stage.scale.x || 1);
  const centerLocal = stage.worldToLocal(worldCenter.clone());

  const plateGeometry = new PlaneGeometry(worldWidth * unit, worldHeight * unit);
  const right = new Vector3(0, 1, 0).cross(outward).normalize();
  const up = outward.clone().cross(right).normalize();
  // Unlit on purpose: the plate is printed enamel, and a lit material washes
  // the lettering out under the key light.
  const plate = new Mesh(
    plateGeometry,
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
  );
  plate.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right, up, outward));
  plate.position.copy(centerLocal).addScaledVector(outward, 0.004 * unit);
  plate.renderOrder = 6;
  stage.add(plate);
}

export async function mountBooth(host: HTMLElement, options: BoothOptions): Promise<BoothHandle> {
  const spin = options.reduceMotion ? 0 : (options.spin ?? 0.16);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const canvas = renderer.domElement;
  canvas.className = "contact-booth-webgl";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 40);
  const cameraTarget = new Vector3(0, 0.48, 0);
  camera.position.set(0, 0.56, 2.16);
  camera.lookAt(cameraTarget);

  // Studio-ish lighting: a warm key from the page's right, a cool fill and a
  // rim that separates the dark timber from the white contact sheet.
  const hemi = new HemisphereLight(0xffffff, 0x2b2b2b, 0.78);
  const key = new DirectionalLight(0xfff3e2, 1.85);
  key.position.set(2.6, 3.4, 2.9);
  const fill = new DirectionalLight(0xc2d8ff, 0.55);
  fill.position.set(-3.2, 1.3, 1.7);
  const rim = new DirectionalLight(0xffffff, 0.85);
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

  const lettering: Mesh[] = [];
  model.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standard = material as MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial) continue;
      standard.envMapIntensity = 0.32;
      if (standard.map) standard.map.anisotropy = maxAnisotropy;
      if (standard.normalMap) standard.normalMap.anisotropy = maxAnisotropy;
      if (standard.metalnessMap) standard.metalnessMap.anisotropy = maxAnisotropy;
    }
    // The four phone-number quads are the only untextured lettering meshes.
    const untextured = materials.every((material) => !(material as MeshStandardMaterial).map);
    if (untextured && /^Text\d*$/.test(mesh.name)) lettering.push(mesh);
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

  if (options.plateText) {
    scene.updateMatrixWorld(true);
    const modelCenter = new Box3().setFromObject(model).getCenter(new Vector3());
    for (const mesh of lettering) retypeLettering(mesh, options.plateText, modelCenter, stage, maxAnisotropy);
  }

  // Framing: instead of guessing a fill factor from the bounding box, project
  // the real silhouette at a sweep of yaw angles and pull the camera back
  // until every point is inside the frame. The projection is monotonic in
  // distance, so a bisection converges in a dozen steps, and it adapts to any
  // canvas aspect ratio (the booth column is a different shape on phones).
  const silhouetteCorners: Vector3[] = [];

  const measure = (yawTest: number, distance: number) => {
    pivot.rotation.y = yawTest;
    camera.position.set(0, CAMERA_HEIGHT, distance);
    camera.lookAt(cameraTarget);
    camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true);
    silhouetteCorners.length = 0;
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (materials.every((material) => !material.visible)) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      if (!box) return;
      for (let i = 0; i < 8; i += 1) {
        silhouetteCorners.push(
          new Vector3(
            i & 1 ? box.max.x : box.min.x,
            i & 2 ? box.max.y : box.min.y,
            i & 4 ? box.max.z : box.min.z
          ).applyMatrix4(mesh.matrixWorld)
        );
      }
    });
    let worst = 0;
    const projected = new Vector3();
    for (const corner of silhouetteCorners) {
      projected.copy(corner).project(camera);
      worst = Math.max(worst, Math.abs(projected.x), Math.abs(projected.y));
    }
    return worst;
  };

  const fitDistance = (aspect: number) => {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    let near = 1.2;
    let far = 10;
    for (let step = 0; step < 13; step += 1) {
      const mid = (near + far) / 2;
      let worst = 0;
      // A quarter turn covers every distinct silhouette of a box.
      for (let degrees = 0; degrees <= 90; degrees += 15) {
        worst = Math.max(worst, measure(MathUtils.degToRad(degrees), mid));
      }
      if (worst > SILHOUETTE_FILL) near = mid;
      else far = mid;
    }
    return far;
  };

  const frameCamera = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    const distance = fitDistance(width / height);
    camera.position.set(0, CAMERA_HEIGHT, distance);
    camera.lookAt(cameraTarget);
    camera.updateProjectionMatrix();
    pivot.rotation.y = 0;
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

  // QA hook: freeze the self-rotation at a given yaw so screenshots are
  // reproducible. Development only — never shipped.
  let yawOverride: number | null = null;
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __boothYaw?: (v: number | null) => void }).__boothYaw = (v) => {
      yawOverride = v;
    };
  }

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

    pivot.rotation.y = yawOverride ?? (yaw + dragYaw);
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
