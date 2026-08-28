// ============================================================================
// HUD（神话·元素风）：
// 左上 信息卡（双端统一单卡：物质/体质 + 身体组成 + 大气一行；触屏半透明）；
// 右上 ⛶全屏（触屏）/ 鸟瞰 / 提示按钮（触屏端整体下移避让悬浮钮/系统按钮）；
// 右下 5 格宝石物品栏（选中发光）；通关/死亡神话遮罩；"最近反应"仅调试模式。
// 鸟瞰（灵魂出窍）：暂停模拟，整关自由缩放/平移——HUD 只留"返回"按钮 + 操作提示。
// ============================================================================

import { THEME, rr, panel, glowText, clearText } from './theme.js';
import { getSubstance, acidLabelOf } from '../chem/substances.js';
import { MIN_ENTRY } from '../chem/solution.js';
import { solutionColor } from './liquidrender.js';
import { CFG } from '../core/config.js';
import { GasColumn } from '../objects/gascolumn.js';
import { Block } from '../objects/block.js';
import { inventorySlotRects, uiMargins, overviewButtonRect, fullscreenButtonRect, hudTopOffset, touchInsetsOf } from '../level/click.js';
import { joyGeom, touchButtonRects } from '../core/touch.js';

// 溯源 kind → 中文（调试悬停显示物体"为何存在"）
const ORIGIN_LABELS = {
  level: '关卡生成',
  reaction: '反应生成',
  explosion: '爆炸掉落',
  place: '玩家放置',
  shell: '移动脱落',
  dissolve: '溶解',
};

// 大气中的非常驻气体 → 显示色（燃料气爆鸣预警等；airPanel/紧凑卡共用）
const GAS_COLORS = {
  CO: '#ffb86b', H2: '#9adcff', CH4: '#a8ff9a', H2S: '#ffd9a0',
  NO: '#cfe3f7', NO2: '#e08b57', SO2: '#ffd98a', Cl2: '#b9f26b', NH3: '#b9a9ff',
};
const EXTRA_GAS_IDS = ['CO', 'H2', 'CH4', 'H2S', 'NO', 'NO2', 'SO2', 'Cl2', 'NH3'];

export class Hud {
  constructor(scene) {
    this.scene = scene;
    this.showTip = false;
    this.slotSize = 46; // 旧版统一槽宽（现为兼容字段；实际几何走 inventorySlotRects）
  }

  /** 当前是否触屏端（移动端 HUD 压缩/全屏按钮都以它为准） */
  _isTouch() {
    const t = this.scene._touchUI;
    return !!(t && typeof t.enabled === 'function' && t.enabled());
  }

  render(ctx, time = 0) {
    const scene = this.scene;
    const p = scene.player;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 鸟瞰（灵魂出窍）：干净的全局视图——只画返回按钮/操作提示/玩家魂标
    if (scene.overview) {
      this.overviewUI(ctx, scene, W, H, time);
      this.rotateHint(ctx, scene, W, H);
      this.overlay(ctx, scene, W, H);
      ctx.restore();
      return;
    }

    if (p) {
      // 左上信息卡（双端统一紧凑单卡）：物质/体质 + 身体组成 + 大气一张卡解决；
      // 移动端面板体降透明（CFG.touch.hudAlpha），桌面不透明
      this.playerPanelCompact(ctx, p, scene, time, hudTopOffset(scene));
      // 最近反应本就是调试信息：非调试模式不显示（双端一致）
      if (scene.debugMode) this.reactionPanel(ctx, p);
      this.inventory(ctx, p, W, H, time);
    }
    this.debugPanel(ctx, scene, W, H, time);
    if (scene.debugMode) this.hoverPanel(ctx, scene, W, H);
    const top = hudTopOffset(scene);
    const right = touchInsetsOf(scene).right || 0;
    this.viewButton(ctx, W, top, right);
    if (this._isTouch()) this.fsButton(ctx, W, top, right);
    this.tipButton(ctx, W, H, top, right);
    this.notice(ctx, scene, W, H, time);
    this.touchControls(ctx, scene, W, H, time);
    this.rotateHint(ctx, scene, W, H);
    this.overlay(ctx, scene, W, H);
    ctx.restore();
  }

  // ---- 顶部按钮：鸟瞰（双端）/ 全屏（触屏）；y 走 hudTopOffset（触屏避让
  //      "返回选关"悬浮钮与 iOS 系统全屏关闭钮；渲染与命中同源）--------------

