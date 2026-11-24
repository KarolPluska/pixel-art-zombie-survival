import { FLOOR_META, MAP_H, MAP_W, NOTES, TILE, Tile } from "./palette";
import { makeRng } from "./rng";
import { hash2 } from "./rng";
import { DISCOVERIES } from "./inventory";
import { populateEnvironment, validateEnvironment } from "./environment-layout";
import { installVerticalQuests, installVerticalRoutes } from "./vertical-layout";
import { installTacticalContent } from "./tactical-layout";
import type {
  DecalSpawn,
  DoorInfo,
  FloorData,
  LightFixture,
  Prop,
  PropKind,
  Room,
  WallDecal,
  WindowInfo,
  ZombieKind,
} from "./types";

const W = MAP_W;
const H = MAP_H;
type Rng = ReturnType<typeof makeRng>;

const idx = (x: number, y: number) => y * W + x;
const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

type Zone =
  | "living"
  | "kitchen"
  | "bath"
  | "bedroom"
  | "corridor"
  | "stair"
  | "laundry"
  | "boiler"
  | "storage"
  | "office"
  | "nursery"
  | "workshop";

const ZONE_NAME: Record<Zone, string> = {
  living: "SALON",
  kitchen: "KUCHNIA",
  bath: "ŁAZIENKA",
  bedroom: "SYPIALNIA",
  corridor: "KORYTARZ",
  stair: "KLATKA SCHODOWA",
  laundry: "PRALNIA",
  boiler: "KOTŁOWNIA",
  storage: "SCHOWEK",
  office: "LOKAL UŻYTKOWY",
  nursery: "POKÓJ DZIECIĘCY",
  workshop: "WARSZTAT",
};

const PASSABLE = new Set<number>([Tile.Floor, Tile.Rubble, Tile.Puddle, Tile.StairsUp, Tile.StairsDown, Tile.Door, Tile.DoorOpen]);

function carveRect(tiles: Uint8Array, x: number, y: number, w: number, h: number, value: number) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (inb(xx, yy)) tiles[idx(xx, yy)] = value;
    }
  }
}

interface Build {
  tiles: Uint8Array;
  floorStyle: Uint8Array;
  wallStyle: Uint8Array;
  roomOf: Int16Array;
  rooms: Room[];
  roomZones: string[];
  roomWs: number[];
  zones: Zone[];
  doors: DoorInfo[];
  windows: WindowInfo[];
  props: Prop[];
  occ: Uint8Array;
  wallDecals: WallDecal[];
  breaches: { x: number; y: number }[];
  corpses: { x: number; y: number; kind: ZombieKind }[];
  survivors: FloorData["survivors"];
  decals: DecalSpawn[];
  lights: LightFixture[];
}

function newBuild(): Build {
  return {
    tiles: new Uint8Array(W * H),
    floorStyle: new Uint8Array(W * H),
    wallStyle: new Uint8Array(W * H),
    roomOf: new Int16Array(W * H).fill(-1),
    rooms: [],
    roomZones: [],
    roomWs: [],
    zones: [],
    doors: [],
    windows: [],
    props: [],
    occ: new Uint8Array(W * H),
    wallDecals: [],
    breaches: [],
    corpses: [],
    survivors: [],
    decals: [],
    lights: [],
  };
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function reserveAround(b: Build, x: number, y: number) {
  if (inb(x, y)) b.occ[idx(x, y)] = 1;
  for (const [dx, dy] of N4) if (inb(x + dx, y + dy)) b.occ[idx(x + dx, y + dy)] = 1;
}

function addBreach(b: Build, x: number, y: number, fs: number) {
  if (!inb(x, y)) return;
  if (b.breaches.some((br) => br.x === x && br.y === y)) return;
  b.tiles[idx(x, y)] = Tile.Rubble;
  b.floorStyle[idx(x, y)] = fs;
  reserveAround(b, x, y);
  b.breaches.push({ x, y });
}

function zoneStyles(zone: Zone, decay: number, service: boolean): { fs: number; ws: number } {
  if (zone === "bath" || zone === "laundry") return { fs: 1, ws: 1 };
  if (zone === "kitchen") return { fs: 2, ws: decay > 0.5 ? 5 : 0 };
  if (zone === "corridor") return { fs: service ? 3 : 2, ws: decay > 0.55 ? 5 : 2 };
  if (zone === "stair") return { fs: 3, ws: 3 };
  if (zone === "boiler" || zone === "workshop" || zone === "storage") return { fs: 3, ws: 3 };
  if (zone === "nursery") return { fs: 7, ws: 0 };
  if (decay >= 0.85) return { fs: 4, ws: 4 };
  if (decay >= 0.7) return { fs: 5, ws: 4 };
  if (decay >= 0.5) return { fs: 5, ws: 5 };
  return { fs: zone === "living" ? 7 : 0, ws: 0 };
}

function addRoom(
  b: Build,
  x: number,
  y: number,
  w: number,
  h: number,
  zone: Zone,
  role: Room["role"],
  decay: number,
  service: boolean,
  rng: Rng,
): Room {
  const { fs, ws } = zoneStyles(zone, decay, service);
  const r: Room = {
    id: b.rooms.length,
    x,
    y,
    w,
    h,
    role,
    lit: role === "stairs" ? true : rng.chance(0.86 - decay * 0.6),
    flicker: rng.chance(0.2 + decay * 0.55),
  };
  b.rooms.push(r);
  b.roomZones.push(ZONE_NAME[zone]);
  b.roomWs.push(ws);
  b.zones.push(zone);
  carveRect(b.tiles, x, y, w, h, Tile.Floor);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = idx(xx, yy);
      b.roomOf[i] = r.id;
      b.floorStyle[i] = fs;
    }
  }
  return r;
}

function addDoor(b: Build, x: number, y: number, locked: boolean, barricaded = false) {
  if (!inb(x, y)) return;
  const i = idx(x, y);
  if (b.tiles[i] === Tile.Window || b.tiles[i] === Tile.Sky) return;
  b.tiles[i] = Tile.Door;
  reserveAround(b, x, y);
  const existing = b.doors.find((d) => d.x === x && d.y === y);
  if (existing) {
    existing.locked = existing.locked || locked;
    existing.barricaded = existing.barricaded || barricaded;
    return;
  }
  b.doors.push({ x, y, locked, barricaded, hp: locked ? 8 : barricaded ? 5 : 4, open: false, broken: false });
}

function addWindow(b: Build, x: number, y: number, glow: WindowInfo["glow"]) {
  if (!inb(x, y) || b.tiles[idx(x, y)] !== Tile.Wall) return;
  b.tiles[idx(x, y)] = Tile.Window;
  b.windows.push({ x, y, glow });
}

function addProp(
  b: Build,
  kind: PropKind,
  x: number,
  y: number,
  w: number,
  h: number,
  solid: boolean,
  loot: Prop["loot"] = null,
  note?: string,
) {
  const p: Prop = { id: b.props.length, kind, x, y, w, h, solid, loot, note, opened: false };
  b.props.push(p);
  if (solid) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inb(xx, yy)) b.occ[idx(xx, yy)] = 1;
  return p;
}

function canPlace(b: Build, room: Room, x: number, y: number, w: number, h: number) {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < room.x || yy < room.y || xx >= room.x + room.w || yy >= room.y + room.h) return false;
      if (xx === cx && yy === cy) return false;
      if (b.tiles[idx(xx, yy)] !== Tile.Floor) return false;
      if (b.occ[idx(xx, yy)]) return false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = b.tiles[idx(xx + dx, yy + dy)];
          if (t === Tile.Door || t === Tile.StairsUp || t === Tile.StairsDown) return false;
        }
      }
    }
  }
  return true;
}

type Spec = { kind: PropKind; w: number; h: number };

const FURNITURE: Record<Zone, Spec[]> = {
  living: [
    { kind: "sofa", w: 2, h: 1 },
    { kind: "tv", w: 1, h: 1 },
    { kind: "table", w: 1, h: 1 },
    { kind: "bookshelf", w: 1, h: 1 },
    { kind: "plant", w: 1, h: 1 },
    { kind: "radiator", w: 1, h: 1 },
  ],
  kitchen: [
    { kind: "fridge", w: 1, h: 1 },
    { kind: "stove", w: 1, h: 1 },
    { kind: "sink", w: 1, h: 1 },
    { kind: "counter", w: 2, h: 1 },
    { kind: "table", w: 1, h: 1 },
    { kind: "trash", w: 1, h: 1 },
  ],
  bath: [
    { kind: "toilet", w: 1, h: 1 },
    { kind: "sink", w: 1, h: 1 },
    { kind: "medbox", w: 1, h: 1 },
    { kind: "bathtub", w: 2, h: 1 },
    { kind: "shower", w: 1, h: 1 },
    { kind: "washer", w: 1, h: 1 },
  ],
  bedroom: [
    { kind: "bed", w: 2, h: 1 },
    { kind: "wardrobe", w: 1, h: 1 },
    { kind: "bookshelf", w: 1, h: 1 },
    { kind: "chair", w: 1, h: 1 },
    { kind: "radiator", w: 1, h: 1 },
  ],
  nursery: [
    { kind: "bed", w: 2, h: 1 },
    { kind: "bookshelf", w: 1, h: 1 },
    { kind: "toy", w: 1, h: 1 },
    { kind: "chair", w: 1, h: 1 },
  ],
  laundry: [
    { kind: "washer", w: 1, h: 1 },
    { kind: "washer", w: 1, h: 1 },
    { kind: "sink", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "medbox", w: 1, h: 1 },
  ],
  boiler: [
    { kind: "pipes", w: 2, h: 1 },
    { kind: "barrel", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "extinguisher", w: 1, h: 1 },
    { kind: "crate", w: 1, h: 1 },
  ],
  storage: [
    { kind: "supplycase", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "crate", w: 1, h: 1 },
    { kind: "barrel", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "bike", w: 2, h: 1 },
  ],
  office: [
    { kind: "desk", w: 2, h: 1 },
    { kind: "chair", w: 1, h: 1 },
    { kind: "board", w: 2, h: 1 },
    { kind: "bookshelf", w: 1, h: 1 },
    { kind: "plant", w: 1, h: 1 },
  ],
  workshop: [
    { kind: "pipes", w: 2, h: 1 },
    { kind: "table", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "crate", w: 1, h: 1 },
  ],
  corridor: [],
  stair: [],
};

