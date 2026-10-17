import { seatLocal, rotY, AIM_SIGN } from './raft.js';
import { clamp } from './util.js';

/**
 * Bots fart when their seat's jet would push the raft toward a look-ahead target.
 * Each seat has a little personality: reaction time and how greedy it is with gas.
 */
export class Bots {
  constructor(track) {
    this.track = track;
    this.state = [0, 1, 2, 3].map((i) => ({ next: 0, fart: false, aim: 0, pop: false, react: 0.08 + i * 0.03 + Math.random() * 0.06, greedy: 0.5 + Math.random() * 0.4 }));
  }
  /** lateral target along the course: steer to gaps, away from spikes, else the middle */
  targetLat(d) {
    const T = this.track;
    let target = 0, weight = 0;
    for (const o of T.obstacles) {
      const od = o.d ?? (o.d = T.nearest(o.type === 'circle' ? o.x : (o.ax + o.bx) / 2, o.type === 'circle' ? o.z : (o.az + o.bz) / 2, Math.round(d)).d);
      const ahead = od - d;
      if (ahead < -2 || ahead > 34) continue;
      const s = T.at(od);
      const w = 1 - Math.abs(ahead) / 36;
      if (o.type === 'circle') {
        const lat = (o.x - s.x) * s.lx + (o.z - s.z) * s.lz;
        const away = lat >= 0 ? lat - 6.5 : lat + 6.5;
        target += clamp(away, -s.w + 3, s.w - 3) * w; weight += w;
      } else {
        // segment: compute free lateral span and aim at its centre
        const la = (o.ax - s.x) * s.lx + (o.az - s.z) * s.lz, lb = (o.bx - s.x) * s.lx + (o.bz - s.z) * s.lz;
        const lo = Math.min(la, lb), hi = Math.max(la, lb);
        const freeLeft = lo + s.w, freeRight = s.w - hi; // how much open water on each side of the bar
        const c = freeLeft > freeRight ? (-s.w + lo) / 2 : (hi + s.w) / 2;
        if (o.lethal || Math.max(freeLeft, freeRight) > 3) { target += clamp(c, -s.w + 3, s.w - 3) * w * 1.5; weight += w * 1.5; }
      }
    }
    return weight > 0 ? target / weight : 0;
  }
  read(raft, dt, t, humans) {
    const T = this.track;
    const out = [];
    const sp = Math.hypot(raft.vx, raft.vz);
    const look = 8 + sp * 0.35;
    const tl = this.targetLat(raft.d);
    // forward direction = course tangent a little ahead; lateral error = where we want to be across the channel
    const ahead = T.at(raft.d + look);
    const here = T.at(raft.d);
    const vlat = raft.vx * here.lx + raft.vz * here.lz; // sideways speed (+ = drifting left)
    const err = (tl - raft.lat) - vlat * 0.7;              // metres to correct, with predictive damping
    const latK = clamp(err / 3.5, -1, 1);
    const fwdK = sp > 12 ? 0.15 : 0.55;                     // ease off forward pushing when already fast
    let dx = ahead.tx * fwdK + here.lx * latK, dz = ahead.tz * fwdK + here.lz * latK;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    // counter-spin when the raft is rotating fast
    for (let i = 0; i < 4; i++) {
      const st = this.state[i];
      if (humans[i]) { out.push(null); continue; }
      if (t >= st.next) {
        st.next = t + st.react;
        const sl = seatLocal(i); const len = Math.hypot(sl.x, sl.z);
        const ux = -sl.x / len, uz = -sl.z / len;
        let best = -2, bestAim = 0;
        for (const aim of [-1, -0.5, 0, 0.5, 1]) {
          const r = rotY(ux, uz, aim * 0.75 * AIM_SIGN[i]);
          const w = rotY(r.x, r.z, raft.yaw);
          let score = w.x * dx + w.z * dz;
          // prefer torque that cancels spin
          const rw = rotY(sl.x, sl.z, raft.yaw);
          const torque = rw.z * w.x - rw.x * w.z;
          score -= torque * raft.av * 0.08;
          if (score > best) { best = score; bestAim = aim; }
        }
        const pl = raft.players[i];
        const threshold = pl.gas > 60 ? 0.35 : pl.gas > 25 ? 0.55 : 0.8;
        st.fart = best > threshold && !pl.empty && Math.random() < 0.97;
        st.pop = st.fart && best > 0.8 && sp < 6 && Math.random() < 0.3;
        st.aim = bestAim;
      } else st.pop = false;
      out.push({ fart: st.fart, aim: st.aim, pop: st.pop });
    }
    return out;
  }
}
