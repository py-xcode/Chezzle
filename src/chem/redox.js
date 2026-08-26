// ============================================================================
// 氧化还原规律系统（L1 REDOX_SYSTEM）
// ----------------------------------------------------------------------------
// 数据驱动：氧化剂表 + 还原剂表（各按价态/介质分支），balanceRedox 自动配平：
//   1. 电子守恒 → 主系数（得失电子数最小公倍数）
//   2. 电荷守恒 → 介质离子（酸性补 H+ / 碱性补 OH-）
//   3. 氧守恒 → H2O 系数；氢守恒校验（不平衡则判该组合不成立）
//   4. 旁观离子配盐（buildSalt）→ 输出完整物质方程式
// 浓度/计量比决定分支（量变引起质变）：
//   - 稀/浓 HNO3 → NO / NO2；Fe 被弱/强氧化剂 → Fe2+ / Fe3+
//   - C 充分/不充分燃烧 → CO2 / CO；2H2S+O2 不足/过量 → S / SO2
//   - CO2 与碱少量/过量 → 正盐 / 酸式盐（engine 侧计量比分支）
// ============================================================================

import { buildSalt, getSubstance, IONS } from './substances.js';

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

/**
 * 氧化剂表：键为物质 id。
 *   ion      —— 有效氧化离子的 { charge, o, h }（电荷/氧/氢原子数）
 *   cation   —— 旁观阳离子（配盐用）；cationN —— 每分子氧化剂的阳离子数
 *   anion    —— 旁观阴离子（氧化剂是盐时，如 CuSO4 的 SO4^2-）
 *   branches —— 按介质/浓度选分支；分支含 { gain(每分子得电子), product{id,charge,o,h,count} }
 *   strength —— 氧化剂强度（≥9 视为强：能把 Fe 氧化到 Fe3+）
 */
