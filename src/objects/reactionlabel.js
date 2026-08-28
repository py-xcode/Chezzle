// ============================================================================
// 反应标签（调试模式）：在反应发生的位置飘出"反应式"，缓慢上浮后淡出。
// 调试模式下 scene.onReaction 在反应点生成。
// ============================================================================

import { Obj } from './obj.js';

export class ReactionLabel extends Obj {
  constructor({ x, y, text, color = '#9fd8ff' }) {
    super({ x, y, w: 0, h: 0, solid: false, physicsKind: 'none' });
    this.text = text;
    this.color = color;
    this.age = 0;
    this.life = 1.8; // 秒
  }

  update(dt, scene) {
    this.age += dt;
    this.y -= 20 * dt; // 缓慢上浮
    if (this.age >= this.life) scene.removeObject(this);
  }

  render(ctx, scene) {
    const a = Math.max(0, 1 - this.age / this.life);
    ctx.save();
    ctx.globalAlpha = a;
    // 字号按"屏幕实际像素"保证（低分辨率手机上世界字号被相机缩小后糊）
    let size = 11;
    try {
      const m = ctx.getTransform ? ctx.getTransform() : null;
      const s = m ? Math.hypot(m.a, m.b) : 1;
      if (s > 0.01) size = Math.max(11, Math.min(24, Math.round(12 / s)));
    } catch (e) { /* 老浏览器：基准字号 */ }
    ctx.font = `bold ${size}px "Segoe UI", "Microsoft YaHei", monospace`;
    const w = ctx.measureText(this.text).width;
    // 深色圆角底（保证在任意背景可读）
    ctx.fillStyle = 'rgba(6,14,28,0.72)';
    ctx.beginPath();
    ctx.roundRect(this.x - w / 2 - 6, this.y - size, w + 12, size + 6, 5);
    ctx.fill();
    // 反应式文本
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, this.x, this.y - size / 2 + 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}
