// ============================================================================
// 可携带物品（集气瓶 / 烧杯 / 滴管）互动逻辑
// ----------------------------------------------------------------------------
// 按键语义（全部基于"选中的物品栏格子"）：
//  - C（选中空格）：拾取附近最近的一个可携带物品（一物一格，不堆叠）；
//  - C（选中烧杯/滴管）：从最近的液体容器（药品池/烧杯）吸液——烧杯 20g/次
//    （可混合、直到满），滴管 5g/次（**同种液体可反复续吸至容量上限 50g**，
//    装着别的液体则不能续吸）；
//  - C（按住，选中集气瓶）：把最近气泡柱产生的气体直接截留进瓶（5g 封顶）；
//  - X（选中烧杯）：把烧杯里的液体倒入最近的烧杯/药品池，**每次倒 10g**
//    （滴管不行）；
//  - X（按住，选中集气瓶）：向最近的液体容器通入气体（0.05g/s）；
//  - Shift：把选中格里的物品放到玩家身旁（集气瓶与烧杯一样有碰撞箱可推动，
//    滴管无碰撞箱可拖动）。
// ============================================================================

import { CFG } from '../core/config.js';
import { solutionColor } from '../render/liquidrender.js';
import { puffFx, flowFx } from '../objects/fx.js';
import { Bubble } from '../objects/bubble.js';

let FX_SEQ = 0; // 特效对象 id 序号（fx.js 的计数器不跨模块共享）

/** 放置落点是否被占用：与其它可携带物品、实心动态体（装置壁）、实心放置粒子重叠 */
function spotBlocked(scene, o, x, y) {
  const m = 3; // 收缩容差：贴边不算
  const l = x + m, r = x + o.w - m, t = y + m, b = y + o.h - m;
  for (const s of scene.objects) {
    if (s === scene.player || !s || s.hidden) continue;
    if (typeof s.amount === 'number' && !s.solid) continue; // 软体自由粒子不挡
    const isCarry = !!s.isCarryItem;
    if (!(isCarry || s.solid)) continue; // 只看实体类；区域容器（池等）允许浸入
    if (r > s.x + m && l < s.x + s.w - m && b > s.y + m && t < s.y + s.h - m) return true;
  }
  return false;
}

/** 两矩形之间的最近距离（边缘间隙；重叠=0）——池/烧杯等高宽物体用边缘距离，
 *  站在池边即可吸液（用中心距离会让宽池显得"遥不可及"） */
function rectDist(a, b) {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.hypot(dx, dy);
}

/** 场景内最近的可携带物品（集气瓶/烧杯/滴管），超范围返回 null；
 *  noCarry（关卡固定装置，编辑器可勾选"锁定"）不参与拾取 */
