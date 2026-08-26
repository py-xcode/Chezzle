import { Scene } from './src/core/scene.js';
import { Floor } from './src/objects/floor.js';
import { Pool } from './src/objects/pool.js';
import { Block } from './src/objects/block.js';

const scene = new Scene();
scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
scene.status = 'running';
const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { H2O: 100 } });
scene.addObject(pool);
const k = new Block({ x: 400, y: 720, w: 40, h: 40, substance: 'K', mass: 50 });
scene.addObject(k);
const TICK = 1/30;
for (let i = 0; i < 30; i++) {
  scene.step(TICK);
  if (i < 12 || i % 5 === 0) {
    console.log(`t=${i} k: y=${k.y.toFixed(1)} bottom=${k.bottom.toFixed(1)} velY=${k.vel.y.toFixed(1)} container=${k._container ? 'Y' : '-'} gasH2=${(scene._reactGas['H2'] ?? 0).toFixed(2)}`);
  }
}
console.log('statics:', scene.statics.map(s => `${s.id}[${s.x},${s.y},${s.w},${s.h}]`).join(' '));
