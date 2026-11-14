# Cosmic Slugger

A classroom spectator game for 2–30 students. Paste one name per line and start the show: one giant cosmic swing launches every student's colored ball into a destructible galaxy. Rank by planets destroyed, then farthest distance.

## Local development

```sh
npm install
npm run dev
npm test
npm run build
```

Vite serves the game at `/english/`. `npm run preview` previews the production build. The game needs WebGL; sound starts with the teacher's start/replay click. Everything runs in the browser without external assets, APIs, accounts, or a server runtime.

## Show structure

- A three-beat countdown leads into a rising reactor charge and accelerated bat swing.
- Contact triggers a short hit-stop, synthesized bass/crack, camera recoil, a glowing core, debris, and shock rings.
- Automatic flight framing, speed-dependent field of view, colored trails, readable focus labels, and live lead changes keep the race visible.
- Planet destruction uses pooled effects (600 fragments, 24 rings, 8 cores) and shared planet textures/materials. Off-screen worlds are culled.
- After all flights finish, a brief suspense beat leads to the winner and top three. Replay preserves the roster; reset returns to name editing, including during countdown or charging.
- Reduced-motion preferences soften flashes and camera shake and disable speed lines.

## Source structure

- `src/main.ts`: round state machine, camera, rendering, and UI.
- `src/arena.ts`: generated galaxy, shared surfaces, launch platform, bat, and balls.
- `src/effects.ts`: bounded reusable effects and synthesized audio.
- `src/simulation.ts`: deterministic 120 Hz ballistic flight, swept collision detection, and ranking. Presentation time does not change scores.
- `src/style.css`: responsive arena and scoreboard, with a separate bottom scoreboard on small screens.
- `scripts/simulation.test.mjs`: input limits, one launch per student, collision tunneling, contested planets, ranking, and full 2/30-student rounds at different frame rates and with pauses.

Every planet awards credit once, to the earliest contact. Names are trimmed, blank lines ignored, and the first thirty used. Student names are rendered as literal text.

## GitHub Pages

The Vite base remains `/english/` for https://dorrl.github.io/english/. `.github/workflows/deploy.yml` builds and deploys `dist/` when `develop1` is updated, or when manually dispatched. In repository Settings → Pages, select **GitHub Actions** as the source.
