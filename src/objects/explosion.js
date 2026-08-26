// ============================================================================
// 爆炸视觉：径向冲击波环 + 中心闪光 + 火星粒子，0.45s 后自动移除。
// 物理冲击（炸飞/碎裂）由 Scene.explode 处理；本对象只负责视觉反馈。
// ============================================================================

import { Obj } from './obj.js';

export class Explosion extends Obj {
  constructor({ x, y, strength = 10, cause = null }) {
    super({ x, y, w: 0, h: 0, solid: false, physicsKind: 'none' });
    this.strength = strength;
    this.cause = cause; // 爆炸原因文本（调试：爆炸发生时显示）
    this.age = 0;
    this.life = 0.45;
  }

  update(dt, scene) {
    this.age += dt;
    if (this.age >= this.life) scene.removeObject(this);
  }

  render(ctx, scene) {
    const t = Math.min(1, this.age / this.life); // 0..1
    const R = 18 + this.strength * 2.2 * (0.35 + 0.65 * t);
    const alpha = (1 - t) * 0.9;
    ctx.save();
    // 中心闪光（径向渐变）
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, R * 0.7);
    g.addColorStop(0, `rgba(255,255,240,${alpha})`);
    g.addColorStop(0.5, `rgba(255,170,60,${alpha * 0.7})`);
    g.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.shadowColor = '#ff8c3d';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(this.x, this.y, R * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 冲击波环
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffd9a0';
    ctx.lineWidth = 1 + 3 * (1 - t);
    ctx.shadowColor = '#ff8c3d';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(this.x, this.y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 火星粒子（径向飞出）
    const n = 10;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + t * 2.4;
      const d = R * (0.4 + t * 1.3);
      ctx.globalAlpha = alpha * (1 - t * 0.75);
      ctx.fillStyle = i % 2 ? '#ffd9a0' : '#ff8c3d';
      ctx.beginPath();
      ctx.arc(this.x + Math.cos(ang) * d, this.y + Math.sin(ang) * d, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // 爆炸原因文本（调试）：炸点上方弹出，逐帧上浮淡出
    if (this.cause && this.age < 0.3) {
      ctx.globalAlpha = Math.min(1, (0.3 - this.age) * 4);
      ctx.font = 'bold 12px "Segoe UI", "Microsoft YaHei", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,14,26,0.72)';
      const ty = this.y - R * 0.7 - 8;
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
