// ============================================================================
// 碰撞系统
// ----------------------------------------------------------------------------
// 分轴解算：先 X 后 Y。两轴都按小步长移动（≤ maxXStep / maxYStep），避免高速穿过
// 薄墙/薄板；被挡时在精确边界停下。静态体（地板）阻挡所有动态体；动态体彼此仅在
// 双方 solid 时碰撞；可推动物块被水平链式推挤，单次推挤不超过一个步长，被挡则
// 整体还原、推动方停住。自动上台阶：被台阶阻挡且高度差 ≤ autoStepMax 时直接走上。
//
// 防穿模/防瞬移的关键设计：
//  1. 撞顶/落地按"本子步移动前的相对位置"判定接触面，钳制后立即停止剩余子步——
//     旧代码在撞顶钳制后子步继续上移，留下嵌入，随后被"宽面抬升"一帧帧顶穿到
//     板顶（"跳到池底上方"的瞬移）。现在撞顶即停在板底，永不嵌入。
//  2. X 轴只解算真正的侧面接触；正在落地（底边浅入）或撞顶（头顶浅入）时不横推，
//     交给 Y 轴——杜绝"落地瞬间被横向甩出 16px"的落地瞬移，也杜绝深嵌时一帧帧
//     横向漂移。
//  3. 每刻末尾的残余重叠解算（4 面 MTV：取上/下/左/右四个面中最小穿透量推出，
//     单次封顶 MAX_RESOLVE_X/Y）：处理斜向冲入板底、出生嵌入实心、传送落点、
//     爆炸推挤等轴解算覆盖不到的残留。穿透最小的面 = 体离哪边最近，推出方向必然
//     把体送回它来的那一侧——被池底顶住时只会被推回下方，绝不会被顶到上方。
//  4. 深嵌入（传送/出生/爆炸后）按 ≤16px/帧温柔推出，不一次性大位移。
//
// 已知简化（MVP）：推挤不"携带"堆叠在上方的物块（上方物块会短暂失去支撑而后落下）；
// 下落速度被钳制以防穿墙。
// ============================================================================

import { AABB } from './aabb.js';

/** 单次穿透解压的最大位移（px）：任何一帧都不会"一次性推出很远"而显得瞬移。 */
const MAX_RESOLVE_X = 16;
const MAX_RESOLVE_Y = 16;
/** 垂直面接触的判定阈值（px）：小于此值的穿透按"落地/撞顶"处理，不做横向解算；
 *  大于此值的深嵌入交给 MTV 按最小穿透面推出。 */
const STEP_MAX = 32;

/** 某体的碰撞形状列表（世界坐标 AABB）。默认单矩形；网格类对象返回贴合物质的多矩形 */
export function shapesOf(b) {
  const list = b && typeof b.getShapes === 'function' ? b.getShapes() : [b.collider()];
  return list.map((s) => (s && typeof s.overlaps === 'function' ? s : new AABB(s.x, s.y, s.w, s.h)));
}

export function overlaps(a, b, eps = 0) {
  const sa = shapesOf(a);
  const sb = shapesOf(b);
  for (const x of sa) for (const y of sb) if (x.overlaps(y, eps)) return true;
  return false;
}

/**
 * 该动态体是否能被"站上去"（提供支撑）：
 * 沉淀粒子（有 amount）必须**结构稳定**——落地静止（onGround 且速度接近 0）
 * 且**持续 ≥STABLE_T**（本帧之前已经稳稳地歇了 0.45s）才可垫脚：
 *   1. 正在下落/刚放置的沉淀不能给玩家提供向上的支持力（"跳→下落瞬间放置→
 *      左脚踩右脚上天"的第一个漏洞）；
 *   2. 刚落定不到 0.45s 的新鲜层同样不支撑（"跳→空中放→回落踩住新层→每跳
 *      垫高 4px 无限飞天"的第二个漏洞——沙要踩实了才立得住）。
 * 普通物块/玩家随时可站。
 */
const STABLE_T = 0.45;
function supportsStanding(o) {
  if (o.amount === undefined) return true;
  // 玩家"放置"的沉淀（origin.kind === 'place'）**永远不提供垫脚支撑**——左脚踩右脚
  // 的本源：自己刚放到脚下的支撑物不能立脚（跳→放→落回→垫高的循环直接断根）。
  // 关卡预设沉淀堆（Deposit 物化）/反应沉降等（非 place）落地静止 ≥STABLE_T
  // （踩实）后才可被踩（真·沙堆站稳）。
  if (o.origin?.kind === 'place') return false;
  return o.onGround === true && Math.abs(o.vel.x) < 40 && Math.abs(o.vel.y) < 40 && o.stable === true;
}

