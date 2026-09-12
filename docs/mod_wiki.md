# Chezzle 模组（插件）写法百科

> 依据源码 src/level/plugins.js、plugin/ 目录官方示例与 docs/plugin-api.md 整理。
> 编辑器本体为 tools/leveleditor.html（单文件）；运行时插件 API 见下。

## 1. 模组是什么
插件 = 一段注册到 Chezzle.Plugin 的 JS 模块，为**单个关卡**（或编辑器）添加：
- 纯逻辑：定时/按键/自定义反应/剧本（写死在插件里）；
- 属性增强（enhance）：给已有物体类型增加可配置字段（参数出现在**物体属性面板**）；
- 新组件（components）：注册可在编辑器里拖放的新物体；
- 编辑器扩展（editor）：改工具栏/侧栏/导出钩子（章节、演出编排等）。

## 2. 文件与元数据
插件放在仓库 plugin/ 目录（关卡 JSON 按 plugins:[{file,reg,name,enabled}] 引用；
加载 JSON 时编辑器按：已加载 → plugin/ 磁盘 → 浏览器缓存 顺序自动加载，找不到会报错）。
头部元数据注释块（编辑器读取，不执行代码即可展示/配置）：

```js
// @@chezzle-plugin
// {
//   "name": "延迟出现",
//   "version": "1.0",
//   "api": 1,
//   "description": "……",
//   "enhance": [
//     { "types": ["lamp","blastlamp","block","deposit","player"],
//       "fields": [ { "key": "appearDelay", "label": "延迟出现(秒)", "kind": "number", "def": 0 } ] }
//   ]
// }
// @@end
```

字段 kind 全集：number / text(multiline) / bool / select(options) / color / substance /
solutes(id:mass,…) / idref(场景物体下拉) / rx(反应式，引擎解析校验)。
增强字段导出时只写**非默认值**（scene.byId['x'].appearDelay = 10;），插件 run 读取执行。

**铁律**：顶层代码只做 Chezzle.Plugin.register(...)，无其它副作用；run 可返回清理函数。

## 3. 运行时注册与 API（src/level/plugins.js 实测）

```js
Chezzle.Plugin.register('myPlugin', {
  run(scene, api, cfg) { /* scene 构建完毕、主循环启动前执行 */ }
});
// 导出别名：Chezzle.Plugin === Chezzle.Plugins
```

Plugins 注册表方法：register(name, def) / get / has / list() / names() / call(name, scene, cfg) /
inject(scene, entries)（返回清理函数闭包）。inject 对未注册插件静默跳过；run 抛错被捕获
并 console.error，不会拖垮主循环。

运行时 api（makeApi(scene) 的稳定面；scene 本身是"不设防后门"，两者混用自由）：

| api | 说明 |
|---|---|
| byId(id) | 取物体 |
| objects(type) | 按构造器名/typeName 过滤 |
| addReaction(str) | 注入 L0 自定义反应（最高优先级，覆盖内置），失败返回 false |
| tip(str) | 顶部提示 |
| time() | 游戏时间（秒，受调试暂停控制） |
| wait/after/interval/onTick/onKeyDown/onKeyUp | 游戏时间钩子；返回取消函数；onTick 回调返回 true 自卸载 |
| on(name, fn) | 场景事件（'complete'、多场景 'enter'、'overview'、'tip'…） |
| explode(...)/spawnParticles(...) | 特效透传 |

scene 后门常用：hidden/reveal/addObject/removeObject/removeItem/addItem/customReactions/
atmosphere/showBanner(text,dur)/onReaction/conditionsFor… 与对象方法 ignite/extinguish/
open/onOpen。

### 钩子语义要点（源码 scene.js）
- _tickFns 每帧先快照再执行，回调内取消（fn._czlDead 或返回 true）本帧生效；
- wait/interval 基于 game time：暂停（F5/overview）即停；fn 内新 wait 的 timer 下一帧才触发；
- interval 是 while 追赶式（无每帧上限护栏）。

### 组件写法（v2）

```js
Chezzle.Plugin.register('trampoline', {
  components: [{
    type: 'trampoline', label: '蹦床', color: '#ff5a4a', defW: 80, defH: 20,
    fields: [{ key: 'bounce', label: '弹跳倍率', kind: 'number', def: 1.7 }],
    construct: (opts) => new Trampoline(opts),   // opts 含 x,y,w,h,id + 各字段值
  }],
});
// 类继承 Chezzle.Obj；physicsKind: 'static'|'dynamic'|'none'
```

组件对象在编辑器画布上时才能被卸载插件（卸载会把它的对象一并移除）。

## 4. 官方示例插件（plugin/）
- tutorial.js：新手引导——大横幅剧本（编辑器"横幅剧本"面板排秒）+ 全类型"延迟出现"
  增强 + 玩家延迟出现；
- lampDelay.js：增强示例（延迟出现，参数在属性面板；run 遍历 byId 隐藏+wait+reveal）；
- keys.js：按键提示（纯逻辑）；trail.js：玩家身后喷光点（onTick+Spark）；
- trampoline.js / liveSign.js：组件示例（蹦床 / 显示牌）；
- chapters.js：**编辑器插件**（多场景章节：顶边栏、场景大气、增强"切到场景"属性、
  导出改写 Multiscene、试玩接管）；
- showtime.js：演出编排（触发器×动作表单化）；checkpoint.js：检查点（死亡回档+横幅）。
docs/plugin-api.md 第 8-10 节有每例功能说明与"每次踩的坑"（面板防挤爆、pluginCfg 透传、
id 全局唯一、不要抢 onOpen 单值接线、多行文本转义、导出钩子兼容单/多场景等），写插件前必读。

## 5. 最小可用示例（跑通链路）
```js
// @@chezzle-plugin
// { "name": "示例", "version": "1.0", "api": 1, "description": "每秒提示一次游戏时间" }
// @@end
Chezzle.Plugin.register('example', {
  run(scene, api) {
    return api.interval(1, () => { api.tip('t=' + api.time().toFixed(1)); });
  },
});
```
