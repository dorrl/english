// Presentation time never enters the fixed-step simulation: hit-stop and camera
// cuts can change the rhythm without changing a student's result.
export type Vector = { x: number; y: number; z: number };
export type SpecialKind = 'boost' | 'bonus' | 'drain' | 'magnet' | 'light' | 'reverse' | 'swap' | 'grow';
export const SPECIAL_KINDS: SpecialKind[] = ['boost', 'bonus', 'drain', 'magnet', 'light', 'reverse', 'grow', 'swap'];
export type Flight = {
  index: number; name: string; position: Vector; previous: Vector; velocity: Vector;
  launched: boolean; done: boolean; planets: number; distance: number; flightTime: number;
  seed: number; curve: { x: number; y: number; phase: number; frequency: number; kind: number };
  eventPoints: number; magnetLevel: number; specialCount: number; boostUntil: number;
  gravity: Vector; gravityTarget: number;
  gravityFactor: number; reverseUntil: number; size: number; teleportVersion: number;
};
export type World = { position: Vector; radius: number; destroyed: boolean; special?: SpecialKind | null; index?: number; appearanceSeed?: number; previous?: Vector; velocity?: Vector };
export type WorldLayout = World & { index: number; appearanceSeed: number };
export type SpecialEvent<T extends Flight = Flight> = { kind: SpecialKind; actor: T; targets: T[]; amount: number; range: number };
export const STEP = 1 / 120;
export const FINISH_DISTANCE = 10000;
export const MAX_FLIGHT_TIME = 110;
export const FLIGHT_FLOOR = -115;
export const GRAVITY = .4914;
export const GRAVITY_FIRST_RAMP_START = 30;
export const GRAVITY_RAMP_START = 60;
export const LAUNCH_SPEED_MULTIPLIER = 1.06;
export function downwardAcceleration(flightTime: number) {
  const gentleRamp = Math.max(0, Math.min(flightTime, GRAVITY_RAMP_START) - GRAVITY_FIRST_RAMP_START) * .002;
  return Math.min(3.2, GRAVITY + gentleRamp + Math.max(0, flightTime - GRAVITY_RAMP_START) * .055);
}
export const WORLD_COUNT = 8448;
export const WORLD_SECTORS = 32;
export const WORLD_HALF_WIDTH = 144;
export const PLANET_POINTS = 150;
export const MAX_SPEED = 900;
export const CENTER_PULL_START = WORLD_HALF_WIDTH * .7;
export const MAX_CENTER_PULL = .65;
export function centerAcceleration(x: number) {
  if (Math.abs(x) <= CENTER_PULL_START) return 0;
  const t = Math.max(0, Math.min(1, (Math.abs(x) - CENTER_PULL_START) / 60));
  return -Math.sign(x) * MAX_CENTER_PULL * t * t * (3 - 2 * t);
}
export function random(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function parseNames(value: string) {
  return value.split(/\r?\n/).map(name => name.trim()).filter(Boolean).slice(0, 30);
}
export function compareFlights(a: Flight, b: Flight) {
  return scoreFlight(b) - scoreFlight(a) || b.planets - a.planets || b.distance - a.distance || a.flightTime - b.flightTime || a.index - b.index;
}
export function distancePoints(distance: number) {
  return Math.floor(Math.max(0, Math.min(FINISH_DISTANCE, distance)));
}
export function survivalRate(time: number) { return time < 30 ? 20 : time < 45 ? 30 : time < 60 ? 50 : 100; }
export function survivalPoints(time: number = 0) {
  // Completed seconds only; earlier seconds retain their original tier value.
  const seconds = Math.floor(Math.max(0, time) + 1e-8);
  return Math.min(seconds, 30) * 20 + Math.max(0, Math.min(seconds, 45) - 30) * 30
    + Math.max(0, Math.min(seconds, 60) - 45) * 50 + Math.max(0, seconds - 60) * 100;
}
export function flightGravity(flight: Flight) {
  return downwardAcceleration(flight.flightTime) * flight.gravityFactor * (flight.flightTime < flight.reverseUntil ? -1 : 1);
}
export function additionalPoints(flight: Pick<Flight, 'planets'> & Partial<Pick<Flight, 'eventPoints'>>) {
  return flight.planets * PLANET_POINTS + (flight.eventPoints || 0);
}
export function scoreFlight(flight: Pick<Flight, 'planets' | 'distance'> & Partial<Pick<Flight, 'eventPoints' | 'flightTime'>>) {
  return additionalPoints(flight) + distancePoints(flight.distance) + survivalPoints(flight.flightTime);
}
export function createFlight(name: string, index: number, roundSeed = 0): Flight {
  const position = { x: -1 + 3.25 + (index % 6) * 1.38, y: .95 + Math.floor(index / 6) * .16, z: -.6 };
  const seed = index + roundSeed * 31;
  const curve = {
    x: (random(seed + 801) < .5 ? -1 : 1) * (.45 + random(seed + 807) * .7),
    y: .16 + random(seed + 811) * .24,
    phase: random(seed + 821) * Math.PI * 2,
    frequency: .48 + random(seed + 829) * .32,
    kind: (index + Math.floor(random(roundSeed + 839) * 4)) % 4,
  };
  return { index, name, position, previous: { ...position }, velocity: { x: 0, y: 0, z: 0 }, launched: false, done: false, planets: 0, distance: 0, flightTime: 0, seed, curve, eventPoints: 0, magnetLevel: 0, specialCount: 0, boostUntil: 0, gravity: { x: 0, y: 0, z: 0 }, gravityTarget: -1, gravityFactor: 1, reverseUntil: 0, size: 1, teleportVersion: 0 };
}
export function createWorldLayout(roundSeed = 0): WorldLayout[] {
  let state = (roundSeed ^ 0x91e10da5) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const worlds: WorldLayout[] = [];
  const cellSize = 18, cells = new Map<string, WorldLayout[]>();
  const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const canPlace = (position: Vector, radius: number) => {
    const cx = Math.floor(position.x / cellSize), cy = Math.floor(position.y / cellSize), cz = Math.floor(position.z / cellSize);
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let z = cz - 1; z <= cz + 1; z++) {
          for (const other of cells.get(cellKey(x, y, z)) || []) {
            const clearance = radius + other.radius + 2.2;
            const dx = position.x - other.position.x, dy = position.y - other.position.y, dz = position.z - other.position.z;
            if (dx * dx + dy * dy + dz * dz < clearance * clearance) return false;
          }
        }
      }
    }
    return true;
  };
  // Equal sector populations keep the entire map active. Inside each sector,
  // mix free scatter with loose pockets instead of visible rows or columns.
  for (let sector = 0; sector < WORLD_SECTORS; sector++) {
    const startZ = Math.max(42, sector * FINISH_DISTANCE / WORLD_SECTORS);
    const endZ = Math.min(FINISH_DISTANCE - 34, (sector + 1) * FINISH_DISTANCE / WORLD_SECTORS);
    const pockets = Array.from({ length: 5 }, () => ({ x: (next() - .5) * WORLD_HALF_WIDTH * 1.4, y: -60 + next() * 90, z: startZ + (.2 + next() * .6) * (endZ - startZ) }));
    for (let i = 0; i < WORLD_COUNT / WORLD_SECTORS; i++) {
      const size = next();
      const radius = size < .35 ? 1.6 + next() * 1.2 : size < .8 ? 2.8 + next() * 1.8 : 4.6 + next() * 2.2;
      const appearanceSeed = Math.floor(next() * 100_000_000);
      let position: Vector | null = null;
      for (let attempt = 0; attempt < 160; attempt++) {
        const floorPlanet = i < Math.round(WORLD_COUNT / WORLD_SECTORS * .25);
        const pocket = !floorPlanet && attempt < 18 && next() < .34 ? pockets[Math.floor(next() * pockets.length)] : null;
        const spread = () => next() + next() + next() - 1.5;
        const candidate = pocket
          ? { x: pocket.x + spread() * 22, y: pocket.y + spread() * 18, z: pocket.z + spread() * 45 }
          : { x: (next() - .5) * WORLD_HALF_WIDTH * 2, y: floorPlanet ? FLIGHT_FLOOR + radius + 1 + next() * 12 : -89 + next() * 147, z: startZ + next() * (endZ - startZ) };
        if (Math.abs(candidate.x) > WORLD_HALF_WIDTH || candidate.z < startZ || candidate.z >= endZ || candidate.y > 58 || (!floorPlanet && candidate.y < -89)) continue;
        if (canPlace(candidate, radius)) { position = candidate; break; }
      }
      if (!position) throw new Error('Could not place the planet field with safe clearance');
      const roll = random(appearanceSeed + 193);
      const special = random(appearanceSeed + 181) < .14 ? (roll < .005 ? 'swap' : SPECIAL_KINDS[Math.min(6, Math.floor((roll - .005) / .995 * 7))]) : null;
      const world: WorldLayout = { index: worlds.length, appearanceSeed, position, radius, destroyed: false, special };
      worlds.push(world);
      const key = cellKey(Math.floor(position.x / cellSize), Math.floor(position.y / cellSize), Math.floor(position.z / cellSize));
      const cell = cells.get(key);
      if (cell) cell.push(world); else cells.set(key, [world]);
    }
  }
  return worlds;
}
export function launchFlight(f: Flight) {
  if (f.launched) return;
  const i = f.seed, x = (random(i + 601) - .5) * .34, y = (random(i + 607) - .5) * .3;
  f.position.x += x;
  f.position.y += y;
  f.position.z += (random(i + 613) - .5) * .22;
  f.previous = { ...f.position };
  f.velocity = { x: (random(i + 1) - .5) * 8.5 + x * 4, y: 2 + (random(i + 2) - .5) * 9, z: 88 + random(i + 3) * 20 };
  f.velocity.x *= LAUNCH_SPEED_MULTIPLIER; f.velocity.y *= LAUNCH_SPEED_MULTIPLIER; f.velocity.z *= LAUNCH_SPEED_MULTIPLIER;
  f.launched = true;
}
// Earliest segment/sphere intersection, including a segment starting inside.
export function contactTime(a: Vector, b: Vector, center: Vector, radius: number): number | null {
  const x = a.x - center.x, y = a.y - center.y, z = a.z - center.z;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const c = x * x + y * y + z * z - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dy * dy + dz * dz;
  if (aa === 0) return null;
  const bb = x * dx + y * dy + z * dz, discriminant = bb * bb - aa * c;
  if (discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / aa;
  return t >= 0 && t <= 1 ? t : null;
}
export function magnetRange(flight: Pick<Flight, 'magnetLevel'>) {
  return flight.magnetLevel > 0 ? Math.min(64, 16 + flight.magnetLevel * 12) : 0;
}
function limitSpeed(velocity: Vector, limit: number) {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed <= limit) return;
  const scale = limit / speed; velocity.x *= scale; velocity.y *= scale; velocity.z *= scale;
}
export function triggerSpecial<T extends Flight>(kind: SpecialKind, actor: T, flights: T[], seed: number): SpecialEvent<T> {
  actor.specialCount++;
  const event: SpecialEvent<T> = { kind, actor, targets: [], amount: 0, range: 0 };
  if (kind === 'boost') {
    actor.velocity.x *= 1.5; actor.velocity.y *= 1.5; actor.velocity.z *= 1.5;
    limitSpeed(actor.velocity, MAX_SPEED); actor.boostUntil = actor.flightTime + 2.4;
  } else if (kind === 'bonus') {
    actor.eventPoints += 1000; event.amount = 1000;
  } else if (kind === 'drain') {
    // Include finished students: finishing a flight does not freeze the ranking.
    const others = flights.filter(flight => flight.index !== actor.index);
    const count = others.length ? Math.max(1, Math.round(others.length * .2)) : 0;
    others.sort((a, b) => random(seed + a.seed * 17 + a.index * 83) - random(seed + b.seed * 17 + b.index * 83) || a.index - b.index);
    event.targets = others.slice(0, count); event.amount = -500;
    for (const target of event.targets) target.eventPoints -= 500;
  } else if (kind === 'magnet') {
    actor.magnetLevel++; event.range = magnetRange(actor);
  } else if (kind === 'light') {
    actor.gravityFactor = Math.max(.35, actor.gravityFactor * .75); event.amount = Math.round((1 - actor.gravityFactor) * 100);
  } else if (kind === 'reverse') {
    actor.reverseUntil = actor.flightTime + 5; event.amount = 5;
  } else if (kind === 'grow') {
    actor.size = Math.min(2.2, actor.size * 1.25); event.amount = Math.round(actor.size * 100);
  } else if (kind === 'swap') {
    const others = flights.filter(f => f.index !== actor.index && f.launched && !f.done);
    others.sort((a, b) => random(seed + a.seed * 17 + a.index * 83) - random(seed + b.seed * 17 + b.index * 83) || a.index - b.index);
    const target = others[0];
    if (target) {
      const aScore = scoreFlight(actor), bScore = scoreFlight(target);
      [actor.position, target.position] = [{ ...target.position }, { ...actor.position }];
      [actor.distance, target.distance] = [target.distance, actor.distance];
      actor.previous = { ...actor.position }; target.previous = { ...target.position };
      actor.eventPoints += bScore - scoreFlight(actor); target.eventPoints += aScore - scoreFlight(target);
      actor.teleportVersion++; target.teleportVersion++;
      actor.gravityTarget = target.gravityTarget = -1;
      event.targets = [target]; event.amount = bScore - aScore;
    }
  }
  return event;
}

