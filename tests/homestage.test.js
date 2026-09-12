// 主页两个装饰舞台的布局约束测试（无需浏览器）
// ----------------------------------------------------------------------------
// index.html 里 `.stage` 的两台小动画钉在左下 / 右下角，右侧那台还有个"方块撞
// '关于'按钮"的彩蛋。历史上出过两类问题：
//   ① 从右上斜插按钮右下角 → 落点前有几帧横向已重叠、纵向还压着按钮（穿模）
//   ② 窗口变窄/变矮后按钮压到舞台活动区上 → 方块穿过按钮
// 现在这些由 index.html 里 `computeStage()`（纯函数）保证：
//   · 内容整体落在按钮外侧（横向不相交）或整体落在按钮下缘之下（纵向不相交），
//     两条约束取能给出更大舞台的那条；
//   · 只有"内容在按钮外侧"时才开启撞击彩蛋，方块全程在按钮右侧 → x 永不重叠。
// 本测试**直接抽取 index.html 里的那段源码**复算，避免测试与实现各写一份而漂移。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** 从 index.html 抽出 #region stage-geometry 段落并在沙箱里求值 */
function loadStageGeometry() {
  const m = HTML.match(/\/\/ #region stage-geometry[\s\S]*?\/\/ #endregion stage-geometry/);
  assert.ok(m, 'index.html 里应存在 #region stage-geometry 段落');
  const src = m[0];
  const baseH = Number((HTML.match(/const BASE_H = (\d+)/) ?? [])[1]);
  const gap = Number((HTML.match(/const GAP = (\d+)/) ?? [])[1]);
  assert.ok(Number.isFinite(baseH) && Number.isFinite(gap), 'BASE_H / GAP 常量应可解析');
  const fn = new Function('BASE_H', 'GAP', `${src}\nreturn computeStage;`);
  return { computeStage: fn(baseH, gap), BASE_H: baseH, GAP: gap };
}
const { computeStage, BASE_H, GAP } = loadStageGeometry();

// 右侧舞台内容坐标（与 index.html 保持一致，仅测试用）
const CW = 430, CH = BASE_H, PW = 45;
const GROUND = 276;
const AY = (GROUND - 40) - PW - 6;
const AX = [137.5, 197.5, 257.5];

/** 按 index.html 的样式复算"关于"按钮矩形（hero 垂直居中，按钮宽 min(560px,82vw)） */
function aboutRect(vw, vh) {
  const titleW = Math.min(680, vw * 0.86);
  const titleH = titleW * 132 / 492;      // 标题 SVG viewBox 492×132
  const playH = 51.3, aboutH = 54;        // 实测高度（padding+font 固定，不随视口变）
  const heroH = titleH + 36 + playH + 15 + aboutH;
  const top = (vh - heroH) / 2 + titleH + 36 + playH + 15;
  const w = Math.min(560, vw * 0.82);
  return { left: (vw - w) / 2, right: (vw + w) / 2, top, bottom: top + aboutH };
}

/** 按 index.html 的 layout() 复算舞台画布矩形 + 撞击点 */
function stageBox(vw, vh, kind) {
  const b = aboutRect(vw, vh);
  const st = computeStage(vw, vh, b, kind);
  if (!st) return { st: null, b };
  const contentW = kind === 'right' ? CW * st.s : 380 * st.s;
  let hit = null, w, h;
  if (kind === 'right') {
    hit = st.gag
      ? { x: (b.right + 2 - st.contentLeft) / st.s, y: ((b.top + b.bottom) / 2 - st.contentTop) / st.s - PW / 2 }
      : { x: 40, y: Math.max(AY - 150, (b.bottom + 8 - st.contentTop) / st.s) };
    const airW = st.gag ? Math.round(st.contentLeft - b.right + PW * st.s + 8) : 0;
    w = Math.round(airW + st.contentW);
    h = Math.round(Math.max(st.contentH, st.contentH + st.s * Math.max(0, 60 - hit.y) + 12));
  } else {
    w = Math.round(contentW);
    h = Math.round(st.contentH);
  }
  const right = vw - GAP, bottom = vh - GAP;
  return {
    st, b, hit,
    rect: kind === 'right'
      ? { left: right - w, right, top: bottom - h, bottom, w, h }
      : { left: GAP, right: GAP + w, top: bottom - h, bottom, w, h },
  };
}

/** 内容坐标 → 页面坐标 */
function toPage(st, kind, x, y, box) {
  const ox = kind === 'right' ? box.rect.right - st.contentW - box.rect.left : 0;
  const oy = box.rect.bottom - st.contentH - box.rect.top;
  return { x: box.rect.left + ox + x * st.s, y: box.rect.top + oy + y * st.s };
}
const rectOf = (p, s) => ({ left: p.x, right: p.x + PW * s, top: p.y, bottom: p.y + PW * s });
const overlapArea = (a, b) => {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};
const bez = (x0, y0, cx, cy, x1, y1, k) => ({
  x: (1 - k) ** 2 * x0 + 2 * (1 - k) * k * cx + k * k * x1,
  y: (1 - k) ** 2 * y0 + 2 * (1 - k) * k * cy + k * k * y1,
});

/** 采样一整个循环里方块的位置（内容坐标）——与 index.html 的 pose() 同构 */
function pathSamples(hit, st) {
  const pts = [];
  const push = (p) => pts.push(p);
  for (let k = 0; k <= 1; k += 1 / 40) {
    push(bez(AX[0], AY, 197.5, 138, AX[1], AY, k));  // A→B
    push(bez(AX[1], AY, 237.5, 138, AX[2], AY, k));  // B→C
    push(bez(AX[2], AY, AX[2] + (hit.x - AX[2]) * 0.45, hit.y, hit.x, hit.y, k));      // 大跳
    push(bez(hit.x, hit.y, hit.x + (AX[0] - hit.x) * 0.42, hit.y - 85, AX[0], AY, k)); // 反弹
  }
  push({ x: AX[0], y: AY });
  return pts;
}

const VIEWPORTS = [
  [2560, 1440], [1920, 1080], [1707, 785], [1600, 900], [1440, 900], [1366, 768],
  [1280, 800], [1280, 720], [1100, 620], [1024, 768], [900, 600], [820, 1180],
  [768, 1024], [430, 932], [390, 844], [375, 667], [667, 375], [1600, 420], [700, 400],
];

test('computeStage：任何视口下舞台要么隐藏、要么与"关于"按钮完全不相交（约束①或②）', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const b = aboutRect(vw, vh);
    for (const kind of ['left', 'right']) {
      const st = computeStage(vw, vh, b, kind);
      if (!st) continue; // 窗口放不下 → 隐藏，天然不冲突
      const box = stageBox(vw, vh, kind);
      const right = vw - GAP, bottom = vh - GAP;
      const cw = kind === 'right' ? CW * st.s : 380 * st.s;
      const content = kind === 'right'
        ? { left: right - cw, right, top: bottom - st.contentH, bottom }
        : { left: GAP, right: GAP + cw, top: bottom - st.contentH, bottom };
      const sideClear = kind === 'right' ? content.left >= b.right - 0.01 : content.right <= b.left + 0.01;
      const belowClear = content.top >= b.bottom - 0.01;
      assert.ok(sideClear || belowClear,
        `${kind} 舞台在 ${vw}×${vh} 下既不在按钮外侧也不在按钮下方（content=${JSON.stringify(content)}, btn=${JSON.stringify(b)}）`);
      assert.equal(overlapArea(content, b), 0, `${kind} 舞台内容压到按钮上：${vw}×${vh}`);
      assert.ok(box.rect.left >= -0.01 && box.rect.right <= vw + 0.01, '画布不应超出视口');
      assert.ok(box.rect.top >= -0.01 && box.rect.bottom <= vh + 0.01, '画布不应超出视口');
    }
  }
});