  /** 鸟瞰按钮（提示按钮左侧；桌面 V 键同效） */
  viewButton(ctx, W, top = 10, right = 0) {
    const r = overviewButtonRect(W, top, right);
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 9);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#2a3a5e');
    g.addColorStop(1, '#141d38');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.water.light;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = THEME.water.light;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#bfe6ff';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('鸟瞰', r.x + r.w / 2, r.y + 23);
    ctx.textAlign = 'left';
  }

  /** 全屏按钮（仅触屏端；图标 ⛶。首次触点已自动请求全屏，此按钮供随时切换） */
  fsButton(ctx, W, top = 10, right = 0) {
    const r = fullscreenButtonRect(W, top, right);
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 9);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#2a3a5e');
    g.addColorStop(1, '#141d38');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(191,230,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#bfe6ff';
    ctx.font = '17px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⛶', r.x + r.w / 2, r.y + 23);
    ctx.textAlign = 'left';
  }

  // ---- 鸟瞰（灵魂出窍）界面：返回按钮 + 操作提示（干净的全局视图）-----------

  overviewUI(ctx, scene, W, H, time) {
    const top = hudTopOffset(scene);
    // 返回按钮（命中几何走 overviewButtonRect，点击/触点均可退出）
    const r = overviewButtonRect(W, top, touchInsetsOf(scene).right || 0);
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 8);
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, '#7a5a20');
    g.addColorStop(1, '#4a3410');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.gold.light;
    ctx.lineWidth = 2;
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('返回', r.x + r.w / 2, r.y + 23);
    // 操作提示
    const touch = this._isTouch();
    const hint = touch ? '鸟瞰 · 单指拖动平移 · 双指捏合缩放' : '鸟瞰 · 滚轮缩放 · 拖动平移 · V 返回';
    ctx.font = 'bold 13px "Segoe UI", "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(hint).width;
    rr(ctx, W / 2 - tw / 2 - 14, top + 3, tw + 28, 28, 9);
    ctx.fillStyle = 'rgba(10,12,26,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,224,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#bfe6ff';
    ctx.fillText(hint, W / 2, top + 22);
    ctx.textAlign = 'left';
  }

  // ---- 移动端触控（摇杆 + 右下按钮；仅触屏设备绘制） ----
  touchControls(ctx, scene, W, H, time) {
    const ui = scene._touchUI;
    if (!ui || !ui.enabled()) return;
    if (scene.overview) return; // 鸟瞰：触控改走平移/捏合手势，不画游戏控件
    const touch = ui.insets;
    ctx.save();
    // —— 左下：半透明半圆摇杆基座（直径贴底边）——
    const g = joyGeom(W, H, touch);    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.R, Math.PI, 0); // 上半圆
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 5 向刻度（上/左上/右上/左/右），激活方向高亮
    const TICKS = [
      { ux: 0, uy: -1, on: () => ui.joy && ui.joy.dir.jump && !ui.joy.dir.left && !ui.joy.dir.right },
      { ux: -0.7071, uy: -0.7071, on: () => ui.joy && ui.joy.dir.jump && ui.joy.dir.left },
      { ux: 0.7071, uy: -0.7071, on: () => ui.joy && ui.joy.dir.jump && ui.joy.dir.right },
      { ux: -1, uy: 0, on: () => ui.joy && ui.joy.dir.left && !ui.joy.dir.jump },
      { ux: 1, uy: 0, on: () => ui.joy && ui.joy.dir.right && !ui.joy.dir.jump },
    ];
    for (const t of TICKS) {
      const tx = g.cx + t.ux * (g.R - 11);
      const ty = g.cy + t.uy * (g.R - 11);
      const active = t.on();
      ctx.beginPath();
      ctx.arc(tx, ty, active ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'rgba(255,215,106,0.9)' : 'rgba(232,184,75,0.35)';
      ctx.fill();
    }
    // 摇杆球（吸附位置；未触摸时居中淡显）
    const ox = ui.joy ? ui.joy.sx : 0;
    const oy = ui.joy ? ui.joy.sy : 0;
    ctx.beginPath();
    ctx.arc(g.cx + ox, g.cy + oy, 39, 0, Math.PI * 2);
    ctx.fillStyle = ui.joy ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = ui.joy ? 'rgba(255,215,106,0.85)' : 'rgba(232,184,75,0.4)';
    ctx.lineWidth = ui.joy ? 2 : 1.2;
    ctx.stroke();
    // —— 右下：四键（按住=长按语义同键盘；无玩家场景不画）。
    //     键位字母（C/X/Q/⇧）对触屏玩家无意义 → 换成语义 SVG 矢量图标 +
    //     下方二字说明（拾取/倒出/收集/放置）——
    if (scene.player) {
      const LABELS = { grab: '拾取', use: '倒出', collect: '收集', place: '放置' };
      for (const r of ui.buttonRects()) {
        const cap = LABELS[r.key] ?? '';
        const down = ui.isPressed(r.key);
        ctx.save();
        rr(ctx, r.x, r.y, r.size, r.size, 14);
        const gr = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.size);
        gr.addColorStop(0, down ? 'rgba(90,64,20,0.95)' : 'rgba(38,32,74,0.88)');
        gr.addColorStop(1, down ? 'rgba(48,32,10,0.95)' : 'rgba(14,11,36,0.88)');
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.strokeStyle = down ? 'rgba(255,215,106,0.95)' : 'rgba(232,184,75,0.45)';
        ctx.lineWidth = down ? 2 : 1.2;
        if (down) {
          ctx.shadowColor = 'rgba(255,215,106,0.8)';
          ctx.shadowBlur = 12;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        this._touchIcon(ctx, r.key, r.x + r.size / 2, r.y + r.size / 2 - 7, down ? '#fff6d8' : '#ffe9b0');
        ctx.fillStyle = down ? '#ffd76a' : 'rgba(255,233,176,0.62)';
        ctx.font = '11px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.fillText(cap, r.x + r.size / 2, r.y + r.size - 10);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** 触控按钮矢量图标（canvas 路径画的"SVG 小图"，原点 = 图标中心）：
   *  grab=上举箭头+烧杯（拾取容器；与"放置"下箭头成对） / use=倾斜烧杯倒液（倒出） /
   *  collect=马蹄磁铁（吸集） / place=落点箭头（放置到地上）。
   *  （"手"造型尝试过多版（四指/捏取/握拳）都读不出来，按用户指示改走抽象图标。） */
  _touchIcon(ctx, key, cx, cy, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.15, 1.15);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (key === 'grab') {
      // 拾取：上举箭头（左）+ 小烧杯（右）——"拿起容器"；箭头方向与"放置"（下）成对
      ctx.lineWidth = 3.0;
      ctx.moveTo(-5.0, 9.0); ctx.lineTo(-5.0, -2.2); // 箭杆
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-7.6, -1.6); ctx.lineTo(-5.0, -6.8); ctx.lineTo(-2.4, -1.6); // 箭头
      ctx.closePath();
      ctx.fill();
      // 小烧杯（白描边 + 青色液体）
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(2.6, -4.8); ctx.lineTo(2.6, -0.2);
      ctx.quadraticCurveTo(2.6, 4.0, 4.6, 4.0);
      ctx.quadraticCurveTo(6.6, 4.0, 6.6, -0.2);
      ctx.lineTo(6.6, -4.8);
      ctx.moveTo(1.9, -4.8); ctx.lineTo(7.3, -4.8); // 杯沿
      ctx.stroke();
      ctx.fillStyle = 'rgba(122,224,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(3.2, 3.5); ctx.lineTo(3.2, 1.4);
      ctx.quadraticCurveTo(3.2, 3.4, 4.6, 3.4);
      ctx.quadraticCurveTo(6.0, 3.4, 6.0, 1.4);
      ctx.lineTo(6.0, 3.5);
      ctx.fill();
      // 星闪（右下侧)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(8.6, -8.0); ctx.lineTo(8.6, -5.6); ctx.moveTo(7.4, -6.8); ctx.lineTo(9.8, -6.8);
      ctx.stroke();
    } else if (key === 'use') {
      // 倾斜小烧杯（顺时针倒向右侧）+ 液滴从口沿洒落
      ctx.rotate(0.55);
      ctx.moveTo(-6, -5);
      ctx.lineTo(-6, 5);
      ctx.quadraticCurveTo(-6, 7.5, -3.5, 7.5);
      ctx.lineTo(3.5, 7.5);
      ctx.quadraticCurveTo(6, 7.5, 6, 5);
      ctx.lineTo(6, -5);
      ctx.stroke();
      ctx.rotate(-0.55);
      ctx.beginPath(); ctx.arc(10.5, -1, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(13, 4.5, 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11.5, 10.5, 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (key === 'collect') {
      // 马蹄磁铁（开口朝下，两极短杠）——"吸集"沉淀
      ctx.moveTo(-7.5, 5);
      ctx.lineTo(-7.5, -1);
      ctx.arc(0, -1, 7.5, Math.PI, 0);
      ctx.lineTo(7.5, 5);
      ctx.moveTo(-3, 5);
      ctx.lineTo(-3, -1);
      ctx.arc(0, -1, 3, Math.PI, 0);
      ctx.lineTo(3, 5);
      ctx.stroke();
      ctx.fillRect(-7.5, 6.6, 4.5, 3);
      ctx.fillRect(3, 6.6, 4.5, 3);
    } else if (key === 'place') {
      // 下落箭头 + 地面基线（"放下去"）
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 2);
      ctx.moveTo(-4.5, -2.5);
      ctx.lineTo(0, 2);
      ctx.lineTo(4.5, -2.5);
      ctx.moveTo(-8.5, 8);
      ctx.lineTo(8.5, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 竖屏提示（移动端）：半透明压暗 + "竖放手机 + 环绕旋转箭头"图标 + 文案
   *  （游戏照常运行；图标与玩家当前握持方向一致——竖着的手机，箭头示意转过来） */
  rotateHint(ctx, scene, W, H) {
    const ui = scene._touchUI;
    if (!ui || !ui.isPortrait()) return;
    const GOLD = '#e8b84b';
    ctx.save();
    ctx.fillStyle = 'rgba(6,5,20,0.82)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.4;
    // —— 手机（竖放，与当前握持一致）：圆角机身 + 听筒条 + 淡淡的屏幕光 ——
    const pw = 66;
    const ph = 112;
    ctx.save();
    ctx.translate(cx, cy);
    rr(ctx, -pw / 2, -ph / 2, pw, ph, 14);
    ctx.fillStyle = 'rgba(232,184,75,0.08)';
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.beginPath(); // 听筒条
    ctx.moveTo(-11, -ph / 2 + 11);
    ctx.lineTo(11, -ph / 2 + 11);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    // —— 环绕旋转箭头：约 240° 的圆弧，缺口在右上，箭头指向缺口（顺时针转）——
    const r = Math.max(pw, ph) / 2 + 24;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r, -0.5, Math.PI + 0.5);
    ctx.stroke();
    const ea = Math.PI + 0.5; // 弧终点（左上），切线指向右上 → 顺时针
    const ex = r * Math.cos(ea);
    const ey = r * Math.sin(ea);
    const tx = -Math.sin(ea);
    const ty = Math.cos(ea);
    ctx.beginPath();
    ctx.moveTo(ex + tx * 17, ey + ty * 17); // 箭头尖（沿切线）
    ctx.lineTo(ex - ty * 10, ey + tx * 10); // 底边两点（垂直于切线）
    ctx.lineTo(ex + ty * 10, ey - tx * 10);
    ctx.closePath();
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.restore();
    // —— 文案 ——
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 22px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('请旋转设备', cx, cy + r + 50);
    ctx.fillStyle = '#9fb2c8';
    ctx.font = '14px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('横屏游玩体验更佳', cx, cy + r + 78);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /** 场景通知横幅（拖动超距 / 吸取失败原因等；淡入淡出 ~1.6s） */
  notice(ctx, scene, W, H, time) {
    const n = scene._notice;
    if (!n) return;
    // 用 HUD 自己的帧时钟计时（挂到通知对象上，避免与场景暂停时钟错位）
    if (n._ft == null) n._ft = time;
    const age = time - n._ft;
    if (age > 1.6) {
      delete scene._notice;
      return;
    }
    const a = Math.min(1, age / 0.12) * Math.max(0, Math.min(1, (1.6 - age) / 0.35));
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.font = 'bold 14px "Segoe UI", "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(n.text).width;
    const bw = tw + 30;
    const bx = W / 2 - bw / 2;
    const by = H * 0.15;
    rr(ctx, bx, by, bw, 30, 9);
    ctx.fillStyle = 'rgba(10,12,26,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,130,0.8)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = 'rgba(255,140,100,0.55)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffdcc8';
    ctx.textAlign = 'center';
    ctx.fillText(n.text, W / 2, by + 21);
    ctx.restore();
  }

  // ---- 调试模式面板（F5 暂停/继续，F6 步进；显示玩家附近的每个反应 + 最近爆炸原因）----
  debugPanel(ctx, scene, W, H, time) {
    if (!scene.debugMode) return;
    const p = scene.player;
    const barW = 280;
    const px = W - barW - 10;
    // 右上角状态条（堆叠面板的当前顶 y；触屏下移避让悬浮钮/系统按钮）
    let top = hudTopOffset(scene);
    panel(ctx, px, top, barW, 22, THEME.gold.deep, 8);
    clearText(ctx, `调试 ${scene.debugPaused ? '[暂停] F5继续 F6步进' : '[运行] F5暂停'}·悬停查源·X切换`, px, top + 11, scene.debugPaused ? '#ffd23f' : '#7fe0ff', 'bold 11px "Segoe UI", sans-serif');
    top += 28;
    // 最近爆炸原因（爆炸发生后 4s 内显示）
    if (scene._lastExplosion && time - scene._lastExplosion.t < 4) {
      panel(ctx, px, top, barW, 20, THEME.fire.base, 8);
      clearText(ctx, `💥 ${scene._lastExplosion.cause}`, px + 4, top + 14, '#ffd9a0', 'bold 11px monospace');
      top += 26;
    }
    // 附近反应面板（玩家周围 300px 内最近发生的反应，去重显示每种反应）
    if (scene.debugReactions && p) {
      const nearAll = scene.debugReactions.filter((r) => r.x != null && Math.abs(r.x - p.x) < 300 && Math.abs((r.y ?? 0) - (p.y + p.h / 2)) < 400);
      // 去重：每种反应保留最近一条（避免同一反应刷屏）
      const near = [];
      const seen = new Set();
      for (const r of nearAll) {
        if (seen.has(r.text)) continue;
        seen.add(r.text);
        near.push(r);
        if (near.length >= 8) break;
      }
      if (near.length > 0) {
        const shown = near.length;
        const panelW = 320;
        const panelH = 22 + shown * 16;
        panel(ctx, W - panelW - 10, top, panelW, panelH, THEME.gold.deep, 8);
        clearText(ctx, `附近反应 (${near.length})`, W - panelW + 2, top + 15, THEME.gold.text, 'bold 11px "Segoe UI", sans-serif');
        let y = top + 29;
        for (const r of near.slice(0, shown)) {
          clearText(ctx, `› ${r.text}`, W - panelW + 2, y + 5, '#dfe8f2', '10px monospace');
          y += 16;
        }
        top += panelH + 8;
      }
    }
    // 大气气体变化（产生/消耗原因——最近 6 条；+绿/消耗橙红，← 原因方程式）
    if (scene.gasLog && scene.gasLog.length) {
      const shown = Math.min(6, scene.gasLog.length);
      const panelW = 380;
      const panelH = 22 + shown * 15;
      const gx = W - panelW - 10;
      panel(ctx, gx, top, panelW, panelH, THEME.toxic.base, 8);
      clearText(ctx, `气体变化 (${scene.gasLog.length})`, gx + 12, top + 15, THEME.toxic.light, 'bold 11px "Segoe UI", sans-serif');
      let gy = top + 28;
      for (let i = 0; i < shown; i++) {
        const g = scene.gasLog[i];
        // 小量精确显示：≥0.01g 显示 2 位，≥0.001g 显示 4 位，更小显示毫克
        const absD = Math.abs(g.delta);
        const sign = g.delta >= 0 ? '+' : '-';
        const dStr = absD >= 0.01 ? `${sign}${absD.toFixed(2)}g` : absD >= 0.001 ? `${sign}${absD.toFixed(4)}g` : `${sign}${(absD * 1000).toFixed(1)}mg`;
        const color = g.delta >= 0 ? '#a6ff9a' : '#ff9a6b';
        clearText(ctx, `${g.id} ${dStr}`, gx + 12, gy + 5, color, 'bold 10px monospace');
        const cause = g.cause ?? '未知';
        clearText(ctx, `← ${cause.slice(0, 30)}`, gx + 90, gy + 5, '#9fb2c8', '9px monospace');
        gy += 15;
      }
    }
  }

  // ---- 调试模式：鼠标悬停显示物体"为何存在"（来源溯源；X 键循环切换重叠目标）----
  hoverPanel(ctx, scene, W, H) {
    const m = scene.mouse;
    if (!m || !m.on) return;
    const cam = scene.renderer ? scene.renderer.camera : null;
    if (!cam) return;
    // 屏幕坐标 → 世界坐标（相机缩放/平移；忽略每帧随机震动，悬停无需精确到像素）
    const { scale, offsetX, offsetY } = cam.compute(W, H, scene.player);
    const wx = (m.x - offsetX) / scale;
    const wy = (m.y - offsetY) / scale;
    // 鼠标移动 → 重置候选与索引
    if (!this._hoverAt || Math.abs(this._hoverAt.x - m.x) > 1 || Math.abs(this._hoverAt.y - m.y) > 1) {
      this._hoverAt = { x: m.x, y: m.y };
      this._hoverIdx = 0;
    }
    const cands = this.collectHover(scene, wx, wy);
    if (cands.length === 0) return;
    // X 键（scene.debugHoverCycle）：在重叠物体间循环切换
    if (scene.debugHoverCycle) {
      scene.debugHoverCycle = false;
      this._hoverIdx = (this._hoverIdx + 1) % cands.length;
    }
    if (this._hoverIdx >= cands.length) this._hoverIdx = 0;
    const info = cands[this._hoverIdx];
    this.renderHoverTip(ctx, info, m.x, m.y, W, H, cands.length > 1 ? { idx: this._hoverIdx + 1, total: cands.length } : null);
  }

  /**
   * 命中检测：收集鼠标下所有重叠物体的来源信息（按优先级排序——
   * 玩家>沉淀>池内颗粒>物块>气流>容器/静态）。默认显示第 0 个，X 键循环切换。
   */
  collectHover(scene, wx, wy) {
    const out = [];
    const hitRect = (o) => o && wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h;
    const inCircle = (cx, cy, r) => {
      const dx = wx - cx;
      const dy = wy - cy;
      return dx * dx + dy * dy <= r * r;
    };

    // 1. 玩家（核心+附着的壳：NaOH 关卡生成，Na2CO3/BaCO3 壳反应生成）
    const p = scene.player;
    if (p && hitRect(p)) {
      const info = this.objInfo(p, p.substance);
      const bd = this.gridBreakdown(p);
      if (bd && bd.length > 1) info.breakdown = bd;
      out.push(info);
    }

    // 2. 自由沉淀粒子（小圆；同种且重叠的合并为一条候选——与渲染聚类一致，
    //    否则掉落的一簇 20 颗叠在一起 → 悬停显示 20 条候选"20 个粒子叠在一起"）
    const hitParts = [];
    for (const pt of scene.particles) {
      if (pt.amount <= 1e-9) continue;
      if (inCircle(pt.x + pt.w / 2, pt.y + pt.h / 2, pt.w / 2 + 1)) hitParts.push(pt);
    }
    const merged = new Map(); // substance → { count, pt }
    for (const pt of hitParts) {
      const e = merged.get(pt.substance);
      if (e) { e.count++; continue; }
      merged.set(pt.substance, { count: 1, pt });
    }
    for (const [substance, e] of merged) {
      const info = this.objInfo(e.pt, e.count > 1 ? `${substance}×${e.count}` : substance);
      out.push(info);
    }

    // 3. 容器内沉淀颗粒（池/灯上的某一颗沉淀）
    for (const c of scene.containers) {
      for (const g of c.grains) {
        if (inCircle(g.x, g.y, g.r + 1)) {
          const origin = c.precipOrigins.get(g.id) ?? null;
          out.push({ label: '沉淀', name: `${g.id}（${c.hoverLabel ?? '容器'}内）`, origin });
        }
      }
    }

    // 4. 物块（动态固体；含多种物质时逐物质显示来源——初始=关卡生成、反应附着=反应生成）
    for (const o of scene.dynamics) {
      if (!(o instanceof Block) || !hitRect(o)) continue;
      const info = this.objInfo(o, o.grid ? o.grid.ids().join('+') : o.substance);
      const bd = this.gridBreakdown(o);
      if (bd && bd.length > 1) info.breakdown = bd;
      out.push(info);
    }

    // 5. 气流柱（反应产气的气流——显示是哪个反应生成的）
    for (const o of scene.objects) {
      if (!(o instanceof GasColumn) || !hitRect(o)) continue;
      out.push(this.objInfo(o, o.gasId ?? o.label ?? ''));
    }

    // 6. 容器/灯/静态元素（池、灯、开关、地板、路标、钥匙、门…）
    for (const o of scene.objects) {
      if (!o.hoverLabel || o instanceof GasColumn || o instanceof Block || o === p) continue;
      if (!hitRect(o)) continue;
      const info = this.objInfo(o, (o.opening ?? o.substance ?? ''));
      // 容器/灯：逐物质显示来源（某物质关卡生成、某物质反应生成…）
      if (o.solution || o.precipitates) info.breakdown = this.contentBreakdown(o);
      out.push(info);
    }
    return out;
  }

  /** 容器/灯内各物质及其来源（溶质 + 沉淀 + 水，按质量降序）——悬停药品池显示每样多少克 */
  contentBreakdown(c) {
    const out = [];
    for (const [id, mass] of c.solution.solutes) {
      if (mass < MIN_ENTRY) continue; // 微量溶质不显示：防"0.0g ↔ 无"的条目抖动
      // 酸类标注浓/稀（≥300 g/L = 浓，与引擎判定一致）
      const note = acidLabelOf(id, mass, c.solution.volume / 1000);
      out.push({ id, mass, origin: c.solOrigins?.get(id) ?? null, note });
    }
    for (const [id, mass] of c.precipitates) {
      if (mass < MIN_ENTRY) continue;
      // 沉淀标注合并数（几颗 0.5g 合并显示）：与自由沉淀粒子同规则
      out.push({ id, mass, origin: c.precipOrigins?.get(id) ?? null, note: `↓×${Math.max(1, Math.ceil(mass / CFG.maxParticleMass))}` });
    }
    if (c.solution.water > 0) out.push({ id: 'H2O', mass: c.solution.water, origin: { kind: 'solvent' } });
    return out.sort((a, b) => b.mass - a.mass);
  }

  /** 物块/玩家网格内各物质及其来源（初始=关卡生成，反应附着=反应生成） */
  gridBreakdown(o) {
    const masses = o.grid ? o.grid.masses() : null;
    if (!masses) return null;
    const out = [];
    for (const [id, mass] of Object.entries(masses)) {
      if (mass <= 1e-6) continue;
      out.push({ id, mass, origin: o.gridOrigins?.get(id) ?? null });
    }
    return out.sort((a, b) => b.mass - a.mass);
  }

  /** 组装提示信息 */
  objInfo(obj, name, origin = null) {
    return { label: obj.hoverLabel ?? '元素', name, origin: origin ?? obj.origin ?? null };
  }

  /** 容器内容标签（溶质 + 沉淀） */
  containerName(c) {
    const parts = [];
    for (const [id] of c.solution.solutes) parts.push(id);
    for (const [id] of c.precipitates) parts.push(`${id}(↓)`);
    if (parts.length === 0 && c.solution.water > 0) parts.push('H2O');
    return parts.join('+') || '空';
  }

  /** 来源短标签（只给种类，如"关卡生成/反应生成"） */
  originShort(origin) {
    if (!origin) return '未知';
    return ORIGIN_LABELS[origin.kind] ?? origin.kind;
  }

  /** 来源文本行（反应生成给出具体方程式，超长自动换行） */
  originLines(origin) {
    if (!origin) return ['来源：未知'];
    const head = ORIGIN_LABELS[origin.kind] ?? origin.kind;
    if (origin.kind === 'reaction' && origin.text) {
      return [`来源：${head}`, ...this.wrapCJK(origin.text, 34)];
    }
    if (origin.text) return [`来源：${head}（${origin.text}）`];
    return [`来源：${head}`];
  }

  /** 按字符宽度换行（中英混排按字符数截断） */
  wrapCJK(text, maxLen) {
    const out = [];
    for (let i = 0; i < text.length; i += maxLen) out.push(text.slice(i, i + maxLen));
    return out;
  }

  /** 渲染悬停提示框（鼠标附近，钳在画布内）；multi = {idx,total} 表示重叠目标循环切换 */
  renderHoverTip(ctx, info, sx, sy, W, H, multi = null) {
    let lines;
    if (info.breakdown && info.breakdown.length) {
      // 容器/灯/物块：逐物质显示来源 + 质量（各物质名 + 克数 + 来源，反应给方程式）
      lines = [`${info.label}（${info.breakdown.length} 种）`];
      const shown = info.breakdown.slice(0, 8);
      for (const it of shown) {
        const isWater = it.id === 'H2O';
        const tag = it.note ? `(${it.note})` : '';
        lines.push(`  ${it.id}${tag} ${it.mass.toFixed(1)}g · ${isWater ? '溶剂' : this.originShort(it.origin)}`);
        if (it.origin && it.origin.kind === 'reaction' && it.origin.text) {
          lines.push(...this.wrapCJK(it.origin.text, 30).map((s) => '    ' + s));
        }
      }
      if (info.breakdown.length > shown.length) lines.push(`  …另有 ${info.breakdown.length - shown.length} 种`);
    } else {
      lines = [`${info.label} ${info.name}`, ...this.originLines(info.origin)];
    }
    if (multi) lines.push(`⟨ ${multi.idx}/${multi.total} · 按 X 切换 ⌦`);
    const font = '11px monospace';
    ctx.save();
    ctx.font = font;
    const pad = 8;
    const lh = 17;
    const maxW = Math.min(320, Math.max(...lines.map((ln) => ctx.measureText(ln).width)));
    const boxW = maxW + pad * 2;
    const boxH = lines.length * lh + 8;
    // 位置：鼠标右下偏移 14/20，越界则翻到鼠标另一侧/上侧
    let bx = sx + 14;
    let by = sy + 20;
    if (bx + boxW > W - 6) bx = sx - boxW - 14;
    if (by + boxH > H - 6) by = sy - boxH - 20;
    bx = Math.max(6, bx);
    by = Math.max(6, by);
    // 面板 + 发光描边
    panel(ctx, bx, by, boxW, boxH, THEME.water.base, 6);
    ctx.font = font;
    let y = by + 15;
    for (let i = 0; i < lines.length; i++) {
      // 标题行金色加粗，方程式行青色，来源行白色
      const color = i === 0 ? THEME.gold.text : i === 1 ? '#dfe8f2' : '#9fd8ff';
      clearText(ctx, lines[i], bx + pad, y, color, i === 0 ? 'bold 11px monospace' : font);
      y += lh;
    }
    ctx.restore();
  }

  // ---- 玩家信息卡（双端统一紧凑单卡）：物质/体质 + 身体组成 + 大气一行 ----
  // 原桌面三张卡（玩家/组成/空气）竖排 + 移动端重复一套——统一成这一张：
  // 屏幕占用最小、信息不缺；移动端面板体按 CFG.touch.hudAlpha 降透明（文字不降）。
  playerPanelCompact(ctx, p, scene, time, top = 10) {
    const x0 = 10 + (touchInsetsOf(scene).left || 0); // 刘海横屏：卡片让出左缘安全区
    const atm = scene.atmosphere;
    // 身体组成（多物质才显示，单物质=血量本身）
    const masses = p.grid ? p.grid.masses() : null;
    const entries = masses
      ? Object.entries(masses).filter(([, m]) => m > 1e-6).sort((a, b) => b[1] - a[1])
      : [];
    const compRows = entries.length > 1 ? Math.min(3, entries.length) : 0;
    // 大气（一行 O2/CO2；有预警气体再加一行）
    const extras = atm
      ? EXTRA_GAS_IDS.map((id) => ({ id, frac: atm.fraction(id) * 100, mass: atm.mass(id) })).filter((g) => g.mass > 0.01)
      : [];
    const airLines = 1 + (extras.length ? 1 : 0);
    const w = 280;
    const h = 72
      + (compRows ? 17 + compRows * 17 + (entries.length > compRows ? 13 : 0) : 0)
      + airLines * 16 + 8;
    this._leftH = h; // 左上卡实际高度（调试模式"最近反应"面板的堆叠定位用）
    ctx.save();
    ctx.globalAlpha = this._isTouch() ? CFG.touch.hudAlpha : 1;
    panel(ctx, x0, top, w, h, THEME.gold.deep, 12);
    ctx.restore();
    // 头部：血量药瓶 + 物质 + 体质
    const sub = getSubstance(p.substance);
    const color = sub?.solid?.[0] ?? '#7fe0ff';
    const ratio = p.maxHp ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
    this.vial(ctx, x0 + 14, top + 9, 30, 46, ratio, color, time);
    clearText(ctx, p.substance, x0 + 56, top + 26, THEME.gold.text, 'bold 16px "Segoe UI", sans-serif');
    clearText(ctx, `${p.hp.toFixed(1)} g 体质`, x0 + 56, top + 47, '#ffffff', 'bold 12.5px monospace');
    let y = top + 72;
    if (compRows) {
      clearText(ctx, '身体组成', x0 + 10, y, 'rgba(255,233,176,0.85)', 'bold 10px "Segoe UI", sans-serif');
      y += 15;
      for (const [id, m] of entries.slice(0, compRows)) {
        const sc = getSubstance(id);
        const isCore = id === p.substance;
        ctx.save();
        if (isCore) {
          ctx.shadowColor = THEME.gold.text;
          ctx.shadowBlur = 5;
        }
        ctx.fillStyle = sc?.solid?.[0] ?? '#7fe0ff';
        ctx.beginPath();
        ctx.arc(x0 + 18, y + 3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        clearText(ctx, id, x0 + 29, y + 7, isCore ? THEME.gold.text : '#dfe8f2', '10.5px monospace');
        ctx.textAlign = 'right';
        clearText(ctx, `${m.toFixed(1)}g`, x0 + w - 16, y + 7, '#9fb2c8', '10px monospace');
        ctx.textAlign = 'left';
        y += 17;
      }
      if (entries.length > compRows) {
        clearText(ctx, `…另有 ${entries.length - compRows} 种`, x0 + 10, y + 6, '#9fb2c8', '10px monospace');
        y += 13;
      }
      y += 2;
    }
    // 大气行：O2（青）· CO2（金）
    const o2 = atm ? atm.fraction('O2') * 100 : 0;
    const co2 = atm ? atm.fraction('CO2') * 100 : 0;
    const co2Mass = atm ? atm.mass('CO2') : 0;
    const co2Text = co2 >= 0.05 ? `${co2.toFixed(1)}%` : co2Mass > 1e-6 ? '<0.1%' : '0%';
    clearText(ctx, `O2 ${o2.toFixed(1)}%`, x0 + 10, y + 6, '#aeeaff', 'bold 11px monospace');
    clearText(ctx, `CO2 ${co2Text}`, x0 + 108, y + 6, '#ffe9b0', 'bold 11px monospace');
    y += 16;
    // 预警气体行（有质量才显示）：色点 + 缩略列表
    if (extras.length) {
      let gx = x0 + 10;
      for (const g of extras.slice(0, 3)) {
        const c = GAS_COLORS[g.id] ?? '#ffffff';
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(gx + 3.5, y - 1, 3.4, 0, Math.PI * 2);
        ctx.fill();
        const t = g.frac >= 0.05 ? `${g.frac.toFixed(1)}%` : '<0.1%';
        const label = `${g.id} ${t}`;
        clearText(ctx, label, gx + 10, y + 4, c, 'bold 10px monospace');
        gx += 14 + label.length * 6.2 + 7;
      }
      if (extras.length > 3) clearText(ctx, `+${extras.length - 3}`, gx + 4, y + 4, '#9fb2c8', '10px monospace');
    }
  }

  /** 血量药瓶：玻璃烧瓶 + 发光液体填充 */
  vial(ctx, x, y, w, h, ratio, color, time) {
    ctx.save();
    rr(ctx, x, y, w, h, w / 2.4);
    ctx.fillStyle = 'rgba(190,225,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,235,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 液体
    const lh = h * Math.max(0.06, Math.min(1, ratio));
    ctx.save();
    rr(ctx, x + 1.5, y + h - lh, w - 3, lh, w / 3);
    ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#d8f6ff');
    g.addColorStop(0.5, color);
    g.addColorStop(1, '#0e2a44');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    // 液面辉光（随血量轻微脉动）
    const pulse = 6 + 4 * Math.sin(time * 3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color;
    ctx.shadowBlur = pulse;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + 1, y + h - lh, w - 2, 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ---- 玩家反应日志（最近发生在玩家身上的反应；调试模式专属）----
  reactionPanel(ctx, p) {
    if (!p.reactions || p.reactions.length === 0) return;
    const shown = Math.min(4, p.reactions.length);
    const W = 264;
    const H = 22 + shown * 17;
    // 排在左上信息卡下方（卡高度可变，按实际高度堆叠）
    const top = hudTopOffset(this.scene) + (this._leftH ?? 126) + 6;
    panel(ctx, 10, top, W, H, THEME.gold.deep, 10);
    clearText(ctx, '最近反应', 22, top + 12, THEME.gold.text, 'bold 11px "Segoe UI", sans-serif');
    let y = top + 26;
    for (let i = 0; i < shown; i++) {
      clearText(ctx, `› ${p.reactions[i]}`, 22, y + 6, '#dfe8f2', '10px monospace');
      y += 17;
    }
  }


  // ---- 物品栏（宝石槽）：装物品的格子放大 + 内容物溶质显示 + 获取弹跳 ----
  inventory(ctx, p, W, H, time) {
    const slots = p.inventory.slots;
    const rects = inventorySlotRects(W, H, slots, uiMargins(this.scene));
    if (!this._pop) this._pop = {}; // 物品格弹跳计时 {i:{sig,t}}
    let minTop = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const x = r.x;
      const sy = r.y;
      const size = r.size;
      minTop = Math.min(minTop, sy);
      const sel = i === p.inventory.selected;
      // 弹跳：物品格内容变化（新装/吸液/倒出/收气）时缩放脉冲一下
      const s = slots[i];
      let sc = 1;
      if (s && s.item && s.obj) {
        const o = s.obj;
        const sig = s.item === 'beaker' ? `${o.solution ? o.solution.totalMass() : 0}`
          : s.item === 'dropper' ? `${o.liquid}${o.substance}`
            : `${o.totalGas()}${o.gases.size}`;
        const rec = this._pop[i];
        if (!rec || rec.sig !== sig) this._pop[i] = { sig, t: time };
        const pt = time - this._pop[i].t;
        sc = 1 + 0.2 * Math.sin(Math.min(1, pt / 0.32) * Math.PI) * (1 - pt / 0.32);
      }
      ctx.save();
      if (sc > 1.001) {
        ctx.translate(x + size / 2, sy + size / 2);
        ctx.scale(sc, sc);
        ctx.translate(-(x + size / 2), -(sy + size / 2));
      }
      ctx.save();
      rr(ctx, x, sy, size, size, 12);
      const g = ctx.createLinearGradient(x, sy, x, sy + size);
      g.addColorStop(0, sel ? 'rgba(70,50,16,0.96)' : 'rgba(30,26,62,0.92)');
      g.addColorStop(1, sel ? 'rgba(32,22,8,0.96)' : 'rgba(12,9,32,0.92)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = sel ? THEME.gold.light : 'rgba(232,184,75,0.35)';
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.shadowColor = THEME.gold.light;
      ctx.shadowBlur = sel ? 10 + 4 * Math.sin(time * 4) : 0;
      ctx.stroke();
      ctx.restore();

      if (s) {
        if (s.item) {
          this.drawItemIcon(ctx, s, r, time);
        } else {
          this.drawSubstanceSlot(ctx, s, x, sy, size, sel);
        }
      } else {
        // 空槽：淡符文环
        ctx.strokeStyle = 'rgba(232,184,75,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + size / 2, sy + size / 2, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 选中物品 → 在物品栏上方显示"名称 + 内容组成 + 质量"（槽内不再挤文字，
    // 说明文字也撤掉——内容一眼即懂）
    const selItem = p.inventory.selectedItem();
    if (selItem) {
      // 注意：selectedItem() 返回的就是物品实例本身（不是槽位条目），直接读它
      const o = selItem;
      let title = '';
      let comp = '';
      let mass = '';
      let color = '#fff6dd';
      if (selItem.isCarryItem === 'beaker') {
        const total = o.solution ? o.solution.totalMass() : 0;
        title = '烧杯';
        comp = this._contentLine(o.solution ? [...o.solution.solutes.entries()] : [], total > 0.05 ? '水' : '空');
        mass = `${total.toFixed(1)}g`;
        if (o.solution && comp !== '空' && comp !== '水') color = solutionColor(o.solution).color;
      } else if (selItem.isCarryItem === 'dropper') {
        title = '滴管';
        comp = o.liquid > 1e-9 ? (o.substance === 'H2O' ? '水' : o.substance) : '空';
        mass = o.liquid > 1e-9 ? `${o.liquid.toFixed(1)}g` : '';
        if (o.liquid > 1e-9 && o.substance !== 'H2O') color = o.liquidColor().color;
      } else {
        title = '集气瓶';
        comp = o.totalGas() > 1e-9 ? this._contentLine([...o.gases.entries()], '') : '空';
        mass = o.totalGas() > 1e-9 ? `${o.totalGas().toFixed(2)}g / ${o.capacity.toFixed(0)}g` : '';
        if (o.totalGas() > 1e-9) color = o.gasColor();
      }
      ctx.save();
      ctx.font = 'bold 12.5px "Segoe UI", "Microsoft YaHei", sans-serif';
      const w1 = ctx.measureText(`${title}　${mass}`).width;
      ctx.font = 'bold 11px monospace';
      const w2 = ctx.measureText(comp).width;
      const bw = Math.max(w1, w2) + 24;
      const bx = W - (this._isTouch() ? (this.scene._touchUI.insets.right || 0) : 0) - bw - 12; // 右对齐：贴物品栏右缘上方
      let by = minTop - 56;
      // 触屏端：物品栏上方是 C/X/Q/⇧ 按钮块——面板再往上挪，不叠在按钮上
      if (this._isTouch()) {
        const ui = this.scene._touchUI;
        const btns = touchButtonRects(W, H, slots, ui && ui.insets ? ui.insets : {});
        let btnTop = Infinity;
        for (const b of btns) btnTop = Math.min(btnTop, b.y);
        if (btnTop < Infinity) by = btnTop - 50;
      }
      rr(ctx, bx, by, bw, 44, 9);
      const g = ctx.createLinearGradient(bx, by, bx, by + 44);
      g.addColorStop(0, 'rgba(26,22,52,0.95)');
      g.addColorStop(1, 'rgba(12,10,30,0.95)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,184,75,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = 'bold 12.5px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(`${title}　${mass}`, bx + 12, by + 18);
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = color;
      ctx.fillText(comp, bx + 12, by + 36);
      ctx.restore();
    }
  }

  /** 物质格：元素色圆点 + 名称 + 质量 */
  drawSubstanceSlot(ctx, s, x, sy, size, sel) {
    const sub = getSubstance(s.substance);
    const c = sub?.solid?.[0] ?? '#c8c8c8';
    ctx.save();
    ctx.fillStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x + size / 2, sy + 22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = sel ? '#fff6dd' : THEME.gold.text;
    ctx.font = 'bold 9.5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.substance, x + size / 2, sy + 15);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#ffffff';
    const m = Number.isFinite(s.mass) ? s.mass : 0; // NaN 质量显示 0，不显示 NaN
    ctx.fillText(`${m.toFixed(1)}g`, x + size / 2, sy + size - 8);
    ctx.textAlign = 'left';
  }

  /** 容器内容物一行字（主要溶质/溶剂），最多 2 种；超出截断加省略号 */
  _contentLine(entries, emptyText = '') {
    const list = entries.filter(([, m]) => m > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
    if (!list.length) return emptyText;
    let str = list.join('+');
    if (str.length > 11) str = `${str.slice(0, 10)}…`;
    return str;
  }

  /** 物品格图标（烧杯/滴管/集气瓶——不堆叠，一物一格）。
   *  槽内**只画物体本身**（成分/名称挪到上方"选中物品"面板，免得文字糊住造型）；
   *  仅右下角保留一个小小的质量数字。 */
  drawItemIcon(ctx, s, r, time) {
    const o = s.obj;
    const size = r.size;
    const cx = r.x + size / 2;
    const cy = r.y + size / 2 + 1;
    ctx.save();
    ctx.textAlign = 'center';
    if (s.item === 'beaker') {
      // 迷你烧杯：U 形玻璃 + 按液量比例的液面
      const bw = 21;
      const bh = 27;
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + 3;
      const { color, alpha } = o.solution ? solutionColor(o.solution) : { color: '#9adcff', alpha: 0.2 };
      const vol = o.solution && o.solution.volume > 0 ? o.solution.volume : CFG.item.beakerCapacity;
      const frac = Math.max(0, Math.min(1, (o.solution ? o.solution.totalMass() : 0) / vol));
      const lh = Math.max(0.01, (bh - 4) * frac);
      if (frac > 0.01) {
        ctx.globalAlpha = Math.max(alpha, 0.35);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(bx + 1, by + bh - 1 - lh, bw - 2, lh, 2);
        ctx.fill();
        // 液面亮线
        ctx.globalAlpha = Math.min(1, alpha + 0.25);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(bx + 1.5, by + bh - 1 - lh, bw - 3, 1);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(225,245,255,0.88)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + 0.5, by);
      ctx.lineTo(bx + 0.5, by + bh - 3);
      ctx.quadraticCurveTo(bx + 0.5, by + bh - 0.5, bx + 3, by + bh - 0.5);
      ctx.lineTo(bx + bw - 3, by + bh - 0.5);
      ctx.quadraticCurveTo(bx + bw - 0.5, by + bh - 0.5, bx + bw - 0.5, by + bh - 3);
      ctx.lineTo(bx + bw - 0.5, by);
      ctx.stroke();
      this._slotGrams(ctx, `${(o.solution ? o.solution.totalMass() : 0).toFixed(0)}g`, cx, r.y + size - 5);
    } else if (s.item === 'dropper') {
      // 迷你滴管：胶头泪滴 → 颈环 → 锥形玻璃管（内充液体、液面高光）→ 尖嘴 → 刻度线
      ctx.save();
      ctx.translate(cx, cy - 3);
      const { color } = o.liquid > 1e-9 ? o.liquidColor() : { color: '#9fdcff' };
      const frac = Math.max(0, Math.min(1, o.liquid / o.capacity));
      // 胶头（红色泪滴：圆肩收腰）
      const bg = ctx.createRadialGradient(-1.5, -22, 1, 0, -18, 10);
      bg.addColorStop(0, '#e2596a');
      bg.addColorStop(1, '#a12634');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(-5.2, -11);
      ctx.bezierCurveTo(-7.5, -19, -4.5, -24.5, 0, -24.5);
      ctx.bezierCurveTo(4.5, -24.5, 7.5, -19, 5.2, -11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(-2, -20, 1.5, 2.6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      // 颈环（固定胶头的金属箍）
      ctx.fillStyle = '#d8b45c';
      ctx.fillRect(-4.4, -11.5, 8.8, 2.4);
      // 玻璃管（上宽下窄的锥形）
      const tubeTop = -9;
      const tubeBot = 13;
      ctx.beginPath();
      ctx.moveTo(-2.8, tubeTop);
      ctx.lineTo(2.8, tubeTop);
      ctx.lineTo(1.15, tubeBot);
      ctx.lineTo(-1.15, tubeBot);
      ctx.closePath();
      ctx.fillStyle = 'rgba(215,235,255,0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(225,245,255,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 管内液体（按比例自底向上；顶部液面小椭圆高光）
      if (frac > 0.01) {
        const hInner = tubeBot - tubeTop - 1.6;
        const lh = hInner * frac;
        const ly = tubeBot - 0.8 - lh;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(-2.25, tubeTop + 0.6);
        ctx.lineTo(2.25, tubeTop + 0.6);
        ctx.lineTo(0.95, tubeBot - 0.8);
        ctx.lineTo(-0.95, tubeBot - 0.8);
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = Math.max(0.42, o.liquidColor().alpha ?? 0.6);
        ctx.fillStyle = color;
        ctx.fillRect(-3, ly, 6, lh + 2);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.ellipse(0, ly + 0.6, 1.9 - (1.05 * (lh / hInner)), 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // 尖嘴（细口）
      ctx.beginPath();
      ctx.moveTo(-1.15, tubeBot);
      ctx.lineTo(0, tubeBot + 6.5);
      ctx.lineTo(1.15, tubeBot);
      ctx.closePath();
      ctx.fillStyle = 'rgba(215,235,255,0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(215,235,255,0.75)';
      ctx.stroke();
      // 刻度短线（右侧三道）
      ctx.strokeStyle = 'rgba(235,245,255,0.55)';
      ctx.lineWidth = 0.8;
      for (let i = 1; i <= 3; i++) {
        const yy = tubeBot - i * 4.5;
        const half = 2.6 - i * 0.45;
        ctx.beginPath();
        ctx.moveTo(half, yy);
        ctx.lineTo(half + 2.4, yy);
        ctx.stroke();
      }
      ctx.restore();
      this._slotGrams(ctx, o.liquid > 1e-9 ? `${o.liquid.toFixed(1)}g` : '', cx, r.y + size - 5);
    } else if (s.item === 'bottle') {
      // 迷你集气瓶：玻璃瓶 + 气体填充 + 盖板横杠
      const bw = 18;
      const bh = 26;
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + 4;
      const frac = Math.max(0, Math.min(1, o.totalGas() / o.capacity));
      const color = o.gasColor();
      if (frac > 0.01) {
        const hex = color.replace('#', '');
        const cr = parseInt(hex.slice(0, 2), 16);
        const cg = parseInt(hex.slice(2, 4), 16);
        const cb = parseInt(hex.slice(4, 6), 16);
        ctx.globalAlpha = 0.45 + 0.2 * frac;
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.roundRect(bx + 1, by + bh - 13 * frac, bw - 2, 13 * frac, 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(215,235,255,0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + 4, by);
      ctx.lineTo(bx + 5, by - 4);
      ctx.lineTo(bx + bw - 5, by - 4);
      ctx.lineTo(bx + bw - 4, by);
      ctx.stroke();
      // 盖板（横杠盖在瓶口上方）
      ctx.strokeStyle = 'rgba(240,250,255,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + 1, by - 6);
      ctx.lineTo(bx + bw - 1, by - 6);
      ctx.stroke();
      this._slotGrams(ctx, o.totalGas() > 1e-9 ? `${o.totalGas().toFixed(1)}g` : '', cx, r.y + size - 5);
    }
    ctx.restore();
  }

  /** 槽内唯一的小字：质量（空则不画） */
  _slotGrams(ctx, str, cx, y) {
    if (!str) return;
    ctx.font = '10.5px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(str, cx, y);
  }

  // ---- 提示按钮 ----
  tipButton(ctx, W, H, top = 10, right = 0) {
    const x = W - right - 82;
    const y = top;
    ctx.save();
    rr(ctx, x, y, 72, 34, 9);
    const g = ctx.createLinearGradient(x, y, x, y + 34);
    g.addColorStop(0, '#7a5a20');
    g.addColorStop(1, '#4a3410');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.gold.light;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = this.showTip ? 12 : 4;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('提示', x + 36, y + 23);
    ctx.textAlign = 'left';
    if (this.showTip && this.scene.tip) {
      ctx.save();
      rr(ctx, 10, top + 42, Math.min(W - 20, 470), 96, 10);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.strokeStyle = THEME.gold.deep;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = THEME.gold.text;
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      const lines = this.scene.tip.split('\n');
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 22, top + 66 + i * 17);
    }
  }

  // ---- 通关 / 死亡遮罩 ----
  overlay(ctx, scene, W, H) {
    if (scene.status !== 'win' && scene.status !== 'died') return;
    ctx.save();
    ctx.fillStyle = 'rgba(6,5,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    const win = scene.status === 'win';
    const c = win ? THEME.portal.light : '#ff7f7f';
    const cx = W / 2;
    const cy = H / 2 - 10;
    // 光环
    ctx.save();
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.shadowColor = c;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // 图标符文
    ctx.fillStyle = c;
    ctx.font = '34px serif';
    ctx.textAlign = 'center';
    ctx.fillText(win ? '✦' : '✧', cx, cy + 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px "Segoe UI", sans-serif';
    ctx.fillText(win ? '通关！' : '死亡', cx, cy + 58);
    ctx.fillStyle = '#e8d8b0';
    ctx.font = '15px "Segoe UI", sans-serif';
    const touch = scene._touchUI && scene._touchUI.enabled();
    ctx.fillText(touch ? '轻触屏幕重新开始' : '按 R 重开', cx, cy + 90);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
