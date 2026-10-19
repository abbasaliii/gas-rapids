/**
 * In-game clip recorder. Captures the game canvas plus the game audio and everyone's voice into a WebM,
 * entirely in the browser (MediaRecorder), so a funny moment is one tap away from TikTok or WhatsApp.
 */
export class Recorder {
  constructor(canvas, audio, net) {
    this.canvas = canvas; this.audio = audio; this.net = net;
    this.rec = null; this.chunks = []; this.blob = null; this.url = null; this.startedAt = 0; this.voiceSources = new Map();
  }
  get supported() { return typeof MediaRecorder !== 'undefined' && !!this.canvas.captureStream; }
  get recording() { return !!this.rec && this.rec.state === 'recording'; }

  start() {
    if (!this.supported || this.recording) return false;
    this.audio.init();
    const ctx = this.audio.ctx;
    if (!this.dest) { this.dest = ctx.createMediaStreamDestination(); this.audio.master.connect(this.dest); }
    this.syncVoice();
    const video = this.canvas.captureStream(30);
    const stream = new MediaStream([...video.getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    try { this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 }); } catch { return false; }
    this.chunks = []; this.blob = null; if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => { this.blob = new Blob(this.chunks, { type: this.rec.mimeType || 'video/webm' }); this.url = URL.createObjectURL(this.blob); this.onReady && this.onReady(this.blob); };
    this.rec.start(1000);
    this.startedAt = performance.now();
    return true;
  }
  stop() { if (this.recording) this.rec.stop(); }
  /** mix in every party member's voice so the clip has the screaming too */
  syncVoice() {
    if (!this.dest || !this.net) return;
    for (const [id, e] of this.net.voice.calls) {
      if (!e.audio.srcObject || this.voiceSources.has(id)) continue;
      try { const src = this.audio.ctx.createMediaStreamSource(e.audio.srcObject); src.connect(this.dest); this.voiceSources.set(id, src); } catch {}
    }
  }
  get seconds() { return this.recording ? (performance.now() - this.startedAt) / 1000 : 0; }
  fileName() { const ext = (this.blob && this.blob.type.includes('mp4')) ? 'mp4' : 'webm'; return `toot-river-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`; }
  download() {
    if (!this.url) return;
    const a = document.createElement('a'); a.href = this.url; a.download = this.fileName(); document.body.appendChild(a); a.click(); a.remove();
  }
  async share(text) {
    if (!this.blob) return false;
    const file = new File([this.blob], this.fileName(), { type: this.blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text, title: 'Toot River' }); return true; } catch { return false; } }
    return false;
  }
}
