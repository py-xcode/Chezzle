// ============================================================================
// 新手引导模组（tutorial）—— 新手关卡三件套
// ----------------------------------------------------------------------------
// ① 大横幅：屏幕中央大字（MC 标题式），按剧本排期出现，淡入淡出。
//    - 编辑器里加载本插件 → 侧栏出现「📣 横幅剧本」面板：每条 = 开始时间(秒) /
//      持续(秒) / 文字内容（支持多行，用换行）。导出/试玩自动带剧本（所见即所得）。
//    - 手写关卡脚本：`scene.tutorialBanners = [{ at: 2, dur: 4, text: '第一句\n第二句' }];`
//      写在 `Chezzle.Plugin.inject(scene, ...)` **之前**；或者代码里随时
//      `scene.showBanner('文字', 4)`（引擎能力，横幅数据 {text,t,dur}，HUD 渲染）。
// ② 物品延迟出现：给**所有物体类型**（地板/水池/物块/烧杯/滴管/…/玩家）增加
//    「延迟出现(秒)」属性（物体属性面板里调）：开局隐藏（不可见/无碰撞/不参与
//    化学与生死判定），到时自动出现（含烧杯子体杯壁）。
// ③ 玩家延迟出现：玩家同样吃「延迟出现(秒)」——人没到，死亡判定/提示就绪/
//    HUD 面板全部静默，出现后一切照常。
//
// 与 lampDelay 示例的区别：lampDelay 只增强灯/物块/沉淀堆/玩家；本模组全类型
// 增强 + 子体随母体隐藏 + 自带横幅剧本面板。一个关卡用其一即可。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "新手引导",
//   "version": "1.0",
//   "api": 1,
//   "description": "新手关三件套：大横幅剧本（编辑器面板排期，淡入淡出）+ 全类型「延迟出现(秒)」属性 + 玩家延迟出现",
//   "enhance": [
//     {
//       "types": ["floor", "pool", "block", "deposit", "player", "lamp", "blastlamp",
//         "switch", "key", "door", "sign", "portal", "gasdetector", "extractor",
//         "beaker", "dropper", "gasbottle", "gas"],
//       "fields": [
//         { "key": "appearDelay", "label": "延迟出现(秒)", "kind": "number", "def": 0 }
//       ]
//     }
//   ]
// }
// @@end

