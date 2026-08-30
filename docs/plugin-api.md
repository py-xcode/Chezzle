# Chezzle 插件 API（v1）

插件 = **关卡的额外 JS 章节**。编辑器负责摆放关卡本体；插件负责"原版没有的"逻辑。
插件就是为本关卡服务的——**零配置、零表单**；需要调参数的地方，参数都长在**物体属性面板**里。

```text
level.html        ← 导出的关卡（编辑器生成）
plugin/….js       ← 插件文件（仓库 plugin/ 目录；编辑器加载 JSON 时自动从这里找）
dist/chezzle.js   ← 引擎
```

## 1. 三种承载形态

| 形态 | 元数据 | 用途 | 参数在哪 |
|---|---|---|---|
| 纯逻辑 | 只写 `run` | 定时/键盘/新反应/自定义玩法（写死在本关的剧本） | 无（写死在插件里） |
| 增强（enhance） | `enhance: [{types, fields}]` | 给**已有物体类型**加属性（如"延迟出现"） | **物体属性面板**（和"常燃/初始沉淀"并列） |
| 组件（components） | `components: [...]` | 注册**新的可放置物体**（蹦床/显示牌…） | **物体属性面板**（组件自己的 fields） |

一个插件可以同时声明多种形态（比如既给灯加"延迟出现"属性、又注册新组件）。

## 2. 文件格式

```js
// @@chezzle-plugin
// {
//   "name": "延迟出现",
//   "version": "1.0",
//   "api": 1,
//   "description": "给灯/物块增加「延迟出现(秒)」属性",
//   "enhance": [
//     { "types": ["lamp", "blastlamp", "block"],
//       "fields": [ { "key": "appearDelay", "label": "延迟出现(秒)", "kind": "number", "def": 0 } ] }
//   ]
// }
// @@end

Chezzle.Plugin.register('lampDelay', {
  run(scene, api) {
    // 遍历物体：遵循物体上的 appearDelay 字段
    for (const obj of Object.values(scene.byId)) {
      const d = Number(obj.appearDelay) || 0;
      if (d <= 0 || obj.hidden) continue;
      /* 隐藏 → scene.wait(d, () => scene.reveal(obj.id)) */
    }
  },
});
```

**约定（必须遵守）**：
- 顶层代码**只做 `Chezzle.Plugin.register(...)`**，不要有任何副作用（编辑器加载文件时会执行它来注册）。
- 元数据必须有 `name`；`fields/enhance/components` 按需声明。
- `run` 可返回清理函数（场景终止时调用）。

## 3. 字段类型（物体属性面板 / 组件字段全集）

`{ key, label, kind, def, options?, multiline? }`

| kind | 编辑器控件 | 说明 |
|---|---|---|
| `number` | 数字框 | `def` 默认值 |
| `text` | 文本框 | `multiline: true` 变多行 |
| `bool` | 复选框 | |
| `select` | 下拉 | 需要 `options: ['a','b']` |
| `color` | 颜色选择器 | `def: '#c78bff'` |
| `substance` | 物质下拉 | 引擎全部物质 |
| `solutes` | 溶质列表 | `id:mass, ...` |
| `idref` | 物体 id 下拉 | 引用关卡里的物体 |
| `rx` | 反应式文本 | 走引擎反应解析，无效红框提醒 |

增强字段的导出：只有**非默认值**才会写进导出脚本（`scene.byId['lamp1'].appearDelay = 10;`），插件 run 读取执行。

## 4. 运行时 API

`run(scene, api)` 在 **scene 构建完毕、主循环启动前**执行；返回函数 = 清理。

| 方法 | 说明 |
|---|---|
| `api.byId(id)` | 取物体 |
| `api.objects(type)` | 按构造器名过滤 |
| `api.addReaction(str)` | 注入自定义反应（最高优先级） |
| `api.tip(str)` | 顶部提示 |
| `api.time()` | 游戏时间（秒） |
| `api.wait(sec, fn)` / `api.after(fn)` / `api.interval(sec, fn)` | 游戏时间定时（受暂停控制），返回取消函数 |
| `api.onTick(fn)` | 每帧 `fn(dt, time)`；返回 `true` 自卸载，或手动卸载 |
| `api.onKeyDown/onKeyUp(fn)` | 任意键（含未映射键）；返回 `true` 视为已处理 |
| `api.on(name, fn)` | 场景事件（`'complete'`、多场景 `'enter'` 等） |
| `api.explode(...)` / `api.spawnParticles(...)` | 特效透传 |

**scene 是完整后门**：`scene.hidden`/`scene.reveal`/`addObject`/`removeObject`/
`customReactions`/`atmosphere` 与对象方法（`ignite/extinguish/open/onOpen`…）全部可用。
推荐用 api，但不设防——自由度就在这里。
大横幅引擎能力：`scene.showBanner('文字\n可多行', 4)`（屏幕中央大字，淡入淡出；
`scene.banner` 为 `{text,t,dur}` 数据，HUD 渲染，后弹顶掉前弹）。

