# Chezzle 实现技术文档

> 本文档是实现层面的技术设计，**不**以《bluepoint.md》的具体实现方法为约束（如 line/box 碰撞原语、add_solidbox 等接口均被重新设计），但完整保留其玩法设定。设计目标：**模块化、可扩展**，关卡通过调用核心库来实现。
>
> 化学式书写约定：正文统一用 ASCII，如 `H2O`、`CuSO4`、`Fe(OH)3`、`Cu(OH)2`（实际渲染时再用上下标）。
> 文中所有**具体数值**（速率、距离、质量等）都是可在 `Config` 中调参的默认值，见 §11。

---

## 1. 目标与非目标

**目标**
- 纯 H5 / Canvas 2D 化学解谜游戏核心库（不可独立运行）。
- 核心库只提供能力，关卡是独立的完整 HTML 文件，通过库提供的 DSL 描述关卡。
- 化学引擎按"初中化学"范围实现，反应按质量比推进、限域试剂停止、质量守恒。

**非目标（本版本不实现）**
- 液体玩家（玩家暂时恒为固体）。
- 移动端触控（只有键盘操作；触控代码留好接口位）。
- 液面下降（药品池固定体积）。
- 关卡之间无全局进度/选关，只有本关内重开。
- 不建模具体温度，只区分 `常温 / 加热 / 高温` 三档反应条件。

---

## 2. 技术选型与运行方式

- 语言：原生 ES Module JavaScript，无运行时依赖（不引第三方库）。
- 渲染：单个 `<canvas>`，2D Canvas API。
- 代码组织：
  - `src/` 下为 ES Module 源码，每个文件一个模块。
  - `tools/build.mjs` 是一个 ~60 行的零依赖打包脚本，把 `src/` 按 import 图打包成一个 UMD 文件 `dist/chezzle.js`，挂全局 `Chezzle`。
  - 关卡 HTML 通过 `<script src="../dist/chezzle.js">` 加载，用全局 `Chezzle` 写关卡。
  - 开发期可用 `node tools/serve.mjs` 起一个静态服务器直接以模块方式加载源码，也可直接用打包产物。
- 测试：`tests/` 下用 Node 内置 `node:test` 跑化学引擎单测（零依赖）。

**为什么 UMD 打包而不是直接 `<script type="module">`**：`file://` 协议下 ES module 跨文件加载会被浏览器 CORS 拦截，打成一个单文件后用普通 `<script>` 引入，关卡 HTML 可以双击直接玩，兼容性最好。

---

## 3. 总体架构

### 3.1 模块划分

```
src/
├─ core/
│  ├─ config.js        // 全局常量与调参（§11）
│  ├─ scene.js         // Scene：场景、状态机、调度（见 §3.3）
│  ├─ loop.js          // 固定步长主循环（30 tick/s），rAF 渲染
│  ├─ input.js         // 键盘输入 → control_status 统一控制向量
│  └─ eventbus.js      // 事件总线（碰撞事件、物件事件、状态事件）
├─ chem/
│  ├─ substances.js    // 物质属性库 PropertyDB（分子式、离子、颜色、溶解度…）
│  ├─ solution.js      // 溶液模型（固定体积 + 溶质质量 + 水）
│  ├─ particle.js      // 沉淀粒子模型（0.1g/个，5px）
│  ├─ rules.js         // 反应规则表（数据驱动，见 §4.4 / §4.8）
│  ├─ engine.js        // 化学引擎 ChemistryEngine（匹配 + 速率 + 质量守恒）
│  └─ atmosphere.js    // 环境气体模型（N2 80% / O2 20% + 反应产生气体）
├─ physics/
│  ├─ vec.js           // 2D 向量
│  ├─ aabb.js          // AABB（碰撞箱）与相交判定
│  ├─ body.js          // 物理体（位置/速度/质量/是否实心/可推动）
│  └─ collision.js     // 碰撞检测与解算（实心、推挤、事件）
├─ render/
│  ├─ renderer.js      // 主渲染器（canvas、图层）
│  ├─ gridrender.js    // 固体"网格计算法"（§6.1）
│  ├─ liquidrender.js  // 液体渲染（溶液色 + 浮动小球）
│  ├─ camera.js        // 1000×800 逻辑区等比缩放到屏幕
│  └─ hud.js           // 玩家信息 HUD、提示按钮、物品栏 UI
├─ objects/
│  ├─ obj.js           // Obj 基类（所有物件的根）
│  ├─ container.js     // 容器基类（持溶液 + 沉淀粒子）
│  ├─ player.js        // 玩家
│  ├─ floor.js         // 地板
│  ├─ pool.js          // 药品池
│  ├─ block.js         // 物块（有化学性质，可推动、可溶解）
│  ├─ ublock.js        // 无化学性质物块
│  ├─ switch.js        // 开关（含开启物质消耗）
│  ├─ key.js           // 钥匙（开关子类，不消耗）
│  ├─ door.js          // 通关口
│  ├─ beaker.js        // 烧杯
│  ├─ rope.js          // 绳子
│  ├─ lamp.js          // 酒精灯（加热 + 点燃）
│  ├─ blastlamp.js     // 酒精喷灯（高温 + 点燃）
│  └─ gascolumn.js     // 气泡柱/上升气流
├─ level/
│  ├─ builder.js       // LevelBuilder：关卡 DSL
│  └─ custom.js        // 自定义物件的辅助基类与注册
├─ index.js            // 导出：挂全局 `Chezzle`
```

