import * as THREE from 'three';
import { speedEffectProfile } from './presentation';
import { forwardSpeed } from './simulation';
import type { Flight } from './simulation';

const forwardAxis = new THREE.Vector3(0, 0, 1);
const ice = new THREE.Color(0xd9f5ff);
const hot = new THREE.Color(0xffedc9);

function makeSegments(positions: number[], brightness: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(brightness.flatMap(value => [value, value, value]), 3));
  return geometry;
}

function makeWake() {
  const positions: number[] = [], brightness: number[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4, length = 2.25 + (i % 3) * .55;
    const x = Math.cos(angle), y = Math.sin(angle);
    positions.push(x * .57, y * .57, -.32, x * .78, y * .78, -1.15,
      x * .78, y * .78, -1.15, x * 1.06, y * 1.06, -length);
    brightness.push(.45, 1, 1, 0);
  }
  return makeSegments(positions, brightness);
}

function makeShockArcs() {
  const positions: number[] = [], brightness: number[] = [];
  const segments = 12;
  for (let side = 0; side < 2; side++) {
    const point = (t: number) => {
      const angle = side * Math.PI + (t - .5) * 2.05;
      return [Math.cos(angle), Math.sin(angle), -.7 + .58 * Math.sin(Math.PI * t)];
    };
    for (let i = 0; i < segments; i++) {
      const a = i / segments, b = (i + 1) / segments;
      positions.push(...point(a), ...point(b));
      brightness.push(Math.sin(Math.PI * a), Math.sin(Math.PI * b));
    }
  }
  return makeSegments(positions, brightness);
}

const wakeGeometry = makeWake();
const shockGeometry = makeShockArcs();

export class BallSpeedEffect extends THREE.Group {
  private direction = new THREE.Vector3();
  private tint: THREE.Color;
  private halo: THREE.Sprite;
  private wake: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private shock: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  constructor(color: number, glow: THREE.Texture) {
    super();
    this.name = 'ball-speed-effect';
    this.tint = new THREE.Color(color);
    const blend = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 };
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ ...blend, map: glow, color }));
    this.halo.name = 'speed-glow';
    this.wake = new THREE.LineSegments(wakeGeometry, new THREE.LineBasicMaterial({ ...blend, vertexColors: true, color }));
    this.wake.name = 'speed-wake';
    this.shock = new THREE.LineSegments(shockGeometry, new THREE.LineBasicMaterial({ ...blend, vertexColors: true, color }));
    this.shock.name = 'speed-shock-arcs';
    this.add(this.halo, this.wake, this.shock);
    this.visible = false;
  }

  update(flight: Flight, time: number, reducedMotion: boolean) {
    this.visible = flight.launched && !flight.done;
    if (!this.visible) return 0;

    const { x, y } = flight.velocity;
    this.direction.set(x, y, forwardSpeed(flight));
    const { glow, wake, shock, flare } = speedEffectProfile(this.direction.length());
    this.visible = glow > 0;
    if (!this.visible) return 0;

    this.position.copy(flight.position);
    this.scale.setScalar(flight.size);
    this.direction.normalize();
    this.quaternion.setFromUnitVectors(forwardAxis, this.direction);

    const opacity = reducedMotion ? .42 : 1;
    const pulse = reducedMotion ? 0 : Math.sin(time * 8 + flight.index * 1.7) * .08 * shock;
    this.halo.scale.setScalar(2.3 + glow * .8 + shock * .55 + flare * .85);
    this.halo.material.opacity = opacity * (glow * .33 + shock * .16 + flare * .16);
    this.halo.material.color.copy(this.tint).lerp(ice, shock * .32).lerp(hot, flare * .4);

    this.wake.visible = wake > .01;
    this.wake.scale.set(1 + shock * .28, 1 + shock * .28, 1 + wake * 1.6 + flare * 1.1);
    this.wake.material.opacity = opacity * wake * (.52 + shock * .24);
    this.wake.material.color.copy(this.tint).lerp(ice, wake * .4).lerp(hot, flare * .45);

    this.shock.visible = shock > .01;
    this.shock.rotation.z = reducedMotion ? 0 : time * .85 + flight.index;
    this.shock.scale.setScalar(.82 + shock * .58 + flare * .35 + pulse);
    this.shock.material.opacity = opacity * shock * (.63 + flare * .25);
    this.shock.material.color.copy(this.tint).lerp(ice, .7).lerp(hot, flare * .7);
    return .35 * glow + .35 * wake + .2 * shock + .1 * flare;
  }

  dispose() {
    this.halo.material.dispose();
    this.wake.material.dispose();
    this.shock.material.dispose();
  }
}
