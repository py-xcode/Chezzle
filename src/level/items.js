// ============================================================================
// 可拾取物品（集气瓶 / 烧杯 / 滴管）互动逻辑
// ----------------------------------------------------------------------------
// 通用操作（所有物品/沉淀一样）：
//  - Q：拾取附近最近的一个可拾取物品（一物一格，不堆叠；物品格满则收不了）；
//       附近没有物品时按原语义收集沉淀；
//  - Shift：把选中格里的物品放到玩家身旁（集气瓶与烧杯有碰撞箱可推动，滴管无碰撞箱可拖动）。
//
// 物品自定义操作（见 carryActionsOf：选中物品后才出现，最多两个，绑定可改键动作
// grab/use——设置里显示为「物品操作 1/2」；名称/图标由物品自己定义）：
//  - 烧杯：C 吸液（20g/次，可混合到满） / X 倒出（10g/次）；
//  - 滴管：C 吸液（5g/次，只能装同一种液体） / X 滴加（向最近容器滴一滴，默认 0.5g；
//          世界里的滴管仍可点胶头/长按/拖动做精细操作）；
//  - 集气瓶：C 按住集气（截留最近气泡柱产气，5g 封顶） / X 按住通气（0.05g/s）。
// ============================================================================

import { CFG } from '../core/config.js';
import { solutionColor } from '../render/liquidrender.js';
import { puffFx, flowFx, sparkleFx, rippleFx, arcFx, swirlFx } from '../objects/fx.js';
import { getSubstance } from '../chem/substances.js';
import { Bubble } from '../objects/bubble.js';
import { Beaker } from '../objects/beaker.js';
import { Dropper } from '../objects/dropper.js';
import { GasBottle } from '../objects/gasbottle.js';
import { Drip } from '../objects/drip.js';
import { sfx } from '../core/audio.js';

let FX_SEQ = 0; // 特效对象 id 序号（fx.js 的计数器不跨模块共享）

/** 可拾取物品的"物品栏操作"定义（数据驱动；HUD/触屏/玩家共用）。
 *  action = 输入动作 id（grab/use，即设置里的物品操作 1/2）；id = 语义；
 *  label/icon = 按钮与键位提示显示；press = 按一下执行；hold+holdFn = 按住每 tick 执行。
 *  以后新增可拾取物品只需在这里加一条（不用改 HUD/输入）。 */
const CARRY_ACTIONS = {
  beaker: [
    { action: 'grab', id: 'suck', label: '吸液', icon: 'beakerSuck', press: (p, s) => drawLiquid(p, s) },
    { action: 'use', id: 'pour', label: '倒出', icon: 'beakerPour', press: (p, s) => pourBeaker(p, s) },
  ],
  dropper: [
    { action: 'grab', id: 'suck', label: '吸液', icon: 'dropperSuck', press: (p, s) => drawLiquid(p, s) },
    { action: 'use', id: 'drip', label: '滴加', icon: 'dropperDrip', press: (p, s) => dripCarriedDropper(p, s) },
  ],
  bottle: [
    { action: 'grab', id: 'gasCollect', label: '集气', icon: 'bottleCollect', hold: true,
      holdFn: (p, s) => { s._gasHold = p.inventory.selectedItem(); } },
    { action: 'use', id: 'gasInject', label: '通气', icon: 'bottleInject', hold: true,
      holdFn: (p, s, dt) => injectBottleGas(p, s, dt) },
  ],
};

/** 选中某个可拾取物品时提供的操作（无物品/未知物品 = []）。
 *  插件物品可直接在自己的对象上挂 `carryActions`（与内置条目同结构），
 *  这样自定义物品也能复用 HUD 键位提示/触屏按钮，而不必改引擎表。 */
export function carryActionsOf(item) {
  if (item && Array.isArray(item.carryActions)) return item.carryActions;
  const kind = item && item.isCarryItem;
  return (kind && CARRY_ACTIONS[kind]) || [];
}


/** 十六进制色 → 'r,g,b' 三元组（PuffDust 的 color 参数格式） */
function rgbTripleOf(hex) {
  const h = String(hex ?? '#9fd8ff').replace('#', '');
  const n = h.length === 3
    ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return `${n[0]},${n[1]},${n[2]}`;
}

/** 气体显示色（集气瓶通气/分页视觉取色；气体未声明 gasColor → 通用气流青） */
function gasTintOf(id) {
  return getSubstance(id)?.gasColor ?? '#78dcff';
}