// Inverse-square attraction with a softened core and a C1 continuous cutoff.
// No singular impulse at the center or force jump at the edge of the field.
export function planetGravity(position: Vector, world: World): Vector {
  const x = world.position.x - position.x, y = world.position.y - position.y, z = world.position.z - position.z;
  const square = x * x + y * y + z * z, range = 12 + world.radius * 3;
  if (world.destroyed || square < 1e-12 || square >= range * range) return { x: 0, y: 0, z: 0 };
  const distance = Math.sqrt(square), softening = Math.max(1.8, world.radius * .8);
  const edge = 1 - square / (range * range);
  const attraction = world.special ? 2 : 1;
  const raw = 90 * attraction * world.radius * world.radius / Math.pow(square + softening * softening, 1.5) * edge * edge;
  const force = Math.min(40, raw * distance) / distance;
  return { x: x * force, y: y * force, z: z * force };
}

class WorldField {
  private buckets = new Map<number, Set<World>>();
  moving = new Set<World>();
  maxRadius = 0;
  constructor(worlds: World[]) {
    for (const world of worlds) {
      this.add(world); this.maxRadius = Math.max(this.maxRadius, world.radius);
      if (world.velocity) this.moving.add(world);
    }
  }
  private add(world: World) {
    const key = Math.floor(world.position.z / 64);
    let bucket = this.buckets.get(key);
    if (!bucket) { bucket = new Set(); this.buckets.set(key, bucket); }
    bucket.add(world);
  }
  moved(world: World, previousZ: number) {
    if (Math.floor(previousZ / 64) === Math.floor(world.position.z / 64)) return;
    this.buckets.get(Math.floor(previousZ / 64))?.delete(world); this.add(world);
  }
  *near(min: number, max: number) {
    for (let key = Math.floor(min / 64); key <= Math.floor(max / 64); key++) {
      const bucket = this.buckets.get(key);
      if (bucket) yield* bucket;
    }
  }
}
const fields = new WeakMap<World[], WorldField>();
export function resetWorldField(worlds: World[]) { fields.delete(worlds); }

