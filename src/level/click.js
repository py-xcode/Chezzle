// ============================================================================
// 场景点击管线（编辑器试玩 / 导出关卡 / Multiscene 共用同一套）：
//  - 点击：右上「提示」按钮、右下物品栏选格（HUD）；
//  - 按下（mousedown）：场景内可点击物体（onTap，如滴管）——滴管在玩家附近时
//    进入"点击/长按/拖动"候选：移动>dragStartPx = 拖动改变位置；
//    按住 dripArmDelay(0.22s，留出拖动窗口) = 长按持续滴；快速抬起 = 单击滴一滴。
//    **长按已开滴后再拖出 dragAbortPx → 停滴转拖动**（修"长按与拖动冲突"：
//    原来 0.08s 就开滴，鼠标一动之前已经在滴水，几乎无法拖动——用户反馈）；
//    其它可点击物体 = 立即触发 + 长按（与旧行为一致）；
//  - 抬起（mouseup）：清除按住/拖动标记。
// ============================================================================

import { CFG } from '../core/config.js';
import { toggleFullscreen, fullscreenSupported, isFullscreen } from '../core/fullscreen.js';

/** 屏幕坐标 → 世界坐标（与 Renderer.frame 同口径：跟随玩家/聚焦内容；鸟瞰时走鸟瞰视图） */
export function screenToWorld(scene, canvas, sx, sy) {
  const c = scene.camera;
  if (!c) return { x: sx, y: sy };
  const { scale, offsetX, offsetY } = c.compute(canvas.width, canvas.height, scene.player ?? scene.cameraFocus ?? null);
  return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
}

/**
 * 顶部 HUD 起始 y（画布坐标）——左上卡片与顶栏按钮（⛶/鸟瞰/提示）共用，
 * 渲染与命中必须同源。触屏端整体下移：
 *  - 常规：让开左上角"返回选关"悬浮钮（report.js 注入，位于 10,10）；
 *  - 全屏：再让开 iOS 系统全屏关闭按钮（也挂在左上角）——report.js 的返回钮
 *    在全屏时同步下移到 52，这里留到 92。
 * 桌面（fine pointer）维持 10：关卡画布居中显示，左上角是页面留白。
 */
export function hudTopOffset(scene) {
  const t = scene && scene._touchUI;
  if (t && typeof t.enabled === 'function' && t.enabled()) {
    const base = (t.insets && t.insets.top) || 0;
    return Math.max(isFullscreen() ? CFG.touch.hudTopFs : CFG.touch.hudTop, base + 10);
  }
  return 10;
}

// ---- 顶部按钮几何（HUD 渲染与点击命中共用；top 缺省 10 = 桌面） --------------

/** 鸟瞰按钮（提示按钮左侧；双端显示）：返回 {x,y,w,h} */
export function overviewButtonRect(W, top = 10) {
  return { x: W - 158, y: top, w: 72, h: 34 };
}

/** 全屏按钮（仅触屏端显示，图标 ⛶）：在鸟瞰按钮左侧 */
export function fullscreenButtonRect(W, top = 10) {
  return { x: W - 214, y: top, w: 52, h: 34 };
}

function inRect(r, sx, sy) {
  return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
}

/** 场景通知横幅（HUD 顶部中偏下淡入淡出 ~1.6s）：超距提示、吸取失败原因等 */
export function pushNotice(scene, text) {
  if (!scene) return;
  scene._notice = { text, t: scene.time ?? 0 };
}

/** 物品栏槽位几何（HUD 渲染与点击命中**共用这一套数字**，保证点哪是哪）：
 *  普通格 CFG.inventory.slotPx，装物品的格子放大为 itemSlotPx；底边对齐、右缘贴边。
 *  margins：触屏设备传 {bottom, right}（含安全区），桌面默认 10。 */
export function inventorySlotRects(W, H, slots, margins = { bottom: 10, right: 10 }) {
  const gap = 4;
  const margin = 10;
  const n = slots.length;
  const rects = new Array(n);
  let right = W - (margins.right ?? 10);
  for (let i = n - 1; i >= 0; i--) {
    const size = slots[i] && slots[i].item ? CFG.inventory.itemSlotPx : CFG.inventory.slotPx;
    right -= size;
    rects[i] = { x: right, y: H - (margins.bottom ?? 10) - size, size };
    right -= gap;
  }
  return rects;
}

