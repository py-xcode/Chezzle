// 高清画布（dpr）单元测试：缓冲=逻辑×dpr、CSS=逻辑 px、窗口自适应上限
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupCanvasSize, fitCanvasToWindow, MAX_VIEW_W, MAX_VIEW_H } from '../src/render/canvas.js';

function fakeCanvas() {
  return { width: 0, height: 0, style: {} };
}

test('setupCanvasSize：node 无 window → dpr=1（缓冲=逻辑、CSS=逻辑 px）', () => {
  const c = fakeCanvas();
  setupCanvasSize(c, 1100, 700);
  assert.equal(c.width, 1100);
  assert.equal(c.height, 700);
  assert.equal(c.style.width, '1100px');
  assert.equal(c.style.height, '700px');
  assert.equal(c._dpr, 1);
});

test('setupCanvasSize：dpr=2 → 缓冲翻倍、CSS 不变（高清核心：视觉尺寸不变、清晰度×2）', () => {
  globalThis.window = { devicePixelRatio: 2, innerWidth: 0, innerHeight: 0 };
  try {
    const c = fakeCanvas();
    setupCanvasSize(c, 1100, 700);
    assert.equal(c.width, 2200);
    assert.equal(c.height, 1400);
    assert.equal(c.style.width, '1100px');
    assert.equal(c.style.height, '700px');
    assert.equal(c._dpr, 2);
  } finally { delete globalThis.window; }
});

test('setupCanvasSize：重复调用幂等（尺寸一致不重设缓冲，防清屏闪烁）', () => {
  globalThis.window = { devicePixelRatio: 1, innerWidth: 0, innerHeight: 0 };
  try {
    const c = fakeCanvas();
    setupCanvasSize(c, 800, 600);
    setupCanvasSize(c, 800, 600);
    assert.equal(c.width, 800);
    assert.equal(c.height, 600);
    assert.equal(c.style.width, '800px');
  } finally { delete globalThis.window; }
});

test('fitCanvasToWindow：逻辑尺寸=窗口、上限钳制（4K 不全屏放大）', () => {
  globalThis.window = { devicePixelRatio: 1, innerWidth: 3840, innerHeight: 2160 };
  globalThis.document = { documentElement: { clientWidth: 3840, clientHeight: 2160 } };
  try {
    const c = fakeCanvas();
    fitCanvasToWindow(c);
    assert.equal(c.width, MAX_VIEW_W, '超大窗口钳到上限');
    assert.equal(c.height, MAX_VIEW_H);
    assert.equal(c.style.width, MAX_VIEW_W + 'px');
    // 常见笔记本窗口：取窗口尺寸
    globalThis.document.documentElement.clientWidth = 1366;
    globalThis.document.documentElement.clientHeight = 768;
    fitCanvasToWindow(c);
    assert.equal(c.style.width, '1366px');
    assert.equal(c.style.height, '768px');
    assert.equal(c.width, 1366);
    // pad：内边距左右各扣
    fitCanvasToWindow(c, { pad: 12 });
    assert.equal(c.style.width, '1342px');
  } finally { delete globalThis.window; delete globalThis.document; }
});
