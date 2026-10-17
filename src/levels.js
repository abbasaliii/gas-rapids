/**
 * Level definitions. A level is a list of path segments walked in order.
 *   len   : length in metres
 *   turn  : total heading change over the segment in degrees (+ = right, - = left)
 *   w     : half-width of the channel at the END of the segment (lerped from previous)
 *   f     : features placed along the segment, `at` is a 0..1 fraction of the segment
 *             buoy      { lat }            spiked mine at lateral offset (-1..1 of half width)
 *             roller    { side, len }      spinning spike bar hinged on 'L' or 'R' bank, len = fraction of width
 *             gate      { gap, gw }        fence across the channel with a gap centred at lat `gap` (-1..1), gap width gw metres
 *             checkpoint
 *             boost     { len }            fast current for `len` metres
 *             spikes    { side }           spiky rail decoration on 'L','R' or 'B' banks for this segment
 *             finish
 */
export const LEVELS = [
  {
    name: 'Jungle Rapids',
    seed: 7,
    theme: { bankTop: 0x8bd84a, bankFace: 0xf0803c, bankTop2: 0xffa24d, wallH: 1.6, rail: 0x6fcf3a, water: 0x3aa7ff, trees: true, fog: 0x9fd9ff },
    current: 2.2,
    startW: 10,
    segments: [
      { len: 70, turn: 0, w: 10 },
      { len: 60, turn: 45, w: 9, f: [{ type: 'buoy', at: 0.55, lat: -0.35 }] },
      { len: 80, turn: -90, w: 8, f: [{ type: 'buoy', at: 0.35, lat: 0.45 }, { type: 'buoy', at: 0.7, lat: -0.4 }, { type: 'spikes', side: 'R' }] },
      { len: 50, turn: 0, w: 7, f: [{ type: 'roller', at: 0.5, side: 'L', len: 0.35 }] },
      { len: 70, turn: 90, w: 9, f: [{ type: 'spikes', side: 'L' }] },
      { len: 40, turn: 0, w: 9, f: [{ type: 'checkpoint', at: 0.4 }] },
      { len: 50, turn: -60, w: 8, f: [{ type: 'buoy', at: 0.5, lat: 0.5 }] },
      { len: 50, turn: 60, w: 8, f: [{ type: 'buoy', at: 0.5, lat: -0.5 }] },
      { len: 80, turn: 0, w: 8, f: [{ type: 'gate', at: 0.3, gap: -0.5, gw: 7.5 }, { type: 'gate', at: 0.7, gap: 0.5, gw: 7.5 }] },
      { len: 90, turn: -120, w: 10, f: [{ type: 'boost', at: 0.1, len: 60 }, { type: 'spikes', side: 'B' }] },
      { len: 40, turn: 0, w: 9, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 70, turn: 0, w: 8, f: [{ type: 'roller', at: 0.3, side: 'R', len: 0.5 }, { type: 'roller', at: 0.75, side: 'L', len: 0.5 }] },
      { len: 50, turn: 45, w: 9 },
      { len: 60, turn: 0, w: 10, f: [{ type: 'finish', at: 0.7 }] },
    ],
  },
  {
    name: 'Canyon Slide',
    seed: 23,
    theme: { bankTop: 0xf28b73, bankFace: 0xe8694f, bankTop2: 0xf7a58c, wallH: 3.2, rail: 0x6fcf3a, water: 0x3aa7ff, trees: false, fog: 0xbfe3ff },
    current: 3.4,
    startW: 9,
    segments: [
      { len: 60, turn: 0, w: 9 },
      { len: 70, turn: -70, w: 7, f: [{ type: 'spikes', side: 'L' }] },
      { len: 60, turn: 70, w: 7, f: [{ type: 'buoy', at: 0.5, lat: 0.7 }, { type: 'spikes', side: 'R' }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'roller', at: 0.35, side: 'L', len: 0.35 }, { type: 'roller', at: 0.75, side: 'R', len: 0.35 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 110, turn: 150, w: 7, f: [{ type: 'boost', at: 0.05, len: 90 }, { type: 'spikes', side: 'B' }] },
      { len: 50, turn: -40, w: 7, f: [{ type: 'buoy', at: 0.3, lat: -0.7 }, { type: 'buoy', at: 0.7, lat: 0.7 }] },
      { len: 60, turn: 0, w: 7, f: [{ type: 'gate', at: 0.25, gap: 0.55, gw: 7 }, { type: 'gate', at: 0.6, gap: -0.55, gw: 7 }, { type: 'gate', at: 0.95, gap: 0, gw: 7 }] },
      { len: 40, turn: 0, w: 8, f: [{ type: 'checkpoint', at: 0.5 }] },
      { len: 90, turn: -120, w: 7, f: [{ type: 'boost', at: 0.1, len: 70 }] },
      { len: 60, turn: 40, w: 7, f: [{ type: 'buoy', at: 0.4, lat: 0.7 }, { type: 'buoy', at: 0.8, lat: -0.7 }] },
      { len: 70, turn: 0, w: 9, f: [{ type: 'roller', at: 0.25, side: 'R', len: 0.42 }, { type: 'finish', at: 0.8 }] },
    ],
  },
];
