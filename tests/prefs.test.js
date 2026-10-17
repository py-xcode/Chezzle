// 偏好设置（prefs.js ↔ 引擎）与「视角大小」对相机缩放的测试
// ----------------------------------------------------------------------------
// 引擎侧读 window.ChezzlePrefs；Node 里没有 prefs.js → 必须退回默认值，
// 这样所有旧测试/编辑器行为与之前完全一致。这里同时验证"有设置时确实生效"。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { getPrefs, keyOf, actionOfCode, KEY_ACTIONS } from '../src/core/prefs.js';
import { Camera } from '../src/render/camera.js';

after(() => { delete globalThis.window; });

test('无 prefs.js 时退回默认值：视角/触控=100%，键位=旧默认', () => {
  const p = getPrefs();
  assert.equal(p.viewScale, 1);
  assert.equal(p.joyScale, 1);
  assert.equal(p.btnScale, 1);
  assert.equal(keyOf('jump'), 'Space');
  assert.equal(keyOf('left'), 'KeyA');
  assert.equal(keyOf('overview'), 'KeyV');
  assert.equal(actionOfCode('KeyR'), 'restart', 'R 是重开');
  assert.equal(actionOfCode('Space'), 'jump');
  assert.equal(actionOfCode('KeyZ'), null);
  assert.equal(KEY_ACTIONS.length, 9);
});

test('有设置时：改键后的 actionOfCode 跟随；R/鸟瞰也可改', () => {
  globalThis.window = {
    ChezzlePrefs: {
      get: () => ({ viewScale: 1, joyScale: 1, btnScale: 1, keys: {
        left: 'KeyJ', right: 'KeyL', jump: 'KeyI', place: 'KeyK', collect: 'KeyU',
        grab: 'KeyO', use: 'KeyP', restart: 'KeyY', overview: 'KeyH',
      } }),
    },
  };
  assert.equal(actionOfCode('KeyI'), 'jump');
  assert.equal(actionOfCode('Space'), null, '旧键位不再映射');
  assert.equal(actionOfCode('KeyY'), 'restart');
  assert.equal(actionOfCode('KeyR'), null, '重开改键后 R 不再重开');
  assert.equal(actionOfCode('KeyH'), 'overview');
  delete globalThis.window;
});

test('视角大小：viewScale 在自动适配结果上再乘缩放（桌面）', () => {
  const mk = () => new Camera({ viewW: 1000, viewH: 800, worldW: 1500, worldH: 800 });
  // 默认：桌面按关卡宽度适配（1400 / 1500 ≈ 0.933）
  const base = mk().compute(1400, 900, null);
  assert.ok(Math.abs(base.scale - 1400 / 1500) < 1e-9, `默认 scale=${base.scale}`);
  // 设置 130% → 相机整体放大 1.3 倍
  globalThis.window = { ChezzlePrefs: { get: () => ({ viewScale: 1.3, joyScale: 1, btnScale: 1, keys: {} }) } };
  const zoomed = mk().compute(1400, 900, null);
  assert.ok(Math.abs(zoomed.scale - base.scale * 1.3) < 1e-9, `130% 时 scale=${zoomed.scale}`);
  delete globalThis.window;
  // 恢复默认后回到原值
  const back = mk().compute(1400, 900, null);
  assert.ok(Math.abs(back.scale - base.scale) < 1e-9);
});
