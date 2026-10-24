// ============================================================================
// 集气瓶（GasBottle）：可收集气体的玻璃瓶（**有实体**——与烧杯同一套容器物理）。
// ----------------------------------------------------------------------------
// - 碰撞箱 = 玻璃瓶身轮廓（左右瓶壁沿**瓶身段** = 瓶口以下 10px → 瓶底；
//   瓶口/瓶颈区开放——细瓶颈两侧是空气，不该挡人；**没有盖板**，瓶口始终敞开）
// - 可推动：玩家贴外壁行走会推动整只瓶子；受重力，无支撑时下落；
// - 容量默认 5g：按住 C（背包含集气瓶）时，把最近气泡柱产生的气体直接截留进瓶
//   （气体不再进大气）；按住 X 向最近液体容器（池/烧杯）通入气体（0.05g/s）；
// - 收集/倒出/放置与烧杯、滴管同一套"可拾取物品"流程（Q 拾取 / Shift 放置），
//   进背包时瓶壁子体一并移出场景。
// - 视觉：气体在瓶内**充满整个容积**（气体均匀扩散，不按密度积在底部）；
//   无色气体（CO2/H2/O2…）只画极淡冷白雾，不套用气体标签色当液体用。
// ============================================================================

import { Obj } from './obj.js';
import { getSubstance } from '../chem/substances.js';
import { CFG } from '../core/config.js';
import { shallowestSupportY, settleBodyOnSupport } from '../physics/support.js';
import { rr } from '../render/theme.js';
import { hexToRgb } from '../render/color.js';

