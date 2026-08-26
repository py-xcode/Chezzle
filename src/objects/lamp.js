// ============================================================================
// 酒精灯：容器子类。点燃时在其 range 内提供"加热"与"点燃源"；灯上可放置沉淀。
// 由开关控制（关卡接线 switch.onOpen(() => lamp.ignite())）。
// 焰色反应：火焰区域物体的表层物质（灯上沉淀/物块/玩家）含 Na/K/Ca/Ba/Cu/Li
// 等元素时，火焰染上特征色（物理变化，不消耗物质）；移开恢复。
// ============================================================================

import { Container } from './container.js';
import { THEME, rr, drawFlame } from '../render/theme.js';
import { flameColorOf } from '../chem/substances.js';
import { CFG } from '../core/config.js';

export class Lamp extends Container {
  constructor({ x, y, w = 40, h = 40, autoOn = false, range = CFG.lampRange, lightRange = CFG.lampLightRange, highTemp = false, ...rest } = {}) {
    // 灯/喷灯是干燥加热台：内部不应有液体水（否则 CaO+H2O、Na+H2O 等在灯上凭空发生，
    // 且 CaCO3 分解出的 CaO 会被灯水消耗掉）。water=0 由 …rest 之后显式覆盖保证。
    super({ x, y, w, h, solid: true, physicsKind: 'static', water: 0, volume: 0, ...rest });
    this.lit = autoOn;
    this.flameLevel = this.lit ? 1 : 0; // 火焰淡入淡出（0..1）
    this.range = range;
    this.lightRange = lightRange; // 提供"光照"条件的半径（见光分解 HClO 等）
    this.highTemp = highTemp; // 酒精喷灯 = true
    this.spillSides = false; // 灯上颗粒留在灯顶堆成小山，不滚落
    this.clipGrains = false; // 灯上颗粒不裁剪，自然堆成小山
    this.flameTint = null; // 焰色反应：当前特征色（null = 默认橙/蓝）
    this.flameTintCur = null; // 缓动中的颜色（避免闪烁）
  }

  get isLamp() {
    return true;
  }

  get hoverLabel() {
    return '灯';
  }

  /** 灯是台子不是液体容器：玩家/物块不会"浸入灯"（避免站灯旁被误判浸入而与灯上粉末反应） */
  containsObj() {
    return false;
  }

  ignite() {
    this.lit = true;
  }

  extinguish() {
    this.lit = false;
  }

  /** 灯面可容纳的沉淀质量上限（g）：按灯面区域面积估算，防止粉末全部挤在灯框里 */
  plateCapacity() {
    const r = this.grainRegion();
    return Math.max(2, (r.w * r.h) / 36 * 0.2); // 约每 36px² 放一颗（0.2g）
  }

  /** 火焰动画：点燃快速淡入、熄灭缓慢淡出；灯上沉淀颗粒照常沉降（不再滑落） */
  update(dt, scene) {
    super.update(dt, scene);
    const target = this.lit ? 1 : 0;
    const k = this.lit ? 11 : 4.5;
    this.flameLevel += (target - this.flameLevel) * Math.min(1, k * dt);
    if (Math.abs(this.flameLevel - target) < 0.01) this.flameLevel = target;
    // 焰色反应检测：火焰区域物体的表层物质（灯上沉淀 → 灯焰上物块/玩家）
    const tint = this.lit ? this._detectFlameTint(scene) : null;
    if (tint !== this.flameTint) this.flameTint = tint;
    if (this.flameTint && this.flameTint !== this.flameTintCur) {
      // 颜色缓动过渡（新色淡入，避免瞬间跳变）
      if (!this.flameTintCur) this.flameTintCur = this.flameTint;
      else this.flameTintCur = mixHex(this.flameTintCur, this.flameTint, Math.min(1, 6 * dt));
      if (hexDist(this.flameTintCur, this.flameTint) < 0.02) this.flameTintCur = this.flameTint;
    } else if (!this.flameTint && this.flameTintCur) {
      // 移开物体：颜色淡出回默认
      this.flameTintCur = null;
    }
  }

  /**
   * 焰色检测（多源合并）：灯上沉淀 + 火焰区域物体的表层物质，按"暴露质量"加权混色。
   * 多种含焰色物质同时存在（多种盐、物块+沉淀）时不再只取第一种：
   * 按各物质的暴露质量加权平均 RGB（同色物质权重合并）——火焰呈现混合色调；
   * 只有一种焰色物质时返回其原色（与单盐行为一致）。
   */
  _detectFlameTint(scene) {
    const acc = new Map(); // hex → 总权重（g）
    const add = (id, w) => {
      if (!(w > 0)) return;
      const c = flameColorOf(id);
      if (c) acc.set(c, (acc.get(c) ?? 0) + w);
    };
    for (const [id, m] of this.precipitates) add(id, m);
    const fx = this.x + this.w / 2;
    const fy = this.flameY();
    const probe = { x: fx - 26, y: fy - 34, w: 52, h: 68 };
    for (const o of scene.objects) {
      if (o === this || o.isLamp) continue;
      if (!o.solid && !o.isPlayerObj) continue;
      if (o.right < probe.x || o.left > probe.x + probe.w || o.bottom < probe.y || o.top > probe.y + probe.h) continue;
      const exp = o.grid && o.grid.exposedMasses ? o.grid.exposedMasses() : null;
      if (!exp) continue;
      for (const id of Object.keys(exp)) add(id, exp[id]);
    }
    if (acc.size === 0) return null;
    if (acc.size === 1) return [...acc.keys()][0];
    let r = 0, g = 0, b = 0, total = 0;
    for (const [hex, w] of acc) {
      const c = hexToRgb(hex);
      r += c.r * w; g += c.g * w; b += c.b * w; total += w;
    }
    return rgbToHex(r / total, g / total, b / total);
  }

