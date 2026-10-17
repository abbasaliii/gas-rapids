import * as THREE from 'three';
import { makeAnimal, ROSTER } from './characters.js';
import { clamp } from './util.js';

export const SEAT_R = 2.15;     // where the animals sit
export const RAFT_R = 2.75;     // collision radius
const FORCE = 6.5;              // sustained fart thrust per player (m/s^2, raft mass = 1)
const POP = 2.6;                // impulse (m/s) for a tap
const DRAG = 0.9;               // linear drag vs water
const DRAG2 = 0.02;             // quadratic drag, keeps top speed sane when all four push
/** Aim sign per seat so that D = "raft goes right" on the back/front seats and "push forward" on the side seats. */
export const AIM_SIGN = [-1, -1, 1, 1];
const ANG_DRAG = 3.2;
const INERTIA = 5;
const AIM_MAX = 0.75;           // radians the gas jet can be aimed
const GAS_MAX = 100, DRAIN = 32, REGEN = 24, POP_COST = 9, EMPTY_LOCK = 22;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Seat i sits at angle i*90deg around the raft, index 0 at the back (local +z). */
export function seatLocal(i) { const a = i * Math.PI / 2; return { x: Math.sin(a) * SEAT_R, z: Math.cos(a) * SEAT_R }; }
export function rotY(x, z, yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); return { x: x * c + z * s, z: -x * s + z * c }; }

export class Raft {
  constructor(track, effects, audio) {
    this.track = track; this.fx = effects; this.audio = audio;
    this.x = 0; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0; this.av = 0;
    this.hint = 0; this.d = 0; this.lat = 0;
    this.alive = true; this.respawnT = 0; this.retries = 0; this.finished = false;
    this.lastCp = 0; this.nextCp = 0;
    this.bump = 0; this.tiltX = 0; this.tiltZ = 0;
    this.events = []; // 'checkpoint' | 'die' | 'respawn' | 'finish' | 'bump'
    this.players = ROSTER.map((r, i) => ({ ...r, seat: i, gas: GAS_MAX, farting: false, empty: false, cooldown: 0, aim: 0, human: false }));
    this.buildMesh();
    this.reset();
  }

