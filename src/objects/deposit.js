// ============================================================================
// 沉淀堆（Deposit）：关卡预设的"一滩沉淀"。
// ----------------------------------------------------------------------------
// 它**不是固体块**：开局（首帧）就物化为沉淀粒子——与玩家放置的沉淀、反应产物
// 完全同一物理：实心可垫脚、可堆叠、可拾取（Q）、可溶解/反应、卡口会像沙一样漏入。
// 编辑器里以"堆形网格"预览（梯形堆，质量决定大小；显式 w/h 走像素模式）；
// 运行时网格只是物化布局，物化后壳退出活动索引（保留 byId：开关仍可引用）。
// ============================================================================

import { Obj } from './obj.js';
import { MaterialGrid, renderGrid, CELL_SIZE } from '../render/gridrender.js';
import { contrastEdge, luminance } from '../render/theme.js';
import { getSubstance } from '../chem/substances.js';
import { renderFormula } from '../render/label.js';

export class Deposit extends Obj {
  constructor({ x, y, substance, mass, w, h, ...rest } = {}) {
    // 显式 w/h（且未给质量）→ 按目标尺寸生成梯形堆（编辑器像素模式）；
    // 否则质量 → 堆形（每格 0.1g，与物块同一密度）
    const manual = !!(w && h && (mass == null || mass <= 0));
    const grid = manual
      ? MaterialGrid.heapRect(w, h, substance)
      : MaterialGrid.heapForMass(mass ?? 20, substance);
    const aabb = grid.minAABB();
    super({ x, y, w: aabb.w, h: aabb.h, solid: false, physicsKind: 'none', noLift: true, mass: grid.totalMass(), ...rest });
    this.substance = substance;
    this.grid = grid;
    this.gridOrigin = { x, y };
    this.gridOrigins = new Map([[substance, { kind: 'level' }]]);
    this.formulaVisible = true;
    this._materialized = false;
  }

  get isDeposit() {
    return true;
  }

  /** 渲染/选中框锚点同步：gridOrigin 跟随逻辑位置 x/y（编辑器拖拽、缩放、旧档归一化用）。
   *  物块/玩家都有 syncGrid，沉淀堆漏了会导致"拖了选中框在跑、堆图形留在原地"。 */
  syncGrid() {
    const aabb = this.grid?.minAABB?.() ?? null;
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

  get hoverLabel() {
    return '沉淀堆';
  }

  /** 首帧：物化为沉淀粒子（之后自身成为"壳"，退出活动索引） */
  update(dt, scene) {
    if (!scene || this._materialized) return;
    this._materialized = true;
    this.materialize(scene);
  }

  /** 按预览网格逐格生成粒子：开局即"一滩真实沉淀"，堆形=编辑器所见 */
  materialize(scene) {
    const aabb = this.grid?.minAABB?.() ?? null;
    if (aabb && scene) {
      // 按物质汇总（堆可能混合多物质），整堆一次撒成"一滩"：
      // 撒开宽度≈编辑器所见堆宽；大质量受 maxSpawnParticles 上限约束（2000g 也是几百颗，不会卡顿）
      const byId = new Map();
      for (let ry = 0; ry < this.grid.rows; ry++) {
        for (let gc = 0; gc < this.grid.cols; gc++) {
          const m = this.grid.cells[ry]?.[gc];
          if (!m) continue;
          for (const [id, mass] of m) {
            if (mass > 0) byId.set(id, (byId.get(id) ?? 0) + mass);
          }
        }
      }
      const cx = this.gridOrigin.x + aabb.x + aabb.w / 2;
      const cy = this.gridOrigin.y + aabb.y + aabb.h / 2;
      const spread = Math.max(24, aabb.w);
      for (const [id, mass] of byId) {
        scene.spawnParticles(id, mass, { x: cx, y: cy }, true, true, { kind: 'level', text: '关卡预设沉淀' }, spread);
      }
    }
    // 壳退场：清活动索引与可见性，仅保留 byId（开关引用仍有效）
    const arrays = [
      scene.objects, scene.dynamics, scene.statics, scene.particles,
      scene.containers, scene.lamps, scene.doors, scene.portals, scene.hidden,
    ];
    for (const arr of arrays) {
      const i = arr.indexOf(this);
      if (i >= 0) arr.splice(i, 1);
    }
    this.grid = null; // 空壳：无渲染/无物化能力
    this.gridOrigins = null;
    this.hidden = true;
  }

  /** 编辑器预览：梯形堆轮廓 + 网格（物化后网格为空，不渲染） */
  render(ctx) {
    if (!this.grid) return;
    const aabb = this.grid.minAABB();
    if (!aabb) return;
    const ox = this.gridOrigin.x;
    const oy = this.gridOrigin.y;
    const bx = ox + aabb.x;
    const by = oy + aabb.y;
    renderGrid(ctx, this.grid, ox, oy);
    const ids = this.grid.ids();
    const color = ids.length ? getSubstance(ids[0]).solid?.[0] ?? '#cfe0c8' : '#cfe0c8';
    const dark = luminance(color) < 110;
    const taper = Math.max(2, (this.grid.rows - 1) * CELL_SIZE);
    ctx.save();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.7)' : contrastEdge(color);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + taper, by + 4);
    ctx.lineTo(bx + aabb.w - taper, by + 4);
    ctx.lineTo(bx + aabb.w - 4, by + aabb.h - 4);
    ctx.lineTo(bx + 4, by + aabb.h - 4);
    ctx.closePath();
    if (dark) {
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 8;
    }
    ctx.stroke();
    ctx.restore();
    if (this.formulaVisible && ids.length) {
      renderFormula(ctx, this.x + this.w / 2, this.y - 6, ids.join(' + '));
    }
  }
}