/** 放置落点是否被占用：与其它可携带物品、实心动态体（装置壁）、实心放置粒子重叠 */
function spotBlocked(scene, o, x, y) {
  const m = 3; // 收缩容差：贴边不算
  const l = x + m, r = x + o.w - m, t = y + m, b = y + o.h - m;
  // 玩家自身也占位：物品不能放到玩家身上（否则烧杯会把玩家包进去，物理互相挤压，
  // 玩家还会被判定为"在杯内"而与杯里的液体反应）。拥挤时宁可不放下、留在物品栏。
  const p = scene.player;
  if (p && !p.hidden
    && r > p.x + m && l < p.x + p.w - m
    && b > p.y + m && t < p.y + p.h - m) return true;
  for (const s of scene.objects) {
    if (s === p || !s || s.hidden) continue;
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
 * Q 拾取：把最近的可拾取物品收进物品栏（连同其内容物）。
 * 优先放进当前选中的空格；选中格不是空时找第一个空格——与收集沉淀一样跨格收集。
 * 物品不堆叠：一物一格，重复拾取会依次占用空格；物品格满则收不了。
 */
export function pickupItem(player, scene) {
  const inv = player.inventory;
  const slot = inv.selectedSlot() === null ? inv.selected : inv.slots.findIndex((s) => s === null);
  if (slot < 0) return false;
  const o = nearestCarryItem(scene, player);
  if (!o) return false;
  // 吸入特效：物品位置一圈尘雾（先于移除取坐标）+ 金色闪光 + 短弧光（物品 → 手边）
  const fx = o.x + o.w / 2;
  const fy = o.y + o.h * 0.4;
  puffFx(scene, fx, fy);
  sparkleFx(scene, fx, fy, { color: '#ffd76a', n: 7, spread: 20, rise: 14, life: 0.42, size: 2.2 });
  swirlFx(scene, fx, fy, { color: '#ffd76a', r: 13, life: 0.3, arms: 3 });
  arcFx(scene, {
    x0: fx, y0: fy,
    x1: player.x + player.w / 2, y1: player.y + player.h * 0.42,
    color: 'rgba(255,215,106,0.85)', life: 0.28, bend: 0.3, width: 1.8,
  });
  scene.removeItem(o); // 深度移除（烧杯含杯壁子体）
  inv.slots[slot] = { item: o.isCarryItem, obj: o };
  sfx('item.pickup');
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
    // 所有探测位都堵死（含玩家自身/地形）：不放下，物品留在物品栏，并给一句 HUD 提示。
    // 旧逻辑最后兜底放到玩家正下方 → 与玩家重叠，玩家被算作"在杯内"，两者互相挤压。
    if (!found) {
      scene._notice = { text: '这里放不下', t: scene.time ?? 0 };
      return false;
    }
  }
  o.x = x;
  o.y = y;
  if (Number.isFinite(o.rx)) { o.rx = o.x; o.ry = o.y; } // 滴管渲染平滑坐标同步（防放置瞬移残影）
  scene.addItem(o);
  // 落地反馈：尘雾 + 金色细闪 + 地面涟漪；物品 0.22s 缩放入场（Renderer 的
  // appearFade 淡入机制，不改放置逻辑/位置）
  const cx = x + o.w / 2;
  const fy = y + o.h - 3;
  puffFx(scene, cx, fy);
  sparkleFx(scene, cx, fy - 2, { color: '#ffd76a', n: 6, spread: 18, rise: 12, life: 0.38, size: 2 });
  rippleFx(scene, cx, y + o.h, { color: 'rgba(210,222,248,0.7)', r0: 4, r1: Math.max(18, o.w * 0.9), life: 0.38, width: 1.6, flat: 0.32 });
  o.appearTime = scene.time;
  o.appearFade = 0.22;
  inv.slots[inv.selected] = null;
  sfx('item.place');
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

/** 吸液特效：从容器液面到玩家的一串上行液滴 + 液面涟漪（纯视觉） */
function _suckFx(scene, src, player) {
  const r = src.innerRect ? src.innerRect() : { x: src.x + 4, y: src.y + 6, w: src.w - 8, h: src.h - 12 };
  // 液面近似：按容器高度中点取上沿区域即可（视觉用途，无需精确）
  const col = solutionColor(src.solution).color;
  const sx = Math.max(r.x + 4, Math.min(r.x + r.w - 4, player.x + player.w / 2));
  const sy = r.y + Math.min(10, r.h * 0.3);
  flowFx(scene, {
    x0: sx,
    y0: sy,
    x1: player.x + player.w / 2,
    y1: player.y + player.h * 0.35,
    color: col,
    life: 0.5,
    n: 8,
    bend: 0.3,
  });
  // 液面被吸起的涟漪 + 少量水花（"有东西被抽走"）
  rippleFx(scene, sx, r.y + 4, { color: col, r0: 3, r1: Math.max(14, r.w * 0.35), life: 0.4, width: 1.4, flat: 0.28 });
  puffFx(scene, sx, r.y + 4, { color: rgbTripleOf(col), r: 2.6, spread: 9, life: 0.3, n: 4 });
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
    sfx('item.suck');
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
    sfx('item.suck');
    return true;
  }
  return false;
}

/**
 * X 滴加：选中背包里的滴管时，向最近的容器滴一滴（默认 0.5g）。
 * 世界里放下的滴管仍可用"点胶头 / 长按 / 拖动"做精细操作；这里给物品栏操作一个快捷方式。
 * 目标与吸液/倒出同一套距离（边缘 80px），跳过已满的烧杯。
 */
export function dripCarriedDropper(player, scene) {
  const slot = player.inventory.selectedSlot();
  if (!slot || slot.item !== 'dropper') return false;
  const o = slot.obj;
  if (o.liquid <= 1e-9) return false;
  const target = nearestLiquidTarget(scene, player, CFG.item.liquidRange, false, true);
  if (!target) return false;
  const take = Math.min(o.drop, o.liquid);
  if (take <= 1e-9) return false;
  target.solutionMat.add(o.substance, take);
  if (o.substance !== 'H2O') target.noteSolOrigin?.(o.substance, { kind: 'dropper', text: '滴管滴入' });
  o.liquid -= take;
  // 落点：目标口沿附近（化学/气泡围绕滴入点发生）
  const ir = target.innerRect();
  const dx = Math.max(ir.x + 4, Math.min(ir.x + ir.w - 4, player.x + player.w / 2));
  const dy = Math.max(ir.y + 4, Math.min(ir.y + ir.h - 6, ir.y + 8));
  target.depositAt = { x: dx, y: dy };
  // 视觉：手边一束细液流 + 一颗液滴从容器口上方落到液面
  const { color } = o.liquidColor();
  const hx = player.x + player.w / 2;
  const hy = player.y + player.h * 0.38;
  flowFx(scene, { x0: hx, y0: hy, x1: dx, y1: ir.y + 5, color, life: 0.3, n: 6, bend: 0.25 });
  rippleFx(scene, dx, ir.y + 4, { color, r0: 3, r1: Math.max(14, ir.w * 0.3), life: 0.35, width: 1.3, flat: 0.3 });
  scene.addObject(new Drip({
    x: dx - 2,
    y: ir.y - 18,
    targetY: ir.y + 6,
    color,
    id: `drip${++FX_SEQ}`,
  }));
  sfx('item.drip');
  return true;
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
  // 倒出反馈：杯口 → 目标液面的液流弧 + 落点涟漪/水花（"看得见液真的倒进去"）
  const ir = target.innerRect();
  const bx = o.x + o.w / 2;
  const towardRight = (target.x + (target.w ?? 0) / 2) >= bx;
  const lipX = bx + (towardRight ? 1 : -1) * Math.max(6, o.w / 2 - 5);
  const lipY = o.y + 10;
  const tx = Math.max(ir.x + 6, Math.min(ir.x + ir.w - 6, lipX + (towardRight ? -10 : 10)));
  const ty = ir.y + 5;
  const col = solutionColor(o.solution).color;
  flowFx(scene, { x0: lipX, y0: lipY, x1: tx, y1: ty, color: col, life: 0.45, n: 8, bend: 0.22 });
  rippleFx(scene, tx, ir.y + 4, { color: col, r0: 4, r1: Math.max(16, ir.w * 0.4), life: 0.42, width: 1.5, flat: 0.3 });
  puffFx(scene, tx, ir.y + 4, { color: rgbTripleOf(col), r: 3, spread: 10, life: 0.3, n: 4 });
  sfx('item.pour');
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
  // 通气流反馈：手边 → 注入点的气体细流 + 注入点涟漪 + 手边小涡环（纯视觉）。
  // 集气瓶在背包里（世界里没有瓶身），所以视觉起点取玩家手边位置。
  const tint = gasTintOf(d[0]);
  o._fxAcc = (o._fxAcc ?? 0) + dt;
  if (o._fxAcc >= 0.32 && target.depositAt) {
    o._fxAcc = 0;
    const dp = target.depositAt;
    const hx = player.x + player.w / 2;
    const hy = player.y + player.h * 0.35;
    flowFx(scene, { x0: hx, y0: hy, x1: dp.x, y1: dp.y - 2, color: tint, life: 0.4, n: 7, bend: 0.2 });
    rippleFx(scene, dp.x, dp.y + 2, { color: tint, r0: 3, r1: 20, life: 0.4, width: 1.4, flat: 0.26 });
    // 手边（瓶口方向）的喷射小涡旋：气体从瓶里被压出的反馈
    swirlFx(scene, hx, hy, { color: tint, r: 12, life: 0.32, arms: 3 });
  }
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
      id: `ifx${++FX_SEQ}`,
    }));
  }
  // 通气声：按住 X 持续通气，0.3s 限频（与 item.gas 音色的 gap 一致）
  if (scene.time - (o._sfxGasT ?? -10) >= 0.3) {
    o._sfxGasT = scene.time;
    sfx('item.gas');
  }
  return true;
}

