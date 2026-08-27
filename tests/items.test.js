// ============================================================================
// 可携带物品（集气瓶 / 烧杯 / 滴管）测试
// 覆盖：物品格不堆叠、C 拾取（含烧杯子体/空格限制）、Shift 放置、
//       C 吸液（烧杯比例转移/混合/满杯、滴管占优溶质/同液续吸至容量）、
//       X 倒出（每次 10g）、按住 C 集气（onGas 截留 + 引擎不放大气）、
//       按住 X 通气（石灰水鼓泡变浑）、拖动滴管点击管线（含抢断）、
//       集气瓶实体物理（碰撞箱/推动/进不去）。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player, Inventory } from '../src/objects/player.js';
import { Beaker } from '../src/objects/beaker.js';
import { Dropper } from '../src/objects/dropper.js';
import { GasBottle } from '../src/objects/gasbottle.js';
import { Pool } from '../src/objects/pool.js';
import { Block } from '../src/objects/block.js';
import { Floor } from '../src/objects/floor.js';
import { Camera } from '../src/render/camera.js';
import { Solution } from '../src/chem/solution.js';
import { Atmosphere } from '../src/chem/atmosphere.js';
import { ChemistryEngine } from '../src/chem/engine.js';
import { pickupItem, placeCarriedItem, drawLiquid, pourBeaker, injectBottleGas } from '../src/level/items.js';
import { handleScenePressDown, handleScenePressMove, handleScenePressUp } from '../src/level/click.js';
import { CFG } from '../src/core/config.js';

const TICK = 1 / 30;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

function flatScene(worldW = 1000, worldH = 800) {
  const scene = new Scene({ worldW, worldH });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  scene.status = 'running';
  return scene;
}

function withPlayer(scene, x = 330, y = 630) {
  const p = new Player({ x, y });
  scene.addObject(p);
  return p;
}

// ---- 1. 物品格：不堆叠、与物质的 room/add/place 互不干扰 ----------------------
test('物品格：一物一格；物质收集跳过物品格；place() 物品格返回 null', () => {
  const inv = new Inventory({ slots: 5, capacity: 100 });
  const bottle = new GasBottle({ x: 0, y: 0 });
  inv.slots[1] = { item: 'bottle', obj: bottle };
  // roomFor：物品格不给物质留空间（其余 4 个空槽 = 400g）
  assert.equal(inv.roomFor('CuSO4'), 400, '物品格不应算入物质空间');
  // add：跳过物品格，只用空槽
  const put = inv.add('CuSO4', 120);
  assert.equal(put, 120);
  assert.equal(inv.slots[1].item, 'bottle', '物品格不被覆盖');
  assert.equal(inv.slots[0].mass, 100);
  assert.equal(inv.slots[2].mass, 20);
  // place：物品格不能用 place 放置（返回 null，不清格）
  inv.selected = 1;
  assert.equal(inv.place(0.5), null);
  assert.equal(inv.slots[1].item, 'bottle', '物品格不被 place 清掉');
  // selectedItem 读出物品
  assert.equal(inv.selectedItem(), bottle);
  inv.selected = 2;
  assert.equal(inv.selectedItem(), null);
});

// ---- 2. Solution 采样/并液：同比例转移 ----------------------------------------
test('takeSample/addSample：按原比例取液，总量守恒；空溶液返回 null', () => {
  const a = new Solution({ volume: 200, water: 200, solutes: { NaCl: 10 } });
  const s = a.takeSample(20);
  assert.ok(s, '应有样品');
  assert.ok(near(s.water, 20 * (200 / 210), 1e-9), `水按比例：${s.water}`);
  assert.ok(near(s.solutes['NaCl'], 20 * (10 / 210), 1e-9), `NaCl 按比例：${s.solutes['NaCl']}`);
  assert.ok(near(a.totalMass(), 210 - 20, 1e-6), '来源总量减少 20g');
  const b = new Solution({ volume: 200, water: 0 });
  b.addSample(s);
  assert.ok(near(b.water, s.water, 1e-9), '样品水并入');
  assert.ok(near(b.mass('NaCl'), s.solutes['NaCl'], 1e-9), '样品溶质并入');
  assert.equal(new Solution({ volume: 100, water: 0 }).takeSample(5), null, '空溶液无样品');
});

// ---- 3. C 拾取：物品入格（含烧杯子体）、空格才收 ------------------------------
test('C 拾取：最近物品入选中格；烧杯子体一并移出；已占格不拾取', () => {
  const scene = flatScene();
  const p = withPlayer(scene, 330, 630); // 右缘 415，滴管 margin ~10px
  const dr = new Dropper({ x: 425, y: 660 });
  scene.addObject(dr);
  const bk = new Beaker({ x: 500, y: 600, w: 60, h: 70, volume: 200, water: 0, id: 'bk1' });
  scene.addObject(bk);
  run(scene, 2);
  // 空格选中 → 拾取最近（滴管比烧杯近）
  assert.equal(pickupItem(p, scene), true, '应拾取滴管');
  assert.equal(p.inventory.slots[0].item, 'dropper');
  assert.equal(scene.objects.includes(dr), false, '滴管应离开场景');
  // 第二个空格 → 拾取烧杯（子体也移除）
  p.inventory.selected = 1;
  assert.equal(pickupItem(p, scene), true, '应拾取烧杯');
  assert.equal(p.inventory.slots[1].item, 'beaker');
  assert.equal(scene.containers.includes(bk), false, '烧杯应离开容器索引');
  assert.equal(scene.byId['bk1'], undefined, '烧杯 id 应清除');
  assert.equal(scene.byId['bk_l'], undefined, '杯壁子体应一并移出');
  // 已占格（普通物质）不拾取
  p.inventory.slots[2] = { substance: 'CuSO4', mass: 5 };
  p.inventory.selected = 2;
  assert.equal(pickupItem(p, scene), false, '非空格不能拾取');
  // 远处无物品 → false
  p.inventory.selected = 3;
  assert.equal(pickupItem(p, scene), false, '远处无物品');
});

