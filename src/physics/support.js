// ============================================================================
// 支撑面查询：容器类物体（烧杯/集气瓶）自带的重力是"手动下落"（主本体不参与
// 物理积分），需要自己找支撑。这里统一实现"**最浅支撑面**"语义：
//   - 与其水平重叠、且位于本体底部±容差~span 之下的所有实心静态体 +
//     实心动态体（玩家头、其他装置壁——但排除自身子体与软体沉淀粒子）；
//   - 取其中**最高（y 最小）**的顶面作为落点。
// 关键修复点：
//   ① 动态体也算竖直落点 —— 修"烧杯从玩家正上方落下穿透玩家"；
//   ② 取 min 而不是 max —— 修"烧杯跨在池沿上时借更深的盆底沉进池里，
//      连带着杯内玩家一起嵌入池体"（用户关卡 level (15) 复现）。
// ============================================================================

const EPS = 2; // 已贴合的容差（沿用旧 applyGravity 的判定宽度）

/**
 * 返回给定位体正下方最近的实心支撑面顶边 y；找不到返回 Infinity。
 * span = 探测深度（px）：只在底部下方 span 内找（默认 40，与旧行为一致，
 * 保证下落逐帧检测不瞬移）；贴合恢复（轻微陷入弹回表面）也靠这个窗口。
 */
export function shallowestSupportY(body, scene, span = 40) {
  const l = body.x;
  const r = body.x + body.w;
  const b0 = body.y + body.h;
  let best = Infinity;
  const sub = body.subBodies;
  // statics/dynamics 都要排除**自身子体**（烧杯/集气瓶的壁体在 static 化后
  // 进了 statics——不排除的话"自己撑住自己/自己挡自己"）
  const skipSelf = (s) => (sub && sub.includes(s));
  const scan = (list, skip) => {
    for (const s of list) {
      if (!s || !s.solid || (skip && skip(s))) continue;
      if (!(s.x < r && s.x + s.w > l)) continue; // 水平重叠才算
      if (s.y >= b0 - EPS && s.y <= b0 + span) best = Math.min(best, s.y);
    }
  };
  if (scene.statics) scan(scene.statics, skipSelf);
  if (scene.dynamics) {
    scan(scene.dynamics, (d) => d === body || skipSelf(d) || typeof d.amount === 'number');
  }
  return best;
}

/** 与作用力无关的通用"落到支撑面停住"推进（重力累加 ≤400，钳位贴合）。
 *  贴合容差 0.25px：已在表面（含微小间隙）→ 静止——否则"恰好贴住"时每帧
 *  微落 0.6px 再被顶回 → 烧杯/集气瓶站着也在微微震动（用户反馈推动时的抖动源之一） */
export function settleBodyOnSupport(body, dt, support, accel = 600, maxV = 400) {
  if (!Number.isFinite(support)) {
    body.vy = Math.min(maxV, body.vy + accel * dt);
    body.y += body.vy * dt;
    return;
  }
  if (body.y + body.h >= support - 0.25) {
    body.vy = 0;
    if (body.y + body.h > support) body.y = support - body.h; // 已陷入支撑面：顶回表面
  } else {
    body.vy = Math.min(maxV, body.vy + accel * dt);
    body.y += body.vy * dt;
    if (body.y + body.h >= support) {
      body.y = support - body.h;
      body.vy = 0;
    }
  }
}

/**
 * 玩家推动容器（烧杯/集气瓶）——在 **Player.update** 里调用（玩家自己重设 vel 之后）。
 * 时序必须如此：容器 update 先于玩家——若由容器侧读取玩家速度驱动，物理步玩家
 * 自行前进 → 撞壁被弹回 → 推-弹交替（用户反馈：tick1 玩家碰到物块、tick2 物块推动
 * 玩家不动、tick3 物块不动玩家动一步…… 循环往复）。
 * 推动帧：容器前进 push、玩家**精确吸附**到壁边（消除累积偏差）、玩家 vel 清零
 * （物理步静止，无"自行前进→被壁分离"的循环）。推之前先看路，不穿模。
 */
export function pushContainers(p, scene, dt) {
  const dir = (scene.control && scene.control.has('right') ? 1 : 0) - (scene.control && scene.control.has('left') ? 1 : 0);
  if (dir === 0) return;
  const push = dir * p.moveSpeed * dt;
  // 注意遍历 scene.objects（集气瓶不是 Container 子类，不在 scene.containers）
  for (const c of scene.objects) {
    if (c.isCarryItem !== 'beaker' && c.isCarryItem !== 'bottle') continue;
    if (typeof c.containsObj === 'function' && c.containsObj(p)) continue; // 杯内携带：走 lateUpdate 带动
    if (p.bottom <= c.y || p.top >= c.y + c.h) continue; // 高度不重叠（贴不到壁）
    const wall = c.wall ?? 4;
    if (push > 0 && p.right >= c.x - 2 && p.right <= c.x + wall + 2) {
      const nx = c.x + push;
      if (!horizontallyBlocked(c, nx, scene)) {
        c.x = nx;
        if (typeof c.syncWalls === 'function') c.syncWalls(); // 壁体**立即**跟上（否则物理步用旧壁位置 → 玩家被弹开）
        p.x = c.x - p.w; // 吸附到左壁
        p.vel.x = 0;
      }
    } else if (push < 0 && p.left <= c.x + c.w + 2 && p.left >= c.x + c.w - wall - 2) {
      const nx = c.x + push;
      if (!horizontallyBlocked(c, nx, scene)) {
        c.x = nx;
        if (typeof c.syncWalls === 'function') c.syncWalls();
        p.x = c.x + c.w; // 吸附到右壁
        p.vel.x = 0;
      }
    }
  }
}

/**
 * 水平阻挡探测：把 body 平移到 nx 后是否与任何实心体相交 ≥3px 深度。
 * 用于烧杯/集气瓶的"手动推挤"——它们不走通用碰撞积分，自己挪位置时需要
 * 自己看路，否则会被直接推进池盆壁里（穿模）。忽略脚底贴合面（≤2px 的
 * 支撑重叠不算），也不忽略动态实心体（别的装置壁照样挡路）。
 */
export function horizontallyBlocked(body, nx, scene) {
  const l = nx + 1;
  const r = nx + body.w - 1;
  const t = body.y + 2;
  const b = body.y + body.h - 2;
  let hit = Infinity; // 记录阻挡物 x（诊断用）
  const sub = body.subBodies;
  // statics 同样排除自身子体（static 化后的壁体在 statics 里——不排除会被
  // 自己的右壁/左壁挡住 → 烧杯/集气瓶推不动——用户反馈的"推动异常"根因）
  const skipSelf = (s) => (sub && sub.includes(s));
  const scan = (list, skip) => {
    for (const s of list) {
      if (!s || !s.solid || (skip && skip(s))) continue;
      if (!(s.x < r && s.x + s.w > l)) continue;
      if (!(s.y < b && s.y + s.h > t)) continue;
      hit = Math.min(hit, s.x);
    }
  };
  if (scene.statics) scan(scene.statics, skipSelf);
  if (scene.dynamics) {
    scan(scene.dynamics, (d) => d === body || d === scene.player || skipSelf(d) || typeof d.amount === 'number');
  }
  return Number.isFinite(hit);
}
