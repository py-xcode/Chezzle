// ============================================================================
// 气泡柱 / 气流：对重叠的动态体施加重力以外的加速度。
//   dir = -1  上升气流（轻气体 H2/O2，把玩家/物块托起）
//   dir = +1  下沉气流（重气体 CO2，把玩家/物块往下压）
//   life > 0 时为临时气流（反应产气产生，到期消失）；0 表示常驻（关卡 ⑦）。
// ============================================================================

import { Obj } from './obj.js';
import { overlaps } from '../physics/collision.js';
import { getSubstance } from '../chem/substances.js';
import { luminance } from '../render/theme.js';

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

  render(ctx, scene) {
    const t = scene.time ?? 0;
    ctx.save();
    // 柱体微光（按气体颜色；无气体信息用青色）
    const sub = this.gasId ? getSubstance(this.gasId) : null;
    const tint = sub?.gasColor ?? '#78dcff';
    const { r, g, b } = hexToRgb(tint);
    const grad = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.12)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    // 气流发光粒子（方向按 dir：上浮或下沉）
    const n = Math.min(30, Math.max(1, Math.round((this.w * this.h) / 600)));
    for (let i = 0; i < n; i++) {
      const bx = this.x + ((i * 7919) % 997) / 997 * this.w;
      const phase = (t * 40 + i * 53) % (this.h + 30);
      const by = this.dir < 0 ? this.y + this.h - phase : this.y + phase;
      ctx.fillStyle = 'rgba(205,242,255,0.6)';
      ctx.shadowColor = 'rgba(120,220,255,0.9)';
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 气体标签：反应产气的气流显示气体种类（NO2 红棕、Cl2 黄绿、H2/CO2 淡青…）
    const label = this.label ?? this.gasId;
    if (label) {
      ctx.font = 'bold 11px "Segoe UI", "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(label).width;
      const lx = this.x + this.w / 2;
      const ly = this.dir < 0 ? this.y - 6 : this.y + this.h + 16;
      const pad = 4;
      ctx.fillStyle = 'rgba(8,18,32,0.72)';
      ctx.beginPath();
      ctx.roundRect(lx - tw / 2 - pad, ly - 12, tw + pad * 2, 15, 4);
      ctx.fill();
      const dark = luminance(tint) < 110;
      ctx.fillStyle = dark ? '#eaf6ff' : tint;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly - 4);
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
