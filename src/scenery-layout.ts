import { FINISH_DISTANCE, WORLD_HALF_WIDTH, random } from './simulation';
import type { Vector } from './simulation';

export type SceneryKind = 'star' | 'satellite' | 'station';
export type SceneryPlacement = { kind: SceneryKind; position: Vector; scale: number; phase: number; spin: number };

export function createSceneryLayout(): SceneryPlacement[] {
  const scenery: SceneryPlacement[] = [];
  for (let sector = 0; sector < 8; sector++) {
    const side = sector % 2 ? 1 : -1;
    const z = 125 + sector * (FINISH_DISTANCE - 220) / 8;
    scenery.push({ kind: 'star', position: { x: side * (WORLD_HALF_WIDTH + 15 + random(sector + 930) * 20), y: sector % 3 === 1 ? -73 : 32 + random(sector + 940) * 22, z }, scale: 6.5 + random(sector + 950) * 2.5, phase: sector * .8, spin: .035 });
    for (let satellite = 0; satellite < 2; satellite++) {
      const index = sector * 2 + satellite;
      scenery.push({ kind: 'satellite', position: { x: (satellite ? side : -side) * (WORLD_HALF_WIDTH * .78 + random(index + 960) * 24), y: 18 - random(index + 970) * 113, z: z + 32 + satellite * 116 }, scale: .8 + random(index + 980) * .4, phase: random(index + 990) * Math.PI * 2, spin: (satellite ? 1 : -1) * .06 });
    }
    if (sector % 2 === 0) scenery.push({ kind: 'station', position: { x: -side * (WORLD_HALF_WIDTH + 15), y: -35 - random(sector + 1000) * 33, z: z + 175 }, scale: .85, phase: sector * .7, spin: .045 });
  }
  return scenery;
}
