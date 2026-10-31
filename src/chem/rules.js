// ============================================================================
// 反应规则（数据驱动）——高中版
// ----------------------------------------------------------------------------
// 规则统一形状：
//   {
//     type,
//     reactants: [{id, coeff}],     // 速率参照 = reactants[0]（rate 单位 g/s of ref）
//     products:  [{id, coeff}],
//     condition: 'normal'|'heat'|'highTemp'|'ignited'|{catalyst:'MnO2'}
//              | {concHigh:true, heat:true}   // 浓+加热（MnO2+浓HCl 制氯气）
//              | {o2:'low'}                   // 仅低氧分压时（不充分燃烧）
//     rate: g/s,
//     explosive: true,   // 触发爆炸（env.explode）
//   }
// 引擎把"氧化还原（自动配平）""离子双置换"和"金属置换"单独实现（见 redox.js / engine.js），
// 本文件存放需逐条列出的反应与特例。
// ============================================================================

// ---- 反应速率（g/s，基准）----
export const RATE = {
  ionic: 24,          // 液-液基准（固-液 ×0.5，固-固 ×0.1）
  displace: 12,       // 金属置换
  redox: 3,           // 氧化还原（自动配平，整体较慢便于观察）
  thermal: 5,         // 加热/高温分解
  electrolysis: 6,    // 电解（g/s，按方程式首个反应物计；由"电解池"提供 electric 条件）
  catalytic: 5,       // 催化/加热制氧
  combustion: 5,      // 燃烧
  reduction: 5,       // 固还原
  autoDecomp: 300,    // 碳酸等自发分解（近似瞬时）
  acidGas: 24,        // 碱吸收酸性气体
  dissolution: 10,    // 可溶固体溶解（玩家身上的盐壳/可溶物在水中较快洗掉）
  gasCombustion: 12,  // 大气中可燃气体燃烧
  special: 8,         // 特例反应（分步/两性/氯化铵等）
  custom: 8,          // 关卡自定义反应（最高优先级）
};

