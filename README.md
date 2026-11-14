# Cosmic Slugger

A classroom spectator game for 2–30 students. Paste one name per line and start the show: one giant cosmic swing launches every student's colored ball into a destructible galaxy. Rank by combined score: **150 points per destroyed planet + 1 point per whole forward meter**.

## Local development

```sh
npm install
npm run dev
npm test
npm run build
```

Vite serves the game at `/english/`. `npm run preview` previews the production build. The game needs WebGL; sound starts with the teacher's start/replay click. Everything runs in the browser without external assets, APIs, accounts, or a server runtime.

## Show structure

- A three-beat countdown leads into a loaded backswing, a brief brace, and an accelerating forward sweep driven from the grip pivot. The bat reaches the exact launch plane before hit-stop, then continues into a slowing, slightly raised follow-through and settles. Pose and velocity curves stay continuous between phases.
- Contact triggers a short hit-stop, synchronized swing whoosh and bass/crack, camera recoil, a glowing core, debris, and shock rings. A short bounded ribbon traces the barrel; the launch camera briefly holds the follow-through before tracking a ball.
- Automatic flight framing cycles between active students at seeded random intervals of 1.05–3.64 seconds, favoring quicker 1–2 second holds, independent of rank. The previous 3.64-second maximum is retained. Reduced-motion holds use 1.8–4.3 seconds. Camera angles are slightly closer and higher; transitions remain smooth. Colored trails, readable focus labels, and smoothly animated ranking changes keep the race visible. Announcements and decorative text are omitted.
- Off-screen planet impacts produce a quiet tremor and softer sound, without global flash, hit-stop, or camera redirection. Visible impacts retain full feedback.
- A 2,600 m map scatters 1,200 planets across a roughly 170 m wide field. Every round changes their positions, radii, colors, and rings using its seed. Free scatter and loose pockets replace regular rows; each sector includes a guaranteed lower-field population just above the -115 m disappearance floor. A spatial hash enforces surface clearance. Small, medium, and large planets have radii from 1.6 to 6.8; large planets receive fewer rings to keep the flight readable. Existing meshes and shared surfaces are reused on reset.
- The cosmic bat uses a beveled lathed metal body, studio reflections, wrapped leather grip, segmented armor, exposed energy slots, an impact collar, and a vented end cap with individual bolts. Charge particles follow its moving sweet spot; the bat and every ball align on the impact plane at launch.
- Eight animated solar stars, sixteen satellites with solar panels and dishes, and four ring-shaped space stations provide visual landmarks around the flight field. These are scenery; planet scoring remains unchanged. Model parts and materials are reused, and off-screen landmarks are culled.
- Every round seeds different left/right and upward/downward launch angles, mixing sliders, vertical curves, knuckleball oscillations, and smooth late breaks. The forces stay continuous and bounded. A fixed-step simulation preserves the same outcome for a given seed across frame rates. Different launch angles produce different flight distances; reaching the map limit is not guaranteed.
- Live ranking, the focused student's score, and the results all use one scoring function. The results include total points, destroyed planets, distance, and the formula. Equal scores favor more planets, then distance, then shorter flight time and stable input order.
- The ranking sidebar uses individual score cards, gold/silver/bronze rank badges, student-color score bars relative to the leader, a camera-focus outline, finish checkmarks, and a completion rail. Continuous position changes include brief direction arrows; reduced motion skips movement. Narrow screens use a compact, scrollable board below the arena.
- Planet destruction uses pooled effects (600 fragments, 24 rings, 8 cores) and shared planet textures/materials. Off-screen worlds are culled.
- After all flights finish, a brief suspense beat leads to the winner and top three. Replay preserves the roster; reset returns to name editing, including during countdown or charging.
- Reduced-motion preferences soften flashes and camera shake and disable speed lines.

## Source structure

- `src/main.ts`: round state machine, camera, rendering, and UI.
- `src/camera-director.ts`: rank-independent subject rotation and camera shot timing.
- `src/arena.ts`: generated galaxy, shared surfaces, launch platform, bat, and balls.
- `src/bat.ts`: detailed procedural bat geometry, reflective finishes, grip texture, energy core, and reusable swing trail.
- `src/bat-motion.ts`: shared motion timing and continuous bat pose curves, including the exact contact pose.
- `src/scenery.ts` and `src/scenery-layout.ts`: generated solar-star shaders, satellite/space-station models, bounded placement, animation, and culling.
- `src/effects.ts`: bounded reusable effects and synthesized audio.
- `src/simulation.ts`: deterministic 120 Hz ballistic flight, swept collision detection, and ranking. Presentation time does not change scores.
- `src/presentation.ts`: on-screen/off-screen impact feedback strengths.
- `src/ranking.ts`: continuous ranking animation, including updates received during a move.
- `src/style.css`: responsive arena and scoreboard, with a separate bottom scoreboard on small screens.
- `scripts/simulation.test.mjs`: bat contact direction, phase continuity and deck clearance, seeded planet placement and size variety, lower-field coverage and lateral spread, scenery bounds, camera rotation, field clearance and length, score calculation, mixed seeded launch variation, curve forces, off-screen feedback, input limits, one launch per student, collision tunneling, contested planets, ranking, and full 2/30-student rounds on randomized maps at different frame rates and with pauses.

Every planet awards credit once, to the earliest contact. Names are trimmed, blank lines ignored, and the first thirty used. Student names are rendered as literal text.

## GitHub Pages

The Vite base remains `/english/` for https://dorrl.github.io/english/. `.github/workflows/deploy.yml` builds and deploys `dist/` when `develop1` is updated, or when manually dispatched. In repository Settings → Pages, select **GitHub Actions** as the source.
