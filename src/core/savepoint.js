// ============================================================================
// 存档点 / 读档（Savepoint）
// ----------------------------------------------------------------------------
// 目标：死亡后不是整局重开，而是回到最近一次"存档点"；重开按钮双击时可以让玩家
// 选择「回到存档点」或「整局重开」。
//
// 快照方案（关键设计）：**内存内快照 + 原地恢复**，不做页面刷新、不做序列化。
//   · 存档时记录：场景的各类对象索引数组（引用）、每个对象的"数据字段"深拷贝、
//     玩家物品栏（含烧杯/滴管/集气瓶内容）、大气、场景的计时/提示/运行钩子状态、
//     多场景（Multiscene）的全部场景状态与当前场景；
//   · 读档时把同一批对象引用重新挂回场景，并把数据状态写回去 —— 对象身份不变，
//     所以关卡脚本/插件里保存的对象引用、事件回调、渲染器/相机都不用重建；
//   · 快照只在本页内存里（整局重开会刷新页面，快照自然清空），不写 localStorage。
//
// 对象状态捕获规则：只拷贝"纯数据"（数字/字符串/布尔/数组/Map/Set/纯对象），
// 材质网格（MaterialGrid）、溶液（Solution）、物品栏（Inventory）用专用编解码；
// 引擎适配器（mat/material）、DOM/渲染器引用、函数一律跳过（保持原引用）。
// ============================================================================

import { MaterialGrid } from '../render/gridrender.js';
import { Solution } from '../chem/solution.js';
import { ContactTracker } from '../physics/collision.js';
import { bindKeyboard } from './input.js';
import { sfx } from './audio.js';

const SKIP_KEYS = new Set([
  'scene', 'multiscene', 'camera', 'renderer', 'hud', 'game',
  'mat', 'material', 'subBodies', 'handlers', '_handlers', '_events',
  '_touchUI', '_menuKeyUnsub', '_layer',
  '_geom', // 导气管装置几何缓存：每帧由 _layout 重算，快照里含对象引用（半物化残体）
]);

const MARK = '__czSave';
const MAX_DEPTH = 8;

/** 当前快照：{ owner, id, at, data }；owner = Scene 或 Multiscene */
let current = null;
let restoring = false;
let lastRestoreAt = 0;

function nowMs() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  } catch (e) { /* 忽略 */ }
  return Date.now();
}

function ownerOf(scene) {
  return (scene && scene.multiscene) || scene || null;
}

// ---------------------------------------------------------------------------
// 数据捕获：纯数据深拷贝（无法安全拷贝的值返回 SKIP）
// ---------------------------------------------------------------------------
const SKIP = Symbol('skip');

