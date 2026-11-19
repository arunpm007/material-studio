# Finish — 3D Material Studio

A developer tool for **editing 3D model materials in the browser**. Load any glTF/GLB, tweak each part's colour, metalness and roughness live, then copy the config straight into your own React Three Fiber / Three.js project.

**Live:** [finish-3d.vercel.app](https://finish-3d.vercel.app) · Part of [Arun P M's portfolio](https://github.com/arunpm007/arunpm-portfolio)

## Features

- **Load any model** — paste a `.glb`/`.gltf` URL, drag-and-drop a file, or load a built-in sample (static or animated). The tool traverses the model, discovers every mesh/part, and normalizes its size automatically.
- **Full-PBR per-part editing** — every part is upgraded to a `MeshPhysicalMaterial`, so you can tune the complete set with instant feedback: base **colour** + **emissive**, **metalness**, **roughness**, **clearcoat**, **reflections**, **transmission / IOR / thickness** (glass), **sheen**, **iridescence**, **opacity**, plus **wireframe** and **flat-shading** — grouped into collapsible sections.
- **Revert any edit** — reset a single **group** (icon in each group header), the whole selected **part**, or **all parts** back to the model's original materials; controls only appear once something is actually changed.
- **Animation playback** — for rigged models, pick a clip, **play / pause**, **loop**, change **speed**, and **scrub** the timeline.
- **Hold-to-inspect** — grabbing the model instantly stops auto-spin so it holds still while you match a colour on a given face; auto-spin also pauses while you use the panel and resumes when you stop. Adjustable spin speed and a one-click **Reset view**.
- **Environment lighting** — procedural **Studio** lighting, streamable **HDRI presets**, or your own **`.hdr` / `.exr`** upload, optionally shown as the background.
- **Copy the config out** — a live JSON export you can copy and drop into your own project to reproduce the exact look.
- **Resilient** — bad URLs / unsupported files are caught and reported instead of crashing, and the current model and lighting stay on screen while a new model or environment loads.

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
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production build
npm run preview  # preview the build
npm run lint     # oxlint
```

Every push and pull request runs lint, type check and build in GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

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

Deployed on [Vercel](https://vercel.com) as a Vite app (preset: Vite; build `npm run build`; output `dist`). Pushes to `main` go live automatically.

## Feedback

Found a bug or have an idea? [Open an issue](https://github.com/arunpm007/material-studio/issues).

## Credits

The built-in samples are loaded from the [Khronos glTF Sample Models](https://github.com/KhronosGroup/glTF-Sample-Models) repository and are **not** covered by this project's licence:

- **Damaged Helmet** — "Battle Damaged Sci-fi Helmet – PBR" by [theblueturtle_](https://sketchfab.com/theblueturtle_), licensed [CC BY-NC](https://creativecommons.org/licenses/by-nc/4.0/) (attribution, non-commercial).
- **Fox** — low-poly model by [PixelMannen](https://opengameart.org/content/fox-and-shiba) ([CC0](https://creativecommons.org/publicdomain/zero/1.0/)); rigging and animation by [@tomkranis](https://sketchfab.com/models/371dea88d7e04a76af5763f2a36866bc) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)); glTF conversion by @AsoboStudio and @scurest.

## Licence

The code is released under the [MIT License](LICENSE). © 2026 Arun P M.