### 3.2 模块依赖方向

```
level/builder ──► objects ──► physics ──► core
                  │           │
                  ├─► chem ───┘
                  │
                  └─► render ─► core
```

依赖单向：**level > objects > physics/chem/render > core**。chem、physics、render 之间不互相依赖（化学反应结果通过对象/场景的数据结构交互，chem 引擎本身不碰渲染与碰撞）。

### 3.3 一刻（tick）内的数据流

`Scene.step(dt)` 每 1/30s 执行一次：

```
1. 输入    ：input.js 收集按键 → control_status
2. 玩家意图：player.update(dt) 按 control_status 生成移动/跳跃/放置/收集
3. 物理    ：body 施加重力/气流，积分位置
4. 碰撞    ：collision.js 解算（实心阻挡、推挤、自动上台阶），发出 contactBegin/End 事件
5. 接触事件：把接触对路由给 reaction/solution/rope/switch 等
6. 化学    ：chemistryEngine.advance(dt) 对所有活跃 ReactionInstance 推进一步
             + 溶解（可溶固体浸入溶液）
             + 大气更新（气体产生/燃烧耗氧）
7. 物件更新：开关耗料、酒精灯燃烧状态、绳子断绳检查、粒子沉降、烧杯搬运
8. 状态判定：win（钥匙开 + 玩家靠近门）/ died（血量归 0 / 出界）
```

渲染不参与 tick，由 `requestAnimationFrame` 独立驱动（每帧画最新状态）。

---

## 4. 化学引擎（核心）

### 4.1 物质模型（`chem/substances.js`）

物质以**分子式字符串**作为唯一 id。每类物质注册一条属性：

```js
// PropertyDB 中的一条
{
  id: 'NaOH',
  formula: 'NaOH',
  name: '氢氧化钠',
  molarMass: 40,            // g/mol
  state: 'solid',           // 常温态: 'solid' | 'liquid' | 'gas'
  kind: 'base',             // 'acid'|'base'|'salt'|'oxide'|'metal'|'nonmetal'
                            // |'water'|'acidicGas'|'other'
  soluble: 'soluble',       // 水溶性: 'soluble' | 'insoluble' | 'slightly'
  ions: { cation: 'Na+', anion: 'OH-' },   // 完全电离式（弱电解质不电离，离子空）
  colors: {                 // 渲染用
    solid: ['#ffffff'],     // 固态颜色（可为多个，供非均匀固体混色）
    ion: '#00e7ff',         // 有色离子在溶液中的颜色（无色则缺省 → #AAA 淡灰）
    ionSat: 150,            // 该离子显色参照的饱和浓度（g 离子 / L 溶液，可调）
  },
  flammable: false,         // 是否可燃
  volatile: false,          // 受热/还原是否分解（分解/制氧类由规则处理，无需此字段）
}
```

内置物质表覆盖：常见酸（`HCl H2SO4 HNO3 H2CO3`）、碱（`NaOH Ca(OH)2 KOH Cu(OH)2 Fe(OH)3 Mg(OH)2`）、盐（`NaCl CuSO4 Na2SO4 FeCl3 CuCl2 BaCl2 Na2CO3 CaCO3 BaSO4 AgCl AgNO3 CaCl2 KCl K2MnO4 KMnO4 KClO3 Na2SO3 NH4Cl`）、氧化物（`CuO Fe2O3 Fe3O4 MgO CaO`）、单质（`Cu Fe Zn Mg Al C S P H2 O2`）、气体（`CO2 SO2 CO NH3 N2`）、水（`H2O`）、`MnO2`（催化剂）等。**所有属性表集中在 PropertyDB，新增物质 = 加一行数据 + 若需新反应则加一条规则（§4.8）。**

### 4.2 溶液模型（`chem/solution.js`）

```js
class Solution {
  volume;                 // 固定体积 mL（容器决定，液面不下降）
  solutes = Map<id, g>;   // 溶解的溶质质量
  water = 0;              // 溶剂质量 g（中和反应会累积水）
  concentration(id) { return solutes.get(id) / volume; }  // g/mL
}
```

- 体积固定、液面不下降（产品决策）。
- **颜色**（交给 liquidrender）：
  - `colorIndex = Σ_i ( c_i / ionSat_i )`（对所有有色离子）。
  - `colorIndex ≈ 0` → 透明淡灰 `#AAA`（低 alpha）。
  - 否则溶液色 = 各有色离子颜色按 `c_i/ionSat_i` 加权平均，透明度 `alpha = clamp(0.15 + 0.7*colorIndex, 0.15, 0.85)`。
- **饱和度**仅作两个用途：① 显色参照（`ionSat`）；② 双置换反应"是否生成沉淀"的判据用溶解度表（§4.4），不做"超饱和自动析出"（留作扩展项）。

### 4.3 沉淀粒子（`chem/particle.js`）

- 每个粒子 = **0.1g、直径 5px 的小球**，字段：`substance`、`position`、`velocity`、`inContainer?`。
- 粒子受重力，会落到容器底部或地面；沉在容器里的粒子可被玩家收集。
- 粒子质量与固体网格"单元格"（§6.1）是**同一质量量子**：0.1g/格、0.1g/球，渲染与质量统一。
- 粒子无化学性质参与反应，但若所处溶液与其发生反应（如酸溶解碱式沉淀），粒子被溶解计入溶液溶质。→ 由 ReactionInstance 的产物路由处理（§4.6）。

