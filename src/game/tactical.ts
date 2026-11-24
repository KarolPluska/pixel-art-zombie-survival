import { TACTICAL } from "./tactical-config";

export interface NoiseEvent {
  x: number;
  y: number;
  strength: number;
  radius: number;
  born: number;
  until: number;
  source: "player" | "device" | "world";
}

export interface DeviceState {
  on: boolean;
  x: number;
  y: number;
  kind: "radio" | "tv";
  activeTotal: number;
  nextPulse: number;
}

export interface BarrelState {
  stage: "idle" | "warning" | "spent";
  fuse: number;
}

export interface TacticalState {
  clock: number;
  playerNoise: number;
  arousal: number;
  waveBudget: number;
  nextRoll: number;
  lastWave: number;
  waveCount: number;
  deviceNextRoll: number;
  events: NoiseEvent[];
  devices: Record<number, DeviceState>;
  barrels: Record<number, BarrelState>;
}

export function createTacticalState(saved?: TacticalState): TacticalState {
  if (saved) {
    const state = structuredClone(saved);
    if (!Number.isFinite(state.deviceNextRoll)) state.deviceNextRoll = Infinity;
    return state;
  }
  return {
    clock: 0,
    playerNoise: 0,
    arousal: 0,
    waveBudget: TACTICAL.waves.budgetMax,
    nextRoll: 5,
    lastWave: -100,
    waveCount: 0,
    deviceNextRoll: Infinity,
    events: [],
    devices: {},
    barrels: {},
  };
}

export interface Stimulus {
  x: number;
  y: number;
  strength: number;
  radius: number;
  source: NoiseEvent["source"];
}

/** Shared sound/agitation model. Simulation time advances only during active play. */
export class TacticalDirector {
  constructor(readonly state: TacticalState) {}

  get clock() { return this.state.clock; }

  playerPulse(amount: number, x: number, y: number, radius: number, duration = 1.4, arousal = amount * 0.12) {
    this.state.playerNoise = Math.min(100, Math.max(this.state.playerNoise, amount));
    this.emit(x, y, amount, radius, duration, arousal, "player");
  }

  playerContinuous(amount: number, dt: number, x: number, y: number, radius: number) {
    this.state.playerNoise = Math.min(100, this.state.playerNoise + amount * dt);
    // Continuous movement is represented by short real sources, not only a HUD meter.
    const latest = this.state.events[this.state.events.length - 1];
    if (!latest || latest.source !== "player" || this.clock - latest.born > 0.45) {
      this.emit(x, y, this.state.playerNoise * 0.45, radius, 0.8, amount * dt * 0.08, "player");
    } else {
      latest.x = x; latest.y = y; latest.until = this.clock + 0.8;
    }
  }

  emit(x: number, y: number, strength: number, radius: number, duration: number, arousal: number, source: NoiseEvent["source"]) {
    this.state.events.push({ x, y, strength, radius, born: this.clock, until: this.clock + duration, source });
    if (this.state.events.length > 28) this.state.events.splice(0, this.state.events.length - 28);
    this.state.arousal = Math.min(TACTICAL.arousal.max, this.state.arousal + arousal);
  }

  ensureDevice(id: number, kind: "radio" | "tv", x: number, y: number) {
    if (!this.state.devices[id]) {
      this.state.devices[id] = { on: false, x, y, kind, activeTotal: 0, nextPulse: 0 };
    }
    return this.state.devices[id];
  }

  setDevice(id: number, on: boolean) {
    const d = this.state.devices[id];
    if (!d || d.on === on) return;
    d.on = on;
    // Never reset activeTotal / wave schedule when toggling; exploits cannot clear danger or force a wave.
    if (on) {
      if (!Number.isFinite(this.state.deviceNextRoll)) {
        this.state.deviceNextRoll = this.clock + TACTICAL.waves.firstDeviceRollMin + Math.random() * (TACTICAL.waves.firstDeviceRollMax - TACTICAL.waves.firstDeviceRollMin);
      }
      this.state.arousal = Math.min(100, this.state.arousal + 3);
      this.emit(d.x, d.y, 24, d.kind === "tv" ? TACTICAL.devices.tvRadius : TACTICAL.devices.radioRadius, 1.2, 2, "device");
    }
  }

  ensureBarrel(id: number) {
    if (!this.state.barrels[id]) this.state.barrels[id] = { stage: "idle", fuse: 0 };
    return this.state.barrels[id];
  }