## 5. 组件插件（v2：新可放置物体）

```js
// @@chezzle-plugin
// {
//   "name": "蹦床组件",
//   "version": "1.0",
//   "api": 1,
//   "components": [{
//     "type": "trampoline", "label": "蹦床", "color": "#ff5a4a", "defW": 80, "defH": 20,
//     "fields": [ { "key": "bounce", "label": "弹跳倍率", "kind": "number", "def": 1.7 } ],
//     "construct": (opts) => new Trampoline(opts)
//   }]
// }
// @@end

class Trampoline extends Chezzle.Obj {
  constructor(o = {}) {
    super({ x:o.x, y:o.y, w:o.w, h:o.h, mass:0, solid:true, physicsKind:'static', id:o.id ?? '' });
    this.bounce = o.bounce ?? 1.7;
  }
  update(dt, scene) { /* … */ }
  render(ctx) { /* … */ }
}
Chezzle.Plugin.register('trampoline', { components: [/* 如上 */] });
```

- 组件进编辑器目录后与内置物体同级：可拖放/缩放/属性编辑/初始隐藏/导出/试玩。
- 建议继承 `Chezzle.Obj`。`physicsKind`: `'static'`（可站）/ `'dynamic'`（可动实体）/ `'none'`（区域物）。
- `construct` 收到的 `opts` = 编辑器配置（`x,y,w,h,id` + 各字段值）。
- 编辑器里显示轻量占位（紫框+名称），试玩/导出时才是你的真实对象。
- 组件对象在画布上时才能被卸载插件（卸载会把它的对象一并移除，一次撤销可恢复）。

## 6. 编辑器工作流

1. 插件统一放仓库 **`plugin/`** 目录。手动加载：「🧩 插件」→「+ 加载插件文件」（可多选）。
   **加载即用于本关**（自动启用，可撤销）；「＋ 新建模块」不建文件直接写（存浏览器缓存）。
2. 插件面板**每行精简**：名字 版本 徽标（`🧱组件`/`🔧增强`/`🖊编辑器`）+「用于」开关 + ✎/✕；
   组件/增强/描述详情收进悬停 title，不占行。
3. 调参数：选中物体 → 属性面板（增强字段/组件字段都在那里）；定制逻辑：直接改插件源码。
4. **关卡 JSON 里保存插件清单**（`plugins:[{file,reg,name,enabled}]`）。加载 JSON 时**自动加载**：
   已加载 → 磁盘 `plugin/` 目录 → 浏览器缓存；**找不到 = 直接报错**（alert，不半加载）。
5. 试玩与导出共用同一注入管线（所见即所得）。导出 HTML 默认**嵌入插件源码**（单文件分发）。
6. 停用：取消「用于本关」；删除：点 `✕`（撤引用+组件+增强，一次撤销可全恢复）。
7. 「🗑 清空」= **卸载全部插件**：插件面板/组件/增强/私有状态全清（源码留缓存，
   Ctrl+Z 撤销可连同关卡车恢复）。

## 7. 编辑器插件：插件可以"改编编辑器"（章节/场景示例）

插件不只是改变游戏——`def.editor(ed)` 在插件加载时执行，可以给编辑器加 UI、挂导出钩子、
持久化自己的状态（这正是不常用功能（如多场景章节）的正确归宿——**编辑器不内建，插件实现**）。

```js
Chezzle.Plugin.register('chapters', {
  editor(ed) {
    // —— UI ——
    ed.addToolbarButton({ label: '📚 章节', title: '章节场景面板', onClick: () => panel.toggle() });
    const panel = ed.addPanel({ title: '📚 章节场景', html: '…' }); // 默认进「🧩 插件设置」区
    // —— 导出钩子：脚本生成时可追加/改写（fn(lines, ctx)，返回数组可整体替换）——
    ed.onExport((lines, ctx) => { lines.push('// 插件追加的一行'); });
    // —— 持久化状态（随存档/level.json 保存）——
    ed.state.scenes = ed.state.scenes ?? [];
    // —— 后门 ——
    ed.getState(); ed.snapshot(); ed.applySnapshot(snap); ed.sceneDsl(snap, 'a'); ed.save(); ed.refresh();
  },
});
```