### 4.4 反应规则（`chem/rules.js`）

反应规则是**数据表**，每条：

```js
{
  id: 'hcl-naoh',
  type: 'ionic' | 'displace' | 'oxideAcid' | 'acidGas' | 'thermal' |
        'reduction' | 'combustion' | 'catalytic' | 'autoDecomp',
  reactants: ['HCl','NaOH'],
  condition: 'normal' | 'heat' | 'highTemp',   // 或 { catalyst: 'MnO2' }
  rate: 40,                 // 基准速率 g/s（相对第一个反应物），见 §4.6
}
```

**匹配策略**：先按 `type` 分派，再各自匹配：

1. **`ionic`（离子双置换，覆盖"酸+碱 / 碱+盐 / 盐+盐 / 酸+盐 / 酸+不溶性碱"）**
   将两种电解质各自拆成离子（溶液中的溶质离子；固体电解质（如 `Fe(OH)3`）与溶液接触时也作为离子源）。尝试交换离子对，检查是否有"驱动力"：
   - `H+ + OH-` → 水（中和）
   - 交换产物**不溶于水** → 沉淀
   - `CO3^2- + H+` → `H2CO3` → 立即分解为 `CO2↑ + H2O`
   - `NH4+ + OH-` → `NH3↑ + H2O`
   - 若无驱动力 → 该反应不进行（符合"初中：不反应就不反应"）。
   产物路由：可溶盐 → 溶液溶质；沉淀 → 容器粒子 / 附着（见 §4.6）；气体 → 大气；水 → 溶液 water。

2. **`displace`（置换，金属阳离子 + H+）**：查金属活动性序 `K Ca Na Mg Al Zn Fe Sn Pb (H) Cu Hg Ag Pt Au`。
   - 金属 + 酸：只有活动性 > H 的金属置换出 `H2↑`（Fe → Fe2+）。
   - 金属 + 盐：排在前面的金属置换后面金属（如 `Fe + CuSO4 → FeSO4 + Cu↓`）。
   - 特例：`K/Ca/Na` 遇水剧烈反应，初中不放入溶液置换，默认不参与（可后续扩展）。

3. **`oxideAcid`（金属氧化物 + 酸）**：`Fe2O3 + 6HCl → 2FeCl3 + 3H2O`、`CuO + H2SO4 → CuSO4 + H2O` 等（氧化物直接与 H+ 作用，不依赖氧化物电离）。

4. **`acidGas`（碱 + 酸性气体）**：`2NaOH + CO2 → Na2CO3 + H2O`、`Ca(OH)2 + CO2 → CaCO3↓ + H2O`、SO2 同理。气体以大气中气体分压为"量"参与（见 §4.7）。

5. **`thermal`（加热/高温分解）**：不溶性碱加热分解（`Cu(OH)2 → CuO + H2O`、`Fe(OH)3 → Fe2O3 + 3H2O`）；碳酸盐高温分解（`CaCO3 --高温--> CaO + CO2↑`）。

6. **`reduction`（氧化还原，高温）**：还原剂 `C / CO / H2` × 氧化剂 `CuO / Fe2O3 / Fe3O4`，条件高温。含 `C + CO2 --高温--> 2CO`。

7. **`combustion`（燃烧，点燃 + 需 O2）**：可燃单质/CO + O2 → 氧化物（`C→CO2`、`S→SO2`、`P→P2O5`、`H2→H2O`、`Mg→MgO`、`Al→Al2O3`、`Fe→Fe3O4`、`Cu→CuO`、`CO→CO2`）。需要"点燃源"（酒精灯/酒精喷灯火焰或已在燃烧）且大气 O2 分压达标（§4.7）。

8. **`catalytic`（催化剂/加热制氧）**：`2H2O2 --MnO2--> 2H2O + O2↑`（催化剂条件）、`2KMnO4 --加热--> K2MnO4 + MnO2 + O2↑`、`2KClO3 --加热/MnO2--> 2KCl + 3O2↑`。

9. **`autoDecomp`（自发分解）**：`H2CO3 → H2O + CO2↑`（一旦生成立即按该规则进行）。

**溶解（非反应，passive process）**：可溶固体（物块/玩家外的固体）浸入溶液时按"溶解速率"把自身质量转为溶液溶质；玩家不主动溶解（特殊性）。

### 4.5 化学引擎算法（`chem/engine.js`）

核心接口：

```js
// 输入：反应物及其质量 → 输出：反应推进后产物与质量（质量守恒）
class ChemistryEngine {
  matchPair(matA, matB, ctx)      // 两个材料源 → 可用的 ReactionRule[]
  advanceInstance(inst, dt)       // 对一个活跃 ReactionInstance 推进一步
}
```

**反应实例生命周期**：两个物体 `contactBegin` 时，引擎尝试 `matchPair`，匹配成功则创建 `ReactionInstance`（记录双方引用、当前各自动态质量）；此后每个 tick 若双方仍接触且条件满足则 `advance(dt)`；`contactEnd` 或一方耗尽则销毁实例。

**每刻推进（质量守恒）**：