/**
 * 四面穿透量：对每对重叠的碰撞形状，计算从 上/下/左/右 四个面的最小穿透深度。
 * 某面没有重叠时为 Infinity（该面不构成候选）。
 * 用"形状对"而非整个 AABB：被完全腐蚀掉的部分（无形状）不参与，也不挡人。
 */
function penSides(b, o) {
  const sb = shapesOf(b);
  const so = shapesOf(o);
  let top = Infinity;
  let bottom = Infinity;
  let left = Infinity;
  let right = Infinity;
  for (const a of sb) {
    for (const c of so) {
      if (!a.overlaps(c, 0)) continue;
      top = Math.min(top, a.bottom - c.top);
      bottom = Math.min(bottom, c.bottom - a.top);
      left = Math.min(left, c.right - a.left);
      right = Math.min(right, a.right - c.left);
    }
  }
  return { top, bottom, left, right };
}

/**
 * X 轴是否应该做横向解算？
 * 垂直面接触（正在落地/撞顶，或深嵌但 MTV 会选垂直轴）时返回 false，把体交给
 * Y 轴/MTV——否则横向解算会把刚落到表面的体横着甩出去（"落地瞬移"），或在深嵌
 * 宽地板里一帧帧横向漂移。
 */
function xShouldResolve(b, p) {
  const mHor = Math.min(p.left, p.right);
  if (b.vel.y > 0) return !(p.top < mHor); // 下落中：底边穿透更小 → 落地接触，不横推
  if (b.vel.y < 0) return !(p.bottom < mHor); // 上升中：头顶穿透更小 → 撞顶接触，不横推
  // 静止：浅穿透（≤STEP_MAX）可能是台阶/矮墙侧擦，保持旧语义（横向阻挡）；
  // 只有深嵌入且垂直轴占优时才放行给 MTV 垂直解压，避免横向漂移。
  const vert = Math.min(p.top, p.bottom);
  return !(vert > STEP_MAX && vert < mHor);
}

/**
 * 残余重叠 4 面 MTV 解算：把 b 沿"穿透最小的面"推出 o（单次封顶；深嵌入分帧推出）。
 * 由上一子步位置无法判定接触面的残留重叠（斜向冲入、出生嵌入、传送落点、爆炸
 * 推挤）都走这里——穿透最小的面就是体离哪边最近，推出方向必然把体送回它来的那侧，
 * 杜绝"被顶穿到另一面"（如被池底顶到池子上方）。
 */
function resolveEmbed(b, o) {
  const p = penSides(b, o);
  let side = null;
  let pen = Infinity;
  if (p.top <= pen) { side = 'top'; pen = p.top; }
  if (p.bottom < pen) { side = 'bottom'; pen = p.bottom; }
  if (p.left < pen) { side = 'left'; pen = p.left; }
  if (p.right < pen) { side = 'right'; pen = p.right; }
  if (side === null || pen === Infinity) return false;
  // 方向修正：MTV 选了"向下推出"（穿透最小的面在下方），但 b 的顶已在 o 的顶之上
  // ——b 不可能在 o 下方（否则顶不会高过 o 的顶），它只可能是从上方嵌入的，改判落地。
  // 典型：大物块放进池里时底边嵌进池底壁（旧代码的"宽面抬升"就为此存在），
  // 以及出生时顶恰好与地面齐平的深嵌。只对"非上升"的体生效：上升中（vel.y<0）的
  // 体是刚从下方冲上来的（如跳起斜撞池底），必须维持 MTV 的向下推出，否则会被
  // 抬到板上方——正是要杜绝的"瞬移到上面"。反过来（顶在 o 顶之下）则维持 MTV 的
  // 向下，保证撞池底/悬空板底时只会被推回下方、绝不会被抬到上方。
  if (side === 'bottom' && b.top <= o.top + 0.5 && b.vel.y >= 0) side = 'top';
  // 支撑接触保护：b 的底不高于 o 的底（b 基本在 o 正下方）时，side=bottom 的"下压"
  // 实际上是把支撑物压走——典型：物块被站在上面的玩家"踩"着，每 tick 被压进地板
  // 1.33px，玩家与物块一起下沉（"骑着物块沉地"）。这种重叠的正确解是抬 o（o 侧的
  // resolveEmbed 会按 top 面把 o 抬回 b 的顶），b 侧跳过即可。静态体（地板）除外：
  // b 嵌在地板里且底不高于地板底时仍需向下推出。
  if (side === 'bottom' && b.bottom >= o.bottom - 0.5 && !o.static) return false;
  const move = Math.min(pen, side === 'top' || side === 'bottom' ? MAX_RESOLVE_Y : MAX_RESOLVE_X);
  switch (side) {
    case 'top':
      b.y -= move;
      b.vel.y = 0;
      if (move >= pen) b.onGround = true; // 完全落地才给支撑（分帧推出期间不算）
      break;
    case 'bottom':
      b.y += move; // 从板底下方推出：向下送回，绝不向上顶穿
      b.vel.y = 0;
      break;
    case 'left':
      b.x += move;
      b.vel.x = 0;
      break;
    case 'right':
      b.x -= move;
      b.vel.x = 0;
      break;
  }
  return true;
}

