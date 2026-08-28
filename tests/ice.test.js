// ============================================================================
// 冰面测试：冰地板 = 极滑 —— 沉淀落冰主动滑走（搭不了高）、踢飞的沉淀滑得
// 远（低摩擦）、玩家松手继续滑（控制响应慢、动量保持）；石地行为不变。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { CFG } from '../src/core/config.js';

const run = (scene, n) => { for (let i = 0; i < n; i++) scene.step(1 / 30); };

function mk(ice) {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100, ice }));
  scene.status = 'running';
  return scene;
}

// ---- 1. 静止沉淀：冰上主动漂走，石地纹丝不动 ------------------------------
test('冰面：放置的沉淀自动滑走（随方向漂移），石地静止', () => {
  for (const ice of [true, false]) {
    const scene = mk(ice);
    scene.spawnParticles('BaCO3', 0.5, { x: 400, y: 620 }, true, true, null, 0);
    run(scene, 150); // 5s：落地 + 漂移
    const pt = scene.particles[0];
    assert.ok(pt, '沉淀存在');
    const drift = Math.abs(pt.x - 400);
    if (ice) {
      assert.ok(drift > 40, `冰上应滑走：漂移 ${drift.toFixed(1)}px, vel=${pt.vel.x.toFixed(1)}`);
    } else {
      assert.ok(drift < 3, `石地应静止：漂移 ${drift.toFixed(1)}px`);
    }
  }
});

// ---- 2. 踢飞的沉淀：冰上滑得远、石地快速停 --------------------------------
test('冰面摩擦低：初速 200px/s 的沉淀在冰上滑 2s 仍在动，石地已停', () => {
  const res = {};
  for (const ice of [true, false]) {
    const scene = mk(ice);
    scene.spawnParticles('BaCO3', 0.5, { x: 400, y: 620 }, true, true, null, 0);
    run(scene, 30); // 落地
    const pt = scene.particles[0];
    pt.vel.x = 200;
    run(scene, 60); // 2s
    res[ice ? 'ice' : 'stone'] = { x: pt.x, v: pt.vel.x };
  }
  const iceD = res.ice.x - 400;
  const stoneD = res.stone.x - 400;
  assert.ok(iceD > 150, `冰上滑得远：${iceD.toFixed(1)}px（v=${res.ice.v.toFixed(1)}）`);
  assert.ok(Math.abs(res.stone.v) < 6 && stoneD < 70, `石地快速停：${stoneD.toFixed(1)}px, v=${res.stone.v.toFixed(1)}`);
});

// ---- 3. 玩家：冰上松手仍滑（动量保持），石地松手急停 ----------------------
test('玩家冰上滑行：按住→松手后的滑行距离明显大于石地', () => {
  const res = {};
  for (const ice of [true, false]) {
    const scene = mk(ice);
    const p = new Player({ x: 300, y: 600, mass: 30, id: 'p1' });
    scene.addObject(p);
    run(scene, 40); // 落地
    // 按住右 1s
    for (let i = 0; i < 30; i++) { scene.control.add('right'); scene.step(1 / 30); }
    scene.control.delete('right');
    const x1 = p.x;
    run(scene, 30); // 松手 1s
    res[ice ? 'ice' : 'stone'] = { glide: p.x - x1, v: p.vel.x };
  }
  assert.ok(res.stone.v === 0 || Math.abs(res.stone.v) < 1, `石地已停：v=${res.stone.v}`);
  assert.ok(res.stone.glide < 45, `石地滑行短：${res.stone.glide.toFixed(1)}px`);
  assert.ok(res.ice.glide > res.stone.glide * 1.5, `冰上滑行远：${res.ice.glide.toFixed(1)}px vs 石地 ${res.stone.glide.toFixed(1)}px`);
});

// ---- 4. 冰上控制响应慢（没到满速就松手也滑） ------------------------------
test('冰面控制响应：按住 0.27s 达不到满速（controlAccel 生效）', () => {
  const scene = mk(true);
  const p = new Player({ x: 300, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  run(scene, 40);
  for (let i = 0; i < 8; i++) { scene.control.add('right'); scene.step(1 / 30); } // 0.27s
  assert.ok(p.vel.x < CFG.player.moveSpeed * 0.85, `冰上 0.27s 未到满速：${p.vel.x.toFixed(1)}`);
  // 石地对比：每 tick 指令即满速（再被地面摩擦衰减一点）
  const s2 = mk(false);
  const p2 = new Player({ x: 300, y: 600, mass: 30, id: 'p1' });
  s2.addObject(p2);
  run(s2, 40);
  for (let i = 0; i < 3; i++) { s2.control.add('right'); s2.step(1 / 30); }
  assert.ok(p2.vel.x > CFG.player.moveSpeed * 0.7, `石地接近满速：${p2.vel.x.toFixed(1)}`);
});

// ---- 5. 冰面标记只对落地体生效（空中不受影响） ----------------------------
test('冰面：玩家贴地才滑（_groundIce 逐帧重标，不残留）', () => {
  const scene = mk(true);
  const p = new Player({ x: 300, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  run(scene, 40);
  assert.ok(p.onGround && p._groundIce, '落地冰上: onGround+ice');
  // 跳起离开地面（冰面标记应随物理步清除）
  scene.control.add('jump');
  scene.step(1 / 30);
  scene.control.delete('jump');
  run(scene, 3);
  assert.ok(!p.onGround, '跳起离地');
  assert.ok(!p._groundIce, '离地后冰面标记不残留');
});
