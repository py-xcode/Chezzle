// ============================================================================
// 物质提取器：地表小矩形 + 地下 L 形管道接对应的药品池。
// 配一个开关（switchId）；开关有效开启时，池内"能以固体形式出现"的物质
// （state==='solid'，如盐/金属/氧化物）会被**缓慢**提取为沉淀粒子，从地表矩形冒出。
// 液体/气体（HCl、H2SO4、H2CO3 等 state==='liquid'/'gas'）无法被提取。
// ============================================================================

import { Obj } from './obj.js';
import { getSubstance } from '../chem/substances.js';
import { CFG } from '../core/config.js';
import { THEME, rr, glowText, screenTextScale } from '../render/theme.js';
import { hexToRgb } from '../render/color.js';
import { sfx } from '../core/audio.js';

/** 十六进制色 + 透明度 → rgba 字符串（装置组视觉共用） */
function rgbaOf(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

export class Extractor extends Obj {
  get hoverLabel() {
    return this.switchId ? '提取器' : '压力提取器（站上即提取）';
  }

  constructor({
    x, y, w = 50, h = 14,
    poolId = null, switchId = null, rate = 0.25,
    ...rest
  } = {}) {
    super({ x, y, w, h, solid: true, physicsKind: 'static', ...rest });
    // ★ 与开关同理：提取器是贴地薄板，玩家/被推的物块应当能直接上去（默认 11~14px 正好
    //   卡在 autoStepMax(14) 的临界上，浮点误差就会推不过去）
    this.stepMax = Math.min(26, h + 4);
    this.poolId = poolId; // 对应的药品池 id
    this.switchId = switchId; // 激活开关 id
    this.rate = rate; // 提取速率 g/s（缓慢冒出）
    this._acc = {}; // 每种物质的提取质量累积器（攒满 0.1g 才吐一个粒子，严格守恒）
    // 纯视觉：工作态平滑 + 管道流光脉冲衰减（数值很小，不参与判定）
    this._active = false;
    this._work = 0;
    this._pulse = 0;
  }

  update(dt, scene) {
    const pool = scene.byId[this.poolId];
    const sw = this.switchId ? scene.byId[this.switchId] : null;
    // 激活判定：switchId 字段为空 → ★ 压力提取器（玩家/物块站上即提取，同压力开关）；
    // 绑定了开关id → 只有开关有效开启才提取（开关不存在 = 未接线，不激活——不误退成压力）
    const active = this.switchId
      ? (sw ? (typeof sw.effectiveOpen === 'function' ? sw.effectiveOpen(scene) : sw.open) : false)
      : this._onTop(scene);
    // ---- 纯视觉：工作态平滑 + 流光脉冲衰减 ----
    this._active = !!active;
    this._work += ((active ? 1 : 0) - this._work) * (1 - Math.exp(-7 * dt));
    if (this._pulse > 0) this._pulse = Math.max(0, this._pulse - dt / 0.7);
    if (!pool || !pool.material) return;
    if (!active) return;
    let pumped = false; // 本 tick 是否真的抽出物质（决定抽气声）
    // 池内所有物质：只提取能以固体形式出现的（state==='solid'）
    for (const id of pool.material.ids()) {
      const sub = getSubstance(id);
      if (!sub || sub.state !== 'solid') continue;
      const avail = pool.material.avail(id);
      const take = Math.min(avail, this.rate * dt);
      if (take <= 1e-9) continue;
      pool.material.consume(id, take);
      pumped = true;
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
    // 抽气声：真的抽出物质才响，0.3s 一下（机器连续工作时的节奏）
    if (pumped) this._pulse = 1; // 视觉：管道流光/齿轮加速脉冲
    if (pumped && scene.time - (this._sfxT ?? -10) >= 0.3) {
      this._sfxT = scene.time;
      sfx('extractor.pump');
    }
  }

  /** 压力判定（与压力开关同一逻辑）：玩家/物块站在提取器上即触发。
   *  只认动态实心（玩家/物块）；沉淀粒子不压；下方站地面不算。 */
  _onTop(scene) {
    if (!scene) return false;
    for (const obj of scene.objects) {
      if (obj === this || !obj.solid || obj.physicsKind !== 'dynamic') continue; // 排除自身与静态物
      if (obj.amount !== undefined) continue; // 沉淀粒子不压（只有玩家/物块）
      if (obj.right > this.x && obj.left < this.x + this.w &&
          obj.bottom >= this.y - 12 && obj.bottom <= this.y + this.h + 4) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // 渲染（简洁版）：深钢机身（黄铜上沿）+ L 形金属管道 + 工作状态光；
  //   工作时管道有青色流光（泵动动画保留）。无齿轮/压力表/通风槽/多层管线装饰。
  //   管道几何与逻辑不变（表面底中心 → 池体中间高度 → 池近侧内壁）。
  // ---------------------------------------------------------------------------
  render(ctx, opts) {
    // ★ 与其它对象一致：渲染器传的是 opts（{ scene, time, ... }），必须先解出 scene。
    const scene = opts?.scene ?? null;
    const t = opts?.time ?? 0;
    const pool = scene?.byId?.[this.poolId];
    const x = this.x;
    const y = this.y;
    const w = this.w;
    const h = this.h;
    const active = !!this._active;
    const work = Math.max(0, Math.min(1, Number.isFinite(this._work) ? this._work : (active ? 1 : 0)));
    const pulse = Math.max(0, Math.min(1, this._pulse ?? 0));
    const accent = THEME.water.light; // 提取 = 抽吸，用"水/青"元素色
    const hot = work > 0.05;
    ctx.save();
    // ---- 1) 地下 L 形管道（暗钢外壁 + 钢亮面 + 工作流光；几何与逻辑不变）----
    if (pool) {
      const startX = x + w / 2;
      const startY = y + h;
      // 水平段高度 = 池体垂直中点；提取器底低于中点（罕见）→ 最小下探 10px
      const depth = Math.max(pool.y + pool.h / 2, startY + 10);
      // 水平终点 = 池近侧**内壁**（扣除壁厚 wall——水面可见处；正上方则直插池内）
      const wall = Number.isFinite(pool.wall) ? pool.wall : 8;
      const endX = (startX >= pool.x + pool.w - wall) ? pool.x + pool.w - wall
        : (startX <= pool.x + wall) ? pool.x + wall
        : startX;
      const pipePath = () => {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, depth);
        ctx.lineTo(endX, depth);
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // 外壁（暗钢）+ 钢亮面
      pipePath();
      ctx.strokeStyle = 'rgba(8,8,20,0.85)';
      ctx.lineWidth = 7;
      ctx.stroke();
      pipePath();
      const steel = ctx.createLinearGradient(startX - 3, 0, startX + 3, 0);
      steel.addColorStop(0, '#5c6486');
      steel.addColorStop(0.5, '#333a58');
      steel.addColorStop(1, '#1b2038');
      ctx.strokeStyle = steel;
      ctx.lineWidth = 5;
      ctx.stroke();
      // 工作流光：沿管道流动的青色虚线（确定性相位；待机不画）
      if (hot) {
        pipePath();
        ctx.strokeStyle = rgbaOf(accent, (0.3 + 0.4 * work).toFixed(3));
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 9]);
        ctx.lineDashOffset = -((t * 40 + pulse * 10) % 14);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
    }
    // ---- 2) 地表机身：深钢基座 + 黄铜上沿（工作=上沿透一道青光）----
    const br = Math.max(2, Math.min(5, h * 0.28));
    rr(ctx, x, y, w, h, br);
    const bodyG = ctx.createLinearGradient(x, y, x, y + h);
    bodyG.addColorStop(0, '#4a4f70');
    bodyG.addColorStop(0.45, '#333a58');
    bodyG.addColorStop(1, '#1b2038');
    ctx.fillStyle = bodyG;
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,6,22,0.92)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 黄铜顶板（机身上沿一条亮铜）
    const capY = y + 1;
    const capH = Math.max(2, Math.min(3.4, h * 0.18));
    rr(ctx, x + 1, capY, w - 2, capH, capH * 0.5);
    const capG = ctx.createLinearGradient(0, capY, 0, capY + capH);
    capG.addColorStop(0, '#d8b56c');
    capG.addColorStop(1, '#6b4a18');
    ctx.fillStyle = capG;
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,6,0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    // 工作状态光（一条克制的青线，随工作强度亮起）
    if (hot) {
      ctx.strokeStyle = rgbaOf(accent, (0.3 + 0.45 * work).toFixed(3));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, capY + capH + 1);
      ctx.lineTo(x + w - 2, capY + capH + 1);
      ctx.stroke();
    }
    // ---- 3) 标注：压力提取器写"压力"（与压力开关同位同义：站在上面即触发）----
    const kT = screenTextScale(ctx, 10, 11); // 屏幕最小字号保底（与路牌同档、上限 1.15）
    glowText(ctx, this.switchId ? '提取' : '压力', this.x + this.w / 2, this.y - 4 * kT, hot ? accent : '#9fb2c8', `bold ${Math.round(10 * kT * 10) / 10}px monospace`, 3);
    ctx.restore();
  }
}
