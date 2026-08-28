// ============================================================================
// 移动端触控（仅触屏设备/小屏；桌面 `pointer:fine` 完全不受影响，逻辑全部走
// isTouchDevice() 门槛，宽松鼠标/触控笔照旧走 bindSceneClick 的鼠标管线）：
//
//  - 左下：半透明半圆摇杆基座 + 摇杆球。方向**5 向吸附**（上/左上/右上/左/右，
//    下半圆一律不触发）：向左=左走、左上=左跳、上=跳、右上=右跳、右=右走。
//    摇杆语义与键盘完全一致（写入 scene.control 的 left/right/jump）。
//  - 右下：Q 收集 / ⇧ 放置 / C 拾取… / X 倒出… 四键（C/X 支持**按住**：
//    与键盘 keydown/keyup 完全同语义——C 按住收气、X 按住通气），下方是物品栏。
//  - 场景内：与鼠标同一套"按下/拖动/抬起"管线（滴管点击滴液、长按持续滴、
//    液下吸取、拖动），触点落在 UI 控件外即进入该管线。
//  - 鸟瞰（灵魂出窍）：进入后触点改走手势管线——1 指拖动 = 平移、2 指捏合 =
//    缩放（中点为锚）；"返回"按钮退出（桌面 V 键 / HUD 鸟瞰按钮同效）。
//  - 全屏：首个触点自动请求全屏（小屏金贵；iOS 不支持元素全屏 → 静默跳过），
//    HUD ⛶ 按钮可随时切换。
//  - 竖屏：HUD 层画"请旋转设备"提示（游戏照常运行）。
//
// 几何约定：所有触控按钮/摇杆命中区 = 画布坐标（同 palette.js 的 inventorySlotRects），
// HUD 渲染与命中**共用同一套几何函数**（joyGeom/touchButtonRects），保证点哪是哪。
// ============================================================================

import { CFG } from './config.js';
import {
  handleSceneClick,
  handleScenePressDown,
  handleScenePressMove,
  handleScenePressUp,
  inventorySlotRects,
  uiMargins,
  overviewButtonRect,
  hudTopOffset,
} from '../level/click.js';
import { requestFullscreenOnce } from './fullscreen.js';

// ---------------------------------------------------------------------------
// 设备检测
// ---------------------------------------------------------------------------

/** 是否移动端（触屏为主要输入）。可被 forceTouch() 覆盖（E2E/调试用）：
 *  - URL `?touch=1` / `?touch=0` 优先；
 *  - 全局 `__chezzleTouchMode`（forceTouch 写入）次之；
 *  - 未标注时：coarse 指针 或（有触摸点且屏幕很小）= 移动端。
 *    触屏笔记本（fine 指针 + 大屏）保持桌面逻辑。 */
export function isTouchDevice() {
  if (typeof window === 'undefined') return !!globalThis.__chezzleTouchMode;
  const q = /[?&]touch=([01])/.exec(location.search || '');
  if (q) return q[1] === '1';
  if (globalThis.__chezzleTouchMode !== undefined) return !!globalThis.__chezzleTouchMode;
  if (window.__chezzleTouch !== undefined) return window.__chezzleTouch;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const tiny = navigator.maxTouchPoints > 0 && Math.min(innerWidth, innerHeight) < 500;
  window.__chezzleTouch = coarse || tiny;
  return window.__chezzleTouch;
}

/** 强制覆盖移动端判定（true/false）；已绑定的 TouchUI 立即刷新画面/相机/布局 */
export function forceTouch(v) {
  globalThis.__chezzleTouchMode = !!v;
  for (const ui of UIS) ui.refresh();
}

/** 现役 TouchUI 列表（forceTouch 刷新用） */
const UIS = [];

// ---------------------------------------------------------------------------
// 几何（HUD 渲染与触控命中共用）——画布坐标
// ---------------------------------------------------------------------------

/** 摇杆：左下角半圆（直径贴底边，圆心即摇杆原点），cx/cy = 圆心，R = 半径。
 *  半圆 = { dist ≤ R 且 y ≤ cy }（上部半圆）。 */
export function joyGeom(W, H, insets = {}) {
  const R = CFG.touch.joyR;
  const cx = (insets.left ?? 0) + 14 + R;
  const cy = H - (insets.bottom ?? 0) - 12;
  return { cx, cy, R };
}

