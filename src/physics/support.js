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
  const scan = (list, skip) => {
    for (const s of list) {
      if (!s || !s.solid || (skip && skip(s))) continue;
      if (!(s.x < r && s.x + s.w > l)) continue; // 水平重叠才算
      if (s.y >= b0 - EPS && s.y <= b0 + span) best = Math.min(best, s.y);
    }
  };
  if (scene.statics) scan(scene.statics);
  if (scene.dynamics) {
    const sub = body.subBodies;
    scan(scene.dynamics, (d) => d === body || (sub && sub.includes(d)) || typeof d.amount === 'number');
  }
  return best;
}

/** 与作用力无关的通用"落到支撑面停住"推进（重力累加 ≤400，钳位贴合） */
export function settleBodyOnSupport(body, dt, support, accel = 600, maxV = 400) {
  if (!Number.isFinite(support)) {
    body.vy = Math.min(maxV, body.vy + accel * dt);
    body.y += body.vy * dt;
    return;
  }
  if (body.y + body.h > support) {
    body.y = support - body.h; // 已陷入支撑面：顶回表面
    body.vy = 0;
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
  const scan = (list, skip) => {
    for (const s of list) {
      if (!s || !s.solid || (skip && skip(s))) continue;
      if (!(s.x < r && s.x + s.w > l)) continue;
      if (!(s.y < b && s.y + s.h > t)) continue;
      hit = Math.min(hit, s.x);
    }
  };
  if (scene.statics) scan(scene.statics);
  if (scene.dynamics) {
    const sub = body.subBodies;
    scan(scene.dynamics, (d) => d === body || d === scene.player || (sub && sub.includes(d)) || typeof d.amount === 'number');
  }
  return Number.isFinite(hit);
}
