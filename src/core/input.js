// ============================================================================
// 键盘输入 → Scene.control（长按）/ Scene.pressed（本刻刚按下）
// 键位来自设置（src/core/prefs.js ← 首页设置面板写入的 localStorage）：
//   左移/右移/跳跃/放置/拾取/抓取/使用/重开/鸟瞰 均可改键；
//   调试键 F5/F6 与"悬停查源 X"是开发用固定键，不参与改键。
// ============================================================================

import { actionOfCode } from './prefs.js';

// 物理按住的键（window 级）：bindKeyboard 随场景切换重绑后，把"仍按住的键"恢复进新
// 场景 control——否则按住方向键走过传送门/切场景会停下（keydown 只发一次，新绑定
// 拿不到按住态；浏览器 auto-repeat 不可依赖）。pressed 不恢复（那是"刚按下"语义，
// 恢复会导致跳跃/放置被误触发）。
const HELD = new Set();

/** 只写入 scene.control 的动作（重开/鸟瞰是即时动作，不进长按集合） */
function isControlAction(a) {
  return a === 'left' || a === 'right' || a === 'jump' || a === 'place' ||
    a === 'collect' || a === 'grab' || a === 'use';
}

export function bindKeyboard(scene) {
  // 立即清空：右键菜单、焦点切换、页面隐藏等会吞掉 keyup 的场景
  const onClear = () => {
    HELD.clear();
    scene.control.clear();
    scene.pressed.clear();
  };
  const onDown = (e) => {
    // 页面不在前台时忽略按键
    if (typeof document !== 'undefined' && !document.hasFocus()) return;
    // 运行时钩子：任意键都可被插件/关卡脚本监听（返回 true 表示已处理）
    scene._fireKey('down', e);
    HELD.add(e.code); // 先记物理态（非方向键 keyup 也要精确释放）
    const action = actionOfCode(e.code);
    if (action === 'restart') {
      // 编辑器试玩：重开按钮/R 键都禁用，避免刷新编辑器丢掉未导出的编辑
      if (!scene.hideRestartButton) scene.restart();
      e.preventDefault();
      return;
    }
    // 鸟瞰模式（灵魂出窍）：暂停模拟，自由缩放/平移看整关
    if (action === 'overview' && typeof scene.toggleOverview === 'function') {
      scene.toggleOverview();
      e.preventDefault();
      return;
    }
    // 调试模式：F5 暂停/继续，F6 步进一 tick，X 循环切换悬停重叠目标（固定键）
    if (scene.debugMode) {
      if (e.code === 'F5') {
        scene.debugPaused = !scene.debugPaused;
        e.preventDefault();
        return;
      }
      if (e.code === 'F6') {
        scene.debugStepOnce = true;
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyX') {
        // 选中格是可携带物品时，X = 倒出/通气（物品交互优先）；仅普通物质时
        // 才用作"悬停重叠循环"调试键（试玩常开调试模式，不能抢玩家的 X）
        const slot = scene.player?.inventory?.selectedSlot?.();
        if (!slot || !slot.item) {
          scene.debugHoverCycle = true;
          e.preventDefault();
          return;
        }
      }
    }
    if (!action) return;
    e.preventDefault();
    if (!scene.control.has(action)) scene.pressed.add(action);
    scene.control.add(action);
  };
  const onUp = (e) => {
    HELD.delete(e.code);
    scene._fireKey('up', e);
    const action = actionOfCode(e.code);
    if (action) scene.control.delete(action);
  };
  // 桌面端：鼠标滚轮 / 数字键 1~5 切换物品栏选中格（不需要点格子）
  const slotCount = () => scene.player?.inventory?.slots?.length ?? 0;
  const onWheel = (e) => {
    const n = slotCount();
    if (!n || scene.status !== 'running' || scene.overview || scene.restartMenuOpen) return;
    const inv = scene.player.inventory;
    const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
    if (!dir) return;
    inv.selected = (inv.selected + dir + n) % n;
    e.preventDefault();
  };
  const onSlotKey = (e) => {
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (!m) return;
    const idx = Number(m[1]) - 1;
    if (idx < 0 || idx >= slotCount()) return;
    if (scene.status !== 'running' || scene.overview || scene.restartMenuOpen) return;
    scene.player.inventory.selected = idx;
    e.preventDefault();
  };
  const onContext = (e) => {
    // 桌面端禁用右键菜单（游戏内右键无用途，还会吞 keyup / 弹菜单打断操作）
    e.preventDefault();
    onClear();
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onSlotKey);
  window.addEventListener('blur', onClear);
  window.addEventListener('contextmenu', onContext); // 右键菜单会吞 keyup；同时禁用右键菜单
  window.addEventListener('focusout', onClear); // 焦点移出（点击别处、切换焦点）
  document.addEventListener('visibilitychange', onClear);
  // ★ 恢复仍按住的键（Multiscene.switchTo 重绑时会调 bindKeyboard——按住方向键
  //   走过传送门，切场景后继续走，不用松开重按）
  for (const code of HELD) {
    const action = actionOfCode(code);
    if (action && isControlAction(action)) scene.control.add(action);
  }
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onSlotKey);
    window.removeEventListener('blur', onClear);
    window.removeEventListener('contextmenu', onContext);
    window.removeEventListener('focusout', onClear);
    document.removeEventListener('visibilitychange', onClear);
    // 只移除监听器——HELD 是"物理按住态"，由 keyup/blur/contextmenu 清除；
    // 解绑（Multiscene.switchTo 先 unbind 再 bind）若清掉 HELD，重绑就恢复不了
    // 仍按住的键（按住方向键走传送门会停下）。
  };
}