// ============================================================================
// 传送门物品栏重置（Portal 调用）——"穿过传送门时重设玩家物品栏"
// ----------------------------------------------------------------------------
// 配置文本（编辑器多行字段）每行一种：
//   Cu:50                  物质 50g（进格子；跨格收集同真实拾取）
//   beaker                 空烧杯
//   beaker:HCl:20,ZnCl2:5  烧杯 + 满杯水 + 溶质（逗号分隔 溶质:质量）
//   dropper:H2O:40         滴管装 40g 液体
//   gasbottle              空集气瓶（gasbottle:H2:3 装 3g 气体）
//   # 注释 / 空行跳过。也接受数组形式 [{substance, amount} | {item, opts}]。
// ============================================================================

export const ITEM_NAMES = ['beaker', 'dropper', 'gasbottle'];

/** 解析配置文本 → [{substance, amount} | {item, opts}]（数组直接规范化返回） */
export function parseInventorySetup(text) {
  if (Array.isArray(text)) {
    return text.filter((e) => e && (e.substance || e.item)); // 已是结构：直接收
  }
  if (typeof text !== 'string') return [];
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const n = normalizeSetupLine(line);
    if (n) out.push(n);
  }
  return out;
}

function normalizeSetupLine(line) {
  if (typeof line !== 'string') return null;
  const [head, ...rest] = line.split(':');
  const name = head.trim();
  if (!name) return null;
  if (ITEM_NAMES.includes(name)) {
    // 物品行剩余段：溶质/液体/气体清单（id:g, id:g）
    const solutes = {};
    for (const seg of rest.join(':').split(',')) {
      const t = seg.trim();
      if (!t) continue;
      const [id, m] = t.split(':').map((s) => s.trim());
      if (id && Number.isFinite(Number(m)) && Number(m) > 0) solutes[id] = Number(m);
    }
    const opts = {};
    if (Object.keys(solutes).length) opts.solutes = solutes;
    return { item: name, opts };
  }
  // 物质行：物质:质量
  const [id, m] = line.split(':');
  const mass = Number(m);
  if (id && Number.isFinite(mass) && mass > 0) return { substance: id.trim(), amount: mass };
  return null;
}

