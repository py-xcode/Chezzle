// ============================================================================
// 画布淡入/淡出合成：**不要靠 ctx.globalAlpha 直接画带阴影的内容**。
// ----------------------------------------------------------------------------
// 实测（用户设备 iPadOS 26.6 Safari / WebKit，见 tools/fadetest.html 的诊断报告）：
//   绘制**带 shadowBlur 的内容**时 ctx.globalAlpha 被忽略 ——
//   · 大横幅（shadowBlur=18）与路标（shadowBlur=5）的淡入淡出**整个消失**（直接出现/消失）；
//   · 同一台设备上，无阴影文字、方块、rgba 填充、离屏 drawImage 全部正常；
//   · 所以只有"带发光阴影的文字"出问题（用户："仅仅对于路标"），桌面 Chrome 永不复现。
// 做法：把要淡入的内容先画到**离屏画布**（alpha=1，阴影照常烘焙进位图），
//       再用 drawImage + globalAlpha 把整张位图合成回来 —— 位图合成在所有引擎上都吃 alpha
//       （同设备实测：离屏预渲染 + globalAlpha drawImage 正常）。
// 无 document（Node 单元测试）/ 无位图可用时退回 globalAlpha 直画（保持原有可测行为）。
// ============================================================================

let offCv = null; // 复用的离屏画布（尺寸随主画布变化）

/** 以 alpha 淡入方式绘制：draw(ctx) 里正常画（含阴影），透明度由外层统一施加。
 *  @param {CanvasRenderingContext2D} ctx 目标上下文（主画布）
 *  @param {number} alpha 0..1
 *  @param {(c: CanvasRenderingContext2D) => void} draw 绘制回调（可能收到离屏上下文）
 */
export function drawFaded(ctx, alpha, draw) {
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  const canvas = ctx && ctx.canvas;
  const canComposite = typeof document !== 'undefined' && typeof document.createElement === 'function'
    && canvas && canvas.width > 0 && canvas.height > 0
    && typeof ctx.getTransform === 'function' && typeof ctx.drawImage === 'function';
  if (a >= 1 || !canComposite) {
    ctx.save();
    ctx.globalAlpha = a;
    draw(ctx);
    ctx.restore();
    return;
  }
  if (!offCv) offCv = document.createElement('canvas');
  if (offCv.width !== canvas.width || offCv.height !== canvas.height) {
    offCv.width = canvas.width;
    offCv.height = canvas.height;
  }
  // 逻辑尺寸/dpr 同步：对象里 screenTextScale() 等会读 ctx.canvas 上的这几个字段
  offCv._dpr = canvas._dpr;
  offCv._lw = canvas._lw;
  offCv._lh = canvas._lh;
  const fctx = offCv.getContext('2d');
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.clearRect(0, 0, offCv.width, offCv.height);
  const m = ctx.getTransform(); // 相机变换照抄，离屏内容与直接绘制像素对齐
  fctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  draw(fctx);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a;
  ctx.drawImage(offCv, 0, 0);
  ctx.restore();
}
