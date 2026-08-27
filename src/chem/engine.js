// ============================================================================
// 化学引擎 ChemistryEngine —— 高中版
// ----------------------------------------------------------------------------
// 核心职责：给定接触/同处的反应物与量，按质量比逐刻推进，输出产物与量（质量守恒）。
//
// Material 接口（化学引擎只依赖这一抽象，不碰渲染/碰撞）：
//   { phase:'solid'|'solution'|'gas',
//     isPlayer:boolean, container:Material|null,
//     avail(id)->g, consume(id, g)->实际移除, add(id, g), ids()->string[] }
//
// env（每刻的上下文，由调用方构造）：
//   { atmosphere, conditions:{heat,highTemp,ignited,hasCatalyst(id)},
//     globalIgnited, emit(product), explode(point,strength)?, onGas?, explodePoint? }
//
// 反应分层（优先级从高到低，先跑的先消耗共享反应物 = 反应顺序）：
//   L1 REDOX    —— 氧化还原自动配平（redox.js），含浓度/计量比分支
//   L2 IONIC    —— 离子双置换（中和/沉淀/产气，按溶解度判据）
//   L3 CATEGORY —— 类别规则（酸性氧化物+水、金属+非金属化合等）
//   L4 SPECIAL  —— 特例表（分步反应、两性溶解、活泼金属遇水、制气等）
// 爆炸：规则带 explosive 标签 → env.explode；大气可燃气体超爆炸下限遇火 → 爆炸。
// 产物路由：玩家参与 → 固体产物附着玩家；有固体反应物 → 附着（原地转化）；
//           纯溶液反应 → 沉淀成核。
// ============================================================================

import { IONS, ensureSalt, getSubstance, isMoreActive, isSoluble, normId, CONC_HIGH, PASSIVATION_CONC } from './substances.js';
import { MIN_ENTRY } from './solution.js';
import {
  RATE,
  THERMAL_RULES,
  CATALYTIC_RULES,
  COMBUSTION_RULES,
  AUTO_DECOMP_RULES,
  GAS_REDUCTION_RULES,
  SOLID_REDUCTION_RULES,
  SPECIAL_PAIR_RULES,
  METAL_NONMETAL_RULES,
  ACID_GAS_RULES,
  GAS_WATER_RULES,
  ATMOSPHERE_COMBUSTION_RULES,
  ATMOSPHERE_SPECIAL_RULES,
  acidGasRuleFor,
} from './rules.js';
import { OXIDIZERS, REDUCERS, balanceRedox, mediaInfo, STRONG_OXIDIZER } from './redox.js';
import { AtmosphereMaterial } from './atmosphere.js';

export const COMBUSTION_MIN_O2 = 0.05;
export const H_ACTIVITY = 10; // 金属活动性顺序中 (H) 的位置
export const EXPLOSION_LEL = 0.0008; // 大气可燃气体爆炸下限（质量分数，游戏尺度放宽以便关卡演示）
// "浓"酸阈值（g/L）与钝化浓度定义在 substances.js（反应分支与 UI 标注共用），
// 本文件从 substances.js 导入使用（不再 re-export——构建脚本不支持裸 re-export 语法）

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const abs = Math.abs;

/** 微量限速阈值（g）：低于此质量的溶液溶质在离子反应中按浓度因子限速，
 *  防止"生成速率≈消耗速率"的中间体在 0 附近来回翻转（有→无→有抖动）。 */
const LIMIT_MASS = 0.05;

/** 反应方程式文本（调试悬停/产物溯源用；含全部反应物与产物，不过滤 H2O/气体） */
export function reactionEquation(rxIds, pdIds) {
  return `${rxIds.join('+')} → ${pdIds.join('+')}`;
}

function phaseFactor(p1, p2) {
  if (p1 === 'solution' && p2 === 'solution') return 1.0;
  if (p1 === 'gas' || p2 === 'gas') return 0.5;
  if (p1 === 'solution' || p2 === 'solution') return 0.5;
  return 0.1; // 固-固（未溶解，反应慢）
}

/** 是否"真实溶液"（含水介质）：干式台子（酒精灯/喷灯/开关 volume=0 无水）上的
 *  沉淀粉末是固体、不电离，不能当溶液用（phase 恒为 'solution' 是适配器实现细节） */
function hasSolution(m) {
  return !!(m && m.phase === 'solution' && m.solution && m.solution.volume > 0);
}

/** 条件判定：heat/highTemp/ignited/催化/浓+加热/氧分压分支（组合条件全部满足才算真） */
function conditionMet(cond, env, ctx) {
  if (!cond) return false;
  if (cond === 'normal') return true;
  if (cond === 'heat') return !!env.conditions.heat || !!env.conditions.highTemp;
  if (cond === 'highTemp') return !!env.conditions.highTemp;
  if (cond === 'ignited') {
    return !!env.conditions.ignited && env.atmosphere.o2Fraction() > COMBUSTION_MIN_O2;
  }
  if (cond && typeof cond === 'object') {
    if (cond.catalyst !== undefined && !env.conditions.hasCatalyst(cond.catalyst)) return false;
    if (cond.heat !== undefined && !(env.conditions.heat || env.conditions.highTemp)) return false;
    if (cond.highTemp !== undefined && !env.conditions.highTemp) return false;
    if (cond.ignited !== undefined && !(env.conditions.ignited && env.atmosphere.o2Fraction() > COMBUSTION_MIN_O2)) return false;
    if (cond.light !== undefined && !env.conditions.light) return false; // 见光反应（HClO 分解等）
    if (cond.o2 !== undefined) {
      const f = env.atmosphere.o2Fraction();
      if (cond.o2 === 'low' && !(f < 0.15 && f > COMBUSTION_MIN_O2)) return false;
      if (cond.o2 === 'high' && !(f >= 0.15)) return false;
    }
    if (cond.concHigh !== undefined && !(ctx && ctx.acidConc >= CONC_HIGH)) return false;
    // 需"真实溶液"介质（容器有水，volume>0）：干式台子/开阔地固固不满足
    if (cond.solution !== undefined && !(ctx.containerMat && ctx.containerMat.solution && ctx.containerMat.solution.volume > 0)) return false;
    return true; // 组合条件全部满足
  }
  return false;
}

/** 阳离子 → 金属单质 id（'Fe2+'→'Fe'）；非金属（H+、NH4+ 等）返回 null */
function cationToMetal(catId) {
  const m = catId.match(/^[A-Za-z]+/);
  const el = m ? m[0] : '';
  const sub = getSubstance(el);
  return sub.kind === 'metal' ? el : null;
}

export class ChemistryEngine {
  constructor() {
    this._logTick = {}; // 玩家反应日志的频率限制（同反应每 ~20 次推进记 1 条）
  }

  /**
   * 记录反应摘要（HUD 显示用）。玩家身上的反应始终记录；
   * 调试模式下记录所有反应（含位置，供"玩家附近反应"面板）。
   * 防抖动处理：
   *  - 反应物按 id 排序，同一反应的不同书写顺序（NH3·H2O+HClO / HClO+NH3·H2O）
   *    归一为同一条日志，配合 Scene 侧限频避免日志面板疯狂刷新；
   *  - 只滤水，气体保留：产气反应必须有日志可见——电解水（2H2O→2H2+O2）、
   *    碳酸分解（CO2）、制氧（H2O2→O2）、制氯等，空气计只能看到"大气里多了
   *    什么气"，看不到"哪个反应产的"；
   *  - 产物只剩水（中和/燃烧生成水，无气体/实体产物）→ 无可见产物，不记录
   *    （这是"反应抖动"日志的主要噪音来源）；
   *  - 反应物只剩水（电解水）→ 保留 H2O 显示，避免出现 "→ H2+O2" 的怪日志。
   */
  _logReaction(ctx, rxIds, pdIds) {
    if (!ctx || !ctx.env.onReaction) return;
    if (!ctx.playerInvolved && !ctx.env.debugMode) return;
    const notWater = (ids) => ids.filter((id) => id !== 'H2O');
    const rx = notWater(rxIds).sort();
    const pd = notWater(pdIds).sort();
    if (pd.length === 0) return;
    if (rx.length === 0) {
      if (!rxIds.some((id) => id === 'H2O')) return;
      rx.push('H2O');
    }
    const text = `${rx.join('+')} → ${pd.join('+')}`;
    ctx.env.onReaction(text);
  }

