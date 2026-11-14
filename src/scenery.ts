import * as THREE from 'three';
import { createSceneryLayout } from './scenery-layout';
import type { SceneryKind } from './scenery-layout';

type Landmark = { group: THREE.Group; kind: SceneryKind; phase: number; spin: number; radius: number };

function solarPanelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#091e49'; ctx.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 10; col++) {
      const x = 4 + col * 25, y = 4 + row * 31;
      const gradient = ctx.createLinearGradient(x, y, x + 22, y + 28);
      gradient.addColorStop(0, '#194f9b'); gradient.addColorStop(1, '#0d2855');
      ctx.fillStyle = gradient; ctx.fillRect(x, y, 22, 28);
      ctx.strokeStyle = '#609bb7'; ctx.lineWidth = .6; ctx.strokeRect(x, y, 22, 28);
      ctx.fillStyle = '#99afba'; ctx.fillRect(x + 7, y, .6, 28); ctx.fillRect(x + 14, y, .6, 28);
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SpaceScenery {
  private landmarks: Landmark[] = [];
  private frustum = new THREE.Frustum();
  private projectionView = new THREE.Matrix4();
  private cullSphere = new THREE.Sphere();
  private lastCull = -1;
  private time = { value: 0 };
  private solarCore: THREE.ShaderMaterial;
  private solarCorona: THREE.ShaderMaterial;
  private metal = new THREE.MeshStandardMaterial({ color: 0xb5c5d3, metalness: .8, roughness: .28 });
  private darkMetal = new THREE.MeshStandardMaterial({ color: 0x28394d, metalness: .7, roughness: .4 });
  private foil = new THREE.MeshStandardMaterial({ color: 0xe8bd65, metalness: .85, roughness: .38 });
  private ceramic = new THREE.MeshStandardMaterial({ color: 0xd5dfdf, metalness: .25, roughness: .5 });
  private blueLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x79e9ff).multiplyScalar(2) });
  private amberLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc67a).multiplyScalar(2) });
  private panel = new THREE.MeshStandardMaterial({ map: solarPanelTexture(), color: 0x92c2ff, metalness: .35, roughness: .52, emissive: 0x0d2550, emissiveIntensity: .55 });
  // All copies share their mesh geometries and materials, including panel maps.
  private box = new THREE.BoxGeometry(1, 1, 1);
  private sphere = new THREE.SphereGeometry(1, 28, 20);
  private cylinder = new THREE.CylinderGeometry(1, 1, 1, 14);
  private dish = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .48);
  private dishMaterial = new THREE.MeshStandardMaterial({ color: 0xd8e3eb, side: THREE.DoubleSide, metalness: .8, roughness: .22 });
  private loop = new THREE.TorusGeometry(1, .028, 6, 64, Math.PI * 1.72);
  private stationRing = new THREE.TorusGeometry(4.4, .42, 8, 48);
  private habitat = new THREE.CapsuleGeometry(.65, 1.8, 4, 10);

  constructor(private scene: THREE.Scene, private glow: THREE.Texture) {
    this.solarCore = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        uniform float uTime;
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          float ripple = sin(position.x * 14.0 + uTime * .7) * sin(position.y * 11.0 - uTime * .5) * sin(position.z * 13.0 + uTime * .3);
          vec3 displaced = position + normal * ripple * .012;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        uniform float uTime;
        void main() {
          vec3 p = vPosition;
          float warp = sin(dot(p, vec3(13.0, 21.0, -17.0)) + uTime * .23);
          float a = sin(p.x * 26.0 + sin(p.y * 18.0 + uTime * .32) * 2.3 + warp * 2.0);
          float b = sin(p.y * 31.0 + p.z * 21.0 - uTime * .4 + sin(p.z * 24.0) * 1.7);
          float cells = a * b * .5 + .5;
          float veins = pow(1.0 - abs(a * b), 5.0);
          float spots = pow(max(0.0, sin(p.x * 9.0 + p.z * 7.0) * sin(p.y * 12.0)), 8.0);
          vec3 color = mix(vec3(.9, .09, .008), vec3(1.5, .65, .08), cells);
          color += vec3(.6, .42, .11) * veins;
          color *= 1.0 - spots * .68;
          float limb = pow(1.0 - abs(vNormal.z), 2.5);
          color += vec3(.65, .23, .015) * limb;
          gl_FragColor = vec4(color, 1.0);
        }`,
    });
    this.solarCorona = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-viewPosition.xyz);
          vPosition = position;
          gl_Position = projectionMatrix * viewPosition;
        }`,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vPosition;
        uniform float uTime;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.7);
          float rays = .65 + .35 * sin(atan(vPosition.y, vPosition.x) * 23.0 + uTime * .3);
          gl_FragColor = vec4(vec3(1.0, .31, .035), rim * rays * .48);
        }`,
    });
    const templates = { satellite: this.makeSatellite(), station: this.makeStation() };
    for (const placement of createSceneryLayout()) {
      const group = placement.kind === 'star' ? this.makeStar() : templates[placement.kind].clone(true);
      group.position.copy(placement.position); group.scale.setScalar(placement.scale);
      group.name = `scenery-${placement.kind}`;
      this.scene.add(group);
      this.landmarks.push({ group, kind: placement.kind, phase: placement.phase, spin: placement.spin, radius: placement.scale * (placement.kind === 'star' ? 2.7 : placement.kind === 'station' ? 15 : 8) });
    }
  }

  private part(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, position: number[], scale: number[]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]); mesh.scale.set(scale[0], scale[1], scale[2]);
    group.add(mesh); return mesh;
  }

  private makeStar() {
    const star = new THREE.Group();
    star.add(new THREE.Mesh(this.sphere, this.solarCore));
    const corona = new THREE.Mesh(this.sphere, this.solarCorona); corona.scale.setScalar(1.16); star.add(corona);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xff8c23, transparent: true, opacity: .24, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(5.5, 5.5, 1); star.add(halo);
    for (let i = 0; i < 3; i++) {
      const prominence = new THREE.Mesh(this.loop, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9e37).multiplyScalar(1.8), transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
      prominence.position.set(Math.sin(i * 2.2) * .52, Math.cos(i * 2.2) * .5, .15);
      prominence.scale.set(.7, .43, .7); prominence.rotation.set(.6 + i * .8, i, i * 2.2); star.add(prominence);
    }
    return star;
  }

  private solarWing(group: THREE.Group, x: number, width = 4.8) {
    const wing = new THREE.Group(); wing.position.x = x; wing.name = 'solar-wing';
    this.part(wing, this.box, this.metal, [0, 0, 0], [width + .16, .16, 2.7]);
    this.part(wing, this.box, this.panel, [0, .095, 0], [width, .035, 2.53]);
    this.part(wing, this.box, this.panel, [0, -.095, 0], [width, .035, 2.53]);
    group.add(wing);
  }

  private antenna(group: THREE.Group, y: number, scale = 1) {
    const mount = new THREE.Group(); mount.position.y = y; mount.scale.setScalar(scale);
    this.part(mount, this.cylinder, this.darkMetal, [0, .5, 0], [.09, 1, .09]);
    const dish = this.part(mount, this.dish, this.dishMaterial, [0, 1.3, 0], [1.05, .75, 1.05]); dish.rotation.z = .3;
    this.part(mount, this.cylinder, this.metal, [.14, 1.7, 0], [.04, 1.2, .04]);
    this.part(mount, this.sphere, this.blueLight, [.14, 2.3, 0], [.1, .1, .1]);
    group.add(mount);
  }

  private makeSatellite() {
    const satellite = new THREE.Group();
    this.part(satellite, this.box, this.foil, [0, 0, 0], [1.65, 1.4, 1.5]);
    this.part(satellite, this.box, this.darkMetal, [0, .76, 0], [1.8, .13, 1.65]);
    this.part(satellite, this.box, this.ceramic, [0, -.76, 0], [1.8, .13, 1.65]);
    this.part(satellite, this.cylinder, this.metal, [0, 0, 0], [.11, 11, .11]).rotation.z = Math.PI / 2;
    this.solarWing(satellite, -4); this.solarWing(satellite, 4);
    this.antenna(satellite, .7);
    const camera = this.part(satellite, this.cylinder, this.darkMetal, [0, 0, -1.05], [.38, .7, .38]); camera.rotation.x = Math.PI / 2;
    const lens = this.part(satellite, this.cylinder, this.blueLight, [0, 0, -1.43], [.26, .04, .26]); lens.rotation.x = Math.PI / 2;
    this.part(satellite, this.box, this.amberLight, [.78, .3, -.77], [.11, .11, .05]);
    return satellite;
  }

  private makeStation() {
    const station = new THREE.Group();
    const ring = new THREE.Mesh(this.stationRing, this.ceramic); ring.rotation.x = Math.PI / 2; station.add(ring);
    const lightRing = new THREE.Mesh(this.loop, this.blueLight); lightRing.scale.setScalar(4.5); lightRing.rotation.x = Math.PI / 2; station.add(lightRing);
    this.part(station, this.cylinder, this.metal, [0, 0, 0], [1.2, 4.4, 1.2]);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      const spoke = this.part(station, this.box, this.darkMetal, [Math.cos(angle) * 2.2, 0, Math.sin(angle) * 2.2], [4.4, .3, .45]); spoke.rotation.y = -angle;
      const module = this.part(station, this.habitat, this.ceramic, [Math.cos(angle) * 4.4, 0, Math.sin(angle) * 4.4], [1, 1, 1]); module.rotation.z = Math.PI / 2; module.rotation.y = -angle;
      this.part(station, this.box, this.blueLight, [Math.cos(angle) * 4.4, .7, Math.sin(angle) * 4.4], [.9, .1, .32]);
    }
    this.part(station, this.box, this.metal, [0, -.5, 0], [20, .22, .32]);
    this.solarWing(station, -9, 6); this.solarWing(station, 9, 6);
    this.antenna(station, 2.1, 1.1);
    return station;
  }

  update(time: number, camera: THREE.PerspectiveCamera) {
    this.time.value = time;
    const cull = Math.abs(time - this.lastCull) > .16;
    if (cull) {
      this.lastCull = time; camera.updateMatrixWorld();
      this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projectionView);
    }
    for (const landmark of this.landmarks) {
      const { group, phase, spin, kind, radius } = landmark;
      if (cull) {
        this.cullSphere.center.copy(group.position); this.cullSphere.radius = radius;
        const range = kind === 'star' ? 760 : 500;
        group.visible = camera.position.distanceToSquared(group.position) < range * range && this.frustum.intersectsSphere(this.cullSphere);
      }
      if (!group.visible) continue;
      group.rotation.set(kind === 'star' ? .2 : .2 + Math.sin(time * .11 + phase) * .08, phase + time * spin, kind === 'star' ? phase * .3 : -.18 + Math.sin(time * .09 + phase) * .09);
      if (kind !== 'star') for (const part of group.children) if (part.name === 'solar-wing') part.rotation.x = -.48 + Math.sin(time * .17 + phase) * .13;
    }
  }
}
