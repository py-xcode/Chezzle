// ============================================================================
// 玩家：椭圆格网材质的特殊固体。血量 = 玩家物质（关卡设定）的剩余质量。
// 控制：left/right/jump 长按；place/collect 按下即触发。
// 放置优先级：附近酒精灯 > 脚下容器 > 地面；每次 0.5g。
// 物品栏：5 格，按物质种类分格，格子种类由首次放入决定，可清空。
// ============================================================================

import { Obj } from './obj.js';
import { SolidMaterial } from './material.js';
import { MaterialGrid, renderGrid, CELL_SIZE, CELL_MASS } from '../render/gridrender.js';
import { THEME, rr, contrastEdge, luminance } from '../render/theme.js';
import { getSubstance, isSoluble, shedCoeffOf } from '../chem/substances.js';
import { CFG } from '../core/config.js';

export class Inventory {
  constructor({ slots = CFG.inventory.slots, capacity = CFG.inventory.capacity } = {}) {
    this.slots = new Array(slots).fill(null); // {substance, mass} | null
    this.capacity = capacity;
    this.selected = 0;
  }

  selectedSlot() {
    return this.slots[this.selected];
  }

  /** 该物质还能装下的质量（g）：同物质格剩余 + 每个空格一满格（跨格收集） */
  roomFor(substance) {
    let room = 0;
    for (const s of this.slots) {
      if (s && s.substance === substance) room += this.capacity - (Number.isFinite(s.mass) ? s.mass : 0);
      else if (s === null) room += this.capacity;
    }
    return room;
  }

  canCollect(substance) {
    return this.roomFor(substance) > 0;
  }

  /**
   * 收集某物质，返回实际放入质量。跨格：先装满同物质格，再用空格
   * （否则 100g 封顶后即使有空格也捡不了——用户反馈）。
   */
  add(substance, mass) {
    if (!Number.isFinite(mass) || mass <= 0) return 0; // 挡住 NaN/非法质量
    let rest = mass;
    let put = 0;
    for (const s of this.slots) {
      if (rest <= 1e-9) break;
      if (s && s.substance === substance) {
        const room = this.capacity - (Number.isFinite(s.mass) ? s.mass : 0);
        if (room <= 1e-9) continue;
        const p = Math.min(room, rest);
        s.mass = (Number.isFinite(s.mass) ? s.mass : 0) + p;
        rest -= p;
        put += p;
      }
    }
    for (let i = 0; i < this.slots.length && rest > 1e-9; i++) {
      if (this.slots[i] !== null) continue;
      const p = Math.min(this.capacity, rest);
      this.slots[i] = { substance, mass: p };
      rest -= p;
      put += p;
    }
    return put;
  }

  /** 从选中格放置 amount g（不足也按 amount 扣到 0），返回 {substance, mass} 或 null */
  place(amount) {
    const slot = this.selectedSlot();
    if (!slot || slot.mass <= 0) return null;
    slot.mass = Math.max(0, slot.mass - amount);
    if (slot.mass <= 0) this.slots[this.selected] = null;
    return { substance: slot.substance, mass: amount };
  }

  clearSelected() {
    this.slots[this.selected] = null;
  }
}