/** 右下按钮：2×2 块（C 上左 / X 上右 / Q 下左 / ⇧ 下右），下方是物品栏。
 *  与物品栏几何（inventorySlotRects，触屏边距版）共用坐标，按钮块贴着物品栏上沿。 */
export function touchButtonRects(W, H, slots, insets = {}) {
  if (!slots || slots.length === 0) return [];
  const btn = CFG.touch.btnSize;
  const gap = CFG.touch.btnGap;
  const margins = { bottom: (insets.bottom ?? 0) + CFG.touch.pad, right: (insets.right ?? 0) + CFG.touch.pad };
  const inv = inventorySlotRects(W, H, slots, margins);
  let invTop = Infinity;
  let invRight = 0;
  for (const r of inv) {
    if (r.y < invTop) invTop = r.y;
    if (r.x + r.size > invRight) invRight = r.x + r.size;
  }
  const bw = btn * 2 + gap;
  const bx = invRight - bw;
  const by = invTop - 12 - (btn * 2 + gap);
  return [
    { key: 'grab', x: bx, y: by, size: btn },
    { key: 'use', x: bx + btn + gap, y: by, size: btn },
    { key: 'collect', x: bx, y: by + btn + gap, size: btn },
    { key: 'place', x: bx + btn + gap, y: by + btn + gap, size: btn },
  ];
}

/** 点在矩形内（含手指容差 pad） */
function hitRect(r, x, y, pad = 6) {
  return x >= r.x - pad && x <= r.x + r.size + pad && y >= r.y - pad && y <= r.y + r.size + pad;
}

/**
 * 摇杆 5 向吸附输入：给定相对圆心的位移 (dx, dy)（画布坐标，y 向下），
 * 返回 {left, right, jump, sx, sy}（sx/sy = 吸附后的单位方向，供画摇杆球；中性为 0）。
 * 方向只有 5 个：上 / 左上 / 右上 / 左 / 右——下半圆（含下倾）一律不触发。
 * 上半区按最近扇区吸附：右 [0°,22.5°] / 右上 [22.5°,67.5°] / 上 [67.5°,112.5°] /
 * 左上 [112.5°,157.5°] / 左 [157.5°,180°]（角度以竖直向上为 90°）。
 * 其余（下半区）→ 仅水平方向（左/右），水平死区内中性。
 */
export function joyInput(dx, dy, R) {
  const mag = Math.hypot(dx, dy);
  const dead = R * CFG.touch.joyDead;
  if (mag < dead) return { left: false, right: false, jump: false, sx: 0, sy: 0 };
  const dyUp = -dy; // y 向下 → 向上为负
  if (dyUp > 0) {
    // 上半区：按角度就近吸附到 5 向
    const ang = Math.atan2(dyUp, dx); // 0..PI（竖直向上=PI/2）
    const deg = (ang * 180) / Math.PI;
    if (deg < 22.5) return { left: false, right: true, jump: false, sx: 1, sy: 0 };
    if (deg < 67.5) return { left: false, right: true, jump: true, sx: 0.7071, sy: -0.7071 };
    if (deg < 112.5) return { left: false, right: false, jump: true, sx: 0, sy: -1 };
    if (deg < 157.5) return { left: true, right: false, jump: true, sx: -0.7071, sy: -0.7071 };
    return { left: true, right: false, jump: false, sx: -1, sy: 0 };
  }
  // 下半区：仅水平方向；小水平分量（水平死区半径比例）中性
  const hd = R * CFG.touch.horizDead;
  if (dx > hd) return { left: false, right: true, jump: false, sx: 1, sy: 0 };
  if (dx < -hd) return { left: true, right: false, jump: false, sx: -1, sy: 0 };
  return { left: false, right: false, jump: false, sx: 0, sy: 0 };
}

// ---------------------------------------------------------------------------
// 屏幕适配（画布铺满窗口 + 安全区 + 防止浏览器手势）
// ---------------------------------------------------------------------------

const STYLE_ID = 'czl-touch-style';

