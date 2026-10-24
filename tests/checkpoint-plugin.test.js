// 存档点插件（plugin/checkpoint.js）：位置/进入场景触发 + 旧配置兼容 + 读档防重复
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Plugins } from '../src/level/plugins.js';
import { Scene } from '../src/core/scene.js';
import { Savepoint } from '../src/core/savepoint.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';

const pluginSrc = readFileSync('plugin/checkpoint.js', 'utf8');

// 假 Chezzle：只给插件用到的 Plugin 注册表 + Savepoint 桩（Node 里不构建 dist）
function makeEnv() {
  const registry = new Map();
  const calls = [];
  const Savepoint = {
    calls,
    restoring: false,
    restoredRecentlyFlag: false,
    save(scene, opts = {}) {
      if (scene.status !== 'running' || this.restoring) return false;
      calls.push({ scene, opts });
      return true;
    },
    isRestoring() { return this.restoring; },
    restoredRecently() { return this.restoredRecentlyFlag; },
  };
  const Chezzle = {
    Plugin: {
      register(name, def) { registry.set(name, def); return def; },
      get(name) { return registry.get(name); },
    },
    Savepoint,
  };
  new Function('Chezzle', pluginSrc)(Chezzle);
  return { def: registry.get('checkpoint'), Savepoint, calls };
}

function makePlayer(cx, cy) { return { x: cx - 20, y: cy - 20, w: 40, h: 40 }; }
function moveTo(player, cx, cy) { player.x = cx - 20; player.y = cy - 20; }

function makeScene(opts = {}) {
  return {
    player: opts.player !== undefined ? opts.player : makePlayer(100, 100),
    status: opts.status ?? 'running',
    multiscene: opts.multiscene ?? null,
    time: 0,
    _events: {},
    on(name, fn) { (this._events[name] ??= []).push(fn); return this; },
    fire(name, payload) { for (const fn of [...(this._events[name] ?? [])]) fn(payload); },
  };
}

/** 最小 Scene 运行时钩子：收集 onTick/after 回调，tick() 手动推进（after 在帧末执行） */
function makeApi() {
  const ticks = [];
  let afters = [];
  const api = {
    ticks,
    inTick: false,
    onTick(fn) {
      ticks.push(fn);
      return () => { const i = ticks.indexOf(fn); if (i >= 0) ticks.splice(i, 1); };
    },
    after(fn) {
      afters.push(fn);
      return () => { const i = afters.indexOf(fn); if (i >= 0) afters.splice(i, 1); };
    },
    tick(n = 1) {
      for (let k = 0; k < n; k++) {
        api.inTick = true;
        for (const fn of [...ticks]) fn(1 / 30, 0);
        api.inTick = false;
        const run = afters;
        afters = [];
        for (const fn of run) fn();
      }
    },
  };
  return api;
}

/** 最小多场景管理器（插件只读 scenes: Map<name, {scene}>） */
function makeMultiscene(entries) {
  return { scenes: new Map(entries) };
}

// ---------------------------------------------------------------------------
// 元数据（编辑器靠它展示插件；必须是合法 JSON）
// ---------------------------------------------------------------------------
test('元数据：合法 JSON、api=1，描述新配置 points/enterScenes', () => {
  const meta = Plugins.parseMeta(pluginSrc);
  assert.ok(meta, '应能解析 @@chezzle-plugin 元数据块');
  assert.equal(meta.name, '存档点');
  assert.equal(meta.api, 1);
  assert.ok(meta.description.includes('points'), '描述里写新配置 points');
  assert.ok(Array.isArray(meta.fields) && meta.fields.some((f) => f.key === 'points'));
});

