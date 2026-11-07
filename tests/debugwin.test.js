// 调试通关：levels/levels.json 的 debugClickWin 开关（默认关闭）。
// 开启后，关卡内点一下画布直接进入 win —— 用来复现/验证"通关记录、结算页、退出重进"流程。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { handleScenePressDown } from '../src/level/click.js';

test('debugWinNow：立刻进入 win、只发一次 win 事件、不能重复触发', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.status = 'running';
  let wins = 0;
  scene.on('win', () => wins++);
  assert.equal(scene.debugWinNow(), true);
  assert.equal(scene.status, 'win');
  assert.equal(scene._firedStatus, 'win', '同一帧就补发 win（不等下一 tick）');
  assert.equal(wins, 1, 'win 事件只发一次');
  assert.equal(scene.debugWinNow(), false, '非 running 状态不再触发');
  assert.equal(wins, 1);
});

test('点击入口只认全局开关 __CZ_DEBUG_CLICK_WIN（levels.json 的 debugClickWin）', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const prev = globalThis.window;
  globalThis.window = { __CZ_DEBUG_CLICK_WIN: false };
  try {
    const scene = new Scene({ worldW: 1000, worldH: 800 });
    scene.status = 'running';
    scene.overview = true; // 开关关闭时走常规冻结分支，证明不会误触发通关
    assert.equal(handleScenePressDown(scene, null, 0, 0), false);
    assert.equal(scene.status, 'running');

    scene.overview = false;
    globalThis.window.__CZ_DEBUG_CLICK_WIN = true;
    // canvas / 坐标传空：证明调试通关在物体命中检测之前就返回
    assert.equal(handleScenePressDown(scene, null, 0, 0), true);
    assert.equal(scene.status, 'win');
  } finally {
    if (had) globalThis.window = prev;
    else delete globalThis.window;
  }
});