function placeAnchored(b: Build, r: Room, spec: Spec, ax: number, ay: number, wall = true) {
  const tx = r.x + (r.w - spec.w) * ax;
  const ty = r.y + (r.h - spec.h) * ay;
  let best: { x: number; y: number; cost: number } | undefined;
  for (let y = r.y; y <= r.y + r.h - spec.h; y++) {
    for (let x = r.x; x <= r.x + r.w - spec.w; x++) {
      const edge = x === r.x || y === r.y || x + spec.w === r.x + r.w || y + spec.h === r.y + r.h;
      if (wall && !edge) continue;
      if (!canPlace(b, r, x, y, spec.w, spec.h)) continue;
      const cost = (tx - x) ** 2 + (ty - y) ** 2;
      if (!best || cost < best.cost) best = { x, y, cost };
    }
  }
  return best ? addProp(b, spec.kind, best.x, best.y, spec.w, spec.h, true) : undefined;
}

const ANCHORS: Partial<Record<PropKind, [number, number]>> = {
  bed: [0, 0], wardrobe: [1, 0], bookshelf: [1, 0.8], radiator: [0.6, 0],
  sofa: [0.5, 0], tv: [0.5, 1], table: [0.55, 0.4], chair: [0.55, 0.6], plant: [1, 1],
  fridge: [0, 0], stove: [0.28, 0], counter: [0.6, 0], sink: [1, 0],
  bathtub: [0, 1], toilet: [0, 0], medbox: [1, 0.3], shower: [1, 1],
  crate: [0, 0.3], supplycase: [0, 0], barrel: [1, 1], locker: [0.4, 0],
  desk: [0.35, 0], board: [0.8, 0], pipes: [0.5, 0], washer: [0, 0],
};

function furnishRoom(b: Build, room: Room, zone: Zone, decay: number) {
  const specs = FURNITURE[zone];
  if (!specs.length) return;
  const mirror = room.id % 2 !== 0;
  const budget = Math.min(specs.length, Math.max(3, Math.floor(room.w * room.h / 7)) - (decay > 0.8 ? 1 : 0));
  let placed = 0;
  for (const spec of specs) {
    if (placed >= budget) break;
    const [ax, ay] = ANCHORS[spec.kind] ?? [0, 1];
    const loose = spec.kind === "chair" || spec.kind === "table" || spec.kind === "toy";
    if (placeAnchored(b, room, spec, mirror ? 1 - ax : ax, ay, !loose)) placed++;
  }
  if ((zone === "living" || zone === "bedroom") && room.w >= 5 && room.h >= 5) {
    addProp(b, "carpet", room.x + Math.floor(room.w / 2) - 1, room.y + Math.floor(room.h / 2), 2, 2, false);
  }
}

function stockFloor(b: Build, index: number, locked: boolean, start: Room) {
  const zoneOf = (p: Prop) => b.zones[b.roomOf[idx(p.x, p.y)]];
  const usedRooms = new Set<number>();
  const distribute = (loot: Prop["loot"], kinds: PropKind[], zones: Zone[], count: number, label: string) => {
    const pool = b.props.filter(p => !p.loot && kinds.includes(p.kind) && zones.includes(zoneOf(p)));
    for (let n = 0; n < count; n++) {
      const targetY = H * (n + 0.5) / count;
      const host = pool.filter(p => !p.loot && !usedRooms.has(b.roomOf[idx(p.x, p.y)]))
        .sort((a, c) => Math.abs(a.y - targetY) - Math.abs(c.y - targetY) || a.id - c.id)[0];
      if (!host) continue;
      host.loot = loot;
      host.label = label;
      if (loot === "note") host.note = NOTES[(index + n) % NOTES.length];
      usedRooms.add(b.roomOf[idx(host.x, host.y)]);
    }
  };

  const weapon = DISCOVERIES[index];
  if (weapon) {
    let host: Prop | undefined;
    if (index < 2) {
      host = placeAnchored(b, start, { kind: index === 0 ? "locker" : "desk", w: index === 0 ? 1 : 2, h: 1 }, 1, 0.5);
    } else {
      host = b.props.filter(p => p.kind === "wardrobe" && zoneOf(p) === "bedroom")
        .sort((a, c) => c.y - a.y || a.x - c.x)[0];
    }
    if (!host) return false;
    host.loot = weapon;
    host.label = index === 0 ? "Szafka warsztatowa" : index === 1 ? "Biurko dozorcy" : index === 4 ? "Szafa myśliwego" : "Szafa sportowca";
  }
  if (locked) {
    const hall = b.rooms.filter(r => b.zones[r.id] === "corridor")[1];
    const host = placeAnchored(b, hall, { kind: "locker", w: 1, h: 1 }, 0.5, 0);
    if (!host) return false;
    host.loot = "key";
    host.label = "Szafka na klucze";
  }
  distribute("med", ["medbox"], ["bath", "laundry"], 3, "Apteczka ścienna");
  distribute("ammo", ["supplycase", "crate"], ["storage", "workshop"], 3, "Kaseta z nabojami");
  distribute("battery", ["locker", "counter"], ["boiler", "workshop", "kitchen"], 3, "Szuflada z bateriami");
  if (index >= 4) distribute("shells", ["wardrobe", "locker"], ["bedroom", "storage"], 2, "Zapas śrutu");
  if (index >= 6) distribute("bolts", ["wardrobe", "crate"], ["bedroom", "storage"], 2, "Futerał na bełty");
  distribute("note", ["desk", "bookshelf"], ["living", "bedroom", "office"], 3, "Notatki mieszkańca");
  return true;
}

function rngChance(x: number, y: number, n: number) {
  const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Styl ściany zależy od pomieszczenia, do którego ściana jest zwrócona (frontem na południe). */
function paintWallBorders(b: Build, decay: number, service: boolean) {
  const defaultWs = service ? 3 : decay > 0.6 ? 5 : decay > 0.35 ? 0 : 2;
  const order = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (b.tiles[i] !== Tile.Wall) continue;
      let ws = -1;
      let nearFloor = false;
      for (const [dx, dy] of order) {
        if (!inb(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        const t = b.tiles[j];
        if (!PASSABLE.has(t)) continue;
        nearFloor = true;
        const rid = b.roomOf[j];
        if (ws < 0) ws = rid >= 0 ? b.roomWs[rid] : defaultWs;
      }
      b.wallStyle[i] = ws >= 0 ? ws : defaultWs;
      if (!nearFloor) continue;
      // Wyposażenie techniczne trafia na ściany w odpowiednich strefach.
      const kinds: WallDecal["kind"][] =
        ws === 1
          ? ["pipe", "drip", "drip", "switch", "fuse", "crack", "mold", "number", "hole", "calendar"]
          : ws === 3
            ? ["pipe", "panel", "panel", "drip", "switch", "fuse", "crack", "mold", "number", "hole", "conduit", "ventgrate", "exitsign", "sconce", "caution", "emergencylamp", "camera"]
            : ws === 4
              ? ["scorch", "graffiti", "crack", "extinguisher", "hole", "hole", "panel", "caution", "emergencylamp"]
              : ws === 5
                ? ["mold", "crack", "graffiti", "scorch", "poster", "hole", "hole", "drip", "reel", "missingposter", "emergencylamp"]
                : ["poster", "number", "switch", "crack", "clock", "graffiti", "elevator", "mirror", "hole", "reel", "intercom", "thermostat", "shelfbracket", "conduit", "exitsign", "sconce", "familyphoto", "calendar", "missingposter", "camera"];
      if (rngChance(x, y, 0.1) < 0.19) b.wallDecals.push({ x, y, kind: kinds[Math.floor(rngChance(x, y, 99) * kinds.length)] });
    }
  }
}

function makeLight(x: number, y: number, kind: LightFixture["kind"], flicker: boolean, roomId: number, radius: number): LightFixture {
  return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, kind, flicker, roomId, radius: radius * TILE };
}

