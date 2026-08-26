// ============================================================================
// Obj 基类：所有物件的根。继承物理 Body，扩展化学/渲染/交互钩子。
// physicsKind: 'static'（地板）| 'dynamic'（玩家/物块/粒子）| 'none'（容器等区域）
// ============================================================================

import { Body } from '../physics/body.js';

let SEQ = 0;

export class Obj extends Body {
  constructor({
    id = '', x = 0, y = 0, w = 16, h = 16,
    solid = true, pushable = false, static: isStatic = false,
    mass = 1, gravity = 1, autoStep = false,
    physicsKind = null, layer = 0, origin = null, hidden = false, noLift = false,
  } = {}) {
    super({ id: id || `obj${++SEQ}`, x, y, w, h, solid, pushable, static: isStatic, mass, gravity, autoStep });
    this.physicsKind = physicsKind ?? (isStatic ? 'static' : 'dynamic');
    this.layer = layer;
    this.hidden = hidden; // 初始隐藏：不可见、无碰撞、不参与逻辑，由开关 showId 开启时显现
    this.noLift = noLift; // 不可被气泡柱/气流托起（重力照常，只是气流不托它）
    // 溯源：此物体"为何存在"。kind ∈ 'level'|'reaction'|'explosion'|'place'|'shell'；text 为附加说明（反应方程式等）。
    // 调试模式鼠标悬停显示（见 hud.hoverPanel）。
    this.origin = origin;
  }

  // ---- 化学引擎 Material 接口（默认无化学） ----
  get material() {
    return null;
  }

  get isPlayerObj() {
    return false;
  }

  /** 所在容器的溶液 Material（固体浸入池/烧杯时） */
  get containerMaterial() {
    return null;
  }

  get isBurning() {
    return false;
  }

  get isLamp() {
    return false;
  }

  get isDoor() {
    return false;
  }

  /** 调试悬停时的类型名（null = 不可悬停/不显示提示，如爆炸/气泡/反应标签等瞬态物） */
  get hoverLabel() {
    return null;
  }

  // ---- 生命周期钩子 ----
  update(dt, scene) {}
  lateUpdate(dt, scene) {} // 物理结算后（绳子等需要覆盖物理结果的对象）
  render(ctx, scene) {}
  onContactBegin(other, scene) {}
  onContactEnd(other, scene) {}

  /** 反应产物附着到自身（默认无） */
  adhereMaterial(id, mass, origin) {
    return 0;
  }

  /**
   * 记录网格内某物质的来源（调试悬停按物质显示：初始=关卡生成、反应附着=反应生成）。
   * 仅持有 grid 的对象（物块/玩家）使用；无 gridOrigins 时惰性创建。
   */
  noteGridOrigin(id, origin = null) {
    if (!this.gridOrigins) this.gridOrigins = new Map();
    if (typeof origin === 'string' && origin) origin = { kind: 'reaction', text: origin };
    if (!origin) {
      if (!this.gridOrigins.has(id)) this.gridOrigins.set(id, { kind: 'level' });
      return;
    }
    this.gridOrigins.set(id, origin);
  }
}