// ---- 4. Shift 放置：烧杯回场景、格子清空 --------------------------------------
test('Shift 放置：烧杯放回玩家身旁（世界内、子体注册）；格子清空', () => {
  const scene = flatScene();
  const p = withPlayer(scene, 400, 630);
  const bk = new Beaker({ x: 500, y: 600, w: 60, h: 70, volume: 200, water: 0 });
  scene.addObject(bk);
  run(scene, 2);
  p.inventory.selected = 0;
  assert.equal(pickupItem(p, scene), true, '先拾取');
  assert.equal(placeCarriedItem(p, scene), true, '放置成功');
  assert.equal(p.inventory.selectedSlot(), null, '格子应清空');
  assert.ok(scene.objects.includes(bk) && scene.containers.includes(bk), '烧杯回到场景');
  assert.ok(near(bk.x, p.x + p.w + 6, 0.001), `应放在玩家右侧：${bk.x} vs ${p.x + p.w + 6}`);
  assert.ok(bk.bottom <= p.bottom + 3, `底边应贴脚底：${bk.bottom}`);
  // 空手放置 → false
  assert.equal(placeCarriedItem(p, scene), false, '无物品不能放置');
});

// ---- 5. C 吸液：烧杯 20g/次（比例混合）；滴管 5g（占优溶质，空管才能装） -------
test('C 吸液：烧杯按比例吸 20g 可混合；满杯拒绝；总量守恒', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: { NaCl: 10 } });
  scene.addObject(pool);
  const p = withPlayer(scene, 250, 640); // 缘距池 0（贴边）
  const bk = new Beaker({ x: 180, y: 600, w: 60, h: 70, volume: 200, water: 0 });
  scene.addObject(bk);
  run(scene, 2);
  p.inventory.selected = 0;
  pickupItem(p, scene);
  const bko = p.inventory.selectedItem();
  // 第一次吸 20g
  assert.equal(drawLiquid(p, scene), true, '应能吸液');
  assert.ok(near(bko.solution.totalMass(), 20, 1e-6), `杯中应有 20g：${bko.solution.totalMass()}`);
  assert.ok(near(pool.solution.totalMass(), 210 - 20, 1e-6), '池中减少 20g');
  // 第二次吸 20g（混合）
  assert.equal(drawLiquid(p, scene), true, '未满可继续吸');
  assert.ok(near(bko.solution.totalMass(), 40, 1e-6), '两杯样品混合：40g');
  assert.ok(bko.solution.mass('NaCl') > 0.5, `NaCl 入杯：${bko.solution.mass('NaCl').toFixed(2)}`);
  // 灌满：体积 200 → 还需 160g → 8 次
  for (let i = 0; i < 7; i++) drawLiquid(p, scene);
  assert.ok(near(bko.solution.totalMass(), 180, 1e-6), `应到 180g：${bko.solution.totalMass()}`);
  assert.equal(drawLiquid(p, scene), true, '最后一次 20g 到满');
  assert.ok(near(bko.solution.totalMass(), 200, 1e-6), `满杯 200g：${bko.solution.totalMass()}`);
  assert.equal(drawLiquid(p, scene), false, '满杯不能再吸');
  assert.ok(near(pool.solution.totalMass() + 200, 210, 1e-6), '总量守恒');
});

test('C 吸液：滴管 5g 占优溶质（纯水=H2O）；同种液体可续吸，换液体拒绝', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: { NaCl: 10 } });
  scene.addObject(pool);
  const p = withPlayer(scene, 250, 640);
  const dr = new Dropper({ x: 345, y: 660, capacity: 50, liquid: 0 }); // 空滴管（池左壁内侧，唯一物品）
  scene.addObject(dr);
  run(scene, 2);
  p.inventory.selected = 0;
  pickupItem(p, scene);
  const dro = p.inventory.selectedItem();
  assert.equal(drawLiquid(p, scene), true, '空管可吸');
  assert.equal(dro.substance, 'NaCl', '占优溶质 = 管内物质');
  assert.ok(near(dro.liquid, 5, 1e-6), '5g 入管');
  assert.ok(near(pool.solution.mass('NaCl'), 5, 1e-6), '池中 NaCl 剩 5g');
  // 同种液体（池里还是 NaCl）→ 续吸成功
  assert.equal(drawLiquid(p, scene), true, '同种液体可续吸');
  assert.ok(near(dro.liquid, 10, 1e-6), `管内累积到 10g：${dro.liquid}`);
  assert.ok(near(pool.solution.mass('NaCl'), 0, 1e-6), '池中 NaCl 耗尽');
  // 池里 NaCl 没了 → 占优变 H2O ≠ 管内 NaCl → 拒绝（不能装别的液体）
  assert.equal(drawLiquid(p, scene), false, '换成别的液体不能续吸');
  // 放回池上方滴掉 → 10g 全回池（0.5g/滴 × 20 滴）
  dro.x = 425; dro.y = 640;
  for (let i = 0; i < 25 && dro.liquid > 1e-9; i++) assert.equal(dro.onTap(scene), true, '滴出');
  assert.ok(dro.liquid < 1e-9, '滴空');
  assert.ok(near(pool.solution.mass('NaCl'), 10, 1e-6), '10g 全部滴回池（NaCl 10g）');
  assert.equal(drawLiquid(p, scene), true, '空管可再吸');
  assert.equal(dro.substance, 'NaCl');
  assert.ok(near(dro.liquid, 5, 1e-6));
  // 纯水池 → H2O；同液也可续吸
  const pool2 = new Pool({ x: 700, y: 660, w: 200, h: 60, volume: 200, solutes: {} });
  scene.addObject(pool2);
  const dro2 = new Dropper({ x: 780, y: 700, capacity: 50, liquid: 0 });
  scene.addObject(dro2);
  run(scene, 2);
  p.x = 740; // 站到 pool2 边上
  p.inventory.selected = 1;
  pickupItem(p, scene);
  const dro3 = p.inventory.selectedItem();
  assert.equal(drawLiquid(p, scene), true);
  assert.equal(dro3.substance, 'H2O', '纯水 → 滴管装 H2O');
  assert.ok(near(dro3.liquid, 5, 1e-6));
  assert.equal(drawLiquid(p, scene), true, '纯水同样可续吸');
  assert.ok(near(dro3.liquid, 10, 1e-6));
});

