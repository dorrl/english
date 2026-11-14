import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/simulation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const simulationUrl = 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
const sim = await import(simulationUrl);
const { STEP, FINISH_DISTANCE, compareFlights, contactTime, createFlight, createWorldLayout, distancePoints, launchFlight, parseNames, scoreFlight, stepFlights } = sim;
const presentationSource = await readFile(new URL('../src/presentation.ts', import.meta.url), 'utf8');
const presentationCode = ts.transpileModule(presentationSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { impactFeedback } = await import('data:text/javascript;base64,' + Buffer.from(presentationCode).toString('base64'));
const directorSource = await readFile(new URL('../src/camera-director.ts', import.meta.url), 'utf8');
const directorCode = ts.transpileModule(directorSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { CameraDirector } = await import('data:text/javascript;base64,' + Buffer.from(directorCode).toString('base64'));
const scenerySource = await readFile(new URL('../src/scenery-layout.ts', import.meta.url), 'utf8');
const sceneryCode = ts.transpileModule(scenerySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace("'./simulation'", JSON.stringify(simulationUrl));
const { createSceneryLayout } = await import('data:text/javascript;base64,' + Buffer.from(sceneryCode).toString('base64'));
const motionSource = await readFile(new URL('../src/bat-motion.ts', import.meta.url), 'utf8');
const motionCode = ts.transpileModule(motionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { BAT_TIMING, sampleBatPose } = await import('data:text/javascript;base64,' + Buffer.from(motionCode).toString('base64'));

function batPoint(pose, length=9.5) {
  const [x,y,z]=pose.rotation;
  return [pose.position[0]+length*Math.cos(y)*Math.cos(z), pose.position[1]+length*(Math.sin(x)*Math.sin(y)*Math.cos(z)+Math.cos(x)*Math.sin(z)), pose.position[2]+length*(-Math.cos(x)*Math.sin(y)*Math.cos(z)+Math.sin(x)*Math.sin(z))];
}
test('bat crosses the launch plane forward at the exact contact pose', () => {
  const pose=sampleBatPose('swing',BAT_TIMING.contact), contact=batPoint(pose);
  assert.deepEqual(contact,[8.5,1.05,-.6]);
  const before=batPoint(sampleBatPose('swing',BAT_TIMING.contact-.005));
  const after=batPoint(sampleBatPose('swing',BAT_TIMING.contact+.005));
  assert.ok(before[2]<contact[2]&&after[2]>contact[2]);
  assert.ok((after[2]-before[2])/.01>80, 'maximum barrel speed coincides with launch');
});
test('bat poses and velocities remain continuous across animation phases', () => {
  const boundaries=[['windup',BAT_TIMING.windup,'swing'],['swing',BAT_TIMING.swing,'followthrough'],['followthrough',BAT_TIMING.followthrough,'flight']];
  const epsilon=.00001;
  for(const [left,duration,right] of boundaries) {
    const end=sampleBatPose(left,duration), start=sampleBatPose(right,0);
    assert.deepEqual(end,start);
    const before=sampleBatPose(left,duration-epsilon), after=sampleBatPose(right,epsilon);
    for(const property of ['position','rotation']) for(let axis=0;axis<3;axis++) {
      const incoming=(end[property][axis]-before[property][axis])/epsilon;
      const outgoing=(after[property][axis]-start[property][axis])/epsilon;
      assert.ok(Math.abs(incoming-outgoing)<.005, `${left}/${right} ${property} ${axis}`);
    }
  }
});
test('bat accelerates into impact, settles, and stays clear of the deck', () => {
  function speed(phase,time) {
    const a=sampleBatPose(phase,time-.0001), b=sampleBatPose(phase,time+.0001);
    return Math.abs((b.rotation[1]-a.rotation[1])/.0002);
  }
  assert.ok(speed('swing',BAT_TIMING.contact)>speed('swing',.06)*3);
  assert.ok(speed('followthrough',.7)<.4);
  assert.deepEqual(sampleBatPose('idle'),sampleBatPose('countdown'));
  for(const phase of ['windup','swing','followthrough']) {
    for(let time=0;time<=BAT_TIMING[phase];time+=.005) {
      const pose=sampleBatPose(phase,time);
      assert.ok([...pose.position,...pose.rotation].every(Number.isFinite));
      assert.ok(batPoint(pose,11)[1]>.0,'barrel center stays above the launch deck');
    }
  }
});

test('planets span both sides and stay near the disappearance floor in every sector', () => {
  const worlds = createWorldLayout();
  assert.ok(Math.min(...worlds.map(w=>w.position.x)) < -75);
  assert.ok(Math.max(...worlds.map(w=>w.position.x)) > 75);
  for (let sector=0;sector<8;sector++) {
    const bottom = worlds.filter(w=>w.position.z>=sector*325&&w.position.z<(sector+1)*325&&w.position.y < -95);
    assert.ok(bottom.length >= 25);
    assert.ok(bottom.some(w=>w.position.y-w.radius < -110));
  }
});
test('scenery adds bounded, non-scoring landmarks across the whole map', () => {
  const scenery = createSceneryLayout();
  assert.equal(scenery.length, 28);
  for (const kind of ['star','satellite','station']) assert.ok(scenery.some(item=>item.kind===kind));
  assert.ok(scenery.some(item=>item.position.x<0)&&scenery.some(item=>item.position.x>0));
  assert.ok(scenery.every(item=>Math.abs(item.position.x)>=59&&item.scale>0&&item.position.z<FINISH_DISTANCE));
  assert.ok(scenery.some(item=>item.position.z>2300));
});

test('camera visits different active balls before repeating, regardless of rank', () => {
  const subjects = Array.from({ length: 30 }, (_, index) => ({ index, launched: true, done: false, planets: 30-index }));
  const director = new CameraDirector(42), visited = [];
  for (let shot=0;shot<8;shot++) visited.push(director.update(4,subjects).index);
  assert.equal(new Set(visited).size, 8);
  assert.ok(visited.some(index=>index>10));
  const current = subjects.find(subject=>subject.index===visited.at(-1)); current.done = true;
  assert.notEqual(director.update(0,subjects).index,current.index);
  director.reset(42);
  assert.equal(director.update(0,subjects.filter(subject=>subject.index!==current.index)).index,visited[0]);
});
test('two-player camera alternates and safely holds the remaining flight', () => {
  const subjects = [0,1].map(index=>({ index, launched:true, done:false })), director = new CameraDirector(7);
  const first = director.update(0,subjects), second = director.update(4,subjects);
  assert.notEqual(first.index,second.index);
  assert.equal(director.update(4,subjects).index,first.index);
  first.done = true; assert.equal(director.update(0,subjects).index,second.index);
  second.done = true; assert.equal(director.update(4,subjects),null);
});

test('random camera holds favor quick changes and never exceed the previous maximum', () => {
  const subjects = [0,1].map(index=>({index,launched:true,done:false}));
  function durations(seed, reducedMotion=false) {
    const director = new CameraDirector(seed,reducedMotion), holds=[];
    let current = director.update(0,subjects).index, elapsed=0;
    while(holds.length<150) {
      elapsed += STEP;
      const next = director.update(STEP,subjects).index;
      if(next!==current) { holds.push(elapsed); elapsed=0; current=next; }
    }
    return holds;
  }
  const holds = durations(42);
  assert.ok(holds.every(duration=>duration>=1.05&&duration<=3.64+STEP));
  assert.ok(holds.reduce((sum,duration)=>sum+duration,0)/holds.length < 2.3);
  assert.ok(new Set(holds.map(duration=>duration.toFixed(2))).size > 50);
  assert.notDeepEqual(holds,durations(43));
  assert.ok(durations(42,true).every(duration=>duration>=1.8&&duration<=4.3+STEP));
});

test('denser random planets preserve wide, clear flight corridors', () => {
  const worlds = createWorldLayout();
  assert.ok(FINISH_DISTANCE >= 2500);
  assert.equal(worlds.length, 1200);
  assert.ok(Math.max(...worlds.map(w => w.position.z)) > 2500);
  assert.ok(Math.max(...worlds.map(w => w.position.x)) - Math.min(...worlds.map(w => w.position.x)) > 90);
  assert.ok(Math.max(...worlds.map(w => w.position.y)) - Math.min(...worlds.map(w => w.position.y)) > 100);
  for (let i = 0; i < worlds.length; i++) {
    for (let j = i + 1; j < worlds.length; j++) {
      const a = worlds[i], b = worlds[j];
      const distance = Math.hypot(a.position.x-b.position.x, a.position.y-b.position.y, a.position.z-b.position.z);
      assert.ok(distance > a.radius + b.radius + 2, 'planet surfaces have breathing room');
    }
  }
});

test('round seeds change planet positions, sizes and appearance reproducibly', () => {
  const first = createWorldLayout(42), replay = createWorldLayout(42), other = createWorldLayout(731);
  assert.deepEqual(first, replay);
  assert.notDeepEqual(first.map(w=>w.position), other.map(w=>w.position));
  assert.notDeepEqual(first.map(w=>w.radius), other.map(w=>w.radius));
  assert.notDeepEqual(first.map(w=>w.appearanceSeed), other.map(w=>w.appearanceSeed));
  for (const layout of [first,other]) {
    assert.equal(layout.length, 1200);
    assert.ok(layout.every(w=>w.radius>=1.6&&w.radius<=6.8));
    assert.ok(layout.filter(w=>w.radius<2.8).length>330);
    assert.ok(layout.filter(w=>w.radius>4.6).length>170);
    assert.ok(Math.max(...layout.map(w=>w.radius))/Math.min(...layout.map(w=>w.radius))>3.8);
    assert.ok(new Set(layout.map(w=>Math.round(w.position.x))).size>140);
    for (let i=0;i<layout.length;i++) for (let j=i+1;j<layout.length;j++) {
      const a=layout[i],b=layout[j];
      assert.ok(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z)>a.radius+b.radius+2);
    }
  }
});
test('scores combine 150 per planet and one point per whole forward meter', () => {
  assert.equal(scoreFlight({ planets: 3, distance: 800.9 }), 1250);
  assert.equal(scoreFlight({ planets: 0, distance: 0 }), 0);
  assert.equal(distancePoints(-2), 0);
  assert.equal(distancePoints(FINISH_DISTANCE + 10), FINISH_DISTANCE);
});
test('launch angles vary left/right and up/down, with reproducible per-round seeds', () => {
  const launchSet = seed => Array.from({length:30}, (_,index) => {
    const racer = createFlight('test', index, seed); launchFlight(racer); return racer;
  });
  const racers = launchSet(42);
  assert.ok(racers.some(r => r.velocity.x < -1) && racers.some(r => r.velocity.x > 1));
  assert.ok(racers.some(r => r.velocity.y < -1) && racers.some(r => r.velocity.y > 1));
  assert.deepEqual(launchSet(42), racers);
  assert.equal(new Set(racers.map(r=>r.curve.kind)).size, 4);
  assert.notDeepEqual(launchSet(43).map(r=>r.velocity), racers.map(r=>r.velocity));
});
test('gentle curve forces bend the trajectory without random frame-dependent kicks', () => {
  const curved = createFlight('curve', 0, 42); launchFlight(curved);
  const straight = structuredClone(curved); straight.curve.x = straight.curve.y = 0;
  for (let i=0;i<1200;i++) { stepFlights([curved],[],()=>{}); stepFlights([straight],[],()=>{}); }
  const deviation = Math.hypot(curved.position.x-straight.position.x,curved.position.y-straight.position.y);
  assert.ok(deviation > .5 && deviation < 30);
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
test('ranking uses combined points so enough distance can overtake a planet lead', () => {
  const racers = ['A', 'B', 'C'].map((name, index) => createFlight(name, index));
  Object.assign(racers[0], { planets: 2, distance: 800 });
  Object.assign(racers[1], { planets: 3, distance: 500 });
  Object.assign(racers[2], { planets: 3, distance: 600 });
  assert.deepEqual(racers.sort(compareFlights).map(r => r.name), ['A', 'C', 'B']);
});
function runRound(count, frameRate, pauses = false, seed = 0) {
  const racers = Array.from({ length: count }, (_, i) => createFlight(`학생 ${i + 1}`, i, seed));
  const worlds = createWorldLayout(seed), destroyed = new Set(); racers.forEach(launchFlight);
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
  assert.ok(racers.some(r => r.flightTime > 18), 'the extended map produces a longer show');
  assert.ok(racers.every(r => scoreFlight(r) === r.planets * 150 + Math.floor(r.distance)));
  if (count === 30) assert.ok(Math.max(...racers.map(r=>r.distance)) - Math.min(...racers.map(r=>r.distance)) > 500, 'launch variation makes distance points meaningful');
  return racers.map(r => ({ name: r.name, planets: r.planets, distance: r.distance, flightTime: r.flightTime, score: scoreFlight(r) }));
}
test('a newly randomized map also keeps the same score across presentation speeds', () => {
  assert.deepEqual(runRound(30,30,false,42),runRound(30,144,true,42));
});
for (const count of [2, 30]) {
  test(`${count}-student full round is deterministic at 30/60/144 fps, including hit-stop`, () => {
    const expected = runRound(count, 60);
    assert.deepEqual(runRound(count, 30), expected); assert.deepEqual(runRound(count, 144, true), expected);
    console.log(`${count} students: ${expected.reduce((sum, r) => sum + r.planets, 0)} planets; winner ${[...expected].sort(compareFlights)[0].name}`);
  });
}