function ensureBaseStyle() {
  if (typeof document === 'undefined') return;
  // viewport meta：现有关卡页没有 → 注入（禁止缩放/双击缩放；覆盖刘海区）
  if (!document.querySelector('meta[name="viewport"]')) {
    const m = document.createElement('meta');
    m.name = 'viewport';
    m.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    document.head.appendChild(m);
  }
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = [
    'html,body{overflow:hidden!important;overscroll-behavior:none!important;',
    '-webkit-user-select:none!important;user-select:none!important;',
    '-webkit-touch-callout:none!important;}',
  ].join('');
  document.head.appendChild(st);
}

/** 读取安全区（刘海/圆角/Home 指示条）：CSS env() → 计算值。缓存，resize 时刷新 */
function safeInsets() {
  if (typeof document === 'undefined') return { top: 0, bottom: 0, left: 0, right: 0 };
  const cached = document.documentElement.getAttribute('data-czl-insets');
  if (cached) try { return JSON.parse(cached); } catch (e) { /* 重新计算 */ }
  const cs = window.getComputedStyle(document.documentElement);
  const num = (v, d = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };
  const v = (n) => cs.getPropertyValue(`--czl-sa${n}`);
  const out = {
    top: num(v('t')),
    bottom: num(v('b')),
    left: num(v('l')),
    right: num(v('r')),
  };
  document.documentElement.setAttribute('data-czl-insets', JSON.stringify(out));
  return out;
}

function clearInsetsCache() {
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-czl-insets');
  }
}

function ensureInsetVars() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('czl-inset-vars')) return;
  const st = document.createElement('style');
  st.id = 'czl-inset-vars';
  st.textContent =
    ':root{--czl-sat:env(safe-area-inset-top,0px);--czl-sab:env(safe-area-inset-bottom,0px);' +
    '--czl-sal:env(safe-area-inset-left,0px);--czl-sar:env(safe-area-inset-right,0px);}';
  document.head.appendChild(st);
}

/** 画布铺满窗口（触屏端） */
function fitCanvas(canvas) {
  if (typeof document === 'undefined') return;
  const w = Math.max(1, Math.round(document.documentElement.clientWidth || window.innerWidth || 0));
  const h = Math.max(1, Math.round(document.documentElement.clientHeight || window.innerHeight || 0));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.style.display = 'block';
  canvas.style['z-index'] = '1';
  canvas.style.touchAction = 'none';
}

// ---------------------------------------------------------------------------
// TouchUI：触控控制器（每个画布一个；多场景 = 每场景画布各一个）
// ---------------------------------------------------------------------------

const JOY_KEYS = ['left', 'right', 'jump'];

export class TouchUI {
  /**
   * @param canvas 游戏画布（触屏端铺满窗口）
   * @param getActive () => {scene, hud} | null —— 单场景/多场景共用（取"当前激活"）
   */
  constructor(canvas, getActive) {
    this.canvas = canvas;
    this.getActive = getActive;
    this.insets = { top: 0, bottom: 0, left: 0, right: 0 };
    this.joy = null; // { id, x, y, sx, sy, dir }（sx/sy 为吸附后单位方向）
    this.buttons = new Map(); // touchId → key（按下中的按键）
    this.uiTouches = new Set(); // 被 HUD UI（提示/物品栏）消费的触点
    this.sceneTouch = null; // { id }：进入场景按下/拖动管线的触点（单指）
    this.ovTouches = new Map(); // 鸟瞰手势触点 id → {x,y}（1指平移 / 2指捏合缩放）
    this._ctlScene = null; // 摇杆控制写入的 scene（切场景时释放旧场景的按键）
    this._bound = false;
  }

  enabled() {
    return isTouchDevice();
  }

  /** 竖屏（触屏端）？HUD 画旋转提示 */
  isPortrait() {
    return this.enabled() && this.canvas.width < this.canvas.height;
  }

  /** 某按键当前是否被按住（HUD 高亮用） */
  isPressed(key) {
    for (const k of this.buttons.values()) if (k === key) return true;
    return false;
  }

  /** 摇杆几何（画布坐标） */
  geom() {
    return joyGeom(this.canvas.width, this.canvas.height, this.insets);
  }

  /** 按钮矩形（画布坐标） */
  buttonRects() {
    const act = this.getActive();
    const slots = act && act.scene && act.scene.player ? act.scene.player.inventory.slots : [];
    return touchButtonRects(this.canvas.width, this.canvas.height, slots, this.insets);
  }

