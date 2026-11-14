export const BAT_TIMING = { windup: 1.45, swing: .46, contact: .3, followthrough: .95 } as const;
type Triple = [number, number, number];
export type BatPose = { position: Triple; rotation: Triple };
export type BatMotionPhase = 'idle' | 'countdown' | 'windup' | 'swing' | 'followthrough' | 'flight' | 'settle' | 'results';
type Key = BatPose & { time: number; velocity: Triple; angularVelocity: Triple };
const zero: Triple = [0, 0, 0];
const rest: Key = { time: 0, position: [-1, 1.1, -1.15], rotation: [.08, .08, .07], velocity: zero, angularVelocity: zero };
const loaded: Key = { time: BAT_TIMING.windup, position: [-1.65, 1.62, -1.75], rotation: [-.24, 1.18, .33], velocity: zero, angularVelocity: zero };
const keys: Key[] = [
  rest,
  { time: 1.12, position: [-1.55, 1.55, -1.65], rotation: [-.2, 1.12, .3], velocity: [-.35, .2, -.3], angularVelocity: [-.12, .38, .15] },
  loaded,
  { time: BAT_TIMING.windup + .15, position: [-1.48, 1.45, -1.33], rotation: [-.06, .92, .19], velocity: [3, -2, 5], angularVelocity: [1, -4.8, -1.7] },
  { time: BAT_TIMING.windup + BAT_TIMING.contact, position: [-1, 1.05, -.6], rotation: [.14, 0, 0], velocity: [3.3, -1.2, 3.2], angularVelocity: [-.5, -9.5, -.25] },
  { time: BAT_TIMING.windup + BAT_TIMING.swing, position: [-.63, .9, -.2], rotation: [-.08, -1.05, .08], velocity: [1, -.2, .6], angularVelocity: [-.6, -3.4, .5] },
  { time: BAT_TIMING.windup + BAT_TIMING.swing + .32, position: [-.55, .95, -.04], rotation: [-.14, -1.36, .22], velocity: [.05, .15, .1], angularVelocity: [-.1, -.6, .2] },
  { time: BAT_TIMING.windup + BAT_TIMING.swing + BAT_TIMING.followthrough, position: [-.56, 1.02, -.02], rotation: [-.12, -1.44, .25], velocity: zero, angularVelocity: zero },
];

function interpolate(a: number, b: number, av: number, bv: number, span: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * av * span + (-2 * t3 + 3 * t2) * b + (t3 - t2) * bv * span;
}

export function batCharge(time: number) {
  return Math.max(0, Math.min(1, time / BAT_TIMING.windup));
}

export function sampleBatPose(phase: BatMotionPhase, time = 0): BatPose {
  let globalTime = 0;
  if (phase === 'windup') globalTime = Math.max(0, Math.min(BAT_TIMING.windup, time));
  else if (phase === 'swing') globalTime = BAT_TIMING.windup + Math.max(0, Math.min(BAT_TIMING.swing, time));
  else if (phase === 'followthrough') globalTime = BAT_TIMING.windup + BAT_TIMING.swing + Math.max(0, Math.min(BAT_TIMING.followthrough, time));
  else if (phase === 'flight' || phase === 'settle' || phase === 'results') globalTime = keys[keys.length - 1].time;
  let right = keys.findIndex(key => key.time >= globalTime);
  if (right <= 0) right = globalTime <= 0 ? 1 : keys.length - 1;
  const a = keys[right - 1], b = keys[right], span = b.time - a.time;
  const t = Math.max(0, Math.min(1, (globalTime - a.time) / span));
  const position = a.position.map((value, i) => interpolate(value, b.position[i], a.velocity[i], b.velocity[i], span, t)) as Triple;
  const rotation = a.rotation.map((value, i) => interpolate(value, b.rotation[i], a.angularVelocity[i], b.angularVelocity[i], span, t)) as Triple;
  return { position, rotation };
}
