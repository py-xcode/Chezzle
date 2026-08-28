// ============================================================================
// 药品池：地面凹陷的容器。自动生成盆壁/盆底静态体；内部为液体区域。
// 液体按溶液色渲染 + 浮动小球；沉淀粒子绘制在液体底部。
// ============================================================================

import { Container } from './container.js';
import { Floor } from './floor.js';
import { renderLiquid } from '../render/liquidrender.js';

const WALL = 8;

export class Pool extends Container {
  get hoverLabel() {
    return '池';
  }
  constructor({ x, y, w, h, wall = WALL, gasHeight = 80, ...rest } = {}) {
    super({ x, y, w, h, ...rest });
    this.wall = wall;
    this.gasHeight = gasHeight; // 此池产气的气泡柱高度（px），可配置
    this.subBodies = [
      new Floor({ x, y, w: wall, h, color: '#5c4632' }), // 左壁
      new Floor({ x: x + w - wall, y, w: wall, h, color: '#5c4632' }), // 右壁
      new Floor({ x, y: y + h - wall, w, h: wall, color: '#5c4632' }), // 盆底
    ];
  }

  /** 液体区域（扣除盆壁） */
  innerRect() {
    return { x: this.x + this.wall, y: this.y, w: this.w - 2 * this.wall, h: this.h - this.wall };
  }

  render(ctx, scene) {
    const r = this.innerRect();
    if (r.w <= 0 || r.h <= 0) return;
    // 液面高度 = 实际液体量/容量（吸液后池面下降；默认满池=容积 → 与旧版无异）
    const vol = this.solution.volume > 0 ? this.solution.volume : Infinity;
    const lh = r.h * Math.max(0, Math.min(1, this.solution.totalMass() / vol));
    if (lh > 2) renderLiquid(ctx, r.x, r.y + r.h - lh, r.w, lh, this.solution, scene.time ?? 0);

    // 沉淀：从反应位置生成的视觉颗粒，物理堆叠成堆
    this.renderGrains(ctx);
    this.renderContentsLabel(ctx, scene);
  }
}
