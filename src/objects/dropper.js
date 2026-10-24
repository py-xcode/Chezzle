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
import { rr } from '../render/theme.js';
import { Drip } from './drip.js';
import { flowFx, puffFx } from './fx.js';
import { CFG } from '../core/config.js';
import { pushNotice } from '../level/click.js';
import { sfx } from '../core/audio.js';

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
    // 纯视觉：胶头压缩（滴液时）/ 拉伸（吸液时）脉冲，0..1 短促衰减
    this._squish = 0;
    this._suckKick = 0;
  }

  /** 渲染坐标每 tick 向真实坐标收敛（指数趋近，帧率无关）+ 胶头动画衰减 */
  update(dt) {
    const k = 1 - Math.exp(-14 * dt);
    this.rx += (this.x - this.rx) * k;
    this.ry += (this.y - this.ry) * k;
    // 胶头压缩/回弹（约 0.18s）与吸液拉伸（约 0.25s）——纯视觉，确定性衰减
    if (this._squish > 0) this._squish = Math.max(0, this._squish - dt / 0.18);
    if (this._suckKick > 0) this._suckKick = Math.max(0, this._suckKick - dt / 0.25);
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

  /** 玩家附近可拖动（改变位置，无碰撞箱）；锁定（noCarry）的滴管不可拖动 */
  get isDraggable() {
    return !this.noCarry;
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
      pushNotice(scene, '管里是别的液体');
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
    this._suckKick = 1; // 视觉：吸液时胶头轻拉（纯表现）
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
    sfx('item.suck');
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
    this._squish = 1; // 视觉：胶头压缩回弹（纯表现，不影响滴加逻辑）
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
    sfx('item.drip');
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

  // ---------------------------------------------------------------------------
  // 渲染（简洁版）：暗紫玻璃细管 + 黄铜卡箍 + 红橡胶胶头 + 管内液面；
  //   滴液时胶头压缩回弹、尖端口形成液珠（Drip 粒子由物品管线生成）；
  //   吸液时胶头反向轻拉。纯视觉动画，不影响点击/拖动与 onBulb 命中区。
  // ---------------------------------------------------------------------------
  render(ctx) {
    const x = Number.isFinite(this.rx) ? this.rx : this.x;
    const y = Number.isFinite(this.ry) ? this.ry : this.y;
    const w = this.w;
    const h = this.h;
    const hx = x + w / 2;
    const squish = this._squish ?? 0; // 滴液压缩 0..1
    const stretch = this._suckKick ?? 0; // 吸液拉伸 0..1
    // ---- 1) 红橡胶胶头（泪滴形：圆肩 → 收腰进卡箍；滴液压扁 / 吸液拉长）----
    const neckY = y + 9.2;
    const bulbTopY = y + 0.6 - squish * 0.5 + stretch * 0.4;
    const bulbRX = w * 0.46 * (1 + 0.30 * squish + 0.10 * stretch);
    const bulbRY = Math.max(2.2, 4.7 * (1 - 0.30 * squish + 0.16 * stretch));
    const bulgeY = bulbTopY + bulbRY;
    ctx.save();
    const bulbGrad = ctx.createLinearGradient(hx - bulbRX, bulbTopY, hx + bulbRX, neckY);
    bulbGrad.addColorStop(0, '#ff9298');
    bulbGrad.addColorStop(0.5, '#d23a46');
    bulbGrad.addColorStop(1, '#8e1f2a');
    ctx.fillStyle = bulbGrad;
    ctx.beginPath();
    ctx.moveTo(hx - bulbRX * 0.38, neckY);
    ctx.bezierCurveTo(hx - bulbRX * 1.12, bulgeY + bulbRY * 0.3, hx - bulbRX * 0.94, bulbTopY, hx, bulbTopY);
    ctx.bezierCurveTo(hx + bulbRX * 0.94, bulbTopY, hx + bulbRX * 1.12, bulgeY + bulbRY * 0.3, hx + bulbRX * 0.38, neckY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,12,18,0.5)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // 高光（左上亮斑，静态）
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath();
    ctx.ellipse(hx - bulbRX * 0.34, bulbTopY + bulbRY * 0.55, bulbRX * 0.26, bulbRY * 0.34, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 胶头下缘棱线（与卡箍衔接）
    ctx.strokeStyle = 'rgba(90,16,22,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx - bulbRX * 0.42, neckY - 1.2);
    ctx.quadraticCurveTo(hx, neckY + 0.4, hx + bulbRX * 0.42, neckY - 1.2);
    ctx.stroke();
    ctx.restore();
    // ---- 2) 黄铜卡箍（胶头/玻璃管交界）----
    const collarY = y + 9.4;
    const collarW = w * 0.62;
    rr(ctx, hx - collarW / 2, collarY, collarW, 2.2, 1);
    const cg = ctx.createLinearGradient(0, collarY, 0, collarY + 2.2);
    cg.addColorStop(0, '#ffe6a8');
    cg.addColorStop(0.5, '#b98a3a');
    cg.addColorStop(1, '#6b4a18');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,8,0.7)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // ---- 3) 玻璃细管（暗紫玻璃 + 左侧高光）+ 管内液体 ----
    const gx = hx - w * 0.15;
    const gw = w * 0.3;
    const gy = y + 10.5;
    const gh = h - 20; // 管长（下接锥形滴嘴）
    const glass = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    glass.addColorStop(0, 'rgba(200,225,255,0.34)');
    glass.addColorStop(0.35, 'rgba(120,110,190,0.14)');
    glass.addColorStop(1, 'rgba(200,225,255,0.26)');
    ctx.fillStyle = glass;
    ctx.fillRect(gx, gy, gw, gh);
    // 管内液体（颜色与溶液取色一致；液面随剩余比例下降；贯穿锥形滴嘴）
    const frac = Math.max(0, Math.min(1, this.liquid / this.capacity));
    const innerY = gy + 1;
    const innerH = gh - 2;
    const lh = innerH * frac;
    if (lh > 0.6) {
      const { color, alpha } = this.liquidColor();
      const bodyTop = innerY + innerH - lh;
      const tipBase = gy + gh;
      ctx.globalAlpha = Math.max(alpha, 0.5);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(gx + 0.6, bodyTop);
      ctx.lineTo(gx + gw - 0.6, bodyTop);
      ctx.lineTo(gx + gw - 0.6, tipBase);
      ctx.lineTo(hx, y + h - 1);
      ctx.lineTo(gx + 0.6, tipBase);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // 液面线
      if (bodyTop >= innerY + 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(gx + 0.8, bodyTop);
        ctx.lineTo(gx + gw - 0.8, bodyTop);
        ctx.stroke();
      }
    }
    // 玻璃管描边（细冷色）+ 左缘高光（静态）
    ctx.strokeStyle = 'rgba(215,235,255,0.85)';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(gx + 0.5, gy, 0.6, gh);
    // ---- 4) 锥形滴嘴（玻璃收尖 + 尖端高光）----
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh);
    ctx.lineTo(hx, y + h);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.closePath();
    ctx.fillStyle = 'rgba(180,205,245,0.20)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(215,235,255,0.72)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // ---- 5) 滴液瞬间：尖端口形成的液珠（压缩后出现，随回弹淡出）----
    if (squish > 0.18 && this.liquid > 1e-9) {
      const { color, alpha } = this.liquidColor();
      const dr = 0.9 + 1.3 * squish;
      ctx.globalAlpha = Math.max(0.25, alpha) * squish;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(hx, y + h + dr * 0.7, dr * 0.72, dr, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(hx - dr * 0.2, y + h + dr * 0.4, dr * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