// ---- 自反应：加热/高温分解 ----
export const THERMAL_RULES = [
  { type: 'thermal', reactants: [{ id: 'Cu(OH)2', coeff: 1 }], products: [{ id: 'CuO', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  { type: 'thermal', reactants: [{ id: 'Fe(OH)3', coeff: 2 }], products: [{ id: 'Fe2O3', coeff: 1 }, { id: 'H2O', coeff: 3 }], condition: 'heat', rate: RATE.thermal },
  { type: 'thermal', reactants: [{ id: 'Mg(OH)2', coeff: 1 }], products: [{ id: 'MgO', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  { type: 'thermal', reactants: [{ id: 'Fe(OH)2', coeff: 1 }], products: [{ id: 'FeO', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  { type: 'thermal', reactants: [{ id: 'CaCO3', coeff: 1 }], products: [{ id: 'CaO', coeff: 1 }, { id: 'CO2', coeff: 1 }], condition: 'highTemp', rate: RATE.thermal },
  // NH4Cl --△--> NH3↑ + HCl↑（两种气体）
  { type: 'thermal', reactants: [{ id: 'NH4Cl', coeff: 1 }], products: [{ id: 'NH3', coeff: 1 }, { id: 'HCl(g)', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  // NH4HCO3 --△--> NH3↑ + H2O + CO2↑
  { type: 'thermal', reactants: [{ id: 'NH4HCO3', coeff: 1 }], products: [{ id: 'NH3', coeff: 1 }, { id: 'H2O', coeff: 1 }, { id: 'CO2', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  // 2NaHCO3 --△--> Na2CO3 + H2O + CO2↑
  { type: 'thermal', reactants: [{ id: 'NaHCO3', coeff: 2 }], products: [{ id: 'Na2CO3', coeff: 1 }, { id: 'H2O', coeff: 1 }, { id: 'CO2', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  // Cu2(OH)2CO3 --△--> 2CuO + CO2↑ + H2O（铜绿分解）
  { type: 'thermal', reactants: [{ id: 'Cu2(OH)2CO3', coeff: 1 }], products: [{ id: 'CuO', coeff: 2 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
  // 4HNO3 --△/光照--> 4NO2↑ + O2↑ + 2H2O（浓硝酸见光/受热分解，越浓越易）
  { type: 'thermal', reactants: [{ id: 'HNO3', coeff: 4 }], products: [{ id: 'NO2', coeff: 4 }, { id: 'O2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'heat', rate: RATE.thermal * 0.3 },
  // 2Al(OH)3 --△--> Al2O3 + 3H2O（氢氧化铝受热分解）
  { type: 'thermal', reactants: [{ id: 'Al(OH)3', coeff: 2 }], products: [{ id: 'Al2O3', coeff: 1 }, { id: 'H2O', coeff: 3 }], condition: 'heat', rate: RATE.thermal },
  // Ca(HCO3)2 --△--> CaCO3↓ + CO2↑ + H2O（水垢成因）
  { type: 'thermal', reactants: [{ id: 'Ca(HCO3)2', coeff: 1 }], products: [{ id: 'CaCO3', coeff: 1 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'heat', rate: RATE.thermal },
];

// ---- 自反应：催化/加热制氧 ----
export const CATALYTIC_RULES = [
  // 2H2O2 --MnO2--> 2H2O + O2↑
  { type: 'catalytic', reactants: [{ id: 'H2O2', coeff: 2 }], products: [{ id: 'H2O', coeff: 2 }, { id: 'O2', coeff: 1 }], condition: { catalyst: 'MnO2' }, rate: RATE.catalytic },
  // 2KMnO4 --加热--> K2MnO4 + MnO2 + O2↑
  { type: 'catalytic', reactants: [{ id: 'KMnO4', coeff: 2 }], products: [{ id: 'K2MnO4', coeff: 1 }, { id: 'MnO2', coeff: 1 }, { id: 'O2', coeff: 1 }], condition: 'heat', rate: RATE.catalytic },
  // 2KClO3 --加热/MnO2--> 2KCl + 3O2↑
  { type: 'catalytic', reactants: [{ id: 'KClO3', coeff: 2 }], products: [{ id: 'KCl', coeff: 2 }, { id: 'O2', coeff: 3 }], condition: { catalyst: 'MnO2', heat: true }, rate: RATE.catalytic },
];

// ---- 自反应：燃烧（O2 取自大气；需要点燃条件）----
// C 不充分燃烧（低氧分压）在引擎侧按 o2 分支选择
export const COMBUSTION_RULES = [
  // 碳：点燃（空气中）→ CO2（充分燃烧）；高温+低氧 → CO（不充分，量变引起质变）
  { type: 'combustion', reactants: [{ id: 'C', coeff: 1 }, { id: 'O2', coeff: 1 }], products: [{ id: 'CO2', coeff: 1 }], condition: 'ignited', rate: RATE.combustion },
  { type: 'combustion', reactants: [{ id: 'C', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'CO', coeff: 2 }], condition: { ignited: true, highTemp: true, o2: 'low' }, rate: RATE.combustion },
  { type: 'combustion', reactants: [{ id: 'S', coeff: 1 }, { id: 'O2', coeff: 1 }], products: [{ id: 'SO2', coeff: 1 }], condition: 'ignited', rate: RATE.combustion },
  { type: 'combustion', reactants: [{ id: 'P', coeff: 4 }, { id: 'O2', coeff: 5 }], products: [{ id: 'P2O5', coeff: 2 }], condition: 'ignited', rate: RATE.combustion },
  // 金属燃烧：火花四射（sparks）；块状金属氧化是表面过程，慢而真实（Mg/Al/Na/K 本身易燃快）
  { type: 'combustion', reactants: [{ id: 'Mg', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'MgO', coeff: 2 }], condition: 'ignited', rate: RATE.combustion, sparks: true },
  { type: 'combustion', reactants: [{ id: 'Al', coeff: 4 }, { id: 'O2', coeff: 3 }], products: [{ id: 'Al2O3', coeff: 2 }], condition: 'ignited', rate: RATE.combustion, sparks: true },
  // 3Fe + 2O2 --纯氧/富氧点燃--> Fe3O4（纯氧燃烧生成四氧化三铁；空气中生成 Fe2O3 见下条）
  { type: 'combustion', reactants: [{ id: 'Fe', coeff: 3 }, { id: 'O2', coeff: 2 }], products: [{ id: 'Fe3O4', coeff: 1 }], condition: { ignited: true, o2: 'pure' }, rate: RATE.combustion * 0.003, sparks: true },
  // 4Fe + 3O2 --点燃--> 2Fe2O3：铁在**空气**中点燃/氧化生成三氧化二铁（铁锈红）；
  // 块状铁氧化是缓慢的表面过程（约 0.06 g/s——一块铁锈完以分钟计），火花四射；
  // Fe3O4 仅在纯氧/富氧燃烧出现（默认空气 O2 分压 0.2 对应 Fe2O3）
  { type: 'combustion', reactants: [{ id: 'Fe', coeff: 4 }, { id: 'O2', coeff: 3 }], products: [{ id: 'Fe2O3', coeff: 2 }], condition: 'ignited', rate: RATE.combustion * 0.003, sparks: true },
  // 铜加热变黑（CuO 氧化皮，无火花、慢速表面氧化）
  { type: 'combustion', reactants: [{ id: 'Cu', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'CuO', coeff: 2 }], condition: 'ignited', rate: RATE.combustion * 0.15 },
  // 2Na + O2 --常温--> Na2O（慢） / 2Na + O2 --点燃--> Na2O2
  { type: 'combustion', reactants: [{ id: 'Na', coeff: 4 }, { id: 'O2', coeff: 1 }], products: [{ id: 'Na2O', coeff: 2 }], condition: 'normal', rate: RATE.combustion * 0.2 },
  { type: 'combustion', reactants: [{ id: 'Na', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'Na2O2', coeff: 1 }], condition: 'ignited', rate: RATE.combustion, sparks: true },
  // 2Na2O + O2 --加热--> 2Na2O2（钠在空气中加热得到的是过氧化钠：先常温氧化出的 Na2O
  //   上了灯还要继续被氧化。缺这条规则时，钠块在灯上会停在 Na2O+Na2O2 的混合物上不动）
  { type: 'combustion', reactants: [{ id: 'Na2O', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'Na2O2', coeff: 2 }], condition: 'heat', rate: RATE.thermal },
  { type: 'combustion', reactants: [{ id: 'K', coeff: 4 }, { id: 'O2', coeff: 1 }], products: [{ id: 'K2O', coeff: 2 }], condition: 'ignited', rate: RATE.combustion, sparks: true },
  // 3Mg + N2 --点燃--> Mg3N2（镁在氮气中燃烧）
  { type: 'combustion', reactants: [{ id: 'Mg', coeff: 3 }, { id: 'N2', coeff: 1 }], products: [{ id: 'Mg3N2', coeff: 1 }], condition: 'ignited', rate: RATE.combustion * 0.5 },
  // 4Li + O2 --点燃--> 2Li2O（锂燃烧只生成氧化锂，不生成过氧化锂）
  { type: 'combustion', reactants: [{ id: 'Li', coeff: 4 }, { id: 'O2', coeff: 1 }], products: [{ id: 'Li2O', coeff: 2 }], condition: 'ignited', rate: RATE.combustion, sparks: true },
  // 2Mg + CO2 --点燃--> 2MgO + C（镁在二氧化碳中燃烧）
  { type: 'combustion', reactants: [{ id: 'Mg', coeff: 2 }, { id: 'CO2', coeff: 1 }], products: [{ id: 'MgO', coeff: 2 }, { id: 'C', coeff: 1 }], condition: 'ignited', rate: RATE.combustion * 0.5 },
  // CH4 + 2O2 --点燃--> CO2 + 2H2O
  { type: 'combustion', reactants: [{ id: 'CH4', coeff: 1 }, { id: 'O2', coeff: 2 }], products: [{ id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'ignited', rate: RATE.combustion },
  // C2H5OH + 3O2 --点燃--> 2CO2 + 3H2O
  { type: 'combustion', reactants: [{ id: 'C2H5OH', coeff: 1 }, { id: 'O2', coeff: 3 }], products: [{ id: 'CO2', coeff: 2 }, { id: 'H2O', coeff: 3 }], condition: 'ignited', rate: RATE.combustion },
  // 2H2S + O2（不足）→ 2S + 2H2O / 2H2S + 3O2（过量）→ 2SO2 + 2H2O（量变分支）
  { type: 'combustion', reactants: [{ id: 'H2S', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'S', coeff: 2 }, { id: 'H2O', coeff: 2 }], condition: { ignited: true, o2: 'low' }, rate: RATE.combustion },
  { type: 'combustion', reactants: [{ id: 'H2S', coeff: 2 }, { id: 'O2', coeff: 3 }], products: [{ id: 'SO2', coeff: 2 }, { id: 'H2O', coeff: 2 }], condition: { ignited: true, o2: 'high' }, rate: RATE.combustion },
];

// ---- 自反应：自发分解 ----
export const AUTO_DECOMP_RULES = [
  // H2CO3 是"CO2 溶于水"——分解即 CO2 逸出 + 水回到溶剂（质量守恒；与 CO2+H2O⇌H2CO3 循环净零）
  { type: 'autoDecomp', reactants: [{ id: 'H2CO3', coeff: 1 }], products: [{ id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.autoDecomp },
  // 2HClO --见光--> 2HCl + O2↑（氯水见光失效；需要"光照"条件，如灯旁）
  { type: 'autoDecomp', reactants: [{ id: 'HClO', coeff: 2 }], products: [{ id: 'HCl', coeff: 2 }, { id: 'O2', coeff: 1 }], condition: { light: true }, rate: RATE.autoDecomp * 0.05 },
  // 4Fe(OH)2 + O2 + 2H2O → 4Fe(OH)3（白色→红棕色，需大气 O2）
  { type: 'autoDecomp', reactants: [{ id: 'Fe(OH)2', coeff: 4 }, { id: 'O2', coeff: 1 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'Fe(OH)3', coeff: 4 }], condition: 'normal', rate: RATE.autoDecomp * 0.01 },
  // 2AgCl --光照--> 2Ag + Cl2（见光分解，AgCl 变黑）
  { type: 'autoDecomp', reactants: [{ id: 'AgCl', coeff: 2 }], products: [{ id: 'Ag', coeff: 2 }, { id: 'Cl2', coeff: 1 }], condition: { light: true }, rate: RATE.autoDecomp * 0.02 },
  // 4HNO3 --光照--> 4NO2 + O2 + 2H2O（浓硝酸见光分解）
  { type: 'autoDecomp', reactants: [{ id: 'HNO3', coeff: 4 }], products: [{ id: 'NO2', coeff: 4 }, { id: 'O2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: { light: true }, rate: RATE.autoDecomp * 0.005 },
  // 2AgOH → Ag2O + H2O（AgOH 不稳定，立即脱水）
  { type: 'autoDecomp', reactants: [{ id: 'AgOH', coeff: 2 }], products: [{ id: 'Ag2O', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.autoDecomp },
];

// ---- 自反应：电解（"电解池"变种提供 electric 条件；见 engine.reactSelf）----
// 顺序即优先级：**电解液规则在前、水规则在最后**——reactSelf 的同刻循环保证
// "有电解液先电解它，耗尽才轮到水"（否则食盐水池会同时按电解水和电解食盐水
// 两条规则消耗，产量对不上）。condition 用 {electric:true, solution:true} 表示
// 必须通电且在真实溶液介质中（干池/固相不电离）；水规则只要求通电。
// skipAbsorb：阳极气体（Cl2 等）从电极直接成泡逸出，不在**本池**被刚生成的
// NaOH 尾气吸收（否则电解食盐水得到的 Cl2 立刻变回 NaCl/NaClO，看不到黄绿色）。
export const ELECTROLYSIS_RULES = [
  // CuCl2 --通电--> Cu + Cl2↑（阴极析出铜、阳极放氯气）
  { type: 'electrolysis', reactants: [{ id: 'CuCl2', coeff: 1 }], products: [{ id: 'Cl2', coeff: 1 }, { id: 'Cu', coeff: 1 }], condition: { electric: true, solution: true }, rate: RATE.electrolysis * 0.5, skipAbsorb: true },
  // 2HCl --通电--> H2↑ + Cl2↑（电解盐酸：阴极氢气、阳极氯气）
  { type: 'electrolysis', reactants: [{ id: 'HCl', coeff: 2 }], products: [{ id: 'H2', coeff: 1 }, { id: 'Cl2', coeff: 1 }], condition: { electric: true, solution: true }, rate: RATE.electrolysis * 0.5, skipAbsorb: true },
  // 2NaCl + 2H2O --通电--> 2NaOH + H2↑ + Cl2↑（氯碱工业：阴极氢气、阳极氯气、溶液留碱）
  { type: 'electrolysis', reactants: [{ id: 'NaCl', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'H2', coeff: 1 }, { id: 'Cl2', coeff: 1 }, { id: 'NaOH', coeff: 2 }], condition: { electric: true, solution: true }, rate: RATE.electrolysis, skipAbsorb: true },
  // BaCl2 + 2H2O --通电--> Ba(OH)2 + H2↑ + Cl2↑（氯化钡溶液电解；混合 NaOH 时 NaOH 只作导电介质）
  { type: 'electrolysis', reactants: [{ id: 'BaCl2', coeff: 1 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'Ba(OH)2', coeff: 1 }, { id: 'H2', coeff: 1 }, { id: 'Cl2', coeff: 1 }], condition: { electric: true, solution: true }, rate: RATE.electrolysis, skipAbsorb: true },
  // 2CuSO4 + 2H2O --通电--> 2Cu + O2↑ + 2H2SO4（硫酸铜溶液电解）
  { type: 'electrolysis', reactants: [{ id: 'CuSO4', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'Cu', coeff: 2 }, { id: 'O2', coeff: 1 }, { id: 'H2SO4', coeff: 2 }], condition: { electric: true, solution: true }, rate: RATE.electrolysis * 0.5, skipAbsorb: true },
  // 4AgNO3 + 2H2O --通电--> 4Ag + O2↑ + 4HNO3（硝酸银溶液电解）
  { type: 'electrolysis', reactants: [{ id: 'AgNO3', coeff: 4 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'Ag', coeff: 4 }, { id: 'O2', coeff: 1 }, { id: 'HNO3', coeff: 4 }], condition: { electric: true, solution: true }, rate: RATE.electrolysis * 0.5, skipAbsorb: true },
  // 2H2O --通电--> 2H2↑ + O2↑（电解水：放在最后 = 电解液耗尽后才轮到水）
  { type: 'electrolysis', reactants: [{ id: 'H2O', coeff: 2 }], products: [{ id: 'H2', coeff: 2 }, { id: 'O2', coeff: 1 }], condition: 'electric', rate: RATE.electrolysis * 0.5 },
];

// ---- 自反应：气态还原（氧化物 + 大气 CO/H2，高温）----
export const GAS_REDUCTION_RULES = [
  { type: 'reduction', reactants: [{ id: 'CuO', coeff: 1 }, { id: 'CO', coeff: 1 }], products: [{ id: 'Cu', coeff: 1 }, { id: 'CO2', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'CuO', coeff: 1 }, { id: 'H2', coeff: 1 }], products: [{ id: 'Cu', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe2O3', coeff: 1 }, { id: 'CO', coeff: 3 }], products: [{ id: 'Fe', coeff: 2 }, { id: 'CO2', coeff: 3 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe2O3', coeff: 1 }, { id: 'H2', coeff: 3 }], products: [{ id: 'Fe', coeff: 2 }, { id: 'H2O', coeff: 3 }], condition: 'highTemp', rate: RATE.reduction },
  // FeO 还原：FeO + CO → Fe + CO2；FeO + H2 → Fe + H2O
  { type: 'reduction', reactants: [{ id: 'FeO', coeff: 1 }, { id: 'CO', coeff: 1 }], products: [{ id: 'Fe', coeff: 1 }, { id: 'CO2', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'FeO', coeff: 1 }, { id: 'H2', coeff: 1 }], products: [{ id: 'Fe', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  // Fe + H2S --高温--> FeS + H2（铁在高温干燥硫化氢中腐蚀；常温弱酸 H2S 不算 H+ 氧化剂）
  { type: 'reduction', reactants: [{ id: 'Fe', coeff: 1 }, { id: 'H2S', coeff: 1 }], products: [{ id: 'FeS', coeff: 1 }, { id: 'H2', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'CO', coeff: 4 }], products: [{ id: 'Fe', coeff: 3 }, { id: 'CO2', coeff: 4 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'H2', coeff: 4 }], products: [{ id: 'Fe', coeff: 3 }, { id: 'H2O', coeff: 4 }], condition: 'highTemp', rate: RATE.reduction },
  // C + CO2 --高温--> 2CO
  { type: 'reduction', reactants: [{ id: 'C', coeff: 1 }, { id: 'CO2', coeff: 1 }], products: [{ id: 'CO', coeff: 2 }], condition: 'highTemp', rate: RATE.reduction },
];

// ---- 成对反应：固-固还原（氧化物 + 炭/铝，高温）----
export const SOLID_REDUCTION_RULES = [
  { type: 'reduction', reactants: [{ id: 'CuO', coeff: 2 }, { id: 'C', coeff: 1 }], products: [{ id: 'Cu', coeff: 2 }, { id: 'CO2', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe2O3', coeff: 2 }, { id: 'C', coeff: 3 }], products: [{ id: 'Fe', coeff: 4 }, { id: 'CO2', coeff: 3 }], condition: 'highTemp', rate: RATE.reduction },
  { type: 'reduction', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'C', coeff: 2 }], products: [{ id: 'Fe', coeff: 3 }, { id: 'CO2', coeff: 2 }], condition: 'highTemp', rate: RATE.reduction },
  // 2Al + Fe2O3 --高温--> Al2O3 + 2Fe（铝热反应，爆炸）
  { type: 'reduction', reactants: [{ id: 'Al', coeff: 2 }, { id: 'Fe2O3', coeff: 1 }], products: [{ id: 'Al2O3', coeff: 1 }, { id: 'Fe', coeff: 2 }], condition: 'highTemp', rate: RATE.reduction * 3, explosive: true },
];

// ---- 成对反应：特例表（分步/两性/活泼金属遇水/浓酸制气等）----
export const SPECIAL_PAIR_RULES = [
  // Fe3O4（混合价）+ 酸（离子引擎无法覆盖，显式列出）
  { type: 'special', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'HCl', coeff: 8 }], products: [{ id: 'FeCl3', coeff: 2 }, { id: 'FeCl2', coeff: 1 }, { id: 'H2O', coeff: 4 }], condition: 'normal', rate: RATE.ionic },
  { type: 'special', reactants: [{ id: 'Fe3O4', coeff: 1 }, { id: 'H2SO4', coeff: 4 }], products: [{ id: 'Fe2(SO4)3', coeff: 1 }, { id: 'FeSO4', coeff: 1 }, { id: 'H2O', coeff: 4 }], condition: 'normal', rate: RATE.ionic },
  // 分步：Na2CO3 + HCl（少量）→ NaHCO3 + NaCl（先无气泡）；NaHCO3 + HCl → NaCl + CO2↑ + H2O
  { type: 'special', reactants: [{ id: 'Na2CO3', coeff: 1 }, { id: 'HCl', coeff: 1 }], products: [{ id: 'NaHCO3', coeff: 1 }, { id: 'NaCl', coeff: 1 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'NaHCO3', coeff: 1 }, { id: 'HCl', coeff: 1 }], products: [{ id: 'NaCl', coeff: 1 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 酸式盐中和：NaHCO3 + NaOH → Na2CO3 + H2O（同钠离子，离子引擎不驱动，显式列出）
  { type: 'special', reactants: [{ id: 'NaHCO3', coeff: 1 }, { id: 'NaOH', coeff: 1 }], products: [{ id: 'Na2CO3', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.ionic },
  // 碳酸化（CO2 过量，需有水）：CaCO3 + CO2 + H2O → Ca(HCO3)2（石灰水先浑后清）
  // 只有大气 CO2 明显过量（>3g）才慢慢把沉淀溶回去，避免少量通气就看不到白色浑浊
  { type: 'special', reactants: [{ id: 'CaCO3', coeff: 1 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'Ca(HCO3)2', coeff: 1 }], condition: 'normal', rate: RATE.special * 0.03, co2Over: 3 },
  // Na2CO3 + CO2 + H2O → 2NaHCO3（CO2 过量转化为碳酸氢钠）
  { type: 'special', reactants: [{ id: 'Na2CO3', coeff: 1 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'NaHCO3', coeff: 2 }], condition: 'normal', rate: RATE.special },
  // Na2O2 + CO2 → Na2CO3 + O2（过氧化钠与二氧化碳，不需水）
  { type: 'special', reactants: [{ id: 'Na2O2', coeff: 2 }, { id: 'CO2', coeff: 2 }], products: [{ id: 'Na2CO3', coeff: 2 }, { id: 'O2', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 氨气+氯化氢气体（白烟，大气中相遇；引擎在 reactAtmosphere 特判处理）
  { type: 'special', reactants: [{ id: 'NH3', coeff: 1 }, { id: 'HCl(g)', coeff: 1 }], products: [{ id: 'NH4Cl', coeff: 1 }], condition: 'normal', rate: RATE.special * 2, atmosphereOnly: true },
  // ---- 双水解（三价金属盐 + 碳酸盐/硫化物；不能按普通复分解生成 Fe2(CO3)3 之类不存在的盐）----
  { type: 'special', reactants: [{ id: 'FeCl3', coeff: 2 }, { id: 'Na2CO3', coeff: 3 }, { id: 'H2O', coeff: 3 }], products: [{ id: 'Fe(OH)3', coeff: 2 }, { id: 'CO2', coeff: 3 }, { id: 'NaCl', coeff: 6 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'AlCl3', coeff: 2 }, { id: 'Na2CO3', coeff: 3 }, { id: 'H2O', coeff: 3 }], products: [{ id: 'Al(OH)3', coeff: 2 }, { id: 'CO2', coeff: 3 }, { id: 'NaCl', coeff: 6 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'CrCl3', coeff: 2 }, { id: 'Na2CO3', coeff: 3 }, { id: 'H2O', coeff: 3 }], products: [{ id: 'Cr(OH)3', coeff: 2 }, { id: 'CO2', coeff: 3 }, { id: 'NaCl', coeff: 6 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'FeCl3', coeff: 2 }, { id: 'Na2S', coeff: 1 }], products: [{ id: 'FeCl2', coeff: 2 }, { id: 'S', coeff: 1 }, { id: 'NaCl', coeff: 2 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'AlCl3', coeff: 2 }, { id: 'Na2S', coeff: 3 }, { id: 'H2O', coeff: 6 }], products: [{ id: 'Al(OH)3', coeff: 2 }, { id: 'H2S', coeff: 3 }, { id: 'NaCl', coeff: 6 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'CrCl3', coeff: 2 }, { id: 'Na2S', coeff: 3 }, { id: 'H2O', coeff: 6 }], products: [{ id: 'Cr(OH)3', coeff: 2 }, { id: 'H2S', coeff: 3 }, { id: 'NaCl', coeff: 6 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'CuSO4', coeff: 2 }, { id: 'Na2CO3', coeff: 2 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'Cu2(OH)2CO3', coeff: 1 }, { id: 'Na2SO4', coeff: 2 }, { id: 'CO2', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'FeCl3', coeff: 1 }, { id: 'NaHCO3', coeff: 3 }], products: [{ id: 'Fe(OH)3', coeff: 1 }, { id: 'CO2', coeff: 3 }, { id: 'NaCl', coeff: 3 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'AlCl3', coeff: 1 }, { id: 'NaHCO3', coeff: 3 }], products: [{ id: 'Al(OH)3', coeff: 1 }, { id: 'CO2', coeff: 3 }, { id: 'NaCl', coeff: 3 }], condition: { solution: true }, rate: RATE.special },
  // ---- 偏铝酸盐/硅酸盐 + 酸或 CO2 ----
  { type: 'special', reactants: [{ id: 'NaAlO2', coeff: 1 }, { id: 'HCl', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'Al(OH)3', coeff: 1 }, { id: 'NaCl', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'NaAlO2', coeff: 1 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'Al(OH)3', coeff: 1 }, { id: 'NaHCO3', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Na2SiO3', coeff: 1 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'H2SiO3', coeff: 1 }, { id: 'Na2CO3', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Ca(OH)2', coeff: 1 }, { id: 'NaHCO3', coeff: 1 }], products: [{ id: 'CaCO3', coeff: 1 }, { id: 'NaOH', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Ba(OH)2', coeff: 1 }, { id: 'CO2', coeff: 1 }], products: [{ id: 'BaCO3', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.ionic },
  // ---- 两性物 + KOH / 铬绿 / 锌 ----
  { type: 'special', reactants: [{ id: 'Al(OH)3', coeff: 1 }, { id: 'KOH', coeff: 1 }], products: [{ id: 'KAlO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Al2O3', coeff: 1 }, { id: 'KOH', coeff: 2 }], products: [{ id: 'KAlO2', coeff: 2 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'SiO2', coeff: 1 }, { id: 'KOH', coeff: 2 }], products: [{ id: 'K2SiO3', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Cr2O3', coeff: 1 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'NaCrO2', coeff: 2 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Zn', coeff: 1 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'Na2ZnO2', coeff: 1 }, { id: 'H2', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Zn(OH)2', coeff: 1 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'Na2ZnO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'normal', rate: RATE.special },
  // ---- 沉淀转化/配合（弱酸/弱碱环境）----
  { type: 'special', reactants: [{ id: 'AgCl', coeff: 1 }, { id: 'NaBr', coeff: 1 }], products: [{ id: 'AgBr', coeff: 1 }, { id: 'NaCl', coeff: 1 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'AgCl', coeff: 1 }, { id: 'KI', coeff: 1 }], products: [{ id: 'AgI', coeff: 1 }, { id: 'KCl', coeff: 1 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'BaCO3', coeff: 1 }, { id: 'Na2SO4', coeff: 1 }], products: [{ id: 'BaSO4', coeff: 1 }, { id: 'Na2CO3', coeff: 1 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Mg(OH)2', coeff: 1 }, { id: 'NH4Cl', coeff: 2 }], products: [{ id: 'MgCl2', coeff: 1 }, { id: 'NH3·H2O', coeff: 2 }], condition: 'normal', rate: RATE.special },
  // 配位溶解：AgCl + 2NH3·H2O → [Ag(NH3)2]Cl + 2H2O；Cu(OH)2 + 4NH3·H2O → [Cu(NH3)4](OH)2 + 4H2O
  { type: 'special', reactants: [{ id: 'AgCl', coeff: 1 }, { id: 'NH3·H2O', coeff: 2 }], products: [{ id: '[Ag(NH3)2]Cl', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'normal', rate: RATE.special * 0.5 },
  { type: 'special', reactants: [{ id: 'Cu(OH)2', coeff: 1 }, { id: 'NH3·H2O', coeff: 4 }], products: [{ id: '[Cu(NH3)4](OH)2', coeff: 1 }, { id: 'H2O', coeff: 4 }], condition: 'normal', rate: RATE.special * 0.5 },
  // ---- 其他经典无机 ----
  { type: 'special', reactants: [{ id: 'K2Cr2O7', coeff: 1 }, { id: 'HCl', coeff: 14 }], products: [{ id: 'KCl', coeff: 2 }, { id: 'CrCl3', coeff: 2 }, { id: 'Cl2', coeff: 3 }, { id: 'H2O', coeff: 7 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Na2O2', coeff: 1 }, { id: 'HCl', coeff: 2 }], products: [{ id: 'NaCl', coeff: 2 }, { id: 'H2O2', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'K2O', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'KOH', coeff: 2 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Li2O', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'LiOH', coeff: 2 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Mg', coeff: 1 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'Mg(OH)2', coeff: 1 }, { id: 'H2', coeff: 1 }], condition: 'heat', rate: RATE.special * 0.5 },
  { type: 'special', reactants: [{ id: 'P2O5', coeff: 1 }, { id: 'H2O', coeff: 3 }], products: [{ id: 'H3PO4', coeff: 2 }], condition: 'normal', rate: RATE.special },
  // 两性溶解：Al(OH)3 + NaOH → NaAlO2 + 2H2O（过量碱）；Cr(OH)3 同理
  { type: 'special', reactants: [{ id: 'Al(OH)3', coeff: 1 }, { id: 'NaOH', coeff: 1 }], products: [{ id: 'NaAlO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'Cr(OH)3', coeff: 1 }, { id: 'NaOH', coeff: 1 }], products: [{ id: 'NaCrO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'normal', rate: RATE.special },
  // 金属+碱：2Al + 2NaOH + 2H2O → 2NaAlO2 + 3H2↑（铝与碱反应；必须有水）
  { type: 'special', reactants: [{ id: 'Al', coeff: 2 }, { id: 'NaOH', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'NaAlO2', coeff: 2 }, { id: 'H2', coeff: 3 }], condition: { solution: true }, rate: RATE.special },
  // 铬酸碱互变（量变/指示剂式应用）：Cr2O7^2- + 2OH- → 2CrO4^2- + H2O（橙红→黄）
  // 钠的去处是 Na2CrO4（旧式把钠丢掉会凭空多 32g/摩尔）
  { type: 'special', reactants: [{ id: 'K2Cr2O7', coeff: 1 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'K2CrO4', coeff: 1 }, { id: 'Na2CrO4', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 2CrO4^2- + 2H+ → Cr2O7^2- + H2O（黄→橙红）
  { type: 'special', reactants: [{ id: 'K2CrO4', coeff: 2 }, { id: 'HCl', coeff: 2 }], products: [{ id: 'K2Cr2O7', coeff: 1 }, { id: 'KCl', coeff: 2 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 活泼金属遇水（爆炸）：2Na + 2H2O → 2NaOH + H2↑
  { type: 'special', reactants: [{ id: 'Na', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'NaOH', coeff: 2 }, { id: 'H2', coeff: 1 }], condition: 'normal', rate: RATE.special * 2, explosive: true },
  { type: 'special', reactants: [{ id: 'K', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'KOH', coeff: 2 }, { id: 'H2', coeff: 1 }], condition: 'normal', rate: RATE.special * 2, explosive: true },
  { type: 'special', reactants: [{ id: 'Li', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'LiOH', coeff: 2 }, { id: 'H2', coeff: 1 }], condition: 'normal', rate: RATE.special * 2 },
  // 碱性氧化物遇水：Na2O + H2O → 2NaOH（剧烈）；CaO + H2O → Ca(OH)2（放热）
  { type: 'special', reactants: [{ id: 'Na2O', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'NaOH', coeff: 2 }], condition: 'normal', rate: RATE.special },
  { type: 'special', reactants: [{ id: 'CaO', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'Ca(OH)2', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 过氧化钠遇水（爆炸，放 O2）：2Na2O2 + 2H2O → 4NaOH + O2↑
  { type: 'special', reactants: [{ id: 'Na2O2', coeff: 2 }, { id: 'H2O', coeff: 2 }], products: [{ id: 'NaOH', coeff: 4 }, { id: 'O2', coeff: 1 }], condition: 'normal', rate: RATE.special * 2, explosive: true },
  // 氯气歧化（遇水）：Cl2 + H2O ⇌ HCl + HClO —— **已移除**（用户规则：Cl2 默认
  // 不溶于水，保持黄绿气体可见；只有集气瓶强行通入（forceDissolve）才溶成氯水）。
  // 旧实现把它放进"成对反应表"——任何实体浸入含水容器都会触发（玩家跳进纯水池
  // 就会让大气氯气生成氯水，随后归中再放氯气——纯水池变成氯气泵，用户实测复现），
  // 与"CO2/SO2/NO2/Cl2 不主动溶解"的既有设计（GAS_WATER 跳过 + 大气可见 +
  // NaOH 尾气处理）冲突。氯水玩法如需恢复：走 _emitGas 的 forceDissolve 管线。
  // 归中：HCl + HClO → Cl2↑ + H2O（Cl⁻ 与 ClO⁻ 归中为 Cl₂，浓盐酸+漂白液制氯气）
  { type: 'special', reactants: [{ id: 'HCl', coeff: 1 }, { id: 'HClO', coeff: 1 }], products: [{ id: 'Cl2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 漂白液遇酸放出氯气（危险）：NaClO + 2HCl → NaCl + Cl2↑ + H2O
  { type: 'special', reactants: [{ id: 'NaClO', coeff: 1 }, { id: 'HCl', coeff: 2 }], products: [{ id: 'NaCl', coeff: 1 }, { id: 'Cl2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 次氯酸钾 + 盐酸同样放出氯气：KClO + 2HCl → KCl + Cl2↑ + H2O
  // （与 NaClO 同型；显式列出，避免只靠 HClO+HCl 间接路径在固/液接触顺序下漏反应）
  { type: 'special', reactants: [{ id: 'KClO', coeff: 1 }, { id: 'HCl', coeff: 2 }], products: [{ id: 'KCl', coeff: 1 }, { id: 'Cl2', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: 'normal', rate: RATE.special },
  // 氯酸钾 + 浓盐酸：KClO3 + 6HCl → KCl + 3Cl2↑ + 3H2O（实验室制氯气的另一条经典路径）
  // 反应很快，不用缓慢特例速率，否则低浓度尾巴看起来像"没反应"
  { type: 'special', reactants: [{ id: 'KClO3', coeff: 1 }, { id: 'HCl', coeff: 6 }], products: [{ id: 'KCl', coeff: 1 }, { id: 'Cl2', coeff: 3 }, { id: 'H2O', coeff: 3 }], condition: 'normal', rate: RATE.special * 3 },
  // MnO2 + 4HCl（浓）--△--> MnCl2 + Cl2↑ + 2H2O（实验室制氯气）
  { type: 'special', reactants: [{ id: 'MnO2', coeff: 1 }, { id: 'HCl', coeff: 4 }], products: [{ id: 'MnCl2', coeff: 1 }, { id: 'Cl2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: { concHigh: true, heat: true }, rate: RATE.special },
  // 3Fe + 4H2O(g) --高温--> Fe3O4 + 4H2（铁与水蒸气，游戏简化为浸水+高温）
  { type: 'special', reactants: [{ id: 'Fe', coeff: 3 }, { id: 'H2O', coeff: 4 }], products: [{ id: 'Fe3O4', coeff: 1 }, { id: 'H2', coeff: 4 }], condition: 'highTemp', rate: RATE.special * 0.5 },
  // 3Mg + N2 已有（燃烧）；Mg3N2 + 6H2O → 3Mg(OH)2 + 2NH3（水解）
  { type: 'special', reactants: [{ id: 'Mg3N2', coeff: 1 }, { id: 'H2O', coeff: 6 }], products: [{ id: 'Mg(OH)2', coeff: 3 }, { id: 'NH3', coeff: 2 }], condition: 'normal', rate: RATE.special },
  // 干法制氨：2NH4Cl + Ca(OH)2 --△--> CaCl2 + 2NH3↑ + 2H2O（固固加热；溶液里同样成立）
  { type: 'special', reactants: [{ id: 'NH4Cl', coeff: 2 }, { id: 'Ca(OH)2', coeff: 1 }], products: [{ id: 'CaCl2', coeff: 1 }, { id: 'NH3', coeff: 2 }, { id: 'H2O', coeff: 2 }], condition: 'heat', rate: RATE.special },
  // 2KMnO4 + 16HCl → 2KCl + 2MnCl2 + 5Cl2↑ + 8H2O（高锰酸钾制氯气：KMnO4 氧化性极强，
  // 稀盐酸也反应——不需要"浓"（与 MnO2 制氯气不同，后者必须浓+加热））
  { type: 'special', reactants: [{ id: 'KMnO4', coeff: 2 }, { id: 'HCl', coeff: 16 }], products: [{ id: 'KCl', coeff: 2 }, { id: 'MnCl2', coeff: 2 }, { id: 'Cl2', coeff: 5 }, { id: 'H2O', coeff: 8 }], condition: 'normal', rate: RATE.special },
  // 两性氧化物/酸性氧化物溶于强碱（需溶液介质）：Al2O3 + 2NaOH → 2NaAlO2 + H2O；SiO2 + 2NaOH → Na2SiO3 + H2O
  { type: 'special', reactants: [{ id: 'Al2O3', coeff: 1 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'NaAlO2', coeff: 2 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  { type: 'special', reactants: [{ id: 'SiO2', coeff: 1 }, { id: 'NaOH', coeff: 2 }], products: [{ id: 'Na2SiO3', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  // 铜绿与盐酸：Cu2(OH)2CO3 + 4HCl → 2CuCl2 + CO2↑ + 3H2O
  { type: 'special', reactants: [{ id: 'Cu2(OH)2CO3', coeff: 1 }, { id: 'HCl', coeff: 4 }], products: [{ id: 'CuCl2', coeff: 2 }, { id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 3 }], condition: { solution: true }, rate: RATE.special },
  // 水煤气：C + H2O(g) --高温--> CO + H2（游戏简化为浸水 + 高温）
  { type: 'special', reactants: [{ id: 'C', coeff: 1 }, { id: 'H2O', coeff: 1 }], products: [{ id: 'CO', coeff: 1 }, { id: 'H2', coeff: 1 }], condition: 'highTemp', rate: RATE.reduction },
  // 金属 + 硫粉（固-固化合，金属块 × 灯上硫粉等成对触发）：
  // Fe + S --点燃--> FeS（黑色）：化合反应快（快于铁/硫各自的燃烧），点燃即优先化合
  { type: 'special', reactants: [{ id: 'Fe', coeff: 1 }, { id: 'S', coeff: 1 }], products: [{ id: 'FeS', coeff: 1 }], condition: 'ignited', rate: RATE.special * 3 },
  // Fe + 溶解 H2S → FeS↓ + H2↑（关卡可把 H2S 直接写进池水；H2S 是气体 id，
  // 但它在溶液里同样能被 Fe 置换出 H2——配合 _runPairDataRule 的"溶液优先"取源）
  { type: 'special', reactants: [{ id: 'Fe', coeff: 1 }, { id: 'H2S', coeff: 1 }], products: [{ id: 'FeS', coeff: 1 }, { id: 'H2', coeff: 1 }], condition: { solution: true }, rate: RATE.special },
  // Cu + S --点燃--> CuS（黑色）
  { type: 'special', reactants: [{ id: 'Cu', coeff: 1 }, { id: 'S', coeff: 1 }], products: [{ id: 'CuS', coeff: 1 }], condition: 'ignited', rate: RATE.special },
  // 氯水/次氯酸氧化 H2S 与 Fe2+（Cl2 通气后先生成 HClO；显式计量，避免 FeCl3 配平质量缺口）
  { type: 'special', reactants: [{ id: 'HClO', coeff: 1 }, { id: 'H2S', coeff: 1 }], products: [{ id: 'S', coeff: 1 }, { id: 'HCl', coeff: 1 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special * 3 },
  { type: 'special', reactants: [{ id: 'HClO', coeff: 1 }, { id: 'FeCl2', coeff: 2 }, { id: 'HCl', coeff: 1 }], products: [{ id: 'FeCl3', coeff: 2 }, { id: 'H2O', coeff: 1 }], condition: { solution: true }, rate: RATE.special * 3 },
  // 注：NH3+HCl 白烟、CaCO3/Na2CO3+大气CO2→酸式盐、Na2O2+CO2 放在引擎的
  // reactAtmosphere / _trySpecialSelf（需要大气 CO2 且仅在有水环境转酸式盐）
];

// ---- 金属与大气卤素的化合（点燃；气体来自大气，能附着金属表面）----
export const METAL_NONMETAL_RULES = [
  // 2Na + Cl2 --点燃--> 2NaCl（白烟；纯 Cl2 气室无需 O2）
  { type: 'special', reactants: [{ id: 'Na', coeff: 2 }, { id: 'Cl2', coeff: 1 }], products: [{ id: 'NaCl', coeff: 2 }], condition: { ignited: true, gas: 'Cl2' }, rate: RATE.special },
  // 2Fe + 3Cl2 --点燃--> 2FeCl3（棕烟；纯 Cl2 气室无需 O2）
  { type: 'special', reactants: [{ id: 'Fe', coeff: 2 }, { id: 'Cl2', coeff: 3 }], products: [{ id: 'FeCl3', coeff: 2 }], condition: { ignited: true, gas: 'Cl2' }, rate: RATE.special },
  // Cu + Cl2 --点燃--> CuCl2（棕黄烟；纯 Cl2 气室无需 O2）
  { type: 'special', reactants: [{ id: 'Cu', coeff: 1 }, { id: 'Cl2', coeff: 1 }], products: [{ id: 'CuCl2', coeff: 1 }], condition: { ignited: true, gas: 'Cl2' }, rate: RATE.special },
];

// ---- 碱吸收酸性气体（气体在含碱容器中产生/大气被碱吸收时发生）----
export const ACID_GAS_RULES = [
  { gas: 'CO2', base: 'NaOH', baseCoeff: 2, products: [{ id: 'Na2CO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'CO2', base: 'Ca(OH)2', baseCoeff: 1, products: [{ id: 'CaCO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'CO2', base: 'KOH', baseCoeff: 2, products: [{ id: 'K2CO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'SO2', base: 'NaOH', baseCoeff: 2, products: [{ id: 'Na2SO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'SO2', base: 'Ca(OH)2', baseCoeff: 1, products: [{ id: 'CaSO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'SO2', base: 'KOH', baseCoeff: 2, products: [{ id: 'K2SO3', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  // Cl2 尾气处理（有毒）：Cl2 + 2NaOH → NaCl + NaClO + H2O
  { gas: 'Cl2', base: 'NaOH', baseCoeff: 2, products: [{ id: 'NaCl', coeff: 1 }, { id: 'NaClO', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  { gas: 'Cl2', base: 'KOH', baseCoeff: 2, products: [{ id: 'KCl', coeff: 1 }, { id: 'KClO', coeff: 1 }, { id: 'H2O', coeff: 1 }] },
  // 2Cl2 + 2Ca(OH)2 → Ca(ClO)2 + CaCl2 + 2H2O（漂白粉；按每 mol Cl2 配 1 mol Ca(OH)2、0.5 mol 产物）
  { gas: 'Cl2', base: 'Ca(OH)2', baseCoeff: 1, products: [{ id: 'Ca(ClO)2', coeff: 0.5 }, { id: 'CaCl2', coeff: 0.5 }, { id: 'H2O', coeff: 1 }] },
  // H2S 尾气：H2S + 2NaOH → Na2S + 2H2O；H2S + Ca(OH)2 → CaS + 2H2O
  { gas: 'H2S', base: 'NaOH', baseCoeff: 2, products: [{ id: 'Na2S', coeff: 1 }, { id: 'H2O', coeff: 2 }] },
  { gas: 'H2S', base: 'KOH', baseCoeff: 2, products: [{ id: 'K2S', coeff: 1 }, { id: 'H2O', coeff: 2 }] },
  { gas: 'H2S', base: 'Ca(OH)2', baseCoeff: 1, products: [{ id: 'CaS', coeff: 1 }, { id: 'H2O', coeff: 2 }] },
  // CO2 被氨水吸收：CO2 + NH3·H2O → NH4HCO3
  { gas: 'CO2', base: 'NH3·H2O', baseCoeff: 1, products: [{ id: 'NH4HCO3', coeff: 1 }] },
  // NH3 被酸吸收：baseCoeff = 每 mol 气体需要的**酸分子** mol（NH3:H2SO4 = 2:1）
  { gas: 'NH3', base: 'HCl', baseCoeff: 1, products: [{ id: 'NH4Cl', coeff: 1 }] },
  { gas: 'NH3', base: 'H2SO4', baseCoeff: 0.5, products: [{ id: '(NH4)2SO4', coeff: 1 }] },
];

export function acidGasRuleFor(gas, base) {
  for (const r of ACID_GAS_RULES) {
    if (r.gas === gas && r.base === base) return r;
  }
  return null;
}

// ---- 气体溶于水（CO2→H2CO3、SO2→H2SO3、SO3→H2SO4、NO2 歧化、氨水、Cl2 氯水）----
// 质量/计量严格按方程式：
//   CO2+H2O→H2CO3、SO2+H2O→H2SO3、SO3+H2O→H2SO4、NH3+H2O→NH3·H2O；
//   3NO2+H2O→2HNO3+NO；Cl2+H2O→HCl+HClO。
// water：每 mol 气体消耗的水 mol；products：按 mol 系数。
// （旧字段 acid/byGas 仍保留兼容，但引擎优先用 products。）
export const GAS_WATER_RULES = [
  { gas: 'CO2', water: 1, products: [{ id: 'H2CO3', coeff: 1 }], acid: 'H2CO3' },
  { gas: 'SO2', water: 1, products: [{ id: 'H2SO3', coeff: 1 }], acid: 'H2SO3' },
  { gas: 'SO3', water: 1, products: [{ id: 'H2SO4', coeff: 1 }], acid: 'H2SO4' },
  { gas: 'NO2', water: 1, products: [{ id: 'HNO3', coeff: 2 }, { id: 'NO', coeff: 1 }], acid: 'HNO3', byGas: 'NO' },
  { gas: 'NH3', water: 1, products: [{ id: 'NH3·H2O', coeff: 1 }], acid: 'NH3·H2O' },
  // H2S 不自动做"气体→氢硫酸"吸收：FeS 等硫化物遇酸会再生 H2S 气体，
  // 再被水吸回去会形成 H2S(g)↔H2S(aq) 的鬼畜循环。需要氢硫酸时请在编辑器
  // 直接放 H2S(aq) 溶质；H2S 气体仍按大气规则参与反应。
  { gas: 'HCl(g)', water: 0, products: [{ id: 'HCl', coeff: 1 }], acid: 'HCl' }, // 氯化氢气体溶于水 → 盐酸
  { gas: 'Cl2', water: 1, products: [{ id: 'HCl', coeff: 1 }, { id: 'HClO', coeff: 1 }], acid: 'Cl2' }, // 氯水（HCl+HClO）
];

// ---- 大气可燃气体：不设"缓慢燃烧"----
// 酒精灯/喷灯只是点火源与加热源，其火焰不消耗大气 O2、不产生 CO2。
// 可燃气体（H2/CO/CH4/H2S）遇点燃源只有两种结局：积累到爆炸下限 → 爆鸣；
// 浓度不足 → 不反应（气体留在大气里，玩家可通过气泡柱标签观察）。
// 补：低浓度点燃时的缓慢燃烧（不触发爆鸣的残余气体），按方程式守恒。
export const ATMOSPHERE_COMBUSTION_RULES = [
  { type: 'combustion', reactants: [{ id: 'H2', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'H2O', coeff: 2 }], condition: 'ignited', rate: RATE.gasCombustion * 0.2 },
  { type: 'combustion', reactants: [{ id: 'CO', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'CO2', coeff: 2 }], condition: 'ignited', rate: RATE.gasCombustion * 0.2 },
  { type: 'combustion', reactants: [{ id: 'CH4', coeff: 1 }, { id: 'O2', coeff: 2 }], products: [{ id: 'CO2', coeff: 1 }, { id: 'H2O', coeff: 2 }], condition: 'ignited', rate: RATE.gasCombustion * 0.2 },
  { type: 'combustion', reactants: [{ id: 'H2S', coeff: 2 }, { id: 'O2', coeff: 3 }], products: [{ id: 'SO2', coeff: 2 }, { id: 'H2O', coeff: 2 }], condition: { ignited: true, o2: 'high' }, rate: RATE.gasCombustion * 0.2 },
  { type: 'combustion', reactants: [{ id: 'H2S', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'S', coeff: 2 }, { id: 'H2O', coeff: 2 }], condition: { ignited: true, o2: 'low' }, rate: RATE.gasCombustion * 0.2 },
];

// ---- 大气特殊反应：合成氨、氨催化氧化 ----
export const ATMOSPHERE_SPECIAL_RULES = [
  // N2 + 3H2 ⇌ 2NH3（工业合成氨：高温高压催化剂，游戏简化为高温）
  { type: 'special', reactants: [{ id: 'N2', coeff: 1 }, { id: 'H2', coeff: 3 }], products: [{ id: 'NH3', coeff: 2 }], condition: 'highTemp', rate: RATE.special * 0.3 },
  // 4NH3 + 5O2 --催化剂△--> 4NO + 6H2O（氨催化氧化）
  { type: 'special', reactants: [{ id: 'NH3', coeff: 4 }, { id: 'O2', coeff: 5 }], products: [{ id: 'NO', coeff: 4 }, { id: 'H2O', coeff: 6 }], condition: 'ignited', rate: RATE.special * 0.5 },
  // 2NO + O2 → 2NO2（无色 NO 遇空气氧化成红棕 NO₂；慢速便于观察"无色→红棕"）
  { type: 'special', reactants: [{ id: 'NO', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'NO2', coeff: 2 }], condition: 'normal', rate: RATE.special * 0.05 },
  // 2H2S + SO2 → 3S + 2H2O（气相归中，常温缓慢）
  { type: 'special', reactants: [{ id: 'H2S', coeff: 2 }, { id: 'SO2', coeff: 1 }], products: [{ id: 'S', coeff: 3 }, { id: 'H2O', coeff: 2 }], condition: 'normal', rate: RATE.special * 0.05 },
  // 2NH3 + 3Cl2 → N2 + 6HCl(g)（氯气与氨气在气相归中；氨过量时生成的 HCl 继续
  // 与 NH3 生成 NH4Cl 白烟，见 reactAtmosphere 的白烟步骤）
  // 注：由 engine.reactAtmosphere 直接处理（气相直接写入大气，不经过产气柱/吸收管线），
  // 避免 _runRule 的产气钩子把 HCl 截留成气泡柱后无法与 NH3 继续生成白烟。
  // ---- H2S + Cl2 → S + 2HCl(g)（硫化氢被氯气氧化；产物是氯化氢气体）
  { type: 'special', reactants: [{ id: 'H2S', coeff: 1 }, { id: 'Cl2', coeff: 1 }], products: [{ id: 'S', coeff: 1 }, { id: 'HCl(g)', coeff: 2 }], condition: 'normal', rate: RATE.special * 0.2 },
  // H2 + Cl2 --光照--> 2HCl(g)（氢气在氯气中燃烧/光照爆鸣）
  { type: 'special', reactants: [{ id: 'H2', coeff: 1 }, { id: 'Cl2', coeff: 1 }], products: [{ id: 'HCl(g)', coeff: 2 }], condition: { light: true }, rate: RATE.special },
  // 2SO2 + O2 ⇌ 2SO3（催化氧化；游戏用高温近似）
  { type: 'special', reactants: [{ id: 'SO2', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'SO3', coeff: 2 }], condition: 'highTemp', rate: RATE.special * 0.2 },
];