function isPlainObject(v) {
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function captureGrid(grid) {
  return {
    rows: grid.rows, cols: grid.cols,
    cells: grid.cells.map((row) => row.map((cell) => (cell ? [...cell.entries()] : null))),
  };
}

function applyGrid(grid, snap) {
  if (!grid || !snap) return;
  grid.rows = snap.rows;
  grid.cols = snap.cols;
  grid.cells = snap.cells.map((row) => row.map((cell) => (cell ? new Map(cell.map(([id, m]) => [id, m])) : null)));
  // 派生缓存全部失效（避免读到旧网格的 AABB/总量/暴露面缓存）
  grid._dirty = false;
  grid._lastConsume = [];
  grid._prevTargets = [];
  grid._addAccum = 0;
  grid._batchUsed = false;
  grid._aabb = null;
  grid._aabbVer = -1;
  grid._exposedMemo = new Map();
  if (typeof grid._invalidateTotals === 'function') grid._invalidateTotals();
  else { grid._totals = {}; grid._totalsValid = false; }
}

function captureSolution(sol) {
  return { volume: sol.volume, water: sol.water, solutes: [...sol.solutes.entries()] };
}

function applySolution(sol, snap) {
  if (!sol || !snap) return;
  sol.volume = snap.volume;
  sol.water = snap.water;
  sol.solutes = new Map(snap.solutes.map(([id, m]) => [id, m]));
}

function captureInventory(inv) {
  return {
    capacity: inv.capacity,
    selected: inv.selected,
    slots: inv.slots.map((s) => {
      if (!s) return null;
      if (s.obj) return { item: s.item, obj: s.obj, state: captureObjectState(s.obj) };
      return { substance: s.substance, mass: s.mass };
    }),
  };
}

function applyInventory(inv, snap) {
  if (!inv || !snap) return;
  inv.capacity = snap.capacity;
  inv.selected = snap.selected;
  inv.slots = snap.slots.map((s) => {
    if (!s) return null;
    if (s.obj) return { item: s.item, obj: s.obj };
    return { substance: s.substance, mass: s.mass };
  });
  for (const s of snap.slots) if (s && s.obj) applyObjectState(s.obj, s.state);
}

/** 纯数据深拷贝（含 Map/Set/数组/纯对象）；遇到类实例/函数引用 → SKIP */
function cloneData(v, depth, seen) {
  if (v === null || v === undefined) return v === undefined ? SKIP : null;
  const t = typeof v;
  if (t === 'number' || t === 'string' || t === 'boolean') return v;
  if (t === 'function' || t === 'symbol' || t === 'bigint') return SKIP;
  if (depth > MAX_DEPTH) return SKIP;
  if (v instanceof MaterialGrid) return { [MARK]: 'grid', data: captureGrid(v) };
  if (v instanceof Solution) return { [MARK]: 'solution', data: captureSolution(v) };
  if (v.constructor && v.constructor.name === 'Inventory' && Array.isArray(v.slots)) {
    return { [MARK]: 'inventory', data: captureInventory(v) };
  }
  if (seen.has(v)) return SKIP; // 循环引用：跳过（保持原引用）
  seen.add(v);
  try {
    if (Array.isArray(v)) {
      const out = [];
      for (const x of v) {
        const c = cloneData(x, depth + 1, seen);
        if (c === SKIP) return SKIP; // 数组里含引用/类实例：整段跳过（subBodies 等）
        out.push(c);
      }
      return out;
    }
    if (v instanceof Map) {
      const out = [];
      for (const [k, val] of v) {
        const ck = cloneData(k, depth + 1, seen);
        const cv = cloneData(val, depth + 1, seen);
        if (ck === SKIP || cv === SKIP) return SKIP;
        out.push([ck, cv]);
      }
      return { [MARK]: 'map', data: out };
    }
    if (v instanceof Set) {
      const out = [];
      for (const x of v) {
        const c = cloneData(x, depth + 1, seen);
        if (c === SKIP) return SKIP;
        out.push(c);
      }
      return { [MARK]: 'set', data: out };
    }
    if (typeof v === 'object' && isPlainObject(v)) {
      const out = {};
      let kept = 0;
      for (const k of Object.keys(v)) {
        const c = cloneData(v[k], depth + 1, seen);
        if (c !== SKIP) { out[k] = c; kept++; }
      }
      // 有键但全被跳过（函数/引用对象）→ 整段跳过，绝不清空原对象
      if (Object.keys(v).length > 0 && kept === 0) return SKIP;
      return out;
    }
    return SKIP; // 其它类实例（引擎适配器/对象引用…）：保持原引用
  } finally {
    seen.delete(v);
  }
}

/** 把捕获的数据还原成新对象（每次读档都重新生成，保证快照本身不被修改） */
function materialize(v) {
  if (v === null || v === undefined) return v;
  const t = typeof v;
  if (t === 'number' || t === 'string' || t === 'boolean') return v;
  if (Array.isArray(v)) return v.map(materialize);
  if (v && typeof v === 'object' && v[MARK] === 'map') {
    return new Map(v.data.map(([k, val]) => [materialize(k), materialize(val)]));
  }
  if (v && typeof v === 'object' && v[MARK] === 'set') return new Set(v.data.map(materialize));
  if (v && typeof v === 'object' && isPlainObject(v)) {
    const out = {};
    for (const k of Object.keys(v)) out[k] = materialize(v[k]);
    return out;
  }
  return v;
}

/** materialize 的空值兜底：SKIP（无法安全拷贝）时用 fallback */
function mat(v, fallback) {
  return v === SKIP ? fallback : materialize(v);
}

/** 捕获单个物体的数据状态（引用/函数类字段跳过） */
function captureObjectState(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = obj[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'function') continue;
    if (typeof v === 'object') {
      if (v === obj) continue; // 自引用
      if (v.obj === obj || v.owner === obj) continue; // 引擎适配器
      if (v instanceof MaterialGrid || v instanceof Solution) {
        out[k] = cloneData(v, 0, new Set());
        continue;
      }
      if (v.constructor && v.constructor.name === 'Inventory' && Array.isArray(v.slots)) {
        out[k] = cloneData(v, 0, new Set());
        continue;
      }
    }
    const c = cloneData(v, 0, new Set());
    if (c !== SKIP) out[k] = c;
  }
  return out;
}