export const OXIDIZERS = {
  KMnO4: {
    ion: { charge: -1, o: 4 }, cation: 'K+', cationN: 1,
    branches: {
      acid:    { gain: 5, product: { id: 'Mn2+', charge: 2, o: 0 } },                 // 紫色→Mn2+ 无色
      neutral: { gain: 3, product: { id: 'MnO2', charge: 0, o: 2 } },                 // MnO2↓ 黑
      base:    { gain: 1, product: { id: 'MnO4^2-', charge: -2, o: 4 } },             // 强碱→锰酸钾绿
    },
    strength: 10,
  },
  K2Cr2O7: {
    ion: { charge: -2, o: 7 }, cation: 'K+', cationN: 2,
    branches: {
      acid: { gain: 6, product: { id: 'Cr3+', charge: 3, o: 0, count: 2 } },          // 橙红→Cr3+ 绿
    },
    strength: 9,
  },
  HNO3: {
    ion: { charge: -1, o: 3 },
    branches: {
      conc:   { gain: 1, product: { id: 'NO2', charge: 0, o: 2 } },                   // 浓硝酸→NO2 红棕
      dilute: { gain: 3, product: { id: 'NO', charge: 0, o: 1 } },                    // 稀硝酸→NO 无色
    },
    strength: 8,
  },
  H2SO4: {
    // 浓硫酸（S+6→+4，每分子得 2e）。离子为 SO4^2-（电荷 -2，O4）；H+ 由 medH 统一补
    ion: { charge: -2, o: 4 },
    branches: { any: { gain: 2, product: { id: 'SO2', charge: 0, o: 2 } } },           // →SO2
    strength: 8,
  },
  Cl2: { ion: { charge: 0, o: 0 }, branches: { any: { gain: 2, product: { id: 'Cl-', charge: -1, o: 0, count: 2 } } }, strength: 11 },
  Br2: { ion: { charge: 0, o: 0 }, branches: { any: { gain: 2, product: { id: 'Br-', charge: -1, o: 0, count: 2 } } }, strength: 8 },
  I2:  { ion: { charge: 0, o: 0 }, branches: { any: { gain: 2, product: { id: 'I-', charge: -1, o: 0, count: 2 } } }, strength: 7 },
  H2O2: {
    ion: { charge: 0, o: 2, h: 2 },
    branches: {
      acid:    { gain: 2, product: { id: 'H2O', charge: 0, o: 1, h: 2, count: 2 } },   // →H2O
      base:    { gain: 2, product: { id: 'OH-', charge: -1, o: 1, h: 1, count: 2 } },  // →OH-
      neutral: { gain: 2, product: { id: 'H2O', charge: 0, o: 1, h: 2, count: 2 } },
    },
    strength: 6,
  },
  O2: {
    ion: { charge: 0, o: 2 },
    branches: {
      acid:    { gain: 4, product: { id: 'H2O', charge: 0, o: 1, h: 2, count: 2 } },
      base:    { gain: 4, product: { id: 'OH-', charge: -1, o: 1, h: 1, count: 4 } },
      neutral: { gain: 4, product: { id: 'OH-', charge: -1, o: 1, h: 1, count: 4 } },
    },
    strength: 9,
  },
  'Fe3+': { ion: { charge: 3, o: 0 }, branches: { any: { gain: 1, product: { id: 'Fe2+', charge: 2, o: 0 } } }, strength: 5 },
  NaClO: {
    ion: { charge: -1, o: 1 }, cation: 'Na+', cationN: 1,
    branches: { any: { gain: 2, product: { id: 'Cl-', charge: -1, o: 0 } } },          // ClO-→Cl-
    strength: 8,
  },
  'H+': { ion: { charge: 1, o: 0, h: 1 }, branches: { any: { gain: 1, product: { id: 'H2', charge: 0, o: 0, h: 2, count: 0.5 } } }, strength: 3 },
  CuSO4: { ion: { charge: 2, o: 0 }, anion: 'SO4^2-', branches: { any: { gain: 2, product: { id: 'Cu', charge: 0, o: 0 } } }, strength: 4 },
  CuCl2: { ion: { charge: 2, o: 0 }, anion: 'Cl-', anionN: 2, branches: { any: { gain: 2, product: { id: 'Cu', charge: 0, o: 0 } } }, strength: 4 },
  AgNO3: { ion: { charge: 1, o: 0 }, anion: 'NO3-', branches: { any: { gain: 1, product: { id: 'Ag', charge: 0, o: 0 } } }, strength: 4 },
  FeCl3: { ion: { charge: 3, o: 0 }, anion: 'Cl-', anionN: 3, branches: { any: { gain: 1, product: { id: 'Fe2+', charge: 2, o: 0 } } }, strength: 5 },
};

/**
 * 还原剂表：
 *   ion    —— 有效还原离子（金属单质 charge 0）
 *   anion  —— 旁观阴离子（配盐用，如 FeSO4 的 SO4^2-）
 *   loss   —— 每分子失电子数；product —— 氧化产物
 *   branches —— 强/弱氧化剂分支（Fe 单质），或 O2 量分支（C、H2S）
 */
