// ============================================================================
// 全屏（移动端小屏必备：地址栏/系统栏挤占画面）。桌面端也可用（HUD 按钮仅触屏画）。
// 浏览器要求全屏必须发生在用户手势内：自动全屏走"首个触点"请求（requestFullscreenOnce），
// 手动切换走 HUD 按钮（click/touchstart 都是手势上下文）。
// iOS Safari 不支持元素全屏 API → 全部静默降级（不报错、不弹提示）。
// ============================================================================

/** 当前环境是否支持全屏 API（node/无 DOM = false） */
export function fullscreenSupported() {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

/** 当前是否已处于全屏 */
export function isFullscreen() {
  if (typeof document === 'undefined') return false;
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/** 请求全屏（最好在用户手势内调用）；返回 Promise|null（静默吞掉拒绝） */
export function enterFullscreen() {
  if (typeof document === 'undefined' || isFullscreen()) return null;
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen
      ? el.requestFullscreen()
      : el.webkitRequestFullscreen?.();
    if (p && typeof p.catch === 'function') p.catch(() => { /* 用户拒绝/不支持：静默 */ });
    return p ?? null;
  } catch (e) {
    return null;
  }
}

/** 退出全屏 */
export function exitFullscreen() {
  if (typeof document === 'undefined' || !isFullscreen()) return;
  try {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (e) { /* 静默 */ }
}

/** 切换全屏（HUD 按钮） */
export function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}

/** 首个用户手势自动全屏（每页只尝试一次；不支持/已全屏则静默跳过） */
export function requestFullscreenOnce() {
  if (requestFullscreenOnce._done) return;
  requestFullscreenOnce._done = true;
  if (!fullscreenSupported() || isFullscreen()) return;
  enterFullscreen();
}
