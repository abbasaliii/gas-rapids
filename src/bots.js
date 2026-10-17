import { rotY } from './raft.js';
import { clamp } from './util.js';

/**
 * Crew bots. They keep the raft moving, steer around hazards, and time the swinging/popping/crushing
 * hazards (anything the track lists in `timed`): hold the raft back while it is unsafe, punch through when it is.
 * They push harder while a human is tooting and are half-hearted on their own.
 */
export class Bots {
  constructor(track) {
    this.track = track;
    this.state = [0, 1, 2, 3].map((i) => ({ next: 0, fart: false, aim: 0, pop: false, react: 0.08 + i * 0.03 + Math.random() * 0.06 }));
    this.braking = false; this.punch = false; this.brakeSince = null; this.punchUntil = 0;
  }
  /** lateral target along the course: steer to gaps, away from spikes, else the middle */
  targetLat(d) {
    const T = this.track;
    let target = 0, weight = 0, nearestCircle = null;
    this.hazard = false;
    for (const o of T.obstacles) {
      const od = o.d ?? (o.d = T.nearest(o.type === 'circle' ? o.x : (o.ax + o.bx) / 2, o.type === 'circle' ? o.z : (o.az + o.bz) / 2, Math.round(d)).d);
      const ahead = od - d;
      if (ahead < 1 || ahead > 34 || (o.timed && o.kind !== 'trap')) continue; // hammers/crushers are handled by waiting, traps are also steered around
      this.hazard = true;
      const s = T.at(od);
      const w = 1 - Math.abs(ahead) / 36;
      if (o.type === 'circle') {
        // only the nearest round hazard counts: blending two slalom buoys lands you between them
        if (!nearestCircle || ahead < nearestCircle.ahead) {
          const lat = (o.x - s.x) * s.lx + (o.z - s.z) * s.lz;
          const away = lat >= 0 ? lat - 7 : lat + 7;
          nearestCircle = { ahead, target: clamp(away, -s.w + 3, s.w - 3), w: w * 2 };
        }
      } else {
        const la = (o.ax - s.x) * s.lx + (o.az - s.z) * s.lz, lb = (o.bx - s.x) * s.lx + (o.bz - s.z) * s.lz;
        const lo = Math.min(la, lb), hi = Math.max(la, lb);
        const freeLeft = lo + s.w, freeRight = s.w - hi;
        const c = freeLeft > freeRight ? (-s.w + lo) / 2 : (hi + s.w) / 2;
        if (o.lethal || Math.max(freeLeft, freeRight) > 3) { target += clamp(c, -s.w + 3, s.w - 3) * w * 1.5; weight += w * 1.5; }
      }
    }
    if (nearestCircle) { target += nearestCircle.target * nearestCircle.w; weight += nearestCircle.w; }
    return weight > 0 ? target / weight : 0;
  }
  read(raft, dt, t, humans, humanTooting = true) {
    const T = this.track;
    const out = [];
    const sp = Math.hypot(raft.vx, raft.vz);
    const look = 8 + sp * 0.35;
    let tl = this.targetLat(raft.d);
    if ((T.timed || []).some((h) => h.kind === 'crusher' && h.d - raft.d > -4 && h.d - raft.d < 16 + sp * 1.6)) tl = 0; // crushers: only the middle is safe
    const ahead = T.at(raft.d + look);
    const here = T.at(raft.d);
    const vlat = raft.vx * here.lx + raft.vz * here.lz;
    const vAlong = raft.vx * here.tx + raft.vz * here.tz;
    const err = (tl - raft.lat) - vlat * 0.7;
    const latK = clamp(err / 3.5, -1, 1);
    let fwdK = sp > 12 ? 0.15 : 0.55;
    fwdK *= 1 - Math.min(0.8, Math.abs(err) / 5);
    // timed hazards: is it safe to pass during the time we would be under/inside it?
    this.braking = false; this.punch = false;
    let saw = false;
    for (const h of T.timed || []) {
      const aheadD = h.d - raft.d;
      if (aheadD < -4 || aheadD > 16 + sp * 1.6) continue;
      saw = true;
      if (aheadD < 2) { this.punch = true; this.brakeSince = null; break; } // already in it: never reverse back in, get clear
      // we do not know how fast the punch will carry us, so the window must be clear for a slow and a fast crossing
      const tIn = Math.max(0, aheadD - h.span) / Math.max(sp, 9.5), tOut = (aheadD + h.span) / Math.max(sp, 5.5);
      let safe = h.kind !== 'crusher' || Math.abs(raft.lat) < 2.2; // crushers: only the middle is safe
      for (let tt = tIn; safe && tt <= tOut + 0.05; tt += 0.1) if (!h.safe(t + tt)) { safe = false; break; }
      if (!safe && this.brakeSince != null && t - this.brakeSince > 5 && h.safe(t + tIn) && h.safe(t + tOut)) safe = true;
      if (this.punchUntil > t && aheadD > -2) safe = true; // committed: once we go, we go
      if (!safe) { if (aheadD < 7 + sp * 1.1 && vAlong > -0.5) { this.braking = true; this.brakeSince ??= t; } }
      else if (aheadD < 14) { this.punch = true; this.brakeSince = null; if (!(this.punchUntil > t)) this.punchUntil = t + Math.min(2.2, (aheadD + h.span) / Math.max(sp, 5.5) + 0.4); }
      break;
    }
    if (!saw) this.brakeSince = null;
    let dx = ahead.tx * fwdK + here.lx * latK, dz = ahead.tz * fwdK + here.lz * latK;
    if (this.braking) { dx = -here.tx + here.lx * latK * 0.4; dz = -here.tz + here.lz * latK * 0.4; }
    else if (this.punch) { dx = ahead.tx + here.lx * latK * 0.6; dz = ahead.tz + here.lz * latK * 0.6; }
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;

    for (let i = 0; i < raft.seats.length; i++) {
      const st = this.state[i];
      if (humans[i]) { out.push(null); continue; }
      if (t >= st.next) {
        st.next = t + st.react;
        const seat = raft.seats[i];
        const len = Math.hypot(seat.x, seat.z);
        const ux = -seat.x / len, uz = -seat.z / len;
        let best = -2, bestAim = 0;
        for (const aim of [-1, -0.5, 0, 0.5, 1]) {
          const r = rotY(ux, uz, aim * 1.1 * seat.sign + seat.skew);
          const w = rotY(r.x, r.z, raft.yaw);
          let score = w.x * dx + w.z * dz;
          const rw = rotY(seat.x, seat.z, raft.yaw);
          const torque = rw.z * w.x - rw.x * w.z;
          score -= torque * raft.av * 0.08;
          if (score > best) { best = score; bestAim = aim; }
        }
        const pl = raft.players[i];
        const lazy = humanTooting ? 0 : 0.2;
        const threshold = this.braking || this.punch ? 0.25 : pl.gas > 65 ? 0.35 + lazy : pl.gas > 50 ? 0.6 + lazy : Math.abs(err) > 2.5 ? 0.85 : 2;
        st.fart = best > threshold && !pl.empty && (this.braking || this.punch || Math.random() < (humanTooting ? 0.97 : 0.75));
        st.pop = st.fart && best > 0.8 && sp < 6 && (this.punch || Math.random() < 0.3);
        st.aim = bestAim;
      } else st.pop = false;
      out.push({ fart: st.fart, aim: st.aim, pop: st.pop, free: this.braking });
    }
    return out;
  }
}