/**
 * 沿穿透较小的那一侧推出（对"已嵌入"的重叠最温和，避免大跨度瞬移）。
 * 只在 X 轴判定为"侧面接触"时才调用（见 xShouldResolve）。
 */
function resolveOverlapX(b, o) {
  const sb = shapesOf(b);
  const so = shapesOf(o);
  let leftPen = Infinity;
  let rightPen = Infinity;
  for (const a of sb) {
    for (const c of so) {
      if (!a.overlaps(c, 0)) continue;
      leftPen = Math.min(leftPen, c.right - a.left);
      rightPen = Math.min(rightPen, a.right - c.left);
    }
  }
  if (leftPen === Infinity || rightPen === Infinity) return;
  if (leftPen < rightPen) b.x += Math.min(leftPen, MAX_RESOLVE_X);
  else b.x -= Math.min(rightPen, MAX_RESOLVE_X);
}

export class CollisionSystem {
  constructor({ gravity = 1200, autoStepMax = 14, maxFallSpeed = 1500, maxYStep = 6, maxXStep = 6, groundFriction = 0, airFriction = 0 } = {}) {
    this.gravity = gravity;
    this.autoStepMax = autoStepMax;
    this.maxFallSpeed = maxFallSpeed;
    this.maxYStep = maxYStep; // Y 分步移动的最大步长（防穿模）
    this.maxXStep = maxXStep; // X 分步移动的最大步长（防穿墙 / 防推挤瞬移）
    this.groundFriction = groundFriction; // 落地物体的水平摩擦系数（1/s，衰减速度）
    this.airFriction = airFriction; // 空气摩擦（1/s，仅水平）：空中不无限漂移
  }

  step(dt, { dynamics, statics }) {
    this.dt = dt;
    this._buildHash(dynamics, statics); // 空间哈希宽相位（粒子堆 O(N²)→ 邻域 O(N)）
    for (const b of dynamics) {
      b.onGround = false;
      b.blockedX = false;
      b.collisions = [];
    }
    // 重力
    for (const b of dynamics) {
      if (!b.static && b.gravity > 0) {
        b.vel.y += this.gravity * b.gravity * dt;
        if (b.vel.y > this.maxFallSpeed) b.vel.y = this.maxFallSpeed;
      }
    }
    // X 积分（含推挤、自动上台阶）
    for (const b of dynamics) this.integrateX(b, dynamics, statics);
    // Y 积分（落地、撞顶、堆叠）
    for (const b of dynamics) this.integrateY(b, dynamics, statics);
    // 残余重叠分离（斜向冲入/出生嵌入/传送落点/爆炸推挤）：4 面 MTV，小步推出
    this.resolveResidual(dynamics, statics);
    // 地面摩擦：落地的动态体水平速度快速衰减——爆炸/踢飞后的物体不会永远滑行
    for (const b of dynamics) {
      if (b.onGround && b.vel.x !== 0) {
        b.vel.x *= Math.max(0, 1 - this.groundFriction * dt);
        if (Math.abs(b.vel.x) < 5) b.vel.x = 0;
      }
    }
    // 空气摩擦（仅水平）：空中/气泡柱上玩家和物块不会无限漂移；不影响垂直提升
    if (this.airFriction > 0) {
      for (const b of dynamics) {
        if (b.vel.x !== 0) {
          b.vel.x *= Math.max(0, 1 - this.airFriction * dt);
          if (Math.abs(b.vel.x) < 2) b.vel.x = 0;
        }
      }
    }
    // 颗粒"结构稳定"计时：落地静止（onGround + 慢速）持续 STABLE_T 才 marked stable，
    // 可被踩（支撑）；一旦离地/移动立即作废——放置的新鲜层必须"踩实"才能垫脚。
    for (const b of dynamics) {
      if (b.amount === undefined) continue;
      if (b.onGround && Math.abs(b.vel.x) < 40 && Math.abs(b.vel.y) < 40) {
        b._groundT = (b._groundT ?? 0) + dt;
        b.stable = b._groundT >= STABLE_T;
      } else {
        b._groundT = 0;
        b.stable = false;
      }
    }
  }

