// 插件系统 + 场景运行时钩子（onTick/wait/interval/after/键盘）测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene } from '../src/core/scene.js';
import { Plugins } from '../src/level/plugins.js';
import { Obj } from '../src/objects/obj.js';
import { CFG } from '../src/core/config.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';

const TICK = 1 / 30;

function makeScene() {
  const s = new Scene({ worldW: 600, worldH: 400 });
  s.status = 'running';
  return s;
}
function stepN(s, n) { for (let i = 0; i < n; i++) s.step(TICK); }

test('插件注册/查/列表', () => {
  const def = { run: () => {} };
  Plugins.register('t_reg_a', def);
  assert.equal(Plugins.get('t_reg_a'), def);
  assert.ok(Plugins.has('t_reg_a'));
  assert.ok(Plugins.list().some((e) => e.name === 't_reg_a'));
});

test('元数据块解析', () => {
  const src = `// @@chezzle-plugin
// { "name": "延迟出现", "api": 1,
//   "fields": [ { "key": "delay", "label": "延迟秒", "kind": "number", "def": 10 } ] }
// @@end
window.Chezzle.Plugin.register('x', {});`;
  const meta = Plugins.parseMeta(src);
  assert.equal(meta.name, '延迟出现');
  assert.equal(meta.fields[0].kind, 'number');
  assert.equal(Plugins.parseMeta('无元数据的源码'), null);
});

test('inject 执行 run + 清理函数', () => {
  const s = makeScene();
  let ran = 0;
  let cleaned = false;
  Plugins.register('t_inj', {
    run: (scene, api, cfg) => {
      ran++;
      assert.equal(cfg.x, 7);
      return () => { cleaned = true; };
    },
  });
  const cleanup = Plugins.inject(s, [{ name: 't_inj', cfg: { x: 7 } }]);
  assert.equal(ran, 1);
  cleanup();
  assert.ok(cleaned);
});

test('inject 跳过未注册插件且不抛错', () => {
  const s = makeScene();
  const cleanup = Plugins.inject(s, [{ name: 't_not_exist_123' }]);
  assert.equal(typeof cleanup, 'function');
});

test('插件 run 抛错不影响 inject', () => {
  const s = makeScene();
  Plugins.register('t_bad', { run: () => { throw new Error('boom'); } });
  const cleanup = Plugins.inject(s, [{ name: 't_bad' }]);
  assert.equal(typeof cleanup, 'function');
});

test('onTick 每帧执行、返回 true 卸载、可手动卸载', () => {
  const s = makeScene();
  let n1 = 0;
  let n2 = 0;
  let n3 = 0;
  s.onTick(() => { n1++; });
  s.onTick(() => { n2++; return true; });
  stepN(s, 5);
  assert.equal(n1, 5);
  assert.equal(n2, 1);
  const off = s.onTick(() => { n3++; });
  off(); // 立即手动卸载第三个钩子
  stepN(s, 3);
  assert.equal(n3, 0, '手动卸载的钩子不应再执行');
  assert.equal(n1, 8, '未卸载的钩子照常执行');
});

test('wait 按游戏时间触发（30tick/s）', () => {
  const s = makeScene();
  let fired = -1;
  s.wait(1, () => { fired = s.time; });
  stepN(s, 20); // ~0.66s
  assert.ok(fired < 0, '不应太早触发');
  stepN(s, 12); // ~1.06s
  assert.ok(fired >= 0, '应已触发');
  assert.ok(Math.abs(fired - 1) < 0.2, '触发时间偏差: ' + fired);
});

test('wait 返回取消函数', () => {
  const s = makeScene();
  let fired = false;
  s.wait(1, () => { fired = true; })();
  stepN(s, 40);
  assert.ok(!fired);
});

test('after 下一帧执行一次', () => {
  const s = makeScene();
  let n = 0;
  s.after(() => { n++; });
  s.step(TICK);
  assert.equal(n, 1);
  s.step(TICK);
  assert.equal(n, 1);
});

test('interval 周期执行', () => {
  const s = makeScene();
  let n = 0;
  s.interval(0.2, () => { n++; });
  stepN(s, 15); // 0.5s → 0.2/0.4 两次
  assert.equal(n, 2);
  const before = n;
  stepN(s, 30); // +1s → 5 次
  assert.equal(n, before + 5);
});

test('钩子异常不拖垮 step', () => {
  const s = makeScene();
  s.onTick(() => { throw new Error('x'); });
  s.wait(0.1, () => { throw new Error('y'); });
  assert.doesNotThrow(() => stepN(s, 10));
});

