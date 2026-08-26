// ============================================================================
// 通关链路物件测试：开关/钥匙/门/灯/绳子/气泡柱/烧杯/从容器收集
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Block } from '../src/objects/block.js';
import { Player } from '../src/objects/player.js';
import { Switch } from '../src/objects/switch.js';
import { Key } from '../src/objects/key.js';
import { Door } from '../src/objects/door.js';
import { Lamp } from '../src/objects/lamp.js';
import { Beaker } from '../src/objects/beaker.js';
import { Rope } from '../src/objects/rope.js';
import { GasColumn } from '../src/objects/gascolumn.js';

const TICK = 1 / 30;

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

function flatScene() {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 700, w: 2000, h: 60 }));
  scene.status = 'running';
  return scene;
}

// ---- 1. 开关：化学开启 / 消耗关闭 -------------------------------------------
test('开关：放入开启物质打开，消耗完自动关闭', () => {
  const scene = flatScene();
  const sw = new Switch({ x: 300, y: 696, w: 40, h: 24, opening: 'Cu(OH)2', consumeRate: 1 });
  scene.addObject(sw);
  let opened = 0;
  let closed = 0;
  sw.on('open', () => opened++);
  sw.on('close', () => closed++);
  sw.addPrecipitate('Cu(OH)2', 10);
  run(scene, 30);
  assert.equal(opened, 1, '放入开启物质应打开一次');
  assert.ok(sw.open);
  run(scene, 400); // 10g ÷ 1g/s = 10s 耗尽
  assert.equal(closed, 1, '耗尽应关闭');
  assert.ok(!sw.open);
  assert.equal(sw.openingMass(), 0);
});

// ---- 2. 压力开关 ---------------------------------------------------------------
test('压力开关：玩家站在实心开关上即开', () => {
  const scene = flatScene();
  const sw = new Switch({ x: 300, y: 696, mode: 'pressure' });
  scene.addObject(sw);
  const p = new Player({ x: 100, y: 540 });
  scene.addObject(p);
  assert.ok(sw.solid, '开关应有碰撞箱');
  // 玩家站到开关顶（开关是实心的，物理上支撑玩家）
  p.x = 300 + 20 - p.w / 2;
  p.y = 696 - p.h;
  p.vel = { x: 0, y: 0 };
  run(scene, 5);
  assert.ok(p.onGround, '玩家应站在开关上');
  assert.ok(sw.open, '玩家站上应触发');

  // 玩家离开 → 关闭
  p.x = 200;
  run(scene, 10);
  assert.ok(!sw.open, '玩家离开后应关闭');
});

// ---- 3. 钥匙 → 门 → 通关 ------------------------------------------------------
test('钥匙放入 Cu(OH)2 → 开门 → 玩家到门口通关', () => {
  const scene = flatScene();
  const key = new Key({ x: 400, y: 696, opening: 'Cu(OH)2' });
  const door = new Door({ x: 900, y: 620, w: 30, h: 80 });
  key.on('open', () => door.open());
  scene.addObject(key);
  scene.addObject(door);
  const p = new Player({ x: 100, y: 540 });
  scene.addObject(p);
  key.addPrecipitate('Cu(OH)2', 5);
  scene.control.add('right');
  run(scene, 500);
  assert.ok(door.isOpen, '门应打开');
  assert.equal(scene.status, 'win', '玩家到门口应通关');
});

// ---- 4. 酒精灯加热触发分解 ----------------------------------------------------
test('酒精灯加热：灯上放置的 Cu(OH)2 分解，CuO 留在灯上', () => {
  const scene = flatScene();
  const lamp = new Lamp({ x: 300, y: 680, w: 40, h: 40, autoOn: true });
  scene.addObject(lamp);
  lamp.addPrecipitate('Cu(OH)2', 5); // 放置到灯上
  run(scene, 400);
  assert.ok((lamp.precipitates.get('Cu(OH)2') ?? 0) < 5, 'Cu(OH)2 应分解');
  assert.ok((lamp.precipitates.get('CuO') ?? 0) > 0, 'CuO 应留在灯上而非掉落');
});

test('灯旁（未在灯上）的物块不被加热分解', () => {
  const scene = flatScene();
  const lamp = new Lamp({ x: 300, y: 680, w: 40, h: 40, autoOn: true });
  scene.addObject(lamp);
  // 物块放在灯旁边，不在灯上
  const cuoh = new Block({ x: 380, y: 660, w: 40, h: 40, substance: 'Cu(OH)2' });
  scene.addObject(cuoh);
  run(scene, 200);
  assert.ok(Math.abs(cuoh.grid.avail('Cu(OH)2') - 6.4) < 1e-9, '灯旁物块不应分解');
});

// ---- 5. 绳子 ------------------------------------------------------------------
test('绳子悬挂物体，锚点消失则断绳', () => {
  const scene = flatScene();
  const block = new Block({ x: 500, y: 100, w: 40, h: 40, substance: 'Fe' });
  const rope = new Rope({ x: 520, y: 0, length: 300, anchor: { fixed: { x: 520, y: 0 } }, hanging: block });
  scene.addObject(rope);
  scene.addObject(block);
  run(scene, 30);
  assert.equal(block.x, 500, '悬挂物体 x 由绳子决定');
  assert.equal(block.y, 260, '顶 = 锚点 y + 长度 - 高');
  assert.ok(!rope.broken);

  // 锚点为物体，物体消失 → 断绳
  const anchorBlock = new Block({ x: 800, y: 0, w: 40, h: 40, substance: 'Fe' });
  const block2 = new Block({ x: 900, y: 100, w: 40, h: 40, substance: 'Fe' });
  const rope2 = new Rope({ x: 820, y: 0, length: 100, anchor: { obj: anchorBlock }, hanging: block2 });
  scene.addObject(anchorBlock);
  scene.addObject(rope2);
  scene.addObject(block2);
  scene.removeObject(anchorBlock);
  run(scene, 5);
  assert.ok(rope2.broken, '锚点消失应断绳');
  assert.equal(block2.gravity, 1, '断绳后恢复重力');
});