/** 触屏设备上的物品栏边距（安全区 + 固定边距）；桌面=默认值。
 *  HUD 渲染 / touch 命中 / 物品栏点击共用，保证"点哪是哪"。 */
export function uiMargins(scene) {
  const t = scene && scene._touchUI;
  if (t && t.enabled()) {
    const i = t.insets;
    return { bottom: (i.bottom ?? 0) + 10, right: (i.right ?? 0) + 10 };
  }
  return { bottom: 10, right: 10 };
}

/** 命中可点击物体（onTap；bbox ±pad 宽容——滴管等细长物体好点中；
 *   desktop 默认 6，触屏手指传 14（由 touchui 管线传入）） */
function hitTap(scene, canvas, sx, sy, pad = 6) {
  const w = screenToWorld(scene, canvas, sx, sy);
  for (let i = scene.objects.length - 1; i >= 0; i--) {
    const o = scene.objects[i];
    if (typeof o.onTap !== 'function') continue;
    if (w.x >= o.x - pad && w.x <= o.x + o.w + pad && w.y >= o.y - pad && w.y <= o.y + o.h + pad) {
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
 * 处理一次"点击"（提示按钮 / 物品栏选格 / 鸟瞰与全屏按钮）。
 * hud 可为空。返回 true = 已消费。onInfo（可选）诊断回调。
 */
export function handleSceneClick(scene, hud, canvas, sx, sy, onInfo = null) {
  if (!scene) return false;
  const top = hudTopOffset(scene);
  // 0) 鸟瞰模式：只认"返回"按钮（暂停态；未中 → 交给鸟瞰拖动/缩放管线）
  if (scene.overview) {
    if (inRect(overviewButtonRect(canvas.width, top), sx, sy)) {
      scene.toggleOverview();
      onInfo?.({ type: 'overview-exit' });
    }
    return false;
  }
  // 1) 全屏按钮（仅触屏端显示；click/触点都在用户手势内，可请求全屏）。
  //    老设备/浏览器不支持元素全屏 API → 明确提示（不静默失效）
  if (scene._touchUI && typeof scene._touchUI.enabled === 'function' && scene._touchUI.enabled()) {
    if (inRect(fullscreenButtonRect(canvas.width, top), sx, sy)) {
      if (fullscreenSupported()) toggleFullscreen();
      else pushNotice(scene, '此浏览器不支持全屏');
      onInfo?.({ type: 'fullscreen' });
      return true;
    }
  }
  // 2) 鸟瞰按钮（双端）
  if (inRect(overviewButtonRect(canvas.width, top), sx, sy)) {
    scene.toggleOverview();
    onInfo?.({ type: 'overview' });
    return true;
  }
  // 3) 提示按钮（右上；hud.tipButton 同几何：top..top+34）
  if (sx > canvas.width - 84 && sx < canvas.width - 8 && sy > top && sy < top + 34) {
    if (hud) hud.showTip = !hud.showTip;
    onInfo?.({ type: 'tip' });
    return true;
  }
  // 4) 物品栏选格（右下；几何与 HUD 渲染共用 inventorySlotRects）
  const p = scene.player;
  if (p && p.inventory) {
    const rects = inventorySlotRects(canvas.width, canvas.height, p.inventory.slots, uiMargins(scene));
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (sx >= r.x && sx <= r.x + r.size && sy >= r.y && sy <= r.y + r.size) {
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
export function handleSceneTapDown(scene, canvas, sx, sy, onInfo = null, pad = 6) {
  if (!scene || scene.overview) return false; // 鸟瞰：场景管线冻结（拖动/缩放走鸟瞰输入）
  scene._pressHome = null;
  const hit = hitTap(scene, canvas, sx, sy, pad);
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
  scene._pressHome = null;
}

/**
 * 按下（滴管）：按命中位置分流——
 * ① 红色胶头（onBulb）：滴加的**唯一起点**。单击（<0.5s 快速抬起）= 滴一滴；
 *    长按（≥0.5s）= 液上持续滴加 / 液下吸取（尖端在液面下；按滴管自身判定）；
 * ② 玻璃段（isDraggable）：只能拖动（永不转滴）——玩家在 dragRange+slack 内才可；
 * ③ 其它可点击物体（非可拖动类）：立即触发 + 长按（旧行为）。
 * 落在滴管玻璃段但玩家太远 / 无容器等 → 未命中（不滴也不拖）。
 */
export function handleScenePressDown(scene, canvas, sx, sy, onInfo = null, pad = 6) {
  if (!scene || scene.overview) return false; // 鸟瞰：场景管线冻结
  scene._pressHome = null;
  const hit = hitTap(scene, canvas, sx, sy, pad);
  if (!hit) {
    scene._pressCand = null;
    onInfo?.({ type: 'miss', world: screenToWorld(scene, canvas, sx, sy) });
    return false;
  }
  // ① 红色胶头：任意距离可滴/可吸
  if (typeof hit.obj.onBulb === 'function' && hit.obj.onBulb(hit.world)) {
    scene._pressCand = { mode: 'bulb', obj: hit.obj, startX: sx, startY: sy, world: hit.world, downT: 0, moved: false };
    scene._pressTap = null;
    scene._pressTapT = 0;
    onInfo?.({ type: 'press', object: hit.obj, world: hit.world, bulb: true });
    return true;
  }
  // ② 玻璃段拖动候选：靠近玩家才可拖动
  if (hit.obj.isDraggable && scene.player && dist(scene.player, hit.obj) <= CFG.item.dragRange + CFG.item.dragSlack) {
    scene._pressCand = { mode: 'drag', obj: hit.obj, startX: sx, startY: sy, world: hit.world, downT: 0, moved: false };
    scene._pressTap = null;
    scene._pressTapT = 0;
    onInfo?.({ type: 'press', object: hit.obj, world: hit.world });
    return true;
  }
  // ③ 其它可点击物体（非可拖动物）：立即触发 + 长按（旧行为）
  scene._pressCand = null;
  if (typeof hit.obj.onTap === 'function' && !hit.obj.isDraggable) {
    return handleSceneTapDown(scene, canvas, sx, sy, onInfo, pad);
  }
  onInfo?.({ type: 'miss', world: hit.world });
  return false;
}

/** 移动（按住期间）：拖动 = 移动滴管位置；胶头/玻璃段都允许拖。
 *  候选期拖出 dragStartPx → 拖动（不滴）；已开滴/开吸再拖出 dragAbortPx → 停转拖动 */
export function handleScenePressMove(scene, canvas, sx, sy) {
  if (!scene || scene.overview) return;
  const c = scene._pressCand;
  if (c && !c.moved && Math.hypot(sx - c.startX, sy - c.startY) > CFG.item.dragStartPx) {
    c.moved = true;
    // 拖动门槛：滴管不能离玩家太远（拖出范围=放弃，不滴不拖）
    const p = scene.player;
    if (!p || dist(p, c.obj) > CFG.item.dragRange + CFG.item.dragSlack) return;
    scene._pressTap = null;
    scene._pressTapT = 0;
    const w0 = screenToWorld(scene, canvas, c.startX, c.startY);
    scene._drag = { obj: c.obj, ox: c.obj.x - w0.x, oy: c.obj.y - w0.y };
  }
  // 长按已开滴/开吸（候选已被消费）又拖出 abort 距离 → 停、转为拖动同一物体
  const h = scene._pressHome;
  if (!c && !scene._drag && (scene._pressTap || scene._holdSuck) && h && h.obj.isDraggable
      && Math.hypot(sx - h.sx, sy - h.sy) > CFG.item.dragAbortPx
      && scene.player && dist(scene.player, h.obj) <= CFG.item.dragRange + CFG.item.dragSlack) {
    scene._pressTap = null;
    scene._pressTapT = 0;
    scene._holdSuck = null;
    scene._pressHome = null;
    const w0 = screenToWorld(scene, canvas, h.sx, h.sy);
    scene._drag = { obj: h.obj, ox: h.obj.x - w0.x, oy: h.obj.y - w0.y };
  }
  if (scene._drag) {
    const d = scene._drag;
    const o = d.obj;
    const w = screenToWorld(scene, canvas, sx, sy);
    let nx = w.x + d.ox;
    let ny = w.y + d.oy;
    // 拖动范围钳制：滴管拖不出玩家的 dragRange——越界时贴着边界走并提示（一次/会话）
    const p = scene.player;
    if (p) {
      const pcx = p.x + p.w / 2;
      const pcy = p.y + p.h / 2;
      const dx = nx + o.w / 2 - pcx;
      const dy = ny + o.h / 2 - pcy;
      const L = Math.hypot(dx, dy);
      if (L > CFG.item.dragRange && L > 0.001) {
        const k = CFG.item.dragRange / L;
        nx = pcx + dx * k - o.w / 2;
        ny = pcy + dy * k - o.h / 2;
        if (!d._noticed) {
          d._noticed = true;
          pushNotice(scene, '距离玩家太远——滴管拖不出这个范围');
        }
      }
    }
    o.x = nx;
    o.y = ny;
  }
}

/** 抬起：快速单击胶头 = 滴一滴（长按/液下吸取已在 stepPressTap 觉醒）；
 *  玻璃段候选不滴（松开即完成，仅拖动会移动位置）；结束一切按住状态 */
export function handleScenePressUp(scene, canvas = null, pad = 6) {
  if (!scene || scene.overview) return;
  const c = scene._pressCand;
  if (c && c.mode === 'bulb' && !c.moved && c.downT < CFG.item.dripArmDelay && canvas) {
    scene._pressCand = null;
    handleSceneTapDown(scene, canvas, c.startX, c.startY, null, pad); // 单击：在按下位置滴一滴
  }
  scene._pressCand = null;
  scene._drag = null;
  scene._holdSuck = null;
  scene._pressHome = null;
  handleSceneTapUp(scene);
}

/** 每 tick 推进：候选长按觉醒（≥ dripArmDelay：液下→吸取 / 液上→持续滴，胶头专属）
 *  + 液下持续吸取节奏 + 长按持续滴节奏 */
export function stepPressTap(scene, dt) {
  if (!scene || scene.overview) return;
  const c = scene._pressCand;
  if (c && c.mode === 'bulb' && !c.moved) {
    c.downT = (c.downT ?? 0) + dt;
    if (c.downT >= CFG.item.dripArmDelay) {
      // 长按觉醒：液下 → 吸取；液上 → 持续滴加（都只在胶头发生——玻璃段永不滴）
      scene._pressCand = null;
      const o = c.obj;
      const sub = typeof o._submergedIn === 'function' ? o._submergedIn(scene) : null;
      scene._pressHome = { obj: o, sx: c.startX, sy: c.startY };
      if (sub) {
        scene._holdSuck = { obj: o, t: 0 };
        if (!o.attemptSuckOnce(scene)) {
          scene._holdSuck = null;
          scene._pressHome = null;
        }
      } else {
        const ok = o.onTap(scene);
        scene._pressTap = ok ? o : null;
        scene._pressTapT = 0;
        if (!ok) scene._pressHome = null;
      }
    }
  }
  // 液下持续吸取（每 suckPeriod 吸一手；管满/换液/尖端出液面自动停）
  if (scene._holdSuck) {
    scene._holdSuck.t += dt;
    if (scene._holdSuck.t >= CFG.item.suckPeriod) {
      scene._holdSuck.t = 0;
      const o = scene._holdSuck.obj;
      if (!scene.objects.includes(o) || typeof o.attemptSuckOnce !== 'function' || !o.attemptSuckOnce(scene)) {
        scene._holdSuck = null;
      }
    }
  }
  // 长按持续滴
  if (scene._pressTap) {
    scene._pressTapT = (scene._pressTapT ?? 0) + dt;
    if (scene._pressTapT >= CFG.item.dripPeriod) {
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
