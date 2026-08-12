import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Environment,
  Lightformer,
} from "@react-three/drei";
import Model, {
  type Overrides,
  type PartInfo,
  type MatConfig,
} from "./Model";
import { ErrorBoundary } from "./ErrorBoundary";

const SAMPLE_URL =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export default function ConfiguratorStudio() {
  const [mounted, setMounted] = useState(false);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [parts, setParts] = useState<PartInfo[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [bg, setBg] = useState("#1a1712");
  const [autoRotate, setAutoRotate] = useState(true);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  const revoke = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  };

  // Called by the model once it knows its parts (new model → reseed).
  const handleParts = useCallback((p: PartInfo[]) => {
    setParts(p);
    setOverrides(
      Object.fromEntries(
        p.map((x) => [
          x.name,
          { color: x.color, metalness: x.metalness, roughness: x.roughness },
        ])
      )
    );
    setSelected((prev) => (prev && p.some((x) => x.name === prev) ? prev : p[0]?.name ?? null));
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

  const loadSample = () => {
    setError(null);
    revoke();
    setUrlInput(SAMPLE_URL);
    setModelUrl(SAMPLE_URL);
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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    loadFile(e.dataTransfer.files?.[0]);
  };

  useEffect(() => () => revoke(), []);

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

  const sel = selected ? overrides[selected] : null;

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden"
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
      {mounted && (
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [3.4, 1.6, 4.4], fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[4, 6, 4]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-5, 2, -3]} intensity={0.6} />

          <ErrorBoundary key={modelUrl ?? "demo"} onError={handleModelError}>
            <Model url={modelUrl} overrides={overrides} onParts={handleParts} />
          </ErrorBoundary>

          <ContactShadows position={[0, -1.35, 0]} opacity={0.5} scale={10} blur={2.6} far={4} />
          <Environment resolution={256}>
            <Lightformer intensity={2} position={[0, 3, -2]} scale={[8, 3, 1]} />
            <Lightformer intensity={1.3} position={[-4, 1, 2]} scale={[4, 4, 1]} />
            <Lightformer intensity={1} position={[4, 1, 2]} scale={[4, 4, 1]} />
          </Environment>

          <OrbitControls
            autoRotate={autoRotate}
            autoRotateSpeed={1.1}
            enablePan={false}
            minDistance={2.4}
            maxDistance={9}
          />
        </Canvas>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent/70 bg-accent/5 text-accent-soft backdrop-blur-sm">
          Drop a .glb / .gltf to load it
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-end px-5 py-4 sm:px-8">
        <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-faint backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Material Studio
        </span>
      </div>

      {/* Control panel */}
      <div className="pointer-events-auto absolute inset-x-2 bottom-2 max-h-[68vh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface/85 p-4 backdrop-blur-xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:max-h-[calc(100dvh-2rem)] sm:w-80 sm:p-5">
        <h1 className="font-heading text-lg font-bold text-fg">Material Studio</h1>
        <p className="mt-1 text-xs text-faint">
          Load any GLB, tweak each part, copy the config into your project.
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
            <button type="button" onClick={loadSample} className="cursor-pointer rounded-md border border-border bg-surface-2/50 px-2.5 py-1.5 text-muted transition-colors hover:text-fg">
              Load sample
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
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            Parts <span className="text-faint">({parts.length})</span>
          </p>
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
          <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface-2/30 p-3">
            <Field label="Color">
              <span className="flex items-center gap-2">
                <input
                  value={sel.color}
                  onChange={(e) => updateSel({ color: e.target.value })}
                  className="w-20 rounded border border-border bg-surface px-2 py-1 font-mono text-xs uppercase text-fg"
                />
                <input
                  type="color"
                  value={sel.color}
                  onChange={(e) => updateSel({ color: e.target.value })}
                  className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
                />
              </span>
            </Field>
            <Field
              label={
                <>
                  Metalness{" "}
                  <span className="font-mono text-xs text-faint">
                    {sel.metalness.toFixed(2)}
                  </span>
                </>
              }
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sel.metalness}
                onChange={(e) => updateSel({ metalness: parseFloat(e.target.value) })}
                className="w-32 cursor-pointer"
              />
            </Field>
            <Field
              label={
                <>
                  Roughness{" "}
                  <span className="font-mono text-xs text-faint">
                    {sel.roughness.toFixed(2)}
                  </span>
                </>
              }
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sel.roughness}
                onChange={(e) => updateSel({ roughness: parseFloat(e.target.value) })}
                className="w-32 cursor-pointer"
              />
            </Field>
          </div>
        )}

        {/* Scene */}
        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Scene</p>
          <Field label="Background">
            <input
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
            />
          </Field>
          <button
            type="button"
            role="switch"
            aria-checked={autoRotate}
            aria-label="Auto-rotate"
            onClick={() => setAutoRotate((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <span>Auto-rotate</span>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                autoRotate ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
                  autoRotate ? "translate-x-[1.375rem]" : "translate-x-0.5"
                }`}
              />
            </span>
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
