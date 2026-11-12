import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import RAPIER from "@dimforge/rapier3d-compat";
import "./style.css";

type Racer = { name: string; color: number; body: RAPIER.RigidBody; mesh: THREE.Mesh; label: THREE.Sprite; finishedAt: number | null; recovered: boolean; shield: number; boostUntil: number; curseUntil: number };
type TrackSegment = { a: THREE.Vector3; b: THREE.Vector3; width: number; color: number };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = $("viewport");
const namesInput = $("names") as HTMLTextAreaElement;
const startButton = $("start-race") as HTMLButtonElement;
const resetButton = $("reset-race") as HTMLButtonElement;
const validation = $("validation");
const colors = [0x59d9ff,0xff806e,0xa98cff,0xffd166,0x63e6a5,0xff79bd,0x8ca8ff,0xffa65c,0x5de0d0,0xd8a2ff,0xc5e86c,0xff8c8c,0x71b8ff,0xf2a66f,0x9ce2a2,0xe7a4e8,0x6ce0f2,0xf1d26f,0xb5a0ff,0xff9e75,0x7ee0b1,0x8ca5ee,0xff7fa4,0xb7db70,0x78d6d0,0xd39bff,0xffc078,0x8bbcff,0xe6a2a2,0x9fddb3];
const FIXED_DT = 1 / 60;
const FINISH_Z = 22.2;
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let world: RAPIER.World;
let racers: Racer[] = [];
let running = false;
let elapsed = 0;
let accumulator = 0;
let lastFrame = 0;
let cameraMode: "overview" | "leader" = "overview";
let cameraTarget = new THREE.Vector3(0, 2, 5);
let feedEntries = 0;
let seed = 1;
let eventClock = 0;
let finishCount = 0;
let winnerShown = false;
const trackSegments: TrackSegment[] = [];