```
unitsPerSec = rate * phaseFactor / molarMass(ref)     // ref = 规则第一反应物
units       = unitsPerSec * dt
avail       = min_{r∈reactants} ( mass(r) / (molarMass(r) * coefficient(r)) )
units       = min(units, avail)
对每个 reactant r : mass(r) -= units * coefficient(r) * molarMass(r)
对每个 product  p : mass(p) += units * coefficient(p) * molarMass(p)
```

**微量限速（防"有→无→有"振荡）**：离子反应中，低于 `LIMIT_MASS`（0.05g）的**溶液**溶质，本 tick 最多反应其总量 × 浓度因子（近似质量作用定律）。否则"生成速率≈消耗速率"的中间体（如 NH4ClO：`NH3·H2O+HClO` 生成 0.0002g/tick、`NH4ClO+NaOH` 立刻吃光）会在 0 附近每 tick 来回翻转——溶液面板逐 tick "有→无→有"抖动。限速后中间体累积到非零稳态，条目稳定存在；正常量与固体不受影响。

产物按相路由：
- **在容器内反应**（池/烧杯里）→ 可溶盐进溶液、沉淀成粒子沉在容器、气体进大气、水进溶液。
- **开阔地固-固反应**（物块-物块、玩家-物块）→ 固体产物就地转换粒子（附着在接触面），液体产物散开成粒子，气体进大气。
- **玩家参与的反应** → 玩家被侵蚀的"玩家物质"细胞按上述路由转换（§6.1.2），其质量即为血量损耗。

`phaseFactor`（接触介质系数）：液-液 1.0、固-液 0.5、固-固 0.1（体现"未溶解速度较慢"）。

**离子/氧化还原/置换反应需要"真实溶液"介质**：介质判定用 `solution.volume > 0`（而非
材料 `phase === 'solution'`——灯/开关等干式台子的材料适配器 phase 恒为 solution 但
`volume = 0` 无水）→ 灯上沉淀粉末按固体对待、不电离，NaOH 块 + 灯上 CuSO4 粉末
没有水不会生成 Cu(OH)2；灯上只发生热分解/固固还原/铝热等特例反应。

### 4.6 反应条件与温度

- 三档条件：`normal`（常温，无条件）、`heat`（加热）、`highTemp`（高温）。
- 提供条件判定的物件：**酒精灯**（点燃时）在其火焰半径 `lampRange` 内提供 `heat` 与"点燃源"；**酒精喷灯**（点燃时）提供 `highTemp`（且隐式满足 `heat`）与"点燃源"。
- 催化剂条件：`{ catalyst: 'MnO2' }` 要求接触范围内存在固体 `MnO2`。
- 每个 tick 判定条件是否满足；不满足则本刻不推进（实例保持，条件具备后继续）。

### 4.7 大气模型（`chem/atmosphere.js`）与燃烧

```js
class Atmosphere {
  gas = Map<id, g>;          // 初始 N2: 80% * totalAir, O2: 20% * totalAir
  totalAir;                  // 名义总空气质量（默认 5000g，可调）
  composition() -> {N2:…, O2:…, CO2:…};   // 按质量百分比
  addGas(id, mass);  removeGas(id, mass);
  o2Fraction();            // O2 质量占比
}
```

- 反应产生气体（CO2/SO2/H2/NH3/O2）→ `addGas`，使对应气体占比"略微上升"（如 44g CO2 进 5000g 空气 ≈ +0.88%）。
- 燃烧消耗 O2（`removeGas`）；当 `o2Fraction() < combustionMinO2`（默认 5%）时燃烧停止（真实：缺氧熄灭）。
- 气体总量 `totalAir` 为名义值，占比才是玩法量；`totalAir` 可调大调小以控制"产生气体"的敏感度。

**燃烧**：可燃物体 + 点燃源 + O2 达标 → 物体细胞的碳/单质逐刻转换为氧化物（Fe→Fe3O4、C→CO2 气体消失等），消耗对应质量与 O2，速率 `rateCombustion`。燃烧会让物体发热，可充当相邻物的"点燃源"（助燃传播）。

### 4.8 支持的化学反应表（初中范围，数据驱动）

按 §4.4 分类收录（示意，完整表在 `rules.js`）：

