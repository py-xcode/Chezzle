// ============================================================================
// 玩家：椭圆格网材质的特殊固体。血量 = 玩家物质（关卡设定）的剩余质量。
// 控制：left/right/jump 长按；place/collect 按下即触发。
// 放置优先级：附近酒精灯 > 脚下容器 > 地面；每次 0.5g。
// 物品栏：5 格，按物质种类分格，格子种类由首次放入决定，可清空。
// ============================================================================

import { Obj } from './obj.js';
import { SolidMaterial } from './material.js';
import { MaterialGrid, renderGrid, CELL_SIZE, CELL_MASS } from '../render/gridrender.js';
import { THEME, rr, luminance, contrastEdge } from '../render/theme.js';
import { getSubstance, isSoluble, shedCoeffOf } from '../chem/substances.js';
import { CFG } from '../core/config.js';
import { pickupItem, placeCarriedItem, carryActionsOf, nearestCarryItem } from '../level/items.js';
import { pushContainers } from '../physics/support.js';
import { sfx } from '../core/audio.js';
import { puffFx, rippleFx, sparkleFx, flashFx, shockFx } from './fx.js';

const TAU = Math.PI * 2;

/** 物质主色（玩家元素光/金边呼吸的取色；与网格颜色同源） */
function materialColor(substance) {
  return getSubstance(substance)?.solid?.[0] ?? '#7fe0ff';
}

/** 十六进制色 → 'r,g,b' 三元组（PuffDust 的 color 参数格式） */
function rgbTriple(hex) {
  const h = String(hex ?? '#7fe0ff').replace('#', '');
  const n = h.length === 3
    ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return `${n[0]},${n[1]},${n[2]}`;
}

/** 十六进制色 + 透明度 → rgba 字符串（视觉层共用） */
function rgbaOf(hex, a) {
  const h = String(hex ?? '#ffffff').replace('#', '');
  const n = h.length === 3
    ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return `rgba(${n[0]},${n[1]},${n[2]},${Math.max(0, Math.min(1, a))})`;
}

const easeOutCubic = (p) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);

export class Inventory {
  constructor({ slots = CFG.inventory.slots, capacity = CFG.inventory.capacity } = {}) {
    // 格子内容：null | {substance, mass}（物质，按种类分格） |
    //        {item:'beaker'|'dropper'|'bottle', obj}（可携带物品：集气瓶/烧杯/滴管——
    //        一物一格，**不堆叠**，哪怕都是空的）
    this.slots = new Array(slots).fill(null);
    this.capacity = capacity;
    this.selected = 0;
  }

  selectedSlot() {
    return this.slots[this.selected];
  }

  /** 选中格里的可携带物品（无则 null） */
  selectedItem() {
    const s = this.selectedSlot();
    return s && s.item ? s.obj : null;
  }