/**
 * 把玩家物品栏替换为配置（清空 + 装配）。仅玩家（有 inventory）生效。
 * clearOnly=true → 只清空（clearInventory 字段用）。
 * 返回装配数量（物品/物质各计），供调试/测试断言。
 */
export function applyInventorySetup(player, setupText, clearOnly = false) {
  const inv = player && player.inventory;
  if (!inv) return 0;
  inv.slots = new Array(inv.slots.length).fill(null);
  inv.selected = 0;
  if (clearOnly) return 0;
  const entries = parseInventorySetup(setupText);
  let n = 0;
  for (const e of entries) {
    if (e.substance) {
      inv.add(e.substance, e.amount); // 跨格收集：同物质格优先、再空格
      n++;
    } else if (e.item) {
      const slot = inv.slots.findIndex((s) => s === null);
      if (slot < 0) continue; // 格子满：跳过
      const o = createSetupItem(e.item, e.opts, player);
      if (o) {
        inv.slots[slot] = { item: e.item, obj: o };
        n++;
      }
    }
  }
  return n;
}

/** 配置物品 → 真实物品对象（x/y 挂玩家附近：拿在手里的坐标不影响使用） */
function createSetupItem(name, opts = {}, player = null) {
  const x = player ? player.x : 0;
  const y = player ? player.y : 0;
  const solutes = opts.solutes ?? {};
  if (name === 'beaker') {
    // 默认 200mL（编辑器常见值）；带溶质 → 满杯水作溶剂（液面=总质量/体积）
    const volume = opts.volume ?? 200;
    const water = opts.water !== undefined ? opts.water : (Object.keys(solutes).length ? volume : 0);
    return new Beaker({ x, y, volume, water, solutes });
  }
  if (name === 'dropper') {
    const liquid = Object.entries(solutes)[0] ?? null;
    return new Dropper({ x, y, substance: liquid ? liquid[0] : (opts.substance ?? 'H2O'), liquid: liquid ? liquid[1] : (opts.liquid ?? 0), capacity: opts.capacity ?? 50 });
  }
  if (name === 'gasbottle') {
    return new GasBottle({ x, y, capacity: opts.capacity ?? 5, gases: Object.keys(solutes).length ? solutes : null });
  }
  return null;
}