export class Player extends Obj {
  constructor({
    x, y,
    substance = CFG.player.defaultSubstance,
    mass = null, // null=未给（w/h 像素模式或默认血量）
    w, h,
    moveSpeed = CFG.player.moveSpeed,
    jumpVel = CFG.player.jumpVel,
    ...rest
  } = {}) {
    // 显式 w/h 且未给质量 → 按像素建矩形网格（编辑器像素模式，血量=网格真实质量）；
    // 否则质量（缺省 30）→ 矩形格网（格数=mass/0.1）
    const manual = !!(w && h && (mass == null || mass <= 0));
    const m = (mass == null || mass <= 0) ? CFG.player.defaultMass : mass;
    const grid = manual ? MaterialGrid.rect(w, h, substance) : MaterialGrid.rectForMass(m, substance);
    const aabb = grid.minAABB();
    const bodyMass = manual ? grid.totalMass() : m;
    super({
      x, y, w: aabb.w, h: aabb.h,
      solid: true, pushable: false, gravity: 1, autoStep: true,
      physicsKind: 'dynamic',
      mass: bodyMass,
      ...rest,
    });
    this.substance = substance;
    this.maxHp = bodyMass; // 初始血量（药瓶填充参照）
    this.grid = grid;
    this.gridOrigin = { x, y };
    this.gridOrigins = new Map([[substance, { kind: 'level' }]]); // 网格内每种物质的来源（核心=关卡生成）
    this.moveSpeed = moveSpeed;
    this.jumpVel = jumpVel;
    this.mat = new SolidMaterial(this);
    this.inventory = new Inventory();
    this.burning = false;
    this._grainResist = 0; // 颗粒堆阻力（0..1），由容器 lateUpdate 计算、update 读取
    this.reactions = []; // 最近发生在玩家身上的反应（HUD 日志）
  }

  get material() {
    return this.mat;
  }

  get isPlayerObj() {
    return true;
  }

  get hoverLabel() {
    return '玩家';
  }

  get hp() {
    return this.grid.avail(this.substance);
  }

  get isBurning() {
    return this.burning;
  }

  get containerMaterial() {
    return this._container ? this._container.material : null;
  }

  get center() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  syncGrid() {
    if (this.grid._dirty) {
      this.grid.collapseHollowRows();
      this.grid._dirty = false;
    }
    const aabb = this.grid.minAABB();
    if (!aabb) {
      this.w = 0;
      this.h = 0;
      this._shapeOffsets = [];
      return;
    }
    this.w = aabb.w;
    this.h = aabb.h;
    this.gridOrigin.x = this.x - aabb.x;
    this.gridOrigin.y = this.y - aabb.y;
    this._shapeOffsets = this._buildShapeOffsets();
  }

  /** 按网格非空列生成碰撞形状（相对 body 左上角；相邻同高列合并）。腐蚀掉的部分不占碰撞箱 */
  _buildShapeOffsets() {
    const grid = this.grid;
    const offsets = [];
    let col = 0;
    while (col < grid.cols) {
      let top = -1, bottom = -1;
      for (let y = 0; y < grid.rows; y++) {
        if (grid.cells[y][col]) { if (top < 0) top = y; bottom = y; }
      }
      if (top < 0) { col++; continue; }
      let end = col;
      while (end + 1 < grid.cols) {
        let t = -1, b = -1;
        for (let y = 0; y < grid.rows; y++) {
          if (grid.cells[y][end + 1]) { if (t < 0) t = y; b = y; }
        }
        if (t < 0 || t !== top || b !== bottom) break;
        end++;
      }
      const sx = this.gridOrigin.x + col * CELL_SIZE;
      const sy = this.gridOrigin.y + top * CELL_SIZE;
      offsets.push({
        x: sx - this.x,
        y: sy - this.y,
        w: (end - col + 1) * CELL_SIZE,
        h: (bottom - top + 1) * CELL_SIZE,
      });
      col = end + 1;
    }
    return offsets;
  }

  /** 世界坐标碰撞形状（body 移动时自动跟随） */
  getShapes() {
    if (!this._shapeOffsets || this._shapeOffsets.length === 0) return [this.collider()];
    return this._shapeOffsets.map((s) => ({
      x: this.x + s.x,
      y: this.y + s.y,
      w: s.w,
      h: s.h,
    }));
  }