  /** 该物质还能装下的质量（g）：同物质格剩余 + 每个空格一满格（跨格收集）；
   *  物品格不给物质留空间（不堆叠）。 */
  roomFor(substance) {
    let room = 0;
    for (const s of this.slots) {
      if (s && s.item) continue;
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
   * 物品格一律跳过（物品不堆叠、不与物质混装）。
   */
  add(substance, mass) {
    if (!Number.isFinite(mass) || mass <= 0) return 0; // 挡住 NaN/非法质量
    let rest = mass;
    let put = 0;
    for (const s of this.slots) {
      if (rest <= 1e-9) break;
      if (s && s.item) continue;
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

  /** 从选中格放置 amount g（不足时只扣剩余量），返回 {substance, mass} 或 null。 */
  place(amount) {
    const slot = this.selectedSlot();
    if (!slot || slot.item) return null;
    if (slot.mass <= 0) return null;
    const take = Math.min(slot.mass, amount);
    slot.mass = Math.max(0, slot.mass - take);
    if (slot.mass <= 0) this.slots[this.selected] = null;
    return { substance: slot.substance, mass: take };
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
    // ---- 纯视觉动画状态（非枚举：不参与存档快照、不影响游戏语义）----
    //   landAt/jumpAt/actAt：最近一次落地/起跳/动作的 scene.time（渲染按时间差算包络，
    //   确定性）；dustAcc：跑动扬尘节流
    Object.defineProperty(this, '_anim', {
      value: { landAt: -99, jumpAt: -99, actAt: -99, dustAcc: 0, breatheOfs: 0 },
      writable: true,
      enumerable: false,
    });
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
    const anim = this._anim; // 纯视觉动画状态（见构造函数）
    const now = scene.time ?? 0;
    // 落地音效：update 在物理结算前执行（读到的是上一帧结果）；_fallVy 是上一帧 update
    // 缓存的下落速度（_landOn 落地时会把 vel.y 清零，只能提前记）。
    if (this.onGround && !this._wasOnGround && this._fallVy >= 260) {
      sfx('player.land', { gain: Math.max(0.25, Math.min(1.2, this._fallVy / 650)) });
      // 落地动画：压扁包络（render 读 landAt）+ 脚底尘雾 + 液面/地面涟漪；
      // 重落地再加一圈小冲击环（纯视觉，不改变碰撞箱）。
      anim.landAt = now;
      const fxp = this.x + this.w / 2;
      const col = materialColor(this.substance);
      puffFx(scene, fxp, this.bottom, { color: rgbTriple(col), r: 4, spread: 16, life: 0.38 });
      rippleFx(scene, fxp, this.bottom, {
        color: 'rgba(210,222,248,0.7)', r0: 4, r1: Math.max(20, this.w * 0.72), life: 0.4, width: 1.6, flat: 0.3,
      });
      if (this._fallVy >= 520) {
        shockFx(scene, fxp, this.bottom - 2, {
          color: 'rgba(232,184,75,0.7)', r0: 6, r1: this.w, life: 0.3, width: 2, flat: 0.32,
        });
      }
    }
    this._wasOnGround = !!this.onGround;
    this._fallVy = Math.max(0, this.vel.y);
    const c = scene.control;
    // 上一帧沉淀颗粒算出的阻力：命令速度按 (1-阻力) 衰减（密集堆拖慢/挡路，稀疏可穿）
    const resist = Math.min(0.9, this._grainResist ?? 0);
    this._grainResist = 0;
    // 水平控制：有输入时设定速度；无输入时**保留当前速度**（爆炸冲击等外力不被抹掉，
    // 由地面摩擦逐渐减速——否则爆炸永远炸不动玩家）。
    // 冰面（_groundIce）：控制响应变慢（趋近目标速度的 controlAccel 速率）——很难
    // 急停/急转，松手后动量保持继续滑；石地仍为直接设定（指令即速度，不变量）。
    const input = (c.has('right') ? 1 : 0) - (c.has('left') ? 1 : 0);
    if (this._groundIce) {
      const k = CFG.ice.controlAccel;
      this.vel.x += (input * this.moveSpeed * (1 - resist) - this.vel.x) * Math.min(1, k * dt);
    } else if (input !== 0) {
      this.vel.x = input * this.moveSpeed * (1 - resist);
    }
    // 推动烧杯/集气瓶（必须在本处：玩家重设 vel 之后、物理步之前——吸附+清 vel，
    // 否则"物块推动-玩家不动 / 物块不动-玩家动"推弹交替，用户逐帧确认）
    pushContainers(this, scene, dt);
    if (c.has('jump') && this.onGround) {
      this.vel.y = -this.jumpVel;
      sfx('player.jump');
      // 起跳：拉伸包络（render 读 jumpAt）+ 脚底一小团尘
      anim.jumpAt = now;
      puffFx(scene, this.x + this.w / 2, this.bottom, {
        color: rgbTriple(materialColor(this.substance)), r: 3, spread: 12, life: 0.3, n: 4,
      });
    }
    if (scene.pressed.has('place')) this.tryPlace(scene);
    if (scene.pressed.has('collect')) {
      // Q = 拾取可拾取物品（和收集沉淀同一个键）。
      // ★ 例外：最近的物品是"内有沉淀的烧杯"时，先收杯里的沉淀，避免 Q 直接
      //   把杯子捡走、里面的沉淀永远拿不出来。收不到沉淀（不在范围内/栏满）才捡杯。
      const near = nearestCarryItem(scene, this);
      const prioPrecip = !!(near && near.isCarryItem === 'beaker'
        && near.precipitates && near.precipitates.size > 0);
      if (prioPrecip) {
        if (this.tryCollect(scene) <= 0) pickupItem(this, scene);
      } else if (!pickupItem(this, scene)) {
        this.tryCollect(scene);
      }
    }
    // 选中可拾取物品 → 物品自己定义的操作（名称/图标见 items.carryActionsOf；
    // 键位是设置里的「物品操作 1/2」，默认 C/X）。没选中物品时 C/X 不做事。
    const selItem = this.inventory.selectedItem();
    const carryActions = carryActionsOf(selItem);
    for (const a of carryActions) {
      if (!a.hold && scene.pressed.has(a.action) && a.press && a.press(this, scene)) anim.actAt = now;
    }
    // 按住语义（集气瓶集气：Scene.onGas 读 _gasHold；通气：每 tick 注入）——每 tick 重设
    scene._gasHold = null;
    for (const a of carryActions) {
      if (a.hold && scene.control.has(a.action) && a.holdFn) a.holdFn(this, scene, dt);
    }
    // 移动时冲刷表面壳（贴地摩擦）：非核心物质按浓度脱落成沉淀粒子。
    // 空中/游泳不脱落（不与地面接触就没有摩擦）。
    if (this.grid && this.onGround && (Math.abs(this.vel.x) > 50 || Math.abs(this.vel.y) > 50)) {
      this.shedShell(scene, dt);
    }
    // 跑动扬尘：贴地快速移动时隔 0.26s 在脚后扬一小团（纯视觉反馈，不改手感）
    if (this.onGround && Math.abs(this.vel.x) > 150) {
      anim.dustAcc += dt;
      if (anim.dustAcc >= 0.26) {
        anim.dustAcc = 0;
        const back = this.vel.x > 0 ? this.x + this.w * 0.28 : this.x + this.w * 0.72;
        puffFx(scene, back, this.bottom, {
          color: rgbTriple(materialColor(this.substance)), r: 2.6, spread: 9, life: 0.26, n: 4,
        });
      }
    } else {
      anim.dustAcc = 0;
    }
    // 接触同核心物质 → 缓慢吸收回血（沉淀粒子/物块；速率慢，不影响垫脚玩法）
    this.absorbCore(scene, dt);
  }

  /**
   * 放置/收集/操作的动作反馈（纯视觉）：尘雾 + 细碎金色闪光 + 扩散圆环。
   * 不改变任何游戏逻辑与数值，只是让"手上有动作"看得出来。
   */
  _placeFeedback(scene, x, y, big = false) {
    const col = rgbTriple(materialColor(this.substance));
    puffFx(scene, x, y, { color: col, r: big ? 4 : 3, spread: big ? 16 : 11, life: 0.32 });
    sparkleFx(scene, x, y - 2, {
      color: '#ffd76a', n: big ? 7 : 5, spread: big ? 20 : 14, rise: 12, life: 0.38, size: 2,
    });
    rippleFx(scene, x, y, {
      color: 'rgba(255,224,150,0.6)', r0: 3, r1: big ? 26 : 16, life: 0.36, width: 1.4, flat: 0.34,
    });
    this._anim.actAt = scene.time ?? 0;
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
      // ★ 玩家自己放置的沉淀不吸回（origin.kind==='place'——搭高/冰面平摊的沉淀必须留在原地；
      //    掉落壳/反应沉淀照常回血，不误伤）
      if (pt.origin?.kind === 'place') continue;
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
        if ((block.avail?.(this.substance) ?? block.grid.avail(this.substance)) <= 1e-9) continue;
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
   *    满格（0.1g）时达到脱落系数上限（可溶物 0.005、不溶物 0.001 g/格/s，按物质
   *    表 shedCoeff 可覆盖）；浓度低于阈值（0.01g，与碰撞/渲染阈值一致）彻底不再脱落
   *  - 脱落量**累积**：攒够 SHED_BURST（2g）才生成一小簇粒子——走路是"走一段
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
          const rateMax = shedCoeffOf(id); // 脱落系数（可溶 0.005 / 不溶 0.001）
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
    // 选中格是可携带物品（集气瓶/烧杯/滴管）→ 放到玩家身旁（shift 放置）
    if (placeCarriedItem(this, scene)) return;
    const sel = this.inventory.selectedSlot();
    if (!sel || sel.item || !(sel.mass > 0)) return;
    // 就近放置：脚下容器优先于附近固定台（池/开关/灯，吸附）优先于酒精灯兜底
    const lamp = scene.findLampNear(this);
    let container = scene.containerUnderFeet(this);
    if (!container) container = scene.snapNearFeet(this); // ★ 池边/开关旁/灯边放置自动吸附
    // ★ 开关只接受"激活所需物质"：错误物质不投入开关（本次放置不生效，物品留在栏里）。
    //   无 opening 的压力开关不限制（没有可指定的激活物质）。
    if (container && container.isSwitch && typeof container.canAcceptSubstance === 'function'
      && !container.canAcceptSubstance(sel.substance)) {
      return;
    }
    const res = this.inventory.place(CFG.placeAmount);
    if (!res) return;
    const amount = res.mass; // ★ 实际扣除量（不足 0.5g 时不能凭空多出质量）
    const st = getSubstance(res.substance).state;
    const placeOrigin = { kind: 'place' };
    if (container) {
      // 落点=玩家脚下/台边吸附点（反应/气泡围绕玩家放下的位置，不再默认容器中心）
      const ir = typeof container.innerRect === 'function' ? container.innerRect() : null;
      if (ir) {
        const px = container.isPool || container.isSwitch || container.isLamp
          ? Math.min(Math.max(this.x + this.w / 2, ir.x + 6), ir.x + ir.w - 6) // 吸附：投入台内（夹在边界之间）
          : this.x + this.w / 2;
        container.depositAt = { x: px, y: Math.max(ir.y + 4, this.bottom - 6) };
      }
      // 可溶物质放进液体容器（池）→ 溶解进溶液（CuSO4 不会变成永不溶解的沉淀颗粒）；
      // 液体物质（Br2/H2O2/HCl…）也进溶液，不再变成"固体球"；其余不溶物才作为沉淀放置
      if (container.solution && container.solution.volume > 0
        && (container.solution.water > 0 || st === 'liquid')
        && (isSoluble(res.substance) || st === 'liquid')) {
        container.solution.add(res.substance, amount);
        if (container.noteSolOrigin) container.noteSolOrigin(res.substance, { kind: 'place' });
      } else {
        container.addPrecipitate(res.substance, amount, null, placeOrigin);
      }
      // 放置反馈：落点尘雾 + 细碎闪光 + 扩散圆环（视觉层，不改数值）
      this._placeFeedback(
        scene,
        container.depositAt ? container.depositAt.x : this.x + this.w / 2,
        container.depositAt ? container.depositAt.y : this.bottom,
        true,
      );
      sfx('item.place');
      return;
    }
    if (lamp && st !== 'liquid') {
      lamp.addPrecipitate(res.substance, amount, null, placeOrigin);
      this._placeFeedback(
        scene,
        lamp.x + lamp.w / 2,
        typeof lamp.flameY === 'function' ? lamp.flameY() : lamp.y,
        true,
      );
      sfx('item.place');
      return;
    }
    // 地面：生成"放置的沉淀"（实心、可垫脚、只能被重新收集）。
    // 0.5g 拆成 2 颗 0.25g 细颗粒（4e89112：maxParticleMass 0.25 的"细沙颗粒"）——
    // 单颗 0.5g 大球底部不稳被玩家一踩就压平；细颗粒成簇能堆柱垫高（4e89112 行为）。
    // 落点由支撑面决定：石地 → 默认散布（resolveEmbed 垂直堆叠下能堆柱）；冰面 → spread 20
    // （就地摊开平摊——冰上搭不了高，用户要求）。
    const spread = this._groundIce ? 20 : undefined;
    const n = Math.max(1, Math.ceil(amount / 0.25)); // 0.5g → 2 颗 0.25g
    const each = amount / n;
    const before = scene.particles.length;
    for (let k = 0; k < n; k++) {
      scene.spawnParticles(res.substance, each, { x: this.x + this.w / 2, y: this.bottom + 1 }, true, true, placeOrigin, spread);
    }
    // ★ 冰面快速连放防搭：新颗粒立即按冰面预标记（还没落地就让堆叠判定看到冰）——
    //   否则 0.2s 内的连放颗粒在"未触地"窗口里走垂直堆叠（用户"点得快还能搭起来"）
    if (this._groundIce) {
      for (let k = before; k < scene.particles.length; k++) {
        scene.particles[k]._groundIce = true;
        if (!scene.particles[k]._iceDir) scene.particles[k]._iceDir = Math.random() < 0.5 ? -1 : 1;
      }
    }
    // 地面放置反馈：尘雾 + 细碎闪光 + 扩散圆环
    this._placeFeedback(scene, this.x + this.w / 2, this.bottom + 1, true);
    sfx('item.place');
  }

  tryCollect(scene) {
    const me = this.center;
    let got = 0; // 实际收集到的质量（0 = 什么都没收到，不响拾取音）
    // 自由沉淀粒子（按剩余容量部分收集，放不下的留在原地）
    // ★ 距离用"玩家身体最近边缘"而不是身体中心：站在台阶/物块上时，身体中心离
    //   下方地面的沉淀会超过 70px，但脚边其实就在沉淀上方——用中心距离会导致
    //   "明明站在沉淀正上方却收不到"（与拾取物品/容器沉淀的判定保持一致）。
    for (const p of scene.particles.slice()) {
      if (!p.collectible) continue;
      const nx = Math.max(this.x - (p.x + p.w), p.x - (this.x + this.w), 0);
      const ny = Math.max(this.y - (p.y + p.h), p.y - (this.y + this.h), 0);
      if (Math.hypot(nx, ny) > CFG.collectRadius) continue;
      const room = this.inventory.roomFor(p.substance);
      if (room <= 0) continue;
      const put = this.inventory.add(p.substance, Math.min(p.amount, room));
      got += put;
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
        got += taken;
      }
    }
    if (got > 0) {
      sfx('item.pickup');
      // 收集成功：手边金色闪光 + 脚边涟漪（"收进来了"的物理反馈）
      flashFx(scene, me.x, this.y + this.h * 0.45, { color: '#ffe9b0', r: Math.max(12, this.w * 0.45), life: 0.2, rays: 4 });
      this._placeFeedback(scene, me.x, this.bottom, false);
    }
    return got;
  }

  adhereMaterial(id, mass) {
    // 产物盈余长在所有暴露面（与大气/液体接触的面），所有位置同时渐进生长
    const added = this.grid.growExposed(id, mass);
    this.syncGrid();
    return added;
  }

  /**
   * 玩家渲染（新 Chezzle 视觉语言）：材料网格本体 + 细金边 + 元素光晕 + 发光眼睛；
   * 动画全部由确定性 sin/时间差驱动、只变换绘制层（碰撞箱/物理完全不变）：
   *   待机呼吸（1.8%）/ 行走颠+倾 / 空中 squash & stretch / 落地压扁 / 起跳拉伸 / 动作压扁。
   * 编辑器预览与游戏共用（opts.time 由渲染器传入）。
   */
  render(ctx, opts = {}) {
    const grid = this.grid;
    const aabb = grid.minAABB();
    if (!aabb) return;
    const time = opts?.time ?? 0;
    const ox = this.gridOrigin.x;
    const oy = this.gridOrigin.y;
    const color = materialColor(this.substance);
    const bx = ox + aabb.x;
    const by = oy + aabb.y;
    const bw = aabb.w;
    const bh = aabb.h;
    if (!(bw > 0 && bh > 0)) return;
    const anim = this._anim;
    const speed = Math.abs(this.vel.x) / Math.max(1, this.moveSpeed);
    const moving = speed > 0.06;
    const airborne = !this.onGround;
    const px = bx + bw / 2; // 变换支点 = 脚底中心（缩放时脚不离开地面）
    const py = by + bh;
    // ---- 动画包络（确定性；不改变碰撞箱）----
    let sx = 1;
    let sy = 1;
    let lean = 0;
    let bob = 0;
    // 待机呼吸：垂直 1.8% / 水平 -1.1%；移动时减弱（"轻微活着"）
    const breatheAmp = airborne ? 0.004 : (moving ? 0.008 : 0.018);
    const br = Math.sin(time * 2.2 + anim.breatheOfs);
    sy += breatheAmp * br;
    sx -= breatheAmp * 0.62 * br;
    // 行走：上下颠 + 轻微左右倾
    if (moving && !airborne) {
      const stride = time * (7 + 6 * Math.min(1, speed));
      bob = -Math.abs(Math.sin(stride)) * Math.min(2.6, 1.2 + speed * 1.4);
      lean += (this.vel.x > 0 ? 1 : -1) * Math.min(1, speed) * 0.03 + Math.sin(stride * 2) * 0.008;
    }
    // 空中：竖直拉伸 / 水平收窄（下落越快越明显）；朝速度方向微倾
    if (airborne) {
      const k = Math.max(-1, Math.min(1, this.vel.y / 700));
      sy += Math.abs(k) * 0.07;
      sx -= Math.abs(k) * 0.045;
      lean += Math.max(-1, Math.min(1, this.vel.x / 500)) * 0.05;
    }
    // 落地压扁（0.24s 包络）
    const landAge = time - anim.landAt;
    if (landAge >= 0 && landAge < 0.24) {
      const q = Math.sin((landAge / 0.24) * Math.PI);
      sx += 0.10 * q;
      sy -= 0.12 * q;
    }
    // 起跳拉伸（0.18s）
    const jumpAge = time - anim.jumpAt;
    if (jumpAge >= 0 && jumpAge < 0.18) {
      const q = Math.sin((jumpAge / 0.18) * Math.PI);
      sy += 0.10 * q;
      sx -= 0.055 * q;
    }
    // 动作（拾取/放置/倒液/收集）短促压一下
    const actAge = time - anim.actAt;
    if (actAge >= 0 && actAge < 0.18) {
      const q = Math.sin((actAge / 0.18) * Math.PI);
      sx += 0.05 * q;
      sy -= 0.05 * q;
    }
    // ---- 原版玩家外观：材料网格 + 简单轮廓 + 圆眼（不加装甲/面罩/晶片等装饰）----
    // 动画只做轻微位移/缩放（呼吸/行走颠/落地压扁等），不改变碰撞箱。
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    rr(ctx, bx, by, bw, bh, 9);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(px, py + bob);
    ctx.rotate(lean);
    ctx.scale(sx, sy);
    ctx.translate(-px, -py);
    // 材料网格本体
    renderGrid(ctx, grid, ox, oy);
    // 角色轮廓（深色物质用白色辉光轮廓，浅色用深描边）
    ctx.save();
    ctx.strokeStyle = luminance(color) < 110 ? 'rgba(255,255,255,0.75)' : contrastEdge(color);
    ctx.lineWidth = 2;
    if (luminance(color) < 110) {
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 8;
    }
    rr(ctx, bx, by, bw, bh, 9);
    ctx.stroke();
    ctx.restore();
    // 表情（只留眼睛；随移动方向微调视线）
    const ecx = bx + bw / 2;
    const ecy = by + bh * 0.42;
    const eye = Math.max(2, bw * 0.06);
    const eyeGap = bw * 0.17;
    const lookX = Math.max(-1, Math.min(1, this.vel.x / this.moveSpeed)) * eyeGap * 0.45;
    const lookY = Math.max(-1, Math.min(1, this.vel.y / 600)) * bh * 0.05;
    const lx = ecx + lookX;
    const ly = ecy + lookY;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lx - eyeGap, ly, eye, 0, TAU);
    ctx.arc(lx + eyeGap, ly, eye, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#141426';
    ctx.beginPath();
    ctx.arc(lx - eyeGap + eye * 0.32, ly, eye * 0.45, 0, TAU);
    ctx.arc(lx + eyeGap + eye * 0.32, ly, eye * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 局部绘制辅助（纯视觉；不影响物理/网格/存档/输入）
  // ---------------------------------------------------------------------------

  /**
   * 胸口核心 + 腰带：黑曜石/黄铜装甲细节，打破材料色块、强化"元素构造体"身份。
   * 核心宝石用身体元素色（与眼睛/光环同源），材料色仍是身体主体；纯视觉。
   */
  _renderChestPlate(ctx, bx, by, bw, bh, time, color) {
    const cx = bx + bw / 2;
    // ---- 腰带（深钢带 + 金边 + 中央菱形扣）----
    const beltH = Math.max(3, Math.min(6, bh * 0.075));
    const beltY = by + bh * 0.635;
    const beltW = bw * 0.78;
    rr(ctx, cx - beltW / 2, beltY, beltW, beltH, Math.max(1.5, beltH * 0.45));
    const bg = ctx.createLinearGradient(0, beltY, 0, beltY + beltH);
    bg.addColorStop(0, '#504872');
    bg.addColorStop(0.5, '#241e3e');
    bg.addColorStop(1, '#100d20');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();
    const buckR = Math.min(beltH * 1.5, 6.5);
    this._diamondPath(ctx, cx, beltY + beltH / 2, buckR, buckR * 0.78);
    ctx.fillStyle = rgbaOf(THEME.gold.base, 0.9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,4,0.8)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    this._diamondPath(ctx, cx, beltY + beltH / 2, buckR * 0.5, buckR * 0.4);
    ctx.fillStyle = rgbaOf(color, 0.9);
    ctx.fill();
    // ---- 胸口核心（钢座 + 金圈 + 元素色晶核 + 能量线）----
    const my = by + bh * 0.365;
    const r = Math.max(5, Math.min(9, bw * 0.145));
    ctx.beginPath();
    ctx.arc(cx, my, r, 0, TAU);
    ctx.fillStyle = '#231d3c';
    ctx.fill();
    ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.7);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, my, r * 0.7, 0, TAU);
    ctx.fillStyle = 'rgba(8,6,20,0.85)';
    ctx.fill();
    ctx.strokeStyle = rgbaOf(THEME.gold.light, 0.35);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 + 2 * Math.sin(time * 2.6);
    ctx.fillStyle = rgbaOf(color, 0.92);
    this._diamondPath(ctx, cx, my, r * 0.44, r * 0.58);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.1, my - r * 0.14, Math.max(0.7, r * 0.12), 0, TAU);
    ctx.fill();
    ctx.restore();
    // 核心 → 腰带的细能量线（确定性强弱呼吸）
    ctx.strokeStyle = rgbaOf(color, 0.28 + 0.1 * Math.sin(time * 2.2 + 0.7));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, my + r);
    ctx.lineTo(cx, beltY);
    ctx.stroke();
  }

  /**
   * 两侧悬浮护手：黑曜石/黄铜小护手，略在身体外侧悬空，随行走轻微上下；
   * 让剪影更像"构造体"而不是一块方碑。纯视觉，无碰撞。
   */
  _renderGauntlets(ctx, bx, by, bw, bh, time, speed, facing, color) {
    const gw = Math.max(4, Math.min(8, bw * 0.13));
    const gh = Math.max(7, Math.min(15, bh * 0.17));
    const stride = time * (7 + 6 * Math.min(1, speed));
    const bob = Math.sin(stride) * Math.min(1.8, 0.5 + speed * 1.2);
    for (const side of [-1, 1]) {
      const gap = Math.max(1.5, bw * 0.045);
      const gx = side < 0 ? bx - gap - gw : bx + bw + gap;
      const gy = by + bh * 0.485 + (side < 0 ? bob : -bob) * 0.45;
      rr(ctx, gx, gy, gw, gh, Math.max(1.5, gw * 0.35));
      const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
      g.addColorStop(0, '#56607f');
      g.addColorStop(0.45, '#2c3348');
      g.addColorStop(1, '#141827');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,6,20,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 金色腕箍 + 元素色指缝
      ctx.fillStyle = rgbaOf(THEME.gold.base, 0.8);
      ctx.fillRect(gx + 0.4, gy + 1, gw - 0.8, Math.max(0.8, gh * 0.1));
      ctx.strokeStyle = rgbaOf(color, 0.75);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(gx + gw * 0.5, gy + gh * 0.42);
      ctx.lineTo(gx + gw * 0.5, gy + gh * 0.86);
      ctx.stroke();
      // 侧面金铆钉
      ctx.fillStyle = rgbaOf(THEME.gold.light, 0.75);
      ctx.beginPath();
      ctx.arc(gx + gw * 0.5, gy + gh * 0.24, Math.max(0.5, gw * 0.09), 0, TAU);
      ctx.fill();
    }
  }

  /**
   * 玩家剪影：faceted 切角多面体轮廓（八边形变体）——放弃"整块圆角矩形"。
   * 点序必须保持：0/1 肩线，2/3 右上切角，4 右腰，5/6 右下切角，7/8 左下切角，
   * 9 左腰，10/11 左上切角（金线关键棱边/角标按此索引取点）。
   */
  _facetPoints(bx, by, bw, bh) {
    const cx = Math.min(Math.max(3, bw * 0.20), bw * 0.30, 15); // 上/下切角 x
    const cy = Math.min(Math.max(2.5, bh * 0.16), bh * 0.26, 11); // 上/下切角 y
    const waist = Math.min(bw * 0.05, 6); // 腰部内收
    const sh = Math.min(bw * 0.03, 4); // 肩部微内收（让肩甲外挂）
    const wY = by + bh * 0.58;
    return [
      { x: bx + cx + sh, y: by }, // 0 左肩顶
      { x: bx + bw - cx - sh, y: by }, // 1 右肩顶
      { x: bx + bw - cx * 0.4, y: by + cy * 0.55 }, // 2 右上切角
      { x: bx + bw, y: by + cy }, // 3 右肩外
      { x: bx + bw - waist, y: wY }, // 4 右腰
      { x: bx + bw - waist * 0.5, y: by + bh - cy }, // 5 右下切
      { x: bx + bw - cx * 0.7, y: by + bh }, // 6 右脚
      { x: bx + cx * 0.7, y: by + bh }, // 7 左脚
      { x: bx + waist * 0.5, y: by + bh - cy }, // 8 左下切
      { x: bx + waist, y: wY }, // 9 左腰
      { x: bx, y: by + cy }, // 10 左肩外
      { x: bx + cx * 0.4, y: by + cy * 0.55 }, // 11 左上切角
    ];
  }

  /** 把点数组描成闭合路径（不自开新路径时的调用方需先 beginPath） */
  _tracePolygon(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  /** 菱形路径（额心宝石/晶片共用；rx/ry 为半宽/半高） */
  _diamondPath(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(x, y - ry);
    ctx.lineTo(x + rx, y);
    ctx.lineTo(x, y + ry);
    ctx.lineTo(x - rx, y);
    ctx.closePath();
  }

  /** 金色 L 形角标（切角处的细刻线；不整圈镶金） */
  _goldTick(ctx, x, y, dx, dy, len) {
    ctx.beginPath();
    ctx.moveTo(x + dx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * len);
    ctx.stroke();
  }

  /**
   * 脚下元素符文环：椭圆双环 + 8 个缓慢旋转的短刻度，确定性呼吸。
   * 与原软阴影并存（阴影在外面先画）；离地时变淡（浮空时不该像贴地）。
   */
  _renderRuneRing(ctx, px, py, bw, time, color, airborne) {
    const rx = Math.max(9, bw * 0.56);
    const ry = rx * 0.30;
    const k = airborne ? 0.45 : 1;
    const breath = 0.5 + 0.5 * Math.sin(time * 1.5);
    ctx.save();
    // 外环（呼吸）
    ctx.strokeStyle = rgbaOf(color, (0.20 + 0.13 * breath) * k);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(px, py + 1, rx, ry, 0, 0, TAU);
    ctx.stroke();
    // 内环（反相呼吸，更淡）
    ctx.strokeStyle = rgbaOf(color, (0.09 + 0.07 * (1 - breath)) * k);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(px, py + 1, rx * 0.72, ry * 0.72, 0, 0, TAU);
    ctx.stroke();
    // 8 个符文短刻线（缓慢旋转）
    const spin = time * 0.35;
    ctx.strokeStyle = rgbaOf(color, (0.26 + 0.16 * breath) * k);
    ctx.lineWidth = 1.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    for (let i = 0; i < 8; i++) {
      const ang = spin + (i / 8) * TAU;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(px + c * rx * 0.88, py + 1 + s * ry * 0.88);
      ctx.lineTo(px + c * rx * 1.07, py + 1 + s * ry * 1.07);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * 披风/飘带：从肩部垂下、向身后飘的两条暗紫布带 + 金边（画在身体之前 = 身后层叠；
   * 随速度/时间摆动；小尺寸玩家省略）。纯视觉，不参与物理。
   */
  _renderRibbons(ctx, bx, by, bw, bh, time, speed, facing) {
    const dir = facing >= 0 ? -1 : 1; // 身后方向 = 朝向的反方向
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const rootX = bx + bw * (0.5 + side * 0.15);
      const rootY = by + bh * 0.24;
      const len = bh * (0.60 + i * 0.10) + 4;
      const ph = time * 2.2 + i * 1.9;
      const sway = Math.sin(ph) * (2.0 + speed * 4.5);
      const drift = dir * (bw * (0.15 + i * 0.06) + speed * 7) + sway * dir * 0.25;
      const ctrlX = rootX + drift * 0.5 + sway;
      const ctrlY = rootY + len * 0.55;
      const tipX = rootX + drift + sway * 0.5;
      const tipY = rootY + len;
      const wTop = Math.max(2.2, bw * 0.075);
      const wTip = Math.max(1.1, wTop * 0.32);
      ctx.save();
      // 布面
      ctx.beginPath();
      ctx.moveTo(rootX - wTop, rootY);
      ctx.quadraticCurveTo(ctrlX - wTop * 0.65, ctrlY, tipX - wTip, tipY);
      ctx.lineTo(tipX + wTip, tipY);
      ctx.quadraticCurveTo(ctrlX + wTop * 0.65, ctrlY, rootX + wTop, rootY);
      ctx.closePath();
      ctx.fillStyle = i === 0 ? 'rgba(44,34,88,0.82)' : 'rgba(36,28,74,0.80)';
      ctx.fill();
      ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.42);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // 布褶内线（一条暗亮线，表现布面折痕）
      ctx.strokeStyle = 'rgba(128,106,200,0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(rootX + side * wTop * 0.3, rootY + 2);
      ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY - 1.5);
      ctx.stroke();
      // 末端小金坠
      ctx.fillStyle = rgbaOf(THEME.gold.light, 0.8);
      ctx.beginPath();
      ctx.arc(tipX, tipY, 1.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /** 肩甲：黄铜/深钢叠层甲片 + 铆钉 + 元素色能量槽（略超出身体 2~4px，纯视觉） */
  _renderPauldrons(ctx, bx, by, bw, bh, color) {
    const out = Math.min(4, Math.max(2, bw * 0.045));
    const shY = by + bh * 0.10;
    const h1 = Math.max(4, bh * 0.15);
    for (const side of [-1, 1]) {
      const xEdge = side < 0 ? bx : bx + bw;
      const xOut = xEdge + side * out;
      const xIn = xEdge - side * bw * 0.19;
      ctx.save();
      // 主甲片（深钢）
      ctx.beginPath();
      ctx.moveTo(xOut, shY);
      ctx.lineTo(xIn, shY + bh * 0.015);
      ctx.lineTo(xIn - side * bw * 0.015, shY + h1 * 0.72);
      ctx.lineTo(xOut - side * 1.1, shY + h1);
      ctx.closePath();
      ctx.fillStyle = '#3c435e';
      ctx.fill();
      ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
      // 上缘钢高光
      ctx.strokeStyle = 'rgba(200,210,236,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xOut + side * 0.6, shY + 0.8);
      ctx.lineTo(xIn - side * 0.4, shY + bh * 0.02 + 0.6);
      ctx.stroke();
      // 元素色能量槽（细发光线）
      ctx.strokeStyle = rgbaOf(color, 0.75);
      ctx.lineWidth = 1.1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(xOut - side * out * 0.2, shY + h1 * 0.34);
      ctx.lineTo(xIn + side * bw * 0.03, shY + h1 * 0.20);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 黄铜铆钉（2 枚）
      ctx.fillStyle = rgbaOf(THEME.gold.light, 0.85);
      for (const k of [0.3, 0.72]) {
        ctx.beginPath();
        ctx.arc(xOut + (xIn - xOut) * k, shY + h1 * (0.35 + k * 0.28), Math.max(0.9, bw * 0.018), 0, TAU);
        ctx.fill();
      }
      // 下层叠甲片
      ctx.beginPath();
      ctx.moveTo(xOut - side * 0.8, shY + h1 * 0.78);
      ctx.lineTo(xIn, shY + h1 * 0.62);
      ctx.lineTo(xIn - side * bw * 0.01, shY + h1 * 1.28);
      ctx.lineTo(xOut - side * 1.6, shY + h1 * 1.34);
      ctx.closePath();
      ctx.fillStyle = 'rgba(48,54,80,0.95)';
      ctx.fill();
      ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.35);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 护胫甲片：下方两角的小型深钢甲片 + 金边 + 元素色细缝（小尺寸省略） */
  _renderGreaves(ctx, bx, by, bw, bh, color) {
    const out = Math.min(3, Math.max(1.5, bw * 0.035));
    const gy = by + bh * 0.70;
    for (const side of [-1, 1]) {
      const xEdge = side < 0 ? bx : bx + bw;
      const xOut = xEdge + side * out;
      const xIn = xEdge - side * bw * 0.19;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xOut, gy);
      ctx.lineTo(xIn, gy + bh * 0.02);
      ctx.lineTo(xIn - side * bw * 0.01, by + bh - 0.5);
      ctx.lineTo(xOut - side * 0.6, by + bh + 1);
      ctx.closePath();
      ctx.fillStyle = 'rgba(40,45,66,0.95)';
      ctx.fill();
      ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.35);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // 顶缘高光 + 元素色细缝
      ctx.strokeStyle = 'rgba(190,200,228,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xOut - side * 0.4, gy + 0.8);
      ctx.lineTo(xIn - side * 0.3, gy + bh * 0.02 + 0.8);
      ctx.stroke();
      ctx.strokeStyle = rgbaOf(color, 0.55);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(xOut - side * 0.9, gy + bh * 0.06);
      ctx.lineTo(xOut - side * 0.9, by + bh - 1.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 头部/面罩（"表情"核心）：身体上部 22%~26% 盖一块暗紫玻璃切角梯形棱面
   * + 细金边 + 额心宝石 + 一对**斜挑的狭长发光眼缝**（下方暗紫玻璃底、内芯白热；
   * 眨眼时收成一条金线；朝移动方向倾斜）。小尺寸玩家只保留面罩/眼缝/金线。
   */
  _renderFaceplate(ctx, bx, by, bw, bh, time, blink, facing, color, tiny) {
    const fx = bx + bw * 0.13;
    const fw = bw * 0.74;
    const fy = by + bh * 0.035;
    const fh = Math.min(bh * 0.26, bh - 4);
    if (fw <= 6 || fh <= 4) return;
    const faceShift = facing * bw * 0.008; // 面罩整体朝移动方向极轻偏移
    const pts = [
      { x: fx + fw * 0.14 + faceShift, y: fy },
      { x: fx + fw * 0.86 + faceShift, y: fy },
      { x: fx + fw + faceShift, y: fy + fh * 0.30 },
      { x: fx + fw * 0.90 + faceShift, y: fy + fh },
      { x: fx + fw * 0.10 + faceShift, y: fy + fh },
      { x: fx + faceShift, y: fy + fh * 0.30 },
    ];
    ctx.save();
    // 暗紫玻璃底（切角梯形棱面）
    this._tracePolygon(ctx, pts);
    const g = ctx.createLinearGradient(fx, fy, fx + fw * 0.4, fy + fh);
    g.addColorStop(0, 'rgba(88,66,158,0.92)');
    g.addColorStop(0.45, 'rgba(46,32,96,0.90)');
    g.addColorStop(1, 'rgba(18,12,42,0.94)');
    ctx.fillStyle = g;
    ctx.fill();
    // 细金边（呼吸发光）
    const goldA = 0.62 + 0.20 * Math.sin(time * 2.2 + 0.7);
    ctx.strokeStyle = rgbaOf(THEME.gold.base, goldA);
    ctx.lineWidth = 1.15;
    ctx.shadowColor = rgbaOf(THEME.gold.light, 0.55);
    ctx.shadowBlur = 5;
    this._tracePolygon(ctx, pts);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 玻璃高光：上缘一道亮线 + 左上斜向反光
    ctx.strokeStyle = 'rgba(210,225,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx + fw * 0.18 + faceShift, fy + fh * 0.14);
    ctx.lineTo(fx + fw * 0.82 + faceShift, fy + fh * 0.14);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(1, fw * 0.05);
    ctx.beginPath();
    ctx.moveTo(fx + fw * 0.24 + faceShift, fy + fh * 0.88);
    ctx.lineTo(fx + fw * 0.46 + faceShift, fy + fh * 0.06);
    ctx.stroke();
    // 额心宝石（菱形 + 金托 + 元素色发光）——太小则不画，保证眼缝空间
    const gemX = fx + fw / 2 + faceShift;
    if (fh >= 7) {
      const gemY = fy + fh * 0.24;
      const gemR = Math.max(1.5, Math.min(fw * 0.07, fh * 0.18));
      ctx.fillStyle = rgbaOf(THEME.gold.deep, 0.9);
      this._diamondPath(ctx, gemX, gemY, gemR * 1.5, gemR * 1.6);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      this._diamondPath(ctx, gemX, gemY, gemR, gemR * 1.25);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      this._diamondPath(ctx, gemX - gemR * 0.18, gemY - gemR * 0.2, gemR * 0.36, gemR * 0.48);
      ctx.fill();
      // 宝石下方的细金鼻梁线（构造体的中轴）
      ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.4);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(gemX, gemY + gemR * 1.7);
      ctx.lineTo(gemX, fy + fh * 0.92);
      ctx.stroke();
    }
    // ---- 斜挑狭长发光眼缝（不要圆眼/黑眼窝）----
    const eyeY = fy + fh * (tiny ? 0.60 : 0.60);
    const eyeLen = Math.max(3.2, fw * 0.23);
    const eyeH = Math.max(1.3, fh * 0.11);
    const eyeGap = fw * (tiny ? 0.24 : 0.205);
    const look = Math.max(-1, Math.min(1, this.vel.x / Math.max(1, this.moveSpeed)));
    const tiltBase = 0.17 + Math.abs(look) * 0.06; // 外侧眼角上扬（斜挑）
    const pairTilt = look * 0.07 * facing; // 整体朝移动方向再偏一点
    for (const side of [-1, 1]) {
      const ex = gemX + side * eyeGap + look * eyeLen * 0.12 * facing;
      const tilt = -side * tiltBase + pairTilt;
      this._eyeSlit(ctx, ex, eyeY, eyeLen, eyeH, tilt, blink, color);
    }
    // 下缘暗紫压暗（玻璃厚度）
    this._tracePolygon(ctx, pts);
    ctx.fillStyle = 'rgba(8,4,20,0.16)';
    ctx.fill();
    ctx.restore();
  }

  /**
   * 单只眼缝：暗紫玻璃底槽 + 元素色发光内芯 + 白热中线；柳叶/杏仁形。
   * blink<0.22 时收成一条金色细线（眨眼）；不要圆眼。
   */
  _eyeSlit(ctx, cx, cy, len, hgt, tilt, blink, color) {
    const b = Math.max(0.10, Math.min(1, blink));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    if (b < 0.22) {
      // 眨眼：一条细金线
      ctx.strokeStyle = rgbaOf(THEME.gold.light, 0.85);
      ctx.lineWidth = 1.1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const h = hgt * b;
    // 暗紫玻璃底槽
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.quadraticCurveTo(0, -h * 1.3, len / 2, 0);
    ctx.quadraticCurveTo(0, h * 1.3, -len / 2, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(14,8,34,0.92)';
    ctx.fill();
    // 内芯发光（元素色 → 白热中线）
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-len * 0.42, 0);
    ctx.quadraticCurveTo(0, -h * 0.92, len * 0.42, 0);
    ctx.quadraticCurveTo(0, h * 0.92, -len * 0.42, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,250,0.95)';
    ctx.beginPath();
    ctx.moveTo(-len * 0.30, 0);
    ctx.quadraticCurveTo(0, -h * 0.34, len * 0.30, 0);
    ctx.quadraticCurveTo(0, h * 0.34, -len * 0.30, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  /**
   * 头顶悬浮晶片（2~3 片小晶片/符文碎片）：金 / 元素色 / 青，慢速上下浮动 +
   * 微小自转（确定性 sin），作为构造体的"生命感"。小尺寸玩家省略。
   */
  _renderCrystals(ctx, bx, by, bw, bh, time, color) {
    const baseX = bx + bw / 2;
    const baseY = by - Math.max(4, Math.min(10, bh * 0.06)) - 2;
    const palette = [THEME.gold.light, color, '#7fe0ff'];
    const size = Math.max(3, Math.min(7, bh * 0.07));
    for (let i = 0; i < 3; i++) {
      const ph = time * 1.5 + i * 2.1;
      const offX = (i - 1) * bw * (0.22 + i * 0.02);
      const fy = baseY + Math.sin(ph) * 2.2 - Math.abs(i - 1) * 1.5;
      const rot = Math.sin(ph * 0.8 + i * 1.3) * 0.35 + (i - 1) * 0.12;
      const h = size * (i === 1 ? 1.4 : 1);
      const w = h * 0.5;
      ctx.save();
      ctx.translate(baseX + offX, fy);
      ctx.rotate(rot);
      // 晶片：细长菱形，暗紫底 + 亮边 + 内核亮线
      this._diamondPath(ctx, 0, 0, w, h);
      ctx.fillStyle = 'rgba(38,30,82,0.92)';
      ctx.fill();
      ctx.strokeStyle = rgbaOf(palette[i], 0.75);
      ctx.lineWidth = 0.9;
      ctx.shadowColor = palette[i];
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.strokeStyle = rgbaOf(palette[i], 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.55);
      ctx.lineTo(0, h * 0.55);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    // 晶片与头顶之间的细能量线（一条短弧，固定相位）
    ctx.strokeStyle = rgbaOf(color, 0.18);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(baseX - bw * 0.1, by - 1);
    ctx.quadraticCurveTo(baseX, baseY + 1, baseX + bw * 0.1, by - 1);
    ctx.stroke();
  }
}
