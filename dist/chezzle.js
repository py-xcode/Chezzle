(function (global) {
  var __modules = {};
  var __cache = {};
  function __require(id) {
    if (__cache[id]) return __cache[id].exports;
    var module = { exports: {} };
    __cache[id] = module;
    __modules[id](module, module.exports, __require);
    return module.exports;
  }
  __modules["src/index.js"] = function (module, exports, __require) {
// ============================================================================
// 库入口：re-export 所有公共模块。浏览器打包后挂全局 `Chezzle`。
// ============================================================================

Object.assign(exports, __require('src/core/config.js'));;
Object.assign(exports, __require('src/core/scene.js'));;
Object.assign(exports, __require('src/core/input.js'));;
Object.assign(exports, __require('src/core/loop.js'));;
Object.assign(exports, __require('src/core/touch.js'));;
Object.assign(exports, __require('src/core/fullscreen.js'));;
Object.assign(exports, __require('src/core/overview.js'));;
Object.assign(exports, __require('src/core/recorder.js'));;

Object.assign(exports, __require('src/level/builder.js'));;
Object.assign(exports, __require('src/level/plugins.js'));;
Object.assign(exports, __require('src/level/multiscene.js'));;
Object.assign(exports, __require('src/level/click.js'));;
Object.assign(exports, __require('src/level/items.js'));;

Object.assign(exports, __require('src/objects/obj.js'));;
Object.assign(exports, __require('src/objects/material.js'));;
Object.assign(exports, __require('src/objects/particle.js'));;
Object.assign(exports, __require('src/objects/floor.js'));;
Object.assign(exports, __require('src/objects/container.js'));;
Object.assign(exports, __require('src/objects/pool.js'));;
Object.assign(exports, __require('src/objects/block.js'));;
Object.assign(exports, __require('src/objects/deposit.js'));;
Object.assign(exports, __require('src/objects/player.js'));;
Object.assign(exports, __require('src/objects/switch.js'));;
Object.assign(exports, __require('src/objects/key.js'));;
Object.assign(exports, __require('src/objects/door.js'));;
Object.assign(exports, __require('src/objects/lamp.js'));;
Object.assign(exports, __require('src/objects/blastlamp.js'));;
Object.assign(exports, __require('src/objects/beaker.js'));;
Object.assign(exports, __require('src/objects/rope.js'));;
Object.assign(exports, __require('src/objects/gascolumn.js'));;
Object.assign(exports, __require('src/objects/sign.js'));;
Object.assign(exports, __require('src/objects/bubble.js'));;
Object.assign(exports, __require('src/objects/spark.js'));;
Object.assign(exports, __require('src/objects/portal.js'));;
Object.assign(exports, __require('src/objects/gasdetector.js'));;
Object.assign(exports, __require('src/objects/extractor.js'));;
Object.assign(exports, __require('src/objects/dropper.js'));;
Object.assign(exports, __require('src/objects/drip.js'));;
Object.assign(exports, __require('src/objects/fx.js'));;
Object.assign(exports, __require('src/objects/gasbottle.js'));;

Object.assign(exports, __require('src/chem/substances.js'));;
Object.assign(exports, __require('src/chem/solution.js'));;
Object.assign(exports, __require('src/chem/atmosphere.js'));;
Object.assign(exports, __require('src/chem/rules.js'));;
Object.assign(exports, __require('src/chem/engine.js'));;

Object.assign(exports, __require('src/physics/body.js'));;
Object.assign(exports, __require('src/physics/aabb.js'));;
Object.assign(exports, __require('src/physics/collision.js'));;
Object.assign(exports, __require('src/physics/support.js'));;

Object.assign(exports, __require('src/render/renderer.js'));;
Object.assign(exports, __require('src/render/camera.js'));;
Object.assign(exports, __require('src/render/color.js'));;
Object.assign(exports, __require('src/render/gridrender.js'));;
Object.assign(exports, __require('src/render/liquidrender.js'));;
Object.assign(exports, __require('src/render/label.js'));;
Object.assign(exports, __require('src/render/hud.js'));;

// 浏览器全局挂载由 tools/build.mjs 打包时附加（`window.Chezzle = <exports>`）。

  };
  __modules["src/core/config.js"] = function (module, exports, __require) {
// ============================================================================
// 全局常量与调参（与 TECH_DESIGN.md §11 对应）
// ============================================================================

const CFG = {
  worldW: 1000,
  worldH: 800,

  tickRate: 30, // 固定步长
  gravity: 1200, // px/s²
  groundFriction: 8, // 地面摩擦（1/s）：爆炸/踢飞后的物体不会永远滑行（物理核心默认 0，Scene 层开启）
  airFriction: 3, // 空气摩擦（1/s，仅水平）：空中/气泡柱上玩家不会无限漂移，仍保留爆炸冲击感

  player: {
    moveSpeed: 220, // px/s
    jumpVel: 520, // px/s（向上）
    autoStepMax: 14, // px，自动上台阶阈值
    defaultSubstance: 'NaOH',
    defaultMass: 30, // g（矩形玩家，约 85×90px）
  },

  cellSize: 5, // px
  cellMass: 0.1, // g（质量量子）
  maxParticleMass: 0.5, // g/颗（常规颗粒质量——最小的沉淀颗粒 0.5g）
  // 大堆（超过粒子数上限时）按"堆叠"分配：单颗粒最多堆 **3 个 0.5g 颗粒**（用户要求，
  // 假设本来可以堆叠 10 个 → 改成 3 个）。极端超大堆（>stackMaxMass×maxSpawnParticles
  // = 900g）仍合并以保质量守恒（性能上限，已与用户确认不需要再优化）。
  stackMaxMass: 1.5,
  maxSpawnParticles: 600, // 单次生成粒子数量上限（更大质量仍合并颗粒；已由空间哈希宽相位撑住邻域性能）

  placeAmount: 0.5, // g/次
  collectRadius: 70, // px

  // 可携带物品（集气瓶/烧杯/滴管）交互参数（距离一律为**边缘间隙**：贴边就算，宽池不显远）
  item: {
    collectRange: 90,      // C 拾取物品半径
    liquidRange: 80,       // C 吸液 / X 倒出 / 通入气体的目标容器距离
    dragRange: 480,        // 可拖动滴管的玩家最大距离（中心距离；用户反馈 130 太小 —— 扩大）
    dragSlack: 14,         // 回抓宽限：拖到边界后再抓，允许超出 dragRange 一点也能重新抓住
    beakerCapacity: 200,   // 标准烧杯容量（g；与编辑器烧杯默认 volume 一致）
    beakerTransfer: 20,    // 烧杯每次 C 吸液量（g）
    pourStep: 10,          // 烧杯每次 X 倒出量（g）——分次倒，不再一次全倒
    dropperCapacity: 50,   // 滴管容量（g）
    dropperTransfer: 5,    // 滴管每次 C 吸液量（g）
    bottleCapacity: 5,     // 集气瓶最大集气量（g）
    gasCollectRange: 100,  // 按住 C 集气：找最近气泡柱的距离
    gasRate: 0.05,         // 通入气体速率（g/s）
    placeOffset: 6,        // 放置物品离玩家边缘的间隙（px）
    dragStartPx: 6,        // 按住后移动超过该屏幕距离 → 判定为拖动（不滴）
    dripArmDelay: 0.5,     // 按住多久转"长按持续滴"/"液下吸取"（s；用户明确 >0.5s）——
                           // 留出拖动判定窗口，0.22s 太短，拖动常被误判成长按滴（用户反馈）
    dripPeriod: 0.08,      // 长按持续滴的节奏（s/滴；0fd5314 调定的手感值保留）
    dragAbortPx: 10,       // 长按已开滴后再移动超过该距离 → 停滴转为拖动
    suckPeriod: 0.3,       // 液下长按吸取的节奏（s/手 ≤ dropperTransfer g）
  },

  lampRange: 70, // px（灯提供加热/点燃的半径）
  lampLightRange: 180, // px（灯提供"光照"条件的半径——见光分解如 HClO）
  placeLampRange: 120, // px（放置沉淀到灯上的半径）
  inventory: { slots: 5, capacity: 100, slotPx: 46, itemSlotPx: 58 }, // 物品格在 HUD 中放大（装烧杯/滴管/集气瓶看得清）

  // 移动端（触屏/小屏；桌面 fine-pointer 完全不受影响）
  touch: {
    viewH: 560,    // 移动端相机视野高度基准（世界坐标；手机竖宽 ~390 时恰为此值）
    viewHRef: 390, // 视野基准对应的屏幕短边（px）——大屏平板按短边比例放大视野
    viewHMax: 1040, // 视野放大上限（世界坐标；平板也不会看到超出设计的范围）
    focusBias: 0.14, // 相机跟随偏置（视野高度比例）：视窗中心下移 → 玩家画面偏上，
                     // 不被左上面板/右下控件遮挡（移动端 HUD 压缩的配套）
    padTop: 0.14,  // 顶部探出（视野高度比例，双端）：玩家爬到世界顶时相机继续
                   // 上移探出世界顶边（上方是空天空），玩家不再被钉在屏幕顶缘、
                   // 也不被左上 HUD 卡片盖住上方环境
    hudAlpha: 0.78,  // 移动端左侧 HUD 卡片透明度（面板体；文字不降，保可读）
    hudTop: 48,    // 触屏端顶部 HUD（卡片/按钮）起始 y：让开"返回选关"悬浮钮
    hudTopFs: 92,  // 触屏端全屏时的顶部起始 y：再让开 iOS 系统全屏关闭按钮（左上）
    joyR: 105,     // 摇杆基座半径（px）
    joyDead: 0.22, // 摇杆死区（半径比例；死区内不触发任何方向）
    horizDead: 0.14, // 水平方向死区（半径比例：小幅下倾/抖动不会误触左右）
    btnSize: 58,   // 右下状态按钮边长（px）
    btnGap: 10,    // 按钮间距
    pad: 10,       // 控件到屏幕边距（安全区之外再留）
  },

  doorWinRadius: 80, // px
  worldMargin: 200, // px（出界判定）

  particleSize: 5, // px（沉淀粒子参考尺寸：0.5g 颗粒 = 5px 球）
  particleRefMass: 0.5, // g（粒子尺寸的参照质量）
  // 尺寸随质量缩放：**1.5g（堆叠 3 个 0.5g）时的尺寸 = 0.5g 颗粒的 1.5 倍（7.5px）**，
  // 幂次 log3(1.5)≈0.369（0.5g→5px、1.5g→7.5px 两个锚点精确匹配）；更小质量有下限 3px。
  particleMinSize: 3, // px
  particleMaxSize: 7.5, // px（= 0.5g 颗粒尺寸的 1.5 倍）
};

exports.CFG = CFG;

  };
  __modules["src/core/scene.js"] = function (module, exports, __require) {
// ============================================================================
// Scene：游戏场景调度器
// ----------------------------------------------------------------------------
// 每一刻：玩家输入 → 物理 → 接触事件 → 容器包含 → 化学反应（自反应/接触对/
// 容器内/大气吸收/可燃气体燃烧）→ 网格同步 → 状态判定。
// 同时构造化学引擎所需的 env（每对象条件 + 产物路由）。
// ============================================================================

const { ChemistryEngine } = __require('src/chem/engine.js');;
const { Atmosphere } = __require('src/chem/atmosphere.js');;
const { getSubstance, isSoluble, flameColorOf } = __require('src/chem/substances.js');;
const { CollisionSystem, ContactTracker, overlaps } = __require('src/physics/collision.js');;
const { Particle, splitPile } = __require('src/objects/particle.js');;
const { CELL_SIZE } = __require('src/render/gridrender.js');;
const { Bubble } = __require('src/objects/bubble.js');;
const { Spark } = __require('src/objects/spark.js');;
const { GasColumn } = __require('src/objects/gascolumn.js');;
const { Explosion } = __require('src/objects/explosion.js');;
const { ReactionLabel } = __require('src/objects/reactionlabel.js');;
const { Container } = __require('src/objects/container.js');;
const { Portal } = __require('src/objects/portal.js');;
const { Rope } = __require('src/objects/rope.js');;
const { CFG } = __require('src/core/config.js');;
const { stepPressTap } = __require('src/level/click.js');;

class Scene {
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
    this.debugMode = false; // 调试模式（URL 参数 ?debug=1 开启；.debugmode() 已废弃）
    this.debugPaused = false; // 暂停 tick 推进
    this.debugStepOnce = false; // 手动步进一 tick
    this.overview = false; // 鸟瞰模式（灵魂出窍）：暂停模拟，相机自由缩放/平移看整关

    this.control = new Set(); // 长按（left/right/jump/place/collect/grab/use）
    this.pressed = new Set(); // 本刻刚按下（边缘触发）
    this._events = {};
    this._emitCtx = null;
    this._plumeSeq = 0;
    this._pressTap = null; // 按住的目标（长按持续执行 onTap，如滴管连续滴）
    this._pressTapT = 0; // 距上次触发的时间
    this._pressCand = null; // 按下候选（拖动 vs 点击滴液判定）
    this._pressHome = null; // 长按开滴/开吸时的按下原点（供"再拖动→停滴转拖动"抢断）
    this._drag = null; // 正在拖动的物品（滴管）
    this._holdSuck = null; // 液下长按吸取进行中（{obj,t}；每 suckPeriod 吸一手）
    this._gasHold = null; // 按住 C 集气的集气瓶（Player.update 每帧设置）
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
    fn._czlDead = false; // 取消标记：回调内部调用取消函数时由 runner 读取
    this._tickFns.push(fn);
    return () => {
      fn._czlDead = true;
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
    // 快照当前 tick 函数集，结果收集到新数组——回调内部调用"取消函数"（splice）
    // 才能生效（旧写法 filter 在迭代中把 splice 掉的函数又收回结果，取消形同虚设；
    // onTick 返回的取消在回调里调用是插件常用语义——回放驱动、一次性钩子都依赖它）
    const fns = this._tickFns;
    this._tickFns = [];
    for (const fn of fns) {
      try {
        // 回调内取消（标记 _czlDead）优先于返回值；跨帧取消走 splice
        if (fn(dt, this.time) !== true && !fn._czlDead) this._tickFns.push(fn);
      } catch (err) { /* 插件回调异常不拖垮游戏循环 */ }
    }
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

  // ---------------------------------------------------------------------------
  // 鸟瞰模式（灵魂出窍）：暂停模拟，相机自由缩放/平移看整关（桌面 V 键 /
  // HUD 鸟瞰按钮 / 移动端同按钮进入；滚轮/拖动、双指捏合由鸟瞰输入管线驱动）。
  // ---------------------------------------------------------------------------

  setOverview(on) {
    const v = !!on;
    if (v === this.overview) return v;
    this.overview = v;
    // 进出都清空持续输入与按住状态：摇杆/滴管长按/集气按住不会泄漏到恢复后
    this.control.clear();
    this.pressed.clear();
    this._pressCand = null;
    this._pressTap = null;
    this._pressTapT = 0;
    this._pressHome = null;
    this._drag = null;
    this._holdSuck = null;
    this._gasHold = null;
    if (this.camera) {
      if (v) this.camera.enterOverview();
      else this.camera.exitOverview();
    }
    this.fire('overview', { on: v });
    return v;
  }

  toggleOverview() {
    return this.setOverview(!this.overview);
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

  /** 拾取物品：连同其子体（烧杯杯壁）一起移出场景（背包携带时不在世界上） */
  removeItem(obj) {
    this.removeObject(obj);
    if (obj.subBodies) for (const sb of obj.subBodies) this.removeObject(sb);
  }

  /** 放置物品回场景（子体随 addObject 一并注册；烧杯晚帧 syncWalls 对齐位置） */
  addItem(obj) {
    this.addObject(obj);
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

    // 1.2 长按持续操作（点击管线：按住滴管=持续滴加直到松开/用完；拖动滴管=改变位置）
    stepPressTap(this, dt);

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
    this._gasHold = null; // 集气瓶按住的标记只在本 tick 有效（Player.update 每帧重设）
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

  /** 反应格：优先取"浸入容器内区"的暴露格（真实反应只在液体接触面发生——
   *  物块大部分在水面上时，整面暴露格会把反应点抽到水上方→气泡柱"悬空"）；
   *  无容器/无重叠时回退全部暴露面（大气反应）。 */
  _reactionCells(obj) {
    const pts = obj.grid?.exposedCells ? obj.grid.exposedCells() : [];
    if (!pts.length) return pts;
    const c = obj._container ?? null;
    if (!c || typeof c.innerRect !== 'function') return pts;
    const r = c.innerRect();
    const ox = obj.gridOrigin?.x ?? obj.x;
    const oy = obj.gridOrigin?.y ?? obj.y;
    const wet = [];
    for (const cell of pts) {
      const px = ox + cell.x * CELL_SIZE + CELL_SIZE / 2;
      const py = oy + cell.y * CELL_SIZE + CELL_SIZE / 2;
      // 浸入线：格中心在容器内区（顶面在水面下即算浸入——底部接触也算）
      if (px >= r.x && px <= r.x + r.w && py >= r.y - CELL_SIZE * 0.5 && py <= r.y + r.h) wet.push(cell);
    }
    return wet.length ? wet : pts;
  }

  /** 反应点：优先取**反应格**（浸入溶液表面的暴露格）的随机格中心——气泡/爆炸/
   *  火花在真实反应处冒出；0.5s 时间桶内保持同一点（气流柱/气泡不来回蹦）。 */
  _reactionPoint(obj) {
    if (obj && obj.grid && typeof obj.grid.exposedCells === 'function') {
      const pts = this._reactionCells(obj);
      if (pts.length) {
        const bucket = Math.floor(this.time * 2);
        const idx = Math.abs(Math.floor(((bucket * 2654435761) >>> 0) % pts.length));
        const c = pts[idx];
        const ox = obj.gridOrigin ? obj.gridOrigin.x : obj.x;
        const oy = obj.gridOrigin ? obj.gridOrigin.y : obj.y;
        return { x: ox + c.x * CELL_SIZE + CELL_SIZE / 2, y: oy + c.y * CELL_SIZE + CELL_SIZE / 2 };
      }
    }
    // 容器（池/烧杯）无网格：反应点=最近落点（滴入/产物/玩家放置处）——不再默认容器中心
    if (obj && !obj.grid && obj.depositAt) return { x: obj.depositAt.x, y: obj.depositAt.y };
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
  /** 爆炸焰色集合：反应对象（物块/玩家各物质）焰色 + 容器溶液各溶质焰色
   *  （K 块丢进 CuSO4 池 → 钾紫 + 铜蓝绿并存；不同颜色分别在火星/光晕/余烬上体现）；
   *  最多取 3 种、去重。 */
  _explosionFlameColors() {
    const out = [];
    const push = (id) => {
      const f = flameColorOf(id);
      if (f && !out.includes(f) && out.length < 3) out.push(f);
    };
    const o = this._emitCtx?.obj ?? null;
    const c = this._emitCtx?.container ?? null;
    if (o?.substance) push(o.substance);
    else if (o?.grid && typeof o.grid.ids === 'function') {
      for (const id of o.grid.ids()) push(id);
    }
    if (c?.solution) {
      for (const [id] of c.solution.solutes) push(id);
    }
    return out;
  }

  /** 爆炸的焰色染色（单色兼容接口）：取第一种焰色 */
  _explosionFlameColor() {
    return this._explosionFlameColors()[0] ?? null;
  }

  explode(point, strength, cause = null) {
    const p = point ?? (this._emitCtx ? this._emitCtx.point : { x: this.worldW / 2, y: this.worldH / 2 });
    const R = 150; // 爆炸半径（衰减基准）
    // 视觉 + 屏幕震动；记录最近爆炸原因（HUD 调试面板显示）
    const flip = (this._explosionSeq = (this._explosionSeq ?? 0) + 1) % 2 === 0; // 连续爆炸相位交替，不雷同
    this.addObject(new Explosion({ x: p.x, y: p.y, strength, cause, flip, flames: this._explosionFlameColors() }));
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
  /** 反应面外包（世界坐标 x/y 范围）：大柱覆盖**真实反应面**（浸入容器的暴露格；
   *  微观点位由每 tick 的 reactionPoint 提供——气泡/标签/产物在热点冒出） */
  _exposedBounds(obj) {
    const pts = this._reactionCells(obj);
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
      // 柱宽 = 反应面（暴露面）宽 × 0.6（36~130px）——覆盖反应面但不过分宽大
      const faceW = eb ? eb.x1 - eb.x0 : (srcObj?.w ?? emit.container?.w ?? 48) * 0.6;
      const w = Math.max(36, Math.min(130, faceW * 0.6));
      plume = new GasColumn({
        x: center.x - w / 2, y: point.y - gh, w, h: gh,
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
    // 柱**跟随**当前反应面：源被溶窄/热点移动时，柱的位置/宽度实时更新——
    // 否则旧柱停在原地，形成"空中旧柱 + 液面新柱"的双柱悬空（用户反馈）
    const gh = (srcObj && srcObj.gasHeight) || (emit.container && emit.container.gasHeight) || 80;
    const faceW = eb ? eb.x1 - eb.x0 : (srcObj?.w ?? emit.container?.w ?? 48) * 0.6;
    const w = Math.max(36, Math.min(130, faceW * 0.6));
    plume.x = center.x - w / 2;
    plume.y = point.y - gh;
    plume.w = w;
    plume.h = gh;
    // 气泡视觉：在**当前反应热点**冒出（每 tick 热点在暴露面随机换位 → 气泡沿整个反应面分布）
    const n = Math.max(1, Math.min(6, Math.round(mass * 1.2)));
    for (let i = 0; i < n; i++) {
      const x = point.x + (Math.random() - 0.5) * 22;
      const y = point.y + (dir < 0 ? -(3 + i * 4) : 3 + i * 4);
      this.addObject(new Bubble({ x, y, dir }));
    }
    // 集气瓶截留：按住 C 且背包选中集气瓶时，**距离玩家最近的一处气泡柱**产生的
    // 气体不进大气，直接装入集气瓶（按产气速度收集，5g 封顶；瓶满后恢复正常管线）。
    // 返回"已截留质量"：引擎把它从后续吸收/大气份额中扣除。
    let captured = 0;
    const bottle = this._gasHold;
    if (bottle && this.player && bottle.totalGas() < bottle.capacity - 1e-9 && this._nearestPlume() === plume) {
      captured = bottle.addGas(id, mass);
    }
    return captured;
  }

  /** 距离玩家最近的气泡柱（反应产气的气流；边缘间隙 > 范围返回 null） */
  _nearestPlume() {
    const p = this.player;
    if (!p) return null;
    let best = null;
    let bd = Infinity;
    for (const o of this.objects) {
      if (!(o instanceof GasColumn) || !(o.life > 0)) continue;
      const dx = Math.max(p.x - o.right, o.x - p.right, 0);
      const dy = Math.max(p.y - o.bottom, o.y - p.bottom, 0);
      const d = Math.hypot(dx, dy);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (!best || bd > CFG.item.gasCollectRange) return null;
    return best;
  }

  /**
   * 向容器溶液通入气体（集气瓶 → 最近的烧杯/池）：气泡从注入点冒出，
   * 气体走"碱吸收 → 水溶解 → 剩余进大气"整条管线（forceDissolve 让
   * CO2/SO2/NO2/Cl2 在主动鼓泡时也溶进水——与被动大气吸收的限制不同）。
   */
  bubbleGas(container, id, mass, dt) {
    if (!container || !container.solution || !(mass > 1e-9)) return 0;
    const pt = container.depositAt
      && container.depositAt.x > container.x && container.depositAt.x < container.x + container.w
      && container.depositAt.y > container.y && container.depositAt.y < container.y + container.h
      ? container.depositAt
      : { x: container.x + container.w / 2, y: container.y + Math.min(24, container.h / 2) };
    this._emitCtx = { obj: null, container, player: this.player, point: pt, spread: 14 };
    const env = this.makeEnv(container);
    const ctx = this.chem._ctxOf(container.solutionMat, container.solutionMat, dt, env);
    this.chem._emitGas(id, mass, ctx, { forceDissolve: true });
    return 1;
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
      // 优先取反应上下文容器（干式台子落回台面时显式携带 container——避免
      // _emitCtx 已被后续反应覆盖/大气反应无目标容器时落错地方）
      const cont = product.container ?? (ctx && ctx.container);
      if (cont) {
        // 在反应位置附近生成沉淀颗粒（物理堆叠），记录生成来源（调试悬停显示）；
        // 产物落点成为容器"最近落点"——后续反应/气泡/沉淀围绕它（不再回池中央）
        if (ctx.point) cont.depositAt = { x: ctx.point.x, y: ctx.point.y };
        cont.addPrecipitate(product.id, product.mass, ctx.point, origin);
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

exports.Scene = Scene;

  };
  __modules["src/chem/engine.js"] = function (module, exports, __require) {
// ============================================================================
// 化学引擎 ChemistryEngine —— 高中版
// ----------------------------------------------------------------------------
// 核心职责：给定接触/同处的反应物与量，按质量比逐刻推进，输出产物与量（质量守恒）。
//
// Material 接口（化学引擎只依赖这一抽象，不碰渲染/碰撞）：
//   { phase:'solid'|'solution'|'gas',
//     isPlayer:boolean, container:Material|null,
//     avail(id)->g, consume(id, g)->实际移除, add(id, g), ids()->string[] }
//
// env（每刻的上下文，由调用方构造）：
//   { atmosphere, conditions:{heat,highTemp,ignited,hasCatalyst(id)},
//     globalIgnited, emit(product), explode(point,strength)?, onGas?, explodePoint? }
//
// 反应分层（优先级从高到低，先跑的先消耗共享反应物 = 反应顺序）：
//   L1 REDOX    —— 氧化还原自动配平（redox.js），含浓度/计量比分支
//   L2 IONIC    —— 离子双置换（中和/沉淀/产气，按溶解度判据）
//   L3 CATEGORY —— 类别规则（酸性氧化物+水、金属+非金属化合等）
//   L4 SPECIAL  —— 特例表（分步反应、两性溶解、活泼金属遇水、制气等）
// 爆炸：规则带 explosive 标签 → env.explode；大气可燃气体超爆炸下限遇火 → 爆炸。
// 产物路由：玩家参与 → 固体产物附着玩家；有固体反应物 → 附着（原地转化）；
//           纯溶液反应 → 沉淀成核。
// ============================================================================

const { IONS, ensureSalt, getSubstance, isMoreActive, isSoluble, normId, CONC_HIGH, PASSIVATION_CONC } = __require('src/chem/substances.js');;
const { MIN_ENTRY } = __require('src/chem/solution.js');;
const { RATE, THERMAL_RULES, CATALYTIC_RULES, COMBUSTION_RULES, AUTO_DECOMP_RULES, GAS_REDUCTION_RULES, SOLID_REDUCTION_RULES, SPECIAL_PAIR_RULES, METAL_NONMETAL_RULES, ACID_GAS_RULES, GAS_WATER_RULES, ATMOSPHERE_COMBUSTION_RULES, ATMOSPHERE_SPECIAL_RULES, acidGasRuleFor } = __require('src/chem/rules.js');;
const { OXIDIZERS, REDUCERS, balanceRedox, mediaInfo, STRONG_OXIDIZER } = __require('src/chem/redox.js');;
const { AtmosphereMaterial } = __require('src/chem/atmosphere.js');;

const COMBUSTION_MIN_O2 = 0.05;
const H_ACTIVITY = 10; // 金属活动性顺序中 (H) 的位置
const EXPLOSION_LEL = 0.0008; // 大气可燃气体爆炸下限（质量分数，游戏尺度放宽以便关卡演示）
// "浓"酸阈值（g/L）与钝化浓度定义在 substances.js（反应分支与 UI 标注共用），
// 本文件从 substances.js 导入使用（不再 re-export——构建脚本不支持裸 re-export 语法）

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const abs = Math.abs;

/** 微量限速阈值（g）：低于此质量的溶液溶质在离子反应中按浓度因子限速，
 *  防止"生成速率≈消耗速率"的中间体在 0 附近来回翻转（有→无→有抖动）。 */
const LIMIT_MASS = 0.05;

/** 反应方程式文本（调试悬停/产物溯源用；含全部反应物与产物，不过滤 H2O/气体） */
function reactionEquation(rxIds, pdIds) {
  return `${rxIds.join('+')} → ${pdIds.join('+')}`;
}

function phaseFactor(p1, p2) {
  if (p1 === 'solution' && p2 === 'solution') return 1.0;
  if (p1 === 'gas' || p2 === 'gas') return 0.5;
  if (p1 === 'solution' || p2 === 'solution') return 0.5;
  return 0.1; // 固-固（未溶解，反应慢）
}

/** 是否"真实溶液"（含水介质）：干式台子（酒精灯/喷灯/开关 volume=0 无水）上的
 *  沉淀粉末是固体、不电离，不能当溶液用（phase 恒为 'solution' 是适配器实现细节） */
function hasSolution(m) {
  return !!(m && m.phase === 'solution' && m.solution && m.solution.volume > 0);
}

/** 条件判定：heat/highTemp/ignited/催化/浓+加热/氧分压分支（组合条件全部满足才算真） */
function conditionMet(cond, env, ctx) {
  if (!cond) return false;
  if (cond === 'normal') return true;
  if (cond === 'heat') return !!env.conditions.heat || !!env.conditions.highTemp;
  if (cond === 'highTemp') return !!env.conditions.highTemp;
  if (cond === 'ignited') {
    return !!env.conditions.ignited && env.atmosphere.o2Fraction() > COMBUSTION_MIN_O2;
  }
  if (cond && typeof cond === 'object') {
    if (cond.catalyst !== undefined && !env.conditions.hasCatalyst(cond.catalyst)) return false;
    if (cond.heat !== undefined && !(env.conditions.heat || env.conditions.highTemp)) return false;
    if (cond.highTemp !== undefined && !env.conditions.highTemp) return false;
    if (cond.ignited !== undefined && !(env.conditions.ignited && env.atmosphere.o2Fraction() > COMBUSTION_MIN_O2)) return false;
    if (cond.light !== undefined && !env.conditions.light) return false; // 见光反应（HClO 分解等）
    if (cond.o2 !== undefined) {
      const f = env.atmosphere.o2Fraction();
      if (cond.o2 === 'low' && !(f < 0.15 && f > COMBUSTION_MIN_O2)) return false;
      if (cond.o2 === 'high' && !(f >= 0.15)) return false;
    }
    if (cond.concHigh !== undefined && !(ctx && ctx.acidConc >= CONC_HIGH)) return false;
    // 需"真实溶液"介质（容器有水，volume>0）：干式台子/开阔地固固不满足
    if (cond.solution !== undefined && !(ctx.containerMat && ctx.containerMat.solution && ctx.containerMat.solution.volume > 0)) return false;
    return true; // 组合条件全部满足
  }
  return false;
}

/** 阳离子 → 金属单质 id（'Fe2+'→'Fe'）；非金属（H+、NH4+ 等）返回 null */
function cationToMetal(catId) {
  const m = catId.match(/^[A-Za-z]+/);
  const el = m ? m[0] : '';
  const sub = getSubstance(el);
  return sub.kind === 'metal' ? el : null;
}

class ChemistryEngine {
  constructor() {
    this._logTick = {}; // 玩家反应日志的频率限制（同反应每 ~20 次推进记 1 条）
  }

  /**
   * 记录反应摘要（HUD 显示用）。玩家身上的反应始终记录；
   * 调试模式下记录所有反应（含位置，供"玩家附近反应"面板）。
   * 防抖动处理：
   *  - 反应物按 id 排序，同一反应的不同书写顺序（NH3·H2O+HClO / HClO+NH3·H2O）
   *    归一为同一条日志，配合 Scene 侧限频避免日志面板疯狂刷新；
   *  - 只滤水，气体保留：产气反应必须有日志可见——电解水（2H2O→2H2+O2）、
   *    碳酸分解（CO2）、制氧（H2O2→O2）、制氯等，空气计只能看到"大气里多了
   *    什么气"，看不到"哪个反应产的"；
   *  - 产物只剩水（中和/燃烧生成水，无气体/实体产物）→ 无可见产物，不记录
   *    （这是"反应抖动"日志的主要噪音来源）；
   *  - 反应物只剩水（电解水）→ 保留 H2O 显示，避免出现 "→ H2+O2" 的怪日志。
   */
  _logReaction(ctx, rxIds, pdIds) {
    if (!ctx || !ctx.env.onReaction) return;
    if (!ctx.playerInvolved && !ctx.env.debugMode) return;
    const notWater = (ids) => ids.filter((id) => id !== 'H2O');
    const rx = notWater(rxIds).sort();
    const pd = notWater(pdIds).sort();
    if (pd.length === 0) return;
    if (rx.length === 0) {
      if (!rxIds.some((id) => id === 'H2O')) return;
      rx.push('H2O');
    }
    const text = `${rx.join('+')} → ${pd.join('+')}`;
    ctx.env.onReaction(text);
  }

  // ===========================================================================
  // 对外入口
  // ===========================================================================

  /** 两个物体接触，做一次成对反应（按优先级分层） */
  reactPair(matA, matB, dt, env) {
    if (matA === matB) return;
    const ctx = this._ctxOf(matA, matB, dt, env);
    // L0 关卡自定义反应：最高优先级，匹配即执行并跳过内置反应
    if (this._tryCustomPair(matA, matB, dt, env, ctx)) return;
    // 只有真实溶液（含水介质，含浸在溶液里的固体）才能发生离子/氧化还原/置换反应；
    // 干式台子（酒精灯/喷灯/开关 volume=0 无水）上的粉末是固体、不电离——NaOH 块
    // + 灯上 CuSO4 粉末没有水就不该生成 Cu(OH)2。纯固-固接触只走特例表（铝热等）
    // 与高温固固还原（CuO+C 等）
    const bothSolid = !hasSolution(matA) && !hasSolution(matB);
    if (!bothSolid) {
      this._tryRedoxPair(matA, matB, dt, env, ctx);
      this._tryIonic(matA, matB, dt, env, ctx);
      this._tryDisplacement(matA, matB, dt, env, ctx);
    }
    this._trySpecialPairs(matA, matB, dt, env, ctx);
    this._trySolidReduction(matA, matB, dt, env, ctx);
  }

  /** 单物体自反应：分解/燃烧/还原/溶解/大气吸收/同材料氧化还原
   *  opts.skipDissolution：Scene 层在成对反应后统一溶解时传 true（见 reactSelf 内注释） */
  reactSelf(mat, dt, env, opts = {}) {
    const ctx = this._ctxOf(mat, mat, dt, env);
    // L0 关卡自定义反应（单反应物自反应）：最高优先级
    if (this._tryCustomSelf(mat, dt, env, ctx)) return;
    const sources = (rule) => {
      const s = {};
      for (const r of rule.reactants) {
        s[r.id] = getSubstance(r.id).state === 'gas' ? this._atmMat(env) : mat;
      }
      return s;
    };

    for (const rule of THERMAL_RULES) {
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    for (const rule of CATALYTIC_RULES) {
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    for (const rule of AUTO_DECOMP_RULES) {
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    for (const rule of COMBUSTION_RULES) {
      if (mat.phase !== 'solid') continue; // 容器内粉末不燃烧（避免还原出的 Cu 又被氧化回 CuO）
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    // 固-固还原先于气态还原：CuO+C 粉末优先消耗 C，避免其产物 CO2 被 C+CO2→2CO 抢走碳
    for (const rule of SOLID_REDUCTION_RULES) {
      if (rule.reactants.every((r) => mat.avail(r.id) > 0)) {
        this._runRule(rule, { [rule.reactants[0].id]: mat, [rule.reactants[1].id]: mat }, dt, env, ctx);
      }
    }
    for (const rule of GAS_REDUCTION_RULES) {
      if (mat.phase !== 'solid') continue;
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    // 同材料混合粉末/溶质的氧化还原（KMnO4+FeSO4 同池、CuO+碳粉同灯）
    this._tryRedoxSelf(mat, dt, env, ctx);
    // 同材料特例：Na2O2 遇大气 CO2、CaCO3/Na2CO3 遇大气 CO2 成酸式盐
    this._trySpecialSelf(mat, dt, env, ctx);
    // 同材料特例配对（同一材料里两种溶质/沉淀混合：K2Cr2O7+NaOH 同池、
    // Na2CO3+HCl 分步、Al(OH)3+NaOH 两性溶解等）
    for (const rule of SPECIAL_PAIR_RULES) {
      const [r0, r1] = rule.reactants;
      if (getSubstance(r0.id).state === 'gas' || getSubstance(r1.id).state === 'gas') continue; // 气体规则由 _trySpecialSelf 处理
      if (rule.waterNeeded) continue; // 需水规则（CaCO3/Na2CO3+CO2）由 _trySpecialSelf 处理
      if (mat.avail(r0.id) > 0 && mat.avail(r1.id) > 0) {
        this._runRule(rule, { [r0.id]: mat, [r1.id]: mat }, dt, env, ctx);
      }
    }
    // 同材料离子反应（同池溶质混合：FeCl3+KSCN、NaOH+CuSO4 同池、AgNO3+NaCl 等）
    this._tryIonic(mat, mat, dt, env, ctx);
    // 金属与大气卤素/硫化合（点燃）
    for (const rule of METAL_NONMETAL_RULES) {
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    // 溶解：Scene 层在所有成对反应**之后**统一调用（传 skipDissolution，反应优先于
    // 溶解——玩家 Na2CO3 壳先与池水 Ba(OH)2 反应回血，而不是先被溶解抢走）；
    // 直接调用 reactSelf 的单元测试不传 → 溶解照常（兼容）。
    if (!opts?.skipDissolution) this._tryDissolution(mat, dt, ctx);
    // 固体表面碱被大气酸性气体碳化（NaOH 玩家被 CO2 碳化 → 再生回血）
    this._trySolidGasAbsorb(mat, dt, env, ctx);
    // 容器水吸收大气气体（Cl2 氯水 / NH3 氨水 / SO3 / NO2——见 _tryGasWaterAbsorb）
    if (ctx.inContainer) this._tryGasWaterAbsorb(mat, dt, env, ctx);
  }

  // ===========================================================================
  // 关卡自定义反应（L0 最高优先级）：关卡用 env.customReactions 配置
  // ===========================================================================
  _ruleFromCustom(c) {
    if (!c || !Array.isArray(c.reactants) || !c.reactants.length) return null;
    const norm = (r) => {
      const id = normId(typeof r === 'string' ? r : r.id);
      return { id, coeff: typeof r === 'string' ? 1 : r.coeff || 1 };
    };
    const rule = {
      reactants: c.reactants.map(norm),
      products: (c.products || []).map(norm),
      condition: 'normal', // 无外部条件，常开
      rate: c.rate ?? RATE.custom,
    };
    return rule.reactants.length ? rule : null;
  }

  /** 成对自定义反应：反应物在 A/B 中齐全即执行并返回 true（压制内置反应） */
  _tryCustomPair(matA, matB, dt, env, ctx) {
    const customs = env.customReactions;
    if (!customs || !customs.length) return false;
    for (const c of customs) {
      const rule = this._ruleFromCustom(c);
      if (!rule) continue;
      if (rule.reactants.length >= 2) {
        const [r0, r1] = rule.reactants;
        if (matA.avail(r0.id) > 0 && matB.avail(r1.id) > 0) {
          this._runRule(rule, { [r0.id]: matA, [r1.id]: matB }, dt, env, ctx);
          return true;
        }
        if (matA.avail(r1.id) > 0 && matB.avail(r0.id) > 0) {
          this._runRule(rule, { [r0.id]: matB, [r1.id]: matA }, dt, env, ctx);
          return true;
        }
      } else {
        const r0 = rule.reactants[0];
        if (matA.avail(r0.id) > 0) { this._runRule(rule, { [r0.id]: matA }, dt, env, ctx); return true; }
        if (matB.avail(r0.id) > 0) { this._runRule(rule, { [r0.id]: matB }, dt, env, ctx); return true; }
      }
    }
    return false;
  }

  /** 自定义自反应：单反应物分解，或多反应物在同一材料内（同池两种溶质混合） */
  _tryCustomSelf(mat, dt, env, ctx) {
    const customs = env.customReactions;
    if (!customs || !customs.length) return false;
    for (const c of customs) {
      const rule = this._ruleFromCustom(c);
      if (!rule) continue;
      const srcs = {};
      let all = true;
      for (const r of rule.reactants) {
        if (mat.avail(r.id) <= 0) { all = false; break; }
        srcs[r.id] = mat;
      }
      if (all) {
        this._runRule(rule, srcs, dt, env, ctx);
        return true;
      }
    }
    return false;
  }

  /** 溶液/容器吸收大气中的酸性气体（CO2/SO2/Cl2）→ 盐；酸溶液吸收 NH3 */
  absorbAtmosphereGas(baseMat, dt, env) {
    const ctx = this._ctxOf(baseMat, baseMat, dt, env);
    for (const id of baseMat.ids()) {
      for (const gas of ['CO2', 'SO2', 'Cl2', 'NH3']) {
        const rule = acidGasRuleFor(gas, id);
        if (!rule) continue;
        const gasAvail = env.atmosphere.mass(gas);
        if (gasAvail <= 1e-9) continue;
        const gasMM = getSubstance(gas).mm;
        const baseMM = getSubstance(id).mm;
        const gasPerBase = gasMM / (rule.baseCoeff * baseMM);
        const baseAvail = baseMat.avail(id);
        if (baseAvail <= 0) continue;
        const gasAbsorb = Math.min(gasAvail, baseAvail * gasPerBase, RATE.acidGas * dt * 0.1);
        if (gasAbsorb <= 1e-9) continue;
        this._stamp(ctx, reactionEquation([gas, id], rule.products.map((p) => p.id)));
        baseMat.consume(id, gasAbsorb / gasPerBase);
        env.atmosphere.remove(gas, gasAbsorb);
        const gasMoles = gasAbsorb / gasMM;
        for (const p of rule.products) {
          this._emit(p.id, gasMoles * p.coeff * getSubstance(p.id).mm, ctx);
        }
      }
    }
  }

  /** 大气反应：可燃气体浓度超爆炸下限遇火 → 爆炸；否则缓慢燃烧/特殊反应 */
  reactAtmosphere(env, dt) {
    const atm = env.atmosphere;
    // 可燃气体（H2/CO/CH4/H2S）总量与占比
    const FUELS = ['H2', 'CO', 'CH4', 'H2S'];
    let fuel = 0;
    let total = 0;
    for (const id of Object.keys(atm.composition())) {
      const m = atm.mass(id);
      total += m;
      if (FUELS.includes(id)) fuel += m;
    }
    const frac = total > 0 ? fuel / total : 0;
    // 爆炸：可燃气体超爆炸下限（且积累足够量）+ 点燃源 + O2 达标 → 爆鸣（消耗全部可燃气体与部分 O2）
    if (env.globalIgnited && frac > EXPLOSION_LEL && fuel >= 4 && atm.o2Fraction() > COMBUSTION_MIN_O2) {
      const strength = 6 + fuel * 12;
      // 原因只列"显著"燃料（≥10% 总量，主导者在前），避免把残留的微量 H2 写进爆鸣原因误导
      const cause = `${FUELS.filter((f) => atm.mass(f) > fuel * 0.1).sort((a, b) => atm.mass(b) - atm.mass(a)).join('+') || '可燃气体'} 爆鸣`;
      atm._cause = cause; // 盖章：爆鸣消耗燃料/O2 的原因
      for (const g of FUELS) atm.remove(g, atm.mass(g));
      atm.remove('O2', Math.min(atm.mass('O2'), fuel * 2.5));
      if (env.explode) env.explode(env.explodePoint ?? null, strength, cause);
      return;
    }
    if (!env.globalIgnited) return;
    // 缓慢燃烧（低浓度）与大气特殊反应（合成氨、氨催化氧化）
    const env2 = { ...env, conditions: { ...env.conditions, ignited: true } };
    const atmMat = this._atmMat(env);
    const ctx = this._ctxOf(atmMat, atmMat, dt, env2);
    for (const rule of ATMOSPHERE_COMBUSTION_RULES) {
      const s = {};
      for (const r of rule.reactants) s[r.id] = atmMat;
      this._runRule(rule, s, dt, env2, ctx);
    }
    for (const rule of ATMOSPHERE_SPECIAL_RULES) {
      const s = {};
      for (const r of rule.reactants) s[r.id] = atmMat;
      this._runRule(rule, s, dt, env2, ctx);
    }
    // 白烟：NH3 + HCl → NH4Cl（大气中相遇成固体小颗粒）
    const nh3 = atm.mass('NH3');
    const hcl = atm.mass('HCl');
    if (nh3 > 1e-9 && hcl > 1e-9) {
      const mmNH3 = getSubstance('NH3').mm;
      const mmHCl = getSubstance('HCl').mm;
      const m = Math.min(nh3, (hcl * mmNH3) / mmHCl, RATE.special * dt);
      if (m > 1e-9) {
        this._stamp(ctx, reactionEquation(['NH3', 'HCl'], ['NH4Cl']));
        atm.remove('NH3', m);
        atm.remove('HCl', (m * mmHCl) / mmNH3);
        ctx.env.emit({ id: 'NH4Cl', mass: m * (1 + mmHCl / mmNH3), phase: 'particle' }, ctx.lastRxText);
      }
    }
  }

  // ===========================================================================
  // L1 氧化还原（自动配平）
  // ===========================================================================

  _tryRedoxPair(matA, matB, dt, env, ctx) {
    const cands = this._redoxCandidates(matA, matB, env, ctx);
    for (const c of cands) this._runRedox(c, dt, env, ctx);
  }

  _tryRedoxSelf(mat, dt, env, ctx) {
    const cands = this._redoxCandidates(mat, mat, env, ctx);
    for (const c of cands) this._runRedox(c, dt, env, ctx);
  }

  /** 收集氧化剂×还原剂候选，按氧化剂强度/还原性排序（强氧化剂优先消耗共享还原剂）
   *  干式台子（无水容器）：通用离子氧化还原（金属+盐/酸的置换）不放行——
   *  离子反应需要溶液介质（Fe + FeCl3 → FeCl2 只在**水溶液**中发生；干灯上
   *  铁粉被氯气点燃只会烧到 FeCl3 为止）。设计内的固-固反应（铝热、CuO+碳
   *  还原、金属+卤素化合等）走各自的专用规则表，不经此处，不受影响。 */
  _redoxCandidates(matA, matB, env, ctx) {
    if (ctx.inContainer && !ctx.inLiquid) return [];
    const out = [];
    const oxIdsOf = (mat) => {
      const list = [];
      for (const id of mat.ids()) {
        if (OXIDIZERS[id]) list.push({ oxId: id });
        // 非氧化性酸（HCl/稀 H2SO4）→ 归一为 H+ 氧化剂（金属+酸产 H2）；
        // HNO3 是氧化性酸走 NO3- 还原（表中 HNO3 条目）
        const s = getSubstance(id);
        if (s.ions?.cat === 'H+' && s.kind === 'acid' && id !== 'HNO3' && id !== 'H2SO4') {
          list.push({ oxId: 'H+', acidId: id });
        }
        if (id === 'H2SO4') list.push({ oxId: 'H2SO4', acidId: 'H2SO4' }); // 浓硫酸氧化（稀/常温不氧化见 _isPassivated）
      }
      return list;
    };
    const push = (oxMat, redMat) => {
      for (const { oxId, acidId } of oxIdsOf(oxMat)) {
        const ox = OXIDIZERS[oxId];
        for (const redId of redMat.ids()) {
          if (oxId === redId) continue;
          const red = REDUCERS[redId];
          if (!red) continue;
          // 氧化剂强度门槛（I2 氧化性不足，不能氧化 Fe2+）
          if (red.minOx && (ox.strength ?? 0) < red.minOx) continue;
          if (this._isPassivated(oxId, redId, env, ctx)) continue;
          // 金属+酸：只有活动性在 H 之前的金属能置换出 H2（Cu/Ag 不反应）
          if (oxId === 'H+' || oxId === 'H2SO4') {
            const metal = getSubstance(redId);
            if (metal.kind === 'metal' && !(metal.activity < H_ACTIVITY)) continue;
          }
          // Na/K/Li 遇盐溶液：先与水反应（特例），不直接置换
          if ((redId === 'Na' || redId === 'K' || redId === 'Li') && getSubstance(oxId).kind === 'salt') continue;
          const score = (ox.strength ?? 0) * 100 + (REDOX_REDUCIBILITY[redId] ?? 0);
          out.push({ oxMat, redMat, oxId, redId, acidId: acidId ?? null, score });
        }
      }
    };
    push(matA, matB);
    if (matA !== matB) push(matB, matA);
    out.sort((p, q) => q.score - p.score);
    return out;
  }

  /** 氧化性酸的浓度/温度条件：浓 H2SO4 需"浓+加热"才氧化（Cu 等）；Fe/Al 常温浓酸钝化 */
  _isPassivated(oxId, redId, env, ctx) {
    if (oxId === 'H2SO4') {
      // 稀硫酸/常温不氧化任何金属（只走 H+ 产氢路径）；浓+加热才氧化（Fe/Al 钝化也要加热后）
      if (!(ctx.acidConc >= PASSIVATION_CONC && (env.conditions.heat || env.conditions.highTemp))) return true;
      return false;
    }
    if (oxId !== 'HNO3') return false;
    if (redId !== 'Fe' && redId !== 'Al') return false;
    // Fe/Al 常温遇浓硝酸钝化（加热后反应）
    if (ctx.acidConc >= PASSIVATION_CONC && !(env.conditions.heat || env.conditions.highTemp)) return true;
    return false;
  }

  /** 还原剂"还原性强弱"（同共享氧化剂时强者先反应：I- > Fe2+ > Br-） */
  _pickRedKey(oxId, redId, env, ctx) {
    const red = REDUCERS[redId];
    if (!red.branches) return undefined;
    if (red.branches.weak && red.branches.strong) {
      if (oxId === 'HNO3') {
        // Fe + HNO3 计量比：酸过量（n≥4×nFe）→ Fe3+；Fe 过量 → Fe2+
        const nHNO3 = this._molesOf(ctx, oxId);
        const nFe = this._molesOf(ctx, redId);
        return nHNO3 / Math.max(1e-9, nFe) >= 4 ? 'strong' : 'weak';
      }
      return (OXIDIZERS[oxId].strength ?? 0) >= STRONG_OXIDIZER ? 'strong' : 'weak';
    }
    if (red.branches.full && red.branches.partial) {
      // C：O2 分压决定充分/不充分燃烧
      return env.atmosphere.o2Fraction() > 0.3 ? 'full' : 'partial';
    }
    return undefined;
  }

  /** 配平执行：摩尔推进（质量守恒） */
  _runRedox(cand, dt, env, ctx) {
    const { oxMat, redMat, oxId, redId } = cand;
    const redKey = this._pickRedKey(oxId, redId, env, ctx);
    const acidId = cand.acidId ?? (oxId === 'HNO3' || oxId === 'H+' ? (ctx.acidId || 'H2SO4') : ctx.acidId);
    const eq = balanceRedox(oxId, redId, {
      medium: ctx.medium,
      acidId,
      baseId: ctx.baseId,
      conc: ctx.acidConc,
      redKey,
    });
    if (!eq) return;
    // 防呆：产物与反应物完全同集（如 CuSO4+Cu 同元素往返）→ 跳过
    if (eq.pd.every((p) => eq.rx.some((r) => r.id === p.id))) return;

    const ref = eq.rx[0];
    const refMM = getSubstance(ref.id).mm;
    // 金属+酸（H+ 氧化剂）是教学核心：快速产 H2（否则攒不够爆鸣演示）；
    // 双氧水作还原剂（被氧化放出 O2，如 NaClO+H2O2 制氧）也加快——否则太慢看不见
    let rate = RATE.redox * (oxId === 'H+' ? 8 : 1) * phaseFactor(oxMat.phase, redMat.phase) * (redId === 'H2O2' ? 4 : 1);
    for (const r of eq.rx) {
      const m = this._rxSource(r.id, oxMat, redMat, ctx);
      if (!m) return;
      rate *= this._concFactorFor(m, r.id);
    }
    let units = (rate * dt) / refMM;
    for (const r of eq.rx) {
      const m = this._rxSource(r.id, oxMat, redMat, ctx);
      units = Math.min(units, this._availFor(m, r.id) / (getSubstance(r.id).mm * r.coeff));
    }
    if (!(units > 1e-12)) return;
    // 盖章大气原因（REDOX 可能消耗大气 O2/CO/H2，须在消耗前盖章）
    this._stamp(ctx, reactionEquation(eq.rx.map((r) => r.id), eq.pd.map((p) => p.id)));
    // 按实际消耗推进：固体反应物可能被致密外壳阻断（consume 只取暴露格），
    // 产物必须按"实际移除量"生成，否则会凭空造出产物——如 Fe 被 Cu 壳包住后还在长铜。
    let scale = 1;
    for (const r of eq.rx) {
      const m = this._rxSource(r.id, oxMat, redMat, ctx);
      const take = units * r.coeff * getSubstance(r.id).mm;
      const removed = m.consume(r.id, take);
      if (take > 1e-12) scale = Math.min(scale, removed / take);
    }
    if (!(scale > 1e-9)) return;
    const act = units * scale;
    for (const p of eq.pd) {
      this._emit(p.id, act * p.coeff * getSubstance(p.id).mm, ctx);
    }
    this._logReaction(ctx, eq.rx.map((r) => r.id), eq.pd.map((p) => p.id));
  }

  /** 反应物来源：优先氧化剂/还原剂材料本身，其次介质溶液 */
  _rxSource(id, oxMat, redMat, ctx) {
    if (oxMat.avail(id) > 1e-12 || oxMat.ids().includes(id)) return oxMat;
    if (redMat !== oxMat && (redMat.avail(id) > 1e-12 || redMat.ids().includes(id))) return redMat;
    if (ctx.containerMat && ctx.containerMat.avail(id) > 1e-12) return ctx.containerMat;
    return null;
  }

  _molesOf(ctx, id) {
    if (!ctx.containerMat) return 0;
    return ctx.containerMat.avail(id) / getSubstance(id).mm;
  }

  /**
   * 反应可用量：固体材料用"暴露格"质量（被致密外壳包住的内核不计入反应，
   * 否则产物会按总量凭空生成——如 Fe 被 Cu 壳包住后还在长铜）；溶液/气体用总量。
   */
  _availFor(m, id) {
    return m.exposedAvail ? m.exposedAvail(id) : m.avail(id);
  }

  /**
   * 记录反应方程式并"盖章"给大气（气体产生/消耗原因溯源：本反应的
   * 方程式将出现在大气气体变化日志里）。
   */
  _stamp(ctx, text) {
    ctx.lastRxText = text;
    if (ctx.env && ctx.env.atmosphere) ctx.env.atmosphere._cause = text;
    return text;
  }

  // ===========================================================================
  // L2 离子双置换（中和/沉淀/产气）
  // ===========================================================================

  _tryIonic(matA, matB, dt, env, ctx) {
    // 离子交换需要水性介质（电离发生地）：干式台子（灯/开关 volume=0）上的粉末
    // 是固体不能电离（灯上 NaOH + CuSO4 无水不该生成 Cu(OH)2）；
    // reactPair 已按 hasSolution 拦截，这里兜底 reactSelf 的同材料离子路径
    if (!hasSolution(matA) && !hasSolution(matB)) return;
    for (const idA of matA.ids()) {
      const eA = getSubstance(idA);
      if (!eA.ions) continue;
      for (const idB of matB.ids()) {
        if (idA === idB) continue;
        const eB = getSubstance(idB);
        if (!eB.ions) continue;
        // 不溶物（沉淀/不溶固体）不电离，不能参与离子交换：
        // 只与酸/碱（H+/OH-）反应（溶解/中和），不与盐复分解
        // （如 Fe(OH)2 沉淀 + CuSO4 不反应；Cu(OH)2 + HCl 溶解）
        if (!isSoluble(idA) && eB.kind !== 'acid' && eB.kind !== 'base') continue;
        if (!isSoluble(idB) && eA.kind !== 'acid' && eA.kind !== 'base') continue;
        this._ionicOne(matA, matB, idA, idB, eA, eB, dt, env, ctx);
      }
    }
  }

  _ionicOne(matA, matB, idA, idB, eA, eB, dt, env, ctx) {
    const { cat: catA, an: anA, catCount: xA, anCount: yA } = eA.ions;
    const { cat: catB, an: anB, catCount: xB, anCount: yB } = eB.ions;

    // 金属氧化物（阴离子 O2-）只与酸反应（避免 NaOH+CuO→Cu(OH)2+Na2O 之类的假反应）
    if (anA === 'O2-' && catB !== 'H+') return;
    if (anB === 'O2-' && catA !== 'H+') return;

    const p1 = this._pairInfo(catA, anB, idA, idB);
    const p2 = this._pairInfo(catB, anA, idA, idB);
    if (!p1.drives && !p2.drives) return;

    // 离子不在表中（运行时生成的盐/自定义反应引入的离子）→ 跳过该离子反应，不崩溃
    const c1 = abs(IONS[catA]?.charge ?? 0);
    const a2 = abs(IONS[anB]?.charge ?? 0);
    const c2 = abs(IONS[catB]?.charge ?? 0);
    const a1 = abs(IONS[anA]?.charge ?? 0);
    if (!c1 || !a2 || !c2 || !a1) return;

    const ratio = (yB / c1) * (a2 / xA);
    const mmA = eA.mm;
    const mmB = eB.mm;
    // 微量限速：低于 MIN_IONIC_MASS 的溶液溶质，本 tick 最多反应其总量 × 浓度因子。
    // 否则"生成速率 ≈ 消耗速率"的中间体（如 NH4ClO：NH3·H2O+HClO 生成 0.0002g/tick，
    // NH4ClO+NaOH 立刻吃光）会在 0 附近每 tick 来回翻转——溶液面板"有→无→有"抖动。
    // 限速后中间体累积到非零稳态（生成=消耗×浓度），条目稳定存在。正常量（≥0.05g）
    // 与固体（浓度因子=1）不受影响。
    const molesA_avail = this._availFor(matA, idA) / mmA;
    const molesB_avail = this._availFor(matB, idB) / mmB;
    const limitFactor = (m, id) => {
      const avail = this._availFor(m, id);
      return avail < LIMIT_MASS && m.phase === 'solution' ? this._concFactorFor(m, id) : 1;
    };
    // 弱酸/弱碱（CH3COOH、H2CO3、氨水）电离慢 → 离子反应速率打折（强酸优先）
    const rate = RATE.ionic * phaseFactor(matA.phase, matB.phase)
      * this._concFactorFor(matA, idA) * this._concFactorFor(matB, idB)
      * this._strengthFactor(matA, idA) * this._strengthFactor(matB, idB);
    const molesA_tick = (rate * dt) / mmA;

    const molesA = Math.min(
      molesA_avail * limitFactor(matA, idA),
      molesB_avail * ratio * limitFactor(matB, idB),
      molesA_tick,
    );
    if (!(molesA > 1e-12)) return;
    const molesB = molesA / ratio;
    this._stamp(ctx, reactionEquation([idA, idB], [...p1.products, ...p2.products].map((p) => p.id)));

    const remA = matA.consume(idA, molesA * mmA);
    const remB = matB.consume(idB, molesB * mmB);
    // 固体反应物被外壳阻断时按实际消耗缩放产物（避免凭空生成沉淀/气体）
    let scale = 1;
    if (molesA * mmA > 1e-12) scale = Math.min(scale, remA / (molesA * mmA));
    if (molesB * mmB > 1e-12) scale = Math.min(scale, remB / (molesB * mmB));
    if (!(scale > 1e-9)) return;
    const aA = molesA * scale;
    const aB = molesB * scale;

    const g1 = gcd(c1, a2);
    const g2 = gcd(c2, a1);
    const p1Moles = (aA * xA * g1) / a2;
    const p2Moles = (aB * xB * g2) / a1;
    for (const prod of p1.products) this._emit(prod.id, p1Moles * prod.coeff * getSubstance(prod.id).mm, ctx);
    for (const prod of p2.products) this._emit(prod.id, p2Moles * prod.coeff * getSubstance(prod.id).mm, ctx);
    this._logReaction(ctx, [idA, idB], [...p1.products, ...p2.products].map((p) => p.id));
  }

  /** 酸/碱强度因子：强酸强碱 1，弱酸弱碱 0.1（弱电解质电离慢） */
  _strengthFactor(mat, id) {
    const s = getSubstance(id);
    if (s.kind === 'acid' || s.kind === 'base') {
      return s.acidStrength === 'strong' ? 1 : 0.1;
    }
    return 1;
  }

  /** 一对 (catId, anId) 的产物与是否驱动反应（沉淀/气体/水/显色） */
  _pairInfo(catId, anId, idA, idB) {
    if (catId === 'H+' && anId === 'OH-') return { drives: true, products: [{ id: 'H2O', coeff: 1 }] };
    if (catId === 'H+' && anId === 'CO3^2-') return { drives: true, products: [{ id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }] };
    if (catId === 'H+' && anId === 'HCO3-') return { drives: true, products: [{ id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }] };
    if (catId === 'H+' && anId === 'SO3^2-') return { drives: true, products: [{ id: 'SO2', coeff: 1 }, { id: 'H2O', coeff: 1 }] };
    if (catId === 'H+' && anId === 'S2-') return { drives: true, products: [{ id: 'H2S', coeff: 1 }] };
    if (catId === 'H+' && anId === 'SiO3^2-') return { drives: true, products: [{ id: 'H2SiO3', coeff: 1 }] }; // 硅酸胶状沉淀（水玻璃+酸）
    if (catId === 'NH4+' && anId === 'OH-') return { drives: true, products: [{ id: 'NH3', coeff: 1 }, { id: 'H2O', coeff: 1 }] };
    // 检验铁离子：Fe3+ + 3SCN- → 血红色溶液（显色驱动）
    if (catId === 'Fe3+' && anId === 'SCN-') return { drives: true, products: [{ id: 'Fe(SCN)3', coeff: 1 }] };
    const salt = ensureSalt(catId, anId);
    if (salt.id === idA || salt.id === idB) return { drives: false, products: [] };
    // 驱动判据：不溶 → 沉淀；**微溶**（solubilityLimit，如 Ca(OH)2/Ag2SO4/CaSO4/PbCl2）
    // → 也生成（进溶液，超过饱和浓度时析出——"滴到一定量后溶液变浑浊"）
    return { drives: salt.soluble !== 'soluble' || salt.solubilityLimit > 0, products: [{ id: salt.id, coeff: 1 }] };
  }

  // ===========================================================================
  // L4 特例表 / 固固还原（数据规则）
  // ===========================================================================

  _trySpecialPairs(matA, matB, dt, env, ctx) {
    for (const rule of SPECIAL_PAIR_RULES) this._runPairDataRule(rule, matA, matB, dt, env, ctx);
  }

  _trySolidReduction(matA, matB, dt, env, ctx) {
    for (const rule of SOLID_REDUCTION_RULES) this._runPairDataRule(rule, matA, matB, dt, env, ctx);
  }

  _runPairDataRule(rule, matA, matB, dt, env, ctx) {
    if (rule.atmosphereOnly) return; // 仅大气反应（NH3+HCl 白烟在 reactAtmosphere）
    // 碳酸盐+CO2→酸式盐需有水且非强酸性（酸性环境碳酸盐直接被酸分解产 CO2，不会积累酸式盐）
    if (rule.waterNeeded && !(ctx.inContainer && ctx.containerMat.avail('H2O') > 0)) return;
    if (rule.waterNeeded && ctx.medium === 'acid') return;
    const [r0, r1] = rule.reactants;
    const gas0 = getSubstance(r0.id).state === 'gas';
    const gas1 = getSubstance(r1.id).state === 'gas';
    const src0 = gas0 ? this._atmMat(env) : null;
    const src1 = gas1 ? this._atmMat(env) : null;
    const has0 = (m) => (gas0 ? src0.avail(r0.id) > 0 : m.avail(r0.id) > 0);
    const has1 = (m) => (gas1 ? src1.avail(r1.id) > 0 : m.avail(r1.id) > 0);
    if (has0(matA) && has1(matB)) {
      this._runRule(rule, { [r0.id]: gas0 ? src0 : matA, [r1.id]: gas1 ? src1 : matB }, dt, env, ctx);
    } else if (has0(matB) && has1(matA)) {
      this._runRule(rule, { [r0.id]: gas0 ? src0 : matB, [r1.id]: gas1 ? src1 : matA }, dt, env, ctx);
    }
  }

  /** 同材料自反应特例：Na2O2 遇大气 CO2、碳酸盐遇过量 CO2 成酸式盐 */
  _trySpecialSelf(mat, dt, env, ctx) {
    const atm = env.atmosphere;
    // Na2O2 + CO2（大气）→ Na2CO3 + O2
    if (mat.avail('Na2O2') > 0 && atm.mass('CO2') > 1e-9) {
      const rule = SPECIAL_PAIR_RULES.find((r) => r.reactants[0].id === 'Na2O2' && r.reactants[1].id === 'CO2');
      if (rule) this._runRule(rule, { Na2O2: mat, CO2: this._atmMat(env) }, dt, env, ctx);
    }
    // 溶液/池中的碳酸盐 + 过量大气 CO2 → 碳酸氢盐（少量 CO2 先生成正盐，过量后转化；酸性环境不转化）
    if (ctx.inContainer && ctx.medium !== 'acid' && atm.mass('CO2') > 1e-9 && ctx.containerMat.avail('H2O') > 0) {
      for (const rule of SPECIAL_PAIR_RULES) {
        const [r0, r1] = rule.reactants;
        const gasId = getSubstance(r0.id).state === 'gas' ? r0.id : getSubstance(r1.id).state === 'gas' ? r1.id : null;
        if (gasId !== 'CO2') continue;
        const solidId = r0.id === 'CO2' ? r1.id : r0.id;
        if (mat.avail(solidId) > 0) {
          this._runRule(rule, { [solidId]: mat, CO2: this._atmMat(env) }, dt, env, ctx);
        }
      }
    }
  }

  // ===========================================================================
  // 金属置换（活动性序：仅盐溶液；金属+酸由 REDOX 统一处理）
  // ===========================================================================

  _tryDisplacement(matA, matB, dt, env, ctx) {
    for (let swapped = 0; swapped < 2; swapped++) {
      const A = swapped ? matB : matA;
      const B = swapped ? matA : matB;
      for (const idM of A.ids()) {
        if (getSubstance(idM).kind !== 'metal') continue;
        for (const idE of B.ids()) {
          const e = getSubstance(idE);
          if (!e.ions) continue;
          if (e.kind !== 'salt') continue; // 酸由 REDOX 的 H+ 氧化剂处理
          this._displaceOne(A, B, idM, idE, dt, env, ctx);
        }
      }
    }
  }

  _displaceOne(matM, matE, idM, idE, dt, env, ctx) {
    const m = getSubstance(idM);
    const e = getSubstance(idE);
    const { cat: catE, an: anE } = e.ions;
    const v = m.valence;

    const metalCat = cationToMetal(catE);
    if (!metalCat) return;
    if (!isMoreActive(idM, metalCat)) return; // 前面的金属置换后面的
    const cM = abs(IONS[catE]?.charge ?? 0);
    if (!cM) return; // 离子不在表中 → 跳过置换
    // 金属阳离子：化合价 1 时省略数字（K → K+，不是 K1+）
    const metalCation = `${idM}${v > 1 ? v : ''}+`;
    const salt = ensureSalt(metalCation, anE);
    const saltCatCount = salt.ions.catCount;
    const products = [
      { id: salt.id, coeff: 1 / saltCatCount },
      { id: metalCat, coeff: v / cM },
    ];
    const acidH = v / cM / e.ions.catCount;

    const mmM = m.mm;
    const mmE = e.mm;
    const xTick = (RATE.displace * phaseFactor(matM.phase, matE.phase)
      * this._concFactorFor(matM, idM) * this._concFactorFor(matE, idE) * dt) / mmM;
    const xByM = this._availFor(matM, idM) / mmM;
    const xByE = this._availFor(matE, idE) / mmE / acidH; // 用暴露量：固体盐被致密壳包住时产物不按全量算
    const x = Math.max(0, Math.min(xTick, xByM, xByE));
    if (x <= 1e-12) return;
    this._stamp(ctx, reactionEquation([idM, idE], products.map((p) => p.id)));

    // 按实际消耗推进：金属可能已被致密壳（Cu/氧化物）包住，consume 只取暴露格，
    // 产物按实际置换的摩尔数生成，避免"包好壳后还在凭空长铜"。
    const remM = matM.consume(idM, x * mmM);
    const xAct = remM / mmM;
    if (xAct <= 1e-12) return;
    matE.consume(idE, xAct * acidH * mmE);
    for (const p of products) {
      this._emit(p.id, xAct * p.coeff * getSubstance(p.id).mm, ctx);
    }
    this._logReaction(ctx, [idM, idE], products.map((p) => p.id));
  }

  // ===========================================================================
  // 通用推进（质量守恒核心）
  // ===========================================================================

  /**
   * 执行一条规则：按 rate 与限域试剂推进一个 tick，消耗并产出。
   * 规则带 explosive 标签 → 推进后触发爆炸。
   */
  _runRule(rule, sources, dt, env, ctx) {
    if (!conditionMet(rule.condition, env, ctx)) return;
    const ref = rule.reactants[0];
    const refMM = getSubstance(ref.id).mm;
    let rate = rule.rate;
    for (const r of rule.reactants) {
      const m = sources[r.id];
      if (!m) return;
      rate *= this._concFactorFor(m, r.id);
    }
    let units = (rate * dt) / refMM;

    for (const r of rule.reactants) {
      const m = sources[r.id];
      const mm = getSubstance(r.id).mm;
      units = Math.min(units, this._availFor(m, r.id) / (mm * r.coeff));
    }
    // !(units > 0) 同时拦截 NaN/负值（NaN 比较恒 false，旧写法 units<=0 会放行 NaN）
    if (!(units > 1e-12)) return;
    // 盖章大气原因（燃烧会消耗大气 O2/燃料，须在消耗前盖章）
    this._stamp(ctx, reactionEquation(rule.reactants.map((r) => r.id), rule.products.map((p) => p.id)));

    // 按实际消耗推进：固体反应物被致密外壳阻断时（consume 只取暴露格），产物同步减少，
    // 避免"产物凭空生成"（如 CuO 被还原出的 Cu 包住后还继续产 Cu）。
    let scale = 1;
    let reactedMass = 0;
    for (const r of rule.reactants) {
      const m = sources[r.id];
      const take = units * r.coeff * getSubstance(r.id).mm;
      const removed = m.consume(r.id, take);
      reactedMass += removed;
      if (take > 1e-12) scale = Math.min(scale, removed / take);
    }
    if (!(scale > 1e-9)) return;
    const act = units * scale;
    for (const p of rule.products) {
      this._emit(p.id, act * p.coeff * getSubstance(p.id).mm, ctx);
    }
    this._logReaction(ctx, rule.reactants.map((r) => r.id), rule.products.map((p) => p.id));
    // 反应现象：金属燃烧迸发火星（火星四射——铁/镁/铝等在氧中燃烧的标志现象）
    if (rule.sparks && env.onSpark) env.onSpark();
    // 爆炸：剧烈反应（放热+产气）→ 冲击波（威力∝实际反应量），原因=反应方程式
    if (rule.explosive && env.explode) {
      env.explode(env.explodePoint ?? null, 4 + reactedMass * 1.2, ctx.lastRxText || '剧烈反应');
    }
  }

  /**
   * 可溶固体浸入含水的溶液 → 溶解为溶质。
   * 玩家：非核心的可溶物质（反应附着上去的盐壳）会被池水"洗掉"；
   * 核心物质（=血量）与不溶壳（Cu(OH)2/BaCO3 等）保留。
   */
  _tryDissolution(mat, dt, ctx) {
    if (mat.phase !== 'solid') return;
    const container = mat.container;
    if (!container || container.avail('H2O') <= 0) return;
    const core = mat.obj ? mat.obj.substance : mat.substance; // 玩家核心物质（=血量）
    const isPlayer = mat.isPlayer;
    for (const id of mat.ids()) {
      if (!isSoluble(id)) continue;
      if (isPlayer && id === core) continue; // 玩家核心物质不溶解
      // 玩家全身的可溶物都能洗掉（不限于浸入区域）；物块按浸入区域溶解
      const avail = isPlayer && mat.obj?.grid ? mat.obj.grid.avail(id) : mat.avail(id);
      const mass = Math.min(avail, RATE.dissolution * dt);
      if (mass <= 0) continue;
      if (isPlayer && mat.obj?.grid) mat.obj.grid.consume(id, mass);
      else mat.consume(id, mass);
      container.add(id, mass, { kind: 'dissolve' }); // 固体溶解入池水 → 来源=溶解
    }
  }

  // ===========================================================================
  // 产物路由
  // ===========================================================================

  _ctxOf(matA, matB, dt, env) {
    const containerMat = matA.container || matB.container;
    // 固体反应物（产物附着目标：Fe 浸 CuSO4 表面变铜等）
    const solidObj = (matA.phase === 'solid' && (matA.obj ?? matA.owner))
      ? (matA.obj ?? matA.owner)
      : (matB.phase === 'solid' && (matB.obj ?? matB.owner) ? (matB.obj ?? matB.owner) : null);
    // 玩家核心物质（可溶产物 == 核心 → 附着回血；其余可溶产物进溶液）
    const playerCore = matA.isPlayer ? (matA.obj?.substance ?? matA.substance ?? null)
      : matB.isPlayer ? (matB.obj?.substance ?? matB.substance ?? null)
      : null;
    // 粉末沉淀参与：自由沉淀粒子（amount）或灯上的沉淀（precipitates，如灯上的 Al/CuO 粉末）。
    // 池子里的沉淀是反应产物/沉渣、不是反应物，不算粉末（否则会破坏"沉淀附着回血"等机制）。
    // 粉末 + 物块/玩家反应时，固体产物以沉淀形式生成，不附着到物块表面。
    const isPowder = (obj) => obj && (obj.amount !== undefined || (obj.isLamp && obj.precipitates && obj.precipitates.size > 0));
    const aObj = matA.obj ?? matA.owner;
    const bObj = matB.obj ?? matB.owner;
    const powderInvolved = isPowder(aObj) || isPowder(bObj);
    // 介质判定（溶液强酸/强碱 → REDOX 的 H+/OH- 分支）
    let medium = 'neutral';
    let acidId = null;
    let baseId = null;
    let acidConc = 0;
    const sol = containerMat?.solution ?? (matA.solution ?? matB.solution ?? null);
    if (sol) {
      const info = mediaInfo(sol);
      medium = info.medium;
      acidId = info.acidId;
      if (acidId) acidConc = (sol.mass(acidId) / sol.volume) * 1000;
      if (info.baseId) baseId = info.baseId;
      if (medium === 'acid' && !acidId) medium = 'neutral';
    }
    return {
      env,
      dt,
      inContainer: !!containerMat,
      // 真液介质：容器确实装着液体（容积>0——与 H2O 特例/cond.solution 同一惯例）。
      // 干式台子（灯/开关 volume=0）只是"承载面"——可溶产物**不能**进它的溶液
      // （幽灵溶质：不可见、不可收集、质量凭空消失——用户确认的根因），
      // 要落回台面成固体粉末。
      inLiquid: !!(containerMat && containerMat.solution && containerMat.solution.volume > 0),
      containerMat,
      playerInvolved: matA.isPlayer || matB.isPlayer,
      solidObj,
      playerCore,
      powderInvolved,
      medium,
      acidId,
      baseId,
      acidConc,
      lastRxText: null, // 本反应方程式（每次反应前设置，供产物/气泡溯源）
    };
  }

  _emit(id, mass, ctx) {
    // 挡住 NaN/非法质量（反应数学异常时避免生成 NaN 粒子 → 物品栏质量变 NaN）
    if (!Number.isFinite(mass) || mass <= 1e-9) return;
    const sub = getSubstance(id);

    if (sub.state === 'gas') {
      this._emitGas(id, mass, ctx);
      return;
    }
    if (id === 'H2O') {
      // 水只进"真容器"（池/烧杯等有水介质）；干式台子（灯/开关 volume=0）与开阔地
      // 的水蒸发不建模——否则灯上反应（NH4Cl+Ca(OH)2 制氨等）会把水积进灯里，
      // 干式台子被"弄湿"后触发本不该发生的遇水反应
      if (ctx.inContainer && ctx.containerMat.solution && ctx.containerMat.solution.volume > 0) {
        ctx.containerMat.add('H2O', mass);
      }
      return;
    }
    // 特例：Cu(OH)2 絮状沉淀一律成核沉淀（多缝隙不附着，用户指定）
    if (id === 'Cu(OH)2') {
      if (ctx.inContainer) ctx.env.emit({ id, mass, phase: 'precipitate' }, ctx.lastRxText);
      else ctx.env.emit({ id, mass, phase: 'particle' }, ctx.lastRxText);
      return;
    }
    if (ctx.playerInvolved && sub.state === 'solid') {
      // 玩家参与：可溶产物（非玩家核心）直接进溶液（ZnCl2 溶于盐酸，不堆积在身上）；
      // 核心物质（NaOH 再生回血）与不溶物（BaCO3 壳阻断）附着玩家
      if (isSoluble(id) && id !== ctx.playerCore) {
        if (ctx.inLiquid) {
          ctx.containerMat.add(id, mass, ctx.lastRxText);
          return;
        }
        if (ctx.inContainer) {
          // 干式台子（无水容器）：可溶产物留不下溶液——落回台面成固体粉末
          // （FeCl3/FeCl2 在喷灯上，和铝热的 Fe/Al2O3 一样留在灯上；不留幽灵溶质）
          ctx.env.emit({ id, mass, phase: 'precipitate', container: ctx.containerMat.owner ?? null }, ctx.lastRxText);
          return;
        }
        ctx.env.emit({ id, mass, phase: 'particle' }, ctx.lastRxText);
        return;
      }
      // 玩家核心物质再生：仍附着回血；其他不可溶产物：粉末参与时以沉淀形式生成（玩家也是物块）
      if (id === ctx.playerCore || !ctx.powderInvolved) {
        ctx.env.emit({ id, mass, phase: 'adhere' }, ctx.lastRxText);
        return;
      }
      ctx.env.emit({ id, mass, phase: 'precipitate' }, ctx.lastRxText);
      return;
    }
    if (ctx.solidObj && sub.state === 'solid') {
      // 有固体反应物参与：可溶产物直接进溶液（ZnCl2 不附着在锌块上），
      // 不溶产物附着在反应物表面（Fe 浸 CuSO4 表面就地变铜）
      if (ctx.inLiquid && isSoluble(id)) {
        ctx.containerMat.add(id, mass, ctx.lastRxText);
        return;
      }
      // 干式台子：可溶产物落回台面（无水溶液可进）
      if (ctx.inContainer && isSoluble(id)) {
        ctx.env.emit({ id, mass, phase: 'precipitate', container: ctx.containerMat.owner ?? null }, ctx.lastRxText);
        return;
      }
      // 粉末沉淀 + 物块反应：固体产物以沉淀形式生成（不附着到物块表面）
      if (ctx.powderInvolved) {
        ctx.env.emit({ id, mass, phase: 'precipitate' }, ctx.lastRxText);
        return;
      }
      ctx.env.emit({ id, mass, phase: 'adhere', target: ctx.solidObj }, ctx.lastRxText);
      return;
    }
    if (ctx.inLiquid) {
      if (isSoluble(id)) ctx.containerMat.add(id, mass, ctx.lastRxText);
      else ctx.env.emit({ id, mass, phase: 'precipitate' }, ctx.lastRxText);
      return;
    }
    if (ctx.inContainer) {
      // 干式台子（无水）：可溶产物落回台面成固体粉末（不留幽灵溶液）
      ctx.env.emit({ id, mass, phase: 'precipitate', container: ctx.containerMat.owner ?? null }, ctx.lastRxText);
      return;
    }
    if (ctx.playerInvolved) {
      ctx.env.emit({ id, mass, phase: 'adhere' }, ctx.lastRxText);
      return;
    }
    ctx.env.emit({ id, mass, phase: 'particle' }, ctx.lastRxText);
  }

  /** 气体产物：碱/酸吸收 → 水溶解成酸 → 剩余进大气。
   *  onGas 返回"已截留质量"（集气瓶收集）——截留部分不再走吸收/水溶/大气；
   *  opts.forceDissolve（向溶液通入气体）：CO2/SO2/NO2/Cl2 也能溶进水（主动鼓泡）。 */
  _emitGas(id, mass, ctx, opts = {}) {
    if (!Number.isFinite(mass) || mass <= 1e-9) return;
    if (ctx.env.onGas) {
      const captured = ctx.env.onGas(id, mass, ctx) || 0;
      mass -= captured;
      if (mass <= 1e-9) return;
    }
    let leftover = mass;
    const baseMat = ctx.inContainer ? ctx.containerMat : null;
    // 1. 碱吸收酸性气体 / 酸吸收 NH3（尾气处理、石灰水检验等）
    if (baseMat) {
      for (const base of baseMat.ids()) {
        const rule = acidGasRuleFor(id, base);
        if (!rule) continue;
        const gasMM = getSubstance(id).mm;
        const baseMM = getSubstance(base).mm;
        const gasPerBase = gasMM / (rule.baseCoeff * baseMM);
        const baseAvail = baseMat.avail(base);
        if (baseAvail <= 0) continue;
        const gasAbsorb = Math.min(leftover, baseAvail * gasPerBase, RATE.acidGas * ctx.dt);
        if (gasAbsorb <= 1e-9) continue;
        baseMat.consume(base, gasAbsorb / gasPerBase);
        const gasMoles = gasAbsorb / gasMM;
        for (const p of rule.products) {
          this._emit(p.id, gasMoles * p.coeff * getSubstance(p.id).mm, ctx);
        }
        leftover -= gasAbsorb;
        if (leftover <= 1e-9) return;
      }
    }
    // 2. 水溶解气体（CO2→H2CO3、SO2→H2SO3、SO3→H2SO4、NO2→HNO3+NO、NH3→氨水、
    //    Cl2→氯水溶质）；消耗等摩尔水（防止 H2CO3⇌CO2+H2O 循环无限产水）
    if (leftover > 1e-9 && baseMat && baseMat.avail('H2O') > 0) {
      for (const gw of GAS_WATER_RULES) {
        if (gw.gas !== id) continue;
        // CO2/SO2/NO2/Cl2 不主动溶进水：否则 CO2 形成 H2CO3→CO2 零净循环无限冒泡、
        // NO2 被水转成 NO 逃不出来（浓硝酸红棕变无色）、Cl2 溶成氯水看不到黄绿气体。
        // 它们与碱/水的反应由被动吸收（_tryGasWaterAbsorb/碱吸收）按大气浓度慢慢进行。
        // 主动通入气体（forceDissolve）时除外：玩家把气鼓进水里，就是要它溶解。
        if (gw.gas === 'CO2' || gw.gas === 'SO2' || gw.gas === 'NO2' || gw.gas === 'Cl2') {
          if (!opts.forceDissolve) continue;
        }
        const gasMM = getSubstance(id).mm;
        const diss = Math.min(leftover, RATE.acidGas * ctx.dt * 0.15);
        if (diss <= 1e-9) break;
        const waterNeed = diss / gasMM; // 1 mol 气体配 1 mol 水（简化）
        if (baseMat.avail('H2O') < waterNeed) break;
        baseMat.consume('H2O', waterNeed);
        if (getSubstance(gw.acid).state === 'gas') {
          baseMat.add(gw.acid, (diss * getSubstance(gw.acid).mm) / gasMM, ctx.lastRxText); // 气体溶质（氯水）
        } else {
          this._emit(gw.acid, (diss * getSubstance(gw.acid).mm) / gasMM, ctx);
        }
        if (gw.byGas) this._emit(gw.byGas, (diss * getSubstance(gw.byGas).mm) / gasMM, ctx);
        leftover -= diss;
        break;
      }
    }
    if (leftover > 1e-9) ctx.env.atmosphere.add(id, leftover);
  }

  /**
   * 溶液浓度因子：反应物浓度越低反应越慢（相对其饱和显色浓度；无色溶质用默认参照）。
   * 固体/气体返回 1。范围钳制在 [0.05, 1]，避免反应永远无法完成。
   */
  _concFactorFor(mat, id) {
    if (!mat || mat.phase !== 'solution' || !mat.solution) return 1;
    // 干式台子（酒精灯/喷灯 volume=0，内部无水）不参与浓度计算——
    // 否则 mass/0 = NaN 会污染 rate → 反应推进 NaN → 溶液写入 NaN
    if (!(mat.solution.volume > 0)) return 1;
    if (id === 'H2O') return 1; // 溶剂浓度恒定（避免 water=0 时反应被压到 5%）
    if (mat.owner && mat.owner.precipitates && (mat.owner.precipitates.get(id) ?? 0) > 0) return 1;
    const sub = getSubstance(id);
    const sat = sub.ionColor ? sub.ionColor.sat : 100;
    const gPerL = (mat.solution.mass(id) / mat.solution.volume) * 1000;
    if (!Number.isFinite(gPerL) || gPerL <= 0) return 0.05;
    return Math.max(0.05, Math.min(1, gPerL / sat));
  }

  /** 固体材料表层（暴露格）的碱吸收大气酸性气体 → 附着自身（NaOH 玩家被 CO2 碳化） */
  _trySolidGasAbsorb(mat, dt, env, ctx) {
    if (mat.phase !== 'solid' || !mat.obj || !mat.obj.grid) return;
    const exp = mat.obj.grid.exposedMasses ? mat.obj.grid.exposedMasses() : null;
    if (!exp) return;
    for (const id of Object.keys(exp)) {
      const s = getSubstance(id);
      if (s.kind !== 'base') continue;
      for (const gas of ['CO2', 'SO2', 'Cl2']) {
        const rule = acidGasRuleFor(gas, id);
        if (!rule) continue;
        const gasAvail = env.atmosphere.mass(gas);
        if (gasAvail <= 1e-9) continue;
        const gasMM = getSubstance(gas).mm;
        const baseMM = getSubstance(id).mm;
        const gasPerBase = gasMM / (rule.baseCoeff * baseMM);
        const absorb = Math.min(gasAvail, exp[id] * gasPerBase, RATE.acidGas * dt * 0.05); // 缓慢碳化（玩家有足够时间走到再生池）
        if (absorb <= 1e-9) continue;
        const removedBase = mat.consume(id, absorb / gasPerBase);
        const actAbsorb = removedBase * gasPerBase; // 实际吸收（表层被壳包住时 consume 只取暴露格，会小于请求）
        if (actAbsorb <= 1e-9) continue;
        this._stamp(ctx, reactionEquation([id, gas], rule.products.map((p) => p.id)));
        env.atmosphere.remove(gas, actAbsorb);
        const gasMoles = actAbsorb / gasMM;
        for (const p of rule.products) {
          const pmass = gasMoles * p.coeff * getSubstance(p.id).mm;
          if (p.id === 'H2O') {
            // 水不附着固体：容器内进池水，开阔地蒸发（绝不生成"水沉淀"粒子）
            if (ctx.inContainer) ctx.containerMat.add('H2O', pmass);
            continue;
          }
          // 碳化产物就地附着固体表面（玩家形成 Na2CO3 壳；NaOH 物块同样就地碳化）。
          // 显式 target=反应固体：非玩家物块碳化时不至于找不到目标、把 Na2CO3 撒成游离粒子。
          ctx.env.emit({ id: p.id, mass: pmass, phase: 'adhere', target: mat.obj ?? ctx.solidObj ?? null }, ctx.lastRxText);
        }
        this._logReaction(ctx, [id, gas], rule.products.map((p) => p.id));
      }
    }
  }

  /**
   * 容器水吸收大气气体 → 溶解（Cl2 氯水、NH3 氨水、SO3→H2SO4、NO2→HNO3+NO）。
   * 注意：CO2/SO2 不在此主动吸收——否则 CO2→H2CO3→分解→CO2 的净零循环会让
   * 所有含水容器一直冒 CO2 气泡（CO2/SO2 的溶解只在反应产气时即时发生）。
   */
  _tryGasWaterAbsorb(mat, dt, env, ctx) {
    if (!ctx.inContainer || ctx.containerMat.avail('H2O') <= 0) return;
    const atm = env.atmosphere;
    for (const gw of GAS_WATER_RULES) {
      // CO2/SO2/NO2/Cl2 不主动吸收：CO2/SO2 是分解循环源，NO2 会被立刻吸回转成 NO
      // （浓硝酸红棕变无色），Cl2 溶成氯水看不到黄绿气体。它们在大气中可见、由碱吸收等路径处理。
      if (gw.gas === 'CO2' || gw.gas === 'SO2' || gw.gas === 'NO2' || gw.gas === 'Cl2') continue;

      const gasAvail = atm.mass(gw.gas);
      if (gasAvail <= MIN_ENTRY) continue;
      const gasMM = getSubstance(gw.gas).mm;
      const absorb = Math.min(gasAvail, RATE.acidGas * dt * 0.1);
      // 微量不吸收：吸收量不足 MIN_ENTRY 时让气体留在大气（空气计可见），
      // 避免在溶液里反复生成"0.000g 级"的微量溶质（NH3·H2O 条目翻转）
      if (absorb <= MIN_ENTRY) continue;
      const waterNeed = absorb / gasMM;
      if (ctx.containerMat.avail('H2O') < waterNeed) continue;
      this._stamp(ctx, reactionEquation([gw.gas], [gw.acid, gw.byGas].filter(Boolean)));
      ctx.containerMat.consume('H2O', waterNeed);
      atm.remove(gw.gas, absorb);
      if (getSubstance(gw.acid).state === 'gas') {
        ctx.containerMat.add(gw.acid, (absorb * getSubstance(gw.acid).mm) / gasMM, ctx.lastRxText); // 氯水溶质
      } else {
        this._emit(gw.acid, (absorb * getSubstance(gw.acid).mm) / gasMM, ctx);
      }
      if (gw.byGas) this._emit(gw.byGas, (absorb * getSubstance(gw.byGas).mm) / gasMM, ctx);
    }
  }

  _atmMat(env) {
    return new AtmosphereMaterial(env.atmosphere);
  }
}

// 还原剂"还原性"次序（供候选排序：还原性强者优先被氧化——Cl2 先氧化 I- 再 Fe2+ 再 Br-）
const REDOX_REDUCIBILITY = {
  KI: 100, NaI: 100, H2S: 95, FeS: 95, H2SO3: 80, SO2: 80, Na2SO3: 80,
  FeSO4: 70, FeCl2: 70, H2C2O4: 65, C2H5OH: 60, H2O2: 50, CO: 45, H2: 40,
  C: 30, KBr: 25, NaBr: 25, HCl: 15, Fe: 10, Cu: 9, Zn: 8, Mg: 7, Al: 6,
  Na: 5, K: 5, Li: 5, 'K2MnO4': 40, H2: 40,
};

exports.COMBUSTION_MIN_O2 = COMBUSTION_MIN_O2;
exports.H_ACTIVITY = H_ACTIVITY;
exports.EXPLOSION_LEL = EXPLOSION_LEL;
exports.reactionEquation = reactionEquation;
exports.ChemistryEngine = ChemistryEngine;

  };
  __modules["src/chem/substances.js"] = function (module, exports, __require) {
// ============================================================================
// 物质属性库（PropertyDB）
// ----------------------------------------------------------------------------
// 职责：
//   - 离子表（符号/是否多原子/电荷/离子摩尔质量）
//   - 物质表（分子式作为唯一 id，含摩尔质量/状态/类别/溶解度/颜色/可燃性/金属活动性等）
//   - 从两个离子推导盐的化学式、摩尔质量、溶解度（产物兜底生成，保证"离子推导"可扩展）
// 约定：分子式即 id；正文用 ASCII（CuSO4、Fe(OH)3）。
// ============================================================================

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

// ---------------------------------------------------------------------------
// 离子表
// ---------------------------------------------------------------------------
const IONS = {
  'H+':      { symbol: 'H',   poly: false, charge:  1, mass:  1   },
  'Na+':     { symbol: 'Na',  poly: false, charge:  1, mass: 23   },
  'K+':      { symbol: 'K',   poly: false, charge:  1, mass: 39   },
  'Li+':     { symbol: 'Li',  poly: false, charge:  1, mass: 7    },
  'NH4+':    { symbol: 'NH4', poly: true,  charge:  1, mass: 18   },
  'Ca2+':    { symbol: 'Ca',  poly: false, charge:  2, mass: 40   },
  'Mg2+':    { symbol: 'Mg',  poly: false, charge:  2, mass: 24   },
  'Zn2+':    { symbol: 'Zn',  poly: false, charge:  2, mass: 65   },
  'Fe2+':    { symbol: 'Fe',  poly: false, charge:  2, mass: 56   },
  'Fe3+':    { symbol: 'Fe',  poly: false, charge:  3, mass: 56   },
  'Cu2+':    { symbol: 'Cu',  poly: false, charge:  2, mass: 64   },
  'Al3+':    { symbol: 'Al',  poly: false, charge:  3, mass: 27   },
  'Ag+':     { symbol: 'Ag',  poly: false, charge:  1, mass: 108  },
  'Ba2+':    { symbol: 'Ba',  poly: false, charge:  2, mass: 137  },
  'Pb2+':    { symbol: 'Pb',  poly: false, charge:  2, mass: 207  }, // 铅（PbCrO4 铬黄检验铬酸根）
  'Sr2+':    { symbol: 'Sr',  poly: false, charge:  2, mass: 88   }, // 锶（SrCrO4 黄）
  'Cl-':     { symbol: 'Cl',  poly: false, charge: -1, mass: 35.5 },
  'SO4^2-':  { symbol: 'SO4', poly: true,  charge: -2, mass: 96   },
  'NO3-':    { symbol: 'NO3', poly: true,  charge: -1, mass: 62   },
  'OH-':     { symbol: 'OH',  poly: true,  charge: -1, mass: 17   },
  'CO3^2-':  { symbol: 'CO3', poly: true,  charge: -2, mass: 60   },
  'SO3^2-':  { symbol: 'SO3', poly: true,  charge: -2, mass: 80   },
  'MnO4-':   { symbol: 'MnO4', poly: true, charge: -1, mass: 119  },
  'MnO4^2-': { symbol: 'MnO4', poly: true, charge: -2, mass: 119  },
  'ClO3-':   { symbol: 'ClO3', poly: true, charge: -1, mass: 83.5 },
  'O2-':     { symbol: 'O',   poly: false, charge: -2, mass: 16   },
  'Mn2+':    { symbol: 'Mn',  poly: false, charge:  2, mass: 55   },
  'Cr3+':    { symbol: 'Cr',  poly: false, charge:  3, mass: 52   },
  'Cr2O7^2-':{ symbol: 'Cr2O7', poly: true, charge: -2, mass: 216  },
  'CrO4^2-': { symbol: 'CrO4', poly: true, charge: -2, mass: 116  },
  'S2-':     { symbol: 'S',   poly: false, charge: -2, mass: 32   },
  'Br-':     { symbol: 'Br',  poly: false, charge: -1, mass: 80   },
  'I-':      { symbol: 'I',   poly: false, charge: -1, mass: 127  },
  'HCO3-':   { symbol: 'HCO3', poly: true, charge: -1, mass: 61   },
  'AlO2-':   { symbol: 'AlO2', poly: true, charge: -1, mass: 59   },
  'CH3COO-': { symbol: 'CH3COO', poly: true, charge: -1, mass: 59 },
  'SCN-':    { symbol: 'SCN', poly: true, charge: -1, mass: 58   },
  'ClO-':    { symbol: 'ClO', poly: true, charge: -1, mass: 51.5 },
  'PO4^3-':  { symbol: 'PO4', poly: true, charge: -3, mass: 95   },
  'SiO3^2-': { symbol: 'SiO3', poly: true, charge: -2, mass: 76  },
  'C2O4^2-': { symbol: 'C2O4', poly: true, charge: -2, mass: 88  },
  'CrO2-':   { symbol: 'CrO2', poly: true, charge: -1, mass: 68  },
};

// 有色离子在溶液中的显色（饱和浓度参照，单位 g 离子 / L 溶液，可调）
const ION_COLORS = {
  'Cu2+':    { color: '#00e7ff', sat: 150 },
  'Fe3+':    { color: '#ffbb00', sat: 250 },
  'Fe2+':    { color: '#11ff24', sat: 150 },
  'MnO4-':   { color: '#a54ac9', sat: 60  },
  'MnO4^2-': { color: '#2e8b57', sat: 40  },
  'Cr2O7^2-':{ color: '#ff6a3d', sat: 80  }, // 重铬酸根 橙红
  'CrO4^2-': { color: '#ffd23f', sat: 80  }, // 铬酸根 黄
  'Cr3+':    { color: '#3fbf7f', sat: 100 }, // 三价铬 绿
  'S2-':     { color: '#ffe9a8', sat: 100 }, // 硫离子 淡黄（硫化钠溶液）
};

// ---------------------------------------------------------------------------
// 公式与盐推导
// ---------------------------------------------------------------------------
function canonicalFormula(catId, cc, anId, ac) {
  if (catId === 'H+' && anId === 'OH-') return 'H2O'; // H+OH- → 规范写作 H2O
  const cat = IONS[catId] ?? { symbol: catId, poly: false };
  const an = IONS[anId] ?? { symbol: anId, poly: false };
  const catPart = cat.poly && cc > 1 ? `(${cat.symbol})${cc}` : cat.symbol + (cc > 1 ? cc : '');
  const anPart = an.poly && ac > 1 ? `(${an.symbol})${ac}` : an.symbol + (ac > 1 ? ac : '');
  return catPart + anPart;
}

/** 由阳离子 + 阴离子推导盐：{ formula, catCount, anCount, mm } */
function buildSalt(catId, anId) {
  const cat = IONS[catId];
  const an = IONS[anId];
  // 未知离子（运行时生成/自定义反应引入）：兜底不崩溃，按 1:1 假盐处理并记录一次，便于定位
  if (!cat || !an) {
    console.warn(`[化学] 离子不在表：${catId}(${cat ? '有' : '无'}) / ${anId}(${an ? '有' : '无'})`);
    const c = cat ?? { symbol: catId, charge: 1, mass: 20 };
    const a = an ?? { symbol: anId, charge: -1, mass: 35 };
    return { formula: `${catId}(${anId})`, catCount: 1, anCount: 1, mm: c.mass + a.mass };
  }
  const g = gcd(Math.abs(cat.charge), Math.abs(an.charge));
  const cc = Math.abs(an.charge) / g;
  const ac = Math.abs(cat.charge) / g;
  return {
    formula: canonicalFormula(catId, cc, anId, ac),
    catCount: cc,
    anCount: ac,
    mm: cc * cat.mass + ac * an.mass,
  };
}

/** 常温常压下在水中的溶解性（高中溶解度规则：钾钠铵硝全溶…） */
function solubilityOf(catId, anId) {
  if (anId === 'NO3-') return 'soluble';                       // 硝酸盐全溶
  if (catId === 'Na+' || catId === 'K+' || catId === 'NH4+') return 'soluble'; // 碱金属/铵盐全溶
  if (anId === 'Cl-' || anId === 'Br-' || anId === 'I-') {
    // 卤化银难溶（AgCl 白 / AgBr 淡黄 / AgI 黄——检验卤离子）；其余卤化物可溶（Hg2Cl2/PbCl2 微溶省略）
    return catId === 'Ag+' ? 'insoluble' : 'soluble';
  }
  if (anId === 'SO4^2-') return catId === 'Ba2+' ? 'insoluble' : 'soluble';    // 硫酸盐除 BaSO4（CaSO4/PbSO4 微溶省略）
  if (anId === 'CO3^2-' || anId === 'SO3^2-') return 'insoluble';              // 碳酸盐/亚硫酸盐不溶（碱金属铵盐已在上面返回）
  if (anId === 'S2-') return 'insoluble';                      // 硫化物：碱金属/铵盐溶（上面返回），其余 FeS/CuS/ZnS 不溶
  if (anId === 'CrO4^2-') {
    // 铬酸盐：Ba/Pb/Sr/Ag 难溶（BaCrO4 黄、PbCrO4 铬黄、SrCrO4 黄、Ag2CrO4 砖红），其余溶
    return ['Ba2+', 'Pb2+', 'Sr2+', 'Ag+'].includes(catId) ? 'insoluble' : 'soluble';
  }
  if (anId === 'HCO3-' || anId === 'AlO2-' || anId === 'SCN-' || anId === 'ClO-') return 'soluble'; // 碳酸氢盐/偏铝酸盐/硫氰酸盐/次氯酸盐可溶
  if (anId === 'OH-') {
    if (catId === 'Na+' || catId === 'K+' || catId === 'Ba2+' || catId === 'Ca2+') return 'soluble';
    return 'insoluble';                                        // 不溶性碱（游戏内 Ca(OH)2 视为可溶）
  }
  return 'soluble';
}

/** 由阳/阴离子判定物质类别 */
function kindOf(catId, anId) {
  if (catId === 'H+') return 'acid';
  if (anId === 'OH-') return 'base';
  if (anId === 'O2-') return 'oxide';
  return 'salt';
}

/** 由两个离子生成一条"盐"物质记录（产物兜底） */
function saltEntry(catId, anId, over = {}) {
  const { formula, catCount, anCount, mm } = buildSalt(catId, anId);
  const soluble = solubilityOf(catId, anId);
  const kind = kindOf(catId, anId);
  const ionColor = ION_COLORS[catId] || ION_COLORS[anId] || null;
  return {
    id: formula,
    mm,
    state: 'solid',
    kind,
    soluble,
    ions: { cat: catId, an: anId, catCount, anCount },
    solid: over.solid ?? (soluble ? ['#e9e9e9'] : ['#9a9a9a']),
    ...(ionColor ? { ionColor } : {}),
    ...over,
  };
}

/** 离子推导产物：不存在则自动登记（保证溶解度/颜色/摩尔质量正确） */
function ensureSalt(catId, anId) {
  const { formula } = buildSalt(catId, anId);
  if (SUBSTANCES[formula]) return SUBSTANCES[formula];
  const entry = saltEntry(catId, anId);
  SUBSTANCES[formula] = entry;
  return entry;
}

// ---------------------------------------------------------------------------
// 物质表
// ---------------------------------------------------------------------------
function defineSalt(catId, anId, over = {}) {
  const e = saltEntry(catId, anId, over);
  SUBSTANCES[e.id] = e;
  return e;
}

const SUBSTANCES = {};

// --- 水 / 过氧化氢 / 碳酸（不稳定）---
SUBSTANCES['H2O'] = { id: 'H2O', mm: 18, state: 'liquid', kind: 'water', soluble: 'na' };
SUBSTANCES['H2O2'] = { id: 'H2O2', mm: 34, state: 'liquid', kind: 'other', soluble: 'soluble', solid: ['#d8f6ff'] };
SUBSTANCES['H2CO3'] = { id: 'H2CO3', mm: 62, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'HCO3-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] }; // 碳酸（第一步电离为主）

// --- 酸（acidStrength: 强酸全电离 / 弱酸部分电离，影响 pH）---
SUBSTANCES['HCl'] = { id: 'HCl', mm: 36.5, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'H+', an: 'Cl-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['H2SO4'] = { id: 'H2SO4', mm: 98, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'H+', an: 'SO4^2-', catCount: 2, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['HNO3'] = { id: 'HNO3', mm: 63, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'H+', an: 'NO3-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['H2SO3'] = { id: 'H2SO3', mm: 82, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'SO3^2-', catCount: 2, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['H3PO4'] = { id: 'H3PO4', mm: 98, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'PO4^3-', catCount: 3, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['HClO'] = { id: 'HClO', mm: 52.5, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'ClO-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['CH3COOH'] = { id: 'CH3COOH', mm: 60, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'CH3COO-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] };

// --- 碱（acidStrength 同用于碱的电离强弱）---
SUBSTANCES['NaOH'] = { id: 'NaOH', mm: 40, state: 'solid', kind: 'base', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'Na+', an: 'OH-', catCount: 1, anCount: 1 }, solid: ['#ffffff'] };
SUBSTANCES['KOH'] = { id: 'KOH', mm: 56, state: 'solid', kind: 'base', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'K+', an: 'OH-', catCount: 1, anCount: 1 }, solid: ['#ffffff'] };
SUBSTANCES['Ca(OH)2'] = { id: 'Ca(OH)2', mm: 74, state: 'solid', kind: 'base', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'Ca2+', an: 'OH-', catCount: 1, anCount: 2 }, solid: ['#f4f4f4'], solubilityLimit: 12 }; // 微溶（游戏值 12g/L：200ml 池滴约 3~4 次才达饱和——先浑浊后沉淀）
SUBSTANCES['Cu(OH)2'] = { id: 'Cu(OH)2', mm: 98, state: 'solid', kind: 'base', soluble: 'insoluble', ions: { cat: 'Cu2+', an: 'OH-', catCount: 1, anCount: 2 }, solid: ['#00afff'] };
SUBSTANCES['Fe(OH)3'] = { id: 'Fe(OH)3', mm: 107, state: 'solid', kind: 'base', soluble: 'insoluble', ions: { cat: 'Fe3+', an: 'OH-', catCount: 1, anCount: 3 }, solid: ['#002929'] };
SUBSTANCES['Mg(OH)2'] = { id: 'Mg(OH)2', mm: 58, state: 'solid', kind: 'base', soluble: 'insoluble', ions: { cat: 'Mg2+', an: 'OH-', catCount: 1, anCount: 2 }, solid: ['#f2f2f2'] };
SUBSTANCES['Fe(OH)2'] = { id: 'Fe(OH)2', mm: 90, state: 'solid', kind: 'base', soluble: 'insoluble', ions: { cat: 'Fe2+', an: 'OH-', catCount: 1, anCount: 2 }, solid: ['#c9ffd4'] };

// --- 盐（用 defineSalt 生成，颜色可覆盖）---
defineSalt('Na+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Cu2+', 'SO4^2-', { solid: ['#b7e4ff'] });
defineSalt('Na+', 'SO4^2-', { solid: ['#ffffff'] });
defineSalt('Fe3+', 'Cl-', { solid: ['#ffd9a8'] });
defineSalt('Fe2+', 'Cl-', { solid: ['#c9ffd4'] });
defineSalt('Fe2+', 'SO4^2-', { solid: ['#c9ffd4'] });
defineSalt('Cu2+', 'Cl-', { solid: ['#b7e4ff'] });
defineSalt('Zn2+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Mg2+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Ca2+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Ba2+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Ca2+', 'SO4^2-', { solid: ['#ffffff'], solubilityLimit: 10 }); // CaSO4 微溶（游戏值 10g/L）
defineSalt('Na+', 'CO3^2-', { solid: ['#ffffff'], dense: true }); // Na2CO3 致密晶形壳：碳化壳真正保护内核——挡 CO2 继续碳化（自限）、挡酸蚀从外到内逐层剥壳（否则盐酸穿透壳掏空内核成碎片）
defineSalt('Ca2+', 'CO3^2-', { solid: ['#f2f2f2'], dense: true });   // CaCO3 晶形致密（石灰水检验）
defineSalt('Ba2+', 'SO4^2-', { solid: ['#ffffff'], dense: true });  // BaSO4 致密（检验硫酸根）
defineSalt('Ag+', 'Cl-', { solid: ['#ffffff'], dense: true });      // AgCl 致密（检验氯离子）
defineSalt('Ag+', 'Br-', { solid: ['#f2e3b0'] });                   // AgBr 淡黄↓（检验溴离子）
defineSalt('Ag+', 'I-', { solid: ['#ffe98a'] });                    // AgI 黄↓（检验碘离子）
defineSalt('Ag+', 'NO3-', { solid: ['#ffffff'] });
defineSalt('Ag+', 'SO4^2-', { solid: ['#ffffff'], solubilityLimit: 20 }); // Ag2SO4 微溶（游戏值 20g/L）
defineSalt('Pb2+', 'NO3-', { solid: ['#ffffff'] });  // Pb(NO3)2 硝酸铅（离子双置换的铅源）
defineSalt('Pb2+', 'Cl-', { solid: ['#ffffff'], solubilityLimit: 20 }); // PbCl2 微溶（游戏值 20g/L）
defineSalt('Sr2+', 'NO3-', { solid: ['#ffffff'] });  // Sr(NO3)2 硝酸锶
defineSalt('Cu2+', 'NO3-', { solid: ['#b7e4ff'] });
defineSalt('Fe3+', 'NO3-', { solid: ['#ffd9a8'] });
defineSalt('Al3+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Al3+', 'SO4^2-', { solid: ['#ffffff'] });
defineSalt('Fe3+', 'SO4^2-', { solid: ['#ffd9a8'] });
defineSalt('Zn2+', 'SO4^2-', { solid: ['#ffffff'] });
defineSalt('Mg2+', 'SO4^2-', { solid: ['#ffffff'] });
defineSalt('K+', 'NO3-', { solid: ['#ffffff'] });
defineSalt('K+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('K+', 'CO3^2-', { solid: ['#ffffff'] });
defineSalt('Na+', 'SO3^2-', { solid: ['#ffffff'] });
defineSalt('Ca2+', 'SO3^2-', { solid: ['#f2f2f2'] });
defineSalt('NH4+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Na+', 'NO3-', { solid: ['#ffffff'] });
defineSalt('K+', 'MnO4-', { solid: ['#d8b3e8'] });
defineSalt('K+', 'MnO4^2-', { solid: ['#a8d8b8'] });
defineSalt('K+', 'ClO3-', { solid: ['#ffffff'] });
defineSalt('K+', 'SO3^2-', { solid: ['#ffffff'] });
// KMnO4 分解产物 K2MnO4 由 K+ + MnO4^2- 生成（id: K2MnO4），已覆盖。

// --- 高中扩展盐（锰/铬系、碳酸氢盐、硫化物、卤化物、检验试剂等）---
defineSalt('Mn2+', 'SO4^2-', { solid: ['#f2e3d8'] });   // MnSO4 肉粉
defineSalt('Mn2+', 'Cl-', { solid: ['#f2e3d8'] });     // MnCl2 肉粉
defineSalt('Cr3+', 'Cl-', { solid: ['#2fbf7f'] });     // CrCl3 绿
defineSalt('Cr3+', 'SO4^2-', { solid: ['#2fbf7f'] });  // Cr2(SO4)3 绿
defineSalt('K+', 'Cr2O7^2-', { solid: ['#ff6a3d'] });  // K2Cr2O7 橙红
defineSalt('K+', 'CrO4^2-', { solid: ['#ffd23f'] });   // K2CrO4 黄
defineSalt('Ca2+', 'Cr2O7^2-', { solid: ['#ff6a3d'] });// CaCr2O7 橙红（重铬酸钙）
defineSalt('Ca2+', 'CrO4^2-', { solid: ['#ffd23f'] }); // CaCrO4 黄（铬酸钙）
defineSalt('Ba2+', 'CrO4^2-', { solid: ['#ffd23f'], dense: true }); // BaCrO4 黄↓（检验铬酸根，致密）
defineSalt('Pb2+', 'CrO4^2-', { solid: ['#ffc93d'], dense: true }); // PbCrO4 铬黄↓（经典检验铬酸根）
defineSalt('Sr2+', 'CrO4^2-', { solid: ['#ffe066'] }); // SrCrO4 黄↓
defineSalt('Ag+',  'CrO4^2-', { solid: ['#b8563a'], dense: true }); // Ag2CrO4 砖红↓（微溶→按难溶处理）
defineSalt('Ba2+', 'CO3^2-', { solid: ['#ffffff'], dense: true });  // BaCO3 白↓（致密晶形：附着后阻断反应）
defineSalt('Ba2+', 'OH-', { acidStrength: 'strong', solid: ['#f4f4f4'] }); // Ba(OH)2 强碱
defineSalt('Na+', 'HCO3-', { solid: ['#ffffff'] });    // NaHCO3
defineSalt('Ca2+', 'HCO3-', { solid: ['#ffffff'] });   // Ca(HCO3)2 可溶
defineSalt('Na+', 'AlO2-', { solid: ['#ffffff'] });    // NaAlO2 偏铝酸钠
defineSalt('Fe2+', 'S2-', { solid: ['#3a3a3a'] });     // FeS 黑↓
defineSalt('K+', 'Br-', { solid: ['#ffffff'] });
defineSalt('Na+', 'Br-', { solid: ['#ffffff'] });
defineSalt('Li+', 'Cl-', { solid: ['#ffffff'] });        // LiCl（焰色紫红演示）
defineSalt('K+', 'I-', { solid: ['#ffffff'] });
defineSalt('K+', 'SCN-', { solid: ['#ffffff'] });      // KSCN 检验 Fe3+
defineSalt('Fe3+', 'SCN-', { ionColor: { color: '#ff2244', sat: 30 }, solid: ['#ff2244'] }); // Fe(SCN)3 血红色溶液
defineSalt('Na+', 'ClO-', { solid: ['#ffffff'] });     // NaClO 漂白液
defineSalt('Ca2+', 'ClO-', { solid: ['#ffffff'] });    // Ca(ClO)2 漂白粉
defineSalt('Na+', 'SiO3^2-', { solid: ['#ffffff'] });  // Na2SiO3 水玻璃
SUBSTANCES['H2SiO3'] = { id: 'H2SiO3', mm: 78, state: 'solid', kind: 'acid', soluble: 'insoluble', solid: ['#f0f0f0'] }; // 硅酸（胶状沉淀：Na2SiO3 + 酸 → H2SiO3↓）
defineSalt('Cr3+', 'OH-', { solid: ['#8fb8a8'] });     // Cr(OH)3 灰绿↓（两性）
defineSalt('Al3+', 'OH-', { solid: ['#f2f2f2'] });     // Al(OH)3 白↓（两性）
defineSalt('Li+', 'OH-', { solid: ['#ffffff'] });      // LiOH
defineSalt('Na+', 'CrO2-', { solid: ['#e8e8e8'] });    // NaCrO2 亚铬酸钠
defineSalt('K+', 'ClO-', { solid: ['#ffffff'] });      // KClO 次氯酸钾
defineSalt('Cu2+', 'S2-', { solid: ['#2a2a2a'] });     // CuS 黑↓
defineSalt('NH4+', 'SO4^2-', { solid: ['#ffffff'] });  // (NH4)2SO4
defineSalt('NH4+', 'HCO3-', { solid: ['#ffffff'] });   // NH4HCO3 碳酸氢铵

// --- 金属氧化物（视为"电解质"，离子中阴离子为 O2-，可参与离子双置换）---
SUBSTANCES['CuO'] = { id: 'CuO', mm: 80, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Cu2+', an: 'O2-', catCount: 1, anCount: 1 }, solid: ['#222222'] };
SUBSTANCES['FeO'] = { id: 'FeO', mm: 72, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Fe2+', an: 'O2-', catCount: 1, anCount: 1 }, solid: ['#3a3a3a'] };
SUBSTANCES['Fe2O3'] = { id: 'Fe2O3', mm: 160, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Fe3+', an: 'O2-', catCount: 2, anCount: 3 }, solid: ['#ff5f00'] };
SUBSTANCES['Fe3O4'] = { id: 'Fe3O4', mm: 232, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: null, solid: ['#111111'] }; // 混合价，走特例规则
SUBSTANCES['MgO'] = { id: 'MgO', mm: 40, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Mg2+', an: 'O2-', catCount: 1, anCount: 1 }, solid: ['#f2f2f2'] };
SUBSTANCES['CaO'] = { id: 'CaO', mm: 56, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Ca2+', an: 'O2-', catCount: 1, anCount: 1 }, solid: ['#f2f2f2'] };
SUBSTANCES['Al2O3'] = { id: 'Al2O3', mm: 102, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Al3+', an: 'O2-', catCount: 2, anCount: 3 }, solid: ['#f2f2f2'] };
SUBSTANCES['P2O5'] = { id: 'P2O5', mm: 142, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: null, solid: ['#e8e8e8'] };
// --- 高中扩展氧化物（钠/过氧化钠、铬绿、硅、碱式碳酸铜）---
SUBSTANCES['K2O'] = { id: 'K2O', mm: 94, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'K+', an: 'O2-', catCount: 2, anCount: 1 }, solid: ['#e8e8e8'] };
SUBSTANCES['Na2O'] = { id: 'Na2O', mm: 62, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Na+', an: 'O2-', catCount: 2, anCount: 1 }, solid: ['#e8e8e8'] };
SUBSTANCES['Na2O2'] = { id: 'Na2O2', mm: 78, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: null, peroxide: true, solid: ['#f2f2f2'] }; // 过氧化钠：遇水/CO2 歧化放 O2
SUBSTANCES['Cr2O3'] = { id: 'Cr2O3', mm: 152, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Cr3+', an: 'O2-', catCount: 2, anCount: 3 }, amphoteric: true, solid: ['#2fbf7f'] };
SUBSTANCES['SiO2'] = { id: 'SiO2', mm: 60, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: null, solid: ['#b8c8d8'] }; // 二氧化硅（玻璃/砂）
SUBSTANCES['Cu2(OH)2CO3'] = { id: 'Cu2(OH)2CO3', mm: 222, state: 'solid', kind: 'other', soluble: 'insoluble', ions: null, solid: ['#2fbf8f'] }; // 碱式碳酸铜（铜绿）

// --- 金属（含活动性序与置换化合价）---
// 活动性：数值越小越活泼（按金属活动性顺序 K Ca Na Mg Al Zn Fe Sn Pb (H) Cu Hg Ag Pt Au 编号 1..15，H=10）。
SUBSTANCES['Cu'] = { id: 'Cu', mm: 64, state: 'solid', kind: 'metal', soluble: 'na', valence: 2, activity: 11, flammable: true, dense: true, solid: ['#ff8f46'] }; // 还原产物金属致密（低浓度时不阻断——见 _isDense 占比阈值）
SUBSTANCES['Fe'] = { id: 'Fe', mm: 56, state: 'solid', kind: 'metal', soluble: 'na', valence: 2, activity: 7, flammable: true, solid: ['#fdfdfd'] };
SUBSTANCES['Zn'] = { id: 'Zn', mm: 65, state: 'solid', kind: 'metal', soluble: 'na', valence: 2, activity: 6, flammable: true, solid: ['#c8c8c8'] };
SUBSTANCES['Mg'] = { id: 'Mg', mm: 24, state: 'solid', kind: 'metal', soluble: 'na', valence: 2, activity: 4, flammable: true, solid: ['#cfcfcf'] };
SUBSTANCES['Al'] = { id: 'Al', mm: 27, state: 'solid', kind: 'metal', soluble: 'na', valence: 3, activity: 5, flammable: true, solid: ['#d9d9d9'] };
SUBSTANCES['Ag'] = { id: 'Ag', mm: 108, state: 'solid', kind: 'metal', soluble: 'na', valence: 1, activity: 13, flammable: false, dense: true, solid: ['#e8e8e8'] }; // 银镜致密

// --- 碱金属（极活泼：遇水剧烈反应产 H2，火焰变色）---
SUBSTANCES['Na'] = { id: 'Na', mm: 23, state: 'solid', kind: 'metal', soluble: 'na', valence: 1, activity: 3, flammable: true, flameColor: '#ffd23f', solid: ['#e0e0e0'] };
SUBSTANCES['K'] = { id: 'K', mm: 39, state: 'solid', kind: 'metal', soluble: 'na', valence: 1, activity: 1, flammable: true, flameColor: '#c78bff', solid: ['#cfcfe8'] };
SUBSTANCES['Li'] = { id: 'Li', mm: 7, state: 'solid', kind: 'metal', soluble: 'na', valence: 1, activity: 2, flammable: true, flameColor: '#ff5fd0', solid: ['#d8d8f0'] }; // 锂：焰色紫红

// --- 非金属单质（可燃）---
SUBSTANCES['C'] = { id: 'C', mm: 12, state: 'solid', kind: 'nonmetal', soluble: 'na', flammable: true, solid: ['#2a2a2a'] };
SUBSTANCES['S'] = { id: 'S', mm: 32, state: 'solid', kind: 'nonmetal', soluble: 'na', flammable: true, solid: ['#f7e242'] };
SUBSTANCES['P'] = { id: 'P', mm: 31, state: 'solid', kind: 'nonmetal', soluble: 'na', flammable: true, solid: ['#e8e0d0'] };
SUBSTANCES['I2'] = { id: 'I2', mm: 254, state: 'solid', kind: 'nonmetal', soluble: 'soluble', ionColor: { color: '#8b5a2b', sat: 20 }, solid: ['#8a4ac0'] }; // 碘（紫黑，溶液棕）
SUBSTANCES['Si'] = { id: 'Si', mm: 28, state: 'solid', kind: 'nonmetal', soluble: 'na', solid: ['#8a9bb0'] }; // 硅（半导体）
SUBSTANCES['Mg3N2'] = { id: 'Mg3N2', mm: 100, state: 'solid', kind: 'other', soluble: 'insoluble', ions: null, solid: ['#d9cfa8'] }; // 氮化镁（水解产氨）

// --- 液体（氨水/乙醇/溴）---
SUBSTANCES['NH3·H2O'] = { id: 'NH3·H2O', mm: 35, state: 'liquid', kind: 'base', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'NH4+', an: 'OH-', catCount: 1, anCount: 1 }, solid: ['#ffffff'] }; // 氨水（弱碱）
SUBSTANCES['NH4OH'] = { id: 'NH4OH', mm: 35, state: 'liquid', kind: 'base', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'NH4+', an: 'OH-', catCount: 1, anCount: 1 }, solid: ['#ffffff'] }; // 氢氧化铵 = 氨水（NH4OH ≡ NH3·H2O，别名）
SUBSTANCES['C2H5OH'] = { id: 'C2H5OH', mm: 46, state: 'liquid', kind: 'other', soluble: 'soluble', flammable: true, solid: ['#ffffff'] }; // 乙醇
SUBSTANCES['H2C2O4'] = { id: 'H2C2O4', mm: 90, state: 'solid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'C2O4^2-', catCount: 2, anCount: 1 }, solid: ['#ffffff'] }; // 草酸（高锰酸钾褪色）
SUBSTANCES['Br2'] = { id: 'Br2', mm: 160, state: 'liquid', kind: 'nonmetal', soluble: 'soluble', ionColor: { color: '#d8762a', sat: 100 }, solid: ['#8a2c1c'] }; // 溴（橙红）

// --- 气体（高中扩展：颜色按物质，可燃气体带气体火焰色）---
SUBSTANCES['H2'] = { id: 'H2', mm: 2, state: 'gas', kind: 'nonmetal', soluble: 'na', flammable: true, gasFlameColor: '#7fd4ff', solid: [] };
SUBSTANCES['O2'] = { id: 'O2', mm: 32, state: 'gas', kind: 'gas', soluble: 'na', solid: [] };
SUBSTANCES['N2'] = { id: 'N2', mm: 28, state: 'gas', kind: 'gas', soluble: 'na', solid: [] };
SUBSTANCES['CO2'] = { id: 'CO2', mm: 44, state: 'gas', kind: 'acidicGas', soluble: 'na', solid: [] };
SUBSTANCES['SO2'] = { id: 'SO2', mm: 64, state: 'gas', kind: 'acidicGas', soluble: 'na', solid: [] };
SUBSTANCES['CO'] = { id: 'CO', mm: 28, state: 'gas', kind: 'gas', soluble: 'na', flammable: true, gasFlameColor: '#7fd4ff', solid: [] };
SUBSTANCES['NH3'] = { id: 'NH3', mm: 17, state: 'gas', kind: 'gas', soluble: 'na', solid: [] };
SUBSTANCES['Cl2'] = { id: 'Cl2', mm: 71, state: 'gas', kind: 'gas', soluble: 'na', gasColor: '#b8e01f', solid: [] };   // 黄绿（有毒，需碱液吸收）
SUBSTANCES['H2S'] = { id: 'H2S', mm: 34, state: 'gas', kind: 'acidicGas', soluble: 'na', flammable: true, gasColor: '#ffe9a8', gasFlameColor: '#7fd4ff', solid: [] }; // 臭鸡蛋气
SUBSTANCES['NO'] = { id: 'NO', mm: 30, state: 'gas', kind: 'gas', soluble: 'na', solid: [] };                          // 无色
SUBSTANCES['NO2'] = { id: 'NO2', mm: 46, state: 'gas', kind: 'gas', soluble: 'na', gasColor: '#ff6a3d', solid: [] };   // 红棕
SUBSTANCES['CH4'] = { id: 'CH4', mm: 16, state: 'gas', kind: 'gas', soluble: 'na', flammable: true, gasFlameColor: '#7fd4ff', solid: [] };
SUBSTANCES['SO3'] = { id: 'SO3', mm: 80, state: 'gas', kind: 'acidicGas', soluble: 'na', gasColor: '#f0f0ff', solid: [] }; // 白烟

// --- 指示剂（pH 显色：stops = [[pH起点, 颜色]...]，按 pH 找最后一个 ≤ 的段）---
SUBSTANCES['Litmus'] = { id: 'Litmus', mm: 210, state: 'solid', kind: 'indicator', soluble: 'soluble', indicator: { stops: [[0, '#ff3b30'], [5, '#b06ad4'], [8, '#3b6cff']] }, solid: ['#b06ad4'] }; // 石蕊：红<5 / 紫5~8 / 蓝>8
SUBSTANCES['C20H14O4'] = { id: 'C20H14O4', mm: 318, state: 'solid', kind: 'indicator', soluble: 'soluble', indicator: { stops: [[0, '#ffffff'], [8.2, '#ffb3c1'], [10, '#ff2d55']], transparent: true }, solid: ['#ffffff'] }; // 酚酞：无色<8.2 / 浅红8.2~10 / 深红>10

// --- 催化剂 / 其它 ---
SUBSTANCES['MnO2'] = { id: 'MnO2', mm: 87, state: 'solid', kind: 'catalyst', soluble: 'insoluble', solid: ['#333333'] };

// ---------------------------------------------------------------------------
// 查询与兜底
// ---------------------------------------------------------------------------
/** 物质别名表：同一物质的不同写法统一到规范 id（如 NH4OH ≡ NH3·H2O 氢氧化铵=氨水）。
 *  别名只存在于"关卡书写/配置"层面，进入化学引擎后一律归一化，避免同一物质
 *  分裂成两个 id 导致反应路径重复、日志抖动（自定义反应认 NH4OH、内置反应认
 *  NH3·H2O，两边各跑各的）。 */
const ALIASES = { NH4OH: 'NH3·H2O' };

/** 归一化物质 id（别名 → 规范名） */
function normId(id) {
  return ALIASES[id] ?? id;
}

function getSubstance(id) {
  const s = SUBSTANCES[normId(id)];
  if (s) return s;
  // 兜底：从未知公式构造一条"白盐"记录（数据缺失时保证不崩，属性可在表中补齐）
  return { id, mm: 100, state: 'solid', kind: 'other', soluble: 'soluble', solid: ['#cccccc'] };
}

function isSoluble(id) {
  return getSubstance(id).soluble === 'soluble';
}

// ---------------------------------------------------------------------------
// 溶液浓度判据（"浓酸"定义是化学反应分支与 UI 标注的共同依据）
// ---------------------------------------------------------------------------
/** "浓"酸阈值：溶液里酸的质量（g）/ 溶液体积（L）；≥300 视为浓
 *  （MnO2+浓盐酸制氯气、浓 HNO3/H2SO4 氧化分支等；KMnO4+盐酸不需要浓——见 rules.js） */
const CONC_HIGH = 300;
/** 钝化浓度：Fe/Al 常温遇 ≥400 g/L 浓硫酸/浓硝酸钝化（加热后才反应） */
const PASSIVATION_CONC = 400;
/** 酸的浓度标签：≥CONC_HIGH → "浓"，否则 "稀"（UI 显示用，如 HCl(浓)） */
function acidLabelOf(id, mass, volumeL) {
  const s = getSubstance(id);
  if (!s || s.kind !== 'acid') return null;
  if (!(volumeL > 0) || !Number.isFinite(mass)) return '浓'; // 无溶剂稀释（干台）→ 视为浓
  return mass / volumeL >= CONC_HIGH ? '浓' : '稀';
}

/** 贴地摩擦脱落系数（g/格/s，满格浓度时的速率上限）：可溶物更容易被蹭掉（0.005），
 *  不溶物较难脱落（0.001）。物质表可用 shedCoeff 字段覆盖（未来按物质定制）。 */
function shedCoeffOf(id) {
  const s = getSubstance(id);
  if (s.shedCoeff !== undefined) return s.shedCoeff;
  return isSoluble(id) ? 0.005 : 0.001;
}

function isElectrolyte(id) {
  return !!getSubstance(id).ions;
}

/** 金属 A 是否比金属 B 活泼（活动性序：数值越小越靠前/越活泼，用于置换） */
function isMoreActive(metalA, metalB) {
  const a = getSubstance(metalA).activity ?? -1;
  const b = getSubstance(metalB).activity ?? -1;
  return a < b;
}

// ---------------------------------------------------------------------------
// 焰色反应：元素 → 特征色（物理变化，不消耗物质）
// ---------------------------------------------------------------------------
const FLAME_COLORS = {
  'Li+':  '#ff5fd0', // 紫红
  'Na+':  '#ffd23f', // 黄
  'K+':   '#c78bff', // 紫
  'Ca2+': '#ff5f2e', // 砖红
  'Ba2+': '#b8ff4f', // 黄绿（绿色）
  'Cu2+': '#4dff5f', // 绿
  'Sr2+': '#ff3d6a', // 洋红
  'Fe2+': '#ffb340', // 金黄
  'Fe3+': '#ffa03d', // 橙金
  'Zn2+': '#9fd8ff', // 蓝白
  'Mg2+': '#d8ffe8', // 白绿
};

/** 物质的焰色：优先物质自带 flameColor（单质），否则按阳离子查表 */
function flameColorOf(id) {
  const s = getSubstance(id);
  if (s.flameColor) return s.flameColor;
  if (s.ions) return FLAME_COLORS[s.ions.cat] ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// 关卡自定义反应字符串解析："Cu + FeCl3 → CuCl2 + FeCl2"
// 支持系数（2H2 + O2 → 2H2O）与箭头（→ / -> / =>）。物质必须存在于物质表。
// ---------------------------------------------------------------------------
function _parseReaction(str) {
  if (!str || !String(str).trim()) return { ok: false, error: '空' };
  const parts = String(str).split(/\s*(?:→|->|=>)\s*/).map((s) => s.trim());
  if (parts.length < 2) return { ok: false, error: '缺少箭头 →（格式：A + B → C + D）' };
  const parseSide = (s) =>
    (s || '').split(/\s*\+\s*/).filter(Boolean).map((part) => {
      const m = part.trim().match(/^(\d*)\s*(.+)$/);
      // 归一化别名（NH4OH → NH3·H2O），自定义反应与内置反应共用同一物质 id
      return { id: normId((m[2] ?? part).trim()), coeff: m[1] ? Number(m[1]) : 1 };
    });
  const reactants = parseSide(parts[0]);
  const products = parseSide(parts[1]);
  if (!reactants.length) return { ok: false, error: '反应物为空' };
  if (!products.length) return { ok: false, error: '生成物为空' };
  for (const r of [...reactants, ...products]) {
    if (!SUBSTANCES[r.id]) return { ok: false, error: `物质「${r.id}」不在物质表中` };
    if (!(r.coeff > 0)) return { ok: false, error: `「${r.id}」的系数无效` };
  }
  return { ok: true, rule: { reactants, products } };
}

/** 解析关卡自定义反应："Cu + FeCl3 → CuCl2 + FeCl2"；失败返回 null。 */
function parseReactionStr(str) {
  const r = _parseReaction(str);
  return r.ok ? r.rule : null;
}

/** 反应字符串的详细错误说明（编辑器提示用）；合法返回 null。 */
function reactionStrError(str) {
  return _parseReaction(str).error ?? null;
}

exports.IONS = IONS;
exports.canonicalFormula = canonicalFormula;
exports.buildSalt = buildSalt;
exports.solubilityOf = solubilityOf;
exports.kindOf = kindOf;
exports.saltEntry = saltEntry;
exports.ensureSalt = ensureSalt;
exports.SUBSTANCES = SUBSTANCES;
exports.ALIASES = ALIASES;
exports.normId = normId;
exports.getSubstance = getSubstance;
exports.isSoluble = isSoluble;
exports.CONC_HIGH = CONC_HIGH;
exports.PASSIVATION_CONC = PASSIVATION_CONC;
exports.acidLabelOf = acidLabelOf;
exports.shedCoeffOf = shedCoeffOf;
exports.isElectrolyte = isElectrolyte;
exports.isMoreActive = isMoreActive;
exports.FLAME_COLORS = FLAME_COLORS;
exports.flameColorOf = flameColorOf;
exports.parseReactionStr = parseReactionStr;
exports.reactionStrError = reactionStrError;

  };
  __modules["src/chem/solution.js"] = function (module, exports, __require) {
// ============================================================================
// 溶液模型
// ----------------------------------------------------------------------------
// 固定体积（液面不下降），溶质按质量存储。水作为溶剂单独跟踪（中和反应会累积水）。
// concentration(id) = 溶质质量 / 体积  → 供显色与饱和度参照。
// pH()：由酸/碱溶质的浓度与强弱（电离度）计算——强酸/强碱完全电离，
// 弱酸/弱碱（CH3COOH、H2CO3、NH3·H2O 等）按 2% 电离。
// ============================================================================

const { getSubstance, normId } = __require('src/chem/substances.js');;

const WEAK_IONIZATION = 0.02; // 弱酸/弱碱电离度（简化）

/** 溶液条目的最小记账质量（g）：
 *  低于此质量的溶质不建立条目（add 总量不足不入账、remove 后剩余不足则删除并
 *  丢弃残留，误差 ≤ MIN_ENTRY，对玩法无感——粒子最小 0.1g）。
 *  防止"生成速率≈消耗速率"的微量物质（如 NH3·H2O 的产氨-吸收循环）在旧阈值
 *  （1e-9）边缘反复出现/消失（溶液面板"0.000g ↔ 不显示"抖动）；同时远小于
 *  微量限速阈值（LIMIT_MASS=0.05），正常量级与"微量累积型"（每 tick 0.00025g
 *  的 NH4ClO 累积到稳态 0.0033g）都不受影响。 */
const MIN_ENTRY = 1e-4;

class Solution {
  constructor({ volume = 300, solutes = {}, water = 0 } = {}) {
    this.volume = volume;
    this.water = water;
    this.solutes = new Map(); // id -> g（id 一律为规范化名）
    for (const [id, m] of Object.entries(solutes)) {
      if (m > 0) this.solutes.set(normId(id), m);
    }
  }

  /** 溶液 pH：由强/弱酸碱的摩尔浓度计算（弱电解质按 2% 电离） */
  pH() {
    let h = 0;
    let oh = 0;
    const volL = this.volume / 1000;
    if (volL <= 0) return 7;
    for (const [id, mass] of this.solutes) {
      const sub = getSubstance(id);
      const molPerL = mass / sub.mm / volL;
      if (molPerL <= 0) continue;
      if (sub.kind === 'acid' && sub.ions?.cat === 'H+') {
        const ion = sub.acidStrength === 'strong' ? 1 : WEAK_IONIZATION;
        h += molPerL * sub.ions.catCount * ion;
      } else if (sub.kind === 'base' && sub.ions?.an === 'OH-') {
        const ion = sub.acidStrength === 'strong' ? 1 : WEAK_IONIZATION;
        oh += molPerL * sub.ions.anCount * ion;
      }
    }
    // 强酸强碱同存时相互中和（简化：取优势方）
    if (h > 1e-12 && h >= oh) return Math.max(0, -Math.log10(h));
    if (oh > 1e-12 && oh > h) return Math.min(14, 14 + Math.log10(oh));
    return 7;
  }

  mass(id) {
    return this.solutes.get(normId(id)) ?? 0;
  }

  concentration(id) {
    return this.mass(id) / this.volume;
  }

  /** 增加溶质（负值按移除处理）；id 归一化（NH4OH → NH3·H2O）。
   *  总量仍低于 MIN_ENTRY 的微量入账直接丢弃（不建立条目）；
   *  非有限质量（NaN/Infinity）直接忽略（防反应异常污染溶液）。
   *  微溶物质（solubilityLimit g/L）：超过饱和浓度 → 超出部分析出（onOversaturate 钩子，
   *  容器把它变成可见沉淀——"滴到一定量后溶液浑浊"）。 */
  add(id, m) {
    id = normId(id);
    if (!Number.isFinite(m) || m === 0) return;
    if (m < 0) {
      this.remove(id, -m);
      return;
    }
    const next = (this.solutes.get(id) ?? 0) + m;
    if (next < MIN_ENTRY) return; // 微量不入账：防"0.000g ↔ 不显示"的条目抖动
    // 微溶饱和：溶液先持续**变浑浊**（渲染按浓度/饱和线），拉到饱和浓度后才开始析出；
    // 再留一段"过饱和带"（1.25×）才真正出沉淀——"过了过饱和线才开始出沉淀颗粒"
    const sub = getSubstance(id);
    if (sub && sub.solubilityLimit > 0 && this.volume > 0 && typeof this.onOversaturate === 'function') {
      const satMass = sub.solubilityLimit * (this.volume / 1000); // 饱和浓度对应的质量
      const overMass = satMass * 1.25; // 过饱和带（1.25× 后才析出）
      if (next > overMass) {
        const excess = next - overMass;
        this.solutes.set(id, overMass);
        this.onOversaturate(id, excess);
        return;
      }
    }
    this.solutes.set(id, next);
  }

  /** 移除溶质，返回实际移除量（不会为负）；id 归一化。
   *  剩余不足 MIN_ENTRY 时删除条目并丢弃残留（误差 ≤ MIN_ENTRY，玩法无感）。
   *  m 非有限（NaN）时返回 0（不写坏溶液）。 */
  remove(id, m) {
    id = normId(id);
    if (!(m > 0)) return 0;
    const cur = this.solutes.get(id) ?? 0;
    if (!Number.isFinite(cur)) {
      // 防御：值已被污染为 NaN 时清掉条目（不继续传播）
      this.solutes.delete(id);
      return 0;
    }
    const removed = Math.min(cur, m);
    const next = cur - removed;
    if (next < MIN_ENTRY) this.solutes.delete(id);
    else this.solutes.set(id, next);
    return removed;
  }

  /** 转移走某溶质指定质量，返回实际移除量 */
  take(id, m) {
    return this.remove(id, m);
  }

  ids() {
    return [...this.solutes.keys()];
  }

  has(id) {
    return this.solutes.has(normId(id));
  }

  /** 溶液总质量（水 + 全部溶质，g） */
  totalMass() {
    let s = this.water;
    for (const m of this.solutes.values()) s += m;
    return s;
  }

  /**
   * 取走一份"同比例样品"（质量 ≤ mass，不足取全部）——水和各溶质按原比例一起
   * 转移（玩家用烧杯/滴管从药品池吸液：吸走的是整份溶液，不是提纯后的一种）。
   * 返回 { water, solutes } 或 null（无液体可取/非法参数）。
   */
  takeSample(mass) {
    if (!(mass > 0)) return null;
    const total = this.totalMass();
    if (total <= 1e-9) return null;
    const m = Math.min(mass, total);
    const f = m / total;
    const out = { water: this.water * f, solutes: {} };
    for (const [id, v] of this.solutes) out.solutes[id] = v * f;
    this.water -= out.water;
    for (const [id, v] of Object.entries(out.solutes)) this.remove(id, v);
    return out;
  }

  /** 把 takeSample 得到的样品并入本溶液（水进"水"字段，溶质按 add 规则入账） */
  addSample(sample) {
    if (!sample) return;
    if (sample.water > 0) this.water += sample.water;
    for (const [id, v] of Object.entries(sample.solutes ?? {})) {
      if (v > 0) this.add(id, v);
    }
  }

  clone() {
    const c = new Solution({ volume: this.volume, water: this.water });
    for (const [id, m] of this.solutes) c.solutes.set(id, m);
    return c;
  }
}

// ============================================================================
// SolutionMaterial：把 Solution 适配成化学引擎使用的 Material 接口
//   { phase:'solution', container:this, avail/consume/add/ids, isPlayer:false }
// ============================================================================
class SolutionMaterial {
  constructor(solution, owner = null) {
    this.solution = solution;
    this.owner = owner; // 容器对象（池/烧杯/开关…），渲染与交互用
    this.phase = 'solution';
    this.isPlayer = false;
    this.container = this; // 溶液本身就是"所在容器"的内容
  }

  avail(id) {
    if (id === 'H2O') return this.solution.water;
    return this.solution.mass(id);
  }

  consume(id, mass) {
    if (id === 'H2O') {
      const r = Math.min(this.solution.water, mass);
      this.solution.water -= r;
      return r;
    }
    return this.solution.remove(id, mass);
  }

  add(id, mass) {
    if (id === 'H2O') {
      this.solution.water += mass;
      return;
    }
    this.solution.add(id, mass);
  }

  ids() {
    return this.solution.ids();
  }
}

exports.MIN_ENTRY = MIN_ENTRY;
exports.Solution = Solution;
exports.SolutionMaterial = SolutionMaterial;

  };
  __modules["src/chem/rules.js"] = function (module, exports, __require) {
// ============================================================================
// 反应规则（数据驱动）——高中版
// ----------------------------------------------------------------------------
// 规则统一形状：
//   {
//     type,
//     reactants: [{id, coeff}],     // 速率参照 = reactants[0]（rate 单位 g/s of ref）
//     products:  [{id, coeff}],
//     condition: 'normal'|'heat'|'highTemp'|'ignited'|{catalyst:'MnO2'}
//              | {concHigh:true, heat:true}   // 浓+加热（MnO2+浓HCl 制氯气）
//              | {o2:'low'}                   // 仅低氧分压时（不充分燃烧）
//     rate: g/s,
//     explosive: true,   // 触发爆炸（env.explode）
//   }
// 引擎把"氧化还原（自动配平）""离子双置换"和"金属置换"单独实现（见 redox.js / engine.js），
// 本文件存放需逐条列出的反应与特例。
// ============================================================================

// ---- 反应速率（g/s，基准）----
const RATE = {
  ionic: 24,          // 液-液基准（固-液 ×0.5，固-固 ×0.1）
  displace: 12,       // 金属置换
  redox: 3,           // 氧化还原（自动配平，整体较慢便于观察）
  thermal: 5,         // 加热/高温分解
  catalytic: 5,       // 催化/加热制氧
  combustion: 5,      // 燃烧
  reduction: 5,       // 固还原
  autoDecomp: 300,    // 碳酸等自发分解（近似瞬时）
  acidGas: 24,        // 碱吸收酸性气体
  dissolution: 10,    // 可溶固体溶解（玩家身上的盐壳/可溶物在水中较快洗掉）
  gasCombustion: 12,  // 大气中可燃气体燃烧
  special: 8,         // 特例反应（分步/两性/氯化铵等）
  custom: 8,          // 关卡自定义反应（最高优先级）
};

// ---- 自反应：加热/高温分解 ----
const THERMAL_RULES = [
  { type: 'thermal', reactants: [{ id: 'Cu(OH)2', coeff: 1 }], products: [{ id: 'CuO', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  { type: 'thermal', reactants: [{ id: 'Fe(OH)3', coeff: 1 }], products: [{ id: 'Fe2O3', coeff: 1 }, { id: 'H2O', coeff: 3 }], condition: 'heat', rate: RATE.thermal },
  { type: 'thermal', reactants: [{ id: 'Mg(OH)2', coeff: 1 }], products: [{ id: 'MgO', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  { type: 'thermal', reactants: [{ id: 'Fe(OH)2', coeff: 1 }], products: [{ id: 'FeO', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  { type: 'thermal', reactants: [{ id: 'CaCO3', coeff: 1 }], products: [{ id: 'CaO', coeff: 1 }, { id: 'CO2', coeff: 1 }], condition: 'highTemp', rate: RATE.thermal },
  // NH4Cl --△--> NH3↑ + HCl↑（两种气体）
  { type: 'thermal', reactants: [{ id: 'NH4Cl', coeff: 1 }], products: [{ id: 'NH3', coeff: 1 }, { id: 'HCl', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  // NH4HCO3 --△--> NH3↑ + H2O + CO2↑
  { type: 'thermal', reactants: [{ id: 'NH4HCO3', coeff: 1 }], products: [{ id: 'NH3', coeff: 1 }, { id: 'H2O', coeff: 1 }, { id: 'CO2', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  // 2NaHCO3 --△--> Na2CO3 + H2O + CO2↑
  { type: 'thermal', reactants: [{ id: 'NaHCO3', coeff: 2 }], products: [{ id: 'Na2CO3', coeff: 1 }, { id: 'H2O', coeff: 1 }, { id: 'CO2', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  // Cu2(OH)2CO3 --△--> 2CuO + CO2↑ + H2O（铜绿分解）
  { type: 'thermal', reactants: [{ id: 'Cu2(OH)2CO3', coeff: 1 }], products: [{ id: 'CuO', coeff: 2 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  // 4HNO3 --△/光照--> 4NO2↑ + O2↑ + 2H2O（浓硝酸见光/受热分解，越浓越易）
  { type: 'thermal', reactants: [{ id: 'HNO3', coeff: 4 }], products: [{ id: 'NO2', coeff: 4 }, { id: 'O2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'heat', rate: RATE.thermal * 0.3 },
  // 2Al(OH)3 --△--> Al2O3 + 3H2O（氢氧化铝受热分解）
  { type: 'thermal', reactants: [{ id: 'Al(OH)3', coeff: 2 }], products: [{ id: 'Al2O3', coeff: 1 }, { id: 'H2O', coeff: 3 }], condition: 'heat', rate: RATE.thermal },
  // Ca(HCO3)2 --△--> CaCO3↓ + CO2↑ + H2O（水垢成因）
  { type: 'thermal', reactants: [{ id: 'Ca(HCO3)2', coeff: 1 }], products: [{ id: 'CaCO3', coeff: 1 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
];

// ---- 自反应：催化/加热制氧 ----
const CATALYTIC_RULES = [
  // 2H2O2 --MnO2--> 2H2O + O2↑
  { type: 'catalytic', reactants: [{ id: 'H2O2', coeff: 2 }], products: [{ id: 'H2O', coeff: 2 }, { id: 'O2', coeff: 1 }], condition: { catalyst: 'MnO2' }, rate: RATE.catalytic },
  // 2KMnO4 --加热--> K2MnO4 + MnO2 + O2↑
  { type: 'catalytic', reactants: [{ id: 'KMnO4', coeff: 2 }], products: [{ id: 'K2MnO4', coeff: 1 }, { id: 'MnO2', coeff: 1 }, { id: 'O2', coeff: 1 }], condition: 'heat', rate: RATE.catalytic },
  // 2KClO3 --加热/MnO2--> 2KCl + 3O2↑
  { type: 'catalytic', reactants: [{ id: 'KClO3', coeff: 2 }], products: [{ id: 'KCl', coeff: 2 }, { id: 'O2', coeff: 3 }], condition: { catalyst: 'MnO2' }, rate: RATE.catalytic },
];

// ---- 自反应：燃烧（O2 取自大气；需要点燃条件）----
// C 不充分燃烧（低氧分压）在引擎侧按 o2 分支选择
const COMBUSTION_RULES = [
  // 碳：点燃（空气中）→ CO2（充分燃烧）；高温+低氧 → CO（不充分，量变引起质变）
  { type: 'combustion', reactants: [{ id: 'C', coeff: 1 }, { id: 'O2', coeff: 1 }], products: [{ id: 'CO2', coeff: 1 }], condition: 'ignited', rate: RATE.combustion },
  { type: 'combustion', reactants: [{ id: 'C', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'CO', coeff: 2 }], condition: { ignited: true, highTemp: true, o2: 'low' }, rate: RATE.combustion },
  { type: 'combustion', reactants: [{ id: 'S', coeff: 1 }, { id: 'O2', coeff: 1 }], products: [{ id: 'SO2', coeff: 1 }], condition: 'ignited', rate: RATE.combustion },
  { type: 'combustion', reactants: [{ id: 'P', coeff: 4 }, { id: 'O2', coeff: 5 }], products: [{ id: 'P2O5', coeff: 2 }], condition: 'ignited', rate: RATE.combustion },
  // 金属燃烧：火花四射（sparks）；块状金属氧化是表面过程，慢而真实（Mg/Al/Na/K 本身易燃快）
  { type: 'combustion', reactants: [{ id: 'Mg', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'MgO', coeff: 2 }], condition: 'ignited', rate: RATE.combustion, sparks: true },
  { type: 'combustion', reactants: [{ id: 'Al', coeff: 4 }, { id: 'O2', coeff: 3 }], products: [{ id: 'Al2O3', coeff: 2 }], condition: 'ignited', rate: RATE.combustion, sparks: true },
  // 4Fe + 3O2 --点燃--> 2Fe2O3：铁在**空气**中点燃/氧化生成三氧化二铁（铁锈红）；
  // 块状铁氧化是缓慢的表面过程（约 0.06 g/s——一块铁锈完以分钟计），火花四射；
  // Fe3O4 仅在纯氧/富氧燃烧出现（默认空气 O2 分压 0.2 对应 Fe2O3）
  { type: 'combustion', reactants: [{ id: 'Fe', coeff: 4 }, { id: 'O2', coeff: 3 }], products: [{ id: 'Fe2O3', coeff: 2 }], condition: 'ignited', rate: RATE.combustion * 0.003, sparks: true },
  // 铜加热变黑（CuO 氧化皮，无火花、慢速表面氧化）
  { type: 'combustion', reactants: [{ id: 'Cu', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'CuO', coeff: 2 }], condition: 'ignited', rate: RATE.combustion * 0.15 },
  // 2Na + O2 --常温--> Na2O（慢） / 2Na + O2 --点燃--> Na2O2
  { type: 'combustion', reactants: [{ id: 'Na', coeff: 4 }, { id: 'O2', coeff: 1 }], products: [{ id: 'Na2O', coeff: 2 }], condition: 'normal', rate: RATE.combustion * 0.2 },
  { type: 'combustion', reactants: [{ id: 'Na', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'Na2O2', coeff: 1 }], condition: 'ignited', rate: RATE.combustion, sparks: true },
  { type: 'combustion', reactants: [{ id: 'K', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'K2O', coeff: 1 }], condition: 'ignited', rate: RATE.combustion, sparks: true },
  // 3Mg + N2 --点燃--> Mg3N2（镁在氮气中燃烧）
  { type: 'combustion', reactants: [{ id: 'Mg', coeff: 3 }, { id: 'N2', coeff: 1 }], products: [{ id: 'Mg3N2', coeff: 1 }], condition: 'ignited', rate: RATE.combustion * 0.5 },
  // 2Mg + CO2 --点燃--> 2MgO + C（镁在二氧化碳中燃烧）
  { type: 'combustion', reactants: [{ id: 'Mg', coeff: 2 }, { id: 'CO2', coeff: 1 }], products: [{ id: 'MgO', coeff: 2 }, { id: 'C', coeff: 1 }], condition: 'ignited', rate: RATE.combustion * 0.5 },
  // CH4 + 2O2 --点燃--> CO2 + 2H2O
  { type: 'combustion', reactants: [{ id: 'CH4', coeff: 1 }, { id: 'O2', coeff: 2 }], products: [{ id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'ignited', rate: RATE.combustion },
  // C2H5OH + 3O2 --点燃--> 2CO2 + 3H2O
  { type: 'combustion', reactants: [{ id: 'C2H5OH', coeff: 1 }, { id: 'O2', coeff: 3 }], products: [{ id: 'CO2', coeff: 2 }, { id: 'H2O', coeff: 3 }], condition: 'ignited', rate: RATE.combustion },
  // 2H2S + O2（不足）→ 2S + 2H2O / 2H2S + 3O2（过量）→ 2SO2 + 2H2O（量变分支）
  { type: 'combustion', reactants: [{ id: 'H2S', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'S', coeff: 2 }, { id: 'H2O', coeff: 2 }], condition: { ignited: true, o2: 'low' }, rate: RATE.combustion },
  { type: 'combustion', reactants: [{ id: 'H2S', coeff: 2 }, { id: 'O2', coeff: 3 }], products: [{ id: 'SO2', coeff: 2 }, { id: 'H2O', coeff: 2 }], condition: { ignited: true, o2: 'high' }, rate: RATE.combustion },
];

// ---- 自反应：自发分解 ----
const AUTO_DECOMP_RULES = [
  // H2CO3 是"CO2 溶于水"——分解即 CO2 逸出（不额外产水，避免 H2CO3⇌CO2 循环无限积累水）
  { type: 'autoDecomp', reactants: [{ id: 'H2CO3', coeff: 1 }], products: [{ id: 'CO2', coeff: 1 }], condition: 'normal', rate: RATE.autoDecomp },
  // 2HClO --见光--> 2HCl + O2↑（氯水见光失效；需要"光照"条件，如灯旁）
  { type: 'autoDecomp', reactants: [{ id: 'HClO', coeff: 2 }], products: [{ id: 'HCl', coeff: 2 }, { id: 'O2', coeff: 1 }], condition: { light: true }, rate: RATE.autoDecomp * 0.05 },
  // 4Fe(OH)2 + O2 + 2H2O → 4Fe(OH)3（白色→红棕色，需大气 O2）
  { type: 'autoDecomp', reactants: [{ id: 'Fe(OH)2', coeff: 4 }, { id: 'O2', coeff: 1 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'Fe(OH)3', coeff: 4 }], condition: 'normal', rate: RATE.autoDecomp * 0.01 },
];

// ---- 自反应：气态还原（氧化物 + 大气 CO/H2，高温）----
const GAS_REDUCTION_RULES = [
  { type: 'reduction', reactants: [{ id: 'CuO', coeff: 1 }, { id: 'CO', coeff: 1 }], products: [{ id: 'Cu', coeff: 1 }, { id: 'CO2', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'CuO', coeff: 1 }, { id: 'H2', coeff: 1 }], products: [{ id: 'Cu', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe2O3', coeff: 1 }, { id: 'CO', coeff: 3 }], products: [{ id: 'Fe', coeff: 2 }, { id: 'CO2', coeff: 3 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe2O3', coeff: 1 }, { id: 'H2', coeff: 3 }], products: [{ id: 'Fe', coeff: 2 }, { id: 'H2O', coeff: 3 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'CO', coeff: 4 }], products: [{ id: 'Fe', coeff: 3 }, { id: 'CO2', coeff: 4 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'H2', coeff: 4 }], products: [{ id: 'Fe', coeff: 3 }, { id: 'H2O', coeff: 4 }], condition: 'highTemp', rate: RATE.reduction },
  // C + CO2 --高温--> 2CO
  { type: 'reduction', reactants: [{ id: 'C', coeff: 1 }, { id: 'CO2', coeff: 1 }], products: [{ id: 'CO', coeff: 2 }], condition: 'highTemp', rate: RATE.reduction },
];

// ---- 成对反应：固-固还原（氧化物 + 炭/铝，高温）----
const SOLID_REDUCTION_RULES = [
  { type: 'reduction', reactants: [{ id: 'CuO', coeff: 2 }, { id: 'C', coeff: 1 }], products: [{ id: 'Cu', coeff: 2 }, { id: 'CO2', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe2O3', coeff: 2 }, { id: 'C', coeff: 3 }], products: [{ id: 'Fe', coeff: 4 }, { id: 'CO2', coeff: 3 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'C', coeff: 2 }], products: [{ id: 'Fe', coeff: 3 }, { id: 'CO2', coeff: 2 }], condition: 'highTemp', rate: RATE.reduction },
  // 2Al + Fe2O3 --高温--> Al2O3 + 2Fe（铝热反应，爆炸）
  { type: 'reduction', reactants: [{ id: 'Al', coeff: 2 }, { id: 'Fe2O3', coeff: 1 }], products: [{ id: 'Al2O3', coeff: 1 }, { id: 'Fe', coeff: 2 }], condition: 'highTemp', rate: RATE.reduction * 3, explosive: true },
  // CaCO3 + CO2 + H2O → Ca(HCO3)2（过量 CO2 变清，石灰水先浑后清；需有水，见 _trySpecialSelf）
  { type: 'special', reactants: [{ id: 'CaCO3', coeff: 1 }, { id: 'CO2', coeff: 1 }], products: [{ id: 'Ca(HCO3)2', coeff: 1 }], condition: 'normal', rate: RATE.special, waterNeeded: true },
  // Na2CO3 + CO2 + H2O → 2NaHCO3（CO2 过量转化为碳酸氢钠）
  { type: 'special', reactants: [{ id: 'Na2CO3', coeff: 1 }, { id: 'CO2', coeff: 1 }], products: [{ id: 'NaHCO3', coeff: 2 }], condition: 'normal', rate: RATE.special, waterNeeded: true },
  // Na2O2 + CO2 → Na2CO3 + O2（过氧化钠与二氧化碳）
  { type: 'special', reactants: [{ id: 'Na2O2', coeff: 2 }, { id: 'CO2', coeff: 2 }], products: [{ id: 'Na2CO3', coeff: 2 }, { id: 'O2', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 氨气+氯化氢（白烟，大气中相遇；引擎在 reactAtmosphere 特判处理）
  { type: 'special', reactants: [{ id: 'NH3', coeff: 1 }, { id: 'HCl', coeff: 1 }], products: [{ id: 'NH4Cl', coeff: 1 }], condition: 'normal', rate: RATE.special * 2, atmosphereOnly: true },
];

// ---- 成对反应：特例表（分步/两性/活泼金属遇水/浓酸制气等）----
const SPECIAL_PAIR_RULES = [
  // Fe3O4（混合价）+ 酸（离子引擎无法覆盖，显式列出）
  { type: 'special', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'HCl', coeff: 8 }], products: [{ id: 'FeCl3', coeff: 2 }, { id: 'FeCl2', coeff: 1 }, { id: 'H2O', coeff: 4 }], condition: 'normal', rate: RATE.ionic },
  { type: 'special', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'H2SO4', coeff: 4 }], products: [{ id: 'Fe2(SO4)3', coeff: 1 }, { id: 'FeSO4', coeff: 1 }, { id: 'H2O', coeff: 4 }], condition: 'normal', rate: RATE.ionic },
  // 分步：Na2CO3 + HCl（少量）→ NaHCO3 + NaCl（先无气泡）；NaHCO3 + HCl → NaCl + CO2↑ + H2O
  { type: 'special', reactants: [{ id: 'Na2CO3', coeff: 1 }, { id: 'HCl', coeff: 1 }], products: [{ id: 'NaHCO3', coeff: 1 }, { id: 'NaCl', coeff: 1 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'NaHCO3', coeff: 1 }, { id: 'HCl', coeff: 1 }], products: [{ id: 'NaCl', coeff: 1 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 酸式盐中和：NaHCO3 + NaOH → Na2CO3 + H2O（同钠离子，离子引擎不驱动，显式列出）
  { type: 'special', reactants: [{ id: 'NaHCO3', coeff: 1 }, { id: 'NaOH', coeff: 1 }], products: [{ id: 'Na2CO3', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.ionic },
  // 两性溶解：Al(OH)3 + NaOH → NaAlO2 + 2H2O（过量碱）；Cr(OH)3 同理
  { type: 'special', reactants: [{ id: 'Al(OH)3', coeff: 1 }, { id: 'NaOH', coeff: 1 }], products: [{ id: 'NaAlO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Cr(OH)3', coeff: 1 }, { id: 'NaOH', coeff: 1 }], products: [{ id: 'NaCrO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'normal', rate: RATE.special },
  // 金属+碱：2Al + 2NaOH + 2H2O → 2NaAlO2 + 3H2↑（铝与碱反应）
  { type: 'special', reactants: [{ id: 'Al', coeff: 2 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'NaAlO2', coeff: 2 }, { id: 'H2', coeff: 3 }], condition: 'normal', rate: RATE.special },
  // 铬酸碱互变（量变/指示剂式应用）：Cr2O7^2- + 2OH- → 2CrO4^2- + H2O（橙红→黄）
  { type: 'special', reactants: [{ id: 'K2Cr2O7', coeff: 1 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'K2CrO4', coeff: 2 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 2CrO4^2- + 2H+ → Cr2O7^2- + H2O（黄→橙红）
  { type: 'special', reactants: [{ id: 'K2CrO4', coeff: 2 }, { id: 'HCl', coeff: 2 }], products: [{ id: 'K2Cr2O7', coeff: 1 }, { id: 'KCl', coeff: 2 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 活泼金属遇水（爆炸）：2Na + 2H2O → 2NaOH + H2↑
  { type: 'special', reactants: [{ id: 'Na', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'NaOH', coeff: 2 }, { id: 'H2', coeff: 1 }], condition: 'normal', rate: RATE.special * 2, explosive: true },
  { type: 'special', reactants: [{ id: 'K', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'KOH', coeff: 2 }, { id: 'H2', coeff: 1 }], condition: 'normal', rate: RATE.special * 2, explosive: true },
  { type: 'special', reactants: [{ id: 'Li', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'LiOH', coeff: 2 }, { id: 'H2', coeff: 1 }], condition: 'normal', rate: RATE.special * 2 },
  // 碱性氧化物遇水：Na2O + H2O → 2NaOH（剧烈）；CaO + H2O → Ca(OH)2（放热）
  { type: 'special', reactants: [{ id: 'Na2O', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'NaOH', coeff: 2 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'CaO', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'Ca(OH)2', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 过氧化钠遇水（爆炸，放 O2）：2Na2O2 + 2H2O → 4NaOH + O2↑
  { type: 'special', reactants: [{ id: 'Na2O2', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'NaOH', coeff: 4 }, { id: 'O2', coeff: 1 }], condition: 'normal', rate: RATE.special * 2, explosive: true },
  // 氯气歧化（遇水）：Cl2 + H2O ⇌ HCl + HClO —— **已移除**（用户规则：Cl2 默认
  // 不溶于水，保持黄绿气体可见；只有集气瓶强行通入（forceDissolve）才溶成氯水）。
  // 旧实现把它放进"成对反应表"——任何实体浸入含水容器都会触发（玩家跳进纯水池
  // 就会让大气氯气生成氯水，随后归中再放氯气——纯水池变成氯气泵，用户实测复现），
  // 与"CO2/SO2/NO2/Cl2 不主动溶解"的既有设计（GAS_WATER 跳过 + 大气可见 +
  // NaOH 尾气处理）冲突。氯水玩法如需恢复：走 _emitGas 的 forceDissolve 管线。
  // 归中：HCl + HClO → Cl2↑ + H2O（Cl⁻ 与 ClO⁻ 归中为 Cl₂，浓盐酸+漂白液制氯气）
  { type: 'special', reactants: [{ id: 'HCl', coeff: 1 }, { id: 'HClO', coeff: 1 }], products: [{ id: 'Cl2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 漂白液遇酸放出氯气（危险）：NaClO + 2HCl → NaCl + Cl2↑ + H2O
  { type: 'special', reactants: [{ id: 'NaClO', coeff: 1 }, { id: 'HCl', coeff: 2 }], products: [{ id: 'NaCl', coeff: 1 }, { id: 'Cl2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // MnO2 + 4HCl（浓）--△--> MnCl2 + Cl2↑ + 2H2O（实验室制氯气）
  { type: 'special', reactants: [{ id: 'MnO2', coeff: 1 }, { id: 'HCl', coeff: 4 }], products: [{ id: 'MnCl2', coeff: 1 }, { id: 'Cl2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: { concHigh: true, heat: true }, rate: RATE.special },
  // 3Fe + 4H2O(g) --高温--> Fe3O4 + 4H2（铁与水蒸气，游戏简化为浸水+高温）
  { type: 'special', reactants: [{ id: 'Fe', coeff: 3 }, { id: 'H2O', coeff: 4 }], products: [{ id: 'Fe3O4', coeff: 1 }, { id: 'H2', coeff: 4 }], condition: 'highTemp', rate: RATE.special * 0.5 },
  // 3Mg + N2 已有（燃烧）；Mg3N2 + 6H2O → 3Mg(OH)2 + 2NH3（水解）
  { type: 'special', reactants: [{ id: 'Mg3N2', coeff: 1 }, { id: 'H2O', coeff: 6 }], products: [{ id: 'Mg(OH)2', coeff: 3 }, { id: 'NH3', coeff: 2 }], condition: 'normal', rate: RATE.special },
  // 干法制氨：2NH4Cl + Ca(OH)2 --△--> CaCl2 + 2NH3↑ + 2H2O（固固加热；溶液里同样成立）
  { type: 'special', reactants: [{ id: 'NH4Cl', coeff: 2 }, { id: 'Ca(OH)2', coeff: 1 }], products: [{ id: 'CaCl2', coeff: 1 }, { id: 'NH3', coeff: 2 }, { id: 'H2O', coeff: 2 }], condition: 'heat', rate: RATE.special },
  // 2KMnO4 + 16HCl → 2KCl + 2MnCl2 + 5Cl2↑ + 8H2O（高锰酸钾制氯气：KMnO4 氧化性极强，
  // 稀盐酸也反应——不需要"浓"（与 MnO2 制氯气不同，后者必须浓+加热））
  { type: 'special', reactants: [{ id: 'KMnO4', coeff: 2 }, { id: 'HCl', coeff: 16 }], products: [{ id: 'KCl', coeff: 2 }, { id: 'MnCl2', coeff: 2 }, { id: 'Cl2', coeff: 5 }, { id: 'H2O', coeff: 8 }], condition: 'normal', rate: RATE.special },
  // 两性氧化物/酸性氧化物溶于强碱（需溶液介质）：Al2O3 + 2NaOH → 2NaAlO2 + H2O；SiO2 + 2NaOH → Na2SiO3 + H2O
  { type: 'special', reactants: [{ id: 'Al2O3', coeff: 1 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'NaAlO2', coeff: 2 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'SiO2', coeff: 1 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'Na2SiO3', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  // 铜绿与盐酸：Cu2(OH)2CO3 + 4HCl → 2CuCl2 + CO2↑ + 3H2O
  { type: 'special', reactants: [{ id: 'Cu2(OH)2CO3', coeff: 1 }, { id: 'HCl', coeff: 4 }], products: [{ id: 'CuCl2', coeff: 2 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 3 }], condition: { solution: true }, rate: RATE.special },
  // 水煤气：C + H2O(g) --高温--> CO + H2（游戏简化为浸水 + 高温）
  { type: 'special', reactants: [{ id: 'C', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'CO', coeff: 1 }, { id: 'H2', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  // 金属 + 硫粉（固-固化合，金属块 × 灯上硫粉等成对触发）：
  // Fe + S --点燃--> FeS（黑色）：化合反应快（快于铁/硫各自的燃烧），点燃即优先化合
  { type: 'special', reactants: [{ id: 'Fe', coeff: 1 }, { id: 'S', coeff: 1 }], products: [{ id: 'FeS', coeff: 1 }], condition: 'ignited', rate: RATE.special * 3 },
  // Cu + S --点燃--> CuS（黑色）
  { type: 'special', reactants: [{ id: 'Cu', coeff: 1 }, { id: 'S', coeff: 1 }], products: [{ id: 'CuS', coeff: 1 }], condition: 'ignited', rate: RATE.special },
  // 注：NH3+HCl 白烟、CaCO3/Na2CO3+大气CO2→酸式盐、Na2O2+CO2 放在引擎的
  // reactAtmosphere / _trySpecialSelf（需要大气 CO2 且仅在有水环境转酸式盐）
];

// ---- 金属与大气卤素的化合（点燃；气体来自大气，能附着金属表面）----
const METAL_NONMETAL_RULES = [
  // 2Na + Cl2 --点燃--> 2NaCl（白烟）
  { type: 'special', reactants: [{ id: 'Na', coeff: 2 }, { id: 'Cl2', coeff: 1 }], products: [{ id: 'NaCl', coeff: 2 }], condition: 'ignited', rate: RATE.special },
  // 2Fe + 3Cl2 --点燃--> 2FeCl3（棕烟）
  { type: 'special', reactants: [{ id: 'Fe', coeff: 2 }, { id: 'Cl2', coeff: 3 }], products: [{ id: 'FeCl3', coeff: 2 }], condition: 'ignited', rate: RATE.special },
  // Cu + Cl2 --点燃--> CuCl2（棕黄烟）
  { type: 'special', reactants: [{ id: 'Cu', coeff: 1 }, { id: 'Cl2', coeff: 1 }], products: [{ id: 'CuCl2', coeff: 1 }], condition: 'ignited', rate: RATE.special },
];

// ---- 碱吸收酸性气体（气体在含碱容器中产生/大气被碱吸收时发生）----
const ACID_GAS_RULES = [
  { gas: 'CO2', base: 'NaOH', baseCoeff: 2, products: [{ id: 'Na2CO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'CO2', base: 'Ca(OH)2', baseCoeff: 1, products: [{ id: 'CaCO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'CO2', base: 'KOH', baseCoeff: 2, products: [{ id: 'K2CO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'SO2', base: 'NaOH', baseCoeff: 2, products: [{ id: 'Na2SO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'SO2', base: 'Ca(OH)2', baseCoeff: 1, products: [{ id: 'CaSO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'SO2', base: 'KOH', baseCoeff: 2, products: [{ id: 'K2SO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  // Cl2 尾气处理（有毒）：Cl2 + 2NaOH → NaCl + NaClO + H2O
  { gas: 'Cl2', base: 'NaOH', baseCoeff: 2, products: [{ id: 'NaCl', coeff: 1 }, { id: 'NaClO', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'Cl2', base: 'KOH', baseCoeff: 2, products: [{ id: 'KCl', coeff: 1 }, { id: 'KClO', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  // NH3 碱性气体被酸吸收：NH3 + HCl → NH4Cl
  { gas: 'NH3', base: 'HCl', baseCoeff: 1, products: [{ id: 'NH4Cl', coeff: 1 }] },
  { gas: 'NH3', base: 'H2SO4', baseCoeff: 2, products: [{ id: '(NH4)2SO4', coeff: 1 }] },
];

function acidGasRuleFor(gas, base) {
  for (const r of ACID_GAS_RULES) {
    if (r.gas === gas && r.base === base) return r;
  }
  return null;
}

// ---- 气体溶于水（CO2→H2CO3、SO2→H2SO3、SO3→H2SO4、NO2 歧化、氨水、Cl2 氯水）----
// acid 产物是气体（Cl2）时作为"溶质"直接入溶液（氯水，可继续参与氧化还原）
const GAS_WATER_RULES = [
  { gas: 'CO2', acid: 'H2CO3' },
  { gas: 'SO2', acid: 'H2SO3' },
  { gas: 'SO3', acid: 'H2SO4' },
  { gas: 'NO2', acid: 'HNO3', byGas: 'NO' }, // 3NO2 + H2O → 2HNO3 + NO（简化 1:1）
  { gas: 'NH3', acid: 'NH3·H2O' },
  { gas: 'Cl2', acid: 'Cl2' },               // 氯气溶于水 → 氯水（溶质）
];

// ---- 大气可燃气体：不设"缓慢燃烧"----
// 酒精灯/喷灯只是点火源与加热源，其火焰不消耗大气 O2、不产生 CO2。
// 可燃气体（H2/CO/CH4/H2S）遇点燃源只有两种结局：积累到爆炸下限 → 爆鸣；
// 浓度不足 → 不反应（气体留在大气里，玩家可通过气泡柱标签观察）。
const ATMOSPHERE_COMBUSTION_RULES = [];

// ---- 大气特殊反应：合成氨、氨催化氧化 ----
const ATMOSPHERE_SPECIAL_RULES = [
  // N2 + 3H2 ⇌ 2NH3（工业合成氨：高温高压催化剂，游戏简化为高温）
  { type: 'special', reactants: [{ id: 'N2', coeff: 1 }, { id: 'H2', coeff: 3 }], products: [{ id: 'NH3', coeff: 2 }], condition: 'highTemp', rate: RATE.special * 0.3 },
  // 4NH3 + 5O2 --催化剂△--> 4NO + 6H2O（氨催化氧化）
  { type: 'special', reactants: [{ id: 'NH3', coeff: 4 }, { id: 'O2', coeff: 5 }], products: [{ id: 'NO', coeff: 4 }, { id: 'H2O', coeff: 6 }], condition: 'ignited', rate: RATE.special * 0.5 },
  // 2NO + O2 → 2NO2（无色 NO 遇空气氧化成红棕 NO₂；慢速便于观察"无色→红棕"）
  { type: 'special', reactants: [{ id: 'NO', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'NO2', coeff: 2 }], condition: 'normal', rate: RATE.special * 0.05 },
];

exports.RATE = RATE;
exports.THERMAL_RULES = THERMAL_RULES;
exports.CATALYTIC_RULES = CATALYTIC_RULES;
exports.COMBUSTION_RULES = COMBUSTION_RULES;
exports.AUTO_DECOMP_RULES = AUTO_DECOMP_RULES;
exports.GAS_REDUCTION_RULES = GAS_REDUCTION_RULES;
exports.SOLID_REDUCTION_RULES = SOLID_REDUCTION_RULES;
exports.SPECIAL_PAIR_RULES = SPECIAL_PAIR_RULES;
exports.METAL_NONMETAL_RULES = METAL_NONMETAL_RULES;
exports.ACID_GAS_RULES = ACID_GAS_RULES;
exports.acidGasRuleFor = acidGasRuleFor;
exports.GAS_WATER_RULES = GAS_WATER_RULES;
exports.ATMOSPHERE_COMBUSTION_RULES = ATMOSPHERE_COMBUSTION_RULES;
exports.ATMOSPHERE_SPECIAL_RULES = ATMOSPHERE_SPECIAL_RULES;

  };
  __modules["src/chem/redox.js"] = function (module, exports, __require) {
// ============================================================================
// 氧化还原规律系统（L1 REDOX_SYSTEM）
// ----------------------------------------------------------------------------
// 数据驱动：氧化剂表 + 还原剂表（各按价态/介质分支），balanceRedox 自动配平：
//   1. 电子守恒 → 主系数（得失电子数最小公倍数）
//   2. 电荷守恒 → 介质离子（酸性补 H+ / 碱性补 OH-）
//   3. 氧守恒 → H2O 系数；氢守恒校验（不平衡则判该组合不成立）
//   4. 旁观离子配盐（buildSalt）→ 输出完整物质方程式
// 浓度/计量比决定分支（量变引起质变）：
//   - 稀/浓 HNO3 → NO / NO2；Fe 被弱/强氧化剂 → Fe2+ / Fe3+
//   - C 充分/不充分燃烧 → CO2 / CO；2H2S+O2 不足/过量 → S / SO2
//   - CO2 与碱少量/过量 → 正盐 / 酸式盐（engine 侧计量比分支）
// ============================================================================

const { buildSalt, getSubstance, IONS } = __require('src/chem/substances.js');;

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

/**
 * 氧化剂表：键为物质 id。
 *   ion      —— 有效氧化离子的 { charge, o, h }（电荷/氧/氢原子数）
 *   cation   —— 旁观阳离子（配盐用）；cationN —— 每分子氧化剂的阳离子数
 *   anion    —— 旁观阴离子（氧化剂是盐时，如 CuSO4 的 SO4^2-）
 *   branches —— 按介质/浓度选分支；分支含 { gain(每分子得电子), product{id,charge,o,h,count} }
 *   strength —— 氧化剂强度（≥9 视为强：能把 Fe 氧化到 Fe3+）
 */
const OXIDIZERS = {
  KMnO4: {
    ion: { charge: -1, o: 4 }, cation: 'K+', cationN: 1,
    branches: {
      acid:    { gain: 5, product: { id: 'Mn2+', charge: 2, o: 0 } },                 // 紫色→Mn2+ 无色
      neutral: { gain: 3, product: { id: 'MnO2', charge: 0, o: 2 } },                 // MnO2↓ 黑
      base:    { gain: 1, product: { id: 'MnO4^2-', charge: -2, o: 4 } },             // 强碱→锰酸钾绿
    },
    strength: 10,
  },
  K2Cr2O7: {
    ion: { charge: -2, o: 7 }, cation: 'K+', cationN: 2,
    branches: {
      acid: { gain: 6, product: { id: 'Cr3+', charge: 3, o: 0, count: 2 } },          // 橙红→Cr3+ 绿
    },
    strength: 9,
  },
  HNO3: {
    ion: { charge: -1, o: 3 },
    branches: {
      conc:   { gain: 1, product: { id: 'NO2', charge: 0, o: 2 } },                   // 浓硝酸→NO2 红棕
      dilute: { gain: 3, product: { id: 'NO', charge: 0, o: 1 } },                    // 稀硝酸→NO 无色
    },
    strength: 8,
  },
  H2SO4: {
    // 浓硫酸（S+6→+4，每分子得 2e）。离子为 SO4^2-（电荷 -2，O4）；H+ 由 medH 统一补
    ion: { charge: -2, o: 4 },
    branches: { any: { gain: 2, product: { id: 'SO2', charge: 0, o: 2 } } },           // →SO2
    strength: 8,
  },
  Cl2: { ion: { charge: 0, o: 0 }, branches: { any: { gain: 2, product: { id: 'Cl-', charge: -1, o: 0, count: 2 } } }, strength: 11 },
  Br2: { ion: { charge: 0, o: 0 }, branches: { any: { gain: 2, product: { id: 'Br-', charge: -1, o: 0, count: 2 } } }, strength: 8 },
  I2:  { ion: { charge: 0, o: 0 }, branches: { any: { gain: 2, product: { id: 'I-', charge: -1, o: 0, count: 2 } } }, strength: 7 },
  H2O2: {
    ion: { charge: 0, o: 2, h: 2 },
    branches: {
      acid:    { gain: 2, product: { id: 'H2O', charge: 0, o: 1, h: 2, count: 2 } },   // →H2O
      base:    { gain: 2, product: { id: 'OH-', charge: -1, o: 1, h: 1, count: 2 } },  // →OH-
      neutral: { gain: 2, product: { id: 'H2O', charge: 0, o: 1, h: 2, count: 2 } },
    },
    strength: 6,
  },
  O2: {
    ion: { charge: 0, o: 2 },
    branches: {
      acid:    { gain: 4, product: { id: 'H2O', charge: 0, o: 1, h: 2, count: 2 } },
      base:    { gain: 4, product: { id: 'OH-', charge: -1, o: 1, h: 1, count: 4 } },
      neutral: { gain: 4, product: { id: 'OH-', charge: -1, o: 1, h: 1, count: 4 } },
    },
    strength: 9,
  },
  'Fe3+': { ion: { charge: 3, o: 0 }, branches: { any: { gain: 1, product: { id: 'Fe2+', charge: 2, o: 0 } } }, strength: 5 },
  NaClO: {
    ion: { charge: -1, o: 1 }, cation: 'Na+', cationN: 1,
    branches: { any: { gain: 2, product: { id: 'Cl-', charge: -1, o: 0 } } },          // ClO-→Cl-
    strength: 8,
  },
  'H+': { ion: { charge: 1, o: 0, h: 1 }, branches: { any: { gain: 1, product: { id: 'H2', charge: 0, o: 0, h: 2, count: 0.5 } } }, strength: 3 },
  CuSO4: { ion: { charge: 2, o: 0 }, anion: 'SO4^2-', branches: { any: { gain: 2, product: { id: 'Cu', charge: 0, o: 0 } } }, strength: 4 },
  CuCl2: { ion: { charge: 2, o: 0 }, anion: 'Cl-', anionN: 2, branches: { any: { gain: 2, product: { id: 'Cu', charge: 0, o: 0 } } }, strength: 4 },
  AgNO3: { ion: { charge: 1, o: 0 }, anion: 'NO3-', branches: { any: { gain: 1, product: { id: 'Ag', charge: 0, o: 0 } } }, strength: 4 },
  FeCl3: { ion: { charge: 3, o: 0 }, anion: 'Cl-', anionN: 3, branches: { any: { gain: 1, product: { id: 'Fe2+', charge: 2, o: 0 } } }, strength: 5 },
};

/**
 * 还原剂表：
 *   ion    —— 有效还原离子（金属单质 charge 0）
 *   anion  —— 旁观阴离子（配盐用，如 FeSO4 的 SO4^2-）
 *   loss   —— 每分子失电子数；product —— 氧化产物
 *   branches —— 强/弱氧化剂分支（Fe 单质），或 O2 量分支（C、H2S）
 */
const REDUCERS = {
  // Fe2+ 只能被较强氧化剂氧化（Cl2/KMnO4/K2Cr2O7/浓HNO3/Br2；I2 氧化性不足）
  FeSO4:   { ion: { charge: 2, o: 0 }, anion: 'SO4^2-', loss: 1, product: { id: 'Fe3+', charge: 3, o: 0 }, minOx: 8 },
  FeCl2:   { ion: { charge: 2, o: 0 }, anion: 'Cl-', anionN: 2, loss: 1, product: { id: 'Fe3+', charge: 3, o: 0 }, minOx: 8 },
  Fe: {
    ion: { charge: 0, o: 0 },
    branches: {
      weak:   { loss: 2, product: { id: 'Fe2+', charge: 2, o: 0 } },   // 弱氧化剂（H+/Cu2+/Fe3+）
      strong: { loss: 3, product: { id: 'Fe3+', charge: 3, o: 0 } },   // 强氧化剂（Cl2/KMnO4/HNO3...）
    },
  },
  Cu:    { ion: { charge: 0, o: 0 }, loss: 2, product: { id: 'Cu2+', charge: 2, o: 0 } },
  Zn:    { ion: { charge: 0, o: 0 }, loss: 2, product: { id: 'Zn2+', charge: 2, o: 0 } },
  Mg:    { ion: { charge: 0, o: 0 }, loss: 2, product: { id: 'Mg2+', charge: 2, o: 0 } },
  Al:    { ion: { charge: 0, o: 0 }, loss: 3, product: { id: 'Al3+', charge: 3, o: 0 } },
  Na:    { ion: { charge: 0, o: 0 }, loss: 1, product: { id: 'Na+', charge: 1, o: 0 } },
  K:     { ion: { charge: 0, o: 0 }, loss: 1, product: { id: 'K+', charge: 1, o: 0 } },
  Li:    { ion: { charge: 0, o: 0 }, loss: 1, product: { id: 'Li+', charge: 1, o: 0 } },
  SO2:   { ion: { charge: 0, o: 2 }, loss: 2, product: { id: 'SO4^2-', charge: -2, o: 4 } },   // +4S→+6S
  H2SO3: { ion: { charge: 0, o: 3, h: 2 }, loss: 2, product: { id: 'SO4^2-', charge: -2, o: 4 } },
  Na2SO3:{ ion: { charge: -2, o: 3 }, cation: 'Na+', cationN: 2, loss: 2, product: { id: 'SO4^2-', charge: -2, o: 4 } }, // 旁观阳离子（碱金属盐）
  H2S:   { ion: { charge: 0, o: 0, h: 2 }, loss: 2, product: { id: 'S', charge: 0, o: 0 } },   // -2S→0
  FeS:   { ion: { charge: 0, o: 0 }, loss: 2, product: { id: 'S', charge: 0, o: 0 } },        // FeS→Fe2+ + S
  H2O2:  { ion: { charge: 0, o: 2, h: 2 }, loss: 2, product: { id: 'O2', charge: 0, o: 2 } },  // 还原性（被强氧化剂）
  KI:    { ion: { charge: -1, o: 0 }, cation: 'K+', loss: 1, product: { id: 'I2', charge: 0, o: 0, count: 0.5 } },
  NaI:   { ion: { charge: -1, o: 0 }, cation: 'Na+', loss: 1, product: { id: 'I2', charge: 0, o: 0, count: 0.5 } },
  KBr:   { ion: { charge: -1, o: 0 }, cation: 'K+', loss: 1, product: { id: 'Br2', charge: 0, o: 0, count: 0.5 } },
  NaBr:  { ion: { charge: -1, o: 0 }, cation: 'Na+', loss: 1, product: { id: 'Br2', charge: 0, o: 0, count: 0.5 } },
  CO:    { ion: { charge: 0, o: 1 }, loss: 2, product: { id: 'CO2', charge: 0, o: 2 } },
  H2:    { ion: { charge: 0, o: 0, h: 2 }, loss: 2, product: { id: 'H2O', charge: 0, o: 1, h: 2 } },
  // 注：C 不进 REDOX 表——碳常温不参与离子氧化还原（不跟酸/盐溶液反应），
  // 其氧化只走 COMBUSTION_RULES（点燃）与 GAS/SOLID_REDUCTION_RULES（高温）
  H2C2O4:{ ion: { charge: 0, o: 4, h: 2 }, loss: 2, product: { id: 'CO2', charge: 0, o: 2, count: 2 } }, // 草酸
  C2H5OH:{ ion: { charge: 0, o: 1, h: 6 }, loss: 4, product: { id: 'CH3COOH', charge: 0, o: 2, h: 4 } },  // 酒驾橙→绿
  'K2MnO4': { ion: { charge: -2, o: 4 }, cation: 'K+', cationN: 2, loss: 1, product: { id: 'KMnO4', charge: -1, o: 4 } }, // 锰酸钾→高锰酸钾
};

/** 氧化剂强度≥9 视为"强"（能把 Fe 氧化到 Fe3+；Cl2/KMnO4/K2Cr2O7/O2） */
const STRONG_OXIDIZER = 9;

/** 介质的阴离子（配盐用）：酸介质取酸的阴离子，碱介质取碱阳离子 */
function mediaInfo(solution) {
  // solution: { mass(id), ids() }；返回 { medium, acidAnion, acidId, baseId }
  let acidAnion = null;
  let acidId = null;
  let baseId = null;
  for (const id of solution.ids()) {
    const s = getSubstance(id);
    if (!acidAnion && s.kind === 'acid' && s.acidStrength === 'strong' && s.ions) {
      acidAnion = s.ions.an;
      acidId = id;
    }
    if (!baseId && s.kind === 'base' && s.acidStrength === 'strong') baseId = id;
  }
  if (acidAnion) return { medium: 'acid', acidAnion, acidId, baseId: null };
  if (baseId) return { medium: 'base', acidAnion: null, acidId: null, baseId };
  return { medium: 'neutral', acidAnion: null, acidId: null, baseId: null };
}

/** 选择氧化剂分支：medium + 浓度（g/L） */
function oxBranch(entry, medium, conc) {
  const b = entry.branches;
  if (b.any) return b.any;
  if (entry === OXIDIZERS.HNO3 || entry.id === 'HNO3') {
    return conc >= 300 ? b.conc : b.dilute; // 浓/稀硝酸阈值（g/L）
  }
  if (b[medium]) return b[medium];
  return b.acid ?? b.neutral ?? b.base ?? b.any;
}

/** 选择还原剂分支：weak/strong（Fe）、full/partial（C）由外部给出 */
function redBranch(entry, key) {
  const b = entry.branches;
  if (!b) return { loss: entry.loss, product: entry.product };
  return b[key] ?? b.weak ?? b.full ?? b.partial ?? b.strong;
}

function scaleProduct(p, n) {
  const count = p.count ?? 1;
  return { id: p.id, charge: p.charge, o: p.o, h: p.h ?? 0, n: n * count };
}

/**
 * 自动配平：返回 { rx: [{id, coeff}], pd: [{id, coeff}] }（系数为摩尔数，可为分数）
 * 任一步校验失败返回 null（该氧化剂×还原剂组合不成立）。
 *
 * 介质离子规则：
 *   - 酸介质：dq>0 左补 H+；dq<0 右补 H+（产物酸，如 KMnO4+SO2→H2SO4）
 *   - 碱介质：dq>0 右补 OH-；dq<0 左补 OH-
 *   - 中性介质：dq<0 右补 H+（生成酸，如 H2S+Cl2→2HCl+S）；dq>0 判不成立
 * H2O 系数可为负（SO2 氧化需要水参与反应物）。
 */
function balanceRedox(oxId, redId, opts = {}) {
  const ox = OXIDIZERS[oxId];
  const red = REDUCERS[redId];
  if (!ox || !red) return null;
  const { medium = 'acid', conc = 0, redKey = 'weak', oxKey } = opts;
  const ob = oxKey ? ox.branches[oxKey] ?? ox.branches.any : oxBranch(ox, medium, conc);
  const rb = redBranch(red, redKey);
  if (!ob || !rb) return null;

  const g = gcd(ob.gain, rb.loss);
  const a = rb.loss / g; // 氧化剂 mol
  const b = ob.gain / g; // 还原剂 mol

  // 主产物
  const redP = scaleProduct(ob.product, a);
  const oxP = scaleProduct(rb.product, b);

  // 电荷守恒 → 介质离子（酸介质 H+；碱介质 OH-；中性 dq<0 时产物酸）
  if (!ox.ion || !red.ion) return null; // 氧化剂/还原剂缺离子配置 → 跳过配平
  const qRx = a * ox.ion.charge + b * red.ion.charge;
  const qPd = redP.n * redP.charge + oxP.n * oxP.charge;
  const dq = qPd - qRx;
  let medH = 0; // H+ mol：>0 在方程左（消耗），<0 在方程右（产物酸）
  let medOH = 0; // OH- mol：>0 在方程左（消耗），<0 在方程右（产物碱）
  if (Math.abs(dq) > 1e-9) {
    if (medium === 'acid') medH = dq;        // dq>0 左补 H+；dq<0 右补 H+
    else if (medium === 'base') medOH = dq;  // dq>0 左补 OH-；dq<0 右补 OH-
    else medH = dq < 0 ? dq : 0;             // 中性：仅 dq<0（产物酸）成立
  }
  // 校验电荷：qRx + 左介质电荷 = qPd + 右介质电荷
  const qL = qRx + (medH > 0 ? medH : 0) + (medOH < 0 ? medOH : 0);
  const qR = qPd + (medH < 0 ? -medH : 0) + (medOH > 0 ? -medOH : 0);
  if (Math.abs(qL - qR) > 1e-6) return null;

  // 氧守恒 → H2O（可为负：H2O 参与反应物，如 SO2 被氧化需补水）
  const oL = a * ox.ion.o + b * red.ion.o + (medOH < 0 ? -medOH : 0);
  const oR = redP.n * redP.o + oxP.n * oxP.o + (medOH > 0 ? medOH : 0);
  const h2o = oL - oR;

  // 氢守恒校验
  const hL = a * (ox.ion.h ?? 0) + b * (red.ion.h ?? 0) + (medH > 0 ? medH : 0) + (medOH < 0 ? -medOH : 0) + (h2o < 0 ? -h2o * 2 : 0);
  const hR = redP.n * redP.h + oxP.n * oxP.h + (medH < 0 ? -medH : 0) + (medOH > 0 ? medOH : 0) + (h2o > 0 ? h2o * 2 : 0);
  if (Math.abs(hL - hR) > 1e-6) return null;

  // ---- 组装产物（分子式级别）：介质离子 → 酸/碱分子；离子产物 → 配盐 ----
  const rx = [];
  const pd = [];
  const cations = []; // {id, n}
  const anions = [];  // {id, n}
  const freeProducts = []; // {id, n} 分子产物（气体/沉淀/单质）

  /** 产物归类：离子 → 配盐池；酸/分子 → 直接产物 */
  const classify = (id, n) => {
    if (n <= 1e-9) return;
    if (id === 'H+') { cations.push({ id: 'H+', n }); return; }
    if (id === 'OH-') { anions.push({ id: 'OH-', n }); return; }
    const ion = IONS[id];
    if (ion) {
      if (ion.charge > 0) cations.push({ id, n });
      else anions.push({ id, n });
      return;
    }
    const s = getSubstance(id);
    if (s.ions && s.ions.cat === 'H+') {
      freeProducts.push({ id, n }); // 酸（弱酸不电离，直接产物）
      return;
    }
    if (s.ions) {
      cations.push({ id: s.ions.cat, n: n * s.ions.catCount });
      anions.push({ id: s.ions.an, n: n * s.ions.anCount });
      return;
    }
    freeProducts.push({ id, n });
  };
  classify(redP.id, redP.n);
  classify(oxP.id, oxP.n);

  // 旁观离子：氧化剂阳离子/阴离子 + 还原剂阳离子/阴离子
  if (ox.cation) cations.push({ id: ox.cation, n: a * (ox.cationN ?? 1) });
  if (ox.anion) anions.push({ id: ox.anion, n: a * (ox.anionN ?? 1) });
  if (red.cation) cations.push({ id: red.cation, n: b * (red.cationN ?? 1) });
  if (red.anion) anions.push({ id: red.anion, n: b * (red.anionN ?? 1) });

  // 介质：H+ / OH- 的来源与去向
  const oxIsAcid = oxId === 'H+' || getSubstance(oxId).ions?.cat === 'H+';
  if (oxId === 'H+') {
    // H+ 作氧化剂：酸分子承载全部 H+（a 个被还原 + medH 个电荷差额）
    const acid = getSubstance(opts.acidId ?? 'H2SO4');
    const acidMol = (a + (medH > 0 ? medH : 0)) / acid.ions.catCount;
    rx.push({ id: opts.acidId ?? 'H2SO4', coeff: acidMol });
    anions.push({ id: acid.ions.an, n: a + (medH > 0 ? medH : 0) });
  } else if (oxIsAcid) {
    // 氧化剂即酸（HNO3）：被还原 a 分子；medH>0 时还需额外酸提供 H+
    const acid = getSubstance(oxId);
    const acidMol = medH > 0 ? Math.max(a, medH / acid.ions.catCount) : a;
    rx.push({ id: oxId, coeff: acidMol });
    const leftoverAn = (acidMol - a) * acid.ions.anCount; // 未被还原的酸根→配盐
    if (leftoverAn > 1e-9) anions.push({ id: acid.ions.an, n: leftoverAn });
    if (medH < 0) cations.push({ id: 'H+', n: -medH + a * acid.ions.catCount }); // 产物酸 H+（含 ox 电离贡献）
  } else {
    rx.push({ id: oxId, coeff: a });
    if (medH > 0) {
      // 非酸氧化剂 + 酸介质：介质酸提供 H+ 与阴离子
      const acidId = opts.acidId ?? 'H2SO4';
      const acid = getSubstance(acidId);
      rx.push({ id: acidId, coeff: medH / acid.ions.catCount });
      anions.push({ id: acid.ions.an, n: medH });
    }
    if (medH < 0) cations.push({ id: 'H+', n: -medH }); // 产物酸
  }
  if (medOH !== 0) {
    const baseId = opts.baseId ?? 'KOH';
    const base = getSubstance(baseId);
    if (medOH < 0) {
      // OH- 在左（消耗）：碱分子参与反应，阳离子配盐
      rx.push({ id: baseId, coeff: -medOH / base.ions.anCount });
      cations.push({ id: base.ions.cat, n: -medOH });
    } else {
      anions.push({ id: 'OH-', n: medOH }); // OH- 在右（产物）：配盐成碱
    }
  }
  rx.push({ id: redId, coeff: b });
  if (h2o !== 0) (h2o > 0 ? pd : rx).push({ id: 'H2O', coeff: Math.abs(h2o) });
  for (const p of freeProducts) pd.push({ id: p.id, coeff: p.n });

  // ---- 配盐：阳离子 × 阴离子（buildSalt），贪婪匹配 ----
  const cMap = new Map();
  for (const c of cations) cMap.set(c.id, (cMap.get(c.id) ?? 0) + c.n);
  const aMap = new Map();
  for (const an of anions) aMap.set(an.id, (aMap.get(an.id) ?? 0) + an.n);
  for (const [catId, catN] of cMap) {
    if (catN <= 1e-9) continue;
    let rest = catN;
    for (const [anId, anN] of aMap) {
      if (anN <= 1e-9 || rest <= 1e-9) continue;
      const salt = buildSalt(catId, anId);
      const take = Math.min(rest / salt.catCount, anN / salt.anCount);
      if (take <= 1e-9) continue;
      pd.push({ id: salt.formula, coeff: take });
      rest -= take * salt.catCount;
      aMap.set(anId, anN - take * salt.anCount);
    }
  }
  // 合并同 id 产物（H2O 可能出现两次）
  const pdMap = new Map();
  for (const p of pd) pdMap.set(p.id, (pdMap.get(p.id) ?? 0) + p.coeff);
  pd.length = 0;
  for (const [id, coeff] of pdMap) if (Math.abs(coeff) > 1e-9) pd.push({ id, coeff });
  return { rx, pd };
}

exports.OXIDIZERS = OXIDIZERS;
exports.REDUCERS = REDUCERS;
exports.STRONG_OXIDIZER = STRONG_OXIDIZER;
exports.mediaInfo = mediaInfo;
exports.balanceRedox = balanceRedox;

  };
  __modules["src/chem/atmosphere.js"] = function (module, exports, __require) {
// ============================================================================
// 环境大气模型
// ----------------------------------------------------------------------------
// 名义总空气 totalAir（默认 2000g，游戏尺度）：玩家产生 1g 气体 ≈ 0.05% 可见度。
// 初始组成默认 N2 80% / O2 20%。反应产生气体 → add；燃烧耗氧 → remove。
// 百分比按实时总质量计算（HUD 同时显示百分比与质量）。
// ============================================================================

class Atmosphere {
  constructor({ totalAir = 2000, init = { N2: 0.8, O2: 0.2 } } = {}) {
    this.gas = new Map();
    for (const [id, frac] of Object.entries(init)) {
      this.gas.set(id, totalAir * frac);
    }
    // 保证总质量至少等于 totalAir（预留可加"基准惰性气体"）
    this._baseTotal = totalAir;
    this._cause = null; // 当前反应原因（气体变化溯源；由化学引擎盖章）
    this._log = []; // 本 tick 气体变化日志 [{id, delta, cause}]
  }

  mass(id) {
    return this.gas.get(id) ?? 0;
  }

  total() {
    let s = 0;
    for (const m of this.gas.values()) s += m;
    return s;
  }

  fraction(id) {
    const t = this.total();
    return t === 0 ? 0 : this.mass(id) / t;
  }

  add(id, mass) {
    if (mass <= 0) return;
    this.gas.set(id, this.mass(id) + mass);
    if (this._cause) this._log.push({ id, delta: mass, cause: this._cause });
  }

  /** 直接设置某气体含量（g）——关卡/插件场景大气预设用（覆盖而非累加） */
  setGas(id, mass) {
    if (!Number.isFinite(mass) || mass < 0) return;
    const prev = this.mass(id);
    this.gas.set(id, mass);
    if (this._cause && Math.abs(mass - prev) > 1e-9) this._log.push({ id, delta: mass - prev, cause: this._cause });
  }

  remove(id, mass) {
    if (mass <= 0) return 0;
    const cur = this.mass(id);
    const removed = Math.min(cur, mass);
    this.gas.set(id, cur - removed);
    if (removed > 1e-9 && this._cause) this._log.push({ id, delta: -removed, cause: this._cause });
    return removed;
  }

  /** 取走并清空本 tick 的气体变化日志（调试面板显示产生/消耗原因） */
  flushLog() {
    const out = this._log;
    this._log = [];
    return out;
  }

  o2Fraction() {
    return this.fraction('O2');
  }

  composition() {
    const t = this.total();
    const out = {};
    for (const [id, m] of this.gas) out[id] = m / t;
    return out;
  }
}

// ============================================================================
// AtmosphereMaterial：把大气适配成 Material 接口（作为还原剂 CO/H2、燃烧 O2 的反应物）
// ============================================================================
class AtmosphereMaterial {
  constructor(atmosphere) {
    this.atmosphere = atmosphere;
    this.phase = 'gas';
    this.isPlayer = false;
    this.container = null;
  }

  avail(id) {
    return this.atmosphere.mass(id);
  }

  consume(id, mass) {
    return this.atmosphere.remove(id, mass);
  }

  add(id, mass) {
    this.atmosphere.add(id, mass);
  }

  ids() {
    return [...this.atmosphere.gas.keys()];
  }
}

exports.Atmosphere = Atmosphere;
exports.AtmosphereMaterial = AtmosphereMaterial;

  };
  __modules["src/physics/collision.js"] = function (module, exports, __require) {
// ============================================================================
// 碰撞系统
// ----------------------------------------------------------------------------
// 分轴解算：先 X 后 Y。两轴都按小步长移动（≤ maxXStep / maxYStep），避免高速穿过
// 薄墙/薄板；被挡时在精确边界停下。静态体（地板）阻挡所有动态体；动态体彼此仅在
// 双方 solid 时碰撞；可推动物块被水平链式推挤，单次推挤不超过一个步长，被挡则
// 整体还原、推动方停住。自动上台阶：被台阶阻挡且高度差 ≤ autoStepMax 时直接走上。
//
// 防穿模/防瞬移的关键设计：
//  1. 撞顶/落地按"本子步移动前的相对位置"判定接触面，钳制后立即停止剩余子步——
//     旧代码在撞顶钳制后子步继续上移，留下嵌入，随后被"宽面抬升"一帧帧顶穿到
//     板顶（"跳到池底上方"的瞬移）。现在撞顶即停在板底，永不嵌入。
//  2. X 轴只解算真正的侧面接触；正在落地（底边浅入）或撞顶（头顶浅入）时不横推，
//     交给 Y 轴——杜绝"落地瞬间被横向甩出 16px"的落地瞬移，也杜绝深嵌时一帧帧
//     横向漂移。
//  3. 每刻末尾的残余重叠解算（4 面 MTV：取上/下/左/右四个面中最小穿透量推出，
//     单次封顶 MAX_RESOLVE_X/Y）：处理斜向冲入板底、出生嵌入实心、传送落点、
//     爆炸推挤等轴解算覆盖不到的残留。穿透最小的面 = 体离哪边最近，推出方向必然
//     把体送回它来的那一侧——被池底顶住时只会被推回下方，绝不会被顶到上方。
//  4. 深嵌入（传送/出生/爆炸后）按 ≤16px/帧温柔推出，不一次性大位移。
//
// 已知简化（MVP）：推挤不"携带"堆叠在上方的物块（上方物块会短暂失去支撑而后落下）；
// 下落速度被钳制以防穿墙。
// ============================================================================

const { AABB } = __require('src/physics/aabb.js');;

/** 单次穿透解压的最大位移（px）：任何一帧都不会"一次性推出很远"而显得瞬移。 */
const MAX_RESOLVE_X = 16;
const MAX_RESOLVE_Y = 16;
/** 垂直面接触的判定阈值（px）：小于此值的穿透按"落地/撞顶"处理，不做横向解算；
 *  大于此值的深嵌入交给 MTV 按最小穿透面推出。 */
const STEP_MAX = 32;

/** 某体的碰撞形状列表（世界坐标 AABB）。默认单矩形；网格类对象返回贴合物质的多矩形 */
function shapesOf(b) {
  const list = b && typeof b.getShapes === 'function' ? b.getShapes() : [b.collider()];
  return list.map((s) => (s && typeof s.overlaps === 'function' ? s : new AABB(s.x, s.y, s.w, s.h)));
}

function overlaps(a, b, eps = 0) {
  const sa = shapesOf(a);
  const sb = shapesOf(b);
  for (const x of sa) for (const y of sb) if (x.overlaps(y, eps)) return true;
  return false;
}

/**
 * 该动态体是否能被"站上去"（提供支撑）：
 * 沉淀粒子（有 amount）必须**落地静止**（onGround 且速度接近 0）才可踮脚——
 * 正在下落/刚放置的沉淀不能给玩家提供向上的支持力（否则"跳→下落瞬间放置→
 * 左脚踩右脚上天"）。普通物块/玩家随时可站。
 */
function supportsStanding(o) {
  if (o.amount === undefined) return true;
  return o.onGround === true && Math.abs(o.vel.x) < 40 && Math.abs(o.vel.y) < 40;
}

/**
 * 四面穿透量：对每对重叠的碰撞形状，计算从 上/下/左/右 四个面的最小穿透深度。
 * 某面没有重叠时为 Infinity（该面不构成候选）。
 * 用"形状对"而非整个 AABB：被完全腐蚀掉的部分（无形状）不参与，也不挡人。
 */
function penSides(b, o) {
  const sb = shapesOf(b);
  const so = shapesOf(o);
  let top = Infinity;
  let bottom = Infinity;
  let left = Infinity;
  let right = Infinity;
  for (const a of sb) {
    for (const c of so) {
      if (!a.overlaps(c, 0)) continue;
      top = Math.min(top, a.bottom - c.top);
      bottom = Math.min(bottom, c.bottom - a.top);
      left = Math.min(left, c.right - a.left);
      right = Math.min(right, a.right - c.left);
    }
  }
  return { top, bottom, left, right };
}

/**
 * X 轴是否应该做横向解算？
 * 垂直面接触（正在落地/撞顶，或深嵌但 MTV 会选垂直轴）时返回 false，把体交给
 * Y 轴/MTV——否则横向解算会把刚落到表面的体横着甩出去（"落地瞬移"），或在深嵌
 * 宽地板里一帧帧横向漂移。
 */
function xShouldResolve(b, p) {
  const mHor = Math.min(p.left, p.right);
  if (b.vel.y > 0) return !(p.top < mHor); // 下落中：底边穿透更小 → 落地接触，不横推
  if (b.vel.y < 0) return !(p.bottom < mHor); // 上升中：头顶穿透更小 → 撞顶接触，不横推
  // 静止：浅穿透（≤STEP_MAX）可能是台阶/矮墙侧擦，保持旧语义（横向阻挡）；
  // 只有深嵌入且垂直轴占优时才放行给 MTV 垂直解压，避免横向漂移。
  const vert = Math.min(p.top, p.bottom);
  return !(vert > STEP_MAX && vert < mHor);
}

/**
 * 残余重叠 4 面 MTV 解算：把 b 沿"穿透最小的面"推出 o（单次封顶；深嵌入分帧推出）。
 * 由上一子步位置无法判定接触面的残留重叠（斜向冲入、出生嵌入、传送落点、爆炸
 * 推挤）都走这里——穿透最小的面就是体离哪边最近，推出方向必然把体送回它来的那侧，
 * 杜绝"被顶穿到另一面"（如被池底顶到池子上方）。
 */
function resolveEmbed(b, o) {
  const p = penSides(b, o);
  let side = null;
  let pen = Infinity;
  if (p.top <= pen) { side = 'top'; pen = p.top; }
  if (p.bottom < pen) { side = 'bottom'; pen = p.bottom; }
  if (p.left < pen) { side = 'left'; pen = p.left; }
  if (p.right < pen) { side = 'right'; pen = p.right; }
  if (side === null || pen === Infinity) return false;
  // 方向修正：MTV 选了"向下推出"（穿透最小的面在下方），但 b 的顶已在 o 的顶之上
  // ——b 不可能在 o 下方（否则顶不会高过 o 的顶），它只可能是从上方嵌入的，改判落地。
  // 典型：大物块放进池里时底边嵌进池底壁（旧代码的"宽面抬升"就为此存在），
  // 以及出生时顶恰好与地面齐平的深嵌。只对"非上升"的体生效：上升中（vel.y<0）的
  // 体是刚从下方冲上来的（如跳起斜撞池底），必须维持 MTV 的向下推出，否则会被
  // 抬到板上方——正是要杜绝的"瞬移到上面"。反过来（顶在 o 顶之下）则维持 MTV 的
  // 向下，保证撞池底/悬空板底时只会被推回下方、绝不会被抬到上方。
  if (side === 'bottom' && b.top <= o.top + 0.5 && b.vel.y >= 0) side = 'top';
  // 支撑接触保护：b 的底不高于 o 的底（b 基本在 o 正下方）时，side=bottom 的"下压"
  // 实际上是把支撑物压走——典型：物块被站在上面的玩家"踩"着，每 tick 被压进地板
  // 1.33px，玩家与物块一起下沉（"骑着物块沉地"）。这种重叠的正确解是抬 o（o 侧的
  // resolveEmbed 会按 top 面把 o 抬回 b 的顶），b 侧跳过即可。静态体（地板）除外：
  // b 嵌在地板里且底不高于地板底时仍需向下推出。
  if (side === 'bottom' && b.bottom >= o.bottom - 0.5 && !o.static) return false;
  const move = Math.min(pen, side === 'top' || side === 'bottom' ? MAX_RESOLVE_Y : MAX_RESOLVE_X);
  switch (side) {
    case 'top':
      b.y -= move;
      b.vel.y = 0;
      if (move >= pen) b.onGround = true; // 完全落地才给支撑（分帧推出期间不算）
      break;
    case 'bottom':
      b.y += move; // 从板底下方推出：向下送回，绝不向上顶穿
      b.vel.y = 0;
      break;
    case 'left':
      b.x += move;
      b.vel.x = 0;
      break;
    case 'right':
      b.x -= move;
      b.vel.x = 0;
      break;
  }
  return true;
}

/**
 * 沿穿透较小的那一侧推出（对"已嵌入"的重叠最温和，避免大跨度瞬移）。
 * 只在 X 轴判定为"侧面接触"时才调用（见 xShouldResolve）。
 */
function resolveOverlapX(b, o) {
  const sb = shapesOf(b);
  const so = shapesOf(o);
  let leftPen = Infinity;
  let rightPen = Infinity;
  for (const a of sb) {
    for (const c of so) {
      if (!a.overlaps(c, 0)) continue;
      leftPen = Math.min(leftPen, c.right - a.left);
      rightPen = Math.min(rightPen, a.right - c.left);
    }
  }
  if (leftPen === Infinity || rightPen === Infinity) return;
  if (leftPen < rightPen) b.x += Math.min(leftPen, MAX_RESOLVE_X);
  else b.x -= Math.min(rightPen, MAX_RESOLVE_X);
}

class CollisionSystem {
  constructor({ gravity = 1200, autoStepMax = 14, maxFallSpeed = 1500, maxYStep = 6, maxXStep = 6, groundFriction = 0, airFriction = 0 } = {}) {
    this.gravity = gravity;
    this.autoStepMax = autoStepMax;
    this.maxFallSpeed = maxFallSpeed;
    this.maxYStep = maxYStep; // Y 分步移动的最大步长（防穿模）
    this.maxXStep = maxXStep; // X 分步移动的最大步长（防穿墙 / 防推挤瞬移）
    this.groundFriction = groundFriction; // 落地物体的水平摩擦系数（1/s，衰减速度）
    this.airFriction = airFriction; // 空气摩擦（1/s，仅水平）：空中不无限漂移
  }

  step(dt, { dynamics, statics }) {
    this.dt = dt;
    this._buildHash(dynamics, statics); // 空间哈希宽相位（粒子堆 O(N²)→ 邻域 O(N)）
    for (const b of dynamics) {
      b.onGround = false;
      b.blockedX = false;
      b.collisions = [];
    }
    // 重力
    for (const b of dynamics) {
      if (!b.static && b.gravity > 0) {
        b.vel.y += this.gravity * b.gravity * dt;
        if (b.vel.y > this.maxFallSpeed) b.vel.y = this.maxFallSpeed;
      }
    }
    // X 积分（含推挤、自动上台阶）
    for (const b of dynamics) this.integrateX(b, dynamics, statics);
    // Y 积分（落地、撞顶、堆叠）
    for (const b of dynamics) this.integrateY(b, dynamics, statics);
    // 残余重叠分离（斜向冲入/出生嵌入/传送落点/爆炸推挤）：4 面 MTV，小步推出
    this.resolveResidual(dynamics, statics);
    // 地面摩擦：落地的动态体水平速度快速衰减——爆炸/踢飞后的物体不会永远滑行
    for (const b of dynamics) {
      if (b.onGround && b.vel.x !== 0) {
        b.vel.x *= Math.max(0, 1 - this.groundFriction * dt);
        if (Math.abs(b.vel.x) < 5) b.vel.x = 0;
      }
    }
    // 空气摩擦（仅水平）：空中/气泡柱上玩家和物块不会无限漂移；不影响垂直提升
    if (this.airFriction > 0) {
      for (const b of dynamics) {
        if (b.vel.x !== 0) {
          b.vel.x *= Math.max(0, 1 - this.airFriction * dt);
          if (Math.abs(b.vel.x) < 2) b.vel.x = 0;
        }
      }
    }
  }

  // ---- 空间哈希宽相位（相对全 O(N²) 配对：大粒度堆/多粒子场景的关键加速） ----
  _buildHash(dynamics, statics) {
    this._B = 48;
    this._hashMap = new Map();
    this._hashBig = [];
    this._stSet = new Set(statics);
    this._hashAll = dynamics; // 标记：本批体已建哈希（relax/直接调用兜底）
    const push = (b) => {
      const x0 = Math.floor(b.x / this._B);
      const x1 = Math.floor((b.x + b.w) / this._B);
      const y0 = Math.floor(b.y / this._B);
      const y1 = Math.floor((b.y + b.h) / this._B);
      if (x1 - x0 > 3 || y1 - y0 > 3) { this._hashBig.push(b); return; } // 大物体(地板/长墙):全局
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const k = cx * 8192 + cy;
          const arr = this._hashMap.get(k);
          if (arr) arr.push(b);
          else this._hashMap.set(k, [b]);
        }
      }
    };
    for (const d of dynamics) push(d);
    for (const s of statics) push(s);
  }

  /** b 的候选碰撞体（自身覆盖桶里的所有体 + 大物体）。每帧构建一次，每体调用一次。 */
  _near(b) {
    const out = this._hashBig.slice();
    const x0 = Math.floor(b.x / this._B);
    const x1 = Math.floor((b.x + b.w) / this._B);
    const y0 = Math.floor(b.y / this._B);
    const y1 = Math.floor((b.y + b.h) / this._B);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this._hashMap.get(cx * 8192 + cy);
        if (arr) for (const o of arr) out.push(o);
      }
    }
    return out;
  }

  // ---- X 轴 ----
  integrateX(b, dynamics, statics) {
    const total = b.vel.x * this.dt;
    if (total === 0) return;
    const dir = Math.sign(total);
    let remaining = Math.abs(total);
    // 分步移动：每步 ≤ maxXStep。既防高速穿过薄墙，也让推挤按小步进行（不一次性位移过大）。
    while (remaining > 1e-6) {
      const step = Math.min(remaining, this.maxXStep);
      remaining -= step;
      b.x += dir * step;

      // 静态体：垂直面接触（落地/撞顶）不横推，交给 Y 轴/MTV；真侧面接触才阻挡
      let blocked = false;
      for (const s of this._near(b)) {
        if (s === b || !s.solid || !this._stSet.has(s)) continue;
        if (!overlaps(b, s)) continue;
        // 自动上台阶：低台阶直接抬升并通过（不夹紧 X，让玩家走上台阶）
        if (b.autoStep && this.tryAutoStep(b, s, dir)) continue;
        const p = penSides(b, s);
        if (!xShouldResolve(b, p)) continue; // 垂直面接触：不在这里解算
        resolveOverlapX(b, s);
        b.blockedX = true;
        b.collisions.push(s);
        blocked = true;
        break;
      }
      if (blocked) break;

      // 动态体
      for (const o of this._near(b)) {
        if (o === b || !o.solid || !b.solid || this._stSet.has(o)) continue;
        // 可推物体用 eps 把"相切/微距"也算接触（玩家贴着物块底部侧面也应推动它，
        // 而不是从边界相切处穿过；玩家站在矮堆顶上也能推它而不是被当台阶走上去）
        if (!overlaps(b, o, o.pushable ? 2 : 0)) continue;
        // 颗粒堆"软"：水平永不阻挡（大沉淀滩可穿行——粒子慢慢让位）。
        // 否则 5px 粒子堆对玩家是一堵墙（"大型沉淀把玩家堵死"）。
        // ★ 让位 = 极慢挤开（30px/s 上限、空气摩擦自行衰减），而不是旧版的 150 速度
        //    "踢飞"——那个会把整堆弹散、滚得老远、无法收集（用户反馈）。
        // 只对"移动中"的体让位：静止的玩家（如刚放置自身脚下沉淀）不被扰动，可站上去。
        if (o.amount !== undefined) {
          if (o.pushable && (Math.abs(b.vel.x) > 30 || Math.abs(b.vel.y) > 100) && Math.abs(o.vel.x) < 30) {
            const dir = Math.abs(b.vel.x) > 2 ? Math.sign(b.vel.x) : (b.vel.x < 0 ? -1 : 1);
            if (Math.abs(o.vel.x) < 15) o.vel.x = dir * 30;
          }
          continue;
        }
        // 颗粒（b）撞上实体（物块/玩家）：颗粒是"软体"，绝不推走/顶开实体（大沉淀堆
        // 不会把物块挤走）——颗粒自己被实体挡住（与静态体同语义），继续的位移交给
        // 后续子步/空余让位。
        if (b.amount !== undefined) {
          const p = penSides(b, o);
          if (!xShouldResolve(b, p)) continue; // 垂直面接触（落地/撞顶）：交给 Y 轴
          resolveOverlapX(b, o);
          b.vel.x = 0;
          b.blockedX = true;
          b.collisions.push(o);
          break;
        }
        const p = penSides(b, o);
        if (!xShouldResolve(b, p)) continue;
        // 站在物块顶上（接触来自上方，只差亚像素）：把 b 顶回表面即可，不横向推/挡
        if (b.y < o.y && b.bottom <= o.top + 1.5 && supportsStanding(o)) {
          // 推动中的玩家站到小沉淀上 → 优先推开沉淀（推动优先于上台阶/踮脚）
          if (o.amount !== undefined && o.pushable && Math.abs(b.vel.x) > 50) {
            this._nudgeOrKick(o, b, statics);
            continue;
          }
          b.setBottom(o.top);
          continue;
        }
        if (o.pushable && this.tryPushX(o, dir, dynamics, statics, b, 0)) {
          continue; // 推开了，继续本子步的移动
        }
        resolveOverlapX(b, o);
        b.blockedX = true;
        b.collisions.push(o);
        break;
      }
      if (b.blockedX) break;
    }
  }

  /**
   * 链式推挤：把 o 沿 dir 推出与 from 的重叠。单次最多推 maxXStep（残留重叠交给
   * 后续子步/下一帧处理），避免一次位移过大造成瞬移或穿墙。若途中被实心体挡住则
   * 整体还原并返回 false（推动方随之停住）。
   */
  tryPushX(o, dir, dynamics, statics, from, depth) {
    if (depth > 8 || !o.pushable) return false;
    if (dir === 0) dir = o.x < from.x ? -1 : 1;
    const overlap = dir > 0 ? from.right - o.left : o.right - from.left;
    if (overlap <= 0) return true;
    const move = Math.min(overlap, this.maxXStep) * (dir > 0 ? 1 : -1);

    const savedX = o.x;
    o.x += move;
    let ok = true;
    for (const s of this._near(o)) {
      if (!s.solid || !this._stSet.has(s) || !overlaps(o, s)) continue;
      // 小台阶：被推动时把物块抬上台阶（同玩家自动上台阶，不夹紧 X）
      if (o.autoStep && this.tryAutoStep(o, s, dir)) continue;
      ok = false;
      break;
    }
    if (ok) {
      for (const d of this._near(o)) {
        if (d === o || d === from || !d.solid || !o.solid || this._stSet.has(d)) continue;
        if (overlaps(o, d)) {
          // 沉淀粒子是"软体"，不挡推挤链：被推物块直接让粒子让位（不递归、不算失败）——
          // 否则一排在物块底缘/侧面的粒子会变成"粒子坝"，把物块卡死、玩家推不动。
          if (d.amount !== undefined && d.pushable) {
            d.x += move;
            continue;
          }
          if (!d.pushable || !this.tryPushX(d, dir, dynamics, statics, o, depth + 1)) {
            ok = false;
            break;
          }
        }
      }
    }
    if (!ok) o.x = savedX;
    return ok;
  }

  /** 判定是否为可自动上行的矮台阶：是则抬升并返回 true（不夹紧 X） */
  tryAutoStep(b, s, dir) {
    if (!dir) return false;
    const inFront = dir > 0
      ? s.left <= b.right + 0.01 && s.right >= b.right
      : s.right >= b.left - 0.01 && s.left <= b.left;
    if (!inFront) return false;
    const rise = b.bottom - s.top; // 需抬升的高度（台阶顶高于脚底）
    if (!(rise > 0 && rise <= this.autoStepMax)) return false;
    b.setBottom(s.top);
    return true;
  }

  // ---- Y 轴 ----
  integrateY(b, dynamics, statics) {
    const dy = b.vel.y * this.dt;
    // 分步移动：每步 ≤ maxYStep，防快速下落穿过薄地板
    const steps = Math.max(1, Math.ceil(Math.abs(dy) / this.maxYStep));
    const stepDy = dy / steps;
    for (let s = 0; s < steps; s++) {
      const prevBottom = b.bottom;
      const prevTop = b.top;
      if (stepDy !== 0) b.y += stepDy;
      this._resolveYStep(b, prevBottom, prevTop, dynamics, statics);
      // 落地或撞顶（vel.y 已被清零）后立即停止剩余子步：否则后续子步继续移动，
      // 把刚贴住表面的体又压回实心体里（旧代码正是"钳制后残留嵌入 → 被顶穿"）。
      if (b.vel.y === 0) break;
    }
  }

  _resolveYStep(b, prevBottom, prevTop, dynamics, statics) {
    const dir = Math.sign(b.vel.y);
    for (const s of this._near(b)) {
      if (!s.solid || !this._stSet.has(s) || !overlaps(b, s)) continue;
      b.collisions.push(s);
      // 按"本子步移动前"的相对位置判定接触面：前一子步脚在 s 顶上方才落地，
      // 头在 s 底下方才撞顶；其余（斜向嵌入等）留给 tick 末尾的 MTV 残余解算。
      if (dir > 0) {
        if (prevBottom <= s.top + 0.5) this._landOn(b, s);
        else if (prevTop >= s.bottom - 0.5) this._ceilingClamp(b, s);
      } else if (dir < 0) {
        if (prevTop >= s.bottom - 0.5) this._ceilingClamp(b, s);
        else if (prevBottom <= s.top + 0.5) this._landOn(b, s);
      }
    }

    for (const o of this._near(b)) {
      if (o === b || !o.solid || !b.solid || this._stSet.has(o)) continue;
      if (!overlaps(b, o)) continue;
      b.collisions.push(o);
      if (dir > 0) {
        if (prevBottom <= o.top + 1 && supportsStanding(o)) {
          this._landOn(b, o); // 从上方落到 o 上（下落中的沉淀不提供支撑）
        } else if (o.amount !== undefined && o.pushable && Math.abs(b.vel.x) > 50) {
          this._nudgeOrKick(o, b, statics); // 推动中的玩家碰到可推沉淀：水平推开
        }
        // 注意：下沉时不做"撞顶钳制"。b 的顶贴着 o 的底 = 支撑接触（o 站在 b 上），
        // 不是碰撞——钳制会把下方物块吸死在玩家脚底，玩家移动时带着物块走
        // （"骑物块"bug 的根因）。支撑接触由 o 侧的 _landOn / MTV 抬升处理。
      } else if (dir < 0) {
        if (prevTop >= o.bottom - 1) {
          this._ceilingClamp(b, o);
        } else if (prevBottom <= o.top + 1 && supportsStanding(o)) {
          this._landOn(b, o);
        } else if (o.amount !== undefined && o.pushable && Math.abs(b.vel.x) > 50) {
          this._nudgeOrKick(o, b, statics);
        }
      } else if (o.amount !== undefined && o.pushable && Math.abs(b.vel.x) > 50) {
        this._nudgeOrKick(o, b, statics);
      }
    }
  }

  /** 从上方落到 s 顶：按实际接触形状抬升到表面（腐蚀掉的列不参与），封顶防深嵌瞬移 */
  _landOn(b, s) {
    let lift = 0;
    for (const a of shapesOf(b)) {
      for (const c of shapesOf(s)) {
        if (a.overlaps(c, 0)) lift = Math.max(lift, a.bottom - c.top);
      }
    }
    if (lift <= 0) return;
    b.y -= Math.min(lift, MAX_RESOLVE_Y);
    b.vel.y = 0;
    b.onGround = true;
  }

  /** 从下方撞到 s 底：钳制在底面之下（配合子步提前停止，保证一帧内彻底停住） */
  _ceilingClamp(b, s) {
    b.setTop(s.bottom);
    b.vel.y = 0;
  }

  /**
   * 玩家碰到可推沉淀：水平推动 → 只给**软让位**速度（≤45px/s，同 integrateX 让位语义——
   * 150 的"踢飞"会让玩家离开时粒子反方向窜出很远，用户反馈）；只有真正的下落/上升
   * 撞击（|vel.y| > 100）才用 kickParticle 的速度推开。
   */
  _nudgeOrKick(o, b, statics) {
    if (Math.abs(b.vel.y) > 100) {
      this.kickParticle(o, b, statics);
      return;
    }
    const dir = b.vel.x > 0 ? 1 : -1;
    if (Math.abs(o.vel.x) < 45) o.vel.x = dir * 45;
  }

  /** 把可推沉淀粒子从玩家身侧水平踢开（推动优先于自动上台阶/垫高）；无空间则返回 false */
  kickParticle(o, b, statics) {
    const pushDir = b.vel.x > 0 ? 1 : -1;
    const saved = o.x;
    o.x += pushDir * (o.w + 1);
    for (const s of this._near(o)) {
      if (s.solid && this._stSet.has(s) && overlaps(o, s)) {
        o.x = saved;
        return false; // 贴墙无空间：退回，让玩家垫高上去
      }
    }
    o.vel.x = pushDir * 150;
    return true;
  }

  /**
   * 残余重叠 MTV 解算：轴解算结束后仍有重叠的体（斜向冲入板底、出生嵌入、传送
   * 落点、爆炸推挤等），按四面最小穿透温柔推出（≤16px/帧，深嵌分帧收敛）。
   * 静态体先解（把"被顶回地面/板底"先做掉），再解动态体之间的残留，迭代数轮
   * 直到不再有可解的重叠。这是杜绝"穿模/瞬移到另一侧"的最后一道闸。
   */
  resolveResidual(dynamics, statics) {
    // 直接调用（relax/单元测试）可能没有经过 step：补建哈希，保证邻域查询正确
    if (this._hashAll !== dynamics) this._buildHash(dynamics, statics);
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of dynamics) {
        if (b.static) continue;
        for (const s of this._near(b)) {
          if (!s.solid || !this._stSet.has(s) || !overlaps(b, s)) continue;
          if (resolveEmbed(b, s)) moved = true;
        }
        for (const o of this._near(b)) {
          if (o === b || !o.solid || !b.solid || this._stSet.has(o)) continue;
          // 颗粒 vs 非颗粒：颗粒是**软体**——残余重叠永远让颗粒让位，绝不"推/抬"实体。
          // （旧代码会按 4 面 MTV 抬升实体 → "沉淀粒子跑到物块底下把物块顶起来"。）
          if ((o.amount !== undefined) !== (b.amount !== undefined)) {
            const particle = b.amount !== undefined ? b : o;
            const solid = b.amount !== undefined ? o : b;
            if (particle === o) {
              // 实体压在颗粒上：**玩家**可垫脚（竖向托起，≤6px 浅嵌——"沉淀踮脚"特性），
              // 托起仍要求粒子已落地静止（supportsStanding）：下落/刚放置的粒子托人 =
              //   "跳→下落中放置→左脚踏右脚上天"的第一个漏洞。
              // 物块等重物不托——颗粒被挤出（软体让位），别把物块"顶起来"。
              if (!solid.isPlayerObj) {
                if (this._pushParticleOut(particle, solid)) moved = true;
                continue;
              }
              if (!supportsStanding(particle)) continue;
              const pp = penSides(solid, particle);
              if (pp.top > 1e-6 && pp.top <= pp.bottom && pp.top <= 6) {
                const lift = Math.min(pp.top, 8);
                solid.y -= lift;
                solid.vel.y = Math.min(solid.vel.y, 0);
                solid.onGround = true; // 托住了：站上粒子堆顶（垫脚）
                moved = true;
              }
              continue;
            }
            // 颗粒嵌在实体（侧面/下方）：把颗粒向穿透最小的面推出（软体退让）。
            // 玩家脚下的颗粒不水平挤（保留垫脚/穿行，由玩家侧重处理）。
            if (!solid.isPlayerObj) {
              if (this._pushParticleOut(particle, solid)) moved = true;
            } else if (resolveEmbed(particle, solid)) {
              moved = true;
            }
            continue;
          }
          // 粒子-粒子：圆形分离（沙粒彼此是球）——法向推开（封顶防瞬移），
          // 无切向锁定/无四方形堆积 → 堆叠自然塌成滩，不会像积木立起高塔
          //（此前 AABB 垂直压叠只往上顶，200 颗堆出 ~100px 竖直塔——用户反馈）。
          if (b.amount !== undefined && o.amount !== undefined) {
            if (this._separateParticles(b, o)) moved = true;
            continue;
          }
          if (!overlaps(b, o)) continue;
          if (resolveEmbed(b, o)) moved = true;
        }
      }
      if (!moved) break;
    }
  }

  /** 粒子-粒子圆分离（两球重叠 → 沿圆心连线各推一半；单次封顶 3px 防瞬移）。
   *  位移要过**静态阻挡**（软滑动穿墙=嵌进池壁/地板——用户反馈"穿模"）：
   *  完整向量 / 水平 / 垂直 三级降级，都被挡才不动。 */
  _separateParticles(a, b) {
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const rr = (a.w + b.w) / 2;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    if (d2 < 1e-8) return false; // 完全同心（罕见）：跳过避免除零
    const d = Math.sqrt(d2);
    const push = Math.min((rr - d) / 2, 3);
    const nx = dx / d;
    const ny = dy / d;
    this._slideParticle(a, -nx * push, -ny * push);
    this._slideParticle(b, nx * push, ny * push);
    return true;
  }

  /** 粒子软位移：目标位置若嵌入静态体（池壁/地板/墙）则按 水平→垂直 降级；全挡则不动 */
  _slideParticle(p, mx, my) {
    if ((!mx || Math.abs(mx) < 1e-9) && (!my || Math.abs(my) < 1e-9)) return;
    const sx = p.x;
    const sy = p.y;
    const tryMove = (dx2, dy2) => {
      p.x = sx + dx2;
      p.y = sy + dy2;
      for (const s of this._near(p)) {
        if (s === p) continue;
        if (s.solid && this._stSet.has(s) && overlaps(p, s)) return false;
      }
      return true;
    };
    if (tryMove(mx, my)) return;
    if (tryMove(mx, 0)) return; // 仅水平（贴墙横推被撤，但塌滑等水平分量可用）
    if (tryMove(0, my)) return; // 仅垂直
    p.x = sx;
    p.y = sy;
  }

  /**
   * 颗粒嵌进实体（侧面穿入/压到正下方）时的软体让位：
   *  - 常规：向穿透最小的面推出（resolveEmbed 的 4 面 MTV）。
   *  - "实体正下方贴地楔入"（支撑保护规则停住的：粒子被压在地板与实体底缘之间）：
   *    resolveEmbed 会跳过（防止把支撑物压走）——但粒子楔在原地会让物块底缘"被
   *    垫住/卡死"（推不动）。此时把粒子往较近的侧边水平挤开，让它从块底滚出来。
   */
  _pushParticleOut(particle, solid) {
    if (resolveEmbed(particle, solid)) return true;
    if (particle.amount === undefined || solid.amount !== undefined) return false;
    const pp = penSides(particle, solid);
    // 只在"正下方"楔入（bottom 面最小穿透）时水平挤出；侧嵌已被 resolveEmbed 处理
    if (!(pp.bottom <= pp.left && pp.bottom <= pp.right && pp.bottom <= pp.top)) return false;
    const dir = particle.x + particle.w / 2 < solid.x + solid.w / 2 ? -1 : 1;
    const saved = particle.x;
    particle.x = saved + dir * (particle.w + 2);
    let ok = true;
    for (const s2 of this._near(particle)) {
      if (s2 === particle || s2 === solid) continue;
      if (s2.solid && this._stSet.has(s2) && overlaps(particle, s2)) { ok = false; break; }
    }
    if (!ok) { particle.x = saved; return false; }
    return true;
  }

  /** 兼容旧 API：只解算动态体之间的残余重叠（测试直接调用） */
  relax(dynamics) {
    this.resolveResidual(dynamics, []);
  }
}

// ============================================================================
// 接触跟踪：每刻对比相邻两次的重叠对，产出 contactBegin/End（对象对）供化学反应/开关/池使用
// ============================================================================
class ContactTracker {
  constructor(eps = 1) {
    this.eps = eps;
    this.pairs = new Map(); // key -> [a, b]
  }

  update(bodies) {
    // 空间哈希（与主循环同口径）：接触对从 O(N²) 降到邻域级（大粒子堆）
    const B = 48;
    const hash = new Map();
    const big = [];
    const push = (b) => {
      const x0 = Math.floor(b.x / B);
      const x1 = Math.floor((b.x + b.w) / B);
      const y0 = Math.floor(b.y / B);
      const y1 = Math.floor((b.y + b.h) / B);
      if (x1 - x0 > 3 || y1 - y0 > 3) { big.push(b); return; }
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const k = cx * 8192 + cy;
          const arr = hash.get(k);
          if (arr) arr.push(b);
          else hash.set(k, [b]);
        }
      }
    };
    for (const b of bodies) push(b);
    const nearOf = (b) => {
      const out = big.slice();
      const x0 = Math.floor(b.x / B);
      const x1 = Math.floor((b.x + b.w) / B);
      const y0 = Math.floor(b.y / B);
      const y1 = Math.floor((b.y + b.h) / B);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const arr = hash.get(cx * 8192 + cy);
          if (arr) for (const o of arr) out.push(o);
        }
      }
      return out;
    };
    const next = new Map();
    for (const b of bodies) {
      for (const o of nearOf(b)) {
        if (o === b || !b.solid || !o.solid || !overlaps(b, o, this.eps)) continue;
        const [lo, hi] = b.id < o.id ? [b, o] : [o, b];
        next.set(`${lo.id}|${hi.id}`, [lo, hi]);
      }
    }
    const begun = [];
    const ended = [];
    for (const [k, pair] of next) if (!this.pairs.has(k)) begun.push(pair);
    for (const [k, pair] of this.pairs) if (!next.has(k)) ended.push(pair);
    this.pairs = next;
    return { begun, ended, current: [...next.values()] };
  }
}

exports.shapesOf = shapesOf;
exports.overlaps = overlaps;
exports.CollisionSystem = CollisionSystem;
exports.ContactTracker = ContactTracker;

  };
  __modules["src/physics/aabb.js"] = function (module, exports, __require) {
// ============================================================================
// AABB（轴对齐包围盒）：所有碰撞的统一原语（文档的 line/box 双原语已废弃）
// ============================================================================

class AABB {
  constructor(x = 0, y = 0, w = 0, h = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  get left() { return this.x; }
  get right() { return this.x + this.w; }
  get top() { return this.y; }
  get bottom() { return this.y + this.h; }

  /** 是否包含某点（边界算包含） */
  contains(px, py) {
    return px >= this.left && px <= this.right && py >= this.top && py <= this.bottom;
  }

  /** 是否与另一 AABB 相交（默认严格相交；eps>0 表示接触也算） */
  overlaps(o, eps = 0) {
    return this.left < o.right + eps && this.right > o.left - eps &&
           this.top < o.bottom + eps && this.bottom > o.top - eps;
  }

  /** X 向重叠量（负值=不相交） */
  overlapX(o) {
    return Math.min(this.right, o.right) - Math.max(this.left, o.left);
  }

  /** Y 向重叠量 */
  overlapY(o) {
    return Math.min(this.bottom, o.bottom) - Math.max(this.top, o.top);
  }

  clone() {
    return new AABB(this.x, this.y, this.w, this.h);
  }
}

exports.AABB = AABB;

  };
  __modules["src/objects/particle.js"] = function (module, exports, __require) {
// ============================================================================
// 沉淀粒子：实体物理球（0.5g/5px 为基准，堆叠合并 ≤3×0.5g=1.5g）。
// 反应生成的沉淀不实心（不阻挡、与其它动态体不碰撞），但会与静态体碰撞（落在地上）。
// 玩家"放置"的沉淀（placed=true）有碰撞箱：可被站上去垫高（沉淀踮脚），
// 且除被重新收集外不能被移动。
// 只有"沉淀"（不溶固体）可收集；可溶盐粒子不可收集。
//
// ★ 两套沉淀系统的外观契约（与容器内沉淀 grains 完全一致）：
//   - 尺寸公式 particleSizeOf(amount)：0.5g → 5px；1.5g（3×0.5g 合并）→ 7.5px（1.5 倍）；
//   - 分配 splitPile(mass, maxN)：常规 0.5g/颗，超出数量上限按 1.5g 合并堆叠；
//   - 绘制 renderPrecipitateBall（辉光/高光/深色白色光晕）——粒子与容器颗粒共用。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { getSubstance, isSoluble } = __require('src/chem/substances.js');;
const { luminance } = __require('src/render/theme.js');;
const { CFG } = __require('src/core/config.js');;
const { ParticleMaterial } = __require('src/objects/material.js');;

/** 颗粒尺寸：0.5g → CFG.particleSize(5px)；1.5g（3×0.5g）→ 1.5 倍（7.5px）；
 *  幂次 log3(1.5)≈0.369 使两个锚点精确匹配；≥上限被夹住；小质量保底 3px。 */
function particleSizeOf(amount) {
  const k = Math.log(1.5) / Math.log(3);
  return Math.max(CFG.particleMinSize, Math.min(CFG.particleMaxSize,
    CFG.particleSize * Math.pow(amount / CFG.particleRefMass, k)));
}

/** 沉淀质量 → 颗粒数分配：常规每颗 CFG.maxParticleMass(0.5g)；
 *  超出数量上限 maxN 时按"堆叠"合并（每颗 ≤ CFG.stackMaxMass = 3×0.5g = 1.5g）；
 *  极端超大堆（>stackMaxMass×maxN）仍合并以保质量守恒（性能上限）。 */
function splitPile(mass, maxN = CFG.maxSpawnParticles) {
  let n = Math.ceil(mass / CFG.maxParticleMass);
  if (n > maxN) n = Math.min(maxN, Math.ceil(mass / CFG.stackMaxMass));
  n = Math.max(1, n);
  return { n, per: mass / n };
}

/** 单颗沉淀球的绘制（自由粒子与容器内颗粒共用：外观完全一致） */
function renderPrecipitateBall(ctx, x, y, size, color) {
  const r = size / 2;
  const dark = luminance(color) < 110;
  ctx.save();
  // 深色物质：外层白色辉光（光晕，不是描边）
  if (dark) {
    const halo = ctx.createRadialGradient(x, y, r * 0.15, x, y, r * 1.35);
    halo.addColorStop(0, 'rgba(255,255,255,0.5)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
  // 元素辉光
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(x - r * 0.16, y - r * 0.16, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

class Particle extends Obj {
  constructor({ x, y, substance, amount = CFG.cellMass, collectible, placed = false, ...rest }) {
    // 尺寸随质量缩放：0.5g → 5px；**1.5g（堆叠 3 个 0.5g）→ 0.5g 尺寸的 1.5 倍 = 7.5px**
    //（幂次 log3(1.5)，两个锚点精确匹配；大堆合并的更大质量被 7.5px 上限夹住）；
    // 更小质量的颗粒保底 3px（可见/可拾取）。
    const size = particleSizeOf(amount);
    super({
      x, y, w: size, h: size,
      solid: placed,
      pushable: placed, // 放置的沉淀可被玩家踢开
      physicsKind: 'dynamic',
      mass: amount,
      gravity: 1,
      ...rest,
    });
    this.substance = substance;
    this.amount = amount;
    this.collectible = collectible ?? !isSoluble(substance);
    this.placed = placed;
    this.mat = new ParticleMaterial(this); // 让浸入容器的沉淀能参与反应（Zn+HCl 等）
  }

  get material() {
    return this.mat;
  }

  /** 调试悬停显示：沉淀 · 物质 ×合并数（几颗 0.5g 合并；大堆合并颗粒会 >容器上限） */
  get hoverLabel() {
    const n = Math.max(1, Math.ceil(this.amount / CFG.maxParticleMass));
    return `沉淀·${this.substance} ×${n}`;
  }

  render(ctx) {
    const sub = getSubstance(this.substance);
    const c = sub.solid && sub.solid.length ? sub.solid[0] : '#c9b46a';
    renderPrecipitateBall(ctx, this.x + this.w / 2, this.y + this.h / 2, this.w, c);
  }
}

exports.particleSizeOf = particleSizeOf;
exports.splitPile = splitPile;
exports.renderPrecipitateBall = renderPrecipitateBall;
exports.Particle = Particle;

  };
  __modules["src/objects/obj.js"] = function (module, exports, __require) {
// ============================================================================
// Obj 基类：所有物件的根。继承物理 Body，扩展化学/渲染/交互钩子。
// physicsKind: 'static'（地板）| 'dynamic'（玩家/物块/粒子）| 'none'（容器等区域）
// ============================================================================

const { Body } = __require('src/physics/body.js');;

let SEQ = 0;

class Obj extends Body {
  constructor({
    id = '', x = 0, y = 0, w = 16, h = 16,
    solid = true, pushable = false, static: isStatic = false,
    mass = 1, gravity = 1, autoStep = false,
    physicsKind = null, layer = 0, origin = null, hidden = false, noLift = false, noCarry = false,
  } = {}) {
    super({ id: id || `obj${++SEQ}`, x, y, w, h, solid, pushable, static: isStatic, mass, gravity, autoStep });
    this.physicsKind = physicsKind ?? (isStatic ? 'static' : 'dynamic');
    this.layer = layer;
    this.hidden = hidden; // 初始隐藏：不可见、无碰撞、不参与逻辑，由开关 showId 开启时显现
    this.noLift = noLift; // 不可被气泡柱/气流托起（重力照常，只是气流不托它）
    this.noCarry = noCarry; // 锁定物品：不可拾取/携带（关卡固定装置；编辑器可配置）
    // 溯源：此物体"为何存在"。kind ∈ 'level'|'reaction'|'explosion'|'place'|'shell'；text 为附加说明（反应方程式等）。
    // 调试模式鼠标悬停显示（见 hud.hoverPanel）。
    this.origin = origin;
  }

  // ---- 化学引擎 Material 接口（默认无化学） ----
  get material() {
    return null;
  }

  get isPlayerObj() {
    return false;
  }

  /** 所在容器的溶液 Material（固体浸入池/烧杯时） */
  get containerMaterial() {
    return null;
  }

  get isBurning() {
    return false;
  }

  get isLamp() {
    return false;
  }

  get isDoor() {
    return false;
  }

  /** 调试悬停时的类型名（null = 不可悬停/不显示提示，如爆炸/气泡/反应标签等瞬态物） */
  get hoverLabel() {
    return null;
  }

  // ---- 生命周期钩子 ----
  update(dt, scene) {}
  lateUpdate(dt, scene) {} // 物理结算后（绳子等需要覆盖物理结果的对象）
  render(ctx, scene) {}
  onContactBegin(other, scene) {}
  onContactEnd(other, scene) {}

  /** 反应产物附着到自身（默认无） */
  adhereMaterial(id, mass, origin) {
    return 0;
  }

  /**
   * 记录网格内某物质的来源（调试悬停按物质显示：初始=关卡生成、反应附着=反应生成）。
   * 仅持有 grid 的对象（物块/玩家）使用；无 gridOrigins 时惰性创建。
   */
  noteGridOrigin(id, origin = null) {
    if (!this.gridOrigins) this.gridOrigins = new Map();
    if (typeof origin === 'string' && origin) origin = { kind: 'reaction', text: origin };
    if (!origin) {
      if (!this.gridOrigins.has(id)) this.gridOrigins.set(id, { kind: 'level' });
      return;
    }
    this.gridOrigins.set(id, origin);
  }
}

exports.Obj = Obj;

  };
  __modules["src/physics/body.js"] = function (module, exports, __require) {
// ============================================================================
// 物理体 Body
// ----------------------------------------------------------------------------
// 提供位置/速度/尺寸与碰撞箱。静态体（地板）永不移动；动态体受重力并参与解算。
// 标记：
//   solid      — 阻挡其他动态体（地板静态且实心；物块动态且实心；粒子不实心）
//   pushable   — 可被水平推动（忽略摩擦，前方有空位即可）
//   static     — 固定不动
//   gravity    — 重力系数（0 = 不受重力，如悬挂物体）
//   autoStep   — 允许自动上台阶（玩家）
// ============================================================================

const { AABB } = __require('src/physics/aabb.js');;

class Body {
  constructor({
    id = '', x = 0, y = 0, w = 16, h = 16,
    solid = true, pushable = false, static: isStatic = false,
    mass = 1, gravity = 1, autoStep = false,
  } = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vel = { x: 0, y: 0 };
    this.solid = solid;
    this.pushable = pushable;
    this.static = isStatic;
    this.mass = mass;
    this.gravity = gravity;
    this.autoStep = autoStep;

    // 每刻结算后刷新：
    this.onGround = false;   // 脚下是否有实心支撑（可跳跃）
    this.blockedX = false;   // X 向被阻挡
    this.collisions = [];    // 本刻与其相交的物体（含静态体）
  }

  get left() { return this.x; }
  get right() { return this.x + this.w; }
  get top() { return this.y; }
  get bottom() { return this.y + this.h; }

  setTop(v) { this.y = v; }
  setBottom(v) { this.y = v - this.h; }
  setLeft(v) { this.x = v; }
  setRight(v) { this.x = v - this.w; }

  collider() {
    return new AABB(this.x, this.y, this.w, this.h);
  }

  /**
   * 碰撞形状（世界坐标 AABB 列表）。默认单个矩形；网格类对象（玩家/物块）可覆盖为
   * 贴合实际物质的多矩形，使被完全腐蚀掉的部分不占碰撞箱。
   */
  getShapes() {
    return [this.collider()];
  }
}

exports.Body = Body;

  };
  __modules["src/render/theme.js"] = function (module, exports, __require) {
// ============================================================================
// 神话·元素主题（冰火人式鲜艳 + 神殿感）
// 所有渲染模块共享这一套色板，保证整体风格统一。
// ============================================================================

const THEME = {
  bg: { top: '#0b0e28', mid: '#141a40', bottom: '#1e2555' },

  // 神话金
  gold: {
    base: '#e8b84b',
    light: '#ffd76a',
    text: '#ffe9b0',
    deep: '#a9782a',
    dim: 'rgba(232,184,75,0.35)',
  },

  // 火元素
  fire: {
    base: '#ff5c1f',
    light: '#ffb340',
    white: '#fff3c4',
    glow: 'rgba(255,122,61,0.35)',
  },

  // 水元素
  water: {
    base: '#1fa8e0',
    light: '#7fe0ff',
    glow: 'rgba(61,201,255,0.30)',
  },

  // 毒元素（绿）
  toxic: {
    base: '#3fd93a',
    light: '#a6ff9a',
    glow: 'rgba(107,255,92,0.28)',
  },

  // 传送/通路（紫）
  portal: {
    base: '#c78bff',
    light: '#e7ccff',
    glow: 'rgba(199,139,255,0.35)',
  },

  // 石材
  stone: {
    base: '#3a3f5c',
    light: '#4b5175',
    dark: '#22263f',
    line: '#2b3047',
    highlight: 'rgba(255,255,255,0.10)',
  },

  outline: '#160f2b', // 描边（角色轮廓）
  panel: 'rgba(18,14,46,0.85)', // 面板底色
};

// ---- 常用绘制辅助 ----

/** 圆角矩形路径 */
function rr(ctx, x, y, w, h, r) {
  const rr2 = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr2, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr2);
  ctx.arcTo(x + w, y + h, x, y + h, rr2);
  ctx.arcTo(x, y + h, x, y, rr2);
  ctx.arcTo(x, y, x + w, y, rr2);
  ctx.closePath();
}

/** 带发光描边与内阴影的圆角面板（神话风） */
function panel(ctx, x, y, w, h, accent = THEME.gold.deep, r = 10) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(40,32,80,0.92)');
  g.addColorStop(1, 'rgba(14,10,36,0.92)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();
}

/** 发光文字（仅用于大标题；小字用 clearText，避免糊） */
function glowText(ctx, text, x, y, color = THEME.gold.text, font = 'bold 13px "Segoe UI", sans-serif', blur = 6) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 清晰小字（细暗描边保证可读，不发光） */
function clearText(ctx, text, x, y, color = '#ffffff', font = 'bold 12px monospace') {
  ctx.save();
  ctx.font = font;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,6,24,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---- 对比度 ----

/** 十六进制颜色的亮度（0-255） */
function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** 依据物质亮度选描边：深色用弱白光晕边缘（否则在暗背景下看不见），浅色用深描边 */
function contrastEdge(hex) {
  return luminance(hex) < 110 ? 'rgba(255,255,255,0.60)' : 'rgba(16,15,43,0.85)';
}

// ---- 火焰 ----

/**
 * 多层有机火焰：外辉光 + 渐变焰体 + 白热内核 + 上升火星。
 * (x,y) 为焰底，h 为总高，color 为火焰主色。
 */
function drawFlame(ctx, x, y, h, color, innerColor = '#fffdf2', t = 0) {
  const wob = Math.sin(t * 9) * 0.16 + Math.sin(t * 13.7 + 1.3) * 0.1;
  const w = h * 0.62;
  ctx.save();
  // 外辉光
  ctx.shadowColor = color;
  ctx.shadowBlur = h * 1.7;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  flamePath(ctx, x, y, h, w, wob);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  // 焰体（自下而上渐变，底部最亮）
  const g = ctx.createLinearGradient(x, y, x, y - h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.28, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.9;
  flamePath(ctx, x, y, h * 0.74, w * 0.74, wob * 1.25);
  ctx.fill();
  ctx.globalAlpha = 1;
  // 内核（白热）
  ctx.fillStyle = innerColor;
  ctx.globalAlpha = 0.95;
  flamePath(ctx, x, y, h * 0.42, w * 0.42, wob * 1.6);
  ctx.fill();
  ctx.globalAlpha = 1;
  // 上升火星
  for (let i = 0; i < 3; i++) {
    const ph = (t * 46 + i * 73) % 30;
    const ex = x + Math.sin(t * 11 + i * 2.4) * h * 0.32;
    const ey = y - h * 0.7 - (ph / 30) * h * 0.55;
    ctx.globalAlpha = 0.55 * (1 - ph / 30);
    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 泪滴形火焰路径 */
function flamePath(ctx, x, y, h, w, wob) {
  ctx.beginPath();
  ctx.moveTo(x + w * wob, y - h);
  ctx.quadraticCurveTo(x + w, y - h * 0.45, x + w * 0.52, y);
  ctx.quadraticCurveTo(x, y + h * 0.04, x - w * 0.52, y);
  ctx.quadraticCurveTo(x - w, y - h * 0.45, x + w * wob, y - h);
  ctx.closePath();
}

exports.THEME = THEME;
exports.rr = rr;
exports.panel = panel;
exports.glowText = glowText;
exports.clearText = clearText;
exports.luminance = luminance;
exports.contrastEdge = contrastEdge;
exports.drawFlame = drawFlame;

  };
  __modules["src/objects/material.js"] = function (module, exports, __require) {
// ============================================================================
// SolidMaterial：把持有 MaterialGrid 的固体物件（玩家/物块）适配成化学引擎的
// Material 接口。consume → 网格侵蚀；add → 产物附着（生长）。
// ============================================================================

// ============================================================================
// ContainerMaterial：容器的完整材料 = 溶液溶质 + 沉淀/内含物。
// 这样容器内沉淀（如灯上放置的 Cu(OH)2）也能参与分解/催化等自反应。
// ============================================================================
class ContainerMaterial {
  constructor(containerObj) {
    this.owner = containerObj; // 容器对象：供 _region 取 innerRect、存取沉淀
    this.phase = 'solution';
    this.isPlayer = false;
    this.solution = containerObj.solution; // 供浓度因子使用
  }

  /** 材料本身即"所在容器"，与 SolutionMaterial 语义一致（引擎用 mat.container 判 inContainer） */
  get container() {
    return this;
  }

  avail(id) {
    if (id === 'H2O') return this.solution.water;
    return this.solution.mass(id) + (this.owner.precipitates.get(id) ?? 0);
  }

  consume(id, mass) {
    if (id === 'H2O') {
      const r = Math.min(this.solution.water, mass);
      this.solution.water -= r;
      return r;
    }
    let rest = mass;
    let removed = 0;
    const fromSol = this.solution.remove(id, mass);
    removed += fromSol;
    rest -= fromSol;
    if (rest > 0) removed += this.owner.takePrecipitate(id, rest);
    return removed;
  }

  add(id, mass, origin = null) {
    if (id === 'H2O') {
      this.solution.water += mass;
      return;
    }
    if (origin && this.owner && this.owner.noteSolOrigin) this.owner.noteSolOrigin(id, origin);
    this.solution.add(id, mass);
  }

  ids() {
    const s = new Set(this.solution.ids());
    for (const id of this.owner.precipitates.keys()) s.add(id);
    return [...s];
  }
}

/**
 * 沉淀粒子的材料适配器：让自由沉淀（爆炸掉渣/反应掉渣）能参与反应。
 *  - 浸入容器（池/烧杯）时：ids=粒子物质、avail=粒子质量、container=容器材料，
 *    于是引擎的"容器内反应"循环会把粒子当作固体反应物（如 Zn 粒子 + HCl → H2）。
 *  - 在地面时：ids=[]，不参与任何反应（避免给所有粒子跑自反应的开销）。
 * consume 直接把粒子质量减掉；耗尽后由 Scene 每刻清理移除。
 */
class ParticleMaterial {
  constructor(particle) {
    this.obj = particle; // Particle 实例
    this.phase = 'solid';
    this.isPlayer = false;
  }

  get container() {
    return this.obj._container ? this.obj._container.material : null;
  }

  ids() {
    return this.obj._container ? [this.obj.substance] : [];
  }

  avail(id) {
    return id === this.obj.substance ? this.obj.amount : 0;
  }

  exposedAvail(id) {
    return this.avail(id); // 粒子整体暴露（无壳包裹）
  }

  consume(id, mass) {
    if (id !== this.obj.substance) return 0;
    const r = Math.min(this.obj.amount, mass);
    this.obj.amount -= r;
    return r;
  }

  add(id, mass) {
    if (id === this.obj.substance) this.obj.amount += mass;
  }
}

class SolidMaterial {
  constructor(obj) {
    this.obj = obj;
    this.phase = 'solid';
  }

  get isPlayer() {
    return this.obj.isPlayerObj;
  }

  /** 所在容器的溶液 Material（若无容器则为 null） */
  get container() {
    return this.obj.containerMaterial;
  }

  /** 所在容器的液体区域（世界坐标）；无容器则 null */
  _region() {
    const c = this.container;
    if (c && c.owner && typeof c.owner.innerRect === 'function') return c.owner.innerRect();
    return null;
  }

  /**
   * 网格原点：**从当前 body 位置现算**，不依赖滞后的存储值。
   * （化学在 syncGrid 之前执行；若用旧 gridOrigin，快速移动时区域判定会滞后一格，导致侵蚀错位。）
   */
  _origin() {
    const grid = this.obj.grid;
    const aabb = grid.minAABB();
    if (!aabb) return { x: this.obj.x, y: this.obj.y };
    return { x: this.obj.x - aabb.x, y: this.obj.y - aabb.y };
  }

  avail(id) {
    if (!this.obj.grid) return 0;
    const region = this._region();
    // 浸在容器里时，只有与溶液区域重叠的部分可参与反应
    if (region) return this.obj.grid.availInRegion(id, region, this._origin());
    return this.obj.grid.avail(id);
  }

  /** 暴露格中该物质的总质量（g）——反应实际可消耗量（被致密壳包住的内核不计入） */
  exposedAvail(id) {
    if (!this.obj.grid) return 0;
    const region = this._region();
    if (region) return this.obj.grid.exposedAvail(id, region, this._origin());
    return this.obj.grid.exposedAvail(id);
  }

  consume(id, mass) {
    if (!this.obj.grid) return 0;
    const region = this._region();
    if (region) return this.obj.grid.consumeInRegion(id, mass, region, this._origin());
    return this.obj.grid.consume(id, mass);
  }

  /**
   * 添加产物：优先原地转化（写入最近被消耗的格子——固体产物附着在反应物表面，
   * Fe 浸 CuSO₄ 表面就地变铜）；盈余走暴露面渐进生长（growExposed：所有接触面
   * 同时分到一点点，镀层一层层往外长，块均匀变大）。
   * origin：该物质的来源（调试悬停按物质显示：反应附着=反应生成等）。
   */
  add(id, mass, origin = null) {
    let rest = mass;
    if (this.obj.grid) rest -= this.obj.grid.addInPlace(id, mass);
    if (this.obj.noteGridOrigin) this.obj.noteGridOrigin(id, origin);
    if (rest > 0 && this.obj.adhereMaterial) return this.obj.adhereMaterial(id, rest, origin);
    return 0;
  }

  ids() {
    return this.obj.grid ? this.obj.grid.ids() : [];
  }
}

exports.ContainerMaterial = ContainerMaterial;
exports.ParticleMaterial = ParticleMaterial;
exports.SolidMaterial = SolidMaterial;

  };
  __modules["src/render/gridrender.js"] = function (module, exports, __require) {
// ============================================================================
// 固体"网格计算法"（MaterialGrid）——连续质量模型（高中版：多物质网格）
// ----------------------------------------------------------------------------
// 固体 = 二维单元格网格，每格 5px。每格可含**多种物质**（Map<id, mass>），
// 各物质含量可不同，整格总质量 ≤ CELL_MASS (0.1g)。
//   - 消耗只发生在暴露格（有开放边的表层格）——外壳物质挡住内核（如 BaCO₃
//     外壳包住 NaOH 后反应阻断；Cu 壳包住 Fe 后内部不再被溶液侵蚀）。
//   - 固体产物附着：产物优先写入"上次被消耗"的格子（原地转化），
//     Fe 浸 CuSO₄ 时表面就地变铜，物块不膨胀。
// 渲染：每格按各物质质量占比混合颜色；透明度 = 格总剩余质量/满质量。
// ============================================================================

const { getSubstance } = __require('src/chem/substances.js');;
const { hexToRgb, rgbToHex } = __require('src/render/color.js');;
const { luminance } = __require('src/render/theme.js');;

const CELL_SIZE = 5; // px
const CELL_MASS = 0.1; // g（每格总质量上限）

/** 参与碰撞/物理的最低格质量（g）：低于此的微量格（渲染几乎透明，如生长层刚
 *  积累的 0.001~0.005g）不计入碰撞箱——否则物块边缘有一圈"看不见却撞得到"的
 *  幽灵层，视觉比碰撞小一圈，看起来像漂浮。0.01g（alpha≈0.1）以上已可辨 → 实心。 */
const MIN_SOLID_MASS = 0.01;

class MaterialGrid {
  constructor(cols = 0, rows = 0) {
    this.cols = cols;
    this.rows = rows;
    this.cells = [];
    for (let y = 0; y < rows; y++) this.cells.push(new Array(cols).fill(null));
    this._lastConsume = null; // 最近一次消耗的格子（原地转化用）
    this._totals = {}; // 物质总量缓存（普通对象：键访问远比 Map 快——大网格每次重扫 ~9ms → ~1ms）
    this._totalsValid = false;
    this._exposedVer = 0; // 暴露缓存版本：格内容变化（_invalidateTotals）时 +1
    this._exposedMemo = new Map(); // id -> {ver, sum}：每帧每物质最多全扫一次（原实现每调用一次全扫）
  }

  /** 总量缓存失效（任何"格质量变化"的写路径都必须调用） */
  _invalidateTotals() {
    this._totalsValid = false;
    this._exposedVer++;
    this._ver = (this._ver ?? 0) + 1; // 内容变更计数（暴露缓存按"变更次数"节流）
  }

  _ensureTotals() {
    if (this._totalsValid) return;
    const t = {};
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const m = this.cells[y][x];
        if (!m) continue;
        for (const [id, v] of m) {
          if (v > 1e-12) t[id] = (t[id] ?? 0) + v;
        }
      }
    }
    this._totals = t;
    this._totalsValid = true;
  }

  // ---- 创建 ----
  static rect(w, h, substance) {
    const cols = Math.max(1, Math.round(w / CELL_SIZE));
    const rows = Math.max(1, Math.round(h / CELL_SIZE));
    const g = new MaterialGrid(cols, rows);
    if (substance) g.fill(substance);
    return g;
  }

  static ellipse(w, h, substance) {
    const cols = Math.max(1, Math.round(w / CELL_SIZE));
    const rows = Math.max(1, Math.round(h / CELL_SIZE));
    const g = new MaterialGrid(cols, rows);
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const rx = cols / 2;
    const ry = rows / 2;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) g.set(x, y, substance);
      }
    }
    return g;
  }

  /** 按目标质量生成矩形固体（质量=格数×0.1g） */
  static rectForMass(mass, substance) {
    const cells = Math.max(1, Math.round(mass / CELL_MASS));
    const cols = Math.max(1, Math.round(Math.sqrt(cells)));
    const rows = Math.max(1, Math.round(cells / cols));
    return MaterialGrid.rect(cols * CELL_SIZE, rows * CELL_SIZE, substance);
  }

  /** 按目标质量生成"沉淀堆"梯形网格：上窄下宽、低矮（2~6 行），
   *  第 k 行（0=底）宽 W-2k 且居中——堆形从底部逐行收窄。
   *  质量守恒：每格满 0.1g，总质量 = 格数×0.1（±1 格舍入）。 */
  static heapForMass(mass, substance) {
    const cells = Math.max(6, Math.round(mass / CELL_MASS));
    const H = Math.max(2, Math.min(6, Math.round(Math.sqrt(cells / 8))));
    const W = Math.max(3, Math.ceil(cells / H) + H - 1); // 总格数 = H*W - H(H-1)
    const g = new MaterialGrid(W, H);
    for (let k = 0; k < H; k++) {
      const w = W - 2 * k;
      if (w <= 0) break;
      for (let x = 0; x < w; x++) g.set(k + x, H - 1 - k, substance); // 底行最宽，逐行收窄居中
    }
    return g;
  }

  /** 按目标像素尺寸生成梯形堆（沉淀堆手动缩放）：行数由高决定（2~6 行），
   *  宽 = 目标宽（至少 2H-1 格，保证顶行 ≥1 格）。质量 = 格数×0.1g。 */
  static heapRect(w, h, substance) {
    const H = Math.max(2, Math.min(6, Math.round(h / CELL_SIZE)));
    const W = Math.max(2 * H - 1, Math.round(w / CELL_SIZE));
    const g = new MaterialGrid(W, H);
    for (let k = 0; k < H; k++) {
      const w2 = W - 2 * k;
      if (w2 <= 0) break;
      for (let x = 0; x < w2; x++) g.set(k + x, H - 1 - k, substance);
    }
    return g;
  }

  /** 按目标质量生成椭圆固体 */
  static ellipseForMass(mass, substance, aspect = 1.25) {
    const cells = Math.max(1, Math.round(mass / CELL_MASS));
    const rx = Math.sqrt((cells * aspect) / Math.PI);
    const ry = rx / aspect;
    return MaterialGrid.ellipse(rx * 2 * CELL_SIZE, ry * 2 * CELL_SIZE, substance);
  }

  fill(substance) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) this.set(x, y, substance);
    }
  }

  // ---- 查询 ----
  /** 返回主物质 id（格内质量最多的；空/null 返回 null） */
  get(x, y) {
    const m = this.cell(x, y);
    if (!m) return null;
    let best = null;
    let bestMass = -1;
    for (const [id, mass] of m) {
      if (mass > bestMass) { best = id; bestMass = mass; }
    }
    return best;
  }

  /** 格内物质表（Map<id, mass>），空格返回 null */
  cell(x, y) {
    return y >= 0 && y < this.rows && x >= 0 && x < this.cols ? this.cells[y][x] : null;
  }

  /** 该格总剩余质量（g） */
  cellMass(x, y) {
    const m = this.cell(x, y);
    return m ? this._cellTotal(m) : 0;
  }

  /** 设置整格（id=null 清空；否则满质量单物质） */
  set(x, y, id) {
    if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
      this.cells[y][x] = id ? new Map([[id, CELL_MASS]]) : null;
      this._invalidateTotals();
    }
  }

  isFilled(x, y) {
    return !!this.cell(x, y);
  }

  /** 各物质质量（g，含部分溶解的质量） */
  masses() {
    this._ensureTotals();
    return { ...this._totals };
  }

  avail(id) {
    this._ensureTotals();
    return this._totals[id] ?? 0;
  }

  totalMass() {
    this._ensureTotals();
    let s = 0;
    for (const v of Object.values(this._totals)) s += v;
    return s;
  }

  ids() {
    this._ensureTotals();
    return Object.keys(this._totals);
  }

  /** 暴露格列表（实心但四邻至少一格空旷/微量）——反应/产气/爆炸发生在暴露面 */
  exposedCells() {
    const out = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const m = this.cells[y][x];
        if (!m || this._cellTotal(m) < MIN_SOLID_MASS) continue;
        if (this._cellExposed(x, y)) out.push({ x, y });
      }
    }
    return out;
  }

  /** 该格是否暴露（四邻任意一格为空/微量） */
  _cellExposed(x, y) {
    return !this._cellSolid(x - 1, y) || !this._cellSolid(x + 1, y)
      || !this._cellSolid(x, y - 1) || !this._cellSolid(x, y + 1);
  }

  _cellSolid(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false; // 边界外=暴露
    const m = this.cells[y][x];
    return !!(m && this._cellTotal(m) >= MIN_SOLID_MASS);
  }

  /** 该行是否"空行"（整行无实心格：全 null 或全微量 < MIN_SOLID_MASS） */
  _rowEmpty(y) {
    for (let x = 0; x < this.cols; x++) {
      const m = this.cells[y][x];
      if (m && this._cellTotal(m) >= MIN_SOLID_MASS) return false;
    }
    return true;
  }

  /**
   * 悬空修复（坍塌）：中间出现整行空行（如被反应"上下夹击"消耗断裂）时，
   * 把上方所有行整体下移一行填补空洞——像"掉下来了"，物块/玩家不再上下分离。
   * 只处理中间行（y=1..rows-2）：边界行可能是生长层（0 质量占位）或被消耗的
   * 顶/底行，不参与坍塌。空行的微量残余质量并入下方行（不超格子上限，超出丢弃
   * ——微量级，等同 MIN_ENTRY 哲学）。
   */
  collapseHollowRows() {
    for (let y = this.rows - 2; y >= 1; y--) {
      if (!this._rowEmpty(y)) continue;
      // 微量残余并入下方行（下方行可能满：room=0 → 微量丢弃）
      for (let x = 0; x < this.cols; x++) {
        const m = this.cells[y][x];
        if (!m) continue;
        const below = this.cells[y + 1]?.[x];
        if (!below) continue;
        for (const [id, mass] of m) {
          const room = CELL_MASS - this._cellTotal(below);
          if (room > 1e-9) below.set(id, (below.get(id) ?? 0) + Math.min(room, mass));
        }
      }
      // 删除空行：上方所有行整体下移一行
      this.cells.splice(y, 1);
      this.rows--;
      this._invalidateTotals(); // 行移动：暴露面/总量缓存都失效
    }
  }

  /** 填充格的最小外接 AABB（像素坐标）；微量格（< 0.01g，几乎透明）不参与碰撞
   *  ——防止物块边缘"看不见的幽灵层"造成视觉比碰撞小、看起来像漂浮。
   *  按内容版本缓存（grid 每帧被同步多次，大网格全扫一次 ~0.2ms，缓存后 O(1)）。 */
  minAABB() {
    if (this._aabbVer === this._exposedVer && this._aabb) return this._aabb;
    let minX = this.cols;
    let minY = this.rows;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const m = this.cells[y][x];
        if (m && this._cellTotal(m) > MIN_SOLID_MASS) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    const r = maxX < 0 ? null : {
      x: minX * CELL_SIZE,
      y: minY * CELL_SIZE,
      w: (maxX - minX + 1) * CELL_SIZE,
      h: (maxY - minY + 1) * CELL_SIZE,
    };
    this._aabb = r;
    this._aabbVer = this._exposedVer;
    return r;
  }

  // ---- 溶解（渐进，按接触表面积分摊；仅暴露格可被消耗）----

  /** 开阔地消耗：把 grams 分摊到边界格（按暴露面），格的质量逐渐下降 */
  consume(id, grams) {
    return this._consumeSmooth(id, grams, null, null);
  }

  /** 区域内消耗：只对与 region 重叠的格、按接触表面积分摊 */
  consumeInRegion(id, grams, region, origin) {
    return this._consumeSmooth(id, grams, region, origin);
  }

  _consumeSmooth(id, grams, regionOrNull, origin) {
    if (grams <= 0) return 0;
    this._lastConsume = [];
    this._batchUsed = false; // 本批产物是否已写入（决定后续致密产物是否还能填消耗格）
    let remaining = grams;
    let removed = 0;
    // —— 局部快速路径：腐蚀有局部性（上次消耗格及其 4 邻往往仍可继续消耗）。
    //    大网格上每帧的微消耗（如 2000g 铁块的缓慢氧化）不必全格扫描——
    //    这是"大物块反应时卡顿"的主因。仅在局部耗尽时才回落全扫。
    //    阈值 = 8 格/帧（≈24g/s）：池内大块的强反应也走局部；只剩超高活性的极端体系才全扫。
    if (this._prevTargets?.length && grams <= CELL_MASS * 8) {
      const seen = new Set();
      const active = [];
      for (const { x, y } of this._prevTargets) {
        for (const [nx, ny] of [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const k = nx + ny * this.cols;
          if (seen.has(k)) continue;
          seen.add(k);
          if (regionOrNull && !cellInRegion(nx, ny, regionOrNull, origin)) continue;
          const m = this.cells[ny][nx];
          if (!m || !m.has(id) || this._cellTotal(m) <= 1e-9) continue;
          if (!getSubstance(id)?.dense && this._denseBlocking(m, id)) continue;
          active.push({ x: nx, y: ny, cell: m, sides: this._openSides(nx, ny, id) });
        }
      }
      if (active.length) {
        const r = this._applyShares(id, active, remaining);
        removed += r.removed;
        remaining = r.remaining;
        if (removed > 0) {
          this._prevTargets = this._lastConsume.slice(0, 40);
          this._invalidateTotals();
          return removed;
        }
      }
    }
    for (let round = 0; round < 8 && remaining > 1e-9; round++) {
      // 收集符合条件的格 + 接触表面积（开边数）。无开放边的格（被外壳包住）
      // sides=0 → 分不到份额 → 内核物质被阻断，待外壳耗尽后才暴露。
      const active = [];
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const m = this.cells[y][x];
          if (!m || !m.has(id) || this._cellTotal(m) <= 1e-9) continue;
          if (regionOrNull && !cellInRegion(x, y, regionOrNull, origin)) continue;
          // 镀层完成格不再被消耗：格内"非消耗目标"的致密物质 ≥ 半格（如 Fe 格被
          // Cu 镀到 0.05g）→ 该格停止反应（Fe 剩一半被镀层包住——"每格 Fe 不用完"，
          // 镀层逐格渐进，而不是一格全镀完才轮到下一格）。
          // 消耗目标自身是致密物质（BaCO3 块 + 酸）不在此列（要能被溶解）。
          if (!getSubstance(id)?.dense && this._denseBlocking(m, id)) continue;
          active.push({ x, y, cell: m, sides: this._openSides(x, y, id) });
        }
      }
      if (active.length === 0) break;
      const r = this._applyShares(id, active, remaining);
      removed += r.removed;
      remaining = r.remaining;
      if (r.removed <= 0) break;
    }
    if (removed > 0) {
      this._prevTargets = this._lastConsume.slice(0, 40); // 记住消耗区域（局部优先用）
      this._invalidateTotals(); // 格质量变化 → 总量缓存失效
    }
    return removed;
  }

  /** 按接触面占比把 remaining 分摊给 active 格；返回 {removed, remaining, progressed} */
  _applyShares(id, active, remaining) {
    let W = 0;
    for (const a of active) W += a.sides;
    if (W <= 0) return { removed: 0, remaining, progressed: false }; // 全部被包围
    let removed = 0;
    const roundRemaining = remaining;
    let progressed = false;
    for (const a of active) {
      if (remaining <= 1e-9) break;
      const share = (roundRemaining * a.sides) / W;
      const cur = a.cell.get(id) ?? 0;
      const take = Math.min(cur, share);
      if (take > 1e-12) {
        a.cell.set(id, cur - take);
        removed += take;
        remaining -= take;
        this._lastConsume.push({ x: a.x, y: a.y });
        if (cur - take <= 1e-9) {
          a.cell.delete(id);
          if (a.cell.size === 0) {
            this.cells[a.y][a.x] = null; // 溶完置空，暴露内部格
            this._dirty = true; // 标记：可能出现"整行空"悬空 → syncGrid 时坍塌
          }
        }
        progressed = true;
      }
    }
    return { removed, remaining, progressed };
  }

  /**
   * 某格的接触表面积：4 邻"可渗透"的边数（空格=暴露面；越界也算空）。
   * 判定规则（forId 为消耗目标时）：
   *   - 空格：可渗透
   *   - 含 forId 的格（反应物本体）：不可渗透（需先被消耗暴露，否则内部被外壳包住）
   *   - 絮状沉淀（Cu(OH)2 等氢氧化物）多缝隙不阻断：可渗透
   *   - 致密晶形沉淀（BaCO3/BaSO4/AgCl/金属）：阻断
   */
  _openSides(x, y, forId = null) {
    let n = 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const m = this.cell(nx, ny);
      if (!m) {
        n++;
        continue;
      }
      // 0 质量占位格（growExposed 刚开层未填充的生长层）视为空：
      // 不挡反应、不阻断（否则新开的一层 dense 占位格会立即把反应面整体封死）
      if (this._cellTotal(m) <= 1e-9) {
        n++;
        continue;
      }
      if (forId && m.has(forId)) continue; // 反应物本体不视为开放
      if (!this._isDense(m)) n++; // 絮状沉淀可渗透
    }
    return n;
  }

  /** 格内是否含"足以阻断"的致密物质：**低浓度致密物质不阻断**——镀层渐进的关键：
   *  格子体积固定 → 格内致密物质的质量即浓度。刚生成的少量 Cu/BaCO3（如 0.014g，
   *  或纯致密物层格里的 0.004g）低于半格阈值（0.05g）→ 不阻断，反应可继续渗透；
   *  致密物质 ≥ 半格（0.05g）才判致密（该格镀层完成 → 阻断内部）。
   *  0 质量生长占位格不算。 */
  _isDense(m) {
    const total = this._cellTotal(m);
    if (total <= 1e-9) return false;
    let denseMass = 0;
    for (const [id, mass] of m) {
      const s = getSubstance(id);
      if (s && s.dense) denseMass += mass;
    }
    return denseMass >= CELL_MASS / 2;
  }

  /** 格内"排除消耗目标外"的致密物质 ≥ 半格 → 该格镀层完成，不再被消耗
   *  （Fe 格被 Cu 镀到 0.05g 即停，剩一半 Fe 被包住；BaCO3 块自身致密不在此列） */
  _denseBlocking(m, excludeId) {
    const total = this._cellTotal(m);
    if (total <= 1e-9) return false;
    let d = 0;
    for (const [id2, mass] of m) {
      if (id2 === excludeId) continue;
      const s = getSubstance(id2);
      if (s && s.dense) d += mass;
    }
    return d >= CELL_MASS / 2;
  }

  /**
   * 区域内某物质的总质量（g）。变更计数节流（≥30 次内容变更重扫一次，≈每帧消耗的
   * 大网格 1 秒刷新）：池内大块的反应循环每帧调用数十次，每次全扫是大网格
   * "反应时卡顿"的根因之一。
   */
  availInRegion(id, region, origin) {
    if (this._regVer !== undefined && (this._ver ?? 0) - this._regVer < 30 && this._regCache && this._regCache.id === id) {
      return this._regCache.sum;
    }
    let s = 0;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = this.cells[y][x];
        if (c && c.has(id) && cellInRegion(x, y, region, origin)) s += c.get(id);
      }
    }
    this._regVer = this._ver ?? 0;
    this._regCache = { id, sum: s };
    return s;
  }

  /**
   * 暴露格（开放边 > 0）中某物质的总质量（g）——反应"实际可消耗"的量。
   * 被致密外壳（Cu/BaCO3 等）包住的内核不计入：反应量据此计算，产物不会凭空生成。
   * 带版本+时间窗缓存：一帧内同一物质反复查询只全扫一次；格内容微变（消耗每帧发生）
   * 也不会每帧强刷全扫——暴露面变化滞后 ≤150ms，化学量误差 <1%（大网格 11ms/次的全扫
   * 若每帧发生就是卡顿主因）。
   */
  exposedAvail(id, region = null, origin = null) {
    if (region) {
      // 区域版缓存（同 availInRegion）：≥30 次内容变更重扫一次
      if (this._regExpVer !== undefined && (this._ver ?? 0) - this._regExpVer < 30 && this._regExpCache && this._regExpCache.id === id) {
        return this._regExpCache.sum;
      }
      let s = 0;
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const c = this.cells[y][x];
          if (!c || !c.has(id) || this._openSides(x, y, id) <= 0) continue;
          if (!cellInRegion(x, y, region, origin)) continue;
          s += c.get(id);
        }
      }
      this._regExpVer = this._ver ?? 0;
      this._regExpCache = { id, sum: s };
      return s;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._exposedAt === undefined || now - this._exposedAt > 150) {
      this._exposedMemo.clear(); // 时间窗到期：强制重扫一次（暴露面变化的滞后 ≤150ms）
      this._exposedAt = now;
    }
    const mem = this._exposedMemo.get(id);
    if (mem) return mem.sum;
    let s = 0;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = this.cells[y][x];
        if (!c || !c.has(id) || this._openSides(x, y, id) <= 0) continue;
        s += c.get(id);
      }
    }
    this._exposedMemo.set(id, { ver: this._exposedVer, sum: s });
    return s;
  }

  /**
   * 直接加质量到网格（玩家吸收回血等）：不足半格先累积（避免小数质量被舍入丢失）；
   * 优先补已有空格，剩余生长。返回本次实际写入量。
   */
  add(id, mass) {
    this._addAccum = (this._addAccum ?? 0) + mass;
    let rest = this._addAccum;
    if (rest < CELL_MASS / 2) return 0; // 太少量先攒着
    for (let y = this.rows - 1; y >= 0 && rest > 1e-9; y--) {
      for (let x = 0; x < this.cols && rest > 1e-9; x++) {
        if (!this.cells[y][x]) {
          const put = Math.min(CELL_MASS, rest);
          this.cells[y][x] = new Map([[id, put]]);
          rest -= put;
        }
      }
    }
    if (rest > 1e-9) rest -= this.addEdge(id, rest);
    const used = this._addAccum - Math.max(0, rest);
    this._addAccum = Math.max(0, rest);
    if (used > 1e-12) this._invalidateTotals();
    return used;
  }

  /**
   * 原地转化：把 grams 写入"上次被消耗"的格子（固体产物附着在反应物表面）。
   * 非致密产物按各格剩余容量占比分摊——先到先得会让后遍历的格（大 y 行）
   * 拿不到份额，消耗面深处出现空洞（如 NaOH 块吸收 Cl2：NaCl 填不满消耗面，
   * 中部整片空缺）。致密产物（BaCO3/Cu 壳）先到先得集中填格：均匀分摊会让
   * 所有消耗格同时沾上致密物质而整体变 dense，过早把反应面封死。
   * 本批已有产物写入后，后续致密产物不再填消耗格（返回 0 走 addEdge 底部）：
   * 否则 BaCO3 会填进刚被 NaOH 回填的表面格，把整个反应面封死（池内再生
   * Na2CO3 转化不完）。非致密产物同批共享格子，room 填满后剩余才由调用方
   * 走 addEdge 生长（已配质量累积器，小量不丢失）。返回实际写入量。
   */
  addInPlace(id, grams) {
    if (grams <= 0 || !this._lastConsume || this._lastConsume.length === 0) return 0;
    const dense = !!getSubstance(id)?.dense;
    if (dense && this._batchUsed) return 0; // 本批已有产物 → 致密产物不填消耗格（防封死）
    let wrote = 0;
    if (dense) {
      // 致密产物：先到先得，集中成壳
      let rest = grams;
      for (const { x, y } of this._lastConsume) {
        if (rest <= 1e-12) break;
        const row = this.cells[y];
        if (!row) continue;
        let m = row[x];
        const room = m ? CELL_MASS - this._cellTotal(m) : CELL_MASS;
        if (room <= 1e-12) continue;
        const put = Math.min(room, rest);
        if (!m) { m = new Map(); row[x] = m; }
        m.set(id, (m.get(id) ?? 0) + put);
        rest -= put;
        wrote += put;
      }
    } else {
      // 非致密产物：按各格剩余容量占比分摊（防空洞）
      const slots = [];
      let totalRoom = 0;
      for (const { x, y } of this._lastConsume) {
        const row = this.cells[y];
        if (!row) continue;
        const m = row[x];
        const room = m ? CELL_MASS - this._cellTotal(m) : CELL_MASS;
        if (room <= 1e-12) continue;
        slots.push({ x, y, room });
        totalRoom += room;
      }
      if (slots.length === 0 || totalRoom <= 1e-12) return 0;
      let rest = grams;
      for (const { x, y, room } of slots) {
        if (rest <= 1e-12) break;
        const quota = (grams * room) / totalRoom; // 该格本轮应得的份额
        const put = Math.min(room, rest, quota);
        const row = this.cells[y];
        let m = row[x];
        if (!m) { m = new Map(); row[x] = m; }
        m.set(id, (m.get(id) ?? 0) + put);
        rest -= put;
        wrote += put;
      }
    }
    if (wrote > 0) this._batchUsed = true;
    if (wrote > 1e-12) this._invalidateTotals();
    return wrote;
  }

  /** 转化边界格（保留剩余质量，原地改物质）；返回转化质量 */
  convert(id, toId, grams) {
    let need = grams;
    let converted = 0;
    for (let round = 0; round < 8 && need > 1e-9; round++) {
      const boundary = this._boundaryCells(id);
      if (boundary.length === 0) break;
      let progressed = false;
      for (const [x, y] of boundary) {
        if (need <= 1e-9) break;
        const m = this.cells[y][x];
        if (m && m.has(id)) {
          const cur = m.get(id);
          const take = Math.min(cur, need);
          m.set(id, cur - take);
          m.set(toId, (m.get(toId) ?? 0) + take);
          need -= take;
          converted += take;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    if (converted > 1e-12) this._invalidateTotals();
    return converted;
  }

  /** 在指定侧边新增整格（g）。先补满已有边界行的空位，再开新行（新行填满）。
   *  质量累积：不足一格的余量攒着（_edgeAcc），攒满一格才生成——避免 round 把小量
   *  吞掉（round(0.03/0.1)=0 → 产物凭空丢失）或放大（round(0.06/0.1)=1 → 凭空多造）。
   *  （暴露面渐进生长请用 growExposed——产物盈余长在所有与大气/液体接触的面上。） */
  addEdge(id, grams, side = 'bottom') {
    this._edgeAcc = this._edgeAcc || {};
    this._edgeAcc[id] = (this._edgeAcc[id] ?? 0) + grams;
    let need = Math.floor(this._edgeAcc[id] / CELL_MASS + 1e-9); // 防浮点：0.3/0.1=2.999…
    this._edgeAcc[id] -= need * CELL_MASS;
    if (this._edgeAcc[id] < 1e-6) this._edgeAcc[id] = 0;
    const totalNeeded = need;
    // 优先补满边界行（避免每 0.1g 就开新行把物体越撑越大）
    if (side === 'bottom' && this.rows > 0) {
      const last = this.rows - 1;
      for (let x = 0; x < this.cols && need > 0; x++) {
        if (!this.cells[last][x]) {
          this.cells[last][x] = new Map([[id, CELL_MASS]]);
          need--;
        }
      }
    }
    while (need > 0) {
      const added = this._growSide(side, id, need);
      if (added <= 0) break;
      need -= added;
    }
    return (totalNeeded - need) * CELL_MASS;
  }

  /**
   * 暴露面渐进生长：产物盈余长在所有"暴露边界"上（物块/玩家与大气、液体接触的
   * 面——四周都是接触面，不固定哪一面）。所有暴露位置**同时**开始生长：质量从 0
   * 逐渐涨满（渲染 alpha 随质量渐变），而不是攒满一格才冒出一个满格。
   * 关键：边界基于**实际内容（minAABB）**而非 cells 数组边界——被酸蚀缩水/内部
   * 空洞的网格，生长贴着主体表面，不会在"原始大小"位置长出脱离的壳。
   * 规则：
   *  - 主体四边界行/列的空位与未满格 = 填充目标（长回被消耗挖掉的洞）
   *  - 边界外一行/列的未满格也是目标（上次开的层——层格质量 < MIN_SOLID_MASS 时
   *    不在 minAABB 内，必须显式收集，否则每 tick 都会重复开层叠层）
   *  - 边界全满且边界外无未满格 → 在该面开一层（新行/列，源格位置放 0 质量占位），
   *    占位格随后与其它目标一起逐渐填充；一层满后自动开下一层
   *  - 质量直接写入格子（无累积器滞留：不足一格的余量也立即分摊，总量守恒）
   * 返回实际写入量。
   */
  growExposed(id, grams) {
    if (!(grams > 0) || this.rows === 0 || this.cols === 0) return 0;
    let rest = grams;
    let wrote = 0;
    // 多轮：当前目标 room 不足时开新层继续写入，直到写完或无处可长
    for (let round = 0; round < 8 && rest > 1e-12; round++) {
      this._invalidateTotals(); // 上一轮开层/写入后：minAABB/总量缓存强制刷新
      const aabb = this.minAABB();
      if (!aabb) break;
      let minX = Math.floor(aabb.x / CELL_SIZE);
      let maxX = Math.floor((aabb.x + aabb.w) / CELL_SIZE) - 1;
      let minY = Math.floor(aabb.y / CELL_SIZE);
      let maxY = Math.floor((aabb.y + aabb.h) / CELL_SIZE) - 1;
      if (minX < 0 || minY < 0 || maxX >= this.cols || maxY >= this.rows) break;
      const rowFull = (y) => {
        for (let x = minX; x <= maxX; x++) {
          const m = this.cells[y]?.[x];
          if (!m || this._cellTotal(m) < CELL_MASS - 1e-9) return false;
        }
        return true;
      };
      const colFull = (c) => {
        for (let y = minY; y <= maxY; y++) {
          const m = this.cells[y]?.[c];
          if (!m || this._cellTotal(m) < CELL_MASS - 1e-9) return false;
        }
        return true;
      };
      // 收集填充目标：主体四边界（允许空位=补洞）+ 边界外一行/列（上次开的未满层）
      const targets = [];
      const seen = new Set();
      const push = (x, y, allowEmpty) => {
        const row = this.cells[y];
        if (!row) return;
        const m = row[x];
        if (!m) {
          if (allowEmpty) { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); targets.push({ x, y }); } }
          return;
        }
        if (this._cellTotal(m) >= CELL_MASS - 1e-9) return;
        const k = x + ',' + y;
        if (seen.has(k)) return;
        seen.add(k);
        targets.push({ x, y });
      };
      for (let x = minX; x <= maxX; x++) {
        push(x, maxY, true);
        push(x, minY, true);
        push(x, maxY + 1, false);
        push(x, minY - 1, false);
      }
      for (let y = minY; y <= maxY; y++) {
        push(maxX, y, true);
        push(minX, y, true);
        push(maxX + 1, y, false);
        push(minX - 1, y, false);
      }
      if (targets.length === 0) {
        // 边界全满且边界外无未满层 → 开新层（贴着实际边界）。
        // 先基于当前边界统一判定四面，再统一开层（避免先开的面污染后续判定）
        const can = {
          bottom: rowFull(maxY),
          top: rowFull(minY),
          right: colFull(maxX),
          left: colFull(minX),
        };
        let opened = false;
        if (can.bottom) { this._openLayerAt('bottom', id, maxY, minX, maxX); opened = true; }
        if (can.top) { this._openLayerAt('top', id, minY, minX, maxX); opened = true; }
        if (can.right) { this._openLayerAt('right', id, maxX, minY, maxY); opened = true; }
        if (can.left) { this._openLayerAt('left', id, minX, minY, maxY); opened = true; }
        if (!opened) break;
        // 开层后：重新用 minAABB 算主体边界（新层 0 质量不计入；top/left 的 splice
        // 会让行/列索引漂移，手动跟踪必错位）——新层 = 主体边界外一行/列
        this._invalidateTotals(); // 刚开层/写入：缓存强制刷新
        const a2 = this.minAABB();
        if (!a2) break;
        const nMinX = Math.floor(a2.x / CELL_SIZE);
        const nMaxX = Math.floor((a2.x + a2.w) / CELL_SIZE) - 1;
        const nMinY = Math.floor(a2.y / CELL_SIZE);
        const nMaxY = Math.floor((a2.y + a2.h) / CELL_SIZE) - 1;
        for (let x = nMinX; x <= nMaxX; x++) {
          push(x, nMaxY + 1, false); // 新底层
          push(x, nMinY - 1, false); // 新顶层
        }
        for (let y = nMinY; y <= nMaxY; y++) {
          push(nMaxX + 1, y, false); // 新右列
          push(nMinX - 1, y, false); // 新左列
        }
        // 新层交叉角落（top×left 等——left 开层时已给顶层行插占位，补齐收集）
        push(nMinX - 1, nMinY - 1, false);
        push(nMaxX + 1, nMinY - 1, false);
        push(nMinX - 1, nMaxY + 1, false);
        push(nMaxX + 1, nMaxY + 1, false);
        if (targets.length === 0) break;
      }
      // 均摊：每格拿相同份额（余数给最后一格），所有目标格同步增长
      const share = rest / targets.length;
      for (const { x, y } of targets) {
        if (rest <= 1e-12) break;
        const row = this.cells[y];
        let m = row[x];
        const room = m ? CELL_MASS - this._cellTotal(m) : CELL_MASS;
        if (room <= 1e-12) continue;
        const put = Math.min(room, share, rest);
        if (put <= 1e-12) continue;
        if (!m) { m = new Map(); row[x] = m; }
        m.set(id, (m.get(id) ?? 0) + put);
        rest -= put;
        wrote += put;
      }
    }
    if (wrote > 1e-12) this._invalidateTotals();
    return wrote;
  }

  /** 在指定边界行/列（edge，基于实际内容）外侧开一层"生长层"：新行/列在源格
   *  位置（span0..span1 范围）放 0 质量占位格，随后由 growExposed 逐渐填充。
   *  基于实际边界而非 cells 数组边界：缩水/内部空洞的网格生长贴着主体。 */
  _openLayerAt(side, id, edge, span0, span1) {
    if (this.rows === 0 || this.cols === 0) return 0;
    if (side === 'right' || side === 'left') {
      const idx = side === 'right' ? edge + 1 : edge;
      let any = false;
      for (let y = span0; y <= span1; y++) if (this.cells[y]?.[edge]) { any = true; break; }
      if (!any) return 0;
      for (let y = 0; y < this.rows; y++) {
        const has = y >= span0 && y <= span1 && this.cells[y][edge];
        this.cells[y].splice(idx, 0, has ? new Map([[id, 0]]) : null);
      }
      this.cols++;
      return 1;
    }
    let any = false;
    for (let x = span0; x <= span1; x++) if (this.cells[edge]?.[x]) { any = true; break; }
    if (!any) return 0;
    const newRow = new Array(this.cols).fill(null);
    for (let x = span0; x <= span1; x++) {
      if (this.cells[edge][x]) newRow[x] = new Map([[id, 0]]);
    }
    if (side === 'bottom') this.cells.splice(edge + 1, 0, newRow);
    else this.cells.splice(edge, 0, newRow);
    this.rows++;
    return 1;
  }

  _growSide(side, id, maxCells) {
    if (this.rows === 0 || this.cols === 0) return 0;
    if (side === 'right' || side === 'left') {
      const idx = side === 'right' ? this.cols : 0;
      const colIdx = side === 'right' ? this.cols - 1 : 0;
      let added = 0;
      for (let y = 0; y < this.rows; y++) if (this.cells[y][colIdx] && added < maxCells) added++;
      if (added === 0) return 0;
      // 只在实际放 Map 的行插入新列，且受 maxCells 限制（否则一次性塞进源列全部
      // 有格数 → 多造质量：返回 added 与实际放置数不一致）
      let placed = 0;
      for (let y = 0; y < this.rows; y++) {
        const has = this.cells[y][colIdx] && placed < maxCells;
        if (has) placed++;
        this.cells[y].splice(idx, 0, has ? new Map([[id, CELL_MASS]]) : null);
      }
      this.cols++;
      return placed;
    }
    const srcIdx = side === 'bottom' ? this.rows - 1 : 0;
    let added = 0;
    for (let x = 0; x < this.cols; x++) if (this.cells[srcIdx][x] && added < maxCells) added++;
    if (added === 0) return 0;
    const newRow = new Array(this.cols).fill(null);
    let placed = 0;
    for (let x = 0; x < this.cols && placed < maxCells; x++) {
      if (this.cells[srcIdx][x]) {
        newRow[x] = new Map([[id, CELL_MASS]]);
        placed++;
      }
    }
    if (side === 'bottom') this.cells.push(newRow);
    else this.cells.unshift(newRow);
    this.rows++;
    return placed;
  }

  /** 某物质的外圈格（四邻有空/越界） */
  _boundaryCells(id) {
    const out = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!this.cells[y][x]?.has(id)) continue;
        if (this._openSides(x, y) > 0) out.push([x, y]);
      }
    }
    return out;
  }

  /**
   * 暴露（表层）物质质量表：只有暴露格的物质能参与外部反应/焰色/掉渣。
   * 返回 { id → mass }。时间窗缓存：暴露面变化滞后 ≤150ms（本表被每帧调用，
   * 大网格上一次全扫约 10ms——逐帧重扫就是卡顿主因）。
   */
  exposedMasses() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._expMassesAt === undefined || now - this._expMassesAt > 150) {
      const m = {};
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const c = this.cells[y][x];
          if (!c || this._openSides(x, y) <= 0) continue;
          for (const [id, mass] of c) m[id] = (m[id] ?? 0) + mass;
        }
      }
      this._expMasses = m;
      this._expMassesAt = now;
    }
    return this._expMasses;
  }

  _cellTotal(m) {
    let s = 0;
    for (const v of m.values()) s += v;
    return s;
  }
}

/** 格子世界矩形是否与 region 重叠 */
function cellInRegion(x, y, region, origin) {
  const cx = origin.x + x * CELL_SIZE;
  const cy = origin.y + y * CELL_SIZE;
  return (
    cx < region.x + region.w && cx + CELL_SIZE > region.x &&
    cy < region.y + region.h && cy + CELL_SIZE > region.y
  );
}

/** 格内多物质按质量占比混合成一种颜色 */
function cellColor(m) {
  let r = 0, g = 0, b = 0, total = 0;
  for (const [id, mass] of m) {
    const sub = getSubstance(id);
    const hex = sub.solid && sub.solid.length ? sub.solid[0] : '#cccccc';
    const c = hexToRgb(hex);
    r += c.r * mass;
    g += c.g * mass;
    b += c.b * mass;
    total += mass;
  }
  if (total <= 0) return '#cccccc';
  return rgbToHex({ r: r / total, g: g / total, b: b / total });
}

// ---- 渲染：按行游程合并（大网格的相邻同色格合并为一个矩形——几千/万格的大物块
// 从"逐格 fillRect" 变成"数十次绘制"，是消除大块卡顿的关键之一）；
// 深色格加白色光晕（暗背景下可见），合并段整体一次投影。
function renderGrid(ctx, grid, ox, oy) {
  ctx.save();
  const px = CELL_SIZE;
  for (let y = 0; y < grid.rows; y++) {
    const row = grid.cells[y];
    let runX = -1;
    let runColor = null;
    let runAlpha = 0;
    let runDark = false;
    const flush = (endX) => {
      if (runX < 0) return;
      const w = (endX - runX) * px;
      ctx.globalAlpha = runAlpha;
      ctx.fillStyle = runColor;
      ctx.fillRect(ox + runX * px, oy + y * px, w, px);
      if (runDark) {
        ctx.shadowColor = 'rgba(255,255,255,0.75)';
        ctx.shadowBlur = 4;
        ctx.fillRect(ox + runX * px, oy + y * px, w, px);
        ctx.shadowBlur = 0;
      }
      runX = -1;
    };
    for (let x = 0; x < grid.cols; x++) {
      const m = row[x];
      if (!m) { flush(x); continue; }
      const total = grid._cellTotal(m);
      if (total < MIN_SOLID_MASS) { flush(x); continue; } // 微量格不渲染——与碰撞箱一致
      const color = cellColor(m);
      const alpha = Math.max(0, Math.min(1, total / CELL_MASS));
      const dark = luminance(color) < 110;
      // 颜色/透明度/明暗变化 → 结束上一游程（透明度允许小差，减少碎片段）
      if (color !== runColor || dark !== runDark || Math.abs(alpha - runAlpha) > 0.15) {
        flush(x);
        runX = x;
        runColor = color;
        runAlpha = alpha;
        runDark = dark;
      }
    }
    flush(grid.cols);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

exports.CELL_SIZE = CELL_SIZE;
exports.CELL_MASS = CELL_MASS;
exports.MIN_SOLID_MASS = MIN_SOLID_MASS;
exports.MaterialGrid = MaterialGrid;
exports.renderGrid = renderGrid;

  };
  __modules["src/render/color.js"] = function (module, exports, __require) {
// ============================================================================
// 颜色工具：#hex 与 rgb 互转、混色
// ============================================================================

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 线性混色：t=0 → a，t=1 → b */
function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

exports.hexToRgb = hexToRgb;
exports.rgbToHex = rgbToHex;
exports.mix = mix;

  };
  __modules["src/objects/bubble.js"] = function (module, exports, __require) {
// ============================================================================
// 气泡：反应产气时的视觉反馈（纯特效，无碰撞）。
//   dir = -1  轻于空气的气体 → 上升气泡柱
//   dir = +1  重于空气的气体 → 下沉气泡柱
// 上升/下沉过程中被实心静态体（地板/顶板）阻断时立即消失。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;

class Bubble extends Obj {
  constructor({ x, y, dir = -1, speed = 80, ...rest } = {}) {
    super({ x, y, w: 6, h: 6, solid: false, physicsKind: 'none', ...rest });
    this.dir = dir;
    this.speed = speed;
    this.life = 2.0;
  }

  update(dt, scene) {
    this.y += this.dir * this.speed * dt; // dir=-1 上升，dir=+1 下沉
    this.x += Math.sin(scene.time * 6 + this.y * 0.1) * 0.3; // 轻微晃动
    // 被地板阻断：与任意实心静态体重叠即消失
    for (const s of scene.statics) {
      if (!s.solid) continue;
      if (s.x < this.x + this.w && s.x + s.w > this.x && s.y < this.y + this.h && s.y + s.h > this.y) {
        scene.removeObject(this);
        return;
      }
    }
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  render(ctx) {
    const a = Math.max(0, Math.min(1, this.life * 0.7));
    const x = this.x + this.w / 2;
    const y = this.y + this.h / 2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(150,225,255,0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(205,238,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, this.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(x - this.w * 0.2, y - this.h * 0.2, this.w * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

exports.Bubble = Bubble;

  };
  __modules["src/objects/spark.js"] = function (module, exports, __require) {
// ============================================================================
// 火星：金属燃烧（铁/镁/铝/钠/钾等在点燃条件下氧化）迸发的视觉粒子。
// 无碰撞、短寿命：橙金亮点 + 辉光，随机初速上抛后受"重力"回落并闪烁消失。
// 纯视觉（不参与化学/物理解算），由 scene.onSpark 在反应点生成。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;

class Spark extends Obj {
  constructor({ x, y, vx = 0, vy = 0, life = 0.8, color = '#ffb340', ...rest } = {}) {
    super({ x, y, w: 3, h: 3, solid: false, physicsKind: 'none', ...rest });
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this._seed = Math.random() * 10;
  }

  get hoverLabel() {
    return null;
  }

  update(dt, scene) {
    this.life -= dt;
    if (this.life <= 0) {
      scene.removeObject(this);
      return;
    }
    // 火星：先上抛后回落 + 水平随机漂移（粒子上抛初速贯穿全场——"火星四射"）
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 900 * dt; // 轻"重力"让火花从最高点划落
    this.vx *= 1 - 2.5 * dt;
  }

  render(ctx) {
    const t = 1 - this.life / this.maxLife; // 0..1 老化
    const blink = 0.55 + 0.45 * Math.sin((this._seed + t * 24) * 3);
    const a = Math.max(0, 1 - t) * blink;
    const R = 2.2 * (1 - t * 0.5);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 7;
    ctx.fillStyle = t < 0.2 ? '#fff3c8' : this.color;
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y + this.h / 2, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

exports.Spark = Spark;

  };
  __modules["src/objects/gascolumn.js"] = function (module, exports, __require) {
// ============================================================================
// 气泡柱 / 气流：对重叠的动态体施加重力以外的加速度。
//   dir = -1  上升气流（轻气体 H2/O2，把玩家/物块托起）
//   dir = +1  下沉气流（重气体 CO2，把玩家/物块往下压）
//   life > 0 时为临时气流（反应产气产生，到期消失）；0 表示常驻（关卡 ⑦）。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { overlaps } = __require('src/physics/collision.js');;
const { getSubstance } = __require('src/chem/substances.js');;
const { luminance } = __require('src/render/theme.js');;

class GasColumn extends Obj {
  constructor({ x, y, w, h, accel = 1300, maxSpeed = 260, dir = -1, life = 0, gasId = null, label = null, source = null, ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.accel = accel;
    this.maxSpeed = maxSpeed;
    this.dir = dir; // -1 上 / +1 下
    this.life = life; // 0 = 常驻
    this.gasId = gasId; // 生成气体的物质 id（反应产气的气流显示气体种类）
    this.label = label; // 显式标签（常驻气流用，如 "气流"）
    this.source = source; // 产气源对象（自身不被自己的气流托起）
  }

  get hoverLabel() {
    return '气流';
  }

  update(dt, scene) {
    if (this.life > 0) {
      this.life -= dt;
      if (this.life <= 0) {
        scene.removeObject(this);
        return;
      }
    }
    for (const obj of scene.dynamics) {
      if (obj === this || obj === this.source || obj.static || obj.noLift) continue; // 产气源/标记 noLift 的不被气流托起
      if (overlaps(this, obj)) {
        obj.vel.y += this.dir * this.accel * dt;
        if (this.dir < 0 && obj.vel.y < -this.maxSpeed) obj.vel.y = -this.maxSpeed;
        if (this.dir > 0 && obj.vel.y > this.maxSpeed) obj.vel.y = this.maxSpeed;
      }
    }
  }

  render(ctx, scene) {
    const t = scene.time ?? 0;
    ctx.save();
    // 柱体微光（按气体颜色；无气体信息用青色）
    const sub = this.gasId ? getSubstance(this.gasId) : null;
    const tint = sub?.gasColor ?? '#78dcff';
    const { r, g, b } = hexToRgb(tint);
    const grad = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.12)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    // 气流发光粒子（方向按 dir：上浮或下沉）
    const n = Math.min(30, Math.max(1, Math.round((this.w * this.h) / 600)));
    for (let i = 0; i < n; i++) {
      const bx = this.x + ((i * 7919) % 997) / 997 * this.w;
      const phase = (t * 40 + i * 53) % (this.h + 30);
      const by = this.dir < 0 ? this.y + this.h - phase : this.y + phase;
      ctx.fillStyle = 'rgba(205,242,255,0.6)';
      ctx.shadowColor = 'rgba(120,220,255,0.9)';
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 气体标签：反应产气的气流显示气体种类（NO2 红棕、Cl2 黄绿、H2/CO2 淡青…）
    const label = this.label ?? this.gasId;
    if (label) {
      ctx.font = 'bold 11px "Segoe UI", "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(label).width;
      const lx = this.x + this.w / 2;
      const ly = this.dir < 0 ? this.y - 6 : this.y + this.h + 16;
      const pad = 4;
      ctx.fillStyle = 'rgba(8,18,32,0.72)';
      ctx.beginPath();
      ctx.roundRect(lx - tw / 2 - pad, ly - 12, tw + pad * 2, 15, 4);
      ctx.fill();
      const dark = luminance(tint) < 110;
      ctx.fillStyle = dark ? '#eaf6ff' : tint;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly - 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

exports.GasColumn = GasColumn;

  };
  __modules["src/objects/explosion.js"] = function (module, exports, __require) {
// ============================================================================
// 爆炸视觉 v3：
//  白热闪核 → 14 瓣火团（翻涌边缘+二级甩出火团）→ 撕裂冲击环+径向光纹
//  → 带下坠拖尾火星（1/3 按焰色反应上色）→ 碎片/余烬/烟尘 → 焰色残余辉光。
//  0.5s 后移除；每实例用确定性随机种子（连续爆炸不雷同）。
// 物理冲击（炸飞/碎裂）由 Scene.explode 处理；本对象只负责视觉反馈。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { mix } = __require('src/render/color.js');;

/** 确定性伪随机（mulberry32）：同一 Explosion 实例内每次渲染形状一致；不同实例不同形 */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Explosion extends Obj {
  constructor({ x, y, strength = 10, cause = null, flip = false, flames = null }) {
    super({ x, y, w: 0, h: 0, solid: false, physicsKind: 'none', noLift: true });
    this.strength = strength;
    this.cause = cause; // 爆炸原因文本（调试：爆炸发生时显示）
    this.flames = (flames ?? []).slice(0, 3); // 焰色集合（Na 黄/K 紫/Cu 蓝绿…）——火星/光晕/余烬轮流染色
    this.age = 0;
    this.life = 0.5;
    const seed = ((flip ? 0x9e37 : 0x85eb) + ((strength * 7919) | 0) + (this.flames.length ? 0x7f4a7c : 0)) >>> 0;
    const rnd = mulberry32(seed);
    this.rnd = [];
    for (let i = 0; i < 40; i++) this.rnd.push(rnd());
  }

  /** 第 i 个焰色染色（循环取用；无焰色返回 null） */
  colorOf(i) {
    if (!this.flames.length) return null;
    return this.flames[Math.abs(i) % this.flames.length];
  }

  update(dt, scene) {
    this.age += dt;
    if (this.age >= this.life) scene.removeObject(this);
  }

  render(ctx, scene) {
    const rnd = this.rnd;
    const t = Math.min(1, this.age / this.life); // 0..1
    const ease = 1 - Math.pow(1 - Math.min(1, t / 0.38), 2.1); // 爆发曲线：前 38% 完成 ~80%
    const R = (16 + this.strength * 2.4) * (0.25 + 0.75 * ease);
    const alpha = Math.max(0, 1 - t);
    const x = this.x;
    const y = this.y;
    const flame = this.colorOf(0); // 主焰色（第一种）——用于火团/光晕基调
    const hexA = (c, a) => (c || '#ff8030') + ''; // 简化：颜色直接 hex 填充（透明度走 globalAlpha/渐变 stop）
    const mixC = (c1, c2, k) => (c2 ? mix(c1, c2, k) : c1);
    ctx.save();
    // ---- 白热闪核（前 18% 最亮，快速熄灭） ----
    const flash = Math.max(0, 1 - t / 0.18);
    if (flash > 0.02) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.35);
      g.addColorStop(0, `rgba(255,255,252,${(flash * 0.95).toFixed(3)})`);
      g.addColorStop(0.35, `rgba(255,236,190,${(flash * 0.55).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R * 1.35, 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 火团：14 片火焰瓣拼成翻涌边缘（非正圆，慢速旋转、每瓣火舌抖动） ----
    const lobes = 14;
    const spin = t * 0.9 + (rnd[0] - 0.5) * 2;
    const wob = 1 + 0.05 * Math.sin(t * 9 + rnd[1] * 6);
    ctx.beginPath();
    for (let i = 0; i < lobes; i++) {
      const ang = spin + (i / lobes) * Math.PI * 2;
      const rr = R * (0.6 + rnd[2 + i] * 0.34) * wob
        * (0.72 + 0.28 * Math.sin(t * 12 + rnd[2 + i] * 9));
      const px = x + Math.cos(ang) * rr * 0.92;
      const py = y + Math.sin(ang) * rr * 0.8;
      ctx.moveTo(px + R * 0.3, py);
      ctx.arc(px, py, R * 0.3, 0, Math.PI * 2);
    }
    const fireG = ctx.createRadialGradient(x, y, 0, x, y, R);
    fireG.addColorStop(0, `rgba(255,246,225,${(alpha * 0.95).toFixed(3)})`);
    // 火团中层/外层掺主焰色（光晕级染色——整体焰色更明显）
    fireG.addColorStop(0.45, mixC('#ffb450', flame, 0.4) + '');
    fireG.addColorStop(0.8, mixC('#ff6920', flame, 0.35) + '');
    fireG.addColorStop(1, 'rgba(180,60,20,0)');
    ctx.fillStyle = fireG;
    ctx.globalAlpha = Math.max(0.2, alpha);
    ctx.shadowColor = mixC('#ff8232', flame, 0.55); // 火团辉光（光晕）带焰色
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    // ---- 二级甩出火团（2 个小火团随 t 向外甩开淡出——"碎火"；颜色轮流用焰色集） ----
    if (t < 0.5) {
      for (let i = 0; i < 2; i++) {
        const ang = rnd[33 + i] * Math.PI * 2 + t * 1.8;
        const d = R * (0.7 + t * 1.2 + i * 0.25);
        const fr = R * (0.22 - t * 0.22) * (1 + rnd[35 + i] * 0.5);
        const fc = this.colorOf(i);
        const fg = ctx.createRadialGradient(x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.85, 0,
          x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.85, Math.max(1, fr));
        fg.addColorStop(0, mixC('#ffd278', fc, 0.45) + '');
        fg.addColorStop(0.6, mixC('#ff7828', fc, 0.4) + '');
        fg.addColorStop(1, 'rgba(255,90,30,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.85, Math.max(1, fr), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // ---- 撕裂冲击环：快白内环 + 慢橙外环（带缺口、旋转、收细）；辉光带焰色 ----
    ctx.lineCap = 'round';
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(255,240,215,0.9)';
    ctx.lineWidth = (1 - t) * 3.2 + 0.7;
    ctx.shadowColor = mixC('#ff9640', flame, 0.5); // 冲击环辉光带焰色
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, R * (0.45 + 0.75 * ease), 0, Math.PI * 2);
    ctx.stroke();
    const gapA = rnd[14] * Math.PI * 2 + t * 1.4;
    const gapB = gapA + 0.6 + rnd[15] * 0.9;
    ctx.strokeStyle = mixC('#ff9646', this.colorOf(1), 0.3); // 外环掺第二种焰色
    ctx.lineWidth = (1 - t) * 4.5 + 0.9;
    ctx.beginPath();
    ctx.arc(x, y, R * (0.75 + 1.05 * ease), gapB, gapA + Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // ---- 径向光纹（前 35%"刀光"） ----
    if (t < 0.35) {
      const streakA = alpha * (1 - t / 0.35);
      ctx.strokeStyle = `rgba(255,210,150,${(streakA * 0.85).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 7; i++) {
        const ang = rnd[16 + i] * Math.PI * 2 + t * 0.6;
        const d0 = R * (0.62 + rnd[24 + i] * 0.2);
        const d1 = d0 + R * (0.3 + rnd[31 + i] * 0.35);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * d0, y + Math.sin(ang) * d0 * 0.9);
        ctx.lineTo(x + Math.cos(ang) * d1, y + Math.sin(ang) * d1 * 0.9);
        ctx.stroke();
      }
    }
    // ---- 拖尾火星（带下坠感；每隔一颗按焰色染色——多种焰色轮流：Na 黄/K 紫/Cu 蓝绿…） ----
    ctx.globalAlpha = 1;
    const n = 15;
    for (let i = 0; i < n; i++) {
      const ang = rnd[16 + i % 8] * Math.PI * 2 + t * 0.8;
      const fall = t * t * R * 1.35;
      const d0 = R * (0.3 + t * 0.9);
      const d1 = R * (0.4 + t * 1.35);
      const x0 = x + Math.cos(ang) * d0;
      const y0 = y + Math.sin(ang) * d0 * 0.88 + fall * 0.4;
      const x1 = x + Math.cos(ang) * d1;
      const y1 = y + Math.sin(ang) * d1 * 0.88 + fall;
      const a = Math.max(0, alpha * (1 - t * 0.8));
      const fc = i % 2 === 0 ? this.colorOf(i) : null; // 1/2 火星带焰色（轮流）
      ctx.globalAlpha = a;
      if (fc) ctx.strokeStyle = fc;
      else ctx.strokeStyle = i % 2 ? 'rgba(255,220,160,1)' : 'rgba(255,120,40,1)';
      ctx.lineWidth = 2.3 - t * 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // 火星头（亮点）
      ctx.fillStyle = fc ?? (i % 2 ? '#fff3d8' : '#ff8c3d');
      ctx.beginPath();
      ctx.arc(x1, y1, Math.max(0.8, 2.6 - t * 2), 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 碎片（小方块旋转飞出，前 45%；交替焰色/橙色） ----
    if (t < 0.45) {
      for (let i = 0; i < 3; i++) {
        const ang = rnd[37 + i] * Math.PI * 2 + t * 1.2 * (i % 2 ? 1 : -1);
        const d = R * (0.55 + t * 1.4 + i * 0.2);
        const sx = x + Math.cos(ang) * d;
        const sy = y + Math.sin(ang) * d * 0.85 + t * t * R * 0.5;
        const s = (4 - t * 5) * (0.7 + rnd[i] * 0.6);
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = this.colorOf(i) ?? '#ff9a4d';
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang * 2 + t * 6);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
    }
    // ---- 焰色残余辉光（火团消退后，各焰色一层薄光慢慢散开——焰色反应的"余韵"） ----
    if (this.flames.length && t > 0.22) {
      const fa = alpha * 0.3 * Math.min(1, (t - 0.22) / 0.18);
      for (let i = 0; i < this.flames.length; i++) {
        ctx.globalAlpha = fa / (1 + i * 0.6);
        ctx.fillStyle = this.flames[i];
        ctx.beginPath();
        ctx.arc(x, y, R * (0.5 + t * (0.9 + i * 0.25)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // ---- 烟尘：深灰蓝团上升 + 余烬小亮点 ----
    for (let i = 0; i < 5; i++) {
      const px = x + Math.sin(rnd[5 + i] * 9 + t * 1.5) * R * (0.5 + rnd[10 + i] * 0.4);
      const py = y - (4 + i * 8) * (0.4 + t * 1.2);
      ctx.globalAlpha = alpha * 0.3 * (1 - t * 0.55);
      ctx.fillStyle = '#54596b';
      ctx.beginPath();
      ctx.arc(px, py, 2.6 + t * 8.5 + rnd[i] * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 2; i++) {
      const ex = x + Math.sin(rnd[20 + i] * 20 + t * 4) * R * 0.8;
      const ey = y - 8 + t * t * R * 1.1;
      ctx.globalAlpha = alpha * (0.6 + 0.4 * Math.sin(t * 30 + i * 7));
      ctx.fillStyle = this.colorOf(i) ?? '#ffcf7a'; // 余烬也带焰色（轮流）
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(0.6, 1.8 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 爆炸原因文本（调试）：炸点上方弹出，逐帧上浮淡出 ----
    if (this.cause && this.age < 0.32) {
      ctx.globalAlpha = Math.min(1, (0.32 - this.age) * 4);
      ctx.font = 'bold 12px "Segoe UI", "Microsoft YaHei", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,14,26,0.72)';
      const ty = y - R * 0.9 - 10;
      const tw = ctx.measureText(this.cause).width;
      ctx.beginPath();
      ctx.roundRect(x - tw / 2 - 6, ty - 14, tw + 12, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(this.cause, x, ty - 1);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }
}

exports.Explosion = Explosion;

  };
  __modules["src/objects/reactionlabel.js"] = function (module, exports, __require) {
// ============================================================================
// 反应标签（调试模式）：在反应发生的位置飘出"反应式"，缓慢上浮后淡出。
// 调试模式下 scene.onReaction 在反应点生成。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;

class ReactionLabel extends Obj {
  constructor({ x, y, text, color = '#9fd8ff' }) {
    super({ x, y, w: 0, h: 0, solid: false, physicsKind: 'none' });
    this.text = text;
    this.color = color;
    this.age = 0;
    this.life = 1.8; // 秒
  }

  update(dt, scene) {
    this.age += dt;
    this.y -= 20 * dt; // 缓慢上浮
    if (this.age >= this.life) scene.removeObject(this);
  }

  render(ctx, scene) {
    const a = Math.max(0, 1 - this.age / this.life);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 11px "Segoe UI", "Microsoft YaHei", monospace';
    const w = ctx.measureText(this.text).width;
    // 深色圆角底（保证在任意背景可读）
    ctx.fillStyle = 'rgba(6,14,28,0.72)';
    ctx.beginPath();
    ctx.roundRect(this.x - w / 2 - 5, this.y - 11, w + 10, 17, 4);
    ctx.fill();
    // 反应式文本
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, this.x, this.y - 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

exports.ReactionLabel = ReactionLabel;

  };
  __modules["src/objects/container.js"] = function (module, exports, __require) {
// ============================================================================
// 容器基类：持有溶液 + 沉淀粒子，化学引擎以 SolutionMaterial 与之交互。
// 容器本体不是实心（液体可穿入），其几何（池的盆壁/盆底、烧杯壁）由子类提供。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { Solution, SolutionMaterial, MIN_ENTRY } = __require('src/chem/solution.js');;
const { ContainerMaterial } = __require('src/objects/material.js');;
const { renderFormula } = __require('src/render/label.js');;
const { getSubstance, acidLabelOf } = __require('src/chem/substances.js');;
const { renderPrecipitateBall, splitPile, particleSizeOf } = __require('src/objects/particle.js');;

const GRAIN_MAX = 140; // 容器内沉淀的视觉颗粒上限（超出按 1.5g 合并，与自由粒子同规则）

class Container extends Obj {
  constructor({ x, y, w, h, volume, solutes, water, ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.solution = new Solution({ volume: volume ?? 100, solutes: solutes ?? {}, water: water ?? volume ?? 100 });
    // 微溶物质超过饱和浓度 → 析出为容器沉淀（"滴到一定量后溶液变浑浊"）
    this.solution.onOversaturate = (id, excess) => {
      this.addPrecipitate(id, excess, null, { kind: 'saturate', text: '过饱和析出' });
    };
    this.solutionMat = new SolutionMaterial(this.solution, this);
    this.mat = new ContainerMaterial(this); // 溶液 + 沉淀的完整材料（沉淀可参与反应）
    this.precipitates = new Map(); // substanceId → g（沉淀/内含物，化学真相）
    this.precipOrigins = new Map(); // substanceId → origin（调试悬停显示每类沉淀的来源）
    this.solOrigins = new Map(); // 溶质 substanceId → origin（调试悬停显示每类溶质的来源）
    // 关卡预设的初始溶质 = 关卡生成（反应产物/溶解物在加入时覆盖为对应来源）
    for (const [id] of this.solution.solutes) this.solOrigins.set(id, { kind: 'level' });
    this.grains = []; // 视觉颗粒（世界坐标；反应点生成 + 物理堆叠）
    this.useGrains = true; // 池/烧杯用颗粒；酒精灯等用自定义渲染（见 lamp）
    this.clipGrains = true; // 是否按 grainRegion 裁剪渲染（酒精灯关掉，让颗粒自然堆成小山）
    this.formulaVisible = true; // 是否显示化学式
    this.spillSides = false; // 灯等开放平台：颗粒可滚出左右边缘（堆不下从两侧滚落）
  }

  get hoverLabel() {
    return '容器';
  }

  /** 显示容器当前内容（溶液溶质 + 沉淀；纯水显示 H2O），供子类 render 调用 */
  renderContentsLabel(ctx) {
    if (this.formulaVisible === false) return;
    const parts = [];
    for (const [id, mass] of this.solution.solutes) {
      if (mass >= MIN_ENTRY) {
        // 酸类标注浓/稀（阈值：≥300 g/L = 浓，与引擎"浓酸"判定一致——MnO2+浓盐酸制氯气等）
        const c = acidLabelOf(id, mass, this.solution.volume / 1000);
        parts.push(c ? `${id}(${c})` : id); // 微量溶质不显示化学式（防"出现/消失"闪烁）
      }
    }
    for (const [id] of this.precipitates) parts.push(`${id}(↓)`);
    if (parts.length === 0 && this.solution.water > 0) parts.push('H2O'); // 只有水的池子
    // 含指示剂时显示 pH 数值（石蕊/酚酞加入后即可读数）
    if (this.solution && this.solution.pH) {
      let hasIndicator = false;
      for (const [id] of this.solution.solutes) {
        if (getSubstance(id).indicator) {
          hasIndicator = true;
          break;
        }
      }
      if (hasIndicator) parts.push(`pH=${this.solution.pH().toFixed(1)}`);
    }
    if (parts.length) renderFormula(ctx, this.x + this.w / 2, this.y + this.h + 14, parts.join(' + '));
  }

  get material() {
    return this.mat;
  }

  get containerMaterial() {
    return this.mat;
  }

  /** 颗粒的沉降区域（世界坐标）；池/烧杯=内区，酒精灯=火焰附近 */
  grainRegion() {
    return this.innerRect();
  }

  /**
   * 增加沉淀（g）。point 为反应/放置位置（世界坐标）+ 生成宽幅；
   * 之后把颗粒数对账到与质量一致（避免逐次舍入导致收集后残留）。
   */
  addPrecipitate(id, mass, point, origin = null) {
    this.precipitates.set(id, (this.precipitates.get(id) ?? 0) + mass);
    // 记录该沉淀的生成来源（反应/放置/关卡预设），供调试悬停显示；未指明时保留已有来源或默认关卡生成
    if (origin) this.precipOrigins.set(id, origin);
    else if (!this.precipOrigins.has(id)) this.precipOrigins.set(id, { kind: 'level' });
    if (this.useGrains && mass > 0) this._syncGrains(id, point);
  }

  /** 记录溶质来源（反应/溶解/关卡预设），供调试悬停显示；未指明时保留已有来源或默认关卡生成 */
  noteSolOrigin(id, origin = null) {
    if (typeof origin === 'string' && origin) origin = { kind: 'reaction', text: origin }; // 引擎传回的方程式字符串归一化
    if (!origin) {
      if (!this.solOrigins.has(id)) this.solOrigins.set(id, { kind: 'level' });
      return;
    }
    this.solOrigins.set(id, origin);
  }

  takePrecipitate(id, mass) {
    const cur = this.precipitates.get(id) ?? 0;
    const r = Math.min(cur, mass);
    const n = cur - r;
    if (n <= 1e-9) {
      this.precipitates.delete(id);
      this.precipOrigins.delete(id); // 沉淀耗尽，来源一并清除
    } else this.precipitates.set(id, n);
    if (this.useGrains) this._syncGrains(id); // 移除多余颗粒
    return r;
  }

  /** 把某物质的视觉颗粒对账到"合并颗粒数"（与自由粒子同规则：
   *  常规 0.5g/颗，超出 GRAIN_MAX 按 1.5g（3×0.5g）合并——外观与自由粒子完全一致） */
  _syncGrains(id, point) {
    const mass = this.precipitates.get(id) ?? 0;
    let target = 0;
    let size = 5;
    if (mass > 1e-9) {
      const s = splitPile(mass, GRAIN_MAX); // { n, per }
      target = s.n;
      size = particleSizeOf(s.per); // 尺寸与自由粒子同公式（0.5g→5px；1.5g→7.5px）
    }
    let count = 0;
    for (const g of this.grains) if (g.id === id) count++;
    // 移除多余（从数组尾部删，即最近生成的）
    if (count > target) {
      let rm = count - target;
      for (let i = this.grains.length - 1; i >= 0 && rm > 0; i--) {
        if (this.grains[i].id === id) {
          this.grains.splice(i, 1);
          rm--;
        }
      }
      return;
    }
    // 补不足：从反应点生成；无反应点（预置沉淀）在区域内散落，让物理自然堆成小山
    const rg = this.grainRegion();
    const bx = point ? point.x : rg.x + rg.w / 2;
    // 生成 y 限制在沉降区域内（反应点常取玩家脚底，可能在池底线之下，直接钳回区内避免被裁剪）
    const spawnY = point
      ? Math.max(rg.y + 2, Math.min(point.y, rg.y + rg.h - 4))
      : rg.y + Math.random() * rg.h * 0.5; // 预置沉淀：区域上部散落，落下堆成小山
    const spread = point && point.spread ? point.spread : 16;
    const add = target - count;
    // 宽幅（玩家）时偏向两侧生成：从玩家左右两边冒出，不在中心、也不落在身体里
    // （spread=玩家宽，半宽=0.5×spread，所以偏移要 >0.5×spread 才在身体外）
    const edgeBias = spread > 40;
    for (let i = 0; i < add; i++) {
      // 无反应点（预置）：每颗在区域内随机 x，避免全部挤在同一点
      const sx0 = point
        ? (edgeBias
          ? bx + (Math.random() < 0.5 ? -1 : 1) * (spread * 0.55 + Math.random() * spread * 0.3)
          : bx + (Math.random() - 0.5) * spread)
        : rg.x + Math.random() * rg.w;
      // 生成 x 也钳回区域内（反应点靠池壁时避免生成帧即越界）
      const sx = Math.max(rg.x + 3, Math.min(rg.x + rg.w - 3, sx0));
      this.grains.push({
        id,
        x: sx,
        y: spawnY + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 20,
        vy: 2,
        rest: false,
        r: size / 2, // 与自由粒子同尺寸（视觉完全一致，无随机大小）
      });
    }
    if (this.grains.length > GRAIN_MAX) this.grains.splice(0, this.grains.length - GRAIN_MAX);
  }

  /** 内部液体区域（默认整个区域；子类可覆盖，如池扣除盆壁） */
  innerRect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  /** 物体是否在容器内 */
  containsObj(obj) {
    const r = this.innerRect();
    return obj.right > r.x && obj.left < r.x + r.w && obj.bottom > r.y && obj.top < r.y + r.h;
  }

  update(dt, scene) {
    // 颗粒 = 圆形沙粒的接触动力学（冲量 + 摩擦 + 少量位置修正）：
    //  重力全程作用；接触时速度冲量抵消法向（不反弹、不抖），摩擦阻尼切向（堆能立住）；
    //  位置修正只处理重叠的一小部分（≤5px/帧），不整量瞬移；
    //  睡眠颗粒是不可动锚点（invMass=0），新颗粒架在它们上面，堆自然往上长；
    //  支撑丢失（被挖开/下方被推走）→ 唤醒下落。
    if (!this.useGrains || this.grains.length === 0) return;
    const rg = this.grainRegion();
    const floorY = rg.y + rg.h - 3;
    const G = 900;
    const MAX_FALL = 320;
    const grains = this.grains;
    // 玩家碰撞形状（当作容器内的"墙"：堆的压力与玩家边界在同一求解器里平衡，
    // 颗粒停在玩家轮廓外，不会在脚边被堆顶回去来回振荡）。腐蚀空洞无形状 → 颗粒可进入。
    const p = scene.player;
    const pShapes = p && p.solid && p.w > 0
      && p.x + p.w + 24 > rg.x && p.x - 24 < rg.x + rg.w && p.y + p.h + 24 > rg.y && p.y - 24 < rg.y + rg.h
      ? (p.getShapes ? p.getShapes() : [p.collider()])
      : null;

    // 1) 重力（非睡眠）
    for (const g of grains) {
      if (g.rest) continue;
      g.vy += G * dt;
      if (g.vy > MAX_FALL) g.vy = MAX_FALL;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }

    // 2) 位置修正（多迭代，防重叠；睡眠=不可动锚点）+ 区域边界（硬）。
    //    每颗粒每帧总位移 ≤CAP（深嵌的弹出摊到多帧，不一次爆出去）
    const CAP = 8;
    const moved = new Float32Array(grains.length);
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < grains.length; i++) {
        if (moved[i] >= CAP) continue;
        const a = grains[i];
        for (let j = i + 1; j < grains.length; j++) {
          if (moved[j] >= CAP) continue;
          const b = grains[j];
          if (a.rest && b.rest) continue;
          const ia = a.rest ? 0 : 1;
          const ib = b.rest ? 0 : 1;
          const tot = ia + ib;
          if (tot === 0) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          const minD = a.r + b.r;
          if (d2 >= minD * minD || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          const corr = Math.min(minD - d, 5) / tot;
          let ax = -nx * corr * ia, ay = -ny * corr * ia;
          let bx = nx * corr * ib, by = ny * corr * ib;
          let ma = Math.hypot(ax, ay);
          if (moved[i] + ma > CAP && ma > 1e-9) { const k = (CAP - moved[i]) / ma; ax *= k; ay *= k; ma = Math.hypot(ax, ay); }
          let mb = Math.hypot(bx, by);
          if (moved[j] + mb > CAP && mb > 1e-9) { const k = (CAP - moved[j]) / mb; bx *= k; by *= k; mb = Math.hypot(bx, by); }
          a.x += ax; a.y += ay;
          b.x += bx; b.y += by;
          moved[i] += ma;
          moved[j] += mb;
        }
      }
      // 区域边界（硬）
      for (let gi = 0; gi < grains.length; gi++) {
        const g = grains[gi];
        // 开放平台（灯）：滚出平台左右边缘后不再贴"地板"，自由下落（由灯 update 移除）
        const onPlatform = !this.spillSides || (g.x + g.r > rg.x && g.x - g.r < rg.x + rg.w);
        if (g.y + g.r > floorY && onPlatform) { g.y = floorY - g.r; if (g.vy > 0) g.vy = 0; }
        if (g.y - g.r < rg.y) { g.y = rg.y + g.r; if (g.vy < 0) g.vy = 0; }
        if (!this.spillSides) {
          if (g.x - g.r < rg.x) { g.x = rg.x + g.r; if (g.vx < 0) g.vx *= -0.3; }
          else if (g.x + g.r > rg.x + rg.w) { g.x = rg.x + rg.w - g.r; if (g.vx > 0) g.vx *= -0.3; }
        }
        // 玩家形状当墙：把颗粒推出玩家身体（圆 vs AABB；与堆的压力在同一求解器平衡）
        if (pShapes) {
          for (const sh of pShapes) {
            const cx = Math.max(sh.x, Math.min(g.x, sh.x + sh.w));
            const cy = Math.max(sh.y, Math.min(g.y, sh.y + sh.h));
            const dx = g.x - cx, dy = g.y - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 >= g.r * g.r) continue;
            let px = 0, py = 0, pm;
            if (dx === 0 && dy === 0) {
              // 圆心在形状内：沿最近面推出；脚底贴容器底 → 向两侧挤开
              const dl = g.x - sh.x, dr = sh.x + sh.w - g.x;
              const dt2 = g.y - sh.y, db = sh.y + sh.h - g.y;
              const m = Math.min(dl, dr, dt2, db);
              if (m === db && g.y + g.r >= floorY - 1) {
                px = g.x < sh.x + sh.w / 2 ? -1 : 1;
                pm = Math.min(dl, dr) + g.r;
              } else if (m === dl) { px = -1; pm = m + g.r; }
              else if (m === dr) { px = 1; pm = m + g.r; }
              else if (m === dt2) { py = -1; pm = m + g.r; }
              else { py = 1; pm = m + g.r; }
            } else {
              const d = Math.sqrt(d2);
              px = dx / d; py = dy / d;
              pm = g.r - d;
            }
            const mv = Math.min(Math.max(0, pm), 5 - moved[gi]);
            if (mv > 0) { g.x += px * mv; g.y += py * mv; moved[gi] += mv; }
            g.rest = false;
            break;
          }
        }
      }
    }

    // 3) 速度冲量：法向抵消（恢复 0，不弹起）+ 切向摩擦（阻尼相对滑速，堆立得住）
    for (let i = 0; i < grains.length; i++) {
      const a = grains[i];
      for (let j = i + 1; j < grains.length; j++) {
        const b = grains[j];
        if (a.rest && b.rest) continue;
        const ia = a.rest ? 0 : 1;
        const ib = b.rest ? 0 : 1;
        const tot = ia + ib;
        if (tot === 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minD = a.r + b.r;
        if (d2 >= minD * minD || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          const j = -rvn / tot;
          a.vx -= nx * j * ia;
          a.vy -= ny * j * ia;
          b.vx += nx * j * ib;
          b.vy += ny * j * ib;
        }
        // 切向摩擦：去掉 60% 相对切向速度（上限防过冲）
        const tx = -ny, ty = nx;
        const rvt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
        const cap = 50 / tot;
        const jt = Math.max(-cap, Math.min(cap, rvt * 0.6 / tot));
        a.vx += tx * jt * ia;
        a.vy += ty * jt * ia;
        b.vx -= tx * jt * ib;
        b.vy -= ty * jt * ib;
      }
    }

    // 4) 摩擦 + 睡眠/唤醒
    const SLEEP_SPEED = 18;
    for (const g of grains) {
      // 开放平台（灯）堆满到区域顶：顶部颗粒向两侧溢出滚落（小堆不触发，只有堆满才溢）
      const spillTop = this.spillSides && g.y - g.r <= rg.y + 1.5;
      if (spillTop && !g.rest) {
        g.vx += (g.x < rg.x + rg.w / 2 ? -1 : 1) * 30;
        g.sleepT = 0;
      }
      const floorSupport = g.y + g.r >= floorY - 0.5;
      let supported = floorSupport;
      if (!supported) {
        const gB = g.y + g.r;
        for (const o of grains) {
          if (o === g || o.y <= g.y) continue;
          const oTop = o.y - o.r;
          if (gB >= oTop - 1 && gB <= oTop + 6 && Math.abs(o.x - g.x) < (g.r + o.r) * 0.7) {
            supported = true;
            break;
          }
        }
      }
      if (g.rest) {
        // 睡眠颗粒：失去支撑 → 唤醒，防悬浮
        if (!supported) { g.rest = false; g.vy = 0; }
        continue;
      }
      // 入睡：速度低 + 有支撑 + 持续片刻（睡眠=不可动锚点，供后续颗粒架住）。
      // 残留的浅重叠（1.5-3px）允许入睡，由下面第 5 步的睡眠松弛单调化解（不造成跳动）
      if (supported && !spillTop && Math.hypot(g.vx, g.vy) < SLEEP_SPEED) {
        g.sleepT = (g.sleepT ?? 0) + dt;
        if (g.sleepT > 0.2) { g.rest = true; g.vx = 0; g.vy = 0; }
      } else {
        g.sleepT = 0;
      }
      // 全局阻尼（空气/滚动）：水平强（堆积稳定），垂直弱（重力主导）
      g.vx *= Math.max(0, 1 - 4 * dt);
      g.vy *= Math.max(0, 1 - 1 * dt);
    }

    // 5) 睡眠松弛：已睡着的颗粒若仍有**深度**重叠（>2.5px），每帧只互推 ≤1px（单调收敛），
    //    化解深重叠但不造成跳动；浅接触（≤2.5px）保留，堆保持紧凑不散平。
    //    水平重叠：两边各推一半；垂直堆叠：只把上面的推上去（下面有支撑，不动，避免地板振荡）
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < grains.length; i++) {
        const a = grains[i];
        if (!a.rest) continue;
        for (let j = i + 1; j < grains.length; j++) {
          const b = grains[j];
          if (!b.rest) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const minD = a.r + b.r;
          const pen = minD - d;
          if (pen < 2.5 || d < 1e-6) continue;
          if (Math.abs(dy) >= Math.abs(dx)) {
            // 上下堆叠：把上面的颗粒往上推
            const upper = a.y < b.y ? a : b;
            upper.y -= Math.min(pen - 1, 1);
          } else {
            const push = Math.min(pen - 1, 1) * 0.5;
            const nx = dx / d;
            a.x -= nx * push;
            b.x += nx * push;
          }
        }
      }
    }
    // 松弛后钳回沉降区域（松弛可能把靠墙颗粒横向推出；开放平台允许滚出左右边缘）
    for (const g of grains) {
      if (!this.spillSides) g.x = Math.max(rg.x + g.r, Math.min(rg.x + rg.w - g.r, g.x));
      g.y = Math.max(rg.y + g.r, Math.min(floorY - g.r, g.y));
    }
  }

  /**
   * 物理结算后：玩家与颗粒的碰撞（圆 vs 玩家碰撞形状的 AABB）。
   *  - 推出**有单帧位移上限**（不整量瞬移出体）：颗粒被玩家平滑地推开，多帧内完全让开；
   *  - 圆心在形状内 → 沿最近面推出；圆心在形状外但边缘重叠 → 沿法线推出；
   *  - 完全腐蚀掉的部分（无形状）颗粒可以进入停留；
   *  - 被推的颗粒唤醒 + 温和踢开（顺着玩家速度 + 侧向，不猛烈上抛）；
   *  - 密集堆按穿透量给玩家阻力 → 明显减速/挡路，稀疏堆可轻松穿过。
   */
  lateUpdate(dt, scene) {
    if (!this.useGrains || this.grains.length === 0) return;
    const rg = this.grainRegion();
    const floorY = rg.y + rg.h - 3;
    const p = scene.player;
    if (!p || !p.solid || p.w <= 0) return;
    // 快速排除：玩家不在容器附近
    if (p.x + p.w + 24 < rg.x || p.x - 24 > rg.x + rg.w || p.y + p.h + 24 < rg.y || p.y - 24 > rg.y + rg.h) return;
    const shapes = p.getShapes ? p.getShapes() : [p.collider()];
    const moving = Math.abs(p.vel.x) > 20;
    let resist = 0;
    for (const g of this.grains) {
      let hit = false;
      let penMax = 0;
      for (const sh of shapes) {
        // 圆 vs AABB：最近点
        const cx = Math.max(sh.x, Math.min(g.x, sh.x + sh.w));
        const cy = Math.max(sh.y, Math.min(g.y, sh.y + sh.h));
        const dx = g.x - cx;
        const dy = g.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= g.r * g.r) continue; // 未接触
        const d = Math.sqrt(Math.max(d2, 1e-9));
        const pen = g.r - d;
        if (pen > penMax) penMax = Math.min(pen, 6);
        if (dx === 0 && dy === 0) {
          // 圆心在形状内：沿最近面推出
          const dl = g.x - sh.x, dr = sh.x + sh.w - g.x;
          const dt2 = g.y - sh.y, db = sh.y + sh.h - g.y;
          const m = Math.min(dl, dr, dt2, db);
          // 最近面是下底面且已贴容器底：向下会被地板挡回（玩家脚底伸进沉淀堆时）→ 向两侧挤开
          if (m === db && g.y + g.r >= floorY - 1) {
            const mv = Math.min(Math.min(dl, dr) + g.r, 8);
            g.x += (dl < dr ? -1 : 1) * mv;
          } else {
            const mv = Math.min(m + g.r, 8);
            if (m === dl) g.x -= mv;
            else if (m === dr) g.x += mv;
            else if (m === dt2) g.y -= mv;
            else g.y += mv;
          }
        } else {
          // 圆心在形状外但边缘重叠：沿法线推出
          const nx = dx / d, ny = dy / d;
          const mv = Math.min(pen, 8);
          g.x += nx * mv;
          g.y += ny * mv;
        }
        g.rest = false;
        // 温和踢开：顺着玩家速度 + 侧向，不猛烈上抛
        if (moving) {
          g.vx = p.vel.x * 0.25 + (g.x < sh.x + sh.w / 2 ? -30 : 30);
          g.vy = Math.min(g.vy, -12);
        } else {
          g.vx += g.x < sh.x + sh.w / 2 ? -18 : 18;
          g.vy = Math.min(g.vy, -4);
        }
        hit = true;
        break; // 一次处理一个形状（其余下帧继续）
      }
      if (hit) {
        // 限制在沉降区域内（开放平台不挡左右：允许滚出边缘由灯处理滚落）
        if (!this.spillSides) g.x = Math.max(rg.x + g.r, Math.min(rg.x + rg.w - g.r, g.x));
        g.y = Math.max(rg.y + g.r, Math.min(floorY - g.r, g.y));
      }
      // 阻力：与穿透量成正比 → 密集堆显著减速（挡路），稀疏/少量轻微（可进池）
      resist += penMax * 0.004;
    }
    if (resist > 0) p._grainResist = (p._grainResist ?? 0) + Math.min(0.9, resist);
  }

  /** 颗粒裁剪路径（默认矩形；酒精灯覆写为拱形小山） */
  grainClip(ctx, rg) {
    ctx.beginPath();
    ctx.rect(rg.x, rg.y, rg.w, rg.h);
  }

  /** 渲染视觉颗粒：与自由沉淀粒子同一绘制（辉光/高光/深色白色光晕），
   *  按 grainClip 裁剪（clipGrains=false 时不裁剪）——两套沉淀外观完全一致 */
  renderGrains(ctx) {
    if (!this.useGrains) return;
    const rg = this.grainRegion();
    ctx.save();
    if (this.clipGrains) {
      this.grainClip(ctx, rg);
      ctx.clip();
    }
    for (const g of this.grains) {
      const sub = getSubstance(g.id);
      const c = sub.solid && sub.solid.length ? sub.solid[0] : '#c9b46a';
      renderPrecipitateBall(ctx, g.x, g.y, g.r * 2, c);
    }
    ctx.restore();
  }
}

exports.Container = Container;

  };
  __modules["src/render/label.js"] = function (module, exports, __require) {
// ============================================================================
// 化学式/标签：暗底圆角 + 金色发光文字
// ============================================================================

const { THEME, rr } = __require('src/render/theme.js');;

function renderFormula(ctx, x, y, text, opts = {}) {
  const size = opts.size ?? 10;
  const color = opts.color ?? THEME.gold.text;
  ctx.save();
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'left';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(12,9,34,0.72)';
  rr(ctx, x - 3, y - size, w, size + 5, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,184,75,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 清晰小字：细暗描边保证可读，不发光
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,6,24,0.9)';
  ctx.strokeText(text, x + 2, y);
  ctx.fillText(text, x + 2, y);
  ctx.restore();
}

exports.renderFormula = renderFormula;

  };
  __modules["src/objects/portal.js"] = function (module, exports, __require) {
// ============================================================================
// 传送门：同色两个为一组。物体（玩家/物块/沉淀）走入一门即传送到另一门。
// 传送规则 = "每扇门各自的进入/走出"（非冷却，针对单门）：
//   - 对象记录 _portalLast（上次进过的门）
//   - 与某门重叠且 _portalLast !== 该门 → 刚走入该门 → 传送到同色对侧，_portalLast = 对侧
//   - 不与该门重叠但 _portalLast === 该门 → 已走出该门 → 清空
// 效果：没离开 A 不能再进 A（避免来回弹）；但站在 A 里仍可进入别的门 B（小房间里
//   玩家太大出不了 A 时，能靠另一扇门逃生）。落点避开其它门 → 密集摆放也不连环传。
// n次门：可设可用次数（整组共享预算），每用一次扣 1，用尽后整组消失（旧 once:true = 1 次）。
// 落点检查：目标门脚底对齐、水平居中；被实心体/其它门堵住时按 8px 细步进退开找空位，
// 全堵死则本次不传——避免把物体塞进墙里被碰撞系统甩飞（"拥挤空间瞬移"）。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { overlaps } = __require('src/physics/collision.js');;

const EMBED_TOL = 8; // 落点嵌入实心体多少 px 以内仍可落（物理一帧即可温柔推开）
function overlapsBox(box, o, m = EMBED_TOL) {
  // 只有穿透明显（>m px）才算"挡住"：传送门旁常有薄墙/柱，落点伸进去几 px 很常见，
  // 交给碰撞封顶解压（≤16px/帧）即可；落点整个埋进厚墙（大穿透）才判堵。
  return box.x + m < o.x + o.w && box.x + box.w - m > o.x && box.y + m < o.y + o.h && box.y + box.h - m > o.y;
}

/** 落点 (x,y)（obj 的左上角）是否被挡：
 *  - 静态实心（地板/灯/开关/提取器…）挡
 *  - 动态实心里：可推动的物块让玩家推开即可（不挡），沉淀粒子可落脚（不挡）
 *  - 其它传送门（目标门 pair 除外）挡：落到别的门里会立即连环传
 *  strict=true（优先模式）：动态体一律挡——传送落点与其他物体（含可推物块）
 *  重叠会在下一帧被碰撞系统反复推挤：玩家推物体过门后两者落点重叠 → 抖动 /
 *  被弹飞（物体被推回门内又触发传送、来回瞬移）。找不到严格空位时再放宽。 */
function spotBlocked(obj, x, y, scene, pair, strict = false) {
  const box = { x, y, w: obj.w, h: obj.h };
  for (const s of scene.statics) if (s.solid && overlapsBox(box, s)) return true;
  for (const d of scene.dynamics) {
    if (d === obj || !d.solid || d.amount !== undefined) continue;
    if (strict) {
      if (overlapsBox(box, d, 0)) return true;
    } else if (!d.pushable && overlapsBox(box, d)) {
      return true;
    }
  }
  for (const p of scene.portals) {
    if (p === pair) continue;
    if (overlapsBox(box, p, 0)) return true; // 严格：任何重叠都不落在别的门里
  }
  return false;
}

/** 在同色门找落点：基准 = 脚底对齐门底边、水平居中（站在门里，脚踩门底座，而非对心
 *  ——对心会把高物体探出门底、撞上地板导致乱找空位）。被堵则按 8px 细步进在门旁退开
 *  （薄墙/柱挡个 5~10px 也轻松滑过去），全堵死返回 null。
 *  先用 strict 模式找"与其他物体零重叠"的落点（防传送后重叠抖动/弹飞），
 *  找不到再放宽为"不挡实心体即可"（保证传送不被完全阻塞）。 */
function findFreeSpot(obj, pair, scene) {
  const spot = searchSpot(obj, pair, scene, true);
  if (spot) return spot;
  return searchSpot(obj, pair, scene, false);
}

function searchSpot(obj, pair, scene, strict) {
  const cx = pair.x + pair.w / 2 - obj.w / 2;
  const cy = pair.y + pair.h - obj.h;
  // 螺旋候选：按距离门心由近到远，同一步长左右各试一次（否则会在窄通道里滑向一侧的远端）
  for (let dy = 0; dy <= Math.max(80, obj.h); dy += 20) {
    const y = Math.round(cy - dy);
    for (let dx = 0; dx <= obj.w + 16; dx += 8) {
      const xr = Math.round(cx + dx);
      if (!spotBlocked(obj, xr, y, scene, pair, strict)) return { x: xr, y };
      if (dx !== 0) {
        const xl = Math.round(cx - dx);
        if (!spotBlocked(obj, xl, y, scene, pair, strict)) return { x: xl, y };
      }
    }
  }
  return null;
}

class Portal extends Obj {
  constructor({ x, y, w = 40, h = 64, color = '#c78bff', once = false, uses = Infinity, switchId = null, ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.color = color; // 组标识：同色两个为一组
    // n次门：可设可用次数（整组共享，任一扇配置的有限次数为整组预算），用尽整组消失；
    // once:true（旧数据）= 1 次
    this.uses = once ? 1 : uses;
    this.usesLeft = Number.isFinite(this.uses) ? this.uses : Infinity;
    this.switchId = switchId; // 绑定开关 id：开关有效开启时才可传送（null = 常开）
    this.pair = null; // 对侧门（惰性解析）
  }

  get hoverLabel() {
    if (this.switchId) return Number.isFinite(this.usesLeft) ? `传送门（需开关·可用${this.usesLeft}次）` : '传送门（需开关）';
    if (Number.isFinite(this.usesLeft)) return `传送门（可用${this.usesLeft}次）`;
    return '传送门';
  }

  /** 是否可传送：绑定开关时要求开关有效开启（支持"&"联锁）；开关不存在视为关闭 */
  _isActive(scene) {
    if (!this.switchId) return true;
    const sw = scene.byId[this.switchId];
    if (!sw) return false;
    return typeof sw.effectiveOpen === 'function' ? sw.effectiveOpen(scene) : sw.open;
  }

  /** 解析对侧门：scene.portals 中同色且非自身的另一扇（对侧被移除时重新解析） */
  _resolvePair(scene) {
    if (this.pair && scene.portals.includes(this.pair)) return this.pair;
    this.pair = null;
    for (const o of scene.portals) {
      if (o !== this && o.color === this.color) {
        this.pair = o;
        break;
      }
    }
    return this.pair;
  }

  update(dt, scene) {
    const pair = this._resolvePair(scene);
    if (!pair) return;
    const active = this._isActive(scene); // 绑定开关时只有开关开启才传送
    // 候选：动态体（玩家/物块）+ 自由沉淀粒子
    for (const obj of [...scene.dynamics, ...scene.particles]) {
      if (obj === this || obj.static) continue;
      const inside = overlaps(this, obj);
      if (inside && active && obj._portalLast !== this) {
        // 刚走入本门：传送到同色对侧门（落点避开实心体/其它门）。找不到空位说明对侧
        // 被完全堵死 → 本次不传，避免塞进墙里被碰撞系统甩飞。
        const spot = findFreeSpot(obj, pair, scene);
        if (!spot) continue;
        obj.x = spot.x;
        obj.y = spot.y;
        obj._portalLast = pair; // 站在对侧门内：本门不重复触发；离开本门后才能再进本门
        // n次门：整组共享剩余次数，用尽后整组消失（任一扇配置的有限次数 = 整组预算）
        const lThis = Number.isFinite(this.usesLeft) ? this.usesLeft : Infinity;
        const lPair = pair && Number.isFinite(pair.usesLeft) ? pair.usesLeft : Infinity;
        const left = Math.min(lThis, lPair);
        if (left !== Infinity) {
          const newLeft = left - 1;
          if (newLeft <= 0) {
            scene.removeObject(this);
            if (pair) scene.removeObject(pair);
          } else {
            this.usesLeft = newLeft;
            if (pair) pair.usesLeft = newLeft;
          }
        }
      } else if (!inside && obj._portalLast === this) {
        // 已走出本门：允许下次再进本门
        obj._portalLast = null;
      }
    }
  }

  render(ctx, opts) {
    // 渲染器传的是 opts（{ scene, time, ... }），必须先解出 scene 再访问 scene.byId
    const scene = opts?.scene ?? null;
    const t = scene?.time ?? 0;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const active = this._isActive(scene); // 绑定开关未开 → 熄灭
    const col = active ? this.color : '#4a4f70';
    const blur = active ? 14 : 0;
    ctx.save();
    // 外框（同色发光；未激活时熄灭）
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.shadowColor = active ? this.color : 'transparent';
    ctx.shadowBlur = blur;
    this._arch(ctx, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 内部漩涡（径向渐变 + 旋转符文粒子）
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, this.w * 0.55);
    g.addColorStop(0, active ? '#f2e6ff' : '#5a5f74');
    g.addColorStop(0.45, col);
    g.addColorStop(1, active ? 'rgba(90,42,154,0)' : 'rgba(60,60,80,0)');
    ctx.save();
    this._arch(ctx, 3);
    ctx.clip();
    ctx.fillStyle = g;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = t * 1.6 + (i / n) * Math.PI * 2;
      const rr = 4 + ((i * 37) % (this.w / 2));
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.8;
      ctx.fillStyle = 'rgba(242,230,255,0.85)';
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 顶部小标记（组色圆点）；一次性门再画个 ×（用后消失）
    ctx.fillStyle = col;
    ctx.shadowColor = active ? this.color : 'transparent';
    ctx.shadowBlur = active ? 8 : 0;
    ctx.beginPath();
    ctx.arc(cx, this.y - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    // n次门：顶部显示剩余次数（无限次数不显示）——大号数字 + 深色底板（任何背景下可读）
    if (Number.isFinite(this.usesLeft)) {
      ctx.shadowBlur = 0;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      const txt = String(this.usesLeft);
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(16,20,40,0.78)';
      ctx.beginPath();
      ctx.roundRect(cx - tw / 2 - 5, this.y - 31, tw + 10, 21, 6);
      ctx.fill();
      ctx.fillStyle = active ? '#ffffff' : '#9fb2c8';
      ctx.fillText(txt, cx, this.y - 16);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /** 拱形门路径 */
  _arch(ctx, inset) {
    const x = this.x + inset;
    const y = this.y + inset;
    const w = this.w - inset * 2;
    const h = this.h - inset * 2;
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }
}

exports.Portal = Portal;

  };
  __modules["src/objects/rope.js"] = function (module, exports, __require) {
// ============================================================================
// 绳子：细线，悬挂一个物体。锚点可为固定坐标或跟随某物体（相对坐标）。
// 悬挂物体的位置完全由绳子决定（lateUpdate：物理结算后再定位，避免被推走）。
// 每刻检查：锚点物体不存在，或悬挂物体目标位置被实心体卡住 → 断绳。
// 断绳后绳子消失，悬挂物体恢复重力。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { overlaps } = __require('src/physics/collision.js');;
const { THEME } = __require('src/render/theme.js');;

class Rope extends Obj {
  constructor({ x = 0, y = 0, length = 100, anchor, hanging, ...rest } = {}) {
    super({ x, y, w: 2, h: length, solid: false, physicsKind: 'none', ...rest });
    this.length = length;
    this.anchor = anchor; // {fixed:{x,y}} | {obj, dx?, dy?}
    this.hanging = hanging; // 悬挂物体（Obj）
    this.broken = false;
    // 悬挂期间物体不受重力，位置由绳子决定
    if (hanging) {
      hanging.gravity = 0;
      // 初始把悬挂物放到锚点+长度处，避免构造时的初始偏移被误判为"被推动"
      const a = this.anchorPoint();
      hanging.x = a.x - hanging.w / 2;
      hanging.y = a.y + length - hanging.h;
    }
  }

  anchorPoint() {
    if (this.anchor.fixed) return { x: this.anchor.fixed.x, y: this.anchor.fixed.y };
    const o = this.anchor.obj;
    return { x: o.x + (this.anchor.dx ?? 0), y: o.y + (this.anchor.dy ?? 0) };
  }

  lateUpdate(dt, scene) {
    if (this.broken || !this.hanging) return;
    // 锚点物体消失 → 断绳
    if (this.anchor.obj && !scene.byId[this.anchor.obj.id]) {
      this.break(scene);
      return;
    }
    // 悬挂物体被删除（如开关 deleteId 移除了它）→ 断绳
    if (!scene.byId[this.hanging.id]) {
      this.break(scene);
      return;
    }
    let a = this.anchorPoint();
    // 区分"推的是锚点"还是"推的是悬挂物"：
    //  - 锚点本 tick 移动（玩家推锚点）→ 悬挂物跟随即可，不平移锚点
    //  - 锚点没动但悬挂物被推离期望 → 平移锚点（绳子刚性，整个系统一起动）
    const anchorDx = a.x - (this._prevAnchorX ?? a.x);
    const tx = a.x - this.hanging.w / 2;
    const dx = this.hanging.x - tx;
    if (!(Math.abs(anchorDx) > 0.5) && this.anchor.obj && Math.abs(dx) > 0.5) {
      this.anchor.obj.x += dx;
      a.x += dx;
    }
    this._prevAnchorX = a.x;
    this.x = a.x;
    this.y = a.y;
    const nx = a.x - this.hanging.w / 2;
    const ny = a.y + this.length - this.hanging.h;
    this.hanging.x = nx;
    this.hanging.y = ny;
    this.hanging.vel = { x: 0, y: 0 };
    // 目标位置被实心体卡住 → 断绳
    for (const s of scene.statics) {
      if (overlaps(this.hanging, s)) {
        this.break(scene);
        return;
      }
    }
  }

  break(scene) {
    this.broken = true;
    if (this.hanging) this.hanging.gravity = 1;
    scene.removeObject(this);
  }

  render(ctx) {
    ctx.save();
    ctx.strokeStyle = THEME.gold.base;
    ctx.lineWidth = 2;
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = 5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x, this.y + this.length);
    ctx.stroke();
    ctx.setLineDash([]);
    // 顶端小锚环
    ctx.strokeStyle = THEME.gold.light;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

exports.Rope = Rope;

  };
  __modules["src/level/click.js"] = function (module, exports, __require) {
// ============================================================================
// 场景点击管线（编辑器试玩 / 导出关卡 / Multiscene 共用同一套）：
//  - 点击：右上「提示」按钮、右下物品栏选格（HUD）；
//  - 按下（mousedown）：场景内可点击物体（onTap，如滴管）——滴管在玩家附近时
//    进入"点击/长按/拖动"候选：移动>dragStartPx = 拖动改变位置；
//    按住 dripArmDelay(0.22s，留出拖动窗口) = 长按持续滴；快速抬起 = 单击滴一滴。
//    **长按已开滴后再拖出 dragAbortPx → 停滴转拖动**（修"长按与拖动冲突"：
//    原来 0.08s 就开滴，鼠标一动之前已经在滴水，几乎无法拖动——用户反馈）；
//    其它可点击物体 = 立即触发 + 长按（与旧行为一致）；
//  - 抬起（mouseup）：清除按住/拖动标记。
// ============================================================================

const { CFG } = __require('src/core/config.js');;
const { toggleFullscreen, fullscreenSupported, isFullscreen } = __require('src/core/fullscreen.js');;

/** 屏幕坐标 → 世界坐标（与 Renderer.frame 同口径：跟随玩家/聚焦内容；鸟瞰时走鸟瞰视图） */
function screenToWorld(scene, canvas, sx, sy) {
  const c = scene.camera;
  if (!c) return { x: sx, y: sy };
  const { scale, offsetX, offsetY } = c.compute(canvas.width, canvas.height, scene.player ?? scene.cameraFocus ?? null);
  return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
}

/**
 * 顶部 HUD 起始 y（画布坐标）——左上卡片与顶栏按钮（⛶/鸟瞰/提示）共用，
 * 渲染与命中必须同源。触屏端整体下移：
 *  - 常规：让开左上角"返回选关"悬浮钮（report.js 注入，位于 10,10）；
 *  - 全屏：再让开 iOS 系统全屏关闭按钮（也挂在左上角）——report.js 的返回钮
 *    在全屏时同步下移到 52，这里留到 92。
 * 桌面（fine pointer）维持 10：关卡画布居中显示，左上角是页面留白。
 */
function hudTopOffset(scene) {
  const t = scene && scene._touchUI;
  if (t && typeof t.enabled === 'function' && t.enabled()) {
    const base = (t.insets && t.insets.top) || 0;
    return Math.max(isFullscreen() ? CFG.touch.hudTopFs : CFG.touch.hudTop, base + 10);
  }
  return 10;
}

// ---- 顶部按钮几何（HUD 渲染与点击命中共用；top 缺省 10 = 桌面） --------------

/** 鸟瞰按钮（提示按钮左侧；双端显示）：返回 {x,y,w,h} */
function overviewButtonRect(W, top = 10) {
  return { x: W - 142, y: top, w: 62, h: 28 };
}

/** 全屏按钮（仅触屏端显示，图标 ⛶）：在鸟瞰按钮左侧 */
function fullscreenButtonRect(W, top = 10) {
  return { x: W - 196, y: top, w: 44, h: 28 };
}

function inRect(r, sx, sy) {
  return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
}

/** 场景通知横幅（HUD 顶部中偏下淡入淡出 ~1.6s）：超距提示、吸取失败原因等 */
function pushNotice(scene, text) {
  if (!scene) return;
  scene._notice = { text, t: scene.time ?? 0 };
}

/** 物品栏槽位几何（HUD 渲染与点击命中**共用这一套数字**，保证点哪是哪）：
 *  普通格 CFG.inventory.slotPx，装物品的格子放大为 itemSlotPx；底边对齐、右缘贴边。
 *  margins：触屏设备传 {bottom, right}（含安全区），桌面默认 10。 */
function inventorySlotRects(W, H, slots, margins = { bottom: 10, right: 10 }) {
  const gap = 4;
  const margin = 10;
  const n = slots.length;
  const rects = new Array(n);
  let right = W - (margins.right ?? 10);
  for (let i = n - 1; i >= 0; i--) {
    const size = slots[i] && slots[i].item ? CFG.inventory.itemSlotPx : CFG.inventory.slotPx;
    right -= size;
    rects[i] = { x: right, y: H - (margins.bottom ?? 10) - size, size };
    right -= gap;
  }
  return rects;
}

/** 触屏设备上的物品栏边距（安全区 + 固定边距）；桌面=默认值。
 *  HUD 渲染 / touch 命中 / 物品栏点击共用，保证"点哪是哪"。 */
function uiMargins(scene) {
  const t = scene && scene._touchUI;
  if (t && t.enabled()) {
    const i = t.insets;
    return { bottom: (i.bottom ?? 0) + 10, right: (i.right ?? 0) + 10 };
  }
  return { bottom: 10, right: 10 };
}

/** 命中可点击物体（onTap；bbox ±pad 宽容——滴管等细长物体好点中；
 *   desktop 默认 6，触屏手指传 14（由 touchui 管线传入）） */
function hitTap(scene, canvas, sx, sy, pad = 6) {
  const w = screenToWorld(scene, canvas, sx, sy);
  for (let i = scene.objects.length - 1; i >= 0; i--) {
    const o = scene.objects[i];
    if (typeof o.onTap !== 'function') continue;
    if (w.x >= o.x - pad && w.x <= o.x + o.w + pad && w.y >= o.y - pad && w.y <= o.y + o.h + pad) {
      return { obj: o, world: w };
    }
  }
  return null;
}

/** 中心距离 */
function dist(a, b) {
  return Math.hypot(
    (a.x + (a.w ?? 0) / 2) - (b.x + (b.w ?? 0) / 2),
    (a.y + (a.h ?? 0) / 2) - (b.y + (b.h ?? 0) / 2),
  );
}

/**
 * 处理一次"点击"（提示按钮 / 物品栏选格 / 鸟瞰与全屏按钮）。
 * hud 可为空。返回 true = 已消费。onInfo（可选）诊断回调。
 */
function handleSceneClick(scene, hud, canvas, sx, sy, onInfo = null) {
  if (!scene) return false;
  const top = hudTopOffset(scene);
  // 0) 鸟瞰模式：只认"返回"按钮（暂停态；未中 → 交给鸟瞰拖动/缩放管线）
  if (scene.overview) {
    if (inRect(overviewButtonRect(canvas.width, top), sx, sy)) {
      scene.toggleOverview();
      onInfo?.({ type: 'overview-exit' });
    }
    return false;
  }
  // 1) 全屏按钮（仅触屏端显示；click/触点都在用户手势内，可请求全屏）。
  //    老设备/浏览器不支持元素全屏 API → 明确提示（不静默失效）
  if (scene._touchUI && typeof scene._touchUI.enabled === 'function' && scene._touchUI.enabled()) {
    if (inRect(fullscreenButtonRect(canvas.width, top), sx, sy)) {
      if (fullscreenSupported()) toggleFullscreen();
      else pushNotice(scene, '此浏览器不支持全屏（可试试"添加到主屏幕"后打开）');
      onInfo?.({ type: 'fullscreen' });
      return true;
    }
  }
  // 2) 鸟瞰按钮（双端）
  if (inRect(overviewButtonRect(canvas.width, top), sx, sy)) {
    scene.toggleOverview();
    onInfo?.({ type: 'overview' });
    return true;
  }
  // 3) 提示按钮（右上；hud.tipButton 同几何：top..top+28）
  if (sx > canvas.width - 68 && sx < canvas.width - 8 && sy > top && sy < top + 28) {
    if (hud) hud.showTip = !hud.showTip;
    onInfo?.({ type: 'tip' });
    return true;
  }
  // 4) 物品栏选格（右下；几何与 HUD 渲染共用 inventorySlotRects）
  const p = scene.player;
  if (p && p.inventory) {
    const rects = inventorySlotRects(canvas.width, canvas.height, p.inventory.slots, uiMargins(scene));
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (sx >= r.x && sx <= r.x + r.size && sy >= r.y && sy <= r.y + r.size) {
        p.inventory.selected = i;
        onInfo?.({ type: 'slot' });
        return true;
      }
    }
  }
  onInfo?.({ type: 'miss', world: screenToWorld(scene, canvas, sx, sy) });
  return false;
}

/**
 * 处理一次"按下"：命中 onTap 物体 → 立即触发一次（返回 true）并标记"按住目标"；
 * 按住期间 stepPressTap 会以 0.08s 间隔持续触发（长按=持续滴加）。
 * 未命中 → 清除按住标记并返回 false。
 */
function handleSceneTapDown(scene, canvas, sx, sy, onInfo = null, pad = 6) {
  if (!scene || scene.overview) return false; // 鸟瞰：场景管线冻结（拖动/缩放走鸟瞰输入）
  scene._pressHome = null;
  const hit = hitTap(scene, canvas, sx, sy, pad);
  if (!hit) {
    scene._pressTap = null;
    scene._pressTapT = 0;
    scene._pressCand = null;
    onInfo?.({ type: 'miss', world: screenToWorld(scene, canvas, sx, sy) });
    return false;
  }
  const ok = hit.obj.onTap(scene, hit.world);
  scene._pressTap = ok ? hit.obj : null; // 失败（无容器/已空）→ 不进入长按
  scene._pressTapT = 0;
  onInfo?.({ type: 'tap', object: hit.obj, success: !!ok, world: hit.world });
  return true;
}

/** 抬起：清除按住标记（长按停止） */
function handleSceneTapUp(scene) {
  if (!scene) return;
  scene._pressTap = null;
  scene._pressTapT = 0;
  scene._pressHome = null;
}

/**
 * 按下（滴管）：按命中位置分流——
 * ① 红色胶头（onBulb）：滴加的**唯一起点**。单击（<0.5s 快速抬起）= 滴一滴；
 *    长按（≥0.5s）= 液上持续滴加 / 液下吸取（尖端在液面下；按滴管自身判定）；
 * ② 玻璃段（isDraggable）：只能拖动（永不转滴）——玩家在 dragRange+slack 内才可；
 * ③ 其它可点击物体（非可拖动类）：立即触发 + 长按（旧行为）。
 * 落在滴管玻璃段但玩家太远 / 无容器等 → 未命中（不滴也不拖）。
 */
function handleScenePressDown(scene, canvas, sx, sy, onInfo = null, pad = 6) {
  if (!scene || scene.overview) return false; // 鸟瞰：场景管线冻结
  scene._pressHome = null;
  const hit = hitTap(scene, canvas, sx, sy, pad);
  if (!hit) {
    scene._pressCand = null;
    onInfo?.({ type: 'miss', world: screenToWorld(scene, canvas, sx, sy) });
    return false;
  }
  // ① 红色胶头：任意距离可滴/可吸
  if (typeof hit.obj.onBulb === 'function' && hit.obj.onBulb(hit.world)) {
    scene._pressCand = { mode: 'bulb', obj: hit.obj, startX: sx, startY: sy, world: hit.world, downT: 0, moved: false };
    scene._pressTap = null;
    scene._pressTapT = 0;
    onInfo?.({ type: 'press', object: hit.obj, world: hit.world, bulb: true });
    return true;
  }
  // ② 玻璃段拖动候选：靠近玩家才可拖动
  if (hit.obj.isDraggable && scene.player && dist(scene.player, hit.obj) <= CFG.item.dragRange + CFG.item.dragSlack) {
    scene._pressCand = { mode: 'drag', obj: hit.obj, startX: sx, startY: sy, world: hit.world, downT: 0, moved: false };
    scene._pressTap = null;
    scene._pressTapT = 0;
    onInfo?.({ type: 'press', object: hit.obj, world: hit.world });
    return true;
  }
  // ③ 其它可点击物体（非可拖动物）：立即触发 + 长按（旧行为）
  scene._pressCand = null;
  if (typeof hit.obj.onTap === 'function' && !hit.obj.isDraggable) {
    return handleSceneTapDown(scene, canvas, sx, sy, onInfo, pad);
  }
  onInfo?.({ type: 'miss', world: hit.world });
  return false;
}

/** 移动（按住期间）：拖动 = 移动滴管位置；胶头/玻璃段都允许拖。
 *  候选期拖出 dragStartPx → 拖动（不滴）；已开滴/开吸再拖出 dragAbortPx → 停转拖动 */
function handleScenePressMove(scene, canvas, sx, sy) {
  if (!scene || scene.overview) return;
  const c = scene._pressCand;
  if (c && !c.moved && Math.hypot(sx - c.startX, sy - c.startY) > CFG.item.dragStartPx) {
    c.moved = true;
    // 拖动门槛：滴管不能离玩家太远（拖出范围=放弃，不滴不拖）
    const p = scene.player;
    if (!p || dist(p, c.obj) > CFG.item.dragRange + CFG.item.dragSlack) return;
    scene._pressTap = null;
    scene._pressTapT = 0;
    const w0 = screenToWorld(scene, canvas, c.startX, c.startY);
    scene._drag = { obj: c.obj, ox: c.obj.x - w0.x, oy: c.obj.y - w0.y };
  }
  // 长按已开滴/开吸（候选已被消费）又拖出 abort 距离 → 停、转为拖动同一物体
  const h = scene._pressHome;
  if (!c && !scene._drag && (scene._pressTap || scene._holdSuck) && h && h.obj.isDraggable
      && Math.hypot(sx - h.sx, sy - h.sy) > CFG.item.dragAbortPx
      && scene.player && dist(scene.player, h.obj) <= CFG.item.dragRange + CFG.item.dragSlack) {
    scene._pressTap = null;
    scene._pressTapT = 0;
    scene._holdSuck = null;
    scene._pressHome = null;
    const w0 = screenToWorld(scene, canvas, h.sx, h.sy);
    scene._drag = { obj: h.obj, ox: h.obj.x - w0.x, oy: h.obj.y - w0.y };
  }
  if (scene._drag) {
    const d = scene._drag;
    const o = d.obj;
    const w = screenToWorld(scene, canvas, sx, sy);
    let nx = w.x + d.ox;
    let ny = w.y + d.oy;
    // 拖动范围钳制：滴管拖不出玩家的 dragRange——越界时贴着边界走并提示（一次/会话）
    const p = scene.player;
    if (p) {
      const pcx = p.x + p.w / 2;
      const pcy = p.y + p.h / 2;
      const dx = nx + o.w / 2 - pcx;
      const dy = ny + o.h / 2 - pcy;
      const L = Math.hypot(dx, dy);
      if (L > CFG.item.dragRange && L > 0.001) {
        const k = CFG.item.dragRange / L;
        nx = pcx + dx * k - o.w / 2;
        ny = pcy + dy * k - o.h / 2;
        if (!d._noticed) {
          d._noticed = true;
          pushNotice(scene, '距离玩家太远——滴管拖不出这个范围');
        }
      }
    }
    o.x = nx;
    o.y = ny;
  }
}

/** 抬起：快速单击胶头 = 滴一滴（长按/液下吸取已在 stepPressTap 觉醒）；
 *  玻璃段候选不滴（松开即完成，仅拖动会移动位置）；结束一切按住状态 */
function handleScenePressUp(scene, canvas = null, pad = 6) {
  if (!scene || scene.overview) return;
  const c = scene._pressCand;
  if (c && c.mode === 'bulb' && !c.moved && c.downT < CFG.item.dripArmDelay && canvas) {
    scene._pressCand = null;
    handleSceneTapDown(scene, canvas, c.startX, c.startY, null, pad); // 单击：在按下位置滴一滴
  }
  scene._pressCand = null;
  scene._drag = null;
  scene._holdSuck = null;
  scene._pressHome = null;
  handleSceneTapUp(scene);
}

/** 每 tick 推进：候选长按觉醒（≥ dripArmDelay：液下→吸取 / 液上→持续滴，胶头专属）
 *  + 液下持续吸取节奏 + 长按持续滴节奏 */
function stepPressTap(scene, dt) {
  if (!scene || scene.overview) return;
  const c = scene._pressCand;
  if (c && c.mode === 'bulb' && !c.moved) {
    c.downT = (c.downT ?? 0) + dt;
    if (c.downT >= CFG.item.dripArmDelay) {
      // 长按觉醒：液下 → 吸取；液上 → 持续滴加（都只在胶头发生——玻璃段永不滴）
      scene._pressCand = null;
      const o = c.obj;
      const sub = typeof o._submergedIn === 'function' ? o._submergedIn(scene) : null;
      scene._pressHome = { obj: o, sx: c.startX, sy: c.startY };
      if (sub) {
        scene._holdSuck = { obj: o, t: 0 };
        if (!o.attemptSuckOnce(scene)) {
          scene._holdSuck = null;
          scene._pressHome = null;
        }
      } else {
        const ok = o.onTap(scene);
        scene._pressTap = ok ? o : null;
        scene._pressTapT = 0;
        if (!ok) scene._pressHome = null;
      }
    }
  }
  // 液下持续吸取（每 suckPeriod 吸一手；管满/换液/尖端出液面自动停）
  if (scene._holdSuck) {
    scene._holdSuck.t += dt;
    if (scene._holdSuck.t >= CFG.item.suckPeriod) {
      scene._holdSuck.t = 0;
      const o = scene._holdSuck.obj;
      if (!scene.objects.includes(o) || typeof o.attemptSuckOnce !== 'function' || !o.attemptSuckOnce(scene)) {
        scene._holdSuck = null;
      }
    }
  }
  // 长按持续滴
  if (scene._pressTap) {
    scene._pressTapT = (scene._pressTapT ?? 0) + dt;
    if (scene._pressTapT >= CFG.item.dripPeriod) {
      scene._pressTapT = 0;
      const o = scene._pressTap;
      if (!scene.objects.includes(o) || typeof o.onTap !== 'function' || !o.onTap(scene)) {
        scene._pressTap = null; // 用完/失败/已移除 → 停止
      }
    }
  }
}

/** 给画布绑定交互（getScreenPos / getActive 由调用方提供：单场景/多场景都行）：
 *  mousedown=按下（点击滴液/长按/拖动候选），mousemove=拖动，
 *  click=HUD（提示/选格），mouseup=抬起 */
function bindSceneClick(canvas, getScreenPos, getActive) {
  const active = () => {
    const a = getActive();
    return a && a.scene ? a : null;
  };
  canvas.addEventListener('mousedown', (e) => {
    const a = active();
    if (!a) return;
    const { x, y } = getScreenPos(e);
    handleScenePressDown(a.scene, canvas, x, y);
  });
  window.addEventListener('mousemove', (e) => {
    const a = active();
    if (!a) return;
    const { x, y } = getScreenPos(e);
    handleScenePressMove(a.scene, canvas, x, y);
  });
  canvas.addEventListener('mouseup', () => {
    const a = active();
    if (a) handleScenePressUp(a.scene, canvas);
  });
  window.addEventListener('mouseup', () => {
    const a = active();
    if (a) handleScenePressUp(a.scene);
  });
  canvas.addEventListener('click', (e) => {
    const a = active();
    if (!a) return;
    const { x, y } = getScreenPos(e);
    handleSceneClick(a.scene, a.hud ?? null, canvas, x, y);
  });
}

exports.screenToWorld = screenToWorld;
exports.hudTopOffset = hudTopOffset;
exports.overviewButtonRect = overviewButtonRect;
exports.fullscreenButtonRect = fullscreenButtonRect;
exports.pushNotice = pushNotice;
exports.inventorySlotRects = inventorySlotRects;
exports.uiMargins = uiMargins;
exports.handleSceneClick = handleSceneClick;
exports.handleSceneTapDown = handleSceneTapDown;
exports.handleSceneTapUp = handleSceneTapUp;
exports.handleScenePressDown = handleScenePressDown;
exports.handleScenePressMove = handleScenePressMove;
exports.handleScenePressUp = handleScenePressUp;
exports.stepPressTap = stepPressTap;
exports.bindSceneClick = bindSceneClick;

  };
  __modules["src/core/fullscreen.js"] = function (module, exports, __require) {
// ============================================================================
// 全屏（移动端小屏必备：地址栏/系统栏挤占画面）。桌面端也可用（HUD 按钮仅触屏画）。
// 浏览器要求全屏必须发生在用户手势内：自动全屏走"首个触点"请求（requestFullscreenOnce），
// 手动切换走 HUD 按钮（click/touchstart 都是手势上下文）。
// iOS Safari 不支持元素全屏 API → 全部静默降级（不报错、不弹提示）。
// ============================================================================

/** 当前环境是否支持全屏 API（node/无 DOM = false） */
function fullscreenSupported() {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

/** 当前是否已处于全屏 */
function isFullscreen() {
  if (typeof document === 'undefined') return false;
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/** 请求全屏（最好在用户手势内调用）；返回 Promise|null（静默吞掉拒绝） */
function enterFullscreen() {
  if (typeof document === 'undefined' || isFullscreen()) return null;
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen
      ? el.requestFullscreen()
      : el.webkitRequestFullscreen?.();
    if (p && typeof p.catch === 'function') p.catch(() => { /* 用户拒绝/不支持：静默 */ });
    return p ?? null;
  } catch (e) {
    return null;
  }
}

/** 退出全屏 */
function exitFullscreen() {
  if (typeof document === 'undefined' || !isFullscreen()) return;
  try {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (e) { /* 静默 */ }
}

/** 切换全屏（HUD 按钮） */
function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}

/** 首个用户手势自动全屏（每页只尝试一次；不支持/已全屏则静默跳过） */
function requestFullscreenOnce() {
  if (requestFullscreenOnce._done) return;
  requestFullscreenOnce._done = true;
  if (!fullscreenSupported() || isFullscreen()) return;
  enterFullscreen();
}

exports.fullscreenSupported = fullscreenSupported;
exports.isFullscreen = isFullscreen;
exports.enterFullscreen = enterFullscreen;
exports.exitFullscreen = exitFullscreen;
exports.toggleFullscreen = toggleFullscreen;
exports.requestFullscreenOnce = requestFullscreenOnce;

  };
  __modules["src/core/input.js"] = function (module, exports, __require) {
// ============================================================================
// 键盘输入 → Scene.control（长按）/ Scene.pressed（本刻刚按下）
// 触控暂不实现（接口位预留）。
// ============================================================================

const KEYMAP = {
  KeyA: 'left',
  KeyD: 'right',
  Space: 'jump',
  ShiftLeft: 'place',
  ShiftRight: 'place',
  KeyQ: 'collect',
  KeyC: 'grab', // 拾取物品/吸液/（按住）集气
  KeyX: 'use', // 烧杯倒入 /（按住）集气瓶通气
};

function bindKeyboard(scene) {
  // 立即清空：右键菜单、焦点切换、页面隐藏等会吞掉 keyup 的场景
  const onClear = () => {
    scene.control.clear();
    scene.pressed.clear();
  };
  const onDown = (e) => {
    // 页面不在前台时忽略按键
    if (typeof document !== 'undefined' && !document.hasFocus()) return;
    // 运行时钩子：任意键都可被插件/关卡脚本监听（返回 true 表示已处理）
    scene._fireKey('down', e);
    if (e.code === 'KeyR') {
      scene.restart();
      return;
    }
    // 鸟瞰模式（灵魂出窍）：V 进出（暂停模拟，自由缩放/平移看整关）
    if (e.code === 'KeyV' && typeof scene.toggleOverview === 'function') {
      scene.toggleOverview();
      e.preventDefault();
      return;
    }
    // 调试模式：F5 暂停/继续，F6 步进一 tick，X 循环切换悬停重叠目标
    if (scene.debugMode) {
      if (e.code === 'F5') {
        scene.debugPaused = !scene.debugPaused;
        e.preventDefault();
        return;
      }
      if (e.code === 'F6') {
        scene.debugStepOnce = true;
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyX') {
        // 选中格是可携带物品时，X = 倒出/通气（物品交互优先）；仅普通物质时
        // 才用作"悬停重叠循环"调试键（试玩常开调试模式，不能抢玩家的 X）
        const slot = scene.player?.inventory?.selectedSlot?.();
        if (!slot || !slot.item) {
          scene.debugHoverCycle = true;
          e.preventDefault();
          return;
        }
      }
    }
    const c = KEYMAP[e.code];
    if (!c) return;
    e.preventDefault();
    if (!scene.control.has(c)) scene.pressed.add(c);
    scene.control.add(c);
  };
  const onUp = (e) => {
    scene._fireKey('up', e);
    const c = KEYMAP[e.code];
    if (c) scene.control.delete(c);
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onClear);
  window.addEventListener('contextmenu', onClear); // 右键菜单会吞 keyup
  window.addEventListener('focusout', onClear); // 焦点移出（点击别处、切换焦点）
  document.addEventListener('visibilitychange', onClear);
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onClear);
    window.removeEventListener('contextmenu', onClear);
    window.removeEventListener('focusout', onClear);
    document.removeEventListener('visibilitychange', onClear);
  };
}

exports.bindKeyboard = bindKeyboard;

  };
  __modules["src/core/loop.js"] = function (module, exports, __require) {
// ============================================================================
// 固定步长主循环：tick 30/s，rAF 驱动渲染。
// scene 可以是 Scene 实例（单场景），也可以是 () => {scene, renderer, hud}（多场景管理器
// 用：每条循环只推进/渲染"当前激活"的场景，切换即热切换）。
// ============================================================================

const { CFG } = __require('src/core/config.js');;

function startLoop(scene, renderer, opts = {}) {
  const TICK = 1 / CFG.tickRate;
  let last = performance.now();
  let acc = 0;
  let raf = 0;

  const getActive = typeof scene === 'function' ? scene : () => ({ scene, renderer, hud: opts.hud });

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc += dt;
    const active = getActive();
    if (active && active.scene) {
      const S = active.scene;
      let guard = 0;
      if (S.overview) {
        // 鸟瞰（灵魂出窍）：暂停推进（保持画面），自由缩放/平移由输入管线驱动
        acc = 0;
      } else if (S.debugMode && S.debugPaused) {
        // 调试暂停：不推进 tick（保持画面），F6 手动步进一 tick
        if (S.debugStepOnce) {
          S.debugStepOnce = false;
          S.step(TICK);
        }
      } else {
        while (acc >= TICK && guard < 10) {
          S.step(TICK);
          acc -= TICK;
          guard++;
        }
        if (acc >= TICK) acc = 0; // 追不上就丢帧
      }
      const R = active.renderer ?? renderer;
      R.frame(S.objects, { hud: active.hud ?? opts.hud, time: S.time, scene: S, focus: S.player ?? S.cameraFocus ?? null });
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

exports.startLoop = startLoop;

  };
  __modules["src/core/touch.js"] = function (module, exports, __require) {
// ============================================================================
// 移动端触控（仅触屏设备/小屏；桌面 `pointer:fine` 完全不受影响，逻辑全部走
// isTouchDevice() 门槛，宽松鼠标/触控笔照旧走 bindSceneClick 的鼠标管线）：
//
//  - 左下：半透明半圆摇杆基座 + 摇杆球。方向**5 向吸附**（上/左上/右上/左/右，
//    下半圆一律不触发）：向左=左走、左上=左跳、上=跳、右上=右跳、右=右走。
//    摇杆语义与键盘完全一致（写入 scene.control 的 left/right/jump）。
//  - 右下：Q 收集 / ⇧ 放置 / C 拾取… / X 倒出… 四键（C/X 支持**按住**：
//    与键盘 keydown/keyup 完全同语义——C 按住收气、X 按住通气），下方是物品栏。
//  - 场景内：与鼠标同一套"按下/拖动/抬起"管线（滴管点击滴液、长按持续滴、
//    液下吸取、拖动），触点落在 UI 控件外即进入该管线。
//  - 鸟瞰（灵魂出窍）：进入后触点改走手势管线——1 指拖动 = 平移、2 指捏合 =
//    缩放（中点为锚）；"返回"按钮退出（桌面 V 键 / HUD 鸟瞰按钮同效）。
//  - 全屏：首个触点自动请求全屏（小屏金贵；iOS 不支持元素全屏 → 静默跳过），
//    HUD ⛶ 按钮可随时切换。
//  - 竖屏：HUD 层画"请旋转设备"提示（游戏照常运行）。
//
// 几何约定：所有触控按钮/摇杆命中区 = 画布坐标（同 palette.js 的 inventorySlotRects），
// HUD 渲染与命中**共用同一套几何函数**（joyGeom/touchButtonRects），保证点哪是哪。
// ============================================================================

const { CFG } = __require('src/core/config.js');;
const { handleSceneClick, handleScenePressDown, handleScenePressMove, handleScenePressUp, inventorySlotRects, uiMargins, overviewButtonRect, hudTopOffset } = __require('src/level/click.js');;
const { requestFullscreenOnce } = __require('src/core/fullscreen.js');;

// ---------------------------------------------------------------------------
// 设备检测
// ---------------------------------------------------------------------------

/** 是否移动端（触屏为主要输入）。可被 forceTouch() 覆盖（E2E/调试用）：
 *  - URL `?touch=1` / `?touch=0` 优先；
 *  - 全局 `__chezzleTouchMode`（forceTouch 写入）次之；
 *  - 未标注时：coarse 指针 或（有触摸点且屏幕很小）= 移动端。
 *    触屏笔记本（fine 指针 + 大屏）保持桌面逻辑。 */
function isTouchDevice() {
  if (typeof window === 'undefined') return !!globalThis.__chezzleTouchMode;
  const q = /[?&]touch=([01])/.exec(location.search || '');
  if (q) return q[1] === '1';
  if (globalThis.__chezzleTouchMode !== undefined) return !!globalThis.__chezzleTouchMode;
  if (window.__chezzleTouch !== undefined) return window.__chezzleTouch;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const tiny = navigator.maxTouchPoints > 0 && Math.min(innerWidth, innerHeight) < 500;
  window.__chezzleTouch = coarse || tiny;
  return window.__chezzleTouch;
}

/** 强制覆盖移动端判定（true/false）；已绑定的 TouchUI 立即刷新画面/相机/布局 */
function forceTouch(v) {
  globalThis.__chezzleTouchMode = !!v;
  for (const ui of UIS) ui.refresh();
}

/** 现役 TouchUI 列表（forceTouch 刷新用） */
const UIS = [];

// ---------------------------------------------------------------------------
// 几何（HUD 渲染与触控命中共用）——画布坐标
// ---------------------------------------------------------------------------

/** 摇杆：左下角半圆（直径贴底边，圆心即摇杆原点），cx/cy = 圆心，R = 半径。
 *  半圆 = { dist ≤ R 且 y ≤ cy }（上部半圆）。 */
function joyGeom(W, H, insets = {}) {
  const R = CFG.touch.joyR;
  const cx = (insets.left ?? 0) + 14 + R;
  const cy = H - (insets.bottom ?? 0) - 12;
  return { cx, cy, R };
}

/** 右下按钮：2×2 块（C 上左 / X 上右 / Q 下左 / ⇧ 下右），下方是物品栏。
 *  与物品栏几何（inventorySlotRects，触屏边距版）共用坐标，按钮块贴着物品栏上沿。 */
function touchButtonRects(W, H, slots, insets = {}) {
  if (!slots || slots.length === 0) return [];
  const btn = CFG.touch.btnSize;
  const gap = CFG.touch.btnGap;
  const margins = { bottom: (insets.bottom ?? 0) + CFG.touch.pad, right: (insets.right ?? 0) + CFG.touch.pad };
  const inv = inventorySlotRects(W, H, slots, margins);
  let invTop = Infinity;
  let invRight = 0;
  for (const r of inv) {
    if (r.y < invTop) invTop = r.y;
    if (r.x + r.size > invRight) invRight = r.x + r.size;
  }
  const bw = btn * 2 + gap;
  const bx = invRight - bw;
  const by = invTop - 12 - (btn * 2 + gap);
  return [
    { key: 'grab', x: bx, y: by, size: btn },
    { key: 'use', x: bx + btn + gap, y: by, size: btn },
    { key: 'collect', x: bx, y: by + btn + gap, size: btn },
    { key: 'place', x: bx + btn + gap, y: by + btn + gap, size: btn },
  ];
}

/** 点在矩形内（含手指容差 pad） */
function hitRect(r, x, y, pad = 6) {
  return x >= r.x - pad && x <= r.x + r.size + pad && y >= r.y - pad && y <= r.y + r.size + pad;
}

/**
 * 摇杆 5 向吸附输入：给定相对圆心的位移 (dx, dy)（画布坐标，y 向下），
 * 返回 {left, right, jump, sx, sy}（sx/sy = 吸附后的单位方向，供画摇杆球；中性为 0）。
 * 方向只有 5 个：上 / 左上 / 右上 / 左 / 右——下半圆（含下倾）一律不触发。
 * 上半区按最近扇区吸附：右 [0°,22.5°] / 右上 [22.5°,67.5°] / 上 [67.5°,112.5°] /
 * 左上 [112.5°,157.5°] / 左 [157.5°,180°]（角度以竖直向上为 90°）。
 * 其余（下半区）→ 仅水平方向（左/右），水平死区内中性。
 */
function joyInput(dx, dy, R) {
  const mag = Math.hypot(dx, dy);
  const dead = R * CFG.touch.joyDead;
  if (mag < dead) return { left: false, right: false, jump: false, sx: 0, sy: 0 };
  const dyUp = -dy; // y 向下 → 向上为负
  if (dyUp > 0) {
    // 上半区：按角度就近吸附到 5 向
    const ang = Math.atan2(dyUp, dx); // 0..PI（竖直向上=PI/2）
    const deg = (ang * 180) / Math.PI;
    if (deg < 22.5) return { left: false, right: true, jump: false, sx: 1, sy: 0 };
    if (deg < 67.5) return { left: false, right: true, jump: true, sx: 0.7071, sy: -0.7071 };
    if (deg < 112.5) return { left: false, right: false, jump: true, sx: 0, sy: -1 };
    if (deg < 157.5) return { left: true, right: false, jump: true, sx: -0.7071, sy: -0.7071 };
    return { left: true, right: false, jump: false, sx: -1, sy: 0 };
  }
  // 下半区：仅水平方向；小水平分量（水平死区半径比例）中性
  const hd = R * CFG.touch.horizDead;
  if (dx > hd) return { left: false, right: true, jump: false, sx: 1, sy: 0 };
  if (dx < -hd) return { left: true, right: false, jump: false, sx: -1, sy: 0 };
  return { left: false, right: false, jump: false, sx: 0, sy: 0 };
}

// ---------------------------------------------------------------------------
// 屏幕适配（画布铺满窗口 + 安全区 + 防止浏览器手势）
// ---------------------------------------------------------------------------

const STYLE_ID = 'czl-touch-style';

function ensureBaseStyle() {
  if (typeof document === 'undefined') return;
  // viewport meta：现有关卡页没有 → 注入（禁止缩放/双击缩放；覆盖刘海区）
  if (!document.querySelector('meta[name="viewport"]')) {
    const m = document.createElement('meta');
    m.name = 'viewport';
    m.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    document.head.appendChild(m);
  }
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = [
    'html,body{overflow:hidden!important;overscroll-behavior:none!important;',
    '-webkit-user-select:none!important;user-select:none!important;',
    '-webkit-touch-callout:none!important;}',
  ].join('');
  document.head.appendChild(st);
}

/** 读取安全区（刘海/圆角/Home 指示条）：CSS env() → 计算值。缓存，resize 时刷新 */
function safeInsets() {
  if (typeof document === 'undefined') return { top: 0, bottom: 0, left: 0, right: 0 };
  const cached = document.documentElement.getAttribute('data-czl-insets');
  if (cached) try { return JSON.parse(cached); } catch (e) { /* 重新计算 */ }
  const cs = window.getComputedStyle(document.documentElement);
  const num = (v, d = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };
  const v = (n) => cs.getPropertyValue(`--czl-sa${n}`);
  const out = {
    top: num(v('t')),
    bottom: num(v('b')),
    left: num(v('l')),
    right: num(v('r')),
  };
  document.documentElement.setAttribute('data-czl-insets', JSON.stringify(out));
  return out;
}

function clearInsetsCache() {
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-czl-insets');
  }
}

function ensureInsetVars() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('czl-inset-vars')) return;
  const st = document.createElement('style');
  st.id = 'czl-inset-vars';
  st.textContent =
    ':root{--czl-sat:env(safe-area-inset-top,0px);--czl-sab:env(safe-area-inset-bottom,0px);' +
    '--czl-sal:env(safe-area-inset-left,0px);--czl-sar:env(safe-area-inset-right,0px);}';
  document.head.appendChild(st);
}

/** 画布铺满窗口（触屏端） */
function fitCanvas(canvas) {
  if (typeof document === 'undefined') return;
  const w = Math.max(1, Math.round(document.documentElement.clientWidth || window.innerWidth || 0));
  const h = Math.max(1, Math.round(document.documentElement.clientHeight || window.innerHeight || 0));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.style.display = 'block';
  canvas.style['z-index'] = '1';
  canvas.style.touchAction = 'none';
}

// ---------------------------------------------------------------------------
// TouchUI：触控控制器（每个画布一个；多场景 = 每场景画布各一个）
// ---------------------------------------------------------------------------

const JOY_KEYS = ['left', 'right', 'jump'];

class TouchUI {
  /**
   * @param canvas 游戏画布（触屏端铺满窗口）
   * @param getActive () => {scene, hud} | null —— 单场景/多场景共用（取"当前激活"）
   */
  constructor(canvas, getActive) {
    this.canvas = canvas;
    this.getActive = getActive;
    this.insets = { top: 0, bottom: 0, left: 0, right: 0 };
    this.joy = null; // { id, x, y, sx, sy, dir }（sx/sy 为吸附后单位方向）
    this.buttons = new Map(); // touchId → key（按下中的按键）
    this.uiTouches = new Set(); // 被 HUD UI（提示/物品栏）消费的触点
    this.sceneTouch = null; // { id }：进入场景按下/拖动管线的触点（单指）
    this.ovTouches = new Map(); // 鸟瞰手势触点 id → {x,y}（1指平移 / 2指捏合缩放）
    this._ctlScene = null; // 摇杆控制写入的 scene（切场景时释放旧场景的按键）
    this._bound = false;
  }

  enabled() {
    return isTouchDevice();
  }

  /** 竖屏（触屏端）？HUD 画旋转提示 */
  isPortrait() {
    return this.enabled() && this.canvas.width < this.canvas.height;
  }

  /** 某按键当前是否被按住（HUD 高亮用） */
  isPressed(key) {
    for (const k of this.buttons.values()) if (k === key) return true;
    return false;
  }

  /** 摇杆几何（画布坐标） */
  geom() {
    return joyGeom(this.canvas.width, this.canvas.height, this.insets);
  }

  /** 按钮矩形（画布坐标） */
  buttonRects() {
    const act = this.getActive();
    const slots = act && act.scene && act.scene.player ? act.scene.player.inventory.slots : [];
    return touchButtonRects(this.canvas.width, this.canvas.height, slots, this.insets);
  }

  /** 设备/布局刷新：安全区、画布铺满、相机移动端视野（forceTouch / resize 时调用）。
   *  视野按屏幕短边动态分配：手机（短边≈390）= 基准 viewH；平板短边更长 →
   *  视野同比放大（上限 viewHMax）——大屏不再"元素偏大、视角偏小"。 */
  refresh() {
    if (!this.enabled()) return;
    ensureBaseStyle();
    ensureInsetVars();
    clearInsetsCache();
    this.insets = safeInsets();
    fitCanvas(this.canvas);
    const act = this.getActive();
    if (act && act.scene && act.scene.camera) {
      let viewH = CFG.touch.viewH;
      if (typeof window !== 'undefined' && window.innerWidth && window.innerHeight) {
        const short = Math.min(window.innerWidth, window.innerHeight);
        viewH = Math.round(Math.min(
          CFG.touch.viewHMax,
          Math.max(CFG.touch.viewH, (CFG.touch.viewH * short) / CFG.touch.viewHRef),
        ));
      }
      act.scene.camera.mobileViewH = viewH;
      act.scene._touchUI = this;
    }
  }

  /** 释放某场景里摇杆写入的控制键（切场景/抬指时） */
  _releaseJoyControl(scene) {
    if (!scene) return;
    for (const k of JOY_KEYS) scene.control.delete(k);
  }

  /** 摇杆触点移动 → 写入当前激活场景的 control（5 向吸附） */
  _applyJoy(x, y) {
    const act = this.getActive();
    if (!act || !act.scene) return;
    const scene = act.scene;
    if (scene !== this._ctlScene) {
      // 按住摇杆切换场景：旧场景的按键释放干净（否则切回去玩家自动跑/跳）
      this._releaseJoyControl(this._ctlScene);
      this._ctlScene = scene;
    }
    const joy = this.joy;
    if (!joy) return;
    const g = this.geom();
    const inp = joyInput(x - g.cx, y - g.cy, g.R);
    joy.x = x;
    joy.y = y;
    // 摇杆球视觉位置：吸附方向 → 沿吸附单位方向推到实际幅度；中性 → 实际位置
    const dx = x - g.cx;
    const dy = y - g.cy;
    const mag = Math.hypot(dx, dy);
    const d = Math.min(mag, g.R);
    if (inp.sx || inp.sy) {
      joy.sx = inp.sx * d;
      joy.sy = inp.sy * d;
    } else {
      joy.sx = mag > 1e-6 ? (dx / mag) * d : 0;
      joy.sy = mag > 1e-6 ? (dy / mag) * d : 0;
    }
    for (const k of JOY_KEYS) {
      const on = !!inp[k];
      if (on && !joy.dir[k]) scene.control.add(k);
      if (!on && joy.dir[k]) scene.control.delete(k);
    }
    joy.dir = inp;
  }

  // ---- 单点管线（触点按下/移动/抬起 → 分派角色） ----

  /** 触点按下（画布坐标）。返回 'joy' | 'btn' | 'ui' | 'scene' | 'ov' | null */
  down(id, x, y) {
    const act = this.getActive();
    if (!act || !act.scene) return null;
    const scene = act.scene;
    const hud = act.hud ?? null;
    // 死亡：轻触重开（桌面按 R）
    if (scene.status === 'died') {
      scene.restart();
      return 'died';
    }
    // ⓪ 鸟瞰模式：返回按钮 = 退出；其余触点进手势管线（1指平移 / 2指捏合缩放）
    if (scene.overview) {
      const b = overviewButtonRect(this.canvas.width, hudTopOffset(scene));
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        scene.toggleOverview();
        return 'ui';
      }
      this.ovTouches.set(id, { x, y });
      return 'ov';
    }
    // ① 摇杆：左下半圆（上半部 hit；手指可从半圆上方/左右进入）
    const g = this.geom();
    if (!this.joy && y <= g.cy + 14 && Math.hypot(x - g.cx, y - g.cy) <= g.R + 14) {
      this.joy = { id, x, y, sx: 0, sy: 0, dir: { left: false, right: false, jump: false } };
      this._applyJoy(x, y);
      return 'joy';
    }
    // ② 右下按钮（Q/⇧/C/X）：按下 = keydown（pressed + control），抬起 = keyup
    for (const r of this.buttonRects()) {
      if (hitRect(r, x, y)) {
        this.buttons.set(id, r.key);
        scene.pressed.add(r.key);
        scene.control.add(r.key);
        return 'btn';
      }
    }
    // ③ HUD：提示按钮 / 物品栏选格（与桌面同一命中几何；hud 可空，showTip 跳过）
    if (handleSceneClick(scene, hud, this.canvas, x, y)) {
      this.uiTouches.add(id);
      return 'ui';
    }
    // ④ 场景：同一套按下/拖动管线（滴管点击/长按/拖动；选中格物品栏已处理）。
    //    手指容差 14px（桌面 6px）——滴管玻璃段只有 11px 宽，手指要点得中
    if (this.sceneTouch && this.sceneTouch.id !== id) return null; // 场景多指：只认第一指
    this.sceneTouch = { id };
    handleScenePressDown(scene, this.canvas, x, y, null, 14);
    return 'scene';
  }

  /** 鸟瞰手势：1指 = 平移；2指 = 双指捏合缩放（中点为锚）+ 中点平移 */
  _applyOverviewGesture(id, x, y) {
    const act = this.getActive();
    const scene = act && act.scene ? act.scene : null;
    const prev = this.ovTouches.get(id);
    if (!scene || !scene.camera || !prev) return;
    if (this.ovTouches.size === 1) {
      scene.camera.panOverview(x - prev.x, y - prev.y, this.canvas.width, this.canvas.height);
    } else if (this.ovTouches.size >= 2) {
      // 取另外一根手指组成捏合对
      let otherId = null;
      for (const k of this.ovTouches.keys()) if (k !== id) { otherId = k; break; }
      const o = otherId != null ? this.ovTouches.get(otherId) : null;
      if (o) {
        const d0 = Math.hypot(prev.x - o.x, prev.y - o.y);
        const d1 = Math.hypot(x - o.x, y - o.y);
        // 中点位移 = 平移；距离比 = 缩放（中点为锚）
        const m0x = (prev.x + o.x) / 2;
        const m0y = (prev.y + o.y) / 2;
        const m1x = (x + o.x) / 2;
        const m1y = (y + o.y) / 2;
        scene.camera.panOverview(m1x - m0x, m1y - m0y, this.canvas.width, this.canvas.height);
        if (d0 > 8) scene.camera.zoomOverview(d1 / d0, m1x, m1y, this.canvas.width, this.canvas.height);
      }
    }
    this.ovTouches.set(id, { x, y });
  }

  /** 触点移动 */
  move(id, x, y) {
    const act = this.getActive();
    if (!act || !act.scene) return;
    const scene = act.scene;
    if (this.ovTouches.has(id)) {
      this._applyOverviewGesture(id, x, y);
      return;
    }
    if (this.joy && this.joy.id === id) {
      this._applyJoy(x, y);
      return;
    }
    if (this.buttons.has(id)) return; // 按钮按住不动（滑出也算按住，同按钮语义）
    if (this.uiTouches.has(id)) return;
    if (this.sceneTouch && this.sceneTouch.id === id) {
      handleScenePressMove(scene, this.canvas, x, y);
    }
  }

  /** 触点抬起/取消 */
  up(id) {
    if (this.ovTouches.has(id)) {
      this.ovTouches.delete(id);
      return;
    }
    const act = this.getActive();
    const scene = act && act.scene ? act.scene : null;
    if (this.joy && this.joy.id === id) {
      this._releaseJoyControl(this._ctlScene ?? scene);
      this._ctlScene = null;
      this.joy = null;
      return;
    }
    if (this.buttons.has(id)) {
      const key = this.buttons.get(id);
      this.buttons.delete(id);
      if (scene) scene.control.delete(key);
      return;
    }
    if (this.uiTouches.has(id)) {
      this.uiTouches.delete(id);
      return;
    }
    if (this.sceneTouch && this.sceneTouch.id === id) {
      this.sceneTouch = null;
      if (scene) handleScenePressUp(scene, this.canvas, 14);
    }
  }

  /** 抬起所有触点（页面失焦/切场景兜底）：等价于全部 keyup + 取消摇杆/拖动 */
  releaseAll() {
    const act = this.getActive();
    const scene = act && act.scene ? act.scene : null;
    this.ovTouches.clear();
    this._releaseJoyControl(this._ctlScene ?? scene);
    this._ctlScene = null;
    this.joy = null;
    for (const key of this.buttons.values()) {
      if (scene) scene.control.delete(key);
    }
    this.buttons.clear();
    this.uiTouches.clear();
    this.sceneTouch = null;
    if (scene) handleScenePressUp(scene, this.canvas, 14);
  }

  // ---- DOM 绑定 ----

  bind() {
    if (this._bound) return () => {};
    // 无 DOM 环境（node 测试/库内嵌入）不绑定
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
    this._bound = true;
    const canvas = this.canvas;
    const pos = (t) => {
      const r = canvas.getBoundingClientRect();
      const kx = canvas.width / Math.max(1, r.width);
      const ky = canvas.height / Math.max(1, r.height);
      return { x: (t.clientX - r.left) * kx, y: (t.clientY - r.top) * ky };
    };
    const enabled = () => isTouchDevice();
    const onStart = (e) => {
      if (!enabled()) return;
      // 首个用户手势自动全屏（小屏金贵；不支持/iOS → 静默跳过；HUD ⛶ 按钮可随时切换）
      requestFullscreenOnce();
      for (const t of e.changedTouches) {
        const p = pos(t);
        this.down(t.identifier, p.x, p.y);
      }
      if (e.cancelable) e.preventDefault();
    };
    const onMove = (e) => {
      if (!enabled()) return;
      for (const t of e.changedTouches) {
        const p = pos(t);
        this.move(t.identifier, p.x, p.y);
      }
      if (e.cancelable) e.preventDefault(); // 阻止下拉刷新/页面滚动
    };
    const onEnd = (e) => {
      if (!enabled()) return;
      for (const t of e.changedTouches) this.up(t.identifier);
      if (e.cancelable) e.preventDefault();
    };
    const onCancel = (e) => {
      if (!enabled()) return;
      for (const t of e.changedTouches) this.up(t.identifier);
    };
    const onCtx = (e) => {
      if (enabled()) e.preventDefault(); // 长按不弹系统菜单/选择
    };
    const onClear = () => this.releaseAll();
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchend', onEnd, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchcancel', onCancel);
    canvas.addEventListener('contextmenu', onCtx);
    window.addEventListener('blur', onClear);
    document.addEventListener('visibilitychange', onClear);
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchcancel', onCancel);
      canvas.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('blur', onClear);
      document.removeEventListener('visibilitychange', onClear);
      this._bound = false;
    };
  }
}

// ---------------------------------------------------------------------------
// 绑定入口（LevelBuilder.start / Multiscene 各画布调用）
// ---------------------------------------------------------------------------

/**
 * 给画布绑定触控（getScreenPos/getActive 语义同 bindSceneClick）。
 * 返回 { ui, unbind }：ui 供 HUD 渲染读取（scene._touchUI）；unbind 解除全部监听。
 */
function bindTouchUI(canvas, getActive) {
  const ui = new TouchUI(canvas, getActive);
  const unbind = ui.bind();
  const onLayout = () => ui.refresh();
  const debounce = () => {
    clearTimeout(onLayout._t);
    onLayout._t = setTimeout(onLayout, 90);
  };
  const fsChange = () => debounce();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', debounce);
    window.addEventListener('orientationchange', debounce);
    // 进/出全屏：窗口尺寸变化 → 重排画布与安全区
    document.addEventListener('fullscreenchange', fsChange);
    document.addEventListener('webkitfullscreenchange', fsChange);
  }
  UIS.push(ui);
  const act = getActive();
  if (act && act.scene) act.scene._touchUI = ui;
  if (ui.enabled()) ui.refresh();
  return {
    ui,
    unbind: () => {
      unbind();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', debounce);
        window.removeEventListener('orientationchange', debounce);
        document.removeEventListener('fullscreenchange', fsChange);
        document.removeEventListener('webkitfullscreenchange', fsChange);
      }
      const i = UIS.indexOf(ui);
      if (i >= 0) UIS.splice(i, 1);
    },
  };
}

exports.isTouchDevice = isTouchDevice;
exports.forceTouch = forceTouch;
exports.joyGeom = joyGeom;
exports.touchButtonRects = touchButtonRects;
exports.joyInput = joyInput;
exports.TouchUI = TouchUI;
exports.bindTouchUI = bindTouchUI;

  };
  __modules["src/core/overview.js"] = function (module, exports, __require) {
// ============================================================================
// 鸟瞰模式输入（桌面端；移动端单指/双指在 touch.js 的 TouchUI 里处理）：
//  - 滚轮：以光标为锚缩放（光标下的世界点保持不动）；
//  - 左键拖动：平移视图（按下落在"返回"按钮上时不拖——让 click 事件去切换）。
// 仅在 scene.overview 时生效（其它时刻各处理器直接返回，不影响正常游戏管线）。
// 几何约定：overviewButtonRect（HUD 渲染与命中共用）在 level/click.js。
// ============================================================================

const { overviewButtonRect, hudTopOffset } = __require('src/level/click.js');;

/**
 * 给画布绑定鸟瞰输入。
 * @param getActive () => { scene } | null（同 bindTouchUI 语义）
 * @returns unbind()
 */
function bindOverviewInput(canvas, getActive) {
  // getActive 兼容两种形态：() => { scene }（标准）或 () => Scene（容错）——
  // 形态不匹配会让处理器静默失灵，这里统一收敛成 Scene
  const sceneOf = () => {
    const a = typeof getActive === 'function' ? getActive() : getActive;
    const s = a && a.scene ? a.scene : a;
    return s && typeof s.overview === 'boolean' ? s : null;
  };
  let pan = null; // { x, y } 拖动中（屏幕坐标）

  const onWheel = (e) => {
    const scene = sceneOf();
    if (!scene || !scene.overview || !scene.camera) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    // 滚轮一格 ≈ 1.12×；deltaMode=1（行）时放大系数
    const step = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const factor = Math.pow(1.12, -step / 53);
    scene.camera.zoomOverview(factor, px, py, canvas.width, canvas.height);
  };

  const onDown = (e) => {
    const scene = sceneOf();
    if (!scene || !scene.overview) return;
    if (e.button !== 0) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    // "返回"按钮：不进入拖动（click 事件负责切换）
    const b = overviewButtonRect(canvas.width, hudTopOffset(scene));
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return;
    pan = { x: e.clientX, y: e.clientY };
  };

  const onMove = (e) => {
    if (!pan) return;
    const scene = sceneOf();
    if (!scene || !scene.overview || !scene.camera) {
      pan = null;
      return;
    }
    scene.camera.panOverview(e.clientX - pan.x, e.clientY - pan.y, canvas.width, canvas.height);
    pan = { x: e.clientX, y: e.clientY };
  };

  const onUp = () => {
    pan = null;
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('blur', onUp);
  return () => {
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('blur', onUp);
  };
}

exports.bindOverviewInput = bindOverviewInput;

  };
  __modules["src/core/recorder.js"] = function (module, exports, __require) {
// ============================================================================
// 操作录制/回放工具（开发用）：
//  ├─ 录制：关卡 URL 加 `?record=1` → 页面浮出录制面板。自动记录玩家全部
//  │   操作（键盘 keydown/keyup、触摸 down/move/up、鼠标按下/拖动/抬起/点击），
//  │   坐标一律记**画布坐标**（回放时屏幕尺寸不同也照常）；按 R 重开局自动
//  │   分"段"（每次挑战内独立回放）。停止后下载为 JSON 文件；
//  ├─ 回放：把录制的 .json 拖回（或文件选择）关卡页 → 页面自动重载 →
//  │   按录制时的操作序列回放；`Math.random` 用录制时的种子重装——
//  │   游戏内随机数序列与录制完全一致（操作 + 随机双重还原，可稳定复现）；
//  │   每段结束自动切下一段（重载推进），全部回放完给出提示。
// 用法（无需改关卡文件）：
//   levels/xxx.html?record=1          —— 录制
//   levels/xxx.html + 拖入录制的文件   —— 回放
// ============================================================================

const { CFG } = __require('src/core/config.js');;

// ---------------------------------------------------------------------------
// 种子随机（mulberry32）：回放时用同一种子，游戏内 Math.random 序列一致
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把 Math.random 换成同种子 PRNG（返回被替换的旧函数） */
function installSeed(seed) {
  const old = Math.random;
  Math.random = mulberry32(seed);
  return old;
}

// ---------------------------------------------------------------------------
// 录制器
// ---------------------------------------------------------------------------
// 事件格式（k 为类型；x/y 为画布坐标；t 为 scene.time）：
//   {t, k:'kd'|'ku', code}                      键盘按下/抬起
//   {t, k:'td'|'tm'|'tu', x, y, id}             触摸 down/move/up（含 cancel→tu）
//   {t, k:'md'|'mm'|'mu'|'cl', x, y, btn}       鼠标按下/移动/抬起/点击

class GameRecorder {
  /**
   * @param getScene () => Scene|null —— 录制时间源（单场景/多场景活跃场景）
   * @param surface  事件表面（单场景=canvas；多场景=容器 div）
   */
  constructor(getScene, surface) {
    this.getScene = getScene;
    this.surface = surface;
    this.runs = []; // 完成的段：[{t0,t1,events:[...]}]
    this.records = null; // 录制中的段事件
    this.seed = 0;
    this._listeners = null;
    this._ctx = {
      toCanvasX: 0, // 正在改的触点坐标缓存（一次 touch 事件多触点 → 逐点记录）
      toCanvasY: 0,
    };
  }

  get on() {
    return !!this.records;
  }

  _now() {
    const s = typeof this.getScene === 'function' ? this.getScene() : null;
    return s && Number.isFinite(s.time) ? s.time : 0;
  }

  // ---- 录制核心（事件处理器直接写入；DOM 监听器只是翻译坐标后的薄壳） ----

  /** 键盘（down=true 按下 / false 抬起）；R 重开局 → 结束当前段 */
  key(code, down) {
    if (!this.on) return;
    this.records.push({ t: this._now(), k: down ? 'kd' : 'ku', code });
    if (down && code === 'KeyR') this._endRun();
  }

  /** 触摸（kind: 'td'|'tm'|'tu'） */
  touch(kind, x, y, id) {
    if (!this.on) return;
    this.records.push({ t: this._now(), k: kind, x, y, id });
  }

  /** 鼠标（kind: 'md'|'mm'|'mu'|'cl'） */
  mouse(kind, x, y, btn = 0) {
    if (!this.on) return;
    const e = { t: this._now(), k: kind, x, y, btn };
    if (kind === 'md' || kind === 'cl') e.btn = btn;
    this.records.push(e);
  }

  // ---- 生命周期 ----

  /** 开始录制：种子随机 + 绑定 DOM 监听（node/无 DOM 环境仅设状态） */
  start() {
    if (this.on) return;
    this.seed = ((Date.now() & 0x7fffffff) ^ ((Math.random() * 0x7fffffff) | 0)) >>> 0;
    installSeed(this.seed);
    this.records = [];
    this._bind();
  }

  /** 停止录制（结束当前段 + 解绑）→ 返回段数据 */
  stop() {
    if (!this.on) return [];
    this._endRun();
    this._unbind();
    return this.runs;
  }

  _endRun() {
    if (!this.records || this.records.length === 0) return;
    const ev = this.records;
    this.runs.push({ t0: ev[0].t, t1: ev[ev.length - 1].t, events: ev });
    this.records = [];
  }

  /** 文件数据（JSON-ready） */
  data() {
    const lastRun = this.on ? [...this.records] : [];
    return {
      version: 1,
      url: typeof location !== 'undefined' ? location.href.split('?')[0] : '',
      seed: this.seed,
      tickRate: CFG.tickRate,
      runs: lastRun.length
        ? [...this.runs, { t0: lastRun[0].t, t1: lastRun[lastRun.length - 1].t, events: lastRun }]
        : this.runs,
    };
  }

  _bind() {
    if (this._listeners || typeof window === 'undefined' || !this.surface) return;
    const s = this.surface;
    const toCanvas = (e) => {
      const r = s.getBoundingClientRect ? s.getBoundingClientRect() : { left: 0, top: 0, width: s.width, height: s.height };
      const kx = s.width / Math.max(1, r.width);
      const ky = s.height / Math.max(1, r.height);
      return { x: (e.clientX - r.left) * kx, y: (e.clientY - r.top) * ky };
    };
    const kd = (e) => this.key(e.code, true);
    const ku = (e) => this.key(e.code, false);
    const ts = (e) => {
      for (const t of e.changedTouches) this.touch('td', ...this._tp(t, toCanvas, e), t.identifier);
    };
    const tm = (e) => {
      for (const t of e.changedTouches) this.touch('tm', ...this._tp(t, toCanvas, e), t.identifier);
    };
    const te = (e) => {
      for (const t of e.changedTouches) this.touch('tu', ...this._tp(t, toCanvas, e), t.identifier);
    };
    const md = (e) => this.mouse('md', ...Object.values(toCanvas(e)), e.button ?? 0);
    const mm = (e) => this.mouse('mm', ...Object.values(toCanvas(e)));
    const mu = (e) => this.mouse('mu', ...Object.values(toCanvas(e)), e.button ?? 0);
    const cl = (e) => this.mouse('cl', ...Object.values(toCanvas(e)));
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    s.addEventListener('touchstart', ts, { passive: true });
    window.addEventListener('touchmove', tm, { passive: true });
    s.addEventListener('touchend', te, { passive: true });
    s.addEventListener('touchcancel', te, { passive: true });
    s.addEventListener('mousedown', md);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    s.addEventListener('click', cl);
    this._listeners = { kd, ku, ts, tm, te, md, mm, mu, cl };
  }

  /** 触点 → 画布坐标 */
  _tp(t, toCanvas, e) {
    const p = toCanvas({ clientX: t.clientX, clientY: t.clientY });
    return [p.x, p.y];
  }

  _unbind() {
    const L = this._listeners;
    if (!L) return;
    window.removeEventListener('keydown', L.kd);
    window.removeEventListener('keyup', L.ku);
    this.surface.removeEventListener('touchstart', L.ts);
    window.removeEventListener('touchmove', L.tm);
    this.surface.removeEventListener('touchend', L.te);
    this.surface.removeEventListener('touchcancel', L.te);
    this.surface.removeEventListener('mousedown', L.md);
    window.removeEventListener('mousemove', L.mm);
    window.removeEventListener('mouseup', L.mu);
    this.surface.removeEventListener('click', L.cl);
    this._listeners = null;
  }
}

// ---------------------------------------------------------------------------
// 回放
// ---------------------------------------------------------------------------

/** 事件 → 真实 DOM 事件（走游戏原本的监听器，管线零差别） */
function dispatchReplayEvent(surface, ev) {
  if (typeof window === 'undefined') return false;
  const toClient = (x, y) => {
    const r = surface.getBoundingClientRect ? surface.getBoundingClientRect() : { left: 0, top: 0 };
    return {
      clientX: r.left + (x / Math.max(1, surface.width)) * Math.max(1, r.width),
      clientY: r.top + (y / Math.max(1, surface.height)) * Math.max(1, r.height),
    };
  };
  if (ev.k === 'kd' || ev.k === 'ku') {
    window.dispatchEvent(new KeyboardEvent(ev.k === 'kd' ? 'keydown' : 'keyup', { code: ev.code, bubbles: true, cancelable: true }));
    return true;
  }
  if (ev.k === 'td' || ev.k === 'tm' || ev.k === 'tu') {
    const p = toClient(ev.x, ev.y);
    const t = new Touch({ identifier: ev.id, target: surface, clientX: p.clientX, clientY: p.clientY });
    const type = ev.k === 'td' ? 'touchstart' : ev.k === 'tm' ? 'touchmove' : 'touchend';
    surface.dispatchEvent(new TouchEvent(type, { touches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
    return true;
  }
  if (ev.k.startsWith('m')) {
    const p = toClient(ev.x, ev.y);
    const type = { md: 'mousedown', mm: 'mousemove', mu: 'mouseup', cl: 'click' }[ev.k];
    const target = ev.k === 'mm' || ev.k === 'mu' ? window : surface;
    target.dispatchEvent(new MouseEvent(type, { clientX: p.clientX, clientY: p.clientY, button: ev.btn ?? 0, bubbles: true, cancelable: true }));
    return true;
  }
  return false;
}

/** 按 scene.time 推进回放：注册到活跃场景的 onTick；R 重开局 = 段结束（不放 reload）。
 *  @param events 按 t 升序的录制事件
 *  @param opts { sink(ev)=dispatchReplayEvent, onDone(), onEvent(ev) }
 *  @returns 停止函数 */
function replayEvents(getScene, surface, events, opts = {}) {
  const sink = opts.sink ?? ((ev) => dispatchReplayEvent(surface, ev));
  let ptr = 0;
  const scene = typeof getScene === 'function' ? getScene() : getScene;
  if (!scene || typeof scene.onTick !== 'function') return () => {};
  let stop = () => {};
  const tick = () => {
    const t = scene.time;
    // 严格 t < 当前帧时间：录制时按键落在 tick 之后，其效果自下一 tick 生效——
    // 回放也要在下一 tick 应用（否则同一 tick 内按键提前生效，差一整帧运动量）
    while (ptr < events.length && events[ptr].t < t) {
      const ev = events[ptr++];
      opts.onEvent?.(ev);
      // 重开局（R）：不放行（会触发页面重载）——作为段结束信号
      if (ev.k === 'kd' && ev.code === 'KeyR') {
        stop();
        opts.onDone?.(true);
        return;
      }
      sink(ev);
    }
    if (ptr >= events.length) {
      stop();
      opts.onDone?.(false);
    }
  };
  stop = scene.onTick(tick);
  return stop;
}

// ---------------------------------------------------------------------------
// 页面面板（?record=1 → 录制；会话内有回放数据 → 回放模式）
// ---------------------------------------------------------------------------

const REPLAY_KEY = 'czl-replay-v1'; // sessionStorage：拖入的回放文件（JSON 文本）

/**
 * 挂载录制/回放面板。返回 { recorder, startReplayFromData(data), destroy }。
 * getScene：() => 活跃 Scene（时间源/回放注册 onTick）。
 * surface：事件表面（canvas 或容器）。
 */
function attachRecorderPanel(getScene, surface) {
  const recorder = new GameRecorder(getScene, surface);
  const rec = recorder;

  // ---- DOM 面板 ----
  let el = null;
  let btn = null;
  let stat = null;
  let dot = null;
  let runInfo = null;
  function ensurePanel() {
    if (el || typeof document === 'undefined') return;
    el = document.createElement('div');
    el.id = 'czl-recorder';
    el.style.cssText = [
      'position:fixed;top:44px;left:8px;z-index:60;display:flex;align-items:center;gap:8px;',
      'padding:6px 10px;border-radius:9px;border:1px solid #2b3047;background:rgba(12,10,32,.92);',
      'color:#dfe8f2;font:12px "Segoe UI","Microsoft YaHei",sans-serif;',
      'backdrop-filter:blur(2px);user-select:none;',
    ].join('');
    dot = document.createElement('span');
    dot.id = 'czl-rec-dot';
    dot.textContent = '●';
    dot.style.color = '#ff3b30';
    dot.style.animation = 'czl-bl 1s steps(2) infinite';
    stat = document.createElement('span');
    stat.textContent = '⏺ 录制中…';
    btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'cursor:pointer;padding:3px 10px;border:1px solid #e8b84b;background:#241a02;color:#ffe9b0;font-weight:bold;border-radius:6px;';
    btn.textContent = '⏹ 停止并下载';
    btn.addEventListener('click', () => {
      if (rec.on) {
        const runs = rec.stop();
        stat.textContent = `已停止 · ${runs.length} 段 · ${runs.reduce((n, r) => n + r.events.length, 0)} 事件`;
        dot.style.color = '#6a7a96';
        dot.style.animation = '';
        btn.textContent = '⏺ 重新录制';
        addDownload();
        addLoadHint();
      } else {
        rec.start();
        stat.textContent = '⏺ 录制中…';
        dot.style.color = '#ff3b30';
        dot.style.animation = 'czl-bl 1s steps(2) infinite';
        btn.textContent = '⏹ 停止并下载';
        runInfo && runInfo.remove();
      }
    });
    el.append(dot, stat, btn);
    document.body.appendChild(el);
    const st = document.createElement('style');
    st.textContent = '@keyframes czl-bl{50%{opacity:.15}}';
    document.head.appendChild(st);
  }

  function addDownload() {
    const data = rec.data();
    if (!data.runs.length) return;
    const a = document.createElement('a');
    a.textContent = '⬇ 下载';
    a.style.cssText = 'color:#7fd8ff;cursor:pointer;text-decoration:underline;';
    a.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const u = URL.createObjectURL(blob);
      const dl = document.createElement('a');
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      dl.href = u;
      dl.download = `chezzle-记录-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
      dl.click();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    });
    el.appendChild(a);
    return a;
  }

  function addLoadHint() {
    if (document.getElementById('czl-rec-load')) return;
    const h = document.createElement('span');
    h.id = 'czl-rec-load';
    h.textContent = '· 拖入 .json 回放';
    h.style.color = '#5f6d8f';
    el.appendChild(h);
  }

  // ---- 回放模式（sessionStorage 有回放数据 → 页面加载后自动回放） ----
  function enterReplay(data) {
    try { sessionStorage.setItem(REPLAY_KEY, JSON.stringify(data)); } catch (e) { /* 大文件存不下 */ }
    if (typeof location !== 'undefined') location.reload();
  }

  function startReplayIfAny() {
    if (typeof sessionStorage === 'undefined') return false;
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem(REPLAY_KEY) || 'null'); } catch (e) { return false; }
    if (!data || !data.runs || !data.runs.length) return false;
    const runIdx = parseRunIdxFromUrl() || 0;
    if (runIdx >= data.runs.length) {
      sessionStorage.removeItem(REPLAY_KEY);
      cleanupHash();
      notify('回放完成：全部 ' + data.runs.length + ' 段已播放');
      return;
    }
    ensurePanel();
    installSeed(data.seed);
    const scene = typeof getScene === 'function' ? getScene() : null;
    if (!scene) return;
    const run = data.runs[runIdx];
    const events = run.events;
    stat.textContent = `▶ 回放中 第 ${runIdx + 1}/${data.runs.length} 段 · ${events.length} 事件`;
    dot.style.color = '#7fd8ff';
    btn.style.display = 'none';
    replayEvents(() => scene, surface, events, {
      onDone: () => {
        const next = runIdx + 1;
        try { sessionStorage.setItem(REPLAY_KEY, JSON.stringify(data)); } catch (e) {}
        location.hash = `czl-replay-run=${next}`;
        location.reload();
      },
    });
    return true;
  }

  function parseRunIdxFromUrl() {
    const m = /czl-replay-run=(\d+)/.exec(location.hash || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  function cleanupHash() {
    if (typeof location !== 'undefined' && location.hash) location.hash = '';
  }

  function notify(text) {
    if (typeof document === 'undefined') return;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:70;padding:10px 22px;border:1px solid #e8b84b;background:#241a02;color:#ffe9b0;font:bold 14px "Segoe UI","Microsoft YaHei",sans-serif;border-radius:8px;box-shadow:0 0 22px rgba(232,184,75,.45);';
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  // ---- 拖入文件 / 文件选择 ----
  function bindDrop() {
    if (typeof document === 'undefined') return;
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => /\.json$/i.test(x.name));
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(rd.result);
          if (!data.runs) throw new Error('不是录制文件');
          if (rec.on) rec.stop();
          enterReplay(data);
        } catch (err) { notify('回放文件无效：' + err.message); }
      };
      rd.readAsText(f);
    });
  }

  ensurePanel();
  bindDrop();
  if (!startReplayIfAny() && !rec.on) {
    // ?record=1 打开即自动开录（录到停止/下载为止）
    rec.start();
  }
  return {
    recorder: rec,
    /** 编程式开始回放（无文件交互；E2E/控制台用） */
    startReplayFromData: enterReplay,
    destroy: () => {
      if (typeof document !== 'undefined') document.getElementById('czl-recorder')?.remove();
    },
  };
}

exports.mulberry32 = mulberry32;
exports.installSeed = installSeed;
exports.GameRecorder = GameRecorder;
exports.dispatchReplayEvent = dispatchReplayEvent;
exports.replayEvents = replayEvents;
exports.attachRecorderPanel = attachRecorderPanel;

  };
  __modules["src/level/builder.js"] = function (module, exports, __require) {
// ============================================================================
// 关卡 DSL：流式构建 Scene，末尾 build() 返回 Scene，start() 启动游戏循环。
// ============================================================================

const { Scene } = __require('src/core/scene.js');;
const { parseReactionStr } = __require('src/chem/substances.js');;
const { bindKeyboard } = __require('src/core/input.js');;
const { startLoop } = __require('src/core/loop.js');;
const { Plugins } = __require('src/level/plugins.js');;
const { Renderer } = __require('src/render/renderer.js');;
const { Hud } = __require('src/render/hud.js');;
const { Floor } = __require('src/objects/floor.js');;
const { Pool } = __require('src/objects/pool.js');;
const { Block } = __require('src/objects/block.js');;
const { Deposit } = __require('src/objects/deposit.js');;
const { Player } = __require('src/objects/player.js');;
const { Switch } = __require('src/objects/switch.js');;
const { Key } = __require('src/objects/key.js');;
const { Door } = __require('src/objects/door.js');;
const { Lamp } = __require('src/objects/lamp.js');;
const { BlastLamp } = __require('src/objects/blastlamp.js');;
const { Beaker } = __require('src/objects/beaker.js');;
const { Rope } = __require('src/objects/rope.js');;
const { GasColumn } = __require('src/objects/gascolumn.js');;
const { Sign } = __require('src/objects/sign.js');;
const { Portal } = __require('src/objects/portal.js');;
const { GasDetector } = __require('src/objects/gasdetector.js');;
const { Extractor } = __require('src/objects/extractor.js');;
const { Dropper } = __require('src/objects/dropper.js');;
const { GasBottle } = __require('src/objects/gasbottle.js');;
const { bindSceneClick } = __require('src/level/click.js');;
const { bindOverviewInput } = __require('src/core/overview.js');;
const { bindTouchUI } = __require('src/core/touch.js');;
const { attachRecorderPanel } = __require('src/core/recorder.js');;

class LevelBuilder {
  constructor(canvas, opts = {}) {
    this.scene = new Scene(opts);
    this.renderer = new Renderer(canvas, { worldW: this.scene.worldW, worldH: this.scene.worldH });
    this.hud = new Hud(this.scene);
    this.scene.renderer = this.renderer;
  }

  floor(x, y, w, h, opts = {}) {
    return this.add(new Floor({ x, y, w, h, ...opts }));
  }

  pool(x, y, w, h, opts = {}) {
    return this.add(new Pool({ x, y, w, h, ...opts }));
  }

  block(x, y, opts = {}) {
    return this.add(new Block({ x, y, ...opts }));
  }

  /** 沉淀堆：直接放在地面的沉淀（默认低矮堆形、不可推动、不可被气流托起） */
  deposit(x, y, opts = {}) {
    return this.add(new Deposit({ x, y, ...opts }));
  }

  player(x, y, opts = {}) {
    return this.add(new Player({ x, y, ...opts }));
  }

  switch(x, y, opts = {}) {
    return this.add(new Switch({ x, y, ...opts }));
  }

  key(x, y, opts = {}) {
    return this.add(new Key({ x, y, ...opts }));
  }

  door(x, y, w, h, opts = {}) {
    return this.add(new Door({ x, y, w, h, ...opts }));
  }

  lamp(x, y, opts = {}) {
    return this.add(new Lamp({ x, y, ...opts }));
  }

  blastlamp(x, y, opts = {}) {
    return this.add(new BlastLamp({ x, y, ...opts }));
  }

  beaker(x, y, w, h, opts = {}) {
    return this.add(new Beaker({ x, y, w, h, ...opts }));
  }

  rope(x, y, opts = {}) {
    return this.add(new Rope({ x, y, ...opts }));
  }

  gas(x, y, w, h, opts = {}) {
    return this.add(new GasColumn({ x, y, w, h, ...opts }));
  }

  sign(x, y, text, opts = {}) {
    return this.add(new Sign({ x, y, text, ...opts }));
  }

  portal(x, y, opts = {}) {
    return this.add(new Portal({ x, y, ...opts }));
  }

  gasdetector(x, y, opts = {}) {
    return this.add(new GasDetector({ x, y, ...opts }));
  }

  extractor(x, y, opts = {}) {
    return this.add(new Extractor({ x, y, ...opts }));
  }

  dropper(x, y, opts = {}) {
    return this.add(new Dropper({ x, y, ...opts }));
  }

  gasbottle(x, y, opts = {}) {
    return this.add(new GasBottle({ x, y, ...opts }));
  }

  add(obj) {
    if (!obj.origin) obj.origin = { kind: 'level' }; // 关卡预设物体：来源=关卡生成
    this.scene.addObject(obj);
    return this;
  }

  /** 关卡自定义反应（最高优先级，覆盖内置反应）：'Cu + FeCl3 → CuCl2 + FeCl2' */
  reaction(str) {
    const rule = parseReactionStr(str);
    if (rule) this.scene.customReactions.push(rule);
    return this;
  }

  /** 插件组件（v2）：按 type 实例化插件注册的组件并放入场景。
   *  组件对象由插件 construct(opts) 创建——需实现引擎对象契约（Obj 子类或 update/render）。 */
  pluginObj(type, opts = {}) {
    const obj = Plugins.create(type, opts);
    if (!obj) throw new Error(`插件组件未注册: ${type}`);
    return this.add(obj);
  }

  /**
   * @deprecated 调试模式改用 URL 参数开启：`levels/xxx.html?debug=1`。
   * 本方法保留兼容（旧关卡脚本链式调用不报错），但**不再生效**——
   * 调试开关从"写死在关卡文件"变为"打开页面的诉求"，方便随时开关。
   */
  debugmode() {
    return this;
  }

  setTip(s) {
    this.scene.tip = s;
    return this;
  }

  on(name, fn) {
    this.scene.on(name, fn);
    return this;
  }

  build() {
    // 注入相机（爆炸屏幕震动用）
    this.scene.camera = this.renderer.camera;
    // 调试模式：URL 参数 ?debug=1 开启（.debugmode() 已废弃，见下）
    if (typeof location !== 'undefined' && /[?&]debug=1/.test(location.search)) {
      this.scene.debugMode = true;
    }
    // 无玩家时相机聚焦关卡内容包围盒：否则显示世界中央，物体（滴管等）不在视口
    // 内——玩家看不到也点不到（"点击没反应"的根源）
    if (!this.scene.player) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const o of this.scene.objects) {
        if (!(o.w > 0) || !(o.h > 0)) continue;
        x0 = Math.min(x0, o.x);
        x1 = Math.max(x1, o.x + o.w);
        y0 = Math.min(y0, o.y);
        y1 = Math.max(y1, o.y + o.h);
      }
      if (x1 > -Infinity) {
        this.scene.cameraFocus = { x: x0 - 60, y: y0 - 40, w: x1 - x0 + 120, h: y1 - y0 + 80 };
      }
    }
    return this.scene;
  }

  /** 启动：状态→输入→点击（提示/选格）→触控（移动端）→鸟瞰输入→主循环 */
  start() {
    const scene = this.build();
    scene.status = 'running';
    this.unbind = bindKeyboard(scene);
    this.bindClick();
    // 移动端触控（摇杆/按钮/拖动管线）；桌面端绑定但按 isTouchDevice 门槛空转
    this.touch = bindTouchUI(this.renderer.canvas, () => ({ scene: this.scene, hud: this.hud }));
    scene._touchUI = this.touch.ui;
    // 鸟瞰输入（灵魂出窍）：滚轮缩放 + 拖动平移（仅 scene.overview 时生效）
    this.unbindOverview = bindOverviewInput(this.renderer.canvas, () => ({ scene: this.scene }));
    // 操作录制/回放面板（开发工具：?record=1 显示；拖入录制的 .json 回放）
    if (typeof location !== 'undefined' && /[?&]record=1/.test(location.search)) {
      this.recorder = attachRecorderPanel(() => this.scene, this.renderer.canvas);
    }
    this.stop = startLoop(scene, this.renderer, { hud: this.hud });
    return scene;
  }

  bindClick() {
    const canvas = this.renderer.canvas;
    const scene = this.scene;
    const screenPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    };
    // 记录鼠标位置（调试模式悬停显示物体来源用）；离开画布清除
    const onMove = (e) => {
      if (!scene.debugMode) return;
      const { x, y } = screenPos(e);
      scene.mouse = { x, y, on: true };
    };
    const onLeave = () => {
      if (scene.mouse) scene.mouse.on = false;
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    // 点击：提示按钮 / 物品栏选格 / 场景内可点击物体（滴管等 onTap）
    bindSceneClick(canvas, screenPos, () => ({ scene: this.scene, hud: this.hud }));
  }
}

exports.LevelBuilder = LevelBuilder;

  };
  __modules["src/level/plugins.js"] = function (module, exports, __require) {
// ============================================================================
// 插件系统：把"关卡额外逻辑"做成可加载、可配置、可导出的 JS 插件。
// ----------------------------------------------------------------------------
// 插件 = 一个 JS 文件：
//   - 文件头带 @@chezzle-plugin 元数据注释块（编辑器不执行代码即可展示/配置）；
//   - 代码调用 Chezzle.Plugin.register('name', def) 注册运行时定义。
// 运行时注入点：scene 构建完毕、主循环启动之前 —— Chezzle.Plugin.inject(scene, entries)。
// 插件约定：顶层代码只做 register（不要产生副作用）；行为写在 def.run(scene, api, cfg) 里。
// ============================================================================

const { parseReactionStr } = __require('src/chem/substances.js');;

const registry = new Map(); // name -> def

/** 给插件/关卡脚本的稳定 API 面（scene 本身仍可裸访问，那是不设防的后门） */
function makeApi(scene) {
  return {
    scene,
    /** 按 id 取物体 */
    byId: (id) => scene.byId[id],
    /** 按类型取当前场景物体（对象构造器名，如 'Lamp'；或用 'typeName' 字段） */
    objects: (type) => scene.objects.filter((o) => o.typeName === type || o.constructor?.name === type),
    /** 注入自定义反应（最高优先级，覆盖内置反应）；返回是否解析成功 */
    addReaction: (str) => {
      const rule = parseReactionStr(str);
      if (rule) scene.customReactions.push(rule);
      return !!rule;
    },
    /** 修改关卡提示（HUD 顶部） */
    tip: (s) => { scene.tip = s; },
    /** 游戏时间秒（受调试暂停控制） */
    time: () => scene.time,
    /** 便捷：等待/每帧/下一帧/周期（同 scene 同名方法） */
    wait: scene.wait.bind(scene),
    after: scene.after.bind(scene),
    interval: scene.interval.bind(scene),
    onTick: scene.onTick.bind(scene),
    onKeyDown: scene.onKeyDown.bind(scene),
    onKeyUp: scene.onKeyUp.bind(scene),
    /** 场景事件（'complete' 等）：scene.on(name, fn) */
    on: scene.on.bind(scene),
    /** 播放特效（火星/爆炸/粒子…对应引擎能力） */
    spawnParticles: scene.spawnParticles.bind(scene),
    explode: scene.explode?.bind(scene) ?? (() => {}),
  };
}

const Plugins = {
  /** 注册一个插件定义。def: { run(scene,api,cfg)?, components?: [...] } */
  register(name, def = {}) {
    registry.set(name, def);
    return def;
  },

  get(name) {
    return registry.get(name);
  },

  has(name) {
    return registry.has(name);
  },

  list() {
    return [...registry.entries()].map(([name, def]) => ({ name, def }));
  },

  /** 全部已注册名（编辑器加载插件后 diff 用：确定该文件注册了哪个名字） */
  names() {
    return [...registry.keys()];
  },

  /** 运行一个插件：run(scene, api, cfg)。返回 run 的返回值（可以是清理函数） */
  call(name, scene, cfg = {}) {
    const def = registry.get(name);
    if (!def || typeof def.run !== 'function') return null;
    const r = def.run(scene, makeApi(scene), cfg ?? {});
    return typeof r === 'function' ? r : null;
  },

  /**
   * 关卡注入点（scene 构建后、start 前调用）：
   * entries = [{ name: 'lampDelay', cfg: { ... } }, ...]
   * 返回一个清理函数（在场景终止时调用）。
   */
  inject(scene, entries = []) {
    const cleanups = [];
    for (const e of entries) {
      if (!e || !e.name) continue;
      const def = registry.get(e.name);
      if (!def) continue; // 插件未加载/已注册名不匹配：静默跳过（不同关卡可共享同一插件集）
      try {
        const r = def.run ? def.run(scene, makeApi(scene), e.cfg ?? {}) : null;
        if (typeof r === 'function') cleanups.push(r);
      } catch (err) {
        // 插件运行时错误：记录但绝不拖垮游戏循环
        if (typeof console !== 'undefined') console.error(`[plugin:${e.name}]`, err);
      }
    }
    return () => {
      for (const c of cleanups) {
        try { c(); } catch (err) { /* 同上 */ }
      }
    };
  },

  // ---------------------------------------------------------------------------
  // v2：组件（插件可注册"新的可放置物体"，编辑器目录/属性/导出成为一等公民）
  // ---------------------------------------------------------------------------

  /** 按 type 实例化一个插件组件（缺 type 定义时返回 null） */
  create(type, opts = {}) {
    for (const [, def] of registry) {
      for (const comp of def.components ?? []) {
        if (comp.type === type && typeof comp.construct === 'function') {
          const obj = comp.construct(opts);
          if (obj && !obj.origin) obj.origin = { kind: 'plugin', plugin: comp.type };
          return obj;
        }
      }
    }
    return null;
  },

  /** 全部已注册组件的声明（编辑器据此渲染目录/属性面板） */
  components() {
    const out = [];
    for (const [plugin, def] of registry) {
      for (const c of def.components ?? []) out.push({ plugin, ...c });
    }
    return out;
  },

  // ---------------------------------------------------------------------------
  // 元数据：解析插件源码头部的 @@chezzle-plugin 注释块（编辑器展示/配置用，不执行代码）
  // ---------------------------------------------------------------------------

  /**
   * 解析源码中的元数据块：
   *   // @@chezzle-plugin
   *   // { "name": "延迟出现", "api": 1, "fields": [...], "components": [...] }
   *   // @@end
   * 返回对象或 null。
   */
  parseMeta(src) {
    if (typeof src !== 'string') return null;
    const m = src.match(/@@chezzle-plugin\s*([\s\S]*?)\s*@@end/);
    if (!m) return null;
    const text = m[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\/\/\s?/, '').replace(/^\s*\*+\s?/, ''))
      .join('\n')
      .trim();
    try {
      const meta = JSON.parse(text);
      return meta && typeof meta === 'object' ? meta : null;
    } catch (err) {
      return null;
    }
  },
};

/** 单数别名：插件文件/关卡脚本里习惯写 Chezzle.Plugin.register(...) */
const Plugin = Plugins;

exports.Plugins = Plugins;
exports.Plugin = Plugin;

  };
  __modules["src/render/renderer.js"] = function (module, exports, __require) {
// ============================================================================
// 最小渲染器：清屏 → 相机缩放 → 逐对象渲染 → HUD
// 对象只需实现 render(ctx, opts)。渲染器本身不关心对象类型（解耦）。
// 沉淀粒子**逐颗渲染**（不再聚类合并成大圆——那会让一堆 0.5g 颗粒看起来像
// 一颗 16px 的"巨大沉淀"，与"合并后 ≤1.5 倍尺寸"的约定冲突）。
// ============================================================================

const { Camera } = __require('src/render/camera.js');;
const { renderBackground } = __require('src/render/background.js');;
const { Particle } = __require('src/objects/particle.js');;

function renderParticles(ctx, particles, opts) {
  for (const pt of particles) {
    if (pt.amount <= 1e-9) continue;
    pt.render(ctx, opts); // 每颗按真实尺寸（0.5g→5px；合并 1.5g→7.5px）
  }
}

class Renderer {
  constructor(canvas, { worldW = 1000, worldH = 800, viewW = 1000, viewH = 800 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera({ worldW, worldH, viewW, viewH });
    this.worldW = worldW;
    this.worldH = worldH;
  }

  /** 适配画布尺寸（等比缩放由相机完成） */
  resize(vw, vh) {
    this.canvas.width = vw;
    this.canvas.height = vh;
  }

  clear() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  /** 渲染一帧；opts.focus 为相机跟随目标（通常玩家） */
  frame(objects, opts = {}) {
    this.clear();
    const ctx = this.ctx;
    // 背景（屏幕空间，神话夜色）
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderBackground(ctx, this.canvas.width, this.canvas.height, opts.time ?? 0);
    ctx.restore();
    // 世界对象
    ctx.save();
    this.camera.apply(ctx, this.canvas.width, this.canvas.height, opts.focus);
    const particles = [];
    for (const obj of objects) {
      if (obj instanceof Particle) { particles.push(obj); continue; }
      if (obj && typeof obj.render === 'function') obj.render(ctx, opts);
    }
    renderParticles(ctx, particles, opts);
    ctx.restore();
    if (opts.hud && typeof opts.hud.render === 'function') opts.hud.render(ctx, opts.time ?? 0);
  }
}

exports.Renderer = Renderer;

  };
  __modules["src/render/camera.js"] = function (module, exports, __require) {
// ============================================================================
// 相机：逻辑视口（默认 1000×800）等比缩放居中；世界比视口大时跟随 focus 滚动。
// 鸟瞰模式（overview）：忽略 focus，用自由视图 {scale, ox, oy}——整关缩放/平移
//   （灵魂出窍；由 Scene.setOverview 开关，pan/zoom 由鸟瞰输入管线驱动）。
// ============================================================================

const { CFG } = __require('src/core/config.js');;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

class Camera {
  constructor({ viewW = 1000, viewH = 800, worldW = 1000, worldH = 800 } = {}) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.mobileViewH = 0; // 移动端视野高度（0 = 桌面默认）；由 touchui 按设备设置
    this.worldW = worldW;
    this.worldH = worldH;
    this._shake = 0; // 屏幕震动强度（px），每帧衰减
    // 鸟瞰（自由视图）：_ov = {scale, ox, oy}（scale = 屏幕px/世界px；ox/oy = 视窗左上角世界坐标）
    this.overview = false;
    this._ov = null; // 惰性初始化（首次 compute 时按当前画布尺寸适配整关）
  }

  /** 触发屏幕震动（爆炸/剧烈反应） */
  shake(amount) {
    this._shake = Math.min(18, Math.max(this._shake, amount));
  }

  /** 当前震动偏移（随机，随帧衰减） */
  shakeOffset() {
    if (this._shake <= 0.05) return { x: 0, y: 0 };
    const a = this._shake;
    this._shake *= 0.86;
    const ang = Math.random() * Math.PI * 2;
    return { x: Math.cos(ang) * a, y: Math.sin(ang) * a * 0.6 };
  }

  // ---- 鸟瞰（灵魂出窍）：自由缩放/平移 ------------------------------------

  enterOverview() {
    this.overview = true;
    this._ov = null; // 下一帧按当前画布尺寸重新适配整关
  }

  exitOverview() {
    this.overview = false;
    this._ov = null;
  }

  /** 鸟瞰初始视图：整个世界适配进画布并居中 */
  _ovFit(vw, vh) {
    const scale = Math.min(vw / this.worldW, vh / this.worldH);
    return this._ovClamp({ scale, ox: 0, oy: 0 }, vw, vh);
  }

  /** 把鸟瞰视图钳制在世界内（视图大于世界 → 居中） */
  _ovClamp(v, vw, vh) {
    const viewW = vw / v.scale;
    const viewH = vh / v.scale;
    v.ox = viewW >= this.worldW ? (this.worldW - viewW) / 2 : clamp(v.ox, 0, this.worldW - viewW);
    v.oy = viewH >= this.worldH ? (this.worldH - viewH) / 2 : clamp(v.oy, 0, this.worldH - viewH);
    return v;
  }

  /** 鸟瞰平移（屏幕像素位移 → 世界位移） */
  panOverview(dxScreen, dyScreen, vw, vh) {
    if (!this.overview) return;
    if (!this._ov) this._ov = this._ovFit(vw, vh);
    this._ov.ox -= dxScreen / this._ov.scale;
    this._ov.oy -= dyScreen / this._ov.scale;
    this._ovClamp(this._ov, vw, vh);
  }

  /** 鸟瞰缩放：factor 缩放比，(px,py) = 缩放中心（屏幕像素，光标/双指中点——该世界点保持不动） */
  zoomOverview(factor, px, py, vw, vh) {
    if (!this.overview || !(factor > 0)) return;
    if (!this._ov) this._ov = this._ovFit(vw, vh);
    const minS = Math.min(vw / this.worldW, vh / this.worldH); // 最远 = 整关一屏
    const maxS = Math.max(minS * 16, 3); // 最近 = 放大到能看清细节
    const ns = clamp(this._ov.scale * factor, minS, maxS);
    // 保持 (px,py) 下的世界点不动：wx = ox + px/s → ox' = wx - px/ns
    const wx = this._ov.ox + px / this._ov.scale;
    const wy = this._ov.oy + py / this._ov.scale;
    this._ov.scale = ns;
    this._ov.ox = wx - px / ns;
    this._ov.oy = wy - py / ns;
    this._ovClamp(this._ov, vw, vh);
  }

  /**
   * 计算缩放与屏幕偏移。focus 为可选跟随目标（{x,y,w,h}，通常是玩家）。
   * 世界 ≤ 视口时居中显示整个世界；世界 > 视口时跟随 focus 滚动（钳制在世界内）。
   * 移动端（mobileViewH>0 且横屏）：高度按 mobileViewH 收窄 → 世界内容按屏幕
   * 比例变宽（跟随玩家），玩家在手机上不再缩成小点；同时视窗中心按 focusBias
   * 下移——玩家画在屏幕中上部，不被左上面板/右下触控控件遮挡。
   * 鸟瞰模式（overview）：忽略 focus，用自由视图。
   */
  compute(vw, vh, focus = null) {
    if (this.overview) {
      if (!this._ov) this._ov = this._ovFit(vw, vh);
      const { scale, ox, oy } = this._ov;
      return { scale, ox, oy, offsetX: -ox * scale, offsetY: -oy * scale };
    }
    let viewW = this.viewW;
    let viewH = this.viewH;
    let biasY = 0;
    let padTop = viewH * CFG.touch.padTop; // 顶部探出量（双端；爬高时相机跟进天空）
    if (this.mobileViewH > 0 && vw > 0 && vh > 0 && vh < vw) {
      viewH = this.mobileViewH;
      viewW = Math.max(1, viewH * (vw / vh));
      biasY = viewH * CFG.touch.focusBias; // 视窗中心下移 → 玩家画在屏幕偏上
      padTop = viewH * CFG.touch.padTop;
    }
    const scale = Math.min(vw / viewW, vh / viewH);
    // 实际显示的世界窗口（单位：世界坐标）
    const vx = Math.min(this.worldW, viewW);
    const vy = Math.min(this.worldH, viewH);
    // 窗口原点 ox, oy。下缘钳位放宽 biasY：玩家永远贴着世界底部走（地板在
    // worldH 附近），若只把期望值下移会被底缘钳位吞掉——放宽后视窗探到世界
    // 底边之下（空背景，正被摇杆/按钮控件盖住），玩家才能真的画到屏幕中上部。
    // 上缘钳位放宽 padTop（负方向）：玩家爬到世界顶时相机继续上移探出顶边
    // （上方是空天空），玩家不被钉在屏幕顶缘、上方环境不被 HUD 卡片盖住。
    let ox;
    let oy;
    if (focus) {
      const cx = focus.x + (focus.w ?? 0) / 2;
      const cy = focus.y + (focus.h ?? 0) / 2;
      ox = clamp(cx - vx / 2, 0, Math.max(0, this.worldW - vx));
      oy = clamp(cy - vy / 2 + biasY, -padTop, Math.max(-padTop, this.worldH - vy + biasY));
    } else {
      ox = (this.worldW - vx) / 2;
      oy = (this.worldH - vy) / 2;
    }
    // 屏幕偏移：把 vx×vy 窗口放到 vw×vh 画布中央
    const offsetX = (vw - vx * scale) / 2 - ox * scale;
    const offsetY = (vh - vy * scale) / 2 - oy * scale;
    return { scale, ox, oy, offsetX, offsetY };
  }

  /** 应用到 canvas 上下文（世界坐标 → 屏幕坐标；含震动偏移） */
  apply(ctx, vw, vh, focus = null) {
    const { scale, offsetX, offsetY } = this.compute(vw, vh, focus);
    const sh = this.shakeOffset();
    ctx.setTransform(scale, 0, 0, scale, offsetX + sh.x, offsetY + sh.y);
  }
}

exports.Camera = Camera;

  };
  __modules["src/render/background.js"] = function (module, exports, __require) {
// ============================================================================
// 背景渲染（屏幕空间）：神殿夜色的纵向渐变 + 底部微光 + 漂浮尘埃 + 暗角。
// ============================================================================

const { THEME } = __require('src/render/theme.js');;

function renderBackground(ctx, W, H, time = 0) {
  // 纵向渐变
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, THEME.bg.top);
  g.addColorStop(0.55, THEME.bg.mid);
  g.addColorStop(1, THEME.bg.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 底部一缕神秘紫光
  const g2 = ctx.createLinearGradient(0, H * 0.72, 0, H);
  g2.addColorStop(0, 'rgba(120,90,220,0)');
  g2.addColorStop(1, 'rgba(120,90,220,0.12)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  // 漂浮尘埃（确定性，随时间缓动）
  const n = 42;
  for (let i = 0; i < n; i++) {
    const px = (((i * 7919) % 997) / 997) * W;
    const py = (((i * 104729) % 991) / 991) * H + Math.sin(time * 0.4 + i * 1.7) * 4;
    const r = 1 + (i % 3) * 0.7;
    const a = 0.10 + 0.22 * Math.abs(Math.sin(time * 0.7 + i * 2.3));
    ctx.fillStyle = i % 3 === 0 ? 'rgba(199,139,255,0.9)' : 'rgba(255,217,120,0.9)';
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 暗角
  const cx = W / 2;
  const cy = H / 2;
  const v = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.32, cx, cy, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(4,3,16,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

exports.renderBackground = renderBackground;

  };
  __modules["src/render/hud.js"] = function (module, exports, __require) {
// ============================================================================
// HUD（神话·元素风）：
// 左上 信息卡（双端统一单卡：物质/体质 + 身体组成 + 大气一行；触屏半透明）；
// 右上 ⛶全屏（触屏）/ 鸟瞰 / 提示按钮（触屏端整体下移避让悬浮钮/系统按钮）；
// 右下 5 格宝石物品栏（选中发光）；通关/死亡神话遮罩；"最近反应"仅调试模式。
// 鸟瞰（灵魂出窍）：暂停模拟，整关自由缩放/平移——HUD 只留"返回"按钮 + 操作提示。
// ============================================================================

const { THEME, rr, panel, glowText, clearText } = __require('src/render/theme.js');;
const { getSubstance, acidLabelOf } = __require('src/chem/substances.js');;
const { MIN_ENTRY } = __require('src/chem/solution.js');;
const { solutionColor } = __require('src/render/liquidrender.js');;
const { CFG } = __require('src/core/config.js');;
const { GasColumn } = __require('src/objects/gascolumn.js');;
const { Block } = __require('src/objects/block.js');;
const { inventorySlotRects, uiMargins, overviewButtonRect, fullscreenButtonRect, hudTopOffset } = __require('src/level/click.js');;
const { joyGeom, touchButtonRects } = __require('src/core/touch.js');;

// 溯源 kind → 中文（调试悬停显示物体"为何存在"）
const ORIGIN_LABELS = {
  level: '关卡生成',
  reaction: '反应生成',
  explosion: '爆炸掉落',
  place: '玩家放置',
  shell: '移动脱落',
  dissolve: '溶解',
};

// 大气中的非常驻气体 → 显示色（燃料气爆鸣预警等；airPanel/紧凑卡共用）
const GAS_COLORS = {
  CO: '#ffb86b', H2: '#9adcff', CH4: '#a8ff9a', H2S: '#ffd9a0',
  NO: '#cfe3f7', NO2: '#e08b57', SO2: '#ffd98a', Cl2: '#b9f26b', NH3: '#b9a9ff',
};
const EXTRA_GAS_IDS = ['CO', 'H2', 'CH4', 'H2S', 'NO', 'NO2', 'SO2', 'Cl2', 'NH3'];

class Hud {
  constructor(scene) {
    this.scene = scene;
    this.showTip = false;
    this.slotSize = 46; // 旧版统一槽宽（现为兼容字段；实际几何走 inventorySlotRects）
  }

  /** 当前是否触屏端（移动端 HUD 压缩/全屏按钮都以它为准） */
  _isTouch() {
    const t = this.scene._touchUI;
    return !!(t && typeof t.enabled === 'function' && t.enabled());
  }

  render(ctx, time = 0) {
    const scene = this.scene;
    const p = scene.player;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 鸟瞰（灵魂出窍）：干净的全局视图——只画返回按钮/操作提示/玩家魂标
    if (scene.overview) {
      this.overviewUI(ctx, scene, W, H, time);
      this.rotateHint(ctx, scene, W, H);
      this.overlay(ctx, scene, W, H);
      ctx.restore();
      return;
    }

    if (p) {
      // 左上信息卡（双端统一紧凑单卡）：物质/体质 + 身体组成 + 大气一张卡解决；
      // 移动端面板体降透明（CFG.touch.hudAlpha），桌面不透明
      this.playerPanelCompact(ctx, p, scene, time, hudTopOffset(scene));
      // 最近反应本就是调试信息：非调试模式不显示（双端一致）
      if (scene.debugMode) this.reactionPanel(ctx, p);
      this.inventory(ctx, p, W, H, time);
    }
    this.debugPanel(ctx, scene, W, H, time);
    if (scene.debugMode) this.hoverPanel(ctx, scene, W, H);
    const top = hudTopOffset(scene);
    this.viewButton(ctx, W, top);
    if (this._isTouch()) this.fsButton(ctx, W, top);
    this.tipButton(ctx, W, H, top);
    this.notice(ctx, scene, W, H, time);
    this.touchControls(ctx, scene, W, H, time);
    this.rotateHint(ctx, scene, W, H);
    this.overlay(ctx, scene, W, H);
    ctx.restore();
  }

  // ---- 顶部按钮：鸟瞰（双端）/ 全屏（触屏）；y 走 hudTopOffset（触屏避让
  //      "返回选关"悬浮钮与 iOS 系统全屏关闭钮；渲染与命中同源）--------------

  /** 鸟瞰按钮（提示按钮左侧；桌面 V 键同效） */
  viewButton(ctx, W, top = 10) {
    const r = overviewButtonRect(W, top);
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 8);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#2a3a5e');
    g.addColorStop(1, '#141d38');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.water.light;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = THEME.water.light;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#bfe6ff';
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('鸟瞰', r.x + r.w / 2, r.y + 20);
    ctx.textAlign = 'left';
  }

  /** 全屏按钮（仅触屏端；图标 ⛶。首次触点已自动请求全屏，此按钮供随时切换） */
  fsButton(ctx, W, top = 10) {
    const r = fullscreenButtonRect(W, top);
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 8);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#2a3a5e');
    g.addColorStop(1, '#141d38');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(191,230,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#bfe6ff';
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⛶', r.x + r.w / 2, r.y + 20);
    ctx.textAlign = 'left';
  }

  // ---- 鸟瞰（灵魂出窍）界面：返回按钮 + 操作提示（干净的全局视图）-----------

  overviewUI(ctx, scene, W, H, time) {
    const top = hudTopOffset(scene);
    // 返回按钮（命中几何走 overviewButtonRect，点击/触点均可退出）
    const r = overviewButtonRect(W, top);
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 8);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#7a5a20');
    g.addColorStop(1, '#4a3410');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.gold.light;
    ctx.lineWidth = 2;
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('返回', r.x + r.w / 2, r.y + 20);
    // 操作提示
    const touch = this._isTouch();
    const hint = touch ? '鸟瞰 · 单指拖动平移 · 双指捏合缩放' : '鸟瞰 · 滚轮缩放 · 拖动平移 · V 返回';
    ctx.font = 'bold 12px "Segoe UI", "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(hint).width;
    rr(ctx, W / 2 - tw / 2 - 14, top + 2, tw + 28, 24, 8);
    ctx.fillStyle = 'rgba(10,12,26,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,224,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#bfe6ff';
    ctx.fillText(hint, W / 2, top + 18);
    ctx.textAlign = 'left';
  }

  // ---- 移动端触控（摇杆 + 右下按钮；仅触屏设备绘制） ----
  touchControls(ctx, scene, W, H, time) {
    const ui = scene._touchUI;
    if (!ui || !ui.enabled()) return;
    if (scene.overview) return; // 鸟瞰：触控改走平移/捏合手势，不画游戏控件
    const touch = ui.insets;
    ctx.save();
    // —— 左下：半透明半圆摇杆基座（直径贴底边）——
    const g = joyGeom(W, H, touch);    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.R, Math.PI, 0); // 上半圆
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 5 向刻度（上/左上/右上/左/右），激活方向高亮
    const TICKS = [
      { ux: 0, uy: -1, on: () => ui.joy && ui.joy.dir.jump && !ui.joy.dir.left && !ui.joy.dir.right },
      { ux: -0.7071, uy: -0.7071, on: () => ui.joy && ui.joy.dir.jump && ui.joy.dir.left },
      { ux: 0.7071, uy: -0.7071, on: () => ui.joy && ui.joy.dir.jump && ui.joy.dir.right },
      { ux: -1, uy: 0, on: () => ui.joy && ui.joy.dir.left && !ui.joy.dir.jump },
      { ux: 1, uy: 0, on: () => ui.joy && ui.joy.dir.right && !ui.joy.dir.jump },
    ];
    for (const t of TICKS) {
      const tx = g.cx + t.ux * (g.R - 11);
      const ty = g.cy + t.uy * (g.R - 11);
      const active = t.on();
      ctx.beginPath();
      ctx.arc(tx, ty, active ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'rgba(255,215,106,0.9)' : 'rgba(232,184,75,0.35)';
      ctx.fill();
    }
    // 摇杆球（吸附位置；未触摸时居中淡显）
    const ox = ui.joy ? ui.joy.sx : 0;
    const oy = ui.joy ? ui.joy.sy : 0;
    ctx.beginPath();
    ctx.arc(g.cx + ox, g.cy + oy, 34, 0, Math.PI * 2);
    ctx.fillStyle = ui.joy ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = ui.joy ? 'rgba(255,215,106,0.85)' : 'rgba(232,184,75,0.4)';
    ctx.lineWidth = ui.joy ? 2 : 1.2;
    ctx.stroke();
    // —— 右下：四键（按住=长按语义同键盘；无玩家场景不画）。
    //     键位字母（C/X/Q/⇧）对触屏玩家无意义 → 换成语义 SVG 矢量图标 +
    //     下方二字说明（拾取/倒出/收集/放置）——
    if (scene.player) {
      const LABELS = { grab: '拾取', use: '倒出', collect: '收集', place: '放置' };
      for (const r of ui.buttonRects()) {
        const cap = LABELS[r.key] ?? '';
        const down = ui.isPressed(r.key);
        ctx.save();
        rr(ctx, r.x, r.y, r.size, r.size, 14);
        const gr = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.size);
        gr.addColorStop(0, down ? 'rgba(90,64,20,0.95)' : 'rgba(38,32,74,0.88)');
        gr.addColorStop(1, down ? 'rgba(48,32,10,0.95)' : 'rgba(14,11,36,0.88)');
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.strokeStyle = down ? 'rgba(255,215,106,0.95)' : 'rgba(232,184,75,0.45)';
        ctx.lineWidth = down ? 2 : 1.2;
        if (down) {
          ctx.shadowColor = 'rgba(255,215,106,0.8)';
          ctx.shadowBlur = 12;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        this._touchIcon(ctx, r.key, r.x + r.size / 2, r.y + r.size / 2 - 6, down ? '#fff6d8' : '#ffe9b0');
        ctx.fillStyle = down ? '#ffd76a' : 'rgba(255,233,176,0.62)';
        ctx.font = '9.5px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.fillText(cap, r.x + r.size / 2, r.y + r.size - 9);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** 触控按钮矢量图标（canvas 路径画的"SVG 小图"，原点 = 图标中心）：
   *  grab=四角框选+目标点（抓取） / use=倾斜烧杯倒液（倒出） /
   *  collect=马蹄磁铁（吸集） / place=落点箭头（放置到地上） */
  _touchIcon(ctx, key, cx, cy, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (key === 'grab') {
      // 四角括号 + 中心目标点（"框选抓取"）
      ctx.moveTo(-3.5, -9); ctx.lineTo(-9, -9); ctx.lineTo(-9, -3.5);
      ctx.moveTo(3.5, -9); ctx.lineTo(9, -9); ctx.lineTo(9, -3.5);
      ctx.moveTo(-3.5, 9); ctx.lineTo(-9, 9); ctx.lineTo(-9, 3.5);
      ctx.moveTo(3.5, 9); ctx.lineTo(9, 9); ctx.lineTo(9, 3.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (key === 'use') {
      // 倾斜小烧杯 + 倒出的液滴
      ctx.rotate(-0.62);
      ctx.moveTo(-6, -5);
      ctx.lineTo(-6, 5);
      ctx.quadraticCurveTo(-6, 7.5, -3.5, 7.5);
      ctx.lineTo(3.5, 7.5);
      ctx.quadraticCurveTo(6, 7.5, 6, 5);
      ctx.lineTo(6, -5);
      ctx.stroke();
      ctx.rotate(0.62);
      ctx.beginPath(); ctx.arc(10.5, -2, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(13, 4, 2.0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11, 10.5, 2.3, 0, Math.PI * 2); ctx.fill();
    } else if (key === 'collect') {
      // 马蹄磁铁（开口朝下，两极短杠）——"吸集"沉淀
      ctx.moveTo(-7.5, 5);
      ctx.lineTo(-7.5, -1);
      ctx.arc(0, -1, 7.5, Math.PI, 0);
      ctx.lineTo(7.5, 5);
      ctx.moveTo(-3, 5);
      ctx.lineTo(-3, -1);
      ctx.arc(0, -1, 3, Math.PI, 0);
      ctx.lineTo(3, 5);
      ctx.stroke();
      ctx.fillRect(-7.5, 6.6, 4.5, 3);
      ctx.fillRect(3, 6.6, 4.5, 3);
    } else if (key === 'place') {
      // 下落箭头 + 地面基线（"放下去"）
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 2);
      ctx.moveTo(-4.5, -2.5);
      ctx.lineTo(0, 2);
      ctx.lineTo(4.5, -2.5);
      ctx.moveTo(-8.5, 8);
      ctx.lineTo(8.5, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 竖屏提示（移动端）：半透明压暗 + 手机旋转图标 + 文案（游戏照常运行） */
  rotateHint(ctx, scene, W, H) {
    const ui = scene._touchUI;
    if (!ui || !ui.isPortrait()) return;
    ctx.save();
    ctx.fillStyle = 'rgba(6,5,20,0.82)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2;
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2); // 手机框画成"横过来的手机 + 箭头"
    // 手机机身
    rr(ctx, -34, -58, 68, 116, 12);
    ctx.strokeStyle = '#e8b84b';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -44, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#e8b84b';
    ctx.fill();
    ctx.rotate(0.62);
    // 旋转箭头（弧 + 箭头尖）
    ctx.beginPath();
    ctx.arc(0, 0, 88, -0.4, 2.4);
    ctx.strokeStyle = 'rgba(232,184,75,0.55)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();
    const fx = 88 * Math.cos(2.4);
    const fy = 88 * Math.sin(2.4);
    ctx.beginPath();
    ctx.moveTo(fx - 4, fy + 16);
    ctx.lineTo(fx + 14, fy + 3);
    ctx.lineTo(fx + 6, fy - 14);
    ctx.stroke();
    ctx.resetTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 20px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('请旋转设备', cx, cy + 68);
    ctx.fillStyle = '#9fb2c8';
    ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('横屏游玩体验更佳', cx, cy + 92);
    ctx.restore();
  }

  /** 场景通知横幅（拖动超距 / 吸取失败原因等；淡入淡出 ~1.6s） */
  notice(ctx, scene, W, H, time) {
    const n = scene._notice;
    if (!n) return;
    // 用 HUD 自己的帧时钟计时（挂到通知对象上，避免与场景暂停时钟错位）
    if (n._ft == null) n._ft = time;
    const age = time - n._ft;
    if (age > 1.6) {
      delete scene._notice;
      return;
    }
    const a = Math.min(1, age / 0.12) * Math.max(0, Math.min(1, (1.6 - age) / 0.35));
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.font = 'bold 13px "Segoe UI", "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(n.text).width;
    const bw = tw + 28;
    const bx = W / 2 - bw / 2;
    const by = H * 0.15;
    rr(ctx, bx, by, bw, 27, 8);
    ctx.fillStyle = 'rgba(10,12,26,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,130,0.8)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = 'rgba(255,140,100,0.55)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffdcc8';
    ctx.textAlign = 'center';
    ctx.fillText(n.text, W / 2, by + 19);
    ctx.restore();
  }

  // ---- 调试模式面板（F5 暂停/继续，F6 步进；显示玩家附近的每个反应 + 最近爆炸原因）----
  debugPanel(ctx, scene, W, H, time) {
    if (!scene.debugMode) return;
    const p = scene.player;
    const barW = 250;
    const px = W - barW - 10;
    // 右上角状态条（堆叠面板的当前顶 y；触屏下移避让悬浮钮/系统按钮）
    let top = hudTopOffset(scene);
    panel(ctx, px, top, barW, 22, THEME.gold.deep, 8);
    clearText(ctx, `调试 ${scene.debugPaused ? '[暂停] F5继续 F6步进' : '[运行] F5暂停'}·悬停查源·X切换`, px, top + 11, scene.debugPaused ? '#ffd23f' : '#7fe0ff', 'bold 11px "Segoe UI", sans-serif');
    top += 28;
    // 最近爆炸原因（爆炸发生后 4s 内显示）
    if (scene._lastExplosion && time - scene._lastExplosion.t < 4) {
      panel(ctx, px, top, barW, 20, THEME.fire.base, 8);
      clearText(ctx, `💥 ${scene._lastExplosion.cause}`, px + 4, top + 14, '#ffd9a0', 'bold 11px monospace');
      top += 26;
    }
    // 附近反应面板（玩家周围 300px 内最近发生的反应，去重显示每种反应）
    if (scene.debugReactions && p) {
      const nearAll = scene.debugReactions.filter((r) => r.x != null && Math.abs(r.x - p.x) < 300 && Math.abs((r.y ?? 0) - (p.y + p.h / 2)) < 400);
      // 去重：每种反应保留最近一条（避免同一反应刷屏）
      const near = [];
      const seen = new Set();
      for (const r of nearAll) {
        if (seen.has(r.text)) continue;
        seen.add(r.text);
        near.push(r);
        if (near.length >= 8) break;
      }
      if (near.length > 0) {
        const shown = near.length;
        const panelW = 320;
        const panelH = 22 + shown * 16;
        panel(ctx, W - panelW - 10, top, panelW, panelH, THEME.gold.deep, 8);
        clearText(ctx, `附近反应 (${near.length})`, W - panelW + 2, top + 15, THEME.gold.text, 'bold 11px "Segoe UI", sans-serif');
        let y = top + 29;
        for (const r of near.slice(0, shown)) {
          clearText(ctx, `› ${r.text}`, W - panelW + 2, y + 5, '#dfe8f2', '10px monospace');
          y += 16;
        }
        top += panelH + 8;
      }
    }
    // 大气气体变化（产生/消耗原因——最近 6 条；+绿/消耗橙红，← 原因方程式）
    if (scene.gasLog && scene.gasLog.length) {
      const shown = Math.min(6, scene.gasLog.length);
      const panelW = 380;
      const panelH = 22 + shown * 15;
      const gx = W - panelW - 10;
      panel(ctx, gx, top, panelW, panelH, THEME.toxic.base, 8);
      clearText(ctx, `气体变化 (${scene.gasLog.length})`, gx + 12, top + 15, THEME.toxic.light, 'bold 11px "Segoe UI", sans-serif');
      let gy = top + 28;
      for (let i = 0; i < shown; i++) {
        const g = scene.gasLog[i];
        // 小量精确显示：≥0.01g 显示 2 位，≥0.001g 显示 4 位，更小显示毫克
        const absD = Math.abs(g.delta);
        const sign = g.delta >= 0 ? '+' : '-';
        const dStr = absD >= 0.01 ? `${sign}${absD.toFixed(2)}g` : absD >= 0.001 ? `${sign}${absD.toFixed(4)}g` : `${sign}${(absD * 1000).toFixed(1)}mg`;
        const color = g.delta >= 0 ? '#a6ff9a' : '#ff9a6b';
        clearText(ctx, `${g.id} ${dStr}`, gx + 12, gy + 5, color, 'bold 10px monospace');
        const cause = g.cause ?? '未知';
        clearText(ctx, `← ${cause.slice(0, 30)}`, gx + 90, gy + 5, '#9fb2c8', '9px monospace');
        gy += 15;
      }
    }
  }

  // ---- 调试模式：鼠标悬停显示物体"为何存在"（来源溯源；X 键循环切换重叠目标）----
  hoverPanel(ctx, scene, W, H) {
    const m = scene.mouse;
    if (!m || !m.on) return;
    const cam = scene.renderer ? scene.renderer.camera : null;
    if (!cam) return;
    // 屏幕坐标 → 世界坐标（相机缩放/平移；忽略每帧随机震动，悬停无需精确到像素）
    const { scale, offsetX, offsetY } = cam.compute(W, H, scene.player);
    const wx = (m.x - offsetX) / scale;
    const wy = (m.y - offsetY) / scale;
    // 鼠标移动 → 重置候选与索引
    if (!this._hoverAt || Math.abs(this._hoverAt.x - m.x) > 1 || Math.abs(this._hoverAt.y - m.y) > 1) {
      this._hoverAt = { x: m.x, y: m.y };
      this._hoverIdx = 0;
    }
    const cands = this.collectHover(scene, wx, wy);
    if (cands.length === 0) return;
    // X 键（scene.debugHoverCycle）：在重叠物体间循环切换
    if (scene.debugHoverCycle) {
      scene.debugHoverCycle = false;
      this._hoverIdx = (this._hoverIdx + 1) % cands.length;
    }
    if (this._hoverIdx >= cands.length) this._hoverIdx = 0;
    const info = cands[this._hoverIdx];
    this.renderHoverTip(ctx, info, m.x, m.y, W, H, cands.length > 1 ? { idx: this._hoverIdx + 1, total: cands.length } : null);
  }

  /**
   * 命中检测：收集鼠标下所有重叠物体的来源信息（按优先级排序——
   * 玩家>沉淀>池内颗粒>物块>气流>容器/静态）。默认显示第 0 个，X 键循环切换。
   */
  collectHover(scene, wx, wy) {
    const out = [];
    const hitRect = (o) => o && wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h;
    const inCircle = (cx, cy, r) => {
      const dx = wx - cx;
      const dy = wy - cy;
      return dx * dx + dy * dy <= r * r;
    };

    // 1. 玩家（核心+附着的壳：NaOH 关卡生成，Na2CO3/BaCO3 壳反应生成）
    const p = scene.player;
    if (p && hitRect(p)) {
      const info = this.objInfo(p, p.substance);
      const bd = this.gridBreakdown(p);
      if (bd && bd.length > 1) info.breakdown = bd;
      out.push(info);
    }

    // 2. 自由沉淀粒子（小圆；同种且重叠的合并为一条候选——与渲染聚类一致，
    //    否则掉落的一簇 20 颗叠在一起 → 悬停显示 20 条候选"20 个粒子叠在一起"）
    const hitParts = [];
    for (const pt of scene.particles) {
      if (pt.amount <= 1e-9) continue;
      if (inCircle(pt.x + pt.w / 2, pt.y + pt.h / 2, pt.w / 2 + 1)) hitParts.push(pt);
    }
    const merged = new Map(); // substance → { count, pt }
    for (const pt of hitParts) {
      const e = merged.get(pt.substance);
      if (e) { e.count++; continue; }
      merged.set(pt.substance, { count: 1, pt });
    }
    for (const [substance, e] of merged) {
      const info = this.objInfo(e.pt, e.count > 1 ? `${substance}×${e.count}` : substance);
      out.push(info);
    }

    // 3. 容器内沉淀颗粒（池/灯上的某一颗沉淀）
    for (const c of scene.containers) {
      for (const g of c.grains) {
        if (inCircle(g.x, g.y, g.r + 1)) {
          const origin = c.precipOrigins.get(g.id) ?? null;
          out.push({ label: '沉淀', name: `${g.id}（${c.hoverLabel ?? '容器'}内）`, origin });
        }
      }
    }

    // 4. 物块（动态固体；含多种物质时逐物质显示来源——初始=关卡生成、反应附着=反应生成）
    for (const o of scene.dynamics) {
      if (!(o instanceof Block) || !hitRect(o)) continue;
      const info = this.objInfo(o, o.grid ? o.grid.ids().join('+') : o.substance);
      const bd = this.gridBreakdown(o);
      if (bd && bd.length > 1) info.breakdown = bd;
      out.push(info);
    }

    // 5. 气流柱（反应产气的气流——显示是哪个反应生成的）
    for (const o of scene.objects) {
      if (!(o instanceof GasColumn) || !hitRect(o)) continue;
      out.push(this.objInfo(o, o.gasId ?? o.label ?? ''));
    }

    // 6. 容器/灯/静态元素（池、灯、开关、地板、路标、钥匙、门…）
    for (const o of scene.objects) {
      if (!o.hoverLabel || o instanceof GasColumn || o instanceof Block || o === p) continue;
      if (!hitRect(o)) continue;
      const info = this.objInfo(o, (o.opening ?? o.substance ?? ''));
      // 容器/灯：逐物质显示来源（某物质关卡生成、某物质反应生成…）
      if (o.solution || o.precipitates) info.breakdown = this.contentBreakdown(o);
      out.push(info);
    }
    return out;
  }

  /** 容器/灯内各物质及其来源（溶质 + 沉淀 + 水，按质量降序）——悬停药品池显示每样多少克 */
  contentBreakdown(c) {
    const out = [];
    for (const [id, mass] of c.solution.solutes) {
      if (mass < MIN_ENTRY) continue; // 微量溶质不显示：防"0.0g ↔ 无"的条目抖动
      // 酸类标注浓/稀（≥300 g/L = 浓，与引擎判定一致）
      const note = acidLabelOf(id, mass, c.solution.volume / 1000);
      out.push({ id, mass, origin: c.solOrigins?.get(id) ?? null, note });
    }
    for (const [id, mass] of c.precipitates) {
      if (mass < MIN_ENTRY) continue;
      // 沉淀标注合并数（几颗 0.5g 合并显示）：与自由沉淀粒子同规则
      out.push({ id, mass, origin: c.precipOrigins?.get(id) ?? null, note: `↓×${Math.max(1, Math.ceil(mass / CFG.maxParticleMass))}` });
    }
    if (c.solution.water > 0) out.push({ id: 'H2O', mass: c.solution.water, origin: { kind: 'solvent' } });
    return out.sort((a, b) => b.mass - a.mass);
  }

  /** 物块/玩家网格内各物质及其来源（初始=关卡生成，反应附着=反应生成） */
  gridBreakdown(o) {
    const masses = o.grid ? o.grid.masses() : null;
    if (!masses) return null;
    const out = [];
    for (const [id, mass] of Object.entries(masses)) {
      if (mass <= 1e-6) continue;
      out.push({ id, mass, origin: o.gridOrigins?.get(id) ?? null });
    }
    return out.sort((a, b) => b.mass - a.mass);
  }

  /** 组装提示信息 */
  objInfo(obj, name, origin = null) {
    return { label: obj.hoverLabel ?? '元素', name, origin: origin ?? obj.origin ?? null };
  }

  /** 容器内容标签（溶质 + 沉淀） */
  containerName(c) {
    const parts = [];
    for (const [id] of c.solution.solutes) parts.push(id);
    for (const [id] of c.precipitates) parts.push(`${id}(↓)`);
    if (parts.length === 0 && c.solution.water > 0) parts.push('H2O');
    return parts.join('+') || '空';
  }

  /** 来源短标签（只给种类，如"关卡生成/反应生成"） */
  originShort(origin) {
    if (!origin) return '未知';
    return ORIGIN_LABELS[origin.kind] ?? origin.kind;
  }

  /** 来源文本行（反应生成给出具体方程式，超长自动换行） */
  originLines(origin) {
    if (!origin) return ['来源：未知'];
    const head = ORIGIN_LABELS[origin.kind] ?? origin.kind;
    if (origin.kind === 'reaction' && origin.text) {
      return [`来源：${head}`, ...this.wrapCJK(origin.text, 34)];
    }
    if (origin.text) return [`来源：${head}（${origin.text}）`];
    return [`来源：${head}`];
  }

  /** 按字符宽度换行（中英混排按字符数截断） */
  wrapCJK(text, maxLen) {
    const out = [];
    for (let i = 0; i < text.length; i += maxLen) out.push(text.slice(i, i + maxLen));
    return out;
  }

  /** 渲染悬停提示框（鼠标附近，钳在画布内）；multi = {idx,total} 表示重叠目标循环切换 */
  renderHoverTip(ctx, info, sx, sy, W, H, multi = null) {
    let lines;
    if (info.breakdown && info.breakdown.length) {
      // 容器/灯/物块：逐物质显示来源 + 质量（各物质名 + 克数 + 来源，反应给方程式）
      lines = [`${info.label}（${info.breakdown.length} 种）`];
      const shown = info.breakdown.slice(0, 8);
      for (const it of shown) {
        const isWater = it.id === 'H2O';
        const tag = it.note ? `(${it.note})` : '';
        lines.push(`  ${it.id}${tag} ${it.mass.toFixed(1)}g · ${isWater ? '溶剂' : this.originShort(it.origin)}`);
        if (it.origin && it.origin.kind === 'reaction' && it.origin.text) {
          lines.push(...this.wrapCJK(it.origin.text, 30).map((s) => '    ' + s));
        }
      }
      if (info.breakdown.length > shown.length) lines.push(`  …另有 ${info.breakdown.length - shown.length} 种`);
    } else {
      lines = [`${info.label} ${info.name}`, ...this.originLines(info.origin)];
    }
    if (multi) lines.push(`⟨ ${multi.idx}/${multi.total} · 按 X 切换 ⌦`);
    const font = '11px monospace';
    ctx.save();
    ctx.font = font;
    const pad = 8;
    const lh = 17;
    const maxW = Math.min(320, Math.max(...lines.map((ln) => ctx.measureText(ln).width)));
    const boxW = maxW + pad * 2;
    const boxH = lines.length * lh + 8;
    // 位置：鼠标右下偏移 14/20，越界则翻到鼠标另一侧/上侧
    let bx = sx + 14;
    let by = sy + 20;
    if (bx + boxW > W - 6) bx = sx - boxW - 14;
    if (by + boxH > H - 6) by = sy - boxH - 20;
    bx = Math.max(6, bx);
    by = Math.max(6, by);
    // 面板 + 发光描边
    panel(ctx, bx, by, boxW, boxH, THEME.water.base, 6);
    ctx.font = font;
    let y = by + 15;
    for (let i = 0; i < lines.length; i++) {
      // 标题行金色加粗，方程式行青色，来源行白色
      const color = i === 0 ? THEME.gold.text : i === 1 ? '#dfe8f2' : '#9fd8ff';
      clearText(ctx, lines[i], bx + pad, y, color, i === 0 ? 'bold 11px monospace' : font);
      y += lh;
    }
    ctx.restore();
  }

  // ---- 玩家信息卡（双端统一紧凑单卡）：物质/体质 + 身体组成 + 大气一行 ----
  // 原桌面三张卡（玩家/组成/空气）竖排 + 移动端重复一套——统一成这一张：
  // 屏幕占用最小、信息不缺；移动端面板体按 CFG.touch.hudAlpha 降透明（文字不降）。
  playerPanelCompact(ctx, p, scene, time, top = 10) {
    const atm = scene.atmosphere;
    // 身体组成（多物质才显示，单物质=血量本身）
    const masses = p.grid ? p.grid.masses() : null;
    const entries = masses
      ? Object.entries(masses).filter(([, m]) => m > 1e-6).sort((a, b) => b[1] - a[1])
      : [];
    const compRows = entries.length > 1 ? Math.min(3, entries.length) : 0;
    // 大气（一行 O2/CO2；有预警气体再加一行）
    const extras = atm
      ? EXTRA_GAS_IDS.map((id) => ({ id, frac: atm.fraction(id) * 100, mass: atm.mass(id) })).filter((g) => g.mass > 0.01)
      : [];
    const airLines = 1 + (extras.length ? 1 : 0);
    const w = 240;
    const h = 62
      + (compRows ? 15 + compRows * 15 + (entries.length > compRows ? 11 : 0) : 0)
      + airLines * 14 + 8;
    this._leftH = h; // 左上卡实际高度（调试模式"最近反应"面板的堆叠定位用）
    ctx.save();
    ctx.globalAlpha = this._isTouch() ? CFG.touch.hudAlpha : 1;
    panel(ctx, 10, top, w, h, THEME.gold.deep, 12);
    ctx.restore();
    // 头部：血量药瓶 + 物质 + 体质
    const sub = getSubstance(p.substance);
    const color = sub?.solid?.[0] ?? '#7fe0ff';
    const ratio = p.maxHp ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
    this.vial(ctx, 22, top + 8, 26, 40, ratio, color, time);
    clearText(ctx, p.substance, 58, top + 22, THEME.gold.text, 'bold 14px "Segoe UI", sans-serif');
    clearText(ctx, `${p.hp.toFixed(1)} g 体质`, 58, top + 40, '#ffffff', 'bold 11px monospace');
    let y = top + 64;
    if (compRows) {
      clearText(ctx, '身体组成', 20, y, 'rgba(255,233,176,0.85)', 'bold 9px "Segoe UI", sans-serif');
      y += 13;
      for (const [id, m] of entries.slice(0, compRows)) {
        const sc = getSubstance(id);
        const isCore = id === p.substance;
        ctx.save();
        if (isCore) {
          ctx.shadowColor = THEME.gold.text;
          ctx.shadowBlur = 5;
        }
        ctx.fillStyle = sc?.solid?.[0] ?? '#7fe0ff';
        ctx.beginPath();
        ctx.arc(26, y + 3, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        clearText(ctx, id, 35, y + 6, isCore ? THEME.gold.text : '#dfe8f2', '9.5px monospace');
        ctx.textAlign = 'right';
        clearText(ctx, `${m.toFixed(1)}g`, w - 14, y + 6, '#9fb2c8', '9px monospace');
        ctx.textAlign = 'left';
        y += 15;
      }
      if (entries.length > compRows) {
        clearText(ctx, `…另有 ${entries.length - compRows} 种`, 20, y + 5, '#9fb2c8', '9px monospace');
        y += 11;
      }
      y += 2;
    }
    // 大气行：O2（青）· CO2（金）
    const o2 = atm ? atm.fraction('O2') * 100 : 0;
    const co2 = atm ? atm.fraction('CO2') * 100 : 0;
    const co2Mass = atm ? atm.mass('CO2') : 0;
    const co2Text = co2 >= 0.05 ? `${co2.toFixed(1)}%` : co2Mass > 1e-6 ? '<0.1%' : '0%';
    clearText(ctx, `O2 ${o2.toFixed(1)}%`, 20, y + 5, '#aeeaff', 'bold 10px monospace');
    clearText(ctx, `CO2 ${co2Text}`, 100, y + 5, '#ffe9b0', 'bold 10px monospace');
    y += 14;
    // 预警气体行（有质量才显示）：色点 + 缩略列表
    if (extras.length) {
      let gx = 20;
      for (const g of extras.slice(0, 3)) {
        const c = GAS_COLORS[g.id] ?? '#ffffff';
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(gx + 3, y - 1, 3, 0, Math.PI * 2);
        ctx.fill();
        const t = g.frac >= 0.05 ? `${g.frac.toFixed(1)}%` : '<0.1%';
        const label = `${g.id} ${t}`;
        clearText(ctx, label, gx + 9, y + 3, c, 'bold 9px monospace');
        gx += 12 + label.length * 5.6 + 6;
      }
      if (extras.length > 3) clearText(ctx, `+${extras.length - 3}`, gx + 4, y + 3, '#9fb2c8', '9px monospace');
    }
  }

  /** 血量药瓶：玻璃烧瓶 + 发光液体填充 */
  vial(ctx, x, y, w, h, ratio, color, time) {
    ctx.save();
    rr(ctx, x, y, w, h, w / 2.4);
    ctx.fillStyle = 'rgba(190,225,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,235,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 液体
    const lh = h * Math.max(0.06, Math.min(1, ratio));
    ctx.save();
    rr(ctx, x + 1.5, y + h - lh, w - 3, lh, w / 3);
    ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#d8f6ff');
    g.addColorStop(0.5, color);
    g.addColorStop(1, '#0e2a44');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    // 液面辉光（随血量轻微脉动）
    const pulse = 6 + 4 * Math.sin(time * 3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color;
    ctx.shadowBlur = pulse;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + 1, y + h - lh, w - 2, 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ---- 玩家反应日志（最近发生在玩家身上的反应；调试模式专属）----
  reactionPanel(ctx, p) {
    if (!p.reactions || p.reactions.length === 0) return;
    const shown = Math.min(4, p.reactions.length);
    const W = 264;
    const H = 22 + shown * 17;
    // 排在左上信息卡下方（卡高度可变，按实际高度堆叠）
    const top = hudTopOffset(this.scene) + (this._leftH ?? 126) + 6;
    panel(ctx, 10, top, W, H, THEME.gold.deep, 10);
    clearText(ctx, '最近反应', 22, top + 12, THEME.gold.text, 'bold 11px "Segoe UI", sans-serif');
    let y = top + 26;
    for (let i = 0; i < shown; i++) {
      clearText(ctx, `› ${p.reactions[i]}`, 22, y + 6, '#dfe8f2', '10px monospace');
      y += 17;
    }
  }


  // ---- 物品栏（宝石槽）：装物品的格子放大 + 内容物溶质显示 + 获取弹跳 ----
  inventory(ctx, p, W, H, time) {
    const slots = p.inventory.slots;
    const rects = inventorySlotRects(W, H, slots, uiMargins(this.scene));
    if (!this._pop) this._pop = {}; // 物品格弹跳计时 {i:{sig,t}}
    let minTop = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const x = r.x;
      const sy = r.y;
      const size = r.size;
      minTop = Math.min(minTop, sy);
      const sel = i === p.inventory.selected;
      // 弹跳：物品格内容变化（新装/吸液/倒出/收气）时缩放脉冲一下
      const s = slots[i];
      let sc = 1;
      if (s && s.item && s.obj) {
        const o = s.obj;
        const sig = s.item === 'beaker' ? `${o.solution ? o.solution.totalMass() : 0}`
          : s.item === 'dropper' ? `${o.liquid}${o.substance}`
            : `${o.totalGas()}${o.gases.size}`;
        const rec = this._pop[i];
        if (!rec || rec.sig !== sig) this._pop[i] = { sig, t: time };
        const pt = time - this._pop[i].t;
        sc = 1 + 0.2 * Math.sin(Math.min(1, pt / 0.32) * Math.PI) * (1 - pt / 0.32);
      }
      ctx.save();
      if (sc > 1.001) {
        ctx.translate(x + size / 2, sy + size / 2);
        ctx.scale(sc, sc);
        ctx.translate(-(x + size / 2), -(sy + size / 2));
      }
      ctx.save();
      rr(ctx, x, sy, size, size, 12);
      const g = ctx.createLinearGradient(x, sy, x, sy + size);
      g.addColorStop(0, sel ? 'rgba(70,50,16,0.96)' : 'rgba(30,26,62,0.92)');
      g.addColorStop(1, sel ? 'rgba(32,22,8,0.96)' : 'rgba(12,9,32,0.92)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = sel ? THEME.gold.light : 'rgba(232,184,75,0.35)';
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.shadowColor = THEME.gold.light;
      ctx.shadowBlur = sel ? 10 + 4 * Math.sin(time * 4) : 0;
      ctx.stroke();
      ctx.restore();

      if (s) {
        if (s.item) {
          this.drawItemIcon(ctx, s, r, time);
        } else {
          this.drawSubstanceSlot(ctx, s, x, sy, size, sel);
        }
      } else {
        // 空槽：淡符文环
        ctx.strokeStyle = 'rgba(232,184,75,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + size / 2, sy + size / 2, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 选中物品 → 在物品栏上方显示"名称 + 内容组成 + 质量"（槽内不再挤文字，
    // 说明文字也撤掉——内容一眼即懂）
    const selItem = p.inventory.selectedItem();
    if (selItem) {
      // 注意：selectedItem() 返回的就是物品实例本身（不是槽位条目），直接读它
      const o = selItem;
      let title = '';
      let comp = '';
      let mass = '';
      let color = '#fff6dd';
      if (selItem.isCarryItem === 'beaker') {
        const total = o.solution ? o.solution.totalMass() : 0;
        title = '烧杯';
        comp = this._contentLine(o.solution ? [...o.solution.solutes.entries()] : [], total > 0.05 ? '水' : '空');
        mass = `${total.toFixed(1)}g`;
        if (o.solution && comp !== '空' && comp !== '水') color = solutionColor(o.solution).color;
      } else if (selItem.isCarryItem === 'dropper') {
        title = '滴管';
        comp = o.liquid > 1e-9 ? (o.substance === 'H2O' ? '水' : o.substance) : '空';
        mass = o.liquid > 1e-9 ? `${o.liquid.toFixed(1)}g` : '';
        if (o.liquid > 1e-9 && o.substance !== 'H2O') color = o.liquidColor().color;
      } else {
        title = '集气瓶';
        comp = o.totalGas() > 1e-9 ? this._contentLine([...o.gases.entries()], '') : '空';
        mass = o.totalGas() > 1e-9 ? `${o.totalGas().toFixed(2)}g / ${o.capacity.toFixed(0)}g` : '';
        if (o.totalGas() > 1e-9) color = o.gasColor();
      }
      ctx.save();
      ctx.font = 'bold 11px "Segoe UI", "Microsoft YaHei", sans-serif';
      const w1 = ctx.measureText(`${title}　${mass}`).width;
      ctx.font = 'bold 10px monospace';
      const w2 = ctx.measureText(comp).width;
      const bw = Math.max(w1, w2) + 22;
      const bx = W - bw - 12; // 右对齐：贴物品栏右缘上方
      let by = minTop - 48;
      // 触屏端：物品栏上方是 C/X/Q/⇧ 按钮块——面板再往上挪，不叠在按钮上
      if (this._isTouch()) {
        const ui = this.scene._touchUI;
        const btns = touchButtonRects(W, H, slots, ui && ui.insets ? ui.insets : {});
        let btnTop = Infinity;
        for (const b of btns) btnTop = Math.min(btnTop, b.y);
        if (btnTop < Infinity) by = btnTop - 44;
      }
      rr(ctx, bx, by, bw, 38, 9);
      const g = ctx.createLinearGradient(bx, by, bx, by + 38);
      g.addColorStop(0, 'rgba(26,22,52,0.95)');
      g.addColorStop(1, 'rgba(12,10,30,0.95)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,184,75,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = 'bold 11px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(`${title}　${mass}`, bx + 11, by + 16);
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = color;
      ctx.fillText(comp, bx + 11, by + 31);
      ctx.restore();
    }
  }

  /** 物质格：元素色圆点 + 名称 + 质量 */
  drawSubstanceSlot(ctx, s, x, sy, size, sel) {
    const sub = getSubstance(s.substance);
    const c = sub?.solid?.[0] ?? '#c8c8c8';
    ctx.save();
    ctx.fillStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x + size / 2, sy + 22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = sel ? '#fff6dd' : THEME.gold.text;
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.substance, x + size / 2, sy + 15);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#ffffff';
    const m = Number.isFinite(s.mass) ? s.mass : 0; // NaN 质量显示 0，不显示 NaN
    ctx.fillText(`${m.toFixed(1)}g`, x + size / 2, sy + size - 8);
    ctx.textAlign = 'left';
  }

  /** 容器内容物一行字（主要溶质/溶剂），最多 2 种；超出截断加省略号 */
  _contentLine(entries, emptyText = '') {
    const list = entries.filter(([, m]) => m > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
    if (!list.length) return emptyText;
    let str = list.join('+');
    if (str.length > 11) str = `${str.slice(0, 10)}…`;
    return str;
  }

  /** 物品格图标（烧杯/滴管/集气瓶——不堆叠，一物一格）。
   *  槽内**只画物体本身**（成分/名称挪到上方"选中物品"面板，免得文字糊住造型）；
   *  仅右下角保留一个小小的质量数字。 */
  drawItemIcon(ctx, s, r, time) {
    const o = s.obj;
    const size = r.size;
    const cx = r.x + size / 2;
    const cy = r.y + size / 2 + 1;
    ctx.save();
    ctx.textAlign = 'center';
    if (s.item === 'beaker') {
      // 迷你烧杯：U 形玻璃 + 按液量比例的液面
      const bw = 21;
      const bh = 27;
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + 3;
      const { color, alpha } = o.solution ? solutionColor(o.solution) : { color: '#9adcff', alpha: 0.2 };
      const vol = o.solution && o.solution.volume > 0 ? o.solution.volume : CFG.item.beakerCapacity;
      const frac = Math.max(0, Math.min(1, (o.solution ? o.solution.totalMass() : 0) / vol));
      const lh = Math.max(0.01, (bh - 4) * frac);
      if (frac > 0.01) {
        ctx.globalAlpha = Math.max(alpha, 0.35);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(bx + 1, by + bh - 1 - lh, bw - 2, lh, 2);
        ctx.fill();
        // 液面亮线
        ctx.globalAlpha = Math.min(1, alpha + 0.25);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(bx + 1.5, by + bh - 1 - lh, bw - 3, 1);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(225,245,255,0.88)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + 0.5, by);
      ctx.lineTo(bx + 0.5, by + bh - 3);
      ctx.quadraticCurveTo(bx + 0.5, by + bh - 0.5, bx + 3, by + bh - 0.5);
      ctx.lineTo(bx + bw - 3, by + bh - 0.5);
      ctx.quadraticCurveTo(bx + bw - 0.5, by + bh - 0.5, bx + bw - 0.5, by + bh - 3);
      ctx.lineTo(bx + bw - 0.5, by);
      ctx.stroke();
      this._slotGrams(ctx, `${(o.solution ? o.solution.totalMass() : 0).toFixed(0)}g`, cx, r.y + size - 5);
    } else if (s.item === 'dropper') {
      // 迷你滴管：胶头泪滴 → 颈环 → 锥形玻璃管（内充液体、液面高光）→ 尖嘴 → 刻度线
      ctx.save();
      ctx.translate(cx, cy - 3);
      const { color } = o.liquid > 1e-9 ? o.liquidColor() : { color: '#9fdcff' };
      const frac = Math.max(0, Math.min(1, o.liquid / o.capacity));
      // 胶头（红色泪滴：圆肩收腰）
      const bg = ctx.createRadialGradient(-1.5, -22, 1, 0, -18, 10);
      bg.addColorStop(0, '#e2596a');
      bg.addColorStop(1, '#a12634');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(-5.2, -11);
      ctx.bezierCurveTo(-7.5, -19, -4.5, -24.5, 0, -24.5);
      ctx.bezierCurveTo(4.5, -24.5, 7.5, -19, 5.2, -11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(-2, -20, 1.5, 2.6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      // 颈环（固定胶头的金属箍）
      ctx.fillStyle = '#d8b45c';
      ctx.fillRect(-4.4, -11.5, 8.8, 2.4);
      // 玻璃管（上宽下窄的锥形）
      const tubeTop = -9;
      const tubeBot = 13;
      ctx.beginPath();
      ctx.moveTo(-2.8, tubeTop);
      ctx.lineTo(2.8, tubeTop);
      ctx.lineTo(1.15, tubeBot);
      ctx.lineTo(-1.15, tubeBot);
      ctx.closePath();
      ctx.fillStyle = 'rgba(215,235,255,0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(225,245,255,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 管内液体（按比例自底向上；顶部液面小椭圆高光）
      if (frac > 0.01) {
        const hInner = tubeBot - tubeTop - 1.6;
        const lh = hInner * frac;
        const ly = tubeBot - 0.8 - lh;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(-2.25, tubeTop + 0.6);
        ctx.lineTo(2.25, tubeTop + 0.6);
        ctx.lineTo(0.95, tubeBot - 0.8);
        ctx.lineTo(-0.95, tubeBot - 0.8);
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = Math.max(0.42, o.liquidColor().alpha ?? 0.6);
        ctx.fillStyle = color;
        ctx.fillRect(-3, ly, 6, lh + 2);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.ellipse(0, ly + 0.6, 1.9 - (1.05 * (lh / hInner)), 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // 尖嘴（细口）
      ctx.beginPath();
      ctx.moveTo(-1.15, tubeBot);
      ctx.lineTo(0, tubeBot + 6.5);
      ctx.lineTo(1.15, tubeBot);
      ctx.closePath();
      ctx.fillStyle = 'rgba(215,235,255,0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(215,235,255,0.75)';
      ctx.stroke();
      // 刻度短线（右侧三道）
      ctx.strokeStyle = 'rgba(235,245,255,0.55)';
      ctx.lineWidth = 0.8;
      for (let i = 1; i <= 3; i++) {
        const yy = tubeBot - i * 4.5;
        const half = 2.6 - i * 0.45;
        ctx.beginPath();
        ctx.moveTo(half, yy);
        ctx.lineTo(half + 2.4, yy);
        ctx.stroke();
      }
      ctx.restore();
      this._slotGrams(ctx, o.liquid > 1e-9 ? `${o.liquid.toFixed(1)}g` : '', cx, r.y + size - 5);
    } else if (s.item === 'bottle') {
      // 迷你集气瓶：玻璃瓶 + 气体填充 + 盖板横杠
      const bw = 18;
      const bh = 26;
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + 4;
      const frac = Math.max(0, Math.min(1, o.totalGas() / o.capacity));
      const color = o.gasColor();
      if (frac > 0.01) {
        const hex = color.replace('#', '');
        const cr = parseInt(hex.slice(0, 2), 16);
        const cg = parseInt(hex.slice(2, 4), 16);
        const cb = parseInt(hex.slice(4, 6), 16);
        ctx.globalAlpha = 0.45 + 0.2 * frac;
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.roundRect(bx + 1, by + bh - 13 * frac, bw - 2, 13 * frac, 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(215,235,255,0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + 4, by);
      ctx.lineTo(bx + 5, by - 4);
      ctx.lineTo(bx + bw - 5, by - 4);
      ctx.lineTo(bx + bw - 4, by);
      ctx.stroke();
      // 盖板（横杠盖在瓶口上方）
      ctx.strokeStyle = 'rgba(240,250,255,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + 1, by - 6);
      ctx.lineTo(bx + bw - 1, by - 6);
      ctx.stroke();
      this._slotGrams(ctx, o.totalGas() > 1e-9 ? `${o.totalGas().toFixed(1)}g` : '', cx, r.y + size - 5);
    }
    ctx.restore();
  }

  /** 槽内唯一的小字：质量（空则不画） */
  _slotGrams(ctx, str, cx, y) {
    if (!str) return;
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(str, cx, y);
  }

  // ---- 提示按钮 ----
  tipButton(ctx, W, H, top = 10) {
    const x = W - 72;
    const y = top;
    ctx.save();
    rr(ctx, x, y, 62, 28, 8);
    const g = ctx.createLinearGradient(x, y, x, y + 28);
    g.addColorStop(0, '#7a5a20');
    g.addColorStop(1, '#4a3410');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.gold.light;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = this.showTip ? 12 : 4;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('提示', x + 31, y + 20);
    ctx.textAlign = 'left';
    if (this.showTip && this.scene.tip) {
      ctx.save();
      rr(ctx, 10, top + 34, Math.min(W - 20, 430), 88, 10);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.strokeStyle = THEME.gold.deep;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = THEME.gold.text;
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      const lines = this.scene.tip.split('\n');
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 22, top + 56 + i * 16);
    }
  }

  // ---- 通关 / 死亡遮罩 ----
  overlay(ctx, scene, W, H) {
    if (scene.status !== 'win' && scene.status !== 'died') return;
    ctx.save();
    ctx.fillStyle = 'rgba(6,5,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    const win = scene.status === 'win';
    const c = win ? THEME.portal.light : '#ff7f7f';
    const cx = W / 2;
    const cy = H / 2 - 10;
    // 光环
    ctx.save();
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.shadowColor = c;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // 图标符文
    ctx.fillStyle = c;
    ctx.font = '34px serif';
    ctx.textAlign = 'center';
    ctx.fillText(win ? '✦' : '✧', cx, cy + 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px "Segoe UI", sans-serif';
    ctx.fillText(win ? '通关！' : '死亡', cx, cy + 58);
    ctx.fillStyle = '#e8d8b0';
    ctx.font = '15px "Segoe UI", sans-serif';
    const touch = scene._touchUI && scene._touchUI.enabled();
    ctx.fillText(touch ? '轻触屏幕重新开始' : '按 R 重开', cx, cy + 90);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

exports.Hud = Hud;

  };
  __modules["src/render/liquidrender.js"] = function (module, exports, __require) {
// ============================================================================
// 液体渲染
// ----------------------------------------------------------------------------
// 溶液色 = 各有色离子按其浓度/饱和比加权平均；无色 → 淡灰透明。
// 主体填充 + 少量确定性伪随机浮动小球（颜色深浅微差，纯视觉）。
// ============================================================================

const { getSubstance } = __require('src/chem/substances.js');;
const { hexToRgb, rgbToHex, mix } = __require('src/render/color.js');;

/**
 * 计算溶液颜色与透明度（无色→饱和色平滑过渡）。
 * 指示剂（石蕊/酚酞）：按溶液 pH 显色，与离子色叠加。
 * 微溶物质（solubilityLimit）：按"浓度/饱和线"产生**浑浊度**——接近饱和时溶液
 * 开始泛乳白（先浑浊），过饱和带（1.25×）时最浑（随后才开始析出沉淀）。
 */
function solutionColor(solution) {
  let idx = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const [id, mass] of solution.solutes) {
    const sub = getSubstance(id);
    if (!sub.ionColor) continue;
    const gPerL = (mass / solution.volume) * 1000; // volume 单位 mL → g/L
    const f = gPerL / sub.ionColor.sat; // 相对饱和浓度
    if (f <= 0) continue;
    const c = hexToRgb(sub.ionColor.color);
    idx += f;
    r += c.r * f;
    g += c.g * f;
    b += c.b * f;
    w += f;
  }
  let base = { color: '#aaaaaa', alpha: 0.12 }; // 无色
  if (idx > 1e-9) {
    // t=0 无色，t≥1 全饱和：颜色从 #aaa 线性混合到加权离子色，透明度平滑上升
    const t = Math.min(1, idx);
    const ion = rgbToHex({ r: r / w, g: g / w, b: b / w });
    base = { color: mix('#aaaaaa', ion, t), alpha: 0.12 + 0.73 * t };
  }
  // 微溶浑浊：浓度越高越乳白（0=清澈；≥饱和线=明显浑浊；过饱和带最浑——沉淀即将出现）
  let turb = 0;
  for (const [id, mass] of solution.solutes) {
    const sub = getSubstance(id);
    if (!(sub.solubilityLimit > 0)) continue;
    const concFrac = (mass * 1000) / (solution.volume * sub.solubilityLimit); // 浓度 / 饱和线
    turb = Math.max(turb, Math.min(1, concFrac / 1.25));
  }
  if (turb > 0.02) {
    const te = turb * turb * 0.62; // 曲线：浓度爬升时先明显变浑、越浓越白
    base = {
      color: mix(base.color, '#e9eef2', te),
      alpha: base.alpha * (1 - te * 0.35) + 0.5 * te,
    };
  }
  // 指示剂显色（石蕊红/紫/蓝，酚酞无色/浅红/深红，甲基橙红/橙/黄）
  const pH = solution.pH ? solution.pH() : 7;
  let ir = 0;
  let ig = 0;
  let ib = 0;
  let iw = 0;
  for (const [id, mass] of solution.solutes) {
    const sub = getSubstance(id);
    if (!sub.indicator || mass <= 0) continue;
    let color = sub.indicator.stops[0][1];
    for (const [cut, c] of sub.indicator.stops) {
      if (pH >= cut) color = c;
    }
    if (sub.indicator.transparent && color === sub.indicator.stops[0][1]) continue; // 无色段
    const gPerL = (mass / solution.volume) * 1000;
    const f = Math.min(1, gPerL / 10); // ≥10g/L 视为指示剂饱和显色
    const c = hexToRgb(color);
    ir += c.r * f;
    ig += c.g * f;
    ib += c.b * f;
    iw += f;
  }
  if (iw <= 1e-9) return base;
  const ind = { r: ir / iw, g: ig / iw, b: ib / iw };
  const bc = hexToRgb(base.color);
  // 指示剂色与基础色叠加（各半）：石蕊加入酸性溶液 → 红
  const mixed = rgbToHex({
    r: (bc.r + ind.r) / 2,
    g: (bc.g + ind.g) / 2,
    b: (bc.b + ind.b) / 2,
  });
  return { color: mixed, alpha: Math.max(base.alpha, 0.25 + 0.5 * Math.min(1, iw)) };
}

/** 渲染一个矩形液面（灵动：起伏波浪 + 持续上升的气泡 + 辉光） */
function renderLiquid(ctx, x, y, w, h, solution, time = 0) {
  if (w <= 0 || h <= 0) return;
  const { color, alpha } = solutionColor(solution);
  ctx.save();
  // 主体：纵向渐变（底部更深）
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, color);
  g.addColorStop(1, mix(color, '#000000', 0.35));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  // 起伏波浪表面（随时间推进，不是死线）
  const waveAmp = 2.4;
  ctx.globalAlpha = Math.min(1, alpha + 0.35);
  ctx.fillStyle = mix(color, '#ffffff', 0.5);
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const SEG = 14;
  for (let i = 0; i <= SEG; i++) {
    const px = x + (i / SEG) * w;
    const py = y + Math.sin(time * 2.4 + (i / SEG) * Math.PI * 2 + x * 0.01) * waveAmp;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x + w, y + 3.5);
  ctx.lineTo(x, y + 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // 上升的气泡（从底部持续冒出，速度不一，随时间循环）
  const n = Math.min(22, Math.max(1, Math.round((w * h) / 900)));
  for (let i = 0; i < n; i++) {
    const bx = x + ((i * 7919) % 997) / 997 * w;
    const speed = 22 + (i % 4) * 9;
    const cycle = h + 16;
    const off = (time * speed + i * 37) % cycle;
    const by = y + h - off;
    const r = 1.6 + (i % 3) * 1.1;
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(i * 2.1 + time * 2);
    ctx.fillStyle = mix(color, '#ffffff', 0.72);
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

exports.solutionColor = solutionColor;
exports.renderLiquid = renderLiquid;

  };
  __modules["src/objects/block.js"] = function (module, exports, __require) {
// ============================================================================
// 物块：有化学性质的实心固体，可被推动，可溶解/反应。材质为 MaterialGrid。
// 尺寸可用 w/h 显式指定，否则按质量生成矩形。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { SolidMaterial } = __require('src/objects/material.js');;
const { MaterialGrid, renderGrid } = __require('src/render/gridrender.js');;
const { THEME, rr, contrastEdge, luminance } = __require('src/render/theme.js');;
const { getSubstance } = __require('src/chem/substances.js');;
const { renderFormula } = __require('src/render/label.js');;

class Block extends Obj {
  constructor({ x, y, substance, mass, w, h, grid, pushable = true, gravity = 1, autoStep = true, ...rest } = {}) {
    // 质量是本源：给了质量（>0）就用质量生成网格（每格 0.1g，格数=mass/0.1），
    // 物块尺寸随之确定；只有"没给质量（或 mass<=0）+ 给了 w/h"时才按像素尺寸
    // 建网格（编辑器像素模式：实体质量=网格真实总质量）。也可直接传入现成 grid
    // （子类如沉淀堆自定义形状）。
    const manual = !!(w && h && (mass == null || mass <= 0));
    const g = grid ?? (manual
      ? MaterialGrid.rect(w, h, substance)
      : MaterialGrid.rectForMass(mass ?? 50, substance));
    const aabb = g.minAABB();
    super({
      x, y, w: aabb.w, h: aabb.h,
      solid: true, pushable, gravity, autoStep,
      physicsKind: 'dynamic',
      mass: manual ? g.totalMass() : (mass ?? 50),
      ...rest,
    });
    this.substance = substance;
    this.grid = g;
    this.gridOrigin = { x, y };
    this.gridOrigins = new Map([[substance, { kind: 'level' }]]); // 网格内每种物质的来源（初始=关卡生成）
    this.mat = new SolidMaterial(this);
    this.formulaVisible = true;
  }

  get material() {
    return this.mat;
  }

  get hoverLabel() {
    return '物块';
  }

  get containerMaterial() {
    return this._container ? this._container.material : null;
  }

  /** 网格形状变化后同步到物理体（碰撞箱 = 最小外接 AABB）；顺带修复"整行空"悬空 */
  syncGrid() {
    if (this.grid._dirty) {
      this.grid.collapseHollowRows();
      this.grid._dirty = false;
    }
    const aabb = this.grid.minAABB();
    if (!aabb) {
      this.w = 0;
      this.h = 0;
      return;
    }
    this.w = aabb.w;
    this.h = aabb.h;
    this.gridOrigin.x = this.x - aabb.x;
    this.gridOrigin.y = this.y - aabb.y;
  }

  adhereMaterial(id, mass, origin) {
    if (this.noteGridOrigin) this.noteGridOrigin(id, origin);
    // 产物盈余长在所有暴露面（与大气/液体接触的面），所有位置同时渐进生长
    const added = this.grid.growExposed(id, mass);
    this.syncGrid();
    return added;
  }

  render(ctx) {
    const aabb = this.grid.minAABB();
    if (!aabb) return;
    const ox = this.gridOrigin.x;
    const oy = this.gridOrigin.y;
    const bx = ox + aabb.x;
    const by = oy + aabb.y;
    renderGrid(ctx, this.grid, ox, oy);
    // 水晶轮廓 + 白色辉光（深色物质外层光晕）+ 顶部高光
    const ids = this.grid.ids();
    const blockColor = ids.length ? getSubstance(ids[0]).solid?.[0] ?? '#c9b46a' : '#c9b46a';
    const dark = luminance(blockColor) < 110;
    const edgeColor = dark ? 'rgba(255,255,255,0.7)' : contrastEdge(blockColor);
    ctx.save();
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.5;
    if (dark) {
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 8;
    }
    rr(ctx, bx, by, aabb.w, aabb.h, 3);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, by, aabb.w, 2.5);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(bx, by + aabb.h - 2.5, aabb.w, 2.5);
    ctx.restore();
    if (this.formulaVisible) {
      const ids = this.grid.ids();
      if (ids.length) renderFormula(ctx, this.x + this.w / 2, this.y - 6, ids.join(' + '));
    }
  }
}

exports.Block = Block;

  };
  __modules["src/objects/floor.js"] = function (module, exports, __require) {
// ============================================================================
// 地板：静态实心体，无化学性质，不可移动。
// 渲染为神殿石砖：纵向石色渐变 + 砖缝 + 顶部亮边（可站立面）。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { THEME } = __require('src/render/theme.js');;

class Floor extends Obj {
  get hoverLabel() {
    return '地板';
  }
  constructor({ x, y, w, h, color = null, ...rest } = {}) {
    super({ x, y, w, h, solid: true, static: true, physicsKind: 'static', ...rest });
    this.color = color;
  }

  render(ctx) {
    const { x, y, w, h } = this;
    if (w <= 0 || h <= 0) return;
    const base = this.color || THEME.stone.base;
    ctx.save();
    // 基础石色渐变
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, mixHex(base, '#ffffff', 0.16));
    g.addColorStop(0.5, base);
    g.addColorStop(1, mixHex(base, '#000000', 0.3));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // 砖缝（确定性，基于世界坐标）
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    const TILE = 34;
    for (let tx = Math.floor(x / TILE) * TILE + TILE; tx < x + w; tx += TILE) {
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(tx, y + h);
      ctx.stroke();
    }
    for (let ty = Math.floor(y / TILE) * TILE + TILE; ty < y + h; ty += TILE) {
      ctx.beginPath();
      ctx.moveTo(x, ty);
      ctx.lineTo(x + w, ty);
      ctx.stroke();
    }
    // 顶部亮边（可站立面）
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x, y, w, 3);
    // 底部暗影
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y + h - 3, w, 3);
    ctx.restore();
  }
}

function mixHex(a, b, t) {
  const ca = parseInt(a.slice(1), 16);
  const cb = parseInt(b.slice(1), 16);
  const r = Math.round(((ca >> 16) & 255) * (1 - t) + ((cb >> 16) & 255) * t);
  const g = Math.round(((ca >> 8) & 255) * (1 - t) + ((cb >> 8) & 255) * t);
  const bl = Math.round((ca & 255) * (1 - t) + (cb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

exports.Floor = Floor;

  };
  __modules["src/objects/pool.js"] = function (module, exports, __require) {
// ============================================================================
// 药品池：地面凹陷的容器。自动生成盆壁/盆底静态体；内部为液体区域。
// 液体按溶液色渲染 + 浮动小球；沉淀粒子绘制在液体底部。
// ============================================================================

const { Container } = __require('src/objects/container.js');;
const { Floor } = __require('src/objects/floor.js');;
const { renderLiquid } = __require('src/render/liquidrender.js');;

const WALL = 8;

class Pool extends Container {
  get hoverLabel() {
    return '池';
  }
  constructor({ x, y, w, h, wall = WALL, gasHeight = 80, ...rest } = {}) {
    super({ x, y, w, h, ...rest });
    this.wall = wall;
    this.gasHeight = gasHeight; // 此池产气的气泡柱高度（px），可配置
    this.subBodies = [
      new Floor({ x, y, w: wall, h, color: '#5c4632' }), // 左壁
      new Floor({ x: x + w - wall, y, w: wall, h, color: '#5c4632' }), // 右壁
      new Floor({ x, y: y + h - wall, w, h: wall, color: '#5c4632' }), // 盆底
    ];
  }

  /** 液体区域（扣除盆壁） */
  innerRect() {
    return { x: this.x + this.wall, y: this.y, w: this.w - 2 * this.wall, h: this.h - this.wall };
  }

  render(ctx, scene) {
    const r = this.innerRect();
    if (r.w <= 0 || r.h <= 0) return;
    // 液面高度 = 实际液体量/容量（吸液后池面下降；默认满池=容积 → 与旧版无异）
    const vol = this.solution.volume > 0 ? this.solution.volume : Infinity;
    const lh = r.h * Math.max(0, Math.min(1, this.solution.totalMass() / vol));
    if (lh > 2) renderLiquid(ctx, r.x, r.y + r.h - lh, r.w, lh, this.solution, scene.time ?? 0);

    // 沉淀：从反应位置生成的视觉颗粒，物理堆叠成堆
    this.renderGrains(ctx);
    this.renderContentsLabel(ctx);
  }
}

exports.Pool = Pool;

  };
  __modules["src/objects/deposit.js"] = function (module, exports, __require) {
// ============================================================================
// 沉淀堆（Deposit）：关卡预设的"一滩沉淀"。
// ----------------------------------------------------------------------------
// 它**不是固体块**：开局（首帧）就物化为沉淀粒子——与玩家放置的沉淀、反应产物
// 完全同一物理：实心可垫脚、可堆叠、可拾取（Q）、可溶解/反应、卡口会像沙一样漏入。
// 编辑器里以"堆形网格"预览（梯形堆，质量决定大小；显式 w/h 走像素模式）；
// 运行时网格只是物化布局，物化后壳退出活动索引（保留 byId：开关仍可引用）。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { MaterialGrid, renderGrid, CELL_SIZE } = __require('src/render/gridrender.js');;
const { contrastEdge, luminance } = __require('src/render/theme.js');;
const { getSubstance } = __require('src/chem/substances.js');;
const { renderFormula } = __require('src/render/label.js');;

class Deposit extends Obj {
  constructor({ x, y, substance, mass, w, h, ...rest } = {}) {
    // 显式 w/h（且未给质量）→ 按目标尺寸生成梯形堆（编辑器像素模式）；
    // 否则质量 → 堆形（每格 0.1g，与物块同一密度）
    const manual = !!(w && h && (mass == null || mass <= 0));
    const grid = manual
      ? MaterialGrid.heapRect(w, h, substance)
      : MaterialGrid.heapForMass(mass ?? 20, substance);
    const aabb = grid.minAABB();
    super({ x, y, w: aabb.w, h: aabb.h, solid: false, physicsKind: 'none', noLift: true, mass: grid.totalMass(), ...rest });
    this.substance = substance;
    this.grid = grid;
    this.gridOrigin = { x, y };
    this.gridOrigins = new Map([[substance, { kind: 'level' }]]);
    this.formulaVisible = true;
    this._materialized = false;
  }

  get isDeposit() {
    return true;
  }

  /** 渲染/选中框锚点同步：gridOrigin 跟随逻辑位置 x/y（编辑器拖拽、缩放、旧档归一化用）。
   *  物块/玩家都有 syncGrid，沉淀堆漏了会导致"拖了选中框在跑、堆图形留在原地"。 */
  syncGrid() {
    const aabb = this.grid?.minAABB?.() ?? null;
    if (!aabb) {
      this.w = 0;
      this.h = 0;
      return;
    }
    this.w = aabb.w;
    this.h = aabb.h;
    this.gridOrigin.x = this.x - aabb.x;
    this.gridOrigin.y = this.y - aabb.y;
  }

  get hoverLabel() {
    return '沉淀堆';
  }

  /** 首帧：物化为沉淀粒子（之后自身成为"壳"，退出活动索引） */
  update(dt, scene) {
    if (!scene || this._materialized) return;
    this._materialized = true;
    this.materialize(scene);
  }

  /** 按预览网格逐格生成粒子：开局即"一滩真实沉淀"，堆形=编辑器所见 */
  materialize(scene) {
    const aabb = this.grid?.minAABB?.() ?? null;
    if (aabb && scene) {
      // 按物质汇总（堆可能混合多物质），整堆一次撒成"一滩"：
      // 撒开宽度≈编辑器所见堆宽；大质量受 maxSpawnParticles 上限约束（2000g 也是几百颗，不会卡顿）
      const byId = new Map();
      for (let ry = 0; ry < this.grid.rows; ry++) {
        for (let gc = 0; gc < this.grid.cols; gc++) {
          const m = this.grid.cells[ry]?.[gc];
          if (!m) continue;
          for (const [id, mass] of m) {
            if (mass > 0) byId.set(id, (byId.get(id) ?? 0) + mass);
          }
        }
      }
      const cx = this.gridOrigin.x + aabb.x + aabb.w / 2;
      const cy = this.gridOrigin.y + aabb.y + aabb.h / 2;
      const spread = Math.max(24, aabb.w);
      for (const [id, mass] of byId) {
        scene.spawnParticles(id, mass, { x: cx, y: cy }, true, true, { kind: 'level', text: '关卡预设沉淀' }, spread);
      }
    }
    // 壳退场：清活动索引与可见性，仅保留 byId（开关引用仍有效）
    const arrays = [
      scene.objects, scene.dynamics, scene.statics, scene.particles,
      scene.containers, scene.lamps, scene.doors, scene.portals, scene.hidden,
    ];
    for (const arr of arrays) {
      const i = arr.indexOf(this);
      if (i >= 0) arr.splice(i, 1);
    }
    this.grid = null; // 空壳：无渲染/无物化能力
    this.gridOrigins = null;
    this.hidden = true;
  }

  /** 编辑器预览：梯形堆轮廓 + 网格（物化后网格为空，不渲染） */
  render(ctx) {
    if (!this.grid) return;
    const aabb = this.grid.minAABB();
    if (!aabb) return;
    const ox = this.gridOrigin.x;
    const oy = this.gridOrigin.y;
    const bx = ox + aabb.x;
    const by = oy + aabb.y;
    renderGrid(ctx, this.grid, ox, oy);
    const ids = this.grid.ids();
    const color = ids.length ? getSubstance(ids[0]).solid?.[0] ?? '#cfe0c8' : '#cfe0c8';
    const dark = luminance(color) < 110;
    const taper = Math.max(2, (this.grid.rows - 1) * CELL_SIZE);
    ctx.save();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.7)' : contrastEdge(color);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + taper, by + 4);
    ctx.lineTo(bx + aabb.w - taper, by + 4);
    ctx.lineTo(bx + aabb.w - 4, by + aabb.h - 4);
    ctx.lineTo(bx + 4, by + aabb.h - 4);
    ctx.closePath();
    if (dark) {
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 8;
    }
    ctx.stroke();
    ctx.restore();
    if (this.formulaVisible && ids.length) {
      renderFormula(ctx, this.x + this.w / 2, this.y - 6, ids.join(' + '));
    }
  }
}

exports.Deposit = Deposit;

  };
  __modules["src/objects/player.js"] = function (module, exports, __require) {
// ============================================================================
// 玩家：椭圆格网材质的特殊固体。血量 = 玩家物质（关卡设定）的剩余质量。
// 控制：left/right/jump 长按；place/collect 按下即触发。
// 放置优先级：附近酒精灯 > 脚下容器 > 地面；每次 0.5g。
// 物品栏：5 格，按物质种类分格，格子种类由首次放入决定，可清空。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { SolidMaterial } = __require('src/objects/material.js');;
const { MaterialGrid, renderGrid, CELL_SIZE, CELL_MASS } = __require('src/render/gridrender.js');;
const { THEME, rr, contrastEdge, luminance } = __require('src/render/theme.js');;
const { getSubstance, isSoluble, shedCoeffOf } = __require('src/chem/substances.js');;
const { CFG } = __require('src/core/config.js');;
const { pickupItem, placeCarriedItem, drawLiquid, pourBeaker, injectBottleGas } = __require('src/level/items.js');;
const { pushContainers } = __require('src/physics/support.js');;

class Inventory {
  constructor({ slots = CFG.inventory.slots, capacity = CFG.inventory.capacity } = {}) {
    // 格子内容：null | {substance, mass}（物质，按种类分格） |
    //        {item:'beaker'|'dropper'|'bottle', obj}（可携带物品：集气瓶/烧杯/滴管——
    //        一物一格，**不堆叠**，哪怕都是空的）
    this.slots = new Array(slots).fill(null);
    this.capacity = capacity;
    this.selected = 0;
  }

  selectedSlot() {
    return this.slots[this.selected];
  }

  /** 选中格里的可携带物品（无则 null） */
  selectedItem() {
    const s = this.selectedSlot();
    return s && s.item ? s.obj : null;
  }

  /** 该物质还能装下的质量（g）：同物质格剩余 + 每个空格一满格（跨格收集）；
   *  物品格不给物质留空间（不堆叠）。 */
  roomFor(substance) {
    let room = 0;
    for (const s of this.slots) {
      if (s && s.item) continue;
      if (s && s.substance === substance) room += this.capacity - (Number.isFinite(s.mass) ? s.mass : 0);
      else if (s === null) room += this.capacity;
    }
    return room;
  }

  canCollect(substance) {
    return this.roomFor(substance) > 0;
  }

  /**
   * 收集某物质，返回实际放入质量。跨格：先装满同物质格，再用空格
   * （否则 100g 封顶后即使有空格也捡不了——用户反馈）。
   * 物品格一律跳过（物品不堆叠、不与物质混装）。
   */
  add(substance, mass) {
    if (!Number.isFinite(mass) || mass <= 0) return 0; // 挡住 NaN/非法质量
    let rest = mass;
    let put = 0;
    for (const s of this.slots) {
      if (rest <= 1e-9) break;
      if (s && s.item) continue;
      if (s && s.substance === substance) {
        const room = this.capacity - (Number.isFinite(s.mass) ? s.mass : 0);
        if (room <= 1e-9) continue;
        const p = Math.min(room, rest);
        s.mass = (Number.isFinite(s.mass) ? s.mass : 0) + p;
        rest -= p;
        put += p;
      }
    }
    for (let i = 0; i < this.slots.length && rest > 1e-9; i++) {
      if (this.slots[i] !== null) continue;
      const p = Math.min(this.capacity, rest);
      this.slots[i] = { substance, mass: p };
      rest -= p;
      put += p;
    }
    return put;
  }

  /** 从选中格放置 amount g（不足也按 amount 扣到 0），返回 {substance, mass} 或 null。
   *  物品格不通过 place 放置（Shift 走物品放置流程），返回 null。 */
  place(amount) {
    const slot = this.selectedSlot();
    if (!slot || slot.item) return null;
    if (slot.mass <= 0) return null;
    slot.mass = Math.max(0, slot.mass - amount);
    if (slot.mass <= 0) this.slots[this.selected] = null;
    return { substance: slot.substance, mass: amount };
  }

  clearSelected() {
    this.slots[this.selected] = null;
  }
}

class Player extends Obj {
  constructor({
    x, y,
    substance = CFG.player.defaultSubstance,
    mass = null, // null=未给（w/h 像素模式或默认血量）
    w, h,
    moveSpeed = CFG.player.moveSpeed,
    jumpVel = CFG.player.jumpVel,
    ...rest
  } = {}) {
    // 显式 w/h 且未给质量 → 按像素建矩形网格（编辑器像素模式，血量=网格真实质量）；
    // 否则质量（缺省 30）→ 矩形格网（格数=mass/0.1）
    const manual = !!(w && h && (mass == null || mass <= 0));
    const m = (mass == null || mass <= 0) ? CFG.player.defaultMass : mass;
    const grid = manual ? MaterialGrid.rect(w, h, substance) : MaterialGrid.rectForMass(m, substance);
    const aabb = grid.minAABB();
    const bodyMass = manual ? grid.totalMass() : m;
    super({
      x, y, w: aabb.w, h: aabb.h,
      solid: true, pushable: false, gravity: 1, autoStep: true,
      physicsKind: 'dynamic',
      mass: bodyMass,
      ...rest,
    });
    this.substance = substance;
    this.maxHp = bodyMass; // 初始血量（药瓶填充参照）
    this.grid = grid;
    this.gridOrigin = { x, y };
    this.gridOrigins = new Map([[substance, { kind: 'level' }]]); // 网格内每种物质的来源（核心=关卡生成）
    this.moveSpeed = moveSpeed;
    this.jumpVel = jumpVel;
    this.mat = new SolidMaterial(this);
    this.inventory = new Inventory();
    this.burning = false;
    this._grainResist = 0; // 颗粒堆阻力（0..1），由容器 lateUpdate 计算、update 读取
    this.reactions = []; // 最近发生在玩家身上的反应（HUD 日志）
  }

  get material() {
    return this.mat;
  }

  get isPlayerObj() {
    return true;
  }

  get hoverLabel() {
    return '玩家';
  }

  get hp() {
    return this.grid.avail(this.substance);
  }

  get isBurning() {
    return this.burning;
  }

  get containerMaterial() {
    return this._container ? this._container.material : null;
  }

  get center() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  syncGrid() {
    if (this.grid._dirty) {
      this.grid.collapseHollowRows();
      this.grid._dirty = false;
    }
    const aabb = this.grid.minAABB();
    if (!aabb) {
      this.w = 0;
      this.h = 0;
      this._shapeOffsets = [];
      return;
    }
    this.w = aabb.w;
    this.h = aabb.h;
    this.gridOrigin.x = this.x - aabb.x;
    this.gridOrigin.y = this.y - aabb.y;
    this._shapeOffsets = this._buildShapeOffsets();
  }

  /** 按网格非空列生成碰撞形状（相对 body 左上角；相邻同高列合并）。腐蚀掉的部分不占碰撞箱 */
  _buildShapeOffsets() {
    const grid = this.grid;
    const offsets = [];
    let col = 0;
    while (col < grid.cols) {
      let top = -1, bottom = -1;
      for (let y = 0; y < grid.rows; y++) {
        if (grid.cells[y][col]) { if (top < 0) top = y; bottom = y; }
      }
      if (top < 0) { col++; continue; }
      let end = col;
      while (end + 1 < grid.cols) {
        let t = -1, b = -1;
        for (let y = 0; y < grid.rows; y++) {
          if (grid.cells[y][end + 1]) { if (t < 0) t = y; b = y; }
        }
        if (t < 0 || t !== top || b !== bottom) break;
        end++;
      }
      const sx = this.gridOrigin.x + col * CELL_SIZE;
      const sy = this.gridOrigin.y + top * CELL_SIZE;
      offsets.push({
        x: sx - this.x,
        y: sy - this.y,
        w: (end - col + 1) * CELL_SIZE,
        h: (bottom - top + 1) * CELL_SIZE,
      });
      col = end + 1;
    }
    return offsets;
  }

  /** 世界坐标碰撞形状（body 移动时自动跟随） */
  getShapes() {
    if (!this._shapeOffsets || this._shapeOffsets.length === 0) return [this.collider()];
    return this._shapeOffsets.map((s) => ({
      x: this.x + s.x,
      y: this.y + s.y,
      w: s.w,
      h: s.h,
    }));
  }

  update(dt, scene) {
    const c = scene.control;
    // 上一帧沉淀颗粒算出的阻力：命令速度按 (1-阻力) 衰减（密集堆拖慢/挡路，稀疏可穿）
    const resist = Math.min(0.9, this._grainResist ?? 0);
    this._grainResist = 0;
    // 水平控制：有输入时设定速度；无输入时**保留当前速度**（爆炸冲击等外力不被抹掉，
    // 由地面摩擦逐渐减速——否则爆炸永远炸不动玩家）
    const input = (c.has('right') ? 1 : 0) - (c.has('left') ? 1 : 0);
    if (input !== 0) this.vel.x = input * this.moveSpeed * (1 - resist);
    // 推动烧杯/集气瓶（必须在本处：玩家重设 vel 之后、物理步之前——吸附+清 vel，
    // 否则"物块推动-玩家不动 / 物块不动-玩家动"推弹交替，用户逐帧确认）
    pushContainers(this, scene, dt);
    if (c.has('jump') && this.onGround) this.vel.y = -this.jumpVel;
    if (scene.pressed.has('place')) this.tryPlace(scene);
    if (scene.pressed.has('collect')) this.tryCollect(scene);
    // 可携带物品（集气瓶/烧杯/滴管）：
    //  - C 按下：拾取物品（空格）或从液体容器吸液（烧杯/空滴管）；
    //  - C 按住（集气瓶格）：标记集气瓶 → Scene.onGas 把最近气泡柱的产气截留进瓶；
    //  - X 按下：烧杯倒入最近的烧杯/药品池；
    //  - X 按住（集气瓶格）：向最近液体容器通入气体（连续，0.05g/s）。
    if (scene.pressed.has('grab')) {
      if (!pickupItem(this, scene)) drawLiquid(this, scene);
    }
    const selSlotNow = this.inventory.selectedSlot();
    scene._gasHold = scene.control.has('grab') && selSlotNow && selSlotNow.item === 'bottle' ? selSlotNow.obj : null;
    if (scene.pressed.has('use')) pourBeaker(this, scene);
    if (scene.control.has('use')) injectBottleGas(this, scene, dt);
    // 移动时冲刷表面壳（贴地摩擦）：非核心物质按浓度脱落成沉淀粒子。
    // 空中/游泳不脱落（不与地面接触就没有摩擦）。
    if (this.grid && this.onGround && (Math.abs(this.vel.x) > 50 || Math.abs(this.vel.y) > 50)) {
      this.shedShell(scene, dt);
    }
    // 接触同核心物质 → 缓慢吸收回血（沉淀粒子/物块；速率慢，不影响垫脚玩法）
    this.absorbCore(scene, dt);
  }

  /** 吸收附近同核心物质的粒子/物块（0.5g/s）——"接触同类物质补血" */
  absorbCore(scene, dt) {
    if (!this.grid) return;
    let rest = 0.5 * dt;
    if (rest <= 0) return;
    // 沉淀粒子（含放置的实心沉淀）
    for (const pt of scene.particles.slice()) {
      if (rest <= 0) break;
      if (pt.substance !== this.substance || !pt.collectible || pt.amount <= 1e-9) continue;
      if (pt.right < this.left || pt.left > this.right || pt.bottom < this.top || pt.top > this.bottom) continue;
      const take = Math.min(pt.amount, rest);
      pt.amount -= take;
      this.grid.add(this.substance, take);
      rest -= take;
      if (pt.amount <= 1e-9) scene.removeObject(pt);
    }
    // 接触的物块（按接触对）
    if (rest > 0) {
      for (const [a, b] of scene.contactPairs) {
        const block = a === this ? b : b === this ? a : null;
        if (!block || !block.grid) continue;
        if (block.avail?.(this.substance) ?? block.grid.avail(this.substance) <= 1e-9) continue;
        const avail = block.grid.avail(this.substance);
        const take = Math.min(avail, rest);
        block.grid.consume(this.substance, take);
        this.grid.add(this.substance, take);
        rest -= take;
        if (rest <= 0) break;
      }
    }
  }

  /**
   * 贴地摩擦脱落表面壳（非玩家核心物质）：每格单独运算。
   * 规则（用户明确）：
   *  - 前提：玩家与地面接触（onGround，由调用方保证）且移动中（摩擦）
   *  - 脱落对象：**玩家表面（暴露格）**中非玩家核心物质的格——表面所有位置都会
   *    被摩擦蹭到（不只底部）
   *  - 每格速率 = 脱落系数 × (格内该物质浓度 / 满格浓度)：浓度越高越容易脱落，
   *    满格（0.1g）时达到脱落系数上限（可溶物 0.01、不溶物 0.005 g/格/s，按物质
   *    表 shedCoeff 可覆盖）；浓度低于阈值（0.01g，与碰撞/渲染阈值一致）彻底不再脱落
   *  - 脱落量**累积**：攒够 SHED_BURST（0.5g）才生成一小簇粒子——走路是"走一段
   *    偶尔掉一下"，不是每帧冒微量渣（连续细流视觉上像"一直掉"）
   * 脱落物成沉淀粒子（可收集）。
   */
  shedShell(scene, dt) {
    if (!this.grid || dt <= 0) return 0;
    const g = this.grid;
    const SHED_MIN = 0.01; // g/格：低于此浓度不再脱落
    const SHED_BURST = 2; // g：累积到这一块才生成粒子（"走一段路偶尔掉一下"——表面格多时总量 ~0.6g/s，阈值 2g ≈ 每 3-4 秒掉一小坨）
    this._shedAcc = this._shedAcc || {};
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        const m = g.cells[y][x];
        if (!m) continue;
        if (g._openSides(x, y) <= 0) continue; // 只处理表面格
        for (const [id, mass] of [...m]) {
          if (id === this.substance) continue; // 玩家自身物质不脱落
          if (!(mass >= SHED_MIN)) continue; // 低浓度彻底不脱落
          const rateMax = shedCoeffOf(id); // 脱落系数（可溶 0.01 / 不溶 0.005）
          const rate = Math.min(rateMax, rateMax * (mass / CELL_MASS)); // 浓度越高越容易
          const take = Math.min(mass, rate * dt);
          if (take <= 1e-12) continue;
          m.set(id, mass - take);
          if (mass - take <= 1e-9) m.delete(id);
          this._shedAcc[id] = (this._shedAcc[id] ?? 0) + take;
        }
        if (m.size === 0) {
          g.cells[y][x] = null;
          g._dirty = true;
        }
      }
    }
    if (g._invalidateTotals) g._invalidateTotals(); // 玩家表面壳脱落：总量缓存失效
    // 结算：攒够一块才掉（偶尔掉一下，而不是每帧冒渣）
    let total = 0;
    for (const id of Object.keys(this._shedAcc)) {
      const acc = this._shedAcc[id];
      if (acc >= SHED_BURST) {
        scene.spawnParticles(id, acc, { x: this.x + Math.random() * this.w, y: this.bottom - 2 }, true, false, {
          kind: 'shell',
        });
        total += acc;
        delete this._shedAcc[id];
      }
    }
    return total;
  }

  tryPlace(scene) {
    // 选中格是可携带物品（集气瓶/烧杯/滴管）→ 放到玩家身旁（shift 放置）
    if (placeCarriedItem(this, scene)) return;
    const amount = CFG.placeAmount;
    const res = this.inventory.place(amount);
    if (!res) return;
    // 就近放置：脚下容器优先于附近酒精灯（灯只在脚下无容器时接物）
    // 修复：玩家站在化学开关上时，物质应进开关而不是跑到旁边的灯上
    const lamp = scene.findLampNear(this);
    const container = scene.containerUnderFeet(this);
    const placeOrigin = { kind: 'place' };
    if (container) {
      // 落点=玩家脚下（反应/气泡围绕玩家放下的位置，不再默认容器中心）
      const ir = typeof container.innerRect === 'function' ? container.innerRect() : null;
      if (ir) container.depositAt = { x: this.x + this.w / 2, y: Math.max(ir.y + 4, this.bottom - 6) };
      // 可溶物质放进液体容器（池）→ 溶解进溶液（CuSO4 不会变成永不溶解的沉淀颗粒）；
      // 不溶物（Cu(OH)2 等）才作为沉淀放置
      if (container.solution && container.solution.water > 0 && isSoluble(res.substance)) {
        container.solution.add(res.substance, amount);
        if (container.noteSolOrigin) container.noteSolOrigin(res.substance, { kind: 'place' });
      } else {
        container.addPrecipitate(res.substance, amount, null, placeOrigin);
      }
      return;
    }
    if (lamp) {
      lamp.addPrecipitate(res.substance, amount, null, placeOrigin);
      return;
    }
    // 地面：生成"放置的沉淀"（实心、可垫脚、只能被重新收集）
    scene.spawnParticles(res.substance, amount, { x: this.x + this.w / 2, y: this.bottom + 1 }, true, true, placeOrigin);
  }

  tryCollect(scene) {
    const me = this.center;
    // 自由沉淀粒子（按剩余容量部分收集，放不下的留在原地）
    for (const p of scene.particles.slice()) {
      if (!p.collectible) continue;
      const dx = p.x + p.w / 2 - me.x;
      const dy = p.y + p.h / 2 - me.y;
      if (Math.hypot(dx, dy) > CFG.collectRadius) continue;
      const room = this.inventory.roomFor(p.substance);
      if (room <= 0) continue;
      const put = this.inventory.add(p.substance, Math.min(p.amount, room));
      p.amount -= put;
      if (p.amount <= 1e-9) scene.removeObject(p);
    }
    // 容器内沉淀（池/烧杯/开关等）：与自由粒子同语义——按沉淀**实际位置**就近收集。
    // ①玩家身体边缘到容器边缘 ≤ 拾取半径（快速粗判：贴池边/在池里才够得着）；
    // ②桶内沉淀按视觉颗粒（grains）位置分布，只收玩家 70px 范围内的部分——远处
    //   沉淀留在容器里（旧逻辑"整池一起收"：贴着池边就收走全部——用户反馈）。
    for (const c of scene.containers) {
      const cw = c.w ?? 0;
      const ch = c.h ?? 0;
      const nx = Math.max(c.x - (this.x + this.w), 0, this.x - (c.x + cw));
      const ny = Math.max(c.y - this.bottom, 0, this.top - (c.y + ch));
      if (Math.hypot(nx, ny) > CFG.collectRadius) continue;
      for (const [id, mass] of [...c.precipitates]) {
        if (mass <= 0) continue;
        const room = this.inventory.roomFor(id);
        if (room <= 0) continue;
        // 只收"附近颗粒份额"；无视觉颗粒的容器（开关等自定义）回退整池收
        const grains = c.useGrains ? c.grains.filter((g) => g.id === id) : null;
        let takenMax = mass;
        if (grains && grains.length) {
          const near = grains.filter((g) => {
            // 玩家矩形最近点 → 颗粒圆心距离 ≤ 拾取半径 + 颗粒半径（与粗判同单位）
            const gx = Math.max(this.x, Math.min(g.x, this.x + this.w));
            const gy = Math.max(this.top, Math.min(g.y, this.bottom));
            return Math.hypot(g.x - gx, g.y - gy) <= CFG.collectRadius + (g.r ?? 0);
          }).length;
          if (near === 0) continue; // 该沉淀都在远处：不收到
          takenMax = mass * (near / grains.length);
        }
        const taken = c.takePrecipitate(id, Math.min(mass, takenMax, room));
        this.inventory.add(id, taken);
      }
    }
  }

  adhereMaterial(id, mass) {
    // 产物盈余长在所有暴露面（与大气/液体接触的面），所有位置同时渐进生长
    const added = this.grid.growExposed(id, mass);
    this.syncGrid();
    return added;
  }

  render(ctx) {
    const grid = this.grid;
    const aabb = grid.minAABB();
    if (!aabb) return;
    const ox = this.gridOrigin.x;
    const oy = this.gridOrigin.y;
    const sub = getSubstance(this.substance);
    const color = sub?.solid?.[0] ?? '#7fe0ff';
    const bx = ox + aabb.x;
    const by = oy + aabb.y;
    // 元素光晕（透明填充只投影发光）
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    rr(ctx, bx, by, aabb.w, aabb.h, 9);
    ctx.fill();
    ctx.restore();
    // 网格本体
    renderGrid(ctx, grid, ox, oy);
    // 角色轮廓（深色物质用白色辉光轮廓，浅色用深描边）
    ctx.save();
    ctx.strokeStyle = luminance(color) < 110 ? 'rgba(255,255,255,0.75)' : contrastEdge(color);
    ctx.lineWidth = 2;
    if (luminance(color) < 110) {
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 8;
    }
    rr(ctx, bx, by, aabb.w, aabb.h, 9);
    ctx.stroke();
    ctx.restore();
    // 表情（只留眼睛；随移动方向微调视线）
    const cx = bx + aabb.w / 2;
    const cy = by + aabb.h * 0.42;
    const eye = Math.max(2, aabb.w * 0.06);
    const gap = aabb.w * 0.17;
    const lookX = Math.max(-1, Math.min(1, this.vel.x / this.moveSpeed)) * gap * 0.45;
    const lookY = Math.max(-1, Math.min(1, this.vel.y / 600)) * aabb.h * 0.05;
    const lx = cx + lookX;
    const ly = cy + lookY;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lx - gap, ly, eye, 0, Math.PI * 2);
    ctx.arc(lx + gap, ly, eye, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141426';
    ctx.beginPath();
    ctx.arc(lx - gap + eye * 0.32, ly, eye * 0.45, 0, Math.PI * 2);
    ctx.arc(lx + gap + eye * 0.32, ly, eye * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

exports.Inventory = Inventory;
exports.Player = Player;

  };
  __modules["src/level/items.js"] = function (module, exports, __require) {
// ============================================================================
// 可携带物品（集气瓶 / 烧杯 / 滴管）互动逻辑
// ----------------------------------------------------------------------------
// 按键语义（全部基于"选中的物品栏格子"）：
//  - C（选中空格）：拾取附近最近的一个可携带物品（一物一格，不堆叠）；
//  - C（选中烧杯/滴管）：从最近的液体容器（药品池/烧杯）吸液——烧杯 20g/次
//    （可混合、直到满），滴管 5g/次（**同种液体可反复续吸至容量上限 50g**，
//    装着别的液体则不能续吸）；
//  - C（按住，选中集气瓶）：把最近气泡柱产生的气体直接截留进瓶（5g 封顶）；
//  - X（选中烧杯）：把烧杯里的液体倒入最近的烧杯/药品池，**每次倒 10g**
//    （滴管不行）；
//  - X（按住，选中集气瓶）：向最近的液体容器通入气体（0.05g/s）；
//  - Shift：把选中格里的物品放到玩家身旁（集气瓶与烧杯一样有碰撞箱可推动，
//    滴管无碰撞箱可拖动）。
// ============================================================================

const { CFG } = __require('src/core/config.js');;
const { solutionColor } = __require('src/render/liquidrender.js');;
const { puffFx, flowFx } = __require('src/objects/fx.js');;
const { Bubble } = __require('src/objects/bubble.js');;

let FX_SEQ = 0; // 特效对象 id 序号（fx.js 的计数器不跨模块共享）

/** 放置落点是否被占用：与其它可携带物品、实心动态体（装置壁）、实心放置粒子重叠 */
function spotBlocked(scene, o, x, y) {
  const m = 3; // 收缩容差：贴边不算
  const l = x + m, r = x + o.w - m, t = y + m, b = y + o.h - m;
  for (const s of scene.objects) {
    if (s === scene.player || !s || s.hidden) continue;
    if (typeof s.amount === 'number' && !s.solid) continue; // 软体自由粒子不挡
    const isCarry = !!s.isCarryItem;
    if (!(isCarry || s.solid)) continue; // 只看实体类；区域容器（池等）允许浸入
    if (r > s.x + m && l < s.x + s.w - m && b > s.y + m && t < s.y + s.h - m) return true;
  }
  return false;
}

/** 两矩形之间的最近距离（边缘间隙；重叠=0）——池/烧杯等高宽物体用边缘距离，
 *  站在池边即可吸液（用中心距离会让宽池显得"遥不可及"） */
function rectDist(a, b) {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.hypot(dx, dy);
}

/** 场景内最近的可携带物品（集气瓶/烧杯/滴管），超范围返回 null；
 *  noCarry（关卡固定装置，编辑器可勾选"锁定"）不参与拾取 */
function nearestCarryItem(scene, player) {
  let best = null;
  let bd = Infinity;
  for (const o of scene.objects) {
    if (!o.isCarryItem || o.noCarry) continue;
    const d = rectDist(o, player);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  if (!best || bd > CFG.item.collectRange) return null;
  return best;
}

/**
 * C 拾取：选中格必须**为空**，把最近的可携带物品收进该格（连同其内容物）。
 * 物品不堆叠：一物一格，重复拾取需要依次选空格。
 */
function pickupItem(player, scene) {
  const inv = player.inventory;
  if (inv.selectedSlot() !== null) return false;
  const o = nearestCarryItem(scene, player);
  if (!o) return false;
  // 吸入特效：物品位置一圈尘雾（先于移除取坐标）
  puffFx(scene, o.x + o.w / 2, o.y + o.h * 0.4);
  scene.removeItem(o); // 深度移除（烧杯含杯壁子体）
  inv.slots[inv.selected] = { item: o.isCarryItem, obj: o };
  return true;
}

/** Shift 放置：把选中格里的物品放到玩家身旁（朝移动方向一侧、脚边）。
 *  落点被占用（已有装置/实心体）时依次向外探测空位——不再把两件物品叠在一起。 */
function placeCarriedItem(player, scene) {
  const inv = player.inventory;
  const slot = inv.selectedSlot();
  if (!slot || !slot.item) return false;
  const o = slot.obj;
  const front = player.vel.x >= 0 ? 1 : -1;
  const off = CFG.item.placeOffset;
  let x = front > 0 ? player.x + player.w + off : player.x - o.w - off;
  let y = player.bottom + 2 - o.h; // 底边贴脚底（烧杯/集气瓶落地面，滴管停在原地）
  x = Math.max(4, Math.min(scene.worldW - o.w - 4, x));
  y = Math.max(4, Math.min(scene.worldH - o.h - 4, y));
  // 空位探测：原位 → 原方向再远一格 → 反侧对称位 → 反侧更远
  if (spotBlocked(scene, o, x, y)) {
    const step = o.w + 10;
    const probes = [
      x + front * step,
      x + front * step * 2,
      x - front * step,
      x - front * step * 2,
    ];
    let found = false;
    for (const px of probes) {
      const cx = Math.max(4, Math.min(scene.worldW - o.w - 4, px));
      if (!spotBlocked(scene, o, cx, y)) {
        x = cx;
        found = true;
        break;
      }
    }
    if (!found && !spotBlocked(scene, o, player.x, y)) x = player.x; // 最后兜底：正下方
  }
  o.x = x;
  o.y = y;
  if (Number.isFinite(o.rx)) { o.rx = o.x; o.ry = o.y; } // 滴管渲染平滑坐标同步（防放置瞬移残影）
  scene.addItem(o);
  puffFx(scene, x + o.w / 2, y + o.h - 3); // 落地尘雾
  inv.slots[inv.selected] = null;
  return true;
}

/** 最近的有液体的容器（取液源/通入目标）：含水或含溶质的可装液容器 */
function nearestLiquidSource(scene, player, range = CFG.item.liquidRange) {
  let best = null;
  let bd = Infinity;
  for (const c of scene.containers) {
    if (!c.solution || !(c.solution.volume > 0)) continue;
    if (c.solution.totalMass() <= 1e-9) continue;
    const d = rectDist(c, player);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best && bd <= range ? best : null;
}

/** 最近的"可注液"容器（池/烧杯，空杯也算），范围限定；
 *  needWater：只找有水的（通气要液体介质）；
 *  needRoom：跳过已满的**烧杯**（药品池不封顶，敞开接收） */
function nearestLiquidTarget(scene, player, range = CFG.item.liquidRange, needWater = false, needRoom = false) {
  let best = null;
  let bd = Infinity;
  for (const c of scene.containers) {
    if (!c.solution || !(c.solution.volume > 0)) continue;
    if (needWater && !(c.solution.water > 1e-9)) continue;
    if (needRoom) {
      const capped = c.isCarryItem === 'beaker'; // 只有烧杯有容量上限；池视为敞开
      if (capped && c.solution.volume - c.solution.totalMass() <= 1e-9) continue;
    }
    const d = rectDist(c, player);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best && bd <= range ? best : null;
}

/** 吸液特效：从容器液面到玩家的一串上行液滴（纯视觉） */
function _suckFx(scene, src, player) {
  const r = src.innerRect ? src.innerRect() : { x: src.x + 4, y: src.y + 6, w: src.w - 8, h: src.h - 12 };
  // 液面近似：按容器高度中点取上沿区域即可（视觉用途，无需精确）
  const col = solutionColor(src.solution).color;
  flowFx(scene, {
    x0: Math.max(r.x + 4, Math.min(r.x + r.w - 4, player.x + player.w / 2)),
    y0: r.y + Math.min(10, r.h * 0.3),
    x1: player.x + player.w / 2,
    y1: player.y + player.h * 0.35,
    color: col,
    life: 0.5,
    n: 8,
    bend: 0.3,
  });
}

/**
 * C 吸液：选中的烧杯/滴管从最近的液体容器取液。
 * 烧杯：每次 20g（同比例样品，可混合），容量满（总量≥容积）后不能再加；
 * 滴管：每次 5g，**同种液体可反复续吸直到容量上限**（管里装着别的液体则拒绝），
 * 取池中占优的溶质（纯水→H2O）。
 */
function drawLiquid(player, scene) {
  const slot = player.inventory.selectedSlot();
  if (!slot || !slot.item) return false;
  const o = slot.obj;
  const src = nearestLiquidSource(scene, player);
  if (!src) return false;
  if (slot.item === 'beaker') {
    const cap = o.solution.volume > 0 ? o.solution.volume : CFG.item.beakerCapacity;
    const room = cap - o.solution.totalMass();
    if (room <= 1e-9) return false; // 满杯不能再加
    const sample = src.solution.takeSample(Math.min(CFG.item.beakerTransfer, room));
    if (!sample) return false;
    o.solution.addSample(sample);
    for (const [id, v] of Object.entries(sample.solutes ?? {})) {
      if (v > 1e-9) o.noteSolOrigin?.(id, { kind: 'fill', text: '吸液入杯' });
    }
    _suckFx(scene, src, player); // 吸液液流动画
    return true;
  }
  if (slot.item === 'dropper') {
    const take = Math.min(CFG.item.dropperTransfer, o.capacity - o.liquid);
    if (take <= 1e-9) return false; // 满管（容量上限）
    // 滴管只装一种液体：占优溶质（无溶质=纯水）。已装液时只有"同一液体"才能续吸
    let id = 'H2O';
    let m = 0;
    for (const [sid, sm] of src.solution.solutes) {
      if (sm > m) {
        id = sid;
        m = sm;
      }
    }
    if (o.liquid > 1e-9 && id !== o.substance) return false; // 管里是别的液体 → 不能续吸
    if (id === 'H2O') {
      const got = src.solution.water > 0 ? Math.min(take, src.solution.water) : 0;
      if (got <= 1e-9) return false;
      src.solution.water -= got;
      o.substance = 'H2O';
      o.liquid += got;
    } else {
      const got = src.solution.remove(id, take);
      if (got <= 1e-9) return false;
      o.substance = id;
      o.liquid += got;
    }
    _suckFx(scene, src, player); // 吸液液流动画
    return true;
  }
  return false;
}

/**
 * X 倒入：把选中烧杯里的液体倒入最近的烧杯/药品池，**每次倒 CFG.item.pourStep
 * （默认 10g）**——连续按分次倒完。目标未满则倒；最近的是满杯且附近还有别的
 * 容器 → 选下一个有余量的。
 * 滴管不能倒出（只能滴在容器上方）。
 */
function pourBeaker(player, scene) {
  const slot = player.inventory.selectedSlot();
  if (!slot || slot.item !== 'beaker') return false;
  const o = slot.obj;
  const total = o.solution.totalMass();
  if (total <= 1e-9) return false;
  const target = nearestLiquidTarget(scene, player, CFG.item.liquidRange, false, true);
  if (!target) return false;
  // 烧杯有容量上限（倒目标剩余空间）；药品池敞开接收
  const capped = target.isCarryItem === 'beaker';
  const tRoom = capped ? Math.max(0, target.solution.volume - target.solution.totalMass()) : Infinity;
  const pour = Math.min(CFG.item.pourStep, total, tRoom);
  if (pour <= 1e-9) return false;
  const sample = o.solution.takeSample(pour);
  if (!sample) return false;
  // 倒出会话：平移到目标旁→倾斜→按住保持（视觉层，物理坐标不动）
  o.beginPour?.(scene, target);
  target.solution.addSample(sample);
  for (const [id, v] of Object.entries(sample.solutes ?? {})) {
    if (v > 1e-9) target.noteSolOrigin?.(id, { kind: 'pour', text: '烧杯倒入' });
  }
  return true;
}

/**
 * 按住 X 通气：把选中集气瓶中的气体按 0.05g/s 通入最近的液体容器
 * （优先通占优气体；CO2/SO2/NO2/Cl2 在主动鼓泡时也能溶进水里）。
 * 注入点冒气泡视觉（间歇生成，随通气持续）。
 */
function injectBottleGas(player, scene, dt) {
  const slot = player.inventory.selectedSlot();
  if (!slot || slot.item !== 'bottle') return false;
  const o = slot.obj;
  if (o.totalGas() <= 1e-9) return false;
  const target = nearestLiquidTarget(scene, player, CFG.item.liquidRange, true);
  if (!target) return false;
  const d = o.dominantGas();
  const amount = Math.min(CFG.item.gasRate * dt, d[1]);
  if (amount <= 1e-9) return false;
  o.removeGas(d[0], amount);
  scene.bubbleGas(target, d[0], amount, dt);
  // 通气气泡特效：注入点（bubbleGas 更新过的 depositAt）每 ~0.16s 冒一颗上升泡
  o._injAcc = (o._injAcc ?? 0) + dt;
  if (o._injAcc >= 0.16 && target.depositAt) {
    o._injAcc = 0;
    const jx = ((target.depositAt.x * 7 + scene.time * 13) % 8) - 4; // 确定性微抖
    scene.addObject(new Bubble({
      x: target.depositAt.x + jx - 3,
      y: target.depositAt.y - 6,
      dir: -1,
      speed: 62,
      id: `fx${++FX_SEQ}`,
    }));
  }
  return true;
}

exports.nearestCarryItem = nearestCarryItem;
exports.pickupItem = pickupItem;
exports.placeCarriedItem = placeCarriedItem;
exports.nearestLiquidSource = nearestLiquidSource;
exports.nearestLiquidTarget = nearestLiquidTarget;
exports.drawLiquid = drawLiquid;
exports.pourBeaker = pourBeaker;
exports.injectBottleGas = injectBottleGas;

  };
  __modules["src/objects/fx.js"] = function (module, exports, __require) {
// ============================================================================
// 特效小件（fx）：可携带物品交互的动画点缀——全部纯视觉、无碰撞、自销毁。
//   PuffDust  尘雾/水花圈（拾取物品、放置落地、吸液液面）
//   FlowArc   液流弧线（吸液从容器飞向玩家 / 倒出从杯口落入目标，沿贝塞尔流动）
// 配套快捷函数 puffFx / flowFx 负责生成唯一 id 并 addObject 进场景。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;

let FX_SEQ = 0;

/** 尘雾圈：n 团渐扩渐隐的小圆（确定性散布，不用随机数保可回放） */
class PuffDust extends Obj {
  constructor({ x, y, r = 5, spread = 14, color = '190,215,255', life = 0.4, n = 5, ...rest }) {
    super({ x, y, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.r = r;
    this.spread = spread;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.n = n;
  }

  update(dt, scene) {
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  render(ctx) {
    const t = 1 - this.life / this.maxLife; // 0→1 扩散进度
    ctx.save();
    for (let i = 0; i < this.n; i++) {
      const ang = (i / this.n) * Math.PI * 2 + i * 1.7;
      const d = this.spread * t * (0.55 + 0.45 * ((i % 3) / 2));
      const px = this.x + Math.cos(ang) * d;
      const py = this.y + Math.sin(ang) * d - 2.5 * t; // 微微上飘
      const rr = Math.max(0.6, this.r * (0.5 + t));
      ctx.globalAlpha = Math.max(0, (1 - t)) * 0.55;
      ctx.fillStyle = `rgb(${this.color})`;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * 液流弧：p0→p1 的贝塞尔小液滴串。中途小滴接连飞行（按相位错开），
 * 到达即淡出；整体随 life 结束收尾。弯拱 bend>0 时控制点在中点上抬。
 */
class FlowArc extends Obj {
  constructor({ x0, y0, x1, y1, color = '#9fd8ff', life = 0.5, n = 7, bend = 0.35, ...rest }) {
    super({ x: 0, y: 0, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.n = n;
    // 控制点：中点上抬 bend*距离（吸液向上拱、倒出也用小拱更自然）
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2 - bend * Math.hypot(x1 - x0, y1 - y0);
  }

  update(dt, scene) {
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  _at(u) { // 二次贝塞尔取点
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return {
      x: a * this.x0 + b * this.cx + c * this.x1,
      y: a * this.y0 + b * this.cy + c * this.y1,
    };
  }

  render(ctx) {
    const T = 1 - this.life / this.maxLife; // 全局进度
    ctx.save();
    for (let i = 0; i < this.n; i++) {
      const off = i / this.n;
      const u = (T * 1.4 + off) % 1; // 循环流动
      const p = this._at(u);
      const fadeEnd = Math.sin(Math.min(1, Math.max(0, T)) * Math.PI); // 起止整体淡入淡出
      const size = 2.6 - 1.4 * u; // 飞行中微缩
      ctx.globalAlpha = 0.85 * fadeEnd * (0.35 + 0.65 * (1 - u * 0.5));
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** 快捷生成：尘雾 */
function puffFx(scene, x, y, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new PuffDust({ x, y, id: `fx${++FX_SEQ}`, ...opts }));
}

/** 快捷生成：液流弧 */
function flowFx(scene, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new FlowArc({ id: `fx${++FX_SEQ}`, ...opts }));
}

exports.PuffDust = PuffDust;
exports.FlowArc = FlowArc;
exports.puffFx = puffFx;
exports.flowFx = flowFx;

  };
  __modules["src/physics/support.js"] = function (module, exports, __require) {
// ============================================================================
// 支撑面查询：容器类物体（烧杯/集气瓶）自带的重力是"手动下落"（主本体不参与
// 物理积分），需要自己找支撑。这里统一实现"**最浅支撑面**"语义：
//   - 与其水平重叠、且位于本体底部±容差~span 之下的所有实心静态体 +
//     实心动态体（玩家头、其他装置壁——但排除自身子体与软体沉淀粒子）；
//   - 取其中**最高（y 最小）**的顶面作为落点。
// 关键修复点：
//   ① 动态体也算竖直落点 —— 修"烧杯从玩家正上方落下穿透玩家"；
//   ② 取 min 而不是 max —— 修"烧杯跨在池沿上时借更深的盆底沉进池里，
//      连带着杯内玩家一起嵌入池体"（用户关卡 level (15) 复现）。
// ============================================================================

const EPS = 2; // 已贴合的容差（沿用旧 applyGravity 的判定宽度）

/**
 * 返回给定位体正下方最近的实心支撑面顶边 y；找不到返回 Infinity。
 * span = 探测深度（px）：只在底部下方 span 内找（默认 40，与旧行为一致，
 * 保证下落逐帧检测不瞬移）；贴合恢复（轻微陷入弹回表面）也靠这个窗口。
 */
function shallowestSupportY(body, scene, span = 40) {
  const l = body.x;
  const r = body.x + body.w;
  const b0 = body.y + body.h;
  let best = Infinity;
  const sub = body.subBodies;
  // statics/dynamics 都要排除**自身子体**（烧杯/集气瓶的壁体在 static 化后
  // 进了 statics——不排除的话"自己撑住自己/自己挡自己"）
  const skipSelf = (s) => (sub && sub.includes(s));
  const scan = (list, skip) => {
    for (const s of list) {
      if (!s || !s.solid || (skip && skip(s))) continue;
      if (!(s.x < r && s.x + s.w > l)) continue; // 水平重叠才算
      if (s.y >= b0 - EPS && s.y <= b0 + span) best = Math.min(best, s.y);
    }
  };
  if (scene.statics) scan(scene.statics, skipSelf);
  if (scene.dynamics) {
    scan(scene.dynamics, (d) => d === body || skipSelf(d) || typeof d.amount === 'number');
  }
  return best;
}

/** 与作用力无关的通用"落到支撑面停住"推进（重力累加 ≤400，钳位贴合）。
 *  贴合容差 0.25px：已在表面（含微小间隙）→ 静止——否则"恰好贴住"时每帧
 *  微落 0.6px 再被顶回 → 烧杯/集气瓶站着也在微微震动（用户反馈推动时的抖动源之一） */
function settleBodyOnSupport(body, dt, support, accel = 600, maxV = 400) {
  if (!Number.isFinite(support)) {
    body.vy = Math.min(maxV, body.vy + accel * dt);
    body.y += body.vy * dt;
    return;
  }
  if (body.y + body.h >= support - 0.25) {
    body.vy = 0;
    if (body.y + body.h > support) body.y = support - body.h; // 已陷入支撑面：顶回表面
  } else {
    body.vy = Math.min(maxV, body.vy + accel * dt);
    body.y += body.vy * dt;
    if (body.y + body.h >= support) {
      body.y = support - body.h;
      body.vy = 0;
    }
  }
}

/**
 * 玩家推动容器（烧杯/集气瓶）——在 **Player.update** 里调用（玩家自己重设 vel 之后）。
 * 时序必须如此：容器 update 先于玩家——若由容器侧读取玩家速度驱动，物理步玩家
 * 自行前进 → 撞壁被弹回 → 推-弹交替（用户反馈：tick1 玩家碰到物块、tick2 物块推动
 * 玩家不动、tick3 物块不动玩家动一步…… 循环往复）。
 * 推动帧：容器前进 push、玩家**精确吸附**到壁边（消除累积偏差）、玩家 vel 清零
 * （物理步静止，无"自行前进→被壁分离"的循环）。推之前先看路，不穿模。
 */
function pushContainers(p, scene, dt) {
  const dir = (scene.control && scene.control.has('right') ? 1 : 0) - (scene.control && scene.control.has('left') ? 1 : 0);
  if (dir === 0) return;
  const push = dir * p.moveSpeed * dt;
  // 注意遍历 scene.objects（集气瓶不是 Container 子类，不在 scene.containers）
  for (const c of scene.objects) {
    if (c.isCarryItem !== 'beaker' && c.isCarryItem !== 'bottle') continue;
    if (typeof c.containsObj === 'function' && c.containsObj(p)) continue; // 杯内携带：走 lateUpdate 带动
    if (p.bottom <= c.y || p.top >= c.y + c.h) continue; // 高度不重叠（贴不到壁）
    const wall = c.wall ?? 4;
    if (push > 0 && p.right >= c.x - 2 && p.right <= c.x + wall + 2) {
      const nx = c.x + push;
      if (!horizontallyBlocked(c, nx, scene)) {
        c.x = nx;
        if (typeof c.syncWalls === 'function') c.syncWalls(); // 壁体**立即**跟上（否则物理步用旧壁位置 → 玩家被弹开）
        p.x = c.x - p.w; // 吸附到左壁
        p.vel.x = 0;
      }
    } else if (push < 0 && p.left <= c.x + c.w + 2 && p.left >= c.x + c.w - wall - 2) {
      const nx = c.x + push;
      if (!horizontallyBlocked(c, nx, scene)) {
        c.x = nx;
        if (typeof c.syncWalls === 'function') c.syncWalls();
        p.x = c.x + c.w; // 吸附到右壁
        p.vel.x = 0;
      }
    }
  }
}

/**
 * 水平阻挡探测：把 body 平移到 nx 后是否与任何实心体相交 ≥3px 深度。
 * 用于烧杯/集气瓶的"手动推挤"——它们不走通用碰撞积分，自己挪位置时需要
 * 自己看路，否则会被直接推进池盆壁里（穿模）。忽略脚底贴合面（≤2px 的
 * 支撑重叠不算），也不忽略动态实心体（别的装置壁照样挡路）。
 */
function horizontallyBlocked(body, nx, scene) {
  const l = nx + 1;
  const r = nx + body.w - 1;
  const t = body.y + 2;
  const b = body.y + body.h - 2;
  let hit = Infinity; // 记录阻挡物 x（诊断用）
  const sub = body.subBodies;
  // statics 同样排除自身子体（static 化后的壁体在 statics 里——不排除会被
  // 自己的右壁/左壁挡住 → 烧杯/集气瓶推不动——用户反馈的"推动异常"根因）
  const skipSelf = (s) => (sub && sub.includes(s));
  const scan = (list, skip) => {
    for (const s of list) {
      if (!s || !s.solid || (skip && skip(s))) continue;
      if (!(s.x < r && s.x + s.w > l)) continue;
      if (!(s.y < b && s.y + s.h > t)) continue;
      hit = Math.min(hit, s.x);
    }
  };
  if (scene.statics) scan(scene.statics, skipSelf);
  if (scene.dynamics) {
    scan(scene.dynamics, (d) => d === body || d === scene.player || skipSelf(d) || typeof d.amount === 'number');
  }
  return Number.isFinite(hit);
}

exports.shallowestSupportY = shallowestSupportY;
exports.settleBodyOnSupport = settleBodyOnSupport;
exports.pushContainers = pushContainers;
exports.horizontallyBlocked = horizontallyBlocked;

  };
  __modules["src/objects/switch.js"] = function (module, exports, __require) {
// ============================================================================
// 开关：容器子类，存放"开启物质"（由玩家把沉淀放置进去）。
//   mode='chemical'：开启物质质量 > 0 即开，按 consumeRate g/s 消耗，耗尽自动关
//   mode='pressure'：有玩家/物块站在其上即开（不消耗）
// 打开/关闭时触发 onOpen/onClose（关卡接线联动门、灯等）。
// ============================================================================

const { Container } = __require('src/objects/container.js');;
const { THEME, rr, glowText } = __require('src/render/theme.js');;

class Switch extends Container {
  get hoverLabel() {
    return '开关';
  }

  constructor({
    x, y, w = 40, h = 22,
    opening = null, consumeRate = 0, mode = 'chemical',
    color = '#d8b000', and = null, deleteId = null, showId = null, igniteId = null, extinguishId = null, openId = null, onOpen, onClose, ...rest
  } = {}) {
    // 开关是干式机构（存放"开启物质"），内部不应有液体水（否则放进去的盐会被溶解掉、开关失效）
    super({ x, y, w, h, solid: true, physicsKind: 'static', water: 0, volume: 0, ...rest });
    this.opening = opening; // 开启物质 id
    this.consumeRate = consumeRate; // g/s（0 = 不消耗）
    this.mode = mode;
    this.color = color;
    this.and = and; // "&"联锁：另一个开关的 id，两个都开才输出开
    this.deleteId = deleteId; // 开启瞬间删除的物体 id（如移开挡路的墙）
    this.showId = showId; // 开启瞬间显现的物体 id（初始隐藏的物体在此刻出现）
    this.igniteId = igniteId; // 开启瞬间点燃的酒精灯 id
    this.extinguishId = extinguishId; // 关闭瞬间熄灭的酒精灯 id
    this.openId = openId; // 开启瞬间打开的门 id（钥匙开锁门）
    this.open = false; // 物理状态（压力/化学/气体检测）
    this._lastEff = false; // 上次输出的有效开启态（初始=关，触发 onOpen/onClose）
    this._handlers = {};
    if (onOpen) this._handlers.open = onOpen;
    if (onClose) this._handlers.close = onClose;
  }

  get isSwitch() {
    return true;
  }

  openingMass() {
    return this.opening ? this.precipitates.get(this.opening) ?? 0 : 0;
  }

  on(name, fn) {
    this._handlers[name] = fn;
    return this;
  }

  /** 打开时触发（快捷方法） */
  onOpen(fn) {
    this._handlers.open = fn;
    return this;
  }

  /** 关闭时触发（快捷方法） */
  onClose(fn) {
    this._handlers.close = fn;
    return this;
  }

  fire(name) {
    this._handlers[name]?.();
  }

  update(dt, scene) {
    this.setOpen(this._isOpenTarget(scene));
    // 输出按"有效开启态"变化触发："&"联锁时需两个开关都开才输出开
    const eff = this.effectiveOpen(scene);
    if (eff !== this._lastEff) {
      this._lastEff = eff;
      this.fire(eff ? 'open' : 'close');
      // 开启瞬间：删除物体 / 显现隐藏物体 / 点燃灯（只触发一次）
      if (eff) {
        if (this.deleteId) {
          const target = scene.byId[this.deleteId];
          if (target) scene.removeObject(target);
        }
        if (this.showId) scene.reveal(this.showId);
        if (this.igniteId) {
          const lamp = scene.byId[this.igniteId];
          if (lamp && typeof lamp.ignite === 'function') lamp.ignite();
        }
        if (this.openId) {
          const door = scene.byId[this.openId];
          if (door && typeof door.open === 'function') door.open();
        }
      } else if (this.extinguishId) {
        const lamp = scene.byId[this.extinguishId];
        if (lamp && typeof lamp.extinguish === 'function') lamp.extinguish();
      }
    }
    if (this.open && this.consumeRate > 0 && this.opening) {
      this.takePrecipitate(this.opening, this.consumeRate * dt);
    }
  }

  /** 物理开态检测（子类可覆写：压力/化学/气体检测等） */
  _isOpenTarget(scene) {
    return this.mode === 'pressure' ? this._onTop(scene) : this.openingMass() > 0;
  }

  /** 物理状态：检测结果（不直接触发输出） */
  setOpen(v) {
    this.open = v;
  }

  /** 有效开启态：无 and → 自身 open；有 and → 自身 && 关联开关均开 */
  effectiveOpen(scene) {
    if (!this.and) return this.open;
    const other = scene ? scene.byId[this.and] : null;
    return this.open && !!(other && other.open);
  }

  _onTop(scene) {
    for (const obj of scene.objects) {
      if (obj === this || !obj.solid || obj.physicsKind !== 'dynamic') continue; // 排除自身与静态物
      if (obj.amount !== undefined) continue; // 沉淀粒子不压压力开关（只有玩家/物块能压）
      // 重叠开关区域，且脚底贴近开关顶（站在其上/压在开关上；站在下方地面不算）
      if (obj.right > this.x && obj.left < this.x + this.w &&
          obj.bottom >= this.y - 2 && obj.bottom <= this.y + 8) return true;
    }
    return false;
  }

  /** 标注开启物质 + 剩余量（钥匙等子类复用） */
  renderLabel(ctx) {
    if (this.opening) {
      glowText(ctx, this.opening, this.x, this.y - 4, THEME.gold.text, 'bold 10px monospace', 4);
    } else if (this.mode === 'chemical') {
      // 化学开关没设开启物质：提示需要设置（否则永远不会开）
      glowText(ctx, '未设开启物', this.x, this.y - 4, 'rgba(170,158,120,0.55)', 'bold 9px monospace', 3);
    }
    const m = this.openingMass();
    if (m > 0) {
      glowText(ctx, `${m.toFixed(1)}g`, this.x + this.w / 2, this.y + this.h + 12, '#ffffff', 'bold 10px monospace', 4);
    }
  }

  render(ctx, opts) {
    const scene = opts?.scene ?? null;
    const eff = this._lastEff ?? this.effectiveOpen(scene); // 有效输出态（& 双开）
    const phys = this.open; // 物理激活态（自身被按下）
    // 三态：金色=输出开；橙色=已按下但等待"&"配对开关；暗=未按下
    const waiting = this.and && phys && !eff;
    const glowColor = eff ? THEME.gold.light : waiting ? '#ffb340' : 'rgba(90,80,60,0.6)';
    const glowBlur = eff ? 16 : waiting ? 12 : 3;
    ctx.save();
    // 石台底座
    const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    g.addColorStop(0, eff ? '#565c80' : '#4a4f70');
    g.addColorStop(1, '#22263f');
    ctx.fillStyle = g;
    rr(ctx, this.x, this.y, this.w, this.h, 6);
    ctx.fill();
    // 边框：开=金发光，等=橙，关=暗（一眼可辨）
    const frame = eff ? THEME.gold.light : waiting ? '#ffb340' : '#151830';
    ctx.strokeStyle = frame;
    ctx.lineWidth = eff ? 2 : waiting ? 1.5 : 1;
    ctx.shadowColor = eff ? THEME.gold.light : waiting ? '#ffb340' : 'transparent';
    ctx.shadowBlur = eff ? 14 : waiting ? 8 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 顶部符文珠（物理按下就亮：金=双开输出，橙=已按下等配对，暗=未按下）
    const cx = this.x + this.w / 2;
    const cy = this.y + 7;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
    ctx.fillStyle = eff ? THEME.gold.light : waiting ? '#ffb340' : 'rgba(120,110,90,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(this.w, 20) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = eff ? '#3a2a08' : waiting ? '#4a2a08' : 'rgba(150,140,110,0.6)';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(eff ? '开' : waiting ? '等' : '关', cx, cy + 3);
    ctx.textAlign = 'left';
    ctx.restore();
    this.renderLabel(ctx);
    // "&" 联锁连线（若配置了 and）
    if (this.and && scene) this.renderAndLink(ctx, scene, eff, waiting);
  }

  /** 与另一个 "&" 开关画连接线 + 标记（金=双开，橙=已按下等配对，暗=未按下） */
  renderAndLink(ctx, scene, eff, waiting) {
    const other = scene.byId[this.and];
    if (!other) return;
    const ax = this.x + this.w / 2;
    const ay = this.y + this.h / 2;
    const bx = other.x + other.w / 2;
    const by = other.y + other.h / 2;
    const color = eff ? THEME.gold.light : waiting ? '#ffb340' : 'rgba(150,140,110,0.35)';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = eff || waiting ? color : 'transparent';
    ctx.shadowBlur = eff || waiting ? 6 : 0;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    // "&" 标记（居中于连线）
    ctx.fillStyle = color;
    ctx.font = 'bold 12px serif';
    ctx.textAlign = 'center';
    ctx.fillText('&', (ax + bx) / 2, (ay + by) / 2 - 4);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

exports.Switch = Switch;

  };
  __modules["src/objects/key.js"] = function (module, exports, __require) {
// ============================================================================
// 钥匙：开关子类，开启物质不消耗（一旦开启永久打开）。
// 渲染为神话金钥匙（开启时发光）。
// 开启后通常联动打开通关口（关卡接线 key.onOpen(() => door.open())）。
// ============================================================================

const { Switch } = __require('src/objects/switch.js');;
const { THEME } = __require('src/render/theme.js');;

class Key extends Switch {
  get hoverLabel() {
    return '钥匙';
  }
  constructor({ color = '#ff6a3d', consumeRate = 0, ...rest } = {}) {
    super({ consumeRate, color, ...rest });
  }

  render(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.save();
    ctx.shadowColor = this.open ? THEME.gold.light : '#a9722a';
    ctx.shadowBlur = this.open ? 18 : 6;
    ctx.strokeStyle = this.open ? THEME.gold.light : '#c9a45a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // 钥匙杆
    ctx.beginPath();
    ctx.moveTo(this.x + 6, cy);
    ctx.lineTo(this.x + this.w, cy);
    ctx.stroke();
    // 齿
    ctx.beginPath();
    ctx.moveTo(this.x + this.w * 0.72, cy);
    ctx.lineTo(this.x + this.w * 0.72, cy + 8);
    ctx.moveTo(this.x + this.w * 0.9, cy);
    ctx.lineTo(this.x + this.w * 0.9, cy + 9);
    ctx.stroke();
    // 圆环（钥匙头）
    ctx.beginPath();
    ctx.arc(this.x + 6, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    // 钥匙头内亮
    ctx.fillStyle = this.open ? 'rgba(255,240,190,0.35)' : 'rgba(120,90,40,0.25)';
    ctx.beginPath();
    ctx.arc(this.x + 6, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.renderLabel(ctx);
  }
}

exports.Key = Key;

  };
  __modules["src/objects/door.js"] = function (module, exports, __require) {
// ============================================================================
// 通关口：钥匙开启后由关卡接线 open()。玩家靠近且门开 → 通关。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { THEME } = __require('src/render/theme.js');;

class Door extends Obj {
  get hoverLabel() {
    return '门';
  }
  constructor({ x, y, w = 30, h = 80, color = '#ff6a3d', ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.color = color;
    this.isOpen = false;
    this.key = null; // 关联钥匙（可选，供检查）
  }

  get isDoor() {
    return true;
  }

  open() {
    this.isOpen = true;
  }

  render(ctx, opts) {
    const t = opts?.time ?? 0;
    ctx.save();
    const W = this.w;
    const H = this.h;
    const cx = this.x + W / 2;
    const cy = this.y + H / 2;
    // 石拱门框 + 砖纹
    const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + H);
    g.addColorStop(0, '#545a80');
    g.addColorStop(1, '#262a44');
    ctx.fillStyle = g;
    this._arch(ctx, 0);
    ctx.fill();
    ctx.save();
    this._arch(ctx, 0);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 1;
    for (let ty = this.y + 12; ty < this.y + H; ty += 13) {
      ctx.beginPath();
      ctx.moveTo(this.x + 2, ty);
      ctx.lineTo(this.x + W - 2, ty);
      ctx.stroke();
    }
    ctx.restore();
    // 拱框描边
    ctx.strokeStyle = '#12152a';
    ctx.lineWidth = 2;
    this._arch(ctx, 0);
    ctx.stroke();
    // 金色拱沿
    ctx.strokeStyle = THEME.gold.deep;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = 6;
    this._arch(ctx, 3);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 拱心石
    ctx.fillStyle = '#6a6f96';
    ctx.fillRect(cx - 3, this.y + 1, 6, 7);
    ctx.strokeStyle = THEME.gold.deep;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 3, this.y + 1, 6, 7);
    // 门内
    if (this.isOpen) {
      const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, H * 0.6);
      rg.addColorStop(0, '#f2e6ff');
      rg.addColorStop(0.45, THEME.portal.base);
      rg.addColorStop(1, 'rgba(90,42,154,0)');
      ctx.save();
      this._arch(ctx, 5);
      ctx.clip();
      ctx.fillStyle = rg;
      ctx.fillRect(this.x, this.y, W, H);
      // 旋转符文粒子
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = t * 1.3 + (i / n) * Math.PI * 2;
        const rr = 5 + ((i * 37) % 22);
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr * 0.72;
        ctx.fillStyle = 'rgba(242,230,255,0.85)';
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // 门口光晕
      ctx.shadowColor = THEME.portal.base;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = 'rgba(199,139,255,0.7)';
      ctx.lineWidth = 2;
      this._arch(ctx, 5);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = 'rgba(6,6,18,0.92)';
      this._arch(ctx, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 拱形路径；inset 为向内的缩进 */
  _arch(ctx, inset) {
    const x = this.x + inset;
    const y = this.y + inset;
    const w = this.w - inset * 2;
    const h = this.h - inset * 2;
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }
}

exports.Door = Door;

  };
  __modules["src/objects/lamp.js"] = function (module, exports, __require) {
// ============================================================================
// 酒精灯：容器子类。点燃时在其 range 内提供"加热"与"点燃源"；灯上可放置沉淀。
// 由开关控制（关卡接线 switch.onOpen(() => lamp.ignite())）。
// 焰色反应：火焰区域物体的表层物质（灯上沉淀/物块/玩家）含 Na/K/Ca/Ba/Cu/Li
// 等元素时，火焰染上特征色（物理变化，不消耗物质）；移开恢复。
// ============================================================================

const { Container } = __require('src/objects/container.js');;
const { THEME, rr, drawFlame } = __require('src/render/theme.js');;
const { flameColorOf } = __require('src/chem/substances.js');;
const { CFG } = __require('src/core/config.js');;

class Lamp extends Container {
  constructor({ x, y, w = 40, h = 40, autoOn = false, range = CFG.lampRange, lightRange = CFG.lampLightRange, highTemp = false, ...rest } = {}) {
    // 灯/喷灯是干燥加热台：内部不应有液体水（否则 CaO+H2O、Na+H2O 等在灯上凭空发生，
    // 且 CaCO3 分解出的 CaO 会被灯水消耗掉）。water=0 由 …rest 之后显式覆盖保证。
    super({ x, y, w, h, solid: true, physicsKind: 'static', water: 0, volume: 0, ...rest });
    this.lit = autoOn;
    this.flameLevel = this.lit ? 1 : 0; // 火焰淡入淡出（0..1）
    this.range = range;
    this.lightRange = lightRange; // 提供"光照"条件的半径（见光分解 HClO 等）
    this.highTemp = highTemp; // 酒精喷灯 = true
    this.spillSides = false; // 灯上颗粒留在灯顶堆成小山，不滚落
    this.clipGrains = false; // 灯上颗粒不裁剪，自然堆成小山
    this.flameTint = null; // 焰色反应：当前特征色（null = 默认橙/蓝）
    this.flameTintCur = null; // 缓动中的颜色（避免闪烁）
  }

  get isLamp() {
    return true;
  }

  get hoverLabel() {
    return '灯';
  }

  /** 灯是台子不是液体容器：玩家/物块不会"浸入灯"（避免站灯旁被误判浸入而与灯上粉末反应） */
  containsObj() {
    return false;
  }

  ignite() {
    this.lit = true;
  }

  extinguish() {
    this.lit = false;
  }

  /** 灯面可容纳的沉淀质量上限（g）：按灯面区域面积估算，防止粉末全部挤在灯框里 */
  plateCapacity() {
    const r = this.grainRegion();
    return Math.max(2, (r.w * r.h) / 36 * 0.2); // 约每 36px² 放一颗（0.2g）
  }

  /** 火焰动画：点燃快速淡入、熄灭缓慢淡出；灯上沉淀颗粒照常沉降（不再滑落） */
  update(dt, scene) {
    super.update(dt, scene);
    const target = this.lit ? 1 : 0;
    const k = this.lit ? 11 : 4.5;
    this.flameLevel += (target - this.flameLevel) * Math.min(1, k * dt);
    if (Math.abs(this.flameLevel - target) < 0.01) this.flameLevel = target;
    // 焰色反应检测：火焰区域物体的表层物质（灯上沉淀 → 灯焰上物块/玩家）
    const tint = this.lit ? this._detectFlameTint(scene) : null;
    if (tint !== this.flameTint) this.flameTint = tint;
    if (this.flameTint && this.flameTint !== this.flameTintCur) {
      // 颜色缓动过渡（新色淡入，避免瞬间跳变）
      if (!this.flameTintCur) this.flameTintCur = this.flameTint;
      else this.flameTintCur = mixHex(this.flameTintCur, this.flameTint, Math.min(1, 6 * dt));
      if (hexDist(this.flameTintCur, this.flameTint) < 0.02) this.flameTintCur = this.flameTint;
    } else if (!this.flameTint && this.flameTintCur) {
      // 移开物体：颜色淡出回默认
      this.flameTintCur = null;
    }
  }

  /**
   * 焰色检测（多源合并）：灯上沉淀 + 火焰区域物体的表层物质，按"暴露质量"加权混色。
   * 多种含焰色物质同时存在（多种盐、物块+沉淀）时不再只取第一种：
   * 按各物质的暴露质量加权平均 RGB（同色物质权重合并）——火焰呈现混合色调；
   * 只有一种焰色物质时返回其原色（与单盐行为一致）。
   */
  _detectFlameTint(scene) {
    const acc = new Map(); // hex → 总权重（g）
    const add = (id, w) => {
      if (!(w > 0)) return;
      const c = flameColorOf(id);
      if (c) acc.set(c, (acc.get(c) ?? 0) + w);
    };
    for (const [id, m] of this.precipitates) add(id, m);
    const fx = this.x + this.w / 2;
    const fy = this.flameY();
    const probe = { x: fx - 26, y: fy - 34, w: 52, h: 68 };
    for (const o of scene.objects) {
      if (o === this || o.isLamp) continue;
      if (!o.solid && !o.isPlayerObj) continue;
      if (o.right < probe.x || o.left > probe.x + probe.w || o.bottom < probe.y || o.top > probe.y + probe.h) continue;
      const exp = o.grid && o.grid.exposedMasses ? o.grid.exposedMasses() : null;
      if (!exp) continue;
      for (const id of Object.keys(exp)) add(id, exp[id]);
    }
    if (acc.size === 0) return null;
    if (acc.size === 1) return [...acc.keys()][0];
    let r = 0, g = 0, b = 0, total = 0;
    for (const [hex, w] of acc) {
      const c = hexToRgb(hex);
      r += c.r * w; g += c.g * w; b += c.b * w; total += w;
    }
    return rgbToHex(r / total, g / total, b / total);
  }

  /** 火焰 Y（矮炉条喷灯的火焰浮在顶部上方） */
  flameY() {
    return this.h < 20 ? this.y - 16 : this.y + this.h - 30;
  }

  /** 颗粒沉降区：火焰上方一个较高区域，颗粒自然堆成小山（不裁剪、不滚落） */
  grainRegion() {
    const bx = this.x + this.w / 2;
    const fy = this.flameY();
    const w = this.h < 20 ? this.w * 0.9 : Math.min(44, this.w);
    const h = this.h < 20 ? 34 : 42;
    return { x: bx - w / 2, y: fy - h + 2, w, h };
  }

  render(ctx, opts) {
    const t = opts?.time ?? 0;
    const thin = this.h < 20;
    const bx = this.x + this.w / 2;
    const fy = this.flameY();
    if (thin) {
      // 喷灯：青铜炉条 + 一排火焰
      ctx.save();
      const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
      g.addColorStop(0, '#8a6420');
      g.addColorStop(1, '#4a3410');
      ctx.fillStyle = g;
      rr(ctx, this.x, this.y, this.w, this.h, 4);
      ctx.fill();
      ctx.strokeStyle = '#2a1c08';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 炉口纹
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < Math.floor(this.w / 12); i++) {
        ctx.fillRect(this.x + 4 + i * 12, this.y + 2, 5, this.h - 4);
      }
      ctx.restore();
      if (this.flameLevel > 0.01) {
        const fc = this.flameTintCur ?? (this.highTemp ? '#4fb6ff' : '#ff7a3d');
        const inner = this.flameTintCur ? lightenHex(fc, 0.55) : (this.highTemp ? '#d8f6ff' : '#fff3c4');
        const n = Math.max(2, Math.floor(this.w / 26));
        const grow = 0.25 + 0.75 * this.flameLevel;
        for (let i = 0; i < n; i++) {
          const fx = this.x + (i + 0.5) * (this.w / n);
          ctx.save();
          ctx.globalAlpha = this.flameLevel;
          drawFlame(ctx, fx, fy + 2, (17 + Math.sin(t * 11 + i * 1.9) * 2) * grow, fc, inner, t + i * 1.7);
          ctx.restore();
        }
      }
    } else {
      // 酒精灯：青铜灯身
      ctx.save();
      const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
      g.addColorStop(0, '#c9932f');
      g.addColorStop(0.5, '#8a6420');
      g.addColorStop(1, '#4a3410');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(this.x + 5, this.y + this.h - 6);
      ctx.lineTo(this.x + this.w - 5, this.y + this.h - 6);
      ctx.lineTo(this.x + this.w - 10, this.y + this.h - 22);
      ctx.lineTo(this.x + 10, this.y + this.h - 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2a1c08';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 灯芯
      ctx.fillStyle = '#2a2418';
      ctx.fillRect(bx - 2, this.y + this.h - 27, 4, 8);
      ctx.restore();
      if (this.flameLevel > 0.01) {
        const fc = this.flameTintCur ?? (this.highTemp ? '#4fb6ff' : '#ff7a3d');
        const inner = this.flameTintCur ? lightenHex(fc, 0.55) : (this.highTemp ? '#d8f6ff' : '#fff3c4');
        const grow = 0.25 + 0.75 * this.flameLevel;
        ctx.save();
        ctx.globalAlpha = this.flameLevel;
        drawFlame(ctx, bx, fy + 2, (20 + Math.sin(t * 13) * 2) * grow, fc, inner, t);
        ctx.restore();
      }
    }
    // 焰色反应：火焰区域铺一层特征色柔光（物体也在光里，视觉上"发同色的光"）
    if (this.flameTintCur && this.flameLevel > 0.01) {
      ctx.save();
      const g = ctx.createRadialGradient(bx, fy, 4, bx, fy, 56);
      g.addColorStop(0, hexRgba(this.flameTintCur, 0.34 * this.flameLevel));
      g.addColorStop(1, hexRgba(this.flameTintCur, 0));
      ctx.fillStyle = g;
      ctx.fillRect(bx - 60, fy - 60, 120, 120);
      ctx.restore();
    }
    this.renderContentsLabel(ctx);
    // 灯上放置的沉淀：颗粒从火焰附近生成并物理堆叠（不再均匀悬空）
    this.renderGrains(ctx);
  }
}

// ---- 颜色工具（焰色缓动/提亮）----
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t);
}

function hexDist(a, b) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return (Math.abs(ca.r - cb.r) + Math.abs(ca.g - cb.g) + Math.abs(ca.b - cb.b)) / 765;
}

function lightenHex(hex, t) {
  const c = hexToRgb(hex);
  return rgbToHex(c.r + (255 - c.r) * t, c.g + (255 - c.g) * t, c.b + (255 - c.b) * t);
}

function hexRgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

exports.Lamp = Lamp;

  };
  __modules["src/objects/blastlamp.js"] = function (module, exports, __require) {
// ============================================================================
// 酒精喷灯：酒精灯子类，提供"高温"（且隐式满足"加热"）与点燃源。
// 造型（卡通化挂式酒精喷灯）：黄铜底座罐 → 预热盘 → 中央喷管（火焰出口）→
// 侧立汽化管 + 银管与黑色旋钮；点燃时从喷管口冒出狭长高温蓝焰。
// 风格与游戏一致的"玩具感"：统一深色描边 + 平涂渐变 + 一两笔高光，舍去写实细节
// （滚花/多道高光/支架等）。宽炉条款（h<20）沿用老样式。
// ============================================================================

const { Lamp } = __require('src/objects/lamp.js');;
const { rr } = __require('src/render/theme.js');;

class BlastLamp extends Lamp {
  constructor({ highTemp = true, color = '#8fd8ff', ...rest } = {}) {
    super({ highTemp, ...rest });
    this.color = color;
  }

  get hoverLabel() {
    return '喷灯';
  }

  render(ctx, opts) {
    const t = opts?.time ?? 0;
    const bx = this.x + this.w / 2;
    const fy = this.flameY();
    if (this.h < 20) {
      // 宽炉条款（解谜关卡的整排炉条）：沿用酒精灯样式（蓝色喷焰由 highTemp 决定）
      super.render(ctx, opts);
      return;
    }
    // ---- 卡通挂式酒精喷灯 ----
    const x = this.x, y = this.y, w = this.w, h = this.h;
    const baseTop = y + h - 18; // 底座罐体顶
    ctx.save();
    // 底座罐体
    const g = ctx.createLinearGradient(x, baseTop, x, y + h);
    g.addColorStop(0, '#c9932f');
    g.addColorStop(1, '#6e4e14');
    ctx.fillStyle = g;
    rr(ctx, x + 3, baseTop, w - 6, y + h - baseTop, 5);
    ctx.fill();
    ctx.strokeStyle = '#2a1c08';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 顶盖（椭圆圆盘）
    ctx.fillStyle = '#b5882a';
    ctx.beginPath();
    ctx.ellipse(bx, baseTop, (w - 6) / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a1c08';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 盖子左侧一笔高光（卡通感）
    ctx.strokeStyle = 'rgba(255,240,190,0.5)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(bx - 2, baseTop - 0.6, (w - 6) / 2 - 7, 2.2, 0, Math.PI * 1.08, Math.PI * 1.75);
    ctx.stroke();
    // 调节旋钮（底座右侧：圆钮 + 6 道齿痕）
    const kx = x + w - 9, ky = baseTop + 8;
    ctx.fillStyle = '#c9932f';
    ctx.beginPath();
    ctx.arc(kx, ky, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a1c08';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(42,28,8,0.55)';
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      ctx.beginPath();
      ctx.moveTo(kx + Math.cos(a) * 2.4, ky + Math.sin(a) * 2.4);
      ctx.lineTo(kx + Math.cos(a) * 4.6, ky + Math.sin(a) * 4.6);
      ctx.stroke();
    }
    // 预热盘（小碟）
    ctx.fillStyle = '#c9932f';
    ctx.strokeStyle = '#2a1c08';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(bx, baseTop - 1, 14, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a2c10';
    ctx.beginPath();
    ctx.ellipse(bx, baseTop - 1.2, 7, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // 中央喷管（汽化管：火焰出口在顶部）
    const cw = 11;
    const cg = ctx.createLinearGradient(bx - cw / 2, 0, bx + cw / 2, 0);
    cg.addColorStop(0, '#8a6420');
    cg.addColorStop(0.35, '#c9932f');
    cg.addColorStop(1, '#6e4e14');
    ctx.fillStyle = cg;
    rr(ctx, bx - cw / 2, fy, cw, baseTop - 1 - fy, 2.5);
    ctx.fill();
    ctx.strokeStyle = '#2a1c08';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // 喷口（顶部暗口 + 亮缘）
    ctx.fillStyle = '#171208';
    ctx.beginPath();
    ctx.ellipse(bx, fy + 0.6, cw / 2 - 0.8, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,235,170,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(bx, fy + 0.4, cw / 2 - 0.4, 1.9, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 侧立汽化管（右侧较高，顶端开口）
    const tw = 7, tX = bx + cw / 2 + 0.5;
    const tg = ctx.createLinearGradient(tX, 0, tX + tw, 0);
    tg.addColorStop(0, '#a97a24');
    tg.addColorStop(0.4, '#c9932f');
    tg.addColorStop(1, '#6e4e14');
    ctx.fillStyle = tg;
    rr(ctx, tX, fy - 5, tw, baseTop - 1 - (fy - 5), 2);
    ctx.fill();
    ctx.strokeStyle = '#2a1c08';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#221a0a';
    ctx.beginPath();
    ctx.ellipse(tX + tw / 2, fy - 4.6, tw / 2 - 0.8, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // 银色侧管（单笔粗线）+ 黑色旋钮
    ctx.strokeStyle = '#b8c4cc';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(bx - cw / 2, fy + 7);
    ctx.lineTo(x - 8, fy + 7);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#1a1a1a';
    rr(ctx, x - 17, fy + 2, 10, 10, 3.5);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = '#3c3c3c';
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 14.5 + i * 2.4, fy + 3.5);
      ctx.lineTo(x - 14.5 + i * 2.4, fy + 10.5);
      ctx.stroke();
    }
    // 旋钮左上小高光
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(x - 13.5, fy + 4.4, 2.6, 1.4, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 喷焰：喷管口冒出的狭长高温蓝焰（窄焰 + 白热内芯）
    if (this.flameLevel > 0.01) {
      const fc = this.flameTintCur ?? '#4fb6ff';
      const inner = this.flameTintCur ? lightenHex(fc, 0.6) : '#eaf8ff';
      const grow = 0.25 + 0.75 * this.flameLevel;
      ctx.save();
      ctx.globalAlpha = this.flameLevel;
      drawJet(ctx, bx, fy + 2.5, (19 + Math.sin(t * 14) * 1.8) * grow, fc, inner, t);
      ctx.restore();
    }
    // 焰色反应：火焰区域铺一层特征色柔光（与酒精灯一致）
    if (this.flameTintCur && this.flameLevel > 0.01) {
      ctx.save();
      const g2 = ctx.createRadialGradient(bx, fy, 4, bx, fy, 56);
      g2.addColorStop(0, hexRgba(this.flameTintCur, 0.34 * this.flameLevel));
      g2.addColorStop(1, hexRgba(this.flameTintCur, 0));
      ctx.fillStyle = g2;
      ctx.fillRect(bx - 60, fy - 60, 120, 120);
      ctx.restore();
    }
    this.renderContentsLabel(ctx);
    this.renderGrains(ctx);
  }
}

/** 狭长喷焰（卡通版）：细长外焰 + 白热内芯 + 轻轻摆动 */
function drawJet(ctx, x, y, h, color, innerColor, t) {
  const wob = Math.sin(t * 13) * 0.08 + Math.sin(t * 20 + 1.7) * 0.05;
  const w = Math.max(4.5, h * 0.36); // 比写实版稍宽，更"玩具"
  ctx.save();
  // 外辉光
  ctx.shadowColor = color;
  ctx.shadowBlur = h * 1.4;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.3, y - h * 0.52 + wob * 3, x + w * 0.12, y - h * (0.88 + wob));
  ctx.quadraticCurveTo(x + w * 0.36, y - h * 0.48 - wob * 2.5, x + w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  // 白热内芯
  ctx.fillStyle = innerColor;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.22, y - h * 0.03);
  ctx.quadraticCurveTo(x - w * 0.06, y - h * 0.4 - wob * 1.2, x + w * 0.05, y - h * 0.5);
  ctx.quadraticCurveTo(x + w * 0.16, y - h * 0.36, x + w * 0.22, y - h * 0.03);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- 颜色工具（与 lamp.js 一致）----
function hexToRgb(hex) {
  const h0 = hex.replace('#', '');
  return {
    r: parseInt(h0.slice(0, 2), 16),
    g: parseInt(h0.slice(2, 4), 16),
    b: parseInt(h0.slice(4, 6), 16),
  };
}

function lightenHex(hex, t) {
  const c = hexToRgb(hex);
  return `#${rgb2(c.r + (255 - c.r) * t)}${rgb2(c.g + (255 - c.g) * t)}${rgb2(c.b + (255 - c.b) * t)}`;
}

function hexRgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function rgb2(v) {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}

exports.BlastLamp = BlastLamp;

  };
  __modules["src/objects/beaker.js"] = function (module, exports, __require) {
// ============================================================================
// 烧杯：可承载任何物质（含玩家）的容器。杯壁（左/右/底）为实心碰撞体：
//   - 不能从侧面走进，只能跳过杯口进入；玩家太宽会卡在杯口下不去
//   - 受重力：无支撑时下落
//   - 玩家在杯内 → 跟随移动；玩家在杯外贴杯壁 → 推动
// ============================================================================

const { Container } = __require('src/objects/container.js');;
const { getSubstance } = __require('src/chem/substances.js');;
const { Obj } = __require('src/objects/obj.js');;
const { renderLiquid, solutionColor } = __require('src/render/liquidrender.js');;
const { rr } = __require('src/render/theme.js');;
const { Drip } = __require('src/objects/drip.js');;
const { shallowestSupportY, settleBodyOnSupport } = __require('src/physics/support.js');;

// ---- 倒出动画节奏（纯视觉会话，见 beginPour）----
const POUR_TRAVEL = 0.16; // 平移到目标旁的时长
const POUR_TILT_IN = 0.14; // 起倾时长
const POUR_BACK = 0.22; // 松手后回位时长
const POUR_HOLD_MAX = 0.45; // 按 X 续期的停留余量（连按/按住都保持不停留超时）
const POUR_MAX_ANG = 0.52; // 最大倾角（≈30°，弧度）
const POUR_LIFT = 5; // 倾倒时轻微抬升（手腕感）

let DRIP_SEQ = 0;

class Beaker extends Container {
  get hoverLabel() {
    return '烧杯';
  }
  get isCarryItem() {
    return 'beaker';
  }
  constructor({ x, y, w = 60, h = 70, wall = 5, ...rest } = {}) {
    super({ x, y, w, h, ...rest });
    this.wall = wall;
    this.vy = 0;
    // 实心杯壁（左/右/底），跟随烧杯移动；顶口敞开（可跳入）
    // static：壁是"与杯身联动的死墙"——不参与动量交换（玩家推杯时靠 update 驱动杯身，
    // 壁只跟随；动态壁会被玩家撞飞再被 syncWalls 拉回 → 推动强烈震动——用户反馈）。
    // noLift：杯壁不被气泡柱气流托起（通入气体时气泡柱紧贴杯壁，不能把杯子顶飞）
    this.subBodies = [
      new Obj({ id: 'bk_l', x, y, w: wall, h, solid: true, static: true, physicsKind: 'static', noLift: true }),
      new Obj({ id: 'bk_r', x: x + w - wall, y, w: wall, h, solid: true, static: true, physicsKind: 'static', noLift: true }),
      new Obj({ id: 'bk_b', x, y: y + h - wall, w, h: wall, solid: true, static: true, physicsKind: 'static', noLift: true }),
    ];
  }

  innerRect() {
    return {
      x: this.x + this.wall,
      y: this.y + this.wall,
      w: this.w - 2 * this.wall,
      h: this.h - 2 * this.wall,
    };
  }

  /** 杯壁跟随烧杯位置 */
  syncWalls() {
    const [l, r, b] = this.subBodies;
    l.x = this.x;
    l.y = this.y;
    r.x = this.x + this.w - this.wall;
    r.y = this.y;
    b.x = this.x;
    b.y = this.y + this.h - this.wall;
  }

  /**
   * 倒出会话（X 倒出时由 items.pourBeaker 调用；纯视觉，物理坐标不动）：
   * ① 杯身平移到目标容器旁（修正"目标在右动画仍朝左/落点不准"）；
   * ② 起倾 ~30°，杯口沿连续滴出液滴落入目标液面；
   * ③ 玩家按住/连按 X → 保持倾倒姿势不回位，松手 0.45s 后回弹归位。
   * 同一目标续倒不重跑位移（不顿挫）。
   */
  beginPour(scene, target) {
    if (!scene || typeof scene.addObject !== 'function') return;
    const dir = (target.x + (target.w ?? 0) / 2) >= (this.x + this.w / 2) ? 1 : -1;
    const gap = 6;
    if (this._pour && this._pour.target === target && this._pour.dir === dir) {
      this._pour.holdT = POUR_HOLD_MAX; // 续倒：只续停留
      return;
    }
    let standX = dir > 0 ? target.x - this.w - gap : target.x + target.w + gap;
    standX = Math.max(2, Math.min((scene.worldW ?? 2000) - this.w - 2, standX));
    this._pour = { target, dir, t: 0, fromX: this.x, standX, holdT: POUR_HOLD_MAX, lipEmit: 0, relAt: null };
  }

  /** 倒出会话推进：计算渲染偏移/倾角 + 杯口沿液滴发射 */
  updatePour(dt, scene) {
    const sess = this._pour;
    if (!sess) {
      this._visPour = null;
      return;
    }
    // X 按住且选中的正是本杯 → 续期停留；否则停留计时递减
    const sel = scene.player?.inventory?.selectedItem?.();
    if (scene.control && scene.control.has('use') && sel === this) sess.holdT = POUR_HOLD_MAX;
    else sess.holdT -= dt;

    sess.t += dt;
    if (sess.relAt == null && sess.holdT <= 0) sess.relAt = sess.t; // 开始回位
    const standOff = sess.standX - sess.fromX;

    let offK = 0;
    let angK = 0;
    if (sess.relAt != null) {
      const tr = sess.t - sess.relAt;
      if (tr >= POUR_BACK) {
        this._pour = null;
        this._visPour = null;
        return;
      }
      const k0 = 1 - tr / POUR_BACK;
      const k = k0 * k0 * (3 - 2 * k0); // smoothstep 回位
      offK = k;
      angK = k;
    } else {
      const pt = Math.min(1, sess.t / POUR_TRAVEL);
      offK = 1 - Math.pow(1 - pt, 3); // easeOutCubic 平移
      const at = Math.min(1, Math.max(0, (sess.t - POUR_TRAVEL) / POUR_TILT_IN));
      angK = at * at * (3 - 2 * at); // smoothstep 起倾
    }

    const ang = POUR_MAX_ANG * angK;
    const offX = standOff * offK;
    const liftY = -POUR_LIFT * angK;
    this._visPour = { offX, liftY, aSign: sess.dir, ang };

    // 杯口沿液滴：倾斜到位后从旋转后的口沿位置滴落，落向目标液面
    if (ang > 0.16 && offK > 0.9 && scene.addObject) {
      sess.lipEmit -= dt;
      if (sess.lipEmit <= 0) {
        sess.lipEmit = 0.065;
        const a = sess.dir * ang;
        const pvx = this.x + offX + this.w / 2;
        const pvy = this.y + this.h + liftY;
        const lx0 = sess.dir > 0 ? this.w / 2 - 4 : -(this.w / 2 - 4);
        const ly0 = 8 - this.h;
        const wx = pvx + lx0 * Math.cos(a) - ly0 * Math.sin(a);
        const wy = pvy + lx0 * Math.sin(a) + ly0 * Math.cos(a);
        const tgt = sess.target.innerRect ? sess.target.innerRect() : { x: sess.target.x + 4, y: sess.target.y + 4, w: sess.target.w - 8, h: sess.target.h - 8 };
        scene.addObject(new Drip({
          x: wx - 2,
          y: wy + 2,
          targetY: tgt.y + 4,
          color: solutionColor(this.solution).color,
          id: `drip${++DRIP_SEQ}`,
        }));
      }
    }
  }

  /** 无支撑时受重力下落，落到**最浅**支撑面停住（statics + 玩家等实心动态体；
   *  跨在池沿/台阶上不沉入更深的盆底——见 physics/support.js 的语义说明） */
  applyGravity(dt, scene) {
    settleBodyOnSupport(this, dt, shallowestSupportY(this, scene));
  }

  update(dt, scene) {
    super.update(dt, scene); // 颗粒沉降等容器逻辑
    this.applyGravity(dt, scene);
    this.updatePour(dt, scene);
    // 玩家贴壁推动已挪到 Player.update（pushContainers——时序要求：玩家重设 vel 之后、
    // 物理步之前：吸附+清 vel，否则推-弹交替"一卡一卡"——用户反馈）
  }

  /** 物理结算后：杯内玩家与烧杯互相带动——烧杯跟随玩家的水平位移；玩家跟随烧杯的竖直位移。
   *  **下行带动护栏**：玩家跟随下移时不得被压进任何实心静态体（嵌池穿模根因——
   *  原实现是裸 p.y += dy 瞬移）；脚部将越过原本位于其下方的实心顶面时裁剪到表面。 */
  lateUpdate(dt, scene) {
    const p = scene.player;
    if (p && this.containsObj(p)) {
      // 烧杯跟随玩家的水平位移（杯壁挡住时玩家不移动 → 烧杯也不动，不甩出）
      const dx = p.x - (this._prevPx ?? p.x);
      if (Math.abs(dx) > 0.01) this.x += dx;
      // 玩家跟随烧杯的竖直位移（烧杯下落/被抬起时玩家一起移动，不脱离）
      const dy = this.y - (this._prevBy ?? this.y);
      if (Math.abs(dy) > 0.01) {
        let ny = p.y + dy;
        if (dy > 0) {
          for (const s of scene.statics) {
            if (!s.solid) continue;
            if (!(s.x < p.x + p.w && s.x + s.w > p.x)) continue; // 水平重叠
            const feet = p.y + p.h;
            if (feet <= s.y + 0.5 && ny + p.h > s.y) ny = Math.min(ny, s.y - p.h); // 脚下实心顶面：裁到表面
          }
        }
        p.y = ny;
      }
    }
    this._prevPx = p ? p.x : this._prevPx;
    this._prevBy = this.y;
    this.syncWalls();
  }

  render(ctx, scene) {
    // 倒出会话变换：平移到目标旁 + 轻微抬升 + 倾斜（液体/颗粒/杯体整体）
    ctx.save();
    const vp = this._visPour;
    if (vp && (Math.abs(vp.offX) > 0.01 || vp.ang > 0.001)) {
      const cx = this.x + vp.offX + this.w / 2;
      const cy = this.y + this.h;
      ctx.translate(cx, cy);
      ctx.rotate(vp.aSign * vp.ang);
      ctx.translate(-cx, -cy - vp.liftY);
    }
    // 液体（元素发光液面；液面高度 = 实际液体量/容量——吸液/倒出后可见升降）
    const inner = this.innerRect();
    if (inner.w > 0 && inner.h > 0) {
      const vol = this.solution.volume > 0 ? this.solution.volume : Infinity;
      const lh = inner.h * Math.max(0, Math.min(1, this.solution.totalMass() / vol));
      if (lh > 2) renderLiquid(ctx, inner.x, inner.y + inner.h - lh, inner.w, lh, this.solution, scene.time ?? 0);
    }
    // 沉淀：从反应位置生成的视觉颗粒，物理堆叠成堆
    this.renderGrains(ctx);
    // 玻璃杯（U 形，半透明 + 亮边 + 高光）
    ctx.save();
    ctx.fillStyle = 'rgba(210,240,255,0.12)';
    rr(ctx, this.x, this.y, this.w, this.h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,245,255,0.8)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(180,230,255,0.6)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x, this.y + this.h - 7);
    ctx.arcTo(this.x, this.y + this.h, this.x + 7, this.y + this.h, 7);
    ctx.lineTo(this.x + this.w - 7, this.y + this.h);
    ctx.arcTo(this.x + this.w, this.y + this.h, this.x + this.w, this.y + this.h - 7, 7);
    ctx.lineTo(this.x + this.w, this.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 左侧高光
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(this.x + 1, this.y + 2, 2, this.h - 4);
    ctx.restore();
    ctx.restore(); // 倾旋包裹结束
    this.renderContentsLabel(ctx);
  }
}

exports.Beaker = Beaker;

  };
  __modules["src/objects/drip.js"] = function (module, exports, __require) {
// ============================================================================
// 液滴（Drip）：滴管滴液的下坠视觉（带滴管液体颜色；到达液面即消失）。
// 只有视觉反馈——化学由溶液模型处理（落点记录在容器 depositAt）。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;

class Drip extends Obj {
  constructor({ x, y, targetY, color = '#9fd8ff', ...rest }) {
    super({ x, y, w: 4, h: 6, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.targetY = targetY;
    this.color = color;
    this.vy = 0;
    this.life = 2;
  }

  update(dt, scene) {
    this.vy += 900 * dt; // 重力加速下坠
    this.y += this.vy * dt;
    if (this.y >= this.targetY) scene.removeObject(this);
  }

  render(ctx) {
    // 泪滴形（上尖下圆）：上端尖锥收拢、下端圆胖——下坠中的液滴
    const cx = this.x + this.w / 2;
    const top = this.y;
    const bottom = this.y + this.h;
    const r = Math.max(3, this.h * 0.62); // 下部圆球半径
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 7;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(cx, top); // 尖端
    ctx.bezierCurveTo(cx + r * 0.5, top + r * 0.8, cx + r, bottom - r * 0.7, cx, bottom);
    ctx.bezierCurveTo(cx - r, bottom - r * 0.7, cx - r * 0.5, top + r * 0.8, cx, top);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // 下部高光（左上方）
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.28, bottom - r * 0.62, r * 0.2, r * 0.32, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

exports.Drip = Drip;

  };
  __modules["src/objects/sign.js"] = function (module, exports, __require) {
// ============================================================================
// 文字标签：关卡内显示说明文字（帮助玩家理解每个区域的机制）
// 渲染为神秘石板 + 金色发光文字。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { rr } = __require('src/render/theme.js');;

class Sign extends Obj {
  get hoverLabel() {
    return '路标';
  }
  constructor({ x, y, text, color = '#ffe9b0', size = 12, ...rest } = {}) {
    // 石板尺寸按文字估算（构造期无 ctx 测量；中文字符宽≈size，西文字符≈0.6×size）
    const lines = String(text ?? '').split('\n');
    let maxChars = 0;
    for (const l of lines) maxChars = Math.max(maxChars, l.length);
    super({
      x, y,
      w: Math.max(14, Math.round(maxChars * size * 0.68) + 14),
      h: lines.length * (size + 6) + 18,
      solid: false,
      physicsKind: 'none',
      ...rest,
    });
    this.text = text;
    this.color = color;
    this.size = size;
  }

  render(ctx) {
    const lines = this.text.split('\n');
    const size = this.size;
    const lh = size + 6;
    ctx.save();
    ctx.font = `${size}px "Segoe UI", sans-serif`;
    const maxW = Math.max(...lines.map((ln) => ctx.measureText(ln).width));
    // 盒模型：this.y = 石板顶（与编辑器选中框一致）；文字基线 = 顶 + size + 8
    const baseY = this.y + size + 8;
    ctx.save();
    // 石板底：顶边在文字上方留出 padding
    ctx.fillStyle = 'rgba(14,10,38,0.74)';
    rr(ctx, this.x - 7, this.y, maxW + 14, lines.length * lh + 18, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.55)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = 'rgba(232,184,75,0.4)';
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 金色发光文字
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    lines.forEach((ln, i) => ctx.fillText(ln, this.x, baseY + i * lh));
    ctx.restore();
  }
}

exports.Sign = Sign;

  };
  __modules["src/objects/gasdetector.js"] = function (module, exports, __require) {
// ============================================================================
// 气体探测器：和开关同理，但"开启条件"是大气中某气体含量超过阈值。
// 复用 Switch 的 onOpen/onClose 接线与 effectiveOpen（"&"联锁）逻辑。
// ============================================================================

const { Switch } = __require('src/objects/switch.js');;
const { THEME, rr, glowText } = __require('src/render/theme.js');;

class GasDetector extends Switch {
  get hoverLabel() {
    return '气体探测器';
  }

  constructor({
    x, y, w = 40, h = 22,
    gas = 'H2', threshold = 0.5,
    color = '#3fa8e0', onOpen, onClose, ...rest
  } = {}) {
    super({ x, y, w, h, mode: 'chemical', color, onOpen, onClose, ...rest });
    this.gas = gas; // 检测的气体 id
    this.threshold = threshold; // 触发阈值（g）
  }

  /** 检测开态：只有"反应产生的气体"超标 或 放入开启物质（任一满足即开；其余复用 Switch.update + "&"联锁）。
   *  不检测大气里预置的气体（如初始 atmosphere.add('H2', 8)），只检测反应正在产生的那种气体。 */
  _isOpenTarget(scene) {
    const gasOn = this.gas ? !!(scene._reactGas && scene._reactGas[this.gas] > this.threshold) : false;
    const openingOn = this.opening ? this.openingMass() > 0 : false;
    return gasOn || openingOn;
  }

  renderLabel(ctx) {
    glowText(ctx, `${this.gas} > ${this.threshold}g`, this.x, this.y - 4, THEME.water.light, 'bold 10px monospace', 4);
    // 开启物质（若有）：显示在下方，剩余量实时更新（同开关）
    if (this.opening) {
      const m = this.openingMass();
      glowText(ctx, `${this.opening}${m > 0 ? ` ${m.toFixed(1)}g` : ''}`, this.x + this.w / 2, this.y + this.h + 12, THEME.gold.text, 'bold 10px monospace', 4);
    }
  }

  render(ctx, opts) {
    const scene = opts?.scene ?? null;
    const eff = this._lastEff ?? this.effectiveOpen(scene); // 有效输出态
    const phys = this.open; // 物理检测态（气体超标）
    const waiting = this.and && phys && !eff; // 已检测到气体但等待"&"配对
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.save();
    // 蓝宝石底座（区别于普通金开关）
    const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    g.addColorStop(0, eff ? '#3a5a82' : '#2c4a6e');
    g.addColorStop(1, '#16263c');
    ctx.fillStyle = g;
    rr(ctx, this.x, this.y, this.w, this.h, 6);
    ctx.fill();
    // 边框：开=亮蓝发光，等=橙，关=暗（一眼可辨）
    const frame = eff ? THEME.water.light : waiting ? '#ffb340' : '#0e1a2c';
    ctx.strokeStyle = frame;
    ctx.lineWidth = eff ? 2 : waiting ? 1.5 : 1;
    ctx.shadowColor = eff ? THEME.water.light : waiting ? '#ffb340' : 'transparent';
    ctx.shadowBlur = eff ? 14 : waiting ? 8 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 状态珠：开=亮蓝白实心发光，等=橙，关=暗灰空心
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(this.w, 20) / 2, 0, Math.PI * 2);
    if (!eff && !waiting) {
      ctx.strokeStyle = 'rgba(130,160,200,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = eff ? '#bfe6ff' : '#ffb340';
      ctx.shadowColor = eff ? THEME.water.light : '#ffb340';
      ctx.shadowBlur = eff ? 16 : waiting ? 12 : 0;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // 状态字：开 / 等 / 关（直接标在珠上）
    ctx.fillStyle = eff ? '#062a44' : waiting ? '#4a2a08' : 'rgba(150,180,210,0.6)';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(eff ? '开' : waiting ? '等' : '关', cx, cy + 3);
    ctx.textAlign = 'left';
    ctx.restore();
    this.renderLabel(ctx);
    // "&" 联锁连线（若配置了 and）
    if (this.and && scene) this.renderAndLink(ctx, scene, eff, waiting);
  }

  /** 与另一个 "&" 开关画连接线（金/蓝=双开，橙=已检测等配对，暗=未检测） */
  renderAndLink(ctx, scene, eff, waiting) {
    const other = scene.byId[this.and];
    if (!other) return;
    const ax = this.x + this.w / 2;
    const ay = this.y + this.h / 2;
    const bx = other.x + other.w / 2;
    const by = other.y + other.h / 2;
    const color = eff ? THEME.water.light : waiting ? '#ffb340' : 'rgba(120,140,170,0.35)';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = eff || waiting ? color : 'transparent';
    ctx.shadowBlur = eff || waiting ? 6 : 0;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    // "&" 标记
    ctx.fillStyle = color;
    ctx.font = 'bold 12px serif';
    ctx.textAlign = 'center';
    ctx.fillText('&', (ax + bx) / 2, (ay + by) / 2 - 4);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

exports.GasDetector = GasDetector;

  };
  __modules["src/objects/extractor.js"] = function (module, exports, __require) {
// ============================================================================
// 物质提取器：地表小矩形 + 地下 L 形管道接对应的药品池。
// 配一个开关（switchId）；开关有效开启时，池内"能以固体形式出现"的物质
// （state==='solid'，如盐/金属/氧化物）会被**缓慢**提取为沉淀粒子，从地表矩形冒出。
// 液体/气体（HCl、H2SO4、H2CO3 等 state==='liquid'/'gas'）无法被提取。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { getSubstance } = __require('src/chem/substances.js');;
const { CFG } = __require('src/core/config.js');;
const { THEME, rr, glowText } = __require('src/render/theme.js');;

class Extractor extends Obj {
  get hoverLabel() {
    return '提取器';
  }

  constructor({
    x, y, w = 50, h = 14,
    poolId = null, switchId = null, rate = 0.25,
    ...rest
  } = {}) {
    super({ x, y, w, h, solid: true, physicsKind: 'static', ...rest });
    this.poolId = poolId; // 对应的药品池 id
    this.switchId = switchId; // 激活开关 id
    this.rate = rate; // 提取速率 g/s（缓慢冒出）
    this._acc = {}; // 每种物质的提取质量累积器（攒满 0.1g 才吐一个粒子，严格守恒）
  }

  update(dt, scene) {
    const pool = scene.byId[this.poolId];
    const sw = scene.byId[this.switchId];
    if (!pool || !pool.material || !sw) return;
    // 有效开启（支持开关"&"联锁）
    const active = typeof sw.effectiveOpen === 'function' ? sw.effectiveOpen(scene) : sw.open;
    if (!active) return;
    // 池内所有物质：只提取能以固体形式出现的（state==='solid'）
    for (const id of pool.material.ids()) {
      const sub = getSubstance(id);
      if (!sub || sub.state !== 'solid') continue;
      const avail = pool.material.avail(id);
      const take = Math.min(avail, this.rate * dt);
      if (take <= 1e-9) continue;
      pool.material.consume(id, take);
      // 质量累积：每攒满一个粒子（0.1g）才吐出一个，避免小量提取被 spawnParticles
      // 的取整放大（round(0.01/0.1)=1 → 凭空多出 10 倍质量）。
      this._acc[id] = (this._acc[id] ?? 0) + take;
      while (this._acc[id] >= CFG.cellMass) {
        this._acc[id] -= CFG.cellMass;
        // 从地表矩形顶部冒出可收集沉淀（可溶的也能收；实心 false）
        scene.spawnParticles(id, CFG.cellMass, { x: this.x + Math.random() * this.w, y: this.y + 2 }, true, false, {
          kind: 'extract',
          text: `${id} 提取`,
        });
      }
    }
  }

  render(ctx, scene) {
    const pool = scene?.byId?.[this.poolId];
    const sw = scene?.byId?.[this.switchId];
    const active = sw ? (sw._lastEff ?? sw.open) : false;
    ctx.save();
    // 地表矩形（金属台，激活时发光）
    const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    g.addColorStop(0, active ? '#4a6a8a' : '#3a3f5c');
    g.addColorStop(1, '#22263f');
    ctx.fillStyle = g;
    rr(ctx, this.x, this.y, this.w, this.h, 4);
    ctx.fill();
    ctx.strokeStyle = active ? THEME.water.light : '#151830';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = active ? THEME.water.light : 'transparent';
    ctx.shadowBlur = active ? 10 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 台面网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let gx = this.x + 6; gx < this.x + this.w; gx += 7) {
      ctx.beginPath();
      ctx.moveTo(gx, this.y + 2);
      ctx.lineTo(gx, this.y + this.h - 2);
      ctx.stroke();
    }
    // L 形地下管道：表面底中心 → 向下 → 横向到池中心 → 向上接入池
    if (pool) {
      const startX = this.x + this.w / 2;
      const startY = this.y + this.h;
      const depth = Math.min(startY + 70, Math.max(pool.y + 10, startY + 40));
      const endX = pool.x + pool.w / 2;
      ctx.strokeStyle = active ? '#7fe0ff' : '#4a4f70';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX, depth);
      ctx.lineTo(endX, depth);
      ctx.lineTo(endX, pool.y + pool.h);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // 管道内衬高光
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX, depth);
      ctx.lineTo(endX, depth);
      ctx.lineTo(endX, pool.y + pool.h);
      ctx.stroke();
    }
    // 标注
    glowText(ctx, '提取', this.x + this.w / 2, this.y - 4, active ? THEME.water.light : '#9fb2c8', 'bold 10px monospace', 3);
    ctx.restore();
  }
}

exports.Extractor = Extractor;

  };
  __modules["src/objects/dropper.js"] = function (module, exports, __require) {
// ============================================================================
// 滴管（Dropper）：编辑器原版物体——玩家左键单击即向正下方容器滴加液体。
// ----------------------------------------------------------------------------
// - 可设置管内物质（液体/可溶物质 id）、容量（g）、每滴量（g）；
// - 只滴不吸：液体用尽为止（编辑器重设/重开局 = 满管）；
// - 外观 = 玻璃滴管 + 橡皮胶头 + 锥形滴嘴，管内液体颜色与溶液取色一致
//   （solutionColor：离子颜色/指示剂 pH 显色），液面随剩余量下降；
// - 拖动平滑：渲染坐标 (rx,ry) 追赶逻辑坐标——拖动时滴管"滑行"跟随指针，
//   不生硬瞬移（纯表现层，物理/化学仍用精确 x/y）；
// - 点击命中由共享点击管线 handleSceneClick 触发（编辑试玩/导出关卡同一套）。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { getSubstance } = __require('src/chem/substances.js');;
const { Solution } = __require('src/chem/solution.js');;
const { solutionColor } = __require('src/render/liquidrender.js');;
const { Drip } = __require('src/objects/drip.js');;
const { flowFx, puffFx } = __require('src/objects/fx.js');;
const { CFG } = __require('src/core/config.js');;
const { pushNotice } = __require('src/level/click.js');;

const DROPPER_W = 11;
const DROPPER_H = 52;

class Dropper extends Obj {
  constructor({ x, y, substance = 'H2O', capacity = 50, drop = 0.5, liquid, ...rest } = {}) {
    super({
      x, y, w: DROPPER_W, h: DROPPER_H,
      solid: false, physicsKind: 'none', noLift: true,
      ...rest,
    });
    this.substance = substance;
    this.capacity = Math.max(0.1, capacity);
    this.drop = Math.max(0.01, drop);
    this.liquid = liquid == null ? this.capacity : Math.min(this.capacity, liquid);
    this.rx = x; // 渲染坐标（追赶 x/y，拖动时产生平滑滑行感）
    this.ry = y;
  }

  /** 渲染坐标每 tick 向真实坐标收敛（指数趋近，帧率无关） */
  update(dt) {
    const k = 1 - Math.exp(-14 * dt);
    this.rx += (this.x - this.rx) * k;
    this.ry += (this.y - this.ry) * k;
  }

  get hoverLabel() {
    const sub = getSubstance(this.substance);
    const name = sub ? (sub.name ?? this.substance) : this.substance;
    if (this.liquid <= 1e-9) return '滴管（空）'; // 空管不标物质名——免误导（管里明明没有）
    return `滴管·${name}（${this.liquid.toFixed(1)}g）`;
  }

  get isCarryItem() {
    return 'dropper';
  }

  /** 玩家附近可拖动（改变位置，无碰撞箱） */
  get isDraggable() {
    return true;
  }

  /** 点击点是否落在"红色胶头"上——只有胶头区能触发滴加（单击=滴一滴、
   *  长按=持续滴/液下吸取）；玻璃段只能拖动。world 为世界坐标。 */
  onBulb(world) {
    if (!world) return false;
    return world.y <= this.y + 12; // 胶头（顶 ~11px，含边缘 1-2px 容差）
  }

  /**
   * 尖端正浸在哪个容器的液面下？（水平对齐容器内区 + 尖端低于**真实液面**
   * （随量升降：surface = r.bottom - r.h×min(1,total/volume)）+ 未深穿容器底）。
   * 与烧杯/池的渲染液面同一公式——液面只有一半时，尖端在"杯沿与液面之间"不算浸入。
   */
  _submergedIn(scene) {
    const cx = this.x + this.w / 2;
    const tipY = this.bottom; // 滴管尖端（锥尖最底点）
    let best = null;
    let bestDepth = -Infinity;
    for (const c of scene.containers ?? []) {
      const r = c.innerRect();
      if (!(cx >= r.x && cx <= r.x + r.w)) continue;
      const sol = c.solution;
      if (!sol || !(sol.volume > 0)) continue;
      const total = sol.totalMass ? sol.totalMass() : 0;
      if (total <= 1e-9) continue; // 容器里没有液体（干杯不算液下）
      const lh = r.h * Math.max(0, Math.min(1, total / sol.volume)); // 与渲染同公式
      const surface = r.y + r.h - lh;
      if (tipY < surface + 2) continue; // 尖端未到达液面下（≥2px）
      if (tipY > r.y + r.h + 8) continue; // 穿底过多（伸穿容器底按无效）
      if (tipY - surface > bestDepth) {
        bestDepth = tipY - surface;
        best = c;
      }
    }
    return best;
  }

  /**
   * 液下吸取一手（长按胶头、尖端在液面下时每 suckPeriod 执行一次）：
   *  - 管里没有液体：直接吸一手（≤ dropperTransfer g，占优溶质/纯水→H2O）；
   *  - 管里已有**同一液体**：可以续吸（直到容量上限——与 C 键吸液同一语义）；
   *  - 管里是**别的液体**：拒绝（无法混吸）；
   *  - 尖端不在液面下 / 源已无液体：拒绝并提示。
   */
  attemptSuckOnce(scene) {
    if (!scene) return false;
    const c = this._submergedIn(scene);
    if (!c) {
      pushNotice(scene, '把滴管尖端伸到液面下再吸');
      return false;
    }
    const room = this.capacity - this.liquid;
    if (room <= 1e-9) {
      pushNotice(scene, '滴管已装满');
      return false;
    }
    // 取占优成分（无溶质 = 纯水）
    let id = 'H2O';
    let m = 0;
    for (const [sid, sm] of c.solution.solutes) {
      if (sm > m) {
        id = sid;
        m = sm;
      }
    }
    if (this.liquid > 1e-9 && id !== this.substance) {
      pushNotice(scene, '管里是别的液体——不能混吸');
      return false;
    }
    const take = Math.min(CFG.item.dropperTransfer, room);
    let got = 0;
    if (id === 'H2O') {
      got = c.solution.water > 0 ? Math.min(take, c.solution.water) : 0;
      if (got > 1e-9) c.solution.water -= got;
    } else {
      got = c.solution.remove(id, take);
    }
    if (got <= 1e-9) {
      pushNotice(scene, '这里已经没有可吸的液体');
      return false;
    }
    this.substance = id;
    this.liquid += got;
    c.noteSolOrigin?.(id, { kind: 'fill', text: '液下吸取' });
    // 特效：表面涟漪尘雾 + 一串上行液滴飞进管口
    const r = c.innerRect();
    const sx = Math.max(r.x + 4, Math.min(r.x + r.w - 4, this.x + this.w / 2));
    puffFx(scene, sx, r.y + 3, { color: '225,245,255', r: 4, spread: 10, life: 0.35 });
    flowFx(scene, {
      x0: sx, y0: r.y + 6,
      x1: this.x + this.w / 2, y1: this.y + this.h * 0.45,
      color: solutionColor(new Solution({ volume: this.capacity, water: this.liquid > 0 ? 1 : 0, solutes: this.substance === 'H2O' ? {} : { [this.substance]: this.liquid } })).color,
      life: 0.4, n: 6, bend: 0.25,
    });
    return true;
  }

  /** 管内液体颜色：与烧杯/池同一套溶液取色（离子颜色/指示剂 pH 显色） */
  liquidColor() {
    const m = Math.max(1e-6, this.liquid);
    const sol = new Solution({
      volume: this.capacity,
      solutes: this.liquid > 1e-9 ? { [this.substance]: m } : {},
      water: this.liquid > 1e-9 ? m : 0,
    });
    return solutionColor(sol);
  }

  /** 玩家左键单击：向正下方容器滴一滴（下方无容器/已滴空则不滴） */
  onTap(scene) {
    if (!scene || this.liquid <= 1e-9) return false;
    const c = this._containerBelow(scene);
    if (!c) return false;
    const take = Math.min(this.drop, this.liquid);
    c.solutionMat.add(this.substance, take); // H2O 走"水"字段，其它走溶质
    if (this.substance !== 'H2O') c.noteSolOrigin(this.substance, { kind: 'dropper', text: '滴管滴入' });
    this.liquid -= take;
    // 记录落点：化学/气泡/沉淀围绕"滴入处"发生（不再默认容器中心）
    const r = c.innerRect();
    const dx = Math.max(r.x + 4, Math.min(r.x + r.w - 4, this.x + this.w / 2));
    const dy = Math.max(r.y + 4, Math.min(r.y + r.h - 6, this.bottom + 30));
    c.depositAt = { x: dx, y: dy };
    // 液滴下坠动画（从滴管口到液面；带滴管液体颜色）
    if (typeof scene.addObject === 'function') {
      const { color } = this.liquidColor();
      scene._dripSeq = (scene._dripSeq ?? 0) + 1;
      scene.addObject(new Drip({
        x: dx - 2,
        y: this.bottom + 2,
        targetY: r.y + 6,
        color,
        id: `drip${scene._dripSeq}`,
      }));
    }
    return true;
  }

  /** 正下方的容器：水平中心在容器口内即可（**高度不限**——用户要求"只要下面有
   *  就可以"；滴管底可悬在口上方任意高度，伸入容器（内深 ≤ 容器深+8）也接受）。
   *  取离口最近的一个（水平不重叠的容器不算）。 */
  _containerBelow(scene) {
    const cx = this.x + this.w / 2;
    let best = null;
    let bestDy = Infinity;
    for (const c of scene.containers ?? []) {
      const r = c.innerRect();
      if (cx < r.x || cx > r.x + r.w) continue;
      const dy = r.y - this.bottom; // 口沿到滴管底（正值=滴管底在口沿上方）
      if (dy >= -r.h - 8 && dy < bestDy) {
        best = c;
        bestDy = dy;
      }
    }
    return best;
  }

  render(ctx) {
    const x = Number.isFinite(this.rx) ? this.rx : this.x;
    const y = Number.isFinite(this.ry) ? this.ry : this.y;
    const w = this.w;
    const h = this.h;
    // 橡皮胶头（红色泪滴形：大头在上，下缘收进管口）——参照真实胶头滴管
    const hx = x + w / 2;
    const bulbY = y + 4.5;
    ctx.fillStyle = '#c0303a';
    ctx.beginPath();
    ctx.ellipse(hx, bulbY, w * 0.44, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 胶头高光（左上亮斑 + 下棱线）
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(hx - 1.6, bulbY - 2, 1.6, 2.6, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,20,24,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx - 3.4, bulbY + 5.4);
    ctx.quadraticCurveTo(hx, bulbY + 6.8, hx + 3.4, bulbY + 5.4);
    ctx.stroke();
    // 玻璃管（细长）：管口从胶头垂到细管口
    const gx = hx - w * 0.14;
    const gw = w * 0.28;
    const gy = y + 10;
    const gh = h - 14 - 8; // 上到锥尖
    ctx.fillStyle = 'rgba(215,235,255,0.16)';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = 'rgba(215,235,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(gx + 0.6, gy, 0.7, gh); // 左侧玻璃高光
    // 管内液体（颜色与溶液取色一致；液面随剩余比例下降；液体**贯穿到锥形滴嘴**——
    // 滴嘴也是玻璃腔的一部分，装的是同一管液体，不该是空的）
    const frac = Math.max(0, Math.min(1, this.liquid / this.capacity));
    const innerY = gy + 1;
    const innerH = gh - 2;
    const lh = innerH * frac;
    if (lh > 0.6) {
      const { color, alpha } = this.liquidColor();
      const bodyTop = innerY + innerH - lh; // 液面 y（管内部）
      const tipBase = gy + gh; // 管底 → 滴嘴起
      ctx.globalAlpha = Math.max(alpha, 0.45);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(gx + 0.6, bodyTop);
      ctx.lineTo(gx + gw - 0.6, bodyTop);
      // 沿管向下 → 两侧收进锥形滴嘴（液体充满到尖端）
      ctx.lineTo(gx + gw - 0.6, tipBase);
      ctx.lineTo(hx, y + h - 1);
      ctx.lineTo(gx + 0.6, tipBase);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // 液面线（只在管内部分显示）
      if (bodyTop >= innerY + 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(gx + 0.8, bodyTop);
        ctx.lineTo(gx + gw - 0.8, bodyTop);
        ctx.stroke();
      }
      // 液面下"尖嘴"与管交界的光泽（液体连贯感）
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(gx + 0.6, tipBase - 1);
      ctx.lineTo(gx + gw - 0.6, tipBase - 1);
      ctx.lineTo(hx + 0.5, y + h - 2.5);
      ctx.lineTo(hx - 0.5, y + h - 2.5);
      ctx.closePath();
      ctx.fill();
    }
    // 锥形滴嘴（细管下端收尖）
    ctx.fillStyle = 'rgba(215,235,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh);
    ctx.lineTo(hx, y + h);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(215,235,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

exports.DROPPER_W = DROPPER_W;
exports.DROPPER_H = DROPPER_H;
exports.Dropper = Dropper;

  };
  __modules["src/objects/gasbottle.js"] = function (module, exports, __require) {
// ============================================================================
// 集气瓶（GasBottle）：可收集气体的玻璃瓶（**有实体**——与烧杯同一套容器物理）。
// ----------------------------------------------------------------------------
// - 碰撞箱 = 玻璃瓶身轮廓（左右瓶壁沿**瓶身段** = 瓶口以下 10px → 瓶底；
//   瓶口/瓶颈区开放——细瓶颈两侧是空气，不该挡人；玻璃盖板贴住瓶口，
//   与视觉对齐——修"碰撞箱看起来异常偏大（盖板悬空+瓶口假墙挡人）"）
// - 可推动：玩家贴外壁行走会推动整只瓶子；受重力，无支撑时下落；
// - 容量默认 5g：按住 C（背包含集气瓶）时，把最近气泡柱产生的气体直接截留进瓶
//   （气体不再进大气）；按住 X 向最近液体容器通入气体（0.05g/s）；
// - 收集/倒出/放置与烧杯、滴管同一套"可携带物品"流程（C 拾取 / Shift 放置），
//   进背包时瓶壁子体一并移出场景。
// ============================================================================

const { Obj } = __require('src/objects/obj.js');;
const { getSubstance } = __require('src/chem/substances.js');;
const { CFG } = __require('src/core/config.js');;
const { shallowestSupportY, settleBodyOnSupport } = __require('src/physics/support.js');;

const BOTTLE_W = 30;
const BOTTLE_H = 56;

const WALL = 4; // 瓶壁厚（px）
const LID_H = 4; // 盖板厚（px）
const LID_LIFT = 2.5; // 装气时盖板被顶起的最大高度（px）
const NECK_H = 10; // 瓶口/瓶颈区高度（px）：无侧壁，只有透明瓶颈

let SEQ_N = 0; // 无 id 集气瓶的子体命名序号（防 byId 键冲突）

class GasBottle extends Obj {
  constructor({ x, y, capacity = CFG.item.bottleCapacity, gases = null, ...rest } = {}) {
    super({
      x, y, w: BOTTLE_W, h: BOTTLE_H,
      solid: false, physicsKind: 'none', noLift: true,
      ...rest,
    });
    this.wall = WALL;
    this.vy = 0;
    this._lidLift = 0; // 0→1 装气顶盖动画进度
    this._fillPulse = 0; // 装气辉光脉冲
    // 实体子体：左右瓶壁（**瓶身段**：口下 NECK_H → 瓶底）+ 底 + 贴口玻璃盖板。
    // static：壁是"与瓶身联动的死墙"——不参与动量交换（动态壁会被玩家撞飞再被
    // syncWalls 拉回 → 推动强烈震动——用户反馈）；noLift：不被气泡柱顶飞。
    // 瓶颈区（顶部 NECK_H）无侧壁——细瓶颈两侧是空气，不该挡人。
    const pid = rest.id ? `${rest.id}_gb` : `gb${++SEQ_N}`;
    this.subBodies = [
      new Obj({ id: `${pid}_l`, x, y: y + NECK_H, w: WALL, h: BOTTLE_H - NECK_H, solid: true, static: true, physicsKind: 'static', noLift: true }),
      new Obj({ id: `${pid}_r`, x: x + BOTTLE_W - WALL, y: y + NECK_H, w: WALL, h: BOTTLE_H - NECK_H, solid: true, static: true, physicsKind: 'static', noLift: true }),
      new Obj({ id: `${pid}_b`, x, y: y + BOTTLE_H - WALL, w: BOTTLE_W, h: WALL, solid: true, static: true, physicsKind: 'static', noLift: true }),
      new Obj({ id: `${pid}_lid`, x: x + 4, y: y - 2, w: BOTTLE_W - 8, h: LID_H, solid: true, static: true, physicsKind: 'static', noLift: true }),
    ];
    this.syncWalls();
    this.capacity = Math.max(0.1, capacity);
    this.gases = new Map(); // gasId → g
    if (gases) {
      for (const [id, m] of Object.entries(gases)) {
        if (Number.isFinite(m) && m > 0) this.gases.set(id, Math.min(m, this.capacity - this.totalGas()));
      }
    }
  }

  get isCarryItem() {
    return 'bottle';
  }

  get hoverLabel() {
    if (this.totalGas() <= 1e-9) return '集气瓶（空）';
    return `集气瓶·${this.gasLabel()}（${this.totalGas().toFixed(1)}g）`;
  }

  /** 瓶内气体标签：单一气体显示 id，混合显示"多气体" */
  gasLabel() {
    const d = this.dominantGas();
    if (!d) return '';
    if (this.gases.size > 1) return `${d[0]}等`;
    return d[0];
  }

  /** 当前总量最占优的气体（通入时先通它）：[id, mass] 或 null */
  dominantGas() {
    let best = null;
    for (const [id, m] of this.gases) {
      if (!best || m > best[1]) best = [id, m];
    }
    return best;
  }

  totalGas() {
    let s = 0;
    for (const m of this.gases.values()) s += m;
    return s;
  }

  /** 装入气体（容量封顶），返回实际装入量；装气时顶一下盖板 + 辉光 */
  addGas(id, mass) {
    if (!(mass > 0)) return 0;
    const room = this.capacity - this.totalGas();
    if (room <= 1e-9) return 0;
    const take = Math.min(room, mass);
    this.gases.set(id, (this.gases.get(id) ?? 0) + take);
    this._lidLift = 1;
    this._fillPulse = 1;
    return take;
  }

  /** 取出气体（不超过持有量），返回实际取出量 */
  removeGas(id, mass) {
    if (!(mass > 0)) return 0;
    const cur = this.gases.get(id) ?? 0;
    const r = Math.min(cur, mass);
    const n = cur - r;
    if (n <= 1e-9) this.gases.delete(id);
    else this.gases.set(id, n);
    return r;
  }

  /** 瓶内气体代表色（占优气体）；空瓶淡青 */
  gasColor() {
    const d = this.dominantGas();
    if (!d) return '#78dcff';
    const sub = getSubstance(d[0]);
    return sub?.gasColor ?? '#78dcff';
  }

  /** 壁体跟随瓶身位置（含盖板顶起动画位移） */
  syncWalls() {
    const [l, r, b, lid] = this.subBodies;
    l.x = this.x;
    l.y = this.y + NECK_H;
    r.x = this.x + this.w - this.wall;
    r.y = this.y + NECK_H;
    b.x = this.x;
    b.y = this.y + this.h - this.wall;
    lid.x = this.x + 4;
    lid.y = this.y - LID_LIFT * this._lidLift - 2; // 盖板底边贴住瓶口线（装气时顶起微隙）
  }

  /** 无支撑时受重力下落，落到**最浅**支撑面停住（与烧杯同款：statics + 实心动态体，
   *  不沉入池盆/高台侧面——见 physics/support.js） */
  applyGravity(dt, scene) {
    settleBodyOnSupport(this, dt, shallowestSupportY(this, scene));
  }

  update(dt, scene) {
    this.applyGravity(dt, scene);
    // 玩家贴壁推动已挪到 Player.update（pushContainers——时序要求：玩家重设 vel 之后、
    // 物理步之前：吸附+清 vel，否则推-弹交替"一卡一卡"——用户反馈）
    // 动画计时衰减（盖板回落、辉光消退）
    if (this._lidLift > 0) this._lidLift = Math.max(0, this._lidLift - dt * 2.6);
    if (this._fillPulse > 0) this._fillPulse = Math.max(0, this._fillPulse - dt * 1.8);
  }

  /** 物理结算后：壁体贴回瓶身当前位置（爆炸推散等下一帧即复位） */
  lateUpdate() {
    this.syncWalls();
  }

  render(ctx, scene) {
    const x = this.x;
    const y = this.y;
    const w = this.w;
    const h = this.h;
    const frac = Math.max(0, Math.min(1, this.totalGas() / this.capacity));
    const color = this.gasColor();
    const cx = x + w / 2;
    ctx.save();
    // 瓶身玻璃（圆柱体：底圆角矩形 + 上口收窄）
    const bodyW = w;
    const bodyH = h - 12; // 上 12px 为颈/口
    const bodyY = y + 12;
    ctx.fillStyle = 'rgba(210,240,255,0.14)';
    ctx.beginPath();
    ctx.roundRect(x, bodyY, bodyW, bodyH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,245,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x, bodyY, bodyW, bodyH, 6);
    ctx.stroke();
    // 瓶颈 + 瓶口（宽口：便于集气；口上盖着玻璃板）
    ctx.strokeStyle = 'rgba(225,245,255,0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + 5, bodyY);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x + w - 7, y);
    ctx.lineTo(x + w - 5, bodyY);
    ctx.stroke();
    // 气体填充（从瓶底往上按比例；装气时带辉光脉冲）
    if (frac > 0.01) {
      const fh = (bodyH - 4) * frac;
      const fy = bodyY + bodyH - 2 - fh;
      const hexToRgb = (hex) => {
        const g = hex.replace('#', '');
        return { r: parseInt(g.slice(0, 2), 16), g2: parseInt(g.slice(2, 4), 16), b: parseInt(g.slice(4, 6), 16) };
      };
      const c = hexToRgb(color);
      ctx.globalAlpha = 0.4 + 0.25 * frac;
      ctx.fillStyle = `rgb(${c.r},${c.g2},${c.b})`;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8 + this._fillPulse * 14;
      ctx.beginPath();
      ctx.roundRect(x + 2, fy, w - 4, fh, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    // 玻璃盖板（盖在瓶口上，装气时微微顶起再落下）——与 gb_*_lid 子体同位
    const [, , , lid] = this.subBodies;
    const lx = lid ? lid.x : x + 2;
    const ly = lid ? lid.y : y - LID_LIFT * this._lidLift - LID_H + 2;
    const lw = lid ? lid.w : w - 4;
    ctx.fillStyle = 'rgba(225,245,255,0.28)';
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, LID_H, 1.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,250,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 盖板高光条
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(lx + 2, ly + 0.8, lw - 4, 1);
    // 盖板边缘把手颗粒（两端小圆点，示意"磨砂玻璃片"）
    ctx.fillStyle = 'rgba(240,250,255,0.55)';
    ctx.beginPath();
    ctx.arc(lx + lw - 3, ly + LID_H / 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // 装气闪环（收气成功的一圈扩散光）
    if (this._fillPulse > 0.01) {
      ctx.globalAlpha = this._fillPulse * 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, y + h / 2, w * 0.62 + (1 - this._fillPulse) * 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 瓶口高光
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 2, bodyY + 1, 2, bodyH - 4);
    ctx.restore();
    // 标签（非空时瓶身下方显示气体种类与量）
    if (frac > 0.01) {
      const d = this.dominantGas();
      ctx.font = 'bold 10px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,18,32,0.72)';
      const label = `${d[0]} ${this.totalGas().toFixed(1)}g`;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(cx - tw / 2 - 4, this.bottom - 2, tw + 8, 14);
      ctx.fillStyle = color;
      ctx.fillText(label, cx, this.bottom + 8);
      ctx.textAlign = 'left';
    }
  }
}

exports.BOTTLE_W = BOTTLE_W;
exports.BOTTLE_H = BOTTLE_H;
exports.GasBottle = GasBottle;

  };
  __modules["src/level/multiscene.js"] = function (module, exports, __require) {
// ============================================================================
// Multiscene：多场景（章节）关卡管理器。
// ----------------------------------------------------------------------------
// 一个关卡 = 多个独立 Scene（各自世界尺寸/物体/反应/插件），共享一条主循环，
// 任一时刻只推进/渲染"当前激活"的场景；切换即热切换（旧场景状态完整保留，
// 切回去时原样恢复——章节推进语义）。
//
// 用法（关卡脚本）：
//   const M = new Chezzle.Multiscene(container, { width:1100, height:700 });
//   M.scene('a').floor(...).player(...)...;        // 每个场景独立链式构建
//   M.scene('b').floor(...)...;
//   M.buildAll();                                   // 全部构建（含各场景插件注入）
//   M.byId('a','sw').onOpen(() => M.switchTo('b', { spawn:{x:60, y:100} }));
//   M.start('a');
//
// switchTo 语义：
//   - 默认 carryPlayer（把玩家对象搬去新场景：物品栏/身上物质/血量都保留；
//     新场景若自己摆了玩家则替换之，spawn 给坐标则重定位）；
//   - 旧场景完整保留，切回去即回到离开时的状态。
// ============================================================================

const { LevelBuilder } = __require('src/level/builder.js');;
const { startLoop } = __require('src/core/loop.js');;
const { bindKeyboard } = __require('src/core/input.js');;
const { Plugins } = __require('src/level/plugins.js');;
const { handleSceneClick } = __require('src/level/click.js');;
const { bindTouchUI } = __require('src/core/touch.js');;
const { bindOverviewInput } = __require('src/core/overview.js');;
const { attachRecorderPanel } = __require('src/core/recorder.js');;

class Multiscene {
  /**
   * @param container 容器元素（div 等），每个场景会获得一个叠放的 canvas（当前场景可见）
   * @param opts { width, height, plugins: [{name,cfg}]  全局注入每个场景的插件 }
   */
  constructor(container, opts = {}) {
    if (!container || typeof container !== 'object') throw new Error('Multiscene 需要容器元素');
    this.container = container;
    this.width = opts.width ?? 1100;
    this.height = opts.height ?? 700;
    this.plugins = opts.plugins ?? []; // 全局插件（注入每个场景）
    this.scenes = new Map();           // name -> { name, builder, scene, canvas, renderer, hud, plugins, built, active }
    this.current = null;               // 当前激活场景名
    this.switches = 0;                 // 切换计数（调试/插件用）
    this.hold = {};                    // 跨场景共享状态（关卡脚本/插件自由使用）
    this._stop = null;
    this._unbindKeys = null;
    this.onSwitch = null;              // (fromName, toName) => void（可再赋值）
    this._canvasFactory = opts.canvasFactory ?? null; // 测试注入
  }

  /** 创建/获取一个场景，返回其 LevelBuilder（链式 .floor(...).player(...)...） */
  scene(name, opts = {}) {
    if (this.scenes.has(name)) return this.scenes.get(name).builder;
    const canvas = this._makeCanvas();
    const builder = new LevelBuilder(canvas, { worldW: opts.worldW, worldH: opts.worldH });
    const entry = {
      name,
      builder,
      scene: null,
      canvas,
      renderer: builder.renderer,
      hud: builder.hud,
      plugins: opts.plugins ?? null, // null = 用全局 this.plugins
      built: false,
      active: false,
    };
    this.scenes.set(name, entry);
    this._bindClick(entry); // 每个场景画布的鼠标（提示按钮/物品栏选格/调试悬停）
    // 移动端触控（摇杆/按钮/拖动管线；桌面端按 isTouchDevice 门槛空转）
    const activeOf = () => (this.current === entry.name && entry.active ? { scene: entry.scene, hud: entry.hud } : null);
    entry.touch = bindTouchUI(canvas, activeOf);
    // 鸟瞰输入（灵魂出窍）：滚轮缩放 + 拖动平移（仅该场景 overview 时生效）
    entry.overview = bindOverviewInput(canvas, activeOf);
    return builder;
  }

  /** 与 LevelBuilder.bindClick 一致：提示按钮（右上）+ 物品栏选格（右下）+ 调试悬停 */
  _bindClick(entry) {
    const canvas = entry.canvas;
    const screenPos = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height),
      };
    };
    const activeOf = () => (this.current === entry.name && entry.active ? entry : null);
    const onMove = (e) => {
      const cur = activeOf();
      if (!cur?.scene?.debugMode) return;
      cur.scene.mouse = { ...screenPos(e), on: true };
    };
    const onLeave = () => {
      const cur = activeOf();
      if (cur?.scene?.mouse) cur.scene.mouse.on = false;
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', (e) => {
      const cur = activeOf();
      if (!cur || !cur.hud) return;
      const { x, y } = screenPos(e);
      // 提示按钮 / 物品栏选格 / 场景内可点击物体（滴管等 onTap）——与单场景同一管线
      handleSceneClick(cur.scene, cur.hud, canvas, x, y);
    });
  }

  _makeCanvas() {
    const canvas = this._canvasFactory
      ? this._canvasFactory()
      : document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.display = 'none';
    this.container.appendChild(canvas);
    return canvas;
  }

  /** 构建全部场景（build + 插件注入）。返回 name -> scene 映射。 */
  buildAll() {
    const out = {};
    for (const [name, e] of this.scenes) {
      if (e.built) continue;
      e.scene = e.builder.build();
      e.scene.status = 'running';
      // 移动端触控挂载点：HUD 渲染读取 + 相机移动端视野
      e.scene._touchUI = e.touch?.ui ?? null;
      if (e.touch && e.touch.ui.enabled()) e.touch.ui.refresh();
      // 插件注入：场景级（scene(name,{plugins})) 优先于全局
      const entries = e.plugins ?? this.plugins;
      Plugins.inject(e.scene, entries);
      e.built = true;
      out[name] = e.scene;
    }
    return out;
  }

  byName(name) {
    return this.scenes.get(name)?.scene ?? null;
  }

  /** 便捷：取场景内物体 scene.byId */
  byId(name, id) {
    return this.scenes.get(name)?.scene?.byId?.[id] ?? null;
  }

  /** 启动：从指定场景开始（共享主循环） */
  start(name) {
    this.buildAll();
    const e = this.scenes.get(name);
    if (!e) throw new Error(`场景不存在: ${name}`);
    e.canvas.style.display = 'block';
    e.active = true;
    this.current = name;
    this._unbindKeys = bindKeyboard(e.scene);
    // 操作录制/回放面板（开发工具：?record=1 显示；拖入录制的 .json 回放）
    if (typeof location !== 'undefined' && /[?&]record=1/.test(location.search)) {
      this.recorder = attachRecorderPanel(() => {
        const a = this.scenes.get(this.current);
        return a && a.active ? a.scene : null;
      }, this.container);
    }
    this._stop = startLoop(() => {
      const a = this.scenes.get(this.current);
      return a && a.active ? { scene: a.scene, renderer: a.renderer, hud: a.hud } : null;
    });
    return this;
  }

  /** 切换到场景 name */
  switchTo(name, opts = {}) {
    const e = this.scenes.get(name);
    if (!e || !e.built) throw new Error(`场景不存在或未构建: ${name}`);
    if (this.current === name && e.active) return this;
    const from = this.scenes.get(this.current);
    if (from && from.active) {
      from.active = false;
      // 场景切换时清空旧场景的持续输入（键盘/摇杆按住未抬起会泄漏到切回时）
      if (from.scene) {
        from.scene.control.clear();
        from.scene.pressed.clear();
        if (from.touch) from.touch.ui.releaseAll();
      }
    }
    if (from) from.canvas.style.display = 'none';

    if (opts.carryPlayer !== false) {
      const carriedObj = from?.scene?.player ?? null;
      if (carriedObj) {
        // 玩家对象整体搬移：物品栏/身上物质/血量全保留
        const target = e.scene.player;
        if (target && target !== carriedObj) e.scene.removeObject(target); // 替换占位玩家
        if (e.scene.byId[carriedObj.id] && e.scene.byId[carriedObj.id] !== carriedObj) {
          carriedObj.id = `${carriedObj.id}_carry${this.switches}`;
        }
        from.scene.removeObject(carriedObj);
        if (opts.spawn) {
          carriedObj.x = opts.spawn.x;
          carriedObj.y = opts.spawn.y;
          if (carriedObj.vel) { carriedObj.vel.x = 0; carriedObj.vel.y = 0; }
        }
        e.scene.addObject(carriedObj);
      }
    } else if (opts.spawn && e.scene.player) {
      e.scene.player.x = opts.spawn.x;
      e.scene.player.y = opts.spawn.y;
    }

    e.canvas.style.display = 'block';
    e.active = true;
    this.current = name;
    this.switches++;
    // 键盘事件转发切换（bindKeyboard 绑定的是旧场景）
    if (this._unbindKeys) this._unbindKeys();
    this._unbindKeys = bindKeyboard(e.scene);
    e.scene.fire('enter', { from: from?.name ?? null, switches: this.switches });
    if (this.onSwitch) this.onSwitch(from?.name ?? null, name);
    return this;
  }

  /** 关闭管理器（停止循环、解除键盘绑定） */
  stop() {
    if (this._stop) this._stop();
    this._stop = null;
    if (this._unbindKeys) this._unbindKeys();
    this._unbindKeys = null;
  }
}

exports.Multiscene = Multiscene;

  };
  global.Chezzle = __require("src/index.js");
})(typeof window !== 'undefined' ? window : globalThis);
