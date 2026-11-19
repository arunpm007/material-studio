import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Environment,
  Lightformer,
} from "@react-three/drei";
import Model, {
  type AnimState,
  type ClipInfo,
  type MatConfig,
  type Overrides,
  type PartInfo,
} from "./Model";
import { ErrorBoundary } from "./ErrorBoundary";

const SAMPLE_URL =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";
// Fox has 3 clips (Survey / Walk / Run) — ideal for demoing animation.
const ANIMATED_SAMPLE_URL =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Fox/glTF-Binary/Fox.glb";

type EnvPreset = NonNullable<ComponentProps<typeof Environment>["preset"]>;
const PRESETS: EnvPreset[] = [
  "apartment",
  "city",
  "dawn",
  "forest",
  "lobby",
  "night",
  "park",
  "studio",
  "sunset",
  "warehouse",
];

type EnvMode = "studio" | "preset" | "hdr";
type NumKey =
  | "emissiveIntensity"
  | "metalness"
  | "roughness"
  | "clearcoat"
  | "clearcoatRoughness"
  | "envMapIntensity"
  | "transmission"
  | "ior"
  | "thickness"
  | "opacity"
  | "sheen"
  | "iridescence";
type ColKey = "color" | "emissive" | "sheenColor";
type BoolKey = "wireframe" | "flatShading";

type GroupKey = "base" | "surface" | "transmission" | "effects" | "display";
// Which MatConfig fields belong to each collapsible group — drives per-group reset.
const GROUP_KEYS: Record<GroupKey, (keyof MatConfig)[]> = {
  base: ["color", "emissive", "emissiveIntensity"],
  surface: ["metalness", "roughness", "clearcoat", "clearcoatRoughness", "envMapIntensity"],
  transmission: ["transmission", "ior", "thickness", "opacity"],
  effects: ["sheen", "sheenColor", "iridescence"],
  display: ["wireframe", "flatShading"],
};

// Case-insensitive for hex strings; strict otherwise.
const sameVal = (a: unknown, b: unknown) =>
  typeof a === "string" && typeof b === "string"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;

// ---------------------------------------------------------------- small UI atoms

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
          on ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </span>
  );
}

function ResetIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
    </svg>
  );
}

function Section({
  title,
  open,
  onToggle,
  dirty,
  onReset,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  dirty?: boolean;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/30">
      <div className="flex w-full items-center px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left transition-colors hover:text-fg"
        >
          {title}
        </button>
        {dirty && onReset && (
          <button
            type="button"
            onClick={onReset}
            title={`Reset ${title}`}
            aria-label={`Reset ${title}`}
            className="mr-1 rounded p-1 text-faint transition-colors hover:text-accent-soft"
          >
            <ResetIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "Collapse section" : "Expand section"}
          className="rounded p-1 transition-colors hover:text-fg"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </div>
  );
}

/**
 * On desktop the control panel floats over the right edge of the full-bleed
 * canvas. Offset the camera frustum so the model stays centred in the *visible*
 * area (to the left of the panel) instead of drifting under it. Orbit/zoom are
 * unaffected. On mobile the panel sits below the canvas, so no offset is needed.
 */
function CenterInView() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const PANEL = 336; // ~21rem: w-80 panel (20rem) + right-4 gap (1rem)
    const floatingPanel = width >= 640; // matches the sm: layout breakpoint
    if (floatingPanel) {
      cam.setViewOffset(width, height, PANEL / 2, 0, width, height);
    } else {
      cam.clearViewOffset();
    }
    return () => cam.clearViewOffset();
  }, [camera, width, height]);

  return null;
}

// ---------------------------------------------------------------- studio

