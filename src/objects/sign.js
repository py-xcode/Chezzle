// ============================================================================
// 文字标签：关卡内显示说明文字（帮助玩家理解每个区域的机制）
// 渲染为神秘石板 + 金色发光文字。
// ============================================================================

import { Obj } from './obj.js';
import { rr } from '../render/theme.js';

export class Sign extends Obj {
  get hoverLabel() {
    return '路标';
  }
  constructor({ x, y, text = '', color = '#ffe9b0', size = 12, ...rest } = {}) {
    // 石板尺寸按文字估算（构造期无 ctx 测量；中文字符宽≈size，西文字符≈0.6×size）
    const lines = String(text ?? '').split('\n');
    let maxChars = 0;
    for (const l of lines) maxChars = Math.max(maxChars, l.length);
    super({
      x, y,
      w: Math.max(14, Math.round(maxChars * size * 0.68) + 14),
      h: lines.length * (size + 6) + 18,
      solid: false,
      physicsKind: 'none',
      ...rest,
    });
    this.text = text;
    this.color = color;
    this.size = size;
  }

  render(ctx) {
    const lines = this.text.split('\n');
    const size = this.size;
    const lh = size + 6;
    ctx.save();
    ctx.font = `${size}px "Segoe UI", sans-serif`;
    const maxW = Math.max(...lines.map((ln) => ctx.measureText(ln).width));
    // 盒模型：this.y = 石板顶（与编辑器选中框一致）；文字基线 = 顶 + size + 8
    const baseY = this.y + size + 8;
    // 石板底：顶边在文字上方留出 padding
    ctx.fillStyle = 'rgba(14,10,38,0.74)';
    rr(ctx, this.x - 7, this.y, maxW + 14, lines.length * lh + 18, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.55)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = 'rgba(232,184,75,0.4)';
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 金色发光文字
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    lines.forEach((ln, i) => ctx.fillText(ln, this.x, baseY + i * lh));
    ctx.restore();
  }
}
