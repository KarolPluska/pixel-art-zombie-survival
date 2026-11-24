import { center, sameCell, type BlockedDoor, type Cell, type Feature, type Shelf, type Steam, type Wire } from "./environment-layout";
import { TILE, Tile } from "./palette";
import type { FloorData } from "./types";

export type EnvironmentSound = "arc" | "shock" | "switch" | "strain" | "scrape" | "crack" | "collapse"
  | "hiss" | "steam" | "valve" | "glass" | "cans" | "planks" | "flare";
export type Stage = "idle" | "warning" | "settled" | "venting";
export type Cycle = "safe" | "charging" | "live" | "off";

export interface FeatureState { stage: Stage; since: number; progress: number; off: boolean }
export interface EnvironmentState { clock: number; features: Record<number, FeatureState> }
export interface Bounds { x: number; y: number; w: number; h: number }
interface Actor extends Cell { id: number; radius: number }
interface Player extends Actor { busy: boolean; hidden: boolean }

export interface EnvironmentWorld {
  player(): Player;
  actors(): Actor[];
  clear(from: Cell, to: Cell): boolean;
  changed(): void;
  hit(actor: Actor, damage: number, from: Cell): void;
  alert(at: Cell, tiles: number): void;
  sound(kind: EnvironmentSound, at: Cell): void;
  dust(at: Cell, color: string, amount: number, speed: number, glow?: boolean): void;
  shake(amount: number): void;
  say(text: string): void;
}

export const WALL_WARNING = 2;
export const FLOOR_WARNING = 1.05;
export const SHELF_WARNING = 1.1;
export const GAS_WARNING = 1.55;
export const GAS_CLEAR = 2.8;
export const WALL_DUST = 1.15;
export const heroId = 0;

export const FURNITURE = {
  cabinet: { text: "przesu\u0144 szaf\u0119", time: 2.7, noise: 6, effort: 12 },
  fridge: { text: "przesu\u0144 lod\u00f3wk\u0119", time: 3.6, noise: 9, effort: 15 },
  dresser: { text: "przesu\u0144 komod\u0119", time: 1.35, noise: 3, effort: 6 },
  bookcase: { text: "przesu\u0144 rega\u0142", time: 2.05, noise: 5, effort: 9 },
  boards: { text: "zdejmij deski", time: 2.75, noise: 5, effort: 7 },
  upturned: { text: "odsu\u0144 przewr\u00f3cony mebel", time: 1.8, noise: 4, effort: 8 },
} as const;

export const cellBounds = (p: Cell, inset = 0): Bounds => ({ x: p.x * TILE + inset, y: p.y * TILE + inset, w: TILE - inset * 2, h: TILE - inset * 2 });
const overlap = (a: Bounds, b: Bounds) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inside = (p: Cell, r: Bounds) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
const distance = (a: Cell, b: Cell) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const newRecord = (): FeatureState => ({ stage: "idle", since: 0, progress: 0, off: false });

function touches(p: Cell, radius: number, r: Bounds) {
  const dx = p.x - Math.max(r.x, Math.min(p.x, r.x + r.w));
  const dy = p.y - Math.max(r.y, Math.min(p.y, r.y + r.h));
  return dx * dx + dy * dy < radius * radius;
}

export function createEnvironmentState(): EnvironmentState {
  return { clock: 0, features: {} };
}

export function cycleFor(f: Wire | Extract<Feature, { kind: "steam" }>, state: FeatureState, clock: number): Cycle {
  if (state.off) return "off";
  if (f.kind === "wire" && f.mode !== "pulse") return "live";
  const steam = f.kind === "steam";
  const t = (clock + f.phase) % (steam ? 6.3 : 5.6);
  if (t < (steam ? 3.5 : 3.3)) return "safe";
  if (t < (steam ? 4.85 : 4.55)) return "charging";
  return "live";
}

// Both the renderer and damage code use these exact regions in world pixels.
export function effectBounds(f: Feature): Bounds[] {
  switch (f.kind) {
    case "wire": return f.cells.map((p) => cellBounds(p, f.mode === "pool" ? 0 : 2));
    case "wall": return f.landing.map((p) => cellBounds(p));
    case "steam": return f.cells.map((p) => {
      const r = cellBounds(p);
      return f.heading.x ? { ...r, y: r.y + 3, h: r.h - 6 } : { ...r, x: r.x + 3, w: r.w - 6 };
    });
    case "gas": case "surface": return f.cells.map((p) => cellBounds(p));
    case "shelf": return [cellBounds(f.landing)];
    case "weak": return [cellBounds(f.at)];
    default: return [];
  }
}

