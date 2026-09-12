# Chezzle 玩法百科（源码现状版）

> 依据 D:\Program\Chezzle\src 源码逐文件核对整理（2026-08 快照）。  
> 说明：本文档按"当前代码实际行为"编写，包括其中可能不合理的数值/行为（问题清单见 docs/issues_table.md）。

## 0. 游戏概览
Chezzle 是纯 HTML5 2D 化学解谜游戏（无后端）。核心库为 src/（打包出 dist/chezzle.js），
关卡由 level editor（tools/leveleditor.html）生成独立 HTML（levels/*.html）。
玩法：控制一位"化学人"（默认物质 NaOH 30g，血量=核心物质剩余质量），在神殿风关卡里
搬运/倾倒/加热/反应，用产物开启机关（化学开关/压力开关/钥匙/气体探测器），最终走进
打开的门（Door）通关。支持多场景章节（Multiscene）与插件（plugin/*.js）。

每 tick（固定 30Hz）流程：玩家输入 → 物体 update → 点按管线 → 网格同步 → 物理 → lateUpdate
→ 接触事件 → 容器包含 → 化学反应（自反应→接触对→容器内→灯上→溶解→大气）→ 网格同步
→ 状态判定（死亡/通关）。

## 1. 物理与数值（CFG，src/core/config.js）
| 参数 | 值 | 备注 |
|---|---|---|
| worldW/worldH | 1000×800 px | 默认 |
| tickRate | 30 Hz | 固定步长 dt=1/30 |
| gravity | 1200 px/s² | |
| groundFriction / airFriction | 8/s、3/s（仅水平） | 爆炸后不永久滑行 |
| iceFriction | 0.35/s | 冰面 |
| ice.controlAccel / slipAccel / slipMax | 3.2/s、16px/s²、55px/s | 冰面控制与沉淀滑走 |
| player.moveSpeed / jumpVel / autoStepMax | 220px/s、520px/s、14px | |
| player.defaultSubstance / defaultMass | NaOH / 30g | 玩家默认 |
| cellSize / cellMass | 5px / 0.1g | 网格量子 |
| maxParticleMass / stackMaxMass / maxSpawnParticles | 0.5g / 1.5g / 600 | 粒子堆叠 |
| placeAmount / collectRadius | 0.5g/次 / 70px | |
| item.collectRange / liquidRange / dragRange / dragSlack | 90 / 80 / 480 / 14 px | 边距式距离 |
| item.beakerCapacity / beakerTransfer / pourStep | 200g / 20g/次 / 10g/次 | |
| item.dropperCapacity / dropperTransfer | 50g / 5g/次 | |
| item.bottleCapacity / gasRate | 5g / 0.05g/s | |
| item.dragStartPx / dripArmDelay / dripPeriod / dragAbortPx / suckPeriod | 6px / 0.5s / 0.08s / 10px / 0.3s | 点击-长按-拖动状态机 |
| lamp.range / lightRange / placeLampRange | 70 / 180 / 120 px | |
| inventory.slots / capacity / slotPx / itemSlotPx | 5 / 100g / 56 / 70 | |
| touch.* | 摇杆 R=122，dead 0.32/0.15/0.14，按钮 68px，视野 440–1040 | |
| doorWinRadius / worldMargin | 80px / 200px | 通关半径 / 出界 |
| particleSize / RefMass / Min / Max | 5px / 0.5g / 3px / 7.5px | 尺寸公式见 §2.4 |

### 1.1 碰撞（physics/collision.js）
- 分轴小步长解算；X/Y 单步上限约 32px/子步（模块常量），防高速穿薄墙。
- 残余重叠 4 面 MTV：每次单轴推出 ≤ MAX_RESOLVE_X/Y=16px，深嵌分帧温柔推出。
- 垂直接触判定阈值 STEP_MAX=32px；自动上台阶 autoStepMax=14px。
- 沉淀粒子"软体"：与实体残余重叠一律粒子让位；落地静止（|v|<40、onGround）的 placed
  粒子可垫脚（supportsStanding），下落中粒子不托人（防左脚踩右脚上天）。
- 玩家踢开可推沉淀：水平软让位 ≤45px/s；|vel.y|>100 才 kickParticle（150px/s）。
- 推挤链 tryPushX：深度递归、单步移动、被挡整体还原；被推物块遇可推粒子让粒子让位。
- ContactTracker：48px 空间哈希 + body id 有序 pair 键，产出 begun/ended 边沿事件。
- 冰面落地：body._groundIce=true，粒子首落冰随机 _iceDir；冰面颗粒不垂直堆叠（平摊）。

### 1.2 支撑（physics/support.js）
- shallowestSupportY：只找"水平重叠 + 底部下方 ±2px~+span(40px)"的实心顶面，取最高
  （y 最小）；排除自身子体与软体粒子。
- settleBodyOnSupport：重力累加 ≤400px/s² 上限 400px/s，贴合容差 0.25px。
- pushContainers（Player.update 内调用）：推动烧杯/集气瓶满速；松手后随玩家速度滑行
  （|v|<8 或反向 → 停）。

## 2. 玩家/物体系统
### 2.1 玩家（objects/player.js）
- 网格造型：默认 30g→(mass/0.1)=300 格 → 约 85×90px 矩形；显式 w/h（编辑器像素模式）
  按像素建格、血量=网格真实总质量。
- update：速度设定（石地直接设速；冰面按 controlAccel 趋近）→ 跳跃（onGround 才可）→
  按下触发 tryPlace/tryCollect → grab(拾取/吸液)/use(倒出/通气) → onGround 且 |v|>50 时
  shedShell 摩擦脱落 → absorbCore 接触同类补血（0.5g/s）。
- 表面脱落（shedShell）：SHED_MIN=0.01g/格、SHED_BURST=2g 才吐一簇；单格速率
  rate = shedCoeffOf(id)×min(1, mass/0.1)，shedCoeffOf 默认可溶 0.005、不溶 0.001 g/格/s
  （注释写 0.01/0.005 且 SHED_BURST=0.5g——与实现不符，见问题表 B2）。
- absorbCore：粒子按 origin.kind=place 排除（自己放置的不吸回）；物块经 contactPairs
  取双方中带 grid 的一方。
- tryPlace：放置 0.5g。优先找附近灯（placeLampRange=120）→ containerUnderFeet →
  snapNearFeet（池/开关/灯，水平 120px 内吸附）；落进容器/灯（depositAt 记录最近落点）。
  可溶物进真溶液；否则 addPrecipitate。地面放置拆成 0.25g×2 细颗粒（冰面 spread=20 摊开，
  并即时标记 _groundIce 防连放搭高）。
- 物品栏 5 格，容量 100g/格；跨格收集：先满同物质格再占空格；物品格不堆叠不混装。
  place() 按 amount 扣、清空；Shift 放物品走 placeCarriedItem。
- 死亡判定：hp≤0（lastRxAcid/Base 定 acid/base/reaction + partner）或出界（上=sky，下=void）。
  deathCause 一次性定案（deathQuip 随机文案不每帧闪）。

### 2.2 物品交互（level/items.js + objects/dropper.js,beaker.js,gasbottle.js）
- C 拾取：选中格须为空；收最近可携带物品（noCarry 除外），连带内容物（removeItem 含子体）。
- C 吸液（烧杯 20g/次，同比例样品 takeSample；容量满拒绝）；滴管 5g/次，只装一种液体
  （占优溶质，纯水→H2O；已装别液拒绝续吸）。
- X 倒出（烧杯）：每次 10g 样品到最近目标（烧杯有 volume-totalMass 余量上限，池敞开）。
- X 按住（集气瓶）：0.05g/s 通入最近有水容器（forceDissolve 溶解 CO2/SO2/NO2/Cl2）。
- C 按住（集气瓶）：截留最近气泡柱产气（容量 5g 封顶；超过自动进大气）。
- 滴管：点胶头（上半 12px）=滴一滴 0.5g；长按 ≥0.5s 觉醒：液下→每 0.3s 吸一手，
  液上→每 0.08s 持续滴；拖动（胶头/玻璃段均可）移动管身（无碰撞箱，rx/ry 指数趋近平滑）；
  拖出 480px 边界被钳制。
- 烧杯倒出会话动画：平移 0.16s → 起倾 0.14s → 最大倾角 0.52rad（≈30°）→ 松手 0.45s 后
  0.22s 回位；同一目标续倒不重跑位移（POUR_HOLD_MAX=0.45s 续期）。
- 放置占位探测 spotBlocked（收缩 3px 容差）：实体/可携带物品/实心放置粒子挡路；被挡向
  前×1/×2、向后×1/×2 探测；仍堵兜底放玩家正下方（x=player.x，见问题表 B11 潜在）。

### 2.3 容器（objects/container.js, pool.js, beaker.js, lamp.js）
- Solution：固定 volume（容器默认 100mL；编辑器烧杯常用 200）；溶质 Map + water；
  MIN_ENTRY=1e-4 记账；微溶溶解度 1.0× 饱和段溶液浑浊、1.25×（overMass）开始析出
  （onOversaturate → addPrecipitate）。
- 沉淀真相 precipitates Map + 视觉颗粒 grains（GRAIN_MAX=140 颗；0.5g/颗，超限按 1.5g
  合并；particleSizeOf 同自由粒子）。颗粒物理：重力 900px/s²、落速上限 320、位置修正每帧
  ≤8px、6 次迭代、入睡 0.2s 静止（SLEEP_SPEED=18）→ 不可动锚点可搭堆；支撑丢失唤醒。
  玩家交互：垫脚/挡路阻力 _grainResist=Σpen×0.004（≤0.9/tick）。spillSides（灯）允许
  颗粒堆满后向两侧滚落。
- 容器包含 updateContainment：每 tick 重算 obj._container（取第一个 containsObj 的容器）；
  containsObj 用 innerRect 相交。烧杯含玩家有互带逻辑（lateUpdate：水平杯随人、竖直人随杯，
  下行裁剪防嵌地；不做帽子跟随）。
- Pool 盆壁 8px 静态 Floor 子体；innerRect 扣除壁；gasHeight 默认 80 控制气泡柱高。
- Lamp/BlastLamp：lit 火焰淡入 k=11 / 熄灭 k=4.5；flameY() = h<20 ? y-16 : y+h-30；
  range=70 加热、lightRange=180 光照（见光分解 HClO）；喷灯 highTemp=true。焰色反应按
  暴露质量加权平均 RGB；plateCapacity ≈ (w*h)/36*0.2 g。Lamp 无液体（water=0,volume=0）防
  干台被弄湿。
- Switch：chemical 模式（开启物质 >0 即开，consumeRate 扣沉淀）/ pressure 模式（脚底 y-12
  ~ y+h+4 内有动态实心即开，玩家/物块，粒子不算）/ GasDetector 子类（_reactGas 累计产气
  量 > threshold——是"累计生产目标"而非当前浓度，HUD 显示 "H2 > 0.5g" 式目标）。
  输出按 effectiveOpen（"&"联锁双方都开）边沿 fire onOpen/onClose；开启瞬间执行 deleteId /
  showId / igniteId / extinguishId / openId 接线。
- Key = Switch 不消耗；Door 默认 30×80，open() 置 isOpen，玩家在 80px 内通关。
- Portal：40×64 默认；同 group（或旧数据同色）配对；单/双场景；进入传送 → 对侧找落点
  （8px 细步、先 strict 后宽松；脚底对齐门底）；_portalLast 防同门连传；usesLeft 整组共享
  n 次预算，用尽整组消失；switchId 绑定开关控制启停；跨场景只搬玩家（spawn + switchTo）。
- Extractor：rate=0.25g/s（默认）提取池内 state==solid 物质；0.1g 累积一个粒子；
  switchId 空=压力式（站上即提取，判定同压力开关）。
- Deposit 沉淀堆：开局首帧 materialize 成真实粒子（origin.kind=level），自身变壳移除
  （byId 保留，供开关引用）。

### 2.4 粒子（objects/particle.js）
- particleSizeOf(amount)：k=log(1.5)/log(3)≈0.369，size=5·(amount/0.5)^k 夹在 [3,7.5]px。
- splitPile(mass, maxN=600)：常规 0.5g/颗；颗数 >600 按 1.5g 堆叠颗分配；保底 1 颗。
- Particle 物理：默认 0.5g/5px；不实心（除非 placed）不与动态体碰撞、与静态体碰撞；
  placed=true 可垫脚/可被踢开/不可移动（除重收集）；collectible=!isSoluble。

## 3. 化学引擎（chem/）
### 3.1 反应分层与顺序
reactSelf（每物）：关卡自定义 L0 → 加热分解(THERMAL) → 催化制氧(CATALYTIC) → 自发分解
(AUTO_DECOMP) → 燃烧(COMBUSTION, 仅固体物) → 固-固还原(SOLID_REDUCTION) → 气态还原
(GAS_REDUCTION) → 同材料氧化还原 → Na2O2/碳酸盐大气 CO2 特例 → 同材料特例对 → 同材料
离子(_tryIonic(mat,mat)) → 金属与非金属化合 → 溶解（Scene 层延后统一跑）→ 固体表面被
大气酸性气体碳化 → 容器水吸收大气气体。
reactPair（两物）：L0 自定义 → 非全固时 REDOX → IONIC → 金属置换 → SPECIAL_PAIR →
SOLID_REDUCTION（固固）。
大气：可燃气体(H2/CO/CH4/H2S)总量占比 > LEL=0.0008 且 ≥4g 且有点燃源与 O2>5% → 爆炸
（strength=6+fuel×12，消耗全部燃料 + O2 2.5×燃料）；否则点燃源下走 ATMOSPHERE_SPECIAL
（N2+3H2→2NH3 高温；NH3 催化氧化；2NO+O2→2NO2 常速×0.05）与 NH3+HCl 白烟。
### 3.2 速率基准（RATE）
ionic 24 / displace 12 / redox 3 / thermal 5 / catalytic 5 / combustion 5 / reduction 5 /
autoDecomp 300 / acidGas 24 / dissolution 10 / gasCombustion 12 / special 8 / custom 8（g/s 基准）。
相态因子 phaseFactor：液液 1.0、含气/含液 0.5、固固 0.1。
金属+酸（H+ 氧化剂）redox×8；H2O2 作还原剂 ×4。
### 3.3 关键反应示例（rules.js）
- 热分解：Cu(OH)2→CuO+H2O(heat)；CaCO3→CaO+CO2(highTemp)；NH4Cl→NH3+HCl(heat)；
  2NaHCO3→Na2CO3+H2O+CO2(heat)；4HNO3→4NO2+O2+2H2O(heat,×0.3)。
- 催化：2H2O2--MnO2-->2H2O+O2；2KMnO4--heat-->K2MnO4+MnO2+O2；2KClO3 规则只有
  catalyst:MnO2（注释写"加热/MnO2"，缺 heat 条件——见问题表 B7）。
- 燃烧（ignited + O2>0.05）：C/S/P、Mg/Al(火星)、Fe(×0.003 慢锈→Fe2O3)、Cu(×0.15→CuO)、
  Na(常温慢→Na2O ×0.2 / 点燃→Na2O2)、K、Mg3N2（氮气）、Mg+CO2、CH4、C2H5OH、H2S 高低氧分支、
  C 高低氧分支（CO/CO2）。酒精灯火焰本身不耗大气 O2。
- 自发分解：H2CO3→CO2(300)；2HClO--light-->2HCl+O2(×0.05)；4Fe(OH)2+O2+2H2O→4Fe(OH)3(×0.01)。
- 制气特例：MnO2+4HCl 浓+加热→Cl2；2KMnO4+16HCl→2KCl+2MnCl2+5Cl2+8H2O（不要求浓）；
  NaClO+2HCl→NaCl+Cl2+H2O；NH4Cl+Ca(OH)2 heat→NH3；活泼金属+水（Na/K 爆炸、Li 不爆）；
  Na2O2+H2O 爆炸放 O2；铝热 Al+Fe2O3 highTemp 爆炸 ×3；3Fe+4H2O highTemp→Fe3O4+4H2；
  C+H2O highTemp→CO+H2；HCl+HClO→Cl2+H2O（归中）。
- 两性：Al(OH)3/Cr(OH)3+NaOH；Al2O3/SiO2+NaOH（需溶液介质）。
- 检验/显色：Fe3++3SCN-→Fe(SCN)3 血红（显色驱动）；BaCrO4/PbCrO4/SrCrO4/Ag2CrO4 铬酸盐
  沉淀；Ca(OH)2 与 CO2（先白后清，经 Ca(HCO3)2 特例）。
### 3.4 氧化还原（redox.js）
- 数据驱动 OXIDIZERS/REDUCERS + balanceRedox 自动配平：电子守恒 → 介质离子 → 氧守恒 →
  氢校验；旁观离子配盐（cMap×aMap 贪心）。任一步失败返回 null=组合不成立。
- 介质分支：KMnO4 酸(→Mn2+)/中(→MnO2)/碱(→MnO4^2-)；HNO3 浓(→NO2,≥300g/L)/稀(→NO)；
  K2Cr2O7 酸(→Cr3+)；H2O2 酸/碱分支；O2 酸→H2O、碱/中→OH-。
- 强度：STRONG_OXIDIZER=9。Fe 弱/强→Fe2+/Fe3+；Fe+HNO3 按 nHNO3/nFe≥4 定 Fe3+。
- 候选排序：score=ox.strength×100+还原性系数（REDOX_REDUCIBILITY），强氧化剂优先消耗
  共享还原剂。REDOX_REDUCIBILITY 表里 'H2' 键出现两次（问题表 B5）。
- 钝化：浓 H2SO4（≥400g/L 且加热）才氧化；Fe/Al 常温浓 HNO3 钝化（加热后反应）。
- 还原剂：金属 Cu/Zn/Mg/Al/Na/K/Li、FeSO4/FeCl2、SO2/H2SO3/Na2SO3/H2S/FeS、KI/NaI/KBr/
  NaBr、草酸、乙醇、CO、H2、H2O2、K2MnO4。碳 C 不进 REDOX（走燃烧/固还原规则）。
### 3.5 溶液与离子（solution.js, substances.js）
- pH：强电解质全电离、弱电解质 2% 电离；体积 0 → 7；酸碱同存取优势方。
- takeSample 同比例取样/合并（烧杯搬运介质）；MIN_ENTRY=1e-4；LIMIT_MASS=0.05（引擎离子
  限速：低于它按浓度因子限速，防"有→无"来回翻转）。
- 溶解度规则（solubilityOf）：硝酸盐全溶、碱金属/铵盐全溶、卤化银不溶、BaSO4 不溶、
  碳酸/亚硫酸/硫化物大多不溶、CrO4 的 Ba/Pb/Sr/Ag 不溶、OH- 仅 Na/K/Ba/Ca 溶等；
  微溶清单（solubilityLimit g/L）：Ca(OH)2=12、CaSO4=10、Ag2SO4=20、PbCl2=20。
- 指示剂：石蕊 [0 红, 5 紫, 8 蓝]；酚酞 [0 无色, 8.2 浅红, 10 深红]（transparent）。
- 有色离子 ION_COLORS 及其 sat（Cu2+ 150、Fe3+ 250、Fe2+ 150、MnO4- 60、MnO4^2- 40、
  Cr2O7^2- 80、CrO4^2- 80、Cr3+ 100、S2- 100 等）。
- 浓酸阈值 CONC_HIGH=300g/L；钝化 PASSIVATION_CONC=400g/L；acidLabelOf 无体积（干台）返回"浓"。
- 金属活动性 activity（小=活泼）：K1 Li2 Na3 Mg4 Al5 Zn6 Fe7 Sn8 Pb9 (H10) Cu11 Ag13。
### 3.6 大气（atmosphere.js）
- totalAir 默认 2000g、初始 N2 80%/O2 20%；composition 按实时总量；add/setGas/remove；
  preset() 先清空再设置（空表=不动）。_cause 气体变化溯源、flushLog 供调试面板。
- _baseTotal 字段赋值后从未读取（问题表 B6）。
### 3.7 产物路由（engine.js _emit / Scene.routeProduct）
- 气体：onGas 截留（集气瓶）→ 碱吸收（acidGasRuleFor，24×dt）→ 水溶（CO2/SO2/NO2/Cl2
  仅 forceDissolve 才主动溶；NH3/SO3 常溶）→ 进大气。
- 水只进真溶液容器；干台/开阔地蒸发不建模。
- 固体：玩家参与→可溶产物（非核心）进溶液、核心回附着（回血）、不溶附着；粉末参与→沉淀；
  有固反应物→原地转化优先（addInPlace→盈余 growExposed）；Cu(OH)2 一律成核沉淀；
  附着落空→静默丢弃（不撒游离粒子）。
- 离子双置换驱动力：沉淀/微溶/水/CO2/SO2/H2S/H2SiO3/NH3/Fe(SCN)3；产物盐等于原反应物不驱动。

## 4. 关卡/系统（level/*, core/*）
- Builder DSL：.floor/.pool/.block/.deposit/.player/.switch/.key/.door/.lamp/.beaker/.rope/
  .gasColumn/.sign/.portal/.gasDetector/.extractor/.dropper/.gasBottle/.customReaction/
  .pluginObj/.setTip/.tips/.on/.debugmode(废弃空操作)…build()/start()。
- 初始隐藏：hidden 物体只进 byId+hidden；reveal()/showId 恢复；applyAppearDelays：
  appearDelay>0 开局隐藏 → wait 到时 reveal（淡入 appearFade 默认 0.35s）。
- 提示系统：tips=[{text, when:{mode:and/any, items:[pos/inv/seq]}}]，不自动弹，每 tick
  求值 tipReady（最后一条满足优先），点按钮 showNextTip 展示并 tipSeq++。
- scene.wait/after/interval/onTick 基于游戏时间（暂停即停）；wait 负数钳 0；
  interval 无循环护栏（回调改 scene.time 会死循环——问题表 B8）。
- 通关：任一 open Door 与玩家中心距 ≤80px；死亡：hp≤0 或出界 ±200px。
- 键盘：A/D 左右、Space 跳、Shift 放置、Q 收集、C 拾取/吸液/按住集气、X 倒出/按住通气、
  R 重开（整页 reload）、V 鸟瞰；调试 F5 暂停 / F6 步进。
- Multiscene：多场景共享主循环；switchTo 默认 carryPlayer（搬玩家对象，保留背包/血量；
  目标场景摆放玩家=落点并替换占位玩家）；场景画布叠放、display 切换。

## 5. 渲染
- Renderer.frame：清屏 → 背景 → 相机变换 → 对象（粒子最后逐颗画）→ flushLabels → HUD。
- 淡入：appearTime 启动全局 alpha=a/fade。
- 溶液色：有色离子按 g/L÷sat 加权平均；指示剂按 pH 渐变；微溶浑浊在 1.0×~1.25× 饱和段。
- 主题色板 THEME（金/火/水/毒/传送/石）；rr/panel/glowText/clearText 工具。
- HUD：左上玩家信息卡（血量/物质/身体组成/大气），右上鸟瞰/全屏/提示按钮，右下物品栏
  5 格；死亡/通关神话遮罩；最近反应/悬停面板仅调试模式。
- 爆炸视觉：白热闪核→14 瓣火团→冲击环→拖尾火星（焰色）；R=(16+strength×2.4)×ease；
  寿命 0.5s；mulberry32 确定性随机。
- 已知画布状态栈问题：Sign.render 少一次 restore（问题表 B3）；explosion.hexA 未使用（B4）。

## 6. 关卡文件与工具
- level JSON/HTML：由编辑器生成 DSL（levels/*.html、level*.json）。
- 文档：CHEM_REFERENCE.md / TECH_DESIGN.md / docs/；测试 tests/*.test.js（node --test）；
  tools/build.mjs 打包 dist/chezzle.js。

## 7. 设计限制/简化速查
- 推挤不携带堆叠物块；下落速度钳制防穿墙；未覆盖的稀有反应自动跳过。
- 容器 volume 默认 100mL（编辑器烧杯常 200）；液面高度 = totalMass/volume。
- 气体探测器 = 累计产气目标（一次性），不是当前浓度开关。
- 反应日志只记玩家相关（或调试模式全记）；产物只剩水的反应不记日志。
