// Sound: voice lines (pre-generated files, device speech as fallback), simple sound effects
// and a synthesized engine that follows the throttle. Web Audio needs a tap to start on iPad,
// so `unlock()` is called from the "Tap to fly" button.

import { lineKey, speakable, type Line } from "../data/lines.ts";

type Caption = (line: Line | null) => void;

interface Queued {
  line: Line;
  resolve: () => void;
}

export class Audio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private manifest: Record<string, string> = {};
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private queue: Queued[] = [];
  private speaking = false;
  private current: AudioBufferSourceNode | null = null;
  private engine: EngineSound | null = null;
  volume = 0.9;
  onCaption: Caption = () => {};

  async init(): Promise<void> {
    try {
      const res = await fetch("./audio/voice/manifest.json");
      if (res.ok) this.manifest = await res.json();
    } catch {
      /* no generated voices: device speech will be used */
    }
  }

  /** Call from a user tap. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 1.0;
      this.voiceGain.connect(this.master);
    }
    void this.ctx.resume();
    // iOS also needs speech "warmed up" from a gesture.
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {
      /* no speech synthesis */
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private load(id: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(id);
    if (!p) {
      const file = this.manifest[id];
      p = file && this.ctx
        ? fetch(`./audio/voice/${file}`)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then((b) => this.ctx!.decodeAudioData(b))
            .catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(id, p);
    }
    return p;
  }

  /** Warm the cache for lines that will be needed soon. */
  preload(lines: Line[]): void {
    for (const l of lines) void this.load(lineKey(l));
  }

  /** Queue a line. `interrupt` clears the queue and cuts off the current line. */
  say(line: Line, opts: { interrupt?: boolean } = {}): Promise<void> {
    if (opts.interrupt) this.stopVoice();
    return new Promise((resolve) => {
      this.queue.push({ line, resolve });
      if (!this.speaking) void this.next();
    });
  }

  stopVoice(): void {
    for (const q of this.queue) q.resolve();
    this.queue = [];
    try {
      this.current?.stop();
    } catch {
      /* already stopped */
    }
    this.current = null;
    try {
      speechSynthesis.cancel();
    } catch {
      /* none */
    }
  }

  get busy(): boolean {
    return this.speaking || this.queue.length > 0;
  }

  private async next(): Promise<void> {
    const item = this.queue.shift();
    if (!item) {
      this.speaking = false;
      this.onCaption(null);
      return;
    }
    this.speaking = true;
    this.onCaption(item.line);
    const buf = await this.load(lineKey(item.line));
    if (buf && this.ctx && this.voiceGain) {
      await new Promise<void>((done) => {
        const src = this.ctx!.createBufferSource();
        src.buffer = buf;
        src.connect(this.voiceGain!);
        src.onended = () => done();
        this.current = src;
        src.start();
      });
    } else {
      await this.speakDevice(item.line);
    }
    this.current = null;
    item.resolve();
    void this.next();
  }

  private speakDevice(line: Line): Promise<void> {
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(speakable(line.text));
        u.rate = line.who === "tower" ? 1.05 : 0.95;
        u.pitch = line.who === "tower" ? 0.9 : 1.1;
        u.volume = this.volume;
        const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
        const pick = line.who === "tower" ? voices.find((v) => /Daniel|Fred|Alex|Male|Guy/i.test(v.name)) : voices.find((v) => /Samantha|Karen|Female|Aria|Jenny/i.test(v.name));
        if (pick) u.voice = pick;
        const timer = setTimeout(resolve, 2500 + line.text.length * 90);
        u.onend = () => {
          clearTimeout(timer);
          resolve();
        };
        u.onerror = () => {
          clearTimeout(timer);
          resolve();
        };
        speechSynthesis.speak(u);
      } catch {
        setTimeout(resolve, 1200 + line.text.length * 50);
      }
    });
  }

  // ----- Sound effects -----

  private tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.2): void {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t0 = this.ctx.currentTime + start;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noiseBurst(dur: number, filterFreq: number, gain: number, type: BiquadFilterType = "lowpass"): void {
    if (!this.ctx || !this.master) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  sfx(name: "ding" | "hoop" | "thunk" | "chirp" | "star" | "click" | "cash" | "whoosh"): void {
    switch (name) {
      case "ding":
        this.tone(880, 0, 0.6, "sine", 0.18);
        this.tone(660, 0.18, 0.8, "sine", 0.15);
        break;
      case "hoop":
        [660, 880, 1320].forEach((f, i) => this.tone(f, i * 0.06, 0.3, "triangle", 0.12));
        break;
      case "thunk":
        this.noiseBurst(0.25, 300, 0.9);
        this.tone(90, 0, 0.2, "sine", 0.3);
        break;
      case "chirp":
        this.noiseBurst(0.18, 2500, 0.5, "bandpass");
        break;
      case "star":
        [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, i * 0.08, 0.4, "sine", 0.1));
        break;
      case "click":
        this.tone(1200, 0, 0.05, "square", 0.05);
        break;
      case "cash":
        [1568, 2093].forEach((f, i) => this.tone(f, i * 0.09, 0.3, "triangle", 0.1));
        break;
      case "whoosh":
        this.noiseBurst(1.2, 900, 0.35);
        break;
    }
  }

  // ----- Engine -----

  startEngine(kind: "piston" | "turboprop" | "jet"): void {
    if (!this.ctx || !this.master) return;
    this.stopEngine();
    this.engine = new EngineSound(this.ctx, this.master, kind);
  }

  updateEngine(throttle: number, speed: number): void {
    this.engine?.update(throttle, speed);
  }

  stopEngine(): void {
    this.engine?.stop();
    this.engine = null;
  }
}

