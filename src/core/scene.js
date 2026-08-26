// ============================================================================
// Scene：游戏场景调度器
// ----------------------------------------------------------------------------
// 每一刻：玩家输入 → 物理 → 接触事件 → 容器包含 → 化学反应（自反应/接触对/
// 容器内/大气吸收/可燃气体燃烧）→ 网格同步 → 状态判定。
// 同时构造化学引擎所需的 env（每对象条件 + 产物路由）。
// ============================================================================

import { ChemistryEngine } from '../chem/engine.js';
import { Atmosphere } from '../chem/atmosphere.js';
import { getSubstance, isSoluble } from '../chem/substances.js';
import { CollisionSystem, ContactTracker, overlaps } from '../physics/collision.js';
import { Particle, splitPile } from '../objects/particle.js';
import { CELL_SIZE } from '../render/gridrender.js';
import { Bubble } from '../objects/bubble.js';
import { Spark } from '../objects/spark.js';
import { GasColumn } from '../objects/gascolumn.js';
import { Explosion } from '../objects/explosion.js';
import { ReactionLabel } from '../objects/reactionlabel.js';
import { Container } from '../objects/container.js';
import { Portal } from '../objects/portal.js';
import { Rope } from '../objects/rope.js';
import { CFG } from './config.js';

export class Scene {
  constructor({ worldW = CFG.worldW, worldH = CFG.worldH, physics = {} } = {}) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.objects = [];
    this.dynamics = [];
    this.statics = [];
    this.containers = [];
    this.lamps = [];
    this.doors = [];
    this.portals = [];
    this.particles = [];
    this.hidden = []; // 初始隐藏的物体：不可见/无碰撞/不参与逻辑，由开关 showId 显现
    this.byId = {};
    this.player = null;
    this.camera = null; // 由构建器注入（爆炸屏幕震动用）

    this.chem = new ChemistryEngine();
    this.atmosphere = new Atmosphere();
    this.physics = new CollisionSystem({ gravity: CFG.gravity, autoStepMax: CFG.player.autoStepMax, groundFriction: CFG.groundFriction, airFriction: CFG.airFriction, ...physics });
    this.contacts = new ContactTracker();
    this.contactPairs = [];
    this.customReactions = []; // 关卡自定义反应（最高优先级）：[{reactants:[{id,coeff}], products:[{id,coeff}]}]
    this._reactGas = {}; // 反应产气累积器（气体探测器只检测它）：gasId → 反应产气总量（不衰减，同大气累积）

    this.status = 'init';
    this.time = 0;
    this.dt = 1 / CFG.tickRate;
    this.tip = '';
    this.debugMode = false; // 调试模式（.debugmode() 开启）
    this.debugPaused = false; // 暂停 tick 推进
    this.debugStepOnce = false; // 手动步进一 tick

    this.control = new Set(); // 长按（left/right/jump/place/collect）
    this.pressed = new Set(); // 本刻刚按下（边缘触发）
    this._events = {};
    this._emitCtx = null;
    this._plumeSeq = 0;
    this.mouse = null; // 调试模式悬停：{x,y,on}（屏幕坐标，由 builder 鼠标监听写入）
    this._rxLogT = {}; // 玩家反应日志限频：规范化反应式 → 上次记录时刻（防"反应抖动"）