function applyObjectState(obj, state) {
  if (!obj || !state) return;
  for (const k of Object.keys(state)) {
    const v = state[k];
    if (v && typeof v === 'object' && v[MARK] === 'grid') { applyGrid(obj[k], v.data); continue; }
    if (v && typeof v === 'object' && v[MARK] === 'solution') { applySolution(obj[k], v.data); continue; }
    if (v && typeof v === 'object' && v[MARK] === 'inventory') { applyInventory(obj[k], v.data); continue; }
    obj[k] = materialize(v);
  }
}

// ---------------------------------------------------------------------------
// 场景快照
// ---------------------------------------------------------------------------
const ARRAY_KEYS = ['objects', 'dynamics', 'statics', 'containers', 'lamps', 'gasTubes', 'gasChambers', 'doors', 'portals', 'particles', 'hidden'];

function captureScene(scene) {
  const owners = new Set([...scene.objects, ...scene.hidden]);
  // 物品栏里的物品可能不在场景中（被玩家拿着）：也要先捕获状态（applyInventory 会再写一次）
  if (scene.player && scene.player.inventory) {
    for (const s of scene.player.inventory.slots) if (s && s.obj) owners.add(s.obj);
  }
  const states = [];
  for (const o of owners) states.push([o, captureObjectState(o)]);
  const arrays = {};
  for (const k of ARRAY_KEYS) arrays[k] = scene[k].slice();
  arrays.byId = Object.assign({}, scene.byId);
  return {
    arrays,
    player: scene.player,
    states,
    atmosphere: {
      gas: [...scene.atmosphere.gas.entries()],
      _baseTotal: scene.atmosphere._baseTotal,
    },
    // 气室内部大气（与外部独立）：每个气室分别快照，读档时逐气室还原
    chambers: (scene.gasChambers ?? []).map((c) => ({
      obj: c, // 保持对象引用（原位恢复对象身份不变）
      gas: [...c.atmosphere.gas.entries()],
      _baseTotal: c.atmosphere._baseTotal,
      reactGas: cloneData(c._reactGas, 0, new Set()),
    })),
    fields: {
      time: scene.time,
      dt: scene.dt,
      tip: scene.tip,
      tipSeq: scene.tipSeq,
      banner: cloneData(scene.banner, 0, new Set()),
      deathQuip: scene.deathQuip,
      _reactGas: cloneData(scene._reactGas, 0, new Set()),
      _rxLogT: cloneData(scene._rxLogT, 0, new Set()),
      _lastLabelT: cloneData(scene._lastLabelT, 0, new Set()),
      _plumeSeq: scene._plumeSeq,
      _tubeBusy: scene._tubeBusy,
      _explosionSeq: scene._explosionSeq,
      _lastExplosion: cloneData(scene._lastExplosion, 0, new Set()),
      gasLog: cloneData(scene.gasLog, 0, new Set()),
      debugReactions: cloneData(scene.debugReactions, 0, new Set()),
      cameraFocus: cloneData(scene.cameraFocus, 0, new Set()),
      notice: cloneData(scene._notice, 0, new Set()),
      _sfxGasT: scene._sfxGasT,
      _sfxSparkT: scene._sfxSparkT,
      _rxSfxT: cloneData(scene._rxSfxT, 0, new Set()),
      _rxHurtT: scene._rxHurtT,
      timers: scene._timers.slice(),
      intervals: scene._intervals.slice(),
      tickFns: scene._tickFns.slice(),
      afterFns: scene._afterFns.slice(),
    },
  };
}

