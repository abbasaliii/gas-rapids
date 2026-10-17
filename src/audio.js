/**
 * All sounds are synthesised with WebAudio — no sample files, nothing to license.
 * Farts: band-passed noise + a detuned saw, fluttered by an LFO, with pitch that sags as gas runs out.
 */
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.voices = new Map(); }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);
    // noise buffer
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // river ambience
    const amb = ctx.createBufferSource(); amb.buffer = buf; amb.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.05;
    amb.connect(lp).connect(g).connect(this.master); amb.start();
    this.ambGain = g;
  }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.7 : 0; }
  get ok() { return this.ctx && this.enabled; }

  fartStart(seat) {
    if (!this.ok || this.voices.has(seat)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const base = [95, 120, 80, 105][seat] * (0.9 + Math.random() * 0.2);
    const out = ctx.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.5, t + 0.04);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 2;
    out.connect(lp).connect(this.master);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * 0.8, t + 2.5);
    const osc2 = ctx.createOscillator(); osc2.type = 'square'; osc2.frequency.value = base * 0.5;
    const og = ctx.createGain(); og.gain.value = 0.35; osc.connect(og); osc2.connect(og); og.connect(out);
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 180 + Math.random() * 200; bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.value = 0.6; n.connect(bp).connect(ng).connect(out);
    // flutter
    const lfo = ctx.createOscillator(); lfo.frequency.value = 18 + Math.random() * 14 + seat * 2;
    const lg = ctx.createGain(); lg.gain.value = 0.45; lfo.connect(lg).connect(out.gain);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 6 + Math.random() * 3;
    const lg2 = ctx.createGain(); lg2.gain.value = 25; lfo2.connect(lg2).connect(osc.frequency);
    osc.start(); osc2.start(); n.start(); lfo.start(); lfo2.start();
    this.voices.set(seat, { out, nodes: [osc, osc2, n, lfo, lfo2] });
  }
  fartStop(seat) {
    const v = this.voices.get(seat); if (!v) return;
    const t = this.ctx.currentTime;
    v.out.gain.cancelScheduledValues(t); v.out.gain.setValueAtTime(v.out.gain.value, t); v.out.gain.linearRampToValueAtTime(0, t + 0.08);
    for (const n of v.nodes) n.stop(t + 0.1);
    this.voices.delete(seat);
  }
  pop(seat) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220 + seat * 20, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.16);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    o.connect(lp).connect(g).connect(this.master); o.start(); o.stop(t + 0.2);
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.4, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 300;
    n.connect(bp).connect(ng).connect(this.master); n.start(); n.stop(t + 0.15);
  }
  sputter(seat) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 140 - i * 20;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.linearRampToValueAtTime(0.25, t + i * 0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.07);
      o.connect(g).connect(this.master); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.08);
    }
  }
  bump(k = 0.5) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(80, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(lp).connect(g).connect(this.master); n.start(); n.stop(t + 0.32);
  }
  splash() {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(2500, t); bp.frequency.exponentialRampToValueAtTime(300, t + 0.7); bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    n.connect(bp).connect(g).connect(this.master); n.start(); n.stop(t + 0.85);
    this.tone(90, 0.4, 'sine', 0.5, t, 40);
  }
  tone(f, dur, type = 'sine', vol = 0.3, at = null, slideTo = null) {
    if (!this.ok) return;
    const ctx = this.ctx, t = at ?? ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  chime() { if (!this.ok) return; const t = this.ctx.currentTime; this.tone(660, 0.25, 'triangle', 0.3, t); this.tone(990, 0.4, 'triangle', 0.3, t + 0.12); }
  beep(final = false) { this.tone(final ? 880 : 440, final ? 0.5 : 0.15, 'square', 0.18); }
  fanfare() { if (!this.ok) return; const t = this.ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.3, t + i * 0.13)); }
}
