// ============================================================================
// 操作录制/回放工具测试
// 覆盖：种子随机确定性、录制数据模型（R 分段/坐标/时间戳）、回放推进顺序
//      （KeyR 作为段结束信号不放行）、端到端"录制→回放→轨迹一致"。
// ============================================================================

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Player } from '../src/objects/player.js';
import {
  mulberry32, installSeed, GameRecorder, replayEvents,
} from '../src/core/recorder.js';

const TICK = 1 / 30;
function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

after(() => { Math.random = () => undefined; }); // 恢复（明确移除冒充者）

// ---- 1. 种子随机 -------------------------------------------------------------
test('mulberry32：同种子序列一致、不同种子不同', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  const seqA = [a(), a(), a(), a()];
  assert.deepEqual(seqA, [b(), b(), b(), b()], '同种子一致');
  assert.notDeepEqual(seqA, [c(), c(), c(), c()], '不同种子不同');
});

test('installSeed：Math.random 变为确定性 PRNG（可恢复）', () => {
  const old = installSeed(7);
  const x1 = Math.random();
  installSeed(7);
  const x2 = Math.random();
  assert.equal(x1, x2, '重装同种子 → 同序列');
  Math.random = old;
});

// ---- 2. 录制数据模型 ---------------------------------------------------------
test('录制器：事件带时间戳/画布坐标；KeyR 自动分段；stop 后数据成型', () => {
  const scene = new Scene();
  scene.status = 'running';
  let t = 0;
  Object.defineProperty(scene, 'time', { get: () => t }); // 可控时间源
  const rec = new GameRecorder(() => scene, { width: 100, height: 60 });
  rec.start();
  // 模拟玩家操作：走-停-跳-R 重开-再走
  t = 1.0; rec.key('KeyD', true);
  t = 1.8; rec.key('KeyD', false);
  t = 2.1; rec.touch('td', 50, 30, 1);
  t = 2.3; rec.touch('tm', 20, 30, 1);
  t = 2.5; rec.key('KeyR', true); // 分段
  t = 3.0; rec.key('KeyD', true);
  const runs = rec.stop();
  assert.equal(runs.length, 2, 'KeyR 结束第 1 段，后续操作属于第 2 段');
  assert.equal(runs[0].events.length, 5);
  assert.deepEqual(runs[0].events[0], { t: 1, k: 'kd', code: 'KeyD' });
  assert.deepEqual(runs[0].events[4], { t: 2.5, k: 'kd', code: 'KeyR' });
  assert.deepEqual(runs[1].events, [{ t: 3, k: 'kd', code: 'KeyD' }], '第 2 段从重开后第一个操作开始');
  const data = rec.data();
  assert.equal(data.runs.length, 2, 'stop 后 data.runs 含全部段');
  assert.ok(Number.isInteger(data.seed), '记录种子');
  assert.equal(data.tickRate, 30);
  // 未 stop 时的 data() 也应含进行中段
  const rec2 = new GameRecorder(() => scene, { width: 100, height: 60 });
  rec2.start();
  rec2.key('KeyA', true);
  const d2 = rec2.data();
  assert.equal(d2.runs.length, 1, '进行中的段也进 data（下载前不丢）');
  rec2.stop();
});

// ---- 3. 回放推进 -------------------------------------------------------------
test('replayEvents：按 scene.time 顺序推进；KeyR 结束段且不放行', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  scene.status = 'running';
  const got = [];
  let done = null;
  const events = [
    { t: 0.05, k: 'kd', code: 'KeyD' },
    { t: 0.70, k: 'kd', code: 'Space' },
    { t: 1.20, k: 'ku', code: 'KeyD' },
    { t: 1.50, k: 'kd', code: 'KeyR' }, // 段结束
    { t: 2.00, k: 'kd', code: 'KeyA' }, // 本段不放行
  ];
  const stopF = replayEvents(() => scene, {}, events, {
    sink: (ev) => got.push(ev.code ?? ev.k),
    onDone: (byRestart) => { done = byRestart; },
  });
  for (let i = 0; i < 70; i++) scene.step(TICK);
  assert.deepEqual(got, ['KeyD', 'Space', 'KeyD'], '顺序推进且 KeyR 自身不放行');
  assert.equal(done, true, 'KeyR 触发段结束');
  stopF();
});

// ---- 4. 端到端：录制→回放→轨迹一致 -------------------------------------------
test('端到端：同一操作序列录制后回放，玩家轨迹一致', () => {
  // 场景 A：真实驱动 + 录制
  const A = new Scene();
  A.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const pa = new Player({ x: 400, y: 600, mass: 30, id: 'pa' });
  A.addObject(pa);
  A.status = 'running';
  const rec = new GameRecorder(() => A, { width: 100, height: 60 });
  rec.start();
  const applyKey = (s, code, down) => { // 模拟 bindKeyboard 语义
    const KEYMAP = { KeyA: 'left', KeyD: 'right', Space: 'jump' };
    const c = KEYMAP[code];
    if (!c) return;
    if (down) { if (!s.control.has(c)) s.pressed.add(c); s.control.add(c); }
    else s.control.delete(c);
  };
  const logA = [];
  const stepA = () => { A.step(TICK); logA.push(pa.x.toFixed(3)); };
  const driveA = () => {
    // 走 → 停下 → 跳+走 → 松
    rec.key('KeyD', true); applyKey(A, 'KeyD', true);
    for (let i = 0; i < 15; i++) stepA();
    rec.key('KeyD', false); applyKey(A, 'KeyD', false);
    for (let i = 0; i < 5; i++) stepA();
    rec.key('Space', true); applyKey(A, 'Space', true);
    rec.key('KeyD', true); applyKey(A, 'KeyD', true);
    for (let i = 0; i < 12; i++) stepA();
    rec.key('Space', false); applyKey(A, 'Space', false);
    for (let i = 0; i < 10; i++) stepA();
    rec.key('KeyD', false); applyKey(A, 'KeyD', false);
    for (let i = 0; i < 8; i++) stepA();
  };
  driveA();
  rec.key('KeyR', true); // 段结束
  for (let i = 0; i < 50; i++) stepA();
  const runs = rec.stop();
  assert.equal(runs.length, 1);
  const events = runs[0].events.filter((e) => !(e.k === 'kd' && e.code === 'KeyR'));

  // 场景 B：全新场景 + 回放（同种子）；B 也跑同样的 100 tick 全程对照
  const B = new Scene();
  B.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const pb = new Player({ x: 400, y: 600, mass: 30, id: 'pb' });
  B.addObject(pb);
  B.status = 'running';
  installSeed(rec.seed);
  const logB = [];
  replayEvents(() => B, {}, events, { sink: (ev) => applyKey(B, ev.code, ev.k === 'kd') });
  for (let i = 0; i < 100; i++) { B.step(TICK); logB.push(pb.x.toFixed(3)); }
  assert.deepEqual(logB, logA, '轨迹逐帧一致');
});
