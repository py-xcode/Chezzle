// ============================================================================
// AABB（轴对齐包围盒）：所有碰撞的统一原语（文档的 line/box 双原语已废弃）
// ============================================================================

export class AABB {
  constructor(x = 0, y = 0, w = 0, h = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  get left() { return this.x; }
  get right() { return this.x + this.w; }
  get top() { return this.y; }
  get bottom() { return this.y + this.h; }

  /** 是否包含某点（边界算包含） */
  contains(px, py) {
    return px >= this.left && px <= this.right && py >= this.top && py <= this.bottom;
  }

  /** 是否与另一 AABB 相交（默认严格相交；eps>0 表示接触也算） */
  overlaps(o, eps = 0) {
    return this.left < o.right + eps && this.right > o.left - eps &&
           this.top < o.bottom + eps && this.bottom > o.top - eps;
  }

  /** X 向重叠量（负值=不相交） */
  overlapX(o) {
    return Math.min(this.right, o.right) - Math.max(this.left, o.left);
  }

  /** Y 向重叠量 */
  overlapY(o) {
    return Math.min(this.bottom, o.bottom) - Math.max(this.top, o.top);
  }

  clone() {
    return new AABB(this.x, this.y, this.w, this.h);
  }
}
