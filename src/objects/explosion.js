// ============================================================================
// 爆炸视觉：多层火球（白核→橙→暗红）+ 双层冲击环 + 径向拖尾火星 + 上升烟尘。
// 半径/亮度均按 ease-out 曲线推进（瞬间炸开、缓慢消散），0.5s 后自动移除。
// 物理冲击（炸飞/碎裂）由 Scene.explode 处理；本对象只负责视觉反馈。
// ============================================================================

import { Obj } from './obj.js';

export class Explosion extends Obj {
  constructor({ x, y, strength = 10, cause = null, flip = false }) {
    super({ x, y, w: 0, h: 0, solid: false, physicsKind: 'none', noLift: true });
    this.strength = strength;
    this.cause = cause; // 爆炸原因文本（调试：爆炸发生时显示）
    this.flip = flip;   // 多样化的相位（同一物体连续爆炸时角度/形状不雷同）
    this.age = 0;
    this.life = 0.5;
  }

  update(dt, scene) {
    this.age += dt;
    if (this.age >= this.life) scene.removeObject(this);
  }

  render(ctx, scene) {
    const t = Math.min(1, this.age / this.life); // 0..1
    // ease-out：瞬间炸开（前 30% 完成 70% 半径），之后缓慢收尾
    const e = 1 - Math.pow(1 - Math.min(1, t / 0.45), 2.2);
    const R = (16 + this.strength * 2.4) * (0.25 + 0.75 * e);
    const alpha = Math.max(0, 1 - t);
    const seed = this.flip ? 1.7 : 0;
    ctx.save();
    // ---- 主体火球：多层径向渐变（白核 → 橙 → 暗红 → 透明），带轻微火焰抖动 ----
    const wob = 1 + 0.06 * Math.sin((t * 14 + seed * 9) * 3); // 边界轻微波动，不死板
    const layers = [
      [2.2, 'rgba(255,255,245,ALPHA)', 0.95], // 白核
      [0.62, 'rgba(255,190,90,ALPHA)', 0.75],
      [0.34, 'rgba(255,110,30,ALPHA)', 0.5],
    ];
    for (const [rr, col, strength] of layers) {
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, Math.max(2, R * rr * wob));
      g.addColorStop(0, col.replace('ALPHA', (alpha * strength).toFixed(3)));
      g.addColorStop(1, col.replace('ALPHA', '0'));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(2, R * rr * wob), 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 双层冲击环：白色细环（快）+ 橙色宽环（慢），r 间推开 ----
    ctx.lineCap = 'round';
    const rings = [
      { r0: 0.55, r1: 1.18, w: (1 - t) * 4 + 0.8, color: 'rgba(255,233,190,ALPHA)' },
      { r0: 0.25, r1: 0.85, w: (1 - t) * 2.4 + 0.6, color: 'rgba(255,150,60,ALPHA)' },
    ];
    for (let i = 0; i < rings.length; i++) {
      const rg = rings[i];
      const rr = R * (rg.r1 + (rg.r0 - rg.r1) * e);
      ctx.globalAlpha = alpha * (0.9 - i * 0.25);
      ctx.strokeStyle = rg.color.replace('ALPHA', '1');
      ctx.lineWidth = rg.w;
      ctx.shadowColor = 'rgba(255,140,60,0.8)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(1, rr), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // ---- 径向拖尾火星（线段：从内到外，随 t 拉长变暗） ----
    const n = 14;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + seed * 2 + t * 1.1;
      const d0 = R * (0.25 + t * 0.8);
      const d1 = R * (0.35 + t * 1.5);
      const dark = Math.max(0, alpha * (1 - t * 0.8));
      ctx.globalAlpha = dark;
      ctx.strokeStyle = i % 2 ? 'rgba(255,216,160,1)' : 'rgba(255,120,40,1)';
      ctx.lineWidth = 2.2 - t * 1.4;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(ang) * d0, this.y + Math.sin(ang) * d0);
      ctx.lineTo(this.x + Math.cos(ang) * d1, this.y + Math.sin(ang) * d1);
      ctx.stroke();
      // 火星头
      ctx.fillStyle = i % 2 ? '#ffe9c0' : '#ff8c3d';
      ctx.beginPath();
      ctx.arc(this.x + Math.cos(ang) * d1, this.y + Math.sin(ang) * d1, 2.4 - t, 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 上升烟尘（几团灰点，慢慢上飘淡出） ----
    for (let i = 0; i < 4; i++) {
      const py = this.y - (6 + i * 9) * (0.3 + t * 0.9);
      const px = this.x + Math.sin(seed * 5 + i * 2.1 + t * 2) * (R * 0.5 + i * 3);
      ctx.globalAlpha = alpha * 0.28 * (1 - t * 0.6);
      ctx.fillStyle = '#5a5f70';
      ctx.beginPath();
      ctx.arc(px, py, 3 + t * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 爆炸原因文本（调试）：炸点上方弹出，逐帧上浮淡出 ----
    if (this.cause && this.age < 0.32) {
      ctx.globalAlpha = Math.min(1, (0.32 - this.age) * 4);
      ctx.font = 'bold 12px "Segoe UI", "Microsoft YaHei", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,14,26,0.72)';
      const ty = this.y - R * 0.9 - 10;
      const tw = ctx.measureText(this.cause).width;
      ctx.beginPath();
      ctx.roundRect(this.x - tw / 2 - 6, ty - 14, tw + 12, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(this.cause, this.x, ty - 1);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }
}