// ---- 5b. 滴管容量上限：同一液体反复吸直到封顶 --------------------------------
test('C 吸液：滴管同液反复吸至容量上限后拒绝', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: { NaCl: 30 } });
  scene.addObject(pool);
  const p = withPlayer(scene, 250, 640);
  const dr = new Dropper({ x: 345, y: 700, capacity: 8, liquid: 0 });
  scene.addObject(dr);
  run(scene, 2);
  p.inventory.selected = 0;
  pickupItem(p, scene);
  const dro = p.inventory.selectedItem();
  assert.equal(drawLiquid(p, scene), true); // 5g
  assert.equal(drawLiquid(p, scene), true); // 再 3g 到容量 8g
  assert.ok(near(dro.liquid, 8, 1e-6), `满管 8g：${dro.liquid}`);
  assert.equal(drawLiquid(p, scene), false, '满管不能再吸');
});

// ---- 6. X 倒出：每次 10g 分次倒入最近容器；目标容量限制；满杯回退 -------------
test('X 倒出：每次倒 10g（分次）；目标有余量则按其剩余空间；无容器不能倒', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: { NaCl: 10 } });
  scene.addObject(pool);
  const p = withPlayer(scene, 250, 640);
  const bk = new Beaker({ x: 180, y: 600, w: 60, h: 70, volume: 200, water: 0 });
  scene.addObject(bk);
  run(scene, 2);
  p.inventory.selected = 0;
  pickupItem(p, scene);
  const bko = p.inventory.selectedItem();
  drawLiquid(p, scene); // 20g 入杯
  assert.equal(pourBeaker(p, scene), true, '第一次倒出');
  assert.ok(near(bko.solution.totalMass(), 10, 1e-6), `每次只倒 10g，杯剩 10g：${bko.solution.totalMass()}`);
  assert.ok(near(pool.solution.totalMass(), 200, 1e-6), '池收 10g');
  assert.equal(pourBeaker(p, scene), true, '第二次倒出');
  assert.ok(near(bko.solution.totalMass(), 0, 1e-9), '再按一次倒完剩余 10g');
  assert.ok(near(pool.solution.totalMass(), 210, 1e-6), '池恢复 210g');
  assert.equal(pourBeaker(p, scene), false, '空杯不能倒');
  // 半满的烧杯（留 10g 空间）最近 → 只进得去 10g
  const bk2 = new Beaker({ x: 600, y: 600, w: 60, h: 70, volume: 200, water: 190 });
  scene.addObject(bk2);
  run(scene, 2);
  drawLiquid(p, scene); // bko 又 20g
  p.x = 580; // 站到 bk2 旁（比池近）
  assert.equal(pourBeaker(p, scene), true, '倒入 bk2 成功');
  assert.ok(near(bk2.solution.totalMass(), 200, 1e-6), `bk2 灌满：${bk2.solution.totalMass()}`);
  assert.ok(near(bko.solution.totalMass(), 10, 1e-6), `bko 剩 10g：${bko.solution.totalMass()}`);
  // bk2 满杯 → 回退到池（最近的可接收容器）
  assert.equal(pourBeaker(p, scene), true, '满杯回退到池');
  assert.ok(near(bko.solution.totalMass(), 0, 1e-9), 'bko 倒完进池');
  assert.ok(near(pool.solution.totalMass(), 200, 1e-6), '池再收 10g');
  // 周围无容器 → false（先装 20g 再离开）
  p.x = 250;
  assert.equal(drawLiquid(p, scene), true, '装回 20g');
  assert.ok(near(bko.solution.totalMass(), 20, 1e-6));
  p.x = 940; // 远离所有容器
  assert.equal(pourBeaker(p, scene), false, '无容器不能倒');
});

// ---- 7. 集气截留：onGas 返回捕获量；引擎按捕获量扣减大气 ----------------------
test('集气：onGas 截留优先级（最近气泡柱）；引擎按捕获量扣减大气', () => {
  const scene = flatScene();
  const p = withPlayer(scene, 250, 640);
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200 });
  scene.addObject(pool);
  const bottle = new GasBottle({ x: 0, y: 0, capacity: 5 });
  p.inventory.slots[0] = { item: 'bottle', obj: bottle };
  p.inventory.selected = 0;
  run(scene, 2);
  // 构造产气上下文（模拟反应点在池中）
  scene._emitCtx = { obj: null, container: pool, player: p, point: { x: 430, y: 700 }, spread: 20 };
  scene._gasHold = bottle; // 玩家按住 C
  const captured = scene.onGas('CO2', 1.0, null);
  assert.ok(near(captured, 1.0, 1e-9), `应全部捕获：${captured}`);
  assert.ok(near(bottle.totalGas(), 1.0, 1e-9), `瓶内 1g：${bottle.totalGas()}`);
  assert.equal(bottle.dominantGas()[0], 'CO2');
  // 玩家离气泡柱远 → 不捕获
  p.x = 0;
  scene._gasHold = bottle;
  const cap2 = scene.onGas('H2', 1.0, null);
  assert.ok(near(cap2, 0, 1e-9), '玩家太远不应捕获');
  assert.ok(near(bottle.totalGas(), 1.0, 1e-9), '瓶内不变');
  // 引擎：onGas 返回 0.4 → 大气只收 0.6
  const eng = new ChemistryEngine();
  const atm = new Atmosphere();
  const env = { atmosphere: atm, onGas: () => 0.4, emit: () => {}, onReaction: () => {} };
  eng._emitGas('CO2', 1.0, { env, inContainer: false, dt: TICK, lastRxText: null });
  assert.ok(near(atm.mass('CO2'), 0.6, 1e-9), `大气只收 0.6：${atm.mass('CO2')}`);
  // onGas 无返回 → 全部放大气（旧行为）
  const atm2 = new Atmosphere();
  const env2 = { atmosphere: atm2, emit: () => {} };
  eng._emitGas('H2', 2, { env: env2, inContainer: false, dt: TICK, lastRxText: null });
  assert.ok(near(atm2.mass('H2'), 2, 1e-9), '无截留钩子 → 全放大气');
});