function moveMagnetWorlds<T extends Flight>(flights: T[], field: WorldField) {
  const claims = new Map<World, { flight: T; distance: number; range: number }>();
  for (const flight of flights) {
    const range = magnetRange(flight);
    if (!flight.launched || flight.done || !range) continue;
    for (const world of field.near(flight.position.z - range, flight.position.z + range)) {
      if (world.destroyed) continue;
      const distance = Math.hypot(world.position.x - flight.position.x, world.position.y - flight.position.y, world.position.z - flight.position.z);
      if (distance >= range || distance < .001) continue;
      const previous = claims.get(world);
      if (!previous || distance < previous.distance || (distance === previous.distance && flight.index < previous.flight.index)) claims.set(world, { flight, distance, range });
    }
  }
  for (const world of claims.keys()) field.moving.add(world);
  for (const world of field.moving) {
    if (world.destroyed) { field.moving.delete(world); continue; }
    world.previous = { ...world.position };
    const velocity = world.velocity ||= { x: 0, y: 0, z: 0 }, claim = claims.get(world);
    if (claim) {
      const edge = 1 - (claim.distance / claim.range) ** 2;
      const pull = 95 * edge * edge * STEP / claim.distance;
      velocity.x += (claim.flight.position.x - world.position.x) * pull;
      velocity.y += (claim.flight.position.y - world.position.y) * pull;
      velocity.z += (claim.flight.position.z - world.position.z) * pull;
    }
    const damping = Math.exp(-4 * STEP); velocity.x *= damping; velocity.y *= damping; velocity.z *= damping;
    limitSpeed(velocity, 22);
    world.position.x += velocity.x * STEP; world.position.y += velocity.y * STEP; world.position.z += velocity.z * STEP;
    field.moved(world, world.previous.z);
    if (!claim && Math.hypot(velocity.x, velocity.y, velocity.z) < .01) { world.previous = { ...world.position }; field.moving.delete(world); }
  }
}

