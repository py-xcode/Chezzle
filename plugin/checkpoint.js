// ============================================================================
// 存档点（checkpoint）—— 走到区域 / 进入场景时自动存档
// ----------------------------------------------------------------------------
// 引擎存档系统（Chezzle.Savepoint）负责"存什么/怎么读"：死亡后点屏幕回最近的
// 存档点（没有存档 = 整局重开）。本插件只负责"什么时候存"：
//   · on:'pos'（缺省）：玩家中心进入矩形区域 → 存档。从区域外进入算一次；
//     区域内连续停留不重复存档；离开后再进、或直接进入另一个区域会再存；
//     多场景切进本场景时按落点重新判定（落在区域内也算一次"进入"）；
//   · on:'enter'：进入该场景时存档（多场景关卡用，点的 scene 写场景名）。
//
// 兼容旧配置（旧"死亡自动复活"版）：
//   · spawns: [{scene?, id, x, y, w, h, sx?, sy?}] → 自动转成 on:'pos' 点；
//     sx/sy（复活点）忽略——读档恢复的是完整状态，玩家位置也在快照里；
//   · enterScenes: ['场景名', ...] → 每个场景一条 on:'enter' 点；
//   · texts（旧复活横幅文案）忽略。
//
// 用法（关卡脚本注入 / 编辑器 pluginCfg）：
//   plugins: [{ name: 'checkpoint', cfg: {
//     points: [
//       { id: 'start', x: 0, y: 0, w: 700, h: 800 },                 // 单场景：区域
//       { scene: 'canyon', id: 'c2', x: 0, y: 0, w: 900, h: 1000 },  // 多场景：各场景的点
//       { on: 'enter', scene: 'well', id: 'w1' },                    // 进入 well 即存档
//     ],
//     enterScenes: ['temple'],                                       // 等价于 on:'enter'
//   }}]
//
// 读档成功后引擎在每个场景 fire('checkpointRestored')：本插件把"当前所在区域"
// 重置为玩家站的位置（不存档），并借 Chezzle.Savepoint.restoredRecently()
// 跳过读档瞬间的自动存档，避免落回存档点时又存一次。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "存档点",
//   "version": "2.0",
//   "api": 1,
//   "description": "走到区域 / 进入场景时自动存档（死亡后点屏幕回到最近的存档点）。cfg.points=[{id?,scene?,on:'pos'|'enter',x?,y?,w?,h?}]；兼容旧 cfg.spawns（自动转 pos 点，sx/sy 忽略）与 cfg.enterScenes=[场景名]",
//   "fields": [
//     { "key": "points", "label": "存档点", "kind": "text" },
//     { "key": "enterScenes", "label": "进入即存档的场景", "kind": "text" }
//   ],
//   "enhance": []
// }
// @@end

