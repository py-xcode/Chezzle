// ============================================================================
// 官方示例插件：延迟出现（增强版）
// ----------------------------------------------------------------------------
// 大众化参数的"正解"：插件为已有物体类型**增加属性字段**（enhance），参数直接在
// 物体属性面板里调整（就像酒精灯的"常燃/初始沉淀"一样），插件 run 只管读取执行。
// 本插件给 灯/物块/沉淀堆/玩家 增加「延迟出现(秒)」：>0 时开局隐藏、到时自动出现
// （沉淀堆会延迟物化——出现时正好是一滩粒子）。
//
// 用法：编辑器加载本插件 → 选中任意灯/物块/沉淀堆 → 属性面板出现「延迟出现(秒)」。
// 也可以在关卡脚本里写死：scene.byId['lamp1'].appearDelay = 10（插件照样生效）。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "延迟出现",
//   "version": "1.0",
//   "api": 1,
//   "description": "给灯/物块/沉淀堆等增加「延迟出现(秒)」属性：开局隐藏，到时自动出现。参数在物体属性面板调整。",
//   "enhance": [
//     {
//       "types": ["lamp", "blastlamp", "block", "deposit", "player"],
//       "fields": [
//         { "key": "appearDelay", "label": "延迟出现(秒)", "kind": "number", "def": 0 }
//       ]
//     }
//   ]
// }
// @@end

Chezzle.Plugin.register('lampDelay', {
  run(scene, api) {
    const cancels = [];
    // 遍历 byId（含初始隐藏的物体）：有 appearDelay 的物体开局隐藏、到点出现。
    // 已由开关控制的隐藏物体不干预（它的出现由开关决定）。
    for (const obj of Object.values(scene.byId)) {
      const d = Number(obj.appearDelay) || 0;
      if (d <= 0 || obj.hidden) continue;
      // 隐藏 = 移出活动索引（保留 byId 登记：scene.reveal 依赖它）
      const idx = [
        scene.objects, scene.dynamics, scene.statics, scene.particles,
        scene.containers, scene.lamps, scene.doors, scene.portals,
      ];
      for (const arr of idx) {
        const i = arr.indexOf(obj);
        if (i >= 0) arr.splice(i, 1);
      }
      obj.hidden = true;
      scene.hidden.push(obj);
      // 游戏时间（受暂停控制），到点出现
      cancels.push(scene.wait(d, () => scene.reveal(obj.id)));
    }
    return () => { for (const c of cancels) c(); }; // 清理：取消未触发的定时
  },
});
