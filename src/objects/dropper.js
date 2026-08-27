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

import { Obj } from './obj.js';
import { getSubstance } from '../chem/substances.js';
import { Solution } from '../chem/solution.js';
import { solutionColor } from '../render/liquidrender.js';
import { Drip } from './drip.js';

export const DROPPER_W = 11;
export const DROPPER_H = 52;

export class Dropper extends Obj {
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
    return this.liquid > 1e-9 ? `滴管·${name}（${this.liquid.toFixed(1)}g）` : `滴管·${name}（空）`;
  }

  get isCarryItem() {
    return 'dropper';
  }

  /** 玩家附近可拖动（改变位置，无碰撞箱） */
  get isDraggable() {
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
