// ============================================================================
// 物理体 Body
// ----------------------------------------------------------------------------
// 提供位置/速度/尺寸与碰撞箱。静态体（地板）永不移动；动态体受重力并参与解算。
// 标记：
//   solid      — 阻挡其他动态体（地板静态且实心；物块动态且实心；粒子不实心）
//   pushable   — 可被水平推动（忽略摩擦，前方有空位即可）
//   static     — 固定不动
//   gravity    — 重力系数（0 = 不受重力，如悬挂物体）
//   autoStep   — 允许自动上台阶（玩家）
// ============================================================================

import { AABB } from './aabb.js';

export class Body {
  constructor({
    id = '', x = 0, y = 0, w = 16, h = 16,
    solid = true, pushable = false, static: isStatic = false,
    mass = 1, gravity = 1, autoStep = false,
  } = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vel = { x: 0, y: 0 };
    this.solid = solid;
    this.pushable = pushable;
    this.static = isStatic;
    this.mass = mass;
    this.gravity = gravity;
    this.autoStep = autoStep;

    // 每刻结算后刷新：
    this.onGround = false;   // 脚下是否有实心支撑（可跳跃）
    this.blockedX = false;   // X 向被阻挡
    this.collisions = [];    // 本刻与其相交的物体（含静态体）
  }

  get left() { return this.x; }
  get right() { return this.x + this.w; }
  get top() { return this.y; }
  get bottom() { return this.y + this.h; }

  setTop(v) { this.y = v; }
  setBottom(v) { this.y = v - this.h; }
  setLeft(v) { this.x = v; }
  setRight(v) { this.x = v - this.w; }

  collider() {
    return new AABB(this.x, this.y, this.w, this.h);
  }

  /**
   * 碰撞形状（世界坐标 AABB 列表）。默认单个矩形；网格类对象（玩家/物块）可覆盖为
   * 贴合实际物质的多矩形，使被完全腐蚀掉的部分不占碰撞箱。
   */
  getShapes() {
    return [this.collider()];
  }
}
