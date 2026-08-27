// ============================================================================
// 可携带物品（集气瓶 / 烧杯 / 滴管）测试
// 覆盖：物品格不堆叠、C 拾取（含烧杯子体/空格限制）、Shift 放置、
//       C 吸液（烧杯比例转移/混合/满杯、滴管占优溶质/空管限制）、
//       X 倒出、按住 C 集气（onGas 截留 + 引擎不放大气）、按住 X 通气
//       （石灰水鼓泡变浑）、拖动滴管点击管线。
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

test('C 吸液：滴管 5g 占优溶质（纯水=H2O）；已装液拒绝', () => {
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
  assert.equal(drawLiquid(p, scene), false, '已装液不能再吸（现实如此）');
  // 放回池上方滴掉 → 空管可再吸（5g ÷ 0.5g/滴 = 10 次）
  dro.x = 425; dro.y = 640;
  for (let i = 0; i < 12 && dro.liquid > 1e-9; i++) assert.equal(dro.onTap(scene), true, '滴出');
  assert.ok(dro.liquid < 1e-9, '滴空');
  assert.ok(near(pool.solution.mass('NaCl'), 10, 1e-6), '5g 全部滴回池（NaCl 10g）');
  assert.equal(drawLiquid(p, scene), true, '空管可再吸');
  assert.equal(dro.substance, 'NaCl');
  assert.ok(near(dro.liquid, 5, 1e-6));
  // 纯水池 → H2O
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
});

// ---- 6. X 倒出：烧杯全部倒入最近容器；目标容量限制；满杯回退 ------------------
test('X 倒出：烧杯液体倒入最近的容器；目标有余量则按其剩余空间；无容器不能倒', () => {
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
  assert.equal(pourBeaker(p, scene), true, '应能倒出（回池）');
  assert.ok(near(bko.solution.totalMass(), 0, 1e-9), '烧杯倒空');
  assert.ok(near(pool.solution.totalMass(), 210, 1e-6), '池恢复 210g');
  // 半满的烧杯（留 10g 空间）最近 → 只倒 10g
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
  assert.ok(near(bko.solution.totalMass(), 0, 1e-9), 'bko 倒空进池');
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
test('拖动滴管：玩家附近按下→移动=拖动位置（不滴）；单击=滴一滴', () => {
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
  let s = toScreen(dr.x + dr.w / 2, dr.y + dr.h / 2);
  assert.equal(handleScenePressDown(scene, canvas, s.x, s.y), true, '按下命中滴管（候选）');
  assert.ok(scene._pressCand, '应进入候选（拖动 vs 点击）');
  // 移动 >6px → 拖动
  handleScenePressMove(scene, canvas, s.x + 40, s.y + 20);
  assert.ok(scene._drag, '应开始拖动');
  assert.ok(near(dr.x, 425 + 40, 0.5), `滴管应随拖动移 40px：${dr.x}`);
  handleScenePressUp(scene, canvas);
  assert.equal(scene._drag, null, '拖动结束');
  assert.ok(near(beaker.solution.mass('HCl'), 0, 1e-9), '拖动不应滴液');
  // 移回烧杯上方 → 单击（原位按下抬起）→ 滴一滴
  dr.x = 425; dr.y = 640;
  s = toScreen(dr.x + dr.w / 2, dr.y + dr.h / 2);
  assert.equal(handleScenePressDown(scene, canvas, s.x, s.y), true);
  handleScenePressUp(scene, canvas);
  assert.ok(near(beaker.solution.mass('HCl'), 1, 1e-9), '单击应滴一滴');
});

test('拖动滴管：玩家远离时按下=立即滴（无拖动候选）；长按仍连续滴', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const beaker = new Beaker({ x: 400, y: 660, w: 60, h: 60, volume: 150 });
  scene.addObject(beaker);
  const dr = new Dropper({ x: 425, y: 640, substance: 'HCl', capacity: 50, drop: 1 });
  scene.addObject(dr);
  const p = withPlayer(scene, 80, 630); // 玩家远离滴管
  const canvas = { width: 1000, height: 800 };
  run(scene, 2);
  const cam = scene.camera.compute(canvas.width, canvas.height, scene.player ?? null);
  const s = {
    x: (dr.x + dr.w / 2) * cam.scale + cam.offsetX,
    y: (dr.y + dr.h / 2) * cam.scale + cam.offsetY,
  };
  assert.equal(handleScenePressDown(scene, canvas, s.x, s.y), true, '命中即滴（无候选）');
  assert.equal(scene._pressCand, null, '远离玩家不进入候选');
  assert.ok(near(beaker.solution.mass('HCl'), 1, 1e-9), '按下即滴一滴');
  // 长按：20 tick 后继续滴（step 里的 stepPressTap 保持旧节奏）
  run(scene, 20);
  assert.ok(beaker.solution.mass('HCl') >= 6, `长按应连续滴：${beaker.solution.mass('HCl')}`);
  handleScenePressUp(scene, canvas);
  const before = beaker.solution.mass('HCl');
  run(scene, 10);
  assert.ok(near(beaker.solution.mass('HCl'), before, 1e-9), '松开停');
});
