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
 * 微溶物质（solubilityLimit）：按"浓度/饱和线"产生**浑浊度**——接近饱和时溶液
 * 开始泛乳白（先浑浊），过饱和带（1.25×）时最浑（随后才开始析出沉淀）。
 * frame：渲染帧号。传入时指示剂色按帧**渐变**（pH 骤变颜色渐变，不瞬间跳变）；
 * 不传（测试/单次取色）→ 直出目标色。
 */
export function solutionColor(solution, frame = undefined) {
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
  // 微溶浑浊：浓度越高越乳白（0=清澈；≥饱和线=明显浑浊；过饱和带最浑——沉淀即将出现）
  let turb = 0;
  for (const [id, mass] of solution.solutes) {
    const sub = getSubstance(id);
    if (!(sub.solubilityLimit > 0)) continue;
    const concFrac = (mass * 1000) / (solution.volume * sub.solubilityLimit); // 浓度 / 饱和线
    turb = Math.max(turb, Math.min(1, concFrac / 1.25));
  }
  if (turb > 0.02) {
    const te = turb * turb * 0.62; // 曲线：浓度爬升时先明显变浑、越浓越白
    base = {
      color: mix(base.color, '#e9eef2', te),
      alpha: base.alpha * (1 - te * 0.35) + 0.5 * te,
    };
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
  if (iw <= 1e-9) {
    // 无指示剂显色：淡出（悬停/移除后颜色缓慢回落到基础色，不瞬间跳变）
    if (solution._indCur) {
      if (frame == null) {
        solution._indCur = null;
        return base;
      }
      solution._indCur = mixToward(solution._indCur, { r: 0, g: 0, b: 0, w: 0 }, frameK(frame));
      const f = Math.min(0.5, solution._indCur.w);
      if (f > 0.005) {
        const rc = hexToRgb(base.color);
        return {
          color: rgbToHex({ r: rc.r + (solution._indCur.r - rc.r) * f, g: rc.g + (solution._indCur.g - rc.g) * f, b: rc.b + (solution._indCur.b - rc.b) * f }),
          alpha: Math.max(base.alpha, 0.25 + 0.5 * f),
        };
      }
      solution._indCur = null;
    }
    return base;
  }
  const ind = { r: ir / iw, g: ig / iw, b: ib / iw, w: Math.min(1, iw) };
  // ★ 指示剂色动态过渡：往目标色收敛（帧率无关缓动），pH 骤变时颜色渐变成
  //   （酚酞无色→浅红→深红是渐变过程，不再瞬间跳红——用户反馈）。
  //   frame 未传入（测试/单次取色）→ 直出目标色。
  //   传入 time：首次从无色（w=0）起步，之后每帧收敛——首帧即渐变起点。
  if (frame == null) {
    solution._indCur = ind;
  } else if (solution._indCur && solution._indCur.w > 0.005) {
    solution._indCur = mixToward(solution._indCur, ind, frameK(frame));
  } else {
    solution._indCur = solution._indCur ? mixToward(solution._indCur, ind, frameK(frame)) : { r: 0, g: 0, b: 0, w: 0 };
  }
  const cur = solution._indCur;
  const bc = hexToRgb(base.color);
  const f = Math.min(0.5, cur.w);
  // 指示剂色与基础色叠加（各半）：石蕊加入酸性溶液 → 红
  const mixed = rgbToHex({
    r: (bc.r + cur.r) / 2,
    g: (bc.g + cur.g) / 2,
    b: (bc.b + cur.b) / 2,
  });
  return { color: mixed, alpha: Math.max(base.alpha, 0.25 + 0.5 * f) };
}

/** 渲染时间(秒) → 缓动比例（帧率无关：指数时间常数 0.9^（Δt×18），收敛 ~1s 达 86%） */
function frameK(sec) {
  if (sec == null) return 1;
  if (solution_frameT == null) solution_frameT = sec;
  const dt = Math.max(0, Math.min(0.5, sec - solution_frameT));
  solution_frameT = sec;
  return 1 - Math.pow(0.9, dt * 18);
}

/** 把 cur 向 target 缓动收敛（k 比例；w 同步淡入/淡出） */
function mixToward(cur, target, k) {
  return {
    r: cur.r + (target.r - cur.r) * k,
    g: cur.g + (target.g - cur.g) * k,
    b: cur.b + (target.b - cur.b) * k,
    w: cur.w + ((target.w ?? 1) - cur.w) * k,
  };
}

// 模块级：最近渲染时间（frameK 计算帧间流逝用）
let solution_frameT = null;

/** 渲染一个矩形液面（灵动：起伏波浪 + 持续上升的气泡 + 辉光） */
export function renderLiquid(ctx, x, y, w, h, solution, time = 0) {
  if (w <= 0 || h <= 0) return;
  const { color, alpha } = solutionColor(solution, time);
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
