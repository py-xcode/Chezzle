// 音效引擎（根目录 audio.js）与引擎侧 sfx() 的结构测试
// ----------------------------------------------------------------------------
// Node 没有 Web Audio：这里用一套最小 FakeAudioContext 跑真实合成代码，验证
//   · API 形状、偏好读取与 chezzle:prefs 实时同步、静音/音量
//   · 所有音色预设都能真正构建出音频节点（预设里写错参数会抛错 → play 返回 false）
//   · 同名限频、未解锁不播放、UI 点击自动接线（data-sfx 覆盖 / ui.tick / data-sfx-off）
// 真实发声由无头浏览器 OfflineAudioContext 验证（见 tools 下的探针，不提交）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { sfx, audioAvailable, setSfxEnabled, sfxEnabled } from '../src/core/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'audio.js'), 'utf8');

// ---------------------------------------------------------------------------
// 最小 Web Audio 假实现
// ---------------------------------------------------------------------------
function param(v) {
  return {
    value: v,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
  };
}
class FakeNode {
  constructor() { this.out = []; }
  connect(n) { this.out.push(n); return n; }
  disconnect() {}
}
class FakeGain extends FakeNode { constructor() { super(); this.gain = param(1); } }
class FakeOsc extends FakeNode {
  constructor() { super(); this.type = 'sine'; this.frequency = param(440); this.detune = param(0); this.started = false; }
  start() { this.started = true; }
  stop() {}
}
class FakeBufSrc extends FakeNode {
  constructor() { super(); this.buffer = null; this.loop = false; this.playbackRate = param(1); this.started = false; }
  start() { this.started = true; }
  stop() {}
}
class FakeFilter extends FakeNode {
  constructor() { super(); this.type = 'lowpass'; this.frequency = param(1000); this.Q = param(1); }
}
class FakeComp extends FakeNode {
  constructor() {
    super();
    this.threshold = param(-24); this.knee = param(30); this.ratio = param(12);
    this.attack = param(0.003); this.release = param(0.25);
  }
}
class FakeConv extends FakeNode { constructor() { super(); this.buffer = null; } }
class FakePanner extends FakeNode { constructor() { super(); this.pan = param(0); } }
class FakeShaper extends FakeNode { constructor() { super(); this.curve = null; this.oversample = 'none'; } }

