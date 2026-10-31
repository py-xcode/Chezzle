// ============================================================================
// 地板：静态实心体，无化学性质，不可移动。
// 渲染为神殿石砖：深紫石材/黑曜石砖（纵向明暗渐变 + 简洁砖缝 + 顶部受光亮边 +
//   底部阴影）。整体回归"干净的地板"——无金缝/雕纹/闪点等装饰。
// 冰面（ice:true）：冷青渐变 + 简单霜面反光——物理上极滑
//   （冰摩擦 + 沉淀滑走，见 CollisionSystem/Player 的 ice 分支）。
// trim：池壁等"安装在池沿的石/钢壁"（'left'|'right'|'bottom'）——
//   视觉专用（不影响物理/碰撞/几何），深色石/钢壁 + 简洁内缘高光/底部阴影。
// ============================================================================

import { Obj } from './obj.js';

const STONE_BASE = '#262143'; // 深紫石材（暗紫基调）
const TILE = 34; // 砖格尺寸（px，世界坐标对齐 → 镜头移动时纹理不漂）

export class Floor extends Obj {
  get hoverLabel() {
    return this.ice ? '冰面(滑)' : '地板';
  }
  constructor({ x, y, w, h, color = null, ice = false, trim = null, ...rest } = {}) {
    super({ x, y, w, h, solid: true, static: true, physicsKind: 'static', ...rest });
    // 地板/墙是背景层：永远先画，导气管等装置才能压在地板上面（见 renderer 的 layer 排序）
    if (!Number.isFinite(rest.layer)) this.layer = -10;
    this.color = color;
    this.ice = !!ice;
    this.trim = trim; // 视觉：'left'|'right'|'bottom'（池壁用）；null = 普通地板
  }

  render(ctx) {
    const { x, y, w, h } = this;
    if (w <= 0 || h <= 0) return;
    if (this.ice) {
      this._renderIce(ctx, x, y, w, h);
      return;
    }
    if (this.trim) {
      this._renderWall(ctx, x, y, w, h);
      return;
    }
    this._renderStone(ctx, x, y, w, h);
  }

  /** 深紫石材/黑曜石砖：明暗渐变 + 简洁砖缝 + 顶部亮边 + 底部阴影 */
  _renderStone(ctx, x, y, w, h) {
    const base = this.color || STONE_BASE;
    ctx.save();
    // 基础石色渐变（顶受光 → 底沉暗）
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, mixHex(base, '#b9b2e6', 0.13));
    g.addColorStop(0.45, base);
    g.addColorStop(1, mixHex(base, '#05040f', 0.48));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // 简洁砖缝（暗色，世界坐标对齐）
    const startX = Math.floor(x / TILE) * TILE;
    const startY = Math.floor(y / TILE) * TILE;
    ctx.strokeStyle = 'rgba(6,5,18,0.45)';
    ctx.lineWidth = 1;
    for (let tx = startX; tx <= x + w; tx += TILE) {
      const px = tx + 0.5;
      if (px <= x - 1 || px >= x + w + 1) continue;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + h);
      ctx.stroke();
    }
    for (let ty = startY; ty <= y + h; ty += TILE) {
      const py = ty + 0.5;
      if (py <= y - 1 || py >= y + h + 1) continue;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x + w, py);
      ctx.stroke();
    }
    // 顶部受光亮边（可站立面）
    ctx.fillStyle = 'rgba(226,220,255,0.18)';
    ctx.fillRect(x, y, w, 2.5);
    // 底部暗影
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, y + h - 3, w, 3);
    ctx.restore();
  }

  /** 池壁（trim）：深色石/钢壁（纵向明暗渐变）+ 简洁内缘高光/底部阴影 */
  _renderWall(ctx, x, y, w, h) {
    const base = this.color || '#332d52';
    ctx.save();
    // 壁身：纵向石/钢渐变（顶受光→底沉暗，凹槽内壁感）
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, mixHex(base, '#8f87c4', 0.14));
    g.addColorStop(0.5, base);
    g.addColorStop(1, mixHex(base, '#04030c', 0.42));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // 外轮廓（暗）
    ctx.strokeStyle = 'rgba(6,5,18,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // 面向池内的简洁受光细线
    ctx.fillStyle = 'rgba(226,232,244,0.14)';
    if (this.trim === 'left') ctx.fillRect(x + w - 1.5, y, 1.5, h);
    else if (this.trim === 'right') ctx.fillRect(x, y, 1.5, h);
    else ctx.fillRect(x, y + 1, w, 1.5);
    // 底部阴影
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(x, y + h - Math.min(3, h * 0.3), w, Math.min(3, h * 0.3));
    ctx.restore();
  }

  /** 冰面：冷青渐变 + 简单霜面反光 + 顶部霜光 + 底部深影 */
  _renderIce(ctx, x, y, w, h) {
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#cdeeff');
    g.addColorStop(0.42, '#93c8ea');
    g.addColorStop(1, '#2a5480');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // 简单霜面斜向反光（静态、克制）
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.12, y);
    ctx.lineTo(x + w * 0.3, y);
    ctx.lineTo(x + w * 0.05, y + h);
    ctx.lineTo(x - w * 0.05, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 顶部霜光（站立面）
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x, y, w, 2.5);
    // 底部渐深影
    ctx.fillStyle = 'rgba(12,42,84,0.40)';
    ctx.fillRect(x, y + h - 3, w, 3);
    ctx.restore();
  }
}

/** 十六进制色混色（t=0→a，t=1→b），Floor 内部共用 */
function mixHex(a, b, t) {
  const ca = parseInt(String(a).slice(1), 16);
  const cb = parseInt(String(b).slice(1), 16);
  const r = Math.round(((ca >> 16) & 255) * (1 - t) + ((cb >> 16) & 255) * t);
  const g = Math.round(((ca >> 8) & 255) * (1 - t) + ((cb >> 8) & 255) * t);
  const bl = Math.round((ca & 255) * (1 - t) + (cb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}
