export type SoundCue = 'tick' | 'ready' | 'charge' | 'swing' | 'bat' | 'planet' | 'winner';
export const CUE_DURATION: Record<SoundCue, number> = {
  tick: .14, ready: .2, charge: 1.45, swing: .3, bat: .78, planet: .64, winner: 1.8,
};
const TAU = Math.PI * 2;
const REVEAL_NOTES = [293.66, 369.99, 440, 587.33];
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

// Cacheable mono PCM. The attack, body and debris share one voice, so a
// crowded field never creates an oscillator/filter graph for every fragment.
export function renderCue(cue: SoundCue, sampleRate: number, duration = CUE_DURATION[cue]) {
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 739, low = 0, air = 0, phase = 0, subPhase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate, p = t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    let value = 0;
    if (cue === 'tick' || cue === 'ready') {
      const frequency = cue === 'ready' ? 660 : 440;
      value = (.19 * Math.sin(TAU * frequency * t) + .045 * Math.sin(TAU * frequency * 2 * t)) * Math.exp(-t * 28);
    } else if (cue === 'charge') {
      const frequency = 54 + 120 * p * p;
      phase += TAU * frequency / sampleRate;
      low += (noise - low) * (1 - Math.exp(-TAU * (240 + p * 1300) / sampleRate));
      const swell = (.025 + .12 * p * p) * Math.min(1, t / .1) * Math.min(1, (duration - t) / .065);
      value = (Math.sin(phase) + .22 * Math.sin(phase * 2) + low * p * .9) * swell;
    } else if (cue === 'swing') {
      low += (noise - low) * (1 - Math.exp(-TAU * (350 + 5500 * p * p) / sampleRate));
      air += (noise - air) * (1 - Math.exp(-TAU * 180 / sampleRate));
      value = (low - air) * .64 * Math.pow(p, 1.8) * Math.min(1, (duration - t) / .018);
    } else if (cue === 'bat' || cue === 'planet') {
      const bat = cue === 'bat';
      const frequency = (bat ? 56 : 45) + (bat ? 135 : 82) * Math.exp(-t * 30);
      phase += TAU * frequency / sampleRate;
      subPhase += TAU * (bat ? 48 : 38) / sampleRate;
      low += (noise - low) * (1 - Math.exp(-TAU * (220 + (bat ? 6200 : 4100) * Math.exp(-t * 17)) / sampleRate));
      air += (noise - air) * (1 - Math.exp(-TAU * 320 / sampleRate));
      const crack = (low - air) * (bat ? 1.1 : .67) * Math.exp(-t * (bat ? 72 : 48));
      const body = Math.sin(phase) * (bat ? .5 : .3) * Math.exp(-t * 11);
      const bass = Math.sin(subPhase) * (bat ? .14 : .075) * Math.exp(-t * 9);
      const ring = (Math.sin(TAU * (bat ? 930 : 1670) * t) + .4 * Math.sin(TAU * (bat ? 1470 : 2310) * t)) * (bat ? .055 : .035) * Math.exp(-t * 23);
      const debris = bat ? 0 : low * .28 * Math.exp(-t * 12) * (.4 + .6 * Math.sin(t * 93) ** 2);
      value = crack + body + bass + ring + debris;
    } else {
      // Warm major-sixth reveal; a soft chord outlasts the ascending notes.
      REVEAL_NOTES.forEach((frequency, note) => {
        const age = t - note * .125;
        if (age < 0) return;
        const envelope = Math.min(1, age / .012) * Math.exp(-age * 3.4);
        value += (Math.sin(TAU * frequency * age) + .17 * Math.sin(TAU * frequency * 2 * age)) * envelope * .13;
      });
      value += (Math.sin(TAU * 146.83 * t) + .4 * Math.sin(TAU * 220 * t)) * Math.min(1, t / .16) * Math.exp(-t * 3) * .045;
    }
    // Sub-millisecond impact onset preserves the crack without a discontinuity.
    const attack = Math.min(1, t / (cue === 'bat' || cue === 'planet' ? .0008 : .003));
    const release = clamp((samples.length - 1 - i) / (sampleRate * .025), 0, 1);
    samples[i] = Math.tanh(value * 1.15) * .82 * attack * release * release;
  }
  return samples;
}

export function planetVoice(radius: number, pan: number, variation: number) {
  return {
    rate: clamp(1.22 - (clamp(radius, 1.6, 6.8) - 1.6) * .075 + (variation % 5 - 2) * .018, .78, 1.28),
    pan: clamp(pan, -.7, .7),
  };
}

// Distant collisions have their own budget: they cannot hide a visible hit.
export class ImpactLimiter {
  private near = -Infinity;
  private far = -Infinity;
  admit(time: number, volume: number) {
    if (volume <= 0) return false;
    if (volume < .3) {
      if (time - this.far < .24 || time - this.near < .12) return false;
      this.far = time;
    } else {
      if (time - this.near < .065) return false;
      this.near = time;
    }
    return true;
  }
  reset() { this.near = this.far = -Infinity; }
}
