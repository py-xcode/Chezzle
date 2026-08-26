// ============================================================================
// Chezzle 选关系统配置（元素周期表）
// 用法：<script src="levels/levels.js"></script> → window.CHEZZLE_LEVELS
// 这是纯 JSON 结构的数据文件（为兼容 file:// 直接双击打开，用 JS 常量承载）。
// 编辑这里即可绑定/解锁关卡，无需改代码：
//   - levels:    元素符号 → 同位素关卡列表（每个同位素 = 独立一关，同格多关）
//                没有 file 的条目 = 关联卡还没写（弹窗里显示"未编写"，单元格不算有关卡）
//   - rare:      稀有关卡元素（浅蓝辉光；难度显著提升；列表可自行增删）
//   - unlocks:   通关 X → 解锁列表里的所有关（XB 可解锁多关）
//   - tutorial:  周期表"图例位"的新手引导关卡（始终可玩）
// 同位素越重（mass 越大）越难——弹窗里按质量从小到大排，难度随名次递增。
// ============================================================================
window.CHEZZLE_LEVELS = {
  version: 1,

  tutorial: { id: 'tutorial', name: '新手引导', file: 'levels/tutorial.html' },

  // 稀有关卡元素：惰性气体 + 稀土（镧/锕系）+ 贵金属（浅蓝辉光）
  rare: [
    'He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og',
    'Sc', 'Y', 'Ru', 'Rh', 'Pd', 'Ag', 'Os', 'Ir', 'Pt', 'Au',
    'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
    'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
  ],

  levels: {
    H: [
      { id: 'H-1', name: '氕', mass: 1, file: 'levels/level1-1.html' },
      { id: 'H-2', name: '氘', mass: 2 },
      { id: 'H-3', name: '氚', mass: 3 },
    ],
    He: [
      { id: 'He-1', name: '氦-4', mass: 4, file: 'levels/level2-1.html' },
    ],
    C: [
      { id: 'C-1', name: '碳-12', mass: 12 },
    ],
    O: [
      { id: 'O-1', name: '氧-16', mass: 16 },
    ],
    Fe: [
      { id: 'Fe-1', name: '铁-56', mass: 56 },
    ],
    Cu: [
      { id: 'Cu-1', name: '铜-63', mass: 63 },
    ],
  },

  // 解锁链：一个关可解锁多个关；'tutorial' 是根（始终可玩）
  unlocks: {
    'tutorial': ['H-1'],
    'H-1': ['H-2', 'C-1'],
    'H-2': ['H-3'],
    'H-3': ['He-1'],
    'C-1': ['O-1'],
    'O-1': ['Fe-1'],
    'Fe-1': ['Cu-1'],
  },
};
