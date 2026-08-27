// ============================================================================
// 场景点击管线（编辑器试玩 / 导出关卡 / Multiscene 共用同一套）：
//  1. 右上「提示」按钮（HUD）；
//  2. 右下物品栏选格；
//  3. 场景内可点击物体（实现 onTap 的对象，如滴管——左键单击滴液）。
// ============================================================================

/** 屏幕坐标 → 世界坐标（与 Renderer.frame 同口径：跟随玩家/聚焦内容） */
export function screenToWorld(scene, canvas, sx, sy) {
  const c = scene.camera;
  if (!c) return { x: sx, y: sy };
  const { scale, offsetX, offsetY } = c.compute(canvas.width, canvas.height, scene.player ?? scene.cameraFocus ?? null);
  return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
}

/**
 * 处理一次画布点击（sx/sy 为画布像素坐标）。
 * hud 可为空（无 HUD 时只处理物体点击）。返回 true = 已消费。
 */
export function handleSceneClick(scene, hud, canvas, sx, sy) {
  if (!scene) return false;
  // 1) 提示按钮（右上）
  if (sx > canvas.width - 68 && sx < canvas.width - 8 && sy > 8 && sy < 34) {
    if (hud) hud.showTip = !hud.showTip;
    return true;
  }
  // 2) 物品栏选格（右下）
  const p = scene.player;
  if (p && p.inventory && hud) {
    const { slotSize } = hud;
    const slots = p.inventory.slots;
    const n = slots.length;
    const gap = 4;
    const total = n * slotSize + (n - 1) * gap;
    const sx0 = canvas.width - total - 10;
    const sy0 = canvas.height - slotSize - 10;
    for (let i = 0; i < n; i++) {
      const bx = sx0 + i * (slotSize + gap);
      if (sx >= bx && sx <= bx + slotSize && sy >= sy0 && sy <= sy0 + slotSize) {
        p.inventory.selected = i;
        return true;
      }
    }
  }
  // 3) 可点击物体（onTap）：从上层往下命中 bbox（±6px 宽容——滴管等细长物体好点中）
  const w = screenToWorld(scene, canvas, sx, sy);
  for (let i = scene.objects.length - 1; i >= 0; i--) {
    const o = scene.objects[i];
    if (typeof o.onTap !== 'function') continue;
    if (w.x >= o.x - 6 && w.x <= o.x + o.w + 6 && w.y >= o.y - 6 && w.y <= o.y + o.h + 6) {
      o.onTap(scene, w);
      return true;
    }
  }
  return false;
}

/** 给画布绑定点击（getScreenPos / getActive 由调用方提供：单场景/多场景都行） */
export function bindSceneClick(canvas, getScreenPos, getActive) {
  canvas.addEventListener('click', (e) => {
    const a = getActive();
    if (!a || !a.scene) return;
    const { x, y } = getScreenPos(e);
    handleSceneClick(a.scene, a.hud ?? null, canvas, x, y);
  });
}
