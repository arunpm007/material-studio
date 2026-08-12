import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

// ---------------------------------------------------------------- Material model

export type MatConfig = {
  // Base
  color: string;
  emissive: string;
  emissiveIntensity: number;
  // Surface
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
  // Transmission (glass)
  transmission: number;
  ior: number;
  thickness: number;
  opacity: number;
  // Effects
  sheen: number;
  sheenColor: string;
  iridescence: number;
  // Display
  wireframe: boolean;
  flatShading: boolean;
};

export type PartInfo = { name: string } & MatConfig;
export type Overrides = Record<string, MatConfig>;
export type ClipInfo = { name: string; duration: number };

/** Playback state driven from the panel. */
export type AnimState = {
  clip: string | null;
  playing: boolean;
  loop: boolean;
  speed: number;
  /** When set, jump the active action to this time (paused scrub). */
  seek: number | null;
};

export const DEFAULT_MAT: MatConfig = {
  color: "#cccccc",
  emissive: "#000000",
  emissiveIntensity: 1,
  metalness: 0,
  roughness: 0.5,
  clearcoat: 0,
  clearcoatRoughness: 0,
  envMapIntensity: 1,
  transmission: 0,
  ior: 1.5,
  thickness: 0,
  opacity: 1,
  sheen: 0,
  sheenColor: "#000000",
  iridescence: 0,
  wireframe: false,
  flatShading: false,
};

function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return (o as THREE.Mesh).isMesh === true;
}

const hex = (c: THREE.Color | undefined, fallback: string) =>
  c ? `#${c.getHexString()}` : fallback;
const num = (v: number | undefined, fallback: number) =>
  typeof v === "number" ? v : fallback;

function readMat(m: THREE.Material): MatConfig {
  const s = m as THREE.MeshPhysicalMaterial;
  return {
    color: hex(s.color, DEFAULT_MAT.color),
    emissive: hex(s.emissive, DEFAULT_MAT.emissive),
    emissiveIntensity: num(s.emissiveIntensity, DEFAULT_MAT.emissiveIntensity),
    metalness: num(s.metalness, DEFAULT_MAT.metalness),
    roughness: num(s.roughness, DEFAULT_MAT.roughness),
    clearcoat: num(s.clearcoat, DEFAULT_MAT.clearcoat),
    clearcoatRoughness: num(s.clearcoatRoughness, DEFAULT_MAT.clearcoatRoughness),
    envMapIntensity: num(s.envMapIntensity, DEFAULT_MAT.envMapIntensity),
    transmission: num(s.transmission, DEFAULT_MAT.transmission),
    ior: num(s.ior, DEFAULT_MAT.ior),
    thickness: num(s.thickness, DEFAULT_MAT.thickness),
    opacity: num(s.opacity, DEFAULT_MAT.opacity),
    sheen: num(s.sheen, DEFAULT_MAT.sheen),
    sheenColor: hex(s.sheenColor, DEFAULT_MAT.sheenColor),
    iridescence: num(s.iridescence, DEFAULT_MAT.iridescence),
    wireframe: !!s.wireframe,
    flatShading: !!s.flatShading,
  };
}

function applyMat(m: THREE.Material, c: MatConfig) {
  const s = m as THREE.MeshPhysicalMaterial;
  const nextTransparent = c.opacity < 1 || c.transmission > 0;

  // Only a change to a "structural" feature needs a shader recompile — avoid
  // recompiling on every scalar slider tick (that would hitch while dragging).
  const needsRecompile =
    s.flatShading !== c.flatShading ||
    s.wireframe !== c.wireframe ||
    s.transparent !== nextTransparent ||
    s.transmission > 0 !== c.transmission > 0 ||
    s.sheen > 0 !== c.sheen > 0 ||
    s.iridescence > 0 !== c.iridescence > 0;

  s.color?.set(c.color);
  s.emissive?.set(c.emissive);
  s.emissiveIntensity = c.emissiveIntensity;
  s.metalness = c.metalness;
  s.roughness = c.roughness;
  s.clearcoat = c.clearcoat;
  s.clearcoatRoughness = c.clearcoatRoughness;
  s.envMapIntensity = c.envMapIntensity;
  s.transmission = c.transmission;
  s.ior = c.ior;
  s.thickness = c.thickness;
  s.opacity = c.opacity;
  s.sheen = c.sheen;
  s.sheenColor?.set(c.sheenColor);
  s.iridescence = c.iridescence;
  s.wireframe = c.wireframe;
  s.flatShading = c.flatShading;
  s.transparent = nextTransparent;

  if (needsRecompile) s.needsUpdate = true;
}