  // ---- 空间哈希宽相位（相对全 O(N²) 配对：大粒度堆/多粒子场景的关键加速） ----
  _buildHash(dynamics, statics) {
    this._B = 48;
    this._hashMap = new Map();
    this._hashBig = [];
    this._stSet = new Set(statics);
    this._hashAll = dynamics; // 标记：本批体已建哈希（relax/直接调用兜底）
    const push = (b) => {
      const x0 = Math.floor(b.x / this._B);
      const x1 = Math.floor((b.x + b.w) / this._B);
      const y0 = Math.floor(b.y / this._B);
      const y1 = Math.floor((b.y + b.h) / this._B);
      if (x1 - x0 > 3 || y1 - y0 > 3) { this._hashBig.push(b); return; } // 大物体(地板/长墙):全局
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const k = cx * 8192 + cy;
          const arr = this._hashMap.get(k);
          if (arr) arr.push(b);
          else this._hashMap.set(k, [b]);
        }
      }
    };
    for (const d of dynamics) push(d);
    for (const s of statics) push(s);
  }

  /** b 的候选碰撞体（自身覆盖桶里的所有体 + 大物体）。每帧构建一次，每体调用一次。 */
  _near(b) {
    const out = this._hashBig.slice();
    const x0 = Math.floor(b.x / this._B);
    const x1 = Math.floor((b.x + b.w) / this._B);
    const y0 = Math.floor(b.y / this._B);
    const y1 = Math.floor((b.y + b.h) / this._B);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this._hashMap.get(cx * 8192 + cy);
        if (arr) for (const o of arr) out.push(o);
      }
    }
    return out;
  }

  // ---- X 轴 ----
  integrateX(b, dynamics, statics) {
    const total = b.vel.x * this.dt;
    if (total === 0) return;
    const dir = Math.sign(total);
    let remaining = Math.abs(total);
    // 分步移动：每步 ≤ maxXStep。既防高速穿过薄墙，也让推挤按小步进行（不一次性位移过大）。
    while (remaining > 1e-6) {
      const step = Math.min(remaining, this.maxXStep);
      remaining -= step;
      b.x += dir * step;

      // 静态体：垂直面接触（落地/撞顶）不横推，交给 Y 轴/MTV；真侧面接触才阻挡
      let blocked = false;
      for (const s of this._near(b)) {
        if (s === b || !s.solid || !this._stSet.has(s)) continue;
        if (!overlaps(b, s)) continue;
        // 自动上台阶：低台阶直接抬升并通过（不夹紧 X，让玩家走上台阶）
        if (b.autoStep && this.tryAutoStep(b, s, dir)) continue;
        const p = penSides(b, s);
        if (!xShouldResolve(b, p)) continue; // 垂直面接触：不在这里解算
        resolveOverlapX(b, s);
        b.blockedX = true;
        b.collisions.push(s);
        blocked = true;
        break;
      }
      if (blocked) break;

      // 动态体
      for (const o of this._near(b)) {
        if (o === b || !o.solid || !b.solid || this._stSet.has(o)) continue;
        // 可推物体用 eps 把"相切/微距"也算接触（玩家贴着物块底部侧面也应推动它，
        // 而不是从边界相切处穿过；玩家站在矮堆顶上也能推它而不是被当台阶走上去）
        if (!overlaps(b, o, o.pushable ? 2 : 0)) continue;
        // 颗粒堆"软"：水平永不阻挡（大沉淀滩可穿行——粒子慢慢让位）。
        // 否则 5px 粒子堆对玩家是一堵墙（"大型沉淀把玩家堵死"）。
        // ★ 让位 = 极慢挤开（30px/s 上限、空气摩擦自行衰减），而不是旧版的 150 速度
        //    "踢飞"——那个会把整堆弹散、滚得老远、无法收集（用户反馈）。
        // 只对"移动中"的体让位：静止的玩家（如刚放置自身脚下沉淀）不被扰动，可站上去。
        if (o.amount !== undefined) {
          if (o.pushable && (Math.abs(b.vel.x) > 30 || Math.abs(b.vel.y) > 100) && Math.abs(o.vel.x) < 30) {
            const dir = Math.abs(b.vel.x) > 2 ? Math.sign(b.vel.x) : (b.vel.x < 0 ? -1 : 1);
            if (Math.abs(o.vel.x) < 15) o.vel.x = dir * 30;
          }
          continue;
        }
        // 颗粒（b）撞上实体（物块/玩家）：颗粒是"软体"，绝不推走/顶开实体（大沉淀堆
        // 不会把物块挤走）——颗粒自己被实体挡住（与静态体同语义），继续的位移交给
        // 后续子步/空余让位。
        if (b.amount !== undefined) {
          const p = penSides(b, o);
          if (!xShouldResolve(b, p)) continue; // 垂直面接触（落地/撞顶）：交给 Y 轴
          resolveOverlapX(b, o);
          b.vel.x = 0;
          b.blockedX = true;
          b.collisions.push(o);
          break;
        }
        const p = penSides(b, o);
        if (!xShouldResolve(b, p)) continue;
        // 站在物块顶上（接触来自上方，只差亚像素）：把 b 顶回表面即可，不横向推/挡
        if (b.y < o.y && b.bottom <= o.top + 1.5 && supportsStanding(o)) {
          // 推动中的玩家站到小沉淀上 → 优先踢开沉淀（推动优先于上台阶/踮脚）
          if (o.amount !== undefined && o.pushable && Math.abs(b.vel.x) > 50) {
            this.kickParticle(o, b, statics);
            continue;
          }
          b.setBottom(o.top);
          continue;
        }
        if (o.pushable && this.tryPushX(o, dir, dynamics, statics, b, 0)) {
          continue; // 推开了，继续本子步的移动
        }
        resolveOverlapX(b, o);
        b.blockedX = true;
        b.collisions.push(o);
        break;
      }
      if (b.blockedX) break;
    }
  }

  /**
   * 链式推挤：把 o 沿 dir 推出与 from 的重叠。单次最多推 maxXStep（残留重叠交给
   * 后续子步/下一帧处理），避免一次位移过大造成瞬移或穿墙。若途中被实心体挡住则
   * 整体还原并返回 false（推动方随之停住）。
   */
  tryPushX(o, dir, dynamics, statics, from, depth) {
    if (depth > 8 || !o.pushable) return false;
    if (dir === 0) dir = o.x < from.x ? -1 : 1;
    const overlap = dir > 0 ? from.right - o.left : o.right - from.left;
    if (overlap <= 0) return true;
    const move = Math.min(overlap, this.maxXStep) * (dir > 0 ? 1 : -1);

    const savedX = o.x;
    o.x += move;
    let ok = true;
    for (const s of this._near(o)) {
      if (!s.solid || !this._stSet.has(s) || !overlaps(o, s)) continue;
      // 小台阶：被推动时把物块抬上台阶（同玩家自动上台阶，不夹紧 X）
      if (o.autoStep && this.tryAutoStep(o, s, dir)) continue;
      ok = false;
      break;
    }
    if (ok) {
      for (const d of this._near(o)) {
        if (d === o || d === from || !d.solid || !o.solid || this._stSet.has(d)) continue;
        if (overlaps(o, d)) {
          // 沉淀粒子是"软体"，不挡推挤链：被推物块直接让粒子让位（不递归、不算失败）——
          // 否则一排在物块底缘/侧面的粒子会变成"粒子坝"，把物块卡死、玩家推不动。
          if (d.amount !== undefined && d.pushable) {
            d.x += move;
            continue;
          }
          if (!d.pushable || !this.tryPushX(d, dir, dynamics, statics, o, depth + 1)) {
            ok = false;
            break;
          }
        }
      }
    }
    if (!ok) o.x = savedX;
    return ok;
  }

  /** 判定是否为可自动上行的矮台阶：是则抬升并返回 true（不夹紧 X） */
  tryAutoStep(b, s, dir) {
    if (!dir) return false;
    const inFront = dir > 0
      ? s.left <= b.right + 0.01 && s.right >= b.right
      : s.right >= b.left - 0.01 && s.left <= b.left;
    if (!inFront) return false;
    const rise = b.bottom - s.top; // 需抬升的高度（台阶顶高于脚底）
    if (!(rise > 0 && rise <= this.autoStepMax)) return false;
    b.setBottom(s.top);
    return true;
  }

  // ---- Y 轴 ----
  integrateY(b, dynamics, statics) {
    const dy = b.vel.y * this.dt;
    // 分步移动：每步 ≤ maxYStep，防快速下落穿过薄地板
    const steps = Math.max(1, Math.ceil(Math.abs(dy) / this.maxYStep));
    const stepDy = dy / steps;
    for (let s = 0; s < steps; s++) {
      const prevBottom = b.bottom;
      const prevTop = b.top;
      if (stepDy !== 0) b.y += stepDy;
      this._resolveYStep(b, prevBottom, prevTop, dynamics, statics);
      // 落地或撞顶（vel.y 已被清零）后立即停止剩余子步：否则后续子步继续移动，
      // 把刚贴住表面的体又压回实心体里（旧代码正是"钳制后残留嵌入 → 被顶穿"）。
      if (b.vel.y === 0) break;
    }
  }

  _resolveYStep(b, prevBottom, prevTop, dynamics, statics) {
    const dir = Math.sign(b.vel.y);
    for (const s of this._near(b)) {
      if (!s.solid || !this._stSet.has(s) || !overlaps(b, s)) continue;
      b.collisions.push(s);
      // 按"本子步移动前"的相对位置判定接触面：前一子步脚在 s 顶上方才落地，
      // 头在 s 底下方才撞顶；其余（斜向嵌入等）留给 tick 末尾的 MTV 残余解算。
      if (dir > 0) {
        if (prevBottom <= s.top + 0.5) this._landOn(b, s);
        else if (prevTop >= s.bottom - 0.5) this._ceilingClamp(b, s);
      } else if (dir < 0) {
        if (prevTop >= s.bottom - 0.5) this._ceilingClamp(b, s);
        else if (prevBottom <= s.top + 0.5) this._landOn(b, s);
      }
    }

    for (const o of this._near(b)) {
      if (o === b || !o.solid || !b.solid || this._stSet.has(o)) continue;
      if (!overlaps(b, o)) continue;
      b.collisions.push(o);
      if (dir > 0) {
        if (prevBottom <= o.top + 1 && supportsStanding(o)) {
          this._landOn(b, o); // 从上方落到 o 上（下落中的沉淀不提供支撑）
        } else if (o.amount !== undefined && o.pushable && Math.abs(b.vel.x) > 50) {
          this.kickParticle(o, b, statics); // 推动中的玩家碰到可推沉淀：水平推开
        }
        // 注意：下沉时不做"撞顶钳制"。b 的顶贴着 o 的底 = 支撑接触（o 站在 b 上），
        // 不是碰撞——钳制会把下方物块吸死在玩家脚底，玩家移动时带着物块走
        // （"骑物块"bug 的根因）。支撑接触由 o 侧的 _landOn / MTV 抬升处理。
      } else if (dir < 0) {
        if (prevTop >= o.bottom - 1) {
          this._ceilingClamp(b, o);
        } else if (prevBottom <= o.top + 1 && supportsStanding(o)) {
          this._landOn(b, o);
        } else if (o.amount !== undefined && o.pushable && Math.abs(b.vel.x) > 50) {
          this.kickParticle(o, b, statics);
        }
      } else if (o.amount !== undefined && o.pushable && Math.abs(b.vel.x) > 50) {
        this.kickParticle(o, b, statics);
      }
    }
  }

  /** 从上方落到 s 顶：按实际接触形状抬升到表面（腐蚀掉的列不参与），封顶防深嵌瞬移 */
  _landOn(b, s) {
    let lift = 0;
    for (const a of shapesOf(b)) {
      for (const c of shapesOf(s)) {
        if (a.overlaps(c, 0)) lift = Math.max(lift, a.bottom - c.top);
      }
    }
    if (lift <= 0) return;
    b.y -= Math.min(lift, MAX_RESOLVE_Y);
    b.vel.y = 0;
    b.onGround = true;
  }

  /** 从下方撞到 s 底：钳制在底面之下（配合子步提前停止，保证一帧内彻底停住） */
  _ceilingClamp(b, s) {
    b.setTop(s.bottom);
    b.vel.y = 0;
  }

  /** 把可推沉淀粒子从玩家身侧水平踢开（推动优先于自动上台阶/垫高）；无空间则返回 false */
  kickParticle(o, b, statics) {
    const pushDir = b.vel.x > 0 ? 1 : -1;
    const saved = o.x;
    o.x += pushDir * (o.w + 1);
    for (const s of this._near(o)) {
      if (s.solid && this._stSet.has(s) && overlaps(o, s)) {
        o.x = saved;
        return false; // 贴墙无空间：退回，让玩家垫高上去
      }
    }
    o.vel.x = pushDir * 150;
    return true;
  }

  /**
   * 残余重叠 MTV 解算：轴解算结束后仍有重叠的体（斜向冲入板底、出生嵌入、传送
   * 落点、爆炸推挤等），按四面最小穿透温柔推出（≤16px/帧，深嵌分帧收敛）。
   * 静态体先解（把"被顶回地面/板底"先做掉），再解动态体之间的残留，迭代数轮
   * 直到不再有可解的重叠。这是杜绝"穿模/瞬移到另一侧"的最后一道闸。
   */
  resolveResidual(dynamics, statics) {
    // 直接调用（relax/单元测试）可能没有经过 step：补建哈希，保证邻域查询正确
    if (this._hashAll !== dynamics) this._buildHash(dynamics, statics);
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of dynamics) {
        if (b.static) continue;
        for (const s of this._near(b)) {
          if (!s.solid || !this._stSet.has(s) || !overlaps(b, s)) continue;
          if (resolveEmbed(b, s)) moved = true;
        }
        for (const o of this._near(b)) {
          if (o === b || !o.solid || !b.solid || this._stSet.has(o)) continue;
          // 颗粒 vs 非颗粒：颗粒是**软体**——残余重叠永远让颗粒让位，绝不"推/抬"实体。
          // （旧代码会按 4 面 MTV 抬升实体 → "沉淀粒子跑到物块底下把物块顶起来"。）
          if ((o.amount !== undefined) !== (b.amount !== undefined)) {
            const particle = b.amount !== undefined ? b : o;
            const solid = b.amount !== undefined ? o : b;
            if (particle === o) {
              // 实体压在颗粒上：**只有玩家**可借稳定沉淀堆站立（支撑=主动踩上：`_landOn`
              // 只在玩家**落到粒子顶面**时生效）；**没有"自动托升"**——粒子不会把
              // 玩家从脚下"顶起来"（否则"左脚踩右脚"：站原地放沉淀→被抬→无限登高）。
              // 物块等重物不托——颗粒被挤出（软体让位），别把物块"顶起来"。
              if (!solid.isPlayerObj) {
                if (this._pushParticleOut(particle, solid)) moved = true;
                continue;
              }
              // 稳定层（落地静止 ≥0.45s）：玩家落/走到粒子顶面由 _landOn 支撑；
              // 这里只做"运动玩家把新鲜层踩散"（防跳→空中放→落回踩住新层→垫高循环）
              if (!supportsStanding(particle)) {
                if (Math.abs(solid.vel.y) > 40 || Math.abs(solid.vel.x) > 80) {
                  const pp2 = penSides(solid, particle);
                  const cx = solid.x + solid.w / 2;
                  const dir = particle.x + particle.w / 2 < cx ? -1 : 1; // 从玩家中心向两侧挤开
                  if (Math.abs(particle.vel.x) < 30) particle.vel.x = dir * 30;
                  if (pp2.bottom <= pp2.left && pp2.bottom <= pp2.right) {
                    particle.x += dir * 2; // 从玩家脚底滑出（不嵌在身体里）
                  }
                  moved = true;
                }
              }
              continue;
            }
            // 颗粒嵌在实体（侧面/下方）：把颗粒向穿透最小的面推出（软体退让）。
            // 玩家脚下的颗粒不水平挤（保留垫脚/穿行，由玩家侧重处理）。
            if (!solid.isPlayerObj) {
              if (this._pushParticleOut(particle, solid)) moved = true;
            } else if (resolveEmbed(particle, solid)) {
              moved = true;
            }
            continue;
          }
          if (!overlaps(b, o)) continue;
          if (resolveEmbed(b, o)) moved = true;
        }
      }
      if (!moved) break;
    }
  }

  /**
   * 颗粒嵌进实体（侧面穿入/压到正下方）时的软体让位：
   *  - 常规：向穿透最小的面推出（resolveEmbed 的 4 面 MTV）。
   *  - "实体正下方贴地楔入"（支撑保护规则停住的：粒子被压在地板与实体底缘之间）：
   *    resolveEmbed 会跳过（防止把支撑物压走）——但粒子楔在原地会让物块底缘"被
   *    垫住/卡死"（推不动）。此时把粒子往较近的侧边水平挤开，让它从块底滚出来。
   */
  _pushParticleOut(particle, solid) {
    if (resolveEmbed(particle, solid)) return true;
    if (particle.amount === undefined || solid.amount !== undefined) return false;
    const pp = penSides(particle, solid);
    // 只在"正下方"楔入（bottom 面最小穿透）时水平挤出；侧嵌已被 resolveEmbed 处理
    if (!(pp.bottom <= pp.left && pp.bottom <= pp.right && pp.bottom <= pp.top)) return false;
    const dir = particle.x + particle.w / 2 < solid.x + solid.w / 2 ? -1 : 1;
    const saved = particle.x;
    particle.x = saved + dir * (particle.w + 2);
    let ok = true;
    for (const s2 of this._near(particle)) {
      if (s2 === particle || s2 === solid) continue;
      if (s2.solid && this._stSet.has(s2) && overlaps(particle, s2)) { ok = false; break; }
    }
    if (!ok) { particle.x = saved; return false; }
    return true;
  }

  /** 兼容旧 API：只解算动态体之间的残余重叠（测试直接调用） */
  relax(dynamics) {
    this.resolveResidual(dynamics, []);
  }
}

