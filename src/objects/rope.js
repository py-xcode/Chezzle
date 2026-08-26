// ============================================================================
// 绳子：细线，悬挂一个物体。锚点可为固定坐标或跟随某物体（相对坐标）。
// 悬挂物体的位置完全由绳子决定（lateUpdate：物理结算后再定位，避免被推走）。
// 每刻检查：锚点物体不存在，或悬挂物体目标位置被实心体卡住 → 断绳。
// 断绳后绳子消失，悬挂物体恢复重力。
// ============================================================================

import { Obj } from './obj.js';
import { overlaps } from '../physics/collision.js';
import { THEME } from '../render/theme.js';

export class Rope extends Obj {
  constructor({ x = 0, y = 0, length = 100, anchor, hanging, ...rest } = {}) {
    super({ x, y, w: 2, h: length, solid: false, physicsKind: 'none', ...rest });
    this.length = length;
    this.anchor = anchor; // {fixed:{x,y}} | {obj, dx?, dy?}
    this.hanging = hanging; // 悬挂物体（Obj）
    this.broken = false;
    // 悬挂期间物体不受重力，位置由绳子决定
    if (hanging) {
      hanging.gravity = 0;
      // 初始把悬挂物放到锚点+长度处，避免构造时的初始偏移被误判为"被推动"
      const a = this.anchorPoint();
      hanging.x = a.x - hanging.w / 2;
      hanging.y = a.y + length - hanging.h;
    }
  }

  anchorPoint() {
    if (this.anchor.fixed) return { x: this.anchor.fixed.x, y: this.anchor.fixed.y };
    const o = this.anchor.obj;
    return { x: o.x + (this.anchor.dx ?? 0), y: o.y + (this.anchor.dy ?? 0) };
  }

  lateUpdate(dt, scene) {
    if (this.broken || !this.hanging) return;
    // 锚点物体消失 → 断绳
    if (this.anchor.obj && !scene.byId[this.anchor.obj.id]) {
      this.break(scene);
      return;
    }
    // 悬挂物体被删除（如开关 deleteId 移除了它）→ 断绳
    if (!scene.byId[this.hanging.id]) {
      this.break(scene);
      return;
    }
    let a = this.anchorPoint();
    // 区分"推的是锚点"还是"推的是悬挂物"：
    //  - 锚点本 tick 移动（玩家推锚点）→ 悬挂物跟随即可，不平移锚点
    //  - 锚点没动但悬挂物被推离期望 → 平移锚点（绳子刚性，整个系统一起动）
    const anchorDx = a.x - (this._prevAnchorX ?? a.x);
    const tx = a.x - this.hanging.w / 2;
    const dx = this.hanging.x - tx;
    if (!(Math.abs(anchorDx) > 0.5) && this.anchor.obj && Math.abs(dx) > 0.5) {
      this.anchor.obj.x += dx;
      a.x += dx;
    }
    this._prevAnchorX = a.x;
    this.x = a.x;
    this.y = a.y;
    const nx = a.x - this.hanging.w / 2;
    const ny = a.y + this.length - this.hanging.h;
    this.hanging.x = nx;
    this.hanging.y = ny;
    this.hanging.vel = { x: 0, y: 0 };
    // 目标位置被实心体卡住 → 断绳
    for (const s of scene.statics) {
      if (overlaps(this.hanging, s)) {
        this.break(scene);
        return;
      }
    }
  }

  break(scene) {
    this.broken = true;
    if (this.hanging) this.hanging.gravity = 1;
    scene.removeObject(this);
  }

  render(ctx) {
    ctx.save();
    ctx.strokeStyle = THEME.gold.base;
    ctx.lineWidth = 2;
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = 5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x, this.y + this.length);
    ctx.stroke();
    ctx.setLineDash([]);
    // 顶端小锚环
    ctx.strokeStyle = THEME.gold.light;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
