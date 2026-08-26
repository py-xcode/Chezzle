// ============================================================================
// 插件系统：把"关卡额外逻辑"做成可加载、可配置、可导出的 JS 插件。
// ----------------------------------------------------------------------------
// 插件 = 一个 JS 文件：
//   - 文件头带 @@chezzle-plugin 元数据注释块（编辑器不执行代码即可展示/配置）；
//   - 代码调用 Chezzle.Plugin.register('name', def) 注册运行时定义。
// 运行时注入点：scene 构建完毕、主循环启动之前 —— Chezzle.Plugin.inject(scene, entries)。
// 插件约定：顶层代码只做 register（不要产生副作用）；行为写在 def.run(scene, api, cfg) 里。
// ============================================================================

import { parseReactionStr } from '../chem/substances.js';

const registry = new Map(); // name -> def

/** 给插件/关卡脚本的稳定 API 面（scene 本身仍可裸访问，那是不设防的后门） */
function makeApi(scene) {
  return {
    scene,
    /** 按 id 取物体 */
    byId: (id) => scene.byId[id],
    /** 按类型取当前场景物体（对象构造器名，如 'Lamp'；或用 'typeName' 字段） */
    objects: (type) => scene.objects.filter((o) => o.typeName === type || o.constructor?.name === type),
    /** 注入自定义反应（最高优先级，覆盖内置反应）；返回是否解析成功 */
    addReaction: (str) => {
      const rule = parseReactionStr(str);
      if (rule) scene.customReactions.push(rule);
      return !!rule;
    },
    /** 修改关卡提示（HUD 顶部） */
    tip: (s) => { scene.tip = s; },
    /** 游戏时间秒（受调试暂停控制） */
    time: () => scene.time,
    /** 便捷：等待/每帧/下一帧/周期（同 scene 同名方法） */
    wait: scene.wait.bind(scene),
    after: scene.after.bind(scene),
    interval: scene.interval.bind(scene),
    onTick: scene.onTick.bind(scene),
    onKeyDown: scene.onKeyDown.bind(scene),
    onKeyUp: scene.onKeyUp.bind(scene),
    /** 场景事件（'complete' 等）：scene.on(name, fn) */
    on: scene.on.bind(scene),
    /** 播放特效（火星/爆炸/粒子…对应引擎能力） */
    spawnParticles: scene.spawnParticles.bind(scene),
    explode: scene.explode?.bind(scene) ?? (() => {}),
  };
}

export const Plugins = {
  /** 注册一个插件定义。def: { run(scene,api,cfg)?, components?: [...] } */
  register(name, def = {}) {
    registry.set(name, def);
    return def;
  },

  get(name) {
    return registry.get(name);
  },

  has(name) {
    return registry.has(name);
  },

  list() {
    return [...registry.entries()].map(([name, def]) => ({ name, def }));
  },

  /** 全部已注册名（编辑器加载插件后 diff 用：确定该文件注册了哪个名字） */
  names() {
    return [...registry.keys()];
  },

  /** 运行一个插件：run(scene, api, cfg)。返回 run 的返回值（可以是清理函数） */
  call(name, scene, cfg = {}) {
    const def = registry.get(name);
    if (!def || typeof def.run !== 'function') return null;
    const r = def.run(scene, makeApi(scene), cfg ?? {});
    return typeof r === 'function' ? r : null;
  },

  /**
   * 关卡注入点（scene 构建后、start 前调用）：
   * entries = [{ name: 'lampDelay', cfg: { ... } }, ...]
   * 返回一个清理函数（在场景终止时调用）。
   */
  inject(scene, entries = []) {
    const cleanups = [];
    for (const e of entries) {
      if (!e || !e.name) continue;
      const def = registry.get(e.name);
      if (!def) continue; // 插件未加载/已注册名不匹配：静默跳过（不同关卡可共享同一插件集）
      try {
        const r = def.run ? def.run(scene, makeApi(scene), e.cfg ?? {}) : null;
        if (typeof r === 'function') cleanups.push(r);
      } catch (err) {
        // 插件运行时错误：记录但绝不拖垮游戏循环
        if (typeof console !== 'undefined') console.error(`[plugin:${e.name}]`, err);
      }
    }
    return () => {
      for (const c of cleanups) {
        try { c(); } catch (err) { /* 同上 */ }
      }
    };
  },

  // ---------------------------------------------------------------------------
  // v2：组件（插件可注册"新的可放置物体"，编辑器目录/属性/导出成为一等公民）
  // ---------------------------------------------------------------------------

  /** 按 type 实例化一个插件组件（缺 type 定义时返回 null） */
  create(type, opts = {}) {
    for (const [, def] of registry) {
      for (const comp of def.components ?? []) {
        if (comp.type === type && typeof comp.construct === 'function') {
          const obj = comp.construct(opts);
          if (obj && !obj.origin) obj.origin = { kind: 'plugin', plugin: comp.type };
          return obj;
        }
      }
    }
    return null;
  },

  /** 全部已注册组件的声明（编辑器据此渲染目录/属性面板） */
  components() {
    const out = [];
    for (const [plugin, def] of registry) {
      for (const c of def.components ?? []) out.push({ plugin, ...c });
    }
    return out;
  },

  // ---------------------------------------------------------------------------
  // 元数据：解析插件源码头部的 @@chezzle-plugin 注释块（编辑器展示/配置用，不执行代码）
  // ---------------------------------------------------------------------------

  /**
   * 解析源码中的元数据块：
   *   // @@chezzle-plugin
   *   // { "name": "延迟出现", "api": 1, "fields": [...], "components": [...] }
   *   // @@end
   * 返回对象或 null。
   */
  parseMeta(src) {
    if (typeof src !== 'string') return null;
    const m = src.match(/@@chezzle-plugin\s*([\s\S]*?)\s*@@end/);
    if (!m) return null;
    const text = m[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\/\/\s?/, '').replace(/^\s*\*+\s?/, ''))
      .join('\n')
      .trim();
    try {
      const meta = JSON.parse(text);
      return meta && typeof meta === 'object' ? meta : null;
    } catch (err) {
      return null;
    }
  },
};

/** 单数别名：插件文件/关卡脚本里习惯写 Chezzle.Plugin.register(...) */
export const Plugin = Plugins;
