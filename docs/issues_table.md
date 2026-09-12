# Chezzle 代码审查问题表（只收录已核实的发现）

> 审查对象：D:\Program\Chezzle\src 全部源码（另含 plugin/、tests/ 抽查）。  
> 方法：人工逐文件精读 + 针对性运行实验验证（同池离子反应速率、随机.Random 等）+
> grep 静态审计（save/restore 平衡、未用符号、重复键）。所有条目均经过代码引用核实；
> 子代理报告中的未证实/被证伪条目（deposit splice、粒子 NaN 等）未收录。  
> 未修改任何代码。严重度：高/中/低。

## Bug（行为异常 / 反直觉）

### B1 [chem/engine.js _tryIonic 同材料路径] 中 — 同池"双溶质离子反应"每 tick 双向重复执行，速率≈双倍
- 位置：engine.js 约 640-660（_tryIonic）+ reactSelf 调用链（scene.js stepChemistry 自反应循环）。
- 现象：reactSelf(mat, mat) 时 _tryIonic 对 matA.ids()×matB.ids() 双循环，同一无序对
  (X,Y) 会以 (X,Y) 与 (Y,X) 两种顺序各跑一次 _ionicOne，产物与消耗完全相同 → 一 tick 内
  反应执行两遍、日志/记账翻倍。
- 实验验证（node 直接驱动引擎，CaCl2 20g + NaOH 20g 同池 vs 分离两液接触）：
  1 tick 同池消耗 CaCl2 ≈ 1.835g，分离接触仅 ≈ 0.800g（约 2.3×，含取整）。
- 影响：同一容器里预先混好的两种溶质反应比"分开的两种材料接触"快约一倍（同池 600 tick
  与分离 600 tick 终点一致是因为反应物耗尽收敛；中间过程与限速体系不一致），调试日志
  也会出现双份（若日志未限频）。修正方向：同材料路径只取 idA<idB 单向，或 _ionicOne 加
  无序对去重。

### B2 [objects/player.js shedShell] 低 — 注释参数与实现不一致（可溶/不溶脱落系数、SHED_BURST）
- 位置：player.js:313-317 与 320-321 注释（可溶 0.01、不溶 0.005 g/格/s；SHED_BURST=0.5g），
  实际：substances.js:399-402 shedCoeffOf 返回 可溶 0.005 / 不溶 0.001；player.js:323
  SHED_BURST=2。
- 影响：后续按注释调参会得到与预期不符的手感；无运行时错误，属文档-代码漂移。
- 用户说明：此处以代码为准，修改注释。

### B3 [objects/sign.js render] 中 — ctx.save() 泄漏（save 2 次 / restore 1 次）
- 位置：sign.js:63 与 66 各 save 一次，仅 89 行 restore 一次，外层 save 永不配对。
- 影响：每个 Sign 每帧向 canvas 状态栈推入一层；Renderer.frame 的整体 restore 会把泄漏
  留在 HUD 之前的状态里，长会话/多路标场景状态栈持续增长，且字体/阴影设置可能泄漏给
  后续绘制（同一帧内先画 Sign 后画的物体会继承其 shadowBlur=6 与 fillStyle 直到被覆盖）。
- 修复方向：方法末尾补一次 ctx.restore()（首行 save 可直接删除）。

### B4 [chem/engine.js REDOX_REDUCIBILITY] 低 — 对象字面量重复键 'H2'
- 位置：engine.js 1186 与 1188 均有 'H2': 40（值相同，后者覆盖前者）。
- 影响：无行为差异，属重复定义/整理残留；若未来只改一处会造成两键打架（后者生效）。

### B5 [chem/atmosphere.js] 低 — _baseTotal 赋值后从未读取
- 位置：atmosphere.js:16 this._baseTotal = totalAir；全项目仅此一处出现。
- 影响：死字段（注释"预留可加基准惰性气体"从未落实）；total() 只按现有 gas 求和，
  若有人以为大气总质量至少 = totalAir 会误判。

### B6 [chem/rules.js CATALYTIC_RULES] 中 — KClO3 分解规则与注释不符（缺 heat 条件）
- 位置：rules.js 催化制氧段：注释 "2KClO3 --加热/MnO2--> 2KCl + 3O2↑"，代码 condition 仅
  { catalyst: 'MnO2' }（无需加热）；同表 2KMnO4 却要求 'heat'。
- 影响：MnO2 与 KClO3 一旦同处（无需火源/加热）即开始分解产氧——若属疏漏会导致
  "常温 KClO3+MnO2 自发制氧"的关卡外反应；若是有意简化请改注释。

