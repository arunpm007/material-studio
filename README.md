# 3D Material Studio

A developer tool for **editing 3D model materials in the browser**. Load any glTF/GLB, tweak each part's colour, metalness and roughness live, then copy the config straight into your own React Three Fiber / Three.js project.

> Live: _add your Vercel URL here_ · Part of [Arun P M's portfolio](https://arun-portfolio.vercel.app)

## Features

- **Load any model** — paste a `.glb`/`.gltf` URL, drag-and-drop a file, or load a built-in sample (static or animated). The tool traverses the model, discovers every mesh/part, and normalizes its size automatically.
- **Full-PBR per-part editing** — every part is upgraded to a `MeshPhysicalMaterial`, so you can tune the complete set with instant feedback: base **colour** + **emissive**, **metalness**, **roughness**, **clearcoat**, **reflections**, **transmission / IOR / thickness** (glass), **sheen**, **iridescence**, **opacity**, plus **wireframe** and **flat-shading** — grouped into collapsible sections.
- **Animation playback** — for rigged models, pick a clip, **play / pause**, **loop**, change **speed**, and **scrub** the timeline.
- **Hold-to-inspect** — grabbing the model instantly stops auto-spin so it holds still while you match a colour on a given face; adjustable spin speed and a one-click **Reset view**.
- **Environment lighting** — procedural **Studio** lighting, streamable **HDRI presets**, or your own **`.hdr` / `.exr`** upload, optionally shown as the background.
- **Copy the config out** — a live JSON export you can copy and drop into your own project to reproduce the exact look.
- **Resilient** — bad URLs / unsupported files are caught and reported instead of crashing.

## Using the exported config

The exported JSON is keyed by mesh name. Apply it to your own loaded model:

```ts
const overrides = {
  /* paste the copied JSON here */
};

scene.traverse((o) => {
  const c = overrides[o.name];
  const m = o.material; // a MeshStandardMaterial / MeshPhysicalMaterial
  if (!c || !m) return;

  m.color?.set(c.color);
  m.emissive?.set(c.emissive);
  m.emissiveIntensity = c.emissiveIntensity;
  m.metalness = c.metalness;
  m.roughness = c.roughness;
  m.envMapIntensity = c.envMapIntensity;
  m.wireframe = c.wireframe;
  m.flatShading = c.flatShading;
  m.opacity = c.opacity;
  m.transparent = c.opacity < 1 || c.transmission > 0;

  // Physical-only fields (apply to a MeshPhysicalMaterial):
  Object.assign(m, {
    clearcoat: c.clearcoat,
    clearcoatRoughness: c.clearcoatRoughness,
    transmission: c.transmission,
    ior: c.ior,
    thickness: c.thickness,
    sheen: c.sheen,
    iridescence: c.iridescence,
  });
  m.sheenColor?.set(c.sheenColor);
  m.needsUpdate = true;
});
```

## Tech stack

- **React 19** + **TypeScript**
- **Vite** (client-only SPA)
- **Three.js**, **React Three Fiber**, **@react-three/drei**
- **Tailwind CSS v4**

## Getting started

```bash
npm install
npm run dev      # http://localhost:3060
```

```bash
npm run build    # production build
npm run preview  # preview the build
```

## Structure

```
src/
  App.tsx
  components/
    ConfiguratorStudio.tsx   # scene, panel UI, state + export
    Model.tsx                # GLB loader / traversal / normalize / overrides
    ErrorBoundary.tsx        # catches model-load failures
  index.css                  # Tailwind v4 theme tokens
```

## Deploy

Deploys cleanly to [Vercel](https://vercel.com) as a Vite app (preset: Vite; build `npm run build`; output `dist`).

---

Built by Arun P M.