function applyScene(scene, snap) {
  // 1) 对象索引数组整体还原（引用同一批对象：身份不变）
  for (const k of ARRAY_KEYS) scene[k] = snap.arrays[k].slice();
  scene.byId = Object.assign({}, snap.arrays.byId);
  scene.player = snap.player || null;

  // 2) 每个物体的数据状态写回
  for (const [obj, state] of snap.states) {
    try { applyObjectState(obj, state); } catch (e) { /* 单个对象状态异常不拖垮读档 */ }
  }

  // 3) 大气
  scene.atmosphere.gas = new Map(snap.atmosphere.gas.map(([id, m]) => [id, m]));
  scene.atmosphere._baseTotal = snap.atmosphere._baseTotal;
  scene.atmosphere._cause = null;
  scene.atmosphere._log = [];

  // 3.1) 气室内部大气（内部独立：每个气室恢复自己的气体账本/反应产气）
  for (const s of snap.chambers ?? []) {
    const c = s.obj;
    if (!c || !c.atmosphere) continue;
    c.atmosphere.gas = new Map(s.gas.map(([id, m]) => [id, m]));
    c.atmosphere._baseTotal = s._baseTotal;
    c.atmosphere._cause = null;
    c.atmosphere._log = [];
    c._reactGas = mat(s.reactGas, {});
  }

  // 4) 场景运行状态
  const f = snap.fields;
  scene.time = f.time;
  scene.dt = f.dt;
  scene.status = 'running';
  scene.tip = f.tip;
  scene.tipSeq = f.tipSeq;
  scene.tipReady = null;   // 下一 tick 会按条件重算（避免引用旧 tips 对象）
  scene.tipActive = null;
  scene.banner = mat(f.banner, scene.banner);
  scene.deathCause = null;
  scene.deathQuip = null;
  scene._reactGas = mat(f._reactGas, {});
  scene._rxLogT = mat(f._rxLogT, {});
  scene._lastLabelT = mat(f._lastLabelT, {});
  scene._plumeSeq = f._plumeSeq ?? 0;
  scene._tubeBusy = false;
  scene._explosionSeq = f._explosionSeq ?? 0;
  scene._lastExplosion = mat(f._lastExplosion, null);
  scene.gasLog = mat(f.gasLog, null) || [];
  scene.debugReactions = mat(f.debugReactions, null);
  scene.cameraFocus = mat(f.cameraFocus, null);
  scene._notice = mat(f.notice, null);
  scene._sfxGasT = f._sfxGasT;
  scene._sfxSparkT = f._sfxSparkT;
  scene._rxSfxT = mat(f._rxSfxT, {});
  scene._rxHurtT = f._rxHurtT;
  if (scene.camera) {
    scene.camera._shake = 0;
    if (scene.camera.overview) {
      try { scene.camera.exitOverview(); } catch (e) { /* 忽略 */ }
    }
  }

  // 5) 运行时钩子（wait/interval/onTick）：恢复存档时刻的调度表
  scene._timers = f.timers.slice();
  scene._intervals = f.intervals.slice();
  scene._tickFns = f.tickFns.slice();
  scene._afterFns = f.afterFns.slice();

  // 6) 瞬时交互态清空（否则死亡那一下的拖拽/长按/按键会带进新生命）
  scene.control.clear();
  scene.pressed.clear();
  scene._pressCand = null;
  scene._pressTap = null;
  scene._pressTapT = 0;
  scene._pressHome = null;
  scene._drag = null;
  scene._holdSuck = null;
  scene._gasHold = null;
  scene._emitCtx = null;
  scene.mouse = null;
  scene.overview = false;
  scene.debugPaused = false;
  scene.debugStepOnce = false;
  scene._firedStatus = undefined;
  scene.contactPairs = [];
  scene.contacts = new ContactTracker();

  // 7) 网格形状按还原后的材料重算（碰撞箱/血量尺寸与存档一致）
  for (const obj of scene.objects) {
    if (typeof obj.syncGrid === 'function') {
      try { obj.syncGrid(); } catch (e) { /* 忽略单个对象 */ }
    }
  }
}