function buildLights(b: Build, rng: Rng, decay: number, corridors: number[]) {
  for (const r of b.rooms) {
    if (b.roomZones[r.id] === "KORYTARZ" && r.h === 1) continue;
    const c = { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
    if (r.role === "stairs") b.lights.push(makeLight(c.x, c.y, "emergency", true, r.id, 5.2));
    else if (r.lit) {
      const warm = b.roomZones[r.id] === "SALON" || b.roomZones[r.id] === "SYPIALNIA";
      b.lights.push(makeLight(c.x, c.y, warm && rng.chance(0.4) ? "sodium" : "fluor", r.flicker, r.id, warm ? 5.6 : 6.2));
    } else if (rng.chance(0.28 - decay * 0.12)) {
      b.lights.push(makeLight(c.x, c.y, "emergency", true, r.id, 3.2));
    }
  }
  for (const cy of corridors) {
    for (let x = 8; x < W - 8; x += 7) {
      b.lights.push(makeLight(x, cy + 1, "fluor", rng.chance(0.2 + decay * 0.5), 0, 5.4));
    }
  }
}

function addSurfaceDetails(b: Build, rng: Rng, index: number, decay: number) {
  const details: Partial<Record<PropKind, DecalSpawn["kind"]>> = {
    desk: "paper", bookshelf: "book", board: "paper", plant: "leaf", toy: "toy", medbox: "pills", bed: "cloth", sofa: "cloth",
    washer: "stain", sink: "stain", pipes: "moss", locker: "cable", tv: "cable",
    crate: "footprint", bench: "footprint", stove: index === 7 ? "scorch" : "stain",
  };
  const decorated = new Set<number>();
  for (const p of b.props) {
    const kind = details[p.kind];
    if (!kind || !rng.chance(0.6)) continue;
    for (const [x, y] of [[p.x, p.y + p.h], [p.x + p.w, p.y], [p.x - 1, p.y], [p.x, p.y - 1]]) {
      const i = idx(x, y);
      if (!inb(x, y) || b.tiles[i] !== Tile.Floor || b.occ[i] || decorated.has(i)) continue;
      if (b.roomOf[i] !== b.roomOf[idx(p.x, p.y)]) continue;
      b.decals.push({ x, y, kind });
      decorated.add(i);
      break;
    }
  }
  const isStair = (i: number) => b.roomOf[i] >= 0 && b.roomZones[b.roomOf[i]] === "KLATKA SCHODOWA";
  const rubbleN = Math.round(decay * 55) + (index === 0 ? 12 : 0);
  for (let a = 0; a < rubbleN; a++) {
    const x = 2 + rng.int(W - 4);
    const y = 2 + rng.int(H - 4);
    const i = idx(x, y);
    if (b.tiles[i] !== Tile.Floor || b.occ[i] || isStair(i)) continue;
    b.tiles[i] = Tile.Rubble;
  }
  if (decay >= 0.55 || index === 0) {
    const n = 10 + Math.round(decay * 28);
    for (let a = 0; a < n; a++) {
      const x = 2 + rng.int(W - 4);
      const y = 2 + rng.int(H - 4);
      const i = idx(x, y);
      if (b.tiles[i] !== Tile.Floor || b.occ[i] || isStair(i)) continue;
      b.tiles[i] = Tile.Puddle;
    }
  }
  if (index === 7) {
    for (let a = 0; a < 40; a++) {
      const x = 2 + rng.int(W - 4);
      const y = 2 + rng.int(H - 4);
      const i = idx(x, y);
      if (b.tiles[i] === Tile.Floor) b.floorStyle[i] = 4;
    }
  }
}

/** Okna tylko w ścianach zewnętrznych: po drugiej stronie muru nie ma podłogi w zasięgu 3 kafli. */
function placeWindows(b: Build, rng: Rng, decay: number) {
  const glowChance = 0.46 - decay * 0.3;
  const blocked = new Set<number>(b.wallDecals.map((d) => idx(d.x, d.y)));
  for (const d of b.doors) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(d.x + dx, d.y + dy)) blocked.add(idx(d.x + dx, d.y + dy));
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (b.tiles[i] !== Tile.Wall || blocked.has(i)) continue;
      let dir: readonly [number, number] | null = null;
      let count = 0;
      for (const d of N4) {
        const t = b.tiles[idx(x + d[0], y + d[1])];
        if (PASSABLE.has(t)) {
          count++;
          dir = d;
        }
      }
      if (count !== 1 || !dir) continue;
      let exterior = true;
      for (let k = 1; k <= 3; k++) {
        const nx = x - dir[0] * k;
        const ny = y - dir[1] * k;
        if (!inb(nx, ny)) break;
        const t = b.tiles[idx(nx, ny)];
        if (PASSABLE.has(t) || t === Tile.Window) {
          exterior = false;
          break;
        }
      }
      if (!exterior) continue;
      if (rng.chance(0.11)) {
        const glow = rng.chance(glowChance) ? (rng.chance(0.22) ? "orange" : "fluor") : "none";
        addWindow(b, x, y, glow);
      }
    }
  }
}

/** Uszczelnienie: każdy pokój (poza korytarzami) musi mieć pełny obwód ścian / drzwi / wyłomów. */
function sealRooms(b: Build) {
  for (const r of b.rooms) {
    const zone = b.roomZones[r.id];
    if (zone === "KORYTARZ") continue;
    const strict = r.role === "stairs" || r.role === "start";
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const onBorder = x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h;
        if (!onBorder || !inb(x, y)) continue;
        const i = idx(x, y);
        const t = b.tiles[i];
        if (t !== Tile.Floor && t !== Tile.Puddle) continue;
        if (strict) {
          b.tiles[i] = Tile.Wall;
          b.roomOf[i] = -1;
        } else {
          addBreach(b, x, y, b.floorStyle[idx(r.x, r.y)]);
        }
      }
    }
  }
}

/* ============ WIEŻA: plany pięter ============ */

interface Shaft {
  x: number;
  c0: number;
  c1: number;
}
interface Blueprint {
  name: string;
  corridors: number[];
  shafts: Shaft[];
}

const MID = Math.floor(W / 2) - 1;

function blueprintFor(rng: Rng, index: number): Blueprint {
  const variants: Blueprint[] = [
    { name: "korytarz dwupasmowy", corridors: [16, 42, 68], shafts: [{ x: 4, c0: 0, c1: 2 }, { x: W - 6, c0: 0, c1: 2 }, { x: MID, c0: 1, c1: 2 }] },
    { name: "krzyż", corridors: [12, 38, 64], shafts: [{ x: 4, c0: 0, c1: 2 }, { x: W - 6, c0: 0, c1: 2 }, { x: MID, c0: 0, c1: 2 }] },
    { name: "eska", corridors: [18, 46, 72], shafts: [{ x: 4, c0: 0, c1: 2 }, { x: W - 6, c0: 0, c1: 1 }, { x: MID, c0: 1, c1: 2 }] },
    {
      name: "pierścień techniczny",
      corridors: [12, 30, 50, 70],
      shafts: [{ x: 4, c0: 0, c1: 3 }, { x: W - 6, c0: 0, c1: 3 }, { x: MID, c0: 1, c1: 2 }, { x: 16, c0: 2, c1: 3 }],
    },
  ];
  return variants[(index + rng.int(4)) % 4];
}

function serviceZones(rng: Rng): Zone[] {
  return rng.pick([
    ["boiler", "laundry", "storage", "workshop"],
    ["storage", "workshop", "laundry", "office"],
    ["laundry", "storage", "boiler", "storage"],
    ["office", "storage", "workshop", "boiler"],
  ] as Zone[][]);
}

function apartmentZones(rng: Rng, decay: number): Zone[] {
  const tpl: Zone[][] = [
    ["bedroom", "living", "kitchen", "bath"],
    ["bath", "living", "kitchen", "bedroom"],
    ["bedroom", "kitchen", "bath", "living"],
    ["nursery", "living", "bedroom", "kitchen"],
    ["living", "kitchen", "bath", "bedroom"],
    ["bedroom", "bath", "living", "kitchen"],
  ];
  const base = rng.pick(tpl).slice();
  if (decay > 0.6 && rng.chance(0.35)) base[2] = "storage";
  return base;
}

interface Band {
  y0: number;
  y1: number;
  upper: boolean;
  lower: boolean;
  segments: [number, number][];
}

