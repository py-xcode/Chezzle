// ============================================================================
// 液滴（Drip）：滴管滴液的下坠视觉（带滴管液体颜色；到达液面即消失）。
// 只有视觉反馈——化学由溶液模型处理（落点记录在容器 depositAt）。
// ============================================================================

import { Obj } from './obj.js';
import { renderPrecipitateBall } from './particle.js';

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
    // 液滴形：小圆球 + 顶部细小（简单：上小下大的两椭圆）
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    renderPrecipitateBall(ctx, cx, cy, Math.max(7, this.h + this.w), this.color);
  }
}
