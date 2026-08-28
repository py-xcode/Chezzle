// ============================================================================
// 标签测试：居中锚定 / 画面内钳制 / 画面外剔除 / flush 按当前画布重钳
// （设计定论：标签永远钉在物件上、浮在一切之上；无任何避让搬移）
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { renderFormula, flushLabels, clearLabelQueue } from '../src/render/label.js';

const W = 668;
const H = 360;

function recordingCtx(w, h) {
  const ops = [];
  const ctx = {
    canvas: { width: w, height: h },
    ops,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    setTransform: (...a) => ops.push(['setTransform', ...a]),
    save: () => ops.push(['save']),
    restore: () => ops.push(['restore']),
    measureText: (t) => ({ width: t.length * 10 }),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: '',
    textBaseline: '',
    beginPath: () => ops.push(['beginPath']),
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    arcTo: () => {},
    closePath: () => {},
    fill: () => ops.push(['fill']),
    stroke: () => {},
    fillRect: () => {},
    strokeText: (t, x, y) => ops.push(['strokeText', t, Math.round(x), Math.round(y)]),
    fillText: (t, x, y) => ops.push(['fillText', t, Math.round(x), Math.round(y)]),
    quadraticCurveTo: () => {},
  };
  return ctx;
}

function sceneWith() {
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Player({ x: 500, y: 600, mass: 30, id: 'p1' }));
  return scene;
}

function lastText(ctx) {
  const ts = ctx.ops.filter((o) => o[0] === 'fillText');
  return ts.length ? ts[ts.length - 1] : null;
}

// ---- 1. 居中锚定：标签盒以物件标注点为中心 -----------------------------------
test('renderFormula：标签以锚点为水平中心入队', () => {
  clearLabelQueue();
  const scene = sceneWith();
  const ctx = recordingCtx(W, H);
  renderFormula(ctx, 300, 200, 'Zn', { scene });
  flushLabels(ctx);
  const t = lastText(ctx);
  assert.ok(t, '有标签画出');
  assert.equal(t[1], 'Zn');
  // 盒宽 = 2×10 + 12 = 32 → 盒左 = 300−16，文字中心 = 300（恰为锚点）
  assert.equal(t[2], 300, '居中于锚点');
});

// ---- 2. 画面内钳制：贴边长标签收进来，永不截断 -------------------------------
test('renderFormula：贴边长标签钳制进画面（左右上下）', () => {
  clearLabelQueue();
  const scene = sceneWith();
  const ctx = recordingCtx(W, H);
  // 右缘：锚点 x=640，文字宽 130+12 → 盒越界 → 收进来
  renderFormula(ctx, 640, 200, 'HCl + NaCl + K', { scene });
  // 左缘：锚点 x=8
  renderFormula(ctx, 8, 240, 'HCl + NaCl + K', { scene });
  // 顶缘：锚点 y=6
  renderFormula(ctx, 300, 6, 'Zn', { scene });
  // 底缘：锚点 y=356
  renderFormula(ctx, 300, 356, 'Zn', { scene });
  flushLabels(ctx);
  const texts = ctx.ops.filter((o) => o[0] === 'fillText');
  assert.equal(texts.length, 4);
  for (const t of texts) {
    assert.ok(t[2] >= 4 && t[2] <= W - 4, `x 在画面内：${t[2]}`);
    assert.ok(t[3] >= 4 && t[3] <= H - 4, `y 在画面内：${t[3]}`);
  }
});

// ---- 3. 画面外物件：标签不入队 -----------------------------------------------
test('renderFormula：锚点在画面外的物件不画标签', () => {
  clearLabelQueue();
  const scene = sceneWith();
  const ctx = recordingCtx(W, H);
  renderFormula(ctx, -300, 200, 'Zn', { scene }); // 左外
  renderFormula(ctx, 300, -200, 'CuSO4', { scene }); // 上外
  renderFormula(ctx, 1200, 200, 'K', { scene }); // 右外
  renderFormula(ctx, 300, 600, 'K', { scene }); // 下外
  flushLabels(ctx);
  assert.equal(ctx.ops.filter((o) => o[0] === 'fillText').length, 0, '画面外物件无标签');
});

// ---- 4. flush 按当前画布重钳（入队后 resize 不错位）--------------------------
test('flushLabels：入队后画布缩小，按新尺寸钳回画面内', () => {
  clearLabelQueue();
  const scene = sceneWith();
  const ctx = recordingCtx(W, H);
  renderFormula(ctx, 640, 200, 'HCl + NaCl + K', { scene });
  ctx.canvas.width = 400; // 画布缩到 400 宽
  flushLabels(ctx);
  const t = lastText(ctx);
  assert.ok(t, '仍画出');
  assert.ok(t[2] > 4 && t[2] < 400, `重钳进新画布：x=${t[2]}`);
});
