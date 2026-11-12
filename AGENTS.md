# Shuffle Arena — Project Guide

## Product goal
Build a polished, classroom-friendly spectator game for 25–30 participants. A teacher pastes one participant name per line and starts an automatic 3D marble race. There are no quizzes and no player controls. The first marble to enter the finish target wins.

## Current implementation plan
1. Establish a static Vite + TypeScript + Three.js application that deploys to GitHub Pages.
2. Implement a fixed-step Rapier physics simulation for up to 30 marbles, with deterministic seeded randomness and finish-time ranking.
3. Build a branching track: a wide, forgiving main route and a narrow, steeper shortcut with a higher risk/reward profile. Routes rejoin before the finish.
4. Add a modular event/item layer for boosts, curses, shields, gusts, bumpers, and track hazards.
5. Add spectator camera modes (overview and leader follow), smooth camera motion, mouse orbit/zoom, leaderboard, event feed, countdown, and winner reveal.
6. Expand the track catalog with distinct map themes after the first map is stable.

## Architecture
- `src/main.ts`: application bootstrap, UI wiring, Three.js scene, track construction, Rapier world, race lifecycle, camera, and HUD updates.
- `src/style.css`: responsive dark arena presentation and classroom-friendly controls.
- Three.js owns rendering only; Rapier owns collision and motion. Do not fake physical movement by directly animating marble meshes.
- Use a fixed physics timestep and accumulate frame delta. Rank by the simulation timestamp at which a marble enters the finish trigger.
- Keep participant data separate from render objects. Keep map and item definitions easy to extract into modules as the project grows.

## Gameplay rules
- Each non-empty input line is one participant. Trim whitespace, ignore blank lines, and cap a heat at 30 participants.
- Every participant receives a unique, readable color and a labeled marble.
- All marbles launch automatically after a short countdown.
- The wide route is easier to enter and more stable. The shortcut is narrow and steep, so it can save time but carries a greater fall/collision risk.
- A marble that misses the course is recovered to a late recovery lane rather than silently disappearing.
- Finish order is based on authoritative simulation time, not screen position.
- Items are playful, temporary effects. No real-money mechanics or purchases.

## Quality and accessibility
- Keep the visual language clean and vibrant: strong silhouettes, restrained bloom-like accents, readable labels, and high contrast.
- Camera transitions must be damped. Mouse drag and wheel remain available for manual spectator control.
- HUD text must remain readable at typical classroom projector resolutions.
- Avoid excessive particles and expensive per-frame allocations. Reuse geometries/materials where practical.

## GitHub Pages
- This repository is hosted as a project page at `https://dorrl.github.io/english/`; Vite `base` must be `/english/`.
- The site must work as a static build with no server-side runtime or secret environment variables.
- Deploy `dist/` with GitHub Actions on pushes to `develop` and manual workflow dispatch.
- Verify with `npm run build` before considering a change complete.

## Conventions
- TypeScript, small focused functions, descriptive names, and comments for non-obvious physics decisions.
- Keep all runtime assets local or generated in code; do not depend on external APIs.
- Prefer one consolidated commit for a coherent implementation milestone.