  /** 设备/布局刷新：安全区、画布铺满、相机移动端视野（forceTouch / resize 时调用）。
   *  视野按屏幕短边动态分配：手机（短边≈390）= 基准 viewH；平板短边更长 →
   *  视野同比放大（上限 viewHMax）——大屏不再"元素偏大、视角偏小"。 */
  refresh() {
    if (!this.enabled()) return;
    ensureBaseStyle();
    ensureInsetVars();
    clearInsetsCache();
    this.insets = safeInsets();
    fitCanvas(this.canvas);
    const act = this.getActive();
    if (act && act.scene && act.scene.camera) {
      let viewH = CFG.touch.viewH;
      if (typeof window !== 'undefined' && window.innerWidth && window.innerHeight) {
        const short = Math.min(window.innerWidth, window.innerHeight);
        viewH = Math.round(Math.min(
          CFG.touch.viewHMax,
          Math.max(CFG.touch.viewHMin, (CFG.touch.viewH * short) / CFG.touch.viewHRef),
        ));
      }
      act.scene.camera.mobileViewH = viewH;
      act.scene._touchUI = this;
    }
  }

  /** 释放某场景里摇杆写入的控制键（切场景/抬指时） */
  _releaseJoyControl(scene) {
    if (!scene) return;
    for (const k of JOY_KEYS) scene.control.delete(k);
  }

  /** 摇杆触点移动 → 写入当前激活场景的 control（5 向吸附） */
  _applyJoy(x, y) {
    const act = this.getActive();
    if (!act || !act.scene) return;
    const scene = act.scene;
    if (scene !== this._ctlScene) {
      // 按住摇杆切换场景：旧场景的按键释放干净（否则切回去玩家自动跑/跳）
      this._releaseJoyControl(this._ctlScene);
      this._ctlScene = scene;
    }
    const joy = this.joy;
    if (!joy) return;
    const g = this.geom();
    const inp = joyInput(x - g.cx, y - g.cy, g.R);
    joy.x = x;
    joy.y = y;
    // 摇杆球视觉位置：吸附方向 → 沿吸附单位方向推到实际幅度；中性 → 实际位置
    const dx = x - g.cx;
    const dy = y - g.cy;
    const mag = Math.hypot(dx, dy);
    const d = Math.min(mag, g.R);
    if (inp.sx || inp.sy) {
      joy.sx = inp.sx * d;
      joy.sy = inp.sy * d;
    } else {
      joy.sx = mag > 1e-6 ? (dx / mag) * d : 0;
      joy.sy = mag > 1e-6 ? (dy / mag) * d : 0;
    }
    for (const k of JOY_KEYS) {
      const on = !!inp[k];
      if (on && !joy.dir[k]) scene.control.add(k);
      if (!on && joy.dir[k]) scene.control.delete(k);
    }
    joy.dir = inp;
  }

  // ---- 单点管线（触点按下/移动/抬起 → 分派角色） ----

