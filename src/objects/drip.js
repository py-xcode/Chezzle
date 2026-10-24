// ============================================================================
// 液滴（Drip）：滴管滴液的下坠视觉（带滴管液体颜色；到达液面即消失）。
// 只有视觉反馈——化学由溶液模型处理（落点记录在容器 depositAt）。
// 视觉：玻璃质感的泪滴——上尖下圆、液体色半透明主体 + 内部高光 + 底部反光，
//   下坠时上端拖一条渐隐细尾（速度越快越长）。纯视觉，不参与物理。
// ============================================================================

import { Obj } from './obj.js';

const TAU = Math.PI * 2;

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
    // 下坠尾迹（速度越快越长；渐隐的液丝）
    const tail = Math.min(14, 2 + this.vy * 0.018);
    if (tail > 3) {
      const tg = ctx.createLinearGradient(cx, top - tail, cx, top + r * 0.6);
      tg.addColorStop(0, withAlpha(this.color, 0));
      tg.addColorStop(1, withAlpha(this.color, 0.32));
      ctx.strokeStyle = tg;
      ctx.lineWidth = Math.max(1, r * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, top - tail);
      ctx.lineTo(cx, top + r * 0.5);
      ctx.stroke();
    }
    // 主体：液体色 + 上亮下暗的玻璃渐变
    const body = ctx.createLinearGradient(cx, top, cx, bottom);
    body.addColorStop(0, withAlpha(this.color, 0.55));
    body.addColorStop(0.55, this.color);
    body.addColorStop(1, withAlpha(this.color, 0.88));
    ctx.fillStyle = body;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(cx, top); // 尖端
    ctx.bezierCurveTo(cx + r * 0.5, top + r * 0.8, cx + r, bottom - r * 0.7, cx, bottom);
    ctx.bezierCurveTo(cx - r, bottom - r * 0.7, cx - r * 0.5, top + r * 0.8, cx, top);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // 玻璃边缘高光（左侧一道亮弧）
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.42, top + r * 0.9);
    ctx.quadraticCurveTo(cx - r * 0.72, bottom - r * 0.8, cx - r * 0.1, bottom - 0.6);
    ctx.stroke();
    // 下部高光（左上方亮斑）
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.28, bottom - r * 0.62, r * 0.2, r * 0.32, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** 颜色 + 透明度 → rgba（支持 #rgb/#rrggbb） */
function withAlpha(hex, a) {
  const h = String(hex ?? '#9fd8ff').replace('#', '');
  const n = h.length === 3
    ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return `rgba(${n[0]},${n[1]},${n[2]},${Math.max(0, Math.min(1, a))})`;
}
