// 偏好设置（prefs.js ↔ 引擎）与「视角大小」对相机缩放的测试
// ----------------------------------------------------------------------------
// 引擎侧读 window.ChezzlePrefs；Node 里没有 prefs.js → 必须退回默认值，
// 这样所有旧测试/编辑器行为与之前完全一致。这里同时验证"有设置时确实生效"。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getPrefs, keyOf, actionOfCode, KEY_ACTIONS } from '../src/core/prefs.js';
import { Camera } from '../src/render/camera.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREFS_SRC = readFileSync(join(ROOT, 'prefs.js'), 'utf8');

/** 在 Node 里跑经典脚本 prefs.js：给它一个最小的 window（localStorage / 事件总线） */
function loadPrefsClassic() {
  const win = {
    _store: {},
    _events: [],
    _handlers: {},
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(win._store, k) ? win._store[k] : null; },
      setItem(k, v) { win._store[k] = String(v); },
      removeItem(k) { delete win._store[k]; },
    },
    dispatchEvent(ev) { win._events.push(ev); return true; },
    addEventListener(type, fn) { (win._handlers[type] ||= []).push(fn); },
    removeEventListener() {},
  };
  new Function('window', PREFS_SRC)(win);
  return win;
}

after(() => { delete globalThis.window; });

test('无 prefs.js 时退回默认值：视角/触控=100%，键位=旧默认', () => {
  const p = getPrefs();
  assert.equal(p.viewScale, 1);
  assert.equal(p.joyScale, 1);
  assert.equal(p.btnScale, 1);
  assert.equal(p.sfxVolume, 0.7, '音效音量默认 70%');
  assert.equal(p.sfxMuted, false, '默认不静音');
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

test('prefs.js：音效音量/静音的默认、夹取、合并保存与重置', () => {
  const P = loadPrefsClassic().ChezzlePrefs;
  const d = P.get();
  assert.equal(d.sfxVolume, 0.7, '默认音量 70%');
  assert.equal(d.sfxMuted, false, '默认不静音');

  const p1 = P.save({ sfxVolume: 0.35, sfxMuted: true });
  assert.equal(p1.sfxVolume, 0.35);
  assert.equal(p1.sfxMuted, true);
  assert.equal(p1.viewScale, 1, '只改音效不该动其它偏好');

  // 只传音量：静音保持；越界夹回
  const p2 = P.save({ sfxVolume: 2 });
  assert.equal(p2.sfxVolume, 1, '音量夹到 1');
  assert.equal(p2.sfxMuted, true, '未传 sfxMuted 时保持原值');
  assert.equal(P.save({ sfxVolume: -1 }).sfxVolume, 0, '音量夹到 0');

  // normalize：静音只认真正的 true；音量非数字回默认（不是 1）
  assert.equal(P.normalize({ sfxMuted: 'yes' }).sfxMuted, false);
  assert.equal(P.normalize({ sfxMuted: 1 }).sfxMuted, false);
  assert.equal(P.normalize({ sfxMuted: true }).sfxMuted, true);
  assert.equal(P.normalize({ sfxVolume: 'x' }).sfxVolume, 0.7);
  assert.equal(P.normalize({}).sfxVolume, 0.7);
  assert.equal(P.normalize({}).sfxMuted, false);

  const r = P.reset();
  assert.equal(r.sfxVolume, 0.7, '恢复默认后音量回 70%');
  assert.equal(r.sfxMuted, false, '恢复默认后取消静音');
});

test('prefs.js：其它文档（SPA 常驻 iframe）改了存储 → 缓存失效并广播 chezzle:prefs', () => {
  const win = loadPrefsClassic();
  const P = win.ChezzlePrefs;
  assert.equal(P.get().sfxVolume, 0.7, '先建立本页缓存');
  // 模拟首页文档写入新音量/静音 → 选关等 iframe 收到 storage 事件
  win._store[P.KEY] = JSON.stringify({ sfxVolume: 0.25, sfxMuted: true });
  const onStorage = (win._handlers.storage || [])[0];
  assert.equal(typeof onStorage, 'function', '注册了 storage 监听');
  onStorage({ key: P.KEY });
  assert.equal(P.get().sfxVolume, 0.25, '缓存失效后读到新音量');
  assert.equal(P.get().sfxMuted, true, '缓存失效后读到新静音');
  assert.equal(win._events.at(-1)?.type, 'chezzle:prefs', '广播给 audio.js 等订阅方');

  // 其它 key 的 storage 事件不该清缓存/广播
  const n = win._events.length;
  win._store[P.KEY] = JSON.stringify({ sfxVolume: 0.1 });
  onStorage({ key: 'some-other-key' });
  assert.equal(win._events.length, n, '无关 key 不广播');
  assert.equal(P.get().sfxVolume, 0.25, '无关 key 不清缓存');

  // 整库被清空（key=null）也要失效
  delete win._store[P.KEY];
  onStorage({ key: null });
  assert.equal(P.get().sfxVolume, 0.7, '存储清空后回默认');
});
