// ============================================================================
// 最小渲染器：清屏 → 相机缩放 → 逐对象渲染 → HUD
// 对象只需实现 render(ctx, opts)。渲染器本身不关心对象类型（解耦）。
// 沉淀粒子**逐颗渲染**（不再聚类合并成大圆——那会让一堆 0.5g 颗粒看起来像
// 一颗 16px 的"巨大沉淀"，与"合并后 ≤1.5 倍尺寸"的约定冲突）。
// ============================================================================

import { Camera } from './camera.js';
import { renderBackground } from './background.js';
import { Particle } from '../objects/particle.js';
import { flushLabels } from './label.js';

function renderParticles(ctx, particles, opts) {
  for (const pt of particles) {
    if (pt.amount <= 1e-9) continue;
    pt.render(ctx, opts); // 每颗按真实尺寸（0.5g→5px；合并 1.5g→7.5px）
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
    // 标签二次绘制：世界物件全部画完后、HUD 之前（标签浮于物件之上、
    // 但被 HUD 覆盖——信息卡/按钮/遮罩永远压在标签上层）
    flushLabels(ctx);
    if (opts.hud && typeof opts.hud.render === 'function') opts.hud.render(ctx, opts.time ?? 0);
  }
}
