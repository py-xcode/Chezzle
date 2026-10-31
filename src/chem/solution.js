// ============================================================================
// 溶液模型
// ----------------------------------------------------------------------------
// volume = 容器容量（mL），不是当前液体体积；实际液体体积见 liquidVolume()。
// 溶质按质量存储；水作为溶剂单独跟踪（中和反应会累积水）。
// concentration(id) = 溶质质量 / **实际液体体积**  → 供显色/饱和度/反应速率参照。
// pH()：由酸/碱溶质的浓度与强弱（电离度）计算；盐类水解按弱酸根/弱碱阳离子近似。
// ============================================================================

import { getSubstance, normId } from './substances.js';

const WEAK_IONIZATION = 0.02; // 弱酸/弱碱电离度（简化）

/** 盐类水解近似：弱酸根（碱式）/ 弱碱阳离子（酸式）对应的水解常数。
 *  只用于 pH 方向与量级（不追求精确的多元电离），够指示剂/pH 标签使用。 */
const ANION_KB = {
  'CO3^2-': 2e-4, 'HCO3-': 2e-8, 'SO3^2-': 1e-7, 'S2-': 1e-2,
  'ClO-': 3e-7, 'CH3COO-': 5.6e-10, 'PO4^3-': 1e-2, 'SiO3^2-': 1e-2,
  'AlO2-': 1e-2, 'C2O4^2-': 1e-10, 'CrO2-': 1e-8,
};
const CATION_KA = {
  'NH4+': 5.6e-10, 'Fe3+': 6e-3, 'Al3+': 1e-5, 'Cr3+': 1e-4,
  'Cu2+': 1e-8, 'Fe2+': 1e-6, 'Zn2+': 1e-9, 'Mg2+': 1e-11,
};

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

  /** 实际液体体积（mL）。
   *  - 有水：按质量近似（水 + 溶质 ≈ 1 g/mL），并夹在容器容量内；
   *  - 没有水（测试夹具/干容器预设）：沿用容量，兼容"只给 solute 不写 water"的旧语义；
   *  - 容量为 0（干式台子）：0（不能当液体）。 */
  liquidVolume() {
    let soluteMass = 0;
    for (const m of this.solutes.values()) soluteMass += m;
    const total = this.water + soluteMass;
    if (this.water > 1e-9) {
      const cap = this.volume > 0 ? this.volume : total;
      return Math.max(0, Math.min(cap, total));
    }
    return this.volume > 0 ? this.volume : 0;
  }

  /** 溶液 pH：由强/弱酸碱的摩尔浓度计算（弱电解质按 2% 电离），再叠加盐类水解。 */
  pH() {
    let h = 0;
    let oh = 0;
    const volL = this.liquidVolume() / 1000;
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
      } else if (sub.kind === 'salt' && sub.ions) {
        // 盐类水解：弱酸根显碱、弱碱阳离子显酸（强酸盐如 NaCl 两项都不命中 → pH 7）
        const kb = ANION_KB[sub.ions.an];
        if (kb) oh += Math.sqrt(kb * molPerL);
        const ka = CATION_KA[sub.ions.cat];
        if (ka) h += Math.sqrt(ka * molPerL);
      }
    }
    // 强酸强碱同存时相互中和（简化：取优势方；水解量级小，不会压过强酸碱）
    if (h > 1e-12 && h >= oh) return Math.max(0, -Math.log10(h));
    if (oh > 1e-12 && oh > h) return Math.min(14, 14 + Math.log10(oh));
    return 7;
  }

  mass(id) {
    return this.solutes.get(normId(id)) ?? 0;
  }

  concentration(id) {
    const vol = this.liquidVolume();
    return vol > 0 ? this.mass(id) / vol : 0;
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
    // 微溶饱和：溶液先持续**变浑浊**（渲染按浓度/饱和线），拉到饱和浓度后才开始析出；
    // 再留一段"过饱和带"（1.25×）才真正出沉淀——"过了过饱和线才开始出沉淀颗粒"
    const sub = getSubstance(id);
    if (sub && sub.solubilityLimit > 0 && typeof this.onOversaturate === 'function') {
      // 饱和量按**实际液体体积**算（加水稀释后饱和线随之抬高）
      const totalAfter = this.totalMass() + m;
      const vol = this.water > 1e-9
        ? (this.volume > 0 ? Math.min(this.volume, totalAfter) : totalAfter)
        : (this.volume > 0 ? this.volume : 0);
      if (vol > 0) {
        const satMass = sub.solubilityLimit * (vol / 1000); // 饱和浓度对应的质量
        const overMass = satMass * 1.25; // 过饱和带（1.25× 后才析出）
        if (next > overMass) {
          const excess = next - overMass;
          this.solutes.set(id, overMass);
          this.onOversaturate(id, excess);
          return;
        }
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

  /** 溶液总质量（水 + 全部溶质，g） */
  totalMass() {
    let s = this.water;
    for (const m of this.solutes.values()) s += m;
    return s;
  }

  /**
   * 取走一份"同比例样品"（质量 ≤ mass，不足取全部）——水和各溶质按原比例一起
   * 转移（玩家用烧杯/滴管从药品池吸液：吸走的是整份溶液，不是提纯后的一种）。
   * 返回 { water, solutes } 或 null（无液体可取/非法参数）。
   */
  takeSample(mass) {
    if (!(mass > 0)) return null;
    const total = this.totalMass();
    if (total <= 1e-9) return null;
    const m = Math.min(mass, total);
    const f = m / total;
    const out = { water: this.water * f, solutes: {} };
    for (const [id, v] of this.solutes) out.solutes[id] = v * f;
    this.water -= out.water;
    for (const [id, v] of Object.entries(out.solutes)) this.remove(id, v);
    return out;
  }

  /** 把 takeSample 得到的样品并入本溶液（水进"水"字段，溶质按 add 规则入账） */
  addSample(sample) {
    if (!sample) return;
    if (sample.water > 0) this.water += sample.water;
    for (const [id, v] of Object.entries(sample.solutes ?? {})) {
      if (v > 0) this.add(id, v);
    }
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
