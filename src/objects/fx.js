// ============================================================================
// 特效小件（fx）：交互/动作/环境反馈的动画点缀——全部纯视觉、无碰撞、自销毁。
// ----------------------------------------------------------------------------
// 既有（签名保持不变）：
//   PuffDust    尘雾/水花圈（拾取、放置落地、吸液液面、落地）
//   FlowArc     液流弧线（吸液/倒出，沿贝塞尔流动的液滴串）
// 通用小特效（供 Scene 与各物件/动作调用；全部确定性相位，无随机闪烁）：
//   SparkleBurst  金色闪光点向外扩散 + 轻微上浮（拾取/产物/达成）
//   RippleRing    平面涟漪环（液面落点/放置落点/冲击；椭圆压扁表现俯视液面）
//   FlashBurst    短促高光爆闪（新物体出现/集气完成/关键反馈；0.2s 内熄灭）
//   ShockRing     冲击波环（带缺口 + 回声环；爆炸/重落地/强反应）
//   ArcBeam       短促弧形光束（拾取短弧光/注入连线/引导线）
// 快捷函数（puffFx/flowFx/sparkleFx/rippleFx/flashFx/shockFx/arcFx）负责生成
// 唯一 id 并 addObject 进场景；scene 无效时返回 null（编辑器/测试安全）。
// 动画约定：对象 update(dt) 内部累计 age + render 读取；只做 0.15~0.6s 的短促
// 缓动，不画说明性文字，不用随机数（固定黄金角/相位散布，可回放）。
// ============================================================================

import { Obj } from './obj.js';

let FX_SEQ = 0;

const GOLDEN = 2.399963229728653; // 黄金角（确定性散布）
const TAU = Math.PI * 2;

/** 缓动：easeOutCubic（0→1，快出慢收） */
const easeOut = (p) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);

/** 确定性 0..1 散布（同一 i 恒定；替代随机） */
const scatter = (i) => ((i * 2654435761) % 997) / 997;