| 类别 | 代表反应 | 条件 |
| ---- | -------- | ---- |
| 中和 | `HCl + NaOH → NaCl + H2O`；`H2SO4 + 2NaOH → Na2SO4 + 2H2O`；`Fe(OH)3 + 3HCl → FeCl3 + 3H2O` | 常温 |
| 酸+金属氧化物 | `Fe2O3 + 6HCl → 2FeCl3 + 3H2O`；`CuO + H2SO4 → CuSO4 + H2O` | 常温 |
| 酸+金属（置换） | `Zn + 2HCl → ZnCl2 + H2↑`；`Fe + H2SO4 → FeSO4 + H2↑`；`Mg + 2HCl → MgCl2 + H2↑` | 常温 |
| 酸+碳酸盐 | `CaCO3 + 2HCl → CaCl2 + CO2↑ + H2O`；`Na2CO3 + H2SO4 → Na2SO4 + CO2↑ + H2O` | 常温 |
| 碱+盐 | `2NaOH + CuSO4 → Cu(OH)2↓ + Na2SO4`；`3NaOH + FeCl3 → Fe(OH)3↓ + 3NaCl`；`Ca(OH)2 + Na2CO3 → CaCO3↓ + 2NaOH`；`NaOH + NH4Cl → NaCl + NH3↑ + H2O` | 常温 |
| 盐+盐 | `BaCl2 + Na2SO4 → BaSO4↓ + 2NaCl`；`AgNO3 + NaCl → AgCl↓ + NaNO3` | 常温 |
| 金属+盐（置换） | `Fe + CuSO4 → FeSO4 + Cu↓`；`Cu + 2AgNO3 → Cu(NO3)2 + 2Ag↓`；`Zn + CuSO4 → ZnSO4 + Cu↓` | 常温 |
| 碱+酸性气体 | `2NaOH + CO2 → Na2CO3 + H2O`；`Ca(OH)2 + CO2 → CaCO3↓ + H2O`；`2NaOH + SO2 → Na2SO3 + H2O` | 常温 |
| 不溶性碱分解 | `Cu(OH)2 → CuO + H2O`；`Fe(OH)3 → Fe2O3 + 3H2O` | 加热 |
| 碳酸盐分解 | `CaCO3 → CaO + CO2↑` | 高温 |
| 氧化还原 | `C+2CuO → 2Cu+CO2↑`；`CO+CuO → Cu+CO2↑`；`H2+CuO → Cu+H2O`；`3CO+Fe2O3 → 2Fe+3CO2↑`；`3H2+Fe2O3 → 2Fe+3H2O`；`4CO+Fe3O4 → 3Fe+4CO2↑`；`C+CO2 → 2CO` | 高温 |
| 燃烧 | `C+O2 → CO2`；`S+O2 → SO2`；`4P+5O2 → 2P2O5`；`2H2+O2 → 2H2O`；`3Fe+2O2 → Fe3O4`；`2Cu+O2 → 2CuO` | 点燃 |
| 催化/制氧 | `2H2O2 --MnO2--> 2H2O+O2↑`；`2KMnO4 --加热--> K2MnO4+MnO2+O2↑`；`2KClO3 --加热/MnO2--> 2KCl+3O2↑` | 见左 |
| 自发分解 | `H2CO3 → H2O + CO2↑` | 常温 |

> 额外可选标准规则（可后续加一行数据接入）：`CaO + H2O → Ca(OH)2`（放热，不建模热量）、`2Mg + O2 → 2MgO`。

---

## 5. 物理与碰撞（`physics/`）

- **碰撞原语统一为 AABB**（抛弃文档的 line/box 双原语）：静态地板、移动物体、容器、气流都用 AABB 表达。
- `Body`：`pos, vel, w, h, mass, solid, pushable, static`；重力 `G`（默认 1200 px/s²）作用于非静态体。
- 求解顺序：
  1. 重力/气流加速度 → 速度。
  2. 分轴积分（x 轴再 y 轴），每轴按小步长（≤6px）移动并逐个对静态 solid AABB 解算穿透——高速也不会穿过薄墙/薄板。
  3. 动态-动态：可推动物块被玩家 x 向推挤（**忽略摩擦/质量，只要前方有空位即可推动**；若前方被挡则玩家也走不动）。推挤只作用于水平，不能把物块抬离地面。
  4. 自动上台阶：前进方向地板高差 ≤ `autoStepMax`（默认 14px）时直接走上；更大则被挡住。
  5. **残余重叠解算（防穿模/防瞬移的核心）**：轴解算结束后仍有重叠的体（斜向冲入板底、出生嵌入实心、传送落点、爆炸推挤），按**四面最小穿透（MTV）**沿"体离得最近的那一面"温柔推出（单次 ≤16px，深嵌分帧收敛）。方向修正：体顶已在实心体顶之上且非上升时改判落地（大物块放池里/出生齐平地面），上升中的体维持向下推出（跳起撞池底只会被推回下方，绝不会被抬到上方）。
- 接触面判定（Y 轴）：**按本子步移动前的相对位置**判断落地/撞顶，钳制后立即停止剩余子步——撞顶即停在板底，一帧内彻底停住，杜绝"钳制后残留嵌入、随后被一帧帧顶穿到板顶"的瞬移。
- X 轴只解算真正的侧面接触：正在落地/撞顶（垂直穿透 ≤32px）时不横推，杜绝"落地瞬间被横向甩出 16px"的落地瞬移与深嵌时的横向漂移。
- 接触事件：`contactBegin(a,b)` / `contactEnd(a,b)`，由 `collision.js` 在 AABB 相交的开始/结束发出，路由给化学与物件逻辑。
- 动态体之间的"支撑接触"保护：b 的底不高于 o 的底（b 在 o 正下方、顶贴 o 底）时不做"向下推出"——那是 o 站在 b 上的支撑关系，不是碰撞；否则物块会被站着的玩家每帧压进地板（"骑物块沉地"）。下沉中的动态体也不做撞顶钳制（顶贴对方底 = 支撑接触），交给对方侧的落地解算处理。
- 玩家跳跃：仅在脚底有实心支撑时 `jump` 生效，施加 `-jumpVel`。
- **出界判定**：玩家 y > 世界高度 + 边界余量 或 y < -边界 → `died`。
- 气流（gascolumn）在加速度阶段按 `force / mass` 施加向上加速度，并钳制一个最大上浮速度。

---

## 6. 渲染（`render/`）

### 6.1 固体"网格计算法"（`gridrender.js`）

**模型：固体 = 二维单元格网格，每格 = 0.1g / 5px，记录一种物质（或空）。**

