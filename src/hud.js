import { fmtTime } from './util.js';
import { KEYMAP } from './input.js';

export class Hud {
  constructor(players) {
    this.el = document.getElementById('hud');
    this.timer = document.getElementById('timer');
    this.retries = document.getElementById('retries');
    this.cansEl = document.getElementById('cans');
    this.fill = this.el.querySelector('.progress-fill');
    this.ticks = this.el.querySelector('.progress-ticks');
    this.raftIcon = this.el.querySelector('.progress-raft');
    this.toastEl = document.getElementById('toast');
    this.cdEl = document.getElementById('countdown');
    this.hintEl = document.getElementById('hint');
    const bars = document.getElementById('gasbars');
    bars.innerHTML = '';
    this.bars = players.map((p) => {
      const d = document.createElement('div');
      d.className = 'gasbar'; d.style.setProperty('--c', p.color);
      d.innerHTML = `<div class="av">${p.emoji}</div><div class="nm">${p.name}<small></small></div><div class="bar"><b></b></div>`;
      bars.appendChild(d);
      return { el: d, b: d.querySelector('b'), bar: d.querySelector('.bar'), role: d.querySelector('small') };
    });
  }
  /** roles[i]: true = local human on seat i, a string = label to show (online player), false = bot */
  setRoles(roles) { this.bars.forEach((b, i) => { const r = roles[i]; b.role.textContent = r === true ? `YOU · ${KEYMAP[i].label}` : typeof r === 'string' ? r : 'CREW'; }); }
  setNames(names) { this.bars.forEach((b, i) => { const n = b.el.querySelector('.nm'); n.firstChild.textContent = names[i]; }); }
  setSpeaking(flags) { this.bars.forEach((b, i) => b.el.classList.toggle('speaking', !!flags[i])); }
  setTicks(checkpoints, length) {
    this.ticks.innerHTML = checkpoints.map((c) => `<i style="left:${(c / length) * 100}%"></i>`).join('');
  }
  show(on) { this.el.hidden = !on; }
  update(raft, time, length) {
    this.timer.textContent = fmtTime(time);
    this.retries.textContent = raft.retries;
    this.cansEl.textContent = raft.cans;
    const pct = Math.min(100, (raft.d / length) * 100);
    this.fill.style.width = pct + '%';
    this.raftIcon.style.left = pct + '%';
    const ticks = this.ticks.children;
    for (let i = 0; i < ticks.length; i++) ticks[i].classList.toggle('done', i < raft.nextCp);
    raft.players.forEach((p, i) => {
      const b = this.bars[i];
      b.b.style.transform = `scaleX(${p.gas / 100})`;
      b.bar.classList.toggle('empty', p.empty);
      b.el.classList.toggle('farting', p.farting);
    });
  }
  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }
  hint(text) { this.hintEl.textContent = text; this.hintEl.classList.toggle('show', !!text); }
  countdown(text) { this.cdEl.innerHTML = text ? `<span>${text}</span>` : ''; }
}