### B8 [core/scene.js _runHooks interval] 低 — interval 的 while 循环无护栏
- 位置：scene.js 约 205-215：while (this.time >= t.next) { t.next += t.period; t.fn(); }
- 影响：回调内若修改 scene.time 或某定时器周期过小导致追赶不过，单帧可能死循环卡死；
  插件代码可写 scene.time 造成此情况。建议每帧最多补跑 N 次或改用 for。

### B9 [objects/player.js absorbCore] 低（潜在） — ?? 与 <= 混用的优先级隐患
- 位置：player.js:296：
  if (block.avail?.(this.substance) ?? block.grid.avail(this.substance) <= 1e-9) continue;
- 解析：avail?.(...) ?? (grid.avail(...) <= 1e-9)。当前 Block 类没有 avail 方法，
  恒走 grid.avail<=1e-9 分支，行为正确；但一旦某物块/对象实现了 avail()（返回数值），
  数值 truthy 时直接 continue（大量值被跳过）、0/极小值 falsy 反而继续——语义与注释
  意图相反，属"现在没炸、将来必炸"的脆弱写法。

### B10 [objects/gasbottle.js] 低 — 局部 hexToRgb 返回字段名 g2
- 位置：gasbottle.js 约 169-170（return { r, g2, b }，消费处 c.g2 一致）。
- 影响：无运行时错误；疑似复制粘贴残留命名（与项目其它 hexToRgb 返回 g 不一致），
  纯代码卫生。

### B11 [level/items.js placeCarriedItem] 低（潜在） — 兜底落点 = 玩家自身位置
- 位置：items.js 约 114-119：四向探测失败后 x = player.x（玩家左缘）放物品。
- 影响：落点与玩家重叠（spotBlocked 排除玩家自身故不报挡），由物理下一帧把物品/杯壁
  推出；若两侧贴墙且正下方被占的极端情况可能把物品挤进墙里或产生抖动。建议兜底改为
  "放弃放置并提示"或探测玩家两侧贴地空位。

### B12 [core/scene.js spawnParticles 调用链] 低（潜在） — 个别路径 point 可能为 null
- 位置：scene.js routeProduct 末尾 spawnParticles(..., ctx.point, ...) / scene.js 大气
  NH3+HCl 白烟 emit phase:'particle'。
- 说明：ctx.point 大多数场景非空（_reactionPoint 有兜底世界中心），但 _emitCtx 在
  场景无任何物体时可能为 null（如"无物体场景+大气反应"的边角），spawnParticles 会
  直接访问 point.x 抛 TypeError。低概率、建议防御。

## 死代码 / 错误代码

### D1 [objects/explosion.js] hexA 箭头函数定义后从未使用（全项目仅定义处 1 处）。
### D2 [chem/engine.js] REDOX_REDUCIBILITY 'H2' 重复键（见 B5）。
### D3 [chem/atmosphere.js] _baseTotal 死字段（见 B6）。
### D4 [level/builder.js debugmode()] 已标记 @deprecated 的空操作兼容壳（注释明确"不再生效"），
   保留仅为旧关卡链式调用不报错——建议在下一个破坏性版本移除并在 CHANGELOG 注明。
### D5 [objects/particle.js hoverLabel] 与渲染无关的注释性代码正常，无问题（此前子代理报告
   的 "splitPile(0)→per=0→NaN" 经核实不成立：Math.pow(0,k)=0，min/max 保底 3px）。

## 附带发现（审查过程澄清，非问题）
- deposit.js materialize 数组清理有 if (i>=0) 保护，不存在"误删场景最后一颗粒子"；
- scene.js 对 objects 的 update/网格同步在每 tick 有两次 syncGrid 调用（物理前/化学后），
  player 腐蚀后碰撞箱不存在长期滞后；
- player.js:296 ?? 表达式当前因 Block 无 avail() 而未触发（见 B9）。

## 验证环境与实验
- 实验 B1：临时 mjs 直接驱动 ChemistryEngine + Solution/SolutionMaterial，
  1/5/15 tick 对比同池与分离的 CaCl2 消耗（1 tick：1.835g vs 0.800g）。
- 平衡审计：grep 统计全部 src 文件 ctx.save()/ctx.restore() 数量，仅 sign.js 不平衡
  （2:1）、hud.js 计数差 1（经人工核实为提前 return 模式）。
- 以上实验临时文件均已删除，未对仓库留下任何改动。
