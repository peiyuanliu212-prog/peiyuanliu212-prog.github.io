/* 逐鹿定鼎 · Pixelfx 战斗特效桥（第 44 批）
 * pixelfx（patch-gg/pixelfx）为 MIT 许可，LICENSE/NOTICE.md 原件在本目录。
 * 职责：把 pixelfx 代码特效作为叠加层画进战斗舞台。主脚本只通过 window.SgFx 可选调用；
 * 本模块加载失败或未就绪时，战斗演出自动回退到原有闪光/飘字（主脚本零依赖）。
 * 排版纪律（主人 2026-11-24 硬要求）：一技能一焦点、同屏大特效 ≤2、地面/命中分层固定、尺寸按目标身位封顶。
 */
import { createFrame, clearFrame, createFx, composite } from "./core/index.js";
import * as fireRing from "./fx/fire/fire-ring.js";
import * as bolt from "./fx/lightning/lightning-strike.js";
import * as circle from "./fx/arcane/magic-circle-cast.js";
import * as frost from "./fx/ice/frost-nova.js";
import * as heal from "./fx/holy/heal.js";
import * as poisoned from "./fx/status/poisoned.js";
import * as spark from "./fx/impacts/hit-spark.js";

const KINDS = {
  fire:   { mod: fireRing, layer: "ground", wantW: 360 },
  arcane: { mod: circle,   layer: "ground", wantW: 320 },
  bolt:   { mod: bolt,     layer: "hit",    wantW: 200 },
  frost:  { mod: frost,    layer: "hit",    wantW: 270 },
  heal:   { mod: heal,     layer: "hit",    wantW: 115 },
  poison: { mod: poisoned, layer: "hit",   wantW: 130, capT: 1.6 },
  impact: { mod: spark,    layer: "hit",    wantW: 140 },
};
const MAX_ACTIVE = 2;

let stageEl = null, groundCv = null, hitCv = null, actives = [], rafId = 0, lastTs = 0;
let stateFn = function () { return { speed: 1, playing: true }; };

function ensureLayers(stage, fxLayer) {
  if (!stage || !fxLayer) return false;
  if (stageEl === stage && groundCv && hitCv) return true;
  stopAll();
  stageEl = stage;
  groundCv = document.createElement("canvas");
  groundCv.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:0;";
  stage.insertBefore(groundCv, stage.firstChild);
  hitCv = document.createElement("canvas");
  hitCv.style.cssText = "position:absolute;inset:0;pointer-events:none;";
  fxLayer.appendChild(hitCv);
  sizeCanvases();
  return true;
}
function sizeCanvases() {
  if (!stageEl) return;
  const w = stageEl.clientWidth || 0, h = stageEl.clientHeight || 0;
  if (!w || !h) return;
  for (const cv of [groundCv, hitCv]) { if (cv) { cv.width = w; cv.height = h; } }
}
function battleAlive() {
  const bv = document.getElementById("battleView");
  return !!(bv && bv.classList.contains("on") && stageEl && document.body.contains(stageEl));
}
function stopAll() {
  actives = [];
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  for (const cv of [groundCv, hitCv]) { if (cv) { const c = cv.getContext("2d"); c && c.clearRect(0, 0, cv.width, cv.height); } }
}
function cast(kind, anchor) {
  const K = KINDS[kind];
  if (!K || !anchor || !stageEl) return false;
  if (actives.length >= MAX_ACTIVE) return false;         /* 同屏节流：超出即降级（主脚本原有闪光照常） */
  if (!battleAlive()) return false;
  sizeCanvases();
  const meta = K.mod.meta, W = meta.size[0], H = meta.size[1], OX = meta.origin[0], OY = meta.origin[1];
  const frame = createFrame(W, H);
  let inst;
  try { inst = createFx(K.mod, { x: OX, y: OY, ...(meta.options || {}) }); } catch (e) { return false; }
  const off = document.createElement("canvas"); off.width = W; off.height = H;
  const capW = Math.max(anchor.w || 100, 60) * 1.35;      /* 尺寸封顶：不超过目标身位跨度的 1.35 倍 */
  const scale = Math.min(K.wantW, capW) / W;
  const dur = K.capT || ((typeof meta.duration === "number" && isFinite(meta.duration)) ? meta.duration : 3.2);
  actives.push({ K, frame, inst, off, W, H, OX, OY, x: anchor.x, y: anchor.y, scale, t: 0, acc: 0, dur });
  if (!rafId) { lastTs = performance.now(); rafId = requestAnimationFrame(loop); }
  return true;
}
function loop(ts) {
  rafId = 0;
  if (!actives.length) return;
  if (!battleAlive()) { stopAll(); return; }
  const st = stateFn() || { speed: 1, playing: true };
  const dtReal = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
  const gtx = groundCv && groundCv.getContext("2d"), htx = hitCv && hitCv.getContext("2d");
  if (gtx) gtx.clearRect(0, 0, groundCv.width, groundCv.height);
  if (htx) htx.clearRect(0, 0, hitCv.width, hitCv.height);
  const step = 1 / 30;
  for (let i = actives.length - 1; i >= 0; i--) {
    const a = actives[i];
    if (st.playing) {
      a.acc += dtReal * (st.speed || 1);
      while (a.acc >= step) { a.inst.update(step); a.t += step; a.acc -= step; }
    }
    clearFrame(a.frame);
    a.inst.draw(a.frame);
    const rgba = composite(a.frame, new Uint8ClampedArray(a.W * a.H * 4), null);
    const octx = a.off.getContext("2d");
    octx.putImageData(new ImageData(rgba, a.W, a.H), 0, 0);
    const ctx = a.K.layer === "ground" ? gtx : htx;
    if (ctx) ctx.drawImage(a.off, a.x - a.OX * a.scale, a.y - a.OY * a.scale, a.W * a.scale, a.H * a.scale);
    if (a.t >= a.dur + 0.1) actives.splice(i, 1);
  }
  if (actives.length) rafId = requestAnimationFrame(loop);
  else { if (gtx) gtx.clearRect(0, 0, groundCv.width, groundCv.height); if (htx) htx.clearRect(0, 0, hitCv.width, hitCv.height); }
}

window.SgFx = {
  ready: true,
  setStage: ensureLayers,
  setStateFn(fn) { if (typeof fn === "function") stateFn = fn; },
  cast,
  stopAll,
};
