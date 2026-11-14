import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Arena, colors, hex } from './arena';
import type { Planet } from './arena';
import { Effects, Sound } from './effects';
import { STEP, FINISH_DISTANCE, compareFlights, contactTime, createFlight, launchFlight, parseNames, stepFlights } from './simulation';
import type { Flight } from './simulation';
import './style.css';

type Racer = Flight & { color: number; mesh: THREE.Mesh; tag: THREE.Sprite; trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; trailPoints: Float32Array; row: HTMLLIElement };
type Phase = 'idle' | 'countdown' | 'windup' | 'swing' | 'followthrough' | 'flight' | 'settle' | 'results';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = $('viewport'), namesInput = $<HTMLTextAreaElement>('names');
const startButton = $<HTMLButtonElement>('start-race'), resetButton = $<HTMLButtonElement>('reset-race');
const sound = new Sound();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b17);
scene.fog = new THREE.FogExp2(0x080f20, .00135);
const camera = new THREE.PerspectiveCamera(54, 1, .1, 1500);
const cameraPosition = new THREE.Vector3(16, 11, -30), cameraTarget = new THREE.Vector3(3, 1, 6);
const desiredPosition = new THREE.Vector3(), desiredTarget = new THREE.Vector3(), projection = new THREE.Vector3();
const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), cullSphere = new THREE.Sphere();
let renderer: THREE.WebGLRenderer, composer: EffectComposer, arena: Arena, effects: Effects;
let phase: Phase = 'idle', phaseTime = 0, showTime = 0, elapsed = 0, accumulator = 0;
let ready = false, struck = false, totalDestroyed = 0, hitStop = 0, slowMotion = 0, shake = 0, flash = 0, impactCooldown = 0;
let cueLife = 0, impactLife = 0, uiClock = 0, cullClock = 0, lastTick = -1, lastLeader = -1, leaderHold = 0;
let focus: Racer | null = null, impactFocus = new THREE.Vector3(), impactFocusLife = 0;
let chargeParticles = 0;
const racers: Racer[] = [];
const clock = new THREE.Clock();

