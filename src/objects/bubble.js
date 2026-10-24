// ============================================================================
// 气泡：反应产气时的视觉反馈（纯特效，无碰撞）。
//   dir = -1  轻于空气的气体 → 上升气泡柱
//   dir = +1  重于空气的气体 → 下沉气泡柱
// 上升/下沉过程中被实心静态体（地板/顶板）阻断时立即消失。
// 视觉：玻璃质感小泡——半透明淡青球体 + 亮外环 + 左上高光 + 底部反光；
//   渲染层轻微摇摆/呼吸（确定性 sin，仅视觉；物理位置口径不变）。
// ============================================================================

import { Obj } from './obj.js';

const TAU = Math.PI * 2;

/** 确定性相位（由出生位置决定；同一位置的气泡摆动相位一致，可回放） */
function phaseOf(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  return ((x * 12.9898 + y * 78.233) % 6.283185307179586 + 6.283185307179586) % 6.283185307179586;
}

export class Bubble extends Obj {
  constructor({ x, y, dir = -1, speed = 80, ...rest } = {}) {
    super({ x, y, w: 6, h: 6, solid: false, physicsKind: 'none', ...rest });
    this.dir = dir;
    this.speed = speed;
    this.life = 2.0;
    this._seed = phaseOf(x, y);
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

  render(ctx, opts = {}) {
    const time = opts?.time ?? 0;
    const a = Math.max(0, Math.min(1, this.life * 0.7));
    const px = this.x + this.w / 2 + Math.sin(time * 3.4 + this._seed) * 0.6; // 渲染层轻摆
    const py = this.y + this.h / 2;
    const r = (this.w / 2) * (1 + 0.07 * Math.sin(time * 4.6 + this._seed));
    ctx.save();
    ctx.globalAlpha = a;
    // 玻璃球体：极淡的淡青填充（能看到下层的液体/背景）
    ctx.fillStyle = 'rgba(150,220,255,0.14)';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();
    // 外环亮边（玻璃壁）
    ctx.strokeStyle = 'rgba(196,238,255,0.78)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.stroke();
    // 底部内侧反光弧（泡壁的厚度感）
    ctx.strokeStyle = 'rgba(130,205,250,0.42)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.74, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    // 左上高光（主亮斑 + 次亮斑）
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.arc(px - r * 0.34, py - r * 0.36, Math.max(0.7, r * 0.26), 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.arc(px + r * 0.26, py + r * 0.4, Math.max(0.5, r * 0.14), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