// ---- 8. 集气集成：铜绿+盐酸产 CO2，按住 C 收集进瓶，大气不涨 -----------------
test('集气集成：按住 C 收集反应产气；大气不再接收该气体', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { HCl: 30 } });
  scene.addObject(pool);
  scene.addObject(new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Cu2(OH)2CO3' }));
  const p = withPlayer(scene, 215, 700); // 池左边缘（右缘≈300，不浸入池液）
  const bottle = new GasBottle({ x: 0, y: 0 });
  p.inventory.slots[0] = { item: 'bottle', obj: bottle };
  p.inventory.selected = 0;
  scene.status = 'running';
  scene.control.add('grab'); // 按住 C
  run(scene, 600);
  const co2 = bottle.gases.get('CO2') ?? 0;
  assert.ok(co2 > 0.1, `瓶内应捕获 CO2：${co2}`);
  assert.ok(scene.atmosphere.mass('CO2') < 0.05, `大气 CO2 应几乎为零（被截留）：${scene.atmosphere.mass('CO2').toFixed(3)}`);
});

// ---- 9. 通气：石灰水鼓泡 CO2 → CaCO3↓ ----------------------------------------
test('按住 X 通气：集气瓶 CO2 → 石灰水 → CaCO3 沉淀（0.05g/s，瓶空停）', () => {
  const scene = flatScene();
  // 石灰水：Ca(OH)2 2g（200ml 饱和线 2.4g——低于饱和，不自行析出）
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: { 'Ca(OH)2': 2 } });
  scene.addObject(pool);
  const p = withPlayer(scene, 200, 640); // 贴池边（右缘 285-300，不浸入）
  const bottle = new GasBottle({ x: 0, y: 0, gases: { CO2: 0.3 } });
  p.inventory.slots[0] = { item: 'bottle', obj: bottle };
  p.inventory.selected = 0;
  scene.status = 'running';
  scene.control.add('use'); // 按住 X
  run(scene, 300); // 10s → 0.5g 注气额 > 瓶内 0.3g
  assert.ok(bottle.totalGas() < 1e-6, `瓶内气体应通完：${bottle.totalGas()}`);
  const prec = pool.precipitates.get('CaCO3') ?? 0;
  assert.ok(prec > 0.3, `石灰水应变浑（CaCO3 沉淀）：${prec.toFixed(2)}g`);
});

// ---- 10. 拖动滴管 -------------------------------------------------------------
test('拖动滴管：玻璃段按住移动=拖动（不滴）；单击胶头=滴一滴；玻璃段单击不滴', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const beaker = new Beaker({ x: 400, y: 660, w: 60, h: 60, volume: 150 });
  scene.addObject(beaker);
  const dr = new Dropper({ x: 425, y: 640, substance: 'HCl', capacity: 50, drop: 1 });
  scene.addObject(dr);
  const p = withPlayer(scene, 400, 630);
  const canvas = { width: 1000, height: 800 };
  run(scene, 2);
  // 屏幕坐标：直接复用相机的窗口偏移（世界 → 屏幕）
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const toScreen = (wx, wy) => ({ x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY });
  // 玻璃段（管中部）按下 → 拖动候选（永不转滴）
  let s = toScreen(dr.x + dr.w / 2, dr.y + dr.h / 2);
  assert.equal(handleScenePressDown(scene, canvas, s.x, s.y), true, '按下命中滴管（候选）');
  assert.equal(scene._pressCand.mode, 'drag', '玻璃段应是拖动候选（不滴）');
  // 移动 >6px → 拖动
  handleScenePressMove(scene, canvas, s.x + 40, s.y + 20);
  assert.ok(scene._drag, '应开始拖动');
  assert.ok(near(dr.x, 425 + 40, 0.5), `滴管应随拖动移 40px：${dr.x}`);
  handleScenePressUp(scene, canvas);
  assert.equal(scene._drag, null, '拖动结束');
  assert.ok(near(beaker.solution.mass('HCl'), 0, 1e-9), '拖动不应滴液');
  // 移回烧杯上方 → 单击**红色胶头**（y+6）→ 滴一滴
  dr.x = 425; dr.y = 640;
  s = toScreen(dr.x + dr.w / 2, dr.y + 6);
  assert.equal(handleScenePressDown(scene, canvas, s.x, s.y), true, '胶头按下（候选）');
  handleScenePressUp(scene, canvas);
  assert.ok(near(beaker.solution.mass('HCl'), 1, 1e-9), '单击胶头应滴一滴');
  // 玻璃段快速单击：不滴（滴加只认胶头）
  const b2 = beaker.solution.mass('HCl');
  s = toScreen(dr.x + dr.w / 2, dr.y + dr.h / 2);
  assert.equal(handleScenePressDown(scene, canvas, s.x, s.y), true, '玻璃段按下（候选）');
  handleScenePressUp(scene, canvas);
  assert.ok(near(beaker.solution.mass('HCl'), b2, 1e-9), '玻璃段单击不滴');
});

test('拖动滴管：玩家远离时玻璃段无响应；胶头单击=滴一滴、长按(>0.5s)=持续滴', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const beaker = new Beaker({ x: 400, y: 660, w: 60, h: 60, volume: 150 });
  scene.addObject(beaker);
  const dr = new Dropper({ x: 425, y: 604, substance: 'HCl', capacity: 50, drop: 1 }); // 底 656 在杯口上方（不浸入液面 665）
  scene.addObject(dr);
  const p = withPlayer(scene, -160, 630); // 玩家远超 dragRange+slack（>494px）
  const canvas = { width: 1000, height: 800 };
  run(scene, 2);
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const toScreen = (wx, wy) => ({ x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY });
  // 玻璃段 + 玩家太远 → 不进入候选、不滴
  let s = toScreen(dr.x + dr.w / 2, dr.y + dr.h / 2);
  assert.equal(handleScenePressDown(scene, canvas, s.x, s.y), false, '远处玻璃段无响应（不滴不拖）');
  assert.equal(scene._pressCand, null, '无候选');
  assert.ok(near(beaker.solution.mass('HCl'), 0, 1e-9), '没有误滴');
  // 胶头（任意距离）快速单击 → 滴一滴
  s = toScreen(dr.x + dr.w / 2, dr.y + 6);
  assert.equal(handleScenePressDown(scene, canvas, s.x, s.y), true, '胶头按下（候选）');
  handleScenePressUp(scene, canvas);
  assert.ok(near(beaker.solution.mass('HCl'), 1, 1e-9), '单击胶头滴一滴');
  // 胶头长按 ≥0.5s（15 tick）→ 觉醒开始持续滴
  handleScenePressDown(scene, canvas, s.x, s.y);
  run(scene, 30); // 0.5s 觉醒 + ~0.5s 节奏 → 至少 5 滴
  assert.ok(beaker.solution.mass('HCl') >= 5, `长按应持续滴：${beaker.solution.mass('HCl')}`);
  handleScenePressUp(scene, canvas);
  const before = beaker.solution.mass('HCl');
  run(scene, 10);
  assert.ok(near(beaker.solution.mass('HCl'), before, 1e-9), '松开停');
});

