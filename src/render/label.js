// ============================================================================
// 化学式/标签：暗底圆角 + 金色发光文字
// ============================================================================

import { THEME, rr } from './theme.js';

export function renderFormula(ctx, x, y, text, opts = {}) {
  const size = opts.size ?? 10;
  const color = opts.color ?? THEME.gold.text;
  ctx.save();
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'left';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(12,9,34,0.72)';
  rr(ctx, x - 3, y - size, w, size + 5, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,184,75,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 清晰小字：细暗描边保证可读，不发光
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,6,24,0.9)';
  ctx.strokeText(text, x + 2, y);
  ctx.fillText(text, x + 2, y);
  ctx.restore();
}
