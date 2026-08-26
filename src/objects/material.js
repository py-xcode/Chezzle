// ============================================================================
// SolidMaterial：把持有 MaterialGrid 的固体物件（玩家/物块）适配成化学引擎的
// Material 接口。consume → 网格侵蚀；add → 产物附着（生长）。
// ============================================================================

// ============================================================================
// ContainerMaterial：容器的完整材料 = 溶液溶质 + 沉淀/内含物。
// 这样容器内沉淀（如灯上放置的 Cu(OH)2）也能参与分解/催化等自反应。
// ============================================================================
export class ContainerMaterial {
  constructor(containerObj) {
    this.owner = containerObj; // 容器对象：供 _region 取 innerRect、存取沉淀
    this.phase = 'solution';
    this.isPlayer = false;
    this.solution = containerObj.solution; // 供浓度因子使用
  }

  /** 材料本身即"所在容器"，与 SolutionMaterial 语义一致（引擎用 mat.container 判 inContainer） */
  get container() {
    return this;
  }

  avail(id) {
    if (id === 'H2O') return this.solution.water;
    return this.solution.mass(id) + (this.owner.precipitates.get(id) ?? 0);
  }

  consume(id, mass) {
    if (id === 'H2O') {
      const r = Math.min(this.solution.water, mass);
      this.solution.water -= r;
      return r;
    }
    let rest = mass;
    let removed = 0;
    const fromSol = this.solution.remove(id, mass);
    removed += fromSol;
    rest -= fromSol;
    if (rest > 0) removed += this.owner.takePrecipitate(id, rest);
    return removed;
  }

  add(id, mass, origin = null) {
    if (id === 'H2O') {
      this.solution.water += mass;
      return;
    }
    if (origin && this.owner && this.owner.noteSolOrigin) this.owner.noteSolOrigin(id, origin);
    this.solution.add(id, mass);
  }

  ids() {
    const s = new Set(this.solution.ids());
    for (const id of this.owner.precipitates.keys()) s.add(id);
    return [...s];
  }
}

/**
 * 沉淀粒子的材料适配器：让自由沉淀（爆炸掉渣/反应掉渣）能参与反应。
 *  - 浸入容器（池/烧杯）时：ids=粒子物质、avail=粒子质量、container=容器材料，
 *    于是引擎的"容器内反应"循环会把粒子当作固体反应物（如 Zn 粒子 + HCl → H2）。
 *  - 在地面时：ids=[]，不参与任何反应（避免给所有粒子跑自反应的开销）。
 * consume 直接把粒子质量减掉；耗尽后由 Scene 每刻清理移除。
 */
export class ParticleMaterial {
  constructor(particle) {
    this.obj = particle; // Particle 实例
    this.phase = 'solid';
    this.isPlayer = false;
  }

  get container() {
    return this.obj._container ? this.obj._container.material : null;
  }

  ids() {
    return this.obj._container ? [this.obj.substance] : [];
  }

  avail(id) {
    return id === this.obj.substance ? this.obj.amount : 0;
  }

  exposedAvail(id) {
    return this.avail(id); // 粒子整体暴露（无壳包裹）
  }

  consume(id, mass) {
    if (id !== this.obj.substance) return 0;
    const r = Math.min(this.obj.amount, mass);
    this.obj.amount -= r;
    return r;
  }

  add(id, mass) {
    if (id === this.obj.substance) this.obj.amount += mass;
  }
}

export class SolidMaterial {
  constructor(obj) {
    this.obj = obj;
    this.phase = 'solid';
  }

  get isPlayer() {
    return this.obj.isPlayerObj;
  }

  /** 所在容器的溶液 Material（若无容器则为 null） */
  get container() {
    return this.obj.containerMaterial;
  }

  /** 所在容器的液体区域（世界坐标）；无容器则 null */
  _region() {
    const c = this.container;
    if (c && c.owner && typeof c.owner.innerRect === 'function') return c.owner.innerRect();
    return null;
  }

  /**
   * 网格原点：**从当前 body 位置现算**，不依赖滞后的存储值。
   * （化学在 syncGrid 之前执行；若用旧 gridOrigin，快速移动时区域判定会滞后一格，导致侵蚀错位。）
   */
  _origin() {
    const grid = this.obj.grid;
    const aabb = grid.minAABB();
    if (!aabb) return { x: this.obj.x, y: this.obj.y };
    return { x: this.obj.x - aabb.x, y: this.obj.y - aabb.y };
  }

  avail(id) {
    if (!this.obj.grid) return 0;
    const region = this._region();
    // 浸在容器里时，只有与溶液区域重叠的部分可参与反应
    if (region) return this.obj.grid.availInRegion(id, region, this._origin());
    return this.obj.grid.avail(id);
  }

  /** 暴露格中该物质的总质量（g）——反应实际可消耗量（被致密壳包住的内核不计入） */
  exposedAvail(id) {
    if (!this.obj.grid) return 0;
    const region = this._region();
    if (region) return this.obj.grid.exposedAvail(id, region, this._origin());
    return this.obj.grid.exposedAvail(id);
  }

  consume(id, mass) {
    if (!this.obj.grid) return 0;
    const region = this._region();
    if (region) return this.obj.grid.consumeInRegion(id, mass, region, this._origin());
    return this.obj.grid.consume(id, mass);
  }

  /**
   * 添加产物：优先原地转化（写入最近被消耗的格子——固体产物附着在反应物表面，
   * Fe 浸 CuSO₄ 表面就地变铜）；盈余走暴露面渐进生长（growExposed：所有接触面
   * 同时分到一点点，镀层一层层往外长，块均匀变大）。
   * origin：该物质的来源（调试悬停按物质显示：反应附着=反应生成等）。
   */
  add(id, mass, origin = null) {
    let rest = mass;
    if (this.obj.grid) rest -= this.obj.grid.addInPlace(id, mass);
    if (this.obj.noteGridOrigin) this.obj.noteGridOrigin(id, origin);
    if (rest > 0 && this.obj.adhereMaterial) return this.obj.adhereMaterial(id, rest, origin);
    return 0;
  }

  ids() {
    return this.obj.grid ? this.obj.grid.ids() : [];
  }
}