  activeStimuli(): Stimulus[] {
    return [
      ...this.state.events.filter((e) => e.until > this.clock).map((e) => ({ x: e.x, y: e.y, strength: e.strength, radius: e.radius, source: e.source })),
      ...Object.values(this.state.devices).filter((d) => d.on).map((d) => ({
        x: d.x, y: d.y, strength: d.kind === "tv" ? TACTICAL.devices.tvStrength : TACTICAL.devices.radioStrength,
        radius: d.kind === "tv" ? TACTICAL.devices.tvRadius : TACTICAL.devices.radioRadius, source: "device" as const,
      })),
    ];
  }

  strongestFor(x: number, y: number, occlusion: number | ((source: Stimulus) => number) = 1): Stimulus | null {
    let best: Stimulus | null = null;
    let score = 0;
    for (const s of this.activeStimuli()) {
      const factor = typeof occlusion === "function" ? occlusion(s) : occlusion;
      const distance = Math.hypot(s.x - x, s.y - y);
      if (distance > s.radius * factor) continue;
      const candidate = s.strength * factor / (1 + distance / (7 * 16));
      if (candidate > score) { score = candidate; best = s; }
    }
    return best;
  }

  update(dt: number, deviceTick: (d: DeviceState) => void, spawnWave: (source: Stimulus) => number, populationFull: () => boolean) {
    this.state.clock += dt;
    this.state.playerNoise = Math.max(0, this.state.playerNoise - TACTICAL.noise.decayPerSecond * dt);
    this.state.arousal = Math.max(0, this.state.arousal - TACTICAL.arousal.decayPerSecond * dt);
    this.state.events = this.state.events.filter((e) => e.until > this.clock);
    this.state.waveBudget = Math.min(TACTICAL.waves.budgetMax, this.state.waveBudget + TACTICAL.waves.budgetRegenPerSecond * dt);

    for (const d of Object.values(this.state.devices)) {
      if (!d.on) continue;
      d.activeTotal += dt;
      this.state.arousal = Math.min(100, this.state.arousal + TACTICAL.arousal.devicePerSecond * dt);
      d.nextPulse -= dt;
      if (d.nextPulse <= 0) {
        d.nextPulse = TACTICAL.devices.pulseInterval;
        deviceTick(d);
        this.emit(d.x, d.y, d.kind === "tv" ? TACTICAL.devices.tvStrength : TACTICAL.devices.radioStrength,
          d.kind === "tv" ? TACTICAL.devices.tvRadius : TACTICAL.devices.radioRadius, 2.1, 1.2, "device");
      }
    }

    const activeDevices = Object.values(this.state.devices).filter((d) => d.on);
    if (activeDevices.length && this.clock >= this.state.deviceNextRoll) {
      const source = activeDevices[0];
      const spent = this.clock - this.state.lastWave >= TACTICAL.waves.minInterval && !populationFull() ? spawnWave({
        x: source.x, y: source.y, strength: source.kind === "tv" ? TACTICAL.devices.tvStrength : TACTICAL.devices.radioStrength,
        radius: source.kind === "tv" ? TACTICAL.devices.tvRadius : TACTICAL.devices.radioRadius, source: "device",
      }) : 0;
      if (spent > 0) {
        this.state.waveBudget = Math.max(0, this.state.waveBudget - spent * TACTICAL.waves.budgetPerZombie);
        this.state.lastWave = this.clock;
        this.state.waveCount++;
        this.state.arousal = Math.max(0, this.state.arousal - 12);
      }
      this.state.deviceNextRoll = this.clock + TACTICAL.waves.nextDeviceRollMin + Math.random() * (TACTICAL.waves.nextDeviceRollMax - TACTICAL.waves.nextDeviceRollMin);
    }

    this.state.nextRoll -= dt;
    if (this.state.nextRoll > 0) return;
    this.state.nextRoll = TACTICAL.waves.rollInterval;
    if (populationFull() || this.clock - this.state.lastWave < TACTICAL.waves.minInterval) return;
    const chance = Math.min(0.82, Math.max(0, (this.state.arousal - 12) / 115) + activeDevices.length * 0.12);
    if (Math.random() >= chance) return;
    const source = this.strongestFor(0, 0, 100) ?? this.state.events[this.state.events.length - 1];
    if (!source) return;
    const spent = spawnWave(source);
    if (spent > 0) {
      this.state.waveBudget = Math.max(0, this.state.waveBudget - spent * TACTICAL.waves.budgetPerZombie);
      this.state.lastWave = this.clock;
      this.state.waveCount++;
      this.state.arousal = Math.max(0, this.state.arousal - 16);
    }
  }
}
