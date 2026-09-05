// ============================================================================
// 物质属性库（PropertyDB）
// ----------------------------------------------------------------------------
// 职责：
//   - 离子表（符号/是否多原子/电荷/离子摩尔质量）
//   - 物质表（分子式作为唯一 id，含摩尔质量/状态/类别/溶解度/颜色/可燃性/金属活动性等）
//   - 从两个离子推导盐的化学式、摩尔质量、溶解度（产物兜底生成，保证"离子推导"可扩展）
// 约定：分子式即 id；正文用 ASCII（CuSO4、Fe(OH)3）。
// ============================================================================

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

// ---------------------------------------------------------------------------
// 离子表
// ---------------------------------------------------------------------------
export const IONS = {
  'H+':      { symbol: 'H',   poly: false, charge:  1, mass:  1   },
  'Na+':     { symbol: 'Na',  poly: false, charge:  1, mass: 23   },
  'K+':      { symbol: 'K',   poly: false, charge:  1, mass: 39   },
  'Li+':     { symbol: 'Li',  poly: false, charge:  1, mass: 7    },
  'NH4+':    { symbol: 'NH4', poly: true,  charge:  1, mass: 18   },
  'Ca2+':    { symbol: 'Ca',  poly: false, charge:  2, mass: 40   },
  'Mg2+':    { symbol: 'Mg',  poly: false, charge:  2, mass: 24   },
  'Zn2+':    { symbol: 'Zn',  poly: false, charge:  2, mass: 65   },
  'Fe2+':    { symbol: 'Fe',  poly: false, charge:  2, mass: 56   },
  'Fe3+':    { symbol: 'Fe',  poly: false, charge:  3, mass: 56   },
  'Cu2+':    { symbol: 'Cu',  poly: false, charge:  2, mass: 64   },
  'Al3+':    { symbol: 'Al',  poly: false, charge:  3, mass: 27   },
  'Ag+':     { symbol: 'Ag',  poly: false, charge:  1, mass: 108  },
  'Ba2+':    { symbol: 'Ba',  poly: false, charge:  2, mass: 137  },
  'Pb2+':    { symbol: 'Pb',  poly: false, charge:  2, mass: 207  }, // 铅（PbCrO4 铬黄检验铬酸根）
  'Sr2+':    { symbol: 'Sr',  poly: false, charge:  2, mass: 88   }, // 锶（SrCrO4 黄）
  'Cl-':     { symbol: 'Cl',  poly: false, charge: -1, mass: 35.5 },
  'SO4^2-':  { symbol: 'SO4', poly: true,  charge: -2, mass: 96   },
  'NO3-':    { symbol: 'NO3', poly: true,  charge: -1, mass: 62   },
  'OH-':     { symbol: 'OH',  poly: true,  charge: -1, mass: 17   },
  'CO3^2-':  { symbol: 'CO3', poly: true,  charge: -2, mass: 60   },
  'SO3^2-':  { symbol: 'SO3', poly: true,  charge: -2, mass: 80   },
  'MnO4-':   { symbol: 'MnO4', poly: true, charge: -1, mass: 119  },
  'MnO4^2-': { symbol: 'MnO4', poly: true, charge: -2, mass: 119  },
  'ClO3-':   { symbol: 'ClO3', poly: true, charge: -1, mass: 83.5 },
  'O2-':     { symbol: 'O',   poly: false, charge: -2, mass: 16   },
  'Mn2+':    { symbol: 'Mn',  poly: false, charge:  2, mass: 55   },
  'Cr3+':    { symbol: 'Cr',  poly: false, charge:  3, mass: 52   },
  'Cr2O7^2-':{ symbol: 'Cr2O7', poly: true, charge: -2, mass: 216  },
  'CrO4^2-': { symbol: 'CrO4', poly: true, charge: -2, mass: 116  },
  'S2-':     { symbol: 'S',   poly: false, charge: -2, mass: 32   },
  'Br-':     { symbol: 'Br',  poly: false, charge: -1, mass: 80   },
  'I-':      { symbol: 'I',   poly: false, charge: -1, mass: 127  },
  'HCO3-':   { symbol: 'HCO3', poly: true, charge: -1, mass: 61   },
  'AlO2-':   { symbol: 'AlO2', poly: true, charge: -1, mass: 59   },
  'CH3COO-': { symbol: 'CH3COO', poly: true, charge: -1, mass: 59 },
  'SCN-':    { symbol: 'SCN', poly: true, charge: -1, mass: 58   },
  'ClO-':    { symbol: 'ClO', poly: true, charge: -1, mass: 51.5 },
  'PO4^3-':  { symbol: 'PO4', poly: true, charge: -3, mass: 95   },
  'SiO3^2-': { symbol: 'SiO3', poly: true, charge: -2, mass: 76  },
  'C2O4^2-': { symbol: 'C2O4', poly: true, charge: -2, mass: 88  },
  'CrO2-':   { symbol: 'CrO2', poly: true, charge: -1, mass: 68  },
};