export const REDUCERS = {
  // Fe2+ 只能被较强氧化剂氧化（Cl2/KMnO4/K2Cr2O7/浓HNO3/Br2；I2 氧化性不足）
  FeSO4:   { ion: { charge: 2, o: 0 }, anion: 'SO4^2-', loss: 1, product: { id: 'Fe3+', charge: 3, o: 0 }, minOx: 8 },
  FeCl2:   { ion: { charge: 2, o: 0 }, anion: 'Cl-', anionN: 2, loss: 1, product: { id: 'Fe3+', charge: 3, o: 0 }, minOx: 8 },
  Fe: {
    ion: { charge: 0, o: 0 },
    branches: {
      weak:   { loss: 2, product: { id: 'Fe2+', charge: 2, o: 0 } },   // 弱氧化剂（H+/Cu2+/Fe3+）
      strong: { loss: 3, product: { id: 'Fe3+', charge: 3, o: 0 } },   // 强氧化剂（Cl2/KMnO4/HNO3...）
    },
  },
  Cu:    { ion: { charge: 0, o: 0 }, loss: 2, product: { id: 'Cu2+', charge: 2, o: 0 } },
  Zn:    { ion: { charge: 0, o: 0 }, loss: 2, product: { id: 'Zn2+', charge: 2, o: 0 } },
  Mg:    { ion: { charge: 0, o: 0 }, loss: 2, product: { id: 'Mg2+', charge: 2, o: 0 } },
  Al:    { ion: { charge: 0, o: 0 }, loss: 3, product: { id: 'Al3+', charge: 3, o: 0 } },
  Na:    { ion: { charge: 0, o: 0 }, loss: 1, product: { id: 'Na+', charge: 1, o: 0 } },
  K:     { ion: { charge: 0, o: 0 }, loss: 1, product: { id: 'K+', charge: 1, o: 0 } },
  Li:    { ion: { charge: 0, o: 0 }, loss: 1, product: { id: 'Li+', charge: 1, o: 0 } },
  SO2:   { ion: { charge: 0, o: 2 }, loss: 2, product: { id: 'SO4^2-', charge: -2, o: 4 } },   // +4S→+6S
  H2SO3: { ion: { charge: 0, o: 3, h: 2 }, loss: 2, product: { id: 'SO4^2-', charge: -2, o: 4 } },
  Na2SO3:{ ion: { charge: -2, o: 3 }, cation: 'Na+', cationN: 2, loss: 2, product: { id: 'SO4^2-', charge: -2, o: 4 } }, // 旁观阳离子（碱金属盐）
  H2S:   { ion: { charge: 0, o: 0, h: 2 }, loss: 2, product: { id: 'S', charge: 0, o: 0 } },   // -2S→0
  FeS:   { ion: { charge: 0, o: 0 }, loss: 2, product: { id: 'S', charge: 0, o: 0 } },        // FeS→Fe2+ + S
  H2O2:  { ion: { charge: 0, o: 2, h: 2 }, loss: 2, product: { id: 'O2', charge: 0, o: 2 } },  // 还原性（被强氧化剂）
  KI:    { ion: { charge: -1, o: 0 }, cation: 'K+', loss: 1, product: { id: 'I2', charge: 0, o: 0, count: 0.5 } },
  NaI:   { ion: { charge: -1, o: 0 }, cation: 'Na+', loss: 1, product: { id: 'I2', charge: 0, o: 0, count: 0.5 } },
  KBr:   { ion: { charge: -1, o: 0 }, cation: 'K+', loss: 1, product: { id: 'Br2', charge: 0, o: 0, count: 0.5 } },
  NaBr:  { ion: { charge: -1, o: 0 }, cation: 'Na+', loss: 1, product: { id: 'Br2', charge: 0, o: 0, count: 0.5 } },
  CO:    { ion: { charge: 0, o: 1 }, loss: 2, product: { id: 'CO2', charge: 0, o: 2 } },
  H2:    { ion: { charge: 0, o: 0, h: 2 }, loss: 2, product: { id: 'H2O', charge: 0, o: 1, h: 2 } },
  // 注：C 不进 REDOX 表——碳常温不参与离子氧化还原（不跟酸/盐溶液反应），
  // 其氧化只走 COMBUSTION_RULES（点燃）与 GAS/SOLID_REDUCTION_RULES（高温）
  H2C2O4:{ ion: { charge: 0, o: 4, h: 2 }, loss: 2, product: { id: 'CO2', charge: 0, o: 2, count: 2 } }, // 草酸
  C2H5OH:{ ion: { charge: 0, o: 1, h: 6 }, loss: 4, product: { id: 'CH3COOH', charge: 0, o: 2, h: 4 } },  // 酒驾橙→绿
  'K2MnO4': { ion: { charge: -2, o: 4 }, cation: 'K+', cationN: 2, loss: 1, product: { id: 'KMnO4', charge: -1, o: 4 } }, // 锰酸钾→高锰酸钾
};

