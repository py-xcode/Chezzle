// ============================================================================
// 火星：金属燃烧（铁/镁/铝/钠/钾等在点燃条件下氧化）迸发的视觉粒子。
// 无碰撞、短寿命：橙金亮点 + 辉光，随机初速上抛后受"重力"回落并闪烁消失。
// 纯视觉（不参与化学/物理解算），由 scene.onSpark 在反应点生成。
// 视觉：白热头部 + 沿速度反方向的三段渐隐拖尾（火星轨迹）+ 少量星芒；
//   闪烁相位由出生位置哈希决定（确定性，可回放）。
// ============================================================================

import { Obj } from './obj.js';

const TAU = Math.PI * 2;

/** 确定性闪烁相位（出生位置哈希；不用随机数） */
function phaseOf(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  return ((x * 37.719 + y * 91.337) % 6.283185307179586 + 6.283185307179586) % 6.283185307179586;
}

export class Spark extends Obj {
  constructor({ x, y, vx = 0, vy = 0, life = 0.8, color = '#ffb340', ...rest } = {}) {
    super({ x, y, w: 3, h: 3, solid: false, physicsKind: 'none', ...rest });
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this._seed = phaseOf(x, y);
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

  render(ctx, opts = {}) {
    const t = 1 - this.life / this.maxLife; // 0..1 老化
    const time = opts?.time ?? 0;
    const blink = 0.6 + 0.4 * Math.sin(this._seed + t * 24 + time * 3);
    const a = Math.max(0, 1 - t) * blink;
    const R = 2.3 * (1 - t * 0.5);
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    // 拖尾方向 = 速度反方向（速度过小时按竖直向上）
    const sp = Math.hypot(this.vx, this.vy);
    const dx = sp > 1 ? -this.vx / sp : 0;
    const dy = sp > 1 ? -this.vy / sp : 1;
    ctx.save();
    // 拖尾：三段由亮到暗渐隐，长度随速度/老化变化
    const len = Math.min(16, 3 + sp * 0.035) * (1 - t * 0.55);
    for (let i = 0; i < 3; i++) {
      const k0 = (i / 3) * len;
      const k1 = ((i + 1) / 3) * len;
      ctx.globalAlpha = a * (0.5 - i * 0.14);
      ctx.strokeStyle = i === 0 ? '#fff3c8' : i === 1 ? this.color : '#ff7a2d';
      ctx.lineWidth = Math.max(0.6, R * (0.9 - i * 0.25));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + dx * k0, cy + dy * k0);
      ctx.lineTo(cx + dx * k1, cy + dy * k1);
      ctx.stroke();
    }
    // 火点头部（老化前段白热，之后回到焰色）
    ctx.globalAlpha = a;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 7;
    ctx.fillStyle = t < 0.2 ? '#fff7d6' : this.color;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    // 大颗火花带一点星芒（十字）
    if (R > 1.4) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,244,205,0.85)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - R * 2.2, cy);
      ctx.lineTo(cx + R * 2.2, cy);
      ctx.moveTo(cx, cy - R * 2.2);
      ctx.lineTo(cx, cy + R * 2.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
