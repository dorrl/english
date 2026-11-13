# Cosmic Slugger — Project Guide

## Product goal
A spectacular classroom spectator game for 2–30 students. A teacher pastes one name per line and starts an automatic space-launch show. A gigantic cosmic bat hits each student's glowing ball into deep space. The farther it flies, the more planets and asteroid worlds it smashes. No quiz, login, or player controls.

## Core game loop
1. Paste 2–30 names; create a uniquely colored ball for each student.
2. A huge powered bat swings and launches balls one by one with a short rhythmic delay.
3. Each ball follows a fast ballistic flight through a colorful planetary field.
4. Colliding with a planet triggers a dramatic shatter: shockwave, glowing core, fragments, and score.
5. Keep distance and destroyed-planet counts; rank by planets destroyed, then distance.
6. End with a winner reveal and a replay button.

## Visual direction
- Arcade spectacle: deep-space backdrop, colorful nebulae, luminous launch platform, oversized industrial/cosmic bat.
- Exaggerated impacts: brief hit-stop, camera shake, expanding shock rings, sparks and debris.
- Distinct planets with rings, atmospheres, surface bands, craters, and varied palettes.
- Fast readable HUD suitable for a classroom projector.
- Camera automatically follows the active flight while keeping the next impacts visible.

## Architecture
- `src/main.ts`: Three.js scene, generated assets, launch simulation, collisions, effects, camera, and UI.
- `src/style.css`: responsive dark arcade UI.
- Three.js is the renderer. Ballistic motion is a lightweight deterministic simulation; do not introduce a server.
- Reuse geometries/materials and cap particles to keep 30 simultaneous flights smooth.

## Rules
- Trim names, ignore blank lines, cap at 30.
- Every student gets one ball and one launch.
- Each planet can be destroyed once. Rank by planets destroyed, then farthest distance.
- All effects are automatic; teacher controls only start and reset.

## Static hosting
- GitHub Pages URL: https://dorrl.github.io/english/
- Keep Vite base set to `/english/`.
- No external API, secrets, or server runtime.
- Deploy from `develop1` using GitHub Actions.