/**
 * Upgrade a material to MeshPhysicalMaterial so the full PBR set is tunable.
 * NOTE: `physical.copy(standard)` throws — MeshPhysicalMaterial.copy() reads
 * physical-only props (clearcoatNormalScale, etc.) that a standard material
 * lacks. So we copy the standard-level fields/maps by hand, which also keeps
 * the physical material's own shader defines intact.
 */
function toPhysical(m: THREE.Material): THREE.MeshPhysicalMaterial {
  // Already physical → clone to isolate from the cached original.
  if ((m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
    return (m as THREE.MeshPhysicalMaterial).clone();
  }

  const p = new THREE.MeshPhysicalMaterial();
  const s = m as THREE.MeshStandardMaterial;

  // Base material fields (present on every material).
  p.name = m.name;
  p.transparent = m.transparent;
  p.opacity = m.opacity;
  p.side = m.side;
  p.alphaTest = m.alphaTest;
  p.depthWrite = m.depthWrite;
  p.vertexColors = m.vertexColors;

  if (s.color) p.color.copy(s.color);
  if (typeof s.metalness === "number") p.metalness = s.metalness;
  if (typeof s.roughness === "number") p.roughness = s.roughness;
  if (s.emissive) p.emissive.copy(s.emissive);
  if (typeof s.emissiveIntensity === "number") p.emissiveIntensity = s.emissiveIntensity;
  if (typeof s.envMapIntensity === "number") p.envMapIntensity = s.envMapIntensity;

  // Texture maps — carry them over so the look is preserved.
  p.map = s.map ?? null;
  p.normalMap = s.normalMap ?? null;
  if (s.normalScale) p.normalScale.copy(s.normalScale);
  p.roughnessMap = s.roughnessMap ?? null;
  p.metalnessMap = s.metalnessMap ?? null;
  p.aoMap = s.aoMap ?? null;
  if (typeof s.aoMapIntensity === "number") p.aoMapIntensity = s.aoMapIntensity;
  p.emissiveMap = s.emissiveMap ?? null;
  p.alphaMap = s.alphaMap ?? null;

  p.needsUpdate = true;
  return p;
}

/** Center + scale any object so its largest dimension is ~2.4 units. */
function useNormalized(object: THREE.Object3D) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.scale.setScalar(1);
    object.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    object.position.set(-center.x, -center.y, -center.z);
    g.scale.setScalar(2.4 / maxDim);
  }, [object]);
  return ref;
}

// ---------------------------------------------------------------- GLB

