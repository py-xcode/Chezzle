// ============================================================================
// 全局常量与调参（与 TECH_DESIGN.md §11 对应）
// ============================================================================

export const CFG = {
  worldW: 1000,
  worldH: 800,

  tickRate: 30, // 固定步长
  gravity: 1200, // px/s²
  groundFriction: 8, // 地面摩擦（1/s）：爆炸/踢飞后的物体不会永远滑行（物理核心默认 0，Scene 层开启）
  airFriction: 3, // 空气摩擦（1/s，仅水平）：空中/气泡柱上玩家不会无限漂移，仍保留爆炸冲击感

  player: {
    moveSpeed: 220, // px/s
    jumpVel: 520, // px/s（向上）
    autoStepMax: 14, // px，自动上台阶阈值
    defaultSubstance: 'NaOH',
    defaultMass: 30, // g（矩形玩家，约 85×90px）
  },

  cellSize: 5, // px
  cellMass: 0.1, // g（质量量子）
  maxParticleMass: 0.5, // g/颗（常规颗粒质量——最小的沉淀颗粒 0.5g）
  // 大堆（超过粒子数上限时）按"堆叠"分配：单颗粒最多堆 **3 个 0.5g 颗粒**（用户要求，
  // 假设本来可以堆叠 10 个 → 改成 3 个）。极端超大堆（>stackMaxMass×maxSpawnParticles
  // = 900g）仍合并以保质量守恒（性能上限，已与用户确认不需要再优化）。
  stackMaxMass: 1.5,
  maxSpawnParticles: 600, // 单次生成粒子数量上限（更大质量仍合并颗粒；已由空间哈希宽相位撑住邻域性能）

  placeAmount: 0.5, // g/次
  collectRadius: 70, // px

  lampRange: 70, // px（灯提供加热/点燃的半径）
  lampLightRange: 180, // px（灯提供"光照"条件的半径——见光分解如 HClO）
  placeLampRange: 120, // px（放置沉淀到灯上的半径）
  inventory: { slots: 5, capacity: 100 }, // g/格

  doorWinRadius: 80, // px
  worldMargin: 200, // px（出界判定）

  particleSize: 5, // px（沉淀粒子参考尺寸：0.5g 颗粒 = 5px 球）
  particleRefMass: 0.5, // g（粒子尺寸的参照质量）
  // 尺寸随质量缩放：**1.5g（堆叠 3 个 0.5g）时的尺寸 = 0.5g 颗粒的 1.5 倍（7.5px）**，
  // 幂次 log3(1.5)≈0.369（0.5g→5px、1.5g→7.5px 两个锚点精确匹配）；更小质量有下限 3px。
  particleMinSize: 3, // px
  particleMaxSize: 7.5, // px（= 0.5g 颗粒尺寸的 1.5 倍）
};
