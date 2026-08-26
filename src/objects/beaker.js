// ============================================================================
// 烧杯：可承载任何物质（含玩家）的容器。杯壁（左/右/底）为实心碰撞体：
//   - 不能从侧面走进，只能跳过杯口进入；玩家太宽会卡在杯口下不去
//   - 受重力：无支撑时下落
//   - 玩家在杯内 → 跟随移动；玩家在杯外贴杯壁 → 推动
// ============================================================================

import { Container } from './container.js';
import { getSubstance } from '../chem/substances.js';
import { Obj } from './obj.js';
import { renderLiquid } from '../render/liquidrender.js';
import { rr } from '../render/theme.js';

export class Beaker extends Container {
  get hoverLabel() {
    return '烧杯';
  }
  constructor({ x, y, w = 60, h = 70, wall = 5, ...rest } = {}) {
    super({ x, y, w, h, ...rest });
    this.wall = wall;
    this.vy = 0;
    // 实心杯壁（左/右/底），跟随烧杯移动；顶口敞开（可跳入）
    this.subBodies = [
      new Obj({ id: 'bk_l', x, y, w: wall, h, solid: true, physicsKind: 'dynamic', gravity: 0, mass: 1 }),
      new Obj({ id: 'bk_r', x: x + w - wall, y, w: wall, h, solid: true, physicsKind: 'dynamic', gravity: 0, mass: 1 }),
      new Obj({ id: 'bk_b', x, y: y + h - wall, w, h: wall, solid: true, physicsKind: 'dynamic', gravity: 0, mass: 1 }),
    ];
  }

  innerRect() {
    return {
      x: this.x + this.wall,
      y: this.y + this.wall,
      w: this.w - 2 * this.wall,
      h: this.h - 2 * this.wall,
    };
  }

  /** 杯壁跟随烧杯位置 */
  syncWalls() {
    const [l, r, b] = this.subBodies;
    l.x = this.x;
    l.y = this.y;
    r.x = this.x + this.w - this.wall;
    r.y = this.y;
    b.x = this.x;
    b.y = this.y + this.h - this.wall;
  }

  /** 无支撑时受重力下落，落到下方支撑面停住 */
  applyGravity(dt, scene) {
    let support = 0;
    for (const s of scene.statics) {
      if (!s.solid) continue;
      if (s.y >= this.y + this.h - 2 && s.y <= this.y + this.h + 40 && s.x < this.x + this.w && s.x + s.w > this.x) {
        support = Math.max(support, s.y);
      }
    }
    if (support > 0) {
      // 已陷入支撑面：顶回表面
      if (this.y + this.h > support) {
        this.y = support - this.h;
        this.vy = 0;
      } else {
        // 在支撑面上方：继续下落直到贴合
        this.vy = Math.min(400, this.vy + 600 * dt);
        this.y += this.vy * dt;
        if (this.y + this.h >= support) {
          this.y = support - this.h;
          this.vy = 0;
        }
      }
    } else {
      this.vy = Math.min(400, this.vy + 600 * dt);
      this.y += this.vy * dt;
    }
  }

  update(dt, scene) {
    super.update(dt, scene); // 颗粒沉降等容器逻辑
    this.applyGravity(dt, scene);
    const p = scene.player;
    if (!p) return;
    const inner = this.innerRect();
    // 玩家在杯外贴杯壁朝内移动 → 推动烧杯（杯内携带放到 lateUpdate，按实际位移）
    if (!this.containsObj(p) && Math.abs(p.vel.x) > 0.1) {
      const push = p.vel.x * dt;
      const aligned = p.bottom > inner.y && p.top < inner.y + inner.h;
      if (push > 0 && p.right >= this.x - 2 && p.right <= this.x + this.wall + 2 && aligned) {
        this.x += push;
      } else if (push < 0 && p.left <= this.x + this.w + 2 && p.left >= this.x + this.w - this.wall - 2 && aligned) {
        this.x += push;
      }
    }
  }

  /** 物理结算后：杯内玩家与烧杯互相带动——烧杯跟随玩家的水平位移；玩家跟随烧杯的竖直位移 */
  lateUpdate(dt, scene) {
    const p = scene.player;
    if (p && this.containsObj(p)) {
      // 烧杯跟随玩家的水平位移（杯壁挡住时玩家不移动 → 烧杯也不动，不甩出）
      const dx = p.x - (this._prevPx ?? p.x);
      if (Math.abs(dx) > 0.01) this.x += dx;
      // 玩家跟随烧杯的竖直位移（烧杯下落/被抬起时玩家一起移动，不脱离）
      const dy = this.y - (this._prevBy ?? this.y);
      if (Math.abs(dy) > 0.01) p.y += dy;
    }
    this._prevPx = p ? p.x : this._prevPx;
    this._prevBy = this.y;
    this.syncWalls();
  }

  render(ctx, scene) {
    // 液体（元素发光液面）
    const inner = this.innerRect();
    if (inner.w > 0 && inner.h > 0) renderLiquid(ctx, inner.x, inner.y, inner.w, inner.h, this.solution, scene.time ?? 0);
    // 沉淀：从反应位置生成的视觉颗粒，物理堆叠成堆
    this.renderGrains(ctx);
    // 玻璃杯（U 形，半透明 + 亮边 + 高光）
    ctx.save();
    ctx.fillStyle = 'rgba(210,240,255,0.12)';
    rr(ctx, this.x, this.y, this.w, this.h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,245,255,0.8)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(180,230,255,0.6)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x, this.y + this.h - 7);
    ctx.arcTo(this.x, this.y + this.h, this.x + 7, this.y + this.h, 7);
    ctx.lineTo(this.x + this.w - 7, this.y + this.h);
    ctx.arcTo(this.x + this.w, this.y + this.h, this.x + this.w, this.y + this.h - 7, 7);
    ctx.lineTo(this.x + this.w, this.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 左侧高光
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(this.x + 1, this.y + 2, 2, this.h - 4);
    ctx.restore();
    this.renderContentsLabel(ctx);
  }
}