export function furnitureBounds(f: BlockedDoor, progress: number): Bounds {
  return { ...cellBounds(f.at), x: lerp(f.at.x, f.park.x, progress) * TILE, y: lerp(f.at.y, f.park.y, progress) * TILE };
}

type Target = { feature: Feature; at: Cell; label: string; hold: boolean; progress: number };
type Work = { id: number; face: Cell; effort: number };

export class Environment {
  readonly features: Feature[];
  private readonly jets: Steam[];
  private readonly sealed = new Map<number, number>();
  private readonly dark = new Set<number>();
  private readonly zones = new Map<number, Bounds[]>();
  private readonly adjacency = new Map<number, Feature[]>();
  private readonly effects = new Map<number, { next: number; slow: number }>();
  private readonly heard = new Map<number, number>();
  private readonly cycles = new Map<number, Cycle>();
  private readonly warned = new Set<number>();
  private blockers: Bounds[] = [];
  private work: Work | null = null;

  constructor(private floor: FloorData, readonly state: EnvironmentState, private world: EnvironmentWorld) {
    this.features = floor.environment?.features ?? [];
    this.jets = this.features.filter((f) => f.kind === "steam");
    for (const a of floor.environment?.annexes ?? []) {
      if (a.seal !== null) this.sealed.set(a.room, a.seal);
      for (const p of a.props) if (!floor.props.some((q) => q.id === p.id)) floor.props.push({ ...p });
    }
    for (const f of this.features) {
      if (!state.features[f.id]) state.features[f.id] = newRecord();
      this.zones.set(f.id, effectBounds(f));
      if (f.kind === "wire" && this.read(f).off) this.dark.add(f.room);
      if (f.kind === "surface") for (const p of f.cells) {
        const i = this.idx(p);
        this.adjacency.set(i, [...(this.adjacency.get(i) ?? []), f]);
      }
      this.apply(f);
    }
    this.reindex();
  }

  get clock() { return this.state.clock; }
  get working() { return this.work; }
  read(f: Feature) { return this.state.features[f.id]; }
  cancelWork() { this.work = null; }
  roomDark(room: number) { return this.dark.has(room); }
  roomHidden(room: number) {
    const id = this.sealed.get(room);
    return id !== undefined && this.state.features[id].stage !== "settled";
  }

  private idx(p: Cell) { return p.y * this.floor.w + p.x; }
  private tile(p: Cell) { return this.floor.tiles[this.idx(p)]; }

  private apply(f: Feature) {
    if (this.read(f).stage !== "settled") return;
    switch (f.kind) {
      case "wall": {
        this.floor.tiles[this.idx(f.at)] = Tile.Rubble;
        if (!this.floor.breaches.some((b) => sameCell(b, f.at))) this.floor.breaches.push(f.at);
        break;
      }
      case "obstruction": {
        const door = this.floor.doors.find((d) => sameCell(d, f.gate));
        if (door?.sealed) {
          door.sealed = false;
          door.open = true;
          this.floor.tiles[this.idx(f.gate)] = Tile.DoorOpen;
        }
        break;
      }
      case "weak": this.floor.tiles[this.idx(f.at)] = Tile.Hole; break;
      case "shelf":
        if (!this.floor.props.some((p) => p.id === f.stash.id)) this.floor.props.push({ ...f.stash });
        break;
    }
  }

  private reindex() {
    this.blockers = [];
    for (const f of this.features) {
      const s = this.read(f);
      if (f.kind === "obstruction") this.blockers.push(furnitureBounds(f, s.progress));
      if (f.kind === "shelf") this.blockers.push(cellBounds(s.stage === "settled" ? f.landing : f.at));
    }
  }

  blocksTile(x: number, y: number) {
    return this.blockers.some((b) => overlap(cellBounds({ x, y }), b));
  }