// ---------------------------------------------------------------------------
// ① 旧 spawns 配置（tutorial 页现有格式）：进入区域存档；停留不重复
// ---------------------------------------------------------------------------
test('旧 spawns：进入区域调用 Savepoint.save（id 正确），停留不重复，离开再进再存', () => {
  const { def, calls } = makeEnv();
  const scene = makeScene();
  const api = makeApi();
  const cleanup = def.run(scene, api, {
    spawns: [{ id: 'c1', x: 0, y: 0, w: 300, h: 300, sx: 140, sy: 700 }],
    texts: ['复活！化学家从不回头看爆炸'],
  });
  assert.equal(typeof cleanup, 'function', 'run 应返回清理函数');

  moveTo(scene.player, 400, 400); // 初始在区域外
  api.tick(3);
  assert.equal(calls.length, 0, '区域外不触发');

  moveTo(scene.player, 100, 100); // 进入区域
  api.tick(3);
  assert.equal(calls.length, 1, '进入区域存一次');
  assert.equal(calls[0].scene, scene);
  assert.equal(calls[0].opts.id, 'c1', '存档 id 来自 spawns.id');
  assert.equal('sx' in calls[0].opts || 'sy' in calls[0].opts, false, 'sx/sy 不再传给存档');

  api.tick(20);
  assert.equal(calls.length, 1, '同区域连续停留不重复存');

  moveTo(scene.player, 400, 400); // 离开
  api.tick(2);
  moveTo(scene.player, 100, 100); // 再进入
  api.tick(2);
  assert.equal(calls.length, 2, '离开后重新进入再存一次');
  cleanup();
});

test('pos 存档推迟到 after 阶段执行（不在 onTick 回调里同步存档）', () => {
  // 引擎在 onTick 回调里正在重建"本帧剩余"的 _tickFns；此刻同步存档会把残缺的
  // 钩子表存进快照，读档后插件 onTick 丢失（真实引擎回归见文件末尾联调测试）。
  const { def, calls, Savepoint } = makeEnv();
  const scene = makeScene();
  const api = makeApi();
  const rawSave = Savepoint.save.bind(Savepoint);
  let savedInTick = null;
  Savepoint.save = (s, opts) => { savedInTick = api.inTick; return rawSave(s, opts); };
  const cleanup = def.run(scene, api, { points: [{ id: 'p1', x: 0, y: 0, w: 300, h: 300 }] });
  api.tick(2);
  assert.equal(calls.length, 1, '进入区域后完成存档');
  assert.equal(savedInTick, false, '存档不在 onTick 回调里同步执行');
  cleanup();
});

// ---------------------------------------------------------------------------
// ② 不满足条件不存档：区域外 / 死亡 / 隐藏 / 无玩家
// ---------------------------------------------------------------------------
test('pos 点：区域外、死亡状态、隐藏/无玩家都不存档，恢复 running 后照常', () => {
  const { def, calls } = makeEnv();
  const scene = makeScene();
  const api = makeApi();
  const cleanup = def.run(scene, api, { points: [{ id: 'p1', x: 0, y: 0, w: 300, h: 300 }] });

  moveTo(scene.player, 500, 500);
  api.tick(2);
  assert.equal(calls.length, 0, '区域外不存');

  scene.status = 'died';
  moveTo(scene.player, 100, 100);
  api.tick(2);
  assert.equal(calls.length, 0, '死亡状态不存');

  scene.status = 'running';
  moveTo(scene.player, 500, 500);
  api.tick(1);
  moveTo(scene.player, 100, 100);
  api.tick(1);
  assert.equal(calls.length, 1, 'running 时进入区域存');

  moveTo(scene.player, 500, 500);
  api.tick(1);
  scene.player.hidden = true;
  moveTo(scene.player, 100, 100);
  api.tick(2);
  assert.equal(calls.length, 1, '隐藏玩家不触发');
  scene.player.hidden = false;
  api.tick(2);
  assert.equal(calls.length, 2, '显形后进入区域存');

  moveTo(scene.player, 500, 500);
  api.tick(1);
  scene.player = null;
  api.tick(2);
  assert.equal(calls.length, 2, '没有玩家不触发');
  cleanup();
});

