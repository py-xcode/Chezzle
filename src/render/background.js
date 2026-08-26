// ============================================================================
// 背景渲染（屏幕空间）：神殿夜色的纵向渐变 + 底部微光 + 漂浮尘埃 + 暗角。
// ============================================================================

import { THEME } from './theme.js';

export function renderBackground(ctx, W, H, time = 0) {
  // 纵向渐变
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, THEME.bg.top);
  g.addColorStop(0.55, THEME.bg.mid);
  g.addColorStop(1, THEME.bg.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 底部一缕神秘紫光
  const g2 = ctx.createLinearGradient(0, H * 0.72, 0, H);
  g2.addColorStop(0, 'rgba(120,90,220,0)');
  g2.addColorStop(1, 'rgba(120,90,220,0.12)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  // 漂浮尘埃（确定性，随时间缓动）
  const n = 42;
  for (let i = 0; i < n; i++) {
    const px = (((i * 7919) % 997) / 997) * W;
    const py = (((i * 104729) % 991) / 991) * H + Math.sin(time * 0.4 + i * 1.7) * 4;
    const r = 1 + (i % 3) * 0.7;
    const a = 0.10 + 0.22 * Math.abs(Math.sin(time * 0.7 + i * 2.3));
    ctx.fillStyle = i % 3 === 0 ? 'rgba(199,139,255,0.9)' : 'rgba(255,217,120,0.9)';
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 暗角
  const cx = W / 2;
  const cy = H / 2;
  const v = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.32, cx, cy, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(4,3,16,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}