function buildFloor(index: number, seed: number): FloorData | null {
  const meta = FLOOR_META[index];
  const rng = makeRng(seed);
  const decay = meta.decay;
  const service = index <= 1;
  const b = newBuild();
  const bp = blueprintFor(rng, index);
  const cys = bp.corridors;

  // Korytarze (podłoga x 4..W-5, pokój-korytarz 6..W-7)
  for (const cy of cys) {
    carveRect(b.tiles, 4, cy, W - 8, 3, Tile.Floor);
    for (let y = cy; y < cy + 3; y++) for (let x = 4; x < W - 4; x++) b.floorStyle[idx(x, y)] = service ? 3 : 2;
    const cr = addRoom(b, 6, cy, W - 12, 3, "corridor", "normal", decay, service, rng);
    cr.lit = true;
    cr.flicker = rng.chance(0.3 + decay * 0.4);
  }
  // Szyby łączą dokładnie wskazane korytarze (bez wystających ślepych odcinków)
  for (const sh of bp.shafts) {
    const y0 = cys[sh.c0];
    const y1 = cys[sh.c1] + 2;
    carveRect(b.tiles, sh.x, y0, 2, y1 - y0 + 1, Tile.Floor);
    for (let y = y0; y <= y1; y++) for (let x = sh.x; x < sh.x + 2; x++) b.floorStyle[idx(x, y)] = 3;
  }
  for (const sh of bp.shafts) {
    if (sh.c1 - sh.c0 >= 1 && rng.chance(0.7)) {
      const dy = cys[sh.c0] + 5 + rng.int(Math.max(1, cys[sh.c0 + 1] - cys[sh.c0] - 8));
      if (b.tiles[idx(sh.x, dy)] === Tile.Floor && b.tiles[idx(sh.x + 1, dy)] === Tile.Floor) {
        addDoor(b, sh.x, dy, false);
        addDoor(b, sh.x + 1, dy, false);
      }
    }
  }

  // Pasy między korytarzami; segmenty omijają szyby, ściany współdzielone (grubość 1)
  const bands: Band[] = [];
  const bandCount = cys.length + 1;
  for (let i = 0; i < bandCount; i++) {
    const y0 = i === 0 ? 3 : cys[i - 1] + 3;
    const y1 = i === cys.length ? H - 4 : cys[i] - 1;
    const cuts = bp.shafts
      .filter((sh) => sh.c0 <= i - 1 && sh.c1 >= i && sh.x > 6 && sh.x < W - 8)
      .map((sh) => sh.x)
      .sort((a, c) => a - c);
    const segments: [number, number][] = [];
    let cur = 6;
    for (const sx of cuts) {
      if (sx - 1 - cur + 1 >= 7) segments.push([cur, sx - 1]);
      cur = sx + 2;
    }
    if (W - 7 - cur + 1 >= 7) segments.push([cur, W - 7]);
    bands.push({ y0, y1, upper: i > 0, lower: i < cys.length, segments });
  }

  let startRoom: Room | null = null;
  let stairsRoom: Room | null = null;
  let stairsUp = { x: 0, y: 0 };
  let stairsDown: { x: number; y: number } | null = null;
  const locked = index > 0 && index % 2 === 1;

  for (const [bi, band] of bands.entries()) {
    const bandH = band.y1 - band.y0 + 1;
    const isTop = bi === 0;
    const isBottom = bi === bands.length - 1;
    let cellNo = 0;
    for (const [s0, s1] of band.segments) {
      let x = s0;
      while (s1 - x + 1 >= 7) {
        let w = Math.min(7 + rng.int(4), s1 - x + 1);
        const rem = s1 - (x + w - 1);
        if (rem > 0 && rem < 6) w += rem;
        const reserveStairs = isTop && cellNo === 0;
        const reserveStart = isBottom && cellNo === 0;
        const interiorX = x + 1;
        const interiorW = w - 2;

        if (reserveStairs || reserveStart) {
          const ry = reserveStairs ? band.y1 - 5 : band.y0 + 1;
          const room = addRoom(b, interiorX, ry, interiorW, 5, "stair", reserveStairs ? "stairs" : "start", decay, service, rng);
          room.lit = true;
          const dx = x + 2 + rng.int(Math.max(1, w - 4));
          addDoor(b, dx, reserveStairs ? band.y1 : band.y0, reserveStairs && locked);
          if (reserveStairs) {
            stairsUp = { x: x + Math.floor(w / 2), y: ry + 2 };
            b.tiles[idx(stairsUp.x, stairsUp.y)] = Tile.StairsUp;
            stairsRoom = room;
            if (interiorW >= 5) addProp(b, "board", interiorX, ry, 2, 1, true);
            addProp(b, "extinguisher", interiorX + interiorW - 1, ry, 1, 1, true);
          } else {
            stairsDown = { x: x + Math.floor(w / 2), y: ry + 3 };
            b.tiles[idx(stairsDown.x, stairsDown.y)] = Tile.StairsDown;
            startRoom = room;
            const medicine = placeAnchored(b, room, { kind: "medbox", w: 1, h: 1 }, 0, 0.75);
            if (medicine) { medicine.loot = "med"; medicine.label = "Apteczka ścienna"; }
            if (interiorW >= 5) placeAnchored(b, room, { kind: "bench", w: 2, h: 1 }, 0, 0);
          }
        } else {
          const mid = band.y0 + Math.floor(bandH / 2);
          const upperH = mid - band.y0 - 1;
          const lowerH = band.y1 - mid - 1;
          const zones = service ? serviceZones(rng) : apartmentZones(rng, decay);
          if (bi === 1 && cellNo < 2) { zones[0] = "workshop"; zones[1] = "storage"; }
          if (!service && isBottom && cellNo === 1) zones[0] = "bedroom";
          const vx = x + Math.floor(w / 2);
          const splitLower = w >= 9 && lowerH >= 2 && rng.chance(0.62);
          const splitUpper = w >= 12 && upperH >= 2 && rng.chance(0.5);
          const anySplit = splitLower || splitUpper;
          let dx = x + 2 + rng.int(Math.max(1, w - 4));
          if (anySplit && dx === vx) dx = vx + 1;
          let gapX = x + 2 + rng.int(Math.max(1, w - 4));
          if (anySplit && gapX === vx) gapX = vx - 1;
          const barUp = !service && rng.chance(0.2);
          const barLo = !service && rng.chance(0.2);

          if (upperH >= 2 && lowerH >= 2) {
            if (band.upper) addDoor(b, dx, band.y0, false, barUp);
            if (band.lower) addDoor(b, dx, band.y1, false, barLo);

            const makePair = (yTop: number, hh: number, zA: Zone, zB: Zone, split: boolean) => {
              if (split) {
                const leftW = vx - interiorX;
                const rightW = interiorX + interiorW - vx - 1;
                addRoom(b, interiorX, yTop, leftW, hh, zA, "normal", decay, service, rng);
                addRoom(b, vx + 1, yTop, rightW, hh, zB, "normal", decay, service, rng);
                const gy = yTop + rng.int(hh);
                if (rng.chance(0.5)) addDoor(b, vx, gy, false);
                else addBreach(b, vx, gy, b.floorStyle[idx(interiorX, yTop)]);
              } else {
                addRoom(b, interiorX, yTop, interiorW, hh, zA, "normal", decay, service, rng);
              }
            };
            makePair(band.y0 + 1, upperH, zones[0], zones[3], splitUpper);
            // przejście między górną a dolną częścią mieszkania
            const ufs = b.floorStyle[idx(interiorX, band.y0 + 1)];
            if (rng.chance(0.45 - decay * 0.25)) addDoor(b, gapX, mid, false);
            else {
              addBreach(b, gapX, mid, ufs);
              if (gapX + 1 < interiorX + interiorW && gapX + 1 !== vx && rng.chance(0.45)) addBreach(b, gapX + 1, mid, ufs);
            }
            makePair(mid + 1, lowerH, zones[1], zones[2], splitLower);
          } else if (bandH - 2 >= 3) {
            if (band.upper) addDoor(b, dx, band.y0, false, barUp);
            if (band.lower) addDoor(b, dx, band.y1, false, barLo);
            addRoom(b, interiorX, band.y0 + 1, interiorW, bandH - 2, zones[0], "normal", decay, service, rng);
          }
        }
        x += w - 1;
        cellNo++;
      }
    }
  }

  if (!startRoom || !stairsRoom) return null;
  // Complete every doorway before furnishing so that all access lanes stay free.
  for (const room of b.rooms) furnishRoom(b, room, b.zones[room.id], decay);

  // Dekoracje korytarzy (nie przy wejściach do szybów i drzwi)
  for (const cy of cys) {
    const deco: PropKind[] = service
      ? ["mailbox", "board", "bench", "extinguisher", "bike", "extinguisher", "mailbox"]
      : ["radiator", "extinguisher", "board", "bike", "bench", "plant", "radiator"];
    for (let x = 10; x < W - 10; x += 9) {
      const kind = rng.pick(deco);
      const pw = kind === "mailbox" || kind === "board" || kind === "bench" || kind === "bike" ? 2 : 1;
      const y = rng.chance(0.5) ? cy : cy + 2;
      let ok = true;
      for (let xx = x - 1; xx <= x + pw; xx++) {
        if (b.tiles[idx(xx, y)] !== Tile.Floor || b.occ[idx(xx, y)]) ok = false;
        if (PASSABLE.has(b.tiles[idx(xx, cy - 1)]) || PASSABLE.has(b.tiles[idx(xx, cy + 3)])) ok = false;
      }
      if (!ok) continue;
      addProp(b, kind, x, y, pw, 1, true);
    }
  }

  addSurfaceDetails(b, rng, index, decay);
  sealRooms(b);
  paintWallBorders(b, decay, service);
  placeWindows(b, rng, decay);
  buildLights(b, rng, decay, cys);

  if (!stockFloor(b, index, locked, startRoom)) return null;

  // Resetuj rezerwacje; zostają tylko realne meble
  b.occ.fill(0);
  for (const p of b.props) {
    if (!p.solid) continue;
    for (let yy = p.y; yy < p.y + p.h; yy++) for (let xx = p.x; xx < p.x + p.w; xx++) if (inb(xx, yy)) b.occ[idx(xx, yy)] = 1;
  }

  carveExtraBreaches(b, rng, decay);
  spawnCorpses(b, rng, index);
  spawnSurvivors(b, rng, index, startRoom);
  const spawns = spawnZombies(b, rng, index, startRoom);
  const sr: Room = startRoom;
  const pc = { x: sr.x + 2, y: sr.y + 2 };
  return {
    index,
    theme: meta.theme,
    name: meta.name,
    sub: `${meta.sub} · ${bp.name}`,
    seed,
    w: W,
    h: H,
    tiles: b.tiles,
    floorStyle: b.floorStyle,
    wallStyle: b.wallStyle,
    rooms: b.rooms,
    roomZones: b.roomZones,
    roomOf: b.roomOf,
    props: b.props,
    doors: b.doors,
    zombies: spawns,
    windows: b.windows,
    decals: b.decals,
    wallDecals: b.wallDecals,
    breaches: b.breaches,
    corpses: b.corpses,
    survivors: b.survivors,
    lights: b.lights,
    playerStart: { x: (pc.x + 0.5) * TILE, y: (pc.y + 0.5) * TILE },
    stairsUp,
    stairsDown: index > 0 ? stairsDown : null,
    locked,
    keyPropId: b.props.find((p) => p.loot === "key")?.id ?? null,
    flare: null,
  };
}

export const LAYOUT_FAMILIES = ["MAŁE PODESTY", "PIERŚCIEŃ", "DWA SKRZYDŁA", "ŁAMANE KORYTARZE", "MIESZKANIA PRZECHODNIE", "BRYŁA L/U", "WSPÓLNY HOL"] as const;

export function layoutProfile(seed: number, floor = 0) {
  const rng = makeRng((seed + floor * 131) ^ 0x2a719d3b);
  return { family: rng.int(LAYOUT_FAMILIES.length), start: rng.int(6) };
}

const STAIR_ANCHORS = [
  { x: 10, y: 9 }, { x: 43, y: 9 }, { x: 10, y: 77 },
  { x: 43, y: 77 }, { x: 20, y: 9 }, { x: 35, y: 77 },
];

export function stairAnchor(seed: number, boundary: number) {
  if (boundary === 9) return { x: 15, y: 66 }; // roof's physical arrival
  const first = Math.floor(hash2(seed, boundary, 777) * STAIR_ANCHORS.length);
  const previous = boundary > 0 ? stairAnchor(seed, boundary - 1) : null;
  const roof = boundary === 8 ? { x: 15, y: 66 } : null;
  for (let i = 0; i < STAIR_ANCHORS.length; i++) {
    const p = STAIR_ANCHORS[(first + i) % STAIR_ANCHORS.length];
    if ((!previous || distCell(previous, p) >= 11) && (!roof || distCell(roof, p) >= 11)) return p;
  }
  return STAIR_ANCHORS[first];
}

type Cell = { x: number; y: number };
const distCell = (a: Cell, c: Cell) => Math.abs(a.x - c.x) + Math.abs(a.y - c.y);
let lastLayoutFailure = "";

