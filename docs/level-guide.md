# Chezzle 关卡通关报告（level.json 实测版）

> 本报告基于**引擎实测**（每个机制都跑了模拟验证），非"感觉"推断。
> 世界：1500×800。玩家：Fe₂O₃ 30g。胜利条件：**走到打开的门 door1（右上角）80px 内**。

---

## 一、ASCII 实测布局

```
y 90-186  顶层    [floor10] [sw3][lamp1] [HClO池] [floor11] |墙 floor12| [Cu] [HNO3池] [ext2][sw4][key1][door1]
y 250-341 中上层  [portal1] [portal2]      [portal5] [portal6]        [switch1][switch2]  [floor9]
y 334-520 中层    [floor3]  [pool2空]      [portal3][K块][portal4]    [floor2]
y 550-700 中下层  [玩家@] [喷灯Al]  [NaClO块·绳]  [NaOH块] [ext3][sw5]  [pool3 NH4OH 气柱850]
y 700     底部    [floor1] [pool1 HCl] [floor5] [pool3] [floor8]
```

**关键物体**：pool1=HCl、pool3=NH₄OH(气柱高850)、喷灯上有Al、block1=K、block2=NaClO(绳子吊着)、block3=NaOH、block4=Cu、key1(需CuCl₂)、door1。

---

## 二、已验证的机制（全部实测）

| # | 机制 | 实测结果 |
|---|------|---------|
| 1 | **pool3 运输**：NaClO(block2) 丢进 pool3(NH₄OH) → 自定义反应 `3NaClO+2NH₄OH→3NaCl+N₂+5H₂O` 产 **N₂ 气柱** | 气柱 accel 1300 > 重力 1200，玩家被托升到 **y≈259**（即 y≈334 平台层）✓ |
| 2 | **铝热**：Fe₂O₃ + 喷灯 Al 粉 → **Al₂O₃** + Fe | Al₂O₃ 9.4g ✓ |
| 3 | **Fe + HCl → FeCl₂ + H₂** | FeCl₂ 6.3g + H₂ ✓ |
| 4 | **K + HCl → KCl + H₂** | 大气 H₂ 0.24g ✓（可触发气体探测器1）|
| 5 | **Fe₂O₃ + HCl → FeCl₃** | FeCl₃ 4.1g ✓ |
| 6 | **FeCl₃ + NaOH(block3) → Fe(OH)₃** | 1.2g ✓（给 switch3）|
| 7 | **HClO + 光照(lamp1) → O₂** | HClO 分解、O₂ 产出 ✓（gasdetector2 删 floor12）|
| 8 | **CuO + HCl → CuCl₂** | 2.03g（快）✓ |
| 9 | **Cu + FeCl₃ → CuCl₂** | 0.07g/100s（慢，但 >0 就够开 key1）✓ |
| 10 | **提取器可把溶液中的盐提成粉末**（CuCl₂ 实测 2.4g）| ✓ |
| 11 | **跨 pool1(HCl) 掉血**：Fe₂O₃ 玩家游过 260px 宽池 | HP 30.6→11.8（活，但危险）✓ |

---

## 三、完整通关路径（12 步）

### 阶段 1：底部备料
1. **铝热产 Al₂O₃**：Fe₂O₃ 玩家站上喷灯（有 Al 粉）→ 反应产 **Al₂O₃ + Fe** 粉末。收集 Al₂O₃（switch1 用）。
2. **产 FeCl₂**：玩家（Fe）进 pool1(HCl) → FeCl₂ 入溶液；站上 switch5（压力）→ **extractor3 提取 FeCl₂ 粉末**，收集（switch2 用）。
3. **产 H₂**：把 block1(K) 弄进 pool1(HCl) → **H₂** → gasdetector1 打开（portal5/6 激活）。

### 阶段 2：跨池 + 上顶
4. **跨 pool1**：从 floor1 游过 HCl 池到右侧（掉 ~19 HP，用 Fe 核心过更快）。
5. **乘 N₂ 气柱**：把 block2(NaClO) 丢进 pool3(NH₄OH) → N₂ 气柱 → 踩住被托升到 **y≈334 层**。

### 阶段 3：右侧中段
6. **落 floor9**（右侧 y341 平台），上面有 **switch1/switch2**。
7. **开双开关**：Al₂O₃ 放 switch1、FeCl₂ 放 switch2 → switch1(联锁 switch2) 有效开启。
8. **portal7→portal8**（需 switch1 开）→ 传送到**顶层左端 floor10**。

### 阶段 4：顶层通关
9. **产 Fe(OH)₃ 点灯**：FeCl₃（Fe₂O₃+HCl）+ block3(NaOH) → Fe(OH)₃ → 放 **switch3** → 开关开 → **点燃 lamp1**。
10. **HClO 光照产 O₂**：lamp1 光照 pool4(HClO) → O₂ → **gasdetector2 删除挡路墙 floor12** → 顶层左右连通。
11. **产 CuCl₂ 开锁**：把 block4(Cu) 做成 CuO（喷灯烧）→ CuO + HCl → CuCl₂（或 Cu+FeCl₃ 慢产）→ 提取器提成粉末 → 放 **key1** → **door1 打开**。
12. **走到 door1** → **通关**。

---

## 四、关键提醒

- **传送门次数**：紫门(portal1/3) 用 2 次、绿门(portal2/4) 只用 1 次——走错方向就卡死。
- **气柱乘坐要把握横向移动**：N₂ 气柱在 x≈953-1001，上升时往左落 floor7、往右落 floor9，否则掉回底部。
- **HP 预算紧张**：跨 HCl 池、铝热都会掉血，30g 核心要省着用。
- **CuCl₂ 是最难点**：要么 Cu+FeCl₃ 等 100 秒，要么做 CuO+HCl 快但要把 Cu 块从顶层带下去、做完再带上来。

---

## 五、难度评价：★★★★★（极难）

- **引导几乎为零**：唯一提示牌「3NaClO+2NH₃→3NaCl+N₂+3H₂O」指向的自定义反应没有明确告知；运输靠"猜出 NaClO 丢进 NH₄OH 池"。
- **多层往返**：CuCl₂ 需要顶层 Cu + 底层 HCl，来回搬运。
- **资源限制**：传送门次数、HP、K 块/NaClO 块数量都有限，错一步难挽回。
- **隐藏机制多**：提取器、气体探测器只认反应产气、灯的点燃依赖开关链。
- **结论**：对玩家要求极高，建议**降难度**（加引导提示、放宽传送门次数、或提供现成 CuCl₂）。

