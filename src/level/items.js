// ============================================================================
// 可携带物品（集气瓶 / 烧杯 / 滴管）互动逻辑
// ----------------------------------------------------------------------------
// 按键语义（全部基于"选中的物品栏格子"）：
//  - C（选中空格）：拾取附近最近的一个可携带物品（一物一格，不堆叠）；
//  - C（选中烧杯/空滴管）：从最近的液体容器（药品池/烧杯）吸液——烧杯 20g/次
//    （可混合、直到满），滴管 5g/次（已装液不能再加，容量上限 50g）；
//  - C（按住，选中集气瓶）：把最近气泡柱产生的气体直接截留进瓶（5g 封顶）；
//  - X（选中烧杯）：把烧杯里的液体全部倒入最近的烧杯/药品池（滴管不行）；
//  - X（按住，选中集气瓶）：向最近的液体容器通入气体（0.05g/s）；
//  - Shift：把选中格里的物品放到玩家身旁（烧杯可推动，滴管/集气瓶无碰撞箱）。
// ============================================================================

import { CFG } from '../core/config.js';

/** 两矩形之间的最近距离（边缘间隙；重叠=0）——池/烧杯等高宽物体用边缘距离，
 *  站在池边即可吸液（用中心距离会让宽池显得"遥不可及"） */
function rectDist(a, b) {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.hypot(dx, dy);
}

/** 场景内最近的可携带物品（集气瓶/烧杯/滴管），超范围返回 null */
export function nearestCarryItem(scene, player) {
  let best = null;
  let bd = Infinity;
  for (const o of scene.objects) {
    if (!o.isCarryItem) continue;
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
  scene.removeItem(o); // 深度移除（烧杯含杯壁子体）
  inv.slots[inv.selected] = { item: o.isCarryItem, obj: o };
  return true;
}

/** Shift 放置：把选中格里的物品放到玩家身旁（朝移动方向一侧、脚边） */
export function placeCarriedItem(player, scene) {
  const inv = player.inventory;
  const slot = inv.selectedSlot();
  if (!slot || !slot.item) return false;
  const o = slot.obj;
  const front = player.vel.x >= 0 ? 1 : -1;
  const off = CFG.item.placeOffset;
  let x = front > 0 ? player.x + player.w + off : player.x - o.w - off;
  let y = player.bottom + 2 - o.h; // 底边贴脚底（烧杯落地面，滴管/集气瓶就停在原地）
  x = Math.max(4, Math.min(scene.worldW - o.w - 4, x));
  y = Math.max(4, Math.min(scene.worldH - o.h - 4, y));
  o.x = x;
  o.y = y;
  scene.addItem(o);
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

/**
 * C 吸液：选中的烧杯/滴管从最近的液体容器取液。
 * 烧杯：每次 20g（同比例样品，可混合），容量满（总量≥容积）后不能再加；
 * 滴管：每次 5g，只装**空管**（已装液不能再加），取池中占优的溶质（纯水→H2O）。
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
    return true;
  }
  if (slot.item === 'dropper') {
    if (o.liquid > 1e-9) return false; // 已装液：不能再加（现实如此）
    const take = Math.min(CFG.item.dropperTransfer, o.capacity - o.liquid);
    if (take <= 1e-9) return false;
    // 滴管只装一种物质：占优溶质（无溶质=纯水）
    let id = 'H2O';
    let m = 0;
    for (const [sid, sm] of src.solution.solutes) {
      if (sm > m) {
        id = sid;
        m = sm;
      }
    }
    if (id === 'H2O') {
      const got = src.solution.water > 0 ? Math.min(take, src.solution.water) : 0;
      if (got <= 1e-9) return false;
      src.solution.water -= got;
      o.substance = 'H2O';
      o.liquid = got;
    } else {
      const got = src.solution.remove(id, take);
      if (got <= 1e-9) return false;
      o.substance = id;
      o.liquid = got;
    }
    return true;
  }
  return false;
}

/**
 * X 倒入：把选中烧杯里的液体全部倒入最近的烧杯/药品池（目标未满则倒入其剩余空间；
 * 最近的是满杯且附近还有别的容器 → 选下一个有余量的）。
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
  const pour = Math.min(total, tRoom);
  if (pour <= 1e-9) return false;
  const sample = o.solution.takeSample(pour);
  if (!sample) return false;
  target.solution.addSample(sample);
  for (const [id, v] of Object.entries(sample.solutes ?? {})) {
    if (v > 1e-9) target.noteSolOrigin?.(id, { kind: 'pour', text: '烧杯倒入' });
  }
  return true;
}

/**
 * 按住 X 通气：把选中集气瓶中的气体按 0.05g/s 通入最近的液体容器
 * （优先通占优气体；CO2/SO2/NO2/Cl2 在主动鼓泡时也能溶进水里）。
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
  return true;
}
