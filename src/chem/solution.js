// ============================================================================
// 溶液模型
// ----------------------------------------------------------------------------
// 固定体积（液面不下降），溶质按质量存储。水作为溶剂单独跟踪（中和反应会累积水）。
// concentration(id) = 溶质质量 / 体积  → 供显色与饱和度参照。
// pH()：由酸/碱溶质的浓度与强弱（电离度）计算——强酸/强碱完全电离，
// 弱酸/弱碱（CH3COOH、H2CO3、NH3·H2O 等）按 2% 电离。
// ============================================================================

import { getSubstance, normId } from './substances.js';

const WEAK_IONIZATION = 0.02; // 弱酸/弱碱电离度（简化）

/** 溶液条目的最小记账质量（g）：
 *  低于此质量的溶质不建立条目（add 总量不足不入账、remove 后剩余不足则删除并
 *  丢弃残留，误差 ≤ MIN_ENTRY，对玩法无感——粒子最小 0.1g）。
 *  防止"生成速率≈消耗速率"的微量物质（如 NH3·H2O 的产氨-吸收循环）在旧阈值
 *  （1e-9）边缘反复出现/消失（溶液面板"0.000g ↔ 不显示"抖动）；同时远小于
 *  微量限速阈值（LIMIT_MASS=0.05），正常量级与"微量累积型"（每 tick 0.00025g
 *  的 NH4ClO 累积到稳态 0.0033g）都不受影响。 */
export const MIN_ENTRY = 1e-4;

export class Solution {
  constructor({ volume = 300, solutes = {}, water = 0 } = {}) {
    this.volume = volume;
    this.water = water;
    this.solutes = new Map(); // id -> g（id 一律为规范化名）
    for (const [id, m] of Object.entries(solutes)) {
      if (m > 0) this.solutes.set(normId(id), m);
    }
  }

  /** 溶液 pH：由强/弱酸碱的摩尔浓度计算（弱电解质按 2% 电离） */
  pH() {
    let h = 0;
    let oh = 0;
    const volL = this.volume / 1000;
    if (volL <= 0) return 7;
    for (const [id, mass] of this.solutes) {
      const sub = getSubstance(id);
      const molPerL = mass / sub.mm / volL;
      if (molPerL <= 0) continue;
      if (sub.kind === 'acid' && sub.ions?.cat === 'H+') {
        const ion = sub.acidStrength === 'strong' ? 1 : WEAK_IONIZATION;
        h += molPerL * sub.ions.catCount * ion;
      } else if (sub.kind === 'base' && sub.ions?.an === 'OH-') {
        const ion = sub.acidStrength === 'strong' ? 1 : WEAK_IONIZATION;
        oh += molPerL * sub.ions.anCount * ion;
      }
    }
    // 强酸强碱同存时相互中和（简化：取优势方）
    if (h > 1e-12 && h >= oh) return Math.max(0, -Math.log10(h));
    if (oh > 1e-12 && oh > h) return Math.min(14, 14 + Math.log10(oh));
    return 7;
  }

  mass(id) {
    return this.solutes.get(normId(id)) ?? 0;
  }

  concentration(id) {
    return this.mass(id) / this.volume;
  }

  /** 增加溶质（负值按移除处理）；id 归一化（NH4OH → NH3·H2O）。
   *  总量仍低于 MIN_ENTRY 的微量入账直接丢弃（不建立条目）；
   *  非有限质量（NaN/Infinity）直接忽略（防反应异常污染溶液）。
   *  微溶物质（solubilityLimit g/L）：超过饱和浓度 → 超出部分析出（onOversaturate 钩子，
   *  容器把它变成可见沉淀——"滴到一定量后溶液浑浊"）。 */
  add(id, m) {
    id = normId(id);
    if (!Number.isFinite(m) || m === 0) return;
    if (m < 0) {
      this.remove(id, -m);
      return;
    }
    const next = (this.solutes.get(id) ?? 0) + m;
    if (next < MIN_ENTRY) return; // 微量不入账：防"0.000g ↔ 不显示"的条目抖动
    // 微溶饱和：超出的部分析出（溶液保持饱和浓度；析出的量进容器沉淀）
    const sub = getSubstance(id);
    if (sub && sub.solubilityLimit > 0 && this.volume > 0 && typeof this.onOversaturate === 'function') {
      const limitMass = sub.solubilityLimit * (this.volume / 1000);
      if (next > limitMass) {
        const excess = next - limitMass;
        this.solutes.set(id, limitMass);
        this.onOversaturate(id, excess);
        return;
      }
    }
    this.solutes.set(id, next);
  }

  /** 移除溶质，返回实际移除量（不会为负）；id 归一化。
   *  剩余不足 MIN_ENTRY 时删除条目并丢弃残留（误差 ≤ MIN_ENTRY，玩法无感）。
   *  m 非有限（NaN）时返回 0（不写坏溶液）。 */
  remove(id, m) {
    id = normId(id);
    if (!(m > 0)) return 0;
    const cur = this.solutes.get(id) ?? 0;
    if (!Number.isFinite(cur)) {
      // 防御：值已被污染为 NaN 时清掉条目（不继续传播）
      this.solutes.delete(id);
      return 0;
    }
    const removed = Math.min(cur, m);
    const next = cur - removed;
    if (next < MIN_ENTRY) this.solutes.delete(id);
    else this.solutes.set(id, next);
    return removed;
  }

  /** 转移走某溶质指定质量，返回实际移除量 */
  take(id, m) {
    return this.remove(id, m);
  }

  ids() {
    return [...this.solutes.keys()];
  }

  has(id) {
    return this.solutes.has(normId(id));
  }

  clone() {
    const c = new Solution({ volume: this.volume, water: this.water });
    for (const [id, m] of this.solutes) c.solutes.set(id, m);
    return c;
  }
}

// ============================================================================
// SolutionMaterial：把 Solution 适配成化学引擎使用的 Material 接口
//   { phase:'solution', container:this, avail/consume/add/ids, isPlayer:false }
// ============================================================================
export class SolutionMaterial {
  constructor(solution, owner = null) {
    this.solution = solution;
    this.owner = owner; // 容器对象（池/烧杯/开关…），渲染与交互用
    this.phase = 'solution';
    this.isPlayer = false;
    this.container = this; // 溶液本身就是"所在容器"的内容
  }

  avail(id) {
    if (id === 'H2O') return this.solution.water;
    return this.solution.mass(id);
  }

  consume(id, mass) {
    if (id === 'H2O') {
      const r = Math.min(this.solution.water, mass);
      this.solution.water -= r;
      return r;
    }
    return this.solution.remove(id, mass);
  }

  add(id, mass) {
    if (id === 'H2O') {
      this.solution.water += mass;
      return;
    }
    this.solution.add(id, mass);
  }

  ids() {
    return this.solution.ids();
  }
}
