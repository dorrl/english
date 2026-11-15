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
