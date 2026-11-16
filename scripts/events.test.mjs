import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/simulation.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { STEP, FINISH_DISTANCE, WORLD_COUNT, MAX_SPEED, GRAVITY, GRAVITY_FIRST_RAMP_START, GRAVITY_RAMP_START, LAUNCH_SPEED_MULTIPLIER, CENTER_PULL_START, MAX_CENTER_PULL, centerAcceleration, downwardAcceleration, createFlight, createWorldLayout, launchFlight, random, additionalPoints, scoreFlight, planetGravity, triggerSpecial, magnetRange, resetWorldField, stepFlights } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const eventSource = await readFile(new URL('../src/special-events.ts', import.meta.url), 'utf8');
const eventCode = ts.transpileModule(eventSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { EventFeed, eventDescription } = await import('data:text/javascript;base64,' + Buffer.from(eventCode).toString('base64'));

function flight(index = 0, x = 0, z = 0) {
  const f = createFlight(`학생 ${index}`, index, 42);
  f.launched = true; f.position = { x, y: 0, z }; f.previous = { ...f.position };
  f.velocity = { x: 0, y: 0, z: 100 }; f.curve.x = f.curve.y = 0;
  return f;
}
const world = (x, y, z, radius = 3, special = null) => ({ position: { x, y, z }, radius, special, destroyed: false, index: 0, appearanceSeed: 921 });

test('gentle centering acts only outside the corridor and returns both sides smoothly', () => {
  for (const x of [0,30,-30,CENTER_PULL_START,-CENTER_PULL_START]) assert.equal(centerAcceleration(x),0);
  assert.ok(Math.abs(centerAcceleration(CENTER_PULL_START+.001))<.000001);
  assert.ok(centerAcceleration(145)<0&&centerAcceleration(-145)>0);
  assert.equal(centerAcceleration(145),-centerAcceleration(-145));
  assert.ok(Math.abs(centerAcceleration(100000))<=MAX_CENTER_PULL);
  const right=flight(0,170),left=flight(1,-170),flights=[right,left],empty=[];
  for(let i=0;i<960;i++) stepFlights(flights,empty,()=>{});
  assert.ok(right.position.x<168&&right.position.x>140,'a gentle turn rather than snapping to the center');
  assert.ok(Math.abs(right.position.x+left.position.x)<1e-8);
});

test('baseline downward acceleration keeps an unassisted flight bounded', () => {
  const f=flight(),flights=[f],empty=[];
  for(let i=0;i<3000&&!f.done;i++) stepFlights(flights,empty,()=>{});
  assert.ok(f.done); assert.ok(f.flightTime>18&&f.flightTime<26);
  assert.ok(f.position.y < -115);
});

test('downward force starts 10% softer, ramps gently at 30s and faster at 60s without jumps', () => {
  assert.ok(Math.abs(GRAVITY-.546*.9)<1e-12);
  assert.equal(GRAVITY_FIRST_RAMP_START,30); assert.equal(GRAVITY_RAMP_START,60);
  for(const time of [0,15,29.99,30]) assert.equal(downwardAcceleration(time),GRAVITY);
  assert.ok(Math.abs(downwardAcceleration(45)-(GRAVITY+.03))<1e-12);
  for(const boundary of [30,60]) {
    assert.ok(downwardAcceleration(boundary+.001)>downwardAcceleration(boundary));
    assert.ok(downwardAcceleration(boundary+.001)-downwardAcceleration(boundary)<.0001,'no sudden force jump');
  }
  assert.ok(downwardAcceleration(61)-downwardAcceleration(60)>10*(downwardAcceleration(31)-downwardAcceleration(30)));
  assert.ok(downwardAcceleration(70)<downwardAcceleration(80));
  assert.ok(downwardAcceleration(80)<downwardAcceleration(90));
  assert.equal(downwardAcceleration(1000),3.2);
});

test('launch speed increases by 6% while preserving seeded launch angles', () => {
  assert.equal(LAUNCH_SPEED_MULTIPLIER,1.06);
  for(let index=0;index<30;index++) {
    const f=createFlight('test',index,42),seed=f.seed;
    const old={x:(random(seed+1)-.5)*8.5+(random(seed+601)-.5)*.34*4,y:2+(random(seed+2)-.5)*9,z:88+random(seed+3)*20};
    launchFlight(f);
    for(const axis of ['x','y','z']) assert.ok(Math.abs(f.velocity[axis]-old[axis]*1.06)<1e-12);
  }
});

test('flights survive the 60-second boundary and older flights fall harder', () => {
  const boundary=flight(); boundary.position.y=50; boundary.flightTime=59.95;
  for(let i=0;i<24;i++) stepFlights([boundary],[],()=>{});
  assert.ok(boundary.flightTime>60&&!boundary.done,'the former 60-second timeout must not prevent the ramp');
  const early=flight(0),late=flight(1); early.position.y=late.position.y=50; late.flightTime=80;
  const flights=[early,late],empty=[];
  for(let i=0;i<120;i++) stepFlights(flights,empty,()=>{});
  assert.ok(late.velocity.y<early.velocity.y-1);
  assert.ok(late.position.y<early.position.y-.5);
});

test('both gravity ramp boundaries preserve results across presentation frame rates', () => {
  function run(rate) {
    const f=flight(),flights=[f],empty=[]; f.position.y=90; f.velocity.y=3; f.flightTime=29.4;
    let accumulator=0;
    for(let frame=0;frame<rate*50&&!f.done;frame++) {
      accumulator+=1/rate;
      while(accumulator+1e-12>=STEP) { stepFlights(flights,empty,()=>{}); accumulator-=STEP; }
    }
    assert.ok(f.done&&f.flightTime>60&&f.flightTime<110);
    return {position:f.position,velocity:f.velocity,time:f.flightTime,score:scoreFlight(f)};
  }
  assert.deepEqual(run(30),run(60)); assert.deepEqual(run(144),run(60));
});

test('special planets are reproducible, varied and distributed across the 10000m map', () => {
  const worlds = createWorldLayout(491), specials = worlds.filter(w => w.special);
  assert.equal(FINISH_DISTANCE, 10000); assert.equal(worlds.length, WORLD_COUNT);
  assert.ok(specials.length > WORLD_COUNT * .1 && specials.length < WORLD_COUNT * .18);
  for (const kind of ['boost', 'bonus', 'drain', 'magnet']) assert.ok(specials.filter(w => w.special === kind).length > 45);
  for (let sector = 0; sector < 20; sector++) assert.ok(specials.some(w => w.position.z >= sector * 500 && w.position.z < (sector + 1) * 500));
  assert.deepEqual(worlds, createWorldLayout(491));
});

test('planet gravity points at the center, fades continuously and has no singularity', () => {
  const w = world(0, 0, 0), radius = 12 + w.radius * 3;
  const left = planetGravity({ x: -8, y: 0, z: 0 }, w), right = planetGravity({ x: 8, y: 0, z: 0 }, w);
  assert.ok(left.x > 0); assert.equal(left.x, -right.x); assert.equal(left.y, 0);
  assert.ok(planetGravity({ x: 0, y: -8, z: 0 }, w).y > 0);
  assert.ok(planetGravity({ x: 0, y: 0, z: -8 }, w).z > 0);
  assert.deepEqual(planetGravity({ x: radius, y: 0, z: 0 }, w), { x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(planetGravity({ x: radius - .001, y: 0, z: 0 }, w).x) < .0001);
  assert.deepEqual(planetGravity(w.position, w), { x: 0, y: 0, z: 0 });
  const center = planetGravity({ x: .00001, y: 0, z: 0 }, w);
  assert.ok(Number.isFinite(center.x) && Math.abs(center.x) < .001, 'soft core force tends to zero at the center');
  w.destroyed = true; assert.deepEqual(planetGravity({ x: -8, y: 0, z: 0 }, w), { x: 0, y: 0, z: 0 });
});

test('a fly-by curves toward a planet without teleporting or becoming trapped', () => {
  const f = flight(), baseline = flight(), worlds = [world(9, 0, 50)];
  const flights = [f], straight = [baseline], empty = [];
  for (let i = 0; i < 120; i++) { stepFlights(flights, worlds, () => {}); stepFlights(straight, empty, () => {}); }
  assert.ok(f.position.x > baseline.position.x + .3);
  assert.ok(f.position.z > 80);
  assert.ok(Object.values(f.velocity).every(Number.isFinite));
  assert.ok(f.velocity.z >= 24);
});

test('overlapping gravity fields have bounded acceleration and speed', () => {
  const f = flight(), worlds = Array.from({ length: 100 }, () => world(2.5, 0, 0, 1));
  const before = { ...f.velocity }; stepFlights([f], worlds, () => {});
  const delta = Math.hypot(f.velocity.x - before.x, f.velocity.y - before.y, f.velocity.z - before.z);
  assert.ok(delta <= 56 * STEP);
  f.velocity = { x: 100000, y: 100000, z: 100000 }; stepFlights([f], [], () => {});
  assert.ok(Math.hypot(f.velocity.x, f.velocity.y, f.velocity.z) <= MAX_SPEED + 1e-9);
});

test('speed and score rewards apply exactly once per special planet', () => {
  const f = flight(); f.velocity = { x: 2, y: -3, z: 100 };
  triggerSpecial('boost', f, [f], 10);
  assert.deepEqual(f.velocity, { x: 3, y: -4.5, z: 150 });
  const before = scoreFlight(f); triggerSpecial('bonus', f, [f], 11);
  assert.equal(scoreFlight(f) - before, 1000);
  const w = world(f.position.x, 0, f.position.z, 1, 'bonus'), worlds = [w], flights = [f];
  let events = 0, hits = 0;
  stepFlights(flights, worlds, () => hits++, () => events++);
  const after = f.eventPoints;
  stepFlights(flights, worlds, () => hits++, () => events++);
  assert.equal(events, 1); assert.equal(hits, 1); assert.equal(f.eventPoints, after);
  assert.equal(additionalPoints(f), f.planets * 150 + f.eventPoints);
});

test('score wave samples unique other students, including finishers, with exact deductions', () => {
  for (const count of [2, 5, 6, 10, 30]) {
    const flights = Array.from({ length: count }, (_, i) => flight(i));
    for (const f of flights.slice(1)) f.done = true;
    const event = triggerSpecial('drain', flights[0], flights, 9831);
    assert.equal(event.targets.length, Math.max(1, Math.round((count - 1) * .2)));
    assert.equal(new Set(event.targets).size, event.targets.length);
    assert.ok(!event.targets.includes(flights[0]));
    assert.ok(event.targets.every(f => f.eventPoints === -500 && scoreFlight(f) === -500));
    assert.equal(flights.reduce((sum, f) => sum + f.eventPoints, 0), event.targets.length * -500);
    assert.equal(flights[0].eventPoints, 0);
  }
});

test('score wave selection is seeded, varies between events and ignores roster iteration order', () => {
  function targets(seed, reversed = false) {
    const flights = Array.from({ length: 30 }, (_, i) => flight(i));
    return triggerSpecial('drain', flights[0], reversed ? [...flights].reverse() : flights, seed).targets.map(f => f.index);
  }
  assert.deepEqual(targets(45), targets(45, true));
  assert.ok(new Set(Array.from({ length: 20 }, (_, seed) => targets(seed).join(','))).size > 15);
});

test('magnet pulls actual planets toward the nearest eligible ball and range stacks safely', () => {
  function run(reverse) {
    const far = flight(0, -20), near = flight(1, 10);
    far.magnetLevel = near.magnetLevel = 1;
    const w = world(0, 0, 0, 1), flights = reverse ? [near, far] : [far, near];
    stepFlights(flights, [w], () => {});
    return w.position;
  }
  assert.ok(run(false).x > 0); assert.deepEqual(run(false), run(true));
  const f = flight(); assert.equal(magnetRange(f), 0);
  triggerSpecial('magnet', f, [f], 1); assert.equal(magnetRange(f), 28);
  triggerSpecial('magnet', f, [f], 2); assert.equal(magnetRange(f), 40);
  for (let i = 0; i < 30; i++) triggerSpecial('magnet', f, [f], i);
  assert.equal(magnetRange(f), 64);
});

test('resetting the field rebuilds collision queries after a new map is placed', () => {
  const f = flight(), w = world(0, 0, 1500, 1), worlds = [w], flights = [f];
  stepFlights(flights, worlds, () => {});
  w.position.z = f.position.z + .4; resetWorldField(worlds);
  let hits = 0; stepFlights(flights, worlds, () => hits++);
  assert.equal(hits, 1);
});

test('moving planets keep swept contact and bucket membership across depth-cell boundaries', () => {
  const f = flight(), w = world(10, 0, 64.05, 1), worlds = [w], flights = [f];
  w.velocity = { x: 0, y: 0, z: -22 };
  stepFlights(flights, worlds, () => {});
  assert.ok(w.position.z < 64 && w.previous.z > 64);
  f.position = { x: w.position.x, y: 0, z: w.position.z - 1.7 }; f.velocity.z = 120;
  let hits = 0; stepFlights(flights, worlds, () => hits++);
  assert.equal(hits, 1);
  stepFlights(flights, worlds, () => hits++); assert.equal(hits, 1);
});

test('event notices queue every actor, expose actual target counts, and allow reading before results', () => {
  class Element {
    constructor(tag) { this.tag = tag; }
    children = []; style = { setProperty() {} };
    classes = new Set();
    classList = { toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name) };
    setAttribute() {}
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    prepend(child) { child.parent = this; this.children.unshift(child); }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    replaceChildren() { this.children = []; }
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  try {
    const list = new Element(), feed = new EventFeed(list), seen = new Set();
    const flights = Array.from({ length: 7 }, (_, i) => flight(i));
    const wave = triggerSpecial('drain', flights[0], flights, 7);
    assert.equal(eventDescription(wave), `${wave.targets.length}명에게 각각 −500점`);
    for (const actor of flights) feed.push({ kind: 'bonus', actor, targets: [], amount: 1000, range: 0 });
    assert.equal(feed.readyForResults, false);
    function actors(node) { return node.tag === 'strong' ? [node.textContent] : node.children.flatMap(actors); }
    for (let i = 0; i < 68; i++) {
      feed.update(.25); assert.ok(list.children.length <= 3);
      for (const node of list.children) for (const name of actors(node)) seen.add(name);
    }
    assert.equal(seen.size, 7); assert.equal(feed.readyForResults, true);
    feed.push(wave); feed.update(0); assert.equal(feed.readyForResults, false);
    feed.update(4.9); assert.ok(list.children[0].classes.has('is-leaving'), 'exit animation starts before removal');
    feed.clear(); assert.equal(list.children.length, 0); assert.equal(feed.readyForResults, true);
    for(const actor of flights) feed.push({kind:'bonus',actor,targets:[],amount:1000,range:0});
    feed.update(0);
    assert.equal(feed.notifyGravity(29.999,30,1),false);
    assert.equal(feed.notifyGravity(30,30,1),true);
    assert.equal(list.children.length,4,'milestone is immediate even with three occupied student slots');
    assert.deepEqual(actors(list.children[0]),['30초 경과']);
    assert.equal(feed.notifyGravity(40,30,1),false);
    assert.equal(feed.notifyGravity(59.999,60,2),false);
    assert.equal(feed.notifyGravity(60.01,60,2),true,'crossing the boundary must not require exact equality');
    assert.equal(list.children.length,4,'only one priority system notice is retained');
    assert.deepEqual(actors(list.children[0]),['60초 경과']);
    assert.equal(feed.readyForResults,false);
    assert.equal(feed.notifyGravity(80,60,2),false);
    seen.clear();
    for(let i=0;i<68;i++) {
      for(const node of list.children) for(const name of actors(node)) if(name.startsWith('학생')) seen.add(name);
      feed.update(.25); assert.ok(list.children.length<=4);
    }
    assert.equal(seen.size,7,'priority announcements must not discard student events');
    assert.equal(feed.readyForResults,true);
    feed.clear(); assert.equal(list.children.length,0);
    assert.equal(feed.notifyGravity(60,60,2),true,'reset permits the next round announcement');
  } finally {
    if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
  }
});