// ---- 12. 拖动与长按冲突修复 ----------------------------------------------------
test('拖动窗口：按住未到 dripArmDelay 就移动 → 直接拖动，不先滴', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const beaker = new Beaker({ x: 400, y: 660, w: 60, h: 60, volume: 150 });
  scene.addObject(beaker);
  const dr = new Dropper({ x: 425, y: 640, substance: 'HCl', capacity: 50, drop: 1 });
  scene.addObject(dr);
  const p = withPlayer(scene, 400, 630);
  const canvas = { width: 1000, height: 800 };
  run(scene, 2);
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const toScreen = (wx, wy) => ({ x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY });
  const s = toScreen(dr.x + dr.w / 2, dr.y + dr.h / 2);
  handleScenePressDown(scene, canvas, s.x, s.y);
  run(scene, 4); // ~0.13s < 0.22s：还在候选期
  assert.ok(scene._pressCand, '仍在候选（未转长按）');
  handleScenePressMove(scene, canvas, s.x + 30, s.y + 10);
  assert.ok(scene._drag && !scene._pressTap, '应转拖动且从未开滴');
  handleScenePressUp(scene, canvas);
  assert.ok(near(beaker.solution.mass('HCl'), 0, 1e-9), '全程一滴未滴');
});

test('抢断：长按胶头已开滴后再拖动 → 停滴转为拖动', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const beaker = new Beaker({ x: 400, y: 660, w: 60, h: 60, volume: 150 });
  scene.addObject(beaker);
  const dr = new Dropper({ x: 425, y: 604, substance: 'HCl', capacity: 50, drop: 1 }); // 底 656 在杯口上方（不浸入液面 665）
  scene.addObject(dr);
  const p = withPlayer(scene, 400, 630);
  const canvas = { width: 1000, height: 800 };
  run(scene, 2);
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const toScreen = (wx, wy) => ({ x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY });
  // 胶头长按 18 tick（0.6s > 0.5s 觉醒）→ 先滴了一笔
  const s = toScreen(dr.x + dr.w / 2, dr.y + 6);
  handleScenePressDown(scene, canvas, s.x, s.y);
  run(scene, 18);
  assert.equal(scene._pressTap, dr, '长按应已开始');
  const dropped = beaker.solution.mass('HCl');
  assert.ok(dropped >= 1, `开滴应已滴出至少一笔：${dropped}`);
  // 继续按住但拖出 40px → 停滴、转拖动
  handleScenePressMove(scene, canvas, s.x + 40, s.y + 15);
  assert.equal(scene._pressTap, null, '按住滴加应被停掉');
  assert.ok(scene._drag, '应进入拖动');
  // 移开玩家：隔离 NaOH 玩家浸酸的中和反应（此处只验证滴加管线已停）
  p.x = 60;
  run(scene, 2);
  const before = beaker.solution.mass('HCl');
  run(scene, 10); // 继续按住 10 tick：不应再滴
  assert.ok(near(beaker.solution.mass('HCl'), before, 1e-9), '拖动期间不再滴液');
  handleScenePressUp(scene, canvas);
  assert.equal(scene._drag, null);
});

// ---- 13. 集气瓶物理：碰撞箱/落地/可推动/进不去 ---------------------------------
test('集气瓶实体化：子体壁落地、玩家贴壁推动整瓶且无法进入瓶内', () => {
  const scene = flatScene();
  const bottle = new GasBottle({ x: 420, y: 720 - 56, id: 'bottleA' }); // 底边贴地
  scene.addObject(bottle);
  run(scene, 30); // 落定
  // 子体注册齐全（左/右/底/盖板）
  for (const suf of ['_l', '_r', '_b', '_lid']) {
    const sb = scene.byId[`bottleA_gb${suf}`];
    assert.ok(sb, `子体 ${suf} 应在场景中`);
    assert.equal(sb.solid, true, `${suf} 应是实心体`);
  }
  assert.ok(Math.abs(bottle.bottom - 720) < 2, `应落在地面：${bottle.bottom}`);
  const lid = scene.byId['bottleA_gb_lid'];
  assert.ok(lid.y < bottle.y + 4, '盖板应在瓶口上方');
  // 玩家从左侧走向瓶子：贴外壁推动整瓶，但不能进瓶内
  const p = withPlayer(scene, 320, 630);
  run(scene, 5);
  scene.control.add('right');
  run(scene, 70);
  scene.control.delete('right');
  assert.ok(bottle.x > 420 + 3, `贴壁行走应推动整瓶：${bottle.x.toFixed(1)}`);
  assert.ok(p.right <= bottle.x + bottle.wall + 1, `玩家应被挡在瓶外：p.right=${p.right} bottle.x=${bottle.x}`);
});

// ============================================================================
// 体验打磨第二批：倒液方向/停留、放置找空位、拖动超距钳制、胶头液下吸取
// ============================================================================

const overlap2 = (a, b, m = 1) => a.x + a.w > b.x + m && a.x < b.x + b.w - m
  && a.y + a.h > b.y + m && a.y < b.y + b.h - m;

