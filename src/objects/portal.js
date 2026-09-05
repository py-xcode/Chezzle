// ============================================================================
// 传送门：同色两个为一组。物体（玩家/物块/沉淀）走入一门即传送到另一门。
// 传送规则 = "每扇门各自的进入/走出"（非冷却，针对单门）：
//   - 对象记录 _portalLast（上次进过的门）
//   - 与某门重叠且 _portalLast !== 该门 → 刚走入该门 → 传送到同色对侧，_portalLast = 对侧
//   - 不与该门重叠但 _portalLast === 该门 → 已走出该门 → 清空
// 效果：没离开 A 不能再进 A（避免来回弹）；但站在 A 里仍可进入别的门 B（小房间里
//   玩家太大出不了 A 时，能靠另一扇门逃生）。落点避开其它门 → 密集摆放也不连环传。
// n次门：可设可用次数（整组共享预算），每用一次扣 1，用尽后整组消失（旧 once:true = 1 次）。
// 落点检查：目标门脚底对齐、水平居中；被实心体/其它门堵住时按 8px 细步进退开找空位，
// 全堵死则本次不传——避免把物体塞进墙里被碰撞系统甩飞（"拥挤空间瞬移"）。
// ============================================================================

import { Obj } from './obj.js';
import { overlaps } from '../physics/collision.js';
import { applyInventorySetup } from '../level/items.js';
import { screenTextScale } from '../render/theme.js';

const EMBED_TOL = 8; // 落点嵌入实心体多少 px 以内仍可落（物理一帧即可温柔推开）
function overlapsBox(box, o, m = EMBED_TOL) {
  // 只有穿透明显（>m px）才算"挡住"：传送门旁常有薄墙/柱，落点伸进去几 px 很常见，
  // 交给碰撞封顶解压（≤16px/帧）即可；落点整个埋进厚墙（大穿透）才判堵。
  return box.x + m < o.x + o.w && box.x + box.w - m > o.x && box.y + m < o.y + o.h && box.y + box.h - m > o.y;
}

/** 落点 (x,y)（obj 的左上角）是否被挡：
 *  - 静态实心（地板/灯/开关/提取器…）挡
 *  - 动态实心里：可推动的物块让玩家推开即可（不挡），沉淀粒子可落脚（不挡）
 *  - 其它传送门（目标门 pair 除外）挡：落到别的门里会立即连环传
 *  strict=true（优先模式）：动态体一律挡——传送落点与其他物体（含可推物块）
 *  重叠会在下一帧被碰撞系统反复推挤：玩家推物体过门后两者落点重叠 → 抖动 /
 *  被弹飞（物体被推回门内又触发传送、来回瞬移）。找不到严格空位时再放宽。 */
function spotBlocked(obj, x, y, scene, pair, strict = false) {
  const box = { x, y, w: obj.w, h: obj.h };
  for (const s of scene.statics) if (s.solid && overlapsBox(box, s)) return true;
  for (const d of scene.dynamics) {
    if (d === obj || !d.solid || d.amount !== undefined) continue;
    if (strict) {
      if (overlapsBox(box, d, 0)) return true;
    } else if (!d.pushable && overlapsBox(box, d)) {
      return true;
    }
  }
  for (const p of scene.portals) {
    if (p === pair) continue;
    if (overlapsBox(box, p, 0)) return true; // 严格：任何重叠都不落在别的门里
  }
  return false;
}

/** 在同色门找落点：基准 = 脚底对齐门底边、水平居中（站在门里，脚踩门底座，而非对心
 *  ——对心会把高物体探出门底、撞上地板导致乱找空位）。被堵则按 8px 细步进在门旁退开
 *  （薄墙/柱挡个 5~10px 也轻松滑过去），全堵死返回 null。
 *  先用 strict 模式找"与其他物体零重叠"的落点（防传送后重叠抖动/弹飞），
 *  找不到再放宽为"不挡实心体即可"（保证传送不被完全阻塞）。 */
function findFreeSpot(obj, pair, scene) {
  const spot = searchSpot(obj, pair, scene, true);
  if (spot) return spot;
  return searchSpot(obj, pair, scene, false);
}

function searchSpot(obj, pair, scene, strict) {
  const cx = pair.x + pair.w / 2 - obj.w / 2;
  const cy = pair.y + pair.h - obj.h;
  // 螺旋候选：按距离门心由近到远，同一步长左右各试一次（否则会在窄通道里滑向一侧的远端）
  for (let dy = 0; dy <= Math.max(80, obj.h); dy += 20) {
    const y = Math.round(cy - dy);
    for (let dx = 0; dx <= obj.w + 16; dx += 8) {
      const xr = Math.round(cx + dx);
      if (!spotBlocked(obj, xr, y, scene, pair, strict)) return { x: xr, y };
      if (dx !== 0) {
        const xl = Math.round(cx - dx);
        if (!spotBlocked(obj, xl, y, scene, pair, strict)) return { x: xl, y };
      }
    }
  }
  return null;
}

