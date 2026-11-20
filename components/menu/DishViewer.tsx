"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import type { Recommendation } from "@/lib/dish";
import type { DishDetails, DishModel } from "@/lib/types";

/**
 * A dish you can turn in your hands.
 *
 * The rules this component is built around:
 *
 *  - **Genuine geometry only.** It loads a GLB that someone supplied. There is
 *    no fallback that fakes depth with a spinning photograph, because a lie in
 *    3D is still a lie on a menu.
 *  - **Nothing loads until someone asks.** `three` itself is imported inside
 *    the effect, so the menu's first paint carries no renderer, no loaders and
 *    no model. A customer who never taps a dish downloads none of it.
 *  - **Failure is a first-class state.** A dead URL, a Draco file with no
 *    decoder, a phone without WebGL: each one says what happened and leaves the
 *    price, the description and the rest of the menu exactly where they were.
 *  - **Prices are not this component's business.** Recommendations are menu
 *    rows handed in from above; nothing here can invent one.
 */

type Stage = "loading" | "ready" | "error";

export default function DishViewer({
  name,
  dish,
  model,
  recommendations,
  onClose,
}: {
  /** Already localized by the caller — the name the customer is reading. */
  name: string;
  dish?: DishDetails;
  model: DishModel;
  /** Real rows from the same menu, chosen by `recommendations()` above. */
  recommendations: Recommendation[];
  onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const [stage, setStage] = useState<Stage>("loading");
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [touched, setTouched] = useState(false);

  // Controls the effect installs, exposed to the buttons.
  const zoomBy = useRef<((factor: number) => void) | null>(null);
  const resetView = useRef<(() => void) | null>(null);

  /* ------------------------------ three.js ------------------------------- */
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let cleanup: (() => void) | undefined;

    (async () => {
      const host = canvasHostRef.current;
      if (!host) return;

      // Loaded here, not at module scope: the menu never pays for this file
      // unless a dish was actually opened.
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");

      if (cancelled || !canvasHostRef.current) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });
      } catch {
        setStage("error");
        setProblem("This device can't show 3D. The description below still tells you what it is.");
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";

      const scene = new THREE.Scene();

      // Studio reflections, cheaply: a generated room rather than an HDR file,
      // so there is no extra download and nothing to keep in sync.
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = environment;
      scene.environmentIntensity = 0.55;

      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(0.9, 1.15, 3.1);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 1.15;
      controls.maxDistance = 6;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = Math.PI / 2.05;
      controls.autoRotateSpeed = 0.75;
      controls.target.set(0, 0.72, 0);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      controls.autoRotate = !reduced;

      // Key light with a real shadow, so the dish sits on a surface rather
      // than floating in a void.
      const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
      key.position.set(2.4, 3.6, 2.2);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.radius = 3;
      key.shadow.bias = -0.0008;
      const shadowCam = key.shadow.camera;
      shadowCam.left = -2.2;
      shadowCam.right = 2.2;
      shadowCam.top = 2.2;
      shadowCam.bottom = -2.2;
      shadowCam.near = 0.5;
      shadowCam.far = 12;
      scene.add(key);

      const rim = new THREE.DirectionalLight(0xffd9a8, 1.1);
      rim.position.set(-2.6, 2.0, -2.4);
      scene.add(rim);

      scene.add(new THREE.HemisphereLight(0xfff6ea, 0x2a1d16, 0.45));

      // A shadow-only floor: the page's cream shows through the canvas alpha,
      // so the dish appears to sit on the menu itself.
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 14),
        new THREE.ShadowMaterial({ opacity: 0.22 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0;
      floor.receiveShadow = true;
      scene.add(floor);

      const resize = () => {
        const width = host.clientWidth || 320;
        const height = host.clientHeight || 320;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(host);

      // One loop, one frame handle. Anything drawn after cleanup — or before
      // the model has loaded — is wasted work that keeps the tab warm.
      const loop = () => {
        if (cancelled) return;
        frame = requestAnimationFrame(loop);
        controls.update();
        renderer.render(scene, camera);
      };

      const disposeObject = (root: InstanceType<typeof THREE.Object3D>) => {
        root.traverse((child) => {
          const mesh = child as InstanceType<typeof THREE.Mesh>;
          if (mesh.geometry) mesh.geometry.dispose();
          const material = mesh.material as unknown;
          const materials = Array.isArray(material) ? material : material ? [material] : [];
          for (const entry of materials) {
            const textured = entry as InstanceType<typeof THREE.MeshStandardMaterial>;
            for (const value of Object.values(textured)) {
              if (value && typeof value === "object" && "isTexture" in value) {
                (value as InstanceType<typeof THREE.Texture>).dispose();
              }
            }
            textured.dispose?.();
          }
        });
      };

      cleanup = () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        disposeObject(scene);
        environment.dispose();
        pmrem.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      };

      const loader = new GLTFLoader();
      loader.load(
        model.glb,
        (gltf) => {
          if (cancelled) return;

          const root = gltf.scene;
          root.traverse((child) => {
            const mesh = child as InstanceType<typeof THREE.Mesh>;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              // Many exporters ship unlit or double-sided materials; forcing
              // them to respond to the studio light is what makes it read as a
              // photographable plate rather than a game asset.
              const material = mesh.material as InstanceType<typeof THREE.MeshStandardMaterial>;
              if (material && "envMapIntensity" in material) material.envMapIntensity = 0.8;
            }
          });

          // Scale and centre whatever came in — a 40 cm bowl and a 4 m tower
          // should both fill the same frame.
          const box = new THREE.Box3().setFromObject(root);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          const longest = Math.max(size.x, size.y, size.z) || 1;
          const scale = 1.9 / longest;

          root.position.sub(center);
          root.scale.setScalar(scale);
          root.position.multiplyScalar(scale);
          // Sit the base on the floor no matter how the model was authored.
          const boxed = new THREE.Box3().setFromObject(root);
          root.position.y -= boxed.min.y;

          scene.add(root);
          setStage("ready");
        },
        (event) => {
          if (cancelled) return;
          if (event.total) setProgress(Math.min(1, event.loaded / event.total));
        },
        (error) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : "";
          setStage("error");
          setProblem(
            /DRACO/i.test(message)
              ? "This model is Draco-compressed and needs a decoder we don't ship. Export it uncompressed and it will load."
              : "This model couldn't be loaded. The dish, its price and the rest of the menu are unaffected.",
          );
          console.warn(`[dish-3d] ${message.slice(0, 200)}`);
        },
      );

      zoomBy.current = (factor: number) => {
        const offset = camera.position.clone().sub(controls.target);
        const distance = offset.length() * factor;
        const clamped = Math.min(Math.max(distance, controls.minDistance), controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setLength(clamped));
        controls.update();
      };

      resetView.current = () => {
        camera.position.set(0.9, 1.15, 3.1);
        controls.target.set(0, 0.72, 0);
        controls.update();
      };

      renderer.domElement.addEventListener("pointerdown", () => setTouched(true), { once: true });

      // Kick a first paint immediately so the stage isn't blank while the
      // model streams in.
      loop();
    })().catch((error: unknown) => {
      setStage("error");
      setProblem("3D couldn't start on this device. Everything else on the menu still works.");
      console.warn(`[dish-3d] ${error instanceof Error ? error.message : "unknown"}`);
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [model.glb]);

  /* ------------------------------ chrome -------------------------------- */
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const node = stageRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void node.requestFullscreen?.().catch(() => {
        setProblem("Full screen isn't available here — the viewer is still usable.");
      });
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-900/45 px-3 py-4 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={stageRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} in 3D`}
        className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-espresso-900/10 bg-cream-50 shadow-[0_40px_90px_-40px_rgba(36,24,18,0.75)]"
      >
        <header className="flex items-start gap-2 border-b border-espresso-900/[0.08] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-caramel-600">
              3D dish
            </p>
            <h2 className="mt-0.5 break-words font-display text-[17px] font-semibold leading-tight text-espresso-900">
              {name}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close the 3D view"
            className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-espresso-900/[0.12] bg-white/70 text-espresso-700 hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="relative">
          <div
            ref={canvasHostRef}
            className="h-[46vh] min-h-[240px] w-full bg-[radial-gradient(120%_90%_at_50%_0%,#fffdf8_0%,#f6ead9_55%,#ead6bd_100%)]"
          />

          {stage === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-espresso-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <p className="text-[11px] font-medium" role="status">
                {progress > 0 && progress < 1
                  ? `Loading the model — ${Math.round(progress * 100)}%`
                  : "Loading the model…"}
              </p>
            </div>
          )}

          {stage === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              {model.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={model.poster}
                  alt={name}
                  className="h-[26vh] w-auto rounded-lg object-cover shadow-[0_16px_30px_-22px_rgba(36,24,18,0.8)]"
                  loading="lazy"
                />
              ) : (
                <AlertCircle className="h-5 w-5 text-caramel-600" aria-hidden />
              )}
              <p className="mt-1 max-w-[34ch] text-[11px] leading-[1.6] text-espresso-600">
                {problem}
              </p>
            </div>
          )}

          {stage === "ready" && (
            <>
              <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] font-medium text-espresso-500">
                {touched ? "Drag to turn · pinch to zoom" : "Drag the dish to turn it"}
              </p>
              <div className="absolute right-2 top-2 flex flex-col gap-1.5">
                <IconButton label="Zoom in" onClick={() => zoomBy.current?.(0.82)}>
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
                <IconButton label="Zoom out" onClick={() => zoomBy.current?.(1.22)}>
                  <ZoomOut className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
                <IconButton label="Reset the view" onClick={() => resetView.current?.()}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
                <IconButton
                  label={fullscreen ? "Leave full screen" : "View full screen"}
                  onClick={toggleFullscreen}
                >
                  {fullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                </IconButton>
              </div>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {dish?.description && (
            <p className="text-[12.5px] leading-[1.65] text-espresso-700">{dish.description}</p>
          )}

          {dish && dish.ingredients.length > 0 && (
            <div className="mt-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-espresso-400">
                On the plate
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {dish.ingredients.map((ingredient) => (
                  <li
                    key={ingredient}
                    className="rounded-full border border-espresso-900/[0.12] bg-white/70 px-2 py-[3px] text-[10.5px] text-espresso-700"
                  >
                    {ingredient}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[9.5px] leading-[1.5] text-espresso-400">
                What&apos;s visible in the photo — ask the counter about allergens.
              </p>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="mt-3 border-t border-espresso-900/[0.08] pt-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-espresso-400">
                Also on the menu
              </p>
              <ul className="mt-1.5 space-y-1">
                {recommendations.map((entry) => (
                  <li
                    key={`${entry.item.category}-${entry.item.name}-${entry.index}`}
                    className="flex items-baseline gap-2 text-[11.5px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-espresso-800">
                      {entry.item.name}
                    </span>
                    <span className="shrink-0 text-[9.5px] uppercase tracking-[0.1em] text-espresso-400">
                      {entry.note}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-espresso-700">
                      {entry.item.price}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="tap flex h-8 w-8 items-center justify-center rounded-lg border border-espresso-900/[0.12] bg-white/80 text-espresso-700 shadow-[0_6px_14px_-12px_rgba(36,24,18,0.8)] hover:border-espresso-900/30 hover:text-espresso-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500/45"
    >
      {children}
    </button>
  );
}
