// ============================================================================
// 液滴（Drip）：滴管滴液的下坠视觉（带滴管液体颜色；到达液面即消失）。
// 只有视觉反馈——化学由溶液模型处理（落点记录在容器 depositAt）。
// ============================================================================

import { Obj } from './obj.js';

export class Drip extends Obj {
  constructor({ x, y, targetY, color = '#9fd8ff', ...rest }) {
    super({ x, y, w: 4, h: 6, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.targetY = targetY;
    this.color = color;
    this.vy = 0;
    this.life = 2;
  }

  update(dt, scene) {
    this.vy += 900 * dt; // 重力加速下坠
    this.y += this.vy * dt;
    if (this.y >= this.targetY) scene.removeObject(this);
  }

  render(ctx) {
    // 泪滴形（上尖下圆）：上端尖锥收拢、下端圆胖——下坠中的液滴
    const cx = this.x + this.w / 2;
    const top = this.y;
    const bottom = this.y + this.h;
    const r = Math.max(3, this.h * 0.62); // 下部圆球半径
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 7;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(cx, top); // 尖端
    ctx.bezierCurveTo(cx + r * 0.5, top + r * 0.8, cx + r, bottom - r * 0.7, cx, bottom);
    ctx.bezierCurveTo(cx - r, bottom - r * 0.7, cx - r * 0.5, top + r * 0.8, cx, top);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // 下部高光（左上方）
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.28, bottom - r * 0.62, r * 0.2, r * 0.32, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