test('键盘钩子 onKeyDown/onKeyUp（含未映射键）+ preventDefault', () => {
  const s = makeScene();
  const down = [];
  const up = [];
  s.onKeyDown((e) => { down.push(e.code); return e.code === 'KeyE'; });
  s.onKeyUp((e) => { up.push(e.code); });
  let pd = false;
  s._fireKey('down', { code: 'KeyE', preventDefault: () => { pd = true; }, cancelable: true });
  s._fireKey('down', { code: 'KeyX', preventDefault: () => {}, cancelable: true });
  s._fireKey('up', { code: 'KeyE' });
  assert.deepEqual(down, ['KeyE', 'KeyX']);
  assert.ok(pd, '返回 true 应 preventDefault');
  assert.deepEqual(up, ['KeyE']);
});

test('v2 组件 create 实例化 + origin 标记', () => {
  Plugins.register('t_comp', {
    components: [{
      type: 'magnet',
      label: '磁铁',
      fields: [{ key: 'strength', label: '强度', kind: 'number', def: 5 }],
      construct: (opts) => ({ id: 'mag', x: opts.x ?? 0, y: opts.y ?? 0, w: 40, h: 40, strength: opts.strength ?? 5 }),
    }],
  });
  assert.ok(Plugins.components().some((c) => c.type === 'magnet' && c.plugin === 't_comp'));
  const o = Plugins.create('magnet', { x: 10, strength: 9 });
  assert.equal(o.x, 10);
  assert.equal(o.strength, 9);
  assert.equal(o.origin.kind, 'plugin');
  assert.equal(Plugins.create('不存在'), null);
});

test('api 便捷面：byId/addReaction/tip/objects', () => {
  const s = makeScene();
  const o = { id: 'lamp1', x: 0, y: 0, w: 10, h: 10 };
  s.addObject(o);
  let api = null;
  Plugins.register('t_api', { run: (scene, apiRef) => { api = apiRef; } });
  Plugins.call('t_api', s, {});
  assert.equal(api.byId('lamp1'), o);
  assert.equal(api.tip('hi'), undefined);
  assert.equal(s.tip, 'hi');
  assert.equal(api.addReaction('Zn + 2HCl → ZnCl2 + H2'), true);
  assert.equal(s.customReactions.length, 1);
  assert.equal(api.addReaction('根本不存在的反应式xyz'), false);
});

test('removeObject 清除 player 引用', () => {
  const s = makeScene();
  const p = { id: 'p1', x: 0, y: 0, w: 10, h: 10, material: null };
  // 用真实 Player 太依赖物理结构；这里直接模拟 _register 行为
  s.addObject(p);
  s.player = p;
  s.removeObject(p);
  assert.equal(s.player, null);
});

// ---- 官方示例插件（真实文件，模拟浏览器加载：注入全局 Chezzle 后再 new Function） ----
class FakeSpark {
  constructor(opts = {}) {
    this.id = 'sparktest' + (FakeSpark.n = (FakeSpark.n ?? 0) + 1);
    this.x = 0; this.y = 0; this.w = 3; this.h = 3; this.life = 0.8;
    Object.assign(this, opts);
  }
  update(dt, scene) {
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }
}
const testChezzle = { Plugin: Plugins, Obj, CFG, Spark: FakeSpark };
function loadFilePlugin(name) {
  const src = readFileSync(`docs/plugins/${name}`, 'utf8');
  new Function('Chezzle', src)(testChezzle);
}
function sparkCount(s) {
  return s.objects.filter((o) => o instanceof FakeSpark || o.constructor?.name === 'FakeSpark').length;
}

test('官方插件 lampDelay(增强版)：appearDelay 物体开局隐藏 + 到点出现', () => {
  loadFilePlugin('lampDelay.js');
  const s = makeScene();
  const o = { id: 'lamp1', x: 0, y: 0, w: 20, h: 20, hidden: false, appearDelay: 1 };
  s.addObject(o);
  const o2 = { id: 'lamp2', x: 30, y: 0, w: 20, h: 20, hidden: false, appearDelay: 0 };
  s.addObject(o2);
  const cleanup = Plugins.call('lampDelay', s, {});
  assert.equal(typeof cleanup, 'function', '应该返回清理函数');
  assert.ok(o.hidden, 'appearDelay>0 开局隐藏');
  assert.ok(!s.objects.includes(o), '隐藏后不在活动物体');
  assert.ok(s.hidden.includes(o), '在 hidden 列表');
  assert.ok(s.byId['lamp1'] === o, 'byId 保留（reveal 依赖）');
  assert.ok(!o2.hidden && s.objects.includes(o2), 'appearDelay=0 不受影响');
  stepN(s, 40); // ~1.3s
  assert.ok(!o.hidden && s.objects.includes(o), '到点出现');
  assert.ok(s.byId['lamp1'] === o, 'reveal 后 byId 一致');
  cleanup();
});

