import type { EnvironmentSound } from "./environment";
import type { Theme } from "./palette";
import type { ZombieKind } from "./types";

type Surface = "concrete" | "wood" | "water" | "rubble";

const NOTE: Record<string, number> = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
};

interface ChordBar {
  bass: string;
  pad: string[];
  arp: (string | null)[];
}

const NIGHT_PROGRESSION: ChordBar[] = [
  { bass: "A2", pad: ["A3", "C4", "E4", "B4"], arp: ["E4", null, "B4", "C5", null, "A4", "E4", null] },
  { bass: "F2", pad: ["F3", "A3", "C4", "E4"], arp: ["C4", null, "E4", "A4", null, "G4", "E4", null] },
  { bass: "D2", pad: ["D3", "F3", "A3", "E4"], arp: ["A3", null, "E4", "F4", null, "E4", "D4", null] },
  { bass: "E2", pad: ["E3", "G3", "B3", "D4"], arp: ["B3", null, "D4", "E4", "G4", null, "D4", null] },
];

const DAWN_PROGRESSION: ChordBar[] = [
  { bass: "F2", pad: ["F3", "A3", "C4", "E4"], arp: ["A4", null, "C5", "E5", null, "C5", "A4", null] },
  { bass: "C2", pad: ["C3", "G3", "B3", "D4"], arp: ["G4", null, "B4", "D5", null, "B4", "G4", null] },
  { bass: "G2", pad: ["G3", "B3", "D4", "E4"], arp: ["D4", null, "G4", "B4", null, "A4", "G4", null] },
  { bass: "A2", pad: ["A3", "C4", "E4", "G4"], arp: ["E4", null, "G4", "C5", null, "B4", "A4", null] },
];

export class Sfx {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private echoSend: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  muted = false;
  musicMuted = false;
  private theme: Theme = "basement";
  private lastGroan = 0;
  private lastStep = 0;
  private lastBuzz = 0;

  private musicTimer: number | null = null;
  private stepIdx = 0;

  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.72;
      master.connect(ctx.destination);

      // SFX bus
      const sfxBus = ctx.createGain();
      sfxBus.gain.value = this.muted ? 0 : 0.85;
      sfxBus.connect(master);
      this.sfxBus = sfxBus;

      // Subtle concrete stairwell echo for gunshots / slams / crowbar
      const echoSend = ctx.createGain();
      echoSend.gain.value = 0.28;
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.145;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      const echoLp = ctx.createBiquadFilter();
      echoLp.type = "lowpass";
      echoLp.frequency.value = 1400;
      echoSend.connect(delay);
      delay.connect(echoLp);
      echoLp.connect(fb);
      fb.connect(delay);
      echoLp.connect(sfxBus);
      this.echoSend = echoSend;

      // Music bus (warm, gentle lo-fi chain)
      const musicBus = ctx.createGain();
      musicBus.gain.value = this.muted || this.musicMuted ? 0 : 0.42;
      const musicLp = ctx.createBiquadFilter();
      musicLp.type = "lowpass";
      musicLp.frequency.value = 2600;
      musicLp.Q.value = 0.5;
      musicBus.connect(musicLp);
      musicLp.connect(master);
      this.musicBus = musicBus;