function seededRandom() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function addFeed(message: string) {
  const feed = $("event-feed");
  if (feedEntries === 0) feed.innerHTML = "";
  feedEntries++;
  const item = document.createElement("div");
  item.className = "feed-item";
  item.innerHTML = message;
  feed.prepend(item);
  while (feed.children.length > 7) feed.lastElementChild?.remove();
}
function setStatus(value: string) { $("status-label").textContent = value; }
function updateCount() {
  const count = namesInput.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean).length;
  $("name-count").textContent = `${count} / 30`;
  startButton.disabled = count < 2 || count > 30 || running;
  validation.textContent = count > 30 ? "Maximum 30 participants per race." : count < 2 ? "Enter at least 2 names to get started." : "Ready to roll. All racers are simulated automatically.";
  validation.className = count > 30 ? "validation error" : count >= 2 ? "validation good" : "validation";
}
function createLabel(text: string, color: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(5,12,24,.78)";
  ctx.beginPath(); ctx.roundRect(8, 8, 240, 48, 14); ctx.fill();
  ctx.strokeStyle = new THREE.Color(color).getStyle(); ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text.length > 15 ? text.slice(0,14) + "…" : text, 128, 33);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.1, .52, 1);
  return sprite;
}
function addStaticSegment(a: THREE.Vector3, b: THREE.Vector3, width: number, color = 0x243c55, rail = true) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const center = new THREE.Vector3().addVectors(a, b).multiplyScalar(.5);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
  const material = new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: .32, emissive: color, emissiveIntensity: .12 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, .34, length + .15), material);
  deck.position.copy(center); deck.quaternion.copy(rotation); deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z).setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }));
  world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, .17, length / 2 + .075).setFriction(.72).setRestitution(.08), body);
  if (rail) {
    for (const side of [-1, 1]) {
      const offset = new THREE.Vector3(side * (width / 2 + .02), .42, 0).applyQuaternion(rotation);
      const railMesh = new THREE.Mesh(new THREE.BoxGeometry(.14, .55, length), new THREE.MeshStandardMaterial({ color: 0x527d91, metalness: .65, roughness: .3, emissive: 0x143a4b, emissiveIntensity: .25 }));
      railMesh.position.copy(center).add(offset); railMesh.quaternion.copy(rotation); railMesh.castShadow = true; scene.add(railMesh);
      const railBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(railMesh.position.x, railMesh.position.y, railMesh.position.z).setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }));
      world.createCollider(RAPIER.ColliderDesc.cuboid(.07, .275, length / 2).setFriction(.5), railBody);
    }
  }
  trackSegments.push({ a, b, width, color });
}
function addBumper(position: THREE.Vector3, radius: number, color: number) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), new THREE.MeshStandardMaterial({ color, roughness: .28, metalness: .55, emissive: color, emissiveIntensity: .4 }));
  mesh.position.copy(position); mesh.castShadow = true; scene.add(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z));
  world.createCollider(RAPIER.ColliderDesc.ball(radius).setRestitution(1.05).setFriction(.1), body);
}
function addRing(position: THREE.Vector3, radius: number, color: number) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .09, 12, 72), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .8, metalness: .55, roughness: .25 }));
  ring.position.copy(position); ring.rotation.x = Math.PI / 2; scene.add(ring);
}
function buildArena() {
  const grid = new THREE.GridHelper(80, 50, 0x24405b, 0x15283d); grid.position.y = -2; scene.add(grid);
  const start = new THREE.Mesh(new THREE.BoxGeometry(10, .4, 9.5), new THREE.MeshStandardMaterial({ color: 0x1d344b, metalness: .45, roughness: .45 }));
  start.position.set(0, 7.1, -11); start.receiveShadow = true; scene.add(start);
  const startBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 7.1, -11));
  world.createCollider(RAPIER.ColliderDesc.cuboid(5, .2, 4.75).setFriction(.8), startBody);
  // The left branch is wide and forgiving; the right branch is a narrow, steeper shortcut.
  addStaticSegment(new THREE.Vector3(-2.2, 6.3, -7), new THREE.Vector3(-2.5, 5.1, -1), 5.4, 0x23576a);
  addStaticSegment(new THREE.Vector3(2.1, 6.1, -7), new THREE.Vector3(4.0, 3.9, -1), 1.55, 0x75405e);
  addStaticSegment(new THREE.Vector3(-2.5, 5.1, -1), new THREE.Vector3(-2.8, 3.5, 5), 5.1, 0x23576a);
  addStaticSegment(new THREE.Vector3(4.0, 3.9, -1), new THREE.Vector3(2.5, 2.6, 5), 1.45, 0x75405e);
  addStaticSegment(new THREE.Vector3(-2.8, 3.5, 5), new THREE.Vector3(0, 1.6, 12), 5.6, 0x23576a);
  addStaticSegment(new THREE.Vector3(2.5, 2.6, 5), new THREE.Vector3(0, 1.6, 12), 1.6, 0x75405e);
  addStaticSegment(new THREE.Vector3(0, 1.6, 12), new THREE.Vector3(0, .6, 19), 7, 0x2a5065, false);
  addBumper(new THREE.Vector3(-2.7, 4.3, 1.2), .7, 0x69e3d1);
  addBumper(new THREE.Vector3(1.5, 2.4, 8.2), .65, 0xff9b6b);
  addBumper(new THREE.Vector3(-.2, 1.8, 15), .75, 0xa58cff);
  addRing(new THREE.Vector3(0, .7, 21.2), 1.65, 0x73e5d4);
  const finish = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 2.2, .35, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x4bd9ca, emissive: 0x164e55, emissiveIntensity: .6, side: THREE.DoubleSide, metalness: .55, roughness: .28 }));
  finish.position.set(0, .1, 21.2); finish.rotation.x = Math.PI / 2; scene.add(finish);
  const finishFloor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -.35, 21.2));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2.3, .15, 2.3), finishFloor);
  // Decorative pylons make the split and merge readable from the overview camera.
  for (const x of [-5.2, 5.2]) {
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(.08, .16, 8, 12), new THREE.MeshStandardMaterial({ color: 0x3d7890, emissive: 0x1a5366, emissiveIntensity: .5 }));
    pylon.position.set(x, 3, 4); scene.add(pylon);
  }
}
function setupScene() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x080e1a); scene.fog = new THREE.Fog(0x080e1a, 30, 75);
  camera = new THREE.PerspectiveCamera(48, viewport.clientWidth / viewport.clientHeight, .1, 140);
  camera.position.set(17, 18, 25);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8)); renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  viewport.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .07; controls.target.set(0, 2, 5); controls.minDistance = 8; controls.maxDistance = 55; controls.maxPolarAngle = Math.PI * .48;
  scene.add(new THREE.HemisphereLight(0x9ecfff, 0x111827, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-8, 18, 7); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); scene.add(key);
  const rim = new THREE.PointLight(0x51dcca, 90, 38); rim.position.set(7, 8, 8); scene.add(rim);
  const violet = new THREE.PointLight(0x9276ff, 80, 35); violet.position.set(-8, 4, 1); scene.add(violet);
}
function makeWorld() {
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_DT;
  world.integrationParameters.numSolverIterations = 8;
  world.integrationParameters.numInternalPgsIterations = 2;
  buildArena();
}
function clearRacers() {
  for (const racer of racers) { scene.remove(racer.mesh); scene.remove(racer.label); racer.mesh.geometry.dispose(); (racer.mesh.material as THREE.Material).dispose(); (racer.label.material as THREE.SpriteMaterial).map?.dispose(); racer.label.material.dispose(); }
  racers = [];
}
function makeRacer(name: string, index: number) {
  const color = colors[index % colors.length];
  const geometry = new THREE.SphereGeometry(.34, 28, 20);
  const material = new THREE.MeshStandardMaterial({ color, roughness: .2, metalness: .38, emissive: color, emissiveIntensity: .12 });
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
  const x = ((index % 6) - 2.5) * 1.35;
  const z = -10.4 - Math.floor(index / 6) * 1.0;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 9 + Math.floor(index / 6) * .15, z).setLinearDamping(.12).setAngularDamping(.08).setCcdEnabled(true));
  body.setAdditionalMass(1.2, true);
  world.createCollider(RAPIER.ColliderDesc.ball(.34).setRestitution(.48).setFriction(.34), body);
  const label = createLabel(name, color); scene.add(mesh, label);
  return { name, color, body, mesh, label, finishedAt: null, recovered: false, shield: 0, boostUntil: 0, curseUntil: 0 } as Racer;
}
function updateLeaderboard() {
  const sorted = [...racers].sort((a,b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
    if (a.finishedAt !== null) return -1;
    if (b.finishedAt !== null) return 1;
    return b.body.translation().z - a.body.translation().z;
  });
  const list = $("leaderboard"); list.innerHTML = "";
  for (const [index, racer] of sorted.slice(0, 30).entries()) {
    const li = document.createElement("li");
    const time = racer.finishedAt === null ? (running ? "RACING" : "—") : `${racer.finishedAt.toFixed(2)}s`;
    li.innerHTML = `<span class="rank">${String(index+1).padStart(2,"0")}</span><i class="marble-swatch" style="background:#${racer.color.toString(16).padStart(6,"0")};color:#${racer.color.toString(16).padStart(6,"0")}"></i><span class="racer-name"></span><span class="racer-time">${time}</span>`;
    li.querySelector(".racer-name")!.textContent = racer.name;
    list.appendChild(li);
  }
  $("finished-count").textContent = String(finishCount);
  $("remaining-count").textContent = `${racers.length - finishCount} / ${racers.length}`;
}
function applyRandomEvent() {
  if (!running || racers.length < 2) return;
  const active = racers.filter(r => r.finishedAt === null);
  if (!active.length) return;
  const target = active[Math.floor(seededRandom() * active.length)];
  const roll = seededRandom();
  if (roll < .38) {
    target.boostUntil = elapsed + 2.2;
    target.body.applyImpulse({ x: (seededRandom()-.5)*2.2, y: .8, z: 4.5 }, true);
    addFeed(`<b>BOOST</b> · ${escapeHtml(target.name)} caught a speed burst.`);
  } else if (roll < .68) {
    target.shield = 1;
    addFeed(`<b>SHIELD</b> · ${escapeHtml(target.name)} gained protection.`);
  } else {
    const victim = active[Math.floor(seededRandom() * active.length)];
    if (victim.shield > 0) { victim.shield--; addFeed(`<b>BLOCKED</b> · ${escapeHtml(victim.name)} resisted a curse.`); }
    else { victim.curseUntil = elapsed + 1.3; victim.body.applyImpulse({ x: (seededRandom()-.5)*2, y: .2, z: -2.2 }, true); addFeed(`<b>CURSE</b> · ${escapeHtml(victim.name)} was slowed.`); }
  }
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]!)); }
function finishRacer(racer: Racer) {
  if (racer.finishedAt !== null) return;
  racer.finishedAt = elapsed; finishCount++;
  addFeed(`<b>FINISH</b> · ${escapeHtml(racer.name)} crossed the portal in ${elapsed.toFixed(2)}s.`);
  updateLeaderboard();
  if (finishCount === 1) {
    winnerShown = true; $("winner-name").textContent = racer.name; $("winner-banner").classList.remove("hidden");
    setStatus("CHAMPION CROWNED"); addFeed(`<b>🏆 WINNER</b> · ${escapeHtml(racer.name)} takes the arena!`);
  }
  if (finishCount === racers.length) {
    running = false; setStatus("RACE COMPLETE"); startButton.disabled = false; resetButton.disabled = false;
    $("event-label").textContent = "COMPLETE";
  }
}
function recoverRacer(racer: Racer) {
  if (racer.recovered || racer.finishedAt !== null) return;
  racer.recovered = true;
  const slot = racers.indexOf(racer);
  racer.body.setTranslation({ x: (slot % 5 - 2) * .55, y: 1.2, z: 14 + (slot % 4) * .55 }, true);
  racer.body.setLinvel({ x: 0, y: 0, z: 5.5 }, true);
  addFeed(`<b>RECOVERY</b> · ${escapeHtml(racer.name)} rejoined on the recovery lane.`);
}
function physicsStep() {
  elapsed += FIXED_DT;
  world.timestep = FIXED_DT;
  world.step();
  for (const racer of racers) {
    if (racer.finishedAt !== null) continue;
    const p = racer.body.translation();
    if (p.z > FINISH_Z && Math.abs(p.x) < 2.15 && p.y > -.8) finishRacer(racer);
    if (p.y < -5 || Math.abs(p.x) > 18 || p.z > FINISH_Z + 8) recoverRacer(racer);
    if (racer.curseUntil > elapsed) racer.body.setLinvel({ x: racer.body.linvel().x * .985, y: racer.body.linvel().y, z: racer.body.linvel().z * .985 }, true);
  }
}
function updateCamera(dt: number) {
  if (cameraMode === "leader" && racers.length) {
    const leader = [...racers].filter(r => r.finishedAt === null).sort((a,b) => b.body.translation().z-a.body.translation().z)[0] ?? racers[0];
    const p = leader.body.translation();
    cameraTarget.lerp(new THREE.Vector3(p.x, p.y, p.z + 2), 1 - Math.exp(-dt * 2.8));
    const desired = new THREE.Vector3(p.x + 8, p.y + 6, p.z - 9);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 1.4));
    controls.target.copy(cameraTarget);
  } else if (!running) {
    cameraTarget.lerp(new THREE.Vector3(0, 2, 5), 1 - Math.exp(-dt * 1.2));
    controls.target.lerp(cameraTarget, .06);
  }
  controls.update();
}
function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastFrame) / 1000 || 0, .05); lastFrame = now;
  if (running) {
    accumulator += dt;
    while (accumulator >= FIXED_DT) { physicsStep(); accumulator -= FIXED_DT; }
    eventClock += dt;
    if (eventClock > 4.5) { eventClock = 0; applyRandomEvent(); }
    $("race-time").textContent = `${String(Math.floor(elapsed/60)).padStart(2,"0")}:${String(Math.floor(elapsed%60)).padStart(2,"0")}.${Math.floor((elapsed%1)*10)}`;
    if (Math.floor(elapsed * 3) !== Math.floor((elapsed - dt) * 3)) updateLeaderboard();
  }
  for (const racer of racers) {
    const p = racer.body.translation(); racer.mesh.position.set(p.x,p.y,p.z);
    racer.mesh.quaternion.set(racer.body.rotation().x,racer.body.rotation().y,racer.body.rotation().z,racer.body.rotation().w);
    racer.label.position.set(p.x,p.y+.62,p.z);
    const material = racer.mesh.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = racer.boostUntil > elapsed ? .75 : racer.curseUntil > elapsed ? .02 : .12;
  }
  updateCamera(dt);
  renderer.render(scene,camera);
}
function resetArena() {
  running = false; clearRacers(); world.free(); trackSegments.length = 0;
  scene.traverse(object => { if (object !== scene && object.parent === scene && !(object as THREE.Light).isLight) { scene.remove(object); if ((object as THREE.Mesh).geometry) (object as THREE.Mesh).geometry.dispose(); } });
  makeWorld();
  $("winner-banner").classList.add("hidden"); $("race-time").textContent = "00:00.0"; $("event-label").textContent = "WAITING";
  $("remaining-count").textContent = "—"; $("leaderboard").innerHTML = '<li class="empty-row">The race results will appear here.</li>';
  $("finished-count").textContent = "0"; $("event-feed").innerHTML = '<span class="feed-empty">Waiting for the starting signal…</span>';
  feedEntries = 0; finishCount = 0; winnerShown = false; elapsed = 0; eventClock = 0;
  setStatus("ARENA READY"); startButton.disabled = false; resetButton.disabled = true;
}
async function startRace() {
  const names = namesInput.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (names.length < 2 || names.length > 30) { validation.textContent = "Please enter between 2 and 30 names."; validation.className = "validation error"; return; }
  resetArena();
  seed = (Date.now() ^ names.join("|").length * 2654435761) >>> 0;
  racers = names.map(makeRacer);
  updateLeaderboard(); startButton.disabled = true; resetButton.disabled = true;
  setStatus("RACERS ON THE GRID"); $("event-label").textContent = "GRID UP";
  const countdown = $("countdown"); countdown.classList.remove("hidden");
  for (const value of ["3","2","1","GO"]) {
    countdown.textContent = value;
    await new Promise(resolve => setTimeout(resolve, value === "GO" ? 450 : 700));
  }
  countdown.classList.add("hidden");
  if (!racers.length) return;
  running = true; elapsed = 0; accumulator = 0;
  setStatus("RACE IN PROGRESS"); $("event-label").textContent = "CHAOS LIVE";
  addFeed(`<b>START</b> · ${racers.length} racers launched. Pick your route!`);
  resetButton.disabled = false;
}
function resize() {
  if (!renderer) return;
  const width = viewport.clientWidth, height = viewport.clientHeight;
  camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width,height);
}
async function boot() {
  await RAPIER.init();
  setupScene(); makeWorld();
  namesInput.addEventListener("input", updateCount);
  startButton.addEventListener("click", () => void startRace());
  resetButton.addEventListener("click", resetArena);
  $("camera-mode").addEventListener("click", () => {
    cameraMode = cameraMode === "overview" ? "leader" : "overview";
    $("camera-mode").textContent = cameraMode === "overview" ? "CAM: OVERVIEW" : "CAM: LEADER";
  });
  window.addEventListener("resize", resize);
  updateCount(); lastFrame = performance.now(); requestAnimationFrame(animate);
}
void boot().catch(error => {
  console.error(error); setStatus("ENGINE ERROR");
  validation.textContent = "The 3D engine failed to initialize. Please reload the page.";
  validation.className = "validation error";
});
