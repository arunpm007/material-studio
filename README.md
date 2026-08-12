# 3D Material Studio

A developer tool for **editing 3D model materials in the browser**. Load any glTF/GLB, tweak each part's colour, metalness and roughness live, then copy the config straight into your own React Three Fiber / Three.js project.

> Live: _add your Vercel URL here_ · Part of [Arun P M's portfolio](https://arun-portfolio.vercel.app)

## Features

- **Load any model** — paste a `.glb`/`.gltf` URL, drag-and-drop a file, or load the built-in sample. The tool traverses the model, discovers every mesh/part, and normalizes its size automatically.
- **Per-part material editing** — pick a part and adjust **colour** (colour picker + hex), **metalness** and **roughness** with instant feedback.
- **Copy the config out** — a live JSON export you can copy and drop into your own project to reproduce the exact look.
- **Studio rendering** — procedural environment lighting (no external HDRIs), contact shadows, a customizable backdrop, and orbit + auto-rotate.
- **Resilient** — bad URLs / unsupported files are caught and reported instead of crashing.

## Using the exported config

The exported JSON is keyed by mesh name. Apply it to your own loaded model:

```ts
const overrides = {
  /* paste the copied JSON here */
};

scene.traverse((o) => {
  const c = overrides[o.name];
  if (c && o.material) {
    o.material.color?.set(c.color);
    o.material.metalness = c.metalness;
    o.material.roughness = c.roughness;
  }
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