export class Portal extends Obj {
  constructor({ x, y, w = 40, h = 64, color = '#c78bff', once = false, uses = Infinity, switchId = null, group = null, inventory = null, clearInventory = false, ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.color = color; // 外观色（不再承担配对职责——配对由 group 承担）
    this.group = group; // 组号（字符串）：同组 = 配对/共享预算/属性同步；null = 旧数据，按颜色兜底配对
    // n次门：可设可用次数（整组共享，任一扇配置的有限次数为整组预算），用尽整组消失；
    // once:true（旧数据）= 1 次
    this.uses = once ? 1 : uses;
    this.usesLeft = Number.isFinite(this.uses) ? this.uses : Infinity;
    this.switchId = switchId; // 绑定开关 id：开关有效开启时才可传送（null = 常开）
    // 传送后物品栏重置：inventory = 多行文本配置（解析见 items.parseInventorySetup），
    // clearInventory = 只清空不配送（勾选"清空物品栏"；两层语义：清空+装配 / 只清空）
    this.inventory = inventory ?? null;
    this.clearInventory = !!clearInventory;
    this.pair = null; // 对侧门（惰性解析）
  }

  get hoverLabel() {
    const grp = this.group ? `【组${this.group}】` : '';
    if (this.switchId) return grp + `传送门（需开关·可用${this.usesLeft}次）`;
    if (Number.isFinite(this.usesLeft)) return grp + `传送门（可用${this.usesLeft}次）`;
    return grp + '传送门';
  }

  /** 是否同组：有组号的按组号配对；旧数据（双方都无组号）按颜色兜底 */
  _sameGroup(o) {
    if (this.group != null || o.group != null) {
      return this.group != null && this.group === o.group;
    }
    return o.color === this.color; // 旧版本数据：无组号 → 按颜色配对（迁移前的兼容）
  }

  /** 是否可传送：绑定开关时要求开关有效开启（支持"&"联锁）；开关不存在视为关闭 */
  _isActive(scene) {
    if (!this.switchId) return true;
    const sw = scene.byId[this.switchId];
    if (!sw) return false;
    return typeof sw.effectiveOpen === 'function' ? sw.effectiveOpen(scene) : sw.open;
  }

  /**
   * 解析对侧门：本场景同组且非自身的另一扇（对侧被移除时重新解析）；
   * Multiscene 关卡（scene.multiscene）下配对**跨场景**：全局扫描所有场景的同组门——
   * 同组门在哪个场景都配对（跨场景传送；组号 = 配对单位，颜色只是外观）。
   * 旧数据无组号 → 按颜色兜底（同色配对）。同场景配对优先。
   */
  _resolvePair(scene) {
    const valid = this.pair && (
      scene.portals.includes(this.pair)
      || (this.pairScene && this.pairScene.portals.includes(this.pair))
    );
    if (valid) return this.pair;
    this.pair = null;
    this.pairScene = null;
    this.pairSceneName = null;
    for (const o of scene.portals) {
      if (o !== this && this._sameGroup(o)) {
        this.pair = o;
        break;
      }
    }
    if (this.pair) return this.pair;
    const M = scene.multiscene;
    if (M) {
      for (const [name, e] of M.scenes) {
        const sc = e && e.scene;
        if (!sc || sc === scene || !sc.portals) continue;
        for (const o of sc.portals) {
          if (o !== this && this._sameGroup(o)) {
            this.pair = o;
            this.pairScene = sc;
            this.pairSceneName = name;
            return o;
          }
        }
      }
    }
    return null;
  }

  update(dt, scene) {
    const pair = this._resolvePair(scene);
    if (!pair) return;
    const active = this._isActive(scene); // 绑定开关时只有开关开启才传送
    const crossScene = this.pairScene && this.pairScene !== scene;
    // 候选：动态体（玩家/物块）+ 自由沉淀粒子
    for (const obj of [...scene.dynamics, ...scene.particles]) {
      if (obj === this || obj.static) continue;
      const inside = overlaps(this, obj);
      if (inside && active && obj._portalLast !== this) {
        // 刚走入本门：传送到同色对侧门（落点避开实心体/其它门）。找不到空位说明对侧
        // 被完全堵死 → 本次不传，避免塞进墙里被碰撞系统甩飞。
        if (crossScene) {
          // ★ 跨场景传送（多边形关卡）：对侧门在另一个场景 → 落点=对侧门前 +
          //   Multiscene.switchTo 搬玩家（物品栏/血量保留）。只对玩家生效——
          //   物块/沉淀是场景内对象，不随玩家跨场景（会丢在旧场景里）。
          if (obj.isPlayerObj && scene.multiscene) {
            const spot = findFreeSpot(obj, pair, this.pairScene);
            if (!spot) continue;
            obj._portalLast = pair;
            scene.multiscene.switchTo(this.pairSceneName, {
              carryPlayer: true,
              portalLanding: true,
              spawn: { x: spot.x, y: spot.y },
            });
            this._applyInventory(obj);
            this._consumeUse(scene, pair);
          }
          continue;
        }
        const spot = findFreeSpot(obj, pair, scene);
        if (!spot) continue;
        obj.x = spot.x;
        obj.y = spot.y;
        obj._portalLast = pair; // 站在对侧门内：本门不重复触发；离开本门后才能再进本门
        this._applyInventory(obj);
        this._consumeUse(scene, pair);
      } else if (!inside && obj._portalLast === this) {
        // 已走出本门：允许下次再进本门
        obj._portalLast = null;
      }
    }
  }

  /** 传送门"物品栏重置"：只有玩家（有 inventory）生效；没配置不动（null/空文本）。
   *  配置 = this.inventory（多行文本或数组）+ this.clearInventory（只清空）。 */
  _applyInventory(obj) {
    if (!obj || !obj.inventory) return;
    if (this.inventory == null && !this.clearInventory) return;
    applyInventorySetup(obj, this.inventory, this.clearInventory);
  }

  /** n次门：整组共享剩余次数，用尽后整组消失（任一扇配置的有限次数 = 整组预算） */
  _consumeUse(scene, pair) {
    const lThis = Number.isFinite(this.usesLeft) ? this.usesLeft : Infinity;
    const lPair = pair && Number.isFinite(pair.usesLeft) ? pair.usesLeft : Infinity;
    const left = Math.min(lThis, lPair);
    if (left === Infinity) return;
    const newLeft = left - 1;
    if (newLeft <= 0) {
      scene.removeObject(this);
      if (pair) scene.removeObject(pair); // 同场景：pair 在本场景索引里
      if (pair && this.pairScene && this.pairScene !== scene) {
        this.pairScene.removeObject(pair); // 跨场景：pair 在对侧场景索引里
      }
    } else {
      this.usesLeft = newLeft;
      if (pair) pair.usesLeft = newLeft;
    }
  }

  render(ctx, opts) {
    // 渲染器传的是 opts（{ scene, time, ... }），必须先解出 scene 再访问 scene.byId
    const scene = opts?.scene ?? null;
    const t = scene?.time ?? 0;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const active = this._isActive(scene); // 绑定开关未开 → 熄灭
    const col = active ? this.color : '#4a4f70';
    const blur = active ? 14 : 0;
    ctx.save();
    // 外框（同色发光；未激活时熄灭）
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.shadowColor = active ? this.color : 'transparent';
    ctx.shadowBlur = blur;
    this._arch(ctx, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 内部漩涡（径向渐变 + 旋转符文粒子）
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, this.w * 0.55);
    g.addColorStop(0, active ? '#f2e6ff' : '#5a5f74');
    g.addColorStop(0.45, col);
    g.addColorStop(1, active ? 'rgba(90,42,154,0)' : 'rgba(60,60,80,0)');
    ctx.save();
    this._arch(ctx, 3);
    ctx.clip();
    ctx.fillStyle = g;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = t * 1.6 + (i / n) * Math.PI * 2;
      const rr = 4 + ((i * 37) % (this.w / 2));
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.8;
      ctx.fillStyle = 'rgba(242,230,255,0.85)';
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 顶部小标记（组色圆点）；组号标签（同组 = 配对/共享预算，玩家一眼看到归属）
    ctx.fillStyle = col;
    ctx.shadowColor = active ? this.color : 'transparent';
    ctx.shadowBlur = active ? 8 : 0;
    ctx.beginPath();
    ctx.arc(cx, this.y - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (this.group) {
      const kg = screenTextScale(ctx, 10, 11); // 组号保底（与路牌同档、上限 1.15）
      ctx.font = `bold ${Math.round(10 * kg * 10) / 10}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = active ? '#e8e0ff' : '#9fb2c8';
      ctx.strokeStyle = 'rgba(10,14,30,0.9)';
      ctx.lineWidth = 3;
      const t2 = `组${this.group}`;
      ctx.strokeText(t2, cx, this.y - 12 * kg);
      ctx.fillText(t2, cx, this.y - 12 * kg);
      ctx.textAlign = 'left';
    }
    // n次门：顶部显示剩余次数（无限次数不显示）——大号数字 + 深色底板（任何背景下可读）
    if (Number.isFinite(this.usesLeft)) {
      ctx.shadowBlur = 0;
      const kn = screenTextScale(ctx, 16, 12); // 次数数字保底 12px、上限 1.15（别盖过组号）
      ctx.font = `bold ${Math.round(16 * kn * 10) / 10}px monospace`;
      ctx.textAlign = 'center';
      const txt = String(this.usesLeft);
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(16,20,40,0.78)';
      ctx.beginPath();
      ctx.roundRect(cx - tw / 2 - 5 * kn, this.y - 31 * kn, tw + 10 * kn, 21 * kn, 6 * kn);
      ctx.fill();
      ctx.fillStyle = active ? '#ffffff' : '#9fb2c8';
      ctx.fillText(txt, cx, this.y - 16 * kn);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /** 拱形门路径 */
  _arch(ctx, inset) {
    const x = this.x + inset;
    const y = this.y + inset;
    const w = this.w - inset * 2;
    const h = this.h - inset * 2;
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }
}