  buildMesh() {
    const g = new THREE.Group();
    const deckTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
      ctx.fillStyle = '#5fd400'; ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#4cb800';
      for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 44 + 38, 256, 6);
      ctx.fillStyle = '#7bea1e'; for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 44 + 8, 256, 4);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(SEAT_R + 0.2, SEAT_R + 0.2, 0.25, 28), new THREE.MeshLambertMaterial({ map: deckTex }));
    deck.position.y = 0.35; deck.receiveShadow = true; g.add(deck);
    const tube = new THREE.Mesh(new THREE.TorusGeometry(SEAT_R + 0.3, 0.55, 10, 36), new THREE.MeshLambertMaterial({ color: 0xffe3a6 }));
    tube.rotation.x = Math.PI / 2; tube.position.y = 0.25; tube.castShadow = true; g.add(tube);
    const under = new THREE.Mesh(new THREE.CylinderGeometry(SEAT_R + 0.85, SEAT_R + 0.7, 0.35, 28), new THREE.MeshLambertMaterial({ color: 0x2ec4b6 }));
    under.position.y = -0.05; g.add(under);
    // red cushions / handles at the four seats
    const cushM = new THREE.MeshLambertMaterial({ color: 0xe0313f });
    for (let i = 0; i < 4; i++) {
      const p = seatLocal(i);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.7), cushM);
      c.position.set(p.x * 1.18, 0.55, p.z * 1.18); c.rotation.y = -i * Math.PI / 2; c.castShadow = true; g.add(c);
    }
    this.animals = ROSTER.map((r, i) => {
      const a = makeAnimal(r.kind);
      const p = seatLocal(i);
      a.group.position.set(p.x, 0.45, p.z);
      a.group.rotation.y = Math.atan2(-p.x, -p.z); // face the centre
      a.group.scale.setScalar(0.72);
      g.add(a.group);
      return a;
    });
    this.body = g;
    this.mesh = new THREE.Group(); this.mesh.add(g);
  }

  reset(d = 0) {
    const s = this.track.at(d + 1);
    const p = this.track.posAt(d + 1, 0);
    this.x = p.x; this.z = p.z; this.vx = 0; this.vz = 0; this.av = 0;
    this.yaw = Math.atan2(-s.tx, -s.tz);
    this.hint = s.d; this.alive = true; this.respawnT = 0;
    for (const pl of this.players) { pl.gas = GAS_MAX; pl.empty = false; pl.farting = false; }
    this.mesh.visible = true;
  }

  die() {
    if (!this.alive) return;
    this.alive = false; this.respawnT = 1.4; this.retries++;
    this.events.push('die');
    this.fx.splash(this.x, this.z, 26);
    this.audio.splash();
    this.mesh.visible = false;
  }

  /** inputs: array of 4 {fart, aim, pop} */
  step(dt, inputs, time) {
    const T = this.track;
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) { this.reset(this.lastCp); this.events.push('respawn'); }
      return;
    }
    let fx = 0, fz = 0, torque = 0;
    for (let i = 0; i < 4; i++) {
      const pl = this.players[i], inp = inputs[i] || {};
      pl.cooldown = Math.max(0, pl.cooldown - dt);
      pl.aim += (clamp(inp.aim || 0, -1, 1) - pl.aim) * Math.min(1, dt * 12);
      const want = !!inp.fart && !this.finished;
      let farting = false;
      if (want && !pl.empty && pl.gas > 0) {
        farting = true;
        pl.gas -= DRAIN * dt;
        if (inp.pop && pl.gas > POP_COST) { pl.gas -= POP_COST; pl.pop = true; } else pl.pop = false;
        if (pl.gas <= 0) { pl.gas = 0; pl.empty = true; this.audio.sputter(i); }
        pl.cooldown = 0.35;
      } else {
        if (pl.cooldown <= 0) pl.gas = Math.min(GAS_MAX, pl.gas + REGEN * dt);
        if (pl.empty && pl.gas >= EMPTY_LOCK) pl.empty = false;
        pl.pop = false;
      }
      if (farting !== pl.farting) { pl.farting = farting; farting ? this.audio.fartStart(i) : this.audio.fartStop(i); }
      this.animals[i].setFart(farting);
      if (!farting) continue;
      // jet direction: from the seat toward the centre, rotated by aim
      const sl = seatLocal(i);
      const len = Math.hypot(sl.x, sl.z);
      let ux = -sl.x / len, uz = -sl.z / len;
      const a = pl.aim * AIM_MAX * AIM_SIGN[i];
      ({ x: ux, z: uz } = rotY(ux, uz, a));
      const uw = rotY(ux, uz, this.yaw);
      const rw = rotY(sl.x, sl.z, this.yaw);
      fx += uw.x * FORCE; fz += uw.z * FORCE;
      torque += (rw.z * uw.x - rw.x * uw.z) * FORCE;
      if (pl.pop) { this.vx += uw.x * POP; this.vz += uw.z * POP; this.av += (rw.z * uw.x - rw.x * uw.z) * POP * 0.4 / INERTIA; this.audio.pop(i); }
      this.emitGas(i, dt, pl.pop);
    }
    // water current + drag
    const near = T.nearest(this.x, this.z, this.hint);
    this.hint = near.i; this.d = near.d; this.lat = near.lat;
    const cur = this.finished ? 0 : T.currentAt(near.d);
    if (this.finished) { this.vx *= 1 - dt * 1.5; this.vz *= 1 - dt * 1.5; }
    const wvx = near.s.tx * cur, wvz = near.s.tz * cur;
    const rvx = this.vx - wvx, rvz = this.vz - wvz, rsp = Math.hypot(rvx, rvz);
    fx += -rvx * (DRAG + DRAG2 * rsp); fz += -rvz * (DRAG + DRAG2 * rsp);
    this.vx += fx * dt; this.vz += fz * dt;
    // yaw: torque, angular drag, and a mild keel that turns the raft to face its motion
    const sp = Math.hypot(this.vx, this.vz);
    this.av += (torque / INERTIA - this.av * ANG_DRAG) * dt;
    if (sp > 1.5) { const target = Math.atan2(-this.vx, -this.vz); this.av += wrap(target - this.yaw) * 1.8 * dt; }
    this.yaw += this.av * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;

    // walls
    const limit = near.s.w - RAFT_R * 0.75;
    if (Math.abs(near.lat) > limit) {
      const s = near.s, sign = Math.sign(near.lat);
      const over = Math.abs(near.lat) - limit;
      this.x -= s.lx * sign * over; this.z -= s.lz * sign * over;
      const vn = this.vx * s.lx + this.vz * s.lz; // lateral speed
      if (vn * sign > 0) {
        this.vx -= s.lx * vn * 1.5; this.vz -= s.lz * vn * 1.5;
        this.vx *= 0.9; this.vz *= 0.9;
        this.av += sign * 0.6 * Math.min(1, Math.abs(vn) / 6);
        this.hit(Math.abs(vn));
      }
    }
    // obstacles
    for (const o of T.obstacles) {
      let px, pz, dist;
      if (o.type === 'circle') {
        px = o.x; pz = o.z;
      } else {
        // closest point on segment
        const abx = o.bx - o.ax, abz = o.bz - o.az;
        const t = clamp(((this.x - o.ax) * abx + (this.z - o.az) * abz) / (abx * abx + abz * abz), 0, 1);
        px = o.ax + abx * t; pz = o.az + abz * t;
      }
      const dx = this.x - px, dz = this.z - pz; dist = Math.hypot(dx, dz);
      const minD = o.r + RAFT_R * 0.8;
      if (dist < minD) {
        if (o.lethal) { this.die(); return; }
        const nx = dx / (dist || 1), nz = dz / (dist || 1);
        const over = minD - dist;
        this.x += nx * over; this.z += nz * over;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) { this.vx -= nx * vn * 1.6; this.vz -= nz * vn * 1.6; this.hit(-vn); }
      }
    }
    // checkpoints & finish
    if (this.nextCp < T.checkpoints.length && near.d >= T.checkpoints[this.nextCp]) {
      this.lastCp = T.checkpoints[this.nextCp]; this.nextCp++; this.events.push('checkpoint'); this.audio.chime();
    }
    if (!this.finished && near.d >= T.finishD) { this.finished = true; this.events.push('finish'); }
    // wake ripples
    this.wakeT = (this.wakeT || 0) - dt;
    if (sp > 2 && this.wakeT <= 0) { this.wakeT = 0.22; this.fx.ripple(this.x - this.vx / sp * 2, this.z - this.vz / sp * 2, 1.1); }
    this.bump = Math.max(0, this.bump - dt * 3);
  }

  /** Gas puff out the back of seat i (opposite the push direction), rate-limited. Used by the simulation and by online clients. */
  emitGas(i, dt, pop = false) {
    const pl = this.players[i];
    pl.puffT = (pl.puffT || 0) - dt;
    if (pl.puffT > 0 && !pop) return;
    pl.puffT = 0.035;
    const sl = seatLocal(i); const len = Math.hypot(sl.x, sl.z);
    const r = rotY(-sl.x / len, -sl.z / len, pl.aim * AIM_MAX * AIM_SIGN[i]);
    const uw = rotY(r.x, r.z, this.yaw), rw = rotY(sl.x, sl.z, this.yaw);
    const bx = this.x + rw.x * 1.2, bz = this.z + rw.z * 1.2;
    this.fx.gas(bx, bz, -uw.x, -uw.z, pop ? 3 : 1);
    if (Math.random() < 0.3) this.fx.ripple(bx - uw.x * 1.5, bz - uw.z * 1.5, 0.5);
  }

  /** Compact state for online clients. */
  snapshot() {
    return {
      t: 's', x: +this.x.toFixed(2), z: +this.z.toFixed(2), y: +this.yaw.toFixed(3), vx: +this.vx.toFixed(2), vz: +this.vz.toFixed(2),
      d: Math.round(this.d), a: this.alive ? 1 : 0, r: this.retries, c: this.nextCp, f: this.finished ? 1 : 0,
      p: this.players.map((p) => [Math.round(p.gas), p.farting ? 1 : 0, p.empty ? 1 : 0, +p.aim.toFixed(2)]),
    };
  }
  /** Blend toward a host snapshot; plays the same sounds and effects a local simulation would. */
  applySnapshot(s, dt) {
    const k = Math.min(1, dt * 12);
    const dist = Math.hypot(s.x - this.x, s.z - this.z);
    if (dist > 8 || !this._synced) { this.x = s.x; this.z = s.z; this.yaw = s.y; this._synced = true; }
    else { this.x += (s.x - this.x) * k; this.z += (s.z - this.z) * k; this.yaw += Math.atan2(Math.sin(s.y - this.yaw), Math.cos(s.y - this.yaw)) * k; }
    this.vx = s.vx; this.vz = s.vz; this.d = s.d; this.retries = s.r; this.nextCp = s.c; this.finished = !!s.f;
    if (this.alive && !s.a) { this.fx.splash(this.x, this.z, 26); this.audio.splash(); }
    this.alive = !!s.a; this.mesh.visible = this.alive;
    s.p.forEach(([gas, farting, empty, aim], i) => {
      const pl = this.players[i];
      pl.gas = gas; pl.aim = aim;
      if (!!farting !== pl.farting) { pl.farting = !!farting; pl.farting ? this.audio.fartStart(i) : this.audio.fartStop(i); }
      if (!!empty && !pl.empty) this.audio.sputter(i);
      pl.empty = !!empty;
      this.animals[i].setFart(pl.farting);
      if (pl.farting && this.alive) this.emitGas(i, dt);
    });
  }

  hit(strength) {
    if (strength < 1.5) return;
    this.bump = Math.min(1, strength / 8);
    this.events.push('bump');
    this.audio.bump(strength / 8);
    this.fx.splash(this.x, this.z, 6 + strength);
  }

  syncMesh(t, dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
    // lean with lateral acceleration and bob on the water
    const local = rotY(this.vx, this.vz, -this.yaw);
    const tx = clamp(local.z * 0.012, -0.2, 0.2), tz = clamp(-local.x * 0.012, -0.2, 0.2);
    this.tiltX += (tx - this.tiltX) * Math.min(1, dt * 6);
    this.tiltZ += (tz - this.tiltZ) * Math.min(1, dt * 6);
    this.body.rotation.x = this.tiltX + Math.sin(t * 1.7) * 0.025 + this.bump * Math.sin(t * 30) * 0.08;
    this.body.rotation.z = this.tiltZ + Math.cos(t * 1.3) * 0.025;
    this.body.position.y = Math.sin(t * 2.1) * 0.05 - this.bump * 0.15;
    for (const a of this.animals) a.update(t);
  }
}