// ---------------------------------------------------------------------------
// ③ 新配置 points + enterScenes / on:'enter'：多场景按场景名过滤
// ---------------------------------------------------------------------------
test('多场景：pos 点按场景名过滤；enterScenes / on:enter 在进入场景时存档', () => {
  const { def, calls } = makeEnv();
  const sceneA = makeScene();
  const sceneB = makeScene();
  const M = makeMultiscene([['a', { scene: sceneA }], ['b', { scene: sceneB }]]);
  sceneA.multiscene = M;
  sceneB.multiscene = M;
  const apiA = makeApi();
  const apiB = makeApi();
  const cfg = {
    points: [
      { scene: 'a', id: 'a_pos', x: 0, y: 0, w: 300, h: 300 },
      { scene: 'b', id: 'b_pos', x: 0, y: 0, w: 300, h: 300 },
      { on: 'enter', scene: 'a', id: 'a_enter' },
    ],
    enterScenes: ['b'],
  };
  const cleanA = def.run(sceneA, apiA, cfg);
  const cleanB = def.run(sceneB, apiB, cfg);

  // A 场景：B 的 pos 点不生效
  moveTo(sceneA.player, 500, 500);
  apiA.tick(2);
  assert.equal(calls.length, 0, 'A 不触发 B 的 pos 点');
  sceneA.fire('enter', { from: 'b' });
  assert.equal(calls.length, 1, 'on:enter 点匹配本场景 → 存档');
  assert.equal(calls[calls.length - 1].opts.id, 'a_enter');
  moveTo(sceneA.player, 100, 100);
  apiA.tick(2);
  assert.equal(calls.length, 2, 'A 的 pos 点触发');
  assert.equal(calls[calls.length - 1].opts.id, 'a_pos');

  // B 场景：enterScenes 生成的 enter 点（无 id）+ B 的 pos 点
  sceneB.fire('enter', { from: 'a' });
  assert.equal(calls.length, 3, 'enterScenes 生成的 enter 点存档');
  assert.equal(calls[calls.length - 1].opts.id, undefined, 'enterScenes 无 id');
  moveTo(sceneB.player, 100, 100);
  apiB.tick(2);
  assert.equal(calls.length, 4, 'B 的 pos 点触发');
  assert.equal(calls[calls.length - 1].opts.id, 'b_pos');
  cleanA();
  cleanB();
});

test('多场景：切回本场景时按落点重新判定区域（不因旧 inside 状态漏存）', () => {
  const { def, calls } = makeEnv();
  const scene = makeScene();
  const M = makeMultiscene([['a', { scene }]]);
  scene.multiscene = M;
  const api = makeApi();
  const cleanup = def.run(scene, api, { points: [{ id: 'a_pos', x: 0, y: 0, w: 300, h: 300 }] });
  api.tick(2);
  assert.equal(calls.length, 1, '首次进入区域存档');
  // 切出去再切回来：引擎在目标场景 fire('enter')；同一次进入里补跑一帧
  scene.fire('enter', { from: 'b' });
  assert.equal(calls.length, 1, 'enter 事件本身不存档（没有 enter 点）');
  api.tick(2);
  assert.equal(calls.length, 2, '切回后落在区域内 = 重新进入区域 → 再存一次');
  cleanup();
});

test('单场景：enter 点不生效（没有 enter 事件，也不匹配场景名）', () => {
  const { def, calls } = makeEnv();
  const scene = makeScene(); // multiscene=null
  const api = makeApi();
  const cleanup = def.run(scene, api, { points: [{ on: 'enter', scene: 'well', id: 'w1' }] });
  scene.fire('enter', { from: null });
  api.tick(2);
  assert.equal(calls.length, 0, '单场景 enter 点不生效');
  cleanup();
});

test('同场景配置多个 enter 点：每次进入各存一次（引擎侧按时间防抖）', () => {
  const { def, calls } = makeEnv();
  const scene = makeScene();
  const M = makeMultiscene([['well', { scene }]]);
  scene.multiscene = M;
  const api = makeApi();
  const cleanup = def.run(scene, api, {
    points: [
      { on: 'enter', scene: 'well', id: 'e1' },
      { on: 'enter', scene: 'well', id: 'e2' },
    ],
  });
  scene.fire('enter', { from: 'plain' });
  assert.equal(calls.length, 2, '每个 enter 点各调用一次存档');
  assert.deepEqual(calls.map((c) => c.opts.id), ['e1', 'e2']);
  scene.fire('enter', { from: 'plain' });
  assert.equal(calls.length, 4, '再次进入场景再存');
  cleanup();
});

// ---------------------------------------------------------------------------
// ④ 读档后不立刻重复存档
// ---------------------------------------------------------------------------
test('读档事件：把所在区域重置为玩家位置（落回存档点不再存一次）', () => {
  const { def, calls } = makeEnv();
  const scene = makeScene();
  const api = makeApi();
  const cleanup = def.run(scene, api, { points: [{ id: 'p1', x: 0, y: 0, w: 300, h: 300 }] });
  api.tick(1);
  assert.equal(calls.length, 1, '进入区域存一次');
  moveTo(scene.player, 500, 500);
  api.tick(1); // 离开区域 → inside 清空
  // 模拟读档：玩家被放回存档位置（区域内），引擎随后 fire checkpointRestored
  moveTo(scene.player, 100, 100);
  scene.fire('checkpointRestored', { id: 'p1' });
  api.tick(5);
  assert.equal(calls.length, 1, '读档落点仍在区域内 → 不重复存档');
  cleanup();
});

