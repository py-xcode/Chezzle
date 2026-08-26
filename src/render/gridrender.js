// ============================================================================
// 固体"网格计算法"（MaterialGrid）——连续质量模型（高中版：多物质网格）
// ----------------------------------------------------------------------------
// 固体 = 二维单元格网格，每格 5px。每格可含**多种物质**（Map<id, mass>），
// 各物质含量可不同，整格总质量 ≤ CELL_MASS (0.1g)。
//   - 消耗只发生在暴露格（有开放边的表层格）——外壳物质挡住内核（如 BaCO₃
//     外壳包住 NaOH 后反应阻断；Cu 壳包住 Fe 后内部不再被溶液侵蚀）。
//   - 固体产物附着：产物优先写入"上次被消耗"的格子（原地转化），
//     Fe 浸 CuSO₄ 时表面就地变铜，物块不膨胀。
// 渲染：每格按各物质质量占比混合颜色；透明度 = 格总剩余质量/满质量。
// ============================================================================

import { getSubstance } from '../chem/substances.js';
import { hexToRgb, rgbToHex } from './color.js';
import { luminance } from './theme.js';

export const CELL_SIZE = 5; // px
export const CELL_MASS = 0.1; // g（每格总质量上限）

/** 参与碰撞/物理的最低格质量（g）：低于此的微量格（渲染几乎透明，如生长层刚
 *  积累的 0.001~0.005g）不计入碰撞箱——否则物块边缘有一圈"看不见却撞得到"的
 *  幽灵层，视觉比碰撞小一圈，看起来像漂浮。0.01g（alpha≈0.1）以上已可辨 → 实心。 */
export const MIN_SOLID_MASS = 0.01;

export class MaterialGrid {
  constructor(cols = 0, rows = 0) {
    this.cols = cols;
    this.rows = rows;
    this.cells = [];
    for (let y = 0; y < rows; y++) this.cells.push(new Array(cols).fill(null));
    this._lastConsume = null; // 最近一次消耗的格子（原地转化用）
    this._totals = {}; // 物质总量缓存（普通对象：键访问远比 Map 快——大网格每次重扫 ~9ms → ~1ms）
    this._totalsValid = false;
    this._exposedVer = 0; // 暴露缓存版本：格内容变化（_invalidateTotals）时 +1
    this._exposedMemo = new Map(); // id -> {ver, sum}：每帧每物质最多全扫一次（原实现每调用一次全扫）
  }

  /** 总量缓存失效（任何"格质量变化"的写路径都必须调用） */
  _invalidateTotals() {
    this._totalsValid = false;
    this._exposedVer++;
    this._ver = (this._ver ?? 0) + 1; // 内容变更计数（暴露缓存按"变更次数"节流）
  }

