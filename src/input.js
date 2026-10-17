/** Keyboard, gamepad and touch input for four seats. */
export const KEYMAP = [
  { fart: ['Space'], left: ['KeyA'], right: ['KeyD'], label: 'Space · A / D' },
  { fart: ['Enter', 'NumpadEnter'], left: ['ArrowLeft'], right: ['ArrowRight'], label: 'Enter · ← / →' },
  { fart: ['KeyV'], left: ['KeyC'], right: ['KeyB'], label: 'V · C / B' },
  { fart: ['KeyP'], left: ['KeyO'], right: ['BracketLeft'], label: 'P · O / [' },
];

export class Input {
  constructor() {
    this.keys = new Set();
    this.claimed = [false, false, false, false];
    this.prevFart = [false, false, false, false];
    this.touch = { fart: false, aim: 0 };
    this.listeners = [];
    window.addEventListener('keydown', (e) => {
      if (e.repeat || (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))) return;
      this.keys.add(e.code);
      KEYMAP.forEach((m, i) => { if (m.fart.includes(e.code)) { this.claim(i); } });
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  onClaim(cb) { this.listeners.push(cb); }
  claim(i) { if (!this.claimed[i]) { this.claimed[i] = true; this.listeners.forEach((cb) => cb(i)); } }
  bindTouch(el) {
    if (!el) return;
    const zones = [['left', 0, 0.38, 'AIM ◀'], ['mid', 0.38, 0.62, 'FART'], ['right', 0.62, 1, 'AIM ▶']];
    const active = new Map();
    for (const [name, a, b, label] of zones) {
      const z = document.createElement('div');
      z.className = 'zone'; z.textContent = label;
      z.style.left = a * 100 + '%'; z.style.width = (b - a) * 100 + '%'; z.style.top = '0'; z.style.bottom = '0';
      const on = (e) => { e.preventDefault(); active.set(name, true); this.claim(0); this.sync(active); };
      const off = (e) => { e.preventDefault(); active.delete(name); this.sync(active); };
      z.addEventListener('pointerdown', on); z.addEventListener('pointerup', off); z.addEventListener('pointercancel', off); z.addEventListener('pointerleave', off);
      el.appendChild(z);
    }
  }
  sync(active) {
    this.touch.fart = active.size > 0;
    this.touch.aim = (active.has('right') ? 1 : 0) - (active.has('left') ? 1 : 0);
  }
  /** Online: every key set, the first gamepad and touch all drive the one local seat. */
  readAny() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    let fart = false, aim = 0;
    for (const m of KEYMAP) {
      if (m.fart.some((k) => this.keys.has(k))) fart = true;
      aim += (m.right.some((k) => this.keys.has(k)) ? 1 : 0) - (m.left.some((k) => this.keys.has(k)) ? 1 : 0);
    }
    const pad = pads[0];
    if (pad) {
      const b = (n) => pad.buttons[n] && pad.buttons[n].pressed;
      if (b(0) || b(7) || b(1)) fart = true;
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.25) aim = ax; else if (b(4)) aim = -1; else if (b(5)) aim = 1;
    }
    if (this.touch.fart) { fart = true; aim = this.touch.aim; }
    aim = Math.max(-1, Math.min(1, aim));
    const pop = fart && !this.prevAny;
    this.prevAny = fart;
    return { fart, aim, pop };
  }
  /** returns [{fart, aim, pop}] for each seat; pop is true on the frame the button went down */
  read() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const out = [];
    for (let i = 0; i < 4; i++) {
      const m = KEYMAP[i];
      let fart = m.fart.some((k) => this.keys.has(k));
      let aim = (m.right.some((k) => this.keys.has(k)) ? 1 : 0) - (m.left.some((k) => this.keys.has(k)) ? 1 : 0);
      const pad = pads[i];
      if (pad) {
        const b = (n) => pad.buttons[n] && pad.buttons[n].pressed;
        if (b(0) || b(7) || b(1)) { fart = true; this.claim(i); }
        const ax = pad.axes[0] || 0;
        if (Math.abs(ax) > 0.25) aim = ax; else if (b(4)) aim = -1; else if (b(5)) aim = 1;
      }
      if (i === 0 && this.touch.fart) { fart = true; aim = this.touch.aim; }
      const pop = fart && !this.prevFart[i];
      this.prevFart[i] = fart;
      out.push({ fart, aim, pop });
    }
    return out;
  }
}