test('restoredRecently / isRestoring 窗口内不存新档，窗口结束后恢复', () => {
  const { def, calls, Savepoint } = makeEnv();
  const scene = makeScene();
  const api = makeApi();
  const cleanup = def.run(scene, api, { points: [{ id: 'p1', x: 0, y: 0, w: 300, h: 300 }] });

  moveTo(scene.player, 500, 500);
  api.tick(2);
  assert.equal(calls.length, 0, '区域外不存');

  Savepoint.restoredRecentlyFlag = true; // 刚读过档
  moveTo(scene.player, 100, 100);
  api.tick(3);
  assert.equal(calls.length, 0, 'restoredRecently 窗口内进入区域不存');
  Savepoint.restoredRecentlyFlag = false;

  moveTo(scene.player, 500, 500);
  api.tick(1);
  moveTo(scene.player, 100, 100);
  api.tick(1);
  assert.equal(calls.length, 1, '窗口结束后正常存档');

  // isRestoring（读档执行中）同样不存
  moveTo(scene.player, 500, 500);
  api.tick(1);
  Savepoint.restoring = true;
  moveTo(scene.player, 100, 100);
  api.tick(2);
  assert.equal(calls.length, 1, 'isRestoring 期间不存');
  Savepoint.restoring = false;
  moveTo(scene.player, 500, 500);
  api.tick(1);
  moveTo(scene.player, 100, 100);
  api.tick(1);
  assert.equal(calls.length, 2, '读档结束后恢复存档');
  cleanup();
});

// ---------------------------------------------------------------------------
// ⑤ 清理函数
// ---------------------------------------------------------------------------
test('清理函数：取消 onTick 与场景事件订阅', () => {
  const { def, calls } = makeEnv();
  const scene = makeScene();
  const M = makeMultiscene([['a', { scene }]]);
  scene.multiscene = M;
  const api = makeApi();
  const cleanup = def.run(scene, api, {
    points: [{ id: 'p1', x: 0, y: 0, w: 300, h: 300 }],
    enterScenes: ['a'],
  });
  cleanup();
  moveTo(scene.player, 500, 500);
  api.tick(1);
  moveTo(scene.player, 100, 100);
  api.tick(3);
  scene.fire('enter', { from: 'b' });
  scene.fire('checkpointRestored', { id: 'p1' });
  assert.equal(calls.length, 0, '清理后 onTick / enter 都不再触发');
  assert.equal(api.ticks.length, 0, 'onTick 已取消');
  assert.equal((scene._events.enter ?? []).length, 0, 'enter 订阅已移除');
  assert.equal((scene._events.checkpointRestored ?? []).length, 0, 'checkpointRestored 订阅已移除');
});

// ---------------------------------------------------------------------------
// 真实引擎联调：存档 → 读档后插件 onTick 仍在（真实 Scene + Savepoint）
// ---------------------------------------------------------------------------
test('真实引擎：存档 → 读档后插件继续工作（下一处存档点照常保存）', () => {
  const realNow = performance.now;
  let now = 100000;
  performance.now = () => now; // 假墙钟：控制 200ms 存档节流 / 1200ms 读档窗口
  try {
    new Function('Chezzle', pluginSrc)({ Plugin: Plugins, Savepoint });
    const TICK = 1 / 30;
    const s = new Scene({ worldW: 600, worldH: 400 });
    s.status = 'running';
    s.addObject(new Floor({ x: 0, y: 300, w: 600, h: 100, id: 'floor' }));
    const p = new Player({ x: 80, y: 240, substance: 'NaOH', mass: 30, id: 'player1' });
    s.addObject(p);
    Savepoint.clear();
    const cleanup = Plugins.call('checkpoint', s, {
      points: [{ id: 'p1', x: 0, y: 0, w: 300, h: 300 }],
    });
    const moveTo = (x) => { p.x = x; if (p.vel) p.vel.x = 0; };
    for (let i = 0; i < 2; i++) s.step(TICK);
    assert.equal(Savepoint.has(s), true, '进入区域后自动存档');
    assert.equal(Savepoint.info().id, 'p1');
    const firstAt = Savepoint.info().at;

    // 离开区域 300ms 后再进入：重新存档（越过引擎 200ms 节流）
    moveTo(400);
    for (let i = 0; i < 2; i++) s.step(TICK);
    now += 300;
    moveTo(80);
    for (let i = 0; i < 2; i++) s.step(TICK);
    assert.ok(Savepoint.info().at > firstAt, '离开再进入会重新存档');

    // 读档：玩家回到存档点
    assert.equal(Savepoint.restore(s), true, '读档成功');
    assert.equal(p.x, 80, '读档恢复玩家位置');
    now += 1400; // 越过 restoredRecently 窗口

    // 关键：读档后插件的 onTick 必须还活着 → 离开再进入仍能存新档
    moveTo(400);
    for (let i = 0; i < 2; i++) s.step(TICK);
    moveTo(80);
    for (let i = 0; i < 2; i++) s.step(TICK);
    assert.ok(Savepoint.info().at > firstAt + 1000, '读档后插件继续存档（onTick 未丢失）');
    assert.equal(Savepoint.has(s), true);
    cleanup();
    Savepoint.clear();
  } finally {
    performance.now = realNow;
  }
});