export function stepFlights<T extends Flight, P extends World>(flights: T[], worlds: P[], onHit: (world: P, flight: T) => void, onEvent?: (event: SpecialEvent<T>) => void) {
  let field = fields.get(worlds);
  if (!field) { field = new WorldField(worlds); fields.set(worlds, field); }
  moveMagnetWorlds(flights, field);
  const hits: { t: number; world: P; flight: T }[] = [];
  for (const f of flights) {
    if (!f.launched || f.done) continue;
    f.previous = { ...f.position };
    f.flightTime += STEP;
    const curl = f.flightTime * f.curve.frequency + f.curve.phase;
    let curveX = Math.sin(curl) * f.curve.x * 1.6;
    let curveY = Math.cos(curl * .83) * f.curve.y * .65;
    if (f.curve.kind === 1) {
      curveX = Math.sin(curl * .65) * f.curve.x * .9;
      curveY = Math.sin(curl * .8) * f.curve.y * 3.5;
    } else if (f.curve.kind === 2) {
      curveX = Math.sin(f.flightTime * 2.3 + f.curve.phase) * f.curve.x * 5;
      curveY = Math.cos(f.flightTime * 2 + f.curve.phase) * f.curve.y * 5;
    } else if (f.curve.kind === 3) {
      const breakPulse = Math.pow(Math.max(0, Math.sin(f.flightTime * .9 + f.curve.phase)), 6);
      curveX = f.curve.x * (breakPulse * 5 - .8);
      curveY = f.curve.y * Math.sin(f.flightTime * .7 + f.curve.phase) * 2;
    }
    let gx = 0, gy = 0, gz = 0, strongest = 0;
    f.gravityTarget = -1;
    const gravityRange = 12 + field.maxRadius * 3;
    for (const world of field.near(f.position.z - gravityRange, f.position.z + gravityRange)) {
      if (world.destroyed || Math.abs(world.position.z - f.position.z) > 12 + world.radius * 3) continue;
      const force = planetGravity(f.position, world); gx += force.x; gy += force.y; gz += force.z;
      const strength = force.x * force.x + force.y * force.y + force.z * force.z;
      if (strength > strongest) { strongest = strength; f.gravityTarget = world.index ?? -1; }
    }
    const magnitude = Math.hypot(gx, gy, gz), gravityScale = (magnitude > 55 ? 55 / magnitude : 1) * f.gravityFactor;
    f.gravity.x = gx * gravityScale; f.gravity.y = gy * gravityScale; f.gravity.z = gz * gravityScale;
    f.velocity.x += (curveX + gx * gravityScale + centerAcceleration(f.position.x)) * STEP;
    f.velocity.y += (curveY - flightGravity(f) + gy * gravityScale) * STEP;
    f.velocity.z += gz * gravityScale * STEP;
    f.velocity.x *= Math.exp(-.022 * STEP);
    f.velocity.y *= Math.exp(-.015 * STEP);
    f.velocity.z *= Math.exp(-.018 * STEP);
    // The arcade flight remains forward-moving instead of orbiting a core.
    f.velocity.z = Math.max(24, f.velocity.z); limitSpeed(f.velocity, MAX_SPEED);
    f.position.x += f.velocity.x * STEP;
    f.position.y += f.velocity.y * STEP;
    f.position.z += f.velocity.z * STEP;
    f.distance = Math.min(FINISH_DISTANCE, Math.max(f.distance, f.position.z));
    for (const candidate of field.near(Math.min(f.previous.z, f.position.z) - field.maxRadius - .48 * f.size, Math.max(f.previous.z, f.position.z) + field.maxRadius + .48 * f.size)) {
      const world = candidate as P;
      if (world.destroyed) continue;
      const reach = world.radius + .48 * f.size;
      const previous = world.previous || world.position;
      const a = { x: f.previous.x - previous.x, y: f.previous.y - previous.y, z: f.previous.z - previous.z };
      const b = { x: f.position.x - world.position.x, y: f.position.y - world.position.y, z: f.position.z - world.position.z };
      const t = contactTime(a, b, { x: 0, y: 0, z: 0 }, reach);
      if (t !== null) hits.push({ t, world, flight: f });
    }
  }
  // Resolve contested planets in contact order rather than roster order.
  hits.sort((a, b) => a.t - b.t || a.flight.index - b.flight.index);
  const displaced = new Set<number>();
  for (const { world, flight } of hits) {
    if (world.destroyed || displaced.has(flight.index)) continue;
    world.destroyed = true;
    flight.planets++;
    flight.velocity.x *= 1.13;
    flight.velocity.y *= 1.13;
    flight.velocity.z *= 1.13;
    limitSpeed(flight.velocity, MAX_SPEED);
    if (world.special) {
      const event = triggerSpecial(world.special, flight, flights, (world.appearanceSeed ?? world.index ?? 0) + flight.seed * 211 + flight.specialCount * 719);
      if (event.kind === 'swap' && event.targets.length) { displaced.add(flight.index); displaced.add(event.targets[0].index); }
      onEvent?.(event);
    }
    onHit(world, flight);
  }
  for (const f of flights) {
    if (f.launched && (f.position.z >= FINISH_DISTANCE || f.position.y < FLIGHT_FLOOR || f.flightTime >= MAX_FLIGHT_TIME)) f.done = true;
  }
}