/** Topology first: rooms, shafts and mandatory routes are placed before any furniture or loot. */
function buildVariedFloor(index: number, seed: number, buildingSeed: number): FloorData | null {
  const meta = FLOOR_META[index];
  const rng = makeRng(seed ^ 0x2a719d3b);
  const dressing = makeRng(seed ^ 0x61d3ac17);
  const profile = layoutProfile(buildingSeed, index);
  const family = profile.family;
  const b = newBuild();
  const service = index <= 1;
  const reserved = new Uint8Array(W * H);
  const graph = new Uint8Array(W * H);
  const protectedRooms = [stairAnchor(buildingSeed, index), ...(index > 0 ? [stairAnchor(buildingSeed, index - 1)] : [])];
  const courtyard = {x:19+rng.int(3),y:30+rng.int(4),w:16+rng.int(3),h:25+rng.int(4)};
  const isVoid = (x:number,y:number) => {
    // The shared shafts and stair anchors always take precedence over local courtyards/voids.
    if (protectedRooms.some(p=>Math.abs(x-p.x)<=4&&Math.abs(y-p.y)<=4)) return false;
    if (family===1) return x>=courtyard.x&&x<courtyard.x+courtyard.w&&y>=courtyard.y&&y<courtyard.y+courtyard.h;
    if (family===2) return x>=21&&x<35&&(y<32||y>55);
    if (family===5) return x>=34&&x<49&&y<31 || (profile.start%2===0&&x>=7&&x<21&&y>57);
    return false;
  };
  const line = (a: Cell, c: Cell, width = 2) => {
    const minX = Math.min(a.x, c.x), minY = Math.min(a.y, c.y);
    const spanX = Math.abs(a.x - c.x), spanY = Math.abs(a.y - c.y);
    if (spanX && spanY) return;
    for (let y = minY; y <= minY + spanY; y++) for (let x = minX; x <= minX + spanX; x++) {
      for (let yy = y; yy < y + width; yy++) for (let xx = x; xx < x + width; xx++) {
        if (xx < 4 || xx >= W - 4 || yy < 4 || yy >= H - 4 || reserved[idx(xx, yy)] || isVoid(xx,yy)) continue;
        graph[idx(xx, yy)] = 1;
      }
    }
  };
  const centres: Cell[] = [];
  const col = [10 + rng.int(6), 25 + rng.int(7), 39 + rng.int(6)];
  const row = [16 + rng.int(8), 39 + rng.int(10), 63 + rng.int(8)];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    centres.push({ x: col[i] + (i === 1 ? rng.int(5) - 2 : 0), y: row[j] + (j === 1 ? rng.int(5) - 2 : 0) });
  }
  const up = protectedRooms[0];
  const down = index > 0 ? stairAnchor(buildingSeed, index - 1) : null;
  if (down && distCell(down, up) < 11) {lastLayoutFailure="overlapping stairs";return null;}
  for (const p of protectedRooms) for (let y = p.y - 3; y <= p.y + 3; y++) for (let x = p.x - 3; x <= p.x + 3; x++) {
    if (inb(x, y)) reserved[idx(x, y)] = 1;
  }

  // Seven graph families use different edge sets, node positions and optional loops.
  const families: [number, number][][] = [
    [[0,1],[1,2],[0,3],[2,5],[3,4],[4,7],[5,8],[6,7],[7,8]],
    [[0,1],[1,2],[2,5],[5,8],[8,7],[7,6],[6,3],[3,0]],
    [[0,3],[3,6],[2,5],[5,8],[3,4],[4,5],[7,8]],
    [[0,1],[1,4],[4,3],[3,6],[6,7],[7,8],[8,5],[5,2],[4,5]],
    [[0,3],[3,6],[3,4],[4,7],[7,8],[4,5],[5,2],[1,2]],
    [[0,1],[0,3],[3,4],[4,5],[5,8],[8,7],[7,6],[3,6]],
    [[4,1],[4,3],[4,5],[4,7],[0,1],[1,2],[3,6],[5,8],[6,7]],
  ];
  let edges = families[family].slice();
  if (rng.chance(0.45)) edges.splice(rng.int(edges.length), 1, rng.pick(edges));
  if (family !== 1 && rng.chance(0.6)) edges.push(rng.pick([[0,1],[1,2],[3,4],[4,5],[6,7],[7,8],[0,3],[1,4],[2,5],[3,6],[4,7],[5,8]]));
  for (const [a, c] of edges) {
    const start = centres[a], end = centres[c];
    const broad = family === 6 && (a === 4 || c === 4) ? 4 : family === 1 ? 3 : 2;
    if (start.x === end.x || start.y === end.y) line(start, end, broad);
    else if (rng.chance(0.5)) { line(start, { x: end.x, y: start.y }, broad); line({ x: end.x, y: start.y }, end, broad); }
    else { line(start, { x: start.x, y: end.y }, broad); line({ x: start.x, y: end.y }, end, broad); }
  }
  for (const p of centres) if(!isVoid(p.x,p.y)) line(p, p, family === 6 && distCell(p, centres[4]) < 2 ? 6 : 3);
  // Fixed facade shafts are consistent between floors but their approaches vary.
  for (const endpoint of [{ x: 4, y: 43 }, { x: 51, y: 19 }, { x: 51, y: 35 }]) {
    const target = centres.filter(p=>!isVoid(p.x,p.y)).sort((a, c) => distCell(a, endpoint) - distCell(c, endpoint))[0];
    line(endpoint, { x: target.x, y: endpoint.y }, 2);
    line({ x: target.x, y: endpoint.y }, target, 2);
  }
  // Short facade galleries provide sites for hidden rooms without restoring a full-length trunk.
  for (const [edge, base] of [[4, 25], [50, 25], [4, 56], [50, 56]] as const) {
    const y = base + rng.int(10) - 5;
    line({x:edge,y},{x:edge,y:y+12},2);
    const midpoint={x:edge,y:y+4};
    const near=centres.filter(p=>!isVoid(p.x,p.y)).sort((a,c)=>distCell(a,midpoint)-distCell(c,midpoint))[0];
    line(midpoint,{x:near.x,y:midpoint.y},2);
    line({x:near.x,y:midpoint.y},near,2);
  }
  // Intersecting corridor strips are represented as individual rooms for local lighting and zones.
  const visited = new Uint8Array(W * H);
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    if (!graph[idx(x,y)] || visited[idx(x,y)]) continue;
    let w = 1;
    while (x+w < W-4 && graph[idx(x+w,y)] && !visited[idx(x+w,y)] && w < 10) w++;
    for (let xx=x;xx<x+w;xx++) visited[idx(xx,y)]=1;
    const r = addRoom(b,x,y,w,1,"corridor","normal",meta.decay,service,rng);
    r.lit=true;
  }
  // Keep every graph tile even where the strips cross reserved areas.
  for (let y=4;y<H-4;y++) for(let x=4;x<W-4;x++) if(graph[idx(x,y)]) b.tiles[idx(x,y)]=Tile.Floor;

  const stairRooms: Room[] = [];
  for (const [k,p] of protectedRooms.entries()) {
    const r=addRoom(b,p.x-2,p.y-2,5,5,"stair",k===0?"stairs":"start",meta.decay,service,rng);
    r.lit=true;
    stairRooms.push(r);
    b.tiles[idx(p.x,p.y)] = k===0?Tile.StairsUp:Tile.StairsDown;
    // Connect the landing through one deliberate doorway and a short spur.
    const targets=centres.slice().sort((a,c)=>distCell(a,p)-distCell(c,p));
    const target=targets.find(c=>!isVoid(c.x,c.y))??targets[0];
    const dx=target.x-p.x,dy=target.y-p.y;
    const door= Math.abs(dx)>Math.abs(dy) ? {x:p.x+(dx>0?3:-3),y:p.y} : {x:p.x,y:p.y+(dy>0?3:-3)};
    const outside={x:door.x+(door.x-p.x?Math.sign(door.x-p.x):0),y:door.y+(door.y-p.y?Math.sign(door.y-p.y):0)};
    line(outside,{x:target.x,y:outside.y},2);
    line({x:target.x,y:outside.y},target,2);
    // Re-carve just this spur without crossing any of the protected stair interiors.
    for(let yy=4;yy<H-4;yy++)for(let xx=4;xx<W-4;xx++)if(graph[idx(xx,yy)]&&!reserved[idx(xx,yy)]&&b.tiles[idx(xx,yy)]===Tile.Wall){
      b.tiles[idx(xx,yy)]=Tile.Floor;b.floorStyle[idx(xx,yy)]=3;
    }
    addDoor(b,door.x,door.y,k===0 && index>0 && index%2===1);
  }

  // Reserved stair landings and courtyards can split a branch. Rejoin every graph
  // component with the shortest legal detour before placing rooms or furniture.
  const graphComponents=()=>{
    const seen=new Uint8Array(W*H),groups:number[][]=[];
    for(let i=0;i<graph.length;i++){
      if(!graph[i]||seen[i])continue;
      const q=[i];seen[i]=1;
      for(let head=0;head<q.length;head++){
        const pos=q[head],x=pos%W,y=Math.floor(pos/W);
        for(const [dx,dy] of N4){const nx=x+dx,ny=y+dy,ni=ny*W+nx;
          if(nx<0||nx>=W||ny<0||ny>=H||seen[ni]||!graph[ni])continue;
          seen[ni]=1;q.push(ni);
        }
      }
      groups.push(q);
    }
    return groups.sort((a,c)=>c.length-a.length);
  };
  for(let attempt=0;attempt<16;attempt++){
    const groups=graphComponents();
    if(groups.length<=1)break;
    const root=new Uint8Array(W*H),prev=new Int32Array(W*H).fill(-1),q:number[]=[];
    for(const i of groups[0]){root[i]=1;prev[i]=i;q.push(i);}
    let found=-1;
    for(let head=0;head<q.length&&found<0;head++){
      const pos=q[head],x=pos%W,y=Math.floor(pos/W);
      for(const [dx,dy] of N4){const nx=x+dx,ny=y+dy,ni=ny*W+nx;
        if(nx<4||nx>=W-4||ny<4||ny>=H-4||prev[ni]>=0||reserved[ni])continue;
        prev[ni]=pos;
        if(graph[ni]&&!root[ni]){found=ni;break;}
        q.push(ni);
      }
    }
    if(found<0){lastLayoutFailure="disconnected corridor graph";return null;}
    for(let pos=found;!root[pos];pos=prev[pos]){
      graph[pos]=1;
      const x=pos%W,y=Math.floor(pos/W);
      if(x+1<W-4&&!reserved[idx(x+1,y)])graph[idx(x+1,y)]=1;
    }
  }
  if(graphComponents().length>1){lastLayoutFailure="corridor graph still disconnected";return null;}
  for(let y=4;y<H-4;y++)for(let x=4;x<W-4;x++){
    const i=idx(x,y);
    if(!graph[i]||b.roomOf[i]>=0)continue;
    const r=addRoom(b,x,y,1,1,"corridor","normal",meta.decay,service,rng);
    r.lit=true;
  }

  // Rooms are packed into the spaces left by the actual connected circulation graph.
  const roomsAdded: Room[]=[];
  const canRoom=(x:number,y:number,w:number,h:number)=>{
    if(x<6||y<5||x+w>W-6||y+h>H-5)return false;
    for(let yy=y-1;yy<=y+h;yy++)for(let xx=x-1;xx<=x+w;xx++) if(b.tiles[idx(xx,yy)]!==Tile.Wall||reserved[idx(xx,yy)]||isVoid(xx,yy))return false;
    for(let yy=y;yy<y+h;yy++) if(PASSABLE.has(b.tiles[idx(x-2,yy)])||PASSABLE.has(b.tiles[idx(x+w+1,yy)]))return true;
    for(let xx=x;xx<x+w;xx++) if(PASSABLE.has(b.tiles[idx(xx,y-2)])||PASSABLE.has(b.tiles[idx(xx,y+h+1)]))return true;
    return false;
  };
  for(let attempts=0;attempts<1500&&roomsAdded.length<55;attempts++){
    const w=4+rng.int(family===2?9:family===0?4:7),h=3+rng.int(family===4?8:7);
    const x=6+rng.int(W-12-w),y=5+rng.int(H-10-h);
    if(!canRoom(x,y,w,h))continue;
    const zone=service?rng.pick(serviceZones(rng)):rng.pick(apartmentZones(rng,meta.decay));
    const r=addRoom(b,x,y,w,h,zone,"normal",meta.decay,service,rng);
    roomsAdded.push(r);
  }
  if(roomsAdded.length<10){lastLayoutFailure=`too few rooms (${roomsAdded.length})`;return null;}

  // Join rooms to corridors or neighbouring rooms. Every room must have an entrance.
  for(const r of roomsAdded){
    const options: {x:number;y:number; corridor:boolean}[]=[];
    for(let y=r.y;y<r.y+r.h;y++)for(const side of [-1,1]){
      const x=side<0?r.x-1:r.x+r.w;
      const farX=x+side;
      if(b.tiles[idx(x,y)]===Tile.Wall && PASSABLE.has(b.tiles[idx(farX,y)])) options.push({x,y,corridor:b.roomZones[b.roomOf[idx(farX,y)]]==="KORYTARZ"});
    }
    for(let x=r.x;x<r.x+r.w;x++)for(const side of [-1,1]){
      const y=side<0?r.y-1:r.y+r.h,farY=y+side;
      if(b.tiles[idx(x,y)]===Tile.Wall && PASSABLE.has(b.tiles[idx(x,farY)])) options.push({x,y,corridor:b.roomZones[b.roomOf[idx(x,farY)]]==="KORYTARZ"});
    }
    const ordered=options.sort((a,c)=>Number(c.corridor)-Number(a.corridor)||a.x-c.x||a.y-c.y);
    if(ordered[0]) addDoor(b,ordered[0].x,ordered[0].y,false);
    if(ordered.length>1 && rng.chance(family===4?0.85:0.5)) {
      const alt=ordered.find((o)=>distCell(o,ordered[0])>=3);
      if(alt) addDoor(b,alt.x,alt.y,false);
    }
  }

  // Reserve one real corridor-connected workshop and storage room for contextual mandatory loot.
  const firstWorkshop=roomsAdded.find(r=>b.roomZones[r.id]==="WARSZTAT"||b.roomZones[r.id]==="SCHOWEK");
  if(!firstWorkshop) {b.roomZones[roomsAdded[0].id]="WARSZTAT";b.zones[roomsAdded[0].id]="workshop";}
  const bedroom=roomsAdded.find(r=>b.zones[r.id]==="bedroom"&&r.w>=5);
  if(!bedroom){const r=roomsAdded[roomsAdded.length-1];b.zones[r.id]="bedroom";b.roomZones[r.id]="SYPIALNIA";}
  const corridor=b.rooms.find(r=>b.roomZones[r.id]==="KORYTARZ"&&r.w>=4);
  if(!corridor){lastLayoutFailure="no long corridor";return null;}
  // The actual start may be a room, work area, lobby or stair landing, independent of exit.
  let startRoom=stairRooms[1]??roomsAdded[profile.start%roomsAdded.length];
  if(index===0){
    const pool=roomsAdded.filter(r=>r.w>=5&&r.h>=4);
    if(pool.length)startRoom=pool[profile.start%pool.length];
    startRoom.role="start";
    startRoom.lit=true;
    b.zones[startRoom.id]=rng.pick(["workshop","storage","office","living","bedroom"]);
    b.roomZones[startRoom.id]=ZONE_NAME[b.zones[startRoom.id]];
  }
  // Furnish only after all doors and passages exist.
  for(const r of b.rooms) if(r.w>=3&&r.h>=3 && b.zones[r.id]!=="corridor")furnishRoom(b,r,b.zones[r.id],meta.decay);
  addSurfaceDetails(b,dressing,index,meta.decay);
  if(!stockFloor(b,index,index>0&&index%2===1,startRoom)){lastLayoutFailure="mandatory loot could not be placed";return null;}
  if(index===0){
    const host=b.props.find(p=>p.loot==="hatchet");
    if(!host){lastLayoutFailure="no start weapon";return null;}
  }
  sealRooms(b);
  paintWallBorders(b,meta.decay,service);
  placeWindows(b,dressing,meta.decay);
  buildLights(b,dressing,meta.decay,[]);
  for(let y=7;y<H-7;y++)for(let x=8;x<W-8;x++){
    const rid=b.roomOf[idx(x,y)];
    if(rid>=0&&b.roomZones[rid]==="KORYTARZ"&&b.tiles[idx(x,y)]===Tile.Floor&&(x*7+y*11+seed)%47===0)
      b.lights.push(makeLight(x,y,"fluor",dressing.chance(.28+meta.decay*.35),rid,4.6));
  }
  b.occ.fill(0);
  for(const p of b.props)if(p.solid)for(let y=p.y;y<p.y+p.h;y++)for(let x=p.x;x<p.x+p.w;x++)b.occ[idx(x,y)]=1;
  carveExtraBreaches(b,dressing,meta.decay);
  spawnCorpses(b,dressing,index);
  spawnSurvivors(b,dressing,index,startRoom);
  const spawns=spawnZombies(b,dressing,index,startRoom);
  const startCell = index===0 ? Array.from({length:startRoom.w*startRoom.h},(_,n)=>({x:startRoom.x+n%startRoom.w,y:startRoom.y+Math.floor(n/startRoom.w)}))
    .filter(p=>b.tiles[idx(p.x,p.y)]===Tile.Floor&&!b.occ[idx(p.x,p.y)])
    .sort((a,c)=>distCell(a,{x:startRoom.x+startRoom.w/2,y:startRoom.y+startRoom.h/2})-distCell(c,{x:startRoom.x+startRoom.w/2,y:startRoom.y+startRoom.h/2}))[0] : down!;
  if(!startCell){lastLayoutFailure="start occupied by furniture";return null;}
  return {index,theme:meta.theme,name:meta.name,sub:`${meta.sub} · ${LAYOUT_FAMILIES[family]}`,seed,w:W,h:H,
    tiles:b.tiles,floorStyle:b.floorStyle,wallStyle:b.wallStyle,rooms:b.rooms,roomZones:b.roomZones,roomOf:b.roomOf,
    props:b.props,doors:b.doors,zombies:spawns,windows:b.windows,decals:b.decals,wallDecals:b.wallDecals,
    breaches:b.breaches,corpses:b.corpses,survivors:b.survivors,lights:b.lights,
    playerStart:{x:(startCell.x+.5)*TILE,y:(startCell.y+.5)*TILE},stairsUp:up,stairsDown:index>0?down:null,
    locked:index>0&&index%2===1,keyPropId:b.props.find(p=>p.loot==="key")?.id??null,flare:null};
}

