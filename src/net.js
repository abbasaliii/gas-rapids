/**
 * Party networking. Everything is peer-to-peer over WebRTC:
 *  - game data on PeerJS data connections (host runs the simulation, clients send inputs, host streams snapshots)
 *  - voice on PeerJS media calls in a full mesh (every player hears every other player)
 * The only outside service is the free PeerJS broker, used once to introduce peers to each other.
 */
import Peer from 'peerjs';
export { Peer };

const PREFIX = 'gasrapids-v1-';
// STUN for the common case; a public TURN relay (Open Relay Project, free) for players behind strict NATs.
const ICE = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'], username: 'openrelayproject', credential: 'openrelayproject' },
] };
// Our own broker (server/ folder, Cloudflare Worker). Set VITE_PEER_HOST in .env; without it the public PeerJS broker is used.
const BROKER = import.meta.env.VITE_PEER_HOST
  ? { host: import.meta.env.VITE_PEER_HOST, port: 443, secure: true, path: '/', key: 'peerjs' }
  : {};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export class Net {
  constructor() {
    this.role = null; this.peer = null; this.code = null; this.name = '';
    this.conns = new Map();            // peerId -> DataConnection (host side)
    this.hostConn = null;              // client side
    this.seats = [null, null, null, null]; // {id, name}
    this.inputs = [null, null, null, null]; // host side: latest input per seat
    this.lastSeq = [0, 0, 0, 0];             // host side: sequence number of the latest input received per seat
    this.level = 0; this.mySeat = -1;
    this.listeners = {};
    this.voice = new Voice(this);
  }
  on(ev, cb) { (this.listeners[ev] ||= []).push(cb); return this; }
  emit(ev, ...a) { for (const cb of this.listeners[ev] || []) cb(...a); }
  get connected() { return !!this.peer && !this.peer.destroyed; }

  _peer(id) {
    return new Promise((resolve, reject) => {
      const opts = { ...BROKER, config: ICE };
      const p = id ? new Peer(id, opts) : new Peer(opts);
      p.on('open', () => resolve(p));
      p.on('error', (e) => { this.emit('error', e); reject(e); });
      p.on('disconnected', () => { try { p.reconnect(); } catch {} });
    });
  }

  async host(name) {
    this.name = name;
    this.code = makeCode();
    this.peer = await this._peer(PREFIX + this.code);
    this.role = 'host'; this.mySeat = 0;
    this.seats[0] = { id: this.peer.id, name };
    this.peer.on('connection', (c) => this._accept(c));
    this.peer.on('call', (call) => this.voice.answer(call));
    this.emit('lobby', this.lobby());
    return this.code;
  }

  _accept(c) {
    c.on('open', () => {
      this.conns.set(c.peer, c);
      c.on('data', (d) => this._hostData(c, d));
      c.on('close', () => this._drop(c.peer));
      c.on('error', () => this._drop(c.peer));
    });
  }
  _drop(id) {
    this.conns.delete(id);
    const i = this.seats.findIndex((s) => s && s.id === id);
    if (i >= 0) { this.seats[i] = null; this.inputs[i] = null; }
    this.voice.drop(id);
    this.broadcast(this.lobby()); this.emit('lobby', this.lobby());
  }
  _hostData(c, d) {
    if (d.t === 'hello') {
      let i = this.seats.findIndex((s) => !s);
      if (i < 0) { c.send({ t: 'full' }); c.close(); return; }
      this.seats[i] = { id: c.peer, name: String(d.name || 'Guest').slice(0, 12) };
      c.send({ t: 'welcome', seat: i });
      this.broadcast(this.lobby()); this.emit('lobby', this.lobby());
    } else if (d.t === 'in') {
      const i = this.seats.findIndex((s) => s && s.id === c.peer);
      if (i >= 0) { this.inputs[i] = { fart: !!d.f, aim: +d.a || 0, pop: !!d.p || !!(this.inputs[i] && this.inputs[i].pop) }; if (d.q) this.lastSeq[i] = d.q; } // pops latch until the host consumes them
    }
  }
  lobby() { return { t: 'lobby', code: this.code, level: this.level, seats: this.seats.map((s) => (s ? { id: s.id, name: s.name } : null)) }; }
  broadcast(msg) { for (const c of this.conns.values()) if (c.open) c.send(msg); }
  setLevel(l) { this.level = l; this.broadcast(this.lobby()); this.emit('lobby', this.lobby()); }

  async join(code, name) {
    this.name = name; this.code = code.toUpperCase().trim();
    this.peer = await this._peer();
    this.role = 'client';
    this.peer.on('call', (call) => this.voice.answer(call));
    const c = this.peer.connect(PREFIX + this.code, { reliable: false, serialization: 'json' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No party with that code (or the host is offline)')), 12000);
      c.on('open', () => { clearTimeout(timer); resolve(); });
      c.on('error', (e) => { clearTimeout(timer); reject(e); });
      this.peer.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    this.hostConn = c;
    c.on('data', (d) => {
      if (d.t === 'welcome') this.mySeat = d.seat;
      else if (d.t === 'lobby') { this.level = d.level; this.seats = d.seats; }
      this.emit(d.t, d);
    });
    c.on('close', () => this.emit('closed'));
    c.send({ t: 'hello', name });
  }
  sendHost(msg) { if (this.hostConn && this.hostConn.open) this.hostConn.send(msg); }
  sendInput(inp, seq = 0) {
    const m = { t: 'in', f: inp.fart ? 1 : 0, a: +inp.aim.toFixed(2), p: inp.pop ? 1 : 0, q: seq };
    const key = m.f + '|' + m.a + '|' + m.p;
    const now = performance.now();
    if (key !== this._lastKey || now - (this._lastSent || 0) > 50) { this._lastKey = key; this._lastSent = now; this.sendHost(m); }
  }
  /** every peer id in the party except ours */
  others() { return this.seats.filter((s) => s && s.id !== this.peer?.id).map((s) => s.id); }
  leave() {
    try { this.voice.stop(); this.peer && this.peer.destroy(); } catch {}
    this.peer = null; this.role = null; this.conns.clear(); this.hostConn = null;
    this.seats = [null, null, null, null]; this.inputs = [null, null, null, null]; this.mySeat = -1;
  }
}

/**
 * Voice mesh. Every pair of players has exactly one call: the peer with the smaller id places it, and if nothing
 * arrives within a few seconds the other side places one instead. The mic is requested before the party connects,
 * so calls always carry the real track; a player who refuses the mic still hears everyone.
 */
class Voice {
  constructor(net) {
    this.net = net; this.stream = null; this.calls = new Map(); // peerId -> {call, audio, since, got}
    this.muted = false; this.ctx = null; this.levels = new Map(); this.speaking = new Set(); this.denied = false;
    // browsers may refuse to start audio until the page is touched; retry every element on the next gesture
    const kick = () => { for (const e of this.calls.values()) if (e.audio.srcObject) e.audio.play().catch(() => {}); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
    window.addEventListener('pointerdown', kick); window.addEventListener('keydown', kick);
  }
  async enable() {
    if (this.stream) return true;
    if (!this.pending) {
      this.pending = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        .then((stream) => {
          this.stream = stream; this.pending = null;
          this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
          this._meter('me', stream);
          for (const e of this.calls.values()) this._sendTrack(e.call); // calls made before the mic arrived get the real track now
          if (this.muted) this.setMuted(true);
          this.net.emit('mic', true);
          return true;
        })
        .catch((e) => { this.pending = null; this.denied = true; this.net.emit('error', new Error('Microphone blocked: ' + e.message)); this.net.emit('mic', false); return false; });
    }
    // do not hold the party hostage to the permission prompt: carry on after 8 s and attach the mic when it arrives
    return Promise.race([this.pending, new Promise((res) => setTimeout(() => res(null), 8000))]);
  }
  _sendTrack(call) {
    const pc = call.peerConnection; if (!pc || !this.stream) return;
    const track = this.stream.getAudioTracks()[0]; if (!track) return;
    const sender = pc.getSenders().find((x) => x.track && x.track.kind === 'audio');
    if (sender) { if (sender.track !== track) sender.replaceTrack(track); }
    else pc.addTrack(track, this.stream);
  }
  setMuted(m) { this.muted = m; if (this.stream) for (const t of this.stream.getAudioTracks()) t.enabled = !m; }
  /** place calls to everyone we should be calling (called whenever the lobby changes and on a timer) */
  sync() {
    const me = this.net.peer?.id; if (!me || !this.net.peer.open) return;
    const now = performance.now();
    for (const id of this.net.others()) {
      const e = this.calls.get(id);
      if (e) {
        // no audio after 7 s: tear down and let either side try again
        if (!e.got && now - e.since > 7000) { this.drop(id); }
        continue;
      }
      const iCall = id > me ? false : true;
      const lateFallback = this.waiting && this.waiting.get(id) && now - this.waiting.get(id) > 4000;
      if (!iCall && !lateFallback) { (this.waiting ||= new Map()).set(id, this.waiting.get(id) || now); continue; }
      const call = this.net.peer.call(id, this.stream || this._silence());
      if (call) this._attach(id, call);
    }
  }
  _silence() {
    this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (!this.silent) this.silent = this.ctx.createMediaStreamDestination().stream;
    return this.silent;
  }
  answer(call) {
    const old = this.calls.get(call.peer);
    if (old) this.drop(call.peer); // a fresh call from them replaces whatever we had
    call.answer(this.stream || this._silence());
    this._attach(call.peer, call);
  }
  _attach(id, call) {
    const audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; audio.volume = 1;
    document.body.appendChild(audio);
    const entry = { call, audio, since: performance.now(), got: false };
    this.calls.set(id, entry);
    if (this.waiting) this.waiting.delete(id);
    call.on('stream', (s) => { entry.got = true; audio.srcObject = s; audio.play().catch(() => {}); this._meter(id, s); this.net.emit('voice', { id, ok: true }); });
    call.on('close', () => this.drop(id));
    call.on('error', () => this.drop(id));
    if (call.peerConnection) call.peerConnection.addEventListener('connectionstatechange', () => { const st = call.peerConnection.connectionState; if (st === 'failed' || st === 'disconnected') this.drop(id); });
  }
  _meter(id, stream) {
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      this.levels.set(id, { an, buf: new Uint8Array(an.frequencyBinCount) });
    } catch {}
  }
  /** returns the set of peer ids (plus 'me') currently speaking */
  poll() {
    this.speaking.clear();
    for (const [id, { an, buf }] of this.levels) {
      an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i += 4) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / (buf.length / 4));
      if (rms > 0.035 && !(id === 'me' && this.muted)) this.speaking.add(id);
    }
    return this.speaking;
  }
  /** which party members we currently receive audio from */
  connectedTo(id) { const e = this.calls.get(id); return !!(e && e.got); }
  drop(id) {
    const e = this.calls.get(id); if (!e) return;
    try { e.call.close(); } catch {}
    e.audio.srcObject = null; e.audio.remove(); this.calls.delete(id); this.levels.delete(id);
  }
  stop() {
    for (const id of [...this.calls.keys()]) this.drop(id);
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null; this.levels.clear(); this.waiting = null;
  }
}
