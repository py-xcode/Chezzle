// ============================================================================
// 键盘输入 → Scene.control（长按）/ Scene.pressed（本刻刚按下）
// 触控暂不实现（接口位预留）。
// ============================================================================

const KEYMAP = {
  KeyA: 'left',
  KeyD: 'right',
  Space: 'jump',
  ShiftLeft: 'place',
  ShiftRight: 'place',
  KeyQ: 'collect',
  KeyC: 'grab', // 拾取物品/吸液/（按住）集气
  KeyX: 'use', // 烧杯倒入 /（按住）集气瓶通气
};

export function bindKeyboard(scene) {
  // 立即清空：右键菜单、焦点切换、页面隐藏等会吞掉 keyup 的场景
  const onClear = () => {
    scene.control.clear();
    scene.pressed.clear();
  };
  const onDown = (e) => {
    // 页面不在前台时忽略按键
    if (typeof document !== 'undefined' && !document.hasFocus()) return;
    // 运行时钩子：任意键都可被插件/关卡脚本监听（返回 true 表示已处理）
    scene._fireKey('down', e);
    if (e.code === 'KeyR') {
      scene.restart();
      return;
    }
    // 调试模式：F5 暂停/继续，F6 步进一 tick，X 循环切换悬停重叠目标
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
    const c = KEYMAP[e.code];
    if (!c) return;
    e.preventDefault();
    if (!scene.control.has(c)) scene.pressed.add(c);
    scene.control.add(c);
  };
  const onUp = (e) => {
    scene._fireKey('up', e);
    const c = KEYMAP[e.code];
    if (c) scene.control.delete(c);
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onClear);
  window.addEventListener('contextmenu', onClear); // 右键菜单会吞 keyup
  window.addEventListener('focusout', onClear); // 焦点移出（点击别处、切换焦点）
  document.addEventListener('visibilitychange', onClear);
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onClear);
    window.removeEventListener('contextmenu', onClear);
    window.removeEventListener('focusout', onClear);
    document.removeEventListener('visibilitychange', onClear);
  };
}
