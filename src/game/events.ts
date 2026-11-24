import { astar } from "./path";
import { TILE } from "./palette";
import type { Art } from "./sprites";
import type { DoorInfo, FloorData, Prop, ZombieKind } from "./types";

export type Tone = "info" | "good" | "warn" | "danger";
export type EventKind = "runners" | "camp" | "escort" | "knock" | "blackout" | "alarm" | "barricade";
export type Resource = "ammo" | "shells" | "bolts" | "battery";

export interface EventSounds {
  scream(): void;
  alarm(): void;
  knock(): void;
  powerDown(): void;
  powerUp(): void;
  hide(open: boolean): void;
  bang(): void;
  gun(): void;
  thanks(): void;
  whisper(): void;
}

export interface ZombieView {
  id: number;
  x: number;
  y: number;
  dead: boolean;
}

export interface EventWorld {
  floor(): FloorData;
  px(): number;
  py(): number;
  tileVisible(tx: number, ty: number): boolean;
  tileExplored(tx: number, ty: number): boolean;
  walk(x: number, y: number, throughDoors: boolean): boolean;
  move(x: number, y: number, r: number, dx: number, dy: number): { x: number; y: number };
  los(x0: number, y0: number, x1: number, y1: number): boolean;
  zombieList(): ZombieView[];
  hurtZombie(id: number, dmg: number, dx: number, dy: number): void;
  addZombie(x: number, y: number, kind: ZombieKind): void;
  alertZombies(x: number, y: number, radius: number): void;
  hurtPlayer(dmg: number, fromX: number, fromY: number): void;
  shootBullet(x: number, y: number, angle: number, speed: number, dmg: number): void;
  particles(x: number, y: number, col: string, n: number, spd: number, glow?: boolean): void;
  popup(x: number, y: number, text: string, col: string): void;
  message(text: string): void;
  quake(v: number): void;
  sound(): EventSounds;
  give(kind: Resource, amount: number): void;
  count(kind: Resource): number;
  take(kind: Resource, amount: number): boolean;
  doorAt(tx: number, ty: number): DoorInfo | undefined;
  openDoor(tx: number, ty: number): void;
  hideSpots(): Prop[];
  goal(): { x: number; y: number } | null;
  rand(): number;
}

export interface Civ {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  variant: number;
  armed: boolean;
  faction: "neutral" | "friendly" | "hostile";
  role: "flee" | "camp" | "escort";
  state: "run" | "sit" | "fight" | "follow" | "leave" | "dead" | "gone";
  dir: "down" | "up" | "left" | "right";
  animT: number;
  path: { x: number; y: number }[];
  pathT: number;
  goalX: number;
  goalY: number;
  seatX: number;
  seatY: number;
  attackCd: number;
  hurtFlash: number;
  fade: number;
  thanked: boolean;
  calm: number;
  eventId: number;
  name: string;
}

export interface ChoiceOption {
  label: string;
  enabled: boolean;
  run: () => void;
}

export interface Choice {
  speaker: string;
  text: string;
  options: ChoiceOption[];
}

export interface EventBanner {
  title: string;
  text: string;
  tone: Tone;
}

interface LiveEvent {
  id: number;
  kind: EventKind;
  t: number;
  civs: number[];
  zombies: number[];
  door?: { x: number; y: number };
  variant?: "friendly" | "trade" | "distrust";
  resolved?: boolean;
  hp?: number;
  stage?: number;
  beep?: number;
}

const CIV_NAMES = ["MAREK", "HALINA", "TOMEK", "ANKA", "DOZORCA", "WIKTOR", "ELA"];

export class EventDirector {
  private civs: Civ[] = [];
  private events: LiveEvent[] = [];
  private nextId = 1;
  private cooldown = 26;
  private floorAge = 0;
  private spawnedHere = 0;
  private usedKinds = new Set<EventKind>();
  private screamCd = 12;
  private reinforceLeft = 7;
  private hideProp: Prop | null = null;
  private witnesses = new Set<number>();
  private checkT = 0;
  private bangT = 0;
  private escortWarn = 0;

  hidden = false;
  blackoutT = 0;
  choice: Choice | null = null;
  banner: EventBanner | null = null;
  private bannerT = 0;
  camp: { x: number; y: number } | null = null;
  alarm: { x: number; y: number; t: number } | null = null;
  escortId = -1;

  constructor(private w: EventWorld, private art: Art) {}

  /* ---------------- helpers ---------------- */

  private rand() {
    return this.w.rand();
  }

  private pick<T>(list: T[]): T {
    return list[Math.floor(this.rand() * list.length) % list.length];
  }

  private tell(title: string, text: string, tone: Tone = "info") {
    this.banner = { title, text, tone };
    this.bannerT = 5;
  }

