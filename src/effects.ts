import * as THREE from 'three';
import { fragmentGeometry, shockGeometry } from './arena';
import { random } from './simulation';
import type { Vector } from './simulation';

const MAX_FRAGMENTS = 600, MAX_WAVES = 24;
type Fragment = { position: THREE.Vector3; velocity: THREE.Vector3; life: number; duration: number; size: number; spin: number; color: THREE.Color };
type Wave = { mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>; life: number; duration: number; radius: number };
type Core = { sprite: THREE.Sprite; life: number; radius: number };
export class Effects {
  private fragments: Fragment[] = [];
  private fragmentCursor = 0;
  private waveCursor = 0;
  private waves: Wave[] = [];
  private cores: Core[] = [];
  private coreCursor = 0;
  private dummy = new THREE.Object3D();
  private debris = new THREE.InstancedMesh(fragmentGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .92 }), MAX_FRAGMENTS);
  light = new THREE.PointLight(0xffd395, 0, 42, 2);
  constructor(private scene: THREE.Scene, glow: THREE.Texture) {
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.debris.frustumCulled = false;
    this.scene.add(this.debris, this.light);
    for (let i = 0; i < MAX_FRAGMENTS; i++) this.fragments.push({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, duration: 1, size: 0, spin: 0, color: new THREE.Color() });
    for (let i = 0; i < MAX_WAVES; i++) {
      const mesh = new THREE.Mesh(shockGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.visible = false; this.scene.add(mesh); this.waves.push({ mesh, life: 0, duration: 1, radius: 1 });
    }
    for (let i = 0; i < 8; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffe0b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.visible = false; this.scene.add(sprite); this.cores.push({ sprite, life: 0, radius: 1 });
    }
    this.update(0);
  }
  burst(position: Vector, color: number, radius: number, big = false) {
    const count = big ? 100 : 54, power = big ? 29 : 16;
    for (let i = 0; i < count; i++) {
      const slot = this.fragmentCursor++ % MAX_FRAGMENTS, fragment = this.fragments[slot];
      fragment.position.copy(position);
      fragment.velocity.set(random(slot + 39) - .5, random(slot + 89) - .5, random(slot + 179) - .5).normalize().multiplyScalar(power * (.45 + random(slot + 4)));
      fragment.duration = fragment.life = .6 + random(slot + 81) * 1.1;
      fragment.size = i % 8 === 0 ? radius * .28 : .08 + random(slot + 21) * .23;
      fragment.spin = random(slot + 791) * 8;
      fragment.color.set(i % 5 === 0 ? 0xfff4cc : color);
    }
    for (let i = 0; i < 3; i++) {
      const wave = this.waves[this.waveCursor++ % MAX_WAVES];
      wave.life = wave.duration = .5 + i * .16; wave.radius = radius * (.7 + i * .25);
      wave.mesh.position.copy(position); wave.mesh.rotation.set(i * .6, i * .25, i * .5); wave.mesh.material.color.set(i === 0 ? 0xffe7b0 : color); wave.mesh.visible = true;
    }
    const core = this.cores[this.coreCursor++ % this.cores.length];
    core.life = .3; core.radius = radius; core.sprite.position.copy(position); core.sprite.visible = true;
    this.light.position.copy(position); this.light.color.set(color); this.light.intensity = big ? 130 : 95;
  }
  charge(position: Vector, progress: number, time: number) {
    if (progress < .2) return;
    for (let i = 0; i < 3; i++) {
      const angle = time * 13 + i * Math.PI * 2 / 3, radius = 1 + (1 - progress) * 4;
      const fragment = this.fragments[this.fragmentCursor++ % MAX_FRAGMENTS];
      fragment.position.set(position.x + Math.cos(angle) * radius, position.y + Math.sin(angle) * radius, position.z);
      fragment.velocity.set(-Math.cos(angle) * 6, -Math.sin(angle) * 6, 0);
      fragment.duration = fragment.life = .2; fragment.size = .065; fragment.spin = 0; fragment.color.set(0xffd085);
    }
  }
  update(dt: number) {
    for (let i = 0; i < MAX_FRAGMENTS; i++) {
      const fragment = this.fragments[i]; fragment.life = Math.max(0, fragment.life - dt);
      if (fragment.life > 0) {
        fragment.velocity.y -= dt * 2.5; fragment.position.addScaledVector(fragment.velocity, dt);
        this.dummy.position.copy(fragment.position); this.dummy.rotation.set(fragment.spin * fragment.life, fragment.spin * fragment.life * .7, 0);
        this.dummy.scale.setScalar(fragment.size * Math.min(1, fragment.life / fragment.duration * 2)); this.debris.setColorAt(i, fragment.color);
      } else this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix(); this.debris.setMatrixAt(i, this.dummy.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    for (const wave of this.waves) {
      wave.life = Math.max(0, wave.life - dt); wave.mesh.visible = wave.life > 0;
      if (!wave.mesh.visible) continue;
      const t = 1 - wave.life / wave.duration;
      wave.mesh.scale.setScalar(wave.radius * (1 + t * 5)); wave.mesh.material.opacity = (1 - t) * (1 - t);
    }
    for (const core of this.cores) {
      core.life = Math.max(0, core.life - dt); core.sprite.visible = core.life > 0;
      const t = core.life / .3; core.sprite.scale.setScalar(core.radius * (8 - t * 3)); core.sprite.material.opacity = t * .9;
    }
    this.light.intensity *= Math.exp(-dt * 12);
  }
  clear() {
    for (const fragment of this.fragments) fragment.life = 0;
    for (const wave of this.waves) wave.life = 0;
    for (const core of this.cores) core.life = 0;
    this.light.intensity = 0; this.update(0);
  }
}

// Entire soundtrack is synthesized locally; no downloads or audio permissions.
export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nodes = new Set<AudioScheduledSourceNode>();
  private chargeOscillator: OscillatorNode | null = null;
  private lastImpact = -1;
  open() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain(); this.master.gain.value = .65;
        const compressor = this.context.createDynamicsCompressor(); compressor.threshold.value = -16; compressor.ratio.value = 8;
        this.master.connect(compressor).connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate * .55, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (random(i + 739) * 2 - 1) * Math.pow(1 - i / data.length, 2);
      }
      void this.context.resume().catch(() => {});
    } catch { /* The show remains playable when audio is unavailable. */ }
  }
  private track(node: AudioScheduledSourceNode, chain: AudioNode[] = []) {
    this.nodes.add(node); node.onended = () => { this.nodes.delete(node); node.disconnect(); chain.forEach(part => part.disconnect()); };
  }
  private tone(from: number, to: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0) {
    if (!this.context || !this.master) return;
    const ctx = this.context, t = ctx.currentTime + delay, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(from, t); oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    oscillator.connect(gain).connect(this.master); this.track(oscillator, [gain]); oscillator.start(t); oscillator.stop(t + duration + .02);
  }
  tick(final = false) { this.tone(final ? 660 : 330, final ? 880 : 330, .14, .15, 'triangle'); }
  charge() {
    if (!this.context || !this.master) return;
    const t = this.context.currentTime, oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(42, t); oscillator.frequency.exponentialRampToValueAtTime(330, t + 1.35);
    gain.gain.setValueAtTime(.0001, t); gain.gain.linearRampToValueAtTime(.045, t + 1.1); gain.gain.linearRampToValueAtTime(0, t + 1.4);
    oscillator.connect(gain).connect(this.master); this.track(oscillator, [gain]); this.chargeOscillator = oscillator; oscillator.start(t); oscillator.stop(t + 1.42);
  }
  impact(bat = false) {
    if (!this.context || !this.master || !this.noise) return;
    const ctx = this.context, t = ctx.currentTime;
    if (!bat && t - this.lastImpact < .085) return;
    this.lastImpact = t;
    if (bat && this.chargeOscillator) { try { this.chargeOscillator.stop(); } catch {} this.chargeOscillator = null; }
    this.tone(bat ? 125 : 85, 24, .55, bat ? .7 : .43);
    this.tone(bat ? 860 : 540, 52, .19, .16, 'triangle');
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(); source.buffer = this.noise;
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(bat ? 6500 : 3200, t); filter.frequency.exponentialRampToValueAtTime(120, t + .45);
    gain.gain.setValueAtTime(bat ? .65 : .3, t); gain.gain.exponentialRampToValueAtTime(.0001, t + .5);
    source.connect(filter).connect(gain).connect(this.master); this.track(source, [filter, gain]); source.start(t);
  }
  winner() { [261.63, 329.63, 392, 523.25].forEach((frequency, i) => this.tone(frequency, frequency, .7, .13, 'triangle', i * .14)); }
  stop() {
    for (const node of this.nodes) { try { node.stop(); } catch {} }
    this.nodes.clear(); this.chargeOscillator = null; this.lastImpact = -1;
  }
}
