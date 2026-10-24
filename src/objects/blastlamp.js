// ============================================================================
// 酒精喷灯：酒精灯子类，提供"高温"（且隐式满足"加热"）与点燃源。
// 造型：深钢炉体（黄铜包边/通风孔/铆钉/小压力表）→ 黄铜预热盘 → 中央喷管
// （火焰出口）→ 侧立汽化管 + 黄铜管路与钢制阀门；点燃时从喷管口冒出狭长
// 高温蓝焰（白热内芯）并给炉体/通风孔透出蓝白热光，熄灭渐弱。
// 风格与游戏一致：深紫/金 + 黄铜/深钢金属 + 元素色霓虹；统一深色描边，
// 动画全部为确定性 sin/指数缓动。宽炉条款（h<20）沿用酒精灯的炉条样式。
// ============================================================================

import { Lamp } from './lamp.js';
import { THEME, rr } from '../render/theme.js';

export class BlastLamp extends Lamp {
  constructor({ highTemp = true, color = '#8fd8ff', ...rest } = {}) {
    super({ highTemp, ...rest });
    this.color = color;
  }

  get hoverLabel() {
    return '喷灯';
  }

  // ---------------------------------------------------------------------------
  // 渲染（简洁版）：深钢炉体（黄铜上下细线）+ 预热盘 + 中央喷管 + 侧立汽化管 + 喷焰。
  //   喷焰仍用 drawJet，点燃渐强 / 熄灭渐弱保留；无压力表/通风孔/阀门管线等装饰。
  // ---------------------------------------------------------------------------
  render(ctx, opts) {
    const t = opts?.time ?? 0;
    const bx = this.x + this.w / 2;
    const fy = this.flameY();
    if (this.h < 20) {
      // 宽炉条款（解谜关卡的整排炉条）：沿用酒精灯样式（蓝色喷焰由 highTemp 决定）
      super.render(ctx, opts);
      return;
    }
    const x = this.x;
    const y = this.y;
    const w = this.w;
    const h = this.h;
    const baseTop = y + h - 18; // 炉体顶
    const fl = this.flameLevel;
    const hot = this.highTemp;
    const flameColor = hot ? '#4fb6ff' : '#ff9a3d';
    ctx.save();
    // ---- 1) 炉体（深钢罐 + 上下黄铜细线）----
    rr(ctx, x + 2, baseTop, w - 4, y + h - baseTop - 1, 4);
    const bg = ctx.createLinearGradient(x, baseTop, x, y + h);
    bg.addColorStop(0, '#4a4f70');
    bg.addColorStop(1, '#1b2038');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,6,22,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = THEME.gold.deep;
    ctx.lineWidth = 1;
    for (const ly of [baseTop + 1.4, y + h - 2.2]) {
      ctx.beginPath();
      ctx.moveTo(x + 4, ly);
      ctx.lineTo(x + w - 4, ly);
      ctx.stroke();
    }
    // ---- 2) 预热盘（炉体顶上的黄铜小碟）----
    const dishRX = Math.max(5, w * 0.32);
    ctx.beginPath();
    ctx.ellipse(bx, baseTop - 1, dishRX, 3.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#a9782a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,8,0.8)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = '#3a2c10';
    ctx.beginPath();
    ctx.ellipse(bx, baseTop - 1.4, dishRX * 0.5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // ---- 3) 中央喷管（黄铜管，上窄下宽）+ 暗喷口 ----
    const cw = Math.max(6, Math.min(11, w * 0.26));
    const cg = ctx.createLinearGradient(bx - cw / 2, 0, bx + cw / 2, 0);
    cg.addColorStop(0, '#6b4a18');
    cg.addColorStop(0.35, '#c9932f');
    cg.addColorStop(0.62, '#9a7028');
    cg.addColorStop(1, '#4a3410');
    ctx.beginPath();
    ctx.moveTo(bx - cw * 0.34, fy);
    ctx.lineTo(bx - cw * 0.5, baseTop - 1);
    ctx.lineTo(bx + cw * 0.5, baseTop - 1);
    ctx.lineTo(bx + cw * 0.34, fy);
    ctx.closePath();
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = '#2a1c08';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 喷口（暗口 + 点燃时口沿亮色）
    ctx.beginPath();
    ctx.ellipse(bx, fy + 0.6, cw * 0.4, 1.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#171208';
    ctx.fill();
    ctx.strokeStyle = fl > 0.03 ? (hot ? '#9fe6ff' : '#ffb340') : 'rgba(255,235,170,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(bx, fy + 0.4, cw * 0.44, 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    // ---- 4) 侧立汽化管（右侧黄铜管 + 顶盖，简单一根）----
    const tw = Math.max(5, Math.min(7, w * 0.18));
    const tX = bx + cw * 0.5 + 0.5;
    const tg = ctx.createLinearGradient(tX, 0, tX + tw, 0);
    tg.addColorStop(0, '#6b4a18');
    tg.addColorStop(0.42, '#c9932f');
    tg.addColorStop(1, '#4a3410');
    rr(ctx, tX, fy - 5, tw, baseTop - 1 - (fy - 5), Math.max(1.6, tw * 0.28));
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = '#2a1c08';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 管顶暗口 + 黄铜盖环
    ctx.fillStyle = '#221a0a';
    ctx.beginPath();
    ctx.ellipse(tX + tw / 2, fy - 4.6, tw / 2 - 0.8, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = THEME.gold.deep;
    ctx.fillRect(tX - 1, fy - 3.4, tw + 2, 1.6);
    ctx.restore();
    // ---- 5) 喷焰（drawJet；点燃渐强 / 熄灭渐弱 + 轻微摆动）----
    if (fl > 0.01) {
      const fc = this.flameTintCur ?? flameColor;
      const inner = this.flameTintCur ? lightenHex(fc, 0.6) : (hot ? '#eaf8ff' : '#fff3c4');
      const grow = 0.25 + 0.75 * fl;
      const sway = Math.sin(t * 9.5) * 0.5;
      ctx.save();
      ctx.globalAlpha = fl;
      ctx.translate(sway * grow, 0);
      drawJet(ctx, bx, fy + 2.5, (19 + Math.sin(t * 14) * 1.8) * grow, fc, inner, t);
      ctx.restore();
    }
    // 焰色反应：火焰区域铺一层特征色柔光（与酒精灯一致，保留玩法视觉）
    if (this.flameTintCur && fl > 0.01) {
      ctx.save();
      const g2 = ctx.createRadialGradient(bx, fy, 4, bx, fy, 56);
      g2.addColorStop(0, hexRgba(this.flameTintCur, 0.34 * fl));
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
  // 火星（确定性相位，少量）
  for (let i = 0; i < 2; i++) {
    const ph = (t * 1.6 + i * 0.43) % 1;
    ctx.globalAlpha = 0.5 * (1 - ph);
    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 9 + i * 2.7) * w * 0.3, y - h * (0.6 + ph * 0.5), 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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