export function diagnoseVariedFloor(index: number, seed: number, buildingSeed: number) {
  const floor = buildVariedFloor(index, seed, buildingSeed);
  if (!floor) return lastLayoutFailure;
  const geometry = validateFloor(floor);
  if (geometry) return geometry;
  installVerticalRoutes(floor, buildingSeed);
  populateEnvironment(floor);
  installVerticalQuests(floor, buildingSeed);
  if (!floor.environment?.features.some(f=>f.kind==="wall")) return "no fragile annex";
  if (!floor.environment?.features.some(f=>f.kind==="obstruction")) return "no blocked annex";
  installTacticalContent(floor);
  return validateFloor(floor) ?? "ok";
}

function carveExtraBreaches(b: Build, rng: Rng, decay: number) {
  const want = 4 + Math.round(decay * 12);
  let made = 0;
  for (let a = 0; a < 600 && made < want; a++) {
    const x = 6 + rng.int(W - 12);
    const y = 5 + rng.int(H - 10);
    if (b.tiles[idx(x, y)] !== Tile.Wall) continue;
    const okPair = (ax: number, ay: number, bx: number, by: number) => {
      const ia = idx(ax, ay);
      const ib = idx(bx, by);
      if (b.tiles[ia] !== Tile.Floor || b.tiles[ib] !== Tile.Floor) return false;
      const ra = b.roomOf[ia];
      const rb = b.roomOf[ib];
      if (ra < 0 || rb < 0 || ra === rb) return false;
      for (const r of [ra, rb]) {
        if (b.rooms[r]?.role !== "normal") return false;
        if (b.roomZones[r] === "KORYTARZ") return false;
      }
      return true;
    };
    const lr = okPair(x - 1, y, x + 1, y);
    const ud = okPair(x, y - 1, x, y + 1);
    if (!lr && !ud) continue;
    if (b.doors.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) <= 2)) continue;
    if (b.breaches.some((br) => Math.abs(br.x - x) + Math.abs(br.y - y) <= 2)) continue;
    const fs = lr ? b.floorStyle[idx(x - 1, y)] : b.floorStyle[idx(x, y - 1)];
    addBreach(b, x, y, fs);
    made++;
  }
}

function spawnCorpses(b: Build, rng: Rng, index: number) {
  const want = 4 + Math.min(8, index);
  const kinds: ZombieKind[] = ["shambler", "shambler", "runner", "brute"];
  let made = 0;
  for (let a = 0; a < 300 && made < want; a++) {
    const x = 4 + rng.int(W - 8);
    const y = 4 + rng.int(H - 8);
    const i = idx(x, y);
    if (b.tiles[i] !== Tile.Floor || b.occ[i]) continue;
    const rid = b.roomOf[i];
    if (rid >= 0 && b.rooms[rid]?.role === "start") continue;
    b.corpses.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, kind: rng.pick(kinds) });
    made++;
  }
}

