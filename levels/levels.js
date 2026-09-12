// ============================================================================
// Chezzle 选关配置加载器
// ----------------------------------------------------------------------------
// 关卡表已经搬到 **levels/levels.json**（可直接编辑那一个文件，含注释式 _说明 字段）。
// 本文件只做一件事：把它读进 window.CHEZZLE_LEVELS，并通过
// window.CHEZZLE_LEVELS_READY（Promise）告诉页面"配置好了"。
//
// 用法（页面）：
//   <script src="levels/levels.js"></script>
//   await window.CHEZZLE_LEVELS_READY;   // 之后 window.CHEZZLE_LEVELS 就是配置对象
//
// 注意：读取 JSON 用的是 fetch，需要通过 http(s) 打开页面
// （例如项目里常用的 `python -m http.server`）；直接 file:// 双击打开时浏览器会
// 拒绝读取本地 JSON，此时 CHEZZLE_LEVELS_READY 会 reject，页面会给出提示。
// ============================================================================
(function () {
  const url = 'levels/levels.json';
  window.CHEZZLE_LEVELS_READY = fetch(url, { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((json) => {
      window.CHEZZLE_LEVELS = json;
      return json;
    })
    .catch((err) => {
      console.error('[Chezzle] 读取 ' + url + ' 失败：' + err.message +
        '（请用 http 服务打开页面，例如 python -m http.server）');
      window.CHEZZLE_LEVELS = window.CHEZZLE_LEVELS || null;
      throw err;
    });
})();