  // ===========================================================================
  // 对外入口
  // ===========================================================================

  /** 两个物体接触，做一次成对反应（按优先级分层） */
  reactPair(matA, matB, dt, env) {
    if (matA === matB) return;
    const ctx = this._ctxOf(matA, matB, dt, env);
    // L0 关卡自定义反应：最高优先级，匹配即执行并跳过内置反应
    if (this._tryCustomPair(matA, matB, dt, env, ctx)) return;
    // 只有真实溶液（含水介质，含浸在溶液里的固体）才能发生离子/氧化还原/置换反应；
    // 干式台子（酒精灯/喷灯/开关 volume=0 无水）上的粉末是固体、不电离——NaOH 块
    // + 灯上 CuSO4 粉末没有水就不该生成 Cu(OH)2。纯固-固接触只走特例表（铝热等）
    // 与高温固固还原（CuO+C 等）
    const bothSolid = !hasSolution(matA) && !hasSolution(matB);
    if (!bothSolid) {
      this._tryRedoxPair(matA, matB, dt, env, ctx);
      this._tryIonic(matA, matB, dt, env, ctx);
      this._tryDisplacement(matA, matB, dt, env, ctx);
    }
    this._trySpecialPairs(matA, matB, dt, env, ctx);
    this._trySolidReduction(matA, matB, dt, env, ctx);
  }

