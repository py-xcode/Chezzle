// ============================================================================
// 场景点击管线（编辑器试玩 / 导出关卡 / Multiscene 共用同一套）：
//  - 点击：右上「提示」按钮、右下物品栏选格（HUD）；
//  - 按下（mousedown）：场景内可点击物体（onTap，如滴管）——**按下一次滴一滴并
//    标记"按住"**，按住期间 Scene 每 0.18s 持续触发（长按=持续滴加，松开/用完即停）；
//  - 抬起（mouseup）：清除按住标记。
// ============================================================================

/** 屏幕坐标 → 世界坐标（与 Renderer.frame 同口径：跟随玩家/聚焦内容） */
export function screenToWorld(scene, canvas, sx, sy) {
  const c = scene.camera;
  if (!c) return { x: sx, y: sy };
  const { scale, offsetX, offsetY } = c.compute(canvas.width, canvas.height, scene.player ?? scene.cameraFocus ?? null);
  return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
}

/** 命中可点击物体（onTap；bbox ±6px 宽容——滴管等细长物体好点中） */
function hitTap(scene, canvas, sx, sy) {
  const w = screenToWorld(scene, canvas, sx, sy);
  for (let i = scene.objects.length - 1; i >= 0; i--) {
    const o = scene.objects[i];
    if (typeof o.onTap !== 'function') continue;
    if (w.x >= o.x - 6 && w.x <= o.x + o.w + 6 && w.y >= o.y - 6 && w.y <= o.y + o.h + 6) {
      return { obj: o, world: w };
    }
  }
  return null;
}

/**
 * 处理一次"点击"（提示按钮 / 物品栏选格）。
 * hjude 可为空。返回 true = 已消费。onInfo（可选）诊断回调。
 */
export function handleSceneClick(scene, hud, canvas, sx, sy, onInfo = null) {
  if (!scene) return false;
  // 1) 提示按钮（右上）
  if (sx > canvas.width - 68 && sx < canvas.width - 8 && sy > 8 && sy < 34) {
    if (hud) hud.showTip = !hud.showTip;
    onInfo?.({ type: 'tip' });
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
        onInfo?.({ type: 'slot' });
        return true;
      }
    }
  }
  onInfo?.({ type: 'miss', world: screenToWorld(scene, canvas, sx, sy) });
  return false;
}

/**
 * 处理一次"按下"：命中 onTap 物体 → 立即触发一次（返回 true）并标记"按住目标"；
 * 按住期间 Scene.step 会以 0.18s 间隔持续触发（长按=持续滴加）。
 * 未命中 → 清除按住标记并返回 false。
 */
export function handleSceneTapDown(scene, canvas, sx, sy, onInfo = null) {
  if (!scene) return false;
  const hit = hitTap(scene, canvas, sx, sy);
  if (!hit) {
    scene._pressTap = null;
    scene._pressTapT = 0;
    onInfo?.({ type: 'miss', world: screenToWorld(scene, canvas, sx, sy) });
    return false;
  }
  const ok = hit.obj.onTap(scene, hit.world);
  scene._pressTap = ok ? hit.obj : null; // 失败（无容器/已空）→ 不进入长按
  scene._pressTapT = 0;
  onInfo?.({ type: 'tap', object: hit.obj, success: !!ok, world: hit.world });
  return true;
}

/** 抬起：清除按住标记（长按停止） */
export function handleSceneTapUp(scene) {
  if (!scene) return;
  scene._pressTap = null;
  scene._pressTapT = 0;
}

/** 给画布绑定交互（getScreenPos / getActive 由调用方提供：单场景/多场景都行）：
 *  mousedown=tapDown（滴+按住持续），click=HUD（提示/选格），mouseup=tapUp */
export function bindSceneClick(canvas, getScreenPos, getActive) {
  const active = () => {
    const a = getActive();
    return a && a.scene ? a : null;
  };
  canvas.addEventListener('mousedown', (e) => {
    const a = active();
    if (!a) return;
    const { x, y } = getScreenPos(e);
    handleSceneTapDown(a.scene, canvas, x, y);
  });
  canvas.addEventListener('mouseup', () => {
    const a = active();
    if (a) handleSceneTapUp(a.scene);
  });
  window.addEventListener('mouseup', () => {
    const a = active();
    if (a) handleSceneTapUp(a.scene);
  });
  canvas.addEventListener('click', (e) => {
    const a = active();
    if (!a) return;
    const { x, y } = getScreenPos(e);
    handleSceneClick(a.scene, a.hud ?? null, canvas, x, y);
  });
}
