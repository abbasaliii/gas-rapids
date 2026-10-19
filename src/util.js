import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const deg = (d) => (d * Math.PI) / 180;

/** Small seeded RNG (mulberry32) so levels are deterministic. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

const canvasTex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

/** Canvas-drawn text texture for signs and banners. */
export function textTexture(text, { w = 512, h = 160, bg = '#ffd23f', fg = '#1b1d24', stroke = '#c2410c', font = 'bold 110px "Lilita One", "Archivo", sans-serif', radius = 24 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath(); g.roundRect(0, 0, w, h, radius); g.fill();
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = stroke; g.lineJoin = 'round';
  g.strokeText(text, w / 2, h / 2 + 6);
  g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 6);
  return canvasTex(c);
}

/** Tin-can label wrapped around a cylinder. */
export function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e63946'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#fff3c4'; g.fillRect(0, 22, 512, 84);
  g.font = 'bold 64px "Lilita One", "Archivo", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#7a3b12'; g.fillText(text, 128, 66); g.fillText(text, 384, 66);
  g.fillStyle = '#5fd400'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(256, 40 + i * 9, 14, 7, 0.4, 0, 7); g.fill(); }
  return canvasTex(c);
}

/** Floating name tag: "YOU" with a down chevron for local players, a small name for others. */
const tagCache = new Map();
export function nameTagTexture(text, color = '#ffffff', local = false) {
  const key = text + '|' + color + '|' + local;
  if (tagCache.has(key)) return tagCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  if (text) {
    g.font = `bold ${local ? 150 : 96}px "Lilita One", "Archivo", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = local ? 22 : 14; g.strokeStyle = '#102030';
    g.strokeText(text, 256, local ? 88 : 110); g.fillStyle = local ? '#ffd23f' : color; g.fillText(text, 256, local ? 88 : 110);
    if (local) { g.beginPath(); g.moveTo(196, 170); g.lineTo(316, 170); g.lineTo(256, 240); g.closePath(); g.lineWidth = 16; g.stroke(); g.fillStyle = '#ffd23f'; g.fill(); }
  }
  const tex = canvasTex(c); tagCache.set(key, tex); return tex;
}

export function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#1b1d24' : '#ffffff'; g.fillRect(x * 32, y * 32, 32, 32); }
  return canvasTex(c);
}

/** Soft radial sprite texture for gas puffs and ripples. */
export function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function ringCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 7;
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}
function swirlCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 6; g.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    g.beginPath();
    for (let i = 0; i <= 60; i++) { const t = i / 60, a = arm * (Math.PI * 2 / 3) + t * 4.2, r = 6 + t * 112; const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
let _ring, _swirl, _puff;
export const ringTexture = Object.assign(() => (_ring ||= ringCanvas()), {
  ring: () => (_ring ||= ringCanvas()),
  swirl: () => (_swirl ||= swirlCanvas()),
  puff: () => (_puff ||= puffTexture()),
});
