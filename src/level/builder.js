// ============================================================================
// 关卡 DSL：流式构建 Scene，末尾 build() 返回 Scene，start() 启动游戏循环。
// ============================================================================

import { Scene } from '../core/scene.js';
import { parseReactionStr } from '../chem/substances.js';
import { bindKeyboard } from '../core/input.js';
import { startLoop } from '../core/loop.js';
import { Plugins } from './plugins.js';
import { Renderer } from '../render/renderer.js';
import { Hud } from '../render/hud.js';
import { Floor } from '../objects/floor.js';
import { Pool } from '../objects/pool.js';
import { Block } from '../objects/block.js';
import { Deposit } from '../objects/deposit.js';
import { Player } from '../objects/player.js';
import { Switch } from '../objects/switch.js';
import { Key } from '../objects/key.js';
import { Door } from '../objects/door.js';
import { Lamp } from '../objects/lamp.js';
import { BlastLamp } from '../objects/blastlamp.js';
import { Beaker } from '../objects/beaker.js';
import { Rope } from '../objects/rope.js';
import { GasColumn } from '../objects/gascolumn.js';
import { Sign } from '../objects/sign.js';
import { Portal } from '../objects/portal.js';
import { GasDetector } from '../objects/gasdetector.js';
import { Extractor } from '../objects/extractor.js';
import { Dropper } from '../objects/dropper.js';
import { GasBottle } from '../objects/gasbottle.js';
import { bindSceneClick } from './click.js';
import { bindOverviewInput } from '../core/overview.js';
import { bindTouchUI } from '../core/touch.js';
import { attachRecorderPanel } from '../core/recorder.js';

export class LevelBuilder {
  constructor(canvas, opts = {}) {
    this.scene = new Scene(opts);
    this.renderer = new Renderer(canvas, { worldW: this.scene.worldW, worldH: this.scene.worldH });
    this.hud = new Hud(this.scene);
    this.scene.renderer = this.renderer;
  }

  floor(x, y, w, h, opts = {}) {
    return this.add(new Floor({ x, y, w, h, ...opts }));
  }

  pool(x, y, w, h, opts = {}) {
    return this.add(new Pool({ x, y, w, h, ...opts }));
  }

  block(x, y, opts = {}) {
    return this.add(new Block({ x, y, ...opts }));
  }

  /** 沉淀堆：直接放在地面的沉淀（默认低矮堆形、不可推动、不可被气流托起） */
  deposit(x, y, opts = {}) {
    return this.add(new Deposit({ x, y, ...opts }));
  }

  player(x, y, opts = {}) {
    return this.add(new Player({ x, y, ...opts }));
  }

  switch(x, y, opts = {}) {
    return this.add(new Switch({ x, y, ...opts }));
  }

  key(x, y, opts = {}) {
    return this.add(new Key({ x, y, ...opts }));
  }

  door(x, y, w, h, opts = {}) {
    return this.add(new Door({ x, y, w, h, ...opts }));
  }

  lamp(x, y, opts = {}) {
    return this.add(new Lamp({ x, y, ...opts }));
  }

  blastlamp(x, y, opts = {}) {
    return this.add(new BlastLamp({ x, y, ...opts }));
  }

  beaker(x, y, w, h, opts = {}) {
    return this.add(new Beaker({ x, y, w, h, ...opts }));
  }

  rope(x, y, opts = {}) {
    return this.add(new Rope({ x, y, ...opts }));
  }

  gas(x, y, w, h, opts = {}) {
    return this.add(new GasColumn({ x, y, w, h, ...opts }));
  }

  sign(x, y, text, opts = {}) {
    return this.add(new Sign({ x, y, text, ...opts }));
  }

  portal(x, y, opts = {}) {
    return this.add(new Portal({ x, y, ...opts }));
  }

  gasdetector(x, y, opts = {}) {
    return this.add(new GasDetector({ x, y, ...opts }));
  }

  extractor(x, y, opts = {}) {
    return this.add(new Extractor({ x, y, ...opts }));
  }

  dropper(x, y, opts = {}) {
    return this.add(new Dropper({ x, y, ...opts }));
  }

  gasbottle(x, y, opts = {}) {
    return this.add(new GasBottle({ x, y, ...opts }));
  }

  add(obj) {
    if (!obj.origin) obj.origin = { kind: 'level' }; // 关卡预设物体：来源=关卡生成
    this.scene.addObject(obj);
    return this;
  }

  /** 关卡自定义反应（最高优先级，覆盖内置反应）：'Cu + FeCl3 → CuCl2 + FeCl2' */
  reaction(str) {
    const rule = parseReactionStr(str);
    if (rule) this.scene.customReactions.push(rule);
    return this;
  }