// 有色离子在溶液中的显色（饱和浓度参照，单位 g 离子 / L 溶液，可调）
const ION_COLORS = {
  'Cu2+':    { color: '#00e7ff', sat: 150 },
  'Fe3+':    { color: '#ffbb00', sat: 250 },
  'Fe2+':    { color: '#11ff24', sat: 150 },
  'MnO4-':   { color: '#a54ac9', sat: 60  },
  'MnO4^2-': { color: '#2e8b57', sat: 40  },
  'Cr2O7^2-':{ color: '#ff6a3d', sat: 80  }, // 重铬酸根 橙红
  'CrO4^2-': { color: '#ffd23f', sat: 80  }, // 铬酸根 黄
  'Cr3+':    { color: '#3fbf7f', sat: 100 }, // 三价铬 绿
  'S2-':     { color: '#ffe9a8', sat: 100 }, // 硫离子 淡黄（硫化钠溶液）
};

// ---------------------------------------------------------------------------
// 公式与盐推导
// ---------------------------------------------------------------------------
export function canonicalFormula(catId, cc, anId, ac) {
  if (catId === 'H+' && anId === 'OH-') return 'H2O'; // H+OH- → 规范写作 H2O
  const cat = IONS[catId] ?? { symbol: catId, poly: false };
  const an = IONS[anId] ?? { symbol: anId, poly: false };
  const catPart = cat.poly && cc > 1 ? `(${cat.symbol})${cc}` : cat.symbol + (cc > 1 ? cc : '');
  const anPart = an.poly && ac > 1 ? `(${an.symbol})${ac}` : an.symbol + (ac > 1 ? ac : '');
  return catPart + anPart;
}

/** 由阳离子 + 阴离子推导盐：{ formula, catCount, anCount, mm } */
export function buildSalt(catId, anId) {
  const cat = IONS[catId];
  const an = IONS[anId];
  // 未知离子（运行时生成/自定义反应引入）：兜底不崩溃，按 1:1 假盐处理并记录一次，便于定位
  if (!cat || !an) {
    console.warn(`[化学] 离子不在表：${catId}(${cat ? '有' : '无'}) / ${anId}(${an ? '有' : '无'})`);
    const c = cat ?? { symbol: catId, charge: 1, mass: 20 };
    const a = an ?? { symbol: anId, charge: -1, mass: 35 };
    return { formula: `${catId}(${anId})`, catCount: 1, anCount: 1, mm: c.mass + a.mass };
  }
  const g = gcd(Math.abs(cat.charge), Math.abs(an.charge));
  const cc = Math.abs(an.charge) / g;
  const ac = Math.abs(cat.charge) / g;
  return {
    formula: canonicalFormula(catId, cc, anId, ac),
    catCount: cc,
    anCount: ac,
    mm: cc * cat.mass + ac * an.mass,
  };
}

/** 常温常压下在水中的溶解性（高中溶解度规则：钾钠铵硝全溶…） */
export function solubilityOf(catId, anId) {
  if (anId === 'NO3-') return 'soluble';                       // 硝酸盐全溶
  if (catId === 'Na+' || catId === 'K+' || catId === 'NH4+') return 'soluble'; // 碱金属/铵盐全溶
  if (anId === 'Cl-' || anId === 'Br-' || anId === 'I-') {
    // 卤化银难溶（AgCl 白 / AgBr 淡黄 / AgI 黄——检验卤离子）；其余卤化物可溶（Hg2Cl2/PbCl2 微溶省略）
    return catId === 'Ag+' ? 'insoluble' : 'soluble';
  }
  if (anId === 'SO4^2-') return catId === 'Ba2+' ? 'insoluble' : 'soluble';    // 硫酸盐除 BaSO4（CaSO4/PbSO4 微溶省略）
  if (anId === 'CO3^2-' || anId === 'SO3^2-') return 'insoluble';              // 碳酸盐/亚硫酸盐不溶（碱金属铵盐已在上面返回）
  if (anId === 'S2-') return 'insoluble';                      // 硫化物：碱金属/铵盐溶（上面返回），其余 FeS/CuS/ZnS 不溶
  if (anId === 'CrO4^2-') {
    // 铬酸盐：Ba/Pb/Sr/Ag 难溶（BaCrO4 黄、PbCrO4 铬黄、SrCrO4 黄、Ag2CrO4 砖红），其余溶
    return ['Ba2+', 'Pb2+', 'Sr2+', 'Ag+'].includes(catId) ? 'insoluble' : 'soluble';
  }
  if (anId === 'HCO3-' || anId === 'AlO2-' || anId === 'SCN-' || anId === 'ClO-') return 'soluble'; // 碳酸氢盐/偏铝酸盐/硫氰酸盐/次氯酸盐可溶
  if (anId === 'OH-') {
    if (catId === 'Na+' || catId === 'K+' || catId === 'Ba2+' || catId === 'Ca2+') return 'soluble';
    return 'insoluble';                                        // 不溶性碱（游戏内 Ca(OH)2 视为可溶）
  }
  return 'soluble';
}

/** 由阳/阴离子判定物质类别 */
export function kindOf(catId, anId) {
  if (catId === 'H+') return 'acid';
  if (anId === 'OH-') return 'base';
  if (anId === 'O2-') return 'oxide';
  return 'salt';
}

/** 由两个离子生成一条"盐"物质记录（产物兜底） */
export function saltEntry(catId, anId, over = {}) {
  const { formula, catCount, anCount, mm } = buildSalt(catId, anId);
  const soluble = solubilityOf(catId, anId);
  const kind = kindOf(catId, anId);
  const ionColor = ION_COLORS[catId] || ION_COLORS[anId] || null;
  return {
    id: formula,
    mm,
    state: 'solid',
    kind,
    soluble,
    ions: { cat: catId, an: anId, catCount, anCount },
    solid: over.solid ?? (soluble ? ['#e9e9e9'] : ['#9a9a9a']),
    ...(ionColor ? { ionColor } : {}),
    ...over,
  };
}

