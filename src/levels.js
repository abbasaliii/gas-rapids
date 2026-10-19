/**
 * Worlds and levels. A level is a list of path segments walked in order.
 *   len   : length in metres
 *   turn  : total heading change over the segment in degrees (+ = right, - = left)
 *   w     : half-width of the channel at the END of the segment (lerped from previous)
 *   f     : features placed along the segment, `at` is a 0..1 fraction of the segment
 *             buoy      { lat }                     spiked mine (lethal), lat is -1..1 of the usable width
 *             lava      { lat }                     lava pool (lethal)
 *             rock      { lat, r }                  boulder in the water (bumps you)
 *             roller    { side, len }               spinning spike bar hinged on the 'L' or 'R' bank, len = fraction of channel width
 *             gate      { gap, gw }                 fence with a gap centred at `gap` (-1..1), gap width gw metres
 *             hammer    { period, phase }           swinging spiked ball across the channel (lethal while low)
 *             trap      { lat, period, phase }      spikes that pop up out of the water (lethal while up)
 *             crusher   { period, phase }           two spiked blocks that slide in from the banks (lethal when they touch you)
 *             log       { len, speed, phase }       floating log drifting side to side (bumps you)
 *             whirl     { lat }                     whirlpool: pulls and spins the raft
 *             twister   { period }                  whirlpool that wanders from bank to bank
 *             geyser    { lat, period, phase }      erupts every `period` s and shoves the raft
 *             fan       { side, len }               a fan on one bank blows you toward the other for `len` metres
 *             cannon    { side, period, phase }      lobs a spiked ball across the channel (lethal in flight)
 *             spinner   { lat, len, speed }          windmill bar pinned mid-channel (bats you about)
 *             can       { lat }                     can of beans: refills everyone's gas
 *             ice       { len }                     slippery water for `len` metres
 *             boost     { len }                     fast current for `len` metres
 *             spikes    { side }                    spiky rails on 'L', 'R' or 'B' banks for this segment
 *             checkpoint, finish
 *   stars : [gold, silver] finish times in seconds (bronze is any finish)
 */
export const WORLDS = [
  {
    name: 'Jungle', color: '#5fd400', icon: '🌴',
    theme: { bankTop: 0x8bd84a, bankFace: 0xf0803c, bankTop2: 0xffa24d, wallH: 1.6, rail: 0x1fb5a8, water: 0x2f96ff, waterLight: 0xaee6ff, trees: 'jungle', decor: 'rocks', fog: 0x9fd9ff, sky: 0x8fd3ff, cloud: 0xffffff },
  },
  {
    name: 'Canyon', color: '#ff6a1f', icon: '🏜️',
    theme: { bankTop: 0xf28b73, bankFace: 0xe8694f, bankTop2: 0xf7a58c, wallH: 3.2, rail: 0x1fb5a8, water: 0x2f96ff, waterLight: 0xaee6ff, trees: 'none', decor: 'rocks', fog: 0xbfe3ff, sky: 0xa9dcff, cloud: 0xfff4e6 },
  },
  {
    name: 'Frostbite', color: '#7fd0ff', icon: '❄️',
    theme: { bankTop: 0xf4f9ff, bankFace: 0xbcd7ee, bankTop2: 0xe4f0fb, wallH: 2.2, rail: 0x2d6cdf, water: 0x3aa0ff, waterLight: 0xd6f1ff, trees: 'pine', decor: 'ice', fog: 0xdcefff, sky: 0xc4e5ff, cloud: 0xffffff },
  },
  {
    name: 'Volcano', color: '#ff3b1f', icon: '🌋',
    theme: { bankTop: 0x4a3f45, bankFace: 0x2d2630, bankTop2: 0x5c4b4f, wallH: 3.6, rail: 0xffa21f, water: 0x2a6fd6, waterLight: 0x8fc3ff, trees: 'dead', decor: 'lava', fog: 0xd9b3a3, sky: 0xe7a98f, cloud: 0x8c7a7a },
  },
];