| 方法 | 说明 |
|---|---|
| `addToolbarButton({label, title, onClick})` | 工具栏按钮 |
| `addToolbarElement(el)` | 工具栏任意元素（select 等复杂控件）；插在状态栏之前——试玩中换行/推挤不会让它跳动 |
| `addPanel({title, html, shelf?})` | 侧栏面板（返回元素，可自由填充/重绘）。**默认收进「🧩 插件设置」总折叠区**（侧栏只占一行；开合状态记住）。传 `shelf: false` 可留在侧栏顶层 |
| `onExport(fn)` | 导出脚本生成时调用：`fn(lines, ctx)`，往 lines 追加；返回新数组则整体替换 |
| `onPlayScene(fn)` | 默认试玩：场景构建后、插件注入前 `fn(scene)`——往 scene 写数据（如横幅剧本），与导出"数据行在 inject 之前"同一时机，**试玩所见 = 导出所得** |
| `onPlay(fn, mode)` | 试玩接管：`fn()` 返回 stop 函数=接管（整关/当前视图）；返回 null=让位（如单场景走默认试玩） |
| `setPlayMode(mode)` | 切换试玩方向：`'all'`（整关，默认）/ `'current'`（仅当前视图） |
| `onPlayState(fn)` | 试玩开始/结束回调 `fn(true/false)`——插件同步自己 UI（如「▶当前」变「⏹ 退出」） |
| `state` | 插件私有对象，随存档/level.json 持久化（`editorState` 字段） |
| `getState()` / `save()` / `refresh()` / `$(id)` | 编辑器后门（读状态/存储/刷新视图/取元素） |
| `snapshot()` / `applySnapshot(s)` | 画布快照（可序列化）与载入——多场景插件的场景存储基础 |
| `sceneDsl(snap, name)` | 快照 → `{chain, post, placed}`：M.scene(...) 链、构建后语句、重构对象（章节插件用它生成 Multiscene 脚本） |

### 模块创作台（编辑器内建，不建文件也能写模组）

「🧩 插件」页顶部 **「＋ 新建模块」**：三种模板起步（📜 纯逻辑剧本 / 🔧 属性增强 / 🧱 新组件），
弹层里直接改代码，`Ctrl+S` 保存即载入（自动"用于本关"）；已加载的每行有 **「✎」**：
查看/编辑源码，保存=**原地热重载**（「用于本关」开关与插件私有状态都保留；新代码注册失败自动回滚旧版）。
新建/编辑的模块与"加载插件文件"同一管线、同一缓存（刷新页面不丢），导出同样嵌入。

**官方示例 `plugin/chapters.js`**（章节场景，完整演示"改编编辑器"）：
- 顶边栏控件（不再占侧栏）：场景下拉 + ＋/✕（自动保存，无"存为场景"按钮）+ ★初始场景
  + 「大气」框（设置当前场景大气，如 `CO2:8`）+ 「▶当前」按钮（只看当前场景）；
- 给开关**增强**了「切到场景(id)」属性（属性面板填写即传送门）；
- 导出钩子在多场景时把脚本改写为 `Multiscene` + `switchTo(spawn)` 接线（`?.` 防失效引用），
  从★初始场景 start；单场景关卡完全不干预（默认导出不变）；
- 试玩接管：编辑器「试玩」= 整关（初始场景开始），可切"只玩当前场景"；
- 试玩中「▶当前」自动变「⏹ 退出」（点它=结束试玩），退出后「试玩中」状态栏自动复位。

## 8. 示例

| 文件 | 形态 | 内容 |
|---|---|---|
| `plugin/tutorial.js` | **新手引导模组** | 大横幅剧本（编辑器「📣 横幅剧本」面板排秒数，导出/试玩自动生效）+ 全类型「延迟出现(秒)」属性 + 玩家延迟出现 |
| `plugin/lampDelay.js` | 增强 | 给灯/物块等加「延迟出现(秒)」（参数在属性面板调） |
| `plugin/keys.js` | 纯逻辑 | 按键提示（定制型：写死 KeyE） |
| `plugin/trail.js` | 纯逻辑 | 玩家**身后持续喷光点**轨迹（onTick + Spark 装饰粒子） |
| `plugin/trampoline.js` | 组件 | 蹦床（编辑界面同游戏渲染；可拖拽定尺寸；落垫弹/垫上跳更高/走路不弹） |
| `plugin/liveSign.js` | 组件 | 显示牌（新物体，多行文字 + 边框色） |
| `plugin/chapters.js` | **编辑器插件** | 章节场景 v2：顶边栏管理、★初始场景、每场景大气、试玩接管、导出钩子 |
| `plugin/showtime.js` | **演出编排** | 声明式关卡演出：`enter/open/pos/win/at` 触发器 × 横幅/震屏/彩焰烟花/白光动作；🎬面板 JSON 编辑剧本 |
| `plugin/checkpoint.js` | **新手检查点** | 死亡自动回最近检查点+回满血+幽默横幅（支持多场景）；🗺面板配置 spawns/texts |
| `docs/examples/chapter.html` | 关卡 | 多场景章节示例（手动脚本版） |

