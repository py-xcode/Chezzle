// ============================================================================
// 干式台子（无水容器：灯/喷灯/开关 volume=0）可溶产物去向回归测试。
// 背景：灯上 Fe 被大气氯气点燃氧化（2Fe+3Cl2→2FeCl3）时：
//  ① 可溶产物过去直接进"幽灵溶液"（volume=0 的溶液对象——不可见、不可收集），
//     用户实测"收得越快 Fe 越多"：同一反应不同收集量；
//  ② 旧版 FeCl3 又作为"假溶液氧化剂"与 Fe 发生离子置换得 FeCl2——但
//     FeCl2 只能在水溶液中生成（Fe+2FeCl3→3FeCl2 是离子反应），干台不存在。
// 修复：
//  ① 干式台子可溶产物落回台面成固体粉末（与铝热 Fe/Al2O3 一样留在灯上）；
//  ② 干式台子放行通用离子氧化还原（金属+盐置换）——铁在氯气中只烧成 FeCl3。
// 真液介质判定为 volume>0（与 H2O 特例/cond.solution 同一惯例）。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { BlastLamp } from '../src/objects/blastlamp.js';
import { Player } from '../src/objects/player.js';
import { Pool } from '../src/objects/pool.js';
import { Block } from '../src/objects/block.js';

const TICK = 1 / 30;
function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

test('干式台子：Fe 遇大气氯气只烧到 FeCl3（无 FeCl2），沉淀留灯上、无幽灵溶液', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  const lamp = new BlastLamp({ x: 400, y: 660, autoOn: true, highTemp: true, id: 'lamp' });
  scene.addObject(lamp);
  lamp.addPrecipitate('Fe', 2); // 喷灯上的铁粉 + 大气氯气（点燃态 → 2Fe+3Cl2→2FeCl3）
  scene.atmosphere.add('Cl2', 1);
  run(scene, 150);
  // 1) 幽灵溶液为空：FeCl3/FeCl2 不得进入 volume=0 的溶液对象
  assert.equal(lamp.solution.mass('FeCl3'), 0, 'FeCl3 不得进灯溶液');
  assert.equal(lamp.solution.mass('FeCl2'), 0, 'FeCl2 不得进灯溶液');
  // 2) FeCl3 留下（可见、可收集）；干台无 FeCl2（离子置换需要溶液介质）
  const fc3 = lamp.precipitates.get('FeCl3') ?? 0;
  const fc2 = lamp.precipitates.get('FeCl2') ?? 0;
  assert.ok(fc3 > 0.5, `应生成 FeCl3 粉于灯上：${fc3.toFixed(3)}`);
  assert.equal(fc2, 0, `干台上不应生成 FeCl2（Fe 与氯气只烧到 FeCl3）：${fc2.toFixed(3)}`);
  // 3) 质量守恒：消耗的 Fe ≈ FeCl3 中的 Fe（56/162.5）
  const feLeft = lamp.precipitates.get('Fe') ?? 0;
  const feInProd = fc3 * (56 / 162.5);
  assert.ok(Math.abs((2 - feLeft) - feInProd) < 0.08,
    `Fe 守恒：剩 ${feLeft.toFixed(3)} + 产物含 Fe ${feInProd.toFixed(3)} ≈ 2`);
});

test('真液介质：Fe + FeCl3 溶液 → FeCl2（离子置换在有水时才发生）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  // 药品池（含水）：FeCl3 溶液 + 铁块浸入 → Fe + 2FeCl3 → 3FeCl2
  const pool = new Pool({ x: 200, y: 660, w: 260, h: 60, volume: 200, solutes: { FeCl3: 50 } });
  scene.addObject(pool);
  const fe = new Block({ x: 300, y: 650, w: 30, h: 30, substance: 'Fe', mass: 5 });
  scene.addObject(fe);
  run(scene, 200);
  assert.ok(pool.solution.mass('FeCl2') > 0.1, `水中应生成 FeCl2：${pool.solution.mass('FeCl2').toFixed(3)}`);
  assert.ok(pool.solution.mass('FeCl3') < 50, `FeCl3 被还原消耗：${pool.solution.mass('FeCl3').toFixed(3)}`);
});

test('干式台子：铝热产物不受影响（Fe 留在灯上可收集），玩家收集正常', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  const lamp = new BlastLamp({ x: 368, y: 662, autoOn: true, highTemp: true, id: 'lamp' });
  scene.addObject(lamp);
  lamp.addPrecipitate('Al', 1);
  const p = new Player({ x: 330, y: 600, substance: 'Fe2O3', mass: 30, id: 'p' });
  scene.addObject(p);
  run(scene, 150);
  assert.ok((lamp.precipitates.get('Fe') ?? 0) > 0.5, `铝热应还原出 Fe 在灯上：${lamp.precipitates.get('Fe')}`);
  assert.equal(lamp.solution.mass('FeCl3'), 0, '无氯气时不产生 FeCl3');
  p.tryCollect(scene);
  let fe = 0;
  for (const s of p.inventory.slots) if (s && s.substance === 'Fe') fe += s.mass;
  assert.ok(fe > 0.5, `玩家应收集到 Fe：${fe}`);
});