  /** 单物体自反应：分解/燃烧/还原/溶解/大气吸收/同材料氧化还原
   *  opts.skipDissolution：Scene 层在成对反应后统一溶解时传 true（见 reactSelf 内注释） */
  reactSelf(mat, dt, env, opts = {}) {
    const ctx = this._ctxOf(mat, mat, dt, env);
    // L0 关卡自定义反应（单反应物自反应）：最高优先级
    if (this._tryCustomSelf(mat, dt, env, ctx)) return;
    const sources = (rule) => {
      const s = {};
      for (const r of rule.reactants) {
        s[r.id] = getSubstance(r.id).state === 'gas' ? this._atmMat(env) : mat;
      }
      return s;
    };

    for (const rule of THERMAL_RULES) {
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    for (const rule of CATALYTIC_RULES) {
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    for (const rule of AUTO_DECOMP_RULES) {
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    for (const rule of COMBUSTION_RULES) {
      if (mat.phase !== 'solid') continue; // 容器内粉末不燃烧（避免还原出的 Cu 又被氧化回 CuO）
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    // 固-固还原先于气态还原：CuO+C 粉末优先消耗 C，避免其产物 CO2 被 C+CO2→2CO 抢走碳
    for (const rule of SOLID_REDUCTION_RULES) {
      if (rule.reactants.every((r) => mat.avail(r.id) > 0)) {
        this._runRule(rule, { [rule.reactants[0].id]: mat, [rule.reactants[1].id]: mat }, dt, env, ctx);
      }
    }
    for (const rule of GAS_REDUCTION_RULES) {
      if (mat.phase !== 'solid') continue;
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    // 同材料混合粉末/溶质的氧化还原（KMnO4+FeSO4 同池、CuO+碳粉同灯）
    this._tryRedoxSelf(mat, dt, env, ctx);
    // 同材料特例：Na2O2 遇大气 CO2、CaCO3/Na2CO3 遇大气 CO2 成酸式盐
    this._trySpecialSelf(mat, dt, env, ctx);
    // 同材料特例配对（同一材料里两种溶质/沉淀混合：K2Cr2O7+NaOH 同池、
    // Na2CO3+HCl 分步、Al(OH)3+NaOH 两性溶解等）
    for (const rule of SPECIAL_PAIR_RULES) {
      const [r0, r1] = rule.reactants;
      if (getSubstance(r0.id).state === 'gas' || getSubstance(r1.id).state === 'gas') continue; // 气体规则由 _trySpecialSelf 处理
      if (rule.waterNeeded) continue; // 需水规则（CaCO3/Na2CO3+CO2）由 _trySpecialSelf 处理
      if (mat.avail(r0.id) > 0 && mat.avail(r1.id) > 0) {
        this._runRule(rule, { [r0.id]: mat, [r1.id]: mat }, dt, env, ctx);
      }
    }
    // 同材料离子反应（同池溶质混合：FeCl3+KSCN、NaOH+CuSO4 同池、AgNO3+NaCl 等）
    this._tryIonic(mat, mat, dt, env, ctx);
    // 金属与大气卤素/硫化合（点燃）
    for (const rule of METAL_NONMETAL_RULES) {
      if (mat.avail(rule.reactants[0].id) > 0) this._runRule(rule, sources(rule), dt, env, ctx);
    }
    // 溶解：Scene 层在所有成对反应**之后**统一调用（传 skipDissolution，反应优先于
    // 溶解——玩家 Na2CO3 壳先与池水 Ba(OH)2 反应回血，而不是先被溶解抢走）；
    // 直接调用 reactSelf 的单元测试不传 → 溶解照常（兼容）。
    if (!opts?.skipDissolution) this._tryDissolution(mat, dt, ctx);
    // 固体表面碱被大气酸性气体碳化（NaOH 玩家被 CO2 碳化 → 再生回血）
    this._trySolidGasAbsorb(mat, dt, env, ctx);
    // 容器水吸收大气气体（Cl2 氯水 / NH3 氨水 / SO3 / NO2——见 _tryGasWaterAbsorb）
    if (ctx.inContainer) this._tryGasWaterAbsorb(mat, dt, env, ctx);
  }

  // ===========================================================================
  // 关卡自定义反应（L0 最高优先级）：关卡用 env.customReactions 配置
  // ===========================================================================
  _ruleFromCustom(c) {
    if (!c || !Array.isArray(c.reactants) || !c.reactants.length) return null;
    const norm = (r) => {
      const id = normId(typeof r === 'string' ? r : r.id);
      return { id, coeff: typeof r === 'string' ? 1 : r.coeff || 1 };
    };
    const rule = {
      reactants: c.reactants.map(norm),
      products: (c.products || []).map(norm),
      condition: 'normal', // 无外部条件，常开
      rate: c.rate ?? RATE.custom,
    };
    return rule.reactants.length ? rule : null;
  }

  /** 成对自定义反应：反应物在 A/B 中齐全即执行并返回 true（压制内置反应） */
  _tryCustomPair(matA, matB, dt, env, ctx) {
    const customs = env.customReactions;
    if (!customs || !customs.length) return false;
    for (const c of customs) {
      const rule = this._ruleFromCustom(c);
      if (!rule) continue;
      if (rule.reactants.length >= 2) {
        const [r0, r1] = rule.reactants;
        if (matA.avail(r0.id) > 0 && matB.avail(r1.id) > 0) {
          this._runRule(rule, { [r0.id]: matA, [r1.id]: matB }, dt, env, ctx);
          return true;
        }
        if (matA.avail(r1.id) > 0 && matB.avail(r0.id) > 0) {
          this._runRule(rule, { [r0.id]: matB, [r1.id]: matA }, dt, env, ctx);
          return true;
        }
      } else {
        const r0 = rule.reactants[0];
        if (matA.avail(r0.id) > 0) { this._runRule(rule, { [r0.id]: matA }, dt, env, ctx); return true; }
        if (matB.avail(r0.id) > 0) { this._runRule(rule, { [r0.id]: matB }, dt, env, ctx); return true; }
      }
    }
    return false;
  }

  /** 自定义自反应：单反应物分解，或多反应物在同一材料内（同池两种溶质混合） */
  _tryCustomSelf(mat, dt, env, ctx) {
    const customs = env.customReactions;
    if (!customs || !customs.length) return false;
    for (const c of customs) {
      const rule = this._ruleFromCustom(c);
      if (!rule) continue;
      const srcs = {};
      let all = true;
      for (const r of rule.reactants) {
        if (mat.avail(r.id) <= 0) { all = false; break; }
        srcs[r.id] = mat;
      }
      if (all) {
        this._runRule(rule, srcs, dt, env, ctx);
        return true;
      }
    }
    return false;
  }

  /** 溶液/容器吸收大气中的酸性气体（CO2/SO2/Cl2）→ 盐；酸溶液吸收 NH3 */
  absorbAtmosphereGas(baseMat, dt, env) {
    const ctx = this._ctxOf(baseMat, baseMat, dt, env);
    for (const id of baseMat.ids()) {
      for (const gas of ['CO2', 'SO2', 'Cl2', 'NH3']) {
        const rule = acidGasRuleFor(gas, id);
        if (!rule) continue;
        const gasAvail = env.atmosphere.mass(gas);
        if (gasAvail <= 1e-9) continue;
        const gasMM = getSubstance(gas).mm;
        const baseMM = getSubstance(id).mm;
        const gasPerBase = gasMM / (rule.baseCoeff * baseMM);
        const baseAvail = baseMat.avail(id);
        if (baseAvail <= 0) continue;
        const gasAbsorb = Math.min(gasAvail, baseAvail * gasPerBase, RATE.acidGas * dt * 0.1);
        if (gasAbsorb <= 1e-9) continue;
        this._stamp(ctx, reactionEquation([gas, id], rule.products.map((p) => p.id)));
        baseMat.consume(id, gasAbsorb / gasPerBase);
        env.atmosphere.remove(gas, gasAbsorb);
        const gasMoles = gasAbsorb / gasMM;
        for (const p of rule.products) {
          this._emit(p.id, gasMoles * p.coeff * getSubstance(p.id).mm, ctx);
        }
      }
    }
  }

  /** 大气反应：可燃气体浓度超爆炸下限遇火 → 爆炸；否则缓慢燃烧/特殊反应 */
  reactAtmosphere(env, dt) {
    const atm = env.atmosphere;
    // 可燃气体（H2/CO/CH4/H2S）总量与占比
    const FUELS = ['H2', 'CO', 'CH4', 'H2S'];
    let fuel = 0;
    let total = 0;
    for (const id of Object.keys(atm.composition())) {
      const m = atm.mass(id);
      total += m;
      if (FUELS.includes(id)) fuel += m;
    }
    const frac = total > 0 ? fuel / total : 0;
    // 爆炸：可燃气体超爆炸下限（且积累足够量）+ 点燃源 + O2 达标 → 爆鸣（消耗全部可燃气体与部分 O2）
    if (env.globalIgnited && frac > EXPLOSION_LEL && fuel >= 4 && atm.o2Fraction() > COMBUSTION_MIN_O2) {
      const strength = 6 + fuel * 12;
      // 原因只列"显著"燃料（≥10% 总量，主导者在前），避免把残留的微量 H2 写进爆鸣原因误导
      const cause = `${FUELS.filter((f) => atm.mass(f) > fuel * 0.1).sort((a, b) => atm.mass(b) - atm.mass(a)).join('+') || '可燃气体'} 爆鸣`;
      atm._cause = cause; // 盖章：爆鸣消耗燃料/O2 的原因
      for (const g of FUELS) atm.remove(g, atm.mass(g));
      atm.remove('O2', Math.min(atm.mass('O2'), fuel * 2.5));
      if (env.explode) env.explode(env.explodePoint ?? null, strength, cause);
      return;
    }
    if (!env.globalIgnited) return;
    // 缓慢燃烧（低浓度）与大气特殊反应（合成氨、氨催化氧化）
    const env2 = { ...env, conditions: { ...env.conditions, ignited: true } };
    const atmMat = this._atmMat(env);
    const ctx = this._ctxOf(atmMat, atmMat, dt, env2);
    for (const rule of ATMOSPHERE_COMBUSTION_RULES) {
      const s = {};
      for (const r of rule.reactants) s[r.id] = atmMat;
      this._runRule(rule, s, dt, env2, ctx);
    }
    for (const rule of ATMOSPHERE_SPECIAL_RULES) {
      const s = {};
      for (const r of rule.reactants) s[r.id] = atmMat;
      this._runRule(rule, s, dt, env2, ctx);
    }
    // 白烟：NH3 + HCl → NH4Cl（大气中相遇成固体小颗粒）
    const nh3 = atm.mass('NH3');
    const hcl = atm.mass('HCl');
    if (nh3 > 1e-9 && hcl > 1e-9) {
      const mmNH3 = getSubstance('NH3').mm;
      const mmHCl = getSubstance('HCl').mm;
      const m = Math.min(nh3, (hcl * mmNH3) / mmHCl, RATE.special * dt);
      if (m > 1e-9) {
        this._stamp(ctx, reactionEquation(['NH3', 'HCl'], ['NH4Cl']));
        atm.remove('NH3', m);
        atm.remove('HCl', (m * mmHCl) / mmNH3);
        ctx.env.emit({ id: 'NH4Cl', mass: m * (1 + mmHCl / mmNH3), phase: 'particle' }, ctx.lastRxText);
      }
    }
  }

  // ===========================================================================
  // L1 氧化还原（自动配平）
  // ===========================================================================

  _tryRedoxPair(matA, matB, dt, env, ctx) {
    const cands = this._redoxCandidates(matA, matB, env, ctx);
    for (const c of cands) this._runRedox(c, dt, env, ctx);
  }

  _tryRedoxSelf(mat, dt, env, ctx) {
    const cands = this._redoxCandidates(mat, mat, env, ctx);
    for (const c of cands) this._runRedox(c, dt, env, ctx);
  }

  /** 收集氧化剂×还原剂候选，按氧化剂强度/还原性排序（强氧化剂优先消耗共享还原剂） */
  _redoxCandidates(matA, matB, env, ctx) {
    const out = [];
    const oxIdsOf = (mat) => {
      const list = [];
      for (const id of mat.ids()) {
        if (OXIDIZERS[id]) list.push({ oxId: id });
        // 非氧化性酸（HCl/稀 H2SO4）→ 归一为 H+ 氧化剂（金属+酸产 H2）；
        // HNO3 是氧化性酸走 NO3- 还原（表中 HNO3 条目）
        const s = getSubstance(id);
        if (s.ions?.cat === 'H+' && s.kind === 'acid' && id !== 'HNO3' && id !== 'H2SO4') {
          list.push({ oxId: 'H+', acidId: id });
        }
        if (id === 'H2SO4') list.push({ oxId: 'H2SO4', acidId: 'H2SO4' }); // 浓硫酸氧化（稀/常温不氧化见 _isPassivated）
      }
      return list;
    };
    const push = (oxMat, redMat) => {
      for (const { oxId, acidId } of oxIdsOf(oxMat)) {
        const ox = OXIDIZERS[oxId];
        for (const redId of redMat.ids()) {
          if (oxId === redId) continue;
          const red = REDUCERS[redId];
          if (!red) continue;
          // 氧化剂强度门槛（I2 氧化性不足，不能氧化 Fe2+）
          if (red.minOx && (ox.strength ?? 0) < red.minOx) continue;
          if (this._isPassivated(oxId, redId, env, ctx)) continue;
          // 金属+酸：只有活动性在 H 之前的金属能置换出 H2（Cu/Ag 不反应）
          if (oxId === 'H+' || oxId === 'H2SO4') {
            const metal = getSubstance(redId);
            if (metal.kind === 'metal' && !(metal.activity < H_ACTIVITY)) continue;
          }
          // Na/K/Li 遇盐溶液：先与水反应（特例），不直接置换
          if ((redId === 'Na' || redId === 'K' || redId === 'Li') && getSubstance(oxId).kind === 'salt') continue;
          const score = (ox.strength ?? 0) * 100 + (REDOX_REDUCIBILITY[redId] ?? 0);
          out.push({ oxMat, redMat, oxId, redId, acidId: acidId ?? null, score });
        }
      }
    };
    push(matA, matB);
    if (matA !== matB) push(matB, matA);
    out.sort((p, q) => q.score - p.score);
    return out;
  }

  /** 氧化性酸的浓度/温度条件：浓 H2SO4 需"浓+加热"才氧化（Cu 等）；Fe/Al 常温浓酸钝化 */
  _isPassivated(oxId, redId, env, ctx) {
    if (oxId === 'H2SO4') {
      // 稀硫酸/常温不氧化任何金属（只走 H+ 产氢路径）；浓+加热才氧化（Fe/Al 钝化也要加热后）
      if (!(ctx.acidConc >= PASSIVATION_CONC && (env.conditions.heat || env.conditions.highTemp))) return true;
      return false;
    }
    if (oxId !== 'HNO3') return false;
    if (redId !== 'Fe' && redId !== 'Al') return false;
    // Fe/Al 常温遇浓硝酸钝化（加热后反应）
    if (ctx.acidConc >= PASSIVATION_CONC && !(env.conditions.heat || env.conditions.highTemp)) return true;
    return false;
  }

  /** 还原剂"还原性强弱"（同共享氧化剂时强者先反应：I- > Fe2+ > Br-） */
  _pickRedKey(oxId, redId, env, ctx) {
    const red = REDUCERS[redId];
    if (!red.branches) return undefined;
    if (red.branches.weak && red.branches.strong) {
      if (oxId === 'HNO3') {
        // Fe + HNO3 计量比：酸过量（n≥4×nFe）→ Fe3+；Fe 过量 → Fe2+
        const nHNO3 = this._molesOf(ctx, oxId);
        const nFe = this._molesOf(ctx, redId);
        return nHNO3 / Math.max(1e-9, nFe) >= 4 ? 'strong' : 'weak';
      }
      return (OXIDIZERS[oxId].strength ?? 0) >= STRONG_OXIDIZER ? 'strong' : 'weak';
    }
    if (red.branches.full && red.branches.partial) {
      // C：O2 分压决定充分/不充分燃烧
      return env.atmosphere.o2Fraction() > 0.3 ? 'full' : 'partial';
    }
    return undefined;
  }

  /** 配平执行：摩尔推进（质量守恒） */
  _runRedox(cand, dt, env, ctx) {
    const { oxMat, redMat, oxId, redId } = cand;
    const redKey = this._pickRedKey(oxId, redId, env, ctx);
    const acidId = cand.acidId ?? (oxId === 'HNO3' || oxId === 'H+' ? (ctx.acidId || 'H2SO4') : ctx.acidId);
    const eq = balanceRedox(oxId, redId, {
      medium: ctx.medium,
      acidId,
      baseId: ctx.baseId,
      conc: ctx.acidConc,
      redKey,
    });
    if (!eq) return;
    // 防呆：产物与反应物完全同集（如 CuSO4+Cu 同元素往返）→ 跳过
    if (eq.pd.every((p) => eq.rx.some((r) => r.id === p.id))) return;

    const ref = eq.rx[0];
    const refMM = getSubstance(ref.id).mm;
    // 金属+酸（H+ 氧化剂）是教学核心：快速产 H2（否则攒不够爆鸣演示）；
    // 双氧水作还原剂（被氧化放出 O2，如 NaClO+H2O2 制氧）也加快——否则太慢看不见
    let rate = RATE.redox * (oxId === 'H+' ? 8 : 1) * phaseFactor(oxMat.phase, redMat.phase) * (redId === 'H2O2' ? 4 : 1);
    for (const r of eq.rx) {
      const m = this._rxSource(r.id, oxMat, redMat, ctx);
      if (!m) return;
      rate *= this._concFactorFor(m, r.id);
    }
    let units = (rate * dt) / refMM;
    for (const r of eq.rx) {
      const m = this._rxSource(r.id, oxMat, redMat, ctx);
      units = Math.min(units, this._availFor(m, r.id) / (getSubstance(r.id).mm * r.coeff));
    }
    if (!(units > 1e-12)) return;
    // 盖章大气原因（REDOX 可能消耗大气 O2/CO/H2，须在消耗前盖章）
    this._stamp(ctx, reactionEquation(eq.rx.map((r) => r.id), eq.pd.map((p) => p.id)));
    // 按实际消耗推进：固体反应物可能被致密外壳阻断（consume 只取暴露格），
    // 产物必须按"实际移除量"生成，否则会凭空造出产物——如 Fe 被 Cu 壳包住后还在长铜。
    let scale = 1;
    for (const r of eq.rx) {
      const m = this._rxSource(r.id, oxMat, redMat, ctx);
      const take = units * r.coeff * getSubstance(r.id).mm;
      const removed = m.consume(r.id, take);
      if (take > 1e-12) scale = Math.min(scale, removed / take);
    }
    if (!(scale > 1e-9)) return;
    const act = units * scale;
    for (const p of eq.pd) {
      this._emit(p.id, act * p.coeff * getSubstance(p.id).mm, ctx);
    }
    this._logReaction(ctx, eq.rx.map((r) => r.id), eq.pd.map((p) => p.id));
  }

  /** 反应物来源：优先氧化剂/还原剂材料本身，其次介质溶液 */
  _rxSource(id, oxMat, redMat, ctx) {
    if (oxMat.avail(id) > 1e-12 || oxMat.ids().includes(id)) return oxMat;
    if (redMat !== oxMat && (redMat.avail(id) > 1e-12 || redMat.ids().includes(id))) return redMat;
    if (ctx.containerMat && ctx.containerMat.avail(id) > 1e-12) return ctx.containerMat;
    return null;
  }

  _molesOf(ctx, id) {
    if (!ctx.containerMat) return 0;
    return ctx.containerMat.avail(id) / getSubstance(id).mm;
  }

  /**
   * 反应可用量：固体材料用"暴露格"质量（被致密外壳包住的内核不计入反应，
   * 否则产物会按总量凭空生成——如 Fe 被 Cu 壳包住后还在长铜）；溶液/气体用总量。
   */
  _availFor(m, id) {
    return m.exposedAvail ? m.exposedAvail(id) : m.avail(id);
  }

  /**
   * 记录反应方程式并"盖章"给大气（气体产生/消耗原因溯源：本反应的
   * 方程式将出现在大气气体变化日志里）。
   */
  _stamp(ctx, text) {
    ctx.lastRxText = text;
    if (ctx.env && ctx.env.atmosphere) ctx.env.atmosphere._cause = text;
    return text;
  }

  // ===========================================================================
  // L2 离子双置换（中和/沉淀/产气）
  // ===========================================================================

  _tryIonic(matA, matB, dt, env, ctx) {
    // 离子交换需要水性介质（电离发生地）：干式台子（灯/开关 volume=0）上的粉末
    // 是固体不能电离（灯上 NaOH + CuSO4 无水不该生成 Cu(OH)2）；
    // reactPair 已按 hasSolution 拦截，这里兜底 reactSelf 的同材料离子路径
    if (!hasSolution(matA) && !hasSolution(matB)) return;
    for (const idA of matA.ids()) {
      const eA = getSubstance(idA);
      if (!eA.ions) continue;
      for (const idB of matB.ids()) {
        if (idA === idB) continue;
        const eB = getSubstance(idB);
        if (!eB.ions) continue;
        // 不溶物（沉淀/不溶固体）不电离，不能参与离子交换：
        // 只与酸/碱（H+/OH-）反应（溶解/中和），不与盐复分解
        // （如 Fe(OH)2 沉淀 + CuSO4 不反应；Cu(OH)2 + HCl 溶解）
        if (!isSoluble(idA) && eB.kind !== 'acid' && eB.kind !== 'base') continue;
        if (!isSoluble(idB) && eA.kind !== 'acid' && eA.kind !== 'base') continue;
        this._ionicOne(matA, matB, idA, idB, eA, eB, dt, env, ctx);
      }
    }
  }

  _ionicOne(matA, matB, idA, idB, eA, eB, dt, env, ctx) {
    const { cat: catA, an: anA, catCount: xA, anCount: yA } = eA.ions;
    const { cat: catB, an: anB, catCount: xB, anCount: yB } = eB.ions;

    // 金属氧化物（阴离子 O2-）只与酸反应（避免 NaOH+CuO→Cu(OH)2+Na2O 之类的假反应）
    if (anA === 'O2-' && catB !== 'H+') return;
    if (anB === 'O2-' && catA !== 'H+') return;

    const p1 = this._pairInfo(catA, anB, idA, idB);
    const p2 = this._pairInfo(catB, anA, idA, idB);
    if (!p1.drives && !p2.drives) return;

    // 离子不在表中（运行时生成的盐/自定义反应引入的离子）→ 跳过该离子反应，不崩溃
    const c1 = abs(IONS[catA]?.charge ?? 0);
    const a2 = abs(IONS[anB]?.charge ?? 0);
    const c2 = abs(IONS[catB]?.charge ?? 0);
    const a1 = abs(IONS[anA]?.charge ?? 0);
    if (!c1 || !a2 || !c2 || !a1) return;

    const ratio = (yB / c1) * (a2 / xA);
    const mmA = eA.mm;
    const mmB = eB.mm;
    // 微量限速：低于 MIN_IONIC_MASS 的溶液溶质，本 tick 最多反应其总量 × 浓度因子。
    // 否则"生成速率 ≈ 消耗速率"的中间体（如 NH4ClO：NH3·H2O+HClO 生成 0.0002g/tick，
    // NH4ClO+NaOH 立刻吃光）会在 0 附近每 tick 来回翻转——溶液面板"有→无→有"抖动。
    // 限速后中间体累积到非零稳态（生成=消耗×浓度），条目稳定存在。正常量（≥0.05g）
    // 与固体（浓度因子=1）不受影响。
    const molesA_avail = this._availFor(matA, idA) / mmA;
    const molesB_avail = this._availFor(matB, idB) / mmB;
    const limitFactor = (m, id) => {
      const avail = this._availFor(m, id);
      return avail < LIMIT_MASS && m.phase === 'solution' ? this._concFactorFor(m, id) : 1;
    };
    // 弱酸/弱碱（CH3COOH、H2CO3、氨水）电离慢 → 离子反应速率打折（强酸优先）
    const rate = RATE.ionic * phaseFactor(matA.phase, matB.phase)
      * this._concFactorFor(matA, idA) * this._concFactorFor(matB, idB)
      * this._strengthFactor(matA, idA) * this._strengthFactor(matB, idB);
    const molesA_tick = (rate * dt) / mmA;

    const molesA = Math.min(
      molesA_avail * limitFactor(matA, idA),
      molesB_avail * ratio * limitFactor(matB, idB),
      molesA_tick,
    );
    if (!(molesA > 1e-12)) return;
    const molesB = molesA / ratio;
    this._stamp(ctx, reactionEquation([idA, idB], [...p1.products, ...p2.products].map((p) => p.id)));

    const remA = matA.consume(idA, molesA * mmA);
    const remB = matB.consume(idB, molesB * mmB);
    // 固体反应物被外壳阻断时按实际消耗缩放产物（避免凭空生成沉淀/气体）
    let scale = 1;
    if (molesA * mmA > 1e-12) scale = Math.min(scale, remA / (molesA * mmA));
    if (molesB * mmB > 1e-12) scale = Math.min(scale, remB / (molesB * mmB));
    if (!(scale > 1e-9)) return;
    const aA = molesA * scale;
    const aB = molesB * scale;

    const g1 = gcd(c1, a2);
    const g2 = gcd(c2, a1);
    const p1Moles = (aA * xA * g1) / a2;
    const p2Moles = (aB * xB * g2) / a1;
    for (const prod of p1.products) this._emit(prod.id, p1Moles * prod.coeff * getSubstance(prod.id).mm, ctx);
    for (const prod of p2.products) this._emit(prod.id, p2Moles * prod.coeff * getSubstance(prod.id).mm, ctx);
    this._logReaction(ctx, [idA, idB], [...p1.products, ...p2.products].map((p) => p.id));
  }

  /** 酸/碱强度因子：强酸强碱 1，弱酸弱碱 0.1（弱电解质电离慢） */
  _strengthFactor(mat, id) {
    const s = getSubstance(id);
    if (s.kind === 'acid' || s.kind === 'base') {
      return s.acidStrength === 'strong' ? 1 : 0.1;
    }
    return 1;
  }

  /** 一对 (catId, anId) 的产物与是否驱动反应（沉淀/气体/水/显色） */
  _pairInfo(catId, anId, idA, idB) {
    if (catId === 'H+' && anId === 'OH-') return { drives: true, products: [{ id: 'H2O', coeff: 1 }] };
    if (catId === 'H+' && anId === 'CO3^2-') return { drives: true, products: [{ id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }] };
    if (catId === 'H+' && anId === 'HCO3-') return { drives: true, products: [{ id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }] };
    if (catId === 'H+' && anId === 'SO3^2-') return { drives: true, products: [{ id: 'SO2', coeff: 1 }, { id: 'H2O', coeff: 1 }] };
    if (catId === 'H+' && anId === 'S2-') return { drives: true, products: [{ id: 'H2S', coeff: 1 }] };
    if (catId === 'H+' && anId === 'SiO3^2-') return { drives: true, products: [{ id: 'H2SiO3', coeff: 1 }] }; // 硅酸胶状沉淀（水玻璃+酸）
    if (catId === 'NH4+' && anId === 'OH-') return { drives: true, products: [{ id: 'NH3', coeff: 1 }, { id: 'H2O', coeff: 1 }] };
    // 检验铁离子：Fe3+ + 3SCN- → 血红色溶液（显色驱动）
    if (catId === 'Fe3+' && anId === 'SCN-') return { drives: true, products: [{ id: 'Fe(SCN)3', coeff: 1 }] };
    const salt = ensureSalt(catId, anId);
    if (salt.id === idA || salt.id === idB) return { drives: false, products: [] };
    // 驱动判据：不溶 → 沉淀；**微溶**（solubilityLimit，如 Ca(OH)2/Ag2SO4/CaSO4/PbCl2）
    // → 也生成（进溶液，超过饱和浓度时析出——"滴到一定量后溶液变浑浊"）
    return { drives: salt.soluble !== 'soluble' || salt.solubilityLimit > 0, products: [{ id: salt.id, coeff: 1 }] };
  }

  // ===========================================================================
  // L4 特例表 / 固固还原（数据规则）
  // ===========================================================================

  _trySpecialPairs(matA, matB, dt, env, ctx) {
    for (const rule of SPECIAL_PAIR_RULES) this._runPairDataRule(rule, matA, matB, dt, env, ctx);
  }

  _trySolidReduction(matA, matB, dt, env, ctx) {
    for (const rule of SOLID_REDUCTION_RULES) this._runPairDataRule(rule, matA, matB, dt, env, ctx);
  }

  _runPairDataRule(rule, matA, matB, dt, env, ctx) {
    if (rule.atmosphereOnly) return; // 仅大气反应（NH3+HCl 白烟在 reactAtmosphere）
    // 碳酸盐+CO2→酸式盐需有水且非强酸性（酸性环境碳酸盐直接被酸分解产 CO2，不会积累酸式盐）
    if (rule.waterNeeded && !(ctx.inContainer && ctx.containerMat.avail('H2O') > 0)) return;
    if (rule.waterNeeded && ctx.medium === 'acid') return;
    const [r0, r1] = rule.reactants;
    const gas0 = getSubstance(r0.id).state === 'gas';
    const gas1 = getSubstance(r1.id).state === 'gas';
    const src0 = gas0 ? this._atmMat(env) : null;
    const src1 = gas1 ? this._atmMat(env) : null;
    const has0 = (m) => (gas0 ? src0.avail(r0.id) > 0 : m.avail(r0.id) > 0);
    const has1 = (m) => (gas1 ? src1.avail(r1.id) > 0 : m.avail(r1.id) > 0);
    if (has0(matA) && has1(matB)) {
      this._runRule(rule, { [r0.id]: gas0 ? src0 : matA, [r1.id]: gas1 ? src1 : matB }, dt, env, ctx);
    } else if (has0(matB) && has1(matA)) {
      this._runRule(rule, { [r0.id]: gas0 ? src0 : matB, [r1.id]: gas1 ? src1 : matA }, dt, env, ctx);
    }
  }

  /** 同材料自反应特例：Na2O2 遇大气 CO2、碳酸盐遇过量 CO2 成酸式盐 */
  _trySpecialSelf(mat, dt, env, ctx) {
    const atm = env.atmosphere;
    // Na2O2 + CO2（大气）→ Na2CO3 + O2
    if (mat.avail('Na2O2') > 0 && atm.mass('CO2') > 1e-9) {
      const rule = SPECIAL_PAIR_RULES.find((r) => r.reactants[0].id === 'Na2O2' && r.reactants[1].id === 'CO2');
      if (rule) this._runRule(rule, { Na2O2: mat, CO2: this._atmMat(env) }, dt, env, ctx);
    }
    // 溶液/池中的碳酸盐 + 过量大气 CO2 → 碳酸氢盐（少量 CO2 先生成正盐，过量后转化；酸性环境不转化）
    if (ctx.inContainer && ctx.medium !== 'acid' && atm.mass('CO2') > 1e-9 && ctx.containerMat.avail('H2O') > 0) {
      for (const rule of SPECIAL_PAIR_RULES) {
        const [r0, r1] = rule.reactants;
        const gasId = getSubstance(r0.id).state === 'gas' ? r0.id : getSubstance(r1.id).state === 'gas' ? r1.id : null;
        if (gasId !== 'CO2') continue;
        const solidId = r0.id === 'CO2' ? r1.id : r0.id;
        if (mat.avail(solidId) > 0) {
          this._runRule(rule, { [solidId]: mat, CO2: this._atmMat(env) }, dt, env, ctx);
        }
      }
    }
  }

  // ===========================================================================
  // 金属置换（活动性序：仅盐溶液；金属+酸由 REDOX 统一处理）
  // ===========================================================================

  _tryDisplacement(matA, matB, dt, env, ctx) {
    for (let swapped = 0; swapped < 2; swapped++) {
      const A = swapped ? matB : matA;
      const B = swapped ? matA : matB;
      for (const idM of A.ids()) {
        if (getSubstance(idM).kind !== 'metal') continue;
        for (const idE of B.ids()) {
          const e = getSubstance(idE);
          if (!e.ions) continue;
          if (e.kind !== 'salt') continue; // 酸由 REDOX 的 H+ 氧化剂处理
          this._displaceOne(A, B, idM, idE, dt, env, ctx);
        }
      }
    }
  }

  _displaceOne(matM, matE, idM, idE, dt, env, ctx) {
    const m = getSubstance(idM);
    const e = getSubstance(idE);
    const { cat: catE, an: anE } = e.ions;
    const v = m.valence;

    const metalCat = cationToMetal(catE);
    if (!metalCat) return;
    if (!isMoreActive(idM, metalCat)) return; // 前面的金属置换后面的
    const cM = abs(IONS[catE]?.charge ?? 0);
    if (!cM) return; // 离子不在表中 → 跳过置换
    // 金属阳离子：化合价 1 时省略数字（K → K+，不是 K1+）
    const metalCation = `${idM}${v > 1 ? v : ''}+`;
    const salt = ensureSalt(metalCation, anE);
    const saltCatCount = salt.ions.catCount;
    const products = [
      { id: salt.id, coeff: 1 / saltCatCount },
      { id: metalCat, coeff: v / cM },
    ];
    const acidH = v / cM / e.ions.catCount;

    const mmM = m.mm;
    const mmE = e.mm;
    const xTick = (RATE.displace * phaseFactor(matM.phase, matE.phase)
      * this._concFactorFor(matM, idM) * this._concFactorFor(matE, idE) * dt) / mmM;
    const xByM = this._availFor(matM, idM) / mmM;
    const xByE = this._availFor(matE, idE) / mmE / acidH; // 用暴露量：固体盐被致密壳包住时产物不按全量算
    const x = Math.max(0, Math.min(xTick, xByM, xByE));
    if (x <= 1e-12) return;
    this._stamp(ctx, reactionEquation([idM, idE], products.map((p) => p.id)));

    // 按实际消耗推进：金属可能已被致密壳（Cu/氧化物）包住，consume 只取暴露格，
    // 产物按实际置换的摩尔数生成，避免"包好壳后还在凭空长铜"。
    const remM = matM.consume(idM, x * mmM);
    const xAct = remM / mmM;
    if (xAct <= 1e-12) return;
    matE.consume(idE, xAct * acidH * mmE);
    for (const p of products) {
      this._emit(p.id, xAct * p.coeff * getSubstance(p.id).mm, ctx);
    }
    this._logReaction(ctx, [idM, idE], products.map((p) => p.id));
  }

  // ===========================================================================
  // 通用推进（质量守恒核心）
  // ===========================================================================

  /**
   * 执行一条规则：按 rate 与限域试剂推进一个 tick，消耗并产出。
   * 规则带 explosive 标签 → 推进后触发爆炸。
   */
  _runRule(rule, sources, dt, env, ctx) {
    if (!conditionMet(rule.condition, env, ctx)) return;
    const ref = rule.reactants[0];
    const refMM = getSubstance(ref.id).mm;
    let rate = rule.rate;
    for (const r of rule.reactants) {
      const m = sources[r.id];
      if (!m) return;
      rate *= this._concFactorFor(m, r.id);
    }
    let units = (rate * dt) / refMM;

    for (const r of rule.reactants) {
      const m = sources[r.id];
      const mm = getSubstance(r.id).mm;
      units = Math.min(units, this._availFor(m, r.id) / (mm * r.coeff));
    }
    // !(units > 0) 同时拦截 NaN/负值（NaN 比较恒 false，旧写法 units<=0 会放行 NaN）
    if (!(units > 1e-12)) return;
    // 盖章大气原因（燃烧会消耗大气 O2/燃料，须在消耗前盖章）
    this._stamp(ctx, reactionEquation(rule.reactants.map((r) => r.id), rule.products.map((p) => p.id)));

    // 按实际消耗推进：固体反应物被致密外壳阻断时（consume 只取暴露格），产物同步减少，
    // 避免"产物凭空生成"（如 CuO 被还原出的 Cu 包住后还继续产 Cu）。
    let scale = 1;
    let reactedMass = 0;
    for (const r of rule.reactants) {
      const m = sources[r.id];
      const take = units * r.coeff * getSubstance(r.id).mm;
      const removed = m.consume(r.id, take);
      reactedMass += removed;
      if (take > 1e-12) scale = Math.min(scale, removed / take);
    }
    if (!(scale > 1e-9)) return;
    const act = units * scale;
    for (const p of rule.products) {
      this._emit(p.id, act * p.coeff * getSubstance(p.id).mm, ctx);
    }
    this._logReaction(ctx, rule.reactants.map((r) => r.id), rule.products.map((p) => p.id));
    // 反应现象：金属燃烧迸发火星（火星四射——铁/镁/铝等在氧中燃烧的标志现象）
    if (rule.sparks && env.onSpark) env.onSpark();
    // 爆炸：剧烈反应（放热+产气）→ 冲击波（威力∝实际反应量），原因=反应方程式
    if (rule.explosive && env.explode) {
      env.explode(env.explodePoint ?? null, 4 + reactedMass * 1.2, ctx.lastRxText || '剧烈反应');
    }
  }

  /**
   * 可溶固体浸入含水的溶液 → 溶解为溶质。
   * 玩家：非核心的可溶物质（反应附着上去的盐壳）会被池水"洗掉"；
   * 核心物质（=血量）与不溶壳（Cu(OH)2/BaCO3 等）保留。
   */
  _tryDissolution(mat, dt, ctx) {
    if (mat.phase !== 'solid') return;
    const container = mat.container;
    if (!container || container.avail('H2O') <= 0) return;
    const core = mat.obj ? mat.obj.substance : mat.substance; // 玩家核心物质（=血量）
    const isPlayer = mat.isPlayer;
    for (const id of mat.ids()) {
      if (!isSoluble(id)) continue;
      if (isPlayer && id === core) continue; // 玩家核心物质不溶解
      // 玩家全身的可溶物都能洗掉（不限于浸入区域）；物块按浸入区域溶解
      const avail = isPlayer && mat.obj?.grid ? mat.obj.grid.avail(id) : mat.avail(id);
      const mass = Math.min(avail, RATE.dissolution * dt);
      if (mass <= 0) continue;
      if (isPlayer && mat.obj?.grid) mat.obj.grid.consume(id, mass);
      else mat.consume(id, mass);
      container.add(id, mass, { kind: 'dissolve' }); // 固体溶解入池水 → 来源=溶解
    }
  }

  // ===========================================================================
  // 产物路由
  // ===========================================================================

  _ctxOf(matA, matB, dt, env) {
    const containerMat = matA.container || matB.container;
    // 固体反应物（产物附着目标：Fe 浸 CuSO4 表面变铜等）
    const solidObj = (matA.phase === 'solid' && (matA.obj ?? matA.owner))
      ? (matA.obj ?? matA.owner)
      : (matB.phase === 'solid' && (matB.obj ?? matB.owner) ? (matB.obj ?? matB.owner) : null);
    // 玩家核心物质（可溶产物 == 核心 → 附着回血；其余可溶产物进溶液）
    const playerCore = matA.isPlayer ? (matA.obj?.substance ?? matA.substance ?? null)
      : matB.isPlayer ? (matB.obj?.substance ?? matB.substance ?? null)
      : null;
    // 粉末沉淀参与：自由沉淀粒子（amount）或灯上的沉淀（precipitates，如灯上的 Al/CuO 粉末）。
    // 池子里的沉淀是反应产物/沉渣、不是反应物，不算粉末（否则会破坏"沉淀附着回血"等机制）。
    // 粉末 + 物块/玩家反应时，固体产物以沉淀形式生成，不附着到物块表面。
    const isPowder = (obj) => obj && (obj.amount !== undefined || (obj.isLamp && obj.precipitates && obj.precipitates.size > 0));
    const aObj = matA.obj ?? matA.owner;
    const bObj = matB.obj ?? matB.owner;
    const powderInvolved = isPowder(aObj) || isPowder(bObj);
    // 介质判定（溶液强酸/强碱 → REDOX 的 H+/OH- 分支）
    let medium = 'neutral';
    let acidId = null;
    let baseId = null;
    let acidConc = 0;
    const sol = containerMat?.solution ?? (matA.solution ?? matB.solution ?? null);
    if (sol) {
      const info = mediaInfo(sol);
      medium = info.medium;
      acidId = info.acidId;
      if (acidId) acidConc = (sol.mass(acidId) / sol.volume) * 1000;
      if (info.baseId) baseId = info.baseId;
      if (medium === 'acid' && !acidId) medium = 'neutral';
    }
    return {
      env,
      dt,
      inContainer: !!containerMat,
      containerMat,
      playerInvolved: matA.isPlayer || matB.isPlayer,
      solidObj,
      playerCore,
      powderInvolved,
      medium,
      acidId,
      baseId,
      acidConc,
      lastRxText: null, // 本反应方程式（每次反应前设置，供产物/气泡溯源）
    };
  }

  _emit(id, mass, ctx) {
    // 挡住 NaN/非法质量（反应数学异常时避免生成 NaN 粒子 → 物品栏质量变 NaN）
    if (!Number.isFinite(mass) || mass <= 1e-9) return;
    const sub = getSubstance(id);

    if (sub.state === 'gas') {
      this._emitGas(id, mass, ctx);
      return;
    }
    if (id === 'H2O') {
      // 水只进"真容器"（池/烧杯等有水介质）；干式台子（灯/开关 volume=0）与开阔地
      // 的水蒸发不建模——否则灯上反应（NH4Cl+Ca(OH)2 制氨等）会把水积进灯里，
      // 干式台子被"弄湿"后触发本不该发生的遇水反应
      if (ctx.inContainer && ctx.containerMat.solution && ctx.containerMat.solution.volume > 0) {
        ctx.containerMat.add('H2O', mass);
      }
      return;
    }
    // 特例：Cu(OH)2 絮状沉淀一律成核沉淀（多缝隙不附着，用户指定）
    if (id === 'Cu(OH)2') {
      if (ctx.inContainer) ctx.env.emit({ id, mass, phase: 'precipitate' }, ctx.lastRxText);
      else ctx.env.emit({ id, mass, phase: 'particle' }, ctx.lastRxText);
      return;
    }
    if (ctx.playerInvolved && sub.state === 'solid') {
      // 玩家参与：可溶产物（非玩家核心）直接进溶液（ZnCl2 溶于盐酸，不堆积在身上）；
      // 核心物质（NaOH 再生回血）与不溶物（BaCO3 壳阻断）附着玩家
      if (isSoluble(id) && id !== ctx.playerCore) {
        if (ctx.inContainer) {
          ctx.containerMat.add(id, mass, ctx.lastRxText);
          return;
        }
        ctx.env.emit({ id, mass, phase: 'particle' }, ctx.lastRxText);
        return;
      }
      // 玩家核心物质再生：仍附着回血；其他不可溶产物：粉末参与时以沉淀形式生成（玩家也是物块）
      if (id === ctx.playerCore || !ctx.powderInvolved) {
        ctx.env.emit({ id, mass, phase: 'adhere' }, ctx.lastRxText);
        return;
      }
      ctx.env.emit({ id, mass, phase: 'precipitate' }, ctx.lastRxText);
      return;
    }
    if (ctx.solidObj && sub.state === 'solid') {
      // 有固体反应物参与：可溶产物直接进溶液（ZnCl2 不附着在锌块上），
      // 不溶产物附着在反应物表面（Fe 浸 CuSO4 表面就地变铜）
      if (ctx.inContainer && isSoluble(id)) {
        ctx.containerMat.add(id, mass, ctx.lastRxText);
        return;
      }
      // 粉末沉淀 + 物块反应：固体产物以沉淀形式生成（不附着到物块表面）
      if (ctx.powderInvolved) {
        ctx.env.emit({ id, mass, phase: 'precipitate' }, ctx.lastRxText);
        return;
      }
      ctx.env.emit({ id, mass, phase: 'adhere', target: ctx.solidObj }, ctx.lastRxText);
      return;
    }
    if (ctx.inContainer) {
      if (isSoluble(id)) ctx.containerMat.add(id, mass, ctx.lastRxText);
      else ctx.env.emit({ id, mass, phase: 'precipitate' }, ctx.lastRxText);
      return;
    }
    if (ctx.playerInvolved) {
      ctx.env.emit({ id, mass, phase: 'adhere' }, ctx.lastRxText);
      return;
    }
    ctx.env.emit({ id, mass, phase: 'particle' }, ctx.lastRxText);
  }

  /** 气体产物：碱/酸吸收 → 水溶解成酸 → 剩余进大气 */
  _emitGas(id, mass, ctx) {
    if (!Number.isFinite(mass) || mass <= 1e-9) return;
    if (ctx.env.onGas) ctx.env.onGas(id, mass, ctx);
    let leftover = mass;
    const baseMat = ctx.inContainer ? ctx.containerMat : null;
    // 1. 碱吸收酸性气体 / 酸吸收 NH3（尾气处理、石灰水检验等）
    if (baseMat) {
      for (const base of baseMat.ids()) {
        const rule = acidGasRuleFor(id, base);
        if (!rule) continue;
        const gasMM = getSubstance(id).mm;
        const baseMM = getSubstance(base).mm;
        const gasPerBase = gasMM / (rule.baseCoeff * baseMM);
        const baseAvail = baseMat.avail(base);
        if (baseAvail <= 0) continue;
        const gasAbsorb = Math.min(leftover, baseAvail * gasPerBase, RATE.acidGas * ctx.dt);
        if (gasAbsorb <= 1e-9) continue;
        baseMat.consume(base, gasAbsorb / gasPerBase);
        const gasMoles = gasAbsorb / gasMM;
        for (const p of rule.products) {
          this._emit(p.id, gasMoles * p.coeff * getSubstance(p.id).mm, ctx);
        }
        leftover -= gasAbsorb;
        if (leftover <= 1e-9) return;
      }
    }
    // 2. 水溶解气体（CO2→H2CO3、SO2→H2SO3、SO3→H2SO4、NO2→HNO3+NO、NH3→氨水、
    //    Cl2→氯水溶质）；消耗等摩尔水（防止 H2CO3⇌CO2+H2O 循环无限产水）
    if (leftover > 1e-9 && baseMat && baseMat.avail('H2O') > 0) {
      for (const gw of GAS_WATER_RULES) {
        if (gw.gas !== id) continue;
        // CO2/SO2/NO2/Cl2 不主动溶进水：否则 CO2 形成 H2CO3→CO2 零净循环无限冒泡、
        // NO2 被水转成 NO 逃不出来（浓硝酸红棕变无色）、Cl2 溶成氯水看不到黄绿气体。
        // 它们与碱/水的反应由被动吸收（_tryGasWaterAbsorb/碱吸收）按大气浓度慢慢进行。
        if (gw.gas === 'CO2' || gw.gas === 'SO2' || gw.gas === 'NO2' || gw.gas === 'Cl2') continue;
        const gasMM = getSubstance(id).mm;
        const diss = Math.min(leftover, RATE.acidGas * ctx.dt * 0.15);
        if (diss <= 1e-9) break;
        const waterNeed = diss / gasMM; // 1 mol 气体配 1 mol 水（简化）
        if (baseMat.avail('H2O') < waterNeed) break;
        baseMat.consume('H2O', waterNeed);
        if (getSubstance(gw.acid).state === 'gas') {
          baseMat.add(gw.acid, (diss * getSubstance(gw.acid).mm) / gasMM, ctx.lastRxText); // 气体溶质（氯水）
        } else {
          this._emit(gw.acid, (diss * getSubstance(gw.acid).mm) / gasMM, ctx);
        }
        if (gw.byGas) this._emit(gw.byGas, (diss * getSubstance(gw.byGas).mm) / gasMM, ctx);
        leftover -= diss;
        break;
      }
    }
    if (leftover > 1e-9) ctx.env.atmosphere.add(id, leftover);
  }

  /**
   * 溶液浓度因子：反应物浓度越低反应越慢（相对其饱和显色浓度；无色溶质用默认参照）。
   * 固体/气体返回 1。范围钳制在 [0.05, 1]，避免反应永远无法完成。
   */
  _concFactorFor(mat, id) {
    if (!mat || mat.phase !== 'solution' || !mat.solution) return 1;
    // 干式台子（酒精灯/喷灯 volume=0，内部无水）不参与浓度计算——
    // 否则 mass/0 = NaN 会污染 rate → 反应推进 NaN → 溶液写入 NaN
    if (!(mat.solution.volume > 0)) return 1;
    if (id === 'H2O') return 1; // 溶剂浓度恒定（避免 water=0 时反应被压到 5%）
    if (mat.owner && mat.owner.precipitates && (mat.owner.precipitates.get(id) ?? 0) > 0) return 1;
    const sub = getSubstance(id);
    const sat = sub.ionColor ? sub.ionColor.sat : 100;
    const gPerL = (mat.solution.mass(id) / mat.solution.volume) * 1000;
    if (!Number.isFinite(gPerL) || gPerL <= 0) return 0.05;
    return Math.max(0.05, Math.min(1, gPerL / sat));
  }

  /** 固体材料表层（暴露格）的碱吸收大气酸性气体 → 附着自身（NaOH 玩家被 CO2 碳化） */
  _trySolidGasAbsorb(mat, dt, env, ctx) {
    if (mat.phase !== 'solid' || !mat.obj || !mat.obj.grid) return;
    const exp = mat.obj.grid.exposedMasses ? mat.obj.grid.exposedMasses() : null;
    if (!exp) return;
    for (const id of Object.keys(exp)) {
      const s = getSubstance(id);
      if (s.kind !== 'base') continue;
      for (const gas of ['CO2', 'SO2', 'Cl2']) {
        const rule = acidGasRuleFor(gas, id);
        if (!rule) continue;
        const gasAvail = env.atmosphere.mass(gas);
        if (gasAvail <= 1e-9) continue;
        const gasMM = getSubstance(gas).mm;
        const baseMM = getSubstance(id).mm;
        const gasPerBase = gasMM / (rule.baseCoeff * baseMM);
        const absorb = Math.min(gasAvail, exp[id] * gasPerBase, RATE.acidGas * dt * 0.05); // 缓慢碳化（玩家有足够时间走到再生池）
        if (absorb <= 1e-9) continue;
        const removedBase = mat.consume(id, absorb / gasPerBase);
        const actAbsorb = removedBase * gasPerBase; // 实际吸收（表层被壳包住时 consume 只取暴露格，会小于请求）
        if (actAbsorb <= 1e-9) continue;
        this._stamp(ctx, reactionEquation([id, gas], rule.products.map((p) => p.id)));
        env.atmosphere.remove(gas, actAbsorb);
        const gasMoles = actAbsorb / gasMM;
        for (const p of rule.products) {
          const pmass = gasMoles * p.coeff * getSubstance(p.id).mm;
          if (p.id === 'H2O') {
            // 水不附着固体：容器内进池水，开阔地蒸发（绝不生成"水沉淀"粒子）
            if (ctx.inContainer) ctx.containerMat.add('H2O', pmass);
            continue;
          }
          // 碳化产物就地附着固体表面（玩家形成 Na2CO3 壳；NaOH 物块同样就地碳化）。
          // 显式 target=反应固体：非玩家物块碳化时不至于找不到目标、把 Na2CO3 撒成游离粒子。
          ctx.env.emit({ id: p.id, mass: pmass, phase: 'adhere', target: mat.obj ?? ctx.solidObj ?? null }, ctx.lastRxText);
        }
        this._logReaction(ctx, [id, gas], rule.products.map((p) => p.id));
      }
    }
  }

  /**
   * 容器水吸收大气气体 → 溶解（Cl2 氯水、NH3 氨水、SO3→H2SO4、NO2→HNO3+NO）。
   * 注意：CO2/SO2 不在此主动吸收——否则 CO2→H2CO3→分解→CO2 的净零循环会让
   * 所有含水容器一直冒 CO2 气泡（CO2/SO2 的溶解只在反应产气时即时发生）。
   */
  _tryGasWaterAbsorb(mat, dt, env, ctx) {
    if (!ctx.inContainer || ctx.containerMat.avail('H2O') <= 0) return;
    const atm = env.atmosphere;
    for (const gw of GAS_WATER_RULES) {
      // CO2/SO2/NO2/Cl2 不主动吸收：CO2/SO2 是分解循环源，NO2 会被立刻吸回转成 NO
      // （浓硝酸红棕变无色），Cl2 溶成氯水看不到黄绿气体。它们在大气中可见、由碱吸收等路径处理。
      if (gw.gas === 'CO2' || gw.gas === 'SO2' || gw.gas === 'NO2' || gw.gas === 'Cl2') continue;

      const gasAvail = atm.mass(gw.gas);
      if (gasAvail <= MIN_ENTRY) continue;
      const gasMM = getSubstance(gw.gas).mm;
      const absorb = Math.min(gasAvail, RATE.acidGas * dt * 0.1);
      // 微量不吸收：吸收量不足 MIN_ENTRY 时让气体留在大气（空气计可见），
      // 避免在溶液里反复生成"0.000g 级"的微量溶质（NH3·H2O 条目翻转）
      if (absorb <= MIN_ENTRY) continue;
      const waterNeed = absorb / gasMM;
      if (ctx.containerMat.avail('H2O') < waterNeed) continue;
      this._stamp(ctx, reactionEquation([gw.gas], [gw.acid, gw.byGas].filter(Boolean)));
      ctx.containerMat.consume('H2O', waterNeed);
      atm.remove(gw.gas, absorb);
      if (getSubstance(gw.acid).state === 'gas') {
        ctx.containerMat.add(gw.acid, (absorb * getSubstance(gw.acid).mm) / gasMM, ctx.lastRxText); // 氯水溶质
      } else {
        this._emit(gw.acid, (absorb * getSubstance(gw.acid).mm) / gasMM, ctx);
      }
      if (gw.byGas) this._emit(gw.byGas, (absorb * getSubstance(gw.byGas).mm) / gasMM, ctx);
    }
  }

  _atmMat(env) {
    return new AtmosphereMaterial(env.atmosphere);
  }
}

// 还原剂"还原性"次序（供候选排序：还原性强者优先被氧化——Cl2 先氧化 I- 再 Fe2+ 再 Br-）
const REDOX_REDUCIBILITY = {
  KI: 100, NaI: 100, H2S: 95, FeS: 95, H2SO3: 80, SO2: 80, Na2SO3: 80,
  FeSO4: 70, FeCl2: 70, H2C2O4: 65, C2H5OH: 60, H2O2: 50, CO: 45, H2: 40,
  C: 30, KBr: 25, NaBr: 25, HCl: 15, Fe: 10, Cu: 9, Zn: 8, Mg: 7, Al: 6,
  Na: 5, K: 5, Li: 5, 'K2MnO4': 40, H2: 40,
};
