import * as THREE from 'three';
import { puffTexture, ringTexture } from './util.js';

/** Pooled sprite particles: gas puffs, splashes, sparkles, confetti, water ripples. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    const puff = puffTexture(), ring = ringTexture();
    this.pool = [];
    this.gasMat = new THREE.SpriteMaterial({ map: puff, color: 0x9bff2e, transparent: true, depthWrite: false, opacity: 0.85 });
    this.gasMat2 = new THREE.SpriteMaterial({ map: puff, color: 0xd6ff5e, transparent: true, depthWrite: false, opacity: 0.85 });
    this.splashMat = new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, depthWrite: false });
    this.sparkMat = new THREE.SpriteMaterial({ map: puff, color: 0xffd23f, transparent: true, depthWrite: false });
    this.confettiMats = [0xff4fa3, 0xffd23f, 0x5fd400, 0x2f7ff0, 0xff6a1f, 0xffffff].map((c) => new THREE.SpriteMaterial({ map: puff, color: c, transparent: true, depthWrite: false }));
    for (let i = 0; i < 320; i++) {
      const s = new THREE.Sprite(this.gasMat);
      s.visible = false; scene.add(s);
      this.pool.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1, kind: 'gas' });
    }
    this.rings = [];
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false, opacity: 0.6 }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.position.y = 0.02;
      scene.add(m);
      this.rings.push({ m, life: 0, max: 1, size: 1 });
    }
    this.shake = 0;
  }
  spawn(kind, x, y, z, vx, vy, vz, size, life, mat) {
    const p = this.pool.find((p) => p.life <= 0);
    if (!p) return;
    p.kind = kind; p.life = life; p.max = life; p.vx = vx; p.vy = vy; p.vz = vz; p.grow = size;
    p.s.material = mat; p.s.position.set(x, y, z); p.s.scale.setScalar(size * 0.5); p.s.visible = true;
    p.s.material.rotation = Math.random() * 6.28;
  }
  gas(x, z, dx, dz, strength = 1) {
    const n = 1 + Math.floor(strength);
    for (let i = 0; i < n; i++) {
      const sp = 5 + Math.random() * 3 + strength;
      const jx = (Math.random() - 0.5) * 2.2, jz = (Math.random() - 0.5) * 2.2;
      this.spawn('gas', x + (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.4,
        dx * sp + jx, 0.8 + Math.random() * 0.8, dz * sp + jz, 1.1 + Math.random() * 0.6 + strength * 0.15, 0.8 + Math.random() * 0.4,
        Math.random() < 0.6 ? this.gasMat : this.gasMat2);
    }
  }
  splash(x, z, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 5;
      this.spawn('splash', x, 0.3, z, Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp, 0.5 + Math.random() * 0.7, 0.7 + Math.random() * 0.4, this.splashMat);
    }
    this.ripple(x, z, 2.5);
    this.shake = Math.min(1, this.shake + n / 30);
  }
  geyser(x, z) {
    for (let i = 0; i < 3; i++) {
      this.spawn('splash', x + (Math.random() - 0.5) * 1.5, 0.5, z + (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2, 12 + Math.random() * 6, (Math.random() - 0.5) * 2, 1.2 + Math.random(), 1 + Math.random() * 0.4, this.splashMat);
    }
  }
  sparkle(x, z) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.28, sp = 1 + Math.random() * 3;
      this.spawn('spark', x, 1, z, Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp, 0.5 + Math.random() * 0.5, 0.8 + Math.random() * 0.4, this.sparkMat);
    }
    this.ripple(x, z, 1.5);
  }
  confetti(x, z, n = 60) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 6;
      this.spawn('confetti', x, 1.5, z, Math.cos(a) * sp, 9 + Math.random() * 8, Math.sin(a) * sp, 0.35 + Math.random() * 0.3, 2 + Math.random() * 1.5, this.confettiMats[i % this.confettiMats.length]);
    }
  }
  ripple(x, z, size = 1) {
    const r = this.rings.find((r) => r.life <= 0);
    if (!r) return;
    r.life = r.max = 1.4; r.size = size;
    r.m.position.set(x, 0.02, z); r.m.visible = true;
  }
  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      if (p.kind === 'gas') { p.vx *= 1 - dt * 2.2; p.vz *= 1 - dt * 2.2; p.vy += dt * 0.6; p.s.scale.setScalar(p.grow * (0.5 + k * 1.6)); p.s.material.opacity = 0.85 * (1 - k) ** 1.2; }
      else if (p.kind === 'spark') { p.vy -= 6 * dt; p.s.scale.setScalar(p.grow * (1 - k)); }
      else if (p.kind === 'confetti') { p.vy -= 12 * dt; p.vx *= 1 - dt; p.vz *= 1 - dt; p.s.scale.set(p.grow * (0.6 + 0.4 * Math.sin(k * 40)), p.grow, 1); if (p.s.position.y < 0.1) p.s.position.y = 0.1; }
      else { p.vy -= 22 * dt; p.s.scale.setScalar(p.grow * (1 - k * 0.5)); if (p.s.position.y < 0) { p.life = 0; p.s.visible = false; } }
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.m.visible = false; continue; }
      const k = 1 - r.life / r.max;
      const s = r.size * (1.5 + k * 3);
      r.m.scale.set(s, s, 1); r.m.material.opacity = 0.55 * (1 - k);
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}
