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

import { Obj } from './obj.js';
import { getSubstance } from '../chem/substances.js';
import { CFG } from '../core/config.js';
import { shallowestSupportY, settleBodyOnSupport } from '../physics/support.js';

export const BOTTLE_W = 30;
export const BOTTLE_H = 56;

const WALL = 4; // 瓶壁厚（px）
const LID_H = 4; // 盖板厚（px）
const LID_LIFT = 2.5; // 装气时盖板被顶起的最大高度（px）
const NECK_H = 10; // 瓶口/瓶颈区高度（px）：无侧壁，只有透明瓶颈

let SEQ_N = 0; // 无 id 集气瓶的子体命名序号（防 byId 键冲突）

export class GasBottle extends Obj {
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
    const sup = shallowestSupportY(this, scene);
    this._supportBody = sup.body ?? null; // 最近支撑的动态体（头戴携带判定用）
    settleBodyOnSupport(this, dt, sup.y);
  }

  update(dt, scene) {
    this.applyGravity(dt, scene);
    // 头戴携带：瓶坐在玩家头顶 → 壁体与该玩家不再碰撞（防一跳被顶住→抖动）
    const onHead = this._supportBody === scene.player;
    for (const w of this.subBodies) w.noCollidePlayer = !!onHead;
    // 玩家贴壁推动已挪到 Player.update（pushContainers——时序要求：玩家重设 vel 之后、
    // 物理步之前：吸附+清 vel，否则推-弹交替"一卡一卡"——用户反馈）
    // 动画计时衰减（盖板回落、辉光消退）
    if (this._lidLift > 0) this._lidLift = Math.max(0, this._lidLift - dt * 2.6);
    if (this._fillPulse > 0) this._fillPulse = Math.max(0, this._fillPulse - dt * 1.8);
  }

  /** 物理结算后：壁体贴回瓶身当前位置（爆炸推散等下一帧即复位）；
   *  头戴携带（瓶坐在玩家头顶）→ 帽子式跟随玩家的位移（不倒推玩家：防火箭跳/抖动） */
  lateUpdate(dt, scene) {
    const p = scene.player;
    if (p && this._supportBody === p) {
      const dx = p.x - (this._headPX ?? p.x);
      const dy = p.y - (this._headPY ?? p.y);
      if (Math.abs(dx) > 0.01) this.x += dx;
      if (Math.abs(dy) > 0.01) this.y += dy;
      this._headPX = p.x;
      this._headPY = p.y;
    }
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