function status(text: string) { $('status-label').textContent = text; }
function setPhase(next: Phase) {
  phase = next; phaseTime = 0; document.body.dataset.phase = next;
  $('event-label').textContent = ({ idle: 'STANDBY', countdown: 'GET READY', windup: 'CHARGING', swing: 'FULL SWING', followthrough: 'LIFT OFF', flight: 'IN FLIGHT', settle: 'FINAL RESULTS', results: 'COMPLETE' })[next];
}
function cue(kicker: string, title: string, detail = '', duration = 1.1) {
  $('cue-kicker').textContent = kicker; $('cue-title').textContent = title; $('cue-detail').textContent = detail;
  $('scene-cue').classList.remove('hidden'); cueLife = duration;
}
function feed(title: string, detail: string, color = '#73d9ef') {
  const item = document.createElement('div'), label = document.createElement('b'), body = document.createElement('span');
  item.className = 'feed-item'; label.textContent = title; label.style.color = color; body.textContent = detail;
  item.append(label, body); $('event-feed').prepend(item);
  while ($('event-feed').children.length > 5) $('event-feed').lastElementChild?.remove();
}
function makeTag(name: string, color: number) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#06101cda'; ctx.strokeStyle = hex(color) + '99'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(8, 8, 496, 96, 25); ctx.fill(); ctx.stroke();
  ctx.fillStyle = hex(color); ctx.beginPath(); ctx.arc(43, 56, 9, 0, Math.PI * 2); ctx.fill();
  ctx.font = '700 40px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  const characters = Array.from(name), label = characters.length > 16 ? characters.slice(0, 15).join('') + '…' : name;
  ctx.fillText(label, 68, 58, 418);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  tag.scale.set(3.9, .85, 1); tag.renderOrder = 8; return tag;
}
function clearRacers() {
  for (const racer of racers) {
    scene.remove(racer.mesh, racer.tag, racer.trail);
    // Arena geometries are shared; only racer-owned materials/textures are released.
    racer.mesh.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    racer.tag.material.map?.dispose(); racer.tag.material.dispose(); racer.trail.geometry.dispose(); racer.trail.material.dispose();
  }
  racers.length = 0; focus = null; $('leaderboard').replaceChildren();
}
function createRoster() {
  clearRacers();
  parseNames(namesInput.value).forEach((name, index) => {
    const flight = createFlight(name, index), color = colors[index], mesh = arena.makeBall(color), tag = makeTag(name, color);
    const trailPoints = new Float32Array(48 * 3), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(trailPoints, 3).setUsage(THREE.DynamicDrawUsage));
    const trail = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false }));
    trail.frustumCulled = false; trail.visible = false; mesh.position.copy(flight.position); tag.position.copy(mesh.position).y += 1.05;
    const row = document.createElement('li');
    row.innerHTML = '<span class="rank"></span><i class="marble-swatch"></i><span class="racer-name"></span><span class="racer-score"><b></b><small></small></span>';
    row.querySelector<HTMLElement>('.racer-name')!.textContent = name;
    row.querySelector<HTMLElement>('.marble-swatch')!.style.setProperty('--ball', hex(color));
    row.title = name; $('leaderboard').append(row);
    racers.push({ ...flight, color, mesh, tag, trail, trailPoints, row }); scene.add(mesh, tag, trail);
  });
  updateLeaderboard();
}
function updateCount() {
  const rawCount = namesInput.value.split(/\r?\n/).filter(name => name.trim()).length, count = Math.min(30, rawCount);
  $('name-count').textContent = `${count.toString().padStart(2, '0')} / 30`;
  startButton.disabled = !ready || count < 2 || phase !== 'idle';
  $('validation').textContent = rawCount > 30 ? '앞의 30명으로 진행합니다.' : count < 2 ? '이름을 한 줄에 한 명씩, 2–30명 입력하세요.' : `${count}명 탑승 준비 완료 · 시작하면 자동으로 진행됩니다.`;
  $('validation').className = count >= 2 ? 'validation good' : 'validation';
  if (ready && phase === 'idle') createRoster();
}
function updateLeaderboard() {
  const sorted = [...racers].sort(compareFlights);
  sorted.forEach((racer, index) => {
    racer.row.querySelector('.rank')!.textContent = (index + 1).toString().padStart(2, '0');
    racer.row.querySelector('.racer-score b')!.textContent = `${racer.planets} ✦`;
    racer.row.querySelector('.racer-score small')!.textContent = `${Math.round(racer.distance)} m`;
    racer.row.classList.toggle('is-leader', index === 0 && struck);
    racer.row.classList.toggle('is-focus', racer === focus);
    racer.row.classList.toggle('is-done', racer.done);
    racer.row.title = `${racer.name} · ${racer.planets}개 파괴 · ${Math.round(racer.distance)} m`;
    if ($('leaderboard').children[index] !== racer.row) $('leaderboard').insertBefore(racer.row, $('leaderboard').children[index] || null);
  });
  $('roster-total').textContent = String(racers.length).padStart(2, '0');
  $('finished-count').textContent = `${racers.filter(racer => racer.done).length} / ${racers.length}`;
  $('remaining-count').textContent = String(totalDestroyed).padStart(2, '0');
  if (sorted.length && struck) {
    const leader = sorted[0];
    $('leader-name').textContent = leader.name; $('leader-score').textContent = `${leader.planets} ✦`;
    if (lastLeader !== -1 && lastLeader !== leader.index && leaderHold <= 0 && phase === 'flight') {
      feed('LEAD CHANGE', `${leader.name} · ${leader.planets}개 파괴`, hex(leader.color));
      cue('순위 역전', 'NEW LEADER', leader.name, 1); leaderHold = 2.5;
    }
    lastLeader = leader.index;
  }
  if (!racers.length && !$('leaderboard').children.length) {
    const empty = document.createElement('li'); empty.className = 'empty-row'; empty.textContent = '탑승할 학생들을 기다리고 있어요.'; $('leaderboard').append(empty);
  }
}
function strike() {
  if (struck) return;
  struck = true; sound.impact(true); shake = reducedMotion ? .2 : 1.65; flash = .8; hitStop = .095; slowMotion = .26;
  for (const racer of racers) {
    launchFlight(racer);
    for (let i = 0; i < 48; i++) racer.trailPoints.set([racer.position.x, racer.position.y, racer.position.z], i * 3);
    racer.trail.geometry.getAttribute('position').needsUpdate = true; racer.trail.visible = true;
  }
  effects.burst({ x: 5.5, y: 1.1, z: 0 }, 0xffce88, 2.6, true);
  $('charge-value').textContent = '100'; $('charge-fill').style.transform = 'scaleX(1)';
  cue('PERFECT CONTACT', 'BIG BANG!', `${racers.length}개의 궤적, 단 한 번의 스윙.`, 1.05);
  status('ALL BALLS AIRBORNE'); feed('BIG BANG', `${racers.length}명, 은하를 향해 출발!`, '#ffcf86');
}
function smashPlanet(planet: Planet, racer: Racer) {
  planet.mesh.visible = false; totalDestroyed++;
  effects.burst(planet.position, planet.color, planet.radius); sound.impact();
  if (impactCooldown <= 0) { hitStop = .052; slowMotion = .16; impactCooldown = .22; }
  shake = Math.max(shake, reducedMotion ? .1 : .6); flash = Math.max(flash, .32);
  const worldPosition = new THREE.Vector3().copy(planet.position);
  if (camera.position.distanceTo(worldPosition) < 130) { impactFocus.copy(worldPosition); impactFocusLife = .65; }
  $('impact-name').textContent = racer.name; $('impact-score').textContent = `${racer.planets} ✦`;
  $('impact-world').textContent = `${planet.label} DESTROYED`;
  $('impact-callout').style.setProperty('--impact-color', hex(racer.color));
  $('impact-callout').classList.remove('hidden'); impactLife = 1.1;
  // A single screen callout replaces overlapping score popups in busy 30-player rounds.
  feed(`PLANET BREAK +${racer.planets}`, `${racer.name} · ${planet.label}`, hex(racer.color));
}
function updatePhase(dt: number) {
  if (phase === 'idle' || phase === 'results') return;
  if (!(phase === 'swing' && hitStop > 0)) phaseTime += dt;
  if (phase === 'countdown') {
    const tick = Math.min(2, Math.floor(phaseTime / .72));
    if (tick !== lastTick) {
      lastTick = tick; sound.tick(tick === 2); $('countdown').textContent = String(3 - tick);
      $('countdown').classList.remove('count-pop'); void $('countdown').offsetWidth; $('countdown').classList.add('count-pop');
    }
    if (phaseTime >= 2.16) { $('countdown').classList.add('hidden'); setPhase('windup'); sound.charge(); cue('REACTOR ONLINE', 'CHARGE UP', '모든 에너지가 한 점으로.', 1.35); status('BAT CHARGING'); }
  } else if (phase === 'windup') {
    const t = Math.min(1, phaseTime / 1.35), ease = t * t * (3 - 2 * t);
    arena.bat.position.set(-1 - .35 * ease, 1 + .1 * ease, -1.15);
    arena.bat.rotation.set(.16 * ease, -.3 * ease, -.3 - .52 * ease + Math.sin(phaseTime * 45) * .012 * t);
    arena.batPower.emissiveIntensity = 1.5 + t * 3;
    $('charge-value').textContent = String(Math.round(t * 100)).padStart(2, '0'); $('charge-fill').style.transform = `scaleX(${t})`;
    chargeParticles += dt;
    if (chargeParticles > .025) { chargeParticles = 0; effects.charge({ x: 5.5, y: 1.2, z: -.5 }, t, showTime); }
    if (phaseTime >= 1.35) setPhase('swing');
  } else if (phase === 'swing') {
    const t = Math.min(1, phaseTime / .48), drive = Math.min(1, t / .64), ease = drive * drive * drive;
    arena.bat.position.set(-1 + .5 * ease, 1, -1.15 + .25 * ease);
    arena.bat.rotation.set(.16 - .2 * ease, -.3 + .65 * ease, -.82 + 1.13 * ease + Math.max(0, t - .64) * 2.1);
    if (t >= .64 && !struck) strike();
    if (t >= 1) setPhase('followthrough');
  } else if (phase === 'followthrough') {
    arena.bat.rotation.z = 1.066 + .3 * (1 - Math.exp(-phaseTime * 6));
    if (phaseTime >= .7) { setPhase('flight'); status('PLANET BREAKERS IN FLIGHT'); }
  } else if (phase === 'settle') {
    if (phaseTime >= 1.7) showWinner();
  }
}
function updateFlight(dt: number) {
  if (!struck || phase === 'settle' || phase === 'results') return;
  accumulator += dt;
  while (accumulator >= STEP) {
    stepFlights(racers, arena.planets, smashPlanet); elapsed += STEP; accumulator -= STEP;
    if (hitStop > 0) { accumulator = 0; break; }
  }
  if (racers.length && racers.every(racer => racer.done)) {
    updateLeaderboard(); setPhase('settle'); status('CALCULATING FINAL RANK');
    cue('ALL FLIGHTS COMPLETE', 'WHO IS THE CHAMPION?', '마지막 궤적까지, 순위 확정 중.', 1.7);
  }
}
function drawRacers(dt: number) {
  const active = racers.filter(racer => racer.launched && !racer.done);
  const front = active.reduce((max, racer) => Math.max(max, racer.position.z), 0);
  // All balls remain visible. Names are restricted to the focus and nearby front
  // pack so thirty overlapping labels don't obscure an impact.
  for (const racer of racers) {
    const p = racer.position;
    if (!racer.launched) {
      const rise = phase === 'windup' ? Math.sin(Math.min(1, phaseTime / 1.35) * Math.PI) * 1.45 : 0;
      racer.mesh.position.set(p.x, p.y + rise + Math.sin(showTime * 1.7 + racer.index) * .08, p.z);
    } else racer.mesh.position.copy(p);
    racer.mesh.rotation.x += dt * (racer.launched ? 8 : .4); racer.mesh.rotation.z += dt * 2;
    racer.mesh.visible = !racer.done;
    racer.tag.position.copy(racer.mesh.position); racer.tag.position.y += racer === focus ? 1.25 : .95;
    const labelHeight = camera.position.distanceTo(racer.mesh.position) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 34 / Math.max(1, viewport.clientHeight);
    racer.tag.scale.set(labelHeight * 512 / 112, labelHeight, 1);
    racer.tag.position.y = racer.mesh.position.y + .9 + labelHeight * .55;
    racer.tag.visible = !racer.done && (struck ? racer === focus || (front - p.z < 40 && racers.length <= 8) : racers.length <= 6);
    if (racer.launched && !racer.done && dt > 0) {
      racer.trailPoints.copyWithin(3, 0, racer.trailPoints.length - 3); racer.trailPoints.set([p.x, p.y, p.z], 0);
      racer.trail.geometry.getAttribute('position').needsUpdate = true;
    }
    racer.trail.visible = racer.launched && !racer.done;
  }
}
function updateCamera(dt: number) {
  const active = racers.filter(racer => racer.launched && !racer.done);
  const front = active.reduce<Racer | null>((best, racer) => !best || racer.position.z > best.position.z ? racer : best, null);
  focus = front;
  const narrow = viewport.clientWidth < 600;
  let fov = 54;
  if (front) {
    const pack = active.filter(racer => front.position.z - racer.position.z < 65);
    let x = 0, y = 0;
    for (const racer of pack) { x += racer.position.x; y += racer.position.y; }
    x /= pack.length; y /= pack.length;
    const z = front.position.z;
    desiredTarget.set(x, y, z + 10);
    if (impactFocusLife > 0 && impactFocus.z > z - 20) desiredTarget.lerp(impactFocus, .23);
    desiredPosition.set(x + (narrow ? 5 : 12), y + 11, z - (narrow ? 58 : 39));
    fov = 58 + Math.min(8, front.velocity.z / 22);
    $('focus-name').textContent = front.name; $('focus-distance').textContent = `${Math.round(front.distance)} m`;
    $('focus-color').style.background = hex(front.color);
    $('speed-value').textContent = String(Math.round(Math.hypot(front.velocity.x, front.velocity.y, front.velocity.z)));
    $('flight-fill').style.transform = `scaleX(${Math.min(1, z / FINISH_DISTANCE)})`;
    $('sector-label').textContent = `SECTOR ${String(1 + Math.floor(z / 150)).padStart(2, '0')}`;
  } else if (!struck) {
    const windup = phase === 'windup' ? Math.min(1, phaseTime / 1.35) : phase === 'swing' ? 1 : 0;
    desiredPosition.set(16 - windup * 5, 11 - windup * 4, (narrow ? -43 : -30) + windup * 5);
    desiredTarget.set(3, .8, 4); fov = 54 - windup * 4;
  } else {
    desiredPosition.copy(cameraPosition); desiredTarget.copy(cameraTarget);
  }
  const ease = 1 - Math.exp(-dt * (struck ? 3.3 : 2.1));
  cameraPosition.lerp(desiredPosition, ease); cameraTarget.lerp(desiredTarget, ease);
  camera.position.copy(cameraPosition);
  if (shake > .005) {
    camera.position.x += Math.sin(showTime * 117) * shake;
    camera.position.y += Math.sin(showTime * 143 + 1) * shake * .55;
    camera.position.z += Math.cos(showTime * 97) * shake * .22;
  }
  camera.lookAt(cameraTarget); camera.fov = THREE.MathUtils.lerp(camera.fov, fov, 1 - Math.exp(-dt * 4)); camera.updateProjectionMatrix();
  updateTarget(front);
}
function updateTarget(racer: Racer | null) {
  const reticle = $('target-reticle');
  if (!racer || !['flight', 'followthrough'].includes(phase)) { reticle.classList.add('hidden'); return; }
  // A short collision-course preview creates anticipation; it never steers a ball.
  const horizon = .7, p = racer.position, v = racer.velocity;
  const ahead = { x: p.x + v.x * horizon, y: p.y + v.y * horizon - 1.2 * horizon * horizon, z: p.z + v.z * horizon };
  let closest: Planet | null = null, earliest = 1;
  for (const planet of arena.planets) {
    if (planet.destroyed || planet.position.z < p.z + 3 || planet.position.z > ahead.z + planet.radius) continue;
    const t = contactTime(p, ahead, planet.position, planet.radius + .65);
    if (t !== null && t < earliest) { earliest = t; closest = planet; }
  }
  if (!closest) { reticle.classList.add('hidden'); return; }
  camera.updateMatrixWorld(); projection.copy(closest.position).project(camera);
  if (Math.abs(projection.x) > .83 || Math.abs(projection.y) > .65 || projection.z > 1) { reticle.classList.add('hidden'); return; }
  reticle.style.left = `${(projection.x * .5 + .5) * 100}%`; reticle.style.top = `${(-projection.y * .5 + .5) * 100}%`;
  $('target-name').textContent = closest.label; reticle.classList.remove('hidden');
}
function updatePresentation(dt: number) {
  showTime += dt; impactCooldown = Math.max(0, impactCooldown - dt); leaderHold = Math.max(0, leaderHold - dt);
  impactFocusLife = Math.max(0, impactFocusLife - dt); shake *= Math.exp(-dt * 13); flash *= Math.exp(-dt * 19);
  $('impact-flash').style.opacity = String(reducedMotion ? flash * .18 : flash);
  $('speed-lines').style.opacity = struck && !['settle', 'results'].includes(phase) && !reducedMotion ? String(Math.min(.55, .13 + slowMotion * .5)) : '0';
  if (cueLife > 0) { cueLife -= dt; if (cueLife <= 0) $('scene-cue').classList.add('hidden'); }
  if (impactLife > 0) { impactLife -= dt; if (impactLife <= 0) $('impact-callout').classList.add('hidden'); }
  effects.update(dt);
  for (let i = 0; i < arena.deckRings.length; i++) {
    const ring = arena.deckRings[i]; ring.rotation.z += dt * .1 * (i % 2 ? 1 : -1);
    (ring.material as THREE.MeshBasicMaterial).opacity = .5 + Math.sin(showTime * 2 + i) * .15 + (phase === 'windup' ? .25 : 0);
  }
  for (const planet of arena.planets) if (!planet.destroyed && planet.mesh.visible) planet.mesh.rotation.y += dt * planet.spin;
  uiClock += dt;
  if (uiClock > .12) {
    uiClock = 0; updateLeaderboard();
    $('race-time').textContent = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toFixed(1).padStart(4, '0')}`;
  }
}
function showWinner() {
  setPhase('results'); sound.winner(); updateLeaderboard();
  const sorted = [...racers].sort(compareFlights), winner = sorted[0];
  $('scene-cue').classList.add('hidden'); $('impact-callout').classList.add('hidden');
  $('winner-name').textContent = winner.name; $('winner-planets').textContent = String(winner.planets);
  $('winner-distance').textContent = `${Math.round(winner.distance)} m`; $('winner-roster').textContent = String(racers.length);
  $('winner-podium').replaceChildren();
  sorted.slice(0, 3).forEach((racer, i) => {
    const row = document.createElement('li'), rank = document.createElement('span'), name = document.createElement('span'), score = document.createElement('b');
    rank.textContent = `0${i + 1}`; name.textContent = racer.name; score.textContent = `${racer.planets} ✦ · ${Math.round(racer.distance)} m`;
    row.append(rank, name, score); $('winner-podium').append(row);
  });
  $('winner-banner').classList.remove('hidden'); status('GALACTIC CHAMPION');
  feed('CHAMPION', `${winner.name} · ${winner.planets}개 파괴`, '#ffd48b');
  projection.copy(cameraTarget); effects.burst(projection, winner.color, 3, true);
  $('winner-replay').focus({ preventScroll: true });
}
function clearRound() {
  sound.stop(); effects.clear(); arena.resetWorlds();
  phaseTime = showTime = elapsed = accumulator = 0; struck = false; totalDestroyed = hitStop = slowMotion = shake = flash = 0;
  impactCooldown = cueLife = impactLife = uiClock = cullClock = impactFocusLife = leaderHold = chargeParticles = 0;
  lastTick = lastLeader = -1;
  $('countdown').classList.add('hidden'); $('scene-cue').classList.add('hidden'); $('impact-callout').classList.add('hidden'); $('winner-banner').classList.add('hidden'); $('target-reticle').classList.add('hidden');
  $('event-feed').replaceChildren(); $('race-time').textContent = '00:00.0'; $('remaining-count').textContent = '00';
  $('charge-value').textContent = '00'; $('charge-fill').style.transform = 'scaleX(0)'; $('flight-fill').style.transform = 'scaleX(0)';
  $('focus-name').textContent = '발사 대기'; $('focus-distance').textContent = '0 m'; $('leader-name').textContent = '—'; $('leader-score').textContent = '0 ✦';
  $('speed-value').textContent = '0'; $('sector-label').textContent = 'SECTOR 01'; $('impact-flash').style.opacity = '0'; $('speed-lines').style.opacity = '0';
  arena.bat.position.set(-1, 1, -1.15); arena.bat.rotation.set(0, 0, -.3); arena.batPower.emissiveIntensity = 1.5;
  cameraPosition.set(16, 11, viewport.clientWidth < 600 ? -43 : -30); cameraTarget.set(3, 1, 6); camera.fov = 54;
}
function startGame() {
  if (!ready || !['idle', 'results'].includes(phase) || parseNames(namesInput.value).length < 2) return;
  sound.open(); clearRound(); createRoster(); namesInput.disabled = true;
  document.body.classList.add('race-mode'); setPhase('countdown');
  startButton.disabled = true; resetButton.disabled = false; $('countdown').classList.remove('hidden');
  status('LAUNCH SEQUENCE'); feed('LAUNCH SEQUENCE', `${racers.length}명의 도전자, 준비 완료.`); resize();
}
function resetGame() {
  if (!ready) return;
  clearRound(); setPhase('idle'); namesInput.disabled = false; document.body.classList.remove('race-mode');
  resetButton.disabled = true; updateCount(); status('SYSTEM READY'); resize(); namesInput.focus({ preventScroll: true });
}
function resize() {
  if (!renderer) return;
  const { width, height } = viewport.getBoundingClientRect();
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); composer.setSize(w, h);
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  if (document.hidden) return;
  updatePhase(dt);
  let simulationDt = dt;
  if (hitStop > 0) { hitStop = Math.max(0, hitStop - dt); simulationDt = 0; }
  else if (slowMotion > 0) { slowMotion = Math.max(0, slowMotion - dt); simulationDt *= .38 + .62 * (1 - slowMotion / .26); }
  updateFlight(simulationDt); drawRacers(simulationDt); updateCamera(dt); updatePresentation(dt);
  cullClock += dt;
  if (cullClock > .1) {
    cullClock = 0; camera.updateMatrixWorld(); viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(viewProjection);
    for (const planet of arena.planets) {
      if (planet.destroyed) continue;
      cullSphere.center.copy(planet.position); cullSphere.radius = planet.radius * 2.1;
      planet.mesh.visible = camera.position.distanceToSquared(cullSphere.center) < 470 * 470 && frustum.intersectsSphere(cullSphere);
    }
  }
  composer.render();
}
function boot() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.4)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12; viewport.append(renderer.domElement);
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .48, .55, .95); composer.addPass(bloom); composer.addPass(new OutputPass());
  scene.add(new THREE.HemisphereLight(0xb8dcff, 0x16142e, 2.4));
  const key = new THREE.DirectionalLight(0xffeed4, 3.4); key.position.set(-18, 28, -20); scene.add(key);
  const rim = new THREE.DirectionalLight(0x728aff, 2.5); rim.position.set(25, 10, 15); scene.add(rim);
  arena = new Arena(scene); effects = new Effects(scene, arena.glow);
  namesInput.addEventListener('input', updateCount); startButton.addEventListener('click', startGame); resetButton.addEventListener('click', resetGame);
  $('winner-replay').addEventListener('click', startGame); $('winner-close').addEventListener('click', resetGame);
  $('winner-banner').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); resetGame(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      (document.activeElement === $('winner-replay') ? $('winner-close') : $('winner-replay')).focus();
    }
  });
  window.addEventListener('resize', resize); new ResizeObserver(resize).observe(viewport);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sound.stop(); clock.getDelta(); });
  ready = true; setPhase('idle'); updateCount(); resize(); status('SYSTEM READY'); requestAnimationFrame(animate);
}
try { boot(); } catch (error) {
  console.error('Cosmic Slugger initialization failed', error); status('3D ENGINE UNAVAILABLE');
  $('validation').textContent = '3D 화면을 시작하지 못했어요. 브라우저의 하드웨어 가속을 확인한 뒤 새로고침해 주세요.';
  $('validation').className = 'validation error';
}
