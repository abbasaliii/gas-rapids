import * as THREE from 'three';
import { makeAnimal, ROSTER } from './characters.js';
import { clamp } from './util.js';

export const SEAT_R = 2.15;     // where the animals sit
export const RAFT_R = 2.75;     // collision radius
const FORCE = 11;               // sustained toot thrust per player (m/s^2, raft mass = 1): the raft answers within half a second
const POP = 2.4;                // extra kick (m/s) the instant a toot starts
const DRAG = 1.5;               // linear drag vs water: high, so letting go stops you quickly too
const DRAG2 = 0.06;             // quadratic drag: four tooters top out near 17 m/s, one near 8
const SKEW = 0.05;              // each jet leaves a touch off-centre so a lone tooter is never perfectly straight
const KEEL = 1.2;               // how hard the raft wants to face its motion
const ANG_DRAG = 3.2;
const INERTIA = 6.5;
const AIM_MAX = 1.2;            // radians the jet can be turned either way (about 70 degrees)
const AIM_RATE = 2.0;           // A/D swing the jet to full in half a second; it eases back to straight when released
const GAS_MAX = 100, DRAIN = 32, REGEN = 24, POP_COST = 9, EMPTY_LOCK = 22;
const CAN_GAS = 45;

/** Seat layouts by crew size: angles around the raft, 0 = back, 90 = right. */
export const LAYOUTS = { 1: [0], 2: [-48, 48], 3: [0, 125, 235], 4: [0, 90, 180, 270] };

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function rotY(x, z, yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); return { x: x * c + z * s, z: -x * s + z * c }; }
/** Build seat descriptors for a crew size: local position, jet skew and the aim sign that makes D feel right. */
export function makeSeats(count) {
  return LAYOUTS[count].map((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const x = Math.sin(a) * SEAT_R, z = Math.cos(a) * SEAT_R;
    const norm = ((deg % 360) + 360) % 360;
    // back half and right side: D steers the raft right. Front half and left side: D pushes it forward.
    const sign = norm > 90 && norm <= 270 ? 1 : -1;
    return { angle: a, x, z, sign, skew: (i % 2 ? -1 : 1) * SKEW };
  });
}

export class Raft {
  constructor(track, effects, audio, count = 4) {
    this.track = track; this.fx = effects; this.audio = audio;
    this.count = count; this.seats = makeSeats(count);
    this.x = 0; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0; this.av = 0;
    this.hint = 0; this.d = 0; this.lat = 0;
    this.alive = true; this.respawnT = 0; this.retries = 0; this.finished = false;
    this.lastCp = 0; this.nextCp = 0; this.cans = 0;
    this.bump = 0; this.tiltX = 0; this.tiltZ = 0; this.deathT = 0; this.spawnT = 0;
    this.events = []; // 'checkpoint' | 'die' | 'respawn' | 'finish' | 'bump' | 'can' | 'geyser'
    this.players = ROSTER.slice(0, count).map((r, i) => ({ ...r, seat: i, gas: GAS_MAX, farting: false, empty: false, cooldown: 0, aim: 0, thrust: 0, human: false }));
    this.predicting = false; // online client: simulate locally for feel, but never decide deaths, pickups or progress
    this.visOff = { x: 0, z: 0, yaw: 0 };
    this.buildMesh();
    this.reset();
  }

