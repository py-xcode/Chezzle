// ============================================================================
// 火星：金属燃烧（铁/镁/铝/钠/钾等在点燃条件下氧化）迸发的视觉粒子。
// 无碰撞、短寿命：橙金亮点 + 辉光，随机初速上抛后受"重力"回落并闪烁消失。
// 纯视觉（不参与化学/物理解算），由 scene.onSpark 在反应点生成。
// ============================================================================

import { Obj } from './obj.js';

export class Spark extends Obj {
  constructor({ x, y, vx = 0, vy = 0, life = 0.8, color = '#ffb340', ...rest } = {}) {
    super({ x, y, w: 3, h: 3, solid: false, physicsKind: 'none', ...rest });
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this._seed = Math.random() * 10;
  }

  get hoverLabel() {
    return null;
  }

  update(dt, scene) {
    this.life -= dt;
    if (this.life <= 0) {
      scene.removeObject(this);
      return;
    }
    // 火星：先上抛后回落 + 水平随机漂移（粒子上抛初速贯穿全场——"火星四射"）
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 900 * dt; // 轻"重力"让火花从最高点划落
    this.vx *= 1 - 2.5 * dt;
  }

  render(ctx) {
    const t = 1 - this.life / this.maxLife; // 0..1 老化
    const blink = 0.55 + 0.45 * Math.sin((this._seed + t * 24) * 3);
    const a = Math.max(0, 1 - t) * blink;
    const R = 2.2 * (1 - t * 0.5);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 7;
    ctx.fillStyle = t < 0.2 ? '#fff3c8' : this.color;
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y + this.h / 2, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
