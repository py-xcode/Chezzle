// ============================================================================
// 导气管：连接两个药品池的单向气体装置。
// ----------------------------------------------------------------------------
// 输入端 = 罩住整个输入药品池的大罩子（池口以上是罩体，池体本身也在罩内）：
//   池内产气（溶液反应 / 池中物块·烧杯产气 / 滴管落入池中反应产气）产生的
//   气体**全部**被罩住，经管道鼓入输出端药品池（与集气瓶通气同一条"主动鼓入"
//   管线：碱吸收 → 水溶解，之后溶液内反应照常）。输入端不冒气泡柱、气体也不
//   进大气。
// 输出端 = 从池子侧面插入池内的管口：气体从管口冒泡鼓入输出池；输出池吸收
//   不完的多余气体才在管口生成气泡柱并进入大气。输入端无论如何都不会生成
//   气泡柱。单向：输出端自己产气不受影响（照常冒柱/进大气），也不会反灌。
// ----------------------------------------------------------------------------
// 无碰撞箱（physicsKind='none'）：罩子/管子在物理里完全不存在，不挡玩家、
//   物块、物品进出药品池。
// 视觉：整体半透明灰色玻璃管，因此显示色与流过的气体颜色（gasColor）有关；
//   输出端管口通气时冒气泡。
// 接线：inId / outId = 药品池对象 id（两端都接好才工作；否则装置不显示）。
// ============================================================================

import { Obj } from './obj.js';
import { Bubble } from './bubble.js';
import { getSubstance } from '../chem/substances.js';
import { rr } from '../render/theme.js';

const PIPE_W = 13; // 管径（px）
const FLOW_FADE = 0.55; // 停止产气后管内颜色褪回灰色所需时间（s）
const HOOD_MARGIN = 6; // 罩子比池宽多出来的边缘（px）

export class GasTube extends Obj {
  get hoverLabel() {
    return '导气管';
  }

  get isGasTube() {
    return true;
  }