/** 十六进制色 + 透明度 → rgba 字符串（装置组视觉共用） */
function rgbaOf(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

export const BOTTLE_W = 30;
export const BOTTLE_H = 56;

const WALL = 4; // 瓶壁厚（px）
const NECK_H = 10; // 瓶口/瓶颈区高度（px）：无侧壁，只有透明瓶颈
const MOUTH_RY = 2.2; // 瓶口椭圆（开口）短半径
const COLORLESS_FILL = '#e4f2ff'; // 无色气体：极淡冷白，不做成蓝色液体

let SEQ_N = 0; // 无 id 集气瓶的子体命名序号（防 byId 键冲突）

export class GasBottle extends Obj {
  constructor({ x, y, capacity = CFG.item.bottleCapacity, gases = null, ...rest } = {}) {
    super({
      x, y, w: BOTTLE_W, h: BOTTLE_H,
      solid: false, physicsKind: 'none', noLift: true,
      ...rest,
    });
    this.wall = WALL;
    this.vy = 0;
    this._fillPulse = 0; // 装气辉光脉冲
    // 实体子体：左右瓶壁（**瓶身段**：口下 NECK_H → 瓶底）+ 底。**没有瓶盖**。
    // static：壁是"与瓶身联动的死墙"——不参与动量交换（动态壁会被玩家撞飞再被
    // syncWalls 拉回 → 推动强烈震动——用户反馈）；noLift：不被气泡柱顶飞。
    // 瓶颈区（顶部 NECK_H）无侧壁——细瓶颈两侧是空气，不该挡人。
    const pid = rest.id ? `${rest.id}_gb` : `gb${++SEQ_N}`;
    this.subBodies = [
      new Obj({ id: `${pid}_l`, x, y: y + NECK_H, w: WALL, h: BOTTLE_H - NECK_H, solid: true, static: true, physicsKind: 'static', noLift: true }),
      new Obj({ id: `${pid}_r`, x: x + BOTTLE_W - WALL, y: y + NECK_H, w: WALL, h: BOTTLE_H - NECK_H, solid: true, static: true, physicsKind: 'static', noLift: true }),
      new Obj({ id: `${pid}_b`, x, y: y + BOTTLE_H - WALL, w: BOTTLE_W, h: WALL, solid: true, static: true, physicsKind: 'static', noLift: true }),
    ];
    this.syncWalls();
    this.capacity = Math.max(0.1, capacity);
    this.gases = new Map(); // gasId → g
    if (gases) {
      for (const [id, m] of Object.entries(gases)) {
        if (Number.isFinite(m) && m > 0) this.gases.set(id, Math.min(m, this.capacity - this.totalGas()));
      }
    }
  }

  get isCarryItem() {
    return 'bottle';
  }

  get hoverLabel() {
    if (this.totalGas() <= 1e-9) return '集气瓶（空）';
    return `集气瓶·${this.gasLabel()}（${this.totalGas().toFixed(1)}g）`;
  }

  /** 瓶内气体标签：单一气体显示 id，混合显示"多气体" */
  gasLabel() {
    const d = this.dominantGas();
    if (!d) return '';
    if (this.gases.size > 1) return `${d[0]}等`;
    return d[0];
  }

  /** 当前总量最占优的气体（通入时先通它）：[id, mass] 或 null */
  dominantGas() {
    let best = null;
    for (const [id, m] of this.gases) {
      if (!best || m > best[1]) best = [id, m];
    }
    return best;
  }

  totalGas() {
    let s = 0;
    for (const m of this.gases.values()) s += m;
    return s;
  }

  /** 装入气体（容量封顶），返回实际装入量；装气时辉光脉冲一下 */
  addGas(id, mass) {
    if (!(mass > 0)) return 0;
    const room = this.capacity - this.totalGas();
    if (room <= 1e-9) return 0;
    const take = Math.min(room, mass);
    this.gases.set(id, (this.gases.get(id) ?? 0) + take);
    this._fillPulse = 1;
    return take;
  }

  /** 取出气体（不超过持有量），返回实际取出量 */
  removeGas(id, mass) {
    if (!(mass > 0)) return 0;
    const cur = this.gases.get(id) ?? 0;
    const r = Math.min(cur, mass);
    const n = cur - r;
    if (n <= 1e-9) this.gases.delete(id);
    else this.gases.set(id, n);
    return r;
  }

  /** 瓶内气体代表色（占优气体）；空瓶淡青（用于文字/图标等装饰色） */
  gasColor() {
    const d = this.dominantGas();
    if (!d) return '#78dcff';
    const sub = getSubstance(d[0]);
    return sub?.gasColor ?? '#78dcff';
  }

  /** 瓶内气体**填充**色：只有本身有颜色的气体才用 substance.gasColor；
   *  无色气体（CO2/H2/O2/N2…）返回极淡冷白，避免把气体画成蓝色液体。 */
  gasFillColor() {
    const d = this.dominantGas();
    if (!d) return COLORLESS_FILL;
    return getSubstance(d[0])?.gasColor ?? COLORLESS_FILL;
  }

  /** 壁体跟随瓶身位置 */
  syncWalls() {
    const [l, r, b] = this.subBodies;
    l.x = this.x;
    l.y = this.y + NECK_H;
    r.x = this.x + this.w - this.wall;
    r.y = this.y + NECK_H;
    b.x = this.x;
    b.y = this.y + this.h - this.wall;
  }

  /** 无支撑时受重力下落，落到**最浅**支撑面停住（与烧杯同款：statics + 实心动态体，
   *  不沉入池盆/高台侧面——见 physics/support.js） */
  applyGravity(dt, scene) {
    const sup = shallowestSupportY(this, scene);
    this._onIce = sup.ice; // 是否立在冰面上（冰面惯性滑行用）
    settleBodyOnSupport(this, dt, sup.y);
  }

  update(dt, scene) {
    this.applyGravity(dt, scene);
    // 冰面惯性滑行在 pushContainers（Player.update）里驱动
    // 玩家贴壁推动已挪到 Player.update（pushContainers——时序要求：玩家重设 vel 之后、
    // 物理步之前：吸附+清 vel，否则推-弹交替"一卡一卡"——用户反馈）
    // 动画计时衰减（装气辉光消退）
    if (this._fillPulse > 0) this._fillPulse = Math.max(0, this._fillPulse - dt * 1.8);
  }

  /** 物理结算后：壁体贴回瓶身当前位置（爆炸推散等下一帧即复位）。
   *  注：瓶坐头顶时不做帽子式跟随（用户明确不要胶合感）。 */
  lateUpdate() {
    this.syncWalls();
  }

  // ---------------------------------------------------------------------------
  // 渲染（简洁版）：暗紫玻璃瓶身 + 敞开瓶口（**没有盖板**）。
  //   气体在瓶内充满整个容积：只画低透明度雾气/漂移气团，不画"液面线"，
  //   也不按密度把气体堆在瓶底；无色气体用极淡冷白，不套用蓝色液体色。
  // ---------------------------------------------------------------------------
  render(ctx, opts = {}) {
    const t = opts?.time ?? 0;
    const x = this.x;
    const y = this.y;
    const w = this.w;
    const h = this.h;
    const frac = Math.max(0, Math.min(1, this.totalGas() / this.capacity));
    const fillColor = this.gasFillColor();
    const labelColor = this.dominantGas() && getSubstance(this.dominantGas()[0])?.gasColor
      ? fillColor
      : COLORLESS_FILL;
    const cx = x + w / 2;
    const bodyW = w;
    const bodyH = h - 12; // 上 12px 为颈/口
    const bodyY = y + 12;
    const r = Math.max(4, Math.min(7, w * 0.2)); // 瓶身圆角
    const neckHalfTop = w * 0.23;
    const neckHalfBot = w * 0.34;
    const neckTopY = y + 2;
    const neckBotY = bodyY;

    // 瓶颈梯形路径（与瓶身组合成"瓶内腔"，气体填充/裁剪共用）
    const neckPath = () => {
      ctx.beginPath();
      ctx.moveTo(cx - neckHalfBot, neckBotY);
      ctx.lineTo(cx - neckHalfTop, neckTopY);
      ctx.lineTo(cx + neckHalfTop, neckTopY);
      ctx.lineTo(cx + neckHalfBot, neckBotY);
      ctx.closePath();
    };

    ctx.save();
    // ---- 1) 玻璃瓶身（暗紫玻璃圆柱：底圆角）----
    ctx.beginPath();
    ctx.roundRect(x, bodyY, bodyW, bodyH, r);
    const glass = ctx.createLinearGradient(x, bodyY, x + bodyW, bodyY + bodyH);
    glass.addColorStop(0, 'rgba(150,130,230,0.20)');
    glass.addColorStop(0.45, 'rgba(70,60,140,0.10)');
    glass.addColorStop(1, 'rgba(120,110,200,0.17)');
    ctx.fillStyle = glass;
    ctx.fill();

    // ---- 2) 瓶颈玻璃 ----
    neckPath();
    const neckGlass = ctx.createLinearGradient(cx - neckHalfBot, 0, cx + neckHalfBot, 0);
    neckGlass.addColorStop(0, 'rgba(160,140,240,0.22)');
    neckGlass.addColorStop(0.5, 'rgba(90,80,170,0.12)');
    neckGlass.addColorStop(1, 'rgba(160,140,240,0.20)');
    ctx.fillStyle = neckGlass;
    ctx.fill();

    // ---- 3) 气体：充满整个瓶内腔（含瓶颈），只做低透明度雾气/漂移气团 ----
    if (frac > 0.01) {
      ctx.save();
      // 裁剪到"瓶身 + 瓶颈"内腔：气体铺满整个容积，不按密度积在底部
      ctx.beginPath();
      ctx.roundRect(x + 1.4, bodyY + 1.4, bodyW - 2.8, bodyH - 2.8, Math.max(2, r - 1));
      ctx.moveTo(cx - neckHalfTop + 0.8, neckTopY + 1.2);
      ctx.lineTo(cx + neckHalfTop - 0.8, neckTopY + 1.2);
      ctx.lineTo(cx + neckHalfBot - 0.8, neckBotY);
      ctx.lineTo(cx - neckHalfBot + 0.8, neckBotY);
      ctx.closePath();
      ctx.clip();
      // 整瓶均匀的极淡底色（不是"液面高度"）
      const baseA = 0.035 + 0.055 * frac; // 无色也保持极淡
      const tintA = 0.10 + 0.11 * frac;
      ctx.globalAlpha = 1;
      const bodyGrad = ctx.createLinearGradient(0, neckTopY, 0, bodyY + bodyH);
      bodyGrad.addColorStop(0, rgbaOf(fillColor, baseA * 0.7));
      bodyGrad.addColorStop(0.55, rgbaOf(fillColor, baseA));
      bodyGrad.addColorStop(1, rgbaOf(fillColor, baseA * 1.15));
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      // 漂移气团（确定性 sin；越满越明显）——让"气体"看起来在流动，而不是液体
      const wisps = 3;
      for (let i = 0; i < wisps; i++) {
        const phase = t * (0.28 + i * 0.11) + i * 2.35;
        const px = x + w * (0.28 + 0.44 * (0.5 + 0.5 * Math.sin(phase)));
        const py = bodyY + bodyH * (0.22 + 0.56 * (0.5 + 0.5 * Math.sin(phase * 0.82 + i * 1.9)));
        const pr = Math.max(6, Math.min(bodyW, bodyH) * (0.24 + i * 0.07));
        const wg = ctx.createRadialGradient(px, py, 1, px, py, pr);
        wg.addColorStop(0, rgbaOf(fillColor, tintA * (0.55 + 0.25 * this._fillPulse)));
        wg.addColorStop(1, rgbaOf(fillColor, 0));
        ctx.fillStyle = wg;
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      // 瓶颈里也有一缕很淡的气体
      const neckGrad = ctx.createLinearGradient(0, neckTopY, 0, neckBotY);
      neckGrad.addColorStop(0, rgbaOf(fillColor, baseA));
      neckGrad.addColorStop(1, rgbaOf(fillColor, baseA * 1.4));
      ctx.fillStyle = neckGrad;
      ctx.fillRect(cx - neckHalfBot, neckTopY, w * 0.68, NECK_H);
      ctx.restore();
    }

    // ---- 4) 玻璃描边 + 左侧高光 ----
    ctx.beginPath();
    ctx.roundRect(x, bodyY, bodyW, bodyH, r);
    ctx.strokeStyle = 'rgba(210,230,255,0.6)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    neckPath();
    ctx.strokeStyle = 'rgba(210,230,255,0.62)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x + 2.2, bodyY + 4);
    ctx.lineTo(x + 2.2, bodyY + bodyH - 5);
    ctx.stroke();

    // ---- 5) 瓶肩黄铜卡箍（一条，不是盖子）----
    const bandY = bodyY - 1.6;
    const bandH = Math.max(2.4, h * 0.05);
    rr(ctx, x + w * 0.18, bandY, w * 0.64, bandH, 1.2);
    const bandG = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
    bandG.addColorStop(0, '#ffe6a8');
    bandG.addColorStop(0.45, '#c9932f');
    bandG.addColorStop(1, '#6b4a18');
    ctx.fillStyle = bandG;
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,6,0.75)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // ---- 6) 敞开瓶口：暗色瓶口椭圆 + 细玻璃口沿（没有盖板）----
    ctx.beginPath();
    ctx.ellipse(cx, neckTopY + 0.6, neckHalfTop, MOUTH_RY, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(7,10,26,0.62)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(210,230,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ---- 7) 装气闪环（收气成功的一圈扩散光，动画保留）----
    if (this._fillPulse > 0.01) {
      ctx.globalAlpha = this._fillPulse * 0.5;
      ctx.strokeStyle = this.gasColor();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, y + h / 2, w * 0.62 + (1 - this._fillPulse) * 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // 标签（非空时瓶身下方显示气体种类与量）
    if (frac > 0.01) {
      const d = this.dominantGas();
      ctx.font = 'bold 10px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,18,32,0.72)';
      const label = `${d[0]} ${this.totalGas().toFixed(1)}g`;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(cx - tw / 2 - 4, this.bottom - 2, tw + 8, 14);
      ctx.fillStyle = labelColor;
      ctx.fillText(label, cx, this.bottom + 8);
      ctx.textAlign = 'left';
    }
  }
}
