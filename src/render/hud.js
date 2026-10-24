// ============================================================================
// HUD（神话·元素风）：
// 左上 信息卡（双端统一单卡：物质/体质 + 身体组成 + 大气一行；触屏半透明）；
// 右上 ⛶全屏（触屏）/ 鸟瞰 / 提示按钮（触屏端整体下移避让悬浮钮/系统按钮）；
// 右下 5 格宝石物品栏（选中发光）；通关/死亡神话遮罩；"最近反应"仅调试模式。
// 鸟瞰（灵魂出窍）：暂停模拟，整关自由缩放/平移——HUD 只留"返回"按钮 + 操作提示。
// ============================================================================

import { THEME, rr, para, panel, glowText, clearText } from './theme.js';
import { getSubstance, acidLabelOf, displayName } from '../chem/substances.js';
import { MIN_ENTRY } from '../chem/solution.js';
import { solutionColor } from './liquidrender.js';
import { CFG } from '../core/config.js';
import { GasColumn } from '../objects/gascolumn.js';
import { Block } from '../objects/block.js';
import { inventorySlotRects, uiMargins, overviewButtonRect, fullscreenButtonRect, restartButtonRect, restartMenuLayout, hudTopOffset, touchInsetsOf, compactView, tinyView, tipPanelRect } from '../level/click.js';
import { joyGeom, touchButtonRects } from '../core/touch.js';
import { fullscreenSupported } from '../core/fullscreen.js';
import { Savepoint } from '../core/savepoint.js';
import { canvasLW, canvasLH, canvasTransformDpr, uiScaleOf } from './canvas.js';
import { drawFaded } from './fade.js';
import { hexToRgb } from './color.js';
import { carryActionsOf } from '../level/items.js';
import { actionKeyLabel } from '../core/prefs.js';

