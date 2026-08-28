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

  // 可携带物品（集气瓶/烧杯/滴管）交互参数（距离一律为**边缘间隙**：贴边就算，宽池不显远）
  item: {
    collectRange: 90,      // C 拾取物品半径
    liquidRange: 80,       // C 吸液 / X 倒出 / 通入气体的目标容器距离
    dragRange: 480,        // 可拖动滴管的玩家最大距离（中心距离；用户反馈 130 太小 —— 扩大）
    dragSlack: 14,         // 回抓宽限：拖到边界后再抓，允许超出 dragRange 一点也能重新抓住
    beakerCapacity: 200,   // 标准烧杯容量（g；与编辑器烧杯默认 volume 一致）
    beakerTransfer: 20,    // 烧杯每次 C 吸液量（g）
    pourStep: 10,          // 烧杯每次 X 倒出量（g）——分次倒，不再一次全倒
    dropperCapacity: 50,   // 滴管容量（g）
    dropperTransfer: 5,    // 滴管每次 C 吸液量（g）
    bottleCapacity: 5,     // 集气瓶最大集气量（g）
    gasCollectRange: 100,  // 按住 C 集气：找最近气泡柱的距离
    gasRate: 0.05,         // 通入气体速率（g/s）
    placeOffset: 6,        // 放置物品离玩家边缘的间隙（px）
    dragStartPx: 6,        // 按住后移动超过该屏幕距离 → 判定为拖动（不滴）
    dripArmDelay: 0.5,     // 按住多久转"长按持续滴"/"液下吸取"（s；用户明确 >0.5s）——
                           // 留出拖动判定窗口，0.22s 太短，拖动常被误判成长按滴（用户反馈）
    dripPeriod: 0.08,      // 长按持续滴的节奏（s/滴；0fd5314 调定的手感值保留）
    dragAbortPx: 10,       // 长按已开滴后再移动超过该距离 → 停滴转为拖动
    suckPeriod: 0.3,       // 液下长按吸取的节奏（s/手 ≤ dropperTransfer g）
  },

  lampRange: 70, // px（灯提供加热/点燃的半径）
  lampLightRange: 180, // px（灯提供"光照"条件的半径——见光分解如 HClO）
  placeLampRange: 120, // px（放置沉淀到灯上的半径）
  inventory: { slots: 5, capacity: 100, slotPx: 56, itemSlotPx: 70 }, // 物品格在 HUD 中放大（装烧杯/滴管/集气瓶看得清）

  // 移动端（触屏/小屏；桌面 fine-pointer 完全不受影响）
  touch: {
    viewH: 560,    // 移动端相机视野高度基准（世界坐标；手机竖宽 ~390 时恰为此值）
    viewHRef: 390, // 视野基准对应的屏幕短边（px）——大屏平板按短边比例放大视野
    viewHMax: 1040, // 视野放大上限（世界坐标；平板也不会看到超出设计的范围）
    focusBias: 0.14, // 相机跟随偏置（视野高度比例）：视窗中心下移 → 玩家画面偏上，
                     // 不被左上面板/右下控件遮挡（移动端 HUD 压缩的配套）
    padTop: 0.14,  // 顶部探出（视野高度比例，双端）：玩家爬到世界顶时相机继续
                   // 上移探出世界顶边（上方是空天空），玩家不再被钉在屏幕顶缘、
                   // 也不被左上 HUD 卡片盖住上方环境
    hudAlpha: 0.78,  // 移动端左侧 HUD 卡片透明度（面板体；文字不降，保可读）
    hudTop: 48,    // 触屏端顶部 HUD（卡片/按钮）起始 y：让开"返回选关"悬浮钮
    hudTopFs: 92,  // 触屏端全屏时的顶部起始 y：再让开 iOS 系统全屏关闭按钮（左上）
    joyR: 122,     // 摇杆基座半径（px）
    joyDead: 0.22, // 摇杆死区（半径比例；死区内不触发任何方向）
    horizDead: 0.14, // 水平方向死区（半径比例：小幅下倾/抖动不会误触左右）
    btnSize: 68,   // 右下状态按钮边长（px）
    btnGap: 12,    // 按钮间距
    pad: 10,       // 控件到屏幕边距（安全区之外再留）
  },

  doorWinRadius: 80, // px
  worldMargin: 200, // px（出界判定）

  particleSize: 5, // px（沉淀粒子参考尺寸：0.5g 颗粒 = 5px 球）
  particleRefMass: 0.5, // g（粒子尺寸的参照质量）
  // 尺寸随质量缩放：**1.5g（堆叠 3 个 0.5g）时的尺寸 = 0.5g 颗粒的 1.5 倍（7.5px）**，
  // 幂次 log3(1.5)≈0.369（0.5g→5px、1.5g→7.5px 两个锚点精确匹配）；更小质量有下限 3px。
  particleMinSize: 3, // px
  particleMaxSize: 7.5, // px（= 0.5g 颗粒尺寸的 1.5 倍）
};
