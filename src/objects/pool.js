// ============================================================================
// 药品池：地面凹陷的容器。自动生成盆壁/盆底静态体；内部为液体区域。
// 液体按溶液色渲染 + 浮动小球；沉淀粒子绘制在液体底部。
// 视觉：盆壁 = 深色石/钢（Floor 的 trim 壁样式，无堆料装饰），池腔内壁只留
//   简洁的内缘高光/底部阴影；液面用 renderLiquid（含 _liquidPulse 涟漪反馈）。
// ============================================================================

import { Container } from './container.js';
import { Floor } from './floor.js';
import { renderLiquid } from '../render/liquidrender.js';

const WALL = 8;
const WALL_COLOR = '#332d52'; // 盆壁石材（深紫，与地板同一语系但略深）

export class Pool extends Container {
  get hoverLabel() {
    return '池';
  }
  constructor({ x, y, w, h, wall = WALL, gasHeight = 80, ...rest } = {}) {
    super({ x, y, w, h, ...rest });
    this.wall = wall;
    this.isPool = true; // 池子标记（玩家"池边放置自动吸附"用；烧杯等小容器不吸）
    this.gasHeight = gasHeight; // 此池产气的气泡柱高度（px），可配置
    // 盆壁/盆底：视觉上走 Floor 的 trim 壁样式（深色石/钢；不参与化学）
    this.subBodies = [
      new Floor({ x, y, w: wall, h, color: WALL_COLOR, trim: 'left' }), // 左壁
      new Floor({ x: x + w - wall, y, w: wall, h, color: WALL_COLOR, trim: 'right' }), // 右壁
      new Floor({ x, y: y + h - wall, w, h: wall, color: WALL_COLOR, trim: 'bottom' }), // 盆底
    ];
  }

  /** 液体区域（扣除盆壁） */
  innerRect() {
    return { x: this.x + this.wall, y: this.y, w: this.w - 2 * this.wall, h: this.h - this.wall };
  }

  render(ctx, opts = {}) {
    const scene = opts?.scene ?? null;
    const time = opts?.time ?? 0;
    const r = this.innerRect();
    if (r.w <= 0 || r.h <= 0) return;
    // 液面高度 = 实际液体量/容量（吸液后池面下降；默认满池=容积 → 与旧版无异）
    const vol = this.solution.volume > 0 ? this.solution.volume : Infinity;
    const lh = r.h * Math.max(0, Math.min(1, this.solution.totalMass() / vol));
    if (lh > 2) renderLiquid(ctx, r.x, r.y + r.h - lh, r.w, lh, this.solution, time, this._liquidPulse ?? 0);

    // 池腔内壁：简洁的左右暗边 + 内侧受光细线 + 底部阴影（纯色填充，池子多时也便宜）
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(r.x, r.y, 2.5, r.h);
    ctx.fillRect(r.x + r.w - 2.5, r.y, 2.5, r.h);
    ctx.fillStyle = 'rgba(190,200,228,0.10)';
    ctx.fillRect(r.x + 2.5, r.y, 1.2, r.h);
    ctx.fillRect(r.x + r.w - 3.7, r.y, 1.2, r.h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
    ctx.restore();

    // 沉淀：从反应位置生成的视觉颗粒，物理堆叠成堆（含堆底阴影 + 新增沉淀脉冲）
    this.renderGrains(ctx);
    this.renderContentsLabel(ctx, opts);
  }
}