test('Shift 放置第二件物品自动找空位：不与已放置的装置重叠', () => {
  const scene = flatScene();
  const p = withPlayer(scene, 400, 630);
  const bk = new Beaker({ x: 430, y: 620, w: 60, h: 70, volume: 200, water: 0 });
  scene.addObject(bk);
  const bt = new GasBottle({ x: 520, y: 660 });
  scene.addObject(bt);
  run(scene, 30);
  p.inventory.selected = 0;
  pickupItem(p, scene);
  assert.equal(placeCarriedItem(p, scene), true); // 放在玩家右侧 → 会落在烧杯原先附近（此处没别的实体）
  // 再拾起集气瓶放置：第一落点若被占则应挪到别处，两者不得重叠
  p.inventory.selected = 1;
  pickupItem(p, scene);
  if (placeCarriedItem(p, scene)) {
    const placed = p.inventory.selectedSlot()?.obj ?? null; // 已清格；从场景找瓶子
    const bottle = scene.objects.find((o) => o.isCarryItem === 'bottle');
    const beaker = scene.containers.find((c) => c.isCarryItem === 'beaker');
    if (bottle && beaker) {
      assert.ok(!overlap2(bottle, beaker), `两件物品不得重叠：bt(${bottle.x.toFixed(0)},${bottle.y.toFixed(0)}) bk(${beaker.x.toFixed(0)},${beaker.y.toFixed(0)})`);
    }
  }
});

test('拖动滴管不能超出玩家范围：越界贴边走并弹提示', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const dr = new Dropper({ x: 425, y: 640, substance: 'HCl', capacity: 50, drop: 1 });
  scene.addObject(dr);
  const p = withPlayer(scene, 400, 630);
  const canvas = { width: 1000, height: 800 };
  run(scene, 2);
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const toScreen = (wx, wy) => ({ x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY });
  // 按住玻璃段（管中下部，避开胶头区）
  const s = toScreen(dr.x + dr.w / 2, dr.y + dr.h - 6);
  handleScenePressDown(scene, canvas, s.x, s.y);
  handleScenePressMove(scene, canvas, s.x + 500, s.y + 200); // 试图拖出很远
  const pcx = p.x + p.w / 2;
  const pcy = p.y + p.h / 2;
  const dCenter = Math.hypot(dr.x + dr.w / 2 - pcx, dr.y + dr.h / 2 - pcy);
  assert.ok(dCenter <= CFG.item.dragRange + 1,
    `拖动应被钳制在 dragRange 内：${dCenter.toFixed(1)} > ${CFG.item.dragRange}`);
  assert.ok(scene._notice && /太远/.test(scene._notice.text), `应有超距提示：${scene._notice?.text}`);
  handleScenePressUp(scene, canvas);
});

test('液下吸取：长按胶头吸一手；同液续吸；不同液拒绝', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: { NaCl: 10 } });
  scene.addObject(pool);
  const p = withPlayer(scene, 250, 600);
  // 空滴管尖端浸入池内液面下（innerRect y=660，真实液面=660；bottom=674 已浸入）
  const dr = new Dropper({ x: 430, y: 622, capacity: 50, liquid: 0 }); // bottom=674 > 660 ✓
  scene.addObject(dr);
  run(scene, 2);
  const canvas = { width: 1000, height: 800 };
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const toScreen = (wx, wy) => ({ x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY });
  const bs = toScreen(dr.x + dr.w / 2, dr.y + 6); // 胶头区中心
  // 长按 ≥0.5s（16 tick）→ 觉醒即吸一手（不用等松开；按住继续每 0.3s 吸一手）
  handleScenePressDown(scene, canvas, bs.x, bs.y);
  run(scene, 16);
  assert.ok(near(dr.liquid, 5, 1e-6), `长按觉醒应吸 5g：${dr.liquid}`);
  assert.equal(dr.substance, 'NaCl');
  assert.ok(near(pool.solution.mass('NaCl'), 5, 1e-6), '池中 NaCl 转入管内');
  // 同液续吸：继续按住 1s（30 tick，0.3s/手）→ 5+5=10g（池中 NaCl 只剩 5g，第二手吸空）
  run(scene, 30);
  assert.ok(near(dr.liquid, 10, 1e-6), `同液应续吸到 10g：${dr.liquid}`);
  assert.ok(pool.solution.mass('NaCl') < 1e-6, '池中 NaCl 已吸空');
  handleScenePressUp(scene, canvas);
  // 换液拒绝：管里是 HCl（别的液体），长按液下 → 拒绝并提示
  scene.removeItem(dr);
  const dr2 = new Dropper({ x: 430, y: 622, capacity: 50, substance: 'HCl', liquid: 10, drop: 1 });
  scene.addObject(dr2);
  run(scene, 2);
  const bs2 = toScreen(dr2.x + dr2.w / 2, dr2.y + 6);
  handleScenePressDown(scene, canvas, bs2.x, bs2.y);
  run(scene, 16);
  handleScenePressUp(scene, canvas);
  assert.ok(near(dr2.liquid, 10, 1e-9), '管里是别的液体：不能再吸');
  assert.ok(scene._notice && /别的液体/.test(scene._notice.text), `应提示不能混吸：${scene._notice?.text}`);
});

test('玻璃段按住不滴不吸；胶头按住+移动=拖动', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: { NaCl: 4 } });
  scene.addObject(pool);
  withPlayer(scene, 250, 600);
  const dr = new Dropper({ x: 340, y: 590, substance: 'HCl', capacity: 50, liquid: 10, drop: 1 });
  scene.addObject(dr);
  run(scene, 2);
  const canvas = { width: 1000, height: 800 };
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const toScreen = (wx, wy) => ({ x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY });
  // 玻璃段（管中部，尖端 642 未到液面 660）：按住 1s 抬起 → 什么都不发生（不滴不吸）
  const ts = toScreen(dr.x + dr.w / 2, dr.y + 30);
  handleScenePressDown(scene, canvas, ts.x, ts.y);
  run(scene, 30);
  handleScenePressUp(scene, canvas);
  assert.ok(near(pool.solution.totalMass(), 204, 1e-6), '池内总量不变（未滴未吸）');
  assert.ok(near(dr.liquid, 10, 1e-9), '管内液体不变');
  // 胶头按住 + 移动 → 拖动（不滴不吸）
  const bs = toScreen(dr.x + dr.w / 2, dr.y + 6);
  handleScenePressDown(scene, canvas, bs.x, bs.y);
  handleScenePressMove(scene, canvas, bs.x + 30, bs.y + 10);
  assert.ok(scene._drag, '胶头按住+移动应转拖动');
  assert.ok(near(dr.x, 340 + 30, 0.5), `滴管应随拖动移动：${dr.x}`);
  handleScenePressUp(scene, canvas);
  assert.ok(near(dr.liquid, 10, 1e-9), '拖动期间未滴未吸');
  assert.ok(near(pool.solution.totalMass(), 204, 1e-6), '池内总量不变');
});