/** 尘雾圈：n 团渐扩渐隐的小圆（确定性散布，不用随机数保可回放） */
export class PuffDust extends Obj {
  constructor({ x, y, r = 5, spread = 14, color = '190,215,255', life = 0.4, n = 5, ...rest }) {
    super({ x, y, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.r = r;
    this.spread = spread;
    this.color = color; // 'r,g,b' 三元组（与既有调用方一致）
    this.life = life;
    this.maxLife = life;
    this.n = Math.max(1, Math.min(10, n | 0));
    this.age = 0;
  }

  update(dt, scene) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  render(ctx) {
    const t = 1 - this.life / this.maxLife; // 0→1 扩散进度
    const fade = Math.max(0, 1 - t);
    ctx.save();
    // 外圈柔光弧（扩散的"气环"）
    if (t > 0.12) {
      ctx.globalAlpha = fade * 0.22;
      ctx.strokeStyle = `rgb(${this.color})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.spread * t + this.r, (this.spread * t + this.r) * 0.55, 0, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < this.n; i++) {
      const ang = (i / this.n) * TAU + i * 1.7;
      const d = this.spread * t * (0.55 + 0.45 * scatter(i));
      const px = this.x + Math.cos(ang) * d;
      const py = this.y + Math.sin(ang) * d * 0.8 - 2.5 * t; // 微微一飘
      const rr = Math.max(0.6, this.r * (0.5 + t) * (0.8 + 0.4 * scatter(i + 3)));
      ctx.globalAlpha = fade * (0.5 - 0.18 * (i / this.n));
      ctx.fillStyle = `rgb(${this.color})`;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, TAU);
      ctx.fill();
      // 亮点高光（每团左上一小点）：雾气里的一点光
      if (rr > 2) {
        ctx.globalAlpha = fade * 0.5;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(px - rr * 0.3, py - rr * 0.3, rr * 0.28, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/**
 * 液流弧：p0→p1 的贝塞尔小液滴串。中途小滴接连飞行（按相位错开），
 * 到达即淡出；整体随 life 结束收尾。弯拱 bend>0 时控制点在中点上抬。
 */
export class FlowArc extends Obj {
  constructor({ x0, y0, x1, y1, color = '#9fd8ff', life = 0.5, n = 7, bend = 0.35, ...rest }) {
    super({ x: 0, y: 0, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.n = n;
    this.age = 0;
    // 控制点：中点上抬 bend*距离（吸液向上拱、倒出也用小拱更自然）
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2 - bend * Math.hypot(x1 - x0, y1 - y0);
  }

  update(dt, scene) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  _at(u) { // 二次贝塞尔取点
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return {
      x: a * this.x0 + b * this.cx + c * this.x1,
      y: a * this.y0 + b * this.cy + c * this.y1,
    };
  }

  render(ctx) {
    const T = 1 - this.life / this.maxLife; // 全局进度
    const fadeEnd = Math.sin(Math.min(1, Math.max(0, T)) * Math.PI); // 起止整体淡入淡出
    ctx.save();
    // 细流线：整条弧的淡色连线（让液滴串读作"一股液流"而不是散点）
    ctx.globalAlpha = 0.16 * fadeEnd;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const p = this._at(k / 10);
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    for (let i = 0; i < this.n; i++) {
      const off = i / this.n;
      const u = (T * 1.4 + off) % 1; // 循环流动
      const p = this._at(u);
      const size = 2.6 - 1.4 * u; // 飞行中微缩
      ctx.globalAlpha = 0.85 * fadeEnd * (0.35 + 0.65 * (1 - u * 0.5));
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, size), 0, TAU);
      ctx.fill();
      // 液滴高光（左上一小点）：玻璃质感
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.55 * fadeEnd;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(p.x - size * 0.32, p.y - size * 0.32, Math.max(0.4, size * 0.32), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 通用小特效（供 Scene / 物件 / 动作反馈共用）
// ---------------------------------------------------------------------------

/**
 * 金色闪光点爆发：n 个星芒/光点沿黄金角向外扩散并微微上浮。
 * opts: color / n / spread / rise / life / size
 */
export class SparkleBurst extends Obj {
  constructor({ x, y, color = '#ffd76a', n = 8, spread = 24, rise = 16, life = 0.5, size = 2.4, ...rest }) {
    super({ x, y, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.x = x; this.y = y;
    this.color = color;
    this.n = Math.max(1, Math.min(16, n | 0));
    this.spread = spread;
    this.rise = rise;
    this.life = Math.max(0.1, life);
    this.maxLife = this.life;
    this.size = size;
    this.age = 0;
  }

  update(dt, scene) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  render(ctx) {
    const P = Math.min(1, this.age / this.maxLife);
    const fade = 1 - P;
    const e = easeOut(P);
    const cx = this.x;
    const cy = this.y;
    ctx.save();
    // 中心短促光核（前 35%）
    const core = Math.max(0, 1 - P / 0.35);
    if (core > 0.02) {
      ctx.globalAlpha = core * 0.8;
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, this.size * 2.2 * (1 - P * 0.5), 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (let i = 0; i < this.n; i++) {
      const ang = i * GOLDEN + 0.4;
      const d = this.spread * e * (0.45 + 0.55 * scatter(i));
      const px = cx + Math.cos(ang) * d;
      const py = cy + Math.sin(ang) * d * 0.72 - this.rise * e;
      const s = this.size * (0.55 + 0.65 * scatter(i + 7)) * (1 - P * 0.55);
      ctx.globalAlpha = fade * (0.55 + 0.45 * scatter(i + 2));
      ctx.fillStyle = i % 3 === 0 ? '#fff6d8' : this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.6, s), 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      // 星芒十字（较亮的粒子）
      if (i % 3 === 0 && s > 1.2) {
        ctx.strokeStyle = '#fffbe8';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(px - s * 2, py);
        ctx.lineTo(px + s * 2, py);
        ctx.moveTo(px, py - s * 2);
        ctx.lineTo(px, py + s * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/**
 * 平面涟漪环：椭圆压扁的扩散环（俯视液面/落点）。带一道更慢的内环。
 * opts: color / r0 / r1 / life / width / flat（0..1，纵向压扁比例）
 */
export class RippleRing extends Obj {
  constructor({ x, y, color = 'rgba(190,235,255,0.85)', r0 = 5, r1 = 34, life = 0.45, width = 2, flat = 0.42, ...rest }) {
    super({ x, y, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.x = x; this.y = y;
    this.color = color;
    this.r0 = r0;
    this.r1 = r1;
    this.life = Math.max(0.1, life);
    this.maxLife = this.life;
    this.width = width;
    this.flat = Math.max(0.12, Math.min(1, flat));
    this.age = 0;
  }

  update(dt, scene) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  _ring(ctx, r, alpha, lw) {
    if (r <= 0.2 || alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(0.6, lw);
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, r, r * this.flat, 0, 0, TAU);
    ctx.stroke();
  }

  render(ctx) {
    const P = Math.min(1, this.age / this.maxLife);
    const fade = 1 - P;
    ctx.save();
    ctx.strokeStyle = this.color;
    // 主环：快出慢收，逐渐变细
    const r = this.r0 + (this.r1 - this.r0) * easeOut(P);
    this._ring(ctx, r, fade * 0.85, this.width * (1 - P * 0.6));
    // 内环：更慢、更细的一道（水面双圈）
    this._ring(ctx, this.r0 + (this.r1 - this.r0) * easeOut(P * 0.72) * 0.72, fade * 0.4, 1);
    // 环上几点反光（确定性角度）
    for (let i = 0; i < 5; i++) {
      const ang = i * GOLDEN + 1.1;
      const px = this.x + Math.cos(ang) * r;
      const py = this.y + Math.sin(ang) * r * this.flat;
      ctx.globalAlpha = fade * 0.55;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(px, py, 1.1 * (1 - P * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * 短促高光爆闪：柔光核 + 十字光针（新物体出现/集气完成/关键反馈）。
 * opts: color / r / life / rays
 */
export class FlashBurst extends Obj {
  constructor({ x, y, color = '#ffe9b0', r = 28, life = 0.24, rays = 6, ...rest }) {
    super({ x, y, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.x = x; this.y = y;
    this.color = color;
    this.r = r;
    this.life = Math.max(0.08, life);
    this.maxLife = this.life;
    this.rays = Math.max(0, Math.min(12, rays | 0));
    this.age = 0;
  }

  update(dt, scene) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  render(ctx) {
    const P = Math.min(1, this.age / this.maxLife);
    const fade = Math.max(0, 1 - P);
    const r = this.r * (0.45 + 0.55 * easeOut(P));
    ctx.save();
    // 柔光核（径向渐变：中心近白 → 颜色 → 透明）
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, Math.max(1, r));
    g.addColorStop(0, `rgba(255,255,255,${(fade * 0.95).toFixed(3)})`);
    g.addColorStop(0.35, `${colorWithAlpha(this.color, fade * 0.6)}`);
    g.addColorStop(1, colorWithAlpha(this.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(1, r), 0, TAU);
    ctx.fill();
    // 十字/放射光针（短促，随进度收细）
    if (this.rays > 0 && fade > 0.05) {
      ctx.strokeStyle = colorWithAlpha(this.color, fade * 0.85);
      ctx.lineWidth = Math.max(0.7, 2.2 * fade);
      ctx.lineCap = 'round';
      const spin = this.age * 1.6;
      for (let i = 0; i < this.rays; i++) {
        const ang = (i / this.rays) * TAU + spin;
        const d0 = r * 0.55;
        const d1 = r * (1.05 + 0.35 * scatter(i));
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(ang) * d0, this.y + Math.sin(ang) * d0);
        ctx.lineTo(this.x + Math.cos(ang) * d1, this.y + Math.sin(ang) * d1);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/**
 * 冲击波环：撕裂断口的主环 + 一层回声环（爆炸/重落地/强反应）。
 * opts: color / r0 / r1 / life / width / flat / echo
 */
export class ShockRing extends Obj {
  constructor({ x, y, color = 'rgba(255,240,215,0.9)', r0 = 10, r1 = 92, life = 0.4, width = 3, flat = 0.9, echo = true, ...rest }) {
    super({ x, y, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.x = x; this.y = y;
    this.color = color;
    this.r0 = r0;
    this.r1 = r1;
    this.life = Math.max(0.1, life);
    this.maxLife = this.life;
    this.width = width;
    this.flat = Math.max(0.15, Math.min(1, flat));
    this.echo = !!echo;
    this.age = 0;
  }

  update(dt, scene) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  render(ctx) {
    const P = Math.min(1, this.age / this.maxLife);
    const e = 1 - Math.pow(1 - P, 2.4);
    const fade = Math.max(0, 1 - P);
    const r = this.r0 + (this.r1 - this.r0) * e;
    const gapA = 0.5 + this.age * 1.4;
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    ctx.globalAlpha = fade;
    ctx.lineWidth = Math.max(0.7, this.width * (1 - P * 0.65));
    ctx.beginPath();
    // 主环留一道缺口（撕裂感）
    ctx.ellipse(this.x, this.y, r, r * this.flat, 0, gapA, gapA + TAU - 0.9);
    ctx.stroke();
    if (this.echo) {
      // 回声环（半速、更细）
      ctx.globalAlpha = fade * 0.45;
      ctx.lineWidth = Math.max(0.6, this.width * 0.5 * (1 - P * 0.5));
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, r * 0.68, r * 0.68 * this.flat, 0, gapA + 2.1, gapA + 2.1 + TAU - 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * 短促弧形光束：贝塞尔弧按进度"画出来"（拾取短弧光/注入连线）。
 * opts: x0/y0/x1/y1（必填）/ color / life / bend / width
 */
export class ArcBeam extends Obj {
  constructor({ x0 = 0, y0 = 0, x1 = 0, y1 = 0, color = '#ffd76a', life = 0.32, bend = 0.3, width = 2.2, ...rest }) {
    super({ x: 0, y: 0, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.color = color;
    this.life = Math.max(0.1, life);
    this.maxLife = this.life;
    this.width = width;
    this.age = 0;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2 - bend * dist;
  }

  update(dt, scene) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  _at(u) {
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return {
      x: a * this.x0 + b * this.cx + c * this.x1,
      y: a * this.y0 + b * this.cy + c * this.y1,
    };
  }

  render(ctx) {
    const P = Math.min(1, this.age / this.maxLife);
    const draw = easeOut(Math.min(1, P / 0.45)); // 前 45% 画完整条弧
    const fade = Math.sin(P * Math.PI); // 起止淡入淡出
    if (fade <= 0.02) return;
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = fade * 0.9;
    ctx.lineWidth = this.width * (1 - P * 0.35);
    ctx.beginPath();
    const N = 16;
    let head = null;
    for (let k = 0; k <= N; k++) {
      const u = (k / N) * draw;
      const p = this._at(u);
      head = p;
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    // 弧光头部亮点
    if (head) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath();
      ctx.arc(head.x, head.y, Math.max(0.8, 2.4 * (1 - P)), 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

/**
 * 吸入/喷出涡旋：几条向内收拢的螺旋弧 + 中心小光核（集气瓶收气/通气的手边反馈）。
 * opts: color / r / life / arms
 */
export class SwirlIn extends Obj {
  constructor({ x, y, color = '#78dcff', r = 16, life = 0.36, arms = 3, ...rest }) {
    super({ x, y, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.x = x; this.y = y;
    this.color = color;
    this.r = r;
    this.life = Math.max(0.1, life);
    this.maxLife = this.life;
    this.arms = Math.max(1, Math.min(6, arms | 0));
    this.age = 0;
  }

  update(dt, scene) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  render(ctx) {
    const P = Math.min(1, this.age / this.maxLife);
    const fade = Math.max(0, 1 - P) * Math.min(1, P * 8); // 快速淡入、缓慢淡出
    if (fade <= 0.02) return;
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 5;
    for (let a = 0; a < this.arms; a++) {
      const base = (a / this.arms) * TAU + P * 2.4;
      ctx.globalAlpha = fade * 0.8;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      // 螺旋弧：半径由外向内收（随进度收得更紧）
      const steps = 9;
      for (let k = 0; k <= steps; k++) {
        const q = k / steps;
        const ang = base + q * 1.9; // 弧长（约 110°）
        const rad = this.r * (1 - P * 0.55) * (1 - q * 0.72);
        const px = this.x + Math.cos(ang) * rad;
        const py = this.y + Math.sin(ang) * rad * 0.8;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // 中心小光核（收束点）
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#eaf9ff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0.8, 2.6 * (1 - P)), 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 快捷生成函数（返回生成的特效对象；scene 无效 → null）
// ---------------------------------------------------------------------------

/** 快捷生成：尘雾 */
export function puffFx(scene, x, y, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new PuffDust({ x, y, id: `fx${++FX_SEQ}`, ...opts }));
}

/** 快捷生成：液流弧 */
export function flowFx(scene, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new FlowArc({ id: `fx${++FX_SEQ}`, ...opts }));
}

/** 快捷生成：金色闪光爆发（拾取/产物/达成） */
export function sparkleFx(scene, x, y, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new SparkleBurst({ x, y, id: `fx${++FX_SEQ}`, ...opts }));
}

/** 快捷生成：平面涟漪环（液面/落点） */
export function rippleFx(scene, x, y, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new RippleRing({ x, y, id: `fx${++FX_SEQ}`, ...opts }));
}

/** 快捷生成：短促高光爆闪 */
export function flashFx(scene, x, y, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new FlashBurst({ x, y, id: `fx${++FX_SEQ}`, ...opts }));
}

/** 快捷生成：冲击波环 */
export function shockFx(scene, x, y, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new ShockRing({ x, y, id: `fx${++FX_SEQ}`, ...opts }));
}

/** 快捷生成：短弧光（opts 需含 x0/y0/x1/y1） */
export function arcFx(scene, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new ArcBeam({ id: `fx${++FX_SEQ}`, ...opts }));
}

/** 快捷生成：吸入/喷出涡旋（集气/通气的手边反馈） */
export function swirlFx(scene, x, y, opts = {}) {
  if (!scene || typeof scene.addObject !== 'function') return null;
  return scene.addObject(new SwirlIn({ x, y, id: `fx${++FX_SEQ}`, ...opts }));
}

/** 颜色 + 透明度 → rgba 字符串（支持 '#rgb' / '#rrggbb' / 'rgba(...)' / 'r,g,b'） */
function colorWithAlpha(color, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  const c = String(color ?? '').trim();
  if (c.startsWith('rgba(') || c.startsWith('rgb(')) {
    // 既有 rgba/rgb：替换/补上 alpha
    const nums = c.replace(/^rgba?\(|\)$/g, '').split(',').map((s) => s.trim());
    if (nums.length >= 3) return `rgba(${nums[0]},${nums[1]},${nums[2]},${a})`;
    return `rgba(255,255,255,${a})`;
  }
  if (c.includes(',')) return `rgba(${c},${a})`; // 'r,g,b' 三元组
  const h = c.replace('#', '');
  const n = h.length === 3
    ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  if (!Number.isFinite(n[0]) || !Number.isFinite(n[1]) || !Number.isFinite(n[2])) return `rgba(255,255,255,${a})`;
  return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
}
