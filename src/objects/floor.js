// ============================================================================
// 地板：静态实心体，无化学性质，不可移动。
// 渲染为神殿石砖：纵向石色渐变 + 砖缝 + 顶部亮边（可站立面）。
// ============================================================================

import { Obj } from './obj.js';
import { THEME } from '../render/theme.js';

export class Floor extends Obj {
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