// ---------------------------------------------------------------------------
// 多场景快照
// ---------------------------------------------------------------------------
function cloneMultisceneHold(hold) {
  const out = {};
  if (!hold || typeof hold !== 'object') return out;
  for (const k of Object.keys(hold)) out[k] = hold[k]; // 跨场景共享状态：浅拷贝保留引用
  return out;
}

function captureMultiscene(M) {
  const scenes = [];
  for (const [name, e] of M.scenes) {
    if (!e.scene) continue;
    scenes.push([name, captureScene(e.scene)]);
  }
  return {
    scenes,
    current: M.current,
    switches: M.switches,
    hold: cloneMultisceneHold(M.hold),
  };
}

function applyMultiscene(M, snap) {
  for (const [name, s] of snap.scenes) {
    const e = M.scenes.get(name);
    if (!e || !e.scene) continue;
    applyScene(e.scene, s);
  }
  // 先解绑旧场景键盘，再按存档时场景重新绑定
  if (M._unbindKeys) { try { M._unbindKeys(); } catch (e) { /* 忽略 */ } M._unbindKeys = null; }
  M.current = snap.current;
  M.switches = snap.switches ?? 0;
  // hold：清空后写回（跨场景共享对象保持引用）
  if (M.hold && typeof M.hold === 'object') {
    for (const k of Object.keys(M.hold)) delete M.hold[k];
    Object.assign(M.hold, cloneMultisceneHold(snap.hold));
  }
  for (const [name, e] of M.scenes) {
    const on = name === snap.current;
    e.active = on;
    if (e.canvas && e.canvas.style) e.canvas.style.display = on ? 'block' : 'none';
  }
  const cur = M.scenes.get(snap.current);
  if (cur && cur.scene && typeof window !== 'undefined') M._unbindKeys = bindKeyboard(cur.scene);
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------
function activeSceneOf(scene) {
  if (!scene) return null;
  if (scene.multiscene) {
    const e = scene.multiscene.scenes.get(scene.multiscene.current);
    return e && e.scene ? e.scene : scene;
  }
  return scene;
}

/** 真正拍摄快照（Savepoint.save 的同步路径；钩子里调用会被延后到 postStep） */
function captureNow(scene, opts = {}) {
  if (!scene || restoring) return false;
  if (scene.status && scene.status !== 'running') return false; // 死亡/通关瞬间不存新档
  const owner = ownerOf(scene);
  if (!owner) return false;
  // 极短时间内的重复存档直接忽略（插件按"进入区域"触发，不会重复；这里兜底防连点）
  if (current && current.owner === owner && !opts.force && nowMs() - current.at < 200) return false;
  try {
    const data = scene.multiscene ? captureMultiscene(scene.multiscene) : captureScene(scene);
    current = { owner, id: opts.id ?? null, label: opts.label ?? null, at: nowMs(), data };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[Savepoint] 存档失败：', e);
    return false;
  }
  Savepoint.toast(activeSceneOf(scene), '已存档');
  sfx('checkpoint.save');
  return true;
}

export const Savepoint = {
  /** 当前页面是否有存档点（存档快照属于该场景/该多场景管理器） */
  has(scene) {
    if (!current) return false;
    return current.owner === ownerOf(scene);
  },

  /** 存档信息（调试/UI 用）：{ id, at, age } */
  info() {
    if (!current) return null;
    return { id: current.id, at: current.at, age: nowMs() - current.at };
  },

  /** 是否正在执行读档（插件在恢复瞬间应跳过"进入区域就存档"） */
  isRestoring() { return restoring; },

  /** 最近一次读档的墙钟时间（插件用来跳过一次自动存档） */
  restoredRecently(ms = 1200) { return lastRestoreAt > 0 && nowMs() - lastRestoreAt < ms; },

  /** 存档：scene 可以是当前场景（会自动带上整个 Multiscene 的状态）。
   *  ★ 在 tick / wait / after 等 scene 钩子回调里调用时，会**延后到本刻结束**
   *  （Scene.postStep）再真正拍快照：_runHooks 期间 _tickFns/_timers 正在边跑边
   *  重建，此刻快照会漏掉钩子（读档后插件 onTick 全丢）。提示音/“已存档”立即给。 */
  save(scene, opts = {}) {
    if (!scene || restoring) return false;
    if (scene._hooksRunning) {
      scene._savepointReq = { id: opts.id ?? null, label: opts.label ?? null, force: !!opts.force };
      if (!scene._savepointQueued) {
        scene._savepointQueued = true;
        const queue = () => {
          scene._savepointQueued = false;
          const req = scene._savepointReq;
          scene._savepointReq = null;
          if (req) captureNow(scene, req);
        };
        if (typeof scene.postStep === 'function') scene.postStep(queue);
        else if (typeof scene.after === 'function') scene.after(queue);
        else queue();
      }
      Savepoint.toast(activeSceneOf(scene), '已存档');
      return true;
    }
    return captureNow(scene, opts) ? true : false;
  },

  /** 读档（原地恢复）；没有存档或不属于本关 → false */
  restore(scene) {
    if (!scene || !Savepoint.has(scene)) return false;
    if (restoring) return false;
    const target = activeSceneOf(scene);
    if (target && typeof target.closeRestartMenu === 'function') target.closeRestartMenu();
    restoring = true;
    try {
      if (current.data.scenes) {
        const M = scene.multiscene || (scene.scenes ? scene : null);
        if (!M) return false;
        applyMultiscene(M, current.data);
      } else {
        if (scene.multiscene) return false;
        applyScene(scene, current.data);
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[Savepoint] 读档失败：', e);
      return false;
    } finally {
      restoring = false;
    }
    lastRestoreAt = nowMs();
    // 通知插件（检查点插件据此把"当前区域"设成存档所在区域，避免立刻重复存档）
    const scenes = scene.multiscene
      ? [...scene.multiscene.scenes.values()].map((e) => e.scene).filter(Boolean)
      : [scene];
    for (const s of scenes) {
      try { s.fire('checkpointRestored', { id: current.id }); } catch (e) { /* 插件异常不影响 */ }
    }
    Savepoint.toast(activeSceneOf(scene), '已回到存档点');
    sfx('checkpoint.restore');
    return true;
  },

  /** 死亡后点屏幕：有存档 → 回存档点；没有 → 整局重开（保持旧行为） */
  retryAfterDeath(scene) {
    if (Savepoint.restore(scene)) return 'restored';
    if (scene && typeof scene.restart === 'function') scene.restart();
    return 'restart';
  },

  /** 整局重开：清空存档并刷新页面 */
  fullRestart(scene) {
    current = null;
    if (scene && scene.multiscene) {
      const e = scene.multiscene.scenes.get(scene.multiscene.current);
      if (e && e.scene && typeof e.scene.closeRestartMenu === 'function') e.scene.closeRestartMenu();
    } else if (scene && typeof scene.closeRestartMenu === 'function') {
      scene.closeRestartMenu();
    }
    if (scene && typeof scene.restart === 'function') scene.restart();
  },

  /** 清空存档（整局重开 / 离开关卡时用） */
  clear() { current = null; },

  /** 左上角提示（"已存档"/"已回到存档点"），由 HUD 渲染 */
  toast(scene, text) {
    if (!scene) return;
    scene._saveToast = { text: String(text || ''), at: nowMs(), dur: 1600 };
  },

  // 供测试/调试使用（不对外文档化）
  _captureScene: captureScene,
  _applyScene: applyScene,
  _captureMultiscene: captureMultiscene,
  _applyMultiscene: applyMultiscene,
};
