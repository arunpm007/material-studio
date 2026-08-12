import * as THREE from "three";

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

/** Animation playback state driven from the panel. */
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

export function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return (o as THREE.Mesh).isMesh === true;
}

const hex = (c: THREE.Color | undefined, fallback: string) =>
  c ? `#${c.getHexString()}` : fallback;
const num = (v: number | undefined, fallback: number) =>
  typeof v === "number" ? v : fallback;

/** Read the tunable set off a material into a plain config. */
export function readMat(m: THREE.Material): MatConfig {
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

/** Write a config onto a material, recompiling the shader only when needed. */
export function applyMat(m: THREE.Material, c: MatConfig) {
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
export function toPhysical(m: THREE.Material): THREE.MeshPhysicalMaterial {
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