export function nearestCarryItem(scene, player) {
  let best = null;
  let bd = Infinity;
  for (const o of scene.objects) {
    if (!o.isCarryItem || o.noCarry) continue;
    const d = rectDist(o, player);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  if (!best || bd > CFG.item.collectRange) return null;
  return best;
}

/**
 * C 拾取：选中格必须**为空**，把最近的可携带物品收进该格（连同其内容物）。
 * 物品不堆叠：一物一格，重复拾取需要依次选空格。
 */
export function pickupItem(player, scene) {
  const inv = player.inventory;
  if (inv.selectedSlot() !== null) return false;
  const o = nearestCarryItem(scene, player);
  if (!o) return false;
  // 吸入特效：物品位置一圈尘雾（先于移除取坐标）
  puffFx(scene, o.x + o.w / 2, o.y + o.h * 0.4);
  scene.removeItem(o); // 深度移除（烧杯含杯壁子体）
  inv.slots[inv.selected] = { item: o.isCarryItem, obj: o };
  return true;
}

/** Shift 放置：把选中格里的物品放到玩家身旁（朝移动方向一侧、脚边）。
 *  落点被占用（已有装置/实心体）时依次向外探测空位——不再把两件物品叠在一起。 */
export function placeCarriedItem(player, scene) {
  const inv = player.inventory;
  const slot = inv.selectedSlot();
  if (!slot || !slot.item) return false;
  const o = slot.obj;
  const front = player.vel.x >= 0 ? 1 : -1;
  const off = CFG.item.placeOffset;
  let x = front > 0 ? player.x + player.w + off : player.x - o.w - off;
  let y = player.bottom + 2 - o.h; // 底边贴脚底（烧杯/集气瓶落地面，滴管停在原地）
  x = Math.max(4, Math.min(scene.worldW - o.w - 4, x));
  y = Math.max(4, Math.min(scene.worldH - o.h - 4, y));
  // 空位探测：原位 → 原方向再远一格 → 反侧对称位 → 反侧更远
  if (spotBlocked(scene, o, x, y)) {
    const step = o.w + 10;
    const probes = [
      x + front * step,
      x + front * step * 2,
      x - front * step,
      x - front * step * 2,
    ];
    let found = false;
    for (const px of probes) {
      const cx = Math.max(4, Math.min(scene.worldW - o.w - 4, px));
      if (!spotBlocked(scene, o, cx, y)) {
        x = cx;
        found = true;
        break;
      }
    }
    if (!found && !spotBlocked(scene, o, player.x, y)) x = player.x; // 最后兜底：正下方
  }
  o.x = x;
  o.y = y;
  if (Number.isFinite(o.rx)) { o.rx = o.x; o.ry = o.y; } // 滴管渲染平滑坐标同步（防放置瞬移残影）
  scene.addItem(o);
  puffFx(scene, x + o.w / 2, y + o.h - 3); // 落地尘雾
  inv.slots[inv.selected] = null;
  return true;
}

/** 最近的有液体的容器（取液源/通入目标）：含水或含溶质的可装液容器 */
export function nearestLiquidSource(scene, player, range = CFG.item.liquidRange) {
  let best = null;
  let bd = Infinity;
  for (const c of scene.containers) {
    if (!c.solution || !(c.solution.volume > 0)) continue;
    if (c.solution.totalMass() <= 1e-9) continue;
    const d = rectDist(c, player);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best && bd <= range ? best : null;
}

/** 最近的"可注液"容器（池/烧杯，空杯也算），范围限定；
 *  needWater：只找有水的（通气要液体介质）；
 *  needRoom：跳过已满的**烧杯**（药品池不封顶，敞开接收） */
export function nearestLiquidTarget(scene, player, range = CFG.item.liquidRange, needWater = false, needRoom = false) {
  let best = null;
  let bd = Infinity;
  for (const c of scene.containers) {
    if (!c.solution || !(c.solution.volume > 0)) continue;
    if (needWater && !(c.solution.water > 1e-9)) continue;
    if (needRoom) {
      const capped = c.isCarryItem === 'beaker'; // 只有烧杯有容量上限；池视为敞开
      if (capped && c.solution.volume - c.solution.totalMass() <= 1e-9) continue;
    }
    const d = rectDist(c, player);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best && bd <= range ? best : null;
}

/** 吸液特效：从容器液面到玩家的一串上行液滴（纯视觉） */
function _suckFx(scene, src, player) {
  const r = src.innerRect ? src.innerRect() : { x: src.x + 4, y: src.y + 6, w: src.w - 8, h: src.h - 12 };
  // 液面近似：按容器高度中点取上沿区域即可（视觉用途，无需精确）
  const col = solutionColor(src.solution).color;
  flowFx(scene, {
    x0: Math.max(r.x + 4, Math.min(r.x + r.w - 4, player.x + player.w / 2)),
    y0: r.y + Math.min(10, r.h * 0.3),
    x1: player.x + player.w / 2,
    y1: player.y + player.h * 0.35,
    color: col,
    life: 0.5,
    n: 8,
    bend: 0.3,
  });
}

/**
 * C 吸液：选中的烧杯/滴管从最近的液体容器取液。
 * 烧杯：每次 20g（同比例样品，可混合），容量满（总量≥容积）后不能再加；
 * 滴管：每次 5g，**同种液体可反复续吸直到容量上限**（管里装着别的液体则拒绝），
 * 取池中占优的溶质（纯水→H2O）。
 */
export function drawLiquid(player, scene) {
  const slot = player.inventory.selectedSlot();
  if (!slot || !slot.item) return false;
  const o = slot.obj;
  const src = nearestLiquidSource(scene, player);
  if (!src) return false;
  if (slot.item === 'beaker') {
    const cap = o.solution.volume > 0 ? o.solution.volume : CFG.item.beakerCapacity;
    const room = cap - o.solution.totalMass();
    if (room <= 1e-9) return false; // 满杯不能再加
    const sample = src.solution.takeSample(Math.min(CFG.item.beakerTransfer, room));
    if (!sample) return false;
    o.solution.addSample(sample);
    for (const [id, v] of Object.entries(sample.solutes ?? {})) {
      if (v > 1e-9) o.noteSolOrigin?.(id, { kind: 'fill', text: '吸液入杯' });
    }
    _suckFx(scene, src, player); // 吸液液流动画
    return true;
  }
  if (slot.item === 'dropper') {
    const take = Math.min(CFG.item.dropperTransfer, o.capacity - o.liquid);
    if (take <= 1e-9) return false; // 满管（容量上限）
    // 滴管只装一种液体：占优溶质（无溶质=纯水）。已装液时只有"同一液体"才能续吸
    let id = 'H2O';
    let m = 0;
    for (const [sid, sm] of src.solution.solutes) {
      if (sm > m) {
        id = sid;
        m = sm;
      }
    }
    if (o.liquid > 1e-9 && id !== o.substance) return false; // 管里是别的液体 → 不能续吸
    if (id === 'H2O') {
      const got = src.solution.water > 0 ? Math.min(take, src.solution.water) : 0;
      if (got <= 1e-9) return false;
      src.solution.water -= got;
      o.substance = 'H2O';
      o.liquid += got;
    } else {
      const got = src.solution.remove(id, take);
      if (got <= 1e-9) return false;
      o.substance = id;
      o.liquid += got;
    }
    _suckFx(scene, src, player); // 吸液液流动画
    return true;
  }
  return false;
}

/**
 * X 倒入：把选中烧杯里的液体倒入最近的烧杯/药品池，**每次倒 CFG.item.pourStep
 * （默认 10g）**——连续按分次倒完。目标未满则倒；最近的是满杯且附近还有别的
 * 容器 → 选下一个有余量的。
 * 滴管不能倒出（只能滴在容器上方）。
 */
export function pourBeaker(player, scene) {
  const slot = player.inventory.selectedSlot();
  if (!slot || slot.item !== 'beaker') return false;
  const o = slot.obj;
  const total = o.solution.totalMass();
  if (total <= 1e-9) return false;
  const target = nearestLiquidTarget(scene, player, CFG.item.liquidRange, false, true);
  if (!target) return false;
  // 烧杯有容量上限（倒目标剩余空间）；药品池敞开接收
  const capped = target.isCarryItem === 'beaker';
  const tRoom = capped ? Math.max(0, target.solution.volume - target.solution.totalMass()) : Infinity;
  const pour = Math.min(CFG.item.pourStep, total, tRoom);
  if (pour <= 1e-9) return false;
  const sample = o.solution.takeSample(pour);
  if (!sample) return false;
  // 倒出会话：平移到目标旁→倾斜→按住保持（视觉层，物理坐标不动）
  o.beginPour?.(scene, target);
  target.solution.addSample(sample);
  for (const [id, v] of Object.entries(sample.solutes ?? {})) {
    if (v > 1e-9) target.noteSolOrigin?.(id, { kind: 'pour', text: '烧杯倒入' });
  }
  return true;
}

/**
 * 按住 X 通气：把选中集气瓶中的气体按 0.05g/s 通入最近的液体容器
 * （优先通占优气体；CO2/SO2/NO2/Cl2 在主动鼓泡时也能溶进水里）。
 * 注入点冒气泡视觉（间歇生成，随通气持续）。
 */
export function injectBottleGas(player, scene, dt) {
  const slot = player.inventory.selectedSlot();
  if (!slot || slot.item !== 'bottle') return false;
  const o = slot.obj;
  if (o.totalGas() <= 1e-9) return false;
  const target = nearestLiquidTarget(scene, player, CFG.item.liquidRange, true);
  if (!target) return false;
  const d = o.dominantGas();
  const amount = Math.min(CFG.item.gasRate * dt, d[1]);
  if (amount <= 1e-9) return false;
  o.removeGas(d[0], amount);
  scene.bubbleGas(target, d[0], amount, dt);
  // 通气气泡特效：注入点（bubbleGas 更新过的 depositAt）每 ~0.16s 冒一颗上升泡
  o._injAcc = (o._injAcc ?? 0) + dt;
  if (o._injAcc >= 0.16 && target.depositAt) {
    o._injAcc = 0;
    const jx = ((target.depositAt.x * 7 + scene.time * 13) % 8) - 4; // 确定性微抖
    scene.addObject(new Bubble({
      x: target.depositAt.x + jx - 3,
      y: target.depositAt.y - 6,
      dir: -1,
      speed: 62,
      id: `fx${++FX_SEQ}`,
    }));
  }
  return true;
}
