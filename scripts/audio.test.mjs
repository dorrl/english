import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const designUrl = moduleUrl(compile(await readFile(new URL('../src/sound-design.ts', import.meta.url), 'utf8')));
const { CUE_DURATION, renderCue, planetVoice, ImpactLimiter } = await import(designUrl);
const audioCode = compile(await readFile(new URL('../src/audio.ts', import.meta.url), 'utf8')).replace("'./sound-design'", JSON.stringify(designUrl));
const { Sound } = await import(moduleUrl(audioCode));

function rms(samples, start = 0, end = samples.length) {
  let energy = 0;
  for (let i = start; i < end; i++) energy += samples[i] ** 2;
  return Math.sqrt(energy / (end - start));
}

test('all cues have finite audio, mix headroom and click-free endpoints at device sample rates', () => {
  for (const rate of [24000, 44100, 48000]) for (const cue of Object.keys(CUE_DURATION)) {
    const samples = renderCue(cue, rate);
    assert.equal(samples.length, Math.ceil(CUE_DURATION[cue] * rate));
    let peak = 0, mean = 0;
    for (const sample of samples) {
      assert.ok(Number.isFinite(sample));
      peak = Math.max(peak, Math.abs(sample)); mean += sample;
    }
    assert.ok(peak > .03 && peak < .82, `${cue}: usable level without clipping`);
    assert.ok(Math.abs(mean / samples.length) < .01, `${cue}: negligible DC`);
    assert.equal(Math.abs(samples[0]), 0); assert.equal(Math.abs(samples.at(-1)), 0);
    assert.ok(rms(samples, samples.length - Math.floor(rate * .01)) < peak * .03, `${cue}: release falls well below its transient`);
  }
});

test('bat has a stronger transient than a planet and charge/swing rise toward contact', () => {
  const rate = 24000, bat = renderCue('bat', rate), planet = renderCue('planet', rate);
  const charge = renderCue('charge', rate), swing = renderCue('swing', rate);
  assert.ok(rms(bat, 0, .05 * rate) > rms(planet, 0, .05 * rate) * 1.25);
  assert.ok(rms(bat, 0, .08 * rate) > rms(bat, .35 * rate, .5 * rate) * 8);
  assert.ok(rms(charge, .9 * rate, 1.3 * rate) > rms(charge, .1 * rate, .35 * rate) * 2);
  assert.ok(rms(swing, .2 * rate, .27 * rate) > rms(swing, .02 * rate, .08 * rate) * 5);
  assert.deepEqual(renderCue('planet', rate), planet, 'cached assets can be reproduced exactly');
});

test('planet size changes pitch, panning stays comfortable and far hits never block near hits', () => {
  for (let variation = 0; variation < 20; variation++) {
    assert.ok(planetVoice(1.6, 0, variation).rate > planetVoice(6.8, 0, variation).rate);
    assert.equal(planetVoice(3, 200, variation).pan, .7);
    assert.equal(planetVoice(3, -200, variation).pan, -.7);
  }
  const limiter = new ImpactLimiter();
  assert.equal(limiter.admit(0, .18), true);
  assert.equal(limiter.admit(.001, 1), true, 'visible hit immediately wins over an off-screen hit');
  assert.equal(limiter.admit(.03, 1), false);
  assert.equal(limiter.admit(.07, 1), true);
  assert.equal(limiter.admit(.08, .18), false);
  assert.equal(limiter.admit(.4, .18), true);
  limiter.reset(); assert.equal(limiter.admit(0, 1), true);
});

class Parameter {
  value = 0;
  cancelScheduledValues() {}
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
}
class Node {
  gain = new Parameter(); pan = new Parameter(); frequency = new Parameter(); Q = new Parameter();
  threshold = new Parameter(); knee = new Parameter(); ratio = new Parameter(); attack = new Parameter(); release = new Parameter();
  connect(node) { return node; }
  disconnect() { this.disconnected = true; }
}
class Context {
  static latest;
  currentTime = 0; sampleRate = 24000; destination = new Node(); sources = []; buffers = [];
  constructor() { Context.latest = this; }
  resume() { return Promise.resolve(); }
  createGain() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createBuffer(channels, length) {
    const data = new Float32Array(length), buffer = { duration: length / this.sampleRate, getChannelData: () => data };
    this.buffers.push(buffer); return buffer;
  }
  createBufferSource() {
    const source = new Node(); source.playbackRate = new Parameter();
    source.start = () => { source.active = true; source.end = this.currentTime + source.buffer.duration / source.playbackRate.value; };
    source.stop = () => { source.active = false; source.onended?.(); };
    this.sources.push(source); return source;
  }
  advance(dt) {
    this.currentTime += dt;
    for (const source of this.sources) if (source.active && source.end <= this.currentTime) source.stop();
  }
}

test('dense collision playback is bounded, caches buffers, preserves reveal and resets every voice', () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  try {
    const sound = new Sound(); sound.open(); const ctx = Context.latest;
    sound.tick(); ctx.advance(.75); sound.tick(true); ctx.advance(.75);
    sound.charge(); ctx.advance(1.45); sound.swing(.3); ctx.advance(.3); sound.impact(true);
    for (let i = 0; i < 500; i++) {
      ctx.advance(.015);
      sound.impact(false, i % 3 ? 1 : .18, 2 + i % 5, i % 2 ? 2 : -2);
      assert.ok(ctx.sources.filter(source => source.active).length <= 8);
    }
    sound.winner();
    assert.ok(ctx.sources.at(-1).buffer.duration > 1, 'reveal is not lost behind the collision budget');
    assert.equal(ctx.buffers.length, 7, 'each cue is rendered only once');
    sound.stop();
    assert.ok(ctx.sources.every(source => !source.active && source.disconnected));
    sound.impact(false, 1); assert.equal(ctx.sources.at(-1).active, true, 'reset also clears the rate limiter');
    sound.stop();
  } finally {
    if (previous === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous;
  }
});

test('audio failures and a missing start gesture leave every cue safe to call', () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = class { constructor() { throw new Error('unavailable'); } };
  try {
    const sound = new Sound();
    assert.doesNotThrow(() => { sound.tick(); sound.charge(); sound.swing(.3); sound.impact(); sound.winner(); sound.stop(); sound.open(); sound.impact(true); });
  } finally {
    if (previous === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous;
  }
});