// ---------------------------------------------------------------------------
// 编辑器面板：旧 spawns 迁移 + points/enterScenes 保存
// ---------------------------------------------------------------------------
function makeEditor(state) {
  const els = new Map();
  const panel = {
    querySelector(sel) {
      if (!els.has(sel)) els.set(sel, { value: '', onclick: null });
      return els.get(sel);
    },
  };
  const hooks = [];
  let cfgFn = null;
  const ed = {
    state,
    addPanel: () => panel,
    onStateLoaded: (fn) => hooks.push(fn),
    pluginCfg: (fn) => { cfgFn = fn; },
    save() {},
    $: () => null,
    panel,
    hooks,
    cfg: () => cfgFn(),
  };
  return ed;
}

test('编辑器：旧 spawns/texts 自动迁移成 points，pluginCfg 注入新配置', () => {
  const { def } = makeEnv();
  const st = {
    spawns: [
      { scene: 'plain', id: 'c1', x: 0, y: 0, w: 700, h: 800, sx: 140, sy: 700 },
      { scene: 'canyon', id: 'c2', x: -60, y: 0, w: 900, h: 1000, sx: 120, sy: 900 },
    ],
    texts: ['复活！从检查点继续'],
  };
  const ed = makeEditor(st);
  def.editor(ed);
  assert.equal(st.spawns, undefined, '旧 spawns 迁移后删除');
  assert.equal(st.texts, undefined, '旧 texts 删除（不再使用）');
  assert.deepEqual(st.points, [
    { on: 'pos', x: 0, y: 0, w: 700, h: 800, scene: 'plain', id: 'c1' },
    { on: 'pos', x: -60, y: 0, w: 900, h: 1000, scene: 'canyon', id: 'c2' },
  ]);
  assert.deepEqual(ed.cfg(), { points: st.points, enterScenes: [] }, 'pluginCfg 注入 points/enterScenes');

  // 面板改 points / enterScenes 后保存
  ed.panel.querySelector('#ckPoints').value = JSON.stringify([
    { id: 'x', x: 0, y: 0, w: 100, h: 100 },
    { on: 'enter', scene: 'well' },
  ]);
  ed.panel.querySelector('#ckEnter').value = 'well, temple，basin';
  ed.panel.querySelector('#ckSave').onclick();
  assert.equal(st.points.length, 2);
  assert.deepEqual(st.enterScenes, ['well', 'temple', 'basin']);
  assert.equal(ed.cfg().enterScenes.length, 3);
});

test('编辑器：存档载入后的旧 spawns 也会补迁移（替换上一关残留的 points）', () => {
  const { def } = makeEnv();
  // 旧格式关卡 JSON 没有 points 字段：上一个关卡的 points 会留在 state 里，迁移必须替换
  const st = { points: [{ id: 'stale', x: 0, y: 0, w: 50, h: 50 }] };
  const ed = makeEditor(st);
  def.editor(ed);
  st.spawns = [{ id: 'old', x: 0, y: 0, w: 100, h: 100, sx: 10, sy: 20 }];
  for (const fn of ed.hooks) fn();
  assert.equal(st.spawns, undefined);
  assert.equal(st.points.length, 1, '旧 spawns 替换（不追加残留点）');
  assert.equal(st.points[0].id, 'old');
  assert.ok(ed.panel.querySelector('#ckPoints').value.includes('"old"'), '面板重渲染显示迁移后的点');
});
