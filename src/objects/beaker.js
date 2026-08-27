// ============================================================================
// 烧杯：可承载任何物质（含玩家）的容器。杯壁（左/右/底）为实心碰撞体：
//   - 不能从侧面走进，只能跳过杯口进入；玩家太宽会卡在杯口下不去
//   - 受重力：无支撑时下落
//   - 玩家在杯内 → 跟随移动；玩家在杯外贴杯壁 → 推动
// ============================================================================

import { Container } from './container.js';
import { getSubstance } from '../chem/substances.js';
import { Obj } from './obj.js';
import { renderLiquid, solutionColor } from '../render/liquidrender.js';
import { rr } from '../render/theme.js';
import { Drip } from './drip.js';
import { shallowestSupportY, settleBodyOnSupport, horizontallyBlocked } from '../physics/support.js';

// ---- 倒出动画节奏（纯视觉会话，见 beginPour）----
const POUR_TRAVEL = 0.16; // 平移到目标旁的时长
const POUR_TILT_IN = 0.14; // 起倾时长
const POUR_BACK = 0.22; // 松手后回位时长
const POUR_HOLD_MAX = 0.45; // 按 X 续期的停留余量（连按/按住都保持不停留超时）
const POUR_MAX_ANG = 0.52; // 最大倾角（≈30°，弧度）
const POUR_LIFT = 5; // 倾倒时轻微抬升（手腕感）

let DRIP_SEQ = 0;

