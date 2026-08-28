// ============================================================================
// 头戴携带（烧杯/集气瓶坐在玩家头顶）抖动回归测试
// 用户反馈："头顶一个烧杯，玩家跳一下 → 玩家和烧杯开始抖动"
// 根因：跳起后头顶（动态支撑）移出 40px 探测窗 → 烧杯判"失去支撑"→ 壁体豁免
// 关闭 → 头撞回杯底墙 → 烧杯又落回 → 互相较劲。修复：前一动态支撑跟随 +
// 帽子式跟随（烧杯跟玩家位移、不倒推玩家）。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { Beaker } from '../src/objects/beaker.js';
import { GasBottle } from '../src/objects/gasbottle.js';

const run = (scene, n) => { for (let i = 0; i < n; i++) scene.step(1 / 30); };

function headScene(obj) {
  const scene = new Scene({ worldW: 2000, worldH: 900 });
  scene.addObject(new Floor({ x: -200, y: 820, w: 4000, h: 80 }));
  const p = new Player({ x: 700, y: 730, mass: 30, id: 'p1' });
  scene.addObject(p);
  scene.addObject(obj);
  scene.status = 'running';
  return { scene, p, obj };
}

/** 跳一跳，统计：跳高（px）、烧杯 y 方向翻转次数（>1 = 振荡）、落回后是否贴着头顶 */
function jumpAndMeasure(scene, p, obj) {
  run(scene, 60); // 落定
  const py0 = p.y;
  scene.control.add('jump'); scene.step(1 / 30); scene.control.delete('jump');
  let minPy = py0;
  let lastBy = obj.y;
  let flips = 0;
  let lastSign = 0;
  for (let i = 0; i < 50; i++) {
    scene.step(1 / 30);
    minPy = Math.min(minPy, p.y);
    const db = obj.y - lastBy;
    const s = Math.abs(db) > 0.5 ? Math.sign(db) : 0;
    if (s !== 0 && lastSign !== 0 && s !== lastSign) flips++;
    if (s !== 0) lastSign = s;
    lastBy = obj.y;
  }
  return { rise: py0 - minPy, flips, restDiff: Math.abs(obj.y + obj.h - p.y) };
}

// ---- 1. 头戴烧杯 + 跳 ------------------------------------------------------
test('头戴烧杯跳：玩家跳起（≥80px）、烧杯跟随无振荡（翻转≤1）、落回仍贴头顶', () => {
  const { scene, p, obj } = headScene(new Beaker({ x: 710, y: 660, w: 60, h: 70, volume: 200, solutes: {} }));
  const r = jumpAndMeasure(scene, p, obj);
  assert.ok(r.rise >= 80, `玩家应跳起：rise=${r.rise.toFixed(1)}px`);
  assert.ok(r.flips <= 1, `烧杯不应振荡：方向翻转 ${r.flips} 次`);
  assert.ok(r.restDiff < 2, `跳完烧杯落回头顶（贴着头顶±2px）：diff=${r.restDiff.toFixed(2)}`);
});

// ---- 2. 头戴宽杯 + 跳 + 走 -------------------------------------------------
test('头戴宽烧杯跳+走：正常跳、无振荡、烧杯跟随不掉队', () => {
  const { scene, p, obj } = headScene(new Beaker({ x: 670, y: 660, w: 150, h: 70, volume: 200, solutes: {} }));
  run(scene, 60);
  const py0 = p.y;
  const bx0 = obj.x;
  // 单次跳 + 持续右走
  scene.control.add('jump'); scene.control.add('right');
  scene.step(1 / 30);
  scene.control.delete('jump');
  let minPy = py0;
  let flips = 0;
  let lastSign = 0;
  let lastBy = obj.y;
  for (let i = 0; i < 50; i++) {
    scene.step(1 / 30);
    minPy = Math.min(minPy, p.y);
    const db = obj.y - lastBy;
    const s = Math.abs(db) > 0.5 ? Math.sign(db) : 0;
    if (s !== 0 && lastSign !== 0 && s !== lastSign) flips++;
    if (s !== 0) lastSign = s;
    lastBy = obj.y;
  }
  scene.control.delete('right'); scene.control.delete('jump');
  assert.ok(py0 - minPy >= 80, `跳跃正常：rise=${(py0 - minPy).toFixed(1)}px`);
  assert.ok(flips <= 1, `无振荡：翻转 ${flips}`);
  assert.ok(obj.x > bx0 + 60, `烧杯跟随玩家走动：${(obj.x - bx0).toFixed(1)}px`);
});

// ---- 3. 头戴集气瓶 + 跳 ----------------------------------------------------
test('头戴集气瓶跳：同上（子体壁豁免对瓶子同样生效）', () => {
  const { scene, p, obj } = headScene(new GasBottle({ x: 706, y: 660, w: 68, h: 70, gases: {} }));
  const r = jumpAndMeasure(scene, p, obj);
  assert.ok(r.rise >= 80, `玩家应跳起：rise=${r.rise.toFixed(1)}px`);
  assert.ok(r.flips <= 1, `集气瓶不应振荡：翻转 ${r.flips} 次`);
  assert.ok(r.restDiff < 2, `跳完瓶落回头顶：diff=${r.restDiff.toFixed(2)}`);
});

// ---- 4. 无头戴（杯在地上、玩家站一旁）：正常推杯不抖 ------------------------
test('对照组：地面烧杯推着走（非头顶）行为不变', () => {
  const scene = new Scene({ worldW: 2000, worldH: 900 });
  scene.addObject(new Floor({ x: -200, y: 820, w: 4000, h: 80 }));
  const p = new Player({ x: 520, y: 730, mass: 30, id: 'p1' });
  scene.addObject(p);
  const bk = new Beaker({ x: 640, y: 750, w: 60, h: 70, volume: 200, solutes: {} });
  scene.addObject(bk);
  scene.status = 'running';
  run(scene, 40);
  const x0 = bk.x;
  for (let i = 0; i < 30; i++) { scene.control.add('right'); scene.step(1 / 30); }
  scene.control.delete('right');
  assert.ok(bk.x > x0 + 100, `推动正常：${(bk.x - x0).toFixed(1)}px`);
  assert.ok(Math.abs(bk.y + bk.h - 820) < 1.5, '烧杯仍立在地面');
});