  blocksBody(x: number, y: number, radius: number) {
    return this.blockers.some((b) => touches({ x, y }, radius, b));
  }

  slow(id: number) { return (this.effects.get(id)?.slow ?? 0) > this.clock; }

  inSteam(x: number, y: number) {
    return this.jets.some((f) => cycleFor(f, this.read(f), this.clock) === "live" && this.zoneAt(f, { x, y }));
  }

  private status(f: Feature, stage: Stage) {
    const s = this.read(f);
    s.stage = stage;
    s.since = this.clock;
  }

  private zoneAt(f: Feature, p: Cell) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    const tile = this.tile({ x: tx, y: ty });
    if (tx < 0 || ty < 0 || tx >= this.floor.w || ty >= this.floor.h || tile === Tile.Wall || tile === Tile.Door || tile === Tile.Window || tile === Tile.Sky || tile === Tile.Hole) return false;
    return !!this.zones.get(f.id)?.some((b) => inside(p, b));
  }

  private hit(actor: Actor, damage: number, at: Cell, interval: number, slow: number) {
    const last = this.effects.get(actor.id);
    if (last && this.clock < last.next) return;
    this.effects.set(actor.id, { next: this.clock + interval, slow: Math.max(last?.slow ?? 0, this.clock + slow) });
    this.world.hit(actor, damage, at);
  }

  private hitZone(f: Feature, actors: Actor[], damage: number, interval: number, slow: number) {
    for (const a of actors) if (this.zoneAt(f, a)) this.hit(a, damage, center(f.at), interval, slow);
  }

  private target(): Target | null {
    const player = this.world.player();
    if (player.hidden || player.busy) return null;
    let best: Target | null = null;
    let range = 20;
    for (const f of this.features) {
      const s = this.read(f);
      let location: Cell | undefined;
      let text = "";
      let hold = false;
      if (f.kind === "wire" && !s.off && f.control) {
        location = f.control; text = "od\u0142\u0105cz obw\u00f3d";
      } else if (f.kind === "steam" && !s.off) {
        location = f.control; text = "zamknij zaw\u00f3r pary";
      } else if (f.kind === "gas" && !s.off && s.stage !== "settled") {
        location = f.control; text = "zamknij zaw\u00f3r gazu";
      } else if (f.kind === "shelf" && s.stage === "idle") {
        location = f.at; text = "przewr\u00f3\u0107 rega\u0142";
      } else if (f.kind === "obstruction" && s.stage !== "settled") {
        if (distance(player, center(f.stand)) >= 13) continue;
        location = f.at; text = FURNITURE[f.material].text; hold = true;
      }
      if (!location) continue;
      const at = center(location);
      const d = distance(player, at);
      if (d < range && this.world.clear(player, at)) {
        range = d;
        best = { feature: f, at, label: text, hold, progress: s.progress };
      }
    }
    return best;
  }

  hint() {
    const t = this.target();
    return t ? { label: t.label, hold: t.hold, progress: t.progress, active: this.work?.id === t.feature.id } : null;
  }

  use() {
    const t = this.target();
    if (!t) return false;
    const f = t.feature;
    const s = this.read(f);
    if (f.kind === "wire") {
      s.off = true;
      this.dark.add(f.room);
      this.world.sound("switch", t.at);
      this.world.say("Obw\u00f3d od\u0142\u0105czony. Lampy w tej cz\u0119\u015bci bloku zgas\u0142y.");
    } else if (f.kind === "steam") {
      s.off = true;
      this.status(f, "settled");
      this.world.sound("valve", t.at);
      this.world.say("Para opada. Przej\u015bcie jest bezpieczne.");
    } else if (f.kind === "gas") {
      s.off = true;
      this.status(f, "venting");
      this.world.sound("valve", t.at);
      this.world.say("Zaw\u00f3r zamkni\u0119ty. Opary jeszcze si\u0119 utrzymuj\u0105.");
    } else if (f.kind === "shelf") this.tipShelf(f);
    return true;
  }

  updateWork(dt: number, holding: boolean, stamina: number, tool: boolean): Work | null {
    this.work = null;
    if (!holding) return null;
    const target = this.target();
    if (!target || target.feature.kind !== "obstruction") return null;
    const f = target.feature, s = this.read(f), spec = FURNITURE[f.material];
    const pace = (stamina < 18 ? 0.55 : 1) * (f.material === "boards" && tool ? 1.65 : 1);
    const next = Math.min(1, s.progress + dt * pace / spec.time);
    const pose = furnitureBounds(f, next);
    if (this.world.actors().some((a) => touches(a, a.radius, pose))) {
      if (this.ping(f, 1.2)) this.world.say("Co\u015b blokuje miejsce, w kt\u00f3re przesuwasz przeszkod\u0119.");
      return null;
    }
    const stage = Math.floor(s.progress * 3);
    s.progress = next;
    this.reindex();
    this.work = { id: f.id, face: target.at, effort: spec.effort };
    if ((f.material === "boards" && Math.floor(next * 3) > stage) || this.ping(f, 0.48)) {
      this.world.sound(f.material === "fridge" ? "scrape" : "strain", target.at);
      this.world.alert(center(f.stand), spec.noise);
      this.world.dust(center(f.at), "#a08a69", f.material === "boards" ? 6 : 3, 22);
    }
    if (next >= 1) {
      this.status(f, "settled");
      this.apply(f);
      this.world.changed();
      this.world.sound("switch", center(f.gate));
      this.world.say("Przej\u015bcie ods\u0142oni\u0119te. Za drzwiami jest jeszcze jeden pok\u00f3j.");
    }
    return this.work;
  }

  private ping(f: Feature, interval: number) {
    if ((this.heard.get(f.id) ?? -Infinity) > this.clock) return false;
    this.heard.set(f.id, this.clock + interval);
    return true;
  }

  private tipShelf(f: Shelf) {
    this.status(f, "warning");
    this.world.sound("strain", center(f.at));
    this.world.say("Rega\u0142 si\u0119 przechyla. Odsu\u0144 si\u0119 z drogi!");
  }

  strike(aim: number, reach: number) {
    const p = this.world.player();
    for (const f of this.features) {
      if (f.kind !== "shelf" || this.read(f).stage !== "idle") continue;
      const at = center(f.at);
      const ang = Math.atan2(at.y - p.y, at.x - p.x) - aim;
      if (distance(at, p) > reach + 4 || Math.cos(ang) < 0.65 || !this.world.clear(p, at)) continue;
      this.tipShelf(f);
      return true;
    }
    return false;
  }

  footstep(p: Cell, sprint: boolean) {
    const key = this.idx({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
    for (const f of this.adjacency.get(key) ?? []) {
      if (f.kind !== "surface" || !this.zoneAt(f, p) || !this.ping(f, sprint ? 0.28 : 0.42)) continue;
      const s = this.read(f);
      s.progress = Math.min(1, s.progress + (sprint ? 0.4 : 0.19));
      s.since = this.clock;
      const distance = f.material === "cans" ? (sprint ? 9 : 4) : f.material === "planks" ? (sprint ? 7 : 1.7) : (sprint ? 7 : 2.4);
      this.world.sound(f.material, p);
      this.world.alert(p, distance);
      this.world.dust(p, f.material === "glass" ? "#bfd5d4" : "#aa9573", sprint ? 7 : 3, 32);
      if (sprint && f.material === "glass") this.hit(this.world.player(), 4, p, 1.35, 0.16);
    }
  }

  ignite(at: Cell) {
    for (const f of this.features) {
      if (f.kind !== "gas" || this.read(f).stage !== "idle" || !this.zoneAt(f, at)) continue;
      this.status(f, "warning");
      this.world.sound("hiss", center(f.at));
      if (distance(this.world.player(), center(f.at)) < 5 * TILE) this.world.say("Czu\u0107 gaz. Opary zaczynaj\u0105 si\u0119 zapala\u0107!");
    }
  }

  update(dt: number) {
    this.state.clock += dt;
    if (!this.features.length) return;
    const p = this.world.player();
    const actors = this.world.actors();
    for (const f of this.features) {
      const s = this.read(f);
      const at = center(f.at);
      const near = distance(at, p) < TILE * 7;
      const age = this.clock - s.since;
      switch (f.kind) {
        case "wire": case "steam": {
          const cycle = cycleFor(f, s, this.clock);
          const previous = this.cycles.get(f.id);
          this.cycles.set(f.id, cycle);
          if (near && cycle === "charging" && previous !== cycle) this.world.sound(f.kind === "wire" ? "arc" : "hiss", at);
          if (cycle !== "live") break;
          if (near && (previous !== "live" || (f.kind === "wire" && this.ping(f, 1.12)))) this.world.sound(f.kind === "wire" ? "shock" : "steam", at);
          this.hitZone(f, actors, f.kind === "wire" ? (f.mode === "pulse" ? 16 : 11) : 9, f.kind === "wire" ? 1.15 : 0.9, f.kind === "wire" ? 0.8 : 0.42);
          if (f.kind === "wire" && f.mode === "pulse") this.ignite(at);
          break;
        }
        case "wall": {
          const face = center(f.front);
          const outwardX = f.front.x - f.at.x, outwardY = f.front.y - f.at.y;
          if (s.stage === "idle" && !p.hidden && distance(p, face) < 18 && (p.x - at.x) * outwardX + (p.y - at.y) * outwardY > TILE * 0.55 && this.world.clear(p, face)) {
            this.status(f, "warning");
            this.world.sound("crack", face);
            this.world.say("Tynk si\u0119 sypie. Cofnij si\u0119 od \u015bciany!");
          } else if (s.stage === "warning") {
            if (age >= WALL_WARNING) {
              this.hitZone(f, actors, 26, 0.8, 0.48);
              this.settle(f, face, 11);
            } else if (near && this.ping(f, 0.48 - age * 0.13)) {
              this.world.sound("crack", face);
              this.world.dust(face, "#c6ad90", 3, 22);
            }
          }
          break;
        }
        case "weak":
          if (s.stage === "idle" && !p.hidden && this.zoneAt(f, p)) {
            this.status(f, "warning");
            this.world.sound("planks", at);
            this.world.say("Pod\u0142oga ugina si\u0119. Zejd\u017a z desek!");
          } else if (s.stage === "warning" && age >= FLOOR_WARNING) {
            this.hitZone(f, actors, 16, 0.95, 1.15);
            const around = [{ x: at.x + TILE, y: at.y }, { x: at.x - TILE, y: at.y }, { x: at.x, y: at.y + TILE }, { x: at.x, y: at.y - TILE }];
            const heardAt = around.find((q) => this.world.clear(at, q)) ?? at;
            this.settle(f, heardAt, 6);
          }
          break;
        case "shelf":
          if (s.stage === "warning" && age >= SHELF_WARNING) {
            this.hitZone(f, actors, 32, 0.8, 0.62);
            this.settle(f, at, 8);
          }
          break;
        case "gas":
          if (s.stage === "idle" && !p.hidden && distance(at, p) < 2.5 * TILE && this.world.clear(p, at)) {
            if (!this.warned.has(f.id)) {
              this.warned.add(f.id);
              this.world.say("Czu\u0107 gaz. Poszukaj zaworu albo omi\u0144 opary.");
            }
            if (this.ping(f, 2.1)) this.world.sound("hiss", at);
          } else if (s.stage === "warning" && age >= GAS_WARNING) {
            this.hitZone(f, actors, 24, 0.85, 0.44);
            this.status(f, "settled");
            this.world.sound("flare", at);
            this.world.alert(at, 10);
            if (near) this.world.shake(2.8);
          } else if (s.stage === "venting" && age >= GAS_CLEAR) this.status(f, "settled");
          break;
      }
    }
  }

  private settle(f: Feature, noiseAt: Cell, radius: number) {
    this.status(f, "settled");
    this.apply(f);
    this.reindex();
    this.world.changed();
    this.world.alert(noiseAt, radius);
    this.world.sound("collapse", noiseAt);
    if (distance(this.world.player(), noiseAt) < 7 * TILE) this.world.shake(f.kind === "wall" ? 3.3 : 2.1);
  }

  markers() {
    return this.features.flatMap((f) => {
      const s = this.read(f);
      if (f.kind === "wall" && s.stage === "settled") return [{ at: f.at, color: "#c99b70" }];
      if (f.kind === "wire" || f.kind === "steam" || f.kind === "gas") {
        return f.control && !s.off && s.stage !== "settled" ? [{ at: f.control, color: "#83bfc0" }] : [];
      }
      return [];
    });
  }
}