export class Beaker extends Container {
  get hoverLabel() {
    return '烧杯';
  }
  get isCarryItem() {
    return 'beaker';
  }
  constructor({ x, y, w = 60, h = 70, wall = 5, ...rest } = {}) {
    super({ x, y, w, h, ...rest });
    this.wall = wall;
    this.vy = 0;
    // 实心杯壁（左/右/底），跟随烧杯移动；顶口敞开（可跳入）
    // noLift：杯壁不被气泡柱气流托起（通入气体时气泡柱紧贴杯壁，不能把杯子顶飞）
    this.subBodies = [
      new Obj({ id: 'bk_l', x, y, w: wall, h, solid: true, physicsKind: 'dynamic', gravity: 0, mass: 1, noLift: true }),
      new Obj({ id: 'bk_r', x: x + w - wall, y, w: wall, h, solid: true, physicsKind: 'dynamic', gravity: 0, mass: 1, noLift: true }),
      new Obj({ id: 'bk_b', x, y: y + h - wall, w, h: wall, solid: true, physicsKind: 'dynamic', gravity: 0, mass: 1, noLift: true }),
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

  /**
   * 倒出会话（X 倒出时由 items.pourBeaker 调用；纯视觉，物理坐标不动）：
   * ① 杯身平移到目标容器旁（修正"目标在右动画仍朝左/落点不准"）；
   * ② 起倾 ~30°，杯口沿连续滴出液滴落入目标液面；
   * ③ 玩家按住/连按 X → 保持倾倒姿势不回位，松手 0.45s 后回弹归位。
   * 同一目标续倒不重跑位移（不顿挫）。
   */
  beginPour(scene, target) {
    if (!scene || typeof scene.addObject !== 'function') return;
    const dir = (target.x + (target.w ?? 0) / 2) >= (this.x + this.w / 2) ? 1 : -1;
    const gap = 6;
    if (this._pour && this._pour.target === target && this._pour.dir === dir) {
      this._pour.holdT = POUR_HOLD_MAX; // 续倒：只续停留
      return;
    }
    let standX = dir > 0 ? target.x - this.w - gap : target.x + target.w + gap;
    standX = Math.max(2, Math.min((scene.worldW ?? 2000) - this.w - 2, standX));
    this._pour = { target, dir, t: 0, fromX: this.x, standX, holdT: POUR_HOLD_MAX, lipEmit: 0, relAt: null };
  }

  /** 倒出会话推进：计算渲染偏移/倾角 + 杯口沿液滴发射 */
  updatePour(dt, scene) {
    const sess = this._pour;
    if (!sess) {
      this._visPour = null;
      return;
    }
    // X 按住且选中的正是本杯 → 续期停留；否则停留计时递减
    const sel = scene.player?.inventory?.selectedItem?.();
    if (scene.control && scene.control.has('use') && sel === this) sess.holdT = POUR_HOLD_MAX;
    else sess.holdT -= dt;

    sess.t += dt;
    if (sess.relAt == null && sess.holdT <= 0) sess.relAt = sess.t; // 开始回位
    const standOff = sess.standX - sess.fromX;

    let offK = 0;
    let angK = 0;
    if (sess.relAt != null) {
      const tr = sess.t - sess.relAt;
      if (tr >= POUR_BACK) {
        this._pour = null;
        this._visPour = null;
        return;
      }
      const k0 = 1 - tr / POUR_BACK;
      const k = k0 * k0 * (3 - 2 * k0); // smoothstep 回位
      offK = k;
      angK = k;
    } else {
      const pt = Math.min(1, sess.t / POUR_TRAVEL);
      offK = 1 - Math.pow(1 - pt, 3); // easeOutCubic 平移
      const at = Math.min(1, Math.max(0, (sess.t - POUR_TRAVEL) / POUR_TILT_IN));
      angK = at * at * (3 - 2 * at); // smoothstep 起倾
    }

    const ang = POUR_MAX_ANG * angK;
    const offX = standOff * offK;
    const liftY = -POUR_LIFT * angK;
    this._visPour = { offX, liftY, aSign: sess.dir, ang };

    // 杯口沿液滴：倾斜到位后从旋转后的口沿位置滴落，落向目标液面
    if (ang > 0.16 && offK > 0.9 && scene.addObject) {
      sess.lipEmit -= dt;
      if (sess.lipEmit <= 0) {
        sess.lipEmit = 0.065;
        const a = sess.dir * ang;
        const pvx = this.x + offX + this.w / 2;
        const pvy = this.y + this.h + liftY;
        const lx0 = sess.dir > 0 ? this.w / 2 - 4 : -(this.w / 2 - 4);
        const ly0 = 8 - this.h;
        const wx = pvx + lx0 * Math.cos(a) - ly0 * Math.sin(a);
        const wy = pvy + lx0 * Math.sin(a) + ly0 * Math.cos(a);
        const tgt = sess.target.innerRect ? sess.target.innerRect() : { x: sess.target.x + 4, y: sess.target.y + 4, w: sess.target.w - 8, h: sess.target.h - 8 };
        scene.addObject(new Drip({
          x: wx - 2,
          y: wy + 2,
          targetY: tgt.y + 4,
          color: solutionColor(this.solution).color,
          id: `drip${++DRIP_SEQ}`,
        }));
      }
    }
  }

  /** 无支撑时受重力下落，落到**最浅**支撑面停住（statics + 玩家等实心动态体；
   *  跨在池沿/台阶上不沉入更深的盆底——见 physics/support.js 的语义说明） */
  applyGravity(dt, scene) {
    settleBodyOnSupport(this, dt, shallowestSupportY(this, scene));
  }

  update(dt, scene) {
    super.update(dt, scene); // 颗粒沉降等容器逻辑
    this.applyGravity(dt, scene);
    this.updatePour(dt, scene);
    const p = scene.player;
    if (!p) return;
    const inner = this.innerRect();
    // 玩家在杯外贴杯壁朝内移动 → 推动烧杯（杯内携带放到 lateUpdate，按实际位移）。
    // 推之前先看路：前方有实心体（池盆壁/其他装置）就推不动——不穿模。
    if (!this.containsObj(p) && Math.abs(p.vel.x) > 0.1) {
      const push = p.vel.x * dt;
      const aligned = p.bottom > inner.y && p.top < inner.y + inner.h;
      if (push > 0 && p.right >= this.x - 2 && p.right <= this.x + this.wall + 2 && aligned) {
        const nx = this.x + push;
        if (!horizontallyBlocked(this, nx, scene)) this.x = nx;
      } else if (push < 0 && p.left <= this.x + this.w + 2 && p.left >= this.x + this.w - this.wall - 2 && aligned) {
        const nx = this.x + push;
        if (!horizontallyBlocked(this, nx, scene)) this.x = nx;
      }
    }
  }

  /** 物理结算后：杯内玩家与烧杯互相带动——烧杯跟随玩家的水平位移；玩家跟随烧杯的竖直位移。
   *  **下行带动护栏**：玩家跟随下移时不得被压进任何实心静态体（嵌池穿模根因——
   *  原实现是裸 p.y += dy 瞬移）；脚部将越过原本位于其下方的实心顶面时裁剪到表面。 */
  lateUpdate(dt, scene) {
    const p = scene.player;
    if (p && this.containsObj(p)) {
      // 烧杯跟随玩家的水平位移（杯壁挡住时玩家不移动 → 烧杯也不动，不甩出）
      const dx = p.x - (this._prevPx ?? p.x);
      if (Math.abs(dx) > 0.01) this.x += dx;
      // 玩家跟随烧杯的竖直位移（烧杯下落/被抬起时玩家一起移动，不脱离）
      const dy = this.y - (this._prevBy ?? this.y);
      if (Math.abs(dy) > 0.01) {
        let ny = p.y + dy;
        if (dy > 0) {
          for (const s of scene.statics) {
            if (!s.solid) continue;
            if (!(s.x < p.x + p.w && s.x + s.w > p.x)) continue; // 水平重叠
            const feet = p.y + p.h;
            if (feet <= s.y + 0.5 && ny + p.h > s.y) ny = Math.min(ny, s.y - p.h); // 脚下实心顶面：裁到表面
          }
        }
        p.y = ny;
      }
    }
    this._prevPx = p ? p.x : this._prevPx;
    this._prevBy = this.y;
    this.syncWalls();
  }

  render(ctx, scene) {
    // 倒出会话变换：平移到目标旁 + 轻微抬升 + 倾斜（液体/颗粒/杯体整体）
    ctx.save();
    const vp = this._visPour;
    if (vp && (Math.abs(vp.offX) > 0.01 || vp.ang > 0.001)) {
      const cx = this.x + vp.offX + this.w / 2;
      const cy = this.y + this.h;
      ctx.translate(cx, cy);
      ctx.rotate(vp.aSign * vp.ang);
      ctx.translate(-cx, -cy - vp.liftY);
    }
    // 液体（元素发光液面；液面高度 = 实际液体量/容量——吸液/倒出后可见升降）
    const inner = this.innerRect();
    if (inner.w > 0 && inner.h > 0) {
      const vol = this.solution.volume > 0 ? this.solution.volume : Infinity;
      const lh = inner.h * Math.max(0, Math.min(1, this.solution.totalMass() / vol));
      if (lh > 2) renderLiquid(ctx, inner.x, inner.y + inner.h - lh, inner.w, lh, this.solution, scene.time ?? 0);
    }
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
    ctx.restore(); // 倾旋包裹结束
    this.renderContentsLabel(ctx);
  }
}