Chezzle.Plugin.register('tutorial', {
  // ---- 运行时：appearDelay 隐藏/到点出现 + 横幅剧本排期 ----
  run(scene, api, cfg) {
    const cancels = [];

    // 隐藏 = 移出一切活动索引（含 subBodies 杯壁/门框等），只留在 byId+hidden，
    // scene.reveal(id) 负责原样恢复（它自己会递归显现子体）。
    const hideDeep = (obj) => {
      const arrays = [
        scene.objects, scene.dynamics, scene.statics, scene.particles,
        scene.containers, scene.lamps, scene.doors, scene.portals,
      ];
      for (const arr of arrays) {
        const i = arr.indexOf(obj);
        if (i >= 0) arr.splice(i, 1);
      }
      obj.hidden = true;
      if (!scene.hidden.includes(obj)) scene.hidden.push(obj);
      if (obj.subBodies) for (const sb of obj.subBodies) hideDeep(sb);
    };

    // ② 物品延迟出现（③ 玩家同理：玩家也是 byId 里的一个物体）
    for (const obj of Object.values(scene.byId)) {
      const d = Number(obj.appearDelay) || 0;
      if (d <= 0 || obj.hidden) continue; // 已被开关初始隐藏的：出现时机归开关管
      hideDeep(obj);
      cancels.push(scene.wait(d, () => scene.reveal(obj.id)));
    }

    // ① 横幅剧本：scene.tutorialBanners（导出注入）或 cfg.banners（手写脚本传参）
    const list = Array.isArray(scene.tutorialBanners) ? scene.tutorialBanners
      : Array.isArray(cfg.banners) ? cfg.banners : [];
    for (const b of list) {
      if (!b || typeof b.text !== 'string' || !b.text.trim()) continue;
      const at = Math.max(0, Number(b.at) || 0);
      const dur = Number(b.dur) > 0 ? Number(b.dur) : 4;
      cancels.push(scene.wait(at, () => scene.showBanner(b.text, dur)));
    }

    return () => { for (const c of cancels) c(); }; // 清理：取消未触发的定时
  },

  // ---- 编辑器：「📣 横幅剧本」侧栏面板（随存档持久化，导出钩子写进关卡脚本） ----
  editor(ed) {
    const st = ed.state;
    st.banners = st.banners ?? []; // [{ at, dur, text }]

    const panel = ed.addPanel({
      title: '📣 横幅剧本',
      html: `<div id="tbList" style="max-height:200px;overflow-y:auto"></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn" id="tbAdd">＋ 加一条横幅</button>
        </div>
        <div class="tip-note">按游戏开始后的秒数排期：到点屏幕中央大字（淡入淡出）。
        内容支持多行（换行）。导出/试玩自动生效。文字留空的条目会被忽略。</div>`,
    });

    const num = (v, dft) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : dft);

    function refresh() {
      const box = panel.querySelector('#tbList');
      if (!st.banners.length) {
        box.innerHTML = '<div class="empty">还没有横幅。点「＋ 加一条横幅」。</div>';
        return;
      }
      box.innerHTML = st.banners.map((b, i) => `
        <div class="tb-row" style="border:1px solid #233250;border-radius:8px;padding:6px;margin-bottom:6px;background:#101731">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
            <label style="color:#9fb2c8;font-size:11px">秒数
              <input class="tb-at" data-i="${i}" type="number" min="0" step="0.5" value="${b.at}" style="width:64px"></label>
            <label style="color:#9fb2c8;font-size:11px">持续
              <input class="tb-dur" data-i="${i}" type="number" min="0.6" step="0.5" value="${b.dur}" style="width:64px"></label>
            <button class="btn tb-del" data-i="${i}" title="删除这条横幅" style="margin-left:auto;padding:1px 8px">✕</button>
          </div>
          <textarea class="tb-text" data-i="${i}" rows="2" placeholder="横幅文字（可多行）" style="width:100%;box-sizing:border-box">${String(b.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
        </div>`).join('');
      const on = (sel, key, fn) => {
        for (const el of box.querySelectorAll(sel)) {
          el.oninput = () => { fn(el); ed.save(); };
        }
      };
      on('.tb-at', 'at', (el) => { st.banners[+el.dataset.i].at = Math.max(0, num(el.value, 0)); });
      on('.tb-dur', 'dur', (el) => { st.banners[+el.dataset.i].dur = Math.max(0.6, num(el.value, 4)); });
      on('.tb-text', 'text', (el) => { st.banners[+el.dataset.i].text = el.value; });
      for (const del of box.querySelectorAll('.tb-del')) {
        del.onclick = () => { st.banners.splice(+del.dataset.i, 1); refresh(); ed.save(); };
      }
    }

    panel.querySelector('#tbAdd').onclick = () => {
      // 新条默认接在上一条放完之后（+1 秒缓冲），开局横幅常改 0
      const last = st.banners[st.banners.length - 1];
      const at = last ? Math.round(((last.at || 0) + (last.dur || 4) + 1) * 2) / 2 : 0;
      st.banners.push({ at, dur: 4, text: '' });
      refresh();
      ed.save();
    };
    refresh();
    ed.onStateLoaded(() => refresh()); // 读档后重渲染面板

    const norm = () => (st.banners ?? [])
      .filter((b) => b && String(b.text ?? '').trim())
      .map((b) => ({
        at: Math.max(0, Number(b.at) || 0),
        dur: Math.max(0.6, Number(b.dur) || 4),
        text: String(b.text),
      }));

    // 试玩：编辑器在插件注入前回调这里，把剧本写进试玩 scene（所见即所得）
    if (typeof ed.onPlayScene === 'function') {
      ed.onPlayScene((sc) => { sc.tutorialBanners = norm(); });
    }

    // 导出：把剧本写进关卡脚本（inject 之前——插件 run 当场读取排期）。
    // 多场景（chapters 接管导出）时不干预：其 Multiscene 脚本没有单 scene 变量。
    ed.onExport((lines, ctx) => {
      const list = norm();
      if (!list.length) return;
      if (!lines.some((l) => l.includes('const scene = L.build();'))) return; // chapters 接管：跳过
      const code = `scene.tutorialBanners = ${ctx.safeJson(list)}; // 新手引导模组：横幅剧本`;
      let idx = lines.findIndex((l) => l.includes('Chezzle.Plugin.inject'));
      if (idx < 0) idx = lines.findIndex((l) => l.trim().startsWith('L.start();'));
      if (idx >= 0) lines.splice(idx, 0, code);
      else lines.push(code);
    });
  },
});