  /** 插件组件（v2）：按 type 实例化插件注册的组件并放入场景。
   *  组件对象由插件 construct(opts) 创建——需实现引擎对象契约（Obj 子类或 update/render）。 */
  pluginObj(type, opts = {}) {
    const obj = Plugins.create(type, opts);
    if (!obj) throw new Error(`插件组件未注册: ${type}`);
    return this.add(obj);
  }

  /**
   * @deprecated 调试模式改用 URL 参数开启：`levels/xxx.html?debug=1`。
   * 本方法保留兼容（旧关卡脚本链式调用不报错），但**不再生效**——
   * 调试开关从"写死在关卡文件"变为"打开页面的诉求"，方便随时开关。
   */
  debugmode() {
    return this;
  }

  setTip(s) {
    this.scene.tip = s;
    return this;
  }

  /** 条件提示列表（按顺序逐条触发，每条只触发一次）：
   *  [{ text:'走到左侧平台', when:{ mode:'and'|'any', items:[
   *       { type:'pos', x,y,w,h },                    // 玩家中心在矩形内
   *       { type:'inv', item:'K'|'bottle', has:true },// 物品栏 有/没有 某物
   *       { type:'seq', op:'>'|'<'|'>='|'<='|'==', n },// 下一条序号（从1起）满足比较
   *   ] } }]  mode 缺省 'and'（全部满足）；items 空 = 无条件立即触发。 */
  tips(arr) {
    for (const t of (arr ?? [])) {
      if (!t || typeof t.text !== 'string') continue;
      this.scene.tips.push({ text: t.text, when: t.when ?? { mode: 'and', items: [] } });
    }
    return this;
  }

  on(name, fn) {
    this.scene.on(name, fn);
    return this;
  }

  build() {
    // 注入相机（爆炸屏幕震动用）
    this.scene.camera = this.renderer.camera;
    // 调试模式：URL 参数 ?debug=1 开启（.debugmode() 已废弃，见下）
    if (typeof location !== 'undefined' && /[?&]debug=1/.test(location.search)) {
      this.scene.debugMode = true;
    }
    // 无玩家时相机聚焦关卡内容包围盒：否则显示世界中央，物体（滴管等）不在视口
    // 内——玩家看不到也点不到（"点击没反应"的根源）
    if (!this.scene.player) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const o of this.scene.objects) {
        if (!(o.w > 0) || !(o.h > 0)) continue;
        x0 = Math.min(x0, o.x);
        x1 = Math.max(x1, o.x + o.w);
        y0 = Math.min(y0, o.y);
        y1 = Math.max(y1, o.y + o.h);
      }
      if (x1 > -Infinity) {
        this.scene.cameraFocus = { x: x0 - 60, y: y0 - 40, w: x1 - x0 + 120, h: y1 - y0 + 80 };
      }
    }
    return this.scene;
  }

  /** 启动：状态→输入→点击（提示/选格）→触控（移动端）→鸟瞰输入→主循环 */
  start() {
    const scene = this.build();
    scene.status = 'running';
    scene.applyAppearDelays(); // 延迟出现（appearDelay>0 开局隐藏，到时显现+淡入）
    this.unbind = bindKeyboard(scene);
    this.bindClick();
    // 移动端触控（摇杆/按钮/拖动管线）；桌面端绑定但按 isTouchDevice 门槛空转
    this.touch = bindTouchUI(this.renderer.canvas, () => ({ scene: this.scene, hud: this.hud }));
    scene._touchUI = this.touch.ui;
    // 鸟瞰输入（灵魂出窍）：滚轮缩放 + 拖动平移（仅 scene.overview 时生效）
    this.unbindOverview = bindOverviewInput(this.renderer.canvas, () => ({ scene: this.scene }));
    // 操作录制/回放面板（开发工具：?record=1 显示；拖入录制的 .json 回放）
    if (typeof location !== 'undefined' && /[?&]record=1/.test(location.search)) {
      this.recorder = attachRecorderPanel(() => this.scene, this.renderer.canvas);
    }
    this.stop = startLoop(scene, this.renderer, { hud: this.hud });
    return scene;
  }

  bindClick() {
    const canvas = this.renderer.canvas;
    const scene = this.scene;
    const screenPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    };
    // 记录鼠标位置（调试模式悬停显示物体来源用）；离开画布清除
    const onMove = (e) => {
      if (!scene.debugMode) return;
      const { x, y } = screenPos(e);
      scene.mouse = { x, y, on: true };
    };
    const onLeave = () => {
      if (scene.mouse) scene.mouse.on = false;
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    // 点击：提示按钮 / 物品栏选格 / 场景内可点击物体（滴管等 onTap）
    bindSceneClick(canvas, screenPos, () => ({ scene: this.scene, hud: this.hud }));
  }
}
