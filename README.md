# Shuffle Arena

A classroom spectator game: paste 2–30 names, press **Start Race**, and watch a 3D marble race with a wide main route and a narrow high-risk shortcut.

## Local development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`; preview it with `npm run preview`.

## GitHub Pages

The Vite base path is configured for `https://dorrl.github.io/english/`. The workflow in `.github/workflows/deploy.yml` builds and deploys the static `dist/` directory whenever `develop` is updated, or when manually dispatched. In repository Settings → Pages, select **GitHub Actions** as the build and deployment source.

## Current milestone

The first playable vertical slice includes the Vortex Run branching track, Rapier-based marble simulation, finish ordering, temporary random boosts/shields/curses, a live leaderboard, event feed, and overview/leader camera modes. Additional maps and more elaborate item/obstacle behaviors are planned.
