// ============================================================================
// Multiscene：多场景（章节）关卡管理器。
// ----------------------------------------------------------------------------
// 一个关卡 = 多个独立 Scene（各自世界尺寸/物体/反应/插件），共享一条主循环，
// 任一时刻只推进/渲染"当前激活"的场景；切换即热切换（旧场景状态完整保留，
// 切回去时原样恢复——章节推进语义）。
//
// 用法（关卡脚本）：
//   const M = new Chezzle.Multiscene(container, { width:1100, height:700 });
//   M.scene('a').floor(...).player(...)...;        // 每个场景独立链式构建
//   M.scene('b').floor(...)...;
//   M.buildAll();                                   // 全部构建（含各场景插件注入）
//   M.byId('a','sw').onOpen(() => M.switchTo('b', { spawn:{x:60, y:100} }));
//   M.start('a');
//
// switchTo 语义：
//   - 默认 carryPlayer（把玩家对象搬去新场景：物品栏/身上物质/血量都保留；
//     新场景若自己摆了玩家则替换之，spawn 给坐标则重定位）；
//   - 旧场景完整保留，切回去即回到离开时的状态。
// ============================================================================

import { LevelBuilder } from './builder.js';
import { startLoop } from '../core/loop.js';
import { bindKeyboard } from '../core/input.js';
import { Plugins } from './plugins.js';
import { handleSceneClick } from './click.js';
import { bindTouchUI } from '../core/touch.js';
import { attachRecorderPanel } from '../core/recorder.js';

export class Multiscene {
  /**
   * @param container 容器元素（div 等），每个场景会获得一个叠放的 canvas（当前场景可见）
   * @param opts { width, height, plugins: [{name,cfg}]  全局注入每个场景的插件 }
   */
  constructor(container, opts = {}) {
    if (!container || typeof container !== 'object') throw new Error('Multiscene 需要容器元素');
    this.container = container;
    this.width = opts.width ?? 1100;
    this.height = opts.height ?? 700;
    this.plugins = opts.plugins ?? []; // 全局插件（注入每个场景）
    this.scenes = new Map();           // name -> { name, builder, scene, canvas, renderer, hud, plugins, built, active }
    this.current = null;               // 当前激活场景名
    this.switches = 0;                 // 切换计数（调试/插件用）
    this.hold = {};                    // 跨场景共享状态（关卡脚本/插件自由使用）
    this._stop = null;
    this._unbindKeys = null;
    this.onSwitch = null;              // (fromName, toName) => void（可再赋值）
    this._canvasFactory = opts.canvasFactory ?? null; // 测试注入
  }

  /** 创建/获取一个场景，返回其 LevelBuilder（链式 .floor(...).player(...)...） */
  scene(name, opts = {}) {
    if (this.scenes.has(name)) return this.scenes.get(name).builder;
    const canvas = this._makeCanvas();
    const builder = new LevelBuilder(canvas, { worldW: opts.worldW, worldH: opts.worldH });
    const entry = {
      name,
      builder,
      scene: null,
      canvas,
      renderer: builder.renderer,
      hud: builder.hud,
      plugins: opts.plugins ?? null, // null = 用全局 this.plugins
      built: false,
      active: false,
    };
    this.scenes.set(name, entry);
    this._bindClick(entry); // 每个场景画布的鼠标（提示按钮/物品栏选格/调试悬停）
    // 移动端触控（摇杆/按钮/拖动管线；桌面端按 isTouchDevice 门槛空转）
    const activeOf = () => (this.current === entry.name && entry.active ? { scene: entry.scene, hud: entry.hud } : null);
    entry.touch = bindTouchUI(canvas, activeOf);
    return builder;
  }