Chezzle.Plugin.register('checkpoint', (() => {
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isPos = (p) => isNum(p.x) && isNum(p.y) && isNum(p.w) && isNum(p.h);

  /** 配置归一化：points + 旧 spawns + enterScenes → 统一点列表（不修改 cfg） */
  function normalizePoints(cfg) {
    const out = [];
    for (const p of Array.isArray(cfg.points) ? cfg.points : []) {
      if (!p || typeof p !== 'object') continue;
      if (p.on === 'enter') {
        if (typeof p.scene === 'string' && p.scene) out.push({ on: 'enter', scene: p.scene, id: p.id });
      } else if (isPos(p)) {
        out.push({ on: 'pos', scene: p.scene || null, id: p.id, x: p.x, y: p.y, w: p.w, h: p.h });
      }
    }
    // 旧配置 spawns：登记区域照旧，复活点 sx/sy 已由读档快照取代
    for (const s of Array.isArray(cfg.spawns) ? cfg.spawns : []) {
      if (s && isPos(s)) out.push({ on: 'pos', scene: s.scene || null, id: s.id, x: s.x, y: s.y, w: s.w, h: s.h });
    }
    // 旧配置 enterScenes：场景名列表 → 进入即存档
    for (const name of Array.isArray(cfg.enterScenes) ? cfg.enterScenes : []) {
      if (typeof name === 'string' && name) out.push({ on: 'enter', scene: name });
    }
    return out;
  }

  /** 当前场景在多场景管理器里的名字（单场景 = null；cfg.scene 是老配置的手写覆盖） */
  function sceneNameOf(scene, cfg) {
    if (typeof cfg.scene === 'string' && cfg.scene) return cfg.scene;
    const rawM = scene.multiscene ?? cfg.M;
    const M = typeof rawM === 'function' ? rawM() : rawM; // 编辑器流程传 () => M（构造期引用兼容）
    if (M && M.scenes) {
      for (const [name, e] of M.scenes) if (e && e.scene === scene) return name;
    }
    return null;
  }

  /** 订阅场景事件并返回取消函数（Scene.on 没有配对的 off，清理时直接从事件表移除） */
  function onScene(scene, name, fn) {
    scene.on(name, fn);
    return () => {
      const fns = scene._events && scene._events[name];
      const i = fns ? fns.indexOf(fn) : -1;
      if (i >= 0) fns.splice(i, 1);
    };
  }

  return {
    // 编辑器侧：旧 spawns/texts → points/enterScenes，经 pluginCfg 注入试玩/导出
    editor(ed) {
      const st = ed.state;
      if (!Array.isArray(st.points)) st.points = [];
      if (!Array.isArray(st.enterScenes)) st.enterScenes = [];
      // 旧配置迁移：spawns = 登记区域 + 复活点 → on:'pos' 区域（sx/sy/texts 不再使用）。
      // 用替换而不是追加：旧格式的存档 JSON 没有 points 字段，编辑器载入时其它关卡的
      // 旧 points 会残留在同一个 state 对象里，追加会把上一关的点带进来。
      const migrate = () => {
        if (!Array.isArray(st.spawns)) return;
        st.points = st.spawns.filter((s) => s && isPos(s)).map((s) => {
          const p = { on: 'pos', x: s.x, y: s.y, w: s.w, h: s.h };
          if (s.scene) p.scene = s.scene;
          if (s.id != null) p.id = s.id;
          return p;
        });
        delete st.spawns;
        delete st.texts;
      };
      migrate();
      const panel = ed.addPanel({
        title: '🎯 存档点',
        html: `<div class="tip-note">玩家进入区域（pos）或进入场景（enter）时自动存档；死亡后点屏幕回到最近的存档点。
        第一框 = points（JSON 数组）：{id?, scene?, on?:'pos'|'enter', x?, y?, w?, h?}（pos 用 x/y/w/h 矩形；enter 用 scene 场景名）。
        第二框 = enterScenes：进入即存档的场景名，逗号/空格分隔。</div>
        <textarea id="ckPoints" rows="12" style="width:100%;box-sizing:border-box;font:11px monospace"></textarea>
        <textarea id="ckEnter" rows="2" style="width:100%;box-sizing:border-box;font:11px monospace;margin-top:4px"></textarea>
        <button class="btn" id="ckSave" style="margin-top:4px">保存存档点</button>`,
      });
      const say = (s) => { const el = ed.$ && ed.$('#status'); if (el) el.textContent = s; };
      const parsePoints = (text) => {
        const arr = JSON.parse(text || '[]');
        if (!Array.isArray(arr)) throw new Error('points 必须是 JSON 数组');
        for (const p of arr) {
          if (!p || typeof p !== 'object') throw new Error('每个存档点必须是对象');
          if (p.on === 'enter') {
            if (typeof p.scene !== 'string' || !p.scene) throw new Error("enter 点必须写 scene（场景名）");
          } else if (p.on && p.on !== 'pos') {
            throw new Error("on 只能是 'pos' 或 'enter'");
          } else if (!isPos(p) || !(p.w > 0) || !(p.h > 0)) {
            throw new Error('pos 点必须是数字 x/y/w/h 且 w、h > 0');
          }
        }
        return arr;
      };
      const render = () => {
        panel.querySelector('#ckPoints').value = JSON.stringify(st.points, null, 1);
        panel.querySelector('#ckEnter').value = st.enterScenes.join(' ');
      };
      panel.querySelector('#ckSave').onclick = () => {
        try {
          st.points = parsePoints(panel.querySelector('#ckPoints').value);
          st.enterScenes = String(panel.querySelector('#ckEnter').value || '').split(/[\s,，、]+/).filter(Boolean);
          ed.save();
          render();
          say(`存档点已保存：${st.points.length} 个点、${st.enterScenes.length} 个进入即存档场景`);
        } catch (e) {
          say('存档点配置有误：' + e.message);
        }
      };
      render();
      ed.onStateLoaded(() => { migrate(); render(); });
      ed.pluginCfg(() => ({ points: st.points, enterScenes: st.enterScenes }));
    },

    run(scene, api, cfg = {}) {
      const points = normalizePoints(cfg);
      if (!points.length) return () => {};
      const myName = sceneNameOf(scene, cfg);
      // pos：本场景的点（没写 scene = 通用）；enter：必须正好是本场景
      const posPoints = points.filter((p) => p.on === 'pos' && (!p.scene || p.scene === myName));
      const enterPoints = points.filter((p) => p.on === 'enter' && p.scene === myName);
      if (!posPoints.length && !enterPoints.length) return () => {};
      const cancels = [];
      const SP = Chezzle.Savepoint;

      /** 玩家中心（人不在/隐藏 → null；开局延迟出现的玩家也走这条） */
      const centerOf = () => {
        const p = scene.player;
        if (!p || p.hidden) return null;
        if (!(p.w > 0) || !(p.h > 0)) return null;
        return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
      };
      /** 玩家所在的 pos 点下标（区域重叠取配置里第一个；不在任何区域 = null） */
      const regionAt = (cx, cy) => {
        for (let i = 0; i < posPoints.length; i++) {
          const r = posPoints[i];
          if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return i;
        }
        return null;
      };
      /** 死亡/通关瞬间、读档期间、刚读完档 → 不存新档 */
      const blocked = () => scene.status !== 'running' || SP.isRestoring() || SP.restoredRecently();

      let inside = null; // 当前所在区域下标（null = 区域外）；同区域连续停留不重复存
      if (posPoints.length) {
        cancels.push(api.onTick(() => {
          const c = centerOf();
          const i = c ? regionAt(c.x, c.y) : null;
          if (i === inside) return; // 停留/离开的同一状态：不重复存
          inside = i;
          if (i == null || blocked()) return; // 读档落点仍在区域内：只记位置，不存
          const p = posPoints[i];
          // ★ 不在 onTick 回调里同步存档：此刻引擎正在重建"本帧剩余"的 _tickFns，
          //   直接把快照存进去会让读档后的钩子表缺项（插件自己的 onTick 丢失，之后
          //   的存档点全部失效）。挪到下一帧 after 阶段——那时钩子表已完整。
          // ★ force：这是真实"进入新区域"（已在上面按区域边沿去重），不是连点重复；
          //   不带 force 时引擎 200ms 存档节流会把延迟队列里的快照静默丢掉（提示已弹、
          //   存档没落），之后回档会退到更旧的存档点。
          cancels.push(api.after(() => {
            if (blocked()) return;
            SP.save(scene, { id: p.id, force: true });
          }));
        }));
        // 读档成功：把"当前所在区域"重置成玩家实际位置（不存档），避免落点瞬间再存一次
        cancels.push(onScene(scene, 'checkpointRestored', () => {
          const c = centerOf();
          inside = c ? regionAt(c.x, c.y) : null;
        }));
        // 切进本场景：玩家是"瞬移"进来的（另一场景留下的 inside 已无意义）→ 清空后
        // 第一帧按落点重新判定，落在区域内 = 进入区域，存一次（章节入口即存档点）。
        cancels.push(onScene(scene, 'enter', () => { inside = null; }));
      }

      // 进入场景即存档：多场景切换时引擎在目标场景 fire('enter')（单场景没有该事件）。
      // force：每次 enter 是真实的一次场景进入（引擎不会连发），别被 200ms 节流静默丢掉。
      for (const p of enterPoints) {
        cancels.push(onScene(scene, 'enter', () => {
          if (blocked()) return;
          SP.save(scene, { id: p.id, force: true });
        }));
      }

      return () => { for (const c of cancels) c(); };
    },
  };
})());
