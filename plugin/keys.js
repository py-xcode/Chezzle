// ============================================================================
// 官方示例插件：按键提示（keys）—— 定制型插件示范
// ----------------------------------------------------------------------------
// 这是"只服务本关卡"的定制逻辑：没有字段、没有配置，逻辑全部写死在 run 里。
// 用途：教学关提示"按 E 键试试"——监听任意键（含未映射键），响应后恢复提示。
// 展示的能力：api.onKeyDown（返回 true 视为已处理/preventDefault）、api.tip、api.wait。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "按键提示",
//   "version": "1.0",
//   "api": 1,
//   "description": "定制逻辑示例：开局提示'按 E 键试试'，按下 E 后回应（写死在本关卡的脚本里）"
// }
// @@end

Chezzle.Plugin.register('keys', {
  run(scene, api) {
    const hint = '按 E 键试试';
    const reply = '你按下了 E！';
    api.tip(hint);
    return api.onKeyDown((e) => {
      if (e.code !== 'KeyE') return;
      api.tip(reply);
      api.wait(2, () => api.tip(hint));
      return true;
    });
  },
});
