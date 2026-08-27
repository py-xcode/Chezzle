// ============================================================================
// 特效小件（fx）：可携带物品交互的动画点缀——全部纯视觉、无碰撞、自销毁。
//   PuffDust  尘雾/水花圈（拾取物品、放置落地、吸液液面）
//   FlowArc   液流弧线（吸液从容器飞向玩家 / 倒出从杯口落入目标，沿贝塞尔流动）
// 配套快捷函数 puffFx / flowFx 负责生成唯一 id 并 addObject 进场景。
// ============================================================================

import { Obj } from './obj.js';

let FX_SEQ = 0;

/** 尘雾圈：n 团渐扩渐隐的小圆（确定性散布，不用随机数保可回放） */
export class PuffDust extends Obj {
  constructor({ x, y, r = 5, spread = 14, color = '190,215,255', life = 0.4, n = 5, ...rest }) {
    super({ x, y, w: 2, h: 2, solid: false, physicsKind: 'none', noLift: true, ...rest });
    this.r = r;
    this.spread = spread;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.n = n;
  }

  update(dt, scene) {
    this.life -= dt;
    if (this.life <= 0) scene.removeObject(this);
  }

  render(ctx) {
    const t = 1 - this.life / this.maxLife; // 0→1 扩散进度
    ctx.save();
    for (let i = 0; i < this.n; i++) {
      const ang = (i / this.n) * Math.PI * 2 + i * 1.7;
      const d = this.spread * t * (0.55 + 0.45 * ((i % 3) / 2));
      const px = this.x + Math.cos(ang) * d;
      const py = this.y + Math.sin(ang) * d - 2.5 * t; // 微微上飘
      const rr = Math.max(0.6, this.r * (0.5 + t));
      ctx.globalAlpha = Math.max(0, (1 - t)) * 0.55;
      ctx.fillStyle = `rgb(${this.color})`;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fill();
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
    // 控制点：中点上抬 bend*距离（吸液向上拱、倒出也用小拱更自然）
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2 - bend * Math.hypot(x1 - x0, y1 - y0);
  }

  update(dt, scene) {
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
    ctx.save();
    for (let i = 0; i < this.n; i++) {
      const off = i / this.n;
      const u = (T * 1.4 + off) % 1; // 循环流动
      const p = this._at(u);
      const fadeEnd = Math.sin(Math.min(1, Math.max(0, T)) * Math.PI); // 起止整体淡入淡出
      const size = 2.6 - 1.4 * u; // 飞行中微缩
      ctx.globalAlpha = 0.85 * fadeEnd * (0.35 + 0.65 * (1 - u * 0.5));
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

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
