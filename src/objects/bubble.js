// ============================================================================
// 气泡：反应产气时的视觉反馈（纯特效，无碰撞）。
//   dir = -1  轻于空气的气体 → 上升气泡柱
//   dir = +1  重于空气的气体 → 下沉气泡柱
// 上升/下沉过程中被实心静态体（地板/顶板）阻断时立即消失。
// ============================================================================

import { Obj } from './obj.js';

export class Bubble extends Obj {
  constructor({ x, y, dir = -1, speed = 80, ...rest } = {}) {
    super({ x, y, w: 6, h: 6, solid: false, physicsKind: 'none', ...rest });
    this.dir = dir;
    this.speed = speed;
    this.life = 2.0;
  }

  update(dt, scene) {
    this.y += this.dir * this.speed * dt; // dir=-1 上升，dir=+1 下沉
    this.x += Math.sin(scene.time * 6 + this.y * 0.1) * 0.3; // 轻微晃动
    // 被地板阻断：与任意实心静态体重叠即消失
    for (const s of scene.statics) {
      if (!s.solid) continue;
      if (s.x < this.x + this.w && s.x + s.w > this.x && s.y < this.y + this.h && s.y + s.h > this.y) {
        scene.removeObject(this);
        return;
      }
    }
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  render(ctx) {
    const a = Math.max(0, Math.min(1, this.life * 0.7));
    const x = this.x + this.w / 2;
    const y = this.y + this.h / 2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(150,225,255,0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(205,238,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, this.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(x - this.w * 0.2, y - this.h * 0.2, this.w * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
