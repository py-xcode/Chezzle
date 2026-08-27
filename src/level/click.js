// ============================================================================
// 场景点击管线（编辑器试玩 / 导出关卡 / Multiscene 共用同一套）：
//  - 点击：右上「提示」按钮、右下物品栏选格（HUD）；
//  - 按下（mousedown）：场景内可点击物体（onTap，如滴管）——滴管在玩家附近时
//    进入"点击/长按/拖动"候选：移动>6px = 拖动改变位置；按住 0.08s = 长按持续滴；
//    快速抬起 = 单击滴一滴。其它可点击物体 = 立即触发 + 长按（与旧行为一致）；
//  - 抬起（mouseup）：清除按住/拖动标记。
// ============================================================================

import { CFG } from '../core/config.js';

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

/** 中心距离 */
function dist(a, b) {
  return Math.hypot(
    (a.x + (a.w ?? 0) / 2) - (b.x + (b.w ?? 0) / 2),
    (a.y + (a.h ?? 0) / 2) - (b.y + (b.h ?? 0) / 2),
  );
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
 * 按住期间 stepPressTap 会以 0.08s 间隔持续触发（长按=持续滴加）。
 * 未命中 → 清除按住标记并返回 false。
 */
export function handleSceneTapDown(scene, canvas, sx, sy, onInfo = null) {
  if (!scene) return false;
  const hit = hitTap(scene, canvas, sx, sy);
  if (!hit) {
    scene._pressTap = null;
    scene._pressTapT = 0;
    scene._pressCand = null;
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

/**
 * 按下（可拖动物体，如滴管）：先进入候选——移动 >6px = 拖动（不滴）；
 * 按住 0.08s = 长按开始滴；快速抬起 = 单击滴一滴（在按下位置补滴）。
 * 仅当玩家在 dragRange 内时才候选（远离玩家的滴管 = 普通点击滴液）。
 */
export function handleScenePressDown(scene, canvas, sx, sy, onInfo = null) {
  if (!scene) return false;
  const hit = hitTap(scene, canvas, sx, sy);
  if (hit && hit.obj.isDraggable && scene.player && dist(scene.player, hit.obj) <= CFG.item.dragRange) {
    scene._pressCand = { obj: hit.obj, startX: sx, startY: sy, world: hit.world, downT: 0, moved: false };
    scene._pressTap = null;
    scene._pressTapT = 0;
    onInfo?.({ type: 'press', object: hit.obj, world: hit.world });
    return true;
  }
  scene._pressCand = null;
  return handleSceneTapDown(scene, canvas, sx, sy, onInfo);
}

/** 移动（按住期间）：拖动 = 移动滴管位置（取消潜在长按滴加） */
export function handleScenePressMove(scene, canvas, sx, sy) {
  if (!scene) return;
  const c = scene._pressCand;
  if (c && !c.moved && Math.hypot(sx - c.startX, sy - c.startY) > 6) {
    c.moved = true; // 进入拖动：取消按住滴加（偏移取按下点，避免"先跳一下"）
    scene._pressTap = null;
    scene._pressTapT = 0;
    const w0 = screenToWorld(scene, canvas, c.startX, c.startY);
    scene._drag = { obj: c.obj, ox: c.obj.x - w0.x, oy: c.obj.y - w0.y };
  }
  if (scene._drag) {
    const w = screenToWorld(scene, canvas, sx, sy);
    scene._drag.obj.x = w.x + scene._drag.ox;
    scene._drag.obj.y = w.y + scene._drag.oy;
  }
}

/** 抬起：结束候选/拖动；候选未移动 → 单击（在按下位置滴一滴） */
export function handleScenePressUp(scene, canvas = null) {
  if (!scene) return;
  const c = scene._pressCand;
  if (c && !c.moved && canvas) {
    scene._pressCand = null;
    handleSceneTapDown(scene, canvas, c.startX, c.startY);
  }
  scene._pressCand = null;
  scene._drag = null;
  handleSceneTapUp(scene);
}

/** 每 tick 推进：候选长按转换 + 按住持续执行（0.08s/次） */
export function stepPressTap(scene, dt) {
  if (!scene) return;
  const c = scene._pressCand;
  if (c && !c.moved) {
    c.downT = (c.downT ?? 0) + dt;
    if (c.downT >= 0.08) {
      // 长按开始：转换为按住滴加（滴一笔 + 进入 0.08s 节奏）
      scene._pressCand = null;
      const ok = c.obj.onTap(scene);
      scene._pressTap = ok ? c.obj : null;
      scene._pressTapT = 0;
    }
  }
  if (scene._pressTap) {
    scene._pressTapT = (scene._pressTapT ?? 0) + dt;
    if (scene._pressTapT >= 0.08) {
      scene._pressTapT = 0;
      const o = scene._pressTap;
      if (!scene.objects.includes(o) || typeof o.onTap !== 'function' || !o.onTap(scene)) {
        scene._pressTap = null; // 用完/失败/已移除 → 停止
      }
    }
  }
}

/** 给画布绑定交互（getScreenPos / getActive 由调用方提供：单场景/多场景都行）：
 *  mousedown=按下（点击滴液/长按/拖动候选），mousemove=拖动，
 *  click=HUD（提示/选格），mouseup=抬起 */
export function bindSceneClick(canvas, getScreenPos, getActive) {
  const active = () => {
    const a = getActive();
    return a && a.scene ? a : null;
  };
  canvas.addEventListener('mousedown', (e) => {
    const a = active();
    if (!a) return;
    const { x, y } = getScreenPos(e);
    handleScenePressDown(a.scene, canvas, x, y);
  });
  window.addEventListener('mousemove', (e) => {
    const a = active();
    if (!a) return;
    const { x, y } = getScreenPos(e);
    handleScenePressMove(a.scene, canvas, x, y);
  });
  canvas.addEventListener('mouseup', () => {
    const a = active();
    if (a) handleScenePressUp(a.scene, canvas);
  });
  window.addEventListener('mouseup', () => {
    const a = active();
    if (a) handleScenePressUp(a.scene);
  });
  canvas.addEventListener('click', (e) => {
    const a = active();
    if (!a) return;
    const { x, y } = getScreenPos(e);
    handleSceneClick(a.scene, a.hud ?? null, canvas, x, y);
  });
}