const SURVIVOR_DIALOGS: { name: string; lines: string[]; gift: "med" | "ammo" | "battery" }[] = [
  {
    name: "MAREK Z TRZECIEGO",
    lines: [
      "Cii! Nie świeć po oknach... blabla... siedzę tu od wczoraj.",
      "Zabarykadowaliśmy drzwi szafą, ale przeszli przez ścianę u sąsiada.",
      "Weź te naboje, mi ręce się trzęsą. Uciekam na dół póki czysto!",
    ],
    gift: "ammo",
  },
  {
    name: "PANI HALINA (M. 14)",
    lines: [
      "Jezus Maria, żywy człowiek... szeptem, błagam, oni słyszą każdy krok.",
      "Klucz do schodów wisi w szafce na korytarzu. Szukaj metalowych drzwiczek.",
      "Masz opatrunek z mojej apteczki. Nie czekaj na mnie, biegnę!",
    ],
    gift: "med",
  },
  {
    name: "TOMEK — ELEKTRYK",
    lines: [
      "Pssst! Myślałem że to znowu te trupy drapią w drzwi...",
      "Na dachu jest coś ogromnego, słyszałem jak dudni w strop nad ósmym.",
      "Łap baterię do latarki. Ja pryskam przez klatkę, powodzenia!",
    ],
    gift: "battery",
  },
  {
    name: "ANKA Z SIÓDEMKI",
    lines: [
      "Nie strzelaj! Jestem sama... schowałam się w łazience gdy wyważyli zamek.",
      "Na korytarzu leżą ci, których próbowaliśmy zatrzymać łomami.",
      "Weź naboje mojego brata. Ja wybiegnę gdy ich odciągniesz!",
    ],
    gift: "ammo",
  },
  {
    name: "STARY DOZORCA",
    lines: [
      "Kto tam?! A, to ty... cicho, bo zlecą się z całego pionu.",
      "Co drugie piętro zamknąłem kratę. Klucze są w szafkach na korytarzach.",
      "Weź apteczkę ze stróżówki. Uciekam stąd!",
    ],
    gift: "med",
  },
];

function spawnSurvivors(b: Build, rng: Rng, index: number, startRoom: Room) {
  if (index === 10) return;
  const want = index === 0 ? 1 : 1 + (rng.chance(0.55) ? 1 : 0);
  const candidates = b.rooms.filter(
    (r) => r.role === "normal" && b.roomZones[r.id] !== "KORYTARZ" && b.roomZones[r.id] !== "KLATKA SCHODOWA" && r.id !== startRoom.id,
  );
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const room of candidates) {
    if (b.survivors.length >= want) break;
    for (let a = 0; a < 18; a++) {
      const tx = room.x + rng.int(room.w);
      const ty = room.y + rng.int(room.h);
      const i = idx(tx, ty);
      if (b.tiles[i] !== Tile.Floor || b.occ[i]) continue;
      const tpl = SURVIVOR_DIALOGS[(index + b.survivors.length + rng.int(SURVIVOR_DIALOGS.length)) % SURVIVOR_DIALOGS.length];
      b.occ[i] = 1;
      b.survivors.push({
        id: b.survivors.length,
        x: (tx + 0.5) * TILE,
        y: (ty + 0.5) * TILE,
        room: room.id,
        name: tpl.name,
        lines: tpl.lines,
        gift: tpl.gift,
        variant: (index + b.survivors.length) % 2,
      });
      break;
    }
  }
}

function spawnZombies(b: Build, rng: Rng, index: number, startRoom: Room): FloorData["zombies"] {
  const counts = [
    { s: 4, r: 0, b: 0 },
    { s: 6, r: 1, b: 0 },
    { s: 7, r: 1, b: 0 },
    { s: 8, r: 2, b: 0 },
    { s: 8, r: 3, b: 0 },
    { s: 9, r: 4, b: 1 },
    { s: 10, r: 5, b: 1 },
    { s: 11, r: 5, b: 2 },
    { s: 12, r: 6, b: 2 },
    { s: 13, r: 7, b: 2 },
    { s: 3, r: 2, b: 0 },
  ];
  const want = counts[Math.min(index, counts.length - 1)];
  const kinds: ZombieKind[] = [
    ...Array(want.s).fill("shambler"),
    ...Array(want.r).fill("runner"),
    ...Array(want.b).fill("brute"),
  ];
  const sx = (startRoom.x + startRoom.w / 2) * TILE;
  const sy = (startRoom.y + startRoom.h / 2) * TILE;
  const candidates: { x: number; y: number; room: number }[] = [];
  for (let y = 3; y < H - 3; y++) {
    for (let x = 3; x < W - 3; x++) {
      const i = idx(x, y);
      const t = b.tiles[i];
      if (t !== Tile.Floor && t !== Tile.Rubble && t !== Tile.Puddle) continue;
      if (b.occ[i]) continue;
      const px = (x + 0.5) * TILE;
      const py = (y + 0.5) * TILE;
      if (Math.hypot(px - sx, py - sy) < 11 * TILE) continue;
      const rid = b.roomOf[i];
      if (rid >= 0 && b.rooms[rid]?.role === "start") continue;
      candidates.push({ x: px, y: py, room: rid >= 0 ? rid : 0 });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const out: FloorData["zombies"] = [];
  for (let i = 0; i < kinds.length && i < candidates.length; i++) out.push({ ...candidates[i], kind: kinds[i] });
  return out;
}

/* ================= DACH ================= */

function generateRoof(index: number, seed: number): FloorData {
  const rng = makeRng(seed);
  const meta = FLOOR_META[index];
  const b = newBuild();
  b.tiles.fill(Tile.Sky);
  const x = 10;
  const y = 20;
  const rw = W - 20;
  const rh = H - 38;
  for (let yy = y; yy < y + rh; yy++) {
    for (let xx = x; xx < x + rw; xx++) {
      const edge = xx === x || yy === y || xx === x + rw - 1 || yy === y + rh - 1;
      b.tiles[idx(xx, yy)] = edge ? Tile.Wall : Tile.Floor;
      if (!edge) b.floorStyle[idx(xx, yy)] = 6;
    }
  }
  for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) b.wallStyle[idx(xx, yy)] = 6;
  const room = addRoom(b, x + 1, y + 1, rw - 2, rh - 2, "corridor", "start", 0, false, rng);
  b.roomZones[room.id] = "DACH";
  for (let yy = room.y; yy < room.y + room.h; yy++) for (let xx = room.x; xx < room.x + room.w; xx++) b.floorStyle[idx(xx, yy)] = 6;
  const structures: { x: number; y: number; w: number; h: number }[] = [
    { x: x + 3, y: y + 7, w: 3, h: 2 },
    { x: x + rw - 7, y: y + 6, w: 3, h: 2 },
    { x: x + 4, y: y + 18, w: 4, h: 2 },
    { x: x + rw - 8, y: y + 19, w: 4, h: 2 },
    { x: x + 3, y: y + rh - 9, w: 4, h: 2 },
    { x: x + rw - 7, y: y + rh - 10, w: 3, h: 2 },
  ];
  for (const s of structures) carveRect(b.tiles, s.x, s.y, s.w, s.h, Tile.Wall);
  const vents: PropKind[] = ["vent", "watertank", "antenna", "satellite", "vent", "vent"];
  structures.forEach((s, i) => addProp(b, vents[i], s.x, s.y - 1, 2, 1, true));
  addProp(b, "antenna", x + rw - 5, y + 3, 1, 1, true);
  addProp(b, "satellite", x + 2, y + 3, 2, 1, true);

  for (let a = 0; a < 42; a++) {
    const px = x + 2 + rng.int(rw - 4);
    const py = y + 2 + rng.int(rh - 4);
    const i = idx(px, py);
    if (b.tiles[i] === Tile.Floor && rng.chance(0.7)) b.tiles[i] = Tile.Puddle;
  }
  const sx = x + 5;
  const sy = y + rh - 4;
  b.tiles[idx(sx, sy)] = Tile.StairsDown;
  const fx = x + Math.floor(rw / 2);
  const fy = y + 8;
  b.tiles[idx(fx, fy)] = Tile.Floor;

  addProp(b, "flare", fx, fy, 1, 1, true);
  addProp(b, "medbox", x + 2, y + rh - 4, 1, 1, true, "med");
  addProp(b, "supplycase", x + 2, y + rh - 5, 1, 1, true, "ammo");
  addProp(b, "locker", x + rw - 3, y + 6, 1, 1, true, "battery");
  addProp(b, "supplycase", x + rw - 3, y + 7, 1, 1, true, "shells");

  const spawns: FloorData["zombies"] = [
    { x: (fx + 0.5) * TILE, y: (fy + 4.5) * TILE, kind: "boss", room: 0 },
    { x: (x + 5.5) * TILE, y: (y + 22.5) * TILE, kind: "shambler", room: 0 },
    { x: (x + rw - 5.5) * TILE, y: (y + 23.5) * TILE, kind: "shambler", room: 0 },
    { x: (x + 9.5) * TILE, y: (y + rh - 12.5) * TILE, kind: "shambler", room: 0 },
    { x: (x + rw - 9.5) * TILE, y: (y + rh - 13.5) * TILE, kind: "runner", room: 0 },
    { x: (x + 4.5) * TILE, y: (y + rh - 16.5) * TILE, kind: "runner", room: 0 },
    { x: (x + 6.5) * TILE, y: (y + 15.5) * TILE, kind: "brute", room: 0 },
  ];

  const windows: WindowInfo[] = [];
  for (let a = 0; a < 22; a++) {
    windows.push({ x: 2 + rng.int(9), y: 4 + rng.int(H - 8), glow: rng.chance(0.6) ? "fluor" : "none" });
    windows.push({ x: W - 10 + rng.int(8), y: 4 + rng.int(H - 8), glow: rng.chance(0.5) ? "orange" : "none" });
  }
  const decals: DecalSpawn[] = [];
  for (let a = 0; a < 34; a++) {
    const px = x + 2 + rng.int(rw - 4);
    const py = y + 2 + rng.int(rh - 4);
    if (b.tiles[idx(px, py)] === Tile.Floor) decals.push({ x: px, y: py, kind: rng.chance(0.6) ? "moss" : "crack" });
  }
  const wallDecals: WallDecal[] = [];
  for (let a = 0; a < 18; a++) wallDecals.push({ x: x + rng.int(rw), y, kind: rng.chance(0.5) ? "mold" : "crack" });

  return {
    index,
    theme: meta.theme,
    name: meta.name,
    sub: meta.sub,
    seed,
    w: W,
    h: H,
    tiles: b.tiles,
    floorStyle: b.floorStyle,
    wallStyle: b.wallStyle,
    rooms: b.rooms,
    roomZones: b.roomZones,
    roomOf: b.roomOf,
    props: b.props,
    doors: [],
    zombies: spawns,
    windows,
    decals,
    wallDecals,
    breaches: [],
    corpses: [
      { x: (x + 11.5) * TILE, y: (y + 11.5) * TILE, kind: "shambler" },
      { x: (x + rw - 10.5) * TILE, y: (y + 16.5) * TILE, kind: "runner" },
      { x: (x + 14.5) * TILE, y: (y + rh - 10.5) * TILE, kind: "brute" },
    ],
    survivors: [],
    lights: [
      { x: (fx + 0.5) * TILE, y: (fy + 0.5) * TILE, kind: "emergency", flicker: false, roomId: 0, radius: 7 * TILE },
      { x: (sx + 0.5) * TILE, y: (sy + 0.5) * TILE, kind: "fluor", flicker: true, roomId: 0, radius: 5 * TILE },
      { x: (x + rw - 5.5) * TILE, y: (y + 14.5) * TILE, kind: "sodium", flicker: false, roomId: 0, radius: 5 * TILE },
    ],
    playerStart: { x: (sx + 0.5) * TILE, y: (sy - 1.2) * TILE },
    stairsUp: null,
    stairsDown: { x: sx, y: sy },
    locked: false,
    keyPropId: null,
    flare: { x: fx, y: fy },
  };
}

/* ============ WALIDACJA ============ */

function reachableTiles(floor: FloorData, beforeKey: boolean) {
  const blocked = new Uint8Array(W * H);
  for (const p of floor.props) {
    if (!p.solid) continue;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) blocked[idx(x, y)] = 1;
  }
  for (const d of floor.doors) if (d.sealed || (beforeKey && d.locked)) blocked[idx(d.x, d.y)] = 1;
  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  const start = idx(Math.floor(floor.playerStart.x / TILE), Math.floor(floor.playerStart.y / TILE));
  if (blocked[start]) return seen;
  queue[0] = start;
  seen[start] = 1;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const here = queue[head];
    for (const [dx, dy] of N4) {
      const x = here % W + dx, y = Math.floor(here / W) + dy;
      if (!inb(x, y)) continue;
      const next = idx(x, y);
      if (seen[next] || blocked[next] || !PASSABLE.has(floor.tiles[next])) continue;
      queue[tail++] = next;
      seen[next] = 1;
    }
  }
  return seen;
}