function GLBModel({
  url,
  overrides,
  anim,
  onParts,
  onAnimations,
}: {
  url: string;
  overrides: Overrides;
  anim: AnimState;
  onParts: (p: PartInfo[]) => void;
  onAnimations: (c: ClipInfo[]) => void;
}) {
  const gltf = useGLTF(url);

  // Clone (skeleton-aware, so skinned/animated rigs survive) + physical materials.
  const cloned = useMemo(() => {
    const c = skeletonClone(gltf.scene);
    let i = 0;
    c.traverse((o) => {
      if (!isMesh(o) || !o.material) return;
      if (!o.name) o.name = `Mesh_${i}`;
      i++;
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = Array.isArray(o.material)
        ? o.material.map(toPhysical)
        : toPhysical(o.material);
    });
    return c;
  }, [gltf.scene]);

  const ref = useNormalized(cloned);
  const { actions, names } = useAnimations(gltf.animations, ref);

  // Discover parts once per model.
  useEffect(() => {
    const parts: PartInfo[] = [];
    const seen = new Set<string>();
    cloned.traverse((o) => {
      if (!isMesh(o)) return;
      const mat = o.material as THREE.Material | undefined;
      if (!mat || Array.isArray(mat) || seen.has(o.name)) return;
      seen.add(o.name);
      parts.push({ name: o.name, ...readMat(mat) });
    });
    onParts(parts);
  }, [cloned, onParts]);

  // Report available animation clips.
  useEffect(() => {
    onAnimations(
      gltf.animations.map((a) => ({ name: a.name, duration: a.duration }))
    );
  }, [gltf.animations, onAnimations]);

  // Apply material overrides whenever they change.
  useEffect(() => {
    cloned.traverse((o) => {
      if (!isMesh(o)) return;
      const mat = o.material as THREE.Material | undefined;
      if (!mat || Array.isArray(mat)) return;
      const c = overrides[o.name];
      if (c) applyMat(mat, c);
    });
  }, [cloned, overrides]);

  // Select / (re)configure the active clip.
  const active = anim.clip ?? names[0] ?? null;
  useEffect(() => {
    if (!active) return;
    const action = actions[active];
    if (!action) return;
    Object.values(actions).forEach((a) => a && a !== action && a.stop());
    action.reset();
    action.setLoop(anim.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !anim.loop;
    action.play();
    action.paused = !anim.playing;
    action.timeScale = anim.speed;
    return () => {
      action.stop();
    };
    // Re-run only when the clip or loop mode changes (play/pause/speed handled below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, anim.loop, actions]);

  // Live play/pause + speed without restarting the action.
  useEffect(() => {
    if (!active) return;
    const action = actions[active];
    if (!action) return;
    action.paused = !anim.playing;
    action.timeScale = anim.speed;
  }, [active, actions, anim.playing, anim.speed]);

  // Scrub to a specific time (paused).
  useEffect(() => {
    if (anim.seek == null || !active) return;
    const action = actions[active];
    if (!action) return;
    action.paused = true;
    action.time = anim.seek;
  }, [anim.seek, active, actions]);

  return (
    <group ref={ref}>
      <primitive object={cloned} />
    </group>
  );
}

// ---------------------------------------------------------------- Demo

const DEMO_PARTS: PartInfo[] = [
  { name: "body", ...DEFAULT_MAT, color: "#3b82f6", metalness: 0.15, roughness: 0.35, flatShading: true },
  { name: "ring", ...DEFAULT_MAT, color: "#e5e7eb", metalness: 1, roughness: 0.22 },
  { name: "base", ...DEFAULT_MAT, color: "#111827", metalness: 0.2, roughness: 0.85 },
];

function DemoModel({
  overrides,
  onParts,
  onAnimations,
}: {
  overrides: Overrides;
  onParts: (p: PartInfo[]) => void;
  onAnimations: (c: ClipInfo[]) => void;
}) {
  useEffect(() => onParts(DEMO_PARTS), [onParts]);
  useEffect(() => onAnimations([]), [onAnimations]);

  // Shared physical materials so the demo honours the full property set too.
  const mats = useMemo(() => {
    const make = (p: PartInfo) => {
      const m = new THREE.MeshPhysicalMaterial();
      applyMat(m, p);
      return m;
    };
    return {
      body: make(DEMO_PARTS[0]),
      ring: make(DEMO_PARTS[1]),
      base: make(DEMO_PARTS[2]),
    };
  }, []);

  useEffect(() => {
    (["body", "ring", "base"] as const).forEach((n) => {
      const c = overrides[n];
      if (c) applyMat(mats[n], c);
    });
  }, [overrides, mats]);

  return (
    <group>
      <mesh name="body" castShadow position={[0, 0.2, 0]} material={mats.body}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      <mesh
        name="ring"
        castShadow
        rotation={[Math.PI / 2.4, 0, 0]}
        position={[0, 0.2, 0]}
        material={mats.ring}
      >
        <torusGeometry args={[1.4, 0.08, 24, 80]} />
      </mesh>
      <mesh name="base" receiveShadow castShadow position={[0, -1.15, 0]} material={mats.base}>
        <cylinderGeometry args={[1.05, 1.3, 0.22, 56]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- Wrapper

export default function Model({
  url,
  overrides,
  anim,
  onParts,
  onAnimations,
}: {
  url: string | null;
  overrides: Overrides;
  anim: AnimState;
  onParts: (p: PartInfo[]) => void;
  onAnimations: (c: ClipInfo[]) => void;
}) {
  const stableOnParts = useCallback(onParts, [onParts]);
  const stableOnAnimations = useCallback(onAnimations, [onAnimations]);
  if (url)
    return (
      <GLBModel
        url={url}
        overrides={overrides}
        anim={anim}
        onParts={stableOnParts}
        onAnimations={stableOnAnimations}
      />
    );
  return (
    <DemoModel
      overrides={overrides}
      onParts={stableOnParts}
      onAnimations={stableOnAnimations}
    />
  );
}