test('官方插件 keys(定制版)：键盘回调 + 提示往返（零配置）', () => {
  loadFilePlugin('keys.js');
  const s = makeScene();
  Plugins.call('keys', s, {});
  assert.equal(s.tip, '按 E 键试试');
  let pd = false;
  s._fireKey('down', { code: 'KeyE', preventDefault: () => { pd = true; }, cancelable: true });
  assert.equal(s.tip, '你按下了 E！');
  assert.ok(pd, '已处理应 preventDefault');
  s._fireKey('down', { code: 'KeyX', preventDefault: () => {}, cancelable: true });
  assert.equal(s.tip, '你按下了 E！', '其它键不响应');
  stepN(s, 70); // 2.3s 后提示恢复
  assert.equal(s.tip, '按 E 键试试');
});

test('官方插件 trail：玩家移动留轨迹光点，静止后熄灭', () => {
  loadFilePlugin('trail.js');
  const s = makeScene();
  const p = { id: 'player1', x: 0, y: 100, w: 40, h: 40 };
  s.player = p;
  Plugins.call('trail', s, {});
  for (let i = 0; i < 40; i++) { p.x += 20; s.step(TICK); } // 移动 800px
  assert.ok(sparkCount(s) >= 1, '移动应生成轨迹光点: ' + sparkCount(s));
  for (let i = 0; i < 60; i++) s.step(TICK); // 静止 2s
  assert.equal(sparkCount(s), 0, '光点应全部熄灭');
});

test('官方插件 trampoline(组件)：玩家落垫被弹起 + origin', () => {
  loadFilePlugin('trampoline.js');
  const comps = Plugins.components().filter((c) => c.type === 'trampoline');
  assert.equal(comps.length, 1);
  assert.equal(comps[0].label, '蹦床');
  const t = Plugins.create('trampoline', { x: 200, y: 340, w: 80, h: 20, bounce: 1.7 });
  assert.equal(t.typeName, 'Trampoline');
  assert.equal(t.physicsKind, 'static');
  assert.equal(t.solid, true);
  assert.equal(t.origin.kind, 'plugin');
  const s = new Scene({ worldW: 600, worldH: 500 });
  s.status = 'running';
  s.addObject(new Floor({ x: -60, y: 420, w: 800, h: 40 }));
  s.addObject(t);
  const p = new Player({ x: 220, y: 200, substance: 'NaOH', mass: 30 });
  s.addObject(p);
  s.player = p;
  // ① 高处坠落 → 大弹（弹速 = 1.7 × 跳跃初速）
  let bounced = false;
  for (let i = 0; i < 90; i++) {
    s.step(TICK);
    if (p.vel.y < -300) bounced = true;
  }
  assert.ok(bounced, '坠落踩垫应被弹起');
  // ② 站上垫子（慢速/静止）→ 不弹
  let quiet = true;
  for (let i = 0; i < 60; i++) {
    s.step(TICK);
    if (p.vel.y < -80) quiet = false;
  }
  assert.ok(quiet, '停在垫上不应被弹');
  // ③ 在垫上按跳 → 蹦床弹跳（高于普通跳）
  let jumpBounce = 0;
  let peak = Infinity;
  for (let i = 0; i < 40; i++) {
    s.control.add('jump');
    s.step(TICK);
    s.control.delete('jump');
    jumpBounce = Math.max(jumpBounce, -p.vel.y);
    peak = Math.min(peak, p.y);
  }
  assert.ok(jumpBounce > CFG.player.jumpVel * 1.2, `垫上跳跃应为蹦床弹速：${jumpBounce.toFixed(0)}`);
  assert.ok(peak < 340 - 300, `弹得应比普通跳高：peak=${peak.toFixed(0)}`);
});

test('官方插件 liveSign（组件）：create 出真实对象 + origin', () => {
  loadFilePlugin('liveSign.js');
  const comps = Plugins.components().filter((c) => c.type === 'liveSign');
  assert.equal(comps.length, 1);
  assert.equal(comps[0].label, '显示牌');
  const o = Plugins.create('liveSign', { x: 10, y: 20, w: 140, h: 40, text: '你好', id: 's1' });
  assert.equal(o.typeName, 'LiveSign');
  assert.equal(o.text, '你好');
  assert.equal(o.id, 's1');
  assert.equal(o.physicsKind, 'none');
  assert.equal(o.origin.kind, 'plugin');
  // 不挡人（solid=false）
  assert.equal(o.solid, false);
});
