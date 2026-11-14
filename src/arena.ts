import * as THREE from 'three';
import { FINISH_DISTANCE, createWorldLayout, random } from './simulation';
import type { WorldLayout } from './simulation';
import { SpaceScenery } from './scenery';
import { buildCosmicBat } from './bat';

export const colors = [0xff729e, 0x64e4ff, 0xffd56b, 0xa58aff, 0x6ef2b8, 0xff9467, 0x729eff, 0xff7cdb, 0xc3ef6e, 0x68e3d4, 0xe3a0ff, 0xffb56a, 0x84baff, 0xf4e377, 0x70e7a2, 0xff7891, 0x7ce5f2, 0xc19aff, 0xf5a66d, 0x9ce68a, 0x8ea1ff, 0xff91bd, 0x6ddfc6, 0xffc477, 0xb6a1ff, 0x8fd5ff, 0xffa2a2, 0x9fe2b7, 0xe2a2e8, 0xc5e77a];
const worldColors = [0x8395ff, 0x42d6ca, 0xff976f, 0xd58aff, 0x61b7ff, 0xffc45f, 0x95dc8a, 0xf27db8];
const sphere = new THREE.SphereGeometry(1, 28, 20);
const ringGeometry = new THREE.RingGeometry(1.26, 1.67, 64);
export const ballGeometry = new THREE.SphereGeometry(.48, 24, 18);
const seamGeometry = new THREE.TorusGeometry(.475, .017, 5, 40);
const glowGeometry = new THREE.SphereGeometry(.64, 16, 12);
export const fragmentGeometry = new THREE.IcosahedronGeometry(1, 0);
export const shockGeometry = new THREE.TorusGeometry(1, .022, 6, 72);
export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

export function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(.12, '#ffffffdd');
  gradient.addColorStop(.38, '#ffffff44');
  gradient.addColorStop(1, '#ffffff00');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
export type Planet = WorldLayout & {
  mesh: THREE.Group; core: THREE.Mesh; atmosphere: THREE.Mesh; ring: THREE.Mesh; fineRing: THREE.Mesh;
  color: number; label: string; spin: number;
};

