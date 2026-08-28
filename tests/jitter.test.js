// ============================================================================
// 头顶支撑物（烧杯/集气瓶坐在玩家头顶）行为测试
// 用户要求：**不要帽子式跟随**（装置胶在头顶很假）——改为自然物理：
//   头顶有装置时跳 = 头顶顶到杯底被挡住（不产生抖动/振荡）；
//   走动离开支撑后装置正常掉落（不跟随）。
// 历史：曾出现"头顶烧杯+跳 = 抖动"（壁体豁免反复开关 + 双向往复），测试锁定
// 该回归：无论怎样都不允许出现振荡（烧杯 y 方向翻转 ≤ 1）。
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

/** 跳一跳：统计跳高、烧杯 y 方向翻转次数（>1 = 振荡） */
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

// ---- 1. 头戴烧杯 + 跳：被头顶挡住（不抖动、烧杯仍在头顶） ------------------
test('头戴烧杯跳：跳被头顶的烧杯挡住（无振荡），烧杯醒着不飞', () => {
  const { scene, p, obj } = headScene(new Beaker({ x: 710, y: 660, w: 60, h: 70, volume: 200, solutes: {} }));
  const r = jumpAndMeasure(scene, p, obj);
  assert.ok(r.rise < 5, `跳被头顶挡住：rise=${r.rise.toFixed(1)}px`);
  assert.ok(r.flips <= 1, `无振荡：方向翻转 ${r.flips} 次`);
  assert.ok(r.restDiff < 2, `烧杯仍停在头顶：diff=${r.restDiff.toFixed(2)}`);
});

// ---- 2. 头戴宽杯 + 跳 + 走：烧杯不跟随，走动后自然掉落 ----------------------
test('头戴烧杯走+跳：烧杯不跟随（自然掉落），玩家正常移动，无振荡', () => {
  const { scene, p, obj } = headScene(new Beaker({ x: 670, y: 660, w: 150, h: 70, volume: 200, solutes: {} }));
  run(scene, 60);
  const px0 = p.x;
  const bx0 = obj.x;
  scene.control.add('jump'); scene.control.add('right');
  scene.step(1 / 30);
  scene.control.delete('jump');
  let flips = 0;
  let lastSign = 0;
  let lastBy = obj.y;
  for (let i = 0; i < 50; i++) {
    scene.step(1 / 30);
    const db = obj.y - lastBy;
    const s = Math.abs(db) > 0.5 ? Math.sign(db) : 0;
    if (s !== 0 && lastSign !== 0 && s !== lastSign) flips++;
    if (s !== 0) lastSign = s;
    lastBy = obj.y;
  }
  scene.control.delete('right');
  assert.ok(flips <= 1, `无振荡：翻转 ${flips}`);
  assert.ok(p.x > px0 + 60, `玩家正常走动：${(p.x - px0).toFixed(1)}px`);
  assert.ok(Math.abs(obj.x - bx0) < 2, `烧杯不被带走：Δx=${(obj.x - bx0).toFixed(1)}px`);
  assert.ok(Math.abs(obj.y + obj.h - 820) < 2, `烧杯掉到地面：y+h=${(obj.y + obj.h).toFixed(1)}`);
});

// ---- 3. 头戴集气瓶 + 跳 ----------------------------------------------------
test('头戴集气瓶跳：同烧杯（被挡住、无振荡）', () => {
  const { scene, p, obj } = headScene(new GasBottle({ x: 706, y: 660, w: 68, h: 70, gases: {} }));
  const r = jumpAndMeasure(scene, p, obj);
  assert.ok(r.rise < 5, `跳被头顶的瓶挡住：rise=${r.rise.toFixed(1)}px`);
  assert.ok(r.flips <= 1, `无振荡：翻转 ${r.flips} 次`);
  assert.ok(r.restDiff < 2, `瓶仍停在头顶：diff=${r.restDiff.toFixed(2)}`);
});

// ---- 4. 对照组：地面烧杯推着走（非头顶）行为不变 ----------------------------
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
