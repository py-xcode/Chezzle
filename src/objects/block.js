// ============================================================================
// 物块：有化学性质的实心固体，可被推动，可溶解/反应。材质为 MaterialGrid。
// 尺寸可用 w/h 显式指定，否则按质量生成矩形。
// ============================================================================

import { Obj } from './obj.js';
import { SolidMaterial } from './material.js';
import { MaterialGrid, renderGrid } from '../render/gridrender.js';
import { THEME, rr, contrastEdge, luminance } from '../render/theme.js';
import { getSubstance, displayName } from '../chem/substances.js';
import { renderFormula } from '../render/label.js';

export class Block extends Obj {
  constructor({ x, y, substance, mass, w, h, grid, pushable = true, gravity = 1, autoStep = true, ...rest } = {}) {
    // 质量是本源：给了质量（>0）就用质量生成网格（每格 0.1g，格数=mass/0.1），
    // 物块尺寸随之确定；只有"没给质量（或 mass<=0）+ 给了 w/h"时才按像素尺寸
    // 建网格（编辑器像素模式：实体质量=网格真实总质量）。也可直接传入现成 grid
    // （子类如沉淀堆自定义形状）。
    const manual = !!(w && h && (mass == null || mass <= 0));
    const g = grid ?? (manual
      ? MaterialGrid.rect(w, h, substance)
      : MaterialGrid.rectForMass(mass ?? 50, substance));
    const aabb = g.minAABB();
    super({
      x, y, w: aabb.w, h: aabb.h,
      solid: true, pushable, gravity, autoStep,
      physicsKind: 'dynamic',
      mass: manual ? g.totalMass() : (mass ?? 50),
      ...rest,
    });
    this.substance = substance;
    this.grid = g;
    this.gridOrigin = { x, y };
    this.gridOrigins = new Map([[substance, { kind: 'level' }]]); // 网格内每种物质的来源（初始=关卡生成）
    this.mat = new SolidMaterial(this);
    this.formulaVisible = true;
  }

  get material() {
    return this.mat;
  }

  get hoverLabel() {
    return '物块';
  }

  get containerMaterial() {
    return this._container ? this._container.material : null;
  }

  /** 网格形状变化后同步到物理体（碰撞箱 = 最小外接 AABB）；顺带修复"整行空"悬空 */
  syncGrid() {
    if (this.grid._dirty) {
      this.grid.collapseHollowRows();
      this.grid._dirty = false;
    }
    const aabb = this.grid.minAABB();
    if (!aabb) {
      this.w = 0;
      this.h = 0;
      return;
    }
    this.w = aabb.w;
    this.h = aabb.h;
    this.gridOrigin.x = this.x - aabb.x;
    this.gridOrigin.y = this.y - aabb.y;
  }

  adhereMaterial(id, mass, origin) {
    if (this.noteGridOrigin) this.noteGridOrigin(id, origin);
    // 产物盈余长在所有暴露面（与大气/液体接触的面），所有位置同时渐进生长
    const added = this.grid.growExposed(id, mass);
    this.syncGrid();
    return added;
  }

  render(ctx, opts) {
    const aabb = this.grid.minAABB();
    if (!aabb) return;
    const ox = this.gridOrigin.x;
    const oy = this.gridOrigin.y;
    const bx = ox + aabb.x;
    const by = oy + aabb.y;
    renderGrid(ctx, this.grid, ox, oy);
    // 水晶轮廓 + 白色辉光（深色物质外层光晕）+ 顶部高光
    const ids = this.grid.ids();
    const blockColor = ids.length ? getSubstance(ids[0]).solid?.[0] ?? '#c9b46a' : '#c9b46a';
    const dark = luminance(blockColor) < 110;
    const edgeColor = dark ? 'rgba(255,255,255,0.7)' : contrastEdge(blockColor);
    ctx.save();
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.5;
    if (dark) {
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 8;
    }
    rr(ctx, bx, by, aabb.w, aabb.h, 3);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, by, aabb.w, 2.5);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(bx, by + aabb.h - 2.5, aabb.w, 2.5);
    ctx.restore();
    if (this.formulaVisible) {
      const ids = this.grid.ids();
      if (ids.length) renderFormula(ctx, this.x + this.w / 2, this.y - 6, ids.map((i) => displayName(i)).join(' + '), { scene: opts?.scene });
    }
  }
}