  /** 火焰 Y（矮炉条喷灯的火焰浮在顶部上方） */
  flameY() {
    return this.h < 20 ? this.y - 16 : this.y + this.h - 30;
  }

  /** 颗粒沉降区：火焰上方一个较高区域，颗粒自然堆成小山（不裁剪、不滚落） */
  grainRegion() {
    const bx = this.x + this.w / 2;
    const fy = this.flameY();
    const w = this.h < 20 ? this.w * 0.9 : Math.min(44, this.w);
    const h = this.h < 20 ? 34 : 42;
    return { x: bx - w / 2, y: fy - h + 2, w, h };
  }

  render(ctx, opts) {
    const t = opts?.time ?? 0;
    const thin = this.h < 20;
    const bx = this.x + this.w / 2;
    const fy = this.flameY();
    if (thin) {
      // 喷灯：青铜炉条 + 一排火焰
      ctx.save();
      const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
      g.addColorStop(0, '#8a6420');
      g.addColorStop(1, '#4a3410');
      ctx.fillStyle = g;
      rr(ctx, this.x, this.y, this.w, this.h, 4);
      ctx.fill();
      ctx.strokeStyle = '#2a1c08';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 炉口纹
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < Math.floor(this.w / 12); i++) {
        ctx.fillRect(this.x + 4 + i * 12, this.y + 2, 5, this.h - 4);
      }
      ctx.restore();
      if (this.flameLevel > 0.01) {
        const fc = this.flameTintCur ?? (this.highTemp ? '#4fb6ff' : '#ff7a3d');
        const inner = this.flameTintCur ? lightenHex(fc, 0.55) : (this.highTemp ? '#d8f6ff' : '#fff3c4');
        const n = Math.max(2, Math.floor(this.w / 26));
        const grow = 0.25 + 0.75 * this.flameLevel;
        for (let i = 0; i < n; i++) {
          const fx = this.x + (i + 0.5) * (this.w / n);
          ctx.save();
          ctx.globalAlpha = this.flameLevel;
          drawFlame(ctx, fx, fy + 2, (17 + Math.sin(t * 11 + i * 1.9) * 2) * grow, fc, inner, t + i * 1.7);
          ctx.restore();
        }
      }
    } else {
      // 酒精灯：青铜灯身
      ctx.save();
      const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
      g.addColorStop(0, '#c9932f');
      g.addColorStop(0.5, '#8a6420');
      g.addColorStop(1, '#4a3410');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(this.x + 5, this.y + this.h - 6);
      ctx.lineTo(this.x + this.w - 5, this.y + this.h - 6);
      ctx.lineTo(this.x + this.w - 10, this.y + this.h - 22);
      ctx.lineTo(this.x + 10, this.y + this.h - 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2a1c08';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 灯芯
      ctx.fillStyle = '#2a2418';
      ctx.fillRect(bx - 2, this.y + this.h - 27, 4, 8);
      ctx.restore();
      if (this.flameLevel > 0.01) {
        const fc = this.flameTintCur ?? (this.highTemp ? '#4fb6ff' : '#ff7a3d');
        const inner = this.flameTintCur ? lightenHex(fc, 0.55) : (this.highTemp ? '#d8f6ff' : '#fff3c4');
        const grow = 0.25 + 0.75 * this.flameLevel;
        ctx.save();
        ctx.globalAlpha = this.flameLevel;
        drawFlame(ctx, bx, fy + 2, (20 + Math.sin(t * 13) * 2) * grow, fc, inner, t);
        ctx.restore();
      }
    }
    // 焰色反应：火焰区域铺一层特征色柔光（物体也在光里，视觉上"发同色的光"）
    if (this.flameTintCur && this.flameLevel > 0.01) {
      ctx.save();
      const g = ctx.createRadialGradient(bx, fy, 4, bx, fy, 56);
      g.addColorStop(0, hexRgba(this.flameTintCur, 0.34 * this.flameLevel));
      g.addColorStop(1, hexRgba(this.flameTintCur, 0));
      ctx.fillStyle = g;
      ctx.fillRect(bx - 60, fy - 60, 120, 120);
      ctx.restore();
    }
    this.renderContentsLabel(ctx);
    // 灯上放置的沉淀：颗粒从火焰附近生成并物理堆叠（不再均匀悬空）
    this.renderGrains(ctx);
  }
}

// ---- 颜色工具（焰色缓动/提亮）----
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t);
}

function hexDist(a, b) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return (Math.abs(ca.r - cb.r) + Math.abs(ca.g - cb.g) + Math.abs(ca.b - cb.b)) / 765;
}

function lightenHex(hex, t) {
  const c = hexToRgb(hex);
  return rgbToHex(c.r + (255 - c.r) * t, c.g + (255 - c.g) * t, c.b + (255 - c.b) * t);
}

function hexRgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
