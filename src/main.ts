import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import RAPIER from "@dimforge/rapier3d-compat";
import "./style.css";

type Racer = { name: string; color: number; body: RAPIER.RigidBody; mesh: THREE.Mesh; label: THREE.Sprite; finishedAt: number | null; recovered: boolean; shield: number; boostUntil: number; curseUntil: number; lastBoostAt: number };
type TrackSegment = { a: THREE.Vector3; b: THREE.Vector3; width: number; color: number };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = $("viewport");
const namesInput = $("names") as HTMLTextAreaElement;
const startButton = $("start-race") as HTMLButtonElement;
const resetButton = $("reset-race") as HTMLButtonElement;
const validation = $("validation");
const colors = [0x59d9ff,0xff806e,0xa98cff,0xffd166,0x63e6a5,0xff79bd,0x8ca8ff,0xffa65c,0x5de0d0,0xd8a2ff,0xc5e86c,0xff8c8c,0x71b8ff,0xf2a66f,0x9ce2a2,0xe7a4e8,0x6ce0f2,0xf1d26f,0xb5a0ff,0xff9e75,0x7ee0b1,0x8ca5ee,0xff7fa4,0xb7db70,0x78d6d0,0xd39bff,0xffc078,0x8bbcff,0xe6a2a2,0x9fddb3];
const FIXED_DT = 1 / 60;
const FINISH_Z = 104.5;
let ready = false;
let starting = false;
let manualCameraUntil = 0;
let resizeObserver: ResizeObserver | undefined;
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
let cameraMode: "overview" | "pack" | "leader" = "pack";
const boostPads: THREE.Vector3[] = [];
const animatedHazards: { mesh: THREE.Mesh; body: RAPIER.RigidBody; phase: number; speed: number }[] = [];
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
  startButton.disabled = !ready || starting || count < 2 || count > 30 || running;
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
function addBoostPad(position: THREE.Vector3, color = 0x69e7d7) {
  const pad = new THREE.Mesh(new THREE.BoxGeometry(3.1, .12, 2.2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, metalness: .65, roughness: .24 }));
  pad.position.copy(position); pad.rotation.x = -.08; scene.add(pad);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.6, .035, .24), new THREE.MeshBasicMaterial({ color: 0xeaffff }));
  stripe.position.copy(position).add(new THREE.Vector3(0, .09, 0)); scene.add(stripe);
  boostPads.push(position.clone());
}
function addSweeper(position: THREE.Vector3, length = 5.2, speed = 1.15) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, .28, .42), new THREE.MeshStandardMaterial({ color: 0xff936d, emissive: 0x7b291f, emissiveIntensity: .75, metalness: .65, roughness: .25 }));
  mesh.position.copy(position); mesh.castShadow = true; scene.add(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(length / 2, .16, .22).setRestitution(.82).setFriction(.25), body);
  animatedHazards.push({ mesh, body, phase: seededRandom() * Math.PI * 2, speed });
}
function addRing(position: THREE.Vector3, radius: number, color: number) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .09, 12, 72), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .8, metalness: .55, roughness: .25 }));
  ring.position.copy(position); ring.rotation.x = Math.PI / 2; scene.add(ring);
}
function buildArena() {
  boostPads.length = 0; animatedHazards.length = 0;\n  const grid = new THREE.GridHelper(150, 90, 0x24405b, 0x15283d); grid.position.y = -2; scene.add(grid);
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
  // The main descent winds through a long sequence of banked-feeling switchbacks.
  addStaticSegment(new THREE.Vector3(0, .6, 19), new THREE.Vector3(-3, .05, 30), 6.2, 0x24586b);
  addStaticSegment(new THREE.Vector3(-3, .05, 30), new THREE.Vector3(-4, -1.1, 42), 5.5, 0x28536a);
  addStaticSegment(new THREE.Vector3(-4, -1.1, 42), new THREE.Vector3(2, -2.0, 54), 5.8, 0x24586b);
  addStaticSegment(new THREE.Vector3(2, -2.0, 54), new THREE.Vector3(3, -2.9, 66), 5.4, 0x28536a);
  addStaticSegment(new THREE.Vector3(3, -2.9, 66), new THREE.Vector3(-2, -3.9, 78), 5.8, 0x24586b);
  addStaticSegment(new THREE.Vector3(-2, -3.9, 78), new THREE.Vector3(0, -5.0, 91), 6.2, 0x28536a);
  addStaticSegment(new THREE.Vector3(0, -5.0, 91), new THREE.Vector3(0, -6.0, 102), 7, 0x2a5065, false);
  addBoostPad(new THREE.Vector3(-3.4, -.62, 37), 0x6de8d7);
  addBoostPad(new THREE.Vector3(2.5, -2.45, 61), 0x9a8cff);
  addBoostPad(new THREE.Vector3(-.8, -4.35, 86), 0xffcf70);
  addSweeper(new THREE.Vector3(-3.5, -1.35, 45), 4.5, 1.05);
  addSweeper(new THREE.Vector3(2.6, -3.15, 69), 4.7, 1.35);
  addBumper(new THREE.Vector3(-1.5, -.8, 25), .8, 0xffb46b);
  addBumper(new THREE.Vector3(-4.1, -1.75, 49), .8, 0x9e8cff);
  addBumper(new THREE.Vector3(2.2, -2.7, 63), .72, 0x69e3d1);
  addBumper(new THREE.Vector3(-1.5, -4.4, 82), .85, 0xff9b6b);
  for (let z = 28; z <= 96; z += 8) {
    const marker = new THREE.Mesh(new THREE.TorusGeometry(3.8, .035, 6, 48), new THREE.MeshBasicMaterial({ color: z % 16 === 4 ? 0xffa36e : 0x5cddcf, transparent: true, opacity: .38 }));
    marker.position.set(0, -z * .055, z); marker.rotation.x = Math.PI / 2; scene.add(marker);
  }
  addBumper(new THREE.Vector3(-2.7, 4.3, 1.2), .7, 0x69e3d1);
  addBumper(new THREE.Vector3(1.5, 2.4, 8.2), .65, 0xff9b6b);
  addBumper(new THREE.Vector3(-.2, 1.8, 15), .75, 0xa58cff);
  addRing(new THREE.Vector3(0, -6.0, 104), 2.15, 0x73e5d4);
  const finish = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 2.2, .35, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x4bd9ca, emissive: 0x164e55, emissiveIntensity: .6, side: THREE.DoubleSide, metalness: .55, roughness: .28 }));
  finish.position.set(0, -6.4, 104); finish.rotation.x = Math.PI / 2; scene.add(finish);
  const finishFloor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -6.85, 104));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2.6, .15, 2.6).setFriction(.7), finishFloor);
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
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .075; controls.target.set(0, 1, 38); controls.minDistance = 7; controls.maxDistance = 90; controls.maxPolarAngle = Math.PI * .48;
  controls.addEventListener("start", () => { manualCameraUntil = performance.now() + 5200; });
  controls.addEventListener("end", () => { manualCameraUntil = performance.now() + 4200; });
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
  return { name, color, body, mesh, label, finishedAt: null, recovered: false, shield: 0, boostUntil: 0, curseUntil: 0, lastBoostAt: -99 } as Racer;
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
    running = false; setStatus("RACE COMPLETE"); startButton.disabled = true; resetButton.disabled = false;
    $("event-label").textContent = "COMPLETE";
  }
}
function recoverRacer(racer: Racer) {
  if (racer.recovered || racer.finishedAt !== null) return;
  racer.recovered = true;
  const slot = racers.indexOf(racer);
  racer.body.setTranslation({ x: (slot % 5 - 2) * .58, y: -6.15, z: 87 + (slot % 4) * .48 }, true);
  racer.body.setLinvel({ x: 0, y: 0, z: 7.2 }, true);
  addFeed(`<b>RECOVERY</b> · ${escapeHtml(racer.name)} rejoined on the recovery lane.`);
}
function physicsStep() {
  elapsed += FIXED_DT;
  world.timestep = FIXED_DT;
  for (const hazard of animatedHazards) {
    const angle = Math.sin(elapsed * hazard.speed + hazard.phase) * .92;
    hazard.body.setNextKinematicRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
  }
  world.step();
  for (const racer of racers) {
    if (racer.finishedAt !== null) continue;
    const p = racer.body.translation();
    if (p.z > FINISH_Z && Math.abs(p.x) < 2.45 && p.y > -8.5) finishRacer(racer);
    if (p.y < -13 || Math.abs(p.x) > 18 || p.z > FINISH_Z + 8) recoverRacer(racer);
    for (const pad of boostPads) {
      if (elapsed - racer.lastBoostAt > 3.2 && new THREE.Vector3(p.x, p.y, p.z).distanceTo(pad) < 1.8) {
        racer.lastBoostAt = elapsed; racer.boostUntil = elapsed + 1.4;
        racer.body.applyImpulse({ x: (seededRandom() - .5) * 1.2, y: .55, z: 7.2 }, true);
        addFeed(`<b>BOOST PAD</b> · ${escapeHtml(racer.name)} hit a turbo strip!`);
        break;
      }
    }
    if (racer.curseUntil > elapsed) racer.body.setLinvel({ x: racer.body.linvel().x * .985, y: racer.body.linvel().y, z: racer.body.linvel().z * .985 }, true);
  }
}
function updateCamera(dt: number) {
  if (performance.now() < manualCameraUntil) { controls.update(); return; }
  const active = racers.filter(r => r.finishedAt === null);
  if (running && active.length) {
    const focus = cameraMode === "leader"
      ? ([...active].sort((a,b) => b.body.translation().z-a.body.translation().z)[0] ?? active[0])
      : null;
    let centerX = 0, centerY = 0, centerZ = 0, minZ = Infinity, maxZ = -Infinity;
    if (focus) {
      const p = focus.body.translation(); centerX = p.x; centerY = p.y; centerZ = p.z;
      minZ = maxZ = p.z;
    } else {
      for (const racer of active) {
        const p = racer.body.translation(); centerX += p.x; centerY += p.y; centerZ += p.z;
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      }
      centerX /= active.length; centerY /= active.length; centerZ /= active.length;
    }
    const spread = Math.max(0, maxZ - minZ);
    const nextTarget = new THREE.Vector3(centerX, centerY + 1.5, centerZ + (cameraMode === "leader" ? 2 : 3));
    cameraTarget.lerp(nextTarget, 1 - Math.exp(-dt * 3.2));
    const distance = cameraMode === "leader" ? 15 : 19 + Math.min(spread * .34, 13);
    const desired = new THREE.Vector3(centerX + (cameraMode === "leader" ? 8 : 12), centerY + 10 + Math.min(spread * .08, 3), centerZ - distance);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 1.65));
    controls.target.copy(cameraTarget);
  } else if (!running) {
    cameraTarget.lerp(new THREE.Vector3(0, 1, 38), 1 - Math.exp(-dt * 1.2));
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
  for (const hazard of animatedHazards) { const q = hazard.body.rotation(); hazard.mesh.quaternion.set(q.x,q.y,q.z,q.w); }
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
function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose());
    else mesh.material?.dispose?.();
  });
}
function resetArena(fromStart = false) {
  if (!ready || !scene || !world || !renderer) return;
  running = false; starting = fromStart; clearRacers(); world.free(); trackSegments.length = 0;
  for (const child of [...scene.children]) {
    if (!(child as THREE.Light).isLight) { scene.remove(child); disposeObject(child); }
  }
  boostPads.length = 0; animatedHazards.length = 0;
  makeWorld();
  $("winner-banner").classList.add("hidden"); $("race-time").textContent = "00:00.0"; $("event-label").textContent = "WAITING";
  $("remaining-count").textContent = "—"; $("leaderboard").innerHTML = '<li class="empty-row">The race results will appear here.</li>';
  $("finished-count").textContent = "0"; $("event-feed").innerHTML = '<span class="feed-empty">Waiting for the starting signal…</span>';
  feedEntries = 0; finishCount = 0; winnerShown = false; elapsed = 0; eventClock = 0;
  document.body.classList.remove("race-mode");
  cameraMode = "pack"; $("camera-mode").textContent = "CAM: PACK";
  camera.position.set(18, 19, 4); cameraTarget.set(0, 1, 38); controls.target.copy(cameraTarget); controls.update();
  setStatus("ARENA READY"); startButton.disabled = !ready || starting; resetButton.disabled = true;
  if (resizeObserver) requestAnimationFrame(() => resize());
}
async function startRace() {
  if (!ready || starting || running) return;
  const names = namesInput.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (names.length < 2 || names.length > 30) { validation.textContent = "Please enter between 2 and 30 names."; validation.className = "validation error"; return; }
  starting = true; startButton.disabled = true;
  resetArena(true);
  document.body.classList.add("race-mode");
  requestAnimationFrame(() => resize());
  seed = (Date.now() ^ names.join("|").length * 2654435761) >>> 0;
  racers = names.map(makeRacer);
  updateLeaderboard(); startButton.disabled = true; resetButton.disabled = true;
  setStatus("RACERS ON THE GRID"); $("event-label").textContent = "GRID UP";
  const countdown = $("countdown"); countdown.classList.remove("hidden");
  for (const value of ["3","2","1","GO"]) {
    countdown.textContent = value;
    await new Promise(resolve => setTimeout(resolve, value === "GO" ? 450 : 700));
    if (!ready || !starting) { countdown.classList.add("hidden"); return; }
  }
  countdown.classList.add("hidden");
  if (!racers.length) return;
  starting = false; running = true; cameraMode = "pack"; $("camera-mode").textContent = "CAM: PACK"; manualCameraUntil = 0; elapsed = 0; accumulator = 0;
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
  startButton.addEventListener("click", () => {
    void startRace().catch(error => {
      console.error("Race start failed:", error);
      starting = false; running = false; document.body.classList.remove("race-mode");
      startButton.disabled = false; resetButton.disabled = true;
      validation.textContent = "Race could not start. Reset the arena and try again.";
      validation.className = "validation error"; setStatus("RACE ERROR");
    });
  });
  resetButton.addEventListener("click", () => resetArena(false));
  $("camera-mode").addEventListener("click", () => {
    cameraMode = cameraMode === "overview" ? "pack" : cameraMode === "pack" ? "leader" : "overview";
    $("camera-mode").textContent = cameraMode === "overview" ? "CAM: OVERVIEW" : cameraMode === "pack" ? "CAM: PACK" : "CAM: LEADER";
    manualCameraUntil = 0;
  });
  window.addEventListener("resize", resize);
  resizeObserver = new ResizeObserver(resize); resizeObserver.observe(viewport);
  ready = true; starting = false;
  updateCount(); resetButton.disabled = true; setStatus("ARENA READY");
  validation.textContent = "3D engine ready. Enter 2–30 names to begin.";
  lastFrame = performance.now(); requestAnimationFrame(animate);
}
void boot().catch(error => {
  console.error("Shuffle Arena initialization failed:", error);
  ready = false; starting = false; startButton.disabled = true; resetButton.disabled = true;
  setStatus("ENGINE ERROR");
  validation.textContent = "3D engine initialization failed. Reload the page or try a supported browser.";
  validation.className = "validation error";
});