- 格子的物质分布决定渲染颜色与形状，也决定质量（`质量 = 非空格数 × 0.1g`）。
- 纯物质固体：所有格同一色；混合固体：按组成质量比例把格子分配到各物质（随机散布）。
- 格子渲染成 5×5 的实心小矩形（或圆角），性能可接受（典型场景 < 5000 格）。

**玩家网格**：初始 100g = 1000 格，排成椭圆（长短轴 ≈ 由格数算得，约 100×80px）。碰撞箱 = **能容纳当前玩家形状的最小 AABB**（随侵蚀缩小）。

**侵蚀与产物附着**：
- 玩家（或物块）被反应消耗时，从**接触侧的表面格**开始移除（外层先被"吃"）。
- 开阔地固-固反应：被消耗的表面格就地转换为产物物质格（如 NaOH→NaCl 附着在玩家身上）——**这些产物格不计入玩家血量**。
- 在容器内反应：消耗的格直接转换成容器的溶质/粒子（玩家身体缩小，池子内容增加）。
- **产物填回规则**（`addInPlace`）：同批多个产物共享"被消耗的格子"；**非致密产物**按各格剩余容量**占比分摊**——先到先得会让后遍历的格（大 y 行）拿不到份额，消耗面深处出现空洞（NaOH 块吸 Cl2：NaCl 填不满消耗面、NaClO 又全堆底部 → 物块中间整片空缺）；**致密产物**（BaCO3/Cu 壳）先到先得集中成壳，且**本批已有产物写入后不再填消耗格**（否则 BaCO3 会填进刚被 NaOH 回填的表面格，整格变 dense → 反应面过早封死，如池内再生 Na2CO3 转化不完）。
- **产物盈余生长**（`growExposed`）：盈余长在**所有暴露边界**（与大气/液体接触的面——物块四面都是接触面，不固定哪一侧）。所有暴露位置**同时开层、质量从 0 逐渐涨满**（渲染 alpha 随质量渐变 = "逐渐生长"），层满自动开下一层；质量直接写入格子（无累积器滞留）。**致密产物**（Cu/BaCO3）只开 bottom 层且层内均摊（微量 dense 撒满一圈会把反应面整体封死）。**0 质量生长占位格不占物理**（`minAABB` 忽略）：碰撞箱与视觉一致。玩家与开阔地物块走此路径（`Block`/`Player.adhereMaterial`）。
- **物块浸容器时的盈余沉淀**：物块（非玩家）浸在池/烧杯中，产物填满消耗格后的盈余**以沉淀形式落入容器**（`SolidMaterial.add` → `addPrecipitate`）——Fe 浸 CuSO4 的 Cu 镀满表面后，多余的铜像铜粉一样沉底：格子 0.1g 上限使盈余无法均匀摊薄到已满的表面，强制长成新格子必然在块表面凸出怪形状（角落包/隐形壳/不对称镀层），沉淀入容器既守恒又不破坏块形状。

**颜色**：每格用 `PropertyDB[substance].colors.solid`；混色固体自然呈现出"一个容器里多种颜色"的效果。

### 6.2 液体渲染（`liquidrender.js`）

- 底色 = 溶液计算色（§4.2），透明随 `colorIndex`。
- 叠加若干 2–10px 随机小圆，颜色比底色随机深浅，缓慢浮动（纯视觉）。
- 液体中的沉淀粒子按 §6.3 绘制在容器内并沉降到底部。
- 化学式显示在容器旁（开关需显示开启物质化学式 + 剩余质量数字，钥匙显示橙色，通关口为橙红色门）。

### 6.3 沉淀粒子渲染

- 5px 小球，颜色 = 物质固色；在开阔地受重力下落，落到实心面停下；在容器内沉降于容器底部，可被玩家收集。

### 6.4 相机与缩放

- 逻辑区 1000×800；`camera` 按 `min(viewport.w/1000, viewport.h/800)` 等比缩放并居中，小屏只缩不放。

### 6.5 HUD

- 左上：玩家物质化学式 + 当前血量质量。
- 右上：提示按钮（显示 `Scene.tip`）。
- 物品栏：主区下方或右侧，5 格；每格显示物质类别与质量；点击选中（高亮）；提供"清空/丢弃"按钮清空格子。
- 反应日志：`NH4OH ≡ NH3·H2O` 为同一物质（别名在 `substances.js` 的 `ALIASES` 统一归一化，避免双 id 分裂反应路径）；日志做防抖动处理——产物全为水/气体不记录、反应物按 id 排序（同一反应不同书写顺序归一）、同一反应限频（调试面板/浮动标签 0.5s、玩家 HUD 日志 1s）。
- 通关/死亡时显示结果遮罩 + "重开"按钮（`Scene.restart()` → `location.reload()`）。

---

## 7. 物件系统（`objects/`）

### 7.1 Obj 基类

```js
class Obj {
  id; pos; vel; collider(AABB); static;
  solid;        // 是否实心阻挡
  pushable;     // 是否可被推动
  material;     // 化学组成（固体用 MaterialGrid，液体/容器用 Solution，无化学用 null）
  update(dt);   // 每刻
  render(ctx);  // 渲染
  onContactBegin(other); onContactEnd(other);
}
```

新增物件 = `extends Obj`，重写需要的钩子，通过 `scene.addObject(obj)` 注册（自定义物件指南见 §13）。

### 7.2 物件清单

