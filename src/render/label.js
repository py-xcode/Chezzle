// ============================================================================
// 化学式/标签：暗底圆角 + 金色发光文字
// ============================================================================

import { THEME, rr } from './theme.js';

export function renderFormula(ctx, x, y, text, opts = {}) {
  // 字号按"屏幕实际像素"保证：标签画在世界变换里，低分辨率手机上会被相机
  // 缩到 6-7px（糊成一团）——从当前变换读出缩放，把字号补足到屏幕上至少
  // 12px（封顶 22 世界像素，免得鸟瞰/大缩放时标签大得离谱）
  let size = opts.size ?? 12;
  try {
    const m = ctx.getTransform ? ctx.getTransform() : null;
    const s = m ? Math.hypot(m.a, m.b) : 1;
    if (s > 0.01 && !opts.size) size = Math.max(size, Math.min(22, Math.round(12 / s)));
  } catch (e) { /* 无 getTransform（老浏览器）：用基准字号 */ }
  const color = opts.color ?? THEME.gold.text;
  ctx.save();
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'left';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = 'rgba(12,9,34,0.72)';
  rr(ctx, x - 4, y - size - 2, w, size + 7, 5);
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
