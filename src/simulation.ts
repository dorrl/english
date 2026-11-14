// Presentation time never enters the fixed-step simulation: hit-stop and camera
// cuts can change the rhythm without changing a student's result.
export type Vector = { x: number; y: number; z: number };
export type Flight = {
  index: number; name: string; position: Vector; previous: Vector; velocity: Vector;
  launched: boolean; done: boolean; planets: number; distance: number; flightTime: number;
  seed: number; curve: { x: number; y: number; phase: number; frequency: number; kind: number };
};
export type World = { position: Vector; radius: number; destroyed: boolean };
export type WorldLayout = World & { index: number; appearanceSeed: number };
export const STEP = 1 / 120;
export const FINISH_DISTANCE = 2600;
export const MAX_FLIGHT_TIME = 44;
export const FLIGHT_FLOOR = -115;
export const GRAVITY = .55;
export const WORLD_COUNT = 1200;
export const PLANET_POINTS = 150;
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
export function scoreFlight(flight: Pick<Flight, 'planets' | 'distance'>) {
  return flight.planets * PLANET_POINTS + distancePoints(flight.distance);
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
  return { index, name, position, previous: { ...position }, velocity: { x: 0, y: 0, z: 0 }, launched: false, done: false, planets: 0, distance: 0, flightTime: 0, seed, curve };
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
  for (let sector = 0; sector < 8; sector++) {
    const startZ = Math.max(42, sector * FINISH_DISTANCE / 8);
    const endZ = Math.min(FINISH_DISTANCE - 34, (sector + 1) * FINISH_DISTANCE / 8);
    const pockets = Array.from({ length: 3 }, () => ({ x: (next() - .5) * 120, y: -60 + next() * 90, z: startZ + (.2 + next() * .6) * (endZ - startZ) }));
    for (let i = 0; i < WORLD_COUNT / 8; i++) {
      const size = next();
      const radius = size < .35 ? 1.6 + next() * 1.2 : size < .8 ? 2.8 + next() * 1.8 : 4.6 + next() * 2.2;
      const appearanceSeed = Math.floor(next() * 100_000_000);
      let position: Vector | null = null;
      for (let attempt = 0; attempt < 160; attempt++) {
        const floorPlanet = i < 36;
        const pocket = !floorPlanet && attempt < 18 && next() < .34 ? pockets[Math.floor(next() * pockets.length)] : null;
        const spread = () => next() + next() + next() - 1.5;
        const candidate = pocket
          ? { x: pocket.x + spread() * 22, y: pocket.y + spread() * 18, z: pocket.z + spread() * 45 }
          : { x: (next() - .5) * 172, y: floorPlanet ? FLIGHT_FLOOR + radius + 1 + next() * 12 : -89 + next() * 147, z: startZ + next() * (endZ - startZ) };
        if (Math.abs(candidate.x) > 86 || candidate.z < startZ || candidate.z >= endZ || candidate.y > 58 || (!floorPlanet && candidate.y < -89)) continue;
        if (canPlace(candidate, radius)) { position = candidate; break; }
      }
      if (!position) throw new Error('Could not place the planet field with safe clearance');
      const world: WorldLayout = { index: worlds.length, appearanceSeed, position, radius, destroyed: false };
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
export function stepFlights<T extends Flight, P extends World>(flights: T[], worlds: P[], onHit: (world: P, flight: T) => void) {
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
    f.velocity.x += curveX * STEP;
    f.velocity.y += (curveY - GRAVITY) * STEP;
    f.velocity.x *= Math.exp(-.022 * STEP);
    f.velocity.y *= Math.exp(-.015 * STEP);
    f.velocity.z *= Math.exp(-.018 * STEP);
    f.position.x += f.velocity.x * STEP;
    f.position.y += f.velocity.y * STEP;
    f.position.z += f.velocity.z * STEP;
    f.distance = Math.min(FINISH_DISTANCE, Math.max(f.distance, f.position.z));
    for (const world of worlds) {
      if (world.destroyed) continue;
      const reach = world.radius + .48;
      if (world.position.z < f.previous.z - reach || world.position.z > f.position.z + reach) continue;
      const t = contactTime(f.previous, f.position, world.position, reach);
      if (t !== null) hits.push({ t, world, flight: f });
    }
  }
  // Resolve contested planets in contact order rather than roster order.
  hits.sort((a, b) => a.t - b.t || a.flight.index - b.flight.index);
  for (const { world, flight } of hits) {
    if (world.destroyed) continue;
    world.destroyed = true;
    flight.planets++;
    flight.velocity.x *= 1.13;
    flight.velocity.y *= 1.13;
    flight.velocity.z *= 1.13;
    onHit(world, flight);
  }
  for (const f of flights) {
    if (f.launched && (f.position.z >= FINISH_DISTANCE || f.position.y < FLIGHT_FLOOR || f.flightTime >= MAX_FLIGHT_TIME)) f.done = true;
  }
}