function canSearchFrom(seen: Uint8Array, p: { x: number; y: number; w: number; h: number }) {
  for (let y = p.y; y < p.y + p.h; y++) {
    for (let x = p.x; x < p.x + p.w; x++) {
      if (N4.some(([dx, dy]) => inb(x + dx, y + dy) && seen[idx(x + dx, y + dy)])) return true;
    }
  }
  return false;
}

/** Kontrola geometrii: szczelne obwody pokoi i drzwi prowadzące z podłogi na podłogę. */
function validateGeometry(floor: FloorData): string | null {
  const t = floor.tiles;
  for (const r of floor.rooms) {
    if (["KORYTARZ", "DACH", "WINDA OSOBOWA", "PION TECHNICZNY", "KLATKA B"].includes(floor.roomZones[r.id])) continue;
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const onBorder = x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h;
        if (!onBorder) continue;
        if (!inb(x, y)) return `room ${r.id} touches map edge`;
        const v = t[idx(x, y)];
        if (v === Tile.Floor || v === Tile.Puddle) return `room ${r.id} has open perimeter at ${x},${y}`;
      }
    }
  }
  for (const d of floor.doors) {
    const p = (x: number, y: number) => inb(x, y) && PASSABLE.has(t[idx(x, y)]);
    const ns = p(d.x, d.y - 1) && p(d.x, d.y + 1);
    const ew = p(d.x - 1, d.y) && p(d.x + 1, d.y);
    if (!ns && !ew) return `door at ${d.x},${d.y} leads into a wall`;
  }
  return null;
}

export function validateFloor(floor: FloorData): string | null {
  const startTx = Math.floor(floor.playerStart.x / TILE);
  const startTy = Math.floor(floor.playerStart.y / TILE);
  if (!inb(startTx, startTy)) return "start out of bounds";
  const st = floor.tiles[idx(startTx, startTy)];
  if (st === Tile.Wall || st === Tile.Window || st === Tile.Sky || st === Tile.Door) return "start blocked";
  if (floor.props.some(p=>p.solid&&startTx>=p.x&&startTx<p.x+p.w&&startTy>=p.y&&startTy<p.y+p.h)) return "start occupied by furniture";
  const geo = validateGeometry(floor);
  if (geo) return geo;
  const accessible = reachableTiles(floor, false);
  for (const p of floor.props) {
    if ((p.loot || p.kind === "flare") && !canSearchFrom(accessible, p)) return `unreachable supply: ${p.id}`;
  }
  if (floor.theme === "roof") return floor.flare ? null : "no flare";
  if (!floor.stairsUp || !accessible[idx(floor.stairsUp.x, floor.stairsUp.y)]) return "cannot reach stairs";
  const discovery = DISCOVERIES[floor.index];
  if (discovery && !floor.props.some(p => p.loot === discovery)) return "missing weapon cache";
  if (floor.locked) {
    const key = floor.props.find(p => p.id === floor.keyPropId && p.loot === "key");
    if (!key || !canSearchFrom(reachableTiles(floor, true), key)) return "cannot reach key before unlocking";
  }
  return validateEnvironment(floor);
}

export function generateFloor(index: number, seed: number, runSeed?: number, generatorVersion = 2): FloorData {
  const buildingSeed = runSeed ?? seed;
  for (let a = 0; a < (generatorVersion === 1 ? 36 : 16); a++) {
    const s = (seed + a * 997) >>> 0;
    try {
      const floor = index === 10 ? generateRoof(index, s) : generatorVersion === 1 ? buildFloor(index, s) : buildVariedFloor(index, s, buildingSeed);
      if (!floor || validateFloor(floor)) continue;
      if (index < 10) installVerticalRoutes(floor, buildingSeed);
      populateEnvironment(floor);
      if (index < 10) installVerticalQuests(floor, buildingSeed);
      if (generatorVersion !== 1 && index < 10 && (!floor.environment?.features.some((f) => f.kind === "wall") || !floor.environment?.features.some((f) => f.kind === "obstruction"))) continue;
      installTacticalContent(floor);
      if (!validateFloor(floor)) return floor;
    } catch {
      // kolejna próba z innym ziarnem
    }
  }
  if (generatorVersion !== 1 && index < 10) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const legacy = buildFloor(index, (seed ^ 0x7583a1c3) + attempt * 997);
      if (!legacy || validateFloor(legacy)) continue;
      installVerticalRoutes(legacy, buildingSeed);
      populateEnvironment(legacy);
      installVerticalQuests(legacy, buildingSeed);
      installTacticalContent(legacy);
      if (!validateFloor(legacy)) return legacy;
    }
  }
  const fallback = fallbackFloor(index, seed);
  if (index < 10) installVerticalRoutes(fallback, buildingSeed);
  populateEnvironment(fallback);
  if (index < 10) installVerticalQuests(fallback, buildingSeed);
  installTacticalContent(fallback);
  return fallback;
}

function fallbackFloor(index: number, seed: number): FloorData {
  const meta = FLOOR_META[index];
  if (index === 10) return generateRoof(index, seed ^ 0x9e3779b9);
  const b = newBuild();
  const cys = [16, 42, 68];
  for (const cy of cys) carveRect(b.tiles, 4, cy, W - 8, 3, Tile.Floor);
  carveRect(b.tiles, 4, 16, 2, 55, Tile.Floor);
  carveRect(b.tiles, W - 6, 16, 2, 55, Tile.Floor);
  const rng = makeRng(seed);
  const start = addRoom(b, 8, 72, 10, 8, "stair", "start", 0, false, rng);
  addRoom(b, 8, 7, 10, 8, "stair", "stairs", 0, false, rng);
  addDoor(b, 12, 71, false);
  addDoor(b, 12, 15, false);
  const up = { x: 12, y: 9 };
  b.tiles[idx(up.x, up.y)] = Tile.StairsUp;
  b.tiles[idx(12, 76)] = Tile.StairsDown;
  addProp(b, "medbox", 8, 73, 1, 1, true, "med");
  addProp(b, "supplycase", 8, 74, 1, 1, true, "ammo");
  const discovery = DISCOVERIES[index];
  if (discovery) {
    const room = addRoom(b, 22, 72, 8, 7, index === 0 ? "workshop" : index === 1 ? "office" : "bedroom", "normal", 0, false, rng);
    addDoor(b, 25, 71, false);
    const fixture = index === 0 ? "locker" : index === 1 ? "desk" : "wardrobe";
    addProp(b, fixture, room.x, room.y + 4, fixture === "desk" ? 2 : 1, 1, true, discovery);
  }
  paintWallBorders(b, 0, false);
  buildLights(b, rng, 0, cys);
  return {
    index,
    theme: meta.theme,
    name: meta.name,
    sub: meta.sub,
    seed,
    w: W,
    h: H,
    tiles: b.tiles,
    floorStyle: b.floorStyle,
    wallStyle: b.wallStyle,
    rooms: b.rooms,
    roomZones: b.roomZones,
    roomOf: b.roomOf,
    props: b.props,
    doors: b.doors,
    zombies: [{ x: 20.5 * TILE, y: 42.5 * TILE, kind: "shambler", room: 0 }],
    windows: [],
    decals: [],
    wallDecals: [],
    breaches: [],
    corpses: [],
    survivors: [],
    lights: b.lights,
    playerStart: { x: (start.x + 2.5) * TILE, y: (start.y + 2.5) * TILE },
    stairsUp: up,
    stairsDown: index > 0 ? { x: 12, y: 76 } : null,
    locked: false,
    keyPropId: null,
    flare: null,
  };
}

export function testGenerate(seeds = 20): string[] {
  const errors: string[] = [];
  for (let i = 0; i < seeds; i++) {
    for (let f = 0; f < 11; f++) {
      try {
        const floor = generateFloor(f, 1000 + i * 17);
        const v = validateFloor(floor);
        if (v) errors.push(`seed ${1000 + i * 17} floor ${f}: ${v}`);
        if (f <= 9 && floor.rooms.length < 10) errors.push(`seed ${1000 + i * 17} floor ${f}: fallback`);
      } catch (e) {
        errors.push(`throw ${i}/${f}: ${String(e)}`);
      }
    }
  }
  return errors;
}
