import * as THREE from 'three';
import { random } from './simulation';
import { BAT_TIMING, sampleBatPose } from './bat-motion';
import type { BatMotionPhase } from './bat-motion';

function studioReflection() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#293e5b'); sky.addColorStop(.45, '#91a3b7'); sky.addColorStop(.55, '#111b2a'); sky.addColorStop(1, '#03070e');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 512, 256);
  for (const [x, color, width] of [[30, '#dceeff', 28], [175, '#79c6df', 18], [320, '#fff0ce', 38], [457, '#f5bd72', 14]] as const) {
    const strip = ctx.createLinearGradient(x - 15, 0, x + width + 15, 0);
    strip.addColorStop(0, '#00000000'); strip.addColorStop(.35, color); strip.addColorStop(.65, color); strip.addColorStop(1, '#00000000');
    ctx.fillStyle = strip; ctx.fillRect(x - 15, 35, width + 30, 135);
  }
  const map = new THREE.CanvasTexture(canvas); map.mapping = THREE.EquirectangularReflectionMapping; map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function gripTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#17202b'; ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 4800; i++) {
    const x = random(i + 65) * 128, y = random(i + 75) * 512;
    ctx.fillStyle = i % 2 ? '#5c6b7920' : '#02070b55'; ctx.fillRect(x, y, 1, 2);
  }
  ctx.strokeStyle = '#02070b'; ctx.lineWidth = 3;
  for (let y = -64; y < 576; y += 33) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y + 43); ctx.stroke(); }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return map;
}

// All model coordinates retain the existing grip pivot and sweet-spot center,
// so the launch formation and swing animation stay aligned with the new shell.
export function buildCosmicBat(root: THREE.Group, power: THREE.MeshStandardMaterial) {
  const model = new THREE.Group(); model.position.x = 4.8; root.add(model);
  const reflection = studioReflection();
  const titanium = new THREE.MeshPhysicalMaterial({ color: 0xa5b9ca, metalness: .92, roughness: .25, clearcoat: .65, clearcoatRoughness: .2, envMap: reflection, envMapIntensity: .8 });
  const graphite = new THREE.MeshPhysicalMaterial({ color: 0x27394b, metalness: .82, roughness: .32, clearcoat: .4, envMap: reflection, envMapIntensity: .65 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xd5ab66, metalness: .88, roughness: .26, clearcoat: .4, envMap: reflection, envMapIntensity: .8 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0xa4acb4, map: gripTexture(), roughness: .87, metalness: .06 });
  const wrapMaterial = new THREE.MeshStandardMaterial({ color: 0x293746, roughness: .75, metalness: .12 });
  const recess = new THREE.MeshStandardMaterial({ color: 0x060c15, metalness: .3, roughness: .5 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x8de8ef, emissive: 0x46bdd3, emissiveIntensity: 1.2, metalness: .4, roughness: .25 });
  power.color.set(0xffd58e); power.emissive.set(0xff852b); power.roughness = .24; power.metalness = .6;

  const axisCylinder = (radius: number, length: number, x: number, material: THREE.Material, segments = 48) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
    mesh.rotation.z = -Math.PI / 2; mesh.position.x = x; model.add(mesh); return mesh;
  };
  const band = (radius: number, thickness: number, x: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 8, 56), material);
    mesh.rotation.y = Math.PI / 2; mesh.position.x = x; model.add(mesh); return mesh;
  };
  const profile = [
    [0, -7.36], [.37, -7.36], [.49, -7.30], [.51, -7.20], [.49, -7.07], [.35, -6.99],
    [.32, -6.85], [.32, -3.12], [.35, -2.91], [.4, -2.55], [.48, -1.85], [.61, -.9],
    [.75, .05], [.84, .8], [.88, 1.8], [.91, 5.9], [.9, 6.32], [.85, 6.54], [.72, 6.71], [.4, 6.8], [0, 6.8],
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([radius, x]) => new THREE.Vector2(radius, x)), 64), titanium);
  body.rotation.z = -Math.PI / 2; model.add(body);

  // Inset leather grip, raised helical wrapping and machined end fittings.
  axisCylinder(.342, 4.02, -4.99, rubber);
  const wrapPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 176; i++) {
    const t = i / 176, angle = t * Math.PI * 22;
    wrapPoints.push(new THREE.Vector3(-6.98 + t * 4.02, Math.cos(angle) * .352, Math.sin(angle) * .352));
  }
  model.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wrapPoints), 176, .023, 6, false), wrapMaterial));
  band(.38, .035, -6.99, brass); band(.38, .035, -2.95, brass);
  axisCylinder(.43, .42, -2.7, graphite); band(.435, .025, -2.9, titanium); band(.435, .025, -2.5, brass);
  band(.485, .025, -7.22, brass); axisCylinder(.255, .035, -7.38, graphite); axisCylinder(.12, .04, -7.405, power);

  // A powered inner barrel is visible through narrow slots in six armor panels.
  const energySleeve = new THREE.Mesh(new THREE.CylinderGeometry(.902, .85, 5.7, 64, 1, true), power);
  energySleeve.rotation.z = -Math.PI / 2; energySleeve.position.x = 2.8; model.add(energySleeve);
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2;
    const armor = new THREE.Mesh(new THREE.CylinderGeometry(.932, .88, 5.7, 12, 1, true, angle + .065, Math.PI / 3 - .13), i % 3 === 1 ? graphite : titanium);
    armor.rotation.z = -Math.PI / 2; armor.position.x = 2.8; model.add(armor);
    const rail = new THREE.Group(); rail.rotation.x = angle;
    const light = new THREE.Mesh(new THREE.BoxGeometry(4.8, .018, .047), i % 2 ? cyan : power);
    light.position.set(2.55, .937, 0); rail.add(light); model.add(rail);
  }
  band(.9, .04, -.06, graphite); band(.91, .025, .08, brass);
  band(.944, .04, 5.68, graphite); band(.944, .022, 5.82, brass);

  // Broad, recessed impact collar at the original x=4.7 sweet spot.
  axisCylinder(.974, 1.38, 4.7, brass);
  axisCylinder(.982, 1.12, 4.7, graphite);
  for (const x of [4.08, 4.22, 5.18, 5.32]) band(.981, .026, x, x < 4.2 || x > 5.2 ? titanium : power);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const inset = new THREE.Mesh(new THREE.BoxGeometry(.72, .025, .085), power);
    inset.position.set(4.7, Math.cos(angle) * .986, Math.sin(angle) * .986); inset.rotation.x = angle; model.add(inset);
  }

  // Beveled end cap with inset vents, luminous center and individual fasteners.
  axisCylinder(.665, .052, 6.735, graphite); band(.68, .035, 6.745, brass);
  axisCylinder(.44, .065, 6.77, recess); band(.38, .025, 6.81, cyan); axisCylinder(.2, .07, 6.81, power);
  const boltGeometry = new THREE.CylinderGeometry(.064, .064, .055, 6);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const bolt = new THREE.Mesh(boltGeometry, titanium); bolt.rotation.z = -Math.PI / 2;
    bolt.position.set(6.81, Math.cos(angle) * .565, Math.sin(angle) * .565); model.add(bolt);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(.02, .16, .055), recess);
    vent.position.set(6.82, Math.cos(angle) * .3, Math.sin(angle) * .3); vent.rotation.x = angle; model.add(vent);
  }
  for (const x of [.18, 5.55]) for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const bolt = new THREE.Mesh(boltGeometry, brass);
    bolt.position.set(x, Math.cos(angle) * .95, Math.sin(angle) * .95); bolt.rotation.x = angle; model.add(bolt);
  }
  const rest = sampleBatPose('idle');
  root.position.set(...rest.position); root.rotation.set(...rest.rotation); root.name = 'cosmic-bat';
}