// ============================================================================
// 接触跟踪：每刻对比相邻两次的重叠对，产出 contactBegin/End（对象对）供化学反应/开关/池使用
// ============================================================================
export class ContactTracker {
  constructor(eps = 1) {
    this.eps = eps;
    this.pairs = new Map(); // key -> [a, b]
  }

  update(bodies) {
    // 空间哈希（与主循环同口径）：接触对从 O(N²) 降到邻域级（大粒子堆）
    const B = 48;
    const hash = new Map();
    const big = [];
    const push = (b) => {
      const x0 = Math.floor(b.x / B);
      const x1 = Math.floor((b.x + b.w) / B);
      const y0 = Math.floor(b.y / B);
      const y1 = Math.floor((b.y + b.h) / B);
      if (x1 - x0 > 3 || y1 - y0 > 3) { big.push(b); return; }
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const k = cx * 8192 + cy;
          const arr = hash.get(k);
          if (arr) arr.push(b);
          else hash.set(k, [b]);
        }
      }
    };
    for (const b of bodies) push(b);
    const nearOf = (b) => {
      const out = big.slice();
      const x0 = Math.floor(b.x / B);
      const x1 = Math.floor((b.x + b.w) / B);
      const y0 = Math.floor(b.y / B);
      const y1 = Math.floor((b.y + b.h) / B);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const arr = hash.get(cx * 8192 + cy);
          if (arr) for (const o of arr) out.push(o);
        }
      }
      return out;
    };
    const next = new Map();
    for (const b of bodies) {
      for (const o of nearOf(b)) {
        if (o === b || !b.solid || !o.solid || !overlaps(b, o, this.eps)) continue;
        const [lo, hi] = b.id < o.id ? [b, o] : [o, b];
        next.set(`${lo.id}|${hi.id}`, [lo, hi]);
      }
    }
    const begun = [];
    const ended = [];
    for (const [k, pair] of next) if (!this.pairs.has(k)) begun.push(pair);
    for (const [k, pair] of this.pairs) if (!next.has(k)) ended.push(pair);
    this.pairs = next;
    return { begun, ended, current: [...next.values()] };
  }
}
