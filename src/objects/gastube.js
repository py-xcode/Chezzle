// ============================================================================
// 导气管：一个输入端药品池 → 多个输出端（药品池 / 气室）的单向气体装置。
// ----------------------------------------------------------------------------
// 输入端 = 罩住整个输入药品池的大罩子（池口以上是罩体，池体本身也在罩内）：
//   池内产气（溶液反应 / 池中物块·烧杯产气 / 滴管落入池中反应产气）产生的
//   气体**全部**被罩住，经主干与各支路鼓入输出端（与集气瓶通气同一条"主动鼓入"
//   管线：碱吸收 → 水溶解，之后溶液内反应照常）。输入端不冒气泡柱、气体也不
//   进大气。
// 输出端两种：
//   · 药品池：从池子侧面插入池内的管口，气体从管口冒泡鼓入输出池；输出池吸收
//     不完的多余气体才在管口生成气泡柱并进入大气（Scene 负责）。
//   · 气室：管子接在气室外壁的法兰/喷嘴上（不进入内部——气室无碰撞箱），气体由
//     Scene 直接送进该气室自己的大气（见 objects/gaschamber.js）。
//   输入端无论如何都不会生成气泡柱。单向：输出端自己产气不受影响（照常冒柱/
//   进大气），也不会反灌。
// 阀门 = 本装置自身的一部分（不是独立物体）：每条支路可装一个阀门，位置固定在
//   离开主干后的第一段横管中点；点击阀门切换开/关（开=金色发光、关=暗灰）。
//   阀门状态存 this.valves 普通对象（{outId: 开}），存档可自动捕获。
// ----------------------------------------------------------------------------
// 无碰撞箱（physicsKind='none'）：罩子/管子在物理里完全不存在，不挡玩家、
//   物块、物品进出药品池。
// 视觉：整体半透明灰色玻璃管，因此显示色与流过的气体颜色（gasColor）有关；
//   输出端管口通气时冒气泡（气室的气泡冒在气室内侧）。
// 接线：inId = 输入端药品池 id；outIds = 输出端 id 数组（药品池或气室）。
//   旧字段 outId（单输出、无阀门）保留兼容（编辑器/旧关卡/旧 Scene 调用）。
// 几何：geometry(scene) 纯计算、可每帧反复调用；x/y/w/h 同步为装置包围盒
//   （编辑器选中/导出用）。未接线时编辑器里画虚线占位框，运行中不显示。
// ============================================================================

import { Obj } from './obj.js';
import { Bubble } from './bubble.js';
import { getSubstance } from '../chem/substances.js';
import { rr, THEME } from '../render/theme.js';
import { sfx } from '../core/audio.js';

const PIPE_W = 13; // 管径（px）
const FLOW_FADE = 0.55; // 停止产气后管内颜色褪回灰色所需时间（s）
const HOOD_MARGIN = 6; // 罩子比池宽多出来的边缘（px）
const BUS_GAP = 22; // 主干顶部横线离罩顶/输出端顶部的距离（px）
const LANE_STEP = 20; // 相邻支路横段的垂直间距（px，> 管径：分开布管不重叠）
const SIDE_GAP = 22; // 支路下降段离输出端侧壁的水平距离（px）
const VALVE_R = 11; // 阀门阀体半径（px）
const VALVE_TAP_PAD = 4; // 阀门点击容差（px）
const FLANGE_W = 10; // 气室法兰板厚度（px）
const FLANGE_H = 28; // 气室法兰板高度（px）
const BUBBLE_INTERVAL = 0.14; // 管口气泡生成间隔（s）
const FALLBACK_FLOW_COLOR = '#78dcff'; // 气体未声明 gasColor 时的通用气流青

export class GasTube extends Obj {
  get hoverLabel() {
    return '导气管';
  }

  get isGasTube() {
    return true;
  }