  /** 与 LevelBuilder.bindClick 一致：提示按钮（右上）+ 物品栏选格（右下）+ 调试悬停 */
  _bindClick(entry) {
    const canvas = entry.canvas;
    const screenPos = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height),
      };
    };
    const activeOf = () => (this.current === entry.name && entry.active ? entry : null);
    const onMove = (e) => {
      const cur = activeOf();
      if (!cur?.scene?.debugMode) return;
      cur.scene.mouse = { ...screenPos(e), on: true };
    };
    const onLeave = () => {
      const cur = activeOf();
      if (cur?.scene?.mouse) cur.scene.mouse.on = false;
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', (e) => {
      const cur = activeOf();
      if (!cur || !cur.hud) return;
      const { x, y } = screenPos(e);
      // 提示按钮 / 物品栏选格 / 场景内可点击物体（滴管等 onTap）——与单场景同一管线
      handleSceneClick(cur.scene, cur.hud, canvas, x, y);
    });
  }

  _makeCanvas() {
    const canvas = this._canvasFactory
      ? this._canvasFactory()
      : document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.display = 'none';
    this.container.appendChild(canvas);
    return canvas;
  }

  /** 构建全部场景（build + 插件注入）。返回 name -> scene 映射。 */
  buildAll() {
    const out = {};
    for (const [name, e] of this.scenes) {
      if (e.built) continue;
      e.scene = e.builder.build();
      e.scene.status = 'running';
      // 移动端触控挂载点：HUD 渲染读取 + 相机移动端视野
      e.scene._touchUI = e.touch?.ui ?? null;
      if (e.touch && e.touch.ui.enabled()) e.touch.ui.refresh();
      // 插件注入：场景级（scene(name,{plugins})) 优先于全局
      const entries = e.plugins ?? this.plugins;
      Plugins.inject(e.scene, entries);
      e.built = true;
      out[name] = e.scene;
    }
    return out;
  }

  byName(name) {
    return this.scenes.get(name)?.scene ?? null;
  }

  /** 便捷：取场景内物体 scene.byId */
  byId(name, id) {
    return this.scenes.get(name)?.scene?.byId?.[id] ?? null;
  }

  /** 启动：从指定场景开始（共享主循环） */
  start(name) {
    this.buildAll();
    const e = this.scenes.get(name);
    if (!e) throw new Error(`场景不存在: ${name}`);
    e.canvas.style.display = 'block';
    e.active = true;
    this.current = name;
    this._unbindKeys = bindKeyboard(e.scene);
    // 操作录制/回放面板（开发工具：?record=1 显示；拖入录制的 .json 回放）
    if (typeof location !== 'undefined' && /[?&]record=1/.test(location.search)) {
      this.recorder = attachRecorderPanel(() => {
        const a = this.scenes.get(this.current);
        return a && a.active ? a.scene : null;
      }, this.container);
    }
    this._stop = startLoop(() => {
      const a = this.scenes.get(this.current);
      return a && a.active ? { scene: a.scene, renderer: a.renderer, hud: a.hud } : null;
    });
    return this;
  }

  /** 切换到场景 name */
  switchTo(name, opts = {}) {
    const e = this.scenes.get(name);
    if (!e || !e.built) throw new Error(`场景不存在或未构建: ${name}`);
    if (this.current === name && e.active) return this;
    const from = this.scenes.get(this.current);
    if (from && from.active) {
      from.active = false;
      // 场景切换时清空旧场景的持续输入（键盘/摇杆按住未抬起会泄漏到切回时）
      if (from.scene) {
        from.scene.control.clear();
        from.scene.pressed.clear();
        if (from.touch) from.touch.ui.releaseAll();
      }
    }
    if (from) from.canvas.style.display = 'none';

    if (opts.carryPlayer !== false) {
      const carriedObj = from?.scene?.player ?? null;
      if (carriedObj) {
        // 玩家对象整体搬移：物品栏/身上物质/血量全保留
        const target = e.scene.player;
        if (target && target !== carriedObj) e.scene.removeObject(target); // 替换占位玩家
        if (e.scene.byId[carriedObj.id] && e.scene.byId[carriedObj.id] !== carriedObj) {
          carriedObj.id = `${carriedObj.id}_carry${this.switches}`;
        }
        from.scene.removeObject(carriedObj);
        if (opts.spawn) {
          carriedObj.x = opts.spawn.x;
          carriedObj.y = opts.spawn.y;
          if (carriedObj.vel) { carriedObj.vel.x = 0; carriedObj.vel.y = 0; }
        }
        e.scene.addObject(carriedObj);
      }
    } else if (opts.spawn && e.scene.player) {
      e.scene.player.x = opts.spawn.x;
      e.scene.player.y = opts.spawn.y;
    }

    e.canvas.style.display = 'block';
    e.active = true;
    this.current = name;
    this.switches++;
    // 键盘事件转发切换（bindKeyboard 绑定的是旧场景）
    if (this._unbindKeys) this._unbindKeys();
    this._unbindKeys = bindKeyboard(e.scene);
    e.scene.fire('enter', { from: from?.name ?? null, switches: this.switches });
    if (this.onSwitch) this.onSwitch(from?.name ?? null, name);
    return this;
  }

  /** 关闭管理器（停止循环、解除键盘绑定） */
  stop() {
    if (this._stop) this._stop();
    this._stop = null;
    if (this._unbindKeys) this._unbindKeys();
    this._unbindKeys = null;
  }
}
