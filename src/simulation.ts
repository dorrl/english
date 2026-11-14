// Presentation time never enters the fixed-step simulation: hit-stop and camera
// cuts can change the rhythm without changing a student's result.
export type Vector = { x: number; y: number; z: number };
export type Flight = {
  index: number; name: string; position: Vector; previous: Vector; velocity: Vector;
  launched: boolean; done: boolean; planets: number; distance: number; flightTime: number;
};
export type World = { position: Vector; radius: number; destroyed: boolean };
export const STEP = 1 / 120;
export const FINISH_DISTANCE = 930;
export function random(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function parseNames(value: string) {
  return value.split(/\r?\n/).map(name => name.trim()).filter(Boolean).slice(0, 30);
}
export function compareFlights(a: Flight, b: Flight) {
  return b.planets - a.planets || b.distance - a.distance || a.index - b.index;
}
export function createFlight(name: string, index: number): Flight {
  const position = { x: -1 + 3.25 + (index % 6) * 1.38, y: .95 + Math.floor(index / 6) * .16, z: -.6 };
  return { index, name, position, previous: { ...position }, velocity: { x: 0, y: 0, z: 0 }, launched: false, done: false, planets: 0, distance: 0, flightTime: 0 };
}
export function createWorldLayout() {
  const worlds: (World & { index: number })[] = [];
  for (let row = 0; row < 30; row++) {
    for (let col = 0; col < 9; col++) {
      const index = row * 9 + col;
      const z = 32 + row * 30 + random(index + 131) * 10;
      const x = (col - 4) * 8 + (random(index + 213) - .5) * 4;
      const y = 2 + z * .077 - z * z * .00016 + (random(index + 317) - .5) * (Math.abs(col - 4) > 2 ? 42 : 21);
      worlds.push({ index, position: { x, y, z }, radius: 2.5 + random(index + 9) * 1.6, destroyed: false });
    }
  }
  return worlds;
}
export function launchFlight(f: Flight) {
  if (f.launched) return;
  const i = f.index, x = (random(i + 601) - .5) * .34, y = (random(i + 607) - .5) * .3;
  f.position.x += x;
  f.position.y += y;
  f.position.z += (random(i + 613) - .5) * .22;
  f.previous = { ...f.position };
  f.velocity = { x: (random(i + 1) - .5) * 8.5 + x * 10, y: 7.2 + y * 9 + (random(i + 2) - .5) * 2.4, z: 82 + random(i + 3) * 16 + Math.abs(x) * 5 };
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
    const stall = Math.max(0, Math.min(1, 1 - f.velocity.z / 58));
    f.velocity.y -= (2.4 + 19 * Math.pow(stall, 2.2)) * STEP;
    f.velocity.x *= Math.exp(-.16 * STEP);
    f.velocity.y *= Math.exp(-.055 * STEP);
    f.velocity.z *= Math.exp(-.052 * STEP);
    f.position.x += f.velocity.x * STEP;
    f.position.y += f.velocity.y * STEP;
    f.position.z += f.velocity.z * STEP;
    f.distance = Math.max(f.distance, f.position.z);
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
    if (f.launched && (f.position.z > FINISH_DISTANCE || f.position.y < -48 || f.flightTime > 24)) f.done = true;
  }
}