| 类 | 职责要点 |
| --- | --- |
| `Floor` | 静态 AABB，无化学性质，不可移动。 |
| `Pool`（容器） | 凹陷地面，固定体积溶液 + 粒子；与进入物反应；渲染液体。 |
| `Block` | 有化学性质的实心物块；可溶解、可反应、可被推（`pushable` 关卡设定）；格网材质。 |
| `UBlock` | 无化学性质物块（纯障碍/平台）。 |
| `Switch`（容器） | 见 §7.4；按 `mode` 触发，发出 onOpen/onClose。 |
| `Key`（Switch 子类） | 开启物质不消耗，一旦开启永久；渲染为橙红按钮。 |
| `Door` | 通关口；`open()` 后渲染开门；与钥匙联动由关卡接线；判定通关见 §10。 |
| `Beaker`（容器） | 可承载任何物质与玩家；玩家可水平推动（内外皆可），不能抬升；玩家跳跃时跳出。 |
| `Rope` | 见 §7.5。 |
| `Lamp` / `BlastLamp`（容器） | 由开关控制点燃；提供 heat/highTemp 与点燃源；沉淀放置优先落在其上。 |
| `GasColumn` | 上升气流区域（§7.6）。 |

### 7.3 玩家（`player.js`）

- **血量** = 玩家物质（关卡设定，如 `NaOH`）剩余细胞质量；血量 ≤ 0 → `died`。
- **控制**：`a` 左、`d` 右、`space` 跳、`shift` 放置、`q` 收集。
- **放置**（每次 0.5g，生成 5 个粒子）：
  1. 玩家附近 `lampRange` 内有点燃的酒精灯/喷灯 → 放在灯上；
  2. 否则脚下是容器（池/烧杯/开关/灯）→ 放入容器；
  3. 否则 → 生成在脚下地面。
  - 选中格 < 0.5g 也按 0.5g 放置（扣到 0）。
- **收集**：半径 `collectRadius` 内所有沉淀粒子；只有沉淀粒子可收集。
- **物品栏**：5 格，按物质种类分格，格子种类由首次放入决定，每格上限 100g；玩家可清空/丢弃任一格；所有格都被不同物质占满（或对应格满 100g）→ 收集失败。点击选中。
- **液体玩家**：不实现（非目标）。

### 7.4 容器与开关

容器基类 `Container`：持 `Solution` + 沉淀粒子列表，提供 `addSolute / addParticle / drain` 等接口。

`Switch` 触发模式：
- `'chemical'`（默认，需化学物质开启）：存放"开启物质"；`openingMass > 0` 即开；按 `consumeRate` g/s 消耗，耗尽自动关。开启物质化学式显示在旁，剩余质量 > 0 时以数字显示。
- `'pressure'`：玩家/物块（关卡设定）站在其上即开（不消耗）。
- 开关打开触发 `onOpen`，关闭触发 `onClose`；**是否复位由关卡接线决定**，库不做隐式回弹。
- `Key` 为 `'chemical'` 且 `consumeRate = 0`。

### 7.5 绳子（`rope.js`）

- 参数：锚点（`{fixed: {x,y}}` 或 `{obj, offset}`）、长度 `L`、悬挂物体 `hangingObj`。
- 悬挂物体位置 = 锚点 + (0, L)，**完全由绳子决定**（运动学），绳子无碰撞箱、不弯曲、恒垂直。
- 每刻检查：锚点为物体时该物体是否仍存在；若不存在 → 断绳。计算悬挂物体的目标位置，若与实心碰撞（被卡住无法到达）→ 断绳。
- 断绳：绳子移除，悬挂物体恢复动态（受重力）。

### 7.6 气泡柱（`gascolumn.js`）

- 定义：AABB 区域 + 向上推力 `force`。与区域相交的动态物体获得向上加速度 `force/mass`（上限 `gasMaxSpeed`），可把玩家/物块托上高层。
- 渲染：区域内的上升半透明气泡。

---

## 8. 事件系统（`core/eventbus.js`）

- 通道：`contactBegin/End`、`switch.onOpen/onClose`、`door.open`、`player.died`、`scene.win` 等。
- 碰撞事件全局触发（任意物体碰撞都发）；开关/门等物件事件由关卡接线消费。
- 关卡接线示例：

```js
key.onOpen(() => door.open());          // 钥匙开 → 门开
sw.onOpen(() => lamp.ignite());         // 开关开 → 酒精灯燃烧
sw.onClose(() => lamp.extinguish());    // 开关关（开启物质耗尽）→ 熄灯
```

---

## 9. 关卡 API（`level/builder.js`）

`LevelBuilder` 提供流式 DSL，末尾 `build()` 返回 `Scene`，`start()` 启动循环：

```js
new Chezzle.LevelBuilder('#game')
  .setTip('把 Cu(OH)2 沉淀放进开关里，钥匙会打开出口')
  .floor(0, 700, 1000, 60)                      // 底地板
  .floor(0, 500, 300, 30)                       // 高层地板
  .player(50, 620, { substance: 'NaOH', mass: 100 })
  .pool(600, 640, 200, 60, { volume: 300, solutes: { CuSO4: 150 } })
  .block(400, 620, 40, 40, { substance: 'Fe', pushable: true })
  .lamp(200, 640, { autoOn: false })
  .switch(180, 640, { mode: 'pressure', on: () => lamp.ignite() })
  .switch(650, 500, { opening: 'Cu(OH)2', consume: 2, on: () => key.open() })
  .key(750, 500, { opening: 'Cu(OH)2', on: () => door.open() })
  .door(900, 640, 30, 60)
  .gas(500, 300, 80, 200, { force: 600 })
  .build().start();
```

