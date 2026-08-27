// ============================================================================
// 集气瓶（GasBottle）：可收集气体的玻璃瓶。
// ----------------------------------------------------------------------------
// - 无碰撞箱（与滴管一样"放在哪就停在哪"，玩家可穿过）；
// - 容量默认 5g：按住 C（背包含集气瓶）时，把最近气泡柱产生的气体直接截留进瓶
//   （气体不再进大气）；按住 X 向最近液体容器通入气体（0.05g/s）；
// - 收集/倒出/放置与烧杯、滴管同一套"可携带物品"流程（C 拾取 / Shift 放置）。
// ============================================================================

import { Obj } from './obj.js';
import { getSubstance } from '../chem/substances.js';
import { CFG } from '../core/config.js';

export const BOTTLE_W = 30;
export const BOTTLE_H = 56;

export class GasBottle extends Obj {
  constructor({ x, y, capacity = CFG.item.bottleCapacity, gases = null, ...rest } = {}) {
    super({
      x, y, w: BOTTLE_W, h: BOTTLE_H,
      solid: false, physicsKind: 'none', noLift: true,
      ...rest,
    });
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

  /** 装入气体（容量封顶），返回实际装入量 */
  addGas(id, mass) {
    if (!(mass > 0)) return 0;
    const room = this.capacity - this.totalGas();
    if (room <= 1e-9) return 0;
    const take = Math.min(room, mass);
    this.gases.set(id, (this.gases.get(id) ?? 0) + take);
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
    // 瓶颈 + 瓶口（宽口：气体收集瓶开口朝上，便于倒扣收集）
    ctx.strokeStyle = 'rgba(225,245,255,0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + 5, bodyY);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x + w - 7, y);
    ctx.lineTo(x + w - 5, bodyY);
    ctx.stroke();
    // 气体填充（从瓶底往上按比例；气体本身透明，颜色显示"装了哪种气"）
    if (frac > 0.01) {
      const fh = (bodyH - 4) * frac;
      const fy = bodyY + bodyH - 2 - fh;
      const hexToRgb = (hex) => {
        const h = hex.replace('#', '');
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
      };
      const { r, g, b } = hexToRgb(color);
      ctx.globalAlpha = 0.4 + 0.25 * frac;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(x + 2, fy, w - 4, fh, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
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
