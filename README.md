# Cosmic Slugger

A classroom spectator game: paste 2–30 names, press **Start the Smash**, and watch a giant cosmic bat launch every student's glowing ball into a field of destructible planets.

## Local development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`; preview it with `npm run preview`.

## GitHub Pages

The Vite base path is configured for `https://dorrl.github.io/english/`. The workflow in `.github/workflows/deploy.yml` builds and deploys the static `dist/` directory whenever `develop1` is updated, or when manually dispatched. In repository Settings → Pages, select **GitHub Actions** as the build and deployment source.

## Current milestone

The first playable vertical slice includes a cinematic launch countdown, a giant animated cosmic bat, staggered launches for up to 30 students, a generated deep-space scene, destructible planets with shockwaves and debris, automatic follow camera, and a live scoreboard ranked by planets smashed and distance.
