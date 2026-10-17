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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#1b1d24' : '#ffffff';
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.9)';
  g.lineWidth = 7;
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}