通用能力：`scene.addObject(obj)` 注册自定义物件；`scene.addRpt(name, fn)` 注册刻运行函数（等价文档的 rpt，返回 0/1）；`scene.removeRpt(name)`；`scene.tip`；`scene.onWin(fn)` / `scene.onDied(fn)`；`scene.restart()`。

---

## 10. 状态机与流程

```
init ── start() ──► running ──► win | died ── restart() ──► (reload) init
```

- `Scene.status` ∈ `'init' | 'running' | 'win' | 'died'`。
- 通关判定：**钥匙开启** 且 玩家碰撞箱与门中心的距离 < `doorWinRadius`（默认 80px）。
- 死亡判定：玩家血量（玩家物质质量）≤ 0，或玩家出界。
- win/died 后暂停物理，渲染遮罩，提供重开。

---

## 11. 全局常量与调参（`core/config.js`）

| 常量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `tickRate` | 30 /s | 固定步长 |
| `gravity` | 1200 px/s² | 重力 |
| `player.moveSpeed` | 220 px/s | 水平速度 |
| `player.jumpVel` | 520 px/s（向上） | 跳跃初速 |
| `autoStepMax` | 14 px | 自动上台阶阈值 |
| `cellMass` / `cellSize` | 0.1 g / 5 px | 质量量子（格/粒子） |
| `placeAmount` | 0.5 g | 每次放置质量 |
| `collectRadius` | 70 px | 收集半径 |
| `lampRange` | 70 px | 灯提供条件的半径 |
| `inventory.slots` / `slotCap` | 5 / 100 g | 物品栏 |
| `reaction.rateLL/SL/SS` | 40 / 20 / 6 g/s | 液液/固液/固固基准速率 |
| `reaction.dissolveRate` | 5 g/s | 可溶固体溶解速率 |
| `reaction.rateCombustion` | 8 g/s | 燃烧速率 |
| `atmosphere.totalAir` | 5000 g | 名义总空气质量 |
| `atmosphere.init` | N2 80% / O2 20% | 初始组成 |
| `atmosphere.minO2` | 5% | 低于此燃烧停止 |
| `doorWinRadius` | 80 px | 通关距离 |
| `worldMargin` | 200 px | 出界判定余量 |
| `gas.maxSpeed` | 260 px/s | 气流最大上浮速度 |

---

## 12. 目录结构

```
Chezzle/
├─ src/                  # ES Module 源码（§3.1）
├─ dist/chezzle.js       # 构建产物（UMD，挂全局 Chezzle）
├─ levels/*.html         # 关卡文件（每个一关）
├─ tools/
│  ├─ build.mjs          # 零依赖打包器
│  └─ serve.mjs          # 开发静态服务器（可选）
├─ tests/                # node:test 单测（化学引擎为主）
├─ TECH_DESIGN.md        # 本文档
```

---

## 13. 扩展指南

- **新增物质**：在 `substances.js` 加一行数据（分子式/摩尔质量/颜色/溶解度/离子…）。
- **新增反应**：在 `rules.js` 加一条规则；若属于 `ionic` 类则通常无需新规则（离子推导自动覆盖）；非离子类（分解/还原/催化…）需显式规则。
- **新增物件**：`extends Obj`（或 `extends Container`），实现 `update/render` 与需要的事件钩子，`scene.addObject` 注册；若需 DSL，在 `builder.js` 加一个方法。
- **新条件/新介质**：在 `config.js` 与 `engine.js` 的相位/条件判定处扩展（接口已按"枚举+查表"设计）。
- **移动端触控**：`input.js` 预留 `bindTouch(el)` 占位，未实现。

---

## 14. 测试计划（`tests/`）

以**化学引擎**为主，Node `node:test` 零依赖：

1. **计量与质量守恒**：`HCl+NaOH` 等代表反应的输入-输出质量平衡（两侧质量相等）。
2. **双置换判定**：`NaOH+CuSO4 → Cu(OH)2↓+Na2SO4` 生成沉淀；`NaCl+AgNO3 → AgCl↓+NaNO3`；无驱动力组合不反应。
3. **限域试剂**：反应量被较少一方截断，且不出现负质量。
4. **速率与相位**：液液 > 固液 > 固固；每刻推进量 = rate×dt 且被限域封顶。
5. **条件门控**：`heat` 规则在无酒精灯时不反应，有灯才反应；`highTemp` 只有喷灯满足；`MnO2` 催化需催化剂存在。
6. **置换活动性序**：`Fe+CuSO4` 反应、`Cu+FeSO4` 不反应、`Cu+HCl` 不反应。
7. **燃烧与大气**：燃烧消耗 O2、产生 CO2，O2 低于阈值后停止；H2O2/MnO2 产 O2 使 O2 占比上升。
8. **分解/还原**：`CaCO3` 高温分解；`CuO` 被 C/CO/H2 高温还原。
9. **溶解**：可溶物块浸水逐刻转溶质；不溶不转；玩家不溶解。
10. **碳酸特例**：任何碳酸盐+酸产物为 `CO2↑+H2O`（`H2CO3` 不持久）。

物理/渲染以手动关卡试玩为准（`levels/example.html` 做冒烟关卡验证：搭沉淀、开开关、还原、燃烧、通关全链路）。