export class BatSwingTrail {
  private samples = 28;
  private positions = new Float32Array(this.samples * 6);
  private colors = new Float32Array(this.samples * 6);
  private geometry = new THREE.BufferGeometry();
  private material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .38, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  private mesh = new THREE.Mesh(this.geometry, this.material);
  private transform = new THREE.Object3D();
  private point = new THREE.Vector3();
  private color = new THREE.Color(0xffc47e);

  constructor(scene: THREE.Scene) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    const indices: number[] = [];
    for (let i = 0; i < this.samples - 1; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.geometry.setIndex(indices); this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
  }

  update(phase: BatMotionPhase, time: number, reducedMotion: boolean) {
    const swingTime = phase === 'swing' ? time : phase === 'followthrough' ? BAT_TIMING.swing + time : -1;
    this.mesh.visible = !reducedMotion && swingTime > .08 && swingTime < BAT_TIMING.swing + .18;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.samples; i++) {
      const progress = i / (this.samples - 1);
      const sampledTime = Math.max(0, swingTime - (1 - progress) * .16);
      const pose = sampledTime <= BAT_TIMING.swing
        ? sampleBatPose('swing', sampledTime)
        : sampleBatPose('followthrough', sampledTime - BAT_TIMING.swing);
      this.transform.position.set(...pose.position); this.transform.rotation.set(...pose.rotation); this.transform.updateMatrix();
      const brightness = progress * progress * Math.min(1, sampledTime / .14);
      for (let side = 0; side < 2; side++) {
        this.point.set(side ? 11.55 : 10.65, 0, 0).applyMatrix4(this.transform.matrix);
        const offset = (i * 2 + side) * 3;
        this.positions.set([this.point.x, this.point.y, this.point.z], offset);
        this.colors.set([this.color.r * brightness, this.color.g * brightness, this.color.b * brightness], offset);
      }
    }
    this.material.opacity = .38 * (1 - Math.max(0, swingTime - BAT_TIMING.swing) / .18);
    this.geometry.getAttribute('position').needsUpdate = true; this.geometry.getAttribute('color').needsUpdate = true;
  }

  clear() { this.mesh.visible = false; }
}