/** 氧化剂强度≥9 视为"强"（能把 Fe 氧化到 Fe3+；Cl2/KMnO4/K2Cr2O7/O2） */
export const STRONG_OXIDIZER = 9;

/** 介质的阴离子（配盐用）：酸介质取酸的阴离子，碱介质取碱阳离子 */
export function mediaInfo(solution) {
  // solution: { mass(id), ids() }；返回 { medium, acidAnion, acidId, baseId }
  let acidAnion = null;
  let acidId = null;
  let baseId = null;
  for (const id of solution.ids()) {
    const s = getSubstance(id);
    if (!acidAnion && s.kind === 'acid' && s.acidStrength === 'strong' && s.ions) {
      acidAnion = s.ions.an;
      acidId = id;
    }
    if (!baseId && s.kind === 'base' && s.acidStrength === 'strong') baseId = id;
  }
  if (acidAnion) return { medium: 'acid', acidAnion, acidId, baseId: null };
  if (baseId) return { medium: 'base', acidAnion: null, acidId: null, baseId };
  return { medium: 'neutral', acidAnion: null, acidId: null, baseId: null };
}

/** 选择氧化剂分支：medium + 浓度（g/L） */
function oxBranch(entry, medium, conc) {
  const b = entry.branches;
  if (b.any) return b.any;
  if (entry === OXIDIZERS.HNO3 || entry.id === 'HNO3') {
    return conc >= 300 ? b.conc : b.dilute; // 浓/稀硝酸阈值（g/L）
  }
  if (b[medium]) return b[medium];
  return b.acid ?? b.neutral ?? b.base ?? b.any;
}

/** 选择还原剂分支：weak/strong（Fe）、full/partial（C）由外部给出 */
function redBranch(entry, key) {
  const b = entry.branches;
  if (!b) return { loss: entry.loss, product: entry.product };
  return b[key] ?? b.weak ?? b.full ?? b.partial ?? b.strong;
}

function scaleProduct(p, n) {
  const count = p.count ?? 1;
  return { id: p.id, charge: p.charge, o: p.o, h: p.h ?? 0, n: n * count };
}

/**
 * 自动配平：返回 { rx: [{id, coeff}], pd: [{id, coeff}] }（系数为摩尔数，可为分数）
 * 任一步校验失败返回 null（该氧化剂×还原剂组合不成立）。
 *
 * 介质离子规则：
 *   - 酸介质：dq>0 左补 H+；dq<0 右补 H+（产物酸，如 KMnO4+SO2→H2SO4）
 *   - 碱介质：dq>0 右补 OH-；dq<0 左补 OH-
 *   - 中性介质：dq<0 右补 H+（生成酸，如 H2S+Cl2→2HCl+S）；dq>0 判不成立
 * H2O 系数可为负（SO2 氧化需要水参与反应物）。
 */
