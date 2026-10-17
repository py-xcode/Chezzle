// ============================================================================
// 引擎侧偏好读取（设置面板写入的 localStorage → 相机 / 触控几何 / 键位）
// ----------------------------------------------------------------------------
// 数据本身由经典脚本 prefs.js 维护（window.ChezzlePrefs）；这里只读并做默认兜底
// （Node 测试、编辑器等没有 prefs.js 的场景 → 全默认，行为与以前完全一致）。
// ============================================================================

/** 可改键的动作（与 prefs.js 的 ACTIONS 一一对应） */
export const KEY_ACTIONS = [
  { id: 'left', label: '左移', def: 'KeyA' },
  { id: 'right', label: '右移', def: 'KeyD' },
  { id: 'jump', label: '跳跃', def: 'Space' },
  { id: 'place', label: '放置 / 倒出', def: 'ShiftLeft' },
  { id: 'collect', label: '拾取', def: 'KeyQ' },
  { id: 'grab', label: '抓取 / 吸取', def: 'KeyC' },
  { id: 'use', label: '使用 / 通气', def: 'KeyX' },
  { id: 'restart', label: '重开', def: 'KeyR' },
  { id: 'overview', label: '鸟瞰', def: 'KeyV' },
];

const DEFAULT_KEYS = (() => {
  const k = {};
  for (const a of KEY_ACTIONS) k[a.id] = a.def;
  return k;
})();

const FALLBACK = Object.freeze({ viewScale: 1, joyScale: 1, btnScale: 1, keys: DEFAULT_KEYS });

function api() {
  if (typeof window === 'undefined') return null;
  return window.ChezzlePrefs && typeof window.ChezzlePrefs.get === 'function' ? window.ChezzlePrefs : null;
}

/** 当前偏好（无 prefs.js 时返回默认值） */
export function getPrefs() {
  const p = api();
  if (!p) return FALLBACK;
  try { return p.get(); } catch (e) { return FALLBACK; }
}

/** 某个动作当前绑定的 KeyboardEvent.code */
export function keyOf(action) {
  const keys = getPrefs().keys || DEFAULT_KEYS;
  return keys[action] || DEFAULT_KEYS[action] || '';
}

/** 物理键位 → 动作 id（找不到返回 null）。
 *  ShiftRight 作为 place 的默认别名：默认 place=ShiftLeft 时右 Shift 也能放置（旧行为）。 */
export function actionOfCode(code) {
  if (!code) return null;
  const keys = getPrefs().keys || DEFAULT_KEYS;
  for (const a of KEY_ACTIONS) if (keys[a.id] === code) return a.id;
  if (code === 'ShiftRight' && keys.place === 'ShiftLeft') return 'place';
  return null;
}

/** 订阅设置变更（返回取消函数；无 prefs.js 时是空订阅） */
export function onPrefsChange(fn) {
  const p = api();
  if (!p || typeof p.listen !== 'function') return function () {};
  return p.listen(fn);
}