  /** 触点按下（画布坐标）。返回 'joy' | 'btn' | 'ui' | 'scene' | 'ov' | null */
  down(id, x, y) {
    const act = this.getActive();
    if (!act || !act.scene) return null;
    const scene = act.scene;
    const hud = act.hud ?? null;
    // 死亡：轻触重开（桌面按 R）
    if (scene.status === 'died') {
      scene.restart();
      return 'died';
    }
    // ⓪ 鸟瞰模式：返回按钮 = 退出；其余触点进手势管线（1指平移 / 2指捏合缩放）
    if (scene.overview) {
      const b = overviewButtonRect(this.canvas.width, hudTopOffset(scene));
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        scene.toggleOverview();
        return 'ui';
      }
      this.ovTouches.set(id, { x, y });
      return 'ov';
    }
    // ① 摇杆：左下半圆（上半部 hit；手指可从半圆上方/左右进入）
    const g = this.geom();
    if (!this.joy && y <= g.cy + 14 && Math.hypot(x - g.cx, y - g.cy) <= g.R + 14) {
      this.joy = { id, x, y, sx: 0, sy: 0, dir: { left: false, right: false, jump: false } };
      this._applyJoy(x, y);
      return 'joy';
    }
    // ② 右下按钮（Q/⇧/C/X）：按下 = keydown（pressed + control），抬起 = keyup
    for (const r of this.buttonRects()) {
      if (hitRect(r, x, y)) {
        this.buttons.set(id, r.key);
        scene.pressed.add(r.key);
        scene.control.add(r.key);
        return 'btn';
      }
    }
    // ③ HUD：提示按钮 / 物品栏选格（与桌面同一命中几何；hud 可空，showTip 跳过）
    if (handleSceneClick(scene, hud, this.canvas, x, y)) {
      this.uiTouches.add(id);
      return 'ui';
    }
    // ④ 场景：同一套按下/拖动管线（滴管点击/长按/拖动；选中格物品栏已处理）。
    //    手指容差 14px（桌面 6px）——滴管玻璃段只有 11px 宽，手指要点得中
    if (this.sceneTouch && this.sceneTouch.id !== id) return null; // 场景多指：只认第一指
    this.sceneTouch = { id };
    handleScenePressDown(scene, this.canvas, x, y, null, 14);
    return 'scene';
  }

  /** 鸟瞰手势：1指 = 平移；2指 = 双指捏合缩放（中点为锚）+ 中点平移 */
  _applyOverviewGesture(id, x, y) {
    const act = this.getActive();
    const scene = act && act.scene ? act.scene : null;
    const prev = this.ovTouches.get(id);
    if (!scene || !scene.camera || !prev) return;
    if (this.ovTouches.size === 1) {
      scene.camera.panOverview(x - prev.x, y - prev.y, this.canvas.width, this.canvas.height);
    } else if (this.ovTouches.size >= 2) {
      // 取另外一根手指组成捏合对
      let otherId = null;
      for (const k of this.ovTouches.keys()) if (k !== id) { otherId = k; break; }
      const o = otherId != null ? this.ovTouches.get(otherId) : null;
      if (o) {
        const d0 = Math.hypot(prev.x - o.x, prev.y - o.y);
        const d1 = Math.hypot(x - o.x, y - o.y);
        // 中点位移 = 平移；距离比 = 缩放（中点为锚）
        const m0x = (prev.x + o.x) / 2;
        const m0y = (prev.y + o.y) / 2;
        const m1x = (x + o.x) / 2;
        const m1y = (y + o.y) / 2;
        scene.camera.panOverview(m1x - m0x, m1y - m0y, this.canvas.width, this.canvas.height);
        if (d0 > 8) scene.camera.zoomOverview(d1 / d0, m1x, m1y, this.canvas.width, this.canvas.height);
      }
    }
    this.ovTouches.set(id, { x, y });
  }

  /** 触点移动 */
  move(id, x, y) {
    const act = this.getActive();
    if (!act || !act.scene) return;
    const scene = act.scene;
    if (this.ovTouches.has(id)) {
      this._applyOverviewGesture(id, x, y);
      return;
    }
    if (this.joy && this.joy.id === id) {
      this._applyJoy(x, y);
      return;
    }
    if (this.buttons.has(id)) return; // 按钮按住不动（滑出也算按住，同按钮语义）
    if (this.uiTouches.has(id)) return;
    if (this.sceneTouch && this.sceneTouch.id === id) {
      handleScenePressMove(scene, this.canvas, x, y);
    }
  }

  /** 触点抬起/取消 */
  up(id) {
    if (this.ovTouches.has(id)) {
      this.ovTouches.delete(id);
      return;
    }
    const act = this.getActive();
    const scene = act && act.scene ? act.scene : null;
    if (this.joy && this.joy.id === id) {
      this._releaseJoyControl(this._ctlScene ?? scene);
      this._ctlScene = null;
      this.joy = null;
      return;
    }
    if (this.buttons.has(id)) {
      const key = this.buttons.get(id);
      this.buttons.delete(id);
      if (scene) scene.control.delete(key);
      return;
    }
    if (this.uiTouches.has(id)) {
      this.uiTouches.delete(id);
      return;
    }
    if (this.sceneTouch && this.sceneTouch.id === id) {
      this.sceneTouch = null;
      if (scene) handleScenePressUp(scene, this.canvas, 14);
    }
  }

  /** 抬起所有触点（页面失焦/切场景兜底）：等价于全部 keyup + 取消摇杆/拖动 */
  releaseAll() {
    const act = this.getActive();
    const scene = act && act.scene ? act.scene : null;
    this.ovTouches.clear();
    this._releaseJoyControl(this._ctlScene ?? scene);
    this._ctlScene = null;
    this.joy = null;
    for (const key of this.buttons.values()) {
      if (scene) scene.control.delete(key);
    }
    this.buttons.clear();
    this.uiTouches.clear();
    this.sceneTouch = null;
    if (scene) handleScenePressUp(scene, this.canvas, 14);
  }

  // ---- DOM 绑定 ----

  bind() {
    if (this._bound) return () => {};
    // 无 DOM 环境（node 测试/库内嵌入）不绑定
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
    this._bound = true;
    const canvas = this.canvas;
    const pos = (t) => {
      const r = canvas.getBoundingClientRect();
      const kx = canvas.width / Math.max(1, r.width);
      const ky = canvas.height / Math.max(1, r.height);
      return { x: (t.clientX - r.left) * kx, y: (t.clientY - r.top) * ky };
    };
    const enabled = () => isTouchDevice();
    const onStart = (e) => {
      if (!enabled()) return;
      // 首个用户手势自动全屏（小屏金贵；不支持/iOS → 静默跳过；HUD ⛶ 按钮可随时切换）
      requestFullscreenOnce();
      for (const t of e.changedTouches) {
        const p = pos(t);
        this.down(t.identifier, p.x, p.y);
      }
      if (e.cancelable) e.preventDefault();
    };
    const onMove = (e) => {
      if (!enabled()) return;
      for (const t of e.changedTouches) {
        const p = pos(t);
        this.move(t.identifier, p.x, p.y);
      }
      if (e.cancelable) e.preventDefault(); // 阻止下拉刷新/页面滚动
    };
    const onEnd = (e) => {
      if (!enabled()) return;
      for (const t of e.changedTouches) this.up(t.identifier);
      if (e.cancelable) e.preventDefault();
    };
    const onCancel = (e) => {
      if (!enabled()) return;
      for (const t of e.changedTouches) this.up(t.identifier);
    };
    const onCtx = (e) => {
      if (enabled()) e.preventDefault(); // 长按不弹系统菜单/选择
    };
    const onClear = () => this.releaseAll();
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchend', onEnd, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchcancel', onCancel);
    canvas.addEventListener('contextmenu', onCtx);
    window.addEventListener('blur', onClear);
    document.addEventListener('visibilitychange', onClear);
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchcancel', onCancel);
      canvas.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('blur', onClear);
      document.removeEventListener('visibilitychange', onClear);
      this._bound = false;
    };
  }
}