test('右舞台：彩蛋模式下撞击点精确贴按钮右缘、全程与按钮零重叠、且不出画布', () => {
  let gagged = 0;
  for (const [vw, vh] of VIEWPORTS) {
    const box = stageBox(vw, vh, 'right');
    if (!box.st || !box.st.gag) continue;
    gagged++;
    const { st, b, hit, rect } = box;
    // 撞击瞬间：方块左缘 = 按钮右缘 + 2px，且与按钮垂直居中
    const atHit = rectOf(toPage(st, 'right', hit.x, hit.y, box), st.s);
    assert.ok(Math.abs(atHit.left - (b.right + 2)) < 0.51,
      `${vw}×${vh} 撞击点没有贴住按钮右缘：${atHit.left} vs ${b.right + 2}`);
    assert.ok(Math.abs((atHit.top + atHit.bottom) / 2 - (b.top + b.bottom) / 2) < 0.51,
      `${vw}×${vh} 撞击点没有与按钮垂直居中`);
    // 全轨迹：与按钮零重叠，且始终在画布内（不会被裁掉）
    for (const p of pathSamples(hit, st)) {
      const r = rectOf(toPage(st, 'right', p.x, p.y, box), st.s);
      assert.equal(overlapArea(r, b), 0,
        `${vw}×${vh} 方块与"关于"按钮重叠（方块 ${JSON.stringify(r)} 按钮 ${JSON.stringify(b)}）`);
      assert.ok(r.left >= -0.01 && r.right <= vw + 0.01, `${vw}×${vh} 方块横向出画布`);
      assert.ok(r.top >= -0.01 && r.bottom <= vh + 0.01, `${vw}×${vh} 方块纵向出画布`);
    }
  }
  assert.ok(gagged >= 8, `应有足够多的视口开启撞击彩蛋（实际 ${gagged}）`);
});