// ---- 6. 气泡柱 -----------------------------------------------------------------
test('气泡柱托起物块', () => {
  const scene = flatScene();
  const gas = new GasColumn({ x: 300, y: 300, w: 100, h: 400, accel: 1300, maxSpeed: 260 });
  scene.addObject(gas);
  const block = new Block({ x: 340, y: 550, w: 40, h: 40, substance: 'Fe' });
  scene.addObject(block);
  run(scene, 30);
  assert.ok(block.y < 550, `物块应被托起，y=${block.y}`);
});

// ---- 7. 烧杯携带/跳出 ---------------------------------------------------------
test('烧杯：玩家在杯内带动其移动', () => {
  const scene = flatScene();
  const beaker = new Beaker({ x: 400, y: 620, w: 260, h: 80 });
  scene.addObject(beaker);
  const p = new Player({ x: 480, y: 400 });
  scene.addObject(p);
  run(scene, 40); // 先让玩家落入杯内（杯壁实心，不能从侧面走入）
  assert.ok(beaker.containsObj(p), '玩家应落入杯内');
  const bx0 = beaker.x;
  scene.control.add('right');
  run(scene, 40);
  assert.ok(beaker.x > bx0, `烧杯应被带动，x=${beaker.x}`);
});

// ---- 8. onOpen 快捷 API 与显式 id 注册 ---------------------------------------
test('onOpen 快捷方法 + 显式 id 进入 byId', () => {
  const scene = flatScene();
  const key = new Key({ x: 400, y: 696, opening: 'Cu(OH)2', id: 'k' });
  const door = new Door({ x: 900, y: 620, id: 'd' });
  scene.addObject(key);
  scene.addObject(door);
  assert.equal(scene.byId['k'], key, 'key 应按 id 注册');
  assert.equal(scene.byId['d'], door, 'door 应按 id 注册');
  let fired = 0;
  key.onOpen(() => { door.open(); fired++; });
  key.addPrecipitate('Cu(OH)2', 3);
  scene.step(TICK);
  assert.equal(fired, 1, 'onOpen 应触发');
  assert.ok(door.isOpen);
});

// ---- 9. 快速移动中反应不产生散落格子 ----------------------------------------
test('快速移动中反应：侵蚀随当前位置，格子保持连通', () => {
  // 复现：跳到池里并持续快速水平移动
  const scene = new Scene();
  scene.addObject(new Floor({ x: 0, y: 720, w: 400, h: 80 }));
  scene.addObject(new Floor({ x: 700, y: 720, w: 400, h: 80 }));
  const pool = new Pool({ x: 400, y: 720, w: 300, h: 60, volume: 200, solutes: { CuSO4: 30 } });
  scene.addObject(pool);
  scene.status = 'running';
  const p = new Player({ x: 200, y: 620, substance: 'NaOH', mass: 40 });
  p.moveSpeed = 400;
  scene.addObject(p);
  scene.control.add('right');
  run(scene, 30);
  scene.control.add('jump');
  run(scene, 15);
  scene.control.delete('jump');
  run(scene, 250);

  // 连接分量必须为 1（无散落格子）
  const g = p.grid;
  const seen = Array.from({ length: g.rows }, () => new Array(g.cols).fill(false));
  let comps = 0;
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      if (g.get(x, y) !== 'NaOH' || seen[y][x]) continue;
      comps++;
      const stack = [[x, y]];
      seen[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < g.cols && ny >= 0 && ny < g.rows && !seen[ny][nx] && g.get(nx, ny) === 'NaOH') {
            seen[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
    }
  }
  assert.equal(comps, 1, `NaOH 格子应连通，分量=${comps}`);
  assert.ok(p.hp > 0, '玩家应存活');
});

// ---- 10. 产气时生成气泡 UI -----------------------------------------------------
test('反应产气时生成上升气泡', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 200, h: 80 }));
  scene.addObject(new Floor({ x: 600, y: 720, w: 1000, h: 80 }));
  const pool = new Pool({ x: 200, y: 720, w: 200, h: 60, volume: 120, solutes: { H2O2: 90 } });
  scene.addObject(pool);
  scene.addObject(new Block({ x: 240, y: 740, substance: 'MnO2', w: 24, h: 24 }));
  scene.status = 'running';
  let bubbles = 0;
  for (let i = 0; i < 40; i++) {
    scene.step(TICK);
    bubbles = scene.objects.filter((o) => o.constructor && o.constructor.name === 'Bubble').length + bubbles;
  }
  assert.ok(scene.atmosphere.mass('O2') > 400, '应产生 O2（大气初始 O2=400g）');
  assert.ok(bubbles > 0, '应生成气泡');
});

// ---- 11. 从容器收集沉淀 ---------------------------------------------------------
test('玩家从池中收集沉淀', () => {
  const scene = flatScene();
  const p = new Player({ x: 200, y: 540 }); // 靠近池子
  scene.addObject(p);
  const pool = new Pool({ x: 320, y: 620, w: 100, h: 80, volume: 150 });
  scene.addObject(pool);
  pool.addPrecipitate('Cu(OH)2', 5);
  scene.pressed.add('collect');
  scene.step(TICK);
  assert.ok(p.inventory.slots.some((s) => s && s.substance === 'Cu(OH)2'), '物品栏应有 Cu(OH)2');
  assert.equal(pool.precipitates.get('Cu(OH)2') ?? 0, 0, '池中沉淀应被取走');
});