    // ---- 运行时钩子（插件/关卡脚本用）：全部走"游戏时间"，受调试暂停(F5)控制 ----
    this._tickFns = [];    // 每帧执行: fn(dt, time)，返回 true 自动卸载
    this._timers = [];     // 一次性延迟: {at, fn}（游戏时间）
    this._intervals = [];  // 周期: {next, period, fn}
    this._afterFns = [];   // 下一帧开头执行一次
    this._keyDownFns = []; // 键盘按下（含未映射键），由 bindKeyboard 转发
    this._keyUpFns = [];   // 键盘抬起
  }

  // ---------------------------------------------------------------------------
  // 运行时钩子 API：wait/after/interval 基于游戏时间（scene.time，暂停即停），
  // 与 setTimeout（墙钟时间）不同——调试暂停时不会"偷偷"继续走。
  // ---------------------------------------------------------------------------

  /** 每帧执行 fn(dt, time)：返回 true 则卸载；返回 deregister 函数可手动卸载 */
  onTick(fn) {
    this._tickFns.push(fn);
    return () => {
      const i = this._tickFns.indexOf(fn);
      if (i >= 0) this._tickFns.splice(i, 1);
    };
  }

  /** 等待 sec 秒（游戏时间）后执行 fn；返回取消函数 */
  wait(sec, fn) {
    const t = { at: this.time + Math.max(0, sec), fn };
    this._timers.push(t);
    return () => {
      const i = this._timers.indexOf(t);
      if (i >= 0) this._timers.splice(i, 1);
    };
  }

  /** 下一帧执行一次 fn（等价 wait(0)） */
  after(fn) {
    this._afterFns.push(fn);
    return () => {
      const i = this._afterFns.indexOf(fn);
      if (i >= 0) this._afterFns.splice(i, 1);
    };
  }

  /** 每 period 秒执行 fn；返回取消函数 */
  interval(period, fn) {
    const t = { next: this.time + Math.max(0.001, period), period: Math.max(0.001, period), fn };
    this._intervals.push(t);
    return () => {
      const i = this._intervals.indexOf(t);
      if (i >= 0) this._intervals.splice(i, 1);
    };
  }

  /** 键盘按下回调（任意键，含未映射键）：fn(e)，返回 true 表示已处理（preventDefault） */
  onKeyDown(fn) {
    this._keyDownFns.push(fn);
    return () => {
      const i = this._keyDownFns.indexOf(fn);
      if (i >= 0) this._keyDownFns.splice(i, 1);
    };
  }

  /** 键盘抬起回调 */
  onKeyUp(fn) {
    this._keyUpFns.push(fn);
    return () => {
      const i = this._keyUpFns.indexOf(fn);
      if (i >= 0) this._keyUpFns.splice(i, 1);
    };
  }

  /** 键盘事件统一入口（input.js 调用） */
  _fireKey(type, e) {
    const fns = type === 'up' ? this._keyUpFns : this._keyDownFns;
    if (!fns.length) return;
    for (const fn of [...fns]) {
      try {
        if (fn(e) === true && e.preventDefault && e.cancelable) e.preventDefault();
      } catch (err) { /* 插件回调异常不拖垮游戏循环 */ }
    }
  }

  /** 每帧推进运行时钩子（在 step 的时间推进后、对象 update 前） */
  _runHooks(dt) {
    const after = this._afterFns;
    this._afterFns = [];
    for (const fn of after) fn();
    this._tickFns = this._tickFns.filter((fn) => {
      try { return fn(dt, this.time) !== true; } catch (err) { return false; }
    });
    if (this._timers.length) {
      this._timers = this._timers.filter((t) => {
        if (this.time < t.at) return true;
        try { t.fn(); } catch (err) { /* 插件回调异常不拖垮游戏循环 */ }
        return false;
      });
    }
    if (this._intervals.length) {
      for (const t of this._intervals) {
        while (this.time >= t.next) {
          t.next += t.period;
          try { t.fn(); } catch (err) { /* 同上 */ }
        }
      }
    }
  }

  on(name, fn) {
    (this._events[name] ??= []).push(fn);
    return this;
  }

  fire(name, ...args) {
    for (const fn of this._events[name] ?? []) fn(...args);
  }

  addObject(obj) {
    this.byId[obj.id] = obj;
    // 初始隐藏：只登记 byId + hidden 列表（可被开关 showId 显现），不进任何活动索引
    if (obj.hidden) {
      this.hidden.push(obj);
      if (obj.subBodies) for (const sb of obj.subBodies) { sb.hidden = true; this.addObject(sb); }
      return obj;
    }
    this.objects.push(obj);
    this._register(obj);
    if (obj.subBodies) for (const sb of obj.subBodies) this.addObject(sb);
    return obj;
  }

  /** 把物体注册进物理/逻辑索引（statics/dynamics/containers/…） */
  _register(obj) {
    if (obj.physicsKind === 'static') this.statics.push(obj);
    else if (obj.physicsKind === 'dynamic') this.dynamics.push(obj);
    if (obj instanceof Container) this.containers.push(obj);
    if (obj.isLamp) this.lamps.push(obj);
    if (obj.isDoor) this.doors.push(obj);
    if (obj instanceof Portal) this.portals.push(obj);
    if (obj instanceof Particle) this.particles.push(obj);
    if (obj.isPlayerObj) this.player = obj;
  }

  /** 显现一个隐藏物体（开关 showId 用）：恢复进 objects 与物理/逻辑索引 */
  reveal(id) {
    const obj = this.byId[id];
    if (!obj || !obj.hidden) return obj;
    obj.hidden = false;
    const h = this.hidden.indexOf(obj);
    if (h >= 0) this.hidden.splice(h, 1);
    this.objects.push(obj);
    this._register(obj);
    if (obj.subBodies) for (const sb of obj.subBodies) this.reveal(sb.id);
    return obj;
  }

  removeObject(obj) {
    // 从所有索引里彻底移除（含 statics/containers/lamps/doors/portals）：
    // 否则删掉的墙虽不可见仍会挡人、删掉的灯仍在加热、删掉的门仍在判定。
    const arrays = [
      this.objects, this.dynamics, this.statics, this.particles,
      this.containers, this.lamps, this.doors, this.portals, this.hidden,
    ];
    for (const arr of arrays) {
      const i = arr.indexOf(obj);
      if (i >= 0) arr.splice(i, 1);
    }
    delete this.byId[obj.id];
    if (this.player === obj) this.player = null; // 玩家被移除/搬走：清引用（跨场景搬运）
  }

  // ===========================================================================
  // 主刻
  // ===========================================================================
  step(dt) {
    if (this.status !== 'running') return;
    this.time += dt;
    this.dt = dt;
    this._runHooks(dt); // 运行时钩子（插件/关卡脚本的 onTick/wait/interval/after）
    // 页面不在前台（切走/最小化）时清空输入：失焦时 keyup/blur 可能不触发，
    // 每帧兜底检测，避免"失焦后按键一直按住"（玩家一直跳/走）。
    if (typeof document !== 'undefined' && (document.hidden || !document.hasFocus())) {
      this.control.clear();
      this.pressed.clear();
    }

    // 1. 玩家输入意图（读取 control/pressed）；拷贝迭代，允许 update 中移除对象（气泡等）
    for (const obj of [...this.objects]) {
      if (typeof obj.update === 'function') obj.update(dt, this);
    }

    // 1.5 网格形状 → 物理体（上一帧化学后的形状；物理必须用最新尺寸，
    //     否则消耗/生长后碰撞箱持续滞后一帧——"碰撞箱显示已缩小但旧边界仍挡人"）
    for (const obj of this.objects) {
      if (typeof obj.syncGrid === 'function') obj.syncGrid();
    }

    // 2. 物理
    this.physics.step(dt, { dynamics: this.dynamics, statics: this.statics });

    // 2.5 物理结算后钩子（绳子定位悬挂物体、断绳检查）
    for (const obj of this.objects) {
      if (typeof obj.lateUpdate === 'function') obj.lateUpdate(dt, this);
    }

    // 3. 接触事件
    const { begun, ended, current } = this.contacts.update(this.dynamics);
    this.contactPairs = current;
    for (const [a, b] of begun) {
      if (a.onContactBegin) a.onContactBegin(b, this);
      if (b.onContactBegin) b.onContactBegin(a, this);
    }
    for (const [a, b] of ended) {
      if (a.onContactEnd) a.onContactEnd(b, this);
      if (b.onContactEnd) b.onContactEnd(a, this);
    }

    // 4. 容器包含（固体在池/烧杯内）
    this.updateContainment();

    // 5. 化学
    this.stepChemistry(dt);

    // 6. 网格形状 → 物理体（碰撞箱 = 最小外接 AABB）
    for (const obj of this.objects) {
      if (typeof obj.syncGrid === 'function') obj.syncGrid();
    }
    // 溶尽/烧尽的固体物块移除（0 尺寸幽灵清理；也是"锚点物消失断绳"的前提）
    for (const obj of [...this.objects]) {
      if (obj.isPlayerObj) continue;
      if (obj.grid && obj.grid.minAABB && obj.grid.minAABB() === null) {
        this.removeObject(obj);
      }
    }
    // 被反应消耗完的沉淀粒子移除（如 Zn 粒子 + HCl 反应耗尽）
    for (const pt of [...this.particles]) {
      if (pt.amount <= 1e-9) this.removeObject(pt);
    }

    // 7. 状态判定
    this.checkStatus();

    // 8. 清空边缘触发
    this.pressed.clear();
  }

  updateContainment() {
    for (const obj of this.objects) {
      obj._container = null;
      if (!obj.material || obj.material.phase !== 'solid') continue;
      for (const c of this.containers) {
        if (c.containsObj(obj)) {
          obj._container = c;
          break;
        }
      }
    }
  }

  // ===========================================================================
  // 化学反应调度
  // ===========================================================================
  stepChemistry(dt) {
    this.atmosphere._cause = null; // 复位大气变化原因（由引擎按反应盖章）
    // 自反应（分解/催化/燃烧/溶解/气态还原）
    for (const obj of this.objects) {
      if (!obj.material) continue;
      this._setEmitCtx(obj, null);
      // skipDissolution：溶解统一在成对反应之后执行（反应优先于溶解）
      this.chem.reactSelf(obj.material, dt, this.makeEnv(obj), { skipDissolution: true });
    }
    // 接触对反应（玩家-物块、物块-物块）；条件取双方并集
    for (const [a, b] of this.contactPairs) {
      if (!a.material || !b.material) continue;
      this._emitCtx = {
        container: a._container ?? b._container,
        player: a.isPlayerObj ? a : b.isPlayerObj ? b : null,
        point: this._reactionPoint(Math.random() < 0.5 ? a : b), // 按接触方暴露面（不再固定中间点）
      };
      this.chem.reactPair(a.material, b.material, dt, this.makePairEnv(a, b));
    }
    // 容器内反应（物体浸在池/烧杯中）；条件取双方并集
    for (const c of this.containers) {
      for (const obj of this.objects) {
        if (obj === c || !obj.material || obj.material.phase !== 'solid') continue;
        if (c.containsObj(obj)) {
          this._setEmitCtx(obj, c);
          this.chem.reactPair(obj.material, c.material, dt, this.makePairEnv(obj, c));
        }
      }
    }
    // 灯上物体与灯材料反应（如 CuO 粉末放灯上 + C 块 → 高温还原出 Cu 粉末）
    // 玩家：只有"站在灯顶上"（脚底贴灯顶）才与灯上粉末反应——玩家本身可以是反应物
    // （如 Fe2O3 玩家 + 灯上 Al 粉 → 铝热）；站灯旁/贴灯壁仍不反应。
    for (const lamp of this.lamps) {
      if (!lamp.lit) continue;
      for (const obj of this.objects) {
        if (obj === lamp || !obj.material || obj.material.phase !== 'solid') continue;
        if (obj.isPlayerObj && Math.abs(obj.bottom - lamp.top) > 4) continue; // 玩家须站在灯顶
        if (this._onLamp(obj, lamp)) {
          this._setEmitCtx(obj, lamp);
          this.chem.reactPair(obj.material, lamp.material, dt, this.makePairEnv(obj, lamp));
        }
      }
    }

    // 可溶沉淀粒子浸入含水容器 → 溶解为溶质（放下的 NaCl 粉掉进池里会化掉）
    this._tryParticleDissolution(dt);

    // 可溶固体浸入含水容器 → 溶解（玩家身上的盐壳/可溶物在水中洗掉）。
    // 放在所有成对反应**之后**：反应优先于溶解——玩家 Na2CO3 壳先与池水 Ba(OH)2
    // 反应回血，而不是先被溶解抢走变成池水溶质（再生机制依赖这个顺序）。
    for (const obj of this.objects) {
      if (!obj.material || obj.material.phase !== 'solid') continue;
      const env = this.makeEnv(obj);
      const ctx = this.chem._ctxOf(obj.material, obj.material, dt, env);
      this.chem._tryDissolution(obj.material, dt, ctx);
    }

    // 含碱容器吸收大气酸性气体（CO2/SO2）
    for (const c of this.containers) {
      if (c.solution.ids().some((id) => getSubstance(id).kind === 'base')) {
        this.chem.absorbAtmosphereGas(c.material, dt, this.makeEnv(c));
      }
    }
    // 大气中可燃气体燃烧
    this.chem.reactAtmosphere(this.makeEnv(null), dt);

    // 收集本 tick 大气气体变化（产生/消耗原因，调试面板显示）
    const glog = this.atmosphere.flushLog();
    if (glog.length) {
      if (!this.gasLog) this.gasLog = [];
      // 合并同一 tick 内同气体+同原因的变化
      const merged = new Map();
      for (const g of glog) {
        const k = `${g.id}|${g.cause ?? ''}`;
        if (merged.has(k)) merged.get(k).delta += g.delta;
        else merged.set(k, { id: g.id, delta: g.delta, cause: g.cause ?? null, t: this.time });
      }
      for (const m of merged.values()) this.gasLog.unshift(m);
      if (this.gasLog.length > 60) this.gasLog.length = 60;
    }
  }

  /** 反应点：优先取反应对象**网格暴露面**的随机格中心（反应发生在哪就在哪冒泡/爆炸，
   *  不再是"只从物块中间"）；无网格对象回退中心/底部。0.5s 时间桶内保持同一点（气流
   *  柱/气泡不来回蹦），桶交替时在暴露面随机移动——大反应"处处有体现"。 */
  _reactionPoint(obj) {
    if (obj && obj.grid && typeof obj.grid.exposedCells === 'function') {
      const pts = obj.grid.exposedCells();
      if (pts.length) {
        const bucket = Math.floor(this.time * 2);
        const idx = Math.abs(Math.floor(((bucket * 2654435761) >>> 0) % pts.length));
        const c = pts[idx];
        const ox = obj.gridOrigin ? obj.gridOrigin.x : obj.x;
        const oy = obj.gridOrigin ? obj.gridOrigin.y : obj.y;
        return { x: ox + c.x * CELL_SIZE + CELL_SIZE / 2, y: oy + c.y * CELL_SIZE + CELL_SIZE / 2 };
      }
    }
    const base = obj ? { x: obj.x + obj.w / 2, y: obj.isLamp ? obj.flameY() : obj.bottom } : null;
    return base ?? { x: this.worldW / 2, y: this.worldH / 2 };
  }

  _setEmitCtx(obj, container) {
    // 容器自身的反应（如灯上沉淀分解）：产物回到容器自己，而不是当开阔地粒子撒出去
    const selfContainer = obj && obj.material && obj.material.owner === obj ? obj : null;
    // spread = 生成宽幅：玩家的底边宽度（沉淀从玩家两侧的液体接触处冒出，不压在玩家身上）
    const spread = obj && obj.isLamp ? 14 : obj && obj.w ? obj.w : 20;
    this._emitCtx = {
      obj: obj ?? null, // 反应对象（气泡柱产气源：自身不被自己的气流托起）
      container: container ?? selfContainer ?? obj?._container,
      player: obj && obj.isPlayerObj ? obj : null,
      point: this._reactionPoint(obj), // 反应位置（暴露面随机格；不再是物体中心）
      spread,
    };
  }

  /** 构造化学引擎 env：大气 + 该对象的环境条件 + 产物路由 + 产气气泡 + 爆炸 */
  makeEnv(obj) {
    return {
      atmosphere: this.atmosphere,
      conditions: this.conditionsFor(obj),
      globalIgnited: this.lamps.some((l) => l.lit),
      emit: (product, origin) => this.routeProduct(product, origin),
      onGas: (id, mass, ctx) => this.onGas(id, mass, ctx),
      onReaction: (text) => this.onReaction(text),
      onSpark: () => this.onSpark(), // 金属燃烧的火星（火星四射）
      customReactions: this.customReactions, // 关卡自定义反应（L0 最高优先级）
      debugMode: this.debugMode,
      explode: (point, strength, cause) => this.explode(point ?? null, strength, cause),
      // 爆炸中心：当前反应点；大气爆炸（无反应点）取第一个点燃灯的火苗位置
      explodePoint: this._emitCtx
        ? this._emitCtx.point
        : (() => {
            const lit = this.lamps.find((l) => l.lit);
            return lit ? { x: lit.x + lit.w / 2, y: lit.flameY() } : null;
          })(),
    };
  }

  /** 可溶沉淀粒子浸入含水容器 → 溶解为溶质（除玩家外，能溶的物体在水中都会溶） */
  _tryParticleDissolution(dt) {
    const rate = 3 * dt; // 与 RATE.dissolution 一致
    for (const pt of this.particles.slice()) {
      if (!isSoluble(pt.substance)) continue; // 不溶沉淀不溶解
      if (pt.amount <= 1e-9) continue;
      for (const c of this.containers) {
        if (c.isLamp) continue; // 灯是台子不是液体
        if (!c.containsObj(pt)) continue;
        if (c.solution.water <= 0) continue;
        const mass = Math.min(pt.amount, rate);
        c.noteSolOrigin(pt.substance, { kind: 'dissolve' }); // 沉淀粒子溶入池水 → 来源=溶解
        c.solution.add(pt.substance, mass);
        pt.amount -= mass;
        if (pt.amount <= 1e-9) {
          this.removeObject(pt);
          break;
        }
      }
    }
  }

  /** 金属燃烧的火星：反应点迸发橙金亮粒（纯视觉；限制在场数量防刷屏） */
  onSpark() {
    const pt = this._emitCtx?.point ?? null;
    if (!pt) return;
    const cap = 36;
    let n = 0;
    for (const o of this.objects) if (o instanceof Spark && ++n >= cap) return;
    const spread = this._emitCtx.spread ?? 20;
    for (let i = 0; i < 2; i++) {
      this.addObject(new Spark({
        x: pt.x + (Math.random() - 0.5) * spread,
        y: pt.y - Math.random() * 8,
        vx: (Math.random() - 0.5) * 220,
        vy: -(140 + Math.random() * 240),
        life: 0.5 + Math.random() * 0.55,
      }));
    }
  }

  /** 反应日志的规范化键：反应物/产物各自排序，同一反应的不同书写顺序视为同一条 */
  _rxKey(text) {
    const [rx, pd] = String(text).split('→');
    const norm = (s) => (s || '').split('+').map((x) => x.trim()).filter(Boolean).sort().join('+');
    return `${norm(rx)}|${norm(pd)}`;
  }

  /** 记录反应（HUD 日志）。调试模式下在反应发生的位置飘出反应式标签 */
  onReaction(text) {
    const point = this._emitCtx ? this._emitCtx.point : null;
    const key = this._rxKey(text);
    const now = this.time;
    // 防"反应抖动"：同一反应（规范化键：反应物排序后）在 0.5s 内只进一次
    // 调试面板/浮动标签，1s 内只进一次玩家 HUD 日志。多反应竞争或循环
    // （如氨气在大气与溶液间往返）时，每 tick 交替记录不同反应式会让
    // 日志面板疯狂刷新——限频后列表稳定，真实反应仍会逐条出现。
    const lastT = this._lastLabelT ?? {};
    if (this.debugMode && now - (lastT[key] ?? -10) > 0.5) {
      lastT[key] = now;
      this._lastLabelT = lastT;
      if (!this.debugReactions) this.debugReactions = [];
      this.debugReactions.unshift({ text, x: point ? point.x : null, y: point ? point.y : null, t: now });
      if (this.debugReactions.length > 60) this.debugReactions.length = 60;
      // 在反应发生的位置生成浮动标签（与面板共用限频键，避免同一反应两种写法并存）
      if (point) {
        this.addObject(new ReactionLabel({
          x: point.x,
          y: point.y - 12,
          text,
          color: text.includes(this.player?.substance ?? '') ? '#ffd23f' : '#9fd8ff',
        }));
      }
    }
    if (!this.player) return;
    if (!this.player.reactions) this.player.reactions = [];
    if (this.player.reactions[0] === text) return; // 同反应持续进行中不重复刷
    if (now - (this._rxLogT[key] ?? -10) < 1) return;
    this._rxLogT[key] = now;
    this.player.reactions.unshift(text);
    if (this.player.reactions.length > 8) this.player.reactions.length = 8;
  }

  /**
   * 爆炸：冲击波把周围玩家/物块/沉淀炸飞（方向∝相对位置，力度∝强度/(1+距离²)）。
   * 受冲击过强的物块/玩家碎裂掉渣（自身缩小，掉出等量可收集沉淀）。
   * cause：爆炸原因文本（调试悬停/面板显示，如"2H2+O2 → 2H2O"、"2Al+Fe2O3 → ..."）。
   */
  /** 爆炸的焰色染色：取反应对象的主物质焰色（Na 黄/K 紫/Li 红/Cu 绿…）——
   *  爆炸的"一部分颜色粒子"按焰色反应上色 */
  _explosionFlameColor() {
    const o = this._emitCtx?.obj ?? this._emitCtx?.player ?? null;
    let id = o?.substance ?? null;
    if (!id && o?.grid && typeof o.grid.ids === 'function') {
      const ids = o.grid.ids();
      if (ids.length) id = ids[0]; // 多物质取主物质
    }
    if (!id) return null;
    const sub = getSubstance(id);
    return sub?.flameColor ?? null;
  }

  explode(point, strength, cause = null) {
    const p = point ?? (this._emitCtx ? this._emitCtx.point : { x: this.worldW / 2, y: this.worldH / 2 });
    const R = 150; // 爆炸半径（衰减基准）
    // 视觉 + 屏幕震动；记录最近爆炸原因（HUD 调试面板显示）
    const flip = (this._explosionSeq = (this._explosionSeq ?? 0) + 1) % 2 === 0; // 连续爆炸相位交替，不雷同
    this.addObject(new Explosion({ x: p.x, y: p.y, strength, cause, flip, flame: this._explosionFlameColor() }));
    this._lastExplosion = { cause: cause || '剧烈反应', t: this.time };
    if (this.camera) this.camera.shake(Math.min(22, 5 + strength * 0.2));
    // 冲击：动态体（玩家/物块/烧杯）
    for (const o of this.dynamics) {
      if (o.static || o.subBodies) continue; // 子体（杯壁）跟随主体处理
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > R * 3) continue;
      const impulse = (strength * 2.8) / (1 + (dist / R) * (dist / R));
      if (impulse <= 0.1) continue;
      if (dist < 1) {
        o.vel.y -= impulse * 4.5; // 炸心正上方：强力上抛
      } else {
        o.vel.x += (dx / dist) * impulse * 1.15; // 水平：径向（略放大，让炸飞明显）
        // 垂直：径向分量 + 强上抛分量（爆炸把物体炸飞起来，不只水平滑开；
        // 上抛需足够抵消重力 1200，否则物体贴地根本抬不起来）
        o.vel.y += (dy / dist) * impulse - impulse * 2.4;
      }
      // 碎裂：冲击过强 → 表层物质掉渣（物块变小、玩家掉血，渣可收集回血）
      if (impulse > 120 && o.grid) this.shatter(o, p, impulse);
    }
    // 冲击：沉淀粒子（直接踢飞）
    for (const pt of this.particles) {
      const dx = pt.x + pt.w / 2 - p.x;
      const dy = pt.y + pt.h / 2 - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > R * 2.5 || dist < 1) continue;
      const impulse = (strength * 1.6) / (1 + dist / R);
      pt.vel.x += (dx / dist) * impulse;
      pt.vel.y += (dy / dist) * impulse;
    }
    // 爆炸炸断附近的绳子（范围放大到 2.5×爆炸半径；绳子中点或悬挂物在范围内都断）
    for (const o of this.objects) {
      if (!(o instanceof Rope) || o.broken) continue;
      const dAnchor = Math.hypot(o.x - p.x, o.y - p.y);
      const dHang = o.hanging ? Math.hypot(o.hanging.x + o.hanging.w / 2 - p.x, o.hanging.y + o.hanging.h / 2 - p.y) : Infinity;
      if (Math.min(dAnchor, dHang) < R * 2.5) o.break(this);
    }
  }

  /** 碎裂：从表层剥离 10%~20% 质量 → 等量沉淀粒子（可收集） */
  shatter(o, p, impulse) {
    if (!o.grid || !o.mat) return;
    const frac = 0.1 + Math.min(0.1, impulse / 800);
    const total = o.grid.totalMass();
    const shed = Math.max(0.2, total * frac);
    const exp = o.grid.exposedMasses ? o.grid.exposedMasses() : null;
    if (!exp || Object.keys(exp).length === 0) return;
    const ids = Object.keys(exp);
    const id = ids[Math.floor(Math.random() * ids.length)];
    const take = Math.min(exp[id], shed);
    if (take <= 1e-9) return;
    const removed = o.grid.consume(id, take);
    if (removed > 1e-9) {
      this.spawnParticles(id, removed, { x: o.x + Math.random() * o.w, y: o.y + Math.random() * o.h * 0.5 }, true, false, {
        kind: 'explosion',
        text: `${o.substance ?? id} 碎裂`,
      });
      if (o.syncGrid) o.syncGrid();
    }
  }

  /**
   * 产气时生成气流 + 气泡柱：
   *  - 真实气流（GasColumn）：轻于空气(摩尔质量<29)向上托、重于空气向下压，对重叠的
   *    玩家/物块施力。同一产气点只保留一个气流，持续刷新、反应停则消散。
   *  - 气泡（Bubble）纯视觉反馈，被地板阻断消失。
   */
  /** 暴露面外包（世界坐标 x/y 范围）：大柱覆盖整个反应面（"合并成的大柱"），
   *  微观点位由每 tick 的 reactionPoint 提供（气泡/标签/产物在热点冒出） */
  _exposedBounds(obj) {
    const pts = obj.grid?.exposedCells ? obj.grid.exposedCells() : [];
    if (!pts.length) return null;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const ox = obj.gridOrigin?.x ?? obj.x;
    const oy = obj.gridOrigin?.y ?? obj.y;
    for (const c of pts) {
      const px = ox + c.x * CELL_SIZE + CELL_SIZE / 2;
      const py = oy + c.y * CELL_SIZE + CELL_SIZE / 2;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
    return { x0, x1, y0, y1 };
  }

  onGas(id, mass, ctx) {
    // 记录"反应产生的气体"（气体探测器只检测这个，不检测预置大气气体）
    this._reactGas[id] = (this._reactGas[id] ?? 0) + mass;
    const point = this._emitCtx ? this._emitCtx.point : { x: this.worldW / 2, y: this.worldH / 2 };
    const sub = getSubstance(id);
    const dir = sub.mm < 29 ? -1 : 1;
    // 气流强度随产气量增强（基础 > 重力，使小反应也有明显上浮/下沉）
    const accel = Math.max(1300, 1100 + mass * 130);
    const maxSpeed = Math.min(300, 150 + mass * 18);
    const emit = this._emitCtx ?? {};
    const srcObj = emit.obj ?? null;
    // 柱的位置=**反应暴露面外包**（合并成一条稳定大柱：覆盖整个反应面，不再每条
    // 小柱四处跳——用户反馈"零零散散"）；微观点位（气泡/标签/产物）仍按热点走。
    const eb = srcObj ? this._exposedBounds(srcObj) : null;
    const center = eb ? { x: (eb.x0 + eb.x1) / 2, y: Math.min(eb.y0, point.y) } : point;
    let plume = null;
    for (const o of this.objects) {
      // 同一产气源、同方向、同气体共柱（源变（被溶窄等）时柱自然跟随；不同源各显各的）
      if (o instanceof GasColumn && o.life > 0 && o.dir === dir && o.gasId === id && o.source === srcObj) {
        plume = o;
        break;
      }
    }
    if (!plume) {
      // 气泡柱高度：用产气源对象配置的 gasHeight，默认 80；不配则读容器（池/烧杯）
      const ghSrc = srcObj && srcObj.gasHeight ? srcObj : (emit.container ?? null);
      const gh = ghSrc && ghSrc.gasHeight ? ghSrc.gasHeight : 80;
      // 柱宽 ≈ 整个反应暴露面（0.85×，40~180px）——气泡柱覆盖整个反应面，不再"只生成一部分"
      const faceW = eb ? eb.x1 - eb.x0 : (srcObj?.w ?? emit.container?.w ?? 48) * 0.6;
      const w = Math.max(40, Math.min(180, faceW * 0.85));
      plume = new GasColumn({
        x: center.x - w / 2, y: center.y - gh, w, h: gh,
        dir, accel, maxSpeed, life: 2.5, gasId: id,
        source: srcObj, // 产气源（自身不被自己的气流托起）
        origin: ctx ? { kind: 'reaction', text: ctx.lastRxText ?? '' } : null, // 来源方程式（调试悬停显示）
        id: `plume${++this._plumeSeq}`,
      });
      this.addObject(plume);
    }
    plume.life = 2.5;
    if (accel > plume.accel) plume.accel = accel;
    if (maxSpeed > plume.maxSpeed) plume.maxSpeed = maxSpeed;
    // 气泡视觉：在**当前反应热点**冒出（每 tick 热点在暴露面随机换位 → 气泡沿整个反应面分布）
    const n = Math.max(1, Math.min(6, Math.round(mass * 1.2)));
    for (let i = 0; i < n; i++) {
      const x = point.x + (Math.random() - 0.5) * 22;
      const y = point.y + (dir < 0 ? -(3 + i * 4) : 3 + i * 4);
      this.addObject(new Bubble({ x, y, dir }));
    }
  }

  /** 接触对 env：条件取双方并集（任一方受热即视为接触处受热） */
  makePairEnv(a, b) {
    const env = this.makeEnv(a);
    const cb = this.conditionsFor(b);
    env.conditions.heat = env.conditions.heat || cb.heat;
    env.conditions.highTemp = env.conditions.highTemp || cb.highTemp;
    env.conditions.ignited = env.conditions.ignited || cb.ignited;
    env.conditions.light = env.conditions.light || cb.light;
    return env;
  }

  conditionsFor(obj) {
    let heat = false;
    let highTemp = false;
    let light = false;
    const isLampItself = obj && obj.isLamp;
    for (const lamp of this.lamps) {
      if (!lamp.lit) continue;
      if (isLampItself) {
        // 灯自身：点燃即视为受热 + 发光（作用于它承载的沉淀）
        if (lamp.highTemp) highTemp = true;
        else heat = true;
        light = true;
        continue;
      }
      // 只在灯上/贴在火焰处才受热，旁边的物块不分解
      if (obj && this._onLamp(obj, lamp)) {
        if (lamp.highTemp) highTemp = true;
        else heat = true;
      }
      // 光照条件：灯在 lightRange 内提供"光照"（见光分解如 HClO）
      if (obj && this.dist(obj, lamp) <= (lamp.lightRange ?? CFG.lampLightRange)) light = true;
    }
    const ignited = heat || highTemp || (obj && obj.isBurning);
    const hasCatalyst = (id) => this.catalystNear(obj, id);
    return { heat, highTemp, ignited, light, hasCatalyst };
  }

  /** 物体是否在灯上（重叠，或贴在灯顶的火焰位置） */
  _onLamp(obj, lamp) {
    if (overlaps(obj, lamp, 2)) return true;
    if (Math.abs(obj.bottom - lamp.top) <= 4 && obj.right > lamp.x && obj.left < lamp.x + lamp.w) return true;
    return false;
  }

  catalystNear(obj, id) {
    for (const o of this.objects) {
      if (o === obj || !o.material) continue;
      if (o.material.avail(id) > 0 && overlaps(o, obj, 1)) return true;
    }
    return false;
  }

  dist(a, b) {
    const ax = a.x + (a.w ?? 0) / 2;
    const ay = a.y + (a.h ?? 0) / 2;
    const bx = b ? b.x + (b.w ?? 0) / 2 : ax;
    const by = b ? b.y + (b.h ?? 0) / 2 : ay;
    return Math.hypot(ax - bx, ay - by);
  }

  // ===========================================================================
  // 产物路由
  // ===========================================================================
  routeProduct(product, origin = null) {
    const ctx = this._emitCtx;
    // 引擎传回的是反应方程式字符串 → 归一化为溯源对象（反应生成）
    if (typeof origin === 'string' && origin) origin = { kind: 'reaction', text: origin };
    if (product.phase === 'adhere') {
      // 附着 = 固体产物"就地"附着在反应物表面：优先原地转化（写进被消耗的格子），
      // 剩余才按原生长逻辑（底部新格）。避免把玩家/物块越吹越大。
      // origin 透传给目标物块/玩家，记录该物质的来源（调试悬停按物质显示）。
      const target = ctx.player ?? product.target;
      if (target) {
        if (target.mat) target.mat.add(product.id, product.mass, origin);
        else if (target.adhereMaterial) target.adhereMaterial(product.id, product.mass, origin);
      }
      // 附着落空（既无玩家参与、也无固体反应物可附着）：静默丢弃，绝不撒成游离粒子
      return;
    }
    if (product.phase === 'precipitate') {
      if (ctx.container) {
        // 在反应位置附近生成沉淀颗粒（物理堆叠），记录生成来源（调试悬停显示）
        ctx.container.addPrecipitate(product.id, product.mass, ctx.point, origin);
        return;
      }
    }
    this.spawnParticles(product.id, product.mass, ctx.point, !isSoluble(product.id), false, origin);
  }

  /** placed=true 的粒子有碰撞箱（放置的沉淀可垫脚）；origin 记录产物来源（调试悬停显示）。
   *  spread = 撒开范围 px（大堆用：巨大质量的沉淀堆一次撒开成滩，而不是挤在 8px 内）。
   *  颗粒分配统一走 splitPile（常规 0.5g/颗；大堆按"堆叠上限"1.5g = 3×0.5g 分配，
   *  与容器内沉淀颗粒同规则）；尺寸由 particleSizeOf 决定（0.5g→5px，1.5g→7.5px）。
   *  极端超大堆（>900g）仍合并保质量守恒（性能上限，已与用户确认不再优化）。 */
  spawnParticles(id, mass, point, collectible, placed = false, origin = null, spread = 8) {
    if (!Number.isFinite(mass) || mass <= 0) return; // 挡住 NaN/负质量
    const { n, per } = splitPile(mass);
    const amount = per;
    for (let i = 0; i < n; i++) {
      this.addObject(
        new Particle({
          x: point.x + (Math.random() - 0.5) * spread,
          y: point.y - (i % 3) * 2,
          substance: id,
          amount,
          collectible,
          placed,
          origin,
        }),
      );
    }
  }

  // ===========================================================================
  // 玩家放置辅助
  // ===========================================================================
  findLampNear(player) {
    // 返回范围内**最近**的灯（供就近放置）
    let best = null;
    let bestD = Infinity;
    for (const lamp of this.lamps) {
      const d = this.dist(lamp, player);
      if (d <= CFG.placeLampRange && d < bestD) {
        best = lamp;
        bestD = d;
      }
    }
    return best;
  }

  containerUnderFeet(player) {
    const feet = { x: player.x + player.w / 2, y: player.bottom };
    for (const c of this.containers) {
      if (!c.formulaVisible) continue; // 只对普通容器/开关生效
      const r = c.innerRect();
      // 水平：脚底在容器内；垂直：容器底部贴近地面，允许脚底略低于容器底（容器浮在地板上的 2px 缝隙等）
      if (feet.x >= r.x && feet.x <= r.x + r.w && feet.y >= r.y - 8 && feet.y <= r.y + r.h + 10) return c;
    }
    return null;
  }

  // ===========================================================================
  // 状态
  // ===========================================================================
  checkStatus() {
    const p = this.player;
    if (!p) return;
    if (p.hp <= 0) {
      this.setStatus('died');
      return;
    }
    if (p.y > this.worldH + CFG.worldMargin || p.bottom < -CFG.worldMargin) {
      this.setStatus('died');
      return;
    }
    // 通关：任一开启的通关口附近
    for (const d of this.doors) {
      if (d.isOpen && this.dist(this.player, d) <= CFG.doorWinRadius) {
        this.setStatus('win');
        return;
      }
    }
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.fire(s === 'win' ? 'win' : 'died');
  }

  restart() {
    if (typeof location !== 'undefined') location.reload();
  }
}