test('右舞台：装饰模式下（按钮压过来时）方块不越到按钮那边去', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const box = stageBox(vw, vh, 'right');
    if (!box.st || box.st.gag) continue;
    const { st, b, hit } = box;
    for (const p of pathSamples(hit, st)) {
      const r = rectOf(toPage(st, 'right', p.x, p.y, box), st.s);
      assert.equal(overlapArea(r, b), 0, `${vw}×${vh} 装饰模式下方块仍与按钮重叠`);
    }
  }
});

test('舞台尺寸：常见桌面分辨率下取满尺寸（不被无谓缩小）', () => {
  for (const [vw, vh] of [[1707, 785], [1920, 1080], [2560, 1440]]) {
    const L = computeStage(vw, vh, aboutRect(vw, vh), 'left');
    const R = computeStage(vw, vh, aboutRect(vw, vh), 'right');
    assert.equal(L.s, 1, `${vw}×${vh} 左舞台应保持 1:1`);
    assert.equal(R.s, 1, `${vw}×${vh} 右舞台应保持 1:1`);
    assert.equal(R.gag, true, `${vw}×${vh} 右舞台应开启撞击彩蛋`);
  }
  // 1440×900：按钮右缘离右下角只差 4px，允许 5% 以内微缩
  const R = computeStage(1440, 900, aboutRect(1440, 900), 'right');
  assert.ok(R.s >= 0.95, `1440×900 右舞台不该明显缩小（实际 ${R.s.toFixed(3)}）`);
  assert.equal(R.gag, true);
});

test('舞台尺寸：窗口极矮时隐藏而非压到按钮上', () => {
  const vw = 800, vh = 260; // 按钮已贴到页面底部，舞台怎么放都会压上去
  const b = aboutRect(vw, vh);
  assert.equal(computeStage(vw, vh, b, 'right'), null);
  assert.equal(computeStage(vw, vh, b, 'left'), null);
});