class FakeBuffer {
  constructor(ch, len) { this.numberOfChannels = ch; this.length = len; this.chans = []; }
  getChannelData(i) {
    if (!this.chans[i]) this.chans[i] = new Float32Array(this.length);
    return this.chans[i];
  }
}
class FakeCtx {
  constructor() {
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new FakeNode();
    this.made = { osc: 0, noise: 0, gain: 0 };
  }
  createGain() { this.made.gain++; return new FakeGain(); }
  createOscillator() { this.made.osc++; return new FakeOsc(); }
  createBufferSource() { this.made.noise++; return new FakeBufSrc(); }
  createBiquadFilter() { return new FakeFilter(); }
  createDynamicsCompressor() { return new FakeComp(); }
  createConvolver() { return new FakeConv(); }
  createStereoPanner() { return new FakePanner(); }
  createWaveShaper() { return new FakeShaper(); }
  createBuffer(ch, len) { return new FakeBuffer(ch, len); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

// ---------------------------------------------------------------------------
// 假 window / document（audio.js 是经典脚本，new Function 里以参数注入全局）
// ---------------------------------------------------------------------------
function makeEnv(prefs) {
  const handlers = {};
  const docHandlers = {};
  const clock = { t: 1000 };
  const win = {
    ChezzlePrefs: {
      get: () => prefs,
    },
    performance: { now: () => clock.t },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    dispatchEvent(ev) {
      for (const fn of handlers[ev.type] || []) fn(ev);
      return true;
    },
    AudioContext: FakeCtx,
  };
  win.window = win;
  const doc = {
    addEventListener(type, fn) { (docHandlers[type] ||= []).push(fn); },
    querySelectorAll: () => [],
  };
  const load = new Function('window', 'document', SRC);
  load(win, doc);
  return { win, doc, handlers, docHandlers, clock, prefs };
}

const ALL_NAMES = [
  'ui.click', 'ui.tick', 'ui.open', 'ui.close', 'ui.back', 'ui.toggle', 'ui.deny',
  'page.enter', 'page.leave', 'level.enter', 'level.leave',
  'player.jump', 'player.land', 'player.hurt',
  'item.pickup', 'item.place', 'item.suck', 'item.pour', 'item.drip', 'item.gas',
  'chem.react', 'chem.bubble', 'chem.spark', 'chem.explode', 'chem.ignite', 'chem.extinguish',
  'switch.open', 'switch.close', 'key.open', 'door.open', 'door.close',
  'portal', 'rope.break', 'extractor.pump',
  'win', 'died', 'restart', 'overview.on', 'overview.off', 'tip', 'banner',
  'checkpoint.save', 'checkpoint.restore',
];

test('audio.js：API 形状 + 全部音色名齐全', () => {
  const { win } = makeEnv({ sfxVolume: 0.7, sfxMuted: false });
  const A = win.ChezzleAudio;
  assert.ok(A, '挂载 window.ChezzleAudio');
  for (const k of ['play', 'unlock', 'setVolume', 'getVolume', 'setMuted', 'getMuted', 'toggleMute', 'names', 'stats', 'renderOffline']) {
    assert.equal(typeof A[k], 'function', `API.${k}`);
  }
  const names = A.names();
  for (const n of ALL_NAMES) assert.ok(names.includes(n), `缺少音色 ${n}`);
  assert.equal(names.length, ALL_NAMES.length, `音色数量 ${names.length} != ${ALL_NAMES.length}`);
});

test('audio.js：偏好读取 + chezzle:prefs 实时同步 + 静音', () => {
  const env = makeEnv({ sfxVolume: 0.35, sfxMuted: true });
  const A = env.win.ChezzleAudio;
  assert.equal(A.getVolume(), 0.35);
  assert.equal(A.getMuted(), true);
  // 静音时不播放
  assert.equal(A.unlock(), true);
  env.clock.t += 500;
  assert.equal(A.play('ui.click'), false);
  // 取消静音后能播放
  A.setMuted(false);
  assert.equal(A.play('ui.click'), true);
  // prefs 事件同步（设置面板保存 → 立即生效）
  env.prefs.sfxVolume = 0.9;
  env.prefs.sfxMuted = false;
  env.win.dispatchEvent({ type: 'chezzle:prefs', detail: env.prefs });
  assert.equal(A.getVolume(), 0.9);
  // 音量 0 → 不播放
  A.setVolume(0);
  env.clock.t += 500;
  assert.equal(A.play('ui.open'), false);
  A.setVolume(0.7);
});

test('audio.js：未解锁前 play 直接 false（不排队，避免解锁瞬间泄洪）', () => {
  const { win } = makeEnv({ sfxVolume: 0.7, sfxMuted: false });
  assert.equal(win.ChezzleAudio.play('ui.click'), false);
  assert.equal(win.ChezzleAudio.stats().unlocked, false);
  assert.equal(win.ChezzleAudio.unlock(), true);
  assert.equal(win.ChezzleAudio.stats().unlocked, true);
  assert.equal(win.ChezzleAudio.play('ui.click'), true);
});

test('audio.js：每个预设都能构建出音频节点（预设参数错误会在这里暴露）', () => {
  const env = makeEnv({ sfxVolume: 1, sfxMuted: false });
  const A = env.win.ChezzleAudio;
  A.unlock();
  for (const name of ALL_NAMES) {
    env.clock.t += 400; // 越过所有同名 gap / 全局爆发窗口
    assert.equal(A.play(name), true, `预设 ${name} 构建失败`);
  }
  const st = A.stats();
  assert.equal(st.played, ALL_NAMES.length);
  for (const name of ALL_NAMES) assert.ok(st.byName[name] >= 1, `统计缺失 ${name}`);
});

test('audio.js：同名限频与全局爆发保护', () => {
  const env = makeEnv({ sfxVolume: 1, sfxMuted: false });
  const A = env.win.ChezzleAudio;
  A.unlock();
  env.clock.t += 400;
  assert.equal(A.play('ui.click'), true);
  env.clock.t += 5; // gap 35ms 内
  assert.equal(A.play('ui.click'), false, '同名限频');
  env.clock.t += 100;
  assert.equal(A.play('ui.click'), true);
  // 全局：同一瞬间打一堆不同音色 → 最多 14 个进图
  let ok = 0;
  for (const name of ALL_NAMES) if (A.play(name)) ok++;
  assert.ok(ok <= 14, `120ms 窗口内启动 ${ok} 个，超过保护值`);
});

test('audio.js：UI 点击自动接线（button → ui.click；data-sfx 覆盖；range → ui.tick；data-sfx-off 跳过）', () => {
  const env = makeEnv({ sfxVolume: 1, sfxMuted: false });
  const A = env.win.ChezzleAudio;
  A.unlock();
  const click = env.docHandlers.click && env.docHandlers.click[0];
  assert.ok(click, 'document 上注册了 click 捕获监听');
  const el = (tag, attrs = {}) => ({
    nodeType: 1,
    tagName: tag,
    parentNode: null,
    attrs,
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    getAttribute(k) { return this.attrs[k]; },
    matches() { return tag === 'BUTTON' || tag === 'A' || tag === 'INPUT'; },
  });
  env.clock.t += 400;
  click({ button: 0, target: el('BUTTON') });
  assert.ok(A.stats().byName['ui.click'] >= 1, 'button → ui.click');
  env.clock.t += 400;
  click({ button: 0, target: el('BUTTON', { 'data-sfx': 'ui.back' }) });
  assert.ok(A.stats().byName['ui.back'] >= 1, 'data-sfx 覆盖');
  env.clock.t += 400;
  click({ button: 0, target: el('INPUT') });
  assert.ok(A.stats().byName['ui.tick'] >= 1, 'input[type=range] → ui.tick');
  const before = A.stats().played;
  env.clock.t += 400;
  click({ button: 0, target: el('BUTTON', { 'data-sfx-off': '' }) });
  assert.equal(A.stats().played, before, 'data-sfx-off 子树静默');
  // 右键点击不发声
  env.clock.t += 400;
  click({ button: 2, target: el('BUTTON') });
});

test('audio.js：renderOffline 无 OfflineAudioContext 时安全返回 null', async () => {
  const { win } = makeEnv({ sfxVolume: 0.7, sfxMuted: false });
  assert.equal(await win.ChezzleAudio.renderOffline('ui.click', 0.3), null);
});

test('src/core/audio.js：Node 下 sfx() 是安全 no-op', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(sfx('player.jump'), false);
  assert.equal(sfx('not-a-sound'), false);
  assert.doesNotThrow(() => sfx('chem.explode', { gain: 2 }));
  assert.equal(audioAvailable(), false);
});

test('src/core/audio.js：setSfxEnabled 总开关（首页装饰舞台关闭引擎音效）', () => {
  assert.equal(sfxEnabled(), true, '默认开启');
  assert.equal(setSfxEnabled(false), false);
  assert.equal(sfxEnabled(), false);
  assert.equal(sfx('win'), false);
  assert.equal(audioAvailable(), false);
  assert.equal(setSfxEnabled(true), true);
  assert.equal(sfxEnabled(), true);
});