  buildMesh() {
    const g = new THREE.Group();
    const deckTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
      ctx.fillStyle = '#c98a4b'; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#b97a3e' : '#d7975a'; ctx.fillRect(0, i * 37, 256, 33); }
      ctx.fillStyle = '#8a5a2b'; for (let i = 0; i < 7; i++) ctx.fillRect(0, i * 37 + 33, 256, 4);
      ctx.fillStyle = '#6e4521'; for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(40 + (i % 2) * 176, i * 18 + 10, 3, 0, 7); ctx.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(SEAT_R + 0.2, SEAT_R + 0.2, 0.25, 28), new THREE.MeshLambertMaterial({ map: deckTex }));
    deck.position.y = 0.35; deck.receiveShadow = true; g.add(deck);
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const seg = new THREE.Mesh(new THREE.TorusGeometry(SEAT_R + 0.3, 0.55, 10, 4, Math.PI * 2 / segs + 0.02), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xffd23f : 0xf7f7f2 }));
      seg.rotation.x = Math.PI / 2; seg.rotation.z = (i / segs) * Math.PI * 2; seg.position.y = 0.25; seg.castShadow = true; g.add(seg);
    }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(SEAT_R + 0.3, 0.06, 5, 48), new THREE.MeshLambertMaterial({ color: 0x5a3b2a }));
    rope.rotation.x = Math.PI / 2; rope.position.y = 0.72; g.add(rope);
    const under = new THREE.Mesh(new THREE.CylinderGeometry(SEAT_R + 0.85, SEAT_R + 0.7, 0.35, 28), new THREE.MeshLambertMaterial({ color: 0x3a6ea5 }));
    under.position.y = -0.05; g.add(under);
    const cushM = new THREE.MeshLambertMaterial({ color: 0x2f7ff0 });
    const arrowShape = new THREE.Shape(); arrowShape.moveTo(0, 1.1); arrowShape.lineTo(0.55, 0.2); arrowShape.lineTo(0.22, 0.2); arrowShape.lineTo(0.22, -0.5); arrowShape.lineTo(-0.22, -0.5); arrowShape.lineTo(-0.22, 0.2); arrowShape.lineTo(-0.55, 0.2); arrowShape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    this.arrows = this.seats.map((st, i) => {
      const a = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(ROSTER[i].color), transparent: true, opacity: 0.9, depthWrite: false }));
      a.rotation.x = -Math.PI / 2; a.position.y = 0.5; g.add(a); return a;
    });
    this.animals = this.seats.map((st, i) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.7), cushM);
      c.position.set(st.x * 1.18, 0.55, st.z * 1.18); c.rotation.y = -st.angle; c.castShadow = true; g.add(c);
      const a = makeAnimal(ROSTER[i].kind);
      a.group.position.set(st.x, 0.45, st.z);
      a.group.rotation.y = Math.atan2(-st.x, -st.z); // face the centre
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
    this.hint = s.d; this.alive = true; this.respawnT = 0; this.deathT = 0; this.spawnT = 0.6;
    for (const pl of this.players) { pl.gas = GAS_MAX; pl.empty = false; pl.farting = false; pl.thrust = 0; }
    this.mesh.visible = true;
  }

  die() {
    if (!this.alive) return;
    this.alive = false; this.respawnT = 1.5; this.retries++; this.deathT = 0.5;
    this.events.push('die');
    this.fx.splash(this.x, this.z, 26);
    this.audio.splash();
    this.players.forEach((pl, i) => { if (pl.farting) { pl.farting = false; this.audio.fartStop(i); } });
  }

  /** push direction (world) and seat position (world) for seat i at its current aim */
  jet(i) {
    const st = this.seats[i], pl = this.players[i];
    const len = Math.hypot(st.x, st.z);
    // D (aim > 0) swings the jet anticlockwise seen from above, which on every seat makes the raft turn RIGHT (torque = -R F sin(aim))
    const r = rotY(-st.x / len, -st.z / len, pl.aim * AIM_MAX + st.skew);
    return { uw: rotY(r.x, r.z, this.yaw), rw: rotY(st.x, st.z, this.yaw) };
  }

  /** inputs: array of {fart, aim, pop, free} per seat */
  step(dt, inputs, time) {
    const T = this.track;
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) { this.reset(this.lastCp); this.events.push('respawn'); }
      return;
    }
    let fx = 0, fz = 0, torque = 0;
    for (let i = 0; i < this.players.length; i++) {
      const pl = this.players[i], inp = inputs[i] || {};
      pl.cooldown = Math.max(0, pl.cooldown - dt);
      // bots hand in an absolute aim; people turn their jet with A/D and it stays where they leave it
      if (inp.abs) pl.aim += (clamp(inp.aim || 0, -1, 1) - pl.aim) * Math.min(1, dt * 10);
      else { const want = clamp(inp.aim || 0, -1, 1); if (want) pl.aim = clamp(pl.aim + want * AIM_RATE * dt, -1, 1); else pl.aim -= Math.sign(pl.aim) * Math.min(Math.abs(pl.aim), AIM_RATE * 1.5 * dt); }
      const want = !!inp.fart && !this.finished;
      let farting = false;
      if (want && !pl.empty && pl.gas > 0) {
        farting = true;
        if (!inp.free) pl.gas -= DRAIN * dt;
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
      pl.thrust += ((farting ? 1 : 0) - pl.thrust) * Math.min(1, dt * (farting ? 16 : 20));
      if (pl.thrust < 0.02) continue;
      const { uw, rw } = this.jet(i);
      const flutter = 1 + Math.sin(time * 31 + i * 1.7) * 0.12 + Math.sin(time * 7.3 + i) * 0.06; // the thrust sputters a little
      const F = FORCE * pl.thrust * flutter;
      fx += uw.x * F; fz += uw.z * F;
      torque += (rw.z * uw.x - rw.x * uw.z) * F;
      if (!farting) continue;
      if (pl.pop) { this.vx += uw.x * POP; this.vz += uw.z * POP; this.av += (rw.z * uw.x - rw.x * uw.z) * POP * 0.5 / INERTIA; this.bump = Math.max(this.bump, 0.3); this.recoil = 0.25; this.audio.pop(i); }
      this.emitGas(i, dt, pl.pop);
    }
    const near = T.nearest(this.x, this.z, this.hint);
    this.hint = near.i; this.d = near.d; this.lat = near.lat;
    const ice = T.iceAt(near.d);
    const cur = this.finished ? 0 : T.currentAt(near.d);
    if (this.finished) { this.vx *= 1 - dt * 1.5; this.vz *= 1 - dt * 1.5; }
    const wvx = near.s.tx * cur, wvz = near.s.tz * cur;
    const rvx = this.vx - wvx, rvz = this.vz - wvz, rsp = Math.hypot(rvx, rvz);
    const dragK = ice ? 0.45 : 1;
    fx += -rvx * (DRAG * dragK + DRAG2 * rsp); fz += -rvz * (DRAG * dragK + DRAG2 * rsp);
    // force fields
    for (const f of T.fields) {
      if (f.type === 'fan') {
        if (near.d >= f.d0 && near.d <= f.d1) { fx += near.s.lx * f.dir * f.strength; fz += near.s.lz * f.dir * f.strength; }
        continue;
      }
      const dx = this.x - f.x, dz = this.z - f.z, dist = Math.hypot(dx, dz);
      if (dist > f.r) continue;
      if (f.type === 'whirl') {
        const k = (f.r - dist) / f.r;
        const nx = dx / (dist || 1), nz = dz / (dist || 1);
        fx += -nx * k * 9 + (-nz) * k * 7; fz += -nz * k * 9 + (nx) * k * 7;
        this.av += k * 2.2 * dt;
      } else if (f.type === 'geyser' && f.active && f.erupt !== this._lastErupt) {
        this._lastErupt = f.erupt;
        const nx = dx / (dist || 1), nz = dz / (dist || 1);
        this.vx += nx * 9; this.vz += nz * 9; this.av += (Math.random() - 0.5) * 3;
        this.hit(8); this.events.push('geyser');
      }
    }
    this.vx += fx * dt; this.vz += fz * dt;
    const sp = Math.hypot(this.vx, this.vz);
    this.av += (torque / INERTIA - this.av * ANG_DRAG) * dt;
    if (sp > 1.5) { const target = Math.atan2(-this.vx, -this.vz); this.av += wrap(target - this.yaw) * (ice ? 0.25 : KEEL) * dt; }
    this.yaw += this.av * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;

    // walls
    const limit = near.s.w - RAFT_R * 0.75;
    if (Math.abs(near.lat) > limit) {
      const s = near.s, sign = Math.sign(near.lat);
      const over = Math.abs(near.lat) - limit;
      this.x -= s.lx * sign * over; this.z -= s.lz * sign * over;
      const vn = this.vx * s.lx + this.vz * s.lz;
      if (vn * sign > 0) {
        this.vx -= s.lx * vn * 1.7; this.vz -= s.lz * vn * 1.7;
        if (Math.abs(vn) > 1.2) { this.vx *= 0.9; this.vz *= 0.9; } // scrub speed on impacts, not while merely leaning on the wall
        this.av += sign * 1.1 * Math.min(1, Math.abs(vn) / 6) * (Math.random() < 0.5 ? 1 : -1);
        this.hit(Math.abs(vn));
      }
    }
    // obstacles
    for (const o of T.obstacles) {
      if (o.r <= 0) continue;
      let px, pz;
      if (o.type === 'circle') { px = o.x; pz = o.z; }
      else {
        const abx = o.bx - o.ax, abz = o.bz - o.az;
        const t = clamp(((this.x - o.ax) * abx + (this.z - o.az) * abz) / ((abx * abx + abz * abz) || 1), 0, 1);
        px = o.ax + abx * t; pz = o.az + abz * t;
      }
      const dx = this.x - px, dz = this.z - pz, dist = Math.hypot(dx, dz);
      const minD = o.r + RAFT_R * 0.8;
      if (dist < minD) {
        if (o.lethal) { if (this.predicting) continue; this.die(); return; }
        const nx = dx / (dist || 1), nz = dz / (dist || 1);
        const over = minD - dist;
        this.x += nx * over; this.z += nz * over;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) { this.vx -= nx * vn * 1.6; this.vz -= nz * vn * 1.6; this.hit(-vn); }
        if (o.kind === 'log' || o.kind === 'rock') { this.vx += nx * 2 * dt * 60; this.vz += nz * 2 * dt * 60; this.av += (Math.random() - 0.5) * 0.6; }
      }
    }
    // pickups
    for (const p of T.pickups) {
      if (p.taken || this.predicting) continue;
      if (Math.hypot(this.x - p.x, this.z - p.z) < p.r + RAFT_R * 0.8) {
        p.taken = true; p.mesh.visible = false; this.cans++;
        for (const pl of this.players) { pl.gas = Math.min(GAS_MAX, pl.gas + CAN_GAS); if (pl.empty && pl.gas >= EMPTY_LOCK) pl.empty = false; }
        this.events.push('can'); this.audio.pickup(); this.fx.sparkle(p.x, p.z);
      }
    }
    if (!this.predicting && this.nextCp < T.checkpoints.length && near.d >= T.checkpoints[this.nextCp]) {
      this.lastCp = T.checkpoints[this.nextCp]; this.nextCp++; this.events.push('checkpoint'); this.audio.chime();
    }
    if (!this.predicting && !this.finished && near.d >= T.finishD) { this.finished = true; this.events.push('finish'); }
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
    const { uw, rw } = this.jet(i);
    const bx = this.x + rw.x * 1.2, bz = this.z + rw.z * 1.2;
    this.fx.gas(bx, bz, -uw.x, -uw.z, pop ? 3 : 1);
    if (Math.random() < 0.3) this.fx.ripple(bx - uw.x * 1.5, bz - uw.z * 1.5, 0.5);
  }

  /** Compact state for online clients. */
  snapshot(trackTime, seqs = null) {
    return {
      t: 's', x: +this.x.toFixed(2), z: +this.z.toFixed(2), y: +this.yaw.toFixed(3), vx: +this.vx.toFixed(2), vz: +this.vz.toFixed(2), av: +this.av.toFixed(3), q: seqs,
      d: Math.round(this.d), a: this.alive ? 1 : 0, r: this.retries, c: this.nextCp, f: this.finished ? 1 : 0, tc: +trackTime.toFixed(2),
      k: this.track.pickups.map((p) => (p.taken ? 1 : 0)).join(''),
      p: this.players.map((p) => [Math.round(p.gas), p.farting ? 1 : 0, p.empty ? 1 : 0, +p.aim.toFixed(2)]),
    };
  }
  /** Prediction client: adopt the host's state outright (the caller then replays its unacknowledged inputs). */
  applyAuth(s, mySeat) {
    this.x = s.x; this.z = s.z; this.yaw = s.y; this.vx = s.vx; this.vz = s.vz; this.av = s.av || 0;
    this.d = s.d; this.retries = s.r; this.nextCp = s.c; this.finished = !!s.f;
    if (this.alive && !s.a) { this.fx.splash(this.x, this.z, 26); this.audio.splash(); this.deathT = 0.5; this.players.forEach((pl, i) => { if (pl.farting) { pl.farting = false; this.audio.fartStop(i); } }); }
    if (!this.alive && s.a) this.spawnT = 0.6;
    this.alive = !!s.a;
    if (s.k) this.track.pickups.forEach((p, i) => { const taken = s.k[i] === '1'; if (taken && !p.taken) { this.fx.sparkle(p.x, p.z); this.audio.pickup(); } p.taken = taken; p.mesh.visible = !taken; });
    s.p.forEach(([gas, farting, empty, aim], i) => {
      const pl = this.players[i]; if (!pl) return;
      pl.gas = gas; pl.empty = !!empty;
      if (i !== mySeat) pl.aim = aim; // my own aim is replayed from my input buffer
    });
  }
  /** Blend toward a host snapshot; plays the same sounds and effects a local simulation would. */
  applySnapshot(s, dt) {
    const k = Math.min(1, dt * 12);
    const dist = Math.hypot(s.x - this.x, s.z - this.z);
    if (dist > 8 || !this._synced) { this.x = s.x; this.z = s.z; this.yaw = s.y; this._synced = true; }
    else { this.x += (s.x - this.x) * k; this.z += (s.z - this.z) * k; this.yaw += wrap(s.y - this.yaw) * k; }
    this.vx = s.vx; this.vz = s.vz; this.d = s.d; this.retries = s.r; this.nextCp = s.c; this.finished = !!s.f;
    if (this.alive && !s.a) { this.fx.splash(this.x, this.z, 26); this.audio.splash(); this.deathT = 0.5; }
    if (!this.alive && s.a) this.spawnT = 0.6;
    this.alive = !!s.a;
    if (s.k) this.track.pickups.forEach((p, i) => { const taken = s.k[i] === '1'; if (taken && !p.taken) { this.fx.sparkle(p.x, p.z); this.audio.pickup(); } p.taken = taken; p.mesh.visible = !taken; });
    s.p.forEach(([gas, farting, empty, aim], i) => {
      const pl = this.players[i]; if (!pl) return;
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
    // reconciliation error fades out over ~150 ms so corrections never pop
    const k = Math.min(1, dt * 9);
    this.visOff.x -= this.visOff.x * k; this.visOff.z -= this.visOff.z * k; this.visOff.yaw -= this.visOff.yaw * k;
    this.mesh.position.set(this.x + this.visOff.x, 0, this.z + this.visOff.z);
    this.mesh.rotation.y = this.yaw + this.visOff.yaw;
    if (this.deathT > 0) {
      this.deathT -= dt;
      const k = Math.max(0, this.deathT / 0.5);
      this.mesh.visible = true;
      this.body.scale.set(k, k * 0.6 + 0.01, k); this.body.rotation.y += dt * 14; this.body.position.y = (1 - k) * 2.5;
      if (this.deathT <= 0) this.mesh.visible = false;
      return;
    }
    if (!this.alive) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    if (this.spawnT > 0) { this.spawnT -= dt; const k = 1 - Math.max(0, this.spawnT / 0.6); const s = 1 + Math.sin(k * Math.PI) * 0.25; this.body.scale.set(k * s, k * s, k * s); }
    else this.body.scale.setScalar(1);
    const local = rotY(this.vx, this.vz, -this.yaw);
    const tx = clamp(local.z * 0.016, -0.26, 0.26), tz = clamp(-local.x * 0.016 - this.av * 0.05, -0.26, 0.26);
    this.tiltX += (tx - this.tiltX) * Math.min(1, dt * 6);
    this.tiltZ += (tz - this.tiltZ) * Math.min(1, dt * 6);
    this.body.rotation.x = this.tiltX + Math.sin(t * 1.7) * 0.025 + this.bump * Math.sin(t * 30) * 0.08;
    this.body.rotation.z = this.tiltZ + Math.cos(t * 1.3) * 0.025;
    this.body.rotation.y = this.av * -0.02;
    this.body.position.y = Math.sin(t * 2.1) * 0.05 - this.bump * 0.15 + (this.finished ? Math.abs(Math.sin(t * 6)) * 0.3 : 0);
    for (const a of this.animals) { a.setCheer(this.finished); a.update(t); }
    // recoil: the raft dips away from a fresh toot
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 2);
    this.body.position.y -= this.recoil * 0.12;
    // aim arrows: show where each seat's toot pushes the raft
    this.seats.forEach((st, i) => {
      const pl = this.players[i], a = this.arrows[i];
      const len = Math.hypot(st.x, st.z);
      const r = rotY(-st.x / len, -st.z / len, pl.aim * AIM_MAX + st.skew);
      a.position.set(st.x * 0.62 + r.x * 0.2, 0.5, st.z * 0.62 + r.z * 0.2);
      a.rotation.z = Math.atan2(r.x, r.z) + Math.PI; // ShapeGeometry points +y, the mesh lies flat: +y maps to -z
      const s = pl.farting ? 1.25 : 1;
      a.scale.set(s, s, 1); a.material.opacity = pl.farting ? 1 : 0.75;
    });
  }
}
