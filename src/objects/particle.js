// ============================================================================
// 沉淀粒子：实体物理球（0.5g/5px 为基准，堆叠合并 ≤3×0.5g=1.5g）。
// 反应生成的沉淀不实心（不阻挡、与其它动态体不碰撞），但会与静态体碰撞（落在地上）。
// 玩家"放置"的沉淀（placed=true）有碰撞箱：可被站上去垫高（沉淀踮脚），
// 且除被重新收集外不能被移动。
// 只有"沉淀"（不溶固体）可收集；可溶盐粒子不可收集。
//
// ★ 两套沉淀系统的外观契约（与容器内沉淀 grains 完全一致）：
//   - 尺寸公式 particleSizeOf(amount)：0.5g → 5px；1.5g（3×0.5g 合并）→ 7.5px（1.5 倍）；
//   - 分配 splitPile(mass, maxN)：常规 0.5g/颗，超出数量上限按 1.5g 合并堆叠；
//   - 绘制 renderPrecipitateBall（辉光/高光/深色白色光晕）——粒子与容器颗粒共用。
// ============================================================================

import { Obj } from './obj.js';
import { getSubstance, isSoluble } from '../chem/substances.js';
import { luminance } from '../render/theme.js';
import { CFG } from '../core/config.js';
import { ParticleMaterial } from './material.js';

/** 颗粒尺寸：0.5g → CFG.particleSize(5px)；1.5g（3×0.5g）→ 1.5 倍（7.5px）；
 *  幂次 log3(1.5)≈0.369 使两个锚点精确匹配；≥上限被夹住；小质量保底 3px。 */
export function particleSizeOf(amount) {
  const k = Math.log(1.5) / Math.log(3);
  return Math.max(CFG.particleMinSize, Math.min(CFG.particleMaxSize,
    CFG.particleSize * Math.pow(amount / CFG.particleRefMass, k)));
}

/** 沉淀质量 → 颗粒数分配：常规每颗 CFG.maxParticleMass(0.5g)；
 *  超出数量上限 maxN 时按"堆叠"合并（每颗 ≤ CFG.stackMaxMass = 3×0.5g = 1.5g）；
 *  极端超大堆（>stackMaxMass×maxN）仍合并以保质量守恒（性能上限）。 */
export function splitPile(mass, maxN = CFG.maxSpawnParticles) {
  let n = Math.ceil(mass / CFG.maxParticleMass);
  if (n > maxN) n = Math.min(maxN, Math.ceil(mass / CFG.stackMaxMass));
  n = Math.max(1, n);
  return { n, per: mass / n };
}

/** 单颗沉淀球的绘制（自由粒子与容器内颗粒共用：外观完全一致） */
export function renderPrecipitateBall(ctx, x, y, size, color) {
  const r = size / 2;
  const dark = luminance(color) < 110;
  ctx.save();
  // 深色物质：外层白色辉光（光晕，不是描边）
  if (dark) {
    const halo = ctx.createRadialGradient(x, y, r * 0.15, x, y, r * 1.35);
    halo.addColorStop(0, 'rgba(255,255,255,0.5)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
  // 元素辉光
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(x - r * 0.16, y - r * 0.16, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export class Particle extends Obj {
  constructor({ x, y, substance, amount = CFG.cellMass, collectible, placed = false, ...rest }) {
    // 尺寸随质量缩放：0.5g → 5px；**1.5g（堆叠 3 个 0.5g）→ 0.5g 尺寸的 1.5 倍 = 7.5px**
    //（幂次 log3(1.5)，两个锚点精确匹配；大堆合并的更大质量被 7.5px 上限夹住）；
    // 更小质量的颗粒保底 3px（可见/可拾取）。
    const size = particleSizeOf(amount);
    super({
      x, y, w: size, h: size,
      solid: placed,
      pushable: placed, // 放置的沉淀可被玩家踢开
      physicsKind: 'dynamic',
      mass: amount,
      gravity: 1,
      ...rest,
    });
    this.substance = substance;
    this.amount = amount;
    this.collectible = collectible ?? !isSoluble(substance);
    this.placed = placed;
    this.mat = new ParticleMaterial(this); // 让浸入容器的沉淀能参与反应（Zn+HCl 等）
  }

  get material() {
    return this.mat;
  }

  /** 调试悬停显示：沉淀 · 物质 ×合并数（几颗 0.5g 合并；大堆合并颗粒会 >容器上限） */
  get hoverLabel() {
    const n = Math.max(1, Math.ceil(this.amount / CFG.maxParticleMass));
    return `沉淀·${this.substance} ×${n}`;
  }

  render(ctx) {
    const sub = getSubstance(this.substance);
    const c = sub.solid && sub.solid.length ? sub.solid[0] : '#c9b46a';
    renderPrecipitateBall(ctx, this.x + this.w / 2, this.y + this.h / 2, this.w, c);
  }
}