  update(dt, scene) {
    const c = scene.control;
    // 上一帧沉淀颗粒算出的阻力：命令速度按 (1-阻力) 衰减（密集堆拖慢/挡路，稀疏可穿）
    const resist = Math.min(0.9, this._grainResist ?? 0);
    this._grainResist = 0;
    // 水平控制：有输入时设定速度；无输入时**保留当前速度**（爆炸冲击等外力不被抹掉，
    // 由地面摩擦逐渐减速——否则爆炸永远炸不动玩家）
    const input = (c.has('right') ? 1 : 0) - (c.has('left') ? 1 : 0);
    if (input !== 0) this.vel.x = input * this.moveSpeed * (1 - resist);
    if (c.has('jump') && this.onGround) this.vel.y = -this.jumpVel;
    if (scene.pressed.has('place')) this.tryPlace(scene);
    if (scene.pressed.has('collect')) this.tryCollect(scene);
    // 移动时冲刷表面壳（贴地摩擦）：非核心物质按浓度脱落成沉淀粒子。
    // 空中/游泳不脱落（不与地面接触就没有摩擦）。
    if (this.grid && this.onGround && (Math.abs(this.vel.x) > 50 || Math.abs(this.vel.y) > 50)) {
      this.shedShell(scene, dt);
    }
    // 接触同核心物质 → 缓慢吸收回血（沉淀粒子/物块；速率慢，不影响垫脚玩法）
    this.absorbCore(scene, dt);
  }

  /** 吸收附近同核心物质的粒子/物块（0.5g/s）——"接触同类物质补血" */
  absorbCore(scene, dt) {
    if (!this.grid) return;
    let rest = 0.5 * dt;
    if (rest <= 0) return;
    // 沉淀粒子（含放置的实心沉淀）
    for (const pt of scene.particles.slice()) {
      if (rest <= 0) break;
      if (pt.substance !== this.substance || !pt.collectible || pt.amount <= 1e-9) continue;
      if (pt.right < this.left || pt.left > this.right || pt.bottom < this.top || pt.top > this.bottom) continue;
      const take = Math.min(pt.amount, rest);
      pt.amount -= take;
      this.grid.add(this.substance, take);
      rest -= take;
      if (pt.amount <= 1e-9) scene.removeObject(pt);
    }
    // 接触的物块（按接触对）
    if (rest > 0) {
      for (const [a, b] of scene.contactPairs) {
        const block = a === this ? b : b === this ? a : null;
        if (!block || !block.grid) continue;
        if (block.avail?.(this.substance) ?? block.grid.avail(this.substance) <= 1e-9) continue;
        const avail = block.grid.avail(this.substance);
        const take = Math.min(avail, rest);
        block.grid.consume(this.substance, take);
        this.grid.add(this.substance, take);
        rest -= take;
        if (rest <= 0) break;
      }
    }
  }

