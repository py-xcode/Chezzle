// ============================================================================
// 库入口：re-export 所有公共模块。浏览器打包后挂全局 `Chezzle`。
// ============================================================================

export * from './core/config.js';
export * from './core/scene.js';
export * from './core/input.js';
export * from './core/loop.js';

export * from './level/builder.js';
export * from './level/plugins.js';
export * from './level/multiscene.js';
export * from './level/click.js';
export * from './level/items.js';

export * from './objects/obj.js';
export * from './objects/material.js';
export * from './objects/particle.js';
export * from './objects/floor.js';
export * from './objects/container.js';
export * from './objects/pool.js';
export * from './objects/block.js';
export * from './objects/deposit.js';
export * from './objects/player.js';
export * from './objects/switch.js';
export * from './objects/key.js';
export * from './objects/door.js';
export * from './objects/lamp.js';
export * from './objects/blastlamp.js';
export * from './objects/beaker.js';
export * from './objects/rope.js';
export * from './objects/gascolumn.js';
export * from './objects/sign.js';
export * from './objects/bubble.js';
export * from './objects/spark.js';
export * from './objects/portal.js';
export * from './objects/gasdetector.js';
export * from './objects/extractor.js';
export * from './objects/dropper.js';
export * from './objects/drip.js';
export * from './objects/fx.js';
export * from './objects/gasbottle.js';

export * from './chem/substances.js';
export * from './chem/solution.js';
export * from './chem/atmosphere.js';
export * from './chem/rules.js';
export * from './chem/engine.js';

export * from './physics/body.js';
export * from './physics/aabb.js';
export * from './physics/collision.js';
export * from './physics/support.js';

export * from './render/renderer.js';
export * from './render/camera.js';
export * from './render/color.js';
export * from './render/gridrender.js';
export * from './render/liquidrender.js';
export * from './render/label.js';
export * from './render/hud.js';

// 浏览器全局挂载由 tools/build.mjs 打包时附加（`window.Chezzle = <exports>`）。