## 9. 写插件注意点（每次都踩的坑）

### ① 面板防挤爆：默认收进「🧩 插件设置」区
`ed.addPanel` 默认收进侧栏顶部的「🧩 插件设置」总折叠区（整个插件区只占一行；
区/面板各自默认折叠，开合状态按标题记住）。`shelf: false` 可要求留在侧栏顶层。
侧栏是 220px 的窄列——插件面板再多也只占一行。
面板内容有上限：`.edPanel .pc-body` 最高 40vh、超出内部滚动；**不要**在面板里放
无限增长的列表/巨型 textarea（JSON 编辑框给 8~12 行即可，配合折叠）。

### ② 运行时配置必须走 `ed.pluginCfg(fn)`
插件在编辑器里配的数据（剧本/检查点/任何参数）**必须**经 `ed.pluginCfg(() => ({...}))`
交给运行时——`activePlugins()`（试玩/导出注入）只会带 `{name, cfg}`，
**你不声明，cfg 就是 `{}`，试玩/导出里什么都没有**（"JSON 版没横幅"就是这个坑：
插件配置在编辑器里改了，但配置根本流不进关卡）。
- `cfg` 必须是**纯数据**（JSON 可序列化；函数/对象引用会被导出丢失）；
- 多场景需要 `M` 时用**惰性函数**：`cfg.M = () => M`（构造期引用 M 是 TDZ 错误）。

### ③ 清空 = 卸载全部插件，数据真的清空
编辑器「🗑 清空」会**卸载全部插件**（面板/组件/增强/私有状态全清）+ **就地清空
editorStates**（保留插件闭包里的 st 引用——所以**不要**在 `onStateLoaded` 钩子里
偷偷把旧数据写回；清空后 st 是 `{}`，插件应重建默认值）。
示例：chapters 清空后场景列表归零，需要手动新建。
（Ctrl+Z 撤销：关卡车物体与插件引用恢复，源码从缓存回载；但插件私有数据已清，
需要重新配。）

### ④ 插件放 `plugin/` 目录，JSON 按引用自动加载
仓库根目录 `plugin/` 是插件唯一家。关卡 JSON 保存插件清单
（`plugins:[{file,reg,name,enabled}]`）——加载 JSON 时编辑器**自动加载**：
已加载 → `plugin/` 磁盘 → 浏览器缓存；**找不到直接报错**（alert，当前关卡不动）。
所以"编辑器里新建的模块"（只存浏览器缓存）随手保存成 `.js` 放回 `plugin/` 目录，
否则换台机器加载 JSON 会报"未找到"。
浏览器缓存只是源码副本 + 撤销兜底：被卸载的插件不引用就不会出现，没有"复活"问题。

### ⑤ 不要抢关卡的 `onOpen` 接线
`Switch._handlers.open` 是**单值**——插件的 `sw.onOpen(...)` 会覆盖关卡自己的接线
（灯列/大门/通关）。监听开关开启请用**轮询**（`scene.wait` 循环读 `effectiveOpen` 边沿），
参考 showtime 的 `open` 触发器实现。

### ⑥ 物体 id 必须全局唯一
`scene.byId` 是 `id → 物体` 的单键——路标和开关共用 `d_s1` 时 byId 会互相覆盖，
插件/接线拿到错的物体（`sw.onOpen is not a function` 就是路标被当成开关）。
编辑器同一场景内 id 冲突日志会提示；多场景之间才允许重复。

### ⑦ 多行文本导出要转义
`sign` 等文本物体在导出 DSL 里是 `'...'` 字符串——**换行必须转义成 `\n`**
（编辑器 `sceneDsl` 已处理；你自己在 `onExport` 钩子里追加含文本的行时同样留意
`\` → `\\`、`'` → `\'`）。

### ⑧ 导出钩子兼容单/多场景
多场景（chapters 接管）时导出脚本被**整体改写**为 Multiscene（没有 `const scene = L.build();`）。
`onExport` 里如果要往脚本里插"依赖单场景"的行，先探测：
`if (!lines.some((l) => l.includes('const scene = L.build();'))) return;`（tutorial.js 的做法）。

### ⑨ 面板 DOM 用返回值，别全局 querySelector
`ed.addPanel(...)` 返回面板元素——在里面 `panel.querySelector('#xxx')` 安全；
全局 `document.querySelector('#xxx')` 会被多个面板/编辑器的重复 id 误伤。
面板卸载时随 `editorDom` 自动移除（别再手动 remove）。

### ⑩ 插件状态随存档持久化
`ed.state` 自动随 `level.json` 存档/读档（`editorState.<reg>`），`ed.save()`/`ed.getState()` 读写。
**不要**把不可序列化的东西（DOM/函数）塞进 state；读档后 `ed.onStateLoaded(() => 重渲染面板)`。
