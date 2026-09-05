// 复现：chapters 试玩路径直接把编辑器预览 rope addObject —— 绳子未接线。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Block } from '../src/objects/block.js';
import { Rope } from '../src/objects/rope.js';

const TICK = 1 / 30;
function run(scene, n) { for (let i = 0; i < n; i++) scene.step(TICK); }

// 模拟"编辑器预览 rope"：construct 只给 fixed 锚点，无 hanging（_hangingId 未接线）
function previewRope() {
  const x = 978, y = 494, length = 100;
  const r = new Rope({ x, y, length, anchor: { fixed: { x, y } } });
  r._hangingId = 'block2';
  r._anchorMode = 'fixed';
  r._anchorObj = 'block1';
  return r;
}

test('复现：chapters 试玩路径 rope 未接线 → block2 掉落 & 绳子不吊', () => {
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.addObject(new Floor({ x: 915, y: 523, w: 125, h: 20, id: 'floor1' }));
  scene.addObject(new Floor({ x: 902, y: 700, w: 1158, h: 130, id: 'b_floorb' }));
  const block1 = new Block({ x: 954, y: 481, substance: 'Cu', mass: 8.1, w: 45, h: 45, pushable: true, id: 'block1' });
  const block2 = new Block({ x: 958, y: 582, substance: 'Fe', mass: 6.4, w: 40, h: 40, pushable: true, id: 'block2' });
  scene.addObject(block1);
  scene.addObject(block2);
  // 模拟 chapters 路径：addObject(未接线的预览 rope)
  scene.addObject(previewRope());
  scene.status = 'running';
  run(scene, 120);
  console.log(`block2: x=${block2.x.toFixed(1)} y=${block2.y.toFixed(1)} (初始 y=582)`);
  console.log(`场景中 rope: ${scene.objects.filter((o) => o instanceof Rope).length} 条，broken=${scene.objects.filter((o) => o instanceof Rope)[0]?.broken}`);
  assert.ok(block2.y > 650, `block2 掉落到地面（未被吊住）: ${block2.y.toFixed(1)}`);
});

test('对照：正确接线（fixed 锚点，与 JSON anchorMode 一致）→ block2 被吊住', () => {
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.addObject(new Floor({ x: 915, y: 523, w: 125, h: 20, id: 'floor1' }));
  scene.addObject(new Floor({ x: 902, y: 700, w: 1158, h: 130, id: 'b_floorb' }));
  const block1 = new Block({ x: 954, y: 481, substance: 'Cu', mass: 8.1, w: 45, h: 45, pushable: true, id: 'block1' });
  const block2 = new Block({ x: 958, y: 582, substance: 'Fe', mass: 6.4, w: 40, h: 40, pushable: true, id: 'block2' });
  scene.addObject(block1);
  scene.addObject(block2);
  // JSON 的正确接线：anchorMode='fixed' → 固定锚点 (978,494)；hanging=block2
  scene.addObject(new Rope({ x: 978, y: 494, length: 100, anchor: { fixed: { x: 978, y: 494 } }, hanging: block2 }));
  scene.status = 'running';
  run(scene, 120);
  const rope = scene.objects.find((o) => o instanceof Rope);
  console.log(`fixed 正确接线: block2 x=${block2.x.toFixed(1)} y=${block2.y.toFixed(1)} ropeBroken=${rope?.broken}`);
  assert.ok(!rope?.broken, '绳子未断');
  assert.ok(block2.y < 600, `block2 应被吊住（未掉落）: ${block2.y.toFixed(1)}`);
});

test('对照：correctly wired anchor=obj 带偏移（锚点=绳子起点的相对位置）也吊住', () => {
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.addObject(new Floor({ x: 915, y: 523, w: 125, h: 20, id: 'floor1' }));
  const block1 = new Block({ x: 954, y: 481, substance: 'Cu', mass: 8.1, w: 45, h: 45, pushable: true, id: 'block1' });
  const block2 = new Block({ x: 958, y: 582, substance: 'Fe', mass: 6.4, w: 40, h: 40, pushable: true, id: 'block2' });
  scene.addObject(block1);
  scene.addObject(block2);
  // anchor=obj 应带 dx/dy：锚点相对 block1 左上角 = (978-954, 494-481) = (24, 13)
  scene.addObject(new Rope({ x: 978, y: 494, length: 100, anchor: { obj: block1, dx: 978 - 954, dy: 494 - 481 }, hanging: block2 }));
  scene.status = 'running';
  run(scene, 120);
  const rope = scene.objects.find((o) => o instanceof Rope);
  console.log(`obj+偏移 正确接线: block2 x=${block2.x.toFixed(1)} y=${block2.y.toFixed(1)} ropeBroken=${rope?.broken}`);
  assert.ok(!rope?.broken, '绳子未断');
  assert.ok(block2.y < 600, `block2 应被吊住: ${block2.y.toFixed(1)}`);
});

// 模拟 wireRopeInto（编辑器 API）的输入：collect() 出的普通字段 / 预览对象的 _ 字段都兼容
test('wireRopeInto 语义：_hangingId 预览对象按 id 接线 → 吊住', () => {
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.addObject(new Floor({ x: 915, y: 523, w: 125, h: 20, id: 'floor1' }));
  const block1 = new Block({ x: 954, y: 481, substance: 'Cu', mass: 8.1, w: 45, h: 45, pushable: true, id: 'block1' });
  const block2 = new Block({ x: 958, y: 582, substance: 'Fe', mass: 6.4, w: 40, h: 40, pushable: true, id: 'block2' });
  scene.addObject(block1);
  scene.addObject(block2);
  // wireRopeInto 等价逻辑：collect 字段 hanging/anchorMode/anchorObj（无下划线）
  const wire = (r) => {
    const hangId = r._hangingId ?? r.hanging ?? '';
    const mode = r._anchorMode ?? r.anchorMode ?? 'fixed';
    const obId = r._anchorObj ?? r.anchorObj ?? '';
    const hang = hangId ? scene.byId[hangId] : undefined;
    const ao = obId ? scene.byId[obId] : null;
    const anchor = mode === 'obj' && ao
      ? { obj: ao, dx: (r.x ?? 0) - ao.x, dy: (r.y ?? 0) - ao.y }
      : { fixed: { x: (r.x ?? 0), y: (r.y ?? 0) } };
    scene.addObject(new Rope({ x: r.x ?? 0, y: r.y ?? 0, length: r.length ?? 100, anchor, hanging: hang }));
  };
  wire({ x: 978, y: 494, length: 100, hanging: 'block2', anchorMode: 'fixed', anchorObj: 'block1' });
  scene.status = 'running';
  run(scene, 120);
  const rope = scene.objects.find((o) => o instanceof Rope);
  console.log(`wireRopeInto 语义: block2 y=${block2.y.toFixed(1)} ropeBroken=${rope?.broken}`);
  assert.ok(!rope?.broken, '绳子未断');
  assert.ok(block2.y < 600, `block2 应被吊住: ${block2.y.toFixed(1)}`);
});