  constructor({ x = 0, y = 0, w = 90, h = 70, inId = '', outId = '', outIds = null, valves = null, ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.inId = inId ?? ''; // 输入端药品池 id（必须是药品池）
    this.outId = outId ?? ''; // 旧字段：单输出（outIds 缺省时生效，编辑器/旧关卡兼容）
    // 输出端 id 列表：新配置 outIds 优先；否则旧 outId 视为单输出
    const requested = Array.isArray(outIds) ? outIds : (this.outId ? [this.outId] : []);
    const ids = [];
    for (const raw of requested) {
      const id = typeof raw === 'string' ? raw.trim() : '';
      if (id && !ids.includes(id)) ids.push(id);
    }
    this.outIds = ids;
    // 阀门：普通对象 {outId: true/false}（键存在 = 该支路装了阀门，值 = 初始开）。
    // 必须保持普通对象：存档系统只深拷贝纯数据，类实例/Map 作键不会被捕获。
    this.valves = {};
    if (valves && typeof valves === 'object') {
      for (const key of Object.keys(valves)) {
        if (!key) continue;
        this.valves[key] = valves[key] !== false;
      }
    }
    this.flow = 0; // 聚合气流强度 0..1（主干颜色/旧测试/调试用）
    this.gasId = null; // 最近流过的气体（主干颜色）
    this._branchFlow = {}; // outId → 该支路气流强度 0..1（逐支路衰减）
    this._branchGas = {}; // outId → 该支路最近流过的气体
    this._legacyFlow = 0; // 旧单参 noteFlow 的"全支路"气流（旧 Scene 调用兼容）
    this._bubbleAcc = {}; // outId → 管口气泡节流计时
    // 最近一次几何（编辑器命中/点击阀门用）。非枚举：存档不会把带对象引用的
    // 半深拷贝写回（geometry 每帧都会重算，无需持久化）。
    Object.defineProperty(this, '_geom', { value: null, writable: true, enumerable: false });
    // 每条支路的"柱归属"token 缓存（branchSource 每次都返回同一个对象；无原型键防意外）
    Object.defineProperty(this, '_branchSources', { value: Object.create(null), writable: true, enumerable: false });
  }

  /** 解析输入端药品池；未接好（缺 id / 不是池 / 已隐藏 / 无溶液）→ null */
  _poolOf(scene, id) {
    if (!scene || !scene.byId || !id) return null;
    const o = scene.byId[id];
    return o && o.isPool && !o.hidden && o.solution && typeof o.innerRect === 'function' ? o : null;
  }

  /**
   * 解析一个输出端：药品池（isPool + 有溶液 + innerRect）或气室（isGasChamber）。
   * 已隐藏 / 类型不符 / 已移除 → null。
   */
  _targetOf(scene, id) {
    if (!scene || !scene.byId || !id) return null;
    const o = scene.byId[id];
    if (!o || o.hidden) return null;
    if (o.isGasChamber) return { target: o, targetKind: 'chamber' };
    if (o.isPool && o.solution && typeof o.innerRect === 'function') return { target: o, targetKind: 'pool' };
    return null;
  }

  // ---- 阀门 ----------------------------------------------------------------

  /** 该输出支路是否装了阀门（键存在即装） */
  hasValve(outId) {
    return !!outId && Object.prototype.hasOwnProperty.call(this.valves, outId);
  }

  /** 阀门是否开着（没装阀门 → false；openBranches 另按"无阀门=通气"处理） */
  valveOpen(outId) {
    return this.hasValve(outId) && this.valves[outId] !== false;
  }

  /** 切换阀门开/关，返回新状态（没装阀门 → 不凭空加阀门，返回 false） */
  toggleValve(outId) {
    if (!this.hasValve(outId)) return false;
    const next = this.valves[outId] === false; // 关→开 / 开→关
    this.valves[outId] = next;
    return next;
  }

  /**
   * 计算装置几何（世界坐标，纯计算幂等）：
   *   输入罩（罩住整个输入池）+ 罩顶竖直主干 + 各输出支路（从主干不同高度横着
   *   分叉出去 → 沿输出端外侧下行 → 插入药品池液面下 / 贴气室外壁法兰）。
   * 返回 null = 没有有效输入端或没有任何有效输出端（装置不工作）。
   * 同时把自身 body 矩形同步为装置包围盒（编辑器选中框/命中/导出用）。
   *
   * 返回 { inPool, hood, trunk:[{x,y}...], branches:[
   *   { outId, target, targetKind:'pool'|'chamber', fromLeft,
   *     path:[{x,y}...], mouth:{x,y}, valve:{x,y,r,open}|null } ] }
   * 另含旧单输出兼容字段（旧 Scene 路由/旧测试读取）：outPool / path / mouth
   * （= 第一条药品池支路；无药品池支路时 path/mouth 取第一条支路）。
   */
  _layout(scene) {
    const inPool = this._poolOf(scene, this.inId);
    if (!inPool) {
      this._geom = null;
      return null;
    }
    // 输出端：跳过空 id / 重复 id / 输入池自身 / 无效或已隐藏目标
    const plans = [];
    const seenIds = new Set();
    const seenTargets = new Set();
    for (const outId of this.outIds) {
      if (!outId || seenIds.has(outId) || outId === this.inId) continue;
      const t = this._targetOf(scene, outId);
      if (!t || t.target === inPool || seenTargets.has(t.target)) continue;
      seenIds.add(outId);
      seenTargets.add(t.target);
      plans.push({ outId, target: t.target, targetKind: t.targetKind });
    }
    if (!plans.length) {
      this._geom = null;
      return null;
    }
    // 罩体：罩住整个池口（比池宽略大，底边落在池口地面线上）
    const hoodH = Math.round(Math.max(48, Math.min(84, inPool.w * 0.22)));
    const hood = { x: inPool.x - HOOD_MARGIN, y: inPool.y - hoodH, w: inPool.w + HOOD_MARGIN * 2, h: hoodH };
    const cx = hood.x + hood.w / 2;
    // 主干顶部横线：罩顶与所有输出端顶部再往上 BUS_GAP
    let top = hood.y;
    for (const p of plans) top = Math.min(top, p.target.y);
    const topY = Math.round(top - BUS_GAP);
    // 各支路接入点：药品池 = 插到液面下（离内壁 14px）；气室 = 贴靠近输入端一侧外壁
    for (const p of plans) {
      const t = p.target;
      const fromLeft = t.x + t.w / 2 >= inPool.x + inPool.w / 2; // 输出端在输入池右侧 → 从右接近
      if (p.targetKind === 'pool') {
        const wall = Number.isFinite(t.wall) ? t.wall : 8;
        const insertY = Math.round(t.y + t.h * 0.55); // 插在池深中部（液面下）
        p.mouth = { x: fromLeft ? t.x + wall + 14 : t.x + t.w - wall - 14, y: insertY };
      } else {
        p.mouth = { x: fromLeft ? t.x : t.x + t.w, y: Math.round(t.y + t.h / 2) };
      }
      p.sideX = fromLeft ? t.x - SIDE_GAP : t.x + t.w + SIDE_GAP; // 下降段贴输出端外侧
      p.fromLeft = fromLeft;
      p.dist = Math.abs(p.sideX - cx);
    }
    // 车道分配：离主干近的走低车道（近支路的立管不会横穿远支路的横段），
    // 横段彼此错开 LANE_STEP —— 多支路分开布管、不重叠。
    const lanes = plans.slice().sort((a, b) => a.dist - b.dist);
    lanes.forEach((p, i) => { p.laneY = topY - i * LANE_STEP; });
    const trunk = [{ x: cx, y: hood.y + 2 }, { x: cx, y: topY - (plans.length - 1) * LANE_STEP }];
    const branches = plans.map((p) => ({
      outId: p.outId,
      target: p.target,
      targetKind: p.targetKind,
      fromLeft: p.fromLeft,
      path: [
        { x: cx, y: p.laneY }, // 从主干分叉
        { x: p.sideX, y: p.laneY }, // 横段（阀门装在这里的中点）
        { x: p.sideX, y: p.mouth.y }, // 沿输出端外侧下行
        { x: p.mouth.x, y: p.mouth.y }, // 插入药品池内 / 贴气室外壁
      ],
      mouth: p.mouth,
      valve: this.hasValve(p.outId)
        ? { x: Math.round((cx + p.sideX) / 2), y: p.laneY, r: VALVE_R, open: this.valveOpen(p.outId) }
        : null,
    }));
    // 包围盒 = 罩体 + 主干 + 各支路 + 阀门手柄/气室法兰的绘制范围
    let x0 = hood.x;
    let x1 = hood.x + hood.w;
    let y0 = hood.y;
    let y1 = hood.y + hood.h;
    const cover = (px, py) => {
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    };
    for (const pt of trunk) cover(pt.x, pt.y);
    for (const b of branches) {
      for (const pt of b.path) cover(pt.x, pt.y);
      if (b.valve) {
        cover(b.valve.x - b.valve.r - 7, b.valve.y - b.valve.r - 7);
        cover(b.valve.x + b.valve.r + 7, b.valve.y + b.valve.r + 7);
      }
      if (b.targetKind === 'chamber') {
        // 法兰板贴外壁向外伸出
        const out = b.fromLeft ? -1 : 1;
        cover(b.mouth.x + out * (FLANGE_W + 3), b.mouth.y - FLANGE_H / 2 - 3);
        cover(b.mouth.x + out * (FLANGE_W + 3), b.mouth.y + FLANGE_H / 2 + 3);
      }
    }
    this.x = Math.round(x0 - PIPE_W);
    this.y = Math.round(y0 - PIPE_W);
    this.w = Math.round(x1 - x0 + PIPE_W * 2);
    this.h = Math.round(y1 - y0 + PIPE_W * 2);
    const g = { inPool, hood, trunk, branches };
    // 旧单输出兼容字段：旧 Scene 路由与旧测试按 path/mouth/outPool 读
    const compat = branches.find((b) => b.targetKind === 'pool') ?? branches[0];
    g.outPool = compat.targetKind === 'pool' ? compat.target : null;
    g.mouth = compat.mouth;
    g.path = trunk.concat(compat.path.slice(1));
    this._geom = g;
    return g;
  }

  /** 当前装置几何（世界坐标；无有效输入/输出 → null）。Scene 输送气体时用 */
  geometry(scene) {
    return this._layout(scene);
  }

  /**
   * 某输出支路的"柱归属"token（Scene._gasPlume 的 source 合并用）：同一 outId
   * 每次返回**同一个对象**，多条支路同种气体各自冒柱、不互相抢同一根柱。
   * 单支路装置直接返回装置自身（= 旧单输出语义：气泡柱归属该导气管）。
   */
  branchSource(outId) {
    if (this._geom && this._geom.branches.length === 1) return this;
    const key = outId ?? '';
    let token = this._branchSources[key];
    if (!token) {
      token = { branch: key };
      this._branchSources[key] = token;
    }
    return token;
  }

  /** 当前通气的支路（没阀门或阀门开着；几何无效 → 空数组）。Scene 输送气体用 */
  openBranches(scene) {
    const g = this._layout(scene);
    if (!g) return [];
    return g.branches.filter((b) => !b.valve || b.valve.open);
  }

  /** 本次产气是否来自输入端（罩住整个输入池：池内反应 + 池口贴合处产气） */
  captures(scene, emit) {
    if (!emit) return false;
    const g = this._layout(scene);
    if (!g) return false;
    if (emit.container === g.inPool) return true; // 输入池自身反应 / 池内物体与池溶液反应
    if (emit.obj === g.inPool) return true;
    const pt = emit.point;
    if (!pt) return false;
    // 池体（含盆壁/池口贴合处）：罩子罩住整个池口，池内冒出的气都归它
    const r = g.inPool;
    return pt.x >= r.x - 8 && pt.x <= r.x + r.w + 8 && pt.y >= r.y - 8 && pt.y <= r.y + r.h + 8;
  }

  /**
   * 本 tick 有气体通过（Scene 输送时调用），点亮对应支路的管内颜色/管口气泡。
   * 新双参形式 noteFlow(outId, gasId)：只点亮该输出支路。
   * 旧单参形式 noteFlow(gasId)（旧 Scene / 旧测试）：没有支路信息 → 点亮全部支路。
   */
  noteFlow(outId, gasId) {
    if (gasId === undefined) {
      // 旧单参：把入参当气体 id，点亮全部支路（兼容旧 Scene 的 noteFlow(id)）
      if (outId) this.gasId = outId;
      this._legacyFlow = 1;
      this.flow = 1;
      return;
    }
    if (gasId) {
      this.gasId = gasId;
      this._branchGas[outId] = gasId;
    }
    this._branchFlow[outId] = 1;
    this.flow = 1;
  }

  /** 该支路当前气流强度（含旧单参 noteFlow 的全支路点亮） */
  _flowOf(outId) {
    return Math.max(this._branchFlow[outId] ?? 0, this._legacyFlow);
  }

  /** 主干显示的气体色（半透明灰管透过气体色；未声明 gasColor 时用通用气流青） */
  tintColor() {
    return (this.gasId && getSubstance(this.gasId)?.gasColor) || FALLBACK_FLOW_COLOR;
  }

  /** 某支路显示的气体色（支路可能流着与主干最近记录不同的气体） */
  _branchTint(outId) {
    const id = this._branchGas[outId] ?? this.gasId;
    return (id && getSubstance(id)?.gasColor) || FALLBACK_FLOW_COLOR;
  }

  update(dt, scene) {
    const g = this._layout(scene);
    // 停止产气后管内颜色渐褪回灰色（逐支路衰减，聚合值取最大）
    const decay = dt / FLOW_FADE;
    let flow = 0;
    for (const outId of Object.keys(this._branchFlow)) {
      const v = Math.max(0, this._branchFlow[outId] - decay);
      if (v > 1e-4) {
        this._branchFlow[outId] = v;
        if (v > flow) flow = v;
      } else delete this._branchFlow[outId];
    }
    this._legacyFlow = Math.max(0, this._legacyFlow - decay);
    if (this._legacyFlow > flow) flow = this._legacyFlow;
    this.flow = flow;
    if (!g) return;
    // 管口气泡：每条有气流的支路在自己 mouth 冒泡（气体正在鼓入该输出端；纯视觉）
    for (const b of g.branches) {
      if (this._flowOf(b.outId) > 0.03) {
        const acc = (this._bubbleAcc[b.outId] ?? 0) + dt;
        if (acc >= BUBBLE_INTERVAL) {
          this._bubbleAcc[b.outId] = 0;
          this._spawnMouthBubble(scene, b);
        } else this._bubbleAcc[b.outId] = acc;
      } else this._bubbleAcc[b.outId] = 0;
    }
  }

  /** 在支路管口生成一颗上浮气泡（气室没有液体 → 冒在气室内侧贴壁处） */
  _spawnMouthBubble(scene, b) {
    if (!scene || typeof scene.addObject !== 'function') return;
    const m = b.mouth;
    let bx = m.x - 3 + (Math.random() - 0.5) * 6;
    let by = m.y - 4 - Math.random() * 6;
    if (b.targetKind === 'chamber') {
      bx = m.x + (b.fromLeft ? 8 : -8) + (Math.random() - 0.5) * 8;
      by = m.y + (Math.random() - 0.5) * 10;
    }
    scene.addObject(new Bubble({
      x: bx,
      y: by,
      dir: -1, // 池内/气室内气泡一律上浮（与气体轻重无关）
      speed: 46 + Math.random() * 26,
    }));
  }

  render(ctx, opts) {
    const scene = opts?.scene ?? null;
    const g = scene ? this._layout(scene) : this._geom;
    if (!g) {
      this._renderPlaceholder(ctx, scene);
      return;
    }
    const t = opts?.time ?? 0;
    const flow = Math.max(0, Math.min(1, this.flow));
    const tint = flow > 0.02 ? this.tintColor() : null;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // ---- 管道：半透明灰玻璃（外壁 → 内壁高光；主干 + 各支路共用一套层次）----
    this._pipeShell(ctx, g.trunk);
    for (const b of g.branches) this._pipeShell(ctx, b.path);
    // ---- 主干气流（聚合色；各支路气体可能不同，主干显示最近一种）----
    if (tint) this._pipeFlow(ctx, g.trunk, tint, flow, t);
    // ---- 各支路气流（各自颜色/强度；没通气的支路保持灰色）----
    for (const b of g.branches) {
      const bf = Math.max(0, Math.min(1, this._flowOf(b.outId)));
      if (bf <= 0.02) continue;
      this._pipeFlow(ctx, b.path, this._branchTint(b.outId), bf, t);
    }
    // ---- 黄铜箍环：每个弯头/接头（压住金属包边接缝）----
    this._collars(ctx, g);
    // ---- 输出端管口：药品池=插液管口；气室=外壁法兰/喷嘴 ----
    for (const b of g.branches) this._renderMouth(ctx, b);
    // ---- 阀门（黄铜手轮：开=金环/青珠发光，关=暗灰、把手转 90°）----
    for (const b of g.branches) if (b.valve) this._renderValve(ctx, b.valve, t);
    // ---- 输入罩：罩住整个池口的大玻璃罩（罩内空间也在采集范围内）----
    this._renderHood(ctx, g.hood, tint ? hexToRgb(tint) : null, flow);
    ctx.restore();
  }

  /**
   * 玻璃管身 + 深钢金属包边：管内仍是半透明玻璃（透出后方场景/气体色），
   * 两侧沿管段偏移画深钢边框（接缝由黄铜箍环遮住；弯头圆润来自 round 端帽）。
   */
  _pipeShell(ctx, pts) {
    if (!pts || pts.length < 2) return;
    // 玻璃本体（半透明 + 内壁高光，保持可透视）
    this._strokePath(ctx, pts, PIPE_W, 'rgba(126,144,176,0.34)');
    this._strokePath(ctx, pts, PIPE_W - 3, 'rgba(226,236,250,0.15)');
    // 两侧金属包边（只处理轴向管段；当前几何全部为水平/垂直段）
    ctx.save();
    ctx.lineCap = 'butt';
    const off = PIPE_W / 2 - 0.6; // 包边中线位置（≈管外缘）
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      const horiz = Math.abs(q.y - p.y) < 0.5;
      const vert = Math.abs(q.x - p.x) < 0.5;
      if (!horiz && !vert) continue; // 非轴向段：只保留玻璃管身（不画错位的边）
      ctx.strokeStyle = '#262b3d';
      ctx.lineWidth = 2.6;
      if (horiz) {
        for (const dy of [-off, off]) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + dy);
          ctx.lineTo(q.x, q.y + dy);
          ctx.stroke();
        }
        // 上边缘受光高光
        ctx.strokeStyle = 'rgba(180,192,218,0.5)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - off);
        ctx.lineTo(q.x, q.y - off);
        ctx.stroke();
      } else {
        for (const dx of [-off, off]) {
          ctx.beginPath();
          ctx.moveTo(p.x + dx, p.y);
          ctx.lineTo(q.x + dx, q.y);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(180,192,218,0.4)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(p.x - off, p.y);
        ctx.lineTo(q.x - off, q.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** 所有管道折线的黄铜箍环（弯头/接头处；主干 + 各支路） */
  _collars(ctx, g) {
    const draw = (pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        this._pipeCollar(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      }
    };
    draw(g.trunk);
    for (const b of g.branches) draw(b.path);
  }

  /** 黄铜箍环（细金环 + 两颗铆钉）：套在顶点出发的那段管子上，遮住金属包边接缝 */
  _pipeCollar(ctx, px, py, qx, qy) {
    const dx = qx - px;
    const dy = qy - py;
    const len = Math.hypot(dx, dy);
    if (!(len > 8)) return;
    const ux = dx / len;
    const uy = dy / len;
    const cx = px + ux * 5.5;
    const cy = py + uy * 5.5;
    const angle = Math.atan2(uy, ux);
    const halfW = PIPE_W / 2 + 3.2; // 箍环横跨管径（略宽于管）
    const halfT = 1.8; // 箍环沿管方向的厚度
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // 环体（黄铜）
    rr(ctx, -halfT, -halfW, halfT * 2, halfW * 2, 1.2);
    ctx.fillStyle = '#c09241';
    ctx.fill();
    ctx.strokeStyle = 'rgba(58,40,12,0.8)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // 受光侧亮边
    ctx.fillStyle = 'rgba(255,226,150,0.5)';
    ctx.fillRect(-halfT + 0.5, -halfW + 1.5, 1, halfW * 2 - 3);
    // 两颗铆钉（箍环两端）
    for (const ry of [-halfW + 2.2, halfW - 2.2]) {
      ctx.fillStyle = '#f0d493';
      ctx.beginPath();
      ctx.arc(0, ry, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,40,10,0.75)';
      ctx.beginPath();
      ctx.arc(0, ry, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 管内气体色 + 沿管道向输出端流动的光带 */
  _pipeFlow(ctx, pts, tint, flow, t) {
    const { r, g, b } = hexToRgb(tint);
    const gas = (a) => `rgba(${r},${g},${b},${a})`;
    this._strokePath(ctx, pts, PIPE_W - 3, gas(0.12 + 0.30 * flow));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.setLineDash([5, 15]);
    ctx.lineDashOffset = -t * 110;
    ctx.strokeStyle = gas(0.55 * flow);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  /** 输出端管口：药品池=黄铜管口环 + 玻璃内口 + 冒气微光；气室=黄铜法兰/喷嘴 */
  _renderMouth(ctx, b) {
    if (b.targetKind === 'chamber') {
      this._renderFlange(ctx, b);
      return;
    }
    const flow = Math.max(0, Math.min(1, this._flowOf(b.outId)));
    const tint = flow > 0.02 ? this._branchTint(b.outId) : null;
    const m = b.mouth;
    // 黄铜管口环
    ctx.beginPath();
    ctx.arc(m.x, m.y, PIPE_W / 2 + 2.4, 0, Math.PI * 2);
    ctx.fillStyle = '#a9782a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(58,40,12,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 玻璃内口
    ctx.beginPath();
    ctx.arc(m.x, m.y, PIPE_W / 2 - 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150,168,196,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,236,250,0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 内口高光弧
    ctx.beginPath();
    ctx.arc(m.x, m.y, PIPE_W / 2 - 2, Math.PI * 1.12, Math.PI * 1.62);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (tint) {
      const { r, g, b: bb } = hexToRgb(tint);
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${bb},${0.35 + 0.45 * flow})`;
      ctx.shadowColor = `rgba(${r},${g},${bb},0.8)`;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  /** 气室外壁法兰：黄铜法兰盘 + 4 颗螺栓 + 短喷嘴 + 内圈金属高光（与气室外框呼应） */
  _renderFlange(ctx, b) {
    const flow = Math.max(0, Math.min(1, this._flowOf(b.outId)));
    const tint = flow > 0.02 ? this._branchTint(b.outId) : null;
    const m = b.mouth;
    const out = b.fromLeft ? -1 : 1; // 外法线方向（气室在管口另一侧）
    const fr = FLANGE_H / 2; // 法兰盘半径
    const cx = m.x + out * 3; // 盘心略偏外，压在气室外壁上
    ctx.save();
    // 短喷嘴（向气室内侧伸出的金属管口）
    const stub = Math.max(6, FLANGE_W - 1);
    ctx.fillStyle = '#3a3f5c';
    ctx.fillRect(Math.min(m.x, m.x - out * stub), m.y - 4.5, stub, 9);
    ctx.fillStyle = 'rgba(190,200,228,0.25)';
    ctx.fillRect(Math.min(m.x, m.x - out * stub), m.y - 4.5, stub, 1.2);
    // 黄铜法兰盘（外圆）
    ctx.beginPath();
    ctx.arc(cx, m.y, fr, 0, Math.PI * 2);
    ctx.fillStyle = '#a9782a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(44,28,10,0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // 盘面亮环（内圈金属高光）
    ctx.beginPath();
    ctx.arc(cx, m.y, fr - 3.4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232,184,75,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, m.y, fr - 1.8, Math.PI * 1.1, Math.PI * 1.6);
    ctx.strokeStyle = 'rgba(255,240,190,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 4 颗螺栓（对角布置）
    for (let i = 0; i < 4; i++) {
      const ang = Math.PI / 4 + (i * Math.PI) / 2;
      const bx = cx + Math.cos(ang) * (fr - 6);
      const by = m.y + Math.sin(ang) * (fr - 6);
      ctx.fillStyle = '#e8d29a';
      ctx.beginPath();
      ctx.arc(bx, by, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,40,10,0.8)';
      ctx.beginPath();
      ctx.arc(bx, by, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // 中心喷口（黄铜环 + 深色孔）
    ctx.beginPath();
    ctx.arc(cx, m.y, 5.4, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2438';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.7)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
    // 通气微光：气体色向气室内侧渗入
    if (tint) {
      const { r, g, b: bb } = hexToRgb(tint);
      ctx.beginPath();
      ctx.arc(m.x - out * 6, m.y, 4 + flow * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${bb},${0.18 + 0.42 * flow})`;
      ctx.shadowColor = `rgba(${r},${g},${bb},0.85)`;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  /**
   * 黄铜手轮阀门：外圈金环 + 4 根辐条 + 中心深紫玻璃状态珠 + 手轮把手（关闭转 90°）+
   * 下方钢制安装座/卡箍。开/关辨识度靠"整体明度"拉开：
   *   开 = 亮黄铜外圈 + 青色状态珠发光 + 呼吸金辉 + 把手末端青色小指示灯；
   *   关 = 暗黄铜/发灰整体压暗、去高光、状态珠近黑、把手/辐条深灰（无青色）。
   * 命中半径/几何位置/valve 数据不变（几何仍用 valve.x/y/r）。
   */
  _renderValve(ctx, v, t = 0) {
    const { x, y, r, open } = v;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2); // 开态微光呼吸（确定性）
    ctx.save();
    ctx.lineCap = 'round';
    // ---- 钢制安装座/卡箍（连到管道上；关态整体压暗）----
    rr(ctx, x - r * 0.62, y + r * 0.42, r * 1.24, 5.5, 1.6);
    ctx.fillStyle = open ? '#3a3f5c' : '#262a3c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(14,12,30,0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = open ? 'rgba(226,232,244,0.6)' : 'rgba(150,158,180,0.3)';
    for (const dx of [-r * 0.5, r * 0.5]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + r * 0.42 + 2.8, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 手轮把手（关闭时长把手旋转 90°；先画，压在轮盘下）----
    ctx.save();
    ctx.translate(x, y);
    if (!open) ctx.rotate(Math.PI / 2);
    const hw = r * 1.5;
    const hh = 4.2;
    rr(ctx, -hw, -hh / 2, hw * 2, hh, hh / 2);
    const hg = ctx.createLinearGradient(-hw, 0, hw, 0);
    if (open) {
      hg.addColorStop(0, '#8a6420');
      hg.addColorStop(0.5, '#ffd76a');
      hg.addColorStop(1, '#8a6420');
    } else {
      hg.addColorStop(0, '#24262f');
      hg.addColorStop(0.5, '#34373f');
      hg.addColorStop(1, '#1e2026');
    }
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = open ? 'rgba(255,224,150,0.75)' : 'rgba(90,96,110,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 把手末端握球：开=青色小指示灯（带柔光）；关=近黑哑光
    ctx.beginPath();
    ctx.arc(hw, 0, hh * 0.62, 0, Math.PI * 2);
    if (open) {
      ctx.fillStyle = '#9ff0ff';
      ctx.shadowColor = '#7fe0ff';
      ctx.shadowBlur = 6 + 3 * pulse;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#2b2e36';
      ctx.fill();
    }
    ctx.strokeStyle = open ? 'rgba(255,255,255,0.35)' : 'rgba(70,76,90,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    // ---- 中心深紫玻璃轮盘 + 辐条（关态整体压暗）----
    ctx.beginPath();
    ctx.arc(x, y, r - 1.5, 0, Math.PI * 2);
    ctx.fillStyle = open ? 'rgba(34,27,70,0.92)' : 'rgba(13,13,20,0.95)';
    ctx.fill();
    ctx.strokeStyle = open ? THEME.gold.deep : '#2b2e37';
    ctx.lineWidth = open ? 2 : 1.6;
    for (let i = 0; i < 4; i++) {
      const ang = Math.PI / 4 + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * (r * 0.32), y + Math.sin(ang) * (r * 0.32));
      ctx.lineTo(x + Math.cos(ang) * (r - 2.2), y + Math.sin(ang) * (r - 2.2));
      ctx.stroke();
    }
    // ---- 状态珠（开=青色发光；关=近黑无光）----
    const beadR = r * 0.42;
    ctx.beginPath();
    ctx.arc(x, y, beadR, 0, Math.PI * 2);
    if (open) {
      ctx.fillStyle = '#7fe0ff';
      ctx.shadowColor = pulse > 0.5 ? '#7fe0ff' : THEME.gold.light;
      ctx.shadowBlur = 8 + 4 * pulse;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(x - beadR * 0.3, y - beadR * 0.3, beadR * 0.32, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#1d1f26';
      ctx.fill();
      ctx.strokeStyle = 'rgba(52,56,70,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // ---- 外圈（开=亮金环发光；关=暗黄铜/发灰、无高光）----
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = open ? THEME.gold.base : '#3d414c';
    ctx.lineWidth = open ? 2.6 : 2.2;
    if (open) {
      ctx.shadowColor = THEME.gold.light;
      ctx.shadowBlur = 8;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 外圈 4 颗铆钉（开=金亮；关=哑光深灰）
    ctx.fillStyle = open ? '#f0d493' : '#4a4f59';
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * (r - 0.5), y + Math.sin(ang) * (r - 0.5), 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // 开态外圈柔和金色辉光环（关态完全没有）
    if (open) {
      ctx.globalAlpha = 0.16 + 0.12 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = THEME.gold.light;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** 输入罩体：圆顶玻璃罩（深钢边 + 细金内缘）+ 底座法兰铆钉；有气流时罩内泛出气体色 */
  _renderHood(ctx, h, rgb, flow) {
    const rad = Math.min(h.w / 2 - 2, h.h - 4);
    const dome = () => {
      ctx.beginPath();
      ctx.moveTo(h.x, h.y + h.h);
      ctx.lineTo(h.x, h.y + rad);
      ctx.quadraticCurveTo(h.x, h.y, h.x + rad, h.y);
      ctx.lineTo(h.x + h.w - rad, h.y);
      ctx.quadraticCurveTo(h.x + h.w, h.y, h.x + h.w, h.y + rad);
      ctx.lineTo(h.x + h.w, h.y + h.h);
    };
    // 玻璃罩体（半透明灰，能看到输入池）
    dome();
    const grad = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
    grad.addColorStop(0, 'rgba(178,188,206,0.15)');
    grad.addColorStop(1, 'rgba(126,136,156,0.06)');
    ctx.fillStyle = grad;
    ctx.fill();
    if (rgb) {
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.05 + 0.09 * flow})`; // 罩内气体色
      ctx.fill();
    }
    // 罩体边缘：深钢粗边 + 细金内缘（金属包边玻璃圆顶）
    ctx.strokeStyle = '#2c3146';
    ctx.lineWidth = 4;
    dome();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(232,184,75,0.55)';
    ctx.lineWidth = 1.3;
    ctx.shadowColor = 'rgba(255,215,106,0.35)';
    ctx.shadowBlur = 5;
    dome();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 玻璃高光（左侧一道弧）
    ctx.beginPath();
    ctx.moveTo(h.x + h.w * 0.16, h.y + h.h - 10);
    ctx.quadraticCurveTo(h.x + h.w * 0.08, h.y + h.h * 0.42, h.x + h.w * 0.26, h.y + h.h * 0.1);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 底部法兰：压在池口地面线上（"罩住整个池"的底座）+ 金上沿 + 铆钉
    rr(ctx, h.x - 6, h.y + h.h - 7, h.w + 12, 11, 4);
    const fg = ctx.createLinearGradient(0, h.y + h.h - 7, 0, h.y + h.h + 4);
    fg.addColorStop(0, 'rgba(74,81,117,0.85)');
    fg.addColorStop(1, 'rgba(30,34,56,0.85)');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(12,10,30,0.85)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 金上沿线
    ctx.strokeStyle = 'rgba(232,184,75,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(h.x - 4, h.y + h.h - 6.2);
    ctx.lineTo(h.x + h.w + 4, h.y + h.h - 6.2);
    ctx.stroke();
    // 底座铆钉
    for (const fx of [0.12, 0.38, 0.62, 0.88]) {
      const px = h.x - 6 + (h.w + 12) * fx;
      ctx.fillStyle = '#e8d29a';
      ctx.beginPath();
      ctx.arc(px, h.y + h.h - 1.5, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,40,10,0.8)';
      ctx.beginPath();
      ctx.arc(px, h.y + h.h - 1.5, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 未接线：编辑器里画虚线框便于选中/接线；游戏里不显示（不凭空出现装置） */
  _renderPlaceholder(ctx, scene) {
    if (scene && scene.status === 'running') return;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(160,172,190,0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.x + 1, this.y + 1, Math.max(8, this.w - 2), Math.max(8, this.h - 2));
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * 细粒度命中：只认阀门圆（供点击管线 hitTap 用——整台装置 bbox 很大，
   * 不能靠它抢滴管等其它物体的点击）。
   */
  tapHit(world) {
    if (!world || !this._geom) return false;
    for (const b of this._geom.branches) {
      if (!b.valve) continue;
      if (Math.hypot(world.x - b.valve.x, world.y - b.valve.y) <= b.valve.r + VALVE_TAP_PAD) return true;
    }
    return false;
  }

  /**
   * 点击阀门：切换该支路阀门开/关。
   * **永远返回 false** —— 点击管线里返回 true 会进入"按住连发"（每 0.08s 再点
   * 一次，阀门会被疯狂翻转）；且未命中阀门时更不应消费这次按下。
   */
  onTap(scene, world) {
    if (!world) return false;
    const g = scene ? this._layout(scene) : this._geom;
    if (!g) return false;
    for (const b of g.branches) {
      if (!b.valve) continue;
      if (Math.hypot(world.x - b.valve.x, world.y - b.valve.y) <= b.valve.r + VALVE_TAP_PAD) {
        if (this.hasValve(b.outId)) {
          this.toggleValve(b.outId);
          sfx('ui.click');
        }
        return false;
      }
    }
    return false;
  }

  /** 编辑器命中检测：罩边/主干/各支路管道/管口/阀门圆都能选中，罩内空间留给药品池 */
  editorHit(wx, wy) {
    const g = this._geom;
    if (!g || !g.hood || !Array.isArray(g.branches)) {
      const pad = 8;
      return wx >= this.x - pad && wx <= this.x + this.w + pad && wy >= this.y - pad && wy <= this.y + this.h + pad;
    }
    const h = g.hood;
    if (wx >= h.x - 10 && wx <= h.x + h.w + 10 && wy >= h.y - 10 && wy <= h.y + h.h + 10) {
      const nearSide = Math.abs(wx - h.x) <= 10 || Math.abs(wx - (h.x + h.w)) <= 10;
      const nearTop = wy <= h.y + 14
        || Math.hypot(wx - h.x, wy - h.y) <= 18
        || Math.hypot(wx - (h.x + h.w), wy - h.y) <= 18;
      const nearBase = wy >= h.y + h.h - 8;
      if (nearSide || nearTop || nearBase) return true;
    }
    const hitPath = (pts) => {
      for (let i = 1; i < pts.length; i++) {
        if (segDist(wx, wy, pts[i - 1], pts[i]) <= PIPE_W) return true;
      }
      return false;
    };
    if (hitPath(g.trunk)) return true;
    for (const b of g.branches) {
      if (hitPath(b.path)) return true;
      if (Math.hypot(wx - b.mouth.x, wy - b.mouth.y) <= PIPE_W + 2) return true;
      if (b.valve && Math.hypot(wx - b.valve.x, wy - b.valve.y) <= b.valve.r + 4) return true;
    }
    return false;
  }

  /** 折线描边（管道共用） */
  _strokePath(ctx, pts, width, style) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.stroke();
  }
}

/** 点到线段距离（编辑器命中检测用） */
function segDist(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