export default function ConfiguratorStudio() {
  const [mounted, setMounted] = useState(false);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [parts, setParts] = useState<PartInfo[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [baseline, setBaseline] = useState<Overrides>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [bg, setBg] = useState("#1a1712");
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // View / interaction
  const [autoRotate, setAutoRotate] = useState(true);
  const [spinSpeed, setSpinSpeed] = useState(1.1);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  // Material group disclosure
  const [groups, setGroups] = useState({
    base: false,
    surface: true,
    transmission: false,
    effects: false,
    display: false,
  });
  const toggleGroup = (k: keyof typeof groups) =>
    setGroups((g) => ({ ...g, [k]: !g[k] }));

  // Environment
  const [envMode, setEnvMode] = useState<EnvMode>("studio");
  const [envPreset, setEnvPreset] = useState<EnvPreset>("sunset");
  const [envBackground, setEnvBackground] = useState(false);
  const [hdrUrl, setHdrUrl] = useState<string | null>(null);
  const [hdrName, setHdrName] = useState<string | null>(null);
  const hdrObjectUrl = useRef<string | null>(null);
  const hdrInput = useRef<HTMLInputElement>(null);

  // Animation
  const [clips, setClips] = useState<ClipInfo[]>([]);
  const [animClip, setAnimClip] = useState<string | null>(null);
  const [animPlaying, setAnimPlaying] = useState(true);
  const [animLoop, setAnimLoop] = useState(true);
  const [animSpeed, setAnimSpeed] = useState(1);
  const [animSeek, setAnimSeek] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  const revoke = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  };
  const revokeHdr = () => {
    if (hdrObjectUrl.current) {
      URL.revokeObjectURL(hdrObjectUrl.current);
      hdrObjectUrl.current = null;
    }
  };

  // Called by the model once it knows its parts (new model → reseed + snapshot
  // the pristine baseline so every edit can be reverted).
  const handleParts = useCallback((p: PartInfo[]) => {
    setParts(p);
    const seed = () =>
      Object.fromEntries(p.map(({ name, ...cfg }) => [name, { ...cfg } as MatConfig]));
    setOverrides(seed());
    setBaseline(seed());
    setSelected((prev) =>
      prev && p.some((x) => x.name === prev) ? prev : p[0]?.name ?? null
    );
  }, []);

  // Called by the model with its animation clips (new model → reset transport).
  const handleAnimations = useCallback((c: ClipInfo[]) => {
    setClips(c);
    setAnimClip(c[0]?.name ?? null);
    setAnimPlaying(true);
    setAnimSeek(null);
  }, []);

  const handleModelError = useCallback(() => {
    setError("Couldn't load that model. Check the URL/file (CORS or format).");
    revoke();
    setModelUrl(null);
  }, []);

  const updateSel = (patch: Partial<MatConfig>) => {
    if (!selected) return;
    setOverrides((o) => ({ ...o, [selected]: { ...o[selected], ...patch } }));
  };

  const loadUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    setError(null);
    revoke();
    setModelUrl(u);
  };

  const loadSample = (url: string) => {
    setError(null);
    revoke();
    setUrlInput(url);
    setModelUrl(url);
  };

  const resetDemo = () => {
    setError(null);
    revoke();
    setUrlInput("");
    setModelUrl(null);
  };

  const loadFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!/\.(glb|gltf)$/i.test(file.name)) {
      setError("Please choose a .glb or .gltf file.");
      return;
    }
    revoke();
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setError(null);
    setUrlInput("");
    setModelUrl(url);
  };

  const loadHdr = (file: File | null | undefined) => {
    if (!file) return;
    if (!/\.(hdr|exr)$/i.test(file.name)) {
      setError("Please choose a .hdr or .exr environment file.");
      return;
    }
    revokeHdr();
    const url = URL.createObjectURL(file);
    hdrObjectUrl.current = url;
    setError(null);
    setHdrName(file.name);
    setHdrUrl(url);
    setEnvMode("hdr");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    loadFile(e.dataTransfer.files?.[0]);
  };

  useEffect(() => () => revoke(), []);
  useEffect(() => () => revokeHdr(), []);

  const configJson = useMemo(() => JSON.stringify(overrides, null, 2), [overrides]);

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard blocked — select the JSON below and copy manually.");
    }
  };

  const anim: AnimState = {
    clip: animClip,
    playing: animPlaying,
    loop: animLoop,
    speed: animSpeed,
    seek: animSeek,
  };

  const sel = selected ? overrides[selected] : null;
  const activeClip = clips.find((c) => c.name === animClip) ?? clips[0] ?? null;

  // ---- reset (revert edits to the pristine baseline) -----------------------
  const partDirty = (name: string) => {
    const cur = overrides[name];
    const base = baseline[name];
    if (!cur || !base) return false;
    return (Object.keys(cur) as (keyof MatConfig)[]).some((k) => !sameVal(cur[k], base[k]));
  };
  const groupDirty = (name: string, g: GroupKey) => {
    const cur = overrides[name];
    const base = baseline[name];
    if (!cur || !base) return false;
    return GROUP_KEYS[g].some((k) => !sameVal(cur[k], base[k]));
  };
  const anyDirty = parts.some((p) => partDirty(p.name));

  const resetAll = () =>
    setOverrides(
      Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, { ...v }]))
    );
  const resetPart = (name: string) =>
    setOverrides((o) => ({ ...o, [name]: { ...baseline[name] } }));
  const resetGroup = (name: string, g: GroupKey) =>
    setOverrides((o) => {
      const base = baseline[name];
      const patch = Object.fromEntries(
        GROUP_KEYS[g].map((k) => [k, base[k]])
      ) as Partial<MatConfig>;
      return { ...o, [name]: { ...o[name], ...patch } };
    });
  // Per-group reset props for a Section (guards the possibly-null selection).
  const groupProps = (g: GroupKey) => ({
    dirty: selected ? groupDirty(selected, g) : false,
    onReset: () => {
      if (selected) resetGroup(selected, g);
    },
  });

  // ---- material row helpers (depend on the selected part) ------------------
  const range = (label: string, key: NumKey, min = 0, max = 1, step = 0.01) => {
    if (!sel) return null;
    const val = sel[key];
    return (
      <Field
        label={
          <>
            {label}{" "}
            <span className="font-mono text-xs text-faint">{val.toFixed(2)}</span>
          </>
        }
      >
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={val}
          onChange={(e) =>
            updateSel({ [key]: parseFloat(e.target.value) } as Partial<MatConfig>)
          }
          className="w-32 cursor-pointer"
        />
      </Field>
    );
  };

  const color = (label: string, key: ColKey) => {
    if (!sel) return null;
    const val = sel[key];
    return (
      <Field label={label}>
        <span className="flex items-center gap-2">
          <input
            value={val}
            onChange={(e) =>
              updateSel({ [key]: e.target.value } as Partial<MatConfig>)
            }
            className="w-20 rounded border border-border bg-surface px-2 py-1 font-mono text-xs uppercase text-fg"
          />
          <input
            type="color"
            value={val}
            onChange={(e) =>
              updateSel({ [key]: e.target.value } as Partial<MatConfig>)
            }
            className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
          />
        </span>
      </Field>
    );
  };

  const toggle = (label: string, key: BoolKey) => {
    if (!sel) return null;
    const val = sel[key];
    return (
      <button
        type="button"
        role="switch"
        aria-checked={val}
        onClick={() => updateSel({ [key]: !val } as Partial<MatConfig>)}
        className="flex w-full items-center justify-between text-sm text-muted transition-colors hover:text-fg"
      >
        <span>{label}</span>
        <Switch on={val} />
      </button>
    );
  };

  return (
    <div
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden sm:block"
      style={{
        background: `radial-gradient(120% 120% at 50% 30%, ${bg} 0%, #0b0b0d 60%, #08080a 100%)`,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* 3D stage — sized region on mobile (top) so the model is never hidden
          behind the sheet; full-bleed behind the floating panel on ≥sm. */}
      <div className="relative min-h-0 flex-1 sm:absolute sm:inset-0 sm:flex-none">
        {mounted && (
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [3.4, 1.6, 4.4], fov: 45 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          >
            <CenterInView />
            <ambientLight intensity={0.5} />
            <directionalLight
              position={[4, 6, 4]}
              intensity={2.2}
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight position={[-5, 2, -3]} intensity={0.6} />

            <Suspense fallback={null}>
              <ErrorBoundary key={modelUrl ?? "demo"} onError={handleModelError}>
                <Model
                  url={modelUrl}
                  overrides={overrides}
                  anim={anim}
                  onParts={handleParts}
                  onAnimations={handleAnimations}
                />
              </ErrorBoundary>

              {envMode === "studio" && (
                <Environment resolution={256} background={envBackground}>
                  <Lightformer intensity={2} position={[0, 3, -2]} scale={[8, 3, 1]} />
                  <Lightformer intensity={1.3} position={[-4, 1, 2]} scale={[4, 4, 1]} />
                  <Lightformer intensity={1} position={[4, 1, 2]} scale={[4, 4, 1]} />
                </Environment>
              )}
              {envMode === "preset" && (
                <Environment preset={envPreset} background={envBackground} />
              )}
              {envMode === "hdr" && hdrUrl && (
                <Environment files={hdrUrl} background={envBackground} />
              )}
            </Suspense>

            <ContactShadows position={[0, -1.35, 0]} opacity={0.5} scale={10} blur={2.6} far={4} />

            <OrbitControls
              ref={controlsRef}
              autoRotate={autoRotate}
              autoRotateSpeed={spinSpeed}
              onStart={() => setAutoRotate(false)}
              enablePan={false}
              minDistance={2.4}
              maxDistance={9}
            />
          </Canvas>
        )}
      </div>

      {/* Drag overlay */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent/70 bg-accent/5 text-accent-soft backdrop-blur-sm">
          Drop a .glb / .gltf to load it
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-faint backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Finish · 3D Material Studio
        </span>
        <button
          type="button"
          onClick={() => controlsRef.current?.reset()}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-2 text-xs text-muted backdrop-blur-md transition-colors hover:text-fg"
          title="Reset view"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
          </svg>
          Reset view
        </button>
      </div>

      {/* Control panel — in-flow bottom sheet on mobile; floating side panel on ≥sm. */}
      <div className="pointer-events-auto z-10 w-full shrink-0 max-h-[52dvh] overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-surface/90 p-4 backdrop-blur-xl sm:absolute sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-4 sm:max-h-[calc(100dvh-2rem)] sm:w-80 sm:rounded-2xl sm:bg-surface/85 sm:p-5">
        <h1 className="font-heading text-lg font-bold text-fg">Finish</h1>
        <p className="mt-1 text-xs text-faint">
          Load any GLB, tune the full PBR set, preview animations, copy the config.
        </p>

        {/* Model loader */}
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Model</p>
          <div className="flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadUrl()}
              placeholder="Paste a .glb URL…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={loadUrl}
              className="cursor-pointer rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg transition-colors hover:bg-accent-soft"
            >
              Load
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            onChange={(e) => {
              loadFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 px-2.5 py-1.5 text-accent-soft transition-colors hover:bg-accent/20"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" />
              </svg>
              Upload .glb
            </button>
            <button type="button" onClick={() => loadSample(SAMPLE_URL)} className="cursor-pointer rounded-md border border-border bg-surface-2/50 px-2.5 py-1.5 text-muted transition-colors hover:text-fg">
              Load sample
            </button>
            <button type="button" onClick={() => loadSample(ANIMATED_SAMPLE_URL)} className="cursor-pointer rounded-md border border-border bg-surface-2/50 px-2.5 py-1.5 text-muted transition-colors hover:text-fg">
              Animated sample
            </button>
            <button type="button" onClick={resetDemo} className="cursor-pointer rounded-md border border-border bg-surface-2/50 px-2.5 py-1.5 text-muted transition-colors hover:text-fg">
              Reset to demo
            </button>
          </div>
          <p className="text-[11px] text-faint">…or drag &amp; drop a file anywhere.</p>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>

        {/* Parts */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Parts <span className="text-faint">({parts.length})</span>
            </p>
            {anyDirty && (
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-1 text-xs text-faint transition-colors hover:text-accent-soft"
                title="Reset every part to its original material"
              >
                <ResetIcon className="h-3 w-3" />
                Reset all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {parts.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setSelected(p.name)}
                className={`max-w-full truncate rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  selected === p.name
                    ? "border-accent bg-accent/15 text-accent-soft"
                    : "border-border bg-surface-2/50 text-muted hover:text-fg"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Material controls */}
        {sel && (
          <div className="mt-4 space-y-2.5">
            <Section title="Base color" open={groups.base} onToggle={() => toggleGroup("base")} {...groupProps("base")}>
              {color("Color", "color")}
              {color("Emissive", "emissive")}
              {range("Emissive glow", "emissiveIntensity", 0, 4, 0.05)}
            </Section>

            <Section title="Surface" open={groups.surface} onToggle={() => toggleGroup("surface")} {...groupProps("surface")}>
              {range("Metalness", "metalness")}
              {range("Roughness", "roughness")}
              {range("Clearcoat", "clearcoat")}
              {range("Clearcoat rough", "clearcoatRoughness")}
              {range("Reflections", "envMapIntensity", 0, 3, 0.05)}
            </Section>

            <Section title="Transmission (glass)" open={groups.transmission} onToggle={() => toggleGroup("transmission")} {...groupProps("transmission")}>
              {range("Transmission", "transmission")}
              {range("IOR", "ior", 1, 2.333, 0.01)}
              {range("Thickness", "thickness", 0, 5, 0.1)}
              {range("Opacity", "opacity")}
            </Section>

            <Section title="Effects" open={groups.effects} onToggle={() => toggleGroup("effects")} {...groupProps("effects")}>
              {range("Sheen", "sheen")}
              {color("Sheen color", "sheenColor")}
              {range("Iridescence", "iridescence")}
            </Section>

            <Section title="Display" open={groups.display} onToggle={() => toggleGroup("display")} {...groupProps("display")}>
              {toggle("Wireframe", "wireframe")}
              {toggle("Flat shading", "flatShading")}
            </Section>

            {selected && partDirty(selected) && (
              <button
                type="button"
                onClick={() => resetPart(selected)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent-soft"
              >
                <ResetIcon className="h-3.5 w-3.5" />
                Reset “{selected}” to original
              </button>
            )}
          </div>
        )}

        {/* Animation */}
        {clips.length > 0 && (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Animation</p>
            {clips.length > 1 && (
              <select
                value={animClip ?? ""}
                onChange={(e) => {
                  setAnimClip(e.target.value);
                  setAnimSeek(null);
                  setAnimPlaying(true);
                }}
                className="w-full rounded-lg border border-border bg-surface-2/60 px-2 py-2 text-sm text-fg focus:border-accent/60 focus:outline-none"
              >
                {clips.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name || "(unnamed clip)"}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAnimSeek(null);
                  setAnimPlaying((p) => !p);
                }}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg transition-colors hover:bg-accent-soft"
              >
                {animPlaying ? (
                  <>
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
                    Pause
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
                    Play
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setAnimLoop((l) => !l)}
                aria-pressed={animLoop}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  animLoop
                    ? "border-accent/50 bg-accent/10 text-accent-soft"
                    : "border-border bg-surface-2/50 text-muted hover:text-fg"
                }`}
                title="Loop"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                Loop
              </button>
            </div>
            <Field
              label={
                <>
                  Speed{" "}
                  <span className="font-mono text-xs text-faint">{animSpeed.toFixed(1)}×</span>
                </>
              }
            >
              <input
                type="range"
                min={0.1}
                max={3}
                step={0.1}
                value={animSpeed}
                onChange={(e) => setAnimSpeed(parseFloat(e.target.value))}
                className="w-32 cursor-pointer"
              />
            </Field>
            {activeClip && activeClip.duration > 0 && (
              <Field label="Scrub">
                <input
                  type="range"
                  min={0}
                  max={activeClip.duration}
                  step={activeClip.duration / 200}
                  value={animSeek ?? 0}
                  onChange={(e) => {
                    setAnimPlaying(false);
                    setAnimSeek(parseFloat(e.target.value));
                  }}
                  className="w-32 cursor-pointer"
                />
              </Field>
            )}
          </div>
        )}

        {/* Environment */}
        <div className="mt-5 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Environment</p>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface-2/40 p-1 text-xs">
            {(["studio", "preset", "hdr"] as EnvMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setEnvMode(m)}
                className={`rounded-md px-2 py-1.5 capitalize transition-colors ${
                  envMode === m ? "bg-accent font-medium text-bg" : "text-muted hover:text-fg"
                }`}
              >
                {m === "hdr" ? "HDR" : m}
              </button>
            ))}
          </div>

          {envMode === "preset" && (
            <>
              <select
                value={envPreset}
                onChange={(e) => setEnvPreset(e.target.value as EnvPreset)}
                className="w-full rounded-lg border border-border bg-surface-2/60 px-2 py-2 text-sm capitalize text-fg focus:border-accent/60 focus:outline-none"
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p} className="capitalize">
                    {p}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-faint">Presets stream an HDRI from the pmndrs CDN.</p>
            </>
          )}

          {envMode === "hdr" && (
            <>
              <input
                ref={hdrInput}
                type="file"
                accept=".hdr,.exr"
                className="hidden"
                onChange={(e) => {
                  loadHdr(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => hdrInput.current?.click()}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent-soft transition-colors hover:bg-accent/20"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" />
                </svg>
                Upload .hdr / .exr
              </button>
              <p className="truncate text-[11px] text-faint">
                {hdrName ?? "No environment loaded yet."}
              </p>
            </>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={envBackground}
            onClick={() => setEnvBackground((v) => !v)}
            className="flex w-full items-center justify-between text-sm text-muted transition-colors hover:text-fg"
          >
            <span>Show as background</span>
            <Switch on={envBackground} />
          </button>
          <Field label="Background color">
            <input
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
            />
          </Field>
        </div>

        {/* View */}
        <div className="mt-5 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">View</p>
          <button
            type="button"
            role="switch"
            aria-checked={autoRotate}
            aria-label="Auto-rotate"
            onClick={() => setAutoRotate((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <span>Auto-rotate</span>
            <Switch on={autoRotate} />
          </button>
          <Field
            label={
              <>
                Spin speed{" "}
                <span className="font-mono text-xs text-faint">{spinSpeed.toFixed(1)}</span>
              </>
            }
          >
            <input
              type="range"
              min={0}
              max={4}
              step={0.1}
              value={spinSpeed}
              onChange={(e) => setSpinSpeed(parseFloat(e.target.value))}
              className="w-32 cursor-pointer"
            />
          </Field>
          <button
            type="button"
            onClick={() => controlsRef.current?.reset()}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-muted transition-colors hover:text-fg"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
            </svg>
            Reset view
          </button>
        </div>

        {/* Export */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Export</p>
            <button
              type="button"
              onClick={copyConfig}
              className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg transition-colors hover:bg-accent-soft"
            >
              {copied ? "Copied!" : "Copy JSON"}
            </button>
          </div>
          <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-bg/70 p-3 font-mono text-[11px] leading-relaxed text-muted">
            {configJson}
          </pre>
        </div>
      </div>
    </div>
  );
}