      // Noise buffer
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      this.startAmbient();
      this.startMusic();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  destroy() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.updateGains();
  }

  setMusicMuted(m: boolean) {
    this.musicMuted = m;
    this.updateGains();
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    if (this.rainGain && this.ctx) {
      const target = theme === "roof" ? 0.14 : 0.0;
      this.rainGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.45);
    }
  }

  private updateGains() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(this.muted ? 0 : 0.85, t, 0.04);
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.muted || this.musicMuted ? 0 : 0.42, t, 0.08);
  }

  private startAmbient() {
    if (!this.ctx || !this.sfxBus || !this.noiseBuf) return;
    // Soft low building room tone
    const roomGain = this.ctx.createGain();
    roomGain.gain.value = 0.045;
    roomGain.connect(this.sfxBus);

    const o1 = this.ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 55;
    o1.connect(roomGain);
    o1.start();

    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const wf = this.ctx.createBiquadFilter();
    wf.type = "lowpass";
    wf.frequency.value = 220;
    const wg = this.ctx.createGain();
    wg.gain.value = 0.16;
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(roomGain);
    wind.start();

    // Soft roof rain layer (faded in on roof)
    const rain = this.ctx.createBufferSource();
    rain.buffer = this.noiseBuf;
    rain.loop = true;
    const rf = this.ctx.createBiquadFilter();
    rf.type = "bandpass";
    rf.frequency.value = 1850;
    rf.Q.value = 0.45;
    const rg = this.ctx.createGain();
    rg.gain.value = this.theme === "roof" ? 0.14 : 0.0;
    rain.connect(rf);
    rf.connect(rg);
    rg.connect(this.sfxBus);
    rain.start();
    this.rainGain = rg;
  }

  /* ================= LIGHT, PLEASANT LO-FI BACKGROUND MUSIC ================= */

  private startMusic() {
    if (this.musicTimer !== null) return;
    const stepMs = 430; // Calm ~70 BPM eighth notes
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicBus || this.ctx.state !== "running") return;
      if (this.muted || this.musicMuted) return;

      const prog = this.theme === "roof" ? DAWN_PROGRESSION : NIGHT_PROGRESSION;
      const barIdx = Math.floor(this.stepIdx / 8) % prog.length;
      const sub = this.stepIdx % 8;
      const bar = prog[barIdx];
      const now = this.ctx.currentTime + 0.02;

      if (sub === 0) {
        // Warm soft electric piano chord & gentle sub-bass
        this.playBass(NOTE[bar.bass], now, 3.1, 0.14);
        bar.pad.forEach((n, idx) => {
          this.playElectricPiano(NOTE[n], now + idx * 0.035, 3.0, 0.068);
        });
      }

      if (sub === 4) {
        // Soft mid-bar harmonic pulse
        const midNote = bar.pad[1] ?? bar.pad[0];
        this.playElectricPiano(NOTE[midNote], now, 1.5, 0.04);
      }

      const arpNote = bar.arp[sub];
      if (arpNote && NOTE[arpNote]) {
        // Delicate bell / Rhodes melody note
        this.playPluck(NOTE[arpNote], now, 1.15, 0.055);
      }

      this.stepIdx++;
    }, stepMs);
  }

  private playElectricPiano(freq: number, t: number, dur: number, vol: number) {
    if (!this.ctx || !this.musicBus) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.06);
    g.gain.exponentialRampToValueAtTime(vol * 0.42, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.connect(this.musicBus);

    const o1 = this.ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(freq, t);

    const o2 = this.ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(freq * 2, t);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.16, t);
    g2.gain.exponentialRampToValueAtTime(0.01, t + 0.45);

    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);

    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private playPluck(freq: number, t: number, dur: number, vol: number) {
    if (!this.ctx || !this.musicBus) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.connect(this.musicBus);

    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    // Subtle vibrato warmth
    const oH = this.ctx.createOscillator();
    oH.type = "sine";
    oH.frequency.setValueAtTime(freq * 3, t);
    const gH = this.ctx.createGain();
    gH.gain.setValueAtTime(0.09, t);
    gH.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    o.connect(g);
    oH.connect(gH);
    gH.connect(g);
    o.start(t);
    oH.start(t);
    o.stop(t + dur + 0.05);
    oH.stop(t + dur + 0.05);
  }

  private playBass(freq: number, t: number, dur: number, vol: number) {
    if (!this.ctx || !this.musicBus) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(this.musicBus);

    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /* ================= POLISHED SFX ================= */

  private tone(
    freq: number,
    dur: number,
    vol: number,
    type: OscillatorType = "square",
    endFreq?: number,
    delay = 0,
    echo = false,
  ) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    if (echo && this.echoSend) g.connect(this.echoSend);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(
    dur: number,
    freq: number,
    vol: number,
    filterType: BiquadFilterType = "bandpass",
    q = 0.8,
    delay = 0,
    echo = false,
  ) {
    if (!this.ctx || !this.sfxBus || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    if (echo && this.echoSend) g.connect(this.echoSend);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  gun() {
    // Crisp high crack + tight punch + subtle brass casing clink + stairwell echo
    this.noise(0.09, 2400, 0.42, "highpass", 0.6, 0, true);
    this.noise(0.16, 760, 0.46, "bandpass", 0.8, 0, true);
    this.tone(195, 0.11, 0.28, "triangle", 46, 0, true);
    // Tiny delayed brass casing ping
    this.tone(3600 + Math.random() * 500, 0.035, 0.035, "sine", 2900, 0.19);
  }

  shotgun() {
    // Heavy booming blast + wide debris crack + stairwell echo + mechanical pump
    this.noise(0.26, 460, 0.68, "lowpass", 0.7, 0, true);
    this.noise(0.14, 1700, 0.45, "highpass", 0.5, 0, true);
    this.tone(130, 0.22, 0.36, "sawtooth", 34, 0, true);
    this.tone(85, 0.24, 0.28, "sine", 28, 0, true);
    // Pump clack shortly after
    this.noise(0.045, 2200, 0.12, "bandpass", 2.0, 0.24);
    this.noise(0.05, 1600, 0.14, "bandpass", 1.8, 0.32);
  }

  scream() {
    // Przeszywający krzyk wzywający inne zombie
    this.tone(320, 0.5, 0.16, "sawtooth", 780, 0, true);
    this.tone(180, 0.62, 0.12, "square", 90, 0.05, true);
    this.noise(0.5, 1500, 0.16, "bandpass", 1.4, 0, true);
  }

  alarm() {
    this.tone(880, 0.28, 0.09, "square", 620, 0, true);
    this.tone(660, 0.28, 0.07, "square", 880, 0.3, true);
  }

  knock() {
    for (let i = 0; i < 3; i++) {
      this.noise(0.06, 320, 0.16, "lowpass", 0.9, i * 0.16, true);
      this.tone(120, 0.05, 0.09, "triangle", 70, i * 0.16);
    }
  }

  powerDown() {
    this.tone(420, 0.7, 0.11, "sawtooth", 42, 0, true);
    this.noise(0.3, 700, 0.09, "lowpass", 0.8);
  }

  powerUp() {
    this.tone(90, 0.5, 0.09, "sawtooth", 320, 0, true);
    this.tone(1400, 0.08, 0.05, "square", 900, 0.42);
  }

  liftCall() {
    this.tone(740, 0.11, 0.1, "sine", 990);
    this.tone(990, 0.09, 0.08, "sine", 740, 0.13);
    this.noise(0.34, 520, 0.15, "lowpass", 0.9, 0.2, true);
  }

  liftMove() {
    this.tone(68, 1.2, 0.18, "sawtooth", 115);
    this.noise(330, 0.8, 0.12, "lowpass", 0.7, 0, true);
    this.tone(220, 0.07, 0.07, "triangle", 176, 0.12);
  }

  liftRattle() {
    this.noise(570, 0.16, 0.24, "lowpass", 1.7, 0, true);
    this.tone(91, 0.22, 0.16, "triangle", 53, 0.02);
  }

  liftStop() {
    this.noise(510, 0.22, 0.3, "lowpass", 0.9, 0, true);
    this.tone(74, 0.32, 0.24, "sawtooth", 35, 0.02);
    this.tone(820, 0.08, 0.08, "triangle", 620, 0.31);
  }

  ladder() {
    this.noise(880, 0.09, 0.15, "bandpass", 1.3);
    this.tone(178, 0.12, 0.1, "triangle", 120, 0.1);
    this.tone(236, 0.1, 0.075, "triangle", 152, 0.36);
  }

  device(kind: "radio" | "tv", on: boolean) {
    if (!on) { this.tone(310, 0.06, 0.06, "square", 180); return; }
    this.noise(kind === "tv" ? 0.22 : 0.13, kind === "tv" ? 1900 : 2700, 0.1, "bandpass", 1.2);
    this.tone(kind === "tv" ? 190 : 520, 0.08, 0.05, "triangle", kind === "tv" ? 160 : 650, 0.04);
  }

  explosion() {
    this.noise(0.65, 310, 0.68, "lowpass", 0.7, 0, true);
    this.noise(0.32, 1850, 0.38, "bandpass", 0.8, 0.03, true);
    this.tone(76, 0.52, 0.42, "sawtooth", 28);
  }

  machete() {
    this.noise(0.1, 2350, 0.15, "highpass", 0.8);
    this.tone(420, 0.08, 0.07, "triangle", 180, 0.02);
  }

  environment(kind: EnvironmentSound, gain: number) {
    if (this.muted || !this.ctx) return;
    const tone = (hz: number, time: number, v: number, end: number, delay = 0) => this.tone(hz, time, v * gain, "triangle", end, delay);
    const noise = (hz: number, time: number, v: number, delay = 0, echo = false) => this.noise(time, hz, v * gain, "bandpass", 1.15, delay, echo);
    switch (kind) {
      case "arc":
        for (let i = 0; i < 4; i++) noise(2700 + i * 520, 0.05 + i * 0.014, 0.17 + i * 0.04, 0.11 * i);
        break;
      case "shock": noise(2580, 0.17, 0.32, 0, true); tone(137, 0.19, 0.20, 280); break;
      case "switch": tone(1120, 0.065, 0.11, 710); noise(680, 0.08, 0.26, 0.03); break;
      case "strain": tone(146, 0.26, 0.18, 93); noise(540, 0.24, 0.18); break;
      case "scrape": noise(360, 0.34, 0.28, 0, true); noise(1450, 0.26, 0.19); tone(88, 0.32, 0.09, 52); break;
      case "crack": noise(1260, 0.08, 0.24); noise(2700, 0.06, 0.14, 0.065); break;
      case "collapse": tone(94, 0.46, 0.36, 31); noise(450, 0.53, 0.55, 0, true); noise(1650, 0.42, 0.28, 0.08, true); break;
      case "hiss": noise(2700, 0.75, 0.23); noise(4100, 0.48, 0.13, 0.18); break;
      case "steam": noise(1600, 0.85, 0.48, 0, true); noise(3650, 0.67, 0.26); break;
      case "valve": tone(412, 0.19, 0.11, 176); noise(610, 0.16, 0.22, 0.05); break;
      case "glass": noise(5600, 0.09, 0.22); tone(4100, 0.07, 0.09, 2650, 0.04); break;
      case "cans": tone(1330, 0.12, 0.17, 910); tone(925, 0.1, 0.12, 630, 0.08); noise(1540, 0.11, 0.17); break;
      case "planks": tone(195, 0.22, 0.19, 72); noise(850, 0.13, 0.18); break;
      case "flare": tone(122, 0.32, 0.3, 44); noise(970, 0.52, 0.52, 0, true); break;
    }
  }

  hide(open: boolean) {
    this.noise(0.14, open ? 520 : 380, 0.14, "bandpass", 1.1);
    this.tone(open ? 210 : 150, 0.12, 0.07, "triangle", open ? 120 : 90);
  }

  thanks() {
    this.tone(520, 0.1, 0.06, "triangle");
    this.tone(700, 0.14, 0.055, "triangle", undefined, 0.09);
  }

  revolver() {
    this.noise(0.15, 1600, 0.38, "bandpass", 0.8, 0, true);
    this.tone(145, 0.18, 0.27, "triangle", 42, 0, true);
    this.tone(700, 0.035, 0.045, "triangle", 400, 0.12);
  }

  reload(finished: boolean) {
    if (!finished) {
      // Magazine release click
      this.tone(620, 0.04, 0.07, "square", 340);
      this.noise(0.045, 1900, 0.1, "bandpass", 2.2, 0.05);
    } else {
      // Slide rack metallic clack
      this.noise(0.04, 2600, 0.14, "bandpass", 2.4, 0);
      this.tone(920, 0.05, 0.08, "triangle", 520, 0.04);
      this.noise(0.05, 1800, 0.13, "bandpass", 1.8, 0.07);
    }
  }

  dry() {
    this.tone(880, 0.025, 0.06, "square", 320);
    this.noise(0.02, 2800, 0.08, "bandpass", 2.0);
  }

  bow() {
    this.tone(245, 0.11, 0.08, "triangle", 76);
    this.noise(0.055, 1350, 0.09);
  }

  melee() {
    // Crowbar air whoosh
    this.noise(0.11, 1250, 0.24, "bandpass", 1.1);
    this.tone(290, 0.09, 0.09, "triangle", 110);
  }

  hit(metal = false) {
    if (metal) {
      // Crowbar hitting stone/metal wall
      this.tone(1420, 0.09, 0.09, "square", 860, 0, true);
      this.noise(0.06, 2600, 0.18, "highpass", 0.9, 0, true);
      return;
    }
    this.noise(0.1, 520, 0.34, "bandpass", 0.9);
    this.tone(155, 0.09, 0.16, "triangle", 55);
  }

  hurt() {
    this.noise(0.22, 280, 0.42, "lowpass", 0.7);
    this.tone(110, 0.22, 0.22, "sawtooth", 48);
  }

  pickup() {
    this.tone(440, 0.07, 0.08, "triangle");
    this.tone(659, 0.11, 0.09, "triangle", undefined, 0.06);
  }

  med() {
    this.tone(392, 0.1, 0.08, "sine");
    this.tone(523, 0.12, 0.09, "sine", undefined, 0.08);
    this.tone(659, 0.18, 0.09, "sine", undefined, 0.16);
  }

  key() {
    this.tone(880, 0.08, 0.08, "triangle");
    this.tone(1174, 0.11, 0.08, "triangle", undefined, 0.06);
    this.tone(1568, 0.16, 0.07, "sine", undefined, 0.12);
  }

  door(open = true) {
    // Subtle wooden creak + latch click
    this.tone(open ? 190 : 240, 0.11, 0.055, "sawtooth", open ? 260 : 140);
    this.noise(0.07, 480, 0.2, "bandpass", 1.2, 0.04, true);
    this.tone(110, 0.06, 0.08, "triangle", 62, 0.06);
  }

  bang() {
    this.bash();
  }

  bash() {
    this.noise(0.16, 210, 0.42, "lowpass", 0.9, 0, true);
    this.tone(76, 0.14, 0.2, "triangle", 38, 0, true);
  }

  step(now: number, surface: Surface = "concrete") {
    if (now - this.lastStep < 0.24) return;
    this.lastStep = now;
    if (surface === "water") {
      this.noise(0.075, 2200, 0.11, "bandpass", 1.2);
      this.noise(0.05, 850, 0.07, "bandpass", 1.0, 0.02);
    } else if (surface === "wood") {
      this.tone(135 + Math.random() * 25, 0.045, 0.05, "triangle", 75);
      this.noise(0.035, 520, 0.065, "bandpass", 1.1);
    } else if (surface === "rubble") {
      this.noise(0.06, 1500, 0.08, "bandpass", 1.4);
      this.noise(0.04, 600, 0.06, "bandpass", 1.0, 0.02);
    } else {
      this.noise(0.042, 300 + Math.random() * 90, 0.085, "bandpass", 0.9);
    }
  }

  groan(now: number, kind: ZombieKind = "shambler") {
    if (now - this.lastGroan < 1.55) return;
    this.lastGroan = now;
    if (kind === "runner") {
      this.tone(180 + Math.random() * 40, 0.22, 0.055, "sawtooth", 125);
      this.noise(0.22, 920, 0.075, "bandpass", 2.2);
    } else if (kind === "brute") {
      this.tone(52 + Math.random() * 14, 0.45, 0.09, "sawtooth", 40);
      this.noise(0.4, 180, 0.1, "lowpass", 1.2);
    } else {
      this.tone(82 + Math.random() * 26, 0.36, 0.065, "sawtooth", 58);
      this.noise(0.32, 340, 0.075, "bandpass", 1.6);
    }
  }

  draw() {
    // Łom wysuwany z plecaka: szelest materiału + metaliczny zgrzyt
    this.noise(0.09, 900, 0.1, "bandpass", 0.8);
    this.tone(1250, 0.08, 0.035, "triangle", 1900, 0.03);
  }

  drip() {
    this.tone(1500 + Math.random() * 500, 0.05, 0.025, "sine", 700);
  }

  thunder() {
    this.noise(1.5, 150, 0.4, "lowpass", 0.6, 0.35, true);
    this.tone(58, 1.1, 0.16, "sine", 30, 0.35, true);
  }

  roar() {
    // Ryk Wielkiego: niski slide + gardłowy charkot + echo klatki
    this.tone(85, 0.85, 0.3, "sawtooth", 36, 0, true);
    this.tone(140, 0.6, 0.16, "square", 55, 0.06, true);
    this.noise(0.75, 240, 0.24, "lowpass", 1.0, 0.04, true);
    this.noise(0.4, 700, 0.1, "bandpass", 2.0, 0.1);
  }

  bossDie() {
    this.tone(70, 1.1, 0.3, "sawtooth", 26, 0, true);
    this.noise(0.9, 200, 0.3, "lowpass", 0.8, 0, true);
    this.tone(45, 1.3, 0.22, "sine", 22, 0.15, true);
  }

  heliTick(vol: number) {
    // Łopot wirnika: niskie uderzenie + świst powietrza
    this.tone(52, 0.06, 0.24 * vol, "sine", 40);
    this.noise(0.05, 130, 0.16 * vol, "lowpass", 0.7);
    this.noise(0.03, 900, 0.05 * vol, "bandpass", 1.2);
  }

  heliLand() {
    this.noise(0.5, 240, 0.22, "lowpass", 0.8, 0, true);
    this.tone(60, 0.4, 0.14, "sine", 34, 0, true);
  }

  heart() {
    this.tone(56, 0.09, 0.13, "sine", 38);
    this.tone(52, 0.08, 0.09, "sine", 36, 0.14);
  }

  flare() {
    this.noise(0.35, 1600, 0.14, "bandpass", 1.2);
    this.tone(440, 0.22, 0.07, "triangle", 660);
  }

  buzz(now: number) {
    if (now - this.lastBuzz < 0.7) return;
    this.lastBuzz = now;
    this.tone(120, 0.065, 0.022, "sawtooth");
    this.noise(0.05, 1600, 0.02, "bandpass", 3.0);
  }

  win() {
    this.tone(523.25, 0.22, 0.11, "triangle", undefined, 0, true);
    this.tone(659.25, 0.24, 0.11, "triangle", undefined, 0.12, true);
    this.tone(783.99, 0.32, 0.11, "triangle", undefined, 0.24, true);
    this.tone(1046.5, 0.48, 0.1, "sine", undefined, 0.36, true);
  }

  die() {
    this.tone(155, 0.35, 0.16, "sawtooth", 70, 0, true);
    this.tone(78, 0.65, 0.18, "triangle", 38, 0.1, true);
  }

  whisper() {
    // Szept / stłumiona rozmowa "bla bla..." przy maszynopisaniu dialogu
    const f = 190 + Math.random() * 140;
    this.tone(f, 0.042, 0.028, "triangle", f * 0.86);
    this.noise(0.036, 1500 + Math.random() * 600, 0.03, "bandpass", 2.2);
  }
}