  _ensureTotals() {
    if (this._totalsValid) return;
    const t = {};
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const m = this.cells[y][x];
        if (!m) continue;
        for (const [id, v] of m) {
          if (v > 1e-12) t[id] = (t[id] ?? 0) + v;
        }
      }
    }
    this._totals = t;
    this._totalsValid = true;
  }

  // ---- 创建 ----
  static rect(w, h, substance) {
    const cols = Math.max(1, Math.round(w / CELL_SIZE));
    const rows = Math.max(1, Math.round(h / CELL_SIZE));
    const g = new MaterialGrid(cols, rows);
    if (substance) g.fill(substance);
    return g;
  }

  static ellipse(w, h, substance) {
    const cols = Math.max(1, Math.round(w / CELL_SIZE));
    const rows = Math.max(1, Math.round(h / CELL_SIZE));
    const g = new MaterialGrid(cols, rows);
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const rx = cols / 2;
    const ry = rows / 2;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) g.set(x, y, substance);
      }
    }
    return g;
  }

  /** 按目标质量生成矩形固体（质量=格数×0.1g） */
  static rectForMass(mass, substance) {
    const cells = Math.max(1, Math.round(mass / CELL_MASS));
    const cols = Math.max(1, Math.round(Math.sqrt(cells)));
    const rows = Math.max(1, Math.round(cells / cols));
    return MaterialGrid.rect(cols * CELL_SIZE, rows * CELL_SIZE, substance);
  }

  /** 按目标质量生成"沉淀堆"梯形网格：上窄下宽、低矮（2~6 行），
   *  第 k 行（0=底）宽 W-2k 且居中——堆形从底部逐行收窄。
   *  质量守恒：每格满 0.1g，总质量 = 格数×0.1（±1 格舍入）。 */
  static heapForMass(mass, substance) {
    const cells = Math.max(6, Math.round(mass / CELL_MASS));
    const H = Math.max(2, Math.min(6, Math.round(Math.sqrt(cells / 8))));
    const W = Math.max(3, Math.ceil(cells / H) + H - 1); // 总格数 = H*W - H(H-1)
    const g = new MaterialGrid(W, H);
    for (let k = 0; k < H; k++) {
      const w = W - 2 * k;
      if (w <= 0) break;
      for (let x = 0; x < w; x++) g.set(k + x, H - 1 - k, substance); // 底行最宽，逐行收窄居中
    }
    return g;
  }

  /** 按目标像素尺寸生成梯形堆（沉淀堆手动缩放）：行数由高决定（2~6 行），
   *  宽 = 目标宽（至少 2H-1 格，保证顶行 ≥1 格）。质量 = 格数×0.1g。 */
  static heapRect(w, h, substance) {
    const H = Math.max(2, Math.min(6, Math.round(h / CELL_SIZE)));
    const W = Math.max(2 * H - 1, Math.round(w / CELL_SIZE));
    const g = new MaterialGrid(W, H);
    for (let k = 0; k < H; k++) {
      const w2 = W - 2 * k;
      if (w2 <= 0) break;
      for (let x = 0; x < w2; x++) g.set(k + x, H - 1 - k, substance);
    }
    return g;
  }

  /** 按目标质量生成椭圆固体 */
  static ellipseForMass(mass, substance, aspect = 1.25) {
    const cells = Math.max(1, Math.round(mass / CELL_MASS));
    const rx = Math.sqrt((cells * aspect) / Math.PI);
    const ry = rx / aspect;
    return MaterialGrid.ellipse(rx * 2 * CELL_SIZE, ry * 2 * CELL_SIZE, substance);
  }

  fill(substance) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) this.set(x, y, substance);
    }
  }

  // ---- 查询 ----
  /** 返回主物质 id（格内质量最多的；空/null 返回 null） */
  get(x, y) {
    const m = this.cell(x, y);
    if (!m) return null;
    let best = null;
    let bestMass = -1;
    for (const [id, mass] of m) {
      if (mass > bestMass) { best = id; bestMass = mass; }
    }
    return best;
  }

  /** 格内物质表（Map<id, mass>），空格返回 null */
  cell(x, y) {
    return y >= 0 && y < this.rows && x >= 0 && x < this.cols ? this.cells[y][x] : null;
  }

  /** 该格总剩余质量（g） */
  cellMass(x, y) {
    const m = this.cell(x, y);
    return m ? this._cellTotal(m) : 0;
  }

  /** 设置整格（id=null 清空；否则满质量单物质） */
  set(x, y, id) {
    if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
      this.cells[y][x] = id ? new Map([[id, CELL_MASS]]) : null;
      this._invalidateTotals();
    }
  }

  isFilled(x, y) {
    return !!this.cell(x, y);
  }

  /** 各物质质量（g，含部分溶解的质量） */
  masses() {
    this._ensureTotals();
    return { ...this._totals };
  }

  avail(id) {
    this._ensureTotals();
    return this._totals[id] ?? 0;
  }

  totalMass() {
    this._ensureTotals();
    let s = 0;
    for (const v of Object.values(this._totals)) s += v;
    return s;
  }

  ids() {
    this._ensureTotals();
    return Object.keys(this._totals);
  }

  /** 暴露格列表（实心但四邻至少一格空旷/微量）——反应/产气/爆炸发生在暴露面 */
  exposedCells() {
    const out = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const m = this.cells[y][x];
        if (!m || this._cellTotal(m) < MIN_SOLID_MASS) continue;
        if (this._cellExposed(x, y)) out.push({ x, y });
      }
    }
    return out;
  }

  /** 该格是否暴露（四邻任意一格为空/微量） */
  _cellExposed(x, y) {
    return !this._cellSolid(x - 1, y) || !this._cellSolid(x + 1, y)
      || !this._cellSolid(x, y - 1) || !this._cellSolid(x, y + 1);
  }

  _cellSolid(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false; // 边界外=暴露
    const m = this.cells[y][x];
    return !!(m && this._cellTotal(m) >= MIN_SOLID_MASS);
  }

  /** 该行是否"空行"（整行无实心格：全 null 或全微量 < MIN_SOLID_MASS） */
  _rowEmpty(y) {
    for (let x = 0; x < this.cols; x++) {
      const m = this.cells[y][x];
      if (m && this._cellTotal(m) >= MIN_SOLID_MASS) return false;
    }
    return true;
  }

  /**
   * 悬空修复（坍塌）：中间出现整行空行（如被反应"上下夹击"消耗断裂）时，
   * 把上方所有行整体下移一行填补空洞——像"掉下来了"，物块/玩家不再上下分离。
   * 只处理中间行（y=1..rows-2）：边界行可能是生长层（0 质量占位）或被消耗的
   * 顶/底行，不参与坍塌。空行的微量残余质量并入下方行（不超格子上限，超出丢弃
   * ——微量级，等同 MIN_ENTRY 哲学）。
   */
  collapseHollowRows() {
    for (let y = this.rows - 2; y >= 1; y--) {
      if (!this._rowEmpty(y)) continue;
      // 微量残余并入下方行（下方行可能满：room=0 → 微量丢弃）
      for (let x = 0; x < this.cols; x++) {
        const m = this.cells[y][x];
        if (!m) continue;
        const below = this.cells[y + 1]?.[x];
        if (!below) continue;
        for (const [id, mass] of m) {
          const room = CELL_MASS - this._cellTotal(below);
          if (room > 1e-9) below.set(id, (below.get(id) ?? 0) + Math.min(room, mass));
        }
      }
      // 删除空行：上方所有行整体下移一行
      this.cells.splice(y, 1);
      this.rows--;
      this._invalidateTotals(); // 行移动：暴露面/总量缓存都失效
    }
  }

  /** 填充格的最小外接 AABB（像素坐标）；微量格（< 0.01g，几乎透明）不参与碰撞
   *  ——防止物块边缘"看不见的幽灵层"造成视觉比碰撞小、看起来像漂浮。
   *  按内容版本缓存（grid 每帧被同步多次，大网格全扫一次 ~0.2ms，缓存后 O(1)）。 */
  minAABB() {
    if (this._aabbVer === this._exposedVer && this._aabb) return this._aabb;
    let minX = this.cols;
    let minY = this.rows;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const m = this.cells[y][x];
        if (m && this._cellTotal(m) > MIN_SOLID_MASS) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    const r = maxX < 0 ? null : {
      x: minX * CELL_SIZE,
      y: minY * CELL_SIZE,
      w: (maxX - minX + 1) * CELL_SIZE,
      h: (maxY - minY + 1) * CELL_SIZE,
    };
    this._aabb = r;
    this._aabbVer = this._exposedVer;
    return r;
  }

  // ---- 溶解（渐进，按接触表面积分摊；仅暴露格可被消耗）----

  /** 开阔地消耗：把 grams 分摊到边界格（按暴露面），格的质量逐渐下降 */
  consume(id, grams) {
    return this._consumeSmooth(id, grams, null, null);
  }

  /** 区域内消耗：只对与 region 重叠的格、按接触表面积分摊 */
  consumeInRegion(id, grams, region, origin) {
    return this._consumeSmooth(id, grams, region, origin);
  }

  _consumeSmooth(id, grams, regionOrNull, origin) {
    if (grams <= 0) return 0;
    this._lastConsume = [];
    this._batchUsed = false; // 本批产物是否已写入（决定后续致密产物是否还能填消耗格）
    let remaining = grams;
    let removed = 0;
    // —— 局部快速路径：腐蚀有局部性（上次消耗格及其 4 邻往往仍可继续消耗）。
    //    大网格上每帧的微消耗（如 2000g 铁块的缓慢氧化）不必全格扫描——
    //    这是"大物块反应时卡顿"的主因。仅在局部耗尽时才回落全扫。
    //    阈值 = 8 格/帧（≈24g/s）：池内大块的强反应也走局部；只剩超高活性的极端体系才全扫。
    if (this._prevTargets?.length && grams <= CELL_MASS * 8) {
      const seen = new Set();
      const active = [];
      for (const { x, y } of this._prevTargets) {
        for (const [nx, ny] of [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const k = nx + ny * this.cols;
          if (seen.has(k)) continue;
          seen.add(k);
          if (regionOrNull && !cellInRegion(nx, ny, regionOrNull, origin)) continue;
          const m = this.cells[ny][nx];
          if (!m || !m.has(id) || this._cellTotal(m) <= 1e-9) continue;
          if (!getSubstance(id)?.dense && this._denseBlocking(m, id)) continue;
          active.push({ x: nx, y: ny, cell: m, sides: this._openSides(nx, ny, id) });
        }
      }
      if (active.length) {
        const r = this._applyShares(id, active, remaining);
        removed += r.removed;
        remaining = r.remaining;
        if (removed > 0) {
          this._prevTargets = this._lastConsume.slice(0, 40);
          this._invalidateTotals();
          return removed;
        }
      }
    }
    for (let round = 0; round < 8 && remaining > 1e-9; round++) {
      // 收集符合条件的格 + 接触表面积（开边数）。无开放边的格（被外壳包住）
      // sides=0 → 分不到份额 → 内核物质被阻断，待外壳耗尽后才暴露。
      const active = [];
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const m = this.cells[y][x];
          if (!m || !m.has(id) || this._cellTotal(m) <= 1e-9) continue;
          if (regionOrNull && !cellInRegion(x, y, regionOrNull, origin)) continue;
          // 镀层完成格不再被消耗：格内"非消耗目标"的致密物质 ≥ 半格（如 Fe 格被
          // Cu 镀到 0.05g）→ 该格停止反应（Fe 剩一半被镀层包住——"每格 Fe 不用完"，
          // 镀层逐格渐进，而不是一格全镀完才轮到下一格）。
          // 消耗目标自身是致密物质（BaCO3 块 + 酸）不在此列（要能被溶解）。
          if (!getSubstance(id)?.dense && this._denseBlocking(m, id)) continue;
          active.push({ x, y, cell: m, sides: this._openSides(x, y, id) });
        }
      }
      if (active.length === 0) break;
      const r = this._applyShares(id, active, remaining);
      removed += r.removed;
      remaining = r.remaining;
      if (r.removed <= 0) break;
    }
    if (removed > 0) {
      this._prevTargets = this._lastConsume.slice(0, 40); // 记住消耗区域（局部优先用）
      this._invalidateTotals(); // 格质量变化 → 总量缓存失效
    }
    return removed;
  }

  /** 按接触面占比把 remaining 分摊给 active 格；返回 {removed, remaining, progressed} */
  _applyShares(id, active, remaining) {
    let W = 0;
    for (const a of active) W += a.sides;
    if (W <= 0) return { removed: 0, remaining, progressed: false }; // 全部被包围
    let removed = 0;
    const roundRemaining = remaining;
    let progressed = false;
    for (const a of active) {
      if (remaining <= 1e-9) break;
      const share = (roundRemaining * a.sides) / W;
      const cur = a.cell.get(id) ?? 0;
      const take = Math.min(cur, share);
      if (take > 1e-12) {
        a.cell.set(id, cur - take);
        removed += take;
        remaining -= take;
        this._lastConsume.push({ x: a.x, y: a.y });
        if (cur - take <= 1e-9) {
          a.cell.delete(id);
          if (a.cell.size === 0) {
            this.cells[a.y][a.x] = null; // 溶完置空，暴露内部格
            this._dirty = true; // 标记：可能出现"整行空"悬空 → syncGrid 时坍塌
          }
        }
        progressed = true;
      }
    }
    return { removed, remaining, progressed };
  }

  /**
   * 某格的接触表面积：4 邻"可渗透"的边数（空格=暴露面；越界也算空）。
   * 判定规则（forId 为消耗目标时）：
   *   - 空格：可渗透
   *   - 含 forId 的格（反应物本体）：不可渗透（需先被消耗暴露，否则内部被外壳包住）
   *   - 絮状沉淀（Cu(OH)2 等氢氧化物）多缝隙不阻断：可渗透
   *   - 致密晶形沉淀（BaCO3/BaSO4/AgCl/金属）：阻断
   */
  _openSides(x, y, forId = null) {
    let n = 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const m = this.cell(nx, ny);
      if (!m) {
        n++;
        continue;
      }
      // 0 质量占位格（growExposed 刚开层未填充的生长层）视为空：
      // 不挡反应、不阻断（否则新开的一层 dense 占位格会立即把反应面整体封死）
      if (this._cellTotal(m) <= 1e-9) {
        n++;
        continue;
      }
      if (forId && m.has(forId)) continue; // 反应物本体不视为开放
      if (!this._isDense(m)) n++; // 絮状沉淀可渗透
    }
    return n;
  }

  /** 格内是否含"足以阻断"的致密物质：**低浓度致密物质不阻断**——镀层渐进的关键：
   *  格子体积固定 → 格内致密物质的质量即浓度。刚生成的少量 Cu/BaCO3（如 0.014g，
   *  或纯致密物层格里的 0.004g）低于半格阈值（0.05g）→ 不阻断，反应可继续渗透；
   *  致密物质 ≥ 半格（0.05g）才判致密（该格镀层完成 → 阻断内部）。
   *  0 质量生长占位格不算。 */
  _isDense(m) {
    const total = this._cellTotal(m);
    if (total <= 1e-9) return false;
    let denseMass = 0;
    for (const [id, mass] of m) {
      const s = getSubstance(id);
      if (s && s.dense) denseMass += mass;
    }
    return denseMass >= CELL_MASS / 2;
  }

  /** 格内"排除消耗目标外"的致密物质 ≥ 半格 → 该格镀层完成，不再被消耗
   *  （Fe 格被 Cu 镀到 0.05g 即停，剩一半 Fe 被包住；BaCO3 块自身致密不在此列） */
  _denseBlocking(m, excludeId) {
    const total = this._cellTotal(m);
    if (total <= 1e-9) return false;
    let d = 0;
    for (const [id2, mass] of m) {
      if (id2 === excludeId) continue;
      const s = getSubstance(id2);
      if (s && s.dense) d += mass;
    }
    return d >= CELL_MASS / 2;
  }

  /**
   * 区域内某物质的总质量（g）。变更计数节流（≥30 次内容变更重扫一次，≈每帧消耗的
   * 大网格 1 秒刷新）：池内大块的反应循环每帧调用数十次，每次全扫是大网格
   * "反应时卡顿"的根因之一。
   */
  availInRegion(id, region, origin) {
    if (this._regVer !== undefined && (this._ver ?? 0) - this._regVer < 30 && this._regCache && this._regCache.id === id) {
      return this._regCache.sum;
    }
    let s = 0;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = this.cells[y][x];
        if (c && c.has(id) && cellInRegion(x, y, region, origin)) s += c.get(id);
      }
    }
    this._regVer = this._ver ?? 0;
    this._regCache = { id, sum: s };
    return s;
  }

  /**
   * 暴露格（开放边 > 0）中某物质的总质量（g）——反应"实际可消耗"的量。
   * 被致密外壳（Cu/BaCO3 等）包住的内核不计入：反应量据此计算，产物不会凭空生成。
   * 带版本+时间窗缓存：一帧内同一物质反复查询只全扫一次；格内容微变（消耗每帧发生）
   * 也不会每帧强刷全扫——暴露面变化滞后 ≤150ms，化学量误差 <1%（大网格 11ms/次的全扫
   * 若每帧发生就是卡顿主因）。
   */
  exposedAvail(id, region = null, origin = null) {
    if (region) {
      // 区域版缓存（同 availInRegion）：≥30 次内容变更重扫一次
      if (this._regExpVer !== undefined && (this._ver ?? 0) - this._regExpVer < 30 && this._regExpCache && this._regExpCache.id === id) {
        return this._regExpCache.sum;
      }
      let s = 0;
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const c = this.cells[y][x];
          if (!c || !c.has(id) || this._openSides(x, y, id) <= 0) continue;
          if (!cellInRegion(x, y, region, origin)) continue;
          s += c.get(id);
        }
      }
      this._regExpVer = this._ver ?? 0;
      this._regExpCache = { id, sum: s };
      return s;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._exposedAt === undefined || now - this._exposedAt > 150) {
      this._exposedMemo.clear(); // 时间窗到期：强制重扫一次（暴露面变化的滞后 ≤150ms）
      this._exposedAt = now;
    }
    const mem = this._exposedMemo.get(id);
    if (mem) return mem.sum;
    let s = 0;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = this.cells[y][x];
        if (!c || !c.has(id) || this._openSides(x, y, id) <= 0) continue;
        s += c.get(id);
      }
    }
    this._exposedMemo.set(id, { ver: this._exposedVer, sum: s });
    return s;
  }

  /**
   * 直接加质量到网格（玩家吸收回血等）：不足半格先累积（避免小数质量被舍入丢失）；
   * 优先补已有空格，剩余生长。返回本次实际写入量。
   */
  add(id, mass) {
    this._addAccum = (this._addAccum ?? 0) + mass;
    let rest = this._addAccum;
    if (rest < CELL_MASS / 2) return 0; // 太少量先攒着
    for (let y = this.rows - 1; y >= 0 && rest > 1e-9; y--) {
      for (let x = 0; x < this.cols && rest > 1e-9; x++) {
        if (!this.cells[y][x]) {
          const put = Math.min(CELL_MASS, rest);
          this.cells[y][x] = new Map([[id, put]]);
          rest -= put;
        }
      }
    }
    if (rest > 1e-9) rest -= this.addEdge(id, rest);
    const used = this._addAccum - Math.max(0, rest);
    this._addAccum = Math.max(0, rest);
    if (used > 1e-12) this._invalidateTotals();
    return used;
  }

  /**
   * 原地转化：把 grams 写入"上次被消耗"的格子（固体产物附着在反应物表面）。
   * 非致密产物按各格剩余容量占比分摊——先到先得会让后遍历的格（大 y 行）
   * 拿不到份额，消耗面深处出现空洞（如 NaOH 块吸收 Cl2：NaCl 填不满消耗面，
   * 中部整片空缺）。致密产物（BaCO3/Cu 壳）先到先得集中填格：均匀分摊会让
   * 所有消耗格同时沾上致密物质而整体变 dense，过早把反应面封死。
   * 本批已有产物写入后，后续致密产物不再填消耗格（返回 0 走 addEdge 底部）：
   * 否则 BaCO3 会填进刚被 NaOH 回填的表面格，把整个反应面封死（池内再生
   * Na2CO3 转化不完）。非致密产物同批共享格子，room 填满后剩余才由调用方
   * 走 addEdge 生长（已配质量累积器，小量不丢失）。返回实际写入量。
   */
  addInPlace(id, grams) {
    if (grams <= 0 || !this._lastConsume || this._lastConsume.length === 0) return 0;
    const dense = !!getSubstance(id)?.dense;
    if (dense && this._batchUsed) return 0; // 本批已有产物 → 致密产物不填消耗格（防封死）
    let wrote = 0;
    if (dense) {
      // 致密产物：先到先得，集中成壳
      let rest = grams;
      for (const { x, y } of this._lastConsume) {
        if (rest <= 1e-12) break;
        const row = this.cells[y];
        if (!row) continue;
        let m = row[x];
        const room = m ? CELL_MASS - this._cellTotal(m) : CELL_MASS;
        if (room <= 1e-12) continue;
        const put = Math.min(room, rest);
        if (!m) { m = new Map(); row[x] = m; }
        m.set(id, (m.get(id) ?? 0) + put);
        rest -= put;
        wrote += put;
      }
    } else {
      // 非致密产物：按各格剩余容量占比分摊（防空洞）
      const slots = [];
      let totalRoom = 0;
      for (const { x, y } of this._lastConsume) {
        const row = this.cells[y];
        if (!row) continue;
        const m = row[x];
        const room = m ? CELL_MASS - this._cellTotal(m) : CELL_MASS;
        if (room <= 1e-12) continue;
        slots.push({ x, y, room });
        totalRoom += room;
      }
      if (slots.length === 0 || totalRoom <= 1e-12) return 0;
      let rest = grams;
      for (const { x, y, room } of slots) {
        if (rest <= 1e-12) break;
        const quota = (grams * room) / totalRoom; // 该格本轮应得的份额
        const put = Math.min(room, rest, quota);
        const row = this.cells[y];
        let m = row[x];
        if (!m) { m = new Map(); row[x] = m; }
        m.set(id, (m.get(id) ?? 0) + put);
        rest -= put;
        wrote += put;
      }
    }
    if (wrote > 0) this._batchUsed = true;
    if (wrote > 1e-12) this._invalidateTotals();
    return wrote;
  }

  /** 转化边界格（保留剩余质量，原地改物质）；返回转化质量 */
  convert(id, toId, grams) {
    let need = grams;
    let converted = 0;
    for (let round = 0; round < 8 && need > 1e-9; round++) {
      const boundary = this._boundaryCells(id);
      if (boundary.length === 0) break;
      let progressed = false;
      for (const [x, y] of boundary) {
        if (need <= 1e-9) break;
        const m = this.cells[y][x];
        if (m && m.has(id)) {
          const cur = m.get(id);
          const take = Math.min(cur, need);
          m.set(id, cur - take);
          m.set(toId, (m.get(toId) ?? 0) + take);
          need -= take;
          converted += take;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    if (converted > 1e-12) this._invalidateTotals();
    return converted;
  }

  /** 在指定侧边新增整格（g）。先补满已有边界行的空位，再开新行（新行填满）。
   *  质量累积：不足一格的余量攒着（_edgeAcc），攒满一格才生成——避免 round 把小量
   *  吞掉（round(0.03/0.1)=0 → 产物凭空丢失）或放大（round(0.06/0.1)=1 → 凭空多造）。
   *  （暴露面渐进生长请用 growExposed——产物盈余长在所有与大气/液体接触的面上。） */
  addEdge(id, grams, side = 'bottom') {
    this._edgeAcc = this._edgeAcc || {};
    this._edgeAcc[id] = (this._edgeAcc[id] ?? 0) + grams;
    let need = Math.floor(this._edgeAcc[id] / CELL_MASS + 1e-9); // 防浮点：0.3/0.1=2.999…
    this._edgeAcc[id] -= need * CELL_MASS;
    if (this._edgeAcc[id] < 1e-6) this._edgeAcc[id] = 0;
    const totalNeeded = need;
    // 优先补满边界行（避免每 0.1g 就开新行把物体越撑越大）
    if (side === 'bottom' && this.rows > 0) {
      const last = this.rows - 1;
      for (let x = 0; x < this.cols && need > 0; x++) {
        if (!this.cells[last][x]) {
          this.cells[last][x] = new Map([[id, CELL_MASS]]);
          need--;
        }
      }
    }
    while (need > 0) {
      const added = this._growSide(side, id, need);
      if (added <= 0) break;
      need -= added;
    }
    return (totalNeeded - need) * CELL_MASS;
  }

  /**
   * 暴露面渐进生长：产物盈余长在所有"暴露边界"上（物块/玩家与大气、液体接触的
   * 面——四周都是接触面，不固定哪一面）。所有暴露位置**同时**开始生长：质量从 0
   * 逐渐涨满（渲染 alpha 随质量渐变），而不是攒满一格才冒出一个满格。
   * 关键：边界基于**实际内容（minAABB）**而非 cells 数组边界——被酸蚀缩水/内部
   * 空洞的网格，生长贴着主体表面，不会在"原始大小"位置长出脱离的壳。
   * 规则：
   *  - 主体四边界行/列的空位与未满格 = 填充目标（长回被消耗挖掉的洞）
   *  - 边界外一行/列的未满格也是目标（上次开的层——层格质量 < MIN_SOLID_MASS 时
   *    不在 minAABB 内，必须显式收集，否则每 tick 都会重复开层叠层）
   *  - 边界全满且边界外无未满格 → 在该面开一层（新行/列，源格位置放 0 质量占位），
   *    占位格随后与其它目标一起逐渐填充；一层满后自动开下一层
   *  - 质量直接写入格子（无累积器滞留：不足一格的余量也立即分摊，总量守恒）
   * 返回实际写入量。
   */
  growExposed(id, grams) {
    if (!(grams > 0) || this.rows === 0 || this.cols === 0) return 0;
    let rest = grams;
    let wrote = 0;
    // 多轮：当前目标 room 不足时开新层继续写入，直到写完或无处可长
    for (let round = 0; round < 8 && rest > 1e-12; round++) {
      this._invalidateTotals(); // 上一轮开层/写入后：minAABB/总量缓存强制刷新
      const aabb = this.minAABB();
      if (!aabb) break;
      let minX = Math.floor(aabb.x / CELL_SIZE);
      let maxX = Math.floor((aabb.x + aabb.w) / CELL_SIZE) - 1;
      let minY = Math.floor(aabb.y / CELL_SIZE);
      let maxY = Math.floor((aabb.y + aabb.h) / CELL_SIZE) - 1;
      if (minX < 0 || minY < 0 || maxX >= this.cols || maxY >= this.rows) break;
      const rowFull = (y) => {
        for (let x = minX; x <= maxX; x++) {
          const m = this.cells[y]?.[x];
          if (!m || this._cellTotal(m) < CELL_MASS - 1e-9) return false;
        }
        return true;
      };
      const colFull = (c) => {
        for (let y = minY; y <= maxY; y++) {
          const m = this.cells[y]?.[c];
          if (!m || this._cellTotal(m) < CELL_MASS - 1e-9) return false;
        }
        return true;
      };
      // 收集填充目标：主体四边界（允许空位=补洞）+ 边界外一行/列（上次开的未满层）
      const targets = [];
      const seen = new Set();
      const push = (x, y, allowEmpty) => {
        const row = this.cells[y];
        if (!row) return;
        const m = row[x];
        if (!m) {
          if (allowEmpty) { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); targets.push({ x, y }); } }
          return;
        }
        if (this._cellTotal(m) >= CELL_MASS - 1e-9) return;
        const k = x + ',' + y;
        if (seen.has(k)) return;
        seen.add(k);
        targets.push({ x, y });
      };
      for (let x = minX; x <= maxX; x++) {
        push(x, maxY, true);
        push(x, minY, true);
        push(x, maxY + 1, false);
        push(x, minY - 1, false);
      }
      for (let y = minY; y <= maxY; y++) {
        push(maxX, y, true);
        push(minX, y, true);
        push(maxX + 1, y, false);
        push(minX - 1, y, false);
      }
      if (targets.length === 0) {
        // 边界全满且边界外无未满层 → 开新层（贴着实际边界）。
        // 先基于当前边界统一判定四面，再统一开层（避免先开的面污染后续判定）
        const can = {
          bottom: rowFull(maxY),
          top: rowFull(minY),
          right: colFull(maxX),
          left: colFull(minX),
        };
        let opened = false;
        if (can.bottom) { this._openLayerAt('bottom', id, maxY, minX, maxX); opened = true; }
        if (can.top) { this._openLayerAt('top', id, minY, minX, maxX); opened = true; }
        if (can.right) { this._openLayerAt('right', id, maxX, minY, maxY); opened = true; }
        if (can.left) { this._openLayerAt('left', id, minX, minY, maxY); opened = true; }
        if (!opened) break;
        // 开层后：重新用 minAABB 算主体边界（新层 0 质量不计入；top/left 的 splice
        // 会让行/列索引漂移，手动跟踪必错位）——新层 = 主体边界外一行/列
        this._invalidateTotals(); // 刚开层/写入：缓存强制刷新
        const a2 = this.minAABB();
        if (!a2) break;
        const nMinX = Math.floor(a2.x / CELL_SIZE);
        const nMaxX = Math.floor((a2.x + a2.w) / CELL_SIZE) - 1;
        const nMinY = Math.floor(a2.y / CELL_SIZE);
        const nMaxY = Math.floor((a2.y + a2.h) / CELL_SIZE) - 1;
        for (let x = nMinX; x <= nMaxX; x++) {
          push(x, nMaxY + 1, false); // 新底层
          push(x, nMinY - 1, false); // 新顶层
        }
        for (let y = nMinY; y <= nMaxY; y++) {
          push(nMaxX + 1, y, false); // 新右列
          push(nMinX - 1, y, false); // 新左列
        }
        // 新层交叉角落（top×left 等——left 开层时已给顶层行插占位，补齐收集）
        push(nMinX - 1, nMinY - 1, false);
        push(nMaxX + 1, nMinY - 1, false);
        push(nMinX - 1, nMaxY + 1, false);
        push(nMaxX + 1, nMaxY + 1, false);
        if (targets.length === 0) break;
      }
      // 均摊：每格拿相同份额（余数给最后一格），所有目标格同步增长
      const share = rest / targets.length;
      for (const { x, y } of targets) {
        if (rest <= 1e-12) break;
        const row = this.cells[y];
        let m = row[x];
        const room = m ? CELL_MASS - this._cellTotal(m) : CELL_MASS;
        if (room <= 1e-12) continue;
        const put = Math.min(room, share, rest);
        if (put <= 1e-12) continue;
        if (!m) { m = new Map(); row[x] = m; }
        m.set(id, (m.get(id) ?? 0) + put);
        rest -= put;
        wrote += put;
      }
    }
    if (wrote > 1e-12) this._invalidateTotals();
    return wrote;
  }

  /** 在指定边界行/列（edge，基于实际内容）外侧开一层"生长层"：新行/列在源格
   *  位置（span0..span1 范围）放 0 质量占位格，随后由 growExposed 逐渐填充。
   *  基于实际边界而非 cells 数组边界：缩水/内部空洞的网格生长贴着主体。 */
  _openLayerAt(side, id, edge, span0, span1) {
    if (this.rows === 0 || this.cols === 0) return 0;
    if (side === 'right' || side === 'left') {
      const idx = side === 'right' ? edge + 1 : edge;
      let any = false;
      for (let y = span0; y <= span1; y++) if (this.cells[y]?.[edge]) { any = true; break; }
      if (!any) return 0;
      for (let y = 0; y < this.rows; y++) {
        const has = y >= span0 && y <= span1 && this.cells[y][edge];
        this.cells[y].splice(idx, 0, has ? new Map([[id, 0]]) : null);
      }
      this.cols++;
      return 1;
    }
    let any = false;
    for (let x = span0; x <= span1; x++) if (this.cells[edge]?.[x]) { any = true; break; }
    if (!any) return 0;
    const newRow = new Array(this.cols).fill(null);
    for (let x = span0; x <= span1; x++) {
      if (this.cells[edge][x]) newRow[x] = new Map([[id, 0]]);
    }
    if (side === 'bottom') this.cells.splice(edge + 1, 0, newRow);
    else this.cells.splice(edge, 0, newRow);
    this.rows++;
    return 1;
  }

  _growSide(side, id, maxCells) {
    if (this.rows === 0 || this.cols === 0) return 0;
    if (side === 'right' || side === 'left') {
      const idx = side === 'right' ? this.cols : 0;
      const colIdx = side === 'right' ? this.cols - 1 : 0;
      let added = 0;
      for (let y = 0; y < this.rows; y++) if (this.cells[y][colIdx] && added < maxCells) added++;
      if (added === 0) return 0;
      // 只在实际放 Map 的行插入新列，且受 maxCells 限制（否则一次性塞进源列全部
      // 有格数 → 多造质量：返回 added 与实际放置数不一致）
      let placed = 0;
      for (let y = 0; y < this.rows; y++) {
        const has = this.cells[y][colIdx] && placed < maxCells;
        if (has) placed++;
        this.cells[y].splice(idx, 0, has ? new Map([[id, CELL_MASS]]) : null);
      }
      this.cols++;
      return placed;
    }
    const srcIdx = side === 'bottom' ? this.rows - 1 : 0;
    let added = 0;
    for (let x = 0; x < this.cols; x++) if (this.cells[srcIdx][x] && added < maxCells) added++;
    if (added === 0) return 0;
    const newRow = new Array(this.cols).fill(null);
    let placed = 0;
    for (let x = 0; x < this.cols && placed < maxCells; x++) {
      if (this.cells[srcIdx][x]) {
        newRow[x] = new Map([[id, CELL_MASS]]);
        placed++;
      }
    }
    if (side === 'bottom') this.cells.push(newRow);
    else this.cells.unshift(newRow);
    this.rows++;
    return placed;
  }

  /** 某物质的外圈格（四邻有空/越界） */
  _boundaryCells(id) {
    const out = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!this.cells[y][x]?.has(id)) continue;
        if (this._openSides(x, y) > 0) out.push([x, y]);
      }
    }
    return out;
  }

  /**
   * 暴露（表层）物质质量表：只有暴露格的物质能参与外部反应/焰色/掉渣。
   * 返回 { id → mass }。时间窗缓存：暴露面变化滞后 ≤150ms（本表被每帧调用，
   * 大网格上一次全扫约 10ms——逐帧重扫就是卡顿主因）。
   */
  exposedMasses() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._expMassesAt === undefined || now - this._expMassesAt > 150) {
      const m = {};
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const c = this.cells[y][x];
          if (!c || this._openSides(x, y) <= 0) continue;
          for (const [id, mass] of c) m[id] = (m[id] ?? 0) + mass;
        }
      }
      this._expMasses = m;
      this._expMassesAt = now;
    }
    return this._expMasses;
  }

  _cellTotal(m) {
    let s = 0;
    for (const v of m.values()) s += v;
    return s;
  }
}