// ---------------------------------------------------------------------------
// 绑定入口（LevelBuilder.start / Multiscene 各画布调用）
// ---------------------------------------------------------------------------

/**
 * 给画布绑定触控（getScreenPos/getActive 语义同 bindSceneClick）。
 * 返回 { ui, unbind }：ui 供 HUD 渲染读取（scene._touchUI）；unbind 解除全部监听。
 */
export function bindTouchUI(canvas, getActive) {
  const ui = new TouchUI(canvas, getActive);
  const unbind = ui.bind();
  const onLayout = () => ui.refresh();
  const debounce = () => {
    clearTimeout(onLayout._t);
    onLayout._t = setTimeout(onLayout, 90);
  };
  const fsChange = () => debounce();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', debounce);
    window.addEventListener('orientationchange', debounce);
    // 进/出全屏：窗口尺寸变化 → 重排画布与安全区
    document.addEventListener('fullscreenchange', fsChange);
    document.addEventListener('webkitfullscreenchange', fsChange);
  }
  UIS.push(ui);
  const act = getActive();
  if (act && act.scene) act.scene._touchUI = ui;
  if (ui.enabled()) ui.refresh();
  return {
    ui,
    unbind: () => {
      unbind();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', debounce);
        window.removeEventListener('orientationchange', debounce);
        document.removeEventListener('fullscreenchange', fsChange);
        document.removeEventListener('webkitfullscreenchange', fsChange);
      }
      const i = UIS.indexOf(ui);
      if (i >= 0) UIS.splice(i, 1);
    },
  };
}
