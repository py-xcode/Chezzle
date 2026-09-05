// ============================================================================
// 环境大气模型
// ----------------------------------------------------------------------------
// 名义总空气 totalAir（默认 2000g，游戏尺度）：玩家产生 1g 气体 ≈ 0.05% 可见度。
// 初始组成默认 N2 80% / O2 20%。反应产生气体 → add；燃烧耗氧 → remove。
// 百分比按实时总质量计算（HUD 同时显示百分比与质量）。
// ============================================================================

export class Atmosphere {
  constructor({ totalAir = 2000, init = { N2: 0.8, O2: 0.2 } } = {}) {
    this.gas = new Map();
    for (const [id, frac] of Object.entries(init)) {
      this.gas.set(id, totalAir * frac);
    }
    // 保证总质量至少等于 totalAir（预留可加"基准惰性气体"）
    this._baseTotal = totalAir;
    this._cause = null; // 当前反应原因（气体变化溯源；由化学引擎盖章）
    this._log = []; // 本 tick 气体变化日志 [{id, delta, cause}]
  }

  mass(id) {
    return this.gas.get(id) ?? 0;
  }

  total() {
    let s = 0;
    for (const m of this.gas.values()) s += m;
    return s;
  }

  fraction(id) {
    const t = this.total();
    return t === 0 ? 0 : this.mass(id) / t;
  }

  add(id, mass) {
    if (mass <= 0) return;
    this.gas.set(id, this.mass(id) + mass);
    if (this._cause) this._log.push({ id, delta: mass, cause: this._cause });
  }

  /** 直接设置某气体含量（g）——关卡/插件场景大气预设用（覆盖而非累加） */
  setGas(id, mass) {
    if (!Number.isFinite(mass) || mass < 0) return;
    const prev = this.mass(id);
    this.gas.set(id, mass);
    if (this._cause && Math.abs(mass - prev) > 1e-9) this._log.push({ id, delta: mass - prev, cause: this._cause });
  }

  /**
   * 整组大气预设：**先清空所有气体、再按 entries 设置**——"设置过的气体 = 配置值，
   * 没设置的 = 没有"（用户语义：N2:5000, O2:0 → 只剩 N2，氧气为 0）。
   * 空表 = 无预设 → 保持默认地球大气（N2 80% / O2 20%）不动。
   * 注意与 setGas 的区别：setGas 是"覆盖单个"，preset 是"独占整组"（先清零）。
   */
  preset(entries) {
    const list = Object.entries(entries ?? {}).filter(([, m]) => Number.isFinite(m) && m >= 0);
    if (!list.length) return; // 没设置任何气体 → 保持默认（地球大气）
    this.gas.clear();
    for (const [id, mass] of list) {
      this.gas.set(id, mass);
      if (this._cause) this._log.push({ id, delta: mass, cause: this._cause });
    }
  }

  remove(id, mass) {
    if (mass <= 0) return 0;
    const cur = this.mass(id);
    const removed = Math.min(cur, mass);
    this.gas.set(id, cur - removed);
    if (removed > 1e-9 && this._cause) this._log.push({ id, delta: -removed, cause: this._cause });
    return removed;
  }

  /** 取走并清空本 tick 的气体变化日志（调试面板显示产生/消耗原因） */
  flushLog() {
    const out = this._log;
    this._log = [];
    return out;
  }

  o2Fraction() {
    return this.fraction('O2');
  }

  composition() {
    const t = this.total();
    const out = {};
    for (const [id, m] of this.gas) out[id] = m / t;
    return out;
  }
}

// ============================================================================
// AtmosphereMaterial：把大气适配成 Material 接口（作为还原剂 CO/H2、燃烧 O2 的反应物）
// ============================================================================
export class AtmosphereMaterial {
  constructor(atmosphere) {
    this.atmosphere = atmosphere;
    this.phase = 'gas';
    this.isPlayer = false;
    this.container = null;
  }

  avail(id) {
    return this.atmosphere.mass(id);
  }

  consume(id, mass) {
    return this.atmosphere.remove(id, mass);
  }

  add(id, mass) {
    this.atmosphere.add(id, mass);
  }

  ids() {
    return [...this.atmosphere.gas.keys()];
  }
}
