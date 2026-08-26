// ============================================================================
// 液体渲染
// ----------------------------------------------------------------------------
// 溶液色 = 各有色离子按其浓度/饱和比加权平均；无色 → 淡灰透明。
// 主体填充 + 少量确定性伪随机浮动小球（颜色深浅微差，纯视觉）。
// ============================================================================

import { getSubstance } from '../chem/substances.js';
import { hexToRgb, rgbToHex, mix } from './color.js';

/**
 * 计算溶液颜色与透明度（无色→饱和色平滑过渡）。
 * 指示剂（石蕊/酚酞）：按溶液 pH 显色，与离子色叠加。
 */
export function solutionColor(solution) {
  let idx = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const [id, mass] of solution.solutes) {
    const sub = getSubstance(id);
    if (!sub.ionColor) continue;
    const gPerL = (mass / solution.volume) * 1000; // volume 单位 mL → g/L
    const f = gPerL / sub.ionColor.sat; // 相对饱和浓度
    if (f <= 0) continue;
    const c = hexToRgb(sub.ionColor.color);
    idx += f;
    r += c.r * f;
    g += c.g * f;
    b += c.b * f;
    w += f;
  }
  let base = { color: '#aaaaaa', alpha: 0.12 }; // 无色
  if (idx > 1e-9) {
    // t=0 无色，t≥1 全饱和：颜色从 #aaa 线性混合到加权离子色，透明度平滑上升
    const t = Math.min(1, idx);
    const ion = rgbToHex({ r: r / w, g: g / w, b: b / w });
    base = { color: mix('#aaaaaa', ion, t), alpha: 0.12 + 0.73 * t };
  }
  // 指示剂显色（石蕊红/紫/蓝，酚酞无色/浅红/深红，甲基橙红/橙/黄）
  const pH = solution.pH ? solution.pH() : 7;
  let ir = 0;
  let ig = 0;
  let ib = 0;
  let iw = 0;
  for (const [id, mass] of solution.solutes) {
    const sub = getSubstance(id);
    if (!sub.indicator || mass <= 0) continue;
    let color = sub.indicator.stops[0][1];
    for (const [cut, c] of sub.indicator.stops) {
      if (pH >= cut) color = c;
    }
    if (sub.indicator.transparent && color === sub.indicator.stops[0][1]) continue; // 无色段
    const gPerL = (mass / solution.volume) * 1000;
    const f = Math.min(1, gPerL / 10); // ≥10g/L 视为指示剂饱和显色
    const c = hexToRgb(color);
    ir += c.r * f;
    ig += c.g * f;
    ib += c.b * f;
    iw += f;
  }
  if (iw <= 1e-9) return base;
  const ind = { r: ir / iw, g: ig / iw, b: ib / iw };
  const bc = hexToRgb(base.color);
  // 指示剂色与基础色叠加（各半）：石蕊加入酸性溶液 → 红
  const mixed = rgbToHex({
    r: (bc.r + ind.r) / 2,
    g: (bc.g + ind.g) / 2,
    b: (bc.b + ind.b) / 2,
  });
  return { color: mixed, alpha: Math.max(base.alpha, 0.25 + 0.5 * Math.min(1, iw)) };
}

/** 渲染一个矩形液面（灵动：起伏波浪 + 持续上升的气泡 + 辉光） */
export function renderLiquid(ctx, x, y, w, h, solution, time = 0) {
  if (w <= 0 || h <= 0) return;
  const { color, alpha } = solutionColor(solution);
  ctx.save();
  // 主体：纵向渐变（底部更深）
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, color);
  g.addColorStop(1, mix(color, '#000000', 0.35));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  // 起伏波浪表面（随时间推进，不是死线）
  const waveAmp = 2.4;
  ctx.globalAlpha = Math.min(1, alpha + 0.35);
  ctx.fillStyle = mix(color, '#ffffff', 0.5);
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const SEG = 14;
  for (let i = 0; i <= SEG; i++) {
    const px = x + (i / SEG) * w;
    const py = y + Math.sin(time * 2.4 + (i / SEG) * Math.PI * 2 + x * 0.01) * waveAmp;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x + w, y + 3.5);
  ctx.lineTo(x, y + 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // 上升的气泡（从底部持续冒出，速度不一，随时间循环）
  const n = Math.min(22, Math.max(1, Math.round((w * h) / 900)));
  for (let i = 0; i < n; i++) {
    const bx = x + ((i * 7919) % 997) / 997 * w;
    const speed = 22 + (i % 4) * 9;
    const cycle = h + 16;
    const off = (time * speed + i * 37) % cycle;
    const by = y + h - off;
    const r = 1.6 + (i % 3) * 1.1;
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(i * 2.1 + time * 2);
    ctx.fillStyle = mix(color, '#ffffff', 0.72);
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