/** 离子推导产物：不存在则自动登记（保证溶解度/颜色/摩尔质量正确） */
export function ensureSalt(catId, anId) {
  const { formula } = buildSalt(catId, anId);
  if (SUBSTANCES[formula]) return SUBSTANCES[formula];
  const entry = saltEntry(catId, anId);
  SUBSTANCES[formula] = entry;
  return entry;
}

// ---------------------------------------------------------------------------
// 物质表
// ---------------------------------------------------------------------------
function defineSalt(catId, anId, over = {}) {
  const e = saltEntry(catId, anId, over);
  SUBSTANCES[e.id] = e;
  return e;
}

export const SUBSTANCES = {};

// --- 水 / 过氧化氢 / 碳酸（不稳定）---
SUBSTANCES['H2O'] = { id: 'H2O', mm: 18, state: 'liquid', kind: 'water', soluble: 'na' };
SUBSTANCES['H2O2'] = { id: 'H2O2', mm: 34, state: 'liquid', kind: 'other', soluble: 'soluble', solid: ['#d8f6ff'] };
SUBSTANCES['H2CO3'] = { id: 'H2CO3', mm: 62, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'HCO3-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] }; // 碳酸（第一步电离为主）

// --- 酸（acidStrength: 强酸全电离 / 弱酸部分电离，影响 pH）---
SUBSTANCES['HCl'] = { id: 'HCl', mm: 36.5, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'H+', an: 'Cl-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['H2SO4'] = { id: 'H2SO4', mm: 98, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'H+', an: 'SO4^2-', catCount: 2, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['HNO3'] = { id: 'HNO3', mm: 63, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'H+', an: 'NO3-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['H2SO3'] = { id: 'H2SO3', mm: 82, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'SO3^2-', catCount: 2, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['H3PO4'] = { id: 'H3PO4', mm: 98, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'PO4^3-', catCount: 3, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['HClO'] = { id: 'HClO', mm: 52.5, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'ClO-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] };
SUBSTANCES['CH3COOH'] = { id: 'CH3COOH', mm: 60, state: 'liquid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'CH3COO-', catCount: 1, anCount: 1 }, solid: ['#e9e9e9'] };

// --- 碱（acidStrength 同用于碱的电离强弱）---
SUBSTANCES['NaOH'] = { id: 'NaOH', mm: 40, state: 'solid', kind: 'base', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'Na+', an: 'OH-', catCount: 1, anCount: 1 }, solid: ['#ffffff'] };
SUBSTANCES['KOH'] = { id: 'KOH', mm: 56, state: 'solid', kind: 'base', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'K+', an: 'OH-', catCount: 1, anCount: 1 }, solid: ['#ffffff'] };
SUBSTANCES['Ca(OH)2'] = { id: 'Ca(OH)2', mm: 74, state: 'solid', kind: 'base', soluble: 'soluble', acidStrength: 'strong', ions: { cat: 'Ca2+', an: 'OH-', catCount: 1, anCount: 2 }, solid: ['#f4f4f4'], solubilityLimit: 12 }; // 微溶（游戏值 12g/L：200ml 池滴约 3~4 次才达饱和——先浑浊后沉淀）
SUBSTANCES['Cu(OH)2'] = { id: 'Cu(OH)2', mm: 98, state: 'solid', kind: 'base', soluble: 'insoluble', ions: { cat: 'Cu2+', an: 'OH-', catCount: 1, anCount: 2 }, solid: ['#00afff'] };
SUBSTANCES['Fe(OH)3'] = { id: 'Fe(OH)3', mm: 107, state: 'solid', kind: 'base', soluble: 'insoluble', ions: { cat: 'Fe3+', an: 'OH-', catCount: 1, anCount: 3 }, solid: ['#002929'] };
SUBSTANCES['Mg(OH)2'] = { id: 'Mg(OH)2', mm: 58, state: 'solid', kind: 'base', soluble: 'insoluble', ions: { cat: 'Mg2+', an: 'OH-', catCount: 1, anCount: 2 }, solid: ['#f2f2f2'] };
SUBSTANCES['Fe(OH)2'] = { id: 'Fe(OH)2', mm: 90, state: 'solid', kind: 'base', soluble: 'insoluble', ions: { cat: 'Fe2+', an: 'OH-', catCount: 1, anCount: 2 }, solid: ['#c9ffd4'] };

// --- 盐（用 defineSalt 生成，颜色可覆盖）---
defineSalt('Na+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Cu2+', 'SO4^2-', { solid: ['#b7e4ff'] });
defineSalt('Na+', 'SO4^2-', { solid: ['#ffffff'] });
defineSalt('Fe3+', 'Cl-', { solid: ['#ffd9a8'] });
defineSalt('Fe2+', 'Cl-', { solid: ['#c9ffd4'] });
defineSalt('Fe2+', 'SO4^2-', { solid: ['#c9ffd4'] });
defineSalt('Cu2+', 'Cl-', { solid: ['#b7e4ff'] });
defineSalt('Zn2+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Mg2+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Ca2+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Ba2+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Ca2+', 'SO4^2-', { solid: ['#ffffff'], solubilityLimit: 10 }); // CaSO4 微溶（游戏值 10g/L）
defineSalt('Na+', 'CO3^2-', { solid: ['#ffffff'], dense: true }); // Na2CO3 致密晶形壳：碳化壳真正保护内核——挡 CO2 继续碳化（自限）、挡酸蚀从外到内逐层剥壳（否则盐酸穿透壳掏空内核成碎片）
defineSalt('Ca2+', 'CO3^2-', { solid: ['#f2f2f2'], dense: true });   // CaCO3 晶形致密（石灰水检验）
defineSalt('Ba2+', 'SO4^2-', { solid: ['#ffffff'], dense: true });  // BaSO4 致密（检验硫酸根）
defineSalt('Ag+', 'Cl-', { solid: ['#ffffff'], dense: true });      // AgCl 致密（检验氯离子）
defineSalt('Ag+', 'Br-', { solid: ['#f2e3b0'] });                   // AgBr 淡黄↓（检验溴离子）
defineSalt('Ag+', 'I-', { solid: ['#ffe98a'] });                    // AgI 黄↓（检验碘离子）
defineSalt('Ag+', 'NO3-', { solid: ['#ffffff'] });
defineSalt('Ag+', 'SO4^2-', { solid: ['#ffffff'], solubilityLimit: 20 }); // Ag2SO4 微溶（游戏值 20g/L）
defineSalt('Pb2+', 'NO3-', { solid: ['#ffffff'] });  // Pb(NO3)2 硝酸铅（离子双置换的铅源）
defineSalt('Pb2+', 'Cl-', { solid: ['#ffffff'], solubilityLimit: 20 }); // PbCl2 微溶（游戏值 20g/L）
defineSalt('Sr2+', 'NO3-', { solid: ['#ffffff'] });  // Sr(NO3)2 硝酸锶
defineSalt('Cu2+', 'NO3-', { solid: ['#b7e4ff'] });
defineSalt('Fe3+', 'NO3-', { solid: ['#ffd9a8'] });
defineSalt('Al3+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Al3+', 'SO4^2-', { solid: ['#ffffff'] });
defineSalt('Fe3+', 'SO4^2-', { solid: ['#ffd9a8'] });
defineSalt('Zn2+', 'SO4^2-', { solid: ['#ffffff'] });
defineSalt('Mg2+', 'SO4^2-', { solid: ['#ffffff'] });
defineSalt('K+', 'NO3-', { solid: ['#ffffff'] });
defineSalt('K+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('K+', 'CO3^2-', { solid: ['#ffffff'] });
defineSalt('Na+', 'SO3^2-', { solid: ['#ffffff'] });
defineSalt('Ca2+', 'SO3^2-', { solid: ['#f2f2f2'] });
defineSalt('NH4+', 'Cl-', { solid: ['#ffffff'] });
defineSalt('Na+', 'NO3-', { solid: ['#ffffff'] });
defineSalt('K+', 'MnO4-', { solid: ['#d8b3e8'] });
defineSalt('K+', 'MnO4^2-', { solid: ['#a8d8b8'] });
defineSalt('K+', 'ClO3-', { solid: ['#ffffff'] });
defineSalt('K+', 'SO3^2-', { solid: ['#ffffff'] });
// KMnO4 分解产物 K2MnO4 由 K+ + MnO4^2- 生成（id: K2MnO4），已覆盖。

// --- 高中扩展盐（锰/铬系、碳酸氢盐、硫化物、卤化物、检验试剂等）---
defineSalt('Mn2+', 'SO4^2-', { solid: ['#f2e3d8'] });   // MnSO4 肉粉
defineSalt('Mn2+', 'Cl-', { solid: ['#f2e3d8'] });     // MnCl2 肉粉
defineSalt('Cr3+', 'Cl-', { solid: ['#2fbf7f'] });     // CrCl3 绿
defineSalt('Cr3+', 'SO4^2-', { solid: ['#2fbf7f'] });  // Cr2(SO4)3 绿
defineSalt('K+', 'Cr2O7^2-', { solid: ['#ff6a3d'] });  // K2Cr2O7 橙红
defineSalt('K+', 'CrO4^2-', { solid: ['#ffd23f'] });   // K2CrO4 黄
defineSalt('Ca2+', 'Cr2O7^2-', { solid: ['#ff6a3d'] });// CaCr2O7 橙红（重铬酸钙）
defineSalt('Ca2+', 'CrO4^2-', { solid: ['#ffd23f'] }); // CaCrO4 黄（铬酸钙）
defineSalt('Ba2+', 'CrO4^2-', { solid: ['#ffd23f'], dense: true }); // BaCrO4 黄↓（检验铬酸根，致密）
defineSalt('Pb2+', 'CrO4^2-', { solid: ['#ffc93d'], dense: true }); // PbCrO4 铬黄↓（经典检验铬酸根）
defineSalt('Sr2+', 'CrO4^2-', { solid: ['#ffe066'] }); // SrCrO4 黄↓
defineSalt('Ag+',  'CrO4^2-', { solid: ['#b8563a'], dense: true }); // Ag2CrO4 砖红↓（微溶→按难溶处理）
defineSalt('Ba2+', 'CO3^2-', { solid: ['#ffffff'], dense: true });  // BaCO3 白↓（致密晶形：附着后阻断反应）
defineSalt('Ba2+', 'OH-', { acidStrength: 'strong', solid: ['#f4f4f4'] }); // Ba(OH)2 强碱
defineSalt('Na+', 'HCO3-', { solid: ['#ffffff'] });    // NaHCO3
defineSalt('Ca2+', 'HCO3-', { solid: ['#ffffff'] });   // Ca(HCO3)2 可溶
defineSalt('Na+', 'AlO2-', { solid: ['#ffffff'] });    // NaAlO2 偏铝酸钠
defineSalt('Fe2+', 'S2-', { solid: ['#3a3a3a'] });     // FeS 黑↓
defineSalt('K+', 'Br-', { solid: ['#ffffff'] });
defineSalt('Na+', 'Br-', { solid: ['#ffffff'] });
defineSalt('Li+', 'Cl-', { solid: ['#ffffff'] });        // LiCl（焰色紫红演示）
defineSalt('K+', 'I-', { solid: ['#ffffff'] });
defineSalt('K+', 'SCN-', { solid: ['#ffffff'] });      // KSCN 检验 Fe3+
defineSalt('Fe3+', 'SCN-', { ionColor: { color: '#ff2244', sat: 30 }, solid: ['#ff2244'] }); // Fe(SCN)3 血红色溶液
defineSalt('Na+', 'ClO-', { solid: ['#ffffff'] });     // NaClO 漂白液
defineSalt('Ca2+', 'ClO-', { solid: ['#ffffff'] });    // Ca(ClO)2 漂白粉
defineSalt('Na+', 'SiO3^2-', { solid: ['#ffffff'] });  // Na2SiO3 水玻璃
SUBSTANCES['H2SiO3'] = { id: 'H2SiO3', mm: 78, state: 'solid', kind: 'acid', soluble: 'insoluble', solid: ['#f0f0f0'] }; // 硅酸（胶状沉淀：Na2SiO3 + 酸 → H2SiO3↓）
defineSalt('Cr3+', 'OH-', { solid: ['#8fb8a8'] });     // Cr(OH)3 灰绿↓（两性）
defineSalt('Al3+', 'OH-', { solid: ['#f2f2f2'] });     // Al(OH)3 白↓（两性）
defineSalt('Li+', 'OH-', { solid: ['#ffffff'] });      // LiOH
defineSalt('Na+', 'CrO2-', { solid: ['#e8e8e8'] });    // NaCrO2 亚铬酸钠
defineSalt('K+', 'ClO-', { solid: ['#ffffff'] });      // KClO 次氯酸钾
defineSalt('Cu2+', 'S2-', { solid: ['#2a2a2a'] });     // CuS 黑↓
defineSalt('NH4+', 'SO4^2-', { solid: ['#ffffff'] });  // (NH4)2SO4
defineSalt('NH4+', 'HCO3-', { solid: ['#ffffff'] });   // NH4HCO3 碳酸氢铵

// --- 金属氧化物（视为"电解质"，离子中阴离子为 O2-，可参与离子双置换）---
SUBSTANCES['CuO'] = { id: 'CuO', mm: 80, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Cu2+', an: 'O2-', catCount: 1, anCount: 1 }, solid: ['#222222'] };
SUBSTANCES['FeO'] = { id: 'FeO', mm: 72, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Fe2+', an: 'O2-', catCount: 1, anCount: 1 }, solid: ['#3a3a3a'] };
SUBSTANCES['Fe2O3'] = { id: 'Fe2O3', mm: 160, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Fe3+', an: 'O2-', catCount: 2, anCount: 3 }, solid: ['#ff5f00'] };
SUBSTANCES['Fe3O4'] = { id: 'Fe3O4', mm: 232, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: null, solid: ['#111111'] }; // 混合价，走特例规则
SUBSTANCES['MgO'] = { id: 'MgO', mm: 40, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Mg2+', an: 'O2-', catCount: 1, anCount: 1 }, solid: ['#f2f2f2'] };
SUBSTANCES['CaO'] = { id: 'CaO', mm: 56, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Ca2+', an: 'O2-', catCount: 1, anCount: 1 }, solid: ['#f2f2f2'] };
SUBSTANCES['Al2O3'] = { id: 'Al2O3', mm: 102, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Al3+', an: 'O2-', catCount: 2, anCount: 3 }, solid: ['#f2f2f2'] };
SUBSTANCES['P2O5'] = { id: 'P2O5', mm: 142, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: null, solid: ['#e8e8e8'] };
// --- 高中扩展氧化物（钠/过氧化钠、铬绿、硅、碱式碳酸铜）---
SUBSTANCES['K2O'] = { id: 'K2O', mm: 94, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'K+', an: 'O2-', catCount: 2, anCount: 1 }, solid: ['#e8e8e8'] };
SUBSTANCES['Na2O'] = { id: 'Na2O', mm: 62, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Na+', an: 'O2-', catCount: 2, anCount: 1 }, solid: ['#e8e8e8'] };
SUBSTANCES['Na2O2'] = { id: 'Na2O2', mm: 78, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: null, peroxide: true, solid: ['#f2f2f2'] }; // 过氧化钠：遇水/CO2 歧化放 O2
SUBSTANCES['Cr2O3'] = { id: 'Cr2O3', mm: 152, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: { cat: 'Cr3+', an: 'O2-', catCount: 2, anCount: 3 }, amphoteric: true, solid: ['#2fbf7f'] };
SUBSTANCES['SiO2'] = { id: 'SiO2', mm: 60, state: 'solid', kind: 'oxide', soluble: 'insoluble', ions: null, solid: ['#b8c8d8'] }; // 二氧化硅（玻璃/砂）
SUBSTANCES['Cu2(OH)2CO3'] = { id: 'Cu2(OH)2CO3', mm: 222, state: 'solid', kind: 'other', soluble: 'insoluble', ions: null, solid: ['#2fbf8f'] }; // 碱式碳酸铜（铜绿）

// --- 金属（含活动性序与置换化合价）---
// 活动性：数值越小越活泼（按金属活动性顺序 K Ca Na Mg Al Zn Fe Sn Pb (H) Cu Hg Ag Pt Au 编号 1..15，H=10）。
SUBSTANCES['Cu'] = { id: 'Cu', mm: 64, state: 'solid', kind: 'metal', soluble: 'na', valence: 2, activity: 11, flammable: true, dense: true, solid: ['#ff8f46'] }; // 还原产物金属致密（低浓度时不阻断——见 _isDense 占比阈值）
SUBSTANCES['Fe'] = { id: 'Fe', mm: 56, state: 'solid', kind: 'metal', soluble: 'na', valence: 2, activity: 7, flammable: true, solid: ['#fdfdfd'] };
SUBSTANCES['Zn'] = { id: 'Zn', mm: 65, state: 'solid', kind: 'metal', soluble: 'na', valence: 2, activity: 6, flammable: true, solid: ['#c8c8c8'] };
SUBSTANCES['Mg'] = { id: 'Mg', mm: 24, state: 'solid', kind: 'metal', soluble: 'na', valence: 2, activity: 4, flammable: true, solid: ['#cfcfcf'] };
SUBSTANCES['Al'] = { id: 'Al', mm: 27, state: 'solid', kind: 'metal', soluble: 'na', valence: 3, activity: 5, flammable: true, solid: ['#d9d9d9'] };
SUBSTANCES['Ag'] = { id: 'Ag', mm: 108, state: 'solid', kind: 'metal', soluble: 'na', valence: 1, activity: 13, flammable: false, dense: true, solid: ['#e8e8e8'] }; // 银镜致密

// --- 碱金属（极活泼：遇水剧烈反应产 H2，火焰变色）---
SUBSTANCES['Na'] = { id: 'Na', mm: 23, state: 'solid', kind: 'metal', soluble: 'na', valence: 1, activity: 3, flammable: true, flameColor: '#ffd23f', solid: ['#e0e0e0'] };
SUBSTANCES['K'] = { id: 'K', mm: 39, state: 'solid', kind: 'metal', soluble: 'na', valence: 1, activity: 1, flammable: true, flameColor: '#c78bff', solid: ['#cfcfe8'] };
SUBSTANCES['Li'] = { id: 'Li', mm: 7, state: 'solid', kind: 'metal', soluble: 'na', valence: 1, activity: 2, flammable: true, flameColor: '#ff5fd0', solid: ['#d8d8f0'] }; // 锂：焰色紫红

// --- 非金属单质（可燃）---
SUBSTANCES['C'] = { id: 'C', mm: 12, state: 'solid', kind: 'nonmetal', soluble: 'na', flammable: true, solid: ['#2a2a2a'] };
SUBSTANCES['S'] = { id: 'S', mm: 32, state: 'solid', kind: 'nonmetal', soluble: 'na', flammable: true, solid: ['#f7e242'] };
SUBSTANCES['P'] = { id: 'P', mm: 31, state: 'solid', kind: 'nonmetal', soluble: 'na', flammable: true, solid: ['#e8e0d0'] };
SUBSTANCES['I2'] = { id: 'I2', mm: 254, state: 'solid', kind: 'nonmetal', soluble: 'soluble', ionColor: { color: '#8b5a2b', sat: 20 }, solid: ['#8a4ac0'] }; // 碘（紫黑，溶液棕）
SUBSTANCES['Si'] = { id: 'Si', mm: 28, state: 'solid', kind: 'nonmetal', soluble: 'na', solid: ['#8a9bb0'] }; // 硅（半导体）
SUBSTANCES['Mg3N2'] = { id: 'Mg3N2', mm: 100, state: 'solid', kind: 'other', soluble: 'insoluble', ions: null, solid: ['#d9cfa8'] }; // 氮化镁（水解产氨）

// --- 液体（氨水/乙醇/溴）---
SUBSTANCES['NH3·H2O'] = { id: 'NH3·H2O', mm: 35, state: 'liquid', kind: 'base', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'NH4+', an: 'OH-', catCount: 1, anCount: 1 }, solid: ['#ffffff'] }; // 氨水（弱碱）
SUBSTANCES['NH4OH'] = { id: 'NH4OH', mm: 35, state: 'liquid', kind: 'base', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'NH4+', an: 'OH-', catCount: 1, anCount: 1 }, solid: ['#ffffff'] }; // 氢氧化铵 = 氨水（NH4OH ≡ NH3·H2O，别名）
SUBSTANCES['C2H5OH'] = { id: 'C2H5OH', mm: 46, state: 'liquid', kind: 'other', soluble: 'soluble', flammable: true, solid: ['#ffffff'] }; // 乙醇
SUBSTANCES['H2C2O4'] = { id: 'H2C2O4', mm: 90, state: 'solid', kind: 'acid', soluble: 'soluble', acidStrength: 'weak', ions: { cat: 'H+', an: 'C2O4^2-', catCount: 2, anCount: 1 }, solid: ['#ffffff'] }; // 草酸（高锰酸钾褪色）
SUBSTANCES['Br2'] = { id: 'Br2', mm: 160, state: 'liquid', kind: 'nonmetal', soluble: 'soluble', ionColor: { color: '#d8762a', sat: 100 }, solid: ['#8a2c1c'] }; // 溴（橙红）

// --- 气体（高中扩展：颜色按物质，可燃气体带气体火焰色）---
SUBSTANCES['H2'] = { id: 'H2', mm: 2, state: 'gas', kind: 'nonmetal', soluble: 'na', flammable: true, gasFlameColor: '#7fd4ff', solid: [] };
SUBSTANCES['O2'] = { id: 'O2', mm: 32, state: 'gas', kind: 'gas', soluble: 'na', solid: [] };
SUBSTANCES['N2'] = { id: 'N2', mm: 28, state: 'gas', kind: 'gas', soluble: 'na', solid: [] };
SUBSTANCES['CO2'] = { id: 'CO2', mm: 44, state: 'gas', kind: 'acidicGas', soluble: 'na', solid: [] };
SUBSTANCES['SO2'] = { id: 'SO2', mm: 64, state: 'gas', kind: 'acidicGas', soluble: 'na', solid: [] };
SUBSTANCES['CO'] = { id: 'CO', mm: 28, state: 'gas', kind: 'gas', soluble: 'na', flammable: true, gasFlameColor: '#7fd4ff', solid: [] };
SUBSTANCES['NH3'] = { id: 'NH3', mm: 17, state: 'gas', kind: 'gas', soluble: 'na', solid: [] };
SUBSTANCES['Cl2'] = { id: 'Cl2', mm: 71, state: 'gas', kind: 'gas', soluble: 'na', gasColor: '#b8e01f', solid: [] };   // 黄绿（有毒，需碱液吸收）
SUBSTANCES['H2S'] = { id: 'H2S', mm: 34, state: 'gas', kind: 'acidicGas', soluble: 'na', flammable: true, gasColor: '#ffe9a8', gasFlameColor: '#7fd4ff', solid: [] }; // 臭鸡蛋气
SUBSTANCES['NO'] = { id: 'NO', mm: 30, state: 'gas', kind: 'gas', soluble: 'na', solid: [] };                          // 无色
SUBSTANCES['NO2'] = { id: 'NO2', mm: 46, state: 'gas', kind: 'gas', soluble: 'na', gasColor: '#ff6a3d', solid: [] };   // 红棕
SUBSTANCES['CH4'] = { id: 'CH4', mm: 16, state: 'gas', kind: 'gas', soluble: 'na', flammable: true, gasFlameColor: '#7fd4ff', solid: [] };
SUBSTANCES['SO3'] = { id: 'SO3', mm: 80, state: 'gas', kind: 'acidicGas', soluble: 'na', gasColor: '#f0f0ff', solid: [] }; // 白烟

// --- 指示剂（pH 显色：stops = [[pH起点, 颜色]...]，按 pH 找最后一个 ≤ 的段）---
// cn = 中文名：指示剂/特定物质在游戏里用中文显示（酚酞/石蕊不显示 C20H14O4/Litmus 化学式）
SUBSTANCES['Litmus'] = { id: 'Litmus', mm: 210, state: 'solid', kind: 'indicator', soluble: 'soluble', cn: '石蕊', indicator: { stops: [[0, '#ff3b30'], [5, '#b06ad4'], [8, '#3b6cff']] }, solid: ['#b06ad4'] }; // 石蕊：红<5 / 紫5~8 / 蓝>8
SUBSTANCES['C20H14O4'] = { id: 'C20H14O4', mm: 318, state: 'solid', kind: 'indicator', soluble: 'soluble', cn: '酚酞', indicator: { stops: [[0, '#ffffff'], [8.2, '#ffb3c1'], [10, '#ff2d55']], transparent: true }, solid: ['#ffffff'] }; // 酚酞：无色<8.2 / 浅红8.2~10 / 深红>10

// --- 催化剂 / 其它 ---
SUBSTANCES['MnO2'] = { id: 'MnO2', mm: 87, state: 'solid', kind: 'catalyst', soluble: 'insoluble', solid: ['#333333'] };

// ---------------------------------------------------------------------------
// 查询与兜底
// ---------------------------------------------------------------------------
/** 物质别名表：同一物质的不同写法统一到规范 id（如 NH4OH ≡ NH3·H2O 氢氧化铵=氨水）。
 *  别名只存在于"关卡书写/配置"层面，进入化学引擎后一律归一化，避免同一物质
 *  分裂成两个 id 导致反应路径重复、日志抖动（自定义反应认 NH4OH、内置反应认
 *  NH3·H2O，两边各跑各的）。 */
export const ALIASES = { NH4OH: 'NH3·H2O' };

/** 归一化物质 id（别名 → 规范名） */
export function normId(id) {
  return ALIASES[id] ?? id;
}

export function getSubstance(id) {
  const s = SUBSTANCES[normId(id)];
  if (s) return s;
  // 兜底：从未知公式构造一条"白盐"记录（数据缺失时保证不崩，属性可在表中补齐）
  return { id, mm: 100, state: 'solid', kind: 'other', soluble: 'soluble', solid: ['#cccccc'] };
}

/** 用户可见名称：指示剂等设置过 cn 的显示中文名，其余显示化学式 id（科学教育向）。 */
export function displayName(id) {
  return getSubstance(id).cn ?? normId(id);
}

export function isSoluble(id) {
  return getSubstance(id).soluble === 'soluble';
}

// ---------------------------------------------------------------------------
// 溶液浓度判据（"浓酸"定义是化学反应分支与 UI 标注的共同依据）
// ---------------------------------------------------------------------------
/** "浓"酸阈值：溶液里酸的质量（g）/ 溶液体积（L）；≥300 视为浓
 *  （MnO2+浓盐酸制氯气、浓 HNO3/H2SO4 氧化分支等；KMnO4+盐酸不需要浓——见 rules.js） */
export const CONC_HIGH = 300;
/** 钝化浓度：Fe/Al 常温遇 ≥400 g/L 浓硫酸/浓硝酸钝化（加热后才反应） */
export const PASSIVATION_CONC = 400;
/** 酸的浓度标签：≥CONC_HIGH → "浓"，否则 "稀"（UI 显示用，如 HCl(浓)） */
export function acidLabelOf(id, mass, volumeL) {
  const s = getSubstance(id);
  if (!s || s.kind !== 'acid') return null;
  if (!(volumeL > 0) || !Number.isFinite(mass)) return '浓'; // 无溶剂稀释（干台）→ 视为浓
  return mass / volumeL >= CONC_HIGH ? '浓' : '稀';
}

/** 贴地摩擦脱落系数（g/格/s，满格浓度时的速率上限）：可溶物更容易被蹭掉（0.005），
 *  不溶物较难脱落（0.001）。物质表可用 shedCoeff 字段覆盖（未来按物质定制）。 */
export function shedCoeffOf(id) {
  const s = getSubstance(id);
  if (s.shedCoeff !== undefined) return s.shedCoeff;
  return isSoluble(id) ? 0.005 : 0.001;
}

export function isElectrolyte(id) {
  return !!getSubstance(id).ions;
}

/** 金属 A 是否比金属 B 活泼（活动性序：数值越小越靠前/越活泼，用于置换） */
export function isMoreActive(metalA, metalB) {
  const a = getSubstance(metalA).activity ?? -1;
  const b = getSubstance(metalB).activity ?? -1;
  return a < b;
}

// ---------------------------------------------------------------------------
// 焰色反应：元素 → 特征色（物理变化，不消耗物质）
// ---------------------------------------------------------------------------
export const FLAME_COLORS = {
  'Li+':  '#ff5fd0', // 紫红
  'Na+':  '#ffd23f', // 黄
  'K+':   '#c78bff', // 紫
  'Ca2+': '#ff5f2e', // 砖红
  'Ba2+': '#b8ff4f', // 黄绿（绿色）
  'Cu2+': '#4dff5f', // 绿
  'Sr2+': '#ff3d6a', // 洋红
  'Fe2+': '#ffb340', // 金黄
  'Fe3+': '#ffa03d', // 橙金
  'Zn2+': '#9fd8ff', // 蓝白
  'Mg2+': '#d8ffe8', // 白绿
};

/** 物质的焰色：优先物质自带 flameColor（单质），否则按阳离子查表 */
export function flameColorOf(id) {
  const s = getSubstance(id);
  if (s.flameColor) return s.flameColor;
  if (s.ions) return FLAME_COLORS[s.ions.cat] ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// 关卡自定义反应字符串解析："Cu + FeCl3 → CuCl2 + FeCl2"
// 支持系数（2H2 + O2 → 2H2O）与箭头（→ / -> / =>）。物质必须存在于物质表。
// ---------------------------------------------------------------------------
function _parseReaction(str) {
  if (!str || !String(str).trim()) return { ok: false, error: '空' };
  const parts = String(str).split(/\s*(?:→|->|=>)\s*/).map((s) => s.trim());
  if (parts.length < 2) return { ok: false, error: '缺少箭头 →（格式：A + B → C + D）' };
  const parseSide = (s) =>
    (s || '').split(/\s*\+\s*/).filter(Boolean).map((part) => {
      const m = part.trim().match(/^(\d*)\s*(.+)$/);
      // 归一化别名（NH4OH → NH3·H2O），自定义反应与内置反应共用同一物质 id
      return { id: normId((m[2] ?? part).trim()), coeff: m[1] ? Number(m[1]) : 1 };
    });
  const reactants = parseSide(parts[0]);
  const products = parseSide(parts[1]);
  if (!reactants.length) return { ok: false, error: '反应物为空' };
  if (!products.length) return { ok: false, error: '生成物为空' };
  for (const r of [...reactants, ...products]) {
    if (!SUBSTANCES[r.id]) return { ok: false, error: `物质「${r.id}」不在物质表中` };
    if (!(r.coeff > 0)) return { ok: false, error: `「${r.id}」的系数无效` };
  }
  return { ok: true, rule: { reactants, products } };
}

/** 解析关卡自定义反应："Cu + FeCl3 → CuCl2 + FeCl2"；失败返回 null。 */
export function parseReactionStr(str) {
  const r = _parseReaction(str);
  return r.ok ? r.rule : null;
}

/** 反应字符串的详细错误说明（编辑器提示用）；合法返回 null。 */
export function reactionStrError(str) {
  return _parseReaction(str).error ?? null;
}
