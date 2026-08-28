// ============================================================================
// 酒精喷灯：酒精灯子类，提供"高温"（且隐式满足"加热"）与点燃源。
// 造型（卡通化挂式酒精喷灯）：黄铜底座罐 → 预热盘 → 中央喷管（火焰出口）→
// 侧立汽化管 + 银管与黑色旋钮；点燃时从喷管口冒出狭长高温蓝焰。
// 风格与游戏一致的"玩具感"：统一深色描边 + 平涂渐变 + 一两笔高光，舍去写实细节
// （滚花/多道高光/支架等）。宽炉条款（h<20）沿用老样式。
// ============================================================================

import { Lamp } from './lamp.js';
import { rr } from '../render/theme.js';

export class BlastLamp extends Lamp {
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
    this.renderContentsLabel(ctx, opts);
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