export function balanceRedox(oxId, redId, opts = {}) {
  const ox = OXIDIZERS[oxId];
  const red = REDUCERS[redId];
  if (!ox || !red) return null;
  const { medium = 'acid', conc = 0, redKey = 'weak', oxKey } = opts;
  const ob = oxKey ? ox.branches[oxKey] ?? ox.branches.any : oxBranch(ox, medium, conc);
  const rb = redBranch(red, redKey);
  if (!ob || !rb) return null;

  const g = gcd(ob.gain, rb.loss);
  const a = rb.loss / g; // 氧化剂 mol
  const b = ob.gain / g; // 还原剂 mol

  // 主产物
  const redP = scaleProduct(ob.product, a);
  const oxP = scaleProduct(rb.product, b);

  // 电荷守恒 → 介质离子（酸介质 H+；碱介质 OH-；中性 dq<0 时产物酸）
  if (!ox.ion || !red.ion) return null; // 氧化剂/还原剂缺离子配置 → 跳过配平
  const qRx = a * ox.ion.charge + b * red.ion.charge;
  const qPd = redP.n * redP.charge + oxP.n * oxP.charge;
  const dq = qPd - qRx;
  let medH = 0; // H+ mol：>0 在方程左（消耗），<0 在方程右（产物酸）
  let medOH = 0; // OH- mol：>0 在方程左（消耗），<0 在方程右（产物碱）
  if (Math.abs(dq) > 1e-9) {
    if (medium === 'acid') medH = dq;        // dq>0 左补 H+；dq<0 右补 H+
    else if (medium === 'base') medOH = dq;  // dq>0 左补 OH-；dq<0 右补 OH-
    else medH = dq < 0 ? dq : 0;             // 中性：仅 dq<0（产物酸）成立
  }
  // 校验电荷：qRx + 左介质电荷 = qPd + 右介质电荷
  const qL = qRx + (medH > 0 ? medH : 0) + (medOH < 0 ? medOH : 0);
  const qR = qPd + (medH < 0 ? -medH : 0) + (medOH > 0 ? -medOH : 0);
  if (Math.abs(qL - qR) > 1e-6) return null;

  // 氧守恒 → H2O（可为负：H2O 参与反应物，如 SO2 被氧化需补水）
  const oL = a * ox.ion.o + b * red.ion.o + (medOH < 0 ? -medOH : 0);
  const oR = redP.n * redP.o + oxP.n * oxP.o + (medOH > 0 ? medOH : 0);
  const h2o = oL - oR;

  // 氢守恒校验
  const hL = a * (ox.ion.h ?? 0) + b * (red.ion.h ?? 0) + (medH > 0 ? medH : 0) + (medOH < 0 ? -medOH : 0) + (h2o < 0 ? -h2o * 2 : 0);
  const hR = redP.n * redP.h + oxP.n * oxP.h + (medH < 0 ? -medH : 0) + (medOH > 0 ? medOH : 0) + (h2o > 0 ? h2o * 2 : 0);
  if (Math.abs(hL - hR) > 1e-6) return null;

  // ---- 组装产物（分子式级别）：介质离子 → 酸/碱分子；离子产物 → 配盐 ----
  const rx = [];
  const pd = [];
  const cations = []; // {id, n}
  const anions = [];  // {id, n}
  const freeProducts = []; // {id, n} 分子产物（气体/沉淀/单质）

  /** 产物归类：离子 → 配盐池；酸/分子 → 直接产物 */
  const classify = (id, n) => {
    if (n <= 1e-9) return;
    if (id === 'H+') { cations.push({ id: 'H+', n }); return; }
    if (id === 'OH-') { anions.push({ id: 'OH-', n }); return; }
    const ion = IONS[id];
    if (ion) {
      if (ion.charge > 0) cations.push({ id, n });
      else anions.push({ id, n });
      return;
    }
    const s = getSubstance(id);
    if (s.ions && s.ions.cat === 'H+') {
      freeProducts.push({ id, n }); // 酸（弱酸不电离，直接产物）
      return;
    }
    if (s.ions) {
      cations.push({ id: s.ions.cat, n: n * s.ions.catCount });
      anions.push({ id: s.ions.an, n: n * s.ions.anCount });
      return;
    }
    freeProducts.push({ id, n });
  };
  classify(redP.id, redP.n);
  classify(oxP.id, oxP.n);

  // 旁观离子：氧化剂阳离子/阴离子 + 还原剂阳离子/阴离子
  if (ox.cation) cations.push({ id: ox.cation, n: a * (ox.cationN ?? 1) });
  if (ox.anion) anions.push({ id: ox.anion, n: a * (ox.anionN ?? 1) });
  if (red.cation) cations.push({ id: red.cation, n: b * (red.cationN ?? 1) });
  if (red.anion) anions.push({ id: red.anion, n: b * (red.anionN ?? 1) });

  // 介质：H+ / OH- 的来源与去向
  const oxIsAcid = oxId === 'H+' || getSubstance(oxId).ions?.cat === 'H+';
  if (oxId === 'H+') {
    // H+ 作氧化剂：酸分子承载全部 H+（a 个被还原 + medH 个电荷差额）
    const acid = getSubstance(opts.acidId ?? 'H2SO4');
    const acidMol = (a + (medH > 0 ? medH : 0)) / acid.ions.catCount;
    rx.push({ id: opts.acidId ?? 'H2SO4', coeff: acidMol });
    anions.push({ id: acid.ions.an, n: a + (medH > 0 ? medH : 0) });
  } else if (oxIsAcid) {
    // 氧化剂即酸（HNO3）：被还原 a 分子；medH>0 时还需额外酸提供 H+
    const acid = getSubstance(oxId);
    const acidMol = medH > 0 ? Math.max(a, medH / acid.ions.catCount) : a;
    rx.push({ id: oxId, coeff: acidMol });
    const leftoverAn = (acidMol - a) * acid.ions.anCount; // 未被还原的酸根→配盐
    if (leftoverAn > 1e-9) anions.push({ id: acid.ions.an, n: leftoverAn });
    if (medH < 0) cations.push({ id: 'H+', n: -medH + a * acid.ions.catCount }); // 产物酸 H+（含 ox 电离贡献）
  } else {
    rx.push({ id: oxId, coeff: a });
    if (medH > 0) {
      // 非酸氧化剂 + 酸介质：介质酸提供 H+ 与阴离子
      const acidId = opts.acidId ?? 'H2SO4';
      const acid = getSubstance(acidId);
      rx.push({ id: acidId, coeff: medH / acid.ions.catCount });
      anions.push({ id: acid.ions.an, n: medH });
    }
    if (medH < 0) cations.push({ id: 'H+', n: -medH }); // 产物酸
  }
  if (medOH !== 0) {
    const baseId = opts.baseId ?? 'KOH';
    const base = getSubstance(baseId);
    if (medOH < 0) {
      // OH- 在左（消耗）：碱分子参与反应，阳离子配盐
      rx.push({ id: baseId, coeff: -medOH / base.ions.anCount });
      cations.push({ id: base.ions.cat, n: -medOH });
    } else {
      anions.push({ id: 'OH-', n: medOH }); // OH- 在右（产物）：配盐成碱
    }
  }
  rx.push({ id: redId, coeff: b });
  if (h2o !== 0) (h2o > 0 ? pd : rx).push({ id: 'H2O', coeff: Math.abs(h2o) });
  for (const p of freeProducts) pd.push({ id: p.id, coeff: p.n });

  // ---- 配盐：阳离子 × 阴离子（buildSalt），贪婪匹配 ----
  const cMap = new Map();
  for (const c of cations) cMap.set(c.id, (cMap.get(c.id) ?? 0) + c.n);
  const aMap = new Map();
  for (const an of anions) aMap.set(an.id, (aMap.get(an.id) ?? 0) + an.n);
  for (const [catId, catN] of cMap) {
    if (catN <= 1e-9) continue;
    let rest = catN;
    for (const [anId, anN] of aMap) {
      if (anN <= 1e-9 || rest <= 1e-9) continue;
      const salt = buildSalt(catId, anId);
      const take = Math.min(rest / salt.catCount, anN / salt.anCount);
      if (take <= 1e-9) continue;
      pd.push({ id: salt.formula, coeff: take });
      rest -= take * salt.catCount;
      aMap.set(anId, anN - take * salt.anCount);
    }
  }
  // 合并同 id 产物（H2O 可能出现两次）
  const pdMap = new Map();
  for (const p of pd) pdMap.set(p.id, (pdMap.get(p.id) ?? 0) + p.coeff);
  pd.length = 0;
  for (const [id, coeff] of pdMap) if (Math.abs(coeff) > 1e-9) pd.push({ id, coeff });
  return { rx, pd };
}
