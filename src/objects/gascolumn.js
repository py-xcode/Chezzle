// ============================================================================
// 气泡柱 / 气流：对重叠的动态体施加重力以外的加速度。
//   dir = -1  上升气流（轻气体 H2/O2，把玩家/物块托起）
//   dir = +1  下沉气流（重气体 CO2，把玩家/物块往下压）
//   life > 0 时为临时气流（反应产气产生，到期消失）；0 表示常驻（关卡 ⑦）。
// 视觉（新 Chezzle 语言）：气体色柔光柱（边缘柔化、顶部/底部淡出）+ 内部漂移
//   气团 + 浮尘微光 + 暗紫金边小标签。动画全部确定性 sin 相位，物理口径不变。
// ============================================================================

import { Obj } from './obj.js';
import { overlaps } from '../physics/collision.js';
import { getSubstance } from '../chem/substances.js';
import { luminance, rr } from '../render/theme.js';

const TAU = Math.PI * 2;

export class GasColumn extends Obj {
  constructor({ x, y, w, h, accel = 1300, maxSpeed = 260, dir = -1, life = 0, gasId = null, label = null, source = null, ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.accel = accel;
    this.maxSpeed = maxSpeed;
    this.dir = dir; // -1 上 / +1 下
    this.life = life; // 0 = 常驻
    this.gasId = gasId; // 生成气体的物质 id（反应产气的气流显示气体种类）
    this.label = label; // 显式标签（常驻气流用，如 "气流"）
    this.source = source; // 产气源对象（自身不被自己的气流托起）
  }

  get hoverLabel() {
    return '气流';
  }

  update(dt, scene) {
    if (this.life > 0) {
      this.life -= dt;
      if (this.life <= 0) {
        scene.removeObject(this);
        return;
      }
    }
    for (const obj of scene.dynamics) {
      if (obj === this || obj === this.source || obj.static || obj.noLift) continue; // 产气源/标记 noLift 的不被气流托起
      if (overlaps(this, obj)) {
        obj.vel.y += this.dir * this.accel * dt;
        if (this.dir < 0 && obj.vel.y < -this.maxSpeed) obj.vel.y = -this.maxSpeed;
        if (this.dir > 0 && obj.vel.y > this.maxSpeed) obj.vel.y = this.maxSpeed;
      }
    }
  }

  render(ctx, opts = {}) {
    const t = (opts && opts.time) ?? 0;
    const { x, y, w, h } = this;
    if (!(w > 0 && h > 0)) return;
    ctx.save();
    // 柱体微光（按气体颜色；无气体信息用青色）
    const sub = this.gasId ? getSubstance(this.gasId) : null;
    const tint = sub?.gasColor ?? '#78dcff';
    const { r, g, b } = hexToRgb(tint);
    const rgba = (a) => `rgba(${r},${g},${b},${a})`;
    // 边缘柔化：外层宽而淡 + 内层窄而浓（两层同向渐变叠出"中间实、边缘虚"）
    const fade = (a0, a1) => {
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, rgba(0));
      grad.addColorStop(0.22, rgba(a0));
      grad.addColorStop(0.55, rgba(a1));
      grad.addColorStop(0.82, rgba(a0));
      grad.addColorStop(1, rgba(0));
      return grad;
    };
    ctx.fillStyle = fade(0.05, 0.12);
    ctx.fillRect(x, y, w, h);
    const innerW = w * 0.62;
    ctx.fillStyle = fade(0.06, 0.16);
    ctx.fillRect(x + (w - innerW) / 2, y + h * 0.06, innerW, h * 0.88);
    // 内部漂移气团（2 缕径向柔光；确定性 sin）
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const minSide = Math.min(w, h);
    for (let i = 0; i < 2; i++) {
      const phase = t * (0.35 + i * 0.17) + i * 2.1;
      const px = x + w * (0.5 + 0.24 * Math.sin(phase));
      const py = y + h * (0.35 + 0.3 * Math.sin(phase * 0.8 + i * 1.7));
      const pr = Math.max(6, minSide * (0.24 + i * 0.08));
      const pg = ctx.createRadialGradient(px, py, 1, px, py, pr);
      pg.addColorStop(0, rgba(0.10));
      pg.addColorStop(1, rgba(0));
      ctx.fillStyle = pg;
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    // 浮尘微光：沿气流方向流动的小光点（确定性相位；数量按面积自适应并封顶）
    const n = Math.min(16, Math.max(2, Math.round((w * h) / 1100)));
    for (let i = 0; i < n; i++) {
      const sx = x + ((i * 7919) % 997) / 997 * w; // 固定横向分布
      const span = h + 26;
      const phase = ((t * 40 + i * 53) % span + span) % span;
      const sy = this.dir < 0 ? y + h - phase : y + phase;
      const sway = Math.sin(t * 2.6 + i * 1.9) * Math.min(4, w * 0.08);
      const edge = Math.min(1, Math.min(sy - y, y + h - sy) / 10); // 两端淡出
      ctx.globalAlpha = 0.55 * (0.4 + 0.6 * ((i % 3) / 2)) * edge;
      ctx.fillStyle = i % 2 ? 'rgba(215,245,255,0.85)' : rgba(0.75);
      ctx.shadowColor = rgba(0.9);
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(sx + sway, sy, 1.3 + (i % 3) * 0.55, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // 气体标签：反应产气的气流显示气体种类（NO2 红棕、Cl2 黄绿、H2/CO2 淡青…）
    // 暗紫玻璃小面板 + 细金边（不写额外说明文字）
    const label = this.label ?? this.gasId;
    if (label) {
      const size = 11;
      ctx.font = `bold ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
      const tw = ctx.measureText(label).width;
      const lx = this.x + this.w / 2;
      const ly = this.dir < 0 ? this.y - 4 : this.y + this.h + 14;
      const pad = 5;
      const boxW = tw + pad * 2;
      const boxH = size + 5;
      rr(ctx, lx - boxW / 2, ly - boxH + 2, boxW, boxH, 4);
      const bg = ctx.createLinearGradient(0, ly - boxH + 2, 0, ly + 2);
      bg.addColorStop(0, 'rgba(40,32,80,0.9)');
      bg.addColorStop(1, 'rgba(14,10,36,0.9)');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,184,75,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      const dark = luminance(tint) < 110;
      ctx.fillStyle = dark ? '#eaf6ff' : tint;
      ctx.shadowColor = dark ? 'rgba(255,255,255,0.4)' : tint;
      ctx.shadowBlur = 4;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly - boxH * 0.42 + 1);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
