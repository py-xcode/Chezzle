// ============================================================================
// 物质提取器：地表小矩形 + 地下 L 形管道接对应的药品池。
// 配一个开关（switchId）；开关有效开启时，池内"能以固体形式出现"的物质
// （state==='solid'，如盐/金属/氧化物）会被**缓慢**提取为沉淀粒子，从地表矩形冒出。
// 液体/气体（HCl、H2SO4、H2CO3 等 state==='liquid'/'gas'）无法被提取。
// ============================================================================

import { Obj } from './obj.js';
import { getSubstance } from '../chem/substances.js';
import { CFG } from '../core/config.js';
import { THEME, rr, glowText } from '../render/theme.js';

export class Extractor extends Obj {
  get hoverLabel() {
    return '提取器';
  }

  constructor({
    x, y, w = 50, h = 14,
    poolId = null, switchId = null, rate = 0.25,
    ...rest
  } = {}) {
    super({ x, y, w, h, solid: true, physicsKind: 'static', ...rest });
    this.poolId = poolId; // 对应的药品池 id
    this.switchId = switchId; // 激活开关 id
    this.rate = rate; // 提取速率 g/s（缓慢冒出）
    this._acc = {}; // 每种物质的提取质量累积器（攒满 0.1g 才吐一个粒子，严格守恒）
  }

  update(dt, scene) {
    const pool = scene.byId[this.poolId];
    const sw = scene.byId[this.switchId];
    if (!pool || !pool.material || !sw) return;
    // 有效开启（支持开关"&"联锁）
    const active = typeof sw.effectiveOpen === 'function' ? sw.effectiveOpen(scene) : sw.open;
    if (!active) return;
    // 池内所有物质：只提取能以固体形式出现的（state==='solid'）
    for (const id of pool.material.ids()) {
      const sub = getSubstance(id);
      if (!sub || sub.state !== 'solid') continue;
      const avail = pool.material.avail(id);
      const take = Math.min(avail, this.rate * dt);
      if (take <= 1e-9) continue;
      pool.material.consume(id, take);
      // 质量累积：每攒满一个粒子（0.1g）才吐出一个，避免小量提取被 spawnParticles
      // 的取整放大（round(0.01/0.1)=1 → 凭空多出 10 倍质量）。
      this._acc[id] = (this._acc[id] ?? 0) + take;
      while (this._acc[id] >= CFG.cellMass) {
        this._acc[id] -= CFG.cellMass;
        // 从地表矩形顶部冒出可收集沉淀（可溶的也能收；实心 false）
        scene.spawnParticles(id, CFG.cellMass, { x: this.x + Math.random() * this.w, y: this.y + 2 }, true, false, {
          kind: 'extract',
          text: `${id} 提取`,
        });
      }
    }
  }

  render(ctx, scene) {
    const pool = scene?.byId?.[this.poolId];
    const sw = scene?.byId?.[this.switchId];
    const active = sw ? (sw._lastEff ?? sw.open) : false;
    ctx.save();
    // 地表矩形（金属台，激活时发光）
    const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    g.addColorStop(0, active ? '#4a6a8a' : '#3a3f5c');
    g.addColorStop(1, '#22263f');
    ctx.fillStyle = g;
    rr(ctx, this.x, this.y, this.w, this.h, 4);
    ctx.fill();
    ctx.strokeStyle = active ? THEME.water.light : '#151830';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = active ? THEME.water.light : 'transparent';
    ctx.shadowBlur = active ? 10 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 台面网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let gx = this.x + 6; gx < this.x + this.w; gx += 7) {
      ctx.beginPath();
      ctx.moveTo(gx, this.y + 2);
      ctx.lineTo(gx, this.y + this.h - 2);
      ctx.stroke();
    }
    // L 形地下管道：表面底中心 → 向下 → 横向到池中心 → 向上接入池
    if (pool) {
      const startX = this.x + this.w / 2;
      const startY = this.y + this.h;
      const depth = Math.min(startY + 70, Math.max(pool.y + 10, startY + 40));
      const endX = pool.x + pool.w / 2;
      ctx.strokeStyle = active ? '#7fe0ff' : '#4a4f70';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX, depth);
      ctx.lineTo(endX, depth);
      ctx.lineTo(endX, pool.y + pool.h);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // 管道内衬高光
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX, depth);
      ctx.lineTo(endX, depth);
      ctx.lineTo(endX, pool.y + pool.h);
      ctx.stroke();
    }
    // 标注
    glowText(ctx, '提取', this.x + this.w / 2, this.y - 4, active ? THEME.water.light : '#9fb2c8', 'bold 10px monospace', 3);
    ctx.restore();
  }
}
