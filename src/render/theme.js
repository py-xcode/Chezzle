// ============================================================================
// 神话·元素主题（冰火人式鲜艳 + 神殿感）
// 所有渲染模块共享这一套色板，保证整体风格统一。
// ============================================================================

export const THEME = {
  bg: { top: '#0b0e28', mid: '#141a40', bottom: '#1e2555' },

  // 神话金
  gold: {
    base: '#e8b84b',
    light: '#ffd76a',
    text: '#ffe9b0',
    deep: '#a9782a',
    dim: 'rgba(232,184,75,0.35)',
  },

  // 火元素
  fire: {
    base: '#ff5c1f',
    light: '#ffb340',
    white: '#fff3c4',
    glow: 'rgba(255,122,61,0.35)',
  },

  // 水元素
  water: {
    base: '#1fa8e0',
    light: '#7fe0ff',
    glow: 'rgba(61,201,255,0.30)',
  },

  // 毒元素（绿）
  toxic: {
    base: '#3fd93a',
    light: '#a6ff9a',
    glow: 'rgba(107,255,92,0.28)',
  },

  // 传送/通路（紫）
  portal: {
    base: '#c78bff',
    light: '#e7ccff',
    glow: 'rgba(199,139,255,0.35)',
  },

  // 石材
  stone: {
    base: '#3a3f5c',
    light: '#4b5175',
    dark: '#22263f',
    line: '#2b3047',
    highlight: 'rgba(255,255,255,0.10)',
  },

  outline: '#160f2b', // 描边（角色轮廓）
  panel: 'rgba(18,14,46,0.85)', // 面板底色
};

// ---- 常用绘制辅助 ----

/** 世界内文本的"屏幕最小字号"保底系数：路牌/开关标注等在相机缩放后过小
 *  （移动端视口小、世界被压到 0.8× 左右，10px 变 8px 眯眼）→ 返回放大倍数 k，
 *  使 世界字号 size × 相机缩放 ≥ minScreen（逻辑屏幕 px）。桌面（缩放≈1）返回 1。
 *  ★ maxK 上限默认 1.15：路牌/标注是**世界摆位**的文字，放大过猛会与相邻
 *  文字压叠（用户截图复现）——收敛幅度保可读，不破坏摆位。
 *  仅读当前变换（含 dpr 基座），不影响任何布局状态。 */
export function screenTextScale(ctx, sizeWorld, minScreen = 12, maxK = 1.15) {
  if (!(sizeWorld > 0)) return 1;
  const cnv = ctx && ctx.canvas && typeof ctx.canvas === 'object' ? ctx.canvas : null;
  const dpr = cnv && Number.isFinite(cnv._dpr) ? Math.max(1, cnv._dpr) : 1;
  let m = null;
  try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { /* 老浏览器 */ }
  const vscale = ((m ? Math.hypot(m.a, m.b) : 1) || 1) / dpr; // 世界 → 逻辑屏幕像素
  if (vscale <= 0.01) return 1;
  const k = (minScreen / sizeWorld) / vscale;
  return Math.max(1, Math.min(maxK, k));
}

/** 圆角矩形路径 */
export function rr(ctx, x, y, w, h, r) {
  const rr2 = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr2, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr2);
  ctx.arcTo(x + w, y + h, x, y + h, rr2);
  ctx.arcTo(x, y + h, x, y, rr2);
  ctx.arcTo(x, y, x + w, y, rr2);
  ctx.closePath();
}

/** 带发光描边与内阴影的圆角面板（神话风） */
export function panel(ctx, x, y, w, h, accent = THEME.gold.deep, r = 10) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(40,32,80,0.92)');
  g.addColorStop(1, 'rgba(14,10,36,0.92)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();
}

/** 发光文字（仅用于大标题；小字用 clearText，避免糊） */
export function glowText(ctx, text, x, y, color = THEME.gold.text, font = 'bold 13px "Segoe UI", sans-serif', blur = 6) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 清晰小字（细暗描边保证可读，不发光） */
export function clearText(ctx, text, x, y, color = '#ffffff', font = 'bold 12px monospace') {
  ctx.save();
  ctx.font = font;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,6,24,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---- 对比度 ----

/** 十六进制颜色的亮度（0-255） */
export function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** 依据物质亮度选描边：深色用弱白光晕边缘（否则在暗背景下看不见），浅色用深描边 */
export function contrastEdge(hex) {
  return luminance(hex) < 110 ? 'rgba(255,255,255,0.60)' : 'rgba(16,15,43,0.85)';
}

// ---- 火焰 ----

/**
 * 多层有机火焰：外辉光 + 渐变焰体 + 白热内核 + 上升火星。
 * (x,y) 为焰底，h 为总高，color 为火焰主色。
 */
export function drawFlame(ctx, x, y, h, color, innerColor = '#fffdf2', t = 0) {
  const wob = Math.sin(t * 9) * 0.16 + Math.sin(t * 13.7 + 1.3) * 0.1;
  const w = h * 0.62;
  ctx.save();
  // 外辉光
  ctx.shadowColor = color;
  ctx.shadowBlur = h * 1.7;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  flamePath(ctx, x, y, h, w, wob);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  // 焰体（自下而上渐变，底部最亮）
  const g = ctx.createLinearGradient(x, y, x, y - h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.28, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.9;
  flamePath(ctx, x, y, h * 0.74, w * 0.74, wob * 1.25);
  ctx.fill();
  ctx.globalAlpha = 1;
  // 内核（白热）
  ctx.fillStyle = innerColor;
  ctx.globalAlpha = 0.95;
  flamePath(ctx, x, y, h * 0.42, w * 0.42, wob * 1.6);
  ctx.fill();
  ctx.globalAlpha = 1;
  // 上升火星
  for (let i = 0; i < 3; i++) {
    const ph = (t * 46 + i * 73) % 30;
    const ex = x + Math.sin(t * 11 + i * 2.4) * h * 0.32;
    const ey = y - h * 0.7 - (ph / 30) * h * 0.55;
    ctx.globalAlpha = 0.55 * (1 - ph / 30);
    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 泪滴形火焰路径 */
function flamePath(ctx, x, y, h, w, wob) {
  ctx.beginPath();
  ctx.moveTo(x + w * wob, y - h);
  ctx.quadraticCurveTo(x + w, y - h * 0.45, x + w * 0.52, y);
  ctx.quadraticCurveTo(x, y + h * 0.04, x - w * 0.52, y);
  ctx.quadraticCurveTo(x - w, y - h * 0.45, x + w * wob, y - h);
  ctx.closePath();
}