  constructor({ x = 0, y = 0, w = 90, h = 70, inId = '', outId = '', ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.inId = inId ?? ''; // 输入端药品池 id
    this.outId = outId ?? ''; // 输出端药品池 id
    this.flow = 0; // 管内气流强度 0..1（有新气体通过时置 1，随时间衰减）
    this.gasId = null; // 最近流过的气体（管内颜色/管口微光用）
    this._bubbleAcc = 0; // 管口气泡生成节流
    this._geom = null; // 最近一次布局（编辑器命中检测用）
  }

  /** 解析两端药品池；未接好（缺 id / 不是池 / 已隐藏 / 同一池）→ null */
  _poolOf(scene, id) {
    if (!scene || !scene.byId || !id) return null;
    const o = scene.byId[id];
    return o && o.isPool && !o.hidden && o.solution && typeof o.innerRect === 'function' ? o : null;
  }

  /**
   * 计算装置几何（世界坐标）：罩住整个输入池的罩体 + 从罩顶接出、绕到输出池
   * 侧面再水平插入的管道 + 管口。返回 null = 两端未接好（装置不工作）。
   * 同时把自身 body 矩形同步为装置包围盒（编辑器选中框/命中/导出用）。
   */
  _layout(scene) {
    const inPool = this._poolOf(scene, this.inId);
    const outPool = this._poolOf(scene, this.outId);
    if (!inPool || !outPool || inPool === outPool) return null;
    // 罩体：罩住整个池口（比池宽略大，底边落在池口地面线上）
    const hoodH = Math.round(Math.max(48, Math.min(84, inPool.w * 0.22)));
    const hood = { x: inPool.x - HOOD_MARGIN, y: inPool.y - hoodH, w: inPool.w + HOOD_MARGIN * 2, h: hoodH };
    const cx = hood.x + hood.w / 2;
    // 输出端：从靠近输入端的一侧水平插入池壁（管口在池内，离内壁 14px）
    const wall = Number.isFinite(outPool.wall) ? outPool.wall : 8;
    const fromLeft = outPool.x + outPool.w / 2 >= inPool.x + inPool.w / 2;
    const insertY = Math.round(outPool.y + outPool.h * 0.55); // 插在池深中部（液面下）
    const mouth = {
      x: fromLeft ? outPool.x + wall + 14 : outPool.x + outPool.w - wall - 14,
      y: insertY,
    };
    const sideX = fromLeft ? outPool.x - 22 : outPool.x + outPool.w + 22; // 下降段贴池外侧
    const topY = Math.round(Math.min(hood.y, outPool.y) - 22);
    const path = [
      { x: cx, y: hood.y + 2 }, // 罩顶接出
      { x: cx, y: topY }, // 竖管
      { x: sideX, y: topY }, // 横管
      { x: sideX, y: insertY }, // 沿输出池外侧下行
      { x: mouth.x, y: insertY }, // 水平插入池内
    ];
    // body 矩形 = 装置包围盒
    let x0 = hood.x;
    let x1 = hood.x + hood.w;
    let y0 = hood.y;
    let y1 = hood.y + hood.h;
    for (const p of path) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    this.x = Math.round(x0 - PIPE_W);
    this.y = Math.round(y0 - PIPE_W);
    this.w = Math.round(x1 - x0 + PIPE_W * 2);
    this.h = Math.round(y1 - y0 + PIPE_W * 2);
    return { inPool, outPool, hood, path, mouth, fromLeft };
  }

  /** 当前装置几何（世界坐标；两端未接好 → null）。Scene 输送气体时用 */
  geometry(scene) {
    return this._layout(scene);
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

  /** 本 tick 有气体通过（Scene 输送时调用）：点亮管内气流颜色 */
  noteFlow(id) {
    if (id) this.gasId = id;
    this.flow = 1;
  }

  /** 管内显示的气体色（半透明灰管透过气体色；气体未声明 gasColor 时用通用气流青） */
  tintColor() {
    return (this.gasId && getSubstance(this.gasId)?.gasColor) || '#78dcff';
  }

  update(dt, scene) {
    const g = this._layout(scene);
    this._geom = g;
    // 停止产气后管内颜色渐褪回灰色
    this.flow = Math.max(0, this.flow - dt / FLOW_FADE);
    // 管口气泡：只在有气流时冒（气体正在鼓入输出池；纯视觉）
    if (g && this.flow > 0.03) {
      this._bubbleAcc += dt;
      if (this._bubbleAcc >= 0.14) {
        this._bubbleAcc = 0;
        const m = g.mouth;
        scene.addObject(new Bubble({
          x: m.x - 3 + (Math.random() - 0.5) * 6,
          y: m.y - 4 - Math.random() * 6,
          dir: -1, // 池内气泡一律上浮（与气体轻重无关）
          speed: 46 + Math.random() * 26,
        }));
      }
    } else {
      this._bubbleAcc = 0;
    }
  }

  render(ctx, opts) {
    const scene = opts?.scene ?? null;
    const g = scene ? this._layout(scene) : this._geom;
    if (!g) {
      this._renderPlaceholder(ctx, scene);
      return;
    }
    this._geom = g;
    const t = opts?.time ?? 0;
    const flow = Math.max(0, Math.min(1, this.flow));
    const tint = flow > 0.02 ? this.tintColor() : null;
    const rgb = tint ? hexToRgb(tint) : null;
    const gas = (a) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // ---- 管道：半透明灰玻璃（外壁 → 内壁高光 → 管内气体色 → 流动光带）----
    this._strokePath(ctx, g.path, PIPE_W + 4, 'rgba(108,118,136,0.36)');
    this._strokePath(ctx, g.path, PIPE_W, 'rgba(162,172,190,0.34)');
    this._strokePath(ctx, g.path, PIPE_W - 4, 'rgba(216,224,238,0.11)');
    if (tint) {
      this._strokePath(ctx, g.path, PIPE_W - 3, gas(0.12 + 0.30 * flow));
      // 气流光带（沿管道向输出端流动）
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(g.path[0].x, g.path[0].y);
      for (let i = 1; i < g.path.length; i++) ctx.lineTo(g.path[i].x, g.path[i].y);
      ctx.setLineDash([5, 15]);
      ctx.lineDashOffset = -t * 110;
      ctx.strokeStyle = gas(0.55 * flow);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    // ---- 输出端管口：玻璃圆环 + 冒气微光（气泡是 Bubble 对象，见 update）----
    const m = g.mouth;
    ctx.beginPath();
    ctx.arc(m.x, m.y, PIPE_W / 2 + 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150,160,178,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(205,214,228,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (tint) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = gas(0.35 + 0.45 * flow);
      ctx.shadowColor = gas(0.8);
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // ---- 输入罩：罩住整个池口的大玻璃罩（罩内空间也在采集范围内）----
    this._renderHood(ctx, g.hood, rgb ? gas : null, flow);
    ctx.restore();
  }

  /** 输入罩体：圆顶玻璃罩 + 底部法兰；有气流时罩内泛出气体色 */
  _renderHood(ctx, h, gas, flow) {
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
    // 玻璃罩体（半透明灰，能看到池内）
    dome();
    const grad = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
    grad.addColorStop(0, 'rgba(178,188,206,0.15)');
    grad.addColorStop(1, 'rgba(126,136,156,0.06)');
    ctx.fillStyle = grad;
    ctx.fill();
    if (gas) {
      ctx.fillStyle = gas(0.05 + 0.09 * flow); // 罩内气体色
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(182,192,210,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 玻璃高光（左侧一道弧）
    ctx.beginPath();
    ctx.moveTo(h.x + h.w * 0.16, h.y + h.h - 10);
    ctx.quadraticCurveTo(h.x + h.w * 0.08, h.y + h.h * 0.42, h.x + h.w * 0.26, h.y + h.h * 0.1);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 底部法兰：压在池口地面线上（"罩住整个池"的底座）
    rr(ctx, h.x - 6, h.y + h.h - 7, h.w + 12, 11, 4);
    const fg = ctx.createLinearGradient(0, h.y + h.h - 7, 0, h.y + h.h + 4);
    fg.addColorStop(0, 'rgba(172,182,200,0.50)');
    fg.addColorStop(1, 'rgba(92,102,120,0.50)');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,210,226,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  /** 两端未接好：编辑器里画虚线框便于选中/接线；游戏里不显示（不凭空出现装置） */
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

  /** 编辑器命中检测：只认装置轮廓（罩边/管道/管口），罩子内部留给药品池选中 */
  editorHit(wx, wy) {
    const g = this._geom;
    if (!g) {
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
    const pts = g.path;
    for (let i = 1; i < pts.length; i++) {
      if (segDist(wx, wy, pts[i - 1], pts[i]) <= PIPE_W) return true;
    }
    return Math.hypot(wx - g.mouth.x, wy - g.mouth.y) <= PIPE_W + 2;
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