// Eight reusable painted surfaces, rather than one texture per world.
function planetTexture(index: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const color = new THREE.Color(worldColors[index]);
  ctx.fillStyle = `#${color.getHexString()}`; ctx.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 3) {
    const lightness = .6 + random(index * 300 + y) * .65;
    ctx.fillStyle = `#${color.clone().multiplyScalar(lightness).getHexString()}`;
    ctx.fillRect(0, y, 512, 3 + random(y + index) * 9);
  }
  for (let i = 0; i < 48; i++) {
    const x = random(i + index * 39) * 512, y = random(i + 847) * 256, r = 2 + random(i + 57) * 19;
    ctx.fillStyle = index % 2 ? '#ffffff16' : '#030c3838';
    ctx.beginPath(); ctx.ellipse(x, y, r * (index % 2 ? 3 : 1), r, -.15, 0, Math.PI * 2); ctx.fill();
    if (index % 2 === 0) {
      ctx.strokeStyle = '#ffffff26'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Arena {
  planets: Planet[] = [];
  bat = new THREE.Group();
  batPower = new THREE.MeshStandardMaterial({ color: 0xffd99b, emissive: 0xff8a42, emissiveIntensity: 1.5, metalness: .75, roughness: .22 });
  deckRings: THREE.Mesh[] = [];
  glow = glowTexture();
  scenery: SpaceScenery;
  private planetMaterials = worldColors.map((_, i) => new THREE.MeshStandardMaterial({ map: planetTexture(i), roughness: .8, metalness: .1 }));
  private atmosphereMaterials = worldColors.map(color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .13, side: THREE.BackSide, depthWrite: false }));
  private ringMaterials = worldColors.map(color => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: .6, depthWrite: false }));
  constructor(public scene: THREE.Scene) {
    this.buildBackdrop();
    this.buildDeck();
    this.buildBat();
    this.populate();
    this.scenery = new SpaceScenery(scene, this.glow);
  }
  private buildBackdrop() {
    const positions = new Float32Array(7000 * 3), starColors = new Float32Array(7000 * 3);
    for (let i = 0; i < 7000; i++) {
      positions.set([(random(i + 4) - .5) * 680, (random(i + 9) - .5) * 420, random(i + 15) * (FINISH_DISTANCE + 450) - 120], i * 3);
      const color = new THREE.Color(i % 4 === 0 ? 0xffd8a4 : i % 3 === 0 ? 0x92bbff : 0xece7ff);
      starColors.set([color.r, color.g, color.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ map: this.glow, size: .85, vertexColors: true, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending })));
    for (let i = 0; i < 24; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: [0x5050e9, 0x385aab, 0x9c3d84, 0x1d9d9b][i % 4], transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.position.set((random(i + 30) - .5) * 190, (random(i + 50) - .5) * 160, 40 + i * FINISH_DISTANCE / 23);
      sprite.scale.set(100 + random(i) * 80, 50 + random(i + 3) * 45, 1);
      this.scene.add(sprite);
    }
    // Distant landmark; never part of the collision field.
    const moon = new THREE.Mesh(sphere, this.planetMaterials[0]);
    moon.position.set(-75, 48, 240); moon.scale.setScalar(25); this.scene.add(moon);
    const halo = new THREE.Mesh(ringGeometry, this.ringMaterials[0]);
    halo.position.copy(moon.position); halo.scale.setScalar(25); halo.rotation.set(.8, .3, -.3); this.scene.add(halo);
    const asteroids = new THREE.InstancedMesh(fragmentGeometry, new THREE.MeshStandardMaterial({ color: 0x79758e, roughness: 1, flatShading: true }), 160);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 160; i++) {
      dummy.position.set((random(i + 80) - .5) * 190, (random(i + 90) - .5) * 180, 35 + i * (FINISH_DISTANCE - 50) / 160);
      dummy.rotation.set(i * .7, i * .31, i * .17); dummy.scale.setScalar(.3 + random(i + 70) * 1.4); dummy.updateMatrix(); asteroids.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(asteroids);
  }
  private buildDeck() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x20283e, metalness: .8, roughness: .4 });
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 1.4, 64), metal);
    deck.position.set(2, -2.1, -2); this.scene.add(deck);
    const surface = new THREE.Mesh(new THREE.CylinderGeometry(9.7, 9.7, .08, 64), new THREE.MeshStandardMaterial({ color: 0x101c31, metalness: .65, roughness: .35 }));
    surface.position.set(2, -1.35, -2); this.scene.add(surface);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7 + i * .95, .035 + i * .009, 6, 96), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x60e7f2 : 0xffb761, transparent: true, opacity: .72 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(2, -1.28, -2); this.scene.add(ring); this.deckRings.push(ring);
    }
    for (let i = 0; i < 28; i++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(.07, .06, .55), new THREE.MeshBasicMaterial({ color: i % 7 === 0 ? 0xffb861 : 0x50778d }));
      const angle = i / 28 * Math.PI * 2;
      tick.position.set(2 + Math.sin(angle) * 8.4, -1.25, -2 + Math.cos(angle) * 8.4); tick.rotation.y = angle; this.scene.add(tick);
    }
    const grid = new THREE.GridHelper(90, 30, 0x244052, 0x13283c); grid.position.set(0, -3, 20);
    (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = .35; this.scene.add(grid);
    for (let i = 0; i < 2; i++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 140), new THREE.MeshBasicMaterial({ color: 0x35b9d3, transparent: true, opacity: .3 }));
      rail.position.set(i === 0 ? -14 : 17, -2, 60); this.scene.add(rail);
    }
  }
  private buildBat() {
    buildCosmicBat(this.bat, this.batPower);
    this.scene.add(this.bat);
  }
  populate() {
    for (const world of createWorldLayout()) {
      const mesh = new THREE.Group();
      const core = new THREE.Mesh(sphere, this.planetMaterials[0]);
      const atmosphere = new THREE.Mesh(sphere, this.atmosphereMaterials[0]);
      const ring = new THREE.Mesh(ringGeometry, this.ringMaterials[0]);
      const fineRing = new THREE.Mesh(ringGeometry, this.ringMaterials[0]);
      mesh.add(core, atmosphere, ring, fineRing); this.scene.add(mesh);
      const planet: Planet = { ...world, position: { ...world.position }, mesh, core, atmosphere, ring, fineRing, color: 0, label: '', spin: 0 };
      this.applyWorld(planet, world); this.planets.push(planet);
    }
  }
  private applyWorld(planet: Planet, world: WorldLayout) {
    const { radius, appearanceSeed: seed } = world;
    const kind = Math.floor(random(seed + 43) * worldColors.length);
    planet.index = world.index; planet.appearanceSeed = seed;
    planet.position = { ...world.position }; planet.radius = radius; planet.destroyed = false;
    planet.color = worldColors[kind]; planet.spin = .03 + random(seed + 77) * .09;
    planet.label = ['KEPLER', 'AURORA', 'VULCAN', 'NOVA', 'TITAN', 'SOLARIS', 'EDEN', 'NEBULA'][kind] + `-${world.index + 1}`;
    planet.mesh.position.copy(world.position); planet.mesh.rotation.set(0, 0, 0); planet.mesh.visible = true;
    planet.core.material = this.planetMaterials[kind]; planet.core.scale.setScalar(radius);
    planet.core.rotation.set(random(seed + 71) * .4, random(seed + 73) * 6, random(seed + 74) * .8);
    planet.atmosphere.material = this.atmosphereMaterials[kind]; planet.atmosphere.scale.setScalar(radius * 1.075);
    const hasRing = random(seed + 431) < (radius > 5 ? .34 : .56);
    planet.ring.material = planet.fineRing.material = this.ringMaterials[kind];
    planet.ring.scale.setScalar(radius); planet.fineRing.scale.setScalar(radius * 1.08);
    planet.ring.rotation.set(.65 + random(seed + 81) * 1.3, random(seed + 83) * .7, random(seed + 85) * 1.2);
    planet.fineRing.rotation.copy(planet.ring.rotation);
    planet.ring.visible = hasRing; planet.fineRing.visible = hasRing && random(seed + 433) < .45;
  }
  resetWorlds(roundSeed = 0) {
    const layout = createWorldLayout(roundSeed);
    // Reuse the same meshes and shared surfaces when the round changes.
    for (let i = 0; i < this.planets.length; i++) this.applyWorld(this.planets[i], layout[i]);
  }
  makeBall(color: number) {
    const mesh = new THREE.Mesh(ballGeometry, new THREE.MeshStandardMaterial({ color, metalness: .35, roughness: .2, emissive: color, emissiveIntensity: .7 }));
    for (let i = 0; i < 2; i++) {
      const seam = new THREE.Mesh(seamGeometry, new THREE.MeshBasicMaterial({ color: 0xfff5de })); seam.rotation.set(.72 + i * .6, .4 - i, .25 + i * .5); mesh.add(seam);
    }
    mesh.add(new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .12, depthWrite: false, blending: THREE.AdditiveBlending })));
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending })); aura.scale.set(2.4, 2.4, 1); mesh.add(aura);
    return mesh;
  }
}