  private zoneOf(x: number, y: number) {
    const f = this.w.floor();
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= f.w || ty >= f.h) return "";
    const rid = f.roomOf[ty * f.w + tx];
    return rid >= 0 ? f.roomZones[rid] ?? "" : "";
  }

  private path(from: { x: number; y: number }, to: { x: number; y: number }) {
    const f = this.w.floor();
    return (
      astar(
        f.w,
        f.h,
        Math.floor(from.x / TILE),
        Math.floor(from.y / TILE),
        Math.floor(to.x / TILE),
        Math.floor(to.y / TILE),
        (x, y) => this.w.walk(x, y, true),
      ) ?? []
    );
  }

  private addCiv(x: number, y: number, role: Civ["role"], eventId: number, armed = false): Civ {
    const civ: Civ = {
      id: this.nextId++,
      x,
      y,
      hp: role === "escort" ? 74 : armed ? 66 : 52,
      maxHp: role === "escort" ? 74 : armed ? 66 : 52,
      variant: Math.floor(this.rand() * 2),
      armed,
      faction: "neutral",
      role,
      state: role === "camp" ? "sit" : "run",
      dir: "down",
      animT: this.rand() * 3,
      path: [],
      pathT: 0,
      goalX: x,
      goalY: y,
      seatX: x,
      seatY: y,
      attackCd: 1,
      hurtFlash: 0,
      fade: 1,
      thanked: false,
      calm: 0,
      eventId,
      name: this.pick(CIV_NAMES),
    };
    this.civs.push(civ);
    return civ;
  }

  /** Wolny kafelek poza polem widzenia gracza, z realną drogą do celu. */
  private darkSpawn(minTiles: number, clearOfZombies = 0) {
    const f = this.w.floor();
    const ptx = Math.floor(this.w.px() / TILE);
    const pty = Math.floor(this.w.py() / TILE);
    const live = clearOfZombies > 0 ? this.w.zombieList().filter((z) => !z.dead) : [];
    for (let a = 0; a < 240; a++) {
      const tx = 3 + Math.floor(this.rand() * (f.w - 6));
      const ty = 3 + Math.floor(this.rand() * (f.h - 6));
      if (!this.w.walk(tx, ty, false)) continue;
      if (Math.hypot(tx - ptx, ty - pty) < minTiles) continue;
      if (this.w.tileVisible(tx, ty)) continue;
      if (live.some((z) => Math.hypot(z.x - (tx + 0.5) * TILE, z.y - (ty + 0.5) * TILE) < clearOfZombies)) continue;
      const zone = this.zoneOf(tx * TILE, ty * TILE);
      if (zone === "KLATKA SCHODOWA") continue;
      if (!this.path({ x: tx * TILE, y: ty * TILE }, { x: this.w.px(), y: this.w.py() }).length) continue;
      return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
    return null;
  }

  /* ---------------- director loop ---------------- */

  update(dt: number) {
    this.floorAge += dt;
    this.escortWarn -= dt;
    this.cooldown -= dt;
    this.screamCd -= dt;
    this.bannerT -= dt;
    if (this.bannerT <= 0) this.banner = null;
    if (this.blackoutT > 0) {
      this.blackoutT -= dt;
      if (this.blackoutT <= 0) {
        this.w.sound().powerUp();
        this.tell("ZASILANIE WRÓCIŁO", "Świetlówki znowu buczą nad korytarzem.", "good");
      }
    }
    for (const ev of [...this.events]) this.updateEvent(ev, dt);
    this.updateCivs(dt);
    this.updateHiding(dt);
    this.maybeSpawn();
  }

  lightFactor() {
    return this.blackoutT > 0 ? 0.16 : 1;
  }

  extraZombies() {
    return this.events.reduce((n, ev) => n + ev.zombies.length, 0);
  }

  private maybeSpawn() {
    const f = this.w.floor();
    if (f.index >= 10) return;
    if (this.choice || this.hidden) return;
    if (this.cooldown > 0 || this.floorAge < 24) return;
    if (this.events.length >= 2 || this.spawnedHere >= 2) return;
    const options: { kind: EventKind; weight: number; ok: boolean }[] = [
      { kind: "runners", weight: 16, ok: this.corridor().length > 0 },
      { kind: "camp", weight: 17, ok: this.campRoom() !== null },
      { kind: "escort", weight: 13, ok: !!f.stairsUp },
      { kind: "knock", weight: 16, ok: this.knockDoor() !== null },
      { kind: "blackout", weight: 13, ok: f.index > 0 },
      { kind: "alarm", weight: 11, ok: f.index > 1 },
      { kind: "barricade", weight: 12, ok: this.pressureDoor() !== null },
    ];
    const pool = options.filter((o) => o.ok && !this.usedKinds.has(o.kind));
    if (!pool.length) {
      this.cooldown = 30;
      return;
    }
    const total = pool.reduce((n, o) => n + o.weight, 0);
    let roll = this.rand() * total;
    let chosen = pool[0].kind;
    for (const o of pool) {
      roll -= o.weight;
      if (roll <= 0) {
        chosen = o.kind;
        break;
      }
    }
    if (this.start(chosen)) {
      this.usedKinds.add(chosen);
      this.spawnedHere++;
      this.cooldown = 52 + this.rand() * 40;
    } else {
      this.cooldown = 18;
    }
  }

  private start(kind: EventKind): boolean {
    const ev: LiveEvent = { id: this.nextId++, kind, t: 0, civs: [], zombies: [] };
    switch (kind) {
      case "runners":
        return this.startRunners(ev);
      case "camp":
        return this.startCamp(ev);
      case "escort":
        return this.startEscort(ev);
      case "knock":
        return this.startKnock(ev);
      case "blackout":
        this.blackoutT = 17 + this.rand() * 8;
        this.w.sound().powerDown();
        this.w.quake(2);
        this.tell("AWARIA ŚWIATŁA", "Bezpieczniki padły. Została tylko latarka.", "warn");
        this.events.push(ev);
        return true;
      case "alarm":
        return this.startAlarm(ev);
      case "barricade":
        return this.startBarricade(ev);
    }
  }

  /* ---------------- 1. uciekający ocalali ---------------- */

  private corridor() {
    const f = this.w.floor();
    return f.rooms.filter((r) => f.roomZones[r.id] === "KORYTARZ");
  }

  private startRunners(ev: LiveEvent) {
    const halls = this.corridor();
    if (!halls.length) return false;
    const hall = this.pick(halls);
    const leftToRight = this.rand() < 0.5;
    const startX = (leftToRight ? hall.x + 1 : hall.x + hall.w - 2) * TILE;
    const endX = (leftToRight ? hall.x + hall.w - 2 : hall.x + 1) * TILE;
    const y = (hall.y + 1) * TILE;
    if (Math.hypot(startX - this.w.px(), y - this.w.py()) < 5 * TILE) return false;
    for (let i = 0; i < 3; i++) {
      const civ = this.addCiv(startX - (leftToRight ? i * 14 : -i * 14), y + (i - 1) * 9, "flee", ev.id);
      civ.goalX = endX;
      civ.goalY = y;
      civ.state = "run";
      ev.civs.push(civ.id);
    }
    const chasers = 2 + Math.floor(this.rand() * 2);
    for (let i = 0; i < chasers; i++) {
      const zx = startX - (leftToRight ? 46 + i * 16 : -46 - i * 16);
      const kind: ZombieKind = i === 0 && this.rand() < 0.5 ? "runner" : "shambler";
      this.w.addZombie(zx, y + (i - 1) * 8, kind);
      const list = this.w.zombieList();
      const spawned = list[list.length - 1];
      if (spawned) ev.zombies.push(spawned.id);
    }
    this.w.alertZombies(startX, y, 6 * TILE);
    this.tell("UCIEKAJĄCY", "Ktoś biegnie korytarzem. Zaraz za nim słychać wleczenie.", "warn");
    this.events.push(ev);
    return true;
  }

  /* ---------------- 3. obozowisko ---------------- */

  private campRoom() {
    const f = this.w.floor();
    const options = f.rooms.filter((r) => {
      if (r.role !== "normal") return false;
      const zone = f.roomZones[r.id];
      if (zone === "KORYTARZ" || zone === "KLATKA SCHODOWA" || zone === "ŁAZIENKA") return false;
      if (r.w < 5 || r.h < 4) return false;
      const cx = (r.x + r.w / 2) * TILE;
      const cy = (r.y + r.h / 2) * TILE;
      return Math.hypot(cx - this.w.px(), cy - this.w.py()) > 9 * TILE;
    });
    return options.length ? this.pick(options) : null;
  }

  private startCamp(ev: LiveEvent) {
    const room = this.campRoom();
    if (!room) return false;
    const cx = (room.x + room.w / 2) * TILE;
    const cy = (room.y + room.h / 2) * TILE;
    this.camp = { x: cx, y: cy };
    const seats = [
      { x: cx - 20, y: cy + 6 },
      { x: cx + 20, y: cy + 6 },
      { x: cx, y: cy - 20 },
    ];
    const count = 2 + Math.floor(this.rand() * 2);
    for (let i = 0; i < count; i++) {
      const seat = seats[i % seats.length];
      const civ = this.addCiv(seat.x, seat.y, "camp", ev.id, i === 0);
      civ.seatX = seat.x;
      civ.seatY = seat.y;
      civ.state = "sit";
      civ.faction = "friendly";
      ev.civs.push(civ.id);
    }
    ev.variant = this.pick(["friendly", "trade", "distrust"] as const);
    this.tell("OBOZOWISKO", "Za drzwiami majaczy blask ogniska i ciche głosy.", "info");
    this.events.push(ev);
    return true;
  }

  private campTalk(ev: LiveEvent) {
    const alive = ev.civs.map((id) => this.civ(id)).filter((c): c is Civ => !!c && c.state !== "dead");
    if (!alive.length) return;
    if (alive[0].faction === "hostile") {
      this.openChoice("OBOZOWICZE", "Ostrzegaliśmy. Odkładaj broń albo znikaj.", [
        { label: "Odejdź", enabled: true, run: () => this.closeChoice() },
      ]);
      return;
    }
    if (ev.resolved) {
      this.openChoice(alive[0].name, "Mamy już wszystko, czego nam trzeba. Idź na górę.", [
        { label: "Odejdź", enabled: true, run: () => this.closeChoice() },
      ]);
      return;
    }
    if (ev.variant === "friendly") {
      this.openChoice(alive[0].name, "Siadaj przy ogniu. Masz, weź to — nam wystarczy na jedną noc.", [
        {
          label: "Przyjmij zapasy",
          enabled: true,
          run: () => {
            ev.resolved = true;
            this.w.give("ammo", 12);
            this.w.give("battery", 25);
            this.w.popup(this.w.px(), this.w.py() - 14, "+12 NABOI / +25% BATERII", "#edc16e");
            this.w.sound().thanks();
            this.closeChoice();
            this.tell("OBOZOWISKO", "Grupa dzieli się zapasami i wraca do ognia.", "good");
          },
        },
        { label: "Podziękuj i odejdź", enabled: true, run: () => this.closeChoice() },
      ]);
      return;
    }
    if (ev.variant === "trade") {
      const canTrade = this.w.count("shells") >= 2;
      this.openChoice(alive[0].name, "Wymiana: dwa ładunki śrutu za dwadzieścia naboi. Bez targowania.", [
        {
          label: "Wymień (−2 śrut, +20 naboi)",
          enabled: canTrade,
          run: () => {
            if (!this.w.take("shells", 2)) return;
            ev.resolved = true;
            this.w.give("ammo", 20);
            this.w.popup(this.w.px(), this.w.py() - 14, "+20 NABOI", "#edc16e");
            this.w.sound().thanks();
            this.closeChoice();
            this.tell("WYMIANA", "Śrut znika w ich plecaku, u ciebie lądują naboje.", "good");
          },
        },
        {
          label: canTrade ? "Odmów" : "Nie masz śrutu — odejdź",
          enabled: true,
          run: () => {
            ev.resolved = true;
            this.closeChoice();
          },
        },
      ]);
      return;
    }
    const demand: Resource = this.w.count("ammo") >= 15 ? "ammo" : "battery";
    const amount = demand === "ammo" ? 15 : 30;
    const label = demand === "ammo" ? "15 naboi" : "30% baterii";
    const has = this.w.count(demand) >= amount;
    this.openChoice(alive[0].name, `Nie wpuszczamy obcych za darmo. ${label} albo zawracaj.`, [
      {
        label: `Zapłać (${label})`,
        enabled: has,
        run: () => {
          if (!this.w.take(demand, amount)) return;
          ev.resolved = true;
          this.w.give("shells", 3);
          this.w.popup(this.w.px(), this.w.py() - 14, "+3 ŁADUNKI ŚRUTU", "#edc16e");
          this.closeChoice();
          this.tell("OBOZOWISKO", "Biorą zapasy i wskazują ci drogę do klatki.", "info");
        },
      },
      {
        label: "Odmów",
        enabled: true,
        run: () => {
          ev.resolved = true;
          this.closeChoice();
          for (const civ of alive) civ.faction = "hostile";
          this.w.sound().bang();
          this.tell("OBOZOWISKO WROGIE", "Odbezpieczają broń. To już nie jest rozmowa.", "danger");
        },
      },
    ]);
  }

  /* ---------------- 4. samotny ocalały / eskorta ---------------- */

  private startEscort(ev: LiveEvent) {
    const spot = this.darkSpawn(5, 9 * TILE) ?? this.darkSpawn(4, 6 * TILE);
    if (!spot) return false;
    const civ = this.addCiv(spot.x, spot.y, "escort", ev.id);
    civ.state = "follow";
    civ.faction = "friendly";
    this.escortId = civ.id;
    ev.civs.push(civ.id);
    this.tell("OCALAŁY", "Ktoś woła z ciemności. Chce iść z tobą na klatkę.", "info");
    this.events.push(ev);
    return true;
  }

  /* ---------------- 4. odgłosy za drzwiami ---------------- */

  private knockDoor() {
    const f = this.w.floor();
    const ptx = this.w.px() / TILE;
    const pty = this.w.py() / TILE;
    const near = f.doors.filter(
      (d) => !d.open && !d.broken && !d.locked && Math.hypot(d.x - ptx, d.y - pty) > 3 && Math.hypot(d.x - ptx, d.y - pty) < 13,
    );
    return near.length ? this.pick(near) : null;
  }

  private startKnock(ev: LiveEvent) {
    const door = this.knockDoor();
    if (!door) return false;
    ev.door = { x: door.x, y: door.y };
    ev.variant = this.pick(["friendly", "trade", "distrust"] as const);
    ev.beep = 0;
    this.tell("COŚ ZA DRZWIAMI", "Ktoś kołacze w drzwi po drugiej stronie korytarza.", "warn");
    this.events.push(ev);
    return true;
  }

  /* ---------------- 4. alarm ---------------- */

  private startAlarm(ev: LiveEvent) {
    const halls = this.corridor();
    if (!halls.length) return false;
    const hall = this.pick(halls);
    const tx = hall.x + 2 + Math.floor(this.rand() * Math.max(1, hall.w - 4));
    const ty = hall.y - 1;
    if (Math.hypot(tx * TILE - this.w.px(), ty * TILE - this.w.py()) < 4 * TILE) return false;
    this.alarm = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, t: 0 };
    ev.beep = 0;
    this.w.sound().alarm();
    this.tell("ALARM", "Syrena wyje na korytarzu. Zciągnie wszystko z piętra.", "danger");
    this.events.push(ev);
    return true;
  }

  /* ---------------- 4. barykada pod naporem ---------------- */

  private pressureDoor() {
    const f = this.w.floor();
    const ptx = this.w.px() / TILE;
    const pty = this.w.py() / TILE;
    const near = f.doors.filter((d) => !d.open && !d.broken && Math.hypot(d.x - ptx, d.y - pty) > 4 && Math.hypot(d.x - ptx, d.y - pty) < 16);
    return near.length ? this.pick(near) : null;
  }

  private startBarricade(ev: LiveEvent) {
    const door = this.pressureDoor();
    if (!door) return false;
    ev.door = { x: door.x, y: door.y };
    ev.hp = 6;
    door.hp = 6;
    door.barricaded = true;
    const side = this.rand() < 0.5 ? -1 : 1;
    for (let i = 0; i < 3; i++) {
      const zx = (door.x + 0.5) * TILE + side * (18 + i * 10);
      const zy = (door.y + 0.5) * TILE + (i - 1) * 10;
      if (!this.w.walk(Math.floor(zx / TILE), Math.floor(zy / TILE), false)) continue;
      this.w.addZombie(zx, zy, i === 0 ? "brute" : "shambler");
      const list = this.w.zombieList();
      const last = list[list.length - 1];
      if (last) ev.zombies.push(last.id);
    }
    this.w.alertZombies((door.x + 0.5) * TILE, (door.y + 0.5) * TILE, 8 * TILE);
    this.tell("BARYKADA", "Coś napiera na drzwi. Deski zaczynają trzeszczeć.", "danger");
    this.events.push(ev);
    return true;
  }

  /* ---------------- 2. krzyczące zombie ---------------- */

  onSpotted(z: ZombieView, screamer: boolean) {
    if (!screamer || this.screamCd > 0 || this.reinforceLeft <= 0) return;
    const f = this.w.floor();
    if (f.index >= 10) return;
    this.screamCd = 26 + this.rand() * 14;
    this.w.sound().scream();
    this.w.quake(3);
    this.w.particles(z.x, z.y - 8, "#e05048", 16, 80, true);
    this.w.alertZombies(z.x, z.y, 12 * TILE);
    let sent = 0;
    const want = Math.min(this.reinforceLeft, 2 + Math.floor(this.rand() * 2));
    for (let i = 0; i < want; i++) {
      const spot = this.darkSpawn(9);
      if (!spot) break;
      this.w.addZombie(spot.x, spot.y, this.rand() < 0.35 ? "runner" : "shambler");
      sent++;
      this.reinforceLeft--;
    }
    if (sent > 0) this.tell("KRZYK", "Wyzzywa inne. Z ciemnych pokoi ruszają kolejne.", "danger");
  }

  /* ---------------- ukrywanie ---------------- */

  nearHideSpot() {
    let best: Prop | null = null;
    let bestD = 26;
    for (const p of this.w.hideSpots()) {
      const cx = (p.x + p.w / 2) * TILE;
      const cy = (p.y + p.h / 2) * TILE;
      const d = Math.hypot(cx - this.w.px(), cy - this.w.py());
      if (d < bestD && this.w.los(this.w.px(), this.w.py(), cx, cy)) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  toggleHide(seers: number[]) {
    if (this.hidden) {
      this.exitHide();
      return true;
    }
    const spot = this.nearHideSpot();
    if (!spot) return false;
    this.hideProp = spot;
    this.hidden = true;
    this.checkT = 0;
    this.witnesses = new Set(seers);
    this.w.sound().hide(true);
    if (this.witnesses.size) this.tell("KRYJÓWKA", "Zamknąłeś się w szafie. Ktoś to widział.", "danger");
    else this.tell("KRYJÓWKA", "Siedzisz w szafie. Oddychaj ciszej.", "info");
    return true;
  }

  hidePosition() {
    return this.hideProp ? { x: (this.hideProp.x + this.hideProp.w / 2) * TILE, y: (this.hideProp.y + this.hideProp.h / 2) * TILE } : null;
  }

  isWitness(id: number) {
    return this.witnesses.has(id);
  }

  private exitHide(forced = false) {
    if (!this.hidden) return;
    this.hidden = false;
    this.w.sound().hide(false);
    if (forced) {
      this.w.alertZombies(this.w.px(), this.w.py(), 7 * TILE);
      this.tell("KRYJÓWKA", "Drzwiczki szafy puściły. Wiedzą, gdzie jesteś.", "danger");
    }
    this.hideProp = null;
    this.witnesses.clear();
  }

  private updateHiding(dt: number) {
    if (!this.hidden || !this.hideProp) return;
    const spot = this.hidePosition()!;
    let watched = false;
    for (const z of this.w.zombieList()) {
      if (z.dead || !this.witnesses.has(z.id)) continue;
      if (Math.hypot(z.x - spot.x, z.y - spot.y) < 26) watched = true;
    }
    if (!watched) {
      this.checkT = Math.max(0, this.checkT - dt * 0.5);
      return;
    }
    this.checkT += dt;
    this.bangT -= dt;
    if (this.bangT <= 0) {
      this.bangT = 0.85;
      this.w.sound().bang();
      this.w.quake(2.4);
      this.w.particles(spot.x, spot.y - 6, "#8a6240", 5, 40);
    }
    if (this.checkT > 2.8) {
      this.exitHide(true);
      this.w.hurtPlayer(12, spot.x, spot.y - 10);
    }
  }

  /* ---------------- interakcje ---------------- */

  interact() {
    if (this.hidden) {
      this.exitHide();
      return true;
    }
    if (this.alarm) {
      const d = Math.hypot(this.alarm.x - this.w.px(), this.alarm.y - this.w.py());
      if (d < 26) {
        this.alarm = null;
        this.events = this.events.filter((e) => e.kind !== "alarm");
        this.w.sound().powerDown();
        this.tell("ALARM WYŁĄCZONY", "Syrena milknie. Zostaje tylko echo.", "good");
        return true;
      }
    }
    for (const ev of this.events) {
      if (ev.kind === "barricade" && ev.door) {
        const d = Math.hypot((ev.door.x + 0.5) * TILE - this.w.px(), (ev.door.y + 0.5) * TILE - this.w.py());
        if (d < 26) {
          ev.hp = 8;
          const door = this.w.doorAt(ev.door.x, ev.door.y);
          if (door) door.hp = 8;
          this.w.sound().bang();
          this.w.popup((ev.door.x + 0.5) * TILE, ev.door.y * TILE - 4, "PODPARTE", "#edc16e");
          this.tell("BARYKADA", "Dokładasz desek. Na chwilę wystarczy.", "good");
          return true;
        }
      }
      if (ev.kind === "camp") {
        const alive = ev.civs.map((id) => this.civ(id)).filter((c): c is Civ => !!c && c.state !== "dead" && c.state !== "gone");
        const near = alive.find((c) => Math.hypot(c.x - this.w.px(), c.y - this.w.py()) < 34);
        if (near) {
          this.campTalk(ev);
          return true;
        }
      }
    }
    return false;
  }

  prompt() {
    if (this.hidden) return "E  wyjdź z szafy";
    if (this.alarm && Math.hypot(this.alarm.x - this.w.px(), this.alarm.y - this.w.py()) < 26) return "E  wyłącz alarm";
    for (const ev of this.events) {
      if (ev.kind === "barricade" && ev.door) {
        const d = Math.hypot((ev.door.x + 0.5) * TILE - this.w.px(), (ev.door.y + 0.5) * TILE - this.w.py());
        if (d < 26) return "E  podeprzyj drzwi";
      }
      if (ev.kind === "camp") {
        const near = ev.civs
          .map((id) => this.civ(id))
          .find((c) => c && c.state !== "dead" && c.state !== "gone" && Math.hypot(c.x - this.w.px(), c.y - this.w.py()) < 34);
        if (near) return "E  porozmawiaj przy ognisku";
      }
    }
    if (this.nearHideSpot()) return "E  schowaj się w szafie";
    return "";
  }

  private openChoice(speaker: string, text: string, options: ChoiceOption[]) {
    this.choice = { speaker, text, options };
    this.w.sound().whisper();
  }

  private closeChoice() {
    this.choice = null;
  }

  choose(index: number) {
    const opt = this.choice?.options[index];
    if (!opt || !opt.enabled) return;
    opt.run();
  }

  /* ---------------- zdarzenia w czasie ---------------- */

  private updateEvent(ev: LiveEvent, dt: number) {
    ev.t += dt;
    switch (ev.kind) {
      case "blackout":
        if (this.blackoutT <= 0) this.drop(ev);
        break;
      case "alarm": {
        if (!this.alarm) {
          this.drop(ev);
          break;
        }
        this.alarm.t += dt;
        ev.beep = (ev.beep ?? 0) - dt;
        if ((ev.beep ?? 0) <= 0) {
          ev.beep = 2.6;
          this.w.sound().alarm();
          this.w.alertZombies(this.alarm.x, this.alarm.y, 13 * TILE);
          this.w.particles(this.alarm.x, this.alarm.y, "#e05048", 6, 40, true);
          if (this.reinforceLeft > 0 && this.rand() < 0.5) {
            const spot = this.darkSpawn(10);
            if (spot) {
              this.w.addZombie(spot.x, spot.y, "shambler");
              this.reinforceLeft--;
            }
          }
        }
        if (this.alarm.t > 75) {
          this.alarm = null;
          this.tell("ALARM", "Syrena wygasła. Cisza wróciła na korytarz.", "info");
          this.drop(ev);
        }
        break;
      }
      case "knock": {
        if (!ev.door) {
          this.drop(ev);
          break;
        }
        const door = this.w.doorAt(ev.door.x, ev.door.y);
        if (!door) {
          this.drop(ev);
          break;
        }
        if (door.open || door.broken) {
          this.resolveKnock(ev);
          break;
        }
        ev.beep = (ev.beep ?? 0) - dt;
        if ((ev.beep ?? 0) <= 0 && Math.hypot(ev.door.x * TILE - this.w.px(), ev.door.y * TILE - this.w.py()) < 12 * TILE) {
          ev.beep = 2.2 + this.rand();
          this.w.sound().knock();
          this.w.particles((ev.door.x + 0.5) * TILE, (ev.door.y + 0.5) * TILE, "#8a6240", 3, 26);
        }
        if (ev.t > 90) this.drop(ev);
        break;
      }
      case "barricade": {
        if (!ev.door) {
          this.drop(ev);
          break;
        }
        const door = this.w.doorAt(ev.door.x, ev.door.y);
        if (!door || door.broken || door.open) {
          this.tell("BARYKADA", "Drzwi puściły. Wchodzą.", "danger");
          this.drop(ev);
          break;
        }
        const pressure = ev.zombies.filter((id) => {
          const z = this.w.zombieList().find((q) => q.id === id);
          return z && !z.dead && Math.hypot(z.x - (ev.door!.x + 0.5) * TILE, z.y - (ev.door!.y + 0.5) * TILE) < 30;
        }).length;
        if (pressure > 0) {
          ev.hp = (ev.hp ?? 6) - dt * 0.45 * pressure;
          door.hp = Math.max(1, Math.round(ev.hp ?? 1));
          if (this.rand() < dt * 1.6) {
            this.w.sound().bang();
            this.w.quake(1.2);
            this.w.particles((ev.door.x + 0.5) * TILE, (ev.door.y + 0.5) * TILE, "#8a6240", 3, 34);
          }
          if ((ev.hp ?? 0) <= 0) {
            door.broken = true;
            door.open = true;
            door.barricaded = false;
            this.w.openDoor(ev.door.x, ev.door.y);
            this.w.quake(4);
          }
        }
        if (ev.t > 100) this.drop(ev);
        break;
      }
      case "runners": {
        const chasers = ev.zombies.filter((id) => this.w.zombieList().some((z) => z.id === id && !z.dead));
        const alive = ev.civs.map((id) => this.civ(id)).filter((c): c is Civ => !!c && c.state !== "dead" && c.state !== "gone");
        if (!ev.resolved && !chasers.length && alive.length) {
          ev.resolved = true;
          for (const civ of alive) {
            civ.state = "leave";
            civ.path = [];
            civ.pathT = 0;
          }
          this.tell("URATOWANI", "Ocalali łapią oddech. Ktoś chce ci coś dać.", "good");
        }
        if (!alive.length || ev.t > 120) this.drop(ev);
        break;
      }
      case "escort": {
        const civ = this.civ(ev.civs[0]);
        if (!civ || civ.state === "dead" || civ.state === "gone") {
          if (civ?.state === "dead" && !ev.resolved) this.tell("ESKORTA", "Nie udało się. Został na korytarzu.", "danger");
          this.escortId = -1;
          this.drop(ev);
          break;
        }
        const goal = this.w.goal();
        if (goal && !ev.resolved) {
          const d = Math.hypot(civ.x - (goal.x + 0.5) * TILE, civ.y - (goal.y + 0.5) * TILE);
          if (d < 30) {
            ev.resolved = true;
            civ.state = "leave";
            this.w.give("ammo", 14);
            this.w.popup(civ.x, civ.y - 14, "+14 NABOI", "#edc16e");
            this.w.sound().thanks();
            this.tell("ESKORTA", "Dotarł na klatkę. Zostawia ci garść naboi.", "good");
            this.escortId = -1;
          }
        }
        if (ev.t > 220) this.drop(ev);
        break;
      }
      case "camp": {
        const alive = ev.civs.map((id) => this.civ(id)).filter((c): c is Civ => !!c && c.state !== "dead");
        if (!alive.length) {
          this.camp = null;
          this.drop(ev);
        }
        break;
      }
    }
  }

  private resolveKnock(ev: LiveEvent) {
    if (!ev.door || ev.resolved) {
      this.drop(ev);
      return;
    }
    ev.resolved = true;
    const x = (ev.door.x + 0.5) * TILE;
    const y = (ev.door.y + 0.5) * TILE;
    const roll = this.rand();
    if (roll < 0.42) {
      this.w.addZombie(x, y + 12, this.rand() < 0.4 ? "runner" : "shambler");
      this.w.alertZombies(x, y, 6 * TILE);
      this.tell("ZA DRZWIAMI", "To nie był człowiek.", "danger");
    } else if (roll < 0.74) {
      const civ = this.addCiv(x, y + 14, "flee", ev.id);
      civ.faction = "friendly";
      civ.state = "leave";
      civ.goalX = this.w.px();
      civ.goalY = this.w.py();
      civ.thanked = true;
      ev.civs.push(civ.id);
      this.w.give(this.rand() < 0.5 ? "ammo" : "battery", 10);
      this.w.popup(x, y - 6, "OCALAŁY: +ZAPASY", "#9fbe85");
      this.w.sound().thanks();
      this.tell("ZA DRZWIAMI", "Ocalały wypada ze środka, rzuca ci zapasy i biegnie.", "good");
    } else {
      this.w.particles(x, y, "#8c8174", 8, 34);
      this.tell("ZA DRZWIAMI", "Pusto. Kołatał przeciąg.", "info");
    }
    this.drop(ev);
  }

  private drop(ev: LiveEvent) {
    this.events = this.events.filter((e) => e !== ev);
  }

  /* ---------------- cywile ---------------- */

  civ(id: number) {
    return this.civs.find((c) => c.id === id) ?? null;
  }

  civilians() {
    return this.civs;
  }

  nearestCivTo(x: number, y: number, radius: number, hostileOnly = false) {
    let best: Civ | null = null;
    let bestD = radius;
    for (const c of this.civs) {
      if (c.state === "dead" || c.state === "gone") continue;
      if (hostileOnly && c.faction !== "hostile") continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** Trafienie cywila przez gracza — zwykłe zasady obrażeń. */
  hurtCiv(civ: Civ, dmg: number, dx: number, dy: number) {
    if (civ.state === "dead" || civ.state === "gone") return;
    civ.hp -= dmg;
    civ.hurtFlash = 0.12;
    if (civ.id === this.escortId && this.escortWarn <= 0) {
      this.escortWarn = 6;
      this.w.sound().thanks();
      this.tell("ESKORTA", "Ocalały krzyczy — coś go dopadło!", "danger");
    }
    const len = Math.hypot(dx, dy) || 1;
    const pushed = this.w.move(civ.x, civ.y, 4, (dx / len) * 5, (dy / len) * 5);
    civ.x = pushed.x;
    civ.y = pushed.y;
    this.w.particles(civ.x, civ.y, "#c43830", 6, 55);
    if (civ.hp <= 0) {
      civ.hp = 0;
      civ.state = "dead";
      civ.fade = 1;
      this.w.particles(civ.x, civ.y, "#8a2828", 12, 70);
      if (this.escortId === civ.id) this.escortId = -1;
      return;
    }
    if (civ.faction !== "hostile") {
      const ev = this.events.find((e) => e.id === civ.eventId);
      for (const mate of this.civs) if (mate.eventId === civ.eventId) mate.faction = "hostile";
      if (ev?.kind === "camp") this.tell("OBOZOWISKO WROGIE", "Strzelałeś do nich. Teraz odpowiadają ogniem.", "danger");
      civ.faction = "hostile";
    }
  }

  private civShoot(civ: Civ, tx: number, ty: number) {
    const ang = Math.atan2(ty - civ.y, tx - civ.x) + (this.rand() - 0.5) * 0.14;
    this.w.shootBullet(civ.x + Math.cos(ang) * 8, civ.y + Math.sin(ang) * 8, ang, 250, 11);
    this.w.sound().gun();
    this.w.particles(civ.x + Math.cos(ang) * 10, civ.y + Math.sin(ang) * 10, "#edc16e", 3, 40, true);
  }

  private stepCiv(civ: Civ, tx: number, ty: number, dt: number, speed: number) {
    const dx = tx - civ.x;
    const dy = ty - civ.y;
    const len = Math.hypot(dx, dy) || 1;
    const n = this.w.move(civ.x, civ.y, 4, (dx / len) * speed * dt, (dy / len) * speed * dt);
    if (Math.hypot(n.x - civ.x, n.y - civ.y) < 0.2) civ.pathT = 0;
    civ.x = n.x;
    civ.y = n.y;
    civ.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    civ.animT += dt * 9;
  }

  private followPath(civ: Civ, dt: number, speed: number) {
    civ.pathT -= dt;
    if (civ.pathT <= 0) {
      civ.pathT = 0.5;
      civ.path = this.path(civ, { x: civ.goalX, y: civ.goalY });
    }
    if (civ.path.length) {
      const n = civ.path[0];
      const tx = (n.x + 0.5) * TILE;
      const ty = (n.y + 0.5) * TILE;
      this.stepCiv(civ, tx, ty, dt, speed);
      if (Math.hypot(civ.x - tx, civ.y - ty) < 6) civ.path.shift();
      return false;
    }
    this.stepCiv(civ, civ.goalX, civ.goalY, dt, speed);
    return Math.hypot(civ.x - civ.goalX, civ.y - civ.goalY) < 12;
  }

  private updateCivs(dt: number) {
    const zombies = this.w.zombieList().filter((z) => !z.dead);
    for (const civ of this.civs) {
      civ.hurtFlash = Math.max(0, civ.hurtFlash - dt);
      if (civ.state === "dead") {
        civ.fade = Math.max(0.45, civ.fade - dt * 0.2);
        continue;
      }
      if (civ.state === "gone") continue;
      civ.animT += dt;
      civ.attackCd -= dt;

      const engage = civ.role === "camp" ? 6.5 * TILE : 8 * TILE;
      const nearZombie = zombies
        .map((z) => ({ z, d: Math.hypot(z.x - civ.x, z.y - civ.y) }))
        .filter((o) => o.d < engage)
        .sort((a, b) => a.d - b.d)[0];
      const playerDist = Math.hypot(this.w.px() - civ.x, this.w.py() - civ.y);
      const playerThreat = civ.faction === "hostile" && playerDist < 12 * TILE;

      // Reakcja na zombie niezależnie od nastawienia do gracza.
      if (nearZombie && civ.state !== "leave" && civ.state !== "run") {
        const fight = civ.armed || nearZombie.d < 30 || civ.faction === "hostile";
        if (fight) civ.state = "fight";
        civ.calm = 3;
      }

      if (civ.state === "fight") {
        civ.calm -= dt;
        const anchorX = civ.role === "camp" ? civ.seatX : civ.role === "escort" ? this.w.px() : civ.x;
        const anchorY = civ.role === "camp" ? civ.seatY : civ.role === "escort" ? this.w.py() : civ.y;
        const leash = civ.role === "camp" ? 7 * TILE : 10 * TILE;
        const inLeash = nearZombie && Math.hypot(nearZombie.z.x - anchorX, nearZombie.z.y - anchorY) < leash;
        const targetZ = inLeash && (!playerThreat || nearZombie!.d < playerDist) ? nearZombie : null;
        if (targetZ) {
          civ.dir = targetZ.z.x > civ.x ? "right" : "left";
          if (civ.armed) {
            if (civ.attackCd <= 0 && this.w.los(civ.x, civ.y, targetZ.z.x, targetZ.z.y)) {
              civ.attackCd = 1.15;
              this.civShoot(civ, targetZ.z.x, targetZ.z.y);
            }
            if (targetZ.d < 26) this.stepCiv(civ, civ.x * 2 - targetZ.z.x, civ.y * 2 - targetZ.z.y, dt, 46);
          } else if (targetZ.d < 26 || civ.faction === "hostile") {
            this.stepCiv(civ, targetZ.z.x, targetZ.z.y, dt, 62);
            if (targetZ.d < 16 && civ.attackCd <= 0) {
              civ.attackCd = 0.8;
              this.w.hurtZombie(targetZ.z.id, 16, targetZ.z.x - civ.x, targetZ.z.y - civ.y);
            }
          } else {
            // bez broni wycofują się do gracza zamiast szarżować na zombie
            civ.goalX = this.w.px();
            civ.goalY = this.w.py();
            this.followPath(civ, dt, 92);
          }
        } else if (playerThreat) {
          civ.dir = this.w.px() > civ.x ? "right" : "left";
          if (civ.armed) {
            if (civ.attackCd <= 0 && this.w.los(civ.x, civ.y, this.w.px(), this.w.py())) {
              civ.attackCd = 1.05;
              this.civShoot(civ, this.w.px(), this.w.py());
            }
            if (playerDist < 60) this.stepCiv(civ, civ.x * 2 - this.w.px(), civ.y * 2 - this.w.py(), dt, 44);
          } else {
            this.stepCiv(civ, this.w.px(), this.w.py(), dt, 66);
            if (playerDist < 15 && civ.attackCd <= 0) {
              civ.attackCd = 0.85;
              this.w.hurtPlayer(9, civ.x, civ.y);
            }
          }
        } else if (civ.calm <= 0) {
          if (civ.role === "camp") {
            civ.state = "sit";
            civ.goalX = civ.seatX;
            civ.goalY = civ.seatY;
            civ.path = [];
          } else if (civ.role === "escort") civ.state = "follow";
          else civ.state = "run";
        }
        continue;
      }

      switch (civ.state) {
        case "run": {
          const done = this.followPath(civ, dt, 96);
          if (done) {
            civ.state = "leave";
            civ.path = [];
          }
          break;
        }
        case "sit": {
          if (Math.hypot(civ.x - civ.seatX, civ.y - civ.seatY) > 8) {
            civ.goalX = civ.seatX;
            civ.goalY = civ.seatY;
            this.followPath(civ, dt, 52);
          } else civ.dir = civ.seatX < (this.camp?.x ?? civ.seatX) ? "right" : "left";
          break;
        }
        case "follow": {
          if (playerDist > 26) {
            civ.goalX = this.w.px();
            civ.goalY = this.w.py();
            this.followPath(civ, dt, playerDist > 120 ? 112 : 84);
          } else civ.dir = this.w.px() > civ.x ? "right" : "left";
          break;
        }
        case "leave": {
          if (!civ.thanked && playerDist < 60) {
            civ.thanked = true;
            this.w.give(this.rand() < 0.5 ? "ammo" : "battery", 10);
            this.w.popup(civ.x, civ.y - 14, "DZIĘKI! +ZAPASY", "#9fbe85");
            this.w.sound().thanks();
          }
          civ.fade -= dt * 0.28;
          const goal = this.w.goal();
          civ.goalX = goal ? (goal.x + 0.5) * TILE : civ.goalX;
          civ.goalY = goal ? (goal.y + 0.5) * TILE : civ.goalY;
          this.followPath(civ, dt, 92);
          if (civ.fade <= 0) civ.state = "gone";
          break;
        }
      }
    }
    this.civs = this.civs.filter((c) => c.state !== "gone");
  }

  /* ---------------- rysowanie ---------------- */

  drawProps(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number) {
    if (this.camp) {
      const x = Math.round(this.camp.x - camX);
      const y = Math.round(this.camp.y - camY);
      ctx.fillStyle = "#3a2a1c";
      ctx.fillRect(x - 7, y + 2, 14, 3);
      ctx.fillStyle = "#5c3f28";
      ctx.fillRect(x - 5, y, 10, 3);
      for (let i = 0; i < 5; i++) {
        const f = Math.sin(time * 9 + i * 1.7);
        const h = 5 + Math.round(Math.abs(f) * 5);
        ctx.fillStyle = i % 2 ? "#edc16e" : "#e0762e";
        ctx.fillRect(x - 4 + i * 2, y - h, 2, h);
      }
      ctx.fillStyle = "#fff0b8";
      ctx.fillRect(x - 1, y - 3, 2, 3);
    }
    if (this.alarm) {
      const x = Math.round(this.alarm.x - camX);
      const y = Math.round(this.alarm.y - camY);
      ctx.fillStyle = "#2a3038";
      ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.fillStyle = "#6a7078";
      ctx.fillRect(x - 3, y - 3, 6, 6);
      if (Math.sin(time * 9) > 0) {
        ctx.fillStyle = "#ff4038";
        ctx.fillRect(x - 1, y - 1, 3, 3);
      }
    }
  }

  drawCiv(ctx: CanvasRenderingContext2D, civ: Civ, camX: number, camY: number) {
    {
      const sitting = civ.state === "sit";
      const frames = sitting ? this.art.npcCrouch : this.art.npcRun[civ.variant % 2];
      const spr = sitting ? frames[civ.variant % 2] : frames[Math.floor(civ.animT) % 2];
      const flip = civ.dir === "left";
      const sx = Math.round(civ.x - camX - spr.width / 2);
      const sy = Math.round(civ.y - camY - spr.height / 2 - (sitting ? 0 : 2));
      ctx.save();
      ctx.globalAlpha = civ.state === "dead" ? 0.85 : Math.max(0, Math.min(1, civ.fade));
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      ctx.fillRect(sx + 4, sy + spr.height - 3, 9, 2);
      if (civ.state === "dead") {
        ctx.translate(sx + spr.width / 2, sy + spr.height - 3);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(spr, -spr.width / 2, -spr.height + 3);
      } else {
        if (flip) {
          ctx.translate(sx + spr.width, sy);
          ctx.scale(-1, 1);
          ctx.drawImage(spr, 0, 0);
        } else ctx.drawImage(spr, sx, sy);
      }
      ctx.restore();
      if (civ.state === "dead") return;
      const hx = Math.round(civ.x - camX);
      const hy = Math.round(civ.y - camY);
      if (civ.armed) {
        ctx.fillStyle = "#2a2c30";
        ctx.fillRect(hx + (civ.dir === "left" ? -9 : 6), hy - 2, 4, 2);
      }
      if (civ.hurtFlash > 0) {
        ctx.fillStyle = "rgba(255,220,220,0.5)";
        ctx.fillRect(sx + 2, sy + 2, spr.width - 4, spr.height - 4);
      }
      if (civ.hp < civ.maxHp) {
        ctx.fillStyle = "#100e0c";
        ctx.fillRect(hx - 7, sy - 4, 14, 2);
        ctx.fillStyle = civ.faction === "hostile" ? "#c43830" : "#9fbe85";
        ctx.fillRect(hx - 7, sy - 4, Math.max(1, Math.round(14 * (civ.hp / civ.maxHp))), 2);
      }
      if (civ.faction === "hostile") {
        ctx.fillStyle = "#e05048";
        ctx.fillRect(hx - 1, sy - 9, 2, 4);
      } else if (civ.state === "sit" || civ.state === "follow") {
        ctx.fillStyle = "rgba(232,224,112,0.85)";
        ctx.fillRect(hx - 3, sy - 8, 2, 2);
        ctx.fillRect(hx + 1, sy - 8, 2, 2);
      }
    }
  }

  /** Wnętrze szafy: ciemna ramka i szczeble, środek zostaje widoczny. */
  drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
    if (!this.hidden) return;
    const slit = 78 + Math.sin(time * 1.4) * 4;
    const top = Math.round(h / 2 - slit / 2);
    const bottom = Math.round(h / 2 + slit / 2);
    ctx.save();
    ctx.fillStyle = "rgba(6,7,10,0.95)";
    ctx.fillRect(0, 0, w, top);
    ctx.fillRect(0, bottom, w, h - bottom);
    ctx.fillStyle = "rgba(14,16,20,0.6)";
    for (let y = 0; y < top; y += 9) ctx.fillRect(0, y, w, 4);
    for (let y = bottom; y < h; y += 9) ctx.fillRect(0, y, w, 4);
    const upper = ctx.createLinearGradient(0, top - 16, 0, top);
    upper.addColorStop(0, "rgba(6,7,10,0)");
    upper.addColorStop(1, "rgba(6,7,10,0.92)");
    ctx.fillStyle = upper;
    ctx.fillRect(0, top - 16, w, 16);
    const lower = ctx.createLinearGradient(0, bottom, 0, bottom + 16);
    lower.addColorStop(0, "rgba(6,7,10,0.92)");
    lower.addColorStop(1, "rgba(6,7,10,0)");
    ctx.fillStyle = lower;
    ctx.fillRect(0, bottom, w, 16);
    const sides = ctx.createLinearGradient(0, 0, w, 0);
    sides.addColorStop(0, "rgba(6,7,10,0.9)");
    sides.addColorStop(0.2, "rgba(6,7,10,0)");
    sides.addColorStop(0.8, "rgba(6,7,10,0)");
    sides.addColorStop(1, "rgba(6,7,10,0.9)");
    ctx.fillStyle = sides;
    ctx.fillRect(0, top, w, slit);
    if (this.checkT > 0.2) {
      ctx.fillStyle = `rgba(196,56,48,${Math.min(0.4, this.checkT * 0.14)})`;
      ctx.fillRect(0, top, w, slit);
    }
    ctx.restore();
  }

  eventLights() {
    const out: { x: number; y: number; r: number; inner: string; mid: string }[] = [];
    if (this.camp) {
      const flick = 0.85 + 0.15 * Math.sin(performance.now() / 90);
      out.push({
        x: this.camp.x,
        y: this.camp.y,
        r: 78 * flick,
        inner: `rgba(255,178,86,${0.85 * flick})`,
        mid: `rgba(190,96,36,${0.32 * flick})`,
      });
    }
    if (this.alarm && Math.sin(performance.now() / 110) > 0) {
      out.push({ x: this.alarm.x, y: this.alarm.y, r: 44, inner: "rgba(226,72,60,0.6)", mid: "rgba(150,36,30,0.2)" });
    }
    return out;
  }
}
