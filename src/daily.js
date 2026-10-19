import { WORLDS } from './levels.js';
import { rng } from './util.js';

/** Today's date key in UTC, e.g. 2026-10-19. Everyone in the world gets the same river for the same key. */
export function todayKey(d = new Date()) { return d.toISOString().slice(0, 10); }

function seedOf(key) { let h = 2166136261; for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/**
 * Builds a new level from a date: a different world, path and hazard mix every day, the same for every player.
 * Hazards are drawn from a palette that keeps at least 7 m of open water so the raft always fits.
 */
export function dailyLevel(key = todayKey()) {
  const rand = rng(seedOf(key));
  const world = Math.floor(rand() * WORLDS.length);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const segments = [{ len: 60, turn: 0, w: 9 }];
  const count = 10 + Math.floor(rand() * 3);
  let sinceCp = 0;
  for (let i = 0; i < count; i++) {
    const len = 50 + Math.floor(rand() * 5) * 10;
    const turn = pick([0, 0, 30, -30, 45, -45, 60, -60, 90, -90, 120, -120]) * (Math.abs(turn0(i)) ? 1 : 1);
    const w = pick([7, 7, 8, 8, 9]);
    const f = [];
    const n = 1 + Math.floor(rand() * 2) + (i > 5 ? 1 : 0);
    const used = new Set();
    for (let k = 0; k < n; k++) {
      const at = 0.2 + k * (0.6 / Math.max(1, n - 1)) + (rand() - 0.5) * 0.08;
      const type = pick(['buoy', 'buoy', 'rock', 'log', 'trap', 'gate', 'whirl', 'geyser', 'hammer', 'roller', 'cannon', 'spinner', 'fan', 'can', 'can', 'crusher']);
      if (used.has(type) && type !== 'buoy' && type !== 'rock' && type !== 'can') continue;
      used.add(type);
      const lat = pick([-0.6, -0.45, 0.45, 0.6]);
      if (type === 'buoy' || type === 'rock' || type === 'can' || type === 'whirl' || type === 'geyser' || type === 'trap') f.push({ type, at, lat: type === 'can' ? pick([-0.3, 0, 0.3]) : lat, r: 1.4, period: 3.6 + rand() });
      else if (type === 'log') f.push({ type, at, len: 5, speed: 1 + rand() * 0.6 });
      else if (type === 'gate') f.push({ type, at, gap: pick([-0.5, 0, 0.5]), gw: 7.5 });
      else if (type === 'hammer') f.push({ type, at, period: 3.6 + rand() * 0.6 });
      else if (type === 'roller') f.push({ type, at, side: pick(['L', 'R']), len: 0.35 });
      else if (type === 'cannon') f.push({ type, at, side: pick(['L', 'R']), period: 3.8 + rand() });
      else if (type === 'spinner') f.push({ type, at, lat: pick([-0.3, 0, 0.3]), len: 5 });
      else if (type === 'fan') f.push({ type, at, side: pick(['L', 'R']), len: 30 });
      else if (type === 'crusher') f.push({ type, at, period: 4.6 + rand() * 0.6 });
    }
    if (Math.abs(turn) >= 90 && rand() < 0.5) f.push({ type: 'boost', at: 0.1, len: Math.round(len * 0.6) }, { type: 'spikes', side: 'B' });
    if (world === 2 && rand() < 0.4) f.push({ type: 'ice', at: 0, len });
    if (world === 3 && rand() < 0.4) f.push({ type: 'lava', at: 0.5, lat: pick([-0.75, 0.75]) });
    sinceCp += len;
    if (sinceCp > 220) { f.push({ type: 'checkpoint', at: 0.95 }); sinceCp = 0; }
    segments.push({ len, turn, w, f });
  }
  segments.push({ len: 70, turn: 0, w: 9, f: [{ type: 'finish', at: 0.8 }] });
  return { name: 'Daily River ' + key, world, seed: seedOf(key), current: 2.6 + world * 0.2, startW: 9, stars: [999, 999], segments, theme: WORLDS[world].theme, daily: key };
}
function turn0() { return 0; }
