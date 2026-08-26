// ============================================================================
// 最小渲染器：清屏 → 相机缩放 → 逐对象渲染 → HUD
// 对象只需实现 render(ctx, opts)。渲染器本身不关心对象类型（解耦）。
// 粒子特例：同种且位置重合/贴近的多个沉淀粒子，合并渲染成一个大粒子
// （掉落的一簇 20 颗不再像"撒了一地小点"，视觉上是一颗稍大的粒子）。
// ============================================================================

import { Camera } from './camera.js';
import { renderBackground } from './background.js';
import { Particle } from '../objects/particle.js';
import { getSubstance } from '../chem/substances.js';
import { luminance } from './theme.js';

const CLUSTER = 12; // px：同种粒子质心间距小于此视为一簇（重合/贴近）

/** 合并簇画成一颗大粒子（仿 Particle.render：辉光 + 实心圆 + 高光） */
function renderCluster(ctx, cx, cy, r, color) {
  const dark = luminance(color) < 110;
  ctx.save();
  if (dark) {
    const halo = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r * 1.35);
    halo.addColorStop(0, 'rgba(255,255,255,0.5)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.16, cy - r * 0.16, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 同种粒子聚类渲染：单颗正常画，重合的合并成大粒子 */
function renderParticles(ctx, particles, opts) {
  if (!particles.length) return;
  const bySub = new Map();
  for (const pt of particles) {
    if (pt.amount <= 1e-9) continue;
    if (!bySub.has(pt.substance)) bySub.set(pt.substance, []);
    bySub.get(pt.substance).push(pt);
  }
  for (const [substance, list] of bySub) {
    const color = getSubstance(substance).solid?.[0] ?? '#c9b46a';
    // 贪心聚类：质心间距 < CLUSTER 的粒子归为一簇（掉落一簇的散布很小，链式合并可接受）
    const clusters = [];
    for (const pt of list) {
      const px = pt.x + pt.w / 2;
      const py = pt.y + pt.h / 2;
      let found = null;
      for (const c of clusters) {
        if (Math.abs(c.cx - px) < CLUSTER && Math.abs(c.cy - py) < CLUSTER) { found = c; break; }
      }
      if (found) {
        found.list.push(pt);
        const n = found.list.length;
        found.cx = (found.cx * (n - 1) + px) / n;
        found.cy = (found.cy * (n - 1) + py) / n;
      } else {
        clusters.push({ list: [pt], cx: px, cy: py });
      }
    }
    for (const c of clusters) {
      const n = c.list.length;
      if (n === 1) {
        c.list[0].render(ctx, opts); // 单颗正常画
        continue;
      }
      // 合并：半径 ∝ sqrt(数量)（5px 粒子半径 2.5；20 颗 ≈ 8px 上限——比单颗大一些但不夸张）
      const r = Math.min(8, 1.8 * Math.sqrt(n));
      renderCluster(ctx, c.cx, c.cy, r, color);
    }
  }
}

export class Renderer {
  constructor(canvas, { worldW = 1000, worldH = 800, viewW = 1000, viewH = 800 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera({ worldW, worldH, viewW, viewH });
    this.worldW = worldW;
    this.worldH = worldH;
  }

  /** 适配画布尺寸（等比缩放由相机完成） */
  resize(vw, vh) {
    this.canvas.width = vw;
    this.canvas.height = vh;
  }

  clear() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  /** 渲染一帧；opts.focus 为相机跟随目标（通常玩家） */
  frame(objects, opts = {}) {
    this.clear();
    const ctx = this.ctx;
    // 背景（屏幕空间，神话夜色）
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderBackground(ctx, this.canvas.width, this.canvas.height, opts.time ?? 0);
    ctx.restore();
    // 世界对象
    ctx.save();
    this.camera.apply(ctx, this.canvas.width, this.canvas.height, opts.focus);
    const particles = [];
    for (const obj of objects) {
      if (obj instanceof Particle) { particles.push(obj); continue; }
      if (obj && typeof obj.render === 'function') obj.render(ctx, opts);
    }
    renderParticles(ctx, particles, opts);
    ctx.restore();
    if (opts.hud && typeof opts.hud.render === 'function') opts.hud.render(ctx, opts.time ?? 0);
  }
}