export const LEVELS = [
  // ---------------------------------------------------------------- Jungle
  {
    name: 'First Toots', world: 0, seed: 7, current: 2.2, startW: 10, stars: [58, 73],
    segments: [
      { len: 70, turn: 0, w: 10, f: [{ type: 'rock', at: 0.75, lat: 0.4, r: 1.3 }] },
      { len: 60, turn: 30, w: 10, f: [{ type: 'can', at: 0.5, lat: 0.3 }, { type: 'rock', at: 0.8, lat: -0.5, r: 1.4 }, { type: 'spinner', at: 0.3, lat: 0, len: 5 }] },
      { len: 80, turn: -60, w: 9, f: [{ type: 'buoy', at: 0.5, lat: -0.45 }] },
      { len: 60, turn: 0, w: 9, f: [{ type: 'gate', at: 0.5, gap: 0.4, gw: 8 }, { type: 'can', at: 0.9, lat: -0.3 }, { type: 'rock', at: 0.2, lat: 0.6, r: 1.2 }] },
      { len: 50, turn: 45, w: 9, f: [{ type: 'checkpoint', at: 0.3 }, { type: 'cannon', at: 0.75, side: 'R', period: 4.5 }] },
      { len: 70, turn: -45, w: 9, f: [{ type: 'buoy', at: 0.4, lat: 0.5 }, { type: 'rock', at: 0.65, lat: 0, r: 1.3 }, { type: 'buoy', at: 0.85, lat: -0.5 }] },
      { len: 60, turn: 0, w: 9, f: [{ type: 'log', at: 0.35, len: 5, speed: 1 }, { type: 'log', at: 0.75, len: 4, speed: 1.3, phase: 1.5 }] },
      { len: 50, turn: 0, w: 10, f: [{ type: 'can', at: 0.3, lat: 0 }, { type: 'trap', at: 0.7, lat: 0, period: 4 }, { type: 'spinner', at: 0.95, lat: 0.4, len: 5 }] },
      { len: 60, turn: 0, w: 10, f: [{ type: 'finish', at: 0.7 }] },
    ],
  },
  {
    name: 'Monkey Bends', world: 0, seed: 11, current: 2.4, startW: 9, stars: [76, 95],
    segments: [
      { len: 60, turn: 0, w: 9, f: [{ type: 'rock', at: 0.4, lat: 0.5, r: 1.5 }, { type: 'trap', at: 0.8, lat: 0, period: 3.6 }] },
      { len: 70, turn: 70, w: 8, f: [{ type: 'spikes', side: 'R' }, { type: 'can', at: 0.5, lat: 0.3 }, { type: 'trap', at: 0.8, lat: -0.4, period: 3.6 }] },
      { len: 70, turn: -70, w: 8, f: [{ type: 'spikes', side: 'L' }, { type: 'buoy', at: 0.5, lat: -0.45 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'roller', at: 0.5, side: 'L', len: 0.35 }, { type: 'cannon', at: 0.85, side: 'L', period: 4 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 80, turn: -110, w: 8, f: [{ type: 'boost', at: 0.1, len: 50 }, { type: 'spikes', side: 'B' }, { type: 'rock', at: 0.6, lat: 0.6, r: 1.4 }, { type: 'spinner', at: 0.85, lat: -0.3, len: 6 }] },
      { len: 60, turn: 0, w: 8, f: [{ type: 'log', at: 0.3, len: 5, speed: 1.4 }, { type: 'log', at: 0.7, len: 5, speed: 1.1, phase: 2 }] },
      { len: 50, turn: 40, w: 8, f: [{ type: 'whirl', at: 0.5, lat: 0 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'roller', at: 0.3, side: 'R', len: 0.35 }, { type: 'roller', at: 0.75, side: 'L', len: 0.35 }] },
      { len: 40, turn: 0, w: 9, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 70, turn: -40, w: 8, f: [{ type: 'buoy', at: 0.3, lat: 0.55 }, { type: 'buoy', at: 0.65, lat: -0.55 }, { type: 'can', at: 0.9, lat: 0 }] },
      { len: 60, turn: 0, w: 9, f: [{ type: 'finish', at: 0.7 }] },
    ],
  },
  // ---------------------------------------------------------------- Canyon
  {
    name: 'Red Rock Run', world: 1, seed: 23, current: 3.2, startW: 9, stars: [78, 98],
    segments: [
      { len: 60, turn: 0, w: 9, f: [{ type: 'rock', at: 0.6, lat: -0.4, r: 1.6 }] },
      { len: 70, turn: -60, w: 8, f: [{ type: 'spikes', side: 'L' }, { type: 'fan', at: 0.2, side: 'L', len: 40 }] },
      { len: 60, turn: 0, w: 8, f: [{ type: 'hammer', at: 0.5, period: 3.8 }] },
      { len: 70, turn: 60, w: 7, f: [{ type: 'buoy', at: 0.5, lat: 0.65 }, { type: 'can', at: 0.3, lat: -0.4 }, { type: 'trap', at: 0.8, lat: -0.3, period: 3.8 }, { type: 'cannon', at: 0.15, side: 'L', period: 3.8 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 110, turn: 150, w: 7, f: [{ type: 'boost', at: 0.05, len: 90 }, { type: 'spikes', side: 'B' }, { type: 'rock', at: 0.5, lat: -0.5, r: 1.4 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'hammer', at: 0.3, period: 3.6 }, { type: 'hammer', at: 0.7, period: 3.6 }] },
      { len: 50, turn: -40, w: 8, f: [{ type: 'crusher', at: 0.5, period: 4.8 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 90, turn: -120, w: 7, f: [{ type: 'boost', at: 0.1, len: 70 }, { type: 'fan', at: 0.4, side: 'R', len: 40 }] },
      { len: 60, turn: 40, w: 7, f: [{ type: 'buoy', at: 0.4, lat: 0.65 }, { type: 'buoy', at: 0.8, lat: -0.65 }] },
      { len: 70, turn: 0, w: 9, f: [{ type: 'roller', at: 0.25, side: 'R', len: 0.42 }, { type: 'finish', at: 0.8 }] },
    ],
  },
  {
    name: 'Dust Devil', world: 1, seed: 31, current: 3.0, startW: 9, stars: [75, 94],
    segments: [
      { len: 60, turn: 0, w: 9 },
      { len: 60, turn: 45, w: 8, f: [{ type: 'geyser', at: 0.5, lat: 0, period: 4 }, { type: 'rock', at: 0.8, lat: 0.6, r: 1.3 }] },
      { len: 60, turn: -90, w: 7, f: [{ type: 'spikes', side: 'R' }, { type: 'twister', at: 0.5, period: 6 }] },
      { len: 50, turn: 0, w: 7, f: [{ type: 'gate', at: 0.3, gap: 0.5, gw: 7 }, { type: 'spinner', at: 0.55, lat: 0, len: 5 }, { type: 'gate', at: 0.8, gap: -0.5, gw: 7 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }, { type: 'cannon', at: 0.85, side: 'R', period: 3.6 }] },
      { len: 70, turn: 90, w: 7, f: [{ type: 'geyser', at: 0.3, lat: 0.4, period: 3.5 }, { type: 'geyser', at: 0.7, lat: -0.4, period: 3.5, phase: 1.7 }, { type: 'can', at: 0.5, lat: 0 }] },
      { len: 80, turn: -130, w: 7, f: [{ type: 'boost', at: 0.1, len: 60 }, { type: 'spikes', side: 'B' }, { type: 'fan', at: 0.5, side: 'L', len: 30 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'trap', at: 0.25, lat: 0.4, period: 3.6 }, { type: 'trap', at: 0.5, lat: -0.4, period: 3.6, phase: 1.6 }, { type: 'trap', at: 0.75, lat: 0.4, period: 3.6 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 60, turn: 30, w: 7, f: [{ type: 'hammer', at: 0.5, period: 3.6 }] },
      { len: 60, turn: -30, w: 7, f: [{ type: 'log', at: 0.4, len: 6, speed: 1.5 }, { type: 'crusher', at: 0.8, period: 4.6 }] },
      { len: 70, turn: 0, w: 9, f: [{ type: 'finish', at: 0.8 }] },
    ],
  },
  // ---------------------------------------------------------------- Frostbite
  {
    name: 'Slippery Slopes', world: 2, seed: 41, current: 2.6, startW: 9, stars: [74, 93],
    segments: [
      { len: 60, turn: 0, w: 9, f: [{ type: 'rock', at: 0.7, lat: 0.4, r: 1.5 }] },
      { len: 70, turn: -50, w: 8, f: [{ type: 'ice', at: 0.1, len: 60 }, { type: 'can', at: 0.5, lat: 0.3 }, { type: 'rock', at: 0.8, lat: -0.5, r: 1.4 }] },
      { len: 60, turn: 50, w: 8, f: [{ type: 'log', at: 0.5, len: 5, speed: 1.2 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'roller', at: 0.5, side: 'L', len: 0.35 }, { type: 'ice', at: 0, len: 60 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 90, turn: 120, w: 7, f: [{ type: 'ice', at: 0, len: 90 }, { type: 'spikes', side: 'B' }, { type: 'fan', at: 0.3, side: 'R', len: 40 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'trap', at: 0.2, lat: 0, period: 3.8 }, { type: 'buoy', at: 0.55, lat: 0.6 }, { type: 'buoy', at: 0.85, lat: -0.6 }] },
      { len: 60, turn: -60, w: 7, f: [{ type: 'hammer', at: 0.5, period: 3.6 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 70, turn: -60, w: 7, f: [{ type: 'ice', at: 0, len: 70 }, { type: 'twister', at: 0.5, period: 7 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'gate', at: 0.4, gap: 0.5, gw: 7 }, { type: 'log', at: 0.8, len: 5, speed: 1.6 }] },
      { len: 70, turn: 0, w: 9, f: [{ type: 'crusher', at: 0.3, period: 4.6 }, { type: 'finish', at: 0.8 }] },
    ],
  },
  {
    name: 'Frozen Falls', world: 2, seed: 47, current: 2.8, startW: 9, stars: [75, 94],
    segments: [
      { len: 60, turn: 0, w: 9 },
      { len: 70, turn: 70, w: 8, f: [{ type: 'ice', at: 0, len: 70 }, { type: 'geyser', at: 0.5, lat: 0.3, period: 4 }, { type: 'rock', at: 0.8, lat: -0.5, r: 1.4 }] },
      { len: 60, turn: -70, w: 7, f: [{ type: 'log', at: 0.3, len: 5, speed: 1.3 }, { type: 'log', at: 0.7, len: 5, speed: 1.3, phase: 2 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'hammer', at: 0.5, period: 3.6 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 100, turn: -140, w: 7, f: [{ type: 'ice', at: 0, len: 100 }, { type: 'spikes', side: 'B' }, { type: 'rock', at: 0.5, lat: 0.4, r: 1.4 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'roller', at: 0.3, side: 'R', len: 0.35 }, { type: 'cannon', at: 0.55, side: 'R', period: 3.6 }, { type: 'roller', at: 0.75, side: 'L', len: 0.35 }] },
      { len: 60, turn: 40, w: 7, f: [{ type: 'whirl', at: 0.5, lat: 0.2 }, { type: 'can', at: 0.2, lat: -0.4 }, { type: 'fan', at: 0.6, side: 'L', len: 25 }, { type: 'spinner', at: 0.85, lat: 0, len: 6 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 70, turn: -40, w: 7, f: [{ type: 'buoy', at: 0.3, lat: 0.5 }, { type: 'buoy', at: 0.6, lat: -0.5 }, { type: 'buoy', at: 0.9, lat: 0.5 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'crusher', at: 0.3, period: 4.4 }, { type: 'crusher', at: 0.75, period: 4.4, phase: 1.8 }] },
      { len: 70, turn: 0, w: 9, f: [{ type: 'finish', at: 0.8 }] },
    ],
  },
  // ---------------------------------------------------------------- Volcano
  {
    name: 'Magma Mouth', world: 3, seed: 59, current: 3.0, startW: 9, stars: [75, 94],
    segments: [
      { len: 60, turn: 0, w: 9, f: [{ type: 'rock', at: 0.7, lat: 0.5, r: 1.5 }] },
      { len: 70, turn: -45, w: 8, f: [{ type: 'lava', at: 0.5, lat: 0.7 }, { type: 'trap', at: 0.8, lat: -0.2, period: 3.8 }] },
      { len: 60, turn: 45, w: 8, f: [{ type: 'lava', at: 0.3, lat: -0.7 }, { type: 'lava', at: 0.7, lat: 0.7 }, { type: 'can', at: 0.5, lat: 0 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'geyser', at: 0.5, lat: 0, period: 3.5 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 90, turn: 120, w: 7, f: [{ type: 'boost', at: 0.1, len: 70 }, { type: 'spikes', side: 'B' }, { type: 'lava', at: 0.5, lat: -0.8 }, { type: 'fan', at: 0.6, side: 'R', len: 30 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'hammer', at: 0.3, period: 3.6 }, { type: 'hammer', at: 0.7, period: 3.6 }] },
      { len: 60, turn: -60, w: 7, f: [{ type: 'twister', at: 0.5, period: 6 }, { type: 'lava', at: 0.5, lat: 0.8 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 60, turn: 60, w: 7, f: [{ type: 'roller', at: 0.5, side: 'L', len: 0.35 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'geyser', at: 0.3, lat: 0.4, period: 3 }, { type: 'crusher', at: 0.6, period: 4.6 }, { type: 'geyser', at: 0.85, lat: -0.4, period: 3, phase: 1.5 }] },
      { len: 70, turn: 0, w: 9, f: [{ type: 'finish', at: 0.8 }] },
    ],
  },
  {
    name: 'Eruption Run', world: 3, seed: 67, current: 3.2, startW: 9, stars: [89, 111],
    segments: [
      { len: 60, turn: 0, w: 9, f: [{ type: 'rock', at: 0.6, lat: -0.4, r: 1.5 }] },
      { len: 60, turn: 30, w: 7, f: [{ type: 'geyser', at: 0.5, lat: 0.3, period: 2.8 }, { type: 'lava', at: 0.8, lat: -0.8 }] },
      { len: 70, turn: -90, w: 7, f: [{ type: 'spikes', side: 'B' }, { type: 'hammer', at: 0.5, period: 3.6 }, { type: 'fan', at: 0.7, side: 'L', len: 25 }] },
      { len: 50, turn: 0, w: 7, f: [{ type: 'gate', at: 0.3, gap: -0.5, gw: 7 }, { type: 'trap', at: 0.55, lat: 0, period: 3.6 }, { type: 'gate', at: 0.8, gap: 0.5, gw: 7 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }, { type: 'can', at: 0.9, lat: 0 }] },
      { len: 100, turn: 150, w: 7, f: [{ type: 'boost', at: 0.05, len: 85 }, { type: 'spikes', side: 'B' }, { type: 'lava', at: 0.35, lat: -0.8 }, { type: 'can', at: 0.65, lat: 0.5 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'roller', at: 0.3, side: 'R', len: 0.35 }, { type: 'cannon', at: 0.55, side: 'L', period: 3.6 }, { type: 'roller', at: 0.75, side: 'L', len: 0.35 }] },
      { len: 60, turn: -45, w: 7, f: [{ type: 'twister', at: 0.3, period: 5.5 }, { type: 'geyser', at: 0.75, lat: -0.2, period: 3 }, { type: 'spinner', at: 0.55, lat: 0.3, len: 6, speed: 1.6 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 70, turn: -60, w: 7, f: [{ type: 'hammer', at: 0.3, period: 3.6 }, { type: 'hammer', at: 0.64, period: 3.6 }] },
      { len: 60, turn: 30, w: 7, f: [{ type: 'buoy', at: 0.3, lat: 0.5 }, { type: 'buoy', at: 0.6, lat: -0.5 }, { type: 'buoy', at: 0.9, lat: 0.5 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'crusher', at: 0.3, period: 4.6 }, { type: 'trap', at: 0.6, lat: 0.3, period: 3 }, { type: 'trap', at: 0.8, lat: -0.3, period: 3, phase: 1.5 }] },
      { len: 70, turn: 0, w: 9, f: [{ type: 'finish', at: 0.8 }] },
    ],
  },
];
for (const l of LEVELS) l.theme = WORLDS[l.world].theme;