class EngineSound {
  private nodes: AudioScheduledSourceNode[] = [];
  private toneOsc: OscillatorNode;
  private toneGain: GainNode;
  private noiseFilter: BiquadFilterNode;
  private noiseGain: GainNode;
  private windGain: GainNode;
  private out: GainNode;

  constructor(private ctx: AudioContext, dest: AudioNode, private kind: "piston" | "turboprop" | "jet") {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);
    this.out.connect(dest);

    // Tonal part: piston = low buzzy pulse, turbine = high whine.
    this.toneOsc = ctx.createOscillator();
    this.toneOsc.type = kind === "piston" ? "sawtooth" : "triangle";
    this.toneGain = ctx.createGain();
    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = kind === "piston" ? 700 : 5000;
    this.toneOsc.connect(toneFilter).connect(this.toneGain).connect(this.out);
    this.toneOsc.start();
    this.nodes.push(this.toneOsc);

    // Noise part: rumble / jet roar.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      d[i] = last * 6;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "lowpass";
    this.noiseGain = ctx.createGain();
    noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.out);
    noise.start();
    this.nodes.push(noise);

    // Wind that grows with speed.
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    wind.playbackRate.value = 1.7;
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 1200;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(wf).connect(this.windGain).connect(this.out);
    wind.start();
    this.nodes.push(wind);
    this.update(0, 0);
  }

  update(throttle: number, speed: number): void {
    const t = this.ctx.currentTime;
    const k = 0.15;
    if (this.kind === "piston") {
      this.toneOsc.frequency.setTargetAtTime(55 + throttle * 55, t, k);
      this.toneGain.gain.setTargetAtTime(0.05 + throttle * 0.07, t, k);
      this.noiseFilter.frequency.setTargetAtTime(300 + throttle * 500, t, k);
      this.noiseGain.gain.setTargetAtTime(0.12 + throttle * 0.15, t, k);
    } else {
      this.toneOsc.frequency.setTargetAtTime(2200 + throttle * 2600, t, k * 3);
      this.toneGain.gain.setTargetAtTime(0.012 + throttle * 0.02, t, k);
      this.noiseFilter.frequency.setTargetAtTime(500 + throttle * 2200, t, k * 2);
      this.noiseGain.gain.setTargetAtTime(0.08 + throttle * 0.28, t, k * 2);
    }
    this.windGain.gain.setTargetAtTime(Math.min(0.25, speed / 400), t, 0.3);
  }

  stop(): void {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.3);
    const nodes = this.nodes;
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* stopped */ } }), 1500);
  }
}
