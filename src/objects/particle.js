// ============================================================================
// 沉淀粒子：0.1g / 5px 小球，受重力落到地面，可被玩家收集。
// 反应生成的沉淀不实心（不阻挡、与其它动态体不碰撞），但会与静态体碰撞（落在地上）。
// 玩家"放置"的沉淀（placed=true）有碰撞箱：可被站上去垫高（沉淀踮脚），
// 且除被重新收集外不能被移动。
// 只有"沉淀"（不溶固体）可收集；可溶盐粒子不可收集。
// ============================================================================

import { Obj } from './obj.js';
import { getSubstance, isSoluble } from '../chem/substances.js';
import { luminance } from '../render/theme.js';
import { CFG } from '../core/config.js';
import { ParticleMaterial } from './material.js';

export class Particle extends Obj {
  constructor({ x, y, substance, amount = CFG.cellMass, collectible, placed = false, ...rest }) {
    // 尺寸随质量缩放：0.5g → 5px；**1.5g（堆叠 3 个 0.5g）→ 0.5g 尺寸的 1.5 倍 = 7.5px**
    //（幂次 log3(1.5)，两个锚点精确匹配；大堆合并的更大质量被 7.5px 上限夹住）；
    // 更小质量的颗粒保底 3px（可见/可拾取）。
    const k = Math.log(1.5) / Math.log(3); // ≈0.369：size(1.5g)/size(0.5g) = 1.5
    const size = Math.max(CFG.particleMinSize, Math.min(CFG.particleMaxSize,
      CFG.particleSize * Math.pow(amount / CFG.particleRefMass, k)));
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

  get hoverLabel() {
    return '沉淀';
  }

  render(ctx) {
    const sub = getSubstance(this.substance);
    const c = sub.solid && sub.solid.length ? sub.solid[0] : '#c9b46a';
    const x = this.x + this.w / 2;
    const y = this.y + this.h / 2;
    const dark = luminance(c) < 110;
    ctx.save();
    // 深色物质：外层白色辉光（光晕，不是描边）
    if (dark) {
      const halo = ctx.createRadialGradient(x, y, this.w * 0.15, x, y, this.w * 1.35);
      halo.addColorStop(0, 'rgba(255,255,255,0.5)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, this.w * 1.35, 0, Math.PI * 2);
      ctx.fill();
    }
    // 元素辉光
    ctx.shadowColor = c;
    ctx.shadowBlur = 7;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, this.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(x - this.w * 0.16, y - this.h * 0.16, this.w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
