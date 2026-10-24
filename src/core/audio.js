// ============================================================================
// 引擎侧音效入口（薄封装）
// ----------------------------------------------------------------------------
// 真正的合成器在根目录经典脚本 audio.js（window.ChezzleAudio）：它同时服务
// 关卡页与 SPA 外壳（index/select/about），避免两套音色。本模块只做：
//   ① 无 window / 无 audio.js（Node 测试、编辑器等）→ 返回 false，不报错；
//   ② 统一 try/catch，音效异常绝不影响游戏循环；
//   ③ 供关卡脚本/插件使用的 Chezzle.sfx（src/index.js re-export）；
//   ④ setSfxEnabled(false)：首页角落小舞台这类"装饰性 Scene"会一直 step()，
//      传送门/落地/焰色反应等音效会变成背景噪音 —— 外壳关掉引擎音效，
//      UI 点击音（window.ChezzleAudio 的自动接线）不受影响。
//
// 音色名（与 audio.js 的 PRESETS 一一对应；拼错只是没声音，不会抛错）：
//   UI     ui.click / ui.tick / ui.open / ui.close / ui.back / ui.toggle / ui.deny
//   页面   page.enter / page.leave / level.enter / level.leave
//   玩家   player.jump / player.land / player.hurt
//   物品   item.pickup / item.place / item.suck / item.pour / item.drip / item.gas
//   化学   chem.react / chem.bubble / chem.spark / chem.explode / chem.ignite / chem.extinguish
//   机关   switch.open / switch.close / key.open / door.open / door.close
//          portal / rope.break / extractor.pump
//   状态   win / died / restart / overview.on / overview.off / tip / banner
// ============================================================================

/** 引擎音效总开关（默认开；装饰性场景/无 UI 的回放环境可关掉） */
let ENGINE_SFX_ON = true;

/** 开关引擎音效（不影响 audio.js 的 UI 点击音；返回当前状态） */
export function setSfxEnabled(on) {
  ENGINE_SFX_ON = !!on;
  return ENGINE_SFX_ON;
}

/** 当前是否允许引擎音效 */
export function sfxEnabled() {
  return ENGINE_SFX_ON;
}

/** 播放一次音效（安全封装）。返回 true = 真的排进了音频图。 */
export function sfx(name, opts) {
  if (!ENGINE_SFX_ON || typeof window === 'undefined') return false;
  try {
    const a = window.ChezzleAudio;
    if (!a || typeof a.play !== 'function') return false;
    return a.play(name, opts) === true;
  } catch (e) {
    return false; // 音频异常不拖垮游戏循环（与插件回调同策略）
  }
}

/** 音频是否可用（audio.js 已加载且用户手势已解锁/可解锁） */
export function audioAvailable() {
  if (!ENGINE_SFX_ON || typeof window === 'undefined') return false;
  try {
    return !!(window.ChezzleAudio && typeof window.ChezzleAudio.play === 'function');
  } catch (e) {
    return false;
  }
}