/** 格子世界矩形是否与 region 重叠 */
function cellInRegion(x, y, region, origin) {
  const cx = origin.x + x * CELL_SIZE;
  const cy = origin.y + y * CELL_SIZE;
  return (
    cx < region.x + region.w && cx + CELL_SIZE > region.x &&
    cy < region.y + region.h && cy + CELL_SIZE > region.y
  );
}

/** 格内多物质按质量占比混合成一种颜色 */
function cellColor(m) {
  let r = 0, g = 0, b = 0, total = 0;
  for (const [id, mass] of m) {
    const sub = getSubstance(id);
    const hex = sub.solid && sub.solid.length ? sub.solid[0] : '#cccccc';
    const c = hexToRgb(hex);
    r += c.r * mass;
    g += c.g * mass;
    b += c.b * mass;
    total += mass;
  }
  if (total <= 0) return '#cccccc';
  return rgbToHex({ r: r / total, g: g / total, b: b / total });
}

// ---- 渲染：按行游程合并（大网格的相邻同色格合并为一个矩形——几千/万格的大物块
// 从"逐格 fillRect" 变成"数十次绘制"，是消除大块卡顿的关键之一）；
// 深色格加白色光晕（暗背景下可见），合并段整体一次投影。
export function renderGrid(ctx, grid, ox, oy) {
  ctx.save();
  const px = CELL_SIZE;
  for (let y = 0; y < grid.rows; y++) {
    const row = grid.cells[y];
    let runX = -1;
    let runColor = null;
    let runAlpha = 0;
    let runDark = false;
    const flush = (endX) => {
      if (runX < 0) return;
      const w = (endX - runX) * px;
      ctx.globalAlpha = runAlpha;
      ctx.fillStyle = runColor;
      ctx.fillRect(ox + runX * px, oy + y * px, w, px);
      if (runDark) {
        ctx.shadowColor = 'rgba(255,255,255,0.75)';
        ctx.shadowBlur = 4;
        ctx.fillRect(ox + runX * px, oy + y * px, w, px);
        ctx.shadowBlur = 0;
      }
      runX = -1;
    };
    for (let x = 0; x < grid.cols; x++) {
      const m = row[x];
      if (!m) { flush(x); continue; }
      const total = grid._cellTotal(m);
      if (total < MIN_SOLID_MASS) { flush(x); continue; } // 微量格不渲染——与碰撞箱一致
      const color = cellColor(m);
      const alpha = Math.max(0, Math.min(1, total / CELL_MASS));
      const dark = luminance(color) < 110;
      // 颜色/透明度/明暗变化 → 结束上一游程（透明度允许小差，减少碎片段）
      if (color !== runColor || dark !== runDark || Math.abs(alpha - runAlpha) > 0.15) {
        flush(x);
        runX = x;
        runColor = color;
        runAlpha = alpha;
        runDark = dark;
      }
    }
    flush(grid.cols);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