  /**
   * 贴地摩擦脱落表面壳（非玩家核心物质）：每格单独运算。
   * 规则（用户明确）：
   *  - 前提：玩家与地面接触（onGround，由调用方保证）且移动中（摩擦）
   *  - 脱落对象：**玩家表面（暴露格）**中非玩家核心物质的格——表面所有位置都会
   *    被摩擦蹭到（不只底部）
   *  - 每格速率 = 脱落系数 × (格内该物质浓度 / 满格浓度)：浓度越高越容易脱落，
   *    满格（0.1g）时达到脱落系数上限（可溶物 0.01、不溶物 0.005 g/格/s，按物质
   *    表 shedCoeff 可覆盖）；浓度低于阈值（0.01g，与碰撞/渲染阈值一致）彻底不再脱落
   *  - 脱落量**累积**：攒够 SHED_BURST（0.5g）才生成一小簇粒子——走路是"走一段
   *    偶尔掉一下"，不是每帧冒微量渣（连续细流视觉上像"一直掉"）
   * 脱落物成沉淀粒子（可收集）。
   */
  shedShell(scene, dt) {
    if (!this.grid || dt <= 0) return 0;
    const g = this.grid;
    const SHED_MIN = 0.01; // g/格：低于此浓度不再脱落
    const SHED_BURST = 2; // g：累积到这一块才生成粒子（"走一段路偶尔掉一下"——表面格多时总量 ~0.6g/s，阈值 2g ≈ 每 3-4 秒掉一小坨）
    this._shedAcc = this._shedAcc || {};
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        const m = g.cells[y][x];
        if (!m) continue;
        if (g._openSides(x, y) <= 0) continue; // 只处理表面格
        for (const [id, mass] of [...m]) {
          if (id === this.substance) continue; // 玩家自身物质不脱落
          if (!(mass >= SHED_MIN)) continue; // 低浓度彻底不脱落
          const rateMax = shedCoeffOf(id); // 脱落系数（可溶 0.01 / 不溶 0.005）
          const rate = Math.min(rateMax, rateMax * (mass / CELL_MASS)); // 浓度越高越容易
          const take = Math.min(mass, rate * dt);
          if (take <= 1e-12) continue;
          m.set(id, mass - take);
          if (mass - take <= 1e-9) m.delete(id);
          this._shedAcc[id] = (this._shedAcc[id] ?? 0) + take;
        }
        if (m.size === 0) {
          g.cells[y][x] = null;
          g._dirty = true;
        }
      }
    }
    if (g._invalidateTotals) g._invalidateTotals(); // 玩家表面壳脱落：总量缓存失效
    // 结算：攒够一块才掉（偶尔掉一下，而不是每帧冒渣）
    let total = 0;
    for (const id of Object.keys(this._shedAcc)) {
      const acc = this._shedAcc[id];
      if (acc >= SHED_BURST) {
        scene.spawnParticles(id, acc, { x: this.x + Math.random() * this.w, y: this.bottom - 2 }, true, false, {
          kind: 'shell',
        });
        total += acc;
        delete this._shedAcc[id];
      }
    }
    return total;
  }

  tryPlace(scene) {
    const amount = CFG.placeAmount;
    const res = this.inventory.place(amount);
    if (!res) return;
    // 就近放置：脚下容器优先于附近酒精灯（灯只在脚下无容器时接物）
    // 修复：玩家站在化学开关上时，物质应进开关而不是跑到旁边的灯上
    const lamp = scene.findLampNear(this);
    const container = scene.containerUnderFeet(this);
    const placeOrigin = { kind: 'place' };
    if (container) {
      // 落点=玩家脚下（反应/气泡围绕玩家放下的位置，不再默认容器中心）
      const ir = typeof container.innerRect === 'function' ? container.innerRect() : null;
      if (ir) container.depositAt = { x: this.x + this.w / 2, y: Math.max(ir.y + 4, this.bottom - 6) };
      // 可溶物质放进液体容器（池）→ 溶解进溶液（CuSO4 不会变成永不溶解的沉淀颗粒）；
      // 不溶物（Cu(OH)2 等）才作为沉淀放置
      if (container.solution && container.solution.water > 0 && isSoluble(res.substance)) {
        container.solution.add(res.substance, amount);
        if (container.noteSolOrigin) container.noteSolOrigin(res.substance, { kind: 'place' });
      } else {
        container.addPrecipitate(res.substance, amount, null, placeOrigin);
      }
      return;
    }
    if (lamp) {
      lamp.addPrecipitate(res.substance, amount, null, placeOrigin);
      return;
    }
    // 地面：生成"放置的沉淀"（实心、可垫脚、只能被重新收集）
    scene.spawnParticles(res.substance, amount, { x: this.x + this.w / 2, y: this.bottom + 1 }, true, true, placeOrigin);
  }

  tryCollect(scene) {
    const me = this.center;
    // 自由沉淀粒子（按剩余容量部分收集，放不下的留在原地）
    for (const p of scene.particles.slice()) {
      if (!p.collectible) continue;
      const dx = p.x + p.w / 2 - me.x;
      const dy = p.y + p.h / 2 - me.y;
      if (Math.hypot(dx, dy) > CFG.collectRadius) continue;
      const room = this.inventory.roomFor(p.substance);
      if (room <= 0) continue;
      const put = this.inventory.add(p.substance, Math.min(p.amount, room));
      p.amount -= put;
      if (p.amount <= 1e-9) scene.removeObject(p);
    }
    // 容器内沉淀（池/烧杯/开关等）：与自由粒子同语义——按沉淀**实际位置**就近收集。
    // ①玩家身体边缘到容器边缘 ≤ 拾取半径（快速粗判：贴池边/在池里才够得着）；
    // ②桶内沉淀按视觉颗粒（grains）位置分布，只收玩家 70px 范围内的部分——远处
    //   沉淀留在容器里（旧逻辑"整池一起收"：贴着池边就收走全部——用户反馈）。
    for (const c of scene.containers) {
      const cw = c.w ?? 0;
      const ch = c.h ?? 0;
      const nx = Math.max(c.x - (this.x + this.w), 0, this.x - (c.x + cw));
      const ny = Math.max(c.y - this.bottom, 0, this.top - (c.y + ch));
      if (Math.hypot(nx, ny) > CFG.collectRadius) continue;
      for (const [id, mass] of [...c.precipitates]) {
        if (mass <= 0) continue;
        const room = this.inventory.roomFor(id);
        if (room <= 0) continue;
        // 只收"附近颗粒份额"；无视觉颗粒的容器（开关等自定义）回退整池收
        const grains = c.useGrains ? c.grains.filter((g) => g.id === id) : null;
        let takenMax = mass;
        if (grains && grains.length) {
          const near = grains.filter((g) => {
            // 玩家矩形最近点 → 颗粒圆心距离 ≤ 拾取半径 + 颗粒半径（与粗判同单位）
            const gx = Math.max(this.x, Math.min(g.x, this.x + this.w));
            const gy = Math.max(this.top, Math.min(g.y, this.bottom));
            return Math.hypot(g.x - gx, g.y - gy) <= CFG.collectRadius + (g.r ?? 0);
          }).length;
          if (near === 0) continue; // 该沉淀都在远处：不收到
          takenMax = mass * (near / grains.length);
        }
        const taken = c.takePrecipitate(id, Math.min(mass, takenMax, room));
        this.inventory.add(id, taken);
      }
    }
  }

  adhereMaterial(id, mass) {
    // 产物盈余长在所有暴露面（与大气/液体接触的面），所有位置同时渐进生长
    const added = this.grid.growExposed(id, mass);
    this.syncGrid();
    return added;
  }

  render(ctx) {
    const grid = this.grid;
    const aabb = grid.minAABB();
    if (!aabb) return;
    const ox = this.gridOrigin.x;
    const oy = this.gridOrigin.y;
    const sub = getSubstance(this.substance);
    const color = sub?.solid?.[0] ?? '#7fe0ff';
    const bx = ox + aabb.x;
    const by = oy + aabb.y;
    // 元素光晕（透明填充只投影发光）
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    rr(ctx, bx, by, aabb.w, aabb.h, 9);
    ctx.fill();
    ctx.restore();
    // 网格本体
    renderGrid(ctx, grid, ox, oy);
    // 角色轮廓（深色物质用白色辉光轮廓，浅色用深描边）
    ctx.save();
    ctx.strokeStyle = luminance(color) < 110 ? 'rgba(255,255,255,0.75)' : contrastEdge(color);
    ctx.lineWidth = 2;
    if (luminance(color) < 110) {
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 8;
    }
    rr(ctx, bx, by, aabb.w, aabb.h, 9);
    ctx.stroke();
    ctx.restore();
    // 表情（只留眼睛；随移动方向微调视线）
    const cx = bx + aabb.w / 2;
    const cy = by + aabb.h * 0.42;
    const eye = Math.max(2, aabb.w * 0.06);
    const gap = aabb.w * 0.17;
    const lookX = Math.max(-1, Math.min(1, this.vel.x / this.moveSpeed)) * gap * 0.45;
    const lookY = Math.max(-1, Math.min(1, this.vel.y / 600)) * aabb.h * 0.05;
    const lx = cx + lookX;
    const ly = cy + lookY;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lx - gap, ly, eye, 0, Math.PI * 2);
    ctx.arc(lx + gap, ly, eye, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141426';
    ctx.beginPath();
    ctx.arc(lx - gap + eye * 0.32, ly, eye * 0.45, 0, Math.PI * 2);
    ctx.arc(lx + gap + eye * 0.32, ly, eye * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}
