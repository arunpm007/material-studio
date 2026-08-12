import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

export type MatConfig = { color: string; metalness: number; roughness: number };
export type PartInfo = { name: string } & MatConfig;
export type Overrides = Record<string, MatConfig>;

function readMat(m: THREE.Material): MatConfig {
  const s = m as THREE.MeshStandardMaterial;
  return {
    color: s.color ? `#${s.color.getHexString()}` : "#cccccc",
    metalness: typeof s.metalness === "number" ? s.metalness : 0,
    roughness: typeof s.roughness === "number" ? s.roughness : 0.5,
  };
}

function applyMat(m: THREE.Material, c: MatConfig) {
  const s = m as THREE.MeshStandardMaterial;
  if (s.color && c.color) s.color.set(c.color);
  if ("metalness" in s) s.metalness = c.metalness;
  if ("roughness" in s) s.roughness = c.roughness;
  s.needsUpdate = true;
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
  onParts,
}: {
  url: string;
  overrides: Overrides;
  onParts: (p: PartInfo[]) => void;
}) {
  const gltf = useGLTF(url);

  // Clone scene + materials so we never mutate the cached original.
  const cloned = useMemo(() => {
    const c = gltf.scene.clone(true);
    let i = 0;
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if ((mesh as unknown as { isMesh?: boolean }).isMesh && mesh.material) {
        if (!mesh.name) mesh.name = `Mesh_${i}`;
        i++;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : mesh.material.clone();
      }
    });
    return c;
  }, [gltf.scene]);

  // Discover parts once per model.
  useEffect(() => {
    const parts: PartInfo[] = [];
    const seen = new Set<string>();
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.Material | undefined;
      if ((mesh as unknown as { isMesh?: boolean }).isMesh && mat && !Array.isArray(mat)) {
        if (seen.has(mesh.name)) return;
        seen.add(mesh.name);
        parts.push({ name: mesh.name, ...readMat(mat) });
      }
    });
    onParts(parts);
  }, [cloned, onParts]);

  // Apply overrides whenever they change.
  useEffect(() => {
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.Material | undefined;
      if ((mesh as unknown as { isMesh?: boolean }).isMesh && mat && !Array.isArray(mat)) {
        const c = overrides[mesh.name];
        if (c) applyMat(mat, c);
      }
    });
  }, [cloned, overrides]);

  const ref = useNormalized(cloned);
  return (
    <group ref={ref}>
      <primitive object={cloned} />
    </group>
  );
}

// ---------------------------------------------------------------- Demo

const DEMO_PARTS: PartInfo[] = [
  { name: "body", color: "#3b82f6", metalness: 0.15, roughness: 0.35 },
  { name: "ring", color: "#e5e7eb", metalness: 1, roughness: 0.22 },
  { name: "base", color: "#111827", metalness: 0.2, roughness: 0.85 },
];

function DemoModel({
  overrides,
  onParts,
}: {
  overrides: Overrides;
  onParts: (p: PartInfo[]) => void;
}) {
  useEffect(() => onParts(DEMO_PARTS), [onParts]);
  const get = (name: string) =>
    overrides[name] ?? DEMO_PARTS.find((p) => p.name === name)!;
  const body = get("body");
  const ring = get("ring");
  const base = get("base");

  return (
    <group>
      <mesh name="body" castShadow position={[0, 0.2, 0]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          color={body.color}
          metalness={body.metalness}
          roughness={body.roughness}
          flatShading
        />
      </mesh>
      <mesh name="ring" castShadow rotation={[Math.PI / 2.4, 0, 0]} position={[0, 0.2, 0]}>
        <torusGeometry args={[1.4, 0.08, 24, 80]} />
        <meshStandardMaterial
          color={ring.color}
          metalness={ring.metalness}
          roughness={ring.roughness}
        />
      </mesh>
      <mesh name="base" receiveShadow castShadow position={[0, -1.15, 0]}>
        <cylinderGeometry args={[1.05, 1.3, 0.22, 56]} />
        <meshStandardMaterial
          color={base.color}
          metalness={base.metalness}
          roughness={base.roughness}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- Wrapper

export default function Model({
  url,
  overrides,
  onParts,
}: {
  url: string | null;
  overrides: Overrides;
  onParts: (p: PartInfo[]) => void;
}) {
  const stableOnParts = useCallback(onParts, [onParts]);
  if (url)
    return <GLBModel url={url} overrides={overrides} onParts={stableOnParts} />;
  return <DemoModel overrides={overrides} onParts={stableOnParts} />;
}
