import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/simulation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const sim = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const { STEP, compareFlights, contactTime, createFlight, createWorldLayout, launchFlight, parseNames, stepFlights } = sim;
const presentationSource = await readFile(new URL('../src/presentation.ts', import.meta.url), 'utf8');
const presentationCode = ts.transpileModule(presentationSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { impactFeedback } = await import('data:text/javascript;base64,' + Buffer.from(presentationCode).toString('base64'));

test('upper planet bands extend the field without thinning any original column', () => {
  const worlds = createWorldLayout();
  assert.equal(worlds.length, 810);
  const cells = new Map();
  for (const world of worlds) {
    const layer = Math.floor(world.index / 270), localIndex = world.index % 270;
    const column = localIndex % 9, row = Math.floor(localIndex / 9);
    const bandHeight = Math.abs(column - 4) > 2 ? 42 : 21;
    const { x, y, z } = world.position;
    const altitude = (y - (2 + z * .077 - z * z * .00016)) / bandHeight;
    assert.ok(altitude >= layer - .5 && altitude < layer + .5);
    assert.ok(z >= 32 + row * 30 && z < 42 + row * 30);
    assert.ok(Math.abs(x - (column - 4) * 8) <= 2);
    const key = `${row}/${column}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }
  assert.equal(cells.size, 270);
  assert.ok([...cells.values()].every(count => count === 3));
});
test('off-screen collisions retain only a quiet tremor without flash or hit-stop', () => {
  for (const reduced of [false, true]) {
    const visible = impactFeedback(true, reduced), outside = impactFeedback(false, reduced);
    assert.ok(outside.shake > 0 && outside.shake < visible.shake * .15);
    assert.equal(outside.flash, 0); assert.equal(outside.hitStop, 0); assert.equal(outside.slowMotion, 0);
    assert.ok(outside.volume < visible.volume * .2);
  }
});

test('roster trims blanks, preserves literal names, and caps at thirty', () => {
  assert.deepEqual(parseNames('  민수 \r\n\r\n 지우 \n <b>우주</b> '), ['민수', '지우', '<b>우주</b>']);
  assert.equal(parseNames(Array.from({ length: 35 }, (_, i) => `학생 ${i}`).join('\n')).length, 30);
});
test('a student can be launched exactly once', () => {
  const racer = createFlight('민수', 0); launchFlight(racer); const snapshot = structuredClone(racer);
  launchFlight(racer); assert.deepEqual(racer, snapshot);
});
test('swept collision catches a ball crossing a planet between frames', () => {
  assert.equal(contactTime({ x: 0, y: 0, z: -10 }, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }, 2), .4);
  assert.equal(contactTime({ x: 4, y: 0, z: -10 }, { x: 4, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }, 2), null);
  assert.equal(contactTime({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 2), 0);
});
test('contested planet belongs to earliest contact, and scores exactly once', () => {
  const slow = createFlight('slow', 0), fast = createFlight('fast', 1);
  for (const racer of [slow, fast]) { racer.launched = true; racer.position = { x: 0, y: 0, z: 0 }; racer.velocity = { x: 0, y: 0, z: racer === fast ? 1200 : 720 }; }
  const world = { position: { x: 0, y: 0, z: 5 }, radius: 1, destroyed: false };
  let hits = 0; stepFlights([slow, fast], [world], () => hits++);
  assert.equal(fast.planets, 1); assert.equal(slow.planets, 0); assert.equal(hits, 1);
  stepFlights([slow, fast], [world], () => hits++); assert.equal(hits, 1);
});
test('ranking prefers planets, then farthest distance, then stable input order', () => {
  const racers = ['A', 'B', 'C'].map(createFlight);
  Object.assign(racers[0], { planets: 2, distance: 800 });
  Object.assign(racers[1], { planets: 3, distance: 500 });
  Object.assign(racers[2], { planets: 3, distance: 600 });
  assert.deepEqual(racers.sort(compareFlights).map(r => r.name), ['C', 'B', 'A']);
});
function runRound(count, frameRate, pauses = false) {
  const racers = Array.from({ length: count }, (_, i) => createFlight(`학생 ${i + 1}`, i));
  const worlds = createWorldLayout(), destroyed = new Set(); racers.forEach(launchFlight);
  let accumulator = 0, frame = 0, hits = 0;
  while (!racers.every(r => r.done) && frame < frameRate * 60) {
    frame++;
    if (pauses && frame % 11 === 0) continue;
    accumulator += 1 / frameRate;
    while (accumulator + 1e-12 >= STEP) {
      stepFlights(racers, worlds, (world) => { assert.ok(!destroyed.has(world.index)); destroyed.add(world.index); hits++; });
      accumulator -= STEP;
    }
  }
  assert.ok(racers.every(r => r.done));
  assert.equal(racers.reduce((sum, r) => sum + r.planets, 0), hits);
  assert.ok(hits > 0);
  return racers.map(r => ({ name: r.name, planets: r.planets, distance: r.distance, flightTime: r.flightTime }));
}
for (const count of [2, 30]) {
  test(`${count}-student full round is deterministic at 30/60/144 fps, including hit-stop`, () => {
    const expected = runRound(count, 60);
    assert.deepEqual(runRound(count, 30), expected); assert.deepEqual(runRound(count, 144, true), expected);
    console.log(`${count} students: ${expected.reduce((sum, r) => sum + r.planets, 0)} planets; winner ${[...expected].sort(compareFlights)[0].name}`);
  });
}