test('倒液会话方向/站位：目标在右侧时杯停在其左侧并保持站立', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 700, y: 660, w: 240, h: 60, volume: 200 });
  scene.addObject(pool);
  const p = withPlayer(scene, 400, 640);
  const bk = new Beaker({ x: 380, y: 620, w: 60, h: 70, volume: 200, water: 40 });
  scene.addObject(bk);
  run(scene, 2);
  p.inventory.selected = 0;
  pickupItem(p, scene);
  const bko = p.inventory.selectedItem(); // 保持携带状态执行倒出（真实操作流）
  p.x = 660; // 挪到池边（保证在倒出距离内）
  assert.equal(pourBeaker(p, scene), true, '倒出应成功');
  // 会话挂在杯子对象上；放回世界只为核对站位参数
  scene.addItem(bko);
  assert.ok(bko._pour, '应进入倒出会话');
  assert.equal(bko._pour.dir, 1, '目标在右 → 站位/倾角朝右');
  assert.ok(bko._pour.standX <= pool.x, `应平移到目标左侧停靠：standX=${bko._pour.standX} pool.x=${pool.x}`);
});

// ---- 14. noCarry 锁定物品（编辑器可配置：不可拾取/携带） --------------------
test('noCarry 锁定：滴管/烧杯不可拾取（其它正常物品仍可拾取）', () => {
  const scene = flatScene();
  const p = withPlayer(scene, 330, 630);
  const drFixed = new Dropper({ x: 360, y: 620, capacity: 50, noCarry: true, id: 'drFix' });
  scene.addObject(drFixed);
  const drLoose = new Dropper({ x: 450, y: 620, capacity: 50, liquid: 0, id: 'drLoose' });
  scene.addObject(drLoose);
  run(scene, 2);
  // 锁定滴管更近也不被拾取——拾取应落到正常滴管
  p.inventory.selected = 0;
  assert.equal(pickupItem(p, scene), true, '应拾取正常滴管');
  assert.equal(p.inventory.slots[0].obj, drLoose, '拾取的是未锁定的一支');
  // 锁定物仍在场景中
  assert.ok(scene.objects.includes(drFixed), '锁定滴管应留在场景');
  // 只留锁定物：不再拾取
  p.inventory.selected = 1;
  assert.equal(pickupItem(p, scene), false, '锁定物品不可拾取');
  // 烧杯锁定同样生效
  const bkFixed = new Beaker({ x: 400, y: 600, w: 60, h: 70, volume: 200, water: 0, noCarry: true, id: 'bkFix' });
  scene.addObject(bkFixed);
  run(scene, 2);
  assert.equal(pickupItem(p, scene), false, '锁定烧杯不可拾取');
  assert.ok(scene.containers.includes(bkFixed), '锁定烧杯留在场景');
});

test('noCarry 锁定的集气瓶：不可拾取且仍可放气（固定装置）', () => {
  const scene = flatScene();
  const p = withPlayer(scene, 330, 630);
  const gb = new GasBottle({ x: 360, y: 600, noCarry: true, id: 'gbFix', gases: { CO2: 2 } });
  scene.addObject(gb);
  run(scene, 2);
  p.inventory.selected = 0;
  assert.equal(pickupItem(p, scene), false, '锁定集气瓶不可拾取');
  // 锁定不影响其它操作（瓶仍可装气）
  const had = gb.totalGas();
  assert.equal(gb.addGas('CO2', 1), 1, '瓶仍可装气');
  assert.ok(gb.totalGas() - had > 0.99);
});

// ---- 15. 集气瓶碰撞箱与视觉对齐（用户反馈：碰撞箱看起来异常偏大） ------------
test('集气瓶碰撞对齐：瓶壁只沿瓶身段（瓶颈区无墙）；盖板贴口', () => {
  const scene = flatScene();
  const gb = new GasBottle({ x: 420, y: 620, id: 'gbA', noCarry: true });
  scene.addObject(gb);
  run(scene, 30); // 落定
  const l = scene.byId['gbA_gb_l'];
  const r = scene.byId['gbA_gb_r'];
  const lid = scene.byId['gbA_gb_lid'];
  // 壁体从瓶口下方 NECK_H(10) 开始（瓶颈区不再有"假墙"）
  assert.ok(Math.abs(l.y - (gb.y + 10)) < 0.01, `左壁应从瓶身段开始：${l.y} vs ${gb.y + 10}`);
  assert.ok(Math.abs(r.y - (gb.y + 10)) < 0.01, '右壁同');
  // 壁到瓶底（沿瓶身全高）
  assert.ok(Math.abs(l.y + l.h - gb.bottom) < 0.01, `壁到瓶底：${l.y + l.h} vs ${gb.bottom}`);
  // 盖板贴住瓶口（底边与瓶口线重叠 1~2px；不悬空）
  assert.ok(lid.y < gb.y && lid.y + lid.h >= gb.y - 1, `盖板应贴住瓶口：lid(${lid.y}..${lid.y + lid.h}) 瓶口=${gb.y}`);
  // 盖板宽度贴近瓶颈（不再宽出一圈悬空沿）
  assert.ok(lid.x >= gb.x + 3 && lid.x + lid.w <= gb.x + gb.w - 3, `盖板应在瓶口范围：${lid.x}..${lid.x + lid.w}`);
});

