export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = .16;
    this.master.connect(this.ctx.destination);
    this.unlocked = true;
  }

  tone(freq=220, duration=.08, type='sine', gain=.15, slide=0) {
    if (!this.unlocked) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.001, t + duration);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + duration + .02);
  }

  noise(duration=.06, gain=.08, filterFreq=1200) {
    if (!this.unlocked) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2-1) * (1-i/len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type='bandpass'; filter.frequency.value=filterFreq; filter.Q.value=.7;
    const g = this.ctx.createGain(); g.gain.value=gain;
    src.connect(filter); filter.connect(g); g.connect(this.master); src.start();
  }

  swing(combo=0) { this.noise(.085,.12,1100 + combo*260); this.tone(180+combo*35,.07,'triangle',.08,280); }
  hit(crit=false) { this.noise(.07,crit?.18:.11,crit?700:900); this.tone(crit?95:125,.10,'square',crit?.12:.07,-45); }
  spell() { this.tone(260,.18,'sine',.12,460); this.tone(520,.2,'triangle',.06,600); this.noise(.15,.05,1900); }
  dash() { this.noise(.11,.08,1600); this.tone(150,.1,'sine',.04,120); }
  hurt() { this.tone(95,.18,'sawtooth',.08,-25); }
  pickup() { this.tone(660,.09,'sine',.05,220); }
  level() { [392,523,659,784].forEach((f,i)=>setTimeout(()=>this.tone(f,.18,'sine',.06,80),i*70)); }
  boss() { this.tone(65,.8,'sawtooth',.08,-20); }
}