/** 十六进制色 + 透明度 → rgba 字符串（HUD 物品缩略图共用） */
function rgbaOf(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

// 溯源 kind → 中文（调试悬停显示物体"为何存在"）
const ORIGIN_LABELS = {
  level: '关卡生成',
  reaction: '反应生成',
  explosion: '爆炸掉落',
  place: '玩家放置',
  shell: '移动脱落',
  dissolve: '溶解',
};

// 大气中的非常驻气体 → 显示色（燃料气爆鸣预警等；airPanel/紧凑卡共用）
const GAS_COLORS = {
  CO: '#ffb86b', H2: '#9adcff', CH4: '#a8ff9a', H2S: '#ffd9a0',
  NO: '#cfe3f7', NO2: '#e08b57', SO2: '#ffd98a', Cl2: '#b9f26b', NH3: '#b9a9ff',
};
const EXTRA_GAS_IDS = ['CO', 'H2', 'CH4', 'H2S', 'NO', 'NO2', 'SO2', 'Cl2', 'NH3'];

// 提示按钮的俏皮话：完全没有提示的关卡 / 有提示但时机未到（点击时随机抽取）
const QUIPS_NONE = [
  '这么简单的关卡还需要提示？',
  '没有提示！！自己想！！',
  '这关不需要提示，冲就完了！',
  '提示？不存在的！',
  '自己想吧！',
];
const QUIPS_WAIT = [
  '提示时机还不对呢~自己多想想再来看看',
  '时机未到，再探索探索吧',
  '现在还不到给提示的时候，先自己想想',
  '再等等——再过会儿说不定就有了',
];

// 死亡文案（死亡界面；{sub}=玩家核心物质，{b}=反应伙伴物质；随机抽取）
const DEATH_VOID = [
  '{sub}自走虚空',
  '{sub}和虚空娘在异世界相遇',
  '{sub}坠机了',
  '{sub}走路没看路',
  '{sub}被重力放逐了',
  '{sub}下去看星星了（没回来）',
];
// 飞升（冲出世界顶部：被气流托底/冲顶等）
const DEATH_SKY = [
  '{sub}赛博飞升了',
  '{sub}飘飘欲仙',
  '{sub}飞出了这个世界',
  '{sub}想飞的更高',
  '{sub}摸到天花了',
  '{sub}突破大气层（成功模式）',
];
const DEATH_ACID = [
  '{sub}和强酸{b}亲密接触',
  '{sub}发现了"泳池"是用强酸{b}做的',
  '{sub}泡澡选错了池子（强酸{b}）',
];
const DEATH_BASE = [
  '{sub}和强碱{b}亲密接触',
  '{sub}发现了"泳池"是用强碱{b}做的',
  '{sub}碱到发涩，被{b}送走了',
];
const DEATH_RX = [
  '{sub}与{b}不共戴天',
  '{sub}感受到了{b}的力量',
  '{sub}和{b}在异世界相遇',
  '{sub}被{b}制裁了',
];
// 水中毒（玩家与水的反应致死——如活泼金属遇水；独立一类，文案最贴切）
const DEATH_WATER = [
  '{sub}水中毒了',
  '{sub}泡了个要命的水澡（H2O）',
  '{sub}把自己溶进水里了',
  '{sub}和水谈了个彻底的融合',
  '{sub}原地化成一池水',
];
const DEATH_RX_NOP = [
  '{sub}燃尽了最后一点存在',
  '{sub}把自己反应没了',
  '{sub}和这个世界告别了',
];

/** 死亡界面文案（随机抽取）：cause={ kind:'void'|'sky'|'acid'|'base'|'reaction', partner }，
 *  sub=玩家核心物质（a），partner=反应致死物质（b）；partner=H2O → 水中毒类。 */
export function deathQuip(cause, sub) {
  const kind = cause && cause.kind;
  const b = cause && cause.partner ? cause.partner : '';
  const fill = (s) => (typeof s === 'string' && s ? s : '神秘物质');
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  let t;
  if (kind === 'void') t = pick(DEATH_VOID);
  else if (kind === 'sky') t = pick(DEATH_SKY);
  else if (b === 'H2O') t = pick(DEATH_WATER);
  else if (kind === 'acid') t = b ? pick(DEATH_ACID) : pick(DEATH_RX_NOP);
  else if (kind === 'base') t = b ? pick(DEATH_BASE) : pick(DEATH_RX_NOP);
  else if (kind === 'reaction') t = b ? pick(DEATH_RX) : pick(DEATH_RX_NOP);
  else t = pick(DEATH_RX_NOP);
  return t.replace('{sub}', fill(sub)).replace('{b}', b);
}

/** 大横幅淡入淡出包络：age=已显示秒数，dur=总时长 → alpha 0..1。
 *  淡入/淡出各 min(0.5, dur/3) 秒，中段全亮；age 越界为 0。 */
export function bannerEnvelope(age, dur) {
  const d = Math.max(0.6, Number(dur) || 4);
  if (age < 0 || age > d) return 0;
  const fade = Math.min(0.5, d / 3);
  return Math.max(0, Math.min(1, Math.min(1, age / fade) * Math.min(1, (d - age) / fade)));
}

export class Hud {
  constructor(scene) {
    this.scene = scene;
    this.showTip = false;
    this.slotSize = 46; // 旧版统一槽宽（现为兼容字段；实际几何走 inventorySlotRects）
    // 选中物品说明面板：切换格子的淡入/淡出动画状态（只存快照，不影响游戏逻辑）
    this._infoKey = null;   // 当前显示的 "槽位:物品类型"（空 = 没选物品）
    this._infoCur = null;   // 当前面板快照（数据 + 布局）
    this._infoPrev = null;  // 切换前旧面板快照（用于淡出）
    this._infoT = 0;        // 本次切换的起始时间（scene time）
  }

  /** 当前是否触屏端（移动端 HUD 压缩/全屏按钮都以它为准） */
  _isTouch() {
    const t = this.scene._touchUI;
    return !!(t && typeof t.enabled === 'function' && t.enabled());
  }

  /** 鸟瞰切换进度（0=正常画面，1=鸟瞰）：与 Camera.overviewMix 同源并做 ease */
  _overviewMix() {
    const c = this.scene && this.scene.camera;
    const raw = c && Number.isFinite(c.overviewMix) ? c.overviewMix : (this.scene && this.scene.overview ? 1 : 0);
    const t = Math.max(0, Math.min(1, raw));
    return t * t * (3 - 2 * t);
  }

  /** 正常画面的 HUD（单独抽出：鸟瞰切换时先画到离屏层再整体淡出，
   *  这样玩家面板/物品栏等自带 globalAlpha 的元素也能一起平滑淡出）。
   *  W/H 为 **HUD 坐标空间**（= 真实逻辑尺寸 / uiK；见 render） */
  _drawNormal(ctx, scene, p, W, H, time) {
    const uiK = this._uiK || 1;
    if (p && !p.hidden) {
      // 左上信息卡（双端统一紧凑单卡）：物质/体质 + 身体组成 + 大气一张卡解决；
      // 移动端面板体降透明（CFG.touch.hudAlpha），桌面不透明
      this.playerPanelCompact(ctx, p, scene, time, hudTopOffset(scene, uiK));
      // 最近反应本就是调试信息：非调试模式不显示（双端一致）
      if (scene.debugMode) this.reactionPanel(ctx, p);
      this.inventory(ctx, p, W, H, time);
    }
    this.debugPanel(ctx, scene, W, H, time);
    if (scene.debugMode) this.hoverPanel(ctx, scene, W, H);
    const top = hudTopOffset(scene, uiK);
    const right = touchInsetsOf(scene, uiK).right || 0;
    this.viewButton(ctx, W, top, right);
    // 全屏按钮：仅在"触屏端 **且** 这台设备真的支持全屏"时画。
    // 不支持（iPhone 上的 Safari 全系不支持元素全屏）时它只会白占一个按钮位，
    // 点下去还弹一句"此浏览器不支持全屏"——极窄屏上寸土寸金，直接不画。
    if (this._isTouch() && fullscreenSupported()) this.fsButton(ctx, W, top, right);
    // 重开按钮：右上按钮排最左（单击记时刻，400ms 内双击 = 打开重开菜单）
    this.restartButton(ctx, W, top, right);
    this.tipButton(ctx, W, top, right, time);
    this.notice(ctx, scene, W, H, time);
    this.bigBanner(ctx, scene, W, H, time);
    this.touchControls(ctx, scene, W, H, time);
    // 存档点提示（Savepoint.toast 写入 scene._saveToast）画在左上信息卡下方
    this.saveToast(ctx, scene, top);
  }

  /** 鸟瞰淡出用的离屏层（尺寸跟随画布；无 DOM 环境返回 null → 直接画，不淡出） */
  _hudLayer(W, H, dpr) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    let c = this._layer;
    if (!c) c = this._layer = document.createElement('canvas');
    const bw = Math.max(1, Math.round(W * dpr));
    const bh = Math.max(1, Math.round(H * dpr));
    if (c.width !== bw) c.width = bw;
    if (c.height !== bh) c.height = bh;
    c._lw = W; // 让 HUD 里的 canvasLW/canvasLH/canvasTransformDpr 读到一致值
    c._lh = H;
    c._dpr = dpr;
    return c;
  }

  render(ctx, time = 0) {
    const scene = this.scene;
    const p = scene.player;
    // 屏幕空间 UI 以**逻辑像素**布局与绘制（基座乘 dpr）——否则 dpr>1 设备上
    // 68px 按钮按物理像素结算、显示只有 34px（"移动端 HUD 明显偏小"根因）。
    // ★ 桌面大屏再乘一个 HUD 放大系数 uiK（见 canvas.js uiScaleOf）：世界物体最多放大
    //   desktopScaleMax，而文字/面板再多放大一档，保证"内容不一定大、文字一定看得清"。
    //   画布坐标系整体缩放 kUi，布局使用换算后的 W/H（命中在 click.js 里同口径换算）。
    const realW = canvasLW(ctx.canvas);
    const realH = canvasLH(ctx.canvas);
    const uiK = uiScaleOf(ctx.canvas);
    const W = realW / uiK;
    const H = realH / uiK;
    const dpr = canvasTransformDpr(ctx.canvas) * uiK;
    this._uiK = uiK;
    this._uiW = W;
    this._uiH = H;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 条件提示：出现"可点击展示"的新提示 → 按钮闪光（提示只在点按钮时展示，
    // 不自动弹面板；点按钮后由 onTipClick 拉取/收起）
    if (scene.tipReady && this._tipReadyShown !== scene.tipReady) {
      this._tipReadyShown = scene.tipReady;
      this._tipFlash = time;
    }
    if (!scene.tipReady) this._tipReadyShown = null;

    // 鸟瞰（灵魂出窍）↔ 正常画面：镜头由 Camera 混合，HUD 交叉淡入淡出
    const mix = this._overviewMix();
    if (mix >= 0.999) {
      // 干净的全局视图——只画返回按钮/操作提示/玩家魂标
      this.overviewUI(ctx, scene, W, H, time);
      this.rotateHint(ctx, scene, W, H);
      this.restartMenu(ctx, scene, W, H, time);
      this.overlay(ctx, scene, W, H);
      ctx.restore();
      return;
    }
    if (mix <= 0.001) {
      this._drawNormal(ctx, scene, p, W, H, time);
    } else {
      const layer = this._hudLayer(W, H, dpr);
      if (layer) {
        const lctx = layer.getContext('2d');
        lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lctx.clearRect(0, 0, W, H);
        this._drawNormal(lctx, scene, p, W, H, time);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 - mix;
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      } else {
        this._drawNormal(ctx, scene, p, W, H, time);
      }
      ctx.save();
      ctx.globalAlpha = mix;
      this.overviewUI(ctx, scene, W, H, time);
      ctx.restore();
    }
    this.rotateHint(ctx, scene, W, H);
    this.restartMenu(ctx, scene, W, H, time);
    this.overlay(ctx, scene, W, H);
    ctx.restore();
  }

  // ---- 顶部按钮：鸟瞰（双端）/ 全屏（触屏）；y 走 hudTopOffset（触屏避让
  //      "返回选关"悬浮钮与 iOS 系统全屏关闭钮；渲染与命中同源）--------------

  /** 鸟瞰按钮（提示按钮左侧；桌面 V 键同效）。斜牌形状，与页面/选关的平行四边形一致 */
  viewButton(ctx, W, top = 10, right = 0) {
    const r = overviewButtonRect(W, top, right);
    ctx.save();
    para(ctx, r.x, r.y, r.w, r.h, 8);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#2a3a5e');
    g.addColorStop(1, '#141d38');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.water.light;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = THEME.water.light;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#bfe6ff';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('鸟瞰', r.x + r.w / 2, r.y + 23);
    ctx.textAlign = 'left';
  }

  /** 全屏按钮（仅触屏端；图标 ⛶。首次触点已自动请求全屏，此按钮供随时切换） */
  fsButton(ctx, W, top = 10, right = 0) {
    const r = fullscreenButtonRect(W, top, right);
    ctx.save();
    para(ctx, r.x, r.y, r.w, r.h, 8);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#2a3a5e');
    g.addColorStop(1, '#141d38');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(191,230,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#bfe6ff';
    ctx.font = '17px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⛶', r.x + r.w / 2, r.y + 23);
    ctx.textAlign = 'left';
  }

  /** 重开按钮（右上按钮排最左；图标 = 环形箭头）：斜牌底同全屏按钮（冷色底 +
   *  细青描边 + 轻辉光），图标用 canvas 矢量画"圆弧 + 金色箭头"的旋转箭头。
   *  单次点击只记时刻，400ms 内双击才打开重开菜单（见 click.js handleSceneClick）。 */
  restartButton(ctx, W, top = 10, right = 0) {
    const withFs = this._isTouch() && fullscreenSupported();
    const r = restartButtonRect(W, top, right, withFs);
    ctx.save();
    para(ctx, r.x, r.y, r.w, r.h, 8);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#2a3a5e');
    g.addColorStop(1, '#141d38');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(191,230,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(127,224,255,0.5)';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.restore();
    this._restartIcon(ctx, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
  }

  /** 重开图标：约 300° 的圆形弧（缺口在右上）+ 弧端切向的三角箭头。
   *  弧 = 青色（与全屏/鸟瞰按钮图标同色），箭头 = 金色（HUD 主强调色）。 */
  _restartIcon(ctx, cx, cy) {
    const R = 8.6;
    const a0 = -0.35;
    const a1 = 4.9; // 顺时针扫过 ≈301°，缺口停在右上方
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 外圈轻辉光（让弧在深色斜牌上浮起来）
    ctx.strokeStyle = 'rgba(127,224,255,0.28)';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.arc(0, 0, R, a0, a1);
    ctx.stroke();
    // 主弧（青）
    ctx.strokeStyle = '#bfe6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R, a0, a1);
    ctx.stroke();
    // 箭头（金）：弧终点处的切线方向 = 旋转方向（顺时针）
    const ex = R * Math.cos(a1);
    const ey = R * Math.sin(a1);
    const tx = -Math.sin(a1);
    const ty = Math.cos(a1);
    const nx = -ty;
    const ny = tx;
    ctx.beginPath();
    ctx.moveTo(ex + tx * 5.4, ey + ty * 5.4);
    ctx.lineTo(ex - tx * 1.6 + nx * 3.6, ey - ty * 1.6 + ny * 3.6);
    ctx.lineTo(ex - tx * 1.6 - nx * 3.6, ey - ty * 1.6 - ny * 3.6);
    ctx.closePath();
    ctx.fillStyle = '#ffd76a';
    ctx.shadowColor = 'rgba(255,215,106,0.75)';
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.restore();
  }

  /** 存档点提示（"已存档 / 已回到存档点"）：左上信息卡下方的小斜牌，金描边 +
   *  深紫渐变底 + 小金色对勾。淡入 ~0.16s，1.6s 后淡出；年龄按**墙钟**算
   *  （菜单/死亡暂停时游戏时钟会停，墙钟不会）。
   *  scene._saveToast = { text, at:墙钟ms, dur }（Savepoint.toast 写入）。 */
  saveToast(ctx, scene, top = 10) {
    const t = scene._saveToast;
    if (!t) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const age = now - t.at;
    const dur = Number(t.dur) > 0 ? Number(t.dur) : 1600;
    if (!(age >= 0) || age > dur) { // 过期：清掉（下一句提示重新创建）
      scene._saveToast = null;
      return;
    }
    const fadeIn = Math.min(1, age / 160);
    const fadeOut = Math.min(1, Math.max(0, (dur - age) / 380));
    const a = Math.max(0, Math.min(fadeIn, fadeOut));
    if (a <= 0.01) return;
    const uiK = this._uiK || 1;
    // 位置：左上信息卡正下方（信息卡左缘 + 10，卡底 + 8；_leftH 是卡的实际高度）
    const x = 10 / uiK + (touchInsetsOf(scene, uiK).left || 0) + 10;
    const leftH = Number.isFinite(this._leftH) && this._leftH > 0 ? this._leftH : 100;
    const y = top + leftH + 8;
    ctx.save();
    ctx.font = 'bold 12px "Segoe UI", "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(t.text).width;
    const h = 24;
    const w = tw + 26 + 14;
    ctx.restore();
    // 透明度走 drawFaded（带辉光的描边在 iPadOS WebKit 上不吃 globalAlpha；
    // 与 HUD 横幅/路标同一套离屏合成方案）
    drawFaded(ctx, a, (c) => {
      c.save();
      para(c, x, y, w, h, 7);
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, 'rgba(38,32,74,0.94)');
      g.addColorStop(1, 'rgba(14,11,36,0.94)');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(232,184,75,0.85)';
      c.lineWidth = 1.2;
      c.shadowColor = 'rgba(232,184,75,0.55)';
      c.shadowBlur = 8;
      c.stroke();
      c.shadowBlur = 0;
      // 小金色对勾（存档成功；不加说明文字）
      const mx = x + 16;
      const my = y + h / 2;
      c.strokeStyle = '#ffd76a';
      c.lineWidth = 2;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(mx - 4, my);
      c.lineTo(mx - 1, my + 3.5);
      c.lineTo(mx + 5, my - 4);
      c.stroke();
      c.font = 'bold 12px "Segoe UI", "Microsoft YaHei", sans-serif';
      c.fillStyle = '#ffe9b0';
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillText(t.text, x + 27, y + 16.5);
      c.restore();
    });
  }

  // ---- 鸟瞰（灵魂出窍）界面：返回按钮 + 操作提示（干净的全局视图）-----------

  overviewUI(ctx, scene, W, H, time) {
    const uiK = this._uiK || 1;
    const top = hudTopOffset(scene, uiK);
    // 返回按钮（命中几何走 overviewButtonRect，点击/触点均可退出）；与顶部按钮同款斜牌
    const r = overviewButtonRect(W, top, touchInsetsOf(scene, uiK).right || 0);
    ctx.save();
    para(ctx, r.x, r.y, r.w, r.h, 8);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#7a5a20');
    g.addColorStop(1, '#4a3410');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.gold.light;
    ctx.lineWidth = 2;
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('返回', r.x + r.w / 2, r.y + 23);
    // 操作提示
    const touch = this._isTouch();
    const hint = touch ? '鸟瞰 · 单指拖动平移 · 双指捏合缩放' : '鸟瞰 · 滚轮缩放 · 拖动平移 · V 返回';
    ctx.font = 'bold 13px "Segoe UI", "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(hint).width;
    para(ctx, W / 2 - tw / 2 - 14, top + 3, tw + 28, 28, 7);
    ctx.fillStyle = 'rgba(10,12,26,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,224,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#bfe6ff';
    ctx.fillText(hint, W / 2, top + 22);
    ctx.textAlign = 'left';
  }

  // ---- 移动端触控（摇杆 + 右下按钮；仅触屏设备绘制） ----
  touchControls(ctx, scene, W, H, time) {
    const ui = scene._touchUI;
    if (!ui || !ui.enabled()) return;
    if (scene.overview && this._overviewMix() >= 0.999) return; // 鸟瞰：触控改走平移/捏合手势，不画游戏控件
    const touch = ui.insets;
    ctx.save();
    // —— 左下：半透明半圆摇杆基座（直径贴底边）——
    const g = joyGeom(W, H, touch);    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.R, Math.PI, 0); // 上半圆
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 5 向刻度（上/左上/右上/左/右），激活方向高亮（随摇杆半径等比缩放）
    const tickOff = g.R * 0.91;
    const tickDot = Math.max(2.4, g.R * 0.041);
    const TICKS = [
      { ux: 0, uy: -1, on: () => ui.joy && ui.joy.dir.jump && !ui.joy.dir.left && !ui.joy.dir.right },
      { ux: -0.7071, uy: -0.7071, on: () => ui.joy && ui.joy.dir.jump && ui.joy.dir.left },
      { ux: 0.7071, uy: -0.7071, on: () => ui.joy && ui.joy.dir.jump && ui.joy.dir.right },
      { ux: -1, uy: 0, on: () => ui.joy && ui.joy.dir.left && !ui.joy.dir.jump },
      { ux: 1, uy: 0, on: () => ui.joy && ui.joy.dir.right && !ui.joy.dir.jump },
    ];
    for (const t of TICKS) {
      const tx = g.cx + t.ux * tickOff;
      const ty = g.cy + t.uy * tickOff;
      const active = t.on();
      ctx.beginPath();
      ctx.arc(tx, ty, active ? tickDot * 1.42 : tickDot, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'rgba(255,215,106,0.9)' : 'rgba(232,184,75,0.35)';
      ctx.fill();
    }
    // 摇杆球（吸附位置；未触摸时居中淡显）——半径/移动距离随摇杆大小等比缩放。
    // ★ ui.joy.sx/sy 是**手指相对圆心的像素偏移**（已按 R 截断、方向吸附过），不是单位向量；
    //   这里按摇杆球允许的行程夹取，否则大摇杆下偏移量远超屏幕 → 球被画到画布外（用户复现）。
    const knobR = Math.max(16, Math.round(g.R * 0.32));
    const knobMove = Math.max(0, g.R - knobR - 8);
    const ox = ui.joy ? ui.joy.sx : 0;
    const oy = ui.joy ? ui.joy.sy : 0;
    // 按**行程圆**整体缩放（逐轴截断会让斜向球心超出基座 → 球贴到圆外）
    const rawLen = Math.hypot(ox, oy);
    const klen = rawLen > knobMove && rawLen > 0.001 ? knobMove / rawLen : 1;
    const kx = ox * klen;
    const ky = oy * klen;
    ctx.beginPath();
    ctx.arc(g.cx + kx, g.cy + ky, knobR, 0, Math.PI * 2);
    ctx.fillStyle = ui.joy ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = ui.joy ? 'rgba(255,215,106,0.85)' : 'rgba(232,184,75,0.4)';
    ctx.lineWidth = ui.joy ? 2 : 1.2;
    ctx.stroke();
    // —— 右下：Q 拾取 / ⇧ 放置常驻；选中可拾取物品时上排出现该物品的操作键
    //     （烧杯=吸液/倒出，滴管=吸液/滴加，集气瓶=集气/通气；名称/图标由物品定义，
    //       见 level/items.js carryActionsOf）。触屏不用键位字母，用矢量图标+二字说明。
    if (scene.player) {
      const actions = carryActionsOf(scene.player.inventory.selectedItem());
      const byKey = new Map(actions.map((a) => [a.action, a]));
      const BASE = { collect: { label: '拾取', icon: 'pickup' }, place: { label: '放置', icon: 'place' } };
      for (const r of ui.buttonRects()) {
        const meta = byKey.get(r.key) ?? BASE[r.key];
        if (!meta) continue;
        const cap = meta.label ?? '';
        const down = ui.isPressed(r.key);
        ctx.save();
        rr(ctx, r.x, r.y, r.size, r.size, 14);
        const gr = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.size);
        gr.addColorStop(0, down ? 'rgba(90,64,20,0.95)' : 'rgba(38,32,74,0.88)');
        gr.addColorStop(1, down ? 'rgba(48,32,10,0.95)' : 'rgba(14,11,36,0.88)');
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.strokeStyle = down ? 'rgba(255,215,106,0.95)' : 'rgba(232,184,75,0.45)';
        ctx.lineWidth = down ? 2 : 1.2;
        if (down) {
          ctx.shadowColor = 'rgba(255,215,106,0.8)';
          ctx.shadowBlur = 12;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        this._touchIcon(ctx, meta.icon, r.x + r.size / 2, r.y + r.size / 2 - 7, down ? '#fff6d8' : '#ffe9b0');
        ctx.fillStyle = down ? '#ffd76a' : 'rgba(255,233,176,0.62)';
        ctx.font = '11px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.fillText(cap, r.x + r.size / 2, r.y + r.size - 10);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** 触控按钮矢量图标（canvas 路径画的"SVG 小图"，原点 = 图标中心）：
   *  pickup=收进物品栏（托盘+下箭头） / place=落点箭头（放置到地上） /
   *  beakerSuck=小烧杯+上吸箭头 / beakerPour=倾斜烧杯+液滴 /
   *  dropperSuck=滴管+上吸箭头 / dropperDrip=滴管+下落液滴 /
   *  bottleCollect=集气瓶+上升气泡 / bottleInject=集气瓶+注入箭头。
   *  图标名来自物品的操作定义（items.carryActionsOf），新增物品只加一条即可。 */
  _touchIcon(ctx, icon, cx, cy, color) {
    // 小烧杯（白描边 + 青色液体）；(ox,oy) 为杯心偏移，sc 缩放
    const beaker = (ox, oy, sc = 1) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(sc, sc);
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 1.3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-2.6, -5.2);
      ctx.lineTo(-2.6, -0.6);
      ctx.quadraticCurveTo(-2.6, 4.2, 0, 4.2);
      ctx.quadraticCurveTo(2.6, 4.2, 2.6, -0.6);
      ctx.lineTo(2.6, -5.2);
      ctx.moveTo(-3.3, -5.2);
      ctx.lineTo(3.3, -5.2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(122,224,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(-2.1, 3.6);
      ctx.lineTo(-2.1, 1.4);
      ctx.quadraticCurveTo(-2.1, 3.3, 0, 3.3);
      ctx.quadraticCurveTo(2.1, 3.3, 2.1, 1.4);
      ctx.lineTo(2.1, 3.6);
      ctx.fill();
      ctx.restore();
    };
    // 小滴管（红胶头 + 玻璃细管 + 锥形滴嘴）；(ox,oy) 为管心偏移，sc 缩放
    const dropper = (oy = 0, sc = 1, ox = 0) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(sc, sc);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, -6.0, 2.6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,232,255,0.95)';
      ctx.lineWidth = 1.35;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-1.3, -2.6);
      ctx.lineTo(-1.3, 4.4);
      ctx.lineTo(-0.5, 7.6);
      ctx.lineTo(0.5, 7.6);
      ctx.lineTo(1.3, 4.4);
      ctx.lineTo(1.3, -2.6);
      ctx.stroke();
      ctx.restore();
    };
    // 小集气瓶（细瓶口 + 玻璃瓶身 + 底部圆角）
    const bottle = (ox = 0) => {
      ctx.save();
      ctx.translate(ox, 0);
      ctx.strokeStyle = 'rgba(210,240,255,0.95)';
      ctx.lineWidth = 1.3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-2.6, -8.4);
      ctx.lineTo(-2.6, -5.4);
      ctx.lineTo(-4.8, -2.6);
      ctx.lineTo(-4.8, 5.4);
      ctx.quadraticCurveTo(-4.8, 8.2, -1.8, 8.2);
      ctx.lineTo(1.8, 8.2);
      ctx.quadraticCurveTo(4.8, 8.2, 4.8, 5.4);
      ctx.lineTo(4.8, -2.6);
      ctx.lineTo(2.6, -5.4);
      ctx.lineTo(2.6, -8.4);
      ctx.moveTo(-3.2, -8.4);
      ctx.lineTo(3.2, -8.4);
      ctx.stroke();
      ctx.restore();
    };
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.15, 1.15);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (icon === 'pickup') {
      // 拾取：原地小物件 + 向上箭头（把物品拿起来）——与"放置"的向下箭头成对
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-3.4, 2.8);
      ctx.lineTo(3.4, 2.8);
      ctx.lineTo(3.4, 8.4);
      ctx.lineTo(-3.4, 8.4);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -9.0);
      ctx.lineTo(0, -0.4);
      ctx.moveTo(-3.6, -5.4);
      ctx.lineTo(0, -9.0);
      ctx.lineTo(3.6, -5.4);
      ctx.stroke();
    } else if (icon === 'place') {
      // 放置：上方小物件 + 向下箭头落到地面基线
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-3.4, -8.4);
      ctx.lineTo(3.4, -8.4);
      ctx.lineTo(3.4, -2.8);
      ctx.lineTo(-3.4, -2.8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -1.4);
      ctx.lineTo(0, 6.2);
      ctx.moveTo(-3.4, 2.8);
      ctx.lineTo(0, 6.4);
      ctx.lineTo(3.4, 2.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8.5, 8.8);
      ctx.lineTo(8.5, 8.8);
      ctx.stroke();
    } else if (icon === 'beakerSuck') {
      // 上吸箭头（左）+ 小烧杯（右）
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(-5.2, 8.6);
      ctx.lineTo(-5.2, -2.4);
      ctx.moveTo(-7.8, -1.8);
      ctx.lineTo(-5.2, -7.0);
      ctx.lineTo(-2.6, -1.8);
      ctx.stroke();
      beaker(4.4, 1.0, 0.85);
    } else if (icon === 'beakerPour') {
      // 倾斜小烧杯（顺时针倒向右侧）+ 液滴从口沿洒落
      ctx.save();
      ctx.rotate(0.55);
      ctx.beginPath();
      ctx.moveTo(-6, -5);
      ctx.lineTo(-6, 5);
      ctx.quadraticCurveTo(-6, 7.5, -3.5, 7.5);
      ctx.lineTo(3.5, 7.5);
      ctx.quadraticCurveTo(6, 7.5, 6, 5);
      ctx.lineTo(6, -5);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(9.6, -1.4, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11.2, 3.8, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9.8, 9.4, 2.1, 0, Math.PI * 2); ctx.fill();
    } else if (icon === 'dropperSuck') {
      // 上吸箭头（右）+ 小滴管（左）
      dropper(1.2, 0.9, -2.0);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(7.6, 8.4);
      ctx.lineTo(7.6, -2.6);
      ctx.moveTo(5.2, -2.0);
      ctx.lineTo(7.6, -6.8);
      ctx.lineTo(10.0, -2.0);
      ctx.stroke();
    } else if (icon === 'dropperDrip') {
      // 小滴管（左）+ 右侧一串下落液滴（避免看起来像感叹号）
      dropper(-2.6, 0.9, -3.2);
      ctx.beginPath(); ctx.arc(4.2, 8.0, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6.6, 3.2, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5.2, -0.8, 0.9, 0, Math.PI * 2); ctx.fill();
    } else if (icon === 'bottleCollect') {
      // 集气瓶 + 上升气泡
      bottle(-2.4);
      ctx.beginPath(); ctx.arc(6.6, 5.2, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9.0, 0.6, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6.8, -4.4, 1.2, 0, Math.PI * 2); ctx.fill();
    } else if (icon === 'bottleInject') {
      // 集气瓶 + 向瓶内注入的下箭头
      bottle(-2.4);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(7.8, -8.0);
      ctx.lineTo(7.8, 2.4);
      ctx.moveTo(5.6, 0.2);
      ctx.lineTo(7.8, 3.0);
      ctx.lineTo(10.0, 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 竖屏提示（移动端）：半透明压暗 + "竖放手机 + 环绕旋转箭头"图标 + 文案
   *  （游戏照常运行；图标与玩家当前握持方向一致——竖着的手机，箭头示意转过来） */
  rotateHint(ctx, scene, W, H) {
    const ui = scene._touchUI;
    if (!ui || !ui.isPortrait()) return;
    const GOLD = '#e8b84b';
    ctx.save();
    ctx.fillStyle = 'rgba(6,5,20,0.82)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.4;
    // —— 手机（竖放，与当前握持一致）：圆角机身 + 听筒条 + 淡淡的屏幕光 ——
    const pw = 66;
    const ph = 112;
    ctx.save();
    ctx.translate(cx, cy);
    rr(ctx, -pw / 2, -ph / 2, pw, ph, 14);
    ctx.fillStyle = 'rgba(232,184,75,0.08)';
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.beginPath(); // 听筒条
    ctx.moveTo(-11, -ph / 2 + 11);
    ctx.lineTo(11, -ph / 2 + 11);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    // —— 环绕旋转箭头：约 240° 的圆弧，缺口在右上，箭头指向缺口（顺时针转）——
    const r = Math.max(pw, ph) / 2 + 24;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r, -0.5, Math.PI + 0.5);
    ctx.stroke();
    const ea = Math.PI + 0.5; // 弧终点（左上），切线指向右上 → 顺时针
    const ex = r * Math.cos(ea);
    const ey = r * Math.sin(ea);
    const tx = -Math.sin(ea);
    const ty = Math.cos(ea);
    ctx.beginPath();
    ctx.moveTo(ex + tx * 17, ey + ty * 17); // 箭头尖（沿切线）
    ctx.lineTo(ex - ty * 10, ey + tx * 10); // 底边两点（垂直于切线）
    ctx.lineTo(ex + ty * 10, ey - tx * 10);
    ctx.closePath();
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.restore();
    // —— 文案 ——
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 22px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('请旋转设备', cx, cy + r + 50);
    ctx.fillStyle = '#9fb2c8';
    ctx.font = '14px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('横屏游玩体验更佳', cx, cy + r + 78);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /** 场景通知横幅（拖动超距 / 吸取失败原因等；淡入淡出 ~1.6s） */
  notice(ctx, scene, W, H, time) {
    const n = scene._notice;
    if (!n) return;
    // 用 HUD 自己的帧时钟计时（挂到通知对象上，避免与场景暂停时钟错位）
    if (n._ft == null) n._ft = time;
    const age = time - n._ft;
    if (age > 1.6) {
      delete scene._notice;
      return;
    }
    const a = Math.min(1, age / 0.12) * Math.max(0, Math.min(1, (1.6 - age) / 0.35));
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.font = 'bold 14px "Segoe UI", "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(n.text).width;
    const bw = tw + 30;
    const bx = W / 2 - bw / 2;
    const by = H * 0.15;
    rr(ctx, bx, by, bw, 30, 9);
    ctx.fillStyle = 'rgba(10,12,26,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,130,0.8)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = 'rgba(255,140,100,0.55)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffdcc8';
    ctx.textAlign = 'center';
    ctx.fillText(n.text, W / 2, by + 21);
    ctx.restore();
  }

  /** 大横幅（MC 标题式：屏幕中央大字，淡入淡出+轻微下落定格）。
   *  数据来自 scene.showBanner(text, dur)：{ text, t, dur }，超时自然淡出消失。
   *  ★ 两处抗掉帧加固（手机端"淡出看不见"的两个成因）：
   *    ① 年龄优先按**真实时钟**算：掉帧时游戏时钟比真实时间慢，横幅会拖长再整条消失；
   *    ② 单帧 alpha 不许从亮直接掉到 0（3~5fps 时淡出只剩 1 帧 = 看起来是硬切）。 */
  bigBanner(ctx, scene, W, H, time) {
    const b = scene.banner;
    if (!b) { this._bannerA = null; this._bannerKey = null; return; }
    const useWall = b.wall > 0 && typeof performance !== 'undefined' && performance.now;
    const age = useWall ? (performance.now() - b.wall) / 1000 : time - b.t;
    const fade = Math.min(0.5, b.dur / 3); // 淡入/淡出各自时长（横幅很短时自动收窄）
    let a = bannerEnvelope(age, b.dur);
    // 换了一条横幅 → 重置平滑状态（否则新横幅的淡入会被上一条的残值抬起来）
    const key = b.wall || b.t;
    if (this._bannerKey !== key) { this._bannerKey = key; this._bannerA = null; }
    if (this._bannerA != null && a < this._bannerA) a = Math.max(a, this._bannerA - 0.34);
    this._bannerA = a > 0 ? a : null;
    if (a <= 0.02) return;
    const lines = String(b.text).split('\n').map((s) => s.trim()).filter((s) => s);
    if (!lines.length) return;
    // 入场从上方轻微落定（只跟淡入期走）
    const rise = -(1 - Math.min(1, age / fade)) * 12;
    // ★ 透明度走 drawFaded（离屏位图合成）：横幅文字带 shadowBlur=18，
    //   而 iPadOS WebKit 上 ctx.globalAlpha 对"带阴影的绘制"无效 → 大字会直接
    //   出现/消失、淡入淡出整个不见（用户设备实测，见 render/fade.js）。
    drawFaded(ctx, a, (c) => {
      let size = Math.min(46, H * 0.09);
      const font = () => `900 ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
      c.font = font();
      let maxW = 0;
      for (const s of lines) maxW = Math.max(maxW, c.measureText(s).width);
      if (maxW > W * 0.88) { // 超宽自动缩字号（保证不贴边）
        size = Math.max(14, (size * W * 0.88) / maxW);
        c.font = font();
      }
      const lh = size * 1.3;
      c.textAlign = 'center';
      c.lineJoin = 'round';
      lines.forEach((s, i) => {
        const y = H * 0.36 + rise + (i - (lines.length - 1) / 2) * lh + size * 0.35;
        c.lineWidth = Math.max(3, size / 7);
        c.strokeStyle = 'rgba(8,10,24,0.88)';
        c.strokeText(s, W / 2, y);
        c.fillStyle = '#fff6df';
        c.shadowColor = 'rgba(255,214,120,0.5)';
        c.shadowBlur = 18;
        c.fillText(s, W / 2, y);
        c.shadowBlur = 0;
      });
    });
  }

  // ---- 调试模式面板（F5 暂停/继续，F6 步进；显示玩家附近的每个反应 + 最近爆炸原因）----
  debugPanel(ctx, scene, W, H, time) {
    if (!scene.debugMode) return;
    const p = scene.player;
    const barW = 280;
    const px = W - barW - 10;
    // 右上角状态条（堆叠面板的当前顶 y；触屏下移避让悬浮钮/系统按钮）
    let top = hudTopOffset(scene, this._uiK || 1);
    panel(ctx, px, top, barW, 22, THEME.gold.deep, 8);
    clearText(ctx, `调试 ${scene.debugPaused ? '[暂停] F5继续 F6步进' : '[运行] F5暂停'}·悬停查源·X切换`, px, top + 11, scene.debugPaused ? '#ffd23f' : '#7fe0ff', 'bold 11px "Segoe UI", sans-serif');
    top += 28;
    // 最近爆炸原因（爆炸发生后 4s 内显示）
    if (scene._lastExplosion && time - scene._lastExplosion.t < 4) {
      panel(ctx, px, top, barW, 20, THEME.fire.base, 8);
      clearText(ctx, `💥 ${scene._lastExplosion.cause}`, px + 4, top + 14, '#ffd9a0', 'bold 11px monospace');
      top += 26;
    }
    // 附近反应面板（玩家周围 300px 内最近发生的反应，去重显示每种反应）
    if (scene.debugReactions && p) {
      const nearAll = scene.debugReactions.filter((r) => r.x != null && Math.abs(r.x - p.x) < 300 && Math.abs((r.y ?? 0) - (p.y + p.h / 2)) < 400);
      // 去重：每种反应保留最近一条（避免同一反应刷屏）
      const near = [];
      const seen = new Set();
      for (const r of nearAll) {
        if (seen.has(r.text)) continue;
        seen.add(r.text);
        near.push(r);
        if (near.length >= 8) break;
      }
      if (near.length > 0) {
        const shown = near.length;
        const panelW = 320;
        const panelH = 22 + shown * 16;
        panel(ctx, W - panelW - 10, top, panelW, panelH, THEME.gold.deep, 8);
        clearText(ctx, `附近反应 (${near.length})`, W - panelW + 2, top + 15, THEME.gold.text, 'bold 11px "Segoe UI", sans-serif');
        let y = top + 29;
        for (const r of near.slice(0, shown)) {
          clearText(ctx, `› ${r.text}`, W - panelW + 2, y + 5, '#dfe8f2', '10px monospace');
          y += 16;
        }
        top += panelH + 8;
      }
    }
    // 大气气体变化（产生/消耗原因——最近 6 条；+绿/消耗橙红，← 原因方程式）
    if (scene.gasLog && scene.gasLog.length) {
      const shown = Math.min(6, scene.gasLog.length);
      const panelW = 380;
      const panelH = 22 + shown * 15;
      const gx = W - panelW - 10;
      panel(ctx, gx, top, panelW, panelH, THEME.toxic.base, 8);
      clearText(ctx, `气体变化 (${scene.gasLog.length})`, gx + 12, top + 15, THEME.toxic.light, 'bold 11px "Segoe UI", sans-serif');
      let gy = top + 28;
      for (let i = 0; i < shown; i++) {
        const g = scene.gasLog[i];
        // 小量精确显示：≥0.01g 显示 2 位，≥0.001g 显示 4 位，更小显示毫克
        const absD = Math.abs(g.delta);
        const sign = g.delta >= 0 ? '+' : '-';
        const dStr = absD >= 0.01 ? `${sign}${absD.toFixed(2)}g` : absD >= 0.001 ? `${sign}${absD.toFixed(4)}g` : `${sign}${(absD * 1000).toFixed(1)}mg`;
        const color = g.delta >= 0 ? '#a6ff9a' : '#ff9a6b';
        clearText(ctx, `${g.id} ${dStr}`, gx + 12, gy + 5, color, 'bold 10px monospace');
        const cause = g.cause ?? '未知';
        clearText(ctx, `← ${cause.slice(0, 30)}`, gx + 90, gy + 5, '#9fb2c8', '9px monospace');
        gy += 15;
      }
    }
  }

  // ---- 调试模式：鼠标悬停显示物体"为何存在"（来源溯源；X 键循环切换重叠目标）----
  hoverPanel(ctx, scene, W, H) {
    const m = scene.mouse;
    if (!m || !m.on) return;
    const cam = scene.renderer ? scene.renderer.camera : null;
    if (!cam) return;
    const uiK = this._uiK || 1;
    // 屏幕坐标 → 世界坐标（相机缩放/平移；鼠标是真实逻辑像素，相机也按真实画布算）
    const { scale, offsetX, offsetY } = cam.compute(canvasLW(ctx.canvas), canvasLH(ctx.canvas), scene.player);
    const wx = (m.x - offsetX) / scale;
    const wy = (m.y - offsetY) / scale;
    // 鼠标移动 → 重置候选与索引
    if (!this._hoverAt || Math.abs(this._hoverAt.x - m.x) > 1 || Math.abs(this._hoverAt.y - m.y) > 1) {
      this._hoverAt = { x: m.x, y: m.y };
      this._hoverIdx = 0;
    }
    const cands = this.collectHover(scene, wx, wy);
    if (cands.length === 0) return;
    // X 键（scene.debugHoverCycle）：在重叠物体间循环切换
    if (scene.debugHoverCycle) {
      scene.debugHoverCycle = false;
      this._hoverIdx = (this._hoverIdx + 1) % cands.length;
    }
    if (this._hoverIdx >= cands.length) this._hoverIdx = 0;
    const info = cands[this._hoverIdx];
    // 提示框画在 HUD 坐标空间 → 鼠标坐标同样换算
    this.renderHoverTip(ctx, info, m.x / uiK, m.y / uiK, W, H,
      cands.length > 1 ? { idx: this._hoverIdx + 1, total: cands.length } : null);
  }

  /**
   * 命中检测：收集鼠标下所有重叠物体的来源信息（按优先级排序——
   * 玩家>沉淀>池内颗粒>物块>气流>容器/静态）。默认显示第 0 个，X 键循环切换。
   */
  collectHover(scene, wx, wy) {
    const out = [];
    const hitRect = (o) => o && wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h;
    const inCircle = (cx, cy, r) => {
      const dx = wx - cx;
      const dy = wy - cy;
      return dx * dx + dy * dy <= r * r;
    };

    // 1. 玩家（核心+附着的壳：NaOH 关卡生成，Na2CO3/BaCO3 壳反应生成）
    const p = scene.player;
    if (p && hitRect(p)) {
      const info = this.objInfo(p, p.substance);
      const bd = this.gridBreakdown(p);
      if (bd && bd.length > 1) info.breakdown = bd;
      out.push(info);
    }

    // 2. 自由沉淀粒子（小圆；同种且重叠的合并为一条候选——与渲染聚类一致，
    //    否则掉落的一簇 20 颗叠在一起 → 悬停显示 20 条候选"20 个粒子叠在一起"）
    const hitParts = [];
    for (const pt of scene.particles) {
      if (pt.amount <= 1e-9) continue;
      if (inCircle(pt.x + pt.w / 2, pt.y + pt.h / 2, pt.w / 2 + 1)) hitParts.push(pt);
    }
    const merged = new Map(); // substance → { count, pt }
    for (const pt of hitParts) {
      const e = merged.get(pt.substance);
      if (e) { e.count++; continue; }
      merged.set(pt.substance, { count: 1, pt });
    }
    for (const [substance, e] of merged) {
      const info = this.objInfo(e.pt, e.count > 1 ? `${substance}×${e.count}` : substance);
      out.push(info);
    }

    // 3. 容器内沉淀颗粒（池/灯上的某一颗沉淀）
    for (const c of scene.containers) {
      for (const g of c.grains) {
        if (inCircle(g.x, g.y, g.r + 1)) {
          const origin = c.precipOrigins.get(g.id) ?? null;
          out.push({ label: '沉淀', name: `${g.id}（${c.hoverLabel ?? '容器'}内）`, origin });
        }
      }
    }

    // 4. 物块（动态固体；含多种物质时逐物质显示来源——初始=关卡生成、反应附着=反应生成）
    for (const o of scene.dynamics) {
      if (!(o instanceof Block) || !hitRect(o)) continue;
      const info = this.objInfo(o, o.grid ? o.grid.ids().join('+') : o.substance);
      const bd = this.gridBreakdown(o);
      if (bd && bd.length > 1) info.breakdown = bd;
      out.push(info);
    }

    // 5. 气流柱（反应产气的气流——显示是哪个反应生成的）
    for (const o of scene.objects) {
      if (!(o instanceof GasColumn) || !hitRect(o)) continue;
      out.push(this.objInfo(o, o.gasId ?? o.label ?? ''));
    }

    // 6. 容器/灯/静态元素（池、灯、开关、地板、路标、钥匙、门…）
    for (const o of scene.objects) {
      if (!o.hoverLabel || o instanceof GasColumn || o instanceof Block || o === p) continue;
      if (!hitRect(o)) continue;
      const info = this.objInfo(o, (o.opening ?? o.substance ?? ''));
      // 容器/灯：逐物质显示来源（某物质关卡生成、某物质反应生成…）
      if (o.solution || o.precipitates) info.breakdown = this.contentBreakdown(o);
      out.push(info);
    }
    return out;
  }

  /** 容器/灯内各物质及其来源（溶质 + 沉淀 + 水，按质量降序）——悬停药品池显示每样多少克 */
  contentBreakdown(c) {
    const out = [];
    for (const [id, mass] of c.solution.solutes) {
      if (mass < MIN_ENTRY) continue; // 微量溶质不显示：防"0.0g ↔ 无"的条目抖动
      // 酸类标注浓/稀（≥300 g/L = 浓，与引擎判定一致）
      const note = acidLabelOf(id, mass, c.solution.volume / 1000);
      out.push({ id, mass, origin: c.solOrigins?.get(id) ?? null, note });
    }
    for (const [id, mass] of c.precipitates) {
      if (mass < MIN_ENTRY) continue;
      // 沉淀标注合并数（几颗 0.5g 合并显示）：与自由沉淀粒子同规则
      out.push({ id, mass, origin: c.precipOrigins?.get(id) ?? null, note: `↓×${Math.max(1, Math.ceil(mass / CFG.maxParticleMass))}` });
    }
    if (c.solution.water > 0) out.push({ id: 'H2O', mass: c.solution.water, origin: { kind: 'solvent' } });
    return out.sort((a, b) => b.mass - a.mass);
  }

  /** 物块/玩家网格内各物质及其来源（初始=关卡生成，反应附着=反应生成） */
  gridBreakdown(o) {
    const masses = o.grid ? o.grid.masses() : null;
    if (!masses) return null;
    const out = [];
    for (const [id, mass] of Object.entries(masses)) {
      if (mass <= 1e-6) continue;
      out.push({ id, mass, origin: o.gridOrigins?.get(id) ?? null });
    }
    return out.sort((a, b) => b.mass - a.mass);
  }

  /** 组装提示信息 */
  objInfo(obj, name, origin = null) {
    return { label: obj.hoverLabel ?? '元素', name, origin: origin ?? obj.origin ?? null };
  }

  /** 容器内容标签（溶质 + 沉淀） */
  containerName(c) {
    const parts = [];
    for (const [id] of c.solution.solutes) parts.push(id);
    for (const [id] of c.precipitates) parts.push(`${id}(↓)`);
    if (parts.length === 0 && c.solution.water > 0) parts.push('H2O');
    return parts.join('+') || '空';
  }

  /** 来源短标签（只给种类，如"关卡生成/反应生成"） */
  originShort(origin) {
    if (!origin) return '未知';
    return ORIGIN_LABELS[origin.kind] ?? origin.kind;
  }

  /** 来源文本行（反应生成给出具体方程式，超长自动换行） */
  originLines(origin) {
    if (!origin) return ['来源：未知'];
    const head = ORIGIN_LABELS[origin.kind] ?? origin.kind;
    if (origin.kind === 'reaction' && origin.text) {
      return [`来源：${head}`, ...this.wrapCJK(origin.text, 34)];
    }
    if (origin.text) return [`来源：${head}（${origin.text}）`];
    return [`来源：${head}`];
  }

  /** 按字符宽度换行（中英混排按字符数截断） */
  wrapCJK(text, maxLen) {
    const out = [];
    for (let i = 0; i < text.length; i += maxLen) out.push(text.slice(i, i + maxLen));
    return out;
  }

  /** 渲染悬停提示框（鼠标附近，钳在画布内）；multi = {idx,total} 表示重叠目标循环切换 */
  renderHoverTip(ctx, info, sx, sy, W, H, multi = null) {
    let lines;
    if (info.breakdown && info.breakdown.length) {
      // 容器/灯/物块：逐物质显示来源 + 质量（各物质名 + 克数 + 来源，反应给方程式）
      lines = [`${info.label}（${info.breakdown.length} 种）`];
      const shown = info.breakdown.slice(0, 8);
      for (const it of shown) {
        const isWater = it.id === 'H2O';
        const tag = it.note ? `(${it.note})` : '';
        lines.push(`  ${it.id}${tag} ${it.mass.toFixed(1)}g · ${isWater ? '溶剂' : this.originShort(it.origin)}`);
        if (it.origin && it.origin.kind === 'reaction' && it.origin.text) {
          lines.push(...this.wrapCJK(it.origin.text, 30).map((s) => '    ' + s));
        }
      }
      if (info.breakdown.length > shown.length) lines.push(`  …另有 ${info.breakdown.length - shown.length} 种`);
    } else {
      lines = [`${info.label} ${info.name}`, ...this.originLines(info.origin)];
    }
    if (multi) lines.push(`⟨ ${multi.idx}/${multi.total} · 按 X 切换 ⌦`);
    const font = '11px monospace';
    ctx.save();
    ctx.font = font;
    const pad = 8;
    const lh = 17;
    const maxW = Math.min(320, Math.max(...lines.map((ln) => ctx.measureText(ln).width)));
    const boxW = maxW + pad * 2;
    const boxH = lines.length * lh + 8;
    // 位置：鼠标右下偏移 14/20，越界则翻到鼠标另一侧/上侧
    let bx = sx + 14;
    let by = sy + 20;
    if (bx + boxW > W - 6) bx = sx - boxW - 14;
    if (by + boxH > H - 6) by = sy - boxH - 20;
    bx = Math.max(6, bx);
    by = Math.max(6, by);
    // 面板 + 发光描边
    panel(ctx, bx, by, boxW, boxH, THEME.water.base, 6);
    ctx.font = font;
    let y = by + 15;
    for (let i = 0; i < lines.length; i++) {
      // 标题行金色加粗，方程式行青色，来源行白色
      const color = i === 0 ? THEME.gold.text : i === 1 ? '#dfe8f2' : '#9fd8ff';
      clearText(ctx, lines[i], bx + pad, y, color, i === 0 ? 'bold 11px monospace' : font);
      y += lh;
    }
    ctx.restore();
  }

  // ---- 玩家信息卡（双端统一紧凑单卡）：物质/体质 + 身体组成 + 大气一行 ----
  // 原桌面三张卡（玩家/组成/空气）竖排 + 移动端重复一套——统一成这一张：
  // 屏幕占用最小、信息不缺；移动端面板体按 CFG.touch.hudAlpha 降透明（文字不降）。
  playerPanelCompact(ctx, p, scene, time, top = 10) {
    const uiK = this._uiK || 1;
    // 左上卡固定 10px 边距（HUD 坐标空间；大屏时随 uiK 一起放大）
    const x0 = 10 / uiK + (touchInsetsOf(scene, uiK).left || 0); // 刘海横屏：卡片让出左缘安全区
    // 小屏紧凑（视口高<460/宽<500——老机型无全屏时可用视口很小）：
    // 整卡以左上为锚缩 0.76×——不动内部布局，占用面积减半（遮挡重灾区）
    // 极窄视口（无全屏的手机横屏）再缩一档：0.76 → 0.60
    const k = tinyView(canvasLW(ctx.canvas), canvasLH(ctx.canvas)) ? 0.60
      : compactView(canvasLW(ctx.canvas), canvasLH(ctx.canvas)) ? 0.76 : 1;
    // 大气数据源：玩家在气室内时显示气室内部大气（与外部独立），否则显示场景大气
    const atm = typeof scene.atmosphereForPlayer === 'function' ? scene.atmosphereForPlayer() : scene.atmosphere;
    // 身体组成（多物质才显示，单物质=血量本身）
    const masses = p.grid ? p.grid.masses() : null;
    const entries = masses
      ? Object.entries(masses).filter(([, m]) => m > 1e-6).sort((a, b) => b[1] - a[1])
      : [];
    const compRows = entries.length > 1 ? Math.min(3, entries.length) : 0;
    // 大气（一行 O2/CO2；有预警气体再加一行）
    const extras = atm
      ? EXTRA_GAS_IDS.map((id) => ({ id, frac: atm.fraction(id) * 100, mass: atm.mass(id) })).filter((g) => g.mass > 0.01)
      : [];
    const airLines = 1 + (extras.length ? 1 : 0);
    const w = 280 * k;
    const h = (72
      + (compRows ? 17 + compRows * 17 + (entries.length > compRows ? 13 : 0) : 0)
      + airLines * 16 + 8) * k;
    this._leftH = h; // 左上卡实际高度（调试模式"最近反应"面板的堆叠定位用）
    ctx.save();
    ctx.globalAlpha = this._isTouch() ? CFG.touch.hudAlpha : 1;
    panel(ctx, x0, top, w, h, THEME.gold.deep, 12);
    if (k !== 1) {
      // 内部绘制仍按 280 布局（右对齐等硬编码坐标），整卡左上锚缩小
      ctx.translate(x0, top);
      ctx.scale(k, k);
      ctx.translate(-x0, -top);
    }
    ctx.restore();
    if (k !== 1) {
      ctx.save();
      ctx.translate(x0, top);
      ctx.scale(k, k);
      ctx.translate(-x0, -top);
    }
    // 头部：血量药瓶 + 物质 + 体质
    const sub = getSubstance(p.substance);
    const color = sub?.solid?.[0] ?? '#7fe0ff';
    const ratio = p.maxHp ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
    this.vial(ctx, x0 + 14, top + 9, 30, 46, ratio, color, time);
    clearText(ctx, p.substance, x0 + 56, top + 26, THEME.gold.text, 'bold 16px "Segoe UI", sans-serif');
    clearText(ctx, `${p.hp.toFixed(1)} g 体质`, x0 + 56, top + 47, '#ffffff', 'bold 12.5px monospace');
    let y = top + 72;
    if (compRows) {
      clearText(ctx, '身体组成', x0 + 10, y, 'rgba(255,233,176,0.85)', 'bold 10px "Segoe UI", sans-serif');
      y += 15;
      for (const [id, m] of entries.slice(0, compRows)) {
        const sc = getSubstance(id);
        const isCore = id === p.substance;
        ctx.save();
        if (isCore) {
          ctx.shadowColor = THEME.gold.text;
          ctx.shadowBlur = 5;
        }
        ctx.fillStyle = sc?.solid?.[0] ?? '#7fe0ff';
        ctx.beginPath();
        ctx.arc(x0 + 18, y + 3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        clearText(ctx, id, x0 + 29, y + 7, isCore ? THEME.gold.text : '#dfe8f2', '10.5px monospace');
        ctx.textAlign = 'right';
        clearText(ctx, `${m.toFixed(1)}g`, x0 + w - 16, y + 7, '#9fb2c8', '10px monospace');
        ctx.textAlign = 'left';
        y += 17;
      }
      if (entries.length > compRows) {
        clearText(ctx, `…另有 ${entries.length - compRows} 种`, x0 + 10, y + 6, '#9fb2c8', '10px monospace');
        y += 13;
      }
      y += 2;
    }
    // 大气行：O2（青）· CO2（金）
    const o2 = atm ? atm.fraction('O2') * 100 : 0;
    const co2 = atm ? atm.fraction('CO2') * 100 : 0;
    const co2Mass = atm ? atm.mass('CO2') : 0;
    const co2Text = co2 >= 0.05 ? `${co2.toFixed(1)}%` : co2Mass > 1e-6 ? '<0.1%' : '0%';
    clearText(ctx, `O2 ${o2.toFixed(1)}%`, x0 + 10, y + 6, '#aeeaff', 'bold 11px monospace');
    clearText(ctx, `CO2 ${co2Text}`, x0 + 108, y + 6, '#ffe9b0', 'bold 11px monospace');
    y += 16;
    // 预警气体行（有质量才显示）：色点 + 缩略列表
    if (extras.length) {
      let gx = x0 + 10;
      for (const g of extras.slice(0, 3)) {
        const c = GAS_COLORS[g.id] ?? '#ffffff';
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(gx + 3.5, y - 1, 3.4, 0, Math.PI * 2);
        ctx.fill();
        const t = g.frac >= 0.05 ? `${g.frac.toFixed(1)}%` : '<0.1%';
        const label = `${g.id} ${t}`;
        clearText(ctx, label, gx + 10, y + 4, c, 'bold 10px monospace');
        gx += 14 + label.length * 6.2 + 7;
      }
      if (extras.length > 3) clearText(ctx, `+${extras.length - 3}`, gx + 4, y + 4, '#9fb2c8', '10px monospace');
    }
    if (k !== 1) ctx.restore(); // 关闭紧凑缩放（内部 clearText/vial 自管 save/restore）
  }

  /** 血量药瓶：玻璃试剂瓶（金色瓶盖 + 瓶肩过渡 + 液面/气泡/刻度 + 玻璃高光），
   *  比旧的"圆角胶囊填色"更像实验器皿，也与面板的金色描边更搭。 */
  vial(ctx, x, y, w, h, ratio, color, time) {
    const cx = x + w / 2;
    const neckW = Math.max(6, w * 0.36);
    const nx0 = cx - neckW / 2;
    const nx1 = cx + neckW / 2;
    const bodyX0 = x + 1.5;
    const bodyX1 = x + w - 1.5;
    const sho = y + h * 0.30;        // 肩线
    const lipY = y + 1;
    const bottom = y + h - 2;
    const rad = Math.max(3, Math.min(w * 0.34, (bottom - sho) * 0.5));
    const r = Math.max(0, Math.min(1, ratio));
    const low = r < 0.28;
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(nx0, lipY + 2);
      ctx.lineTo(nx0, sho - 3);
      ctx.quadraticCurveTo(nx0, sho + 2, bodyX0 + 1, sho + 5);
      ctx.lineTo(bodyX0, bottom - rad);
      ctx.quadraticCurveTo(bodyX0, bottom, bodyX0 + rad, bottom);
      ctx.lineTo(bodyX1 - rad, bottom);
      ctx.quadraticCurveTo(bodyX1, bottom, bodyX1, bottom - rad);
      ctx.lineTo(bodyX1, sho + 5);
      ctx.quadraticCurveTo(nx1, sho + 2, nx1, sho - 3);
      ctx.lineTo(nx1, lipY + 2);
      ctx.closePath();
    };
    ctx.save();
    // 玻璃体
    bodyPath();
    const glass = ctx.createLinearGradient(x, y, x + w, y + h);
    glass.addColorStop(0, 'rgba(205,235,255,0.17)');
    glass.addColorStop(0.45, 'rgba(150,200,240,0.06)');
    glass.addColorStop(1, 'rgba(190,230,255,0.13)');
    ctx.fillStyle = glass;
    ctx.fill();
    // 液体（裁到瓶身里）
    const lh = Math.max(h * 0.07, (bottom - sho - 6) * r);
    const surf = bottom - lh;
    ctx.save();
    bodyPath();
    ctx.clip();
    const lg = ctx.createLinearGradient(x, surf, x, bottom);
    lg.addColorStop(0, '#ffffff');
    lg.addColorStop(0.16, color);
    lg.addColorStop(1, 'rgba(8,26,46,0.95)');
    ctx.fillStyle = lg;
    ctx.fillRect(bodyX0, surf, bodyX1 - bodyX0, bottom - surf);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(bodyX0, surf - 0.8, bodyX1 - bodyX0, 1.2);
    ctx.beginPath();
    ctx.ellipse(cx, surf, (bodyX1 - bodyX0) * 0.4, 1.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
    // 气泡：沿液面缓慢上浮
    for (let i = 0; i < 3; i++) {
      const ph = (time * 0.18 + i * 0.37) % 1;
      const by = bottom - 4 - ph * Math.max(4, lh - 4);
      const bx = cx + Math.sin(time * 0.7 + i * 2.1) * (bodyX1 - bodyX0) * 0.22;
      ctx.beginPath();
      ctx.arc(bx, by, 0.9 + (1 - ph) * 1.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.16 + ph * 0.24).toFixed(3) + ')';
      ctx.fill();
    }
    // 液面辉光（随血量呼吸）
    if (r > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = color;
      ctx.shadowBlur = 7 + 4 * Math.sin(time * 2.6);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(bodyX0 + 1, surf - 0.5, bodyX1 - bodyX0 - 2, 1.4);
    }
    ctx.restore();
    // 玻璃描边（低血量泛红警示）
    bodyPath();
    ctx.strokeStyle = low ? 'rgba(255,138,126,0.85)' : 'rgba(198,232,255,0.62)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 瓶身左侧高光 + 右侧刻度
    ctx.save();
    bodyPath();
    ctx.clip();
    const hi = ctx.createLinearGradient(x, y, x + w, y);
    hi.addColorStop(0, 'rgba(255,255,255,0)');
    hi.addColorStop(0.22, 'rgba(255,255,255,0.28)');
    hi.addColorStop(0.42, 'rgba(255,255,255,0.02)');
    hi.addColorStop(0.78, 'rgba(255,255,255,0.12)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(210,240,255,0.26)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const ty = sho + 8 + i * 7;
      if (ty > bottom - 5) break;
      ctx.beginPath();
      ctx.moveTo(bodyX1 - 6, ty);
      ctx.lineTo(bodyX1 - 2, ty);
      ctx.stroke();
    }
    ctx.restore();
    // 金色瓶盖（带高光）
    rr(ctx, nx0 - 1, lipY - 0.5, neckW + 2, 3.8, 1.4);
    const cap = ctx.createLinearGradient(0, lipY, 0, lipY + 4);
    cap.addColorStop(0, '#ffe6a0');
    cap.addColorStop(1, '#b9852a');
    ctx.fillStyle = cap;
    ctx.fill();
    ctx.restore();
  }

  // ---- 玩家反应日志（最近发生在玩家身上的反应；调试模式专属）----
  reactionPanel(ctx, p) {
    if (!p.reactions || p.reactions.length === 0) return;
    const uiK = this._uiK || 1;
    const shown = Math.min(4, p.reactions.length);
    const W = 264;
    const H = 22 + shown * 17;
    // 排在左上信息卡下方（卡高度可变，按实际高度堆叠）
    const top = hudTopOffset(this.scene, uiK) + (this._leftH ?? 126) + 6 / uiK;
    panel(ctx, 10 / uiK, top, W, H, THEME.gold.deep, 10);
    clearText(ctx, '最近反应', 22, top + 12, THEME.gold.text, 'bold 11px "Segoe UI", sans-serif');
    let y = top + 26;
    for (let i = 0; i < shown; i++) {
      clearText(ctx, `› ${p.reactions[i]}`, 22, y + 6, '#dfe8f2', '10px monospace');
      y += 17;
    }
  }


  // ---- 物品栏（宝石槽）：装物品的格子放大 + 内容物溶质显示 + 获取弹跳 ----
  inventory(ctx, p, W, H, time) {
    const slots = p.inventory.slots;
    const rects = inventorySlotRects(W, H, slots, uiMargins(this.scene, this._uiK || 1));
    if (!this._pop) this._pop = {}; // 物品格弹跳计时 {i:{sig,t}}
    let minTop = Infinity;
    let invRight = 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const x = r.x;
      const sy = r.y;
      const size = r.size;
      minTop = Math.min(minTop, sy);
      invRight = Math.max(invRight, x + size);
      const sel = i === p.inventory.selected;
      // 弹跳：物品格内容变化（新装/吸液/倒出/收气）时缩放脉冲一下
      const s = slots[i];
      let sc = 1;
      if (s && s.item && s.obj) {
        const o = s.obj;
        const sig = s.item === 'beaker' ? `${o.solution ? o.solution.totalMass() : 0}`
          : s.item === 'dropper' ? `${o.liquid}${o.substance}`
            : `${o.totalGas()}${o.gases.size}`;
        const rec = this._pop[i];
        if (!rec || rec.sig !== sig) this._pop[i] = { sig, t: time };
        const pt = time - this._pop[i].t;
        sc = 1 + 0.2 * Math.sin(Math.min(1, pt / 0.32) * Math.PI) * (1 - pt / 0.32);
      }
      ctx.save();
      if (sc > 1.001) {
        ctx.translate(x + size / 2, sy + size / 2);
        ctx.scale(sc, sc);
        ctx.translate(-(x + size / 2), -(sy + size / 2));
      }
      ctx.save();
      rr(ctx, x, sy, size, size, 12);
      const g = ctx.createLinearGradient(x, sy, x, sy + size);
      g.addColorStop(0, sel ? 'rgba(70,50,16,0.96)' : 'rgba(30,26,62,0.92)');
      g.addColorStop(1, sel ? 'rgba(32,22,8,0.96)' : 'rgba(12,9,32,0.92)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = sel ? THEME.gold.light : 'rgba(232,184,75,0.35)';
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.shadowColor = THEME.gold.light;
      ctx.shadowBlur = sel ? 10 + 4 * Math.sin(time * 4) : 0;
      ctx.stroke();
      ctx.restore();

      if (s) {
        if (s.item) {
          this.drawItemIcon(ctx, s, r, time);
        } else {
          this.drawSubstanceSlot(ctx, s, x, sy, size, sel);
        }
      } else {
        // 空槽：淡符文环
        ctx.strokeStyle = 'rgba(232,184,75,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + size / 2, sy + size / 2, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 桌面端：只有选中"有自定义操作的可拾取物品"时，才在物品栏上方显示该物品的键位提示
    // （Q/⇧ 是通用操作，不常驻提示；未选物品/物品没有自定义操作时不显示任何提示条）。
    const touch = this._isTouch();
    const selItem = p.inventory.selectedItem();
    const actions = carryActionsOf(selItem);
    let hintY = null;
    if (!touch && actions.length) {
      hintY = minTop - 34;
      this._actionHints(ctx, invRight, hintY, actions);
    }
    // ---- 选中物品说明面板：切换槽位时旧面板淡出、新面板淡入（不是硬切） ----
    const selKey = selItem ? `${p.inventory.selected}:${selItem.isCarryItem}` : '';
    if (this._infoKey !== selKey) {
      if (this._infoCur) this._infoPrev = this._infoCur;
      this._infoKey = selKey;
      this._infoT = time;
    }
    const info = selItem ? this._itemInfoData(selItem) : null;
    if (info) {
      const layout = this._itemInfoLayout(ctx, W, H, touch, slots, actions, minTop, invRight, hintY, info);
      this._infoCur = { ...info, ...layout };
    } else {
      this._infoCur = null;
    }
    const animDur = 0.17;
    const animK = Math.max(0, Math.min(1, (time - this._infoT) / animDur));
    const ease = (v) => v * v * (3 - 2 * v);
    const e = ease(animK);
    if (this._infoPrev) {
      const a = 1 - e;
      if (a > 0.01) this._drawItemInfo(ctx, this._infoPrev, a, -5 * e, 1);
      if (animK >= 1) this._infoPrev = null;
    }
    if (this._infoCur) {
      this._drawItemInfo(ctx, this._infoCur, e, (1 - e) * 6, 0.97 + 0.03 * e);
    }
  }

  /** 选中物品说明面板的数据（名称 / 组成 / 质量 / 颜色） */
  _itemInfoData(o) {
    let title = '';
    let comp = '';
    let mass = '';
    let color = '#fff6dd';
    if (o.isCarryItem === 'beaker') {
      const total = o.solution ? o.solution.totalMass() : 0;
      title = '烧杯';
      comp = this._contentLine(o.solution ? [...o.solution.solutes.entries()] : [], total > 0.05 ? '水' : '空');
      mass = `${total.toFixed(1)}g`;
      if (o.solution && comp !== '空' && comp !== '水') color = solutionColor(o.solution).color;
    } else if (o.isCarryItem === 'dropper') {
      title = '滴管';
      comp = o.liquid > 1e-9 ? (o.substance === 'H2O' ? '水' : o.substance) : '空';
      mass = o.liquid > 1e-9 ? `${o.liquid.toFixed(1)}g` : '';
      if (o.liquid > 1e-9 && o.substance !== 'H2O') color = o.liquidColor().color;
    } else {
      title = '集气瓶';
      comp = o.totalGas() > 1e-9 ? this._contentLine([...o.gases.entries()], '') : '空';
      mass = o.totalGas() > 1e-9 ? `${o.totalGas().toFixed(2)}g / ${o.capacity.toFixed(0)}g` : '';
      if (o.totalGas() > 1e-9) color = o.gasFillColor();
    }
    return { title, comp, mass, color };
  }

  /** 说明面板布局（右对齐物品栏；触屏端让开动态按钮块） */
  _itemInfoLayout(ctx, W, H, touch, slots, actions, minTop, invRight, hintY, info) {
    ctx.save();
    ctx.font = 'bold 12.5px "Segoe UI", "Microsoft YaHei", sans-serif';
    const w1 = ctx.measureText(`${info.title}　${info.mass}`).width;
    ctx.font = 'bold 11px monospace';
    const w2 = ctx.measureText(info.comp).width;
    ctx.restore();
    const bw = Math.max(w1, w2) + 24;
    const bx = Math.max(6, invRight - bw);
    let by;
    if (touch) {
      // 触屏端：物品栏上方是动态按钮块（基础 Q/⇧ + 物品操作）——面板再往上挪
      const ui = this.scene._touchUI;
      const btns = touchButtonRects(W, H, slots, ui && ui.insets ? ui.insets : {}, actions);
      let btnTop = Infinity;
      for (const b of btns) btnTop = Math.min(btnTop, b.y);
      by = btnTop - 50;
    } else {
      by = hintY != null ? hintY - 6 - 44 : minTop - 56;
    }
    return { bx, by, bw };
  }

  /** 画一帧说明面板（alpha/dy/scale 供切换动画用） */
  _drawItemInfo(ctx, snap, alpha, dy, scale) {
    if (alpha <= 0.005) return;
    const bx = snap.bx;
    const by = snap.by + dy;
    const cx = bx + snap.bw / 2;
    const cy = by + 22;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (Math.abs(scale - 1) > 0.001) {
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }
    rr(ctx, bx, by, snap.bw, 44, 9);
    const g = ctx.createLinearGradient(bx, by, bx, by + 44);
    g.addColorStop(0, 'rgba(26,22,52,0.95)');
    g.addColorStop(1, 'rgba(12,10,30,0.95)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = 'bold 12.5px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(`${snap.title}　${snap.mass}`, bx + 12, by + 18);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = snap.color;
    ctx.fillText(snap.comp, bx + 12, by + 36);
    ctx.restore();
  }

  /** 桌面端物品操作键位提示条（物品栏上方；只在选中物品有自定义操作时显示）：
   *  只列该物品自己的操作（名称/键位来自 items.carryActionsOf + 设置里的键位；
   *  按住类加"按住"前缀）。Q/⇧ 是通用操作，不在这里常驻。 */
  _actionHints(ctx, right, y, actions) {
    const entries = actions.map((a) => ({ key: a.action, label: a.hold ? `按住${a.label}` : a.label }));
    const h = 22;
    ctx.save();
    ctx.font = '10.5px "Segoe UI", "Microsoft YaHei", sans-serif';
    const items = entries.map((e) => {
      const kt = actionKeyLabel(e.key);
      const kw = Math.max(16, ctx.measureText(kt).width + 10);
      const lw = ctx.measureText(e.label).width;
      return { ...e, kt, kw, lw, w: kw + 4 + lw };
    });
    const gap = 10;
    const pad = 10;
    const total = items.reduce((s, it) => s + it.w, 0) + gap * (items.length - 1) + pad * 2;
    let x = Math.max(6, right - total);
    rr(ctx, x, y, total, h, 6);
    ctx.fillStyle = 'rgba(10,10,26,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    x += pad;
    const cy = y + h / 2;
    for (const it of items) {
      rr(ctx, x, cy - 8, it.kw, 16, 4);
      ctx.fillStyle = 'rgba(30,26,60,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,184,75,0.55)';
      ctx.stroke();
      ctx.fillStyle = '#ffd76a';
      ctx.font = 'bold 10px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(it.kt, x + it.kw / 2, cy + 3.5);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cfe0ff';
      ctx.font = '10.5px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.fillText(it.label, x + it.kw + 4, cy + 3.5);
      x += it.w + gap;
    }
    ctx.restore();
  }

  /** 物质格：元素色圆点 + 名称 + 质量 */
  drawSubstanceSlot(ctx, s, x, sy, size, sel) {
    const sub = getSubstance(s.substance);
    const c = sub?.solid?.[0] ?? '#c8c8c8';
    ctx.save();
    ctx.fillStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x + size / 2, sy + 22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = sel ? '#fff6dd' : THEME.gold.text;
    ctx.font = 'bold 9.5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(displayName(s.substance), x + size / 2, sy + 15);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#ffffff';
    const m = Number.isFinite(s.mass) ? s.mass : 0; // NaN 质量显示 0，不显示 NaN
    ctx.fillText(`${m.toFixed(1)}g`, x + size / 2, sy + size - 8);
    ctx.textAlign = 'left';
  }

  /** 容器内容物一行字（主要溶质/溶剂），最多 2 种；超出截断加省略号 */
  _contentLine(entries, emptyText = '') {
    const list = entries.filter(([, m]) => m > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
    if (!list.length) return emptyText;
    let str = list.join('+');
    if (str.length > 11) str = `${str.slice(0, 10)}…`;
    return str;
  }

  /** 物品格图标（烧杯/滴管/集气瓶——不堆叠，一物一格）。
   *  小尺寸新风格缩略图：暗紫玻璃 + 黄铜口沿/卡箍 + 液体/气体元素色，只画物体本身；
   *  右下角保留一个小小的质量数字（成分/名称在上方"选中物品"面板）。
   *  约 18~24px，细节克制（无随机、无动画）；空槽/选中态由外层 HUD 面板负责。 */
  drawItemIcon(ctx, s, r, time) {
    const o = s.obj;
    const size = r.size;
    const cx = r.x + size / 2;
    const cy = r.y + size / 2 + 1;
    // 紧凑/极小视口下物品格会缩到 50/41px：图标同比例缩，避免压到质量小字
    const k = Math.max(0.58, Math.min(1, size / 70));
    // 小图标共用黄铜渐变（亮铜 → 铜 → 暗铜；竖渐变足够）
    const brass = (x, y, w, h) => {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, THEME.gold.light);
      g.addColorStop(0.5, THEME.gold.base);
      g.addColorStop(1, THEME.gold.deep);
      return g;
    };
    ctx.save();
    ctx.textAlign = 'center';
    if (s.item === 'beaker') {
      // ---- 迷你烧杯：暗紫玻璃 U 形 + 黄铜口沿 + 刻度 + 液体 ----
      const bw = 22;
      const bh = 26;
      const botR = 3.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      const bx = -bw / 2;
      const by = -bh / 2 + 1;
      const glassPath = () => {
        ctx.beginPath();
        ctx.moveTo(bx, by + 1.6);
        ctx.lineTo(bx, by + bh - botR);
        ctx.arcTo(bx, by + bh, bx + botR, by + bh, botR);
        ctx.lineTo(bx + bw - botR, by + bh);
        ctx.arcTo(bx + bw, by + bh, bx + bw, by + bh - botR, botR);
        ctx.lineTo(bx + bw, by + 1.6);
        ctx.closePath();
      };
      // 玻璃体（暗紫玻璃）
      glassPath();
      const glass = ctx.createLinearGradient(bx, by, bx, by + bh);
      glass.addColorStop(0, 'rgba(150,130,230,0.26)');
      glass.addColorStop(0.5, 'rgba(80,70,150,0.16)');
      glass.addColorStop(1, 'rgba(120,110,200,0.22)');
      ctx.fillStyle = glass;
      ctx.fill();
      // 液体（按液量比例从杯底升起；溶液色沿用世界渲染取色）
      const { color, alpha } = o.solution ? solutionColor(o.solution) : { color: '#9adcff', alpha: 0.2 };
      const vol = o.solution && o.solution.volume > 0 ? o.solution.volume : CFG.item.beakerCapacity;
      const frac = Math.max(0, Math.min(1, (o.solution ? o.solution.totalMass() : 0) / vol));
      if (frac > 0.01) {
        ctx.save();
        glassPath();
        ctx.clip();
        const lh = Math.max(1.5, (bh - 4) * frac);
        const ly = by + bh - 2 - lh;
        ctx.globalAlpha = Math.max(alpha, 0.42);
        ctx.fillStyle = color;
        ctx.fillRect(bx + 1, ly, bw - 2, lh + 1.5);
        ctx.globalAlpha = 1;
        // 液面亮线
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(bx + 1.4, ly, bw - 2.8, 0.9);
        ctx.restore();
      }
      // 玻璃描边 + 左侧高光
      glassPath();
      ctx.strokeStyle = 'rgba(205,225,255,0.75)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + 1.2, by + 3);
      ctx.lineTo(bx + 1.2, by + bh - botR - 1);
      ctx.stroke();
      // 杯口开口：深色扁椭圆 + 两侧极短铜口沿（不是盖在杯口的横梁）
      ctx.beginPath();
      ctx.ellipse(0, by + 1.2, bw / 2 - 0.8, Math.max(1.2, bw * 0.05), 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(7,10,26,0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(205,225,255,0.65)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      const tickW = 2.4;
      for (const sx of [bx - 0.2, bx + bw - tickW + 0.2]) {
        rr(ctx, sx, by - 0.4, tickW, 2.0, 0.7);
        ctx.fillStyle = brass(sx, by - 0.4, tickW, 2.0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,20,6,0.7)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      // 右侧刻度（两道短线）
      ctx.strokeStyle = 'rgba(226,236,255,0.38)';
      ctx.lineWidth = 0.8;
      for (const [gy2, len] of [[by + bh * 0.42, 4.5], [by + bh * 0.62, 3.2]]) {
        ctx.beginPath();
        ctx.moveTo(bx + bw - 2, gy2);
        ctx.lineTo(bx + bw - 2 - len, gy2);
        ctx.stroke();
      }
      ctx.restore(); // 图标缩放结束（质量小字用未缩放坐标）
      this._slotGrams(ctx, `${(o.solution ? o.solution.totalMass() : 0).toFixed(0)}g`, cx, r.y + size - 5);
    } else if (s.item === 'dropper') {
      // ---- 迷你滴管：黄铜卡箍 + 暗紫玻璃细管 + 红胶头 + 管内液面 ----
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      const { color: lcolor, alpha: lalpha } = o.liquid > 1e-9 ? o.liquidColor() : { color: '#9fdcff', alpha: 0.5 };
      const frac = Math.max(0, Math.min(1, o.liquid / o.capacity));
      const tubeTop = -7;
      const tubeBot = 12;
      const tubeHalfTop = 2.8;
      const tubeHalfBot = 1.4;
      const tubePath = () => {
        ctx.beginPath();
        ctx.moveTo(-tubeHalfTop, tubeTop);
        ctx.lineTo(tubeHalfTop, tubeTop);
        ctx.lineTo(tubeHalfBot, tubeBot);
        ctx.lineTo(-tubeHalfBot, tubeBot);
        ctx.closePath();
      };
      // 玻璃细管（暗紫玻璃）
      tubePath();
      const tg = ctx.createLinearGradient(-tubeHalfTop, 0, tubeHalfTop, 0);
      tg.addColorStop(0, 'rgba(190,215,255,0.34)');
      tg.addColorStop(0.45, 'rgba(110,95,190,0.20)');
      tg.addColorStop(1, 'rgba(190,215,255,0.28)');
      ctx.fillStyle = tg;
      ctx.fill();
      // 管内液体（按比例自底向上；液面小椭圆高光）
      if (frac > 0.01) {
        ctx.save();
        tubePath();
        ctx.clip();
        const hInner = tubeBot - tubeTop - 1.2;
        const lh = hInner * frac;
        const ly = tubeBot - 0.6 - lh;
        ctx.globalAlpha = Math.max(lalpha, 0.45);
        ctx.fillStyle = lcolor;
        ctx.fillRect(-tubeHalfTop - 0.5, ly, tubeHalfTop * 2 + 1, lh + 1.5);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.ellipse(0, ly + 0.5, tubeHalfBot * 0.85, 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // 玻璃描边 + 左缘高光
      tubePath();
      ctx.strokeStyle = 'rgba(210,230,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-tubeHalfTop + 0.7, tubeTop + 1);
      ctx.lineTo(-tubeHalfBot + 0.3, tubeBot - 1);
      ctx.stroke();
      // 黄铜卡箍（胶头/玻璃管交界）
      rr(ctx, -4.6, -10.2, 9.2, 2.6, 1.1);
      ctx.fillStyle = brass(0, -10.2, 9.2, 2.6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,6,0.75)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // 红橡胶胶头（泪滴：圆肩 → 收腰进卡箍；高光）
      const bg = ctx.createRadialGradient(-2, -17, 0.5, 0, -16, 8);
      bg.addColorStop(0, '#ff9298');
      bg.addColorStop(0.55, '#d23a46');
      bg.addColorStop(1, '#8e1f2a');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(-3.3, -10.4);
      ctx.bezierCurveTo(-6.7, -13.6, -6.2, -20.2, 0, -20.4);
      ctx.bezierCurveTo(6.2, -20.2, 6.7, -13.6, 3.3, -10.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,12,18,0.5)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(-2.2, -17.2, 1.4, 2.2, -0.5, 0, Math.PI * 2);
      ctx.fill();
      // 锥形滴嘴 + 尖端小液珠（有液体时）
      ctx.beginPath();
      ctx.moveTo(-tubeHalfBot, tubeBot);
      ctx.lineTo(0, tubeBot + 6.4);
      ctx.lineTo(tubeHalfBot, tubeBot);
      ctx.closePath();
      ctx.fillStyle = 'rgba(190,215,255,0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,230,255,0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      if (o.liquid > 1e-9) {
        ctx.globalAlpha = Math.max(lalpha, 0.5);
        ctx.fillStyle = lcolor;
        ctx.beginPath();
        ctx.arc(0, tubeBot + 7.6, 1.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(-0.35, tubeBot + 7.2, 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      // 右侧刻度短线（两道）
      ctx.strokeStyle = 'rgba(235,245,255,0.5)';
      ctx.lineWidth = 0.7;
      for (const yy of [tubeTop + 5, tubeTop + 9]) {
        ctx.beginPath();
        ctx.moveTo(tubeHalfTop - 1, yy);
        ctx.lineTo(tubeHalfTop + 1.6, yy);
        ctx.stroke();
      }
      ctx.restore();
      this._slotGrams(ctx, o.liquid > 1e-9 ? `${o.liquid.toFixed(1)}g` : '', cx, r.y + size - 5);
    } else if (s.item === 'bottle') {
      // ---- 迷你集气瓶：瓶口敞开 + 暗紫玻璃瓶身 + 充满瓶内的淡气体雾 ----
      const bw = 19;
      const bh = 22;
      const botR = 3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      const bx = -bw / 2;
      const bodyY = -6;
      const color = o.gasFillColor();
      const frac = Math.max(0, Math.min(1, o.totalGas() / o.capacity));
      // 玻璃瓶身（暗紫玻璃）
      rr(ctx, bx, bodyY, bw, bh, botR);
      const glass = ctx.createLinearGradient(bx, bodyY, bx, bodyY + bh);
      glass.addColorStop(0, 'rgba(150,130,230,0.26)');
      glass.addColorStop(0.5, 'rgba(80,70,150,0.15)');
      glass.addColorStop(1, 'rgba(120,110,200,0.22)');
      ctx.fillStyle = glass;
      ctx.fill();
      // 气体：整瓶均匀淡雾（没有液面/没有底部堆积）
      if (frac > 0.01) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bx + 0.8, bodyY + 0.8, bw - 1.6, bh - 1.6, Math.max(1.5, botR - 1));
        ctx.clip();
        ctx.globalAlpha = 0.16 + 0.20 * frac;
        ctx.fillStyle = color;
        ctx.fillRect(bx + 1, bodyY + 1, bw - 2, bh - 2);
        ctx.globalAlpha = 1;
        // 两缕很淡的漂移气团
        for (const [px, py, pr] of [[bx + bw * 0.36, bodyY + bh * 0.34, bw * 0.34], [bx + bw * 0.64, bodyY + bh * 0.64, bw * 0.3]]) {
          const g = ctx.createRadialGradient(px, py, 1, px, py, pr);
          g.addColorStop(0, rgbaOf(color, 0.22 + 0.12 * frac));
          g.addColorStop(1, rgbaOf(color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
        }
        ctx.restore();
      }
      // 玻璃描边 + 左侧高光
      rr(ctx, bx, bodyY, bw, bh, botR);
      ctx.strokeStyle = 'rgba(205,225,255,0.75)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(bx + 1.3, bodyY + 2);
      ctx.lineTo(bx + 1.3, bodyY + bh - botR - 1);
      ctx.stroke();
      // 瓶颈（玻璃梯形）
      ctx.beginPath();
      ctx.moveTo(bx + 4, bodyY);
      ctx.lineTo(bx + 5, bodyY - 4);
      ctx.lineTo(bx + bw - 5, bodyY - 4);
      ctx.lineTo(bx + bw - 4, bodyY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(140,120,220,0.20)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(205,225,255,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 黄铜卡箍（瓶身/瓶颈交界）
      rr(ctx, bx + 2, bodyY - 1.4, bw - 4, 2.4, 1);
      ctx.fillStyle = brass(0, bodyY - 1.4, bw, 2.4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,6,0.7)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      // 敞开瓶口：暗色椭圆 + 细玻璃口沿（没有盖板）
      ctx.beginPath();
      ctx.ellipse(0, bodyY - 3.8, bw / 2 - 5, 1.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(7,10,26,0.62)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(205,225,255,0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // 下部黄铜卡箍 + 底部暗钢圈
      rr(ctx, bx + 0.5, bodyY + bh - 7.5, bw - 1, 2, 1);
      ctx.fillStyle = brass(0, bodyY + bh - 7.5, bw, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,6,0.6)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      rr(ctx, bx, bodyY + bh - 2.4, bw, 2.4, 1);
      ctx.fillStyle = 'rgba(58,63,92,0.95)';
      ctx.fill();
      ctx.restore(); // 图标缩放结束（质量小字用未缩放坐标）
      this._slotGrams(ctx, o.totalGas() > 1e-9 ? `${o.totalGas().toFixed(1)}g` : '', cx, r.y + size - 5);
    }
    ctx.restore();
  }

  /** 槽内唯一的小字：质量（空则不画） */
  _slotGrams(ctx, str, cx, y) {
    if (!str) return;
    ctx.font = '10.5px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(str, cx, y);
  }

  // ---- 提示按钮（有可点提示闪光；面板在按钮正下方、右对齐，动画开合） ----
  /** 点击提示按钮：有可用提示 → 展示并展开面板；无可用 → 已开则收起、
   *  未开则显示俏皮话（无提示关卡/时机未到）。 */
  onTipClick(scene) {
    const text = scene.showNextTip ? scene.showNextTip() : null;
    if (text) {
      this._tipText = text;
      this._tipSource = 'tip';
      this.showTip = true;
      return;
    }
    if (this.showTip) {
      this.showTip = false; // 已开且无新提示 → 收起
      return;
    }
    this._tipText = this.quipFor(scene);
    this._tipSource = 'quip';
    this.showTip = true;
  }

  /** 关闭提示面板（✕ / 移动端右滑；动画淡出由 _tipA 驱动） */
  closeTip() {
    this.showTip = false;
  }

  /** 移动端右滑提示面板：面板跟随手指（dx≥0），超阈值后由 touch 管线调 closeTip */
  tipSwipe(dx) {
    this._tipSwipeDx = Math.max(0, Math.min(dx, 220));
  }

  /** 滑动手势结束：面板回位（未关闭） */
  tipSwipeEnd() {
    this._tipSwipeDx = 0;
  }

  /** 无提示可展示时的俏皮话：完全没有提示（更没配置）→ 嘲讽；有时机未到 → 提示时机 */
  quipFor(scene) {
    if (scene.tips && scene.tips.length) {
      return QUIPS_WAIT[Math.floor(Math.random() * QUIPS_WAIT.length)];
    }
    if (scene.tip) return scene.tip; // 旧式单条提示（setTip）：照常展示
    return QUIPS_NONE[Math.floor(Math.random() * QUIPS_NONE.length)];
  }

  tipButton(ctx, W, top = 10, right = 0, time = 0) {
    const scene = this.scene;
    const x = W - right - 82;
    const y = top;
    ctx.save();
    para(ctx, x, y, 72, 34, 8);
    const g = ctx.createLinearGradient(x, y, x, y + 34);
    g.addColorStop(0, '#7a5a20');
    g.addColorStop(1, '#4a3410');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.gold.light;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = THEME.gold.light;
    // 有可点提示(1.2s 内)或面板展开：辉光增强
    const flash = this._tipFlash != null && time - this._tipFlash < 1.2;
    ctx.shadowBlur = flash ? 18 : (this.showTip ? 12 : 4);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = flash ? '#fff6d8' : '#ffe9b0';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('提示', x + 36, y + 23);
    ctx.textAlign = 'left';
    // 面板开合动画：_tipA 平滑趋近目标（开=淡入滑入；关=淡出滑出）
    const target = this.showTip ? 1 : 0;
    const cur = this._tipA ?? 0;
    const a = cur + (target - cur) * 0.22;
    this._tipA = Math.abs(a - target) < 0.01 ? target : a;
    if (this._tipA <= 0.01) return;
    const text = this._tipText ?? scene.tip ?? '';
    const lines = text.split('\n');
    // ★ 面板几何**必须**取共享的 tipPanelRect（点击/触控滑闭同一份）：
    //   这里曾自己算 min(W-20,440)，与命中几何（小屏收窄到 340）差 100px——
    //   看着在面板上点，命中却穿透到场景（用户"点击位置和实际被点击位置偏移"）。
    const prShared = tipPanelRect(W, top, right, this._uiH ?? canvasLH(ctx.canvas));
    const pw = prShared.w;
    const py = prShared.y;
    const ph = 16 + 22 + lines.length * 17 + 14;
    const px0 = prShared.x;
    const swipe = Math.max(0, this._tipSwipeDx ?? 0);
    const slide = (1 - this._tipA) * 26; // 开合滑入/滑出（右下方向）
    const alpha = this._tipA * Math.max(0, 1 - swipe / 110);
    const px = px0 + swipe + slide;
    this._tipRect = { x: px, y: py, w: pw, h: ph };
    ctx.save();
    ctx.globalAlpha = alpha;
    rr(ctx, px, py, pw, ph, 10);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.strokeStyle = THEME.gold.deep;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 关闭按钮 ✕（右上角；面板上可点击关闭）
    const cxB = px + pw - 22;
    const cyB = py + 15;
    ctx.strokeStyle = 'rgba(232,184,75,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cxB - 6, cyB - 6);
    ctx.lineTo(cxB + 6, cyB + 6);
    ctx.moveTo(cxB + 6, cyB - 6);
    ctx.lineTo(cxB - 6, cyB + 6);
    ctx.stroke();
    ctx.fillStyle = THEME.gold.text;
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.fillText('提示', px + 14, py + 23);
    ctx.fillStyle = '#e8f2ff';
    ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], px + 14, py + 45 + i * 17);
    ctx.restore();
  }

  // ---- 重开选择菜单（HUD 画布弹层；scene.restartMenuOpen 时绘制，游戏已暂停）----

  /** 重开菜单：全屏暗场 + 居中深紫金边面板（与通关/死亡面板同款），顶部 mono
   *  kicker「CHEZZLE · RESTART」+ 标题「重开」，两个平行四边形按钮竖排：
   *  主按钮「回到存档点」（金色渐变深色字；无存档 = 灰暗禁用态）、
   *  次按钮「整局重开」（冷色斜牌）。几何与命中同源（click.js restartMenuLayout）。 */
  restartMenu(ctx, scene, W, H, time) {
    if (!scene.restartMenuOpen) { this._menuAt = null; return; }
    const L = restartMenuLayout(W, H);
    const pr = L.panel;
    const hasSave = Savepoint.has(scene);
    // 入场淡入（墙钟：菜单打开时游戏时钟已暂停，time 不再前进）
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this._menuAt == null) this._menuAt = now;
    const t = Math.max(0, (now - this._menuAt) / 1000);
    const easeOut = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
    const a = easeOut(t / 0.22);
    const inY = (1 - a) * 10;
    // 主按钮轻微呼吸辉光（用墙钟，暂停时仍缓慢脉动）
    const pulse = 0.5 + 0.5 * Math.sin(now / 420);
    ctx.save();
    ctx.globalAlpha = a;
    // 暗场：与通关/死亡遮罩同一套深紫渐晕
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.12, W / 2, H / 2, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(18,14,46,0.55)');
    vg.addColorStop(1, 'rgba(5,4,16,0.86)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    // 中央很淡的主题底光
    const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.42);
    glow.addColorStop(0, 'rgba(232,184,75,0.09)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    // 面板（深紫渐变 + 金描边 + 8px 辉光，与通关/死亡面板同款）
    panel(ctx, pr.x, pr.y + inY, pr.w, pr.h, THEME.gold.deep, 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 顶部 mono kicker
    ctx.fillStyle = 'rgba(232,184,75,0.75)';
    ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
    ctx.fillText('CHEZZLE · RESTART', W / 2, pr.y + inY + 22);
    // 分隔线（中间亮、两端淡）
    const lg = ctx.createLinearGradient(pr.x + 40, 0, pr.x + pr.w - 40, 0);
    lg.addColorStop(0, 'rgba(232,184,75,0)');
    lg.addColorStop(0.5, 'rgba(232,184,75,0.45)');
    lg.addColorStop(1, 'rgba(232,184,75,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pr.x + 40, pr.y + inY + 36);
    ctx.lineTo(pr.x + pr.w - 40, pr.y + inY + 36);
    ctx.stroke();
    // 标题「重开」
    ctx.fillStyle = THEME.gold.text;
    ctx.font = 'bold 24px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.shadowColor = 'rgba(232,184,75,0.55)';
    ctx.shadowBlur = 10;
    ctx.fillText('重开', W / 2, pr.y + inY + 70);
    ctx.shadowBlur = 0;
    // 按钮（斜牌）：主按钮金色渐变深色字（无存档 = 灰暗禁用），次按钮冷色斜牌
    const cp = { ...L.checkpoint, y: L.checkpoint.y + inY };
    const fl = { ...L.full, y: L.full.y + inY };
    this._menuButton(ctx, cp, hasSave ? 'gold' : 'disabled', '回到存档点', pulse);
    this._menuButton(ctx, fl, 'cold', '整局重开', 0);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /** 重开菜单按钮（平行四边形斜牌）：kind = gold（主按钮）/ disabled（无存档禁用态）/
   *  cold（次按钮，冷色底 + 青描边）。文字居中、保持正立。 */
  _menuButton(ctx, r, kind, label, pulse = 0) {
    const sk = Math.min(12, r.h * 0.26);
    ctx.save();
    para(ctx, r.x, r.y, r.w, r.h, sk);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (kind === 'gold') {
      g.addColorStop(0, '#ffd76a');
      g.addColorStop(0.5, '#e8b84b');
      g.addColorStop(1, '#b9821f');
    } else if (kind === 'disabled') {
      g.addColorStop(0, 'rgba(74,64,52,0.55)');
      g.addColorStop(1, 'rgba(32,27,25,0.55)');
    } else {
      g.addColorStop(0, '#2a3a5e');
      g.addColorStop(1, '#141d38');
    }
    ctx.fillStyle = g;
    ctx.fill();
    if (kind === 'gold') {
      ctx.strokeStyle = 'rgba(255,240,200,0.95)';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(255,215,106,0.85)';
      ctx.shadowBlur = 8 + 4 * pulse;
    } else if (kind === 'disabled') {
      ctx.strokeStyle = 'rgba(232,184,75,0.28)';
      ctx.lineWidth = 1.2;
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = 'rgba(191,230,255,0.75)';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = 'rgba(127,216,255,0.55)';
      ctx.shadowBlur = 6;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = kind === 'gold' ? '#221605' : kind === 'disabled' ? 'rgba(255,233,176,0.38)' : '#bfe6ff';
    ctx.font = 'bold 16px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
    ctx.restore();
  }

  // ---- 通关 / 死亡遮罩（与 HUD 同一套"神话·元素"面板风格：圆角深紫面板 + 金描边，
  //      入场只做淡入 + 轻推；不再用大红/荧光色或大徽记，避免和游戏整体风格脱节。
  //      通关若已有关卡页 DOM 浮层，画布这边只铺暗场，避免两套 UI 叠一起）----
  overlay(ctx, scene, W, H) {
    const st = scene.status;
    if (st !== 'win' && st !== 'died') { this._ovStatus = null; return; }
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this._ovStatus !== st) { this._ovStatus = st; this._ovAt = now; }
    const t = Math.max(0, (now - this._ovAt) / 1000);
    const easeOut = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
    const a = easeOut(t / 0.5);
    const win = st === 'win';
    // 关卡页（levels/report.js）有独立的通关 DOM 浮层：画布只铺暗场，避免重复 UI
    const hasDomWin = win && typeof document !== 'undefined' && document.getElementById &&
      !!document.getElementById('czl-win');
    const cx = W / 2;
    const cy = H / 2;
    ctx.save();
    // 暗场：深紫黑渐晕（与游戏面板同色系，不用红/荧光）
    const vg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.12, cx, cy, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(18,14,46,0.55)');
    vg.addColorStop(1, 'rgba(5,4,16,0.86)');
    ctx.globalAlpha = a;
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    // 中央很淡的主题色底光（金/青，不刺眼）
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.42);
    glow.addColorStop(0, win ? 'rgba(232,184,75,0.10)' : 'rgba(127,216,255,0.07)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    if (hasDomWin) { ctx.restore(); return; }
    // 面板入场：淡入 + 上推 14px（不做夸张缩放）
    const pIn = easeOut(t / 0.5);
    const pw = Math.min(W * 0.56, 400);
    const ph = win ? 188 : 200;
    const px = cx - pw / 2;
    const py = cy - ph / 2 + (1 - pIn) * 14;
    // 与 HUD 同款圆角面板（theme.panel：深紫渐变 + 金描边 + 8px 辉光）
    ctx.globalAlpha = a;
    panel(ctx, px, py, pw, ph, THEME.gold.deep, 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 顶部小标
    ctx.fillStyle = 'rgba(232,184,75,0.75)';
    ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
    ctx.fillText(win ? 'CHEZZLE · 通关' : 'CHEZZLE · 死亡', cx, py + 22);
    // 分隔线（中间亮、两端淡）
    const lg = ctx.createLinearGradient(px + 40, 0, px + pw - 40, 0);
    lg.addColorStop(0, 'rgba(232,184,75,0)');
    lg.addColorStop(0.5, 'rgba(232,184,75,0.45)');
    lg.addColorStop(1, 'rgba(232,184,75,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 40, py + 36);
    ctx.lineTo(px + pw - 40, py + 36);
    ctx.stroke();
    // 元素牌徽记：小平行四边形 + 勾/叉（和选关卡片同源的形状，不用大圆徽）
    const TW = 46;
    const TH = 30;
    const tx = cx - TW / 2;
    const ty = py + 48;
    const mark = easeOut((t - 0.08) / 0.4);
    ctx.save();
    ctx.globalAlpha = a * mark;
    para(ctx, tx, ty, TW, TH, 8);
    ctx.fillStyle = 'rgba(18,14,46,0.85)';
    ctx.fill();
    ctx.strokeStyle = win ? 'rgba(232,184,75,0.85)' : 'rgba(191,230,255,0.7)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.strokeStyle = win ? THEME.gold.text : '#cfe4ff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const mx = cx;
    const my = ty + TH / 2;
    if (win) {
      ctx.beginPath();
      ctx.moveTo(mx - 9, my + 1);
      ctx.lineTo(mx - 2, my + 8);
      ctx.lineTo(mx + 10, my - 7);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(mx - 7, my - 6);
      ctx.lineTo(mx + 7, my + 8);
      ctx.moveTo(mx + 7, my - 6);
      ctx.lineTo(mx - 7, my + 8);
      ctx.stroke();
    }
    ctx.restore();
    // 标题（字号/字重与游戏内标题一致，轻发光）
    const titleIn = easeOut((t - 0.14) / 0.4);
    ctx.globalAlpha = a * titleIn;
    ctx.fillStyle = win ? THEME.gold.text : '#dbe7ff';
    ctx.font = 'bold 26px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.shadowColor = win ? 'rgba(232,184,75,0.55)' : 'rgba(127,216,255,0.35)';
    ctx.shadowBlur = 10;
    ctx.fillText(win ? '通关' : '死亡', cx, py + 104);
    ctx.shadowBlur = 0;
    // 副文案 / 死亡搞笑文案
    const subIn = easeOut((t - 0.2) / 0.4);
    ctx.globalAlpha = a * subIn;
    ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = win ? '#b9c6dd' : '#c9d6ee';
    const sub = win ? '反应完成 · 物质守恒'
      : (scene.deathQuip ?? deathQuip(scene.deathCause, scene.player && scene.player.substance));
    ctx.fillText(sub, cx, py + 132);
    // 操作提示：与游戏按钮同款"斜牌 + 冷色底 + 细描边"
    if (!win) {
      const touch = this._isTouch();
      // 有存档点：点击/轻触 = 回存档点；R 键 = 整局重开（刷新页面，快照随内存清空）
      const hasSave = Savepoint.has(scene);
      const hintTxt = touch
        ? (hasSave ? '轻触屏幕回到存档点' : '轻触屏幕重新开始')
        : (hasSave ? '点击屏幕回到存档点 · R 整局重开' : '点击屏幕重新开始 · R 重开');
      ctx.font = 'bold 11px "Segoe UI", "Microsoft YaHei", sans-serif';
      const hw = ctx.measureText(hintTxt).width + 26;
      const hx = cx - hw / 2;
      const hy = py + ph - 46;
      para(ctx, hx, hy, hw, 24, 7);
      const hg = ctx.createLinearGradient(0, hy, 0, hy + 24);
      hg.addColorStop(0, '#2a3a5e');
      hg.addColorStop(1, '#141d38');
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(127,216,255,0.75)';
      ctx.lineWidth = 1.1;
      ctx.shadowColor = 'rgba(127,216,255,0.8)';
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#bfe6ff';
      ctx.fillText(hintTxt, cx, hy + 12.5);
    }
    ctx.textBaseline = 'alphabetic';
    // 少量星光粒子（通关金 / 死亡青），只做轻微氛围
    for (let i = 0; i < 8; i++) {
      const seed = i * 12.9898;
      const rnd = (k) => {
        const v = Math.sin(seed * k) * 43758.5453;
        return v - Math.floor(v);
      };
      const life = 1.8 + rnd(1) * 1.4;
      const age = (t + rnd(2) * life) % life;
      const k = age / life;
      const px2 = cx + (rnd(3) - 0.5) * pw * 0.9;
      const py2 = win ? py + ph + 8 - k * (ph + 50) : py - 8 + k * (ph + 50);
      ctx.globalAlpha = a * (1 - k) * 0.55;
      ctx.fillStyle = win ? 'rgba(255,233,176,0.9)' : 'rgba(127,216,255,0.8)';
      ctx.beginPath();
      ctx.arc(px2, py2, 0.8 + 1.2 * (1 - k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

