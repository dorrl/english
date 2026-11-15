import { CUE_DURATION, ImpactLimiter, planetVoice, renderCue } from './sound-design';
import type { SoundCue } from './sound-design';

type Voice = { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; bus: GainNode; priority: number };

// All cues are synthesized and cached locally after the start/replay gesture.
export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private impacts: GainNode | null = null;
  private buffers = new Map<SoundCue, AudioBuffer>();
  private voices = new Set<Voice>();
  private limiter = new ImpactLimiter();
  private variation = 0;

  open() {
    try {
      if (!this.context) {
        const ctx = new AudioContext();
        this.context = ctx;
        const master = ctx.createGain(), impacts = ctx.createGain();
        master.gain.value = .72;
        const highpass = ctx.createBiquadFilter(), compressor = ctx.createDynamicsCompressor();
        highpass.type = 'highpass'; highpass.frequency.value = 32; highpass.Q.value = .5;
        compressor.threshold.value = -12; compressor.knee.value = 12; compressor.ratio.value = 4;
        compressor.attack.value = .003; compressor.release.value = .14;
        impacts.connect(master); master.connect(highpass).connect(compressor).connect(ctx.destination);
        this.master = master; this.impacts = impacts;
      }
      void this.context.resume().catch(() => {});
    } catch { /* Keep the game playable when audio is unavailable. */ }
  }

  private buffer(cue: SoundCue) {
    let buffer = this.buffers.get(cue);
    if (!buffer && this.context) {
      const pcm = renderCue(cue, this.context.sampleRate);
      buffer = this.context.createBuffer(1, pcm.length, this.context.sampleRate);
      buffer.getChannelData(0).set(pcm); this.buffers.set(cue, buffer);
    }
    return buffer;
  }

  private release(voice: Voice) {
    if (!this.voices.delete(voice)) return;
    voice.source.disconnect(); voice.gain.disconnect(); voice.pan.disconnect();
  }

  private play(cue: SoundCue, volume = 1, rate = 1, pan = 0, priority = 2) {
    if (!this.context || !this.master || !this.impacts || volume <= 0) return;
    // Reserve voices for launch/reveal. Quiet distant hits can occupy at most
    // two slots; no audible tail is cut off just to make room for another hit.
    if (this.voices.size >= 8) return;
    if (cue === 'planet') {
      const collisions = [...this.voices].filter(voice => voice.bus === this.impacts);
      if (collisions.length >= 6 || (priority === 0 && collisions.filter(voice => voice.priority === 0).length >= 2)) return;
    }
    const buffer = this.buffer(cue);
    if (!buffer) return;
    const ctx = this.context, source = ctx.createBufferSource(), gain = ctx.createGain(), panner = ctx.createStereoPanner();
    source.buffer = buffer; source.playbackRate.value = rate;
    gain.gain.value = Math.max(0, Math.min(1, volume)); panner.pan.value = pan;
    const bus = cue === 'planet' ? this.impacts : this.master;
    source.connect(gain).connect(panner).connect(bus);
    const voice = { source, gain, pan: panner, bus, priority };
    this.voices.add(voice); source.onended = () => this.release(voice);
    source.start();
    return voice;
  }

  tick(final = false) { this.play(final ? 'ready' : 'tick', .78); }
  charge(duration = 1.45) { this.play('charge', 1, CUE_DURATION.charge / duration); }
  swing(duration: number) { this.play('swing', .9, CUE_DURATION.swing / duration, -.12, 3); }

  impact(bat = false, volume = 1, radius = 3, pan = 0) {
    if (!this.context || !this.impacts) return;
    const t = this.context.currentTime;
    if (bat) {
      this.impacts.gain.cancelScheduledValues(t);
      this.impacts.gain.setValueAtTime(.28, t);
      this.impacts.gain.linearRampToValueAtTime(1, t + .34);
      this.play('bat', 1, 1, 0, 4);
    } else if (this.limiter.admit(t, volume)) {
      const voice = planetVoice(radius, pan, this.variation++);
      this.play('planet', volume * .86, voice.rate, voice.pan, volume < .3 ? 0 : 1);
    }
  }

  winner() { this.play('winner', .8, 1, 0, 4); }
  stop() {
    for (const voice of this.voices) { try { voice.source.stop(); } catch {} this.release(voice); }
    this.voices.clear(); this.limiter.reset(); this.variation = 0;
    if (this.context && this.impacts) {
      this.impacts.gain.cancelScheduledValues(this.context.currentTime);
      this.impacts.gain.value = 1;
    }
  }
}
