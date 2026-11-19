import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  DEFAULT_MAT,
  applyMat,
  isMesh,
  readMat,
  toPhysical,
  type AnimState,
  type ClipInfo,
  type Overrides,
  type PartInfo,
} from "./materials";

export type { AnimState, ClipInfo, MatConfig, Overrides, PartInfo } from "./materials";

/**
 * Bounds of an object, safe for skinned (animated) models.
 *
 * three.js measures a SkinnedMesh through its skeleton's bone matrices, which
 * are all zeros on a freshly cloned skeleton until the first frame renders. If
 * we measure before that, the model collapses to a point, looks "zero-sized",
 * never gets scaled down — and a rigged model like the Fox renders enormous.
 * three.js also caches that wrong box. So: refresh skeletons, drop cached
 * boxes, measure; if the result is still empty, fall back to the raw geometry.
 */
function measure(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      sm.skeleton.update();
      sm.computeBoundingBox(); // replace any box cached from zeroed bones
    }
  });
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  if (box.isEmpty() || !Number.isFinite(size.x) || Math.max(size.x, size.y, size.z) < 1e-6) {
    // Fallback: bind-pose geometry bounds, ignoring the skeleton.
    box.makeEmpty();
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const gb = mesh.geometry.boundingBox;
      if (gb) box.union(gb.clone().applyMatrix4(mesh.matrixWorld));
    });
  }
  return box;
}

/** Center + scale any object so its largest dimension is ~2.4 units. */
function useNormalized(object: THREE.Object3D) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.scale.setScalar(1);
    g.updateMatrixWorld(true);
    object.position.set(0, 0, 0);
    const box = measure(object);
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