// ---- 16. 推动平滑性（用户反馈：推动时瓶子震动/玩家一卡一卡） ------------------
test('推瓶/推杯平滑：全程位置单调、无每帧回弹抖动', () => {
  const mk = (kind) => {
    const scene = flatScene();
    const p = withPlayer(scene, 700, 640);
    let obj;
    if (kind === 'bottle') {
      obj = new GasBottle({ x: 500, y: 640, id: 'gbS' });
      scene.addObject(obj);
    } else {
      obj = new Beaker({ x: 500, y: 640, w: 60, h: 70, volume: 200, water: 0, id: 'bkS' });
      scene.addObject(obj);
    }
    run(scene, 30); // 落定（瓶/杯贴地）
    scene.control.add('left');
    const xs = [];
    const ps = [];
    for (let i = 0; i < 120; i++) {
      scene.step(TICK);
      xs.push(obj.x);
      ps.push(p.x);
    }
    scene.control.delete('left');
    return { obj, p, xs, ps };
  };
  for (const kind of ['bottle', 'beaker']) {
    const { obj, xs, ps } = mk(kind);
    const stepX = 220 * TICK; // 玩家速度 220px/s → 单帧最多 ~7.3px
    let moved = 0;
    let backJitter = 0;
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i] - xs[i - 1];
      if (d < -1e-9) backJitter++; // 位置回弹 = 震动
      if (d < 0) moved++;
      // 回弹幅度不应超过半步（解算抖动的特征量）；正常推进 = -7.33/帧
      assert.ok(d >= -stepX * 1.2, `${kind} 帧${i} 回跳过大：${d.toFixed(2)}`);
      assert.ok(d <= 0.01, `${kind} 帧${i} 出现向右回跳：${d.toFixed(2)}`);
    }
    // 玩家也应随瓶平滑推进（位置单调向左）
    for (let i = 1; i < ps.length; i++) {
      assert.ok(ps[i] - ps[i - 1] <= 0.01, `${kind} 玩家帧${i} 回跳：${(ps[i] - ps[i - 1]).toFixed(2)}`);
    }
    assert.ok(moved > 80, `${kind} 应被推出至少 80 帧：${moved}`);
    assert.ok(xs[xs.length - 1] < 495, `${kind} 应整体左移：${xs[0]} → ${xs[xs.length - 1]}`);
  }
});

// ---- 液面真实判定：尖端在"杯沿下但真实液面上"不算浸入（用户反馈核心 bug）----
test('液面判定：尖端在杯沿下、真实液面之上 → 长按=持续滴（不误吸）；液面下 → 吸取', () => {
  const scene = flatScene();
  const beaker = new Beaker({ x: 400, y: 660, w: 60, h: 60, volume: 200, water: 40 }); // 20% 液量
  scene.addObject(beaker);
  withPlayer(scene, 250, 600);
  const canvas = { width: 1000, height: 800 };
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  run(scene, 2);
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const toScreen = (wx, wy) => ({ x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY });
  // 真实液面：innerRect(405,665,50,50)；lh=50×40/200=10 → surface=665+50-10=705
  // A：尖端 692 —— 在杯沿(665)下、真实液面(705)上 → 不算浸入（旧实现误判为浸入！）
  const drA = new Dropper({ x: 425, y: 640, substance: 'HCl', capacity: 50, liquid: 10, drop: 1 }); // tip=692
  scene.addObject(drA);
  run(scene, 2);
  const sA = toScreen(drA.x + drA.w / 2, drA.y + 6);
  handleScenePressDown(scene, canvas, sA.x, sA.y);
  run(scene, 16); // >0.5s 觉醒
  assert.equal(scene._pressTap, drA, '液上长按应转为持续滴');
  assert.ok(near(drA.liquid, 9, 1e-6), `滴加进行中：${drA.liquid}`);
  run(scene, 40); // 持续滴节奏（0.08s/滴）→ 10g 滴完自动停
  assert.ok(drA.liquid < 1e-9, `管应滴空：${drA.liquid}`);
  assert.ok(beaker.solution.mass('HCl') >= 9, `HCl 应滴入杯：${beaker.solution.mass('HCl')}`);
  handleScenePressUp(scene, canvas);
  // B：尖端 712 —— 低于真实液面 705 → 液下吸取（管是空的 → 吸走杯中 HCl + 水不行，
  //    占优成分=水 → 吸 5g 纯水）
  const drB = new Dropper({ x: 425, y: 660, capacity: 50, liquid: 0 }); // tip=712 > 707 ✓
  scene.addObject(drB);
  run(scene, 2);
  const sB = toScreen(drB.x + drB.w / 2, drB.y + 6);
  handleScenePressDown(scene, canvas, sB.x, sB.y);
  run(scene, 16);
  assert.ok(near(drB.liquid, 5, 1e-6), `液下长按应吸取 5g：${drB.liquid}`);
  assert.equal(scene._pressTap, null, '吸取不触发滴液');
  handleScenePressUp(scene, canvas);
});

// ---- 拖动边界回抓（用户反馈：拖到极限再拖回来就抓不住了） --------------------
test('拖动边界回抓：拖到钳制边界松开，还能再次抓住拖回（dragSlack 宽限）', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const dr = new Dropper({ x: 425, y: 640, substance: 'HCl', capacity: 50, drop: 1 });
  scene.addObject(dr);
  const p = withPlayer(scene, 400, 630);
  const canvas = { width: 1000, height: 800 };
  run(scene, 2);
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const toScreen = (wx, wy) => ({ x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY });
  // 第一次：玻璃段按住拖到钳制边界（位置被钳在 dragRange 上）
  let s = toScreen(dr.x + dr.w / 2, dr.y + dr.h / 2);
  handleScenePressDown(scene, canvas, s.x, s.y);
  handleScenePressMove(scene, canvas, s.x + 900, s.y + 500); // 试图拖出极远
  handleScenePressUp(scene, canvas);
  const pcx = p.x + p.w / 2;
  const pcy = p.y + p.h / 2;
  const d0 = Math.hypot(dr.x + dr.w / 2 - pcx, dr.y + dr.h / 2 - pcy);
  assert.ok(d0 <= CFG.item.dragRange + 1, `应在边界：${d0.toFixed(1)}`);
  // 第二次：直接再按当前位置（边界上）→ 仍能抓住并拖回
  s = toScreen(dr.x + dr.w / 2, dr.y + dr.h / 2);
  assert.equal(handleScenePressDown(scene, canvas, s.x, s.y), true, '边界处仍可抓住');
  assert.equal(scene._pressCand.mode, 'drag', '应是拖动候选');
  handleScenePressMove(scene, canvas, s.x - 200, s.y - 100); // 拖回
  const d1 = Math.hypot(dr.x + dr.w / 2 - pcx, dr.y + dr.h / 2 - pcy);
  assert.ok(d1 < d0 - 50, `应能拖回：${d1.toFixed(1)} < ${d0.toFixed(1)}`);
  handleScenePressUp(scene, canvas);
});
