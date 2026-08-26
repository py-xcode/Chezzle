// ============================================================================
// 通关口：钥匙开启后由关卡接线 open()。玩家靠近且门开 → 通关。
// ============================================================================

import { Obj } from './obj.js';
import { THEME } from '../render/theme.js';

export class Door extends Obj {
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
