/**
 * All sounds and music are synthesised with WebAudio: no sample files, nothing to license.
 * Toots are layered: a wet low "brrr" (two detuned saws through a resonant low-pass, fluttered at 20-40 Hz),
 * a breathy "pfff" (band-passed noise), and a short squelch on the way in. Each seat has its own pitch.
 */
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.musicOn = true; this.voices = new Map(); }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain(); this.master.gain.value = 0.75;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.2 : 0; this.musicBus.connect(this.master);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const amb = ctx.createBufferSource(); amb.buffer = buf; amb.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.value = 0.045;
    amb.connect(lp).connect(g).connect(this.master); amb.start();
  }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.75 : 0; }
  setMusic(on) { this.musicOn = on; if (this.musicBus) this.musicBus.gain.value = on ? 0.2 : 0; }
  get ok() { return this.ctx && this.enabled; }

  // ---------------------------------------------------------------- toots
  fartStart(seat) {
    if (!this.ok || this.voices.has(seat)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const base = [78, 104, 66, 90][seat % 4] * (0.92 + Math.random() * 0.16);
    const out = ctx.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.55, t + 0.05);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(520, t); lp.Q.value = 6;
    lp.frequency.linearRampToValueAtTime(380, t + 3);
    out.connect(lp).connect(this.sfx);
    // body: two detuned saws + a sub square
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.setValueAtTime(base, t); o1.frequency.linearRampToValueAtTime(base * 0.86, t + 3);
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(base * 1.013, t); o2.frequency.linearRampToValueAtTime(base * 0.87, t + 3);
    const o3 = ctx.createOscillator(); o3.type = 'square'; o3.frequency.setValueAtTime(base * 0.5, t); o3.frequency.linearRampToValueAtTime(base * 0.43, t + 3);
    const og = ctx.createGain(); og.gain.value = 0.3; o1.connect(og); o2.connect(og); const sg = ctx.createGain(); sg.gain.value = 0.18; o3.connect(sg); og.connect(out); sg.connect(out);
    // breath: band-passed noise
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 240 + Math.random() * 220; bp.Q.value = 0.9;
    const ng = ctx.createGain(); ng.gain.value = 0.5; n.connect(bp).connect(ng).connect(out);
    // flutter: the lips. Rate wanders so it never sounds like a buzzer.
    const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.setValueAtTime(22 + Math.random() * 10 + seat * 1.5, t);
    lfo.frequency.linearRampToValueAtTime(34 + Math.random() * 12, t + 3);
    const lg = ctx.createGain(); lg.gain.value = 0.42; lfo.connect(lg).connect(out.gain);
    const wob = ctx.createOscillator(); wob.frequency.value = 4.5 + Math.random() * 3;
    const wg = ctx.createGain(); wg.gain.value = base * 0.09; wob.connect(wg); wg.connect(o1.frequency); wg.connect(o2.frequency);
    // the squelch on the way in
    const sq = ctx.createOscillator(); sq.type = 'sawtooth'; sq.frequency.setValueAtTime(base * 3.2, t); sq.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.14);
    const sqg = ctx.createGain(); sqg.gain.setValueAtTime(0.35, t); sqg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    const sqf = ctx.createBiquadFilter(); sqf.type = 'bandpass'; sqf.frequency.value = 900; sqf.Q.value = 3;
    sq.connect(sqf).connect(sqg).connect(this.sfx); sq.start(t); sq.stop(t + 0.2);
    [o1, o2, o3, n, lfo, wob].forEach((x) => x.start(t));
    this.voices.set(seat, { out, nodes: [o1, o2, o3, n, lfo, wob] });
  }
  fartStop(seat) {
    const v = this.voices.get(seat); if (!v) return;
    const ctx = this.ctx, t = ctx.currentTime;
    v.out.gain.cancelScheduledValues(t); v.out.gain.setValueAtTime(v.out.gain.value, t); v.out.gain.linearRampToValueAtTime(0, t + 0.09);
    for (const n of v.nodes) n.stop(t + 0.12);
    this.voices.delete(seat);
    // a little tail-off blip
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.14);
  }
  pop(seat) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(200 + seat * 25, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    o.connect(lp).connect(g).connect(this.sfx); o.start(); o.stop(t + 0.22);
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.35, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 1.5;
    n.connect(bp).connect(ng).connect(this.sfx); n.start(); n.stop(t + 0.12);
  }
  sputter(seat) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 150 - i * 18 + seat * 8;
      const g = ctx.createGain(); const t0 = t + i * 0.08;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.25, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
      o.connect(g).connect(this.sfx); o.start(t0); o.stop(t0 + 0.07);
    }
  }
  // ---------------------------------------------------------------- world
  bump(k = 0.5) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(80, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(lp).connect(g).connect(this.sfx); n.start(); n.stop(t + 0.32);
  }
  splash() {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(2500, t); bp.frequency.exponentialRampToValueAtTime(300, t + 0.7); bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    n.connect(bp).connect(g).connect(this.sfx); n.start(); n.stop(t + 0.85);
    this.tone(90, 0.4, 'sine', 0.5, t, 40);
  }
  geyser() {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3000, t + 0.5); bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    n.connect(bp).connect(g).connect(this.sfx); n.start(); n.stop(t + 1);
  }
  pickup() { if (!this.ok) return; const t = this.ctx.currentTime; [880, 1175, 1760].forEach((f, i) => this.tone(f, 0.18, 'square', 0.18, t + i * 0.07)); }
  tone(f, dur, type = 'sine', vol = 0.3, at = null, slideTo = null, dest = null) {
    if (!this.ok) return;
    const ctx = this.ctx, t = at ?? ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  chime() { if (!this.ok) return; const t = this.ctx.currentTime; this.tone(660, 0.25, 'triangle', 0.3, t); this.tone(990, 0.4, 'triangle', 0.3, t + 0.12); }
  beep(final = false) { this.tone(final ? 880 : 440, final ? 0.5 : 0.15, 'square', 0.18); }
  fanfare() { if (!this.ok) return; const t = this.ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.3, t + i * 0.13)); }
  star(n) { if (!this.ok) return; const t = this.ctx.currentTime; this.tone(880 * Math.pow(1.25, n), 0.35, 'triangle', 0.3, t); this.tone(1320 * Math.pow(1.25, n), 0.5, 'sine', 0.2, t + 0.05); }

  // ---------------------------------------------------------------- music
  /**
   * A bouncy 16-bar loop in C: I - V - vi - IV, then vi - IV - I - V. Plucky lead, pumping bass, kick / snare / hats.
   * Everything is scheduled a little ahead so it never stutters when the game is busy.
   */
  startMusic(mode = 'race') {
    if (!this.ctx || this.musicTimer) return;
    const ctx = this.ctx;
    const bpm = mode === 'race' ? 118 : 100, beat = 60 / bpm, step = beat / 4;
    const chords = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]]; // semitones over C
    const roots = [0, 7, 9, 5, 9, 5, 0, 7];
    const riff = [0, 2, 1, 2, 0, 2, 1, 0]; // chord-tone index pattern per 8th
    const f = (n, oct = 0) => 130.81 * Math.pow(2, n / 12 + oct);
    let i = 0, next = ctx.currentTime + 0.1;
    const tick = () => {
      while (next < ctx.currentTime + 0.35) {
        const t = next, bar = Math.floor(i / 16) % 8, s16 = i % 16;
        const ch = chords[bar];
        // drums
        if (s16 % 4 === 0) this.kick(t, 0.5);
        if (s16 === 4 || s16 === 12) this.snare(t, 0.3);
        if (s16 % 2 === 0) this.hat(t, s16 % 4 === 2 ? 0.1 : 0.06);
        if (s16 === 14 && bar % 2) this.snare(t, 0.18);
        // bass: root on the beat, fifth on the off-beat
        if (s16 % 4 === 0) this.tone(f(roots[bar], -1), beat * 0.8, 'square', 0.14, t, null, this.musicBus);
        if (s16 % 4 === 2) this.tone(f(roots[bar] + 7, -1), beat * 0.4, 'square', 0.09, t, null, this.musicBus);
        // lead: plucky arpeggio on 8ths with a melodic lift at bar ends
        if (s16 % 2 === 0) {
          const idx = riff[(s16 / 2) % 8];
          const note = ch[idx] + (bar === 3 || bar === 7 ? (s16 >= 12 ? 12 : 0) : 0);
          this.pluck(f(note, 1), t, 0.11);
        }
        next += step; i++;
      }
    };
    this.musicTimer = setInterval(tick, 100); tick();
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
  pluck(freq, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = freq * 2.005;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
  }
  kick(t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 0.24);
  }
  snare(t, vol) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    n.connect(bp).connect(g).connect(this.musicBus); n.start(t); n.stop(t + 0.15);
    this.tone(190, 0.1, 'triangle', vol * 0.5, t, 120, this.musicBus);
  }
  hat(t, vol) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    n.connect(hp).connect(g).connect(this.musicBus); n.start(t); n.stop(t + 0.05);
  }
}
