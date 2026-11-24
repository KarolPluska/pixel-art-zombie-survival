// tests/environment.test.ts
import assert from "node:assert/strict";

// src/game/inventory.ts
var WEAPON_IDS = ["crowbar", "pistol", "hatchet", "revolver", "shotgun", "crossbow", "machete"];
function isWeapon(id) {
  return WEAPON_IDS.includes(id);
}
var DISCOVERIES = { 0: "hatchet", 1: "revolver", 2: "machete", 4: "shotgun", 6: "crossbow" };

// src/game/palette.ts
var TILE = 16;
var MAP_W = 56;
var MAP_H = 88;
var FLOOR_COUNT = 11;
var Tile = {
  Wall: 0,
  Floor: 1,
  Door: 2,
  DoorOpen: 3,
  StairsUp: 4,
  StairsDown: 5,
  Window: 6,
  Rubble: 7,
  Puddle: 8,
  Sky: 9,
  Hole: 10
};
var FLOOR_META = [
  { theme: "basement", name: "PIWNICA", sub: "rury, wilgo\u0107, ciemno\u015B\u0107", decay: 0 },
  { theme: "lobby", name: "PARTER", sub: "hol i skrzynki na listy", decay: 0 },
  { theme: "flat", name: "PI\u0118TRO I", sub: "\u015Bwie\u017Co opuszczone mieszkania", decay: 0.06 },
  { theme: "flat", name: "PI\u0118TRO II", sub: "spl\u0105drowane pokoje", decay: 0.2 },
  { theme: "flat", name: "PI\u0118TRO III", sub: "kto\u015B tu jeszcze by\u0142", decay: 0.34 },
  { theme: "flat", name: "PI\u0118TRO IV", sub: "rozbite szyby, papier na pod\u0142ogach", decay: 0.48 },
  { theme: "decay", name: "PI\u0118TRO V", sub: "zalane pi\u0119tro", decay: 0.6 },
  { theme: "decay", name: "PI\u0118TRO VI", sub: "spalone mieszkania", decay: 0.72 },
  { theme: "decay", name: "PI\u0118TRO VII", sub: "grzyb po\u017Cera \u015Bciany", decay: 0.86 },
  { theme: "decay", name: "PI\u0118TRO VIII", sub: "ruina tu\u017C przed dachem", decay: 1 },
  { theme: "roof", name: "DACH", sub: "Wielki czeka przy flarze", decay: 0 }
];
var NOTES = [
  "Nie otwieraj windy. Co\u015B tam oddycha.",
  "Klucz do schod\xF3w: szafka w g\u0142\xF3wnym korytarzu. Nie zapomnij go zabra\u0107.",
  "\u015Awiat\u0142o ich \u015Bci\u0105ga. Ga\u015B latark\u0119 przy drzwiach.",
  "S\u0142ysza\u0142am bieg pi\u0119tro wy\u017Cej. To nie by\u0142y dzieci.",
  "Flara ekipy le\u017Cy na dachu, przy czerwonych skrzynkach.",
  "Je\u015Bli czytasz: nie krzycz. S\u0142ysz\u0105 przez beton.",
  "Nowak z czternastki zaryglowa\u0142 \u0142azienk\u0119. Ju\u017C nie puka.",
  "Amunicji jest ma\u0142o. Licz strza\u0142y.",
  "\u0141om jest cichy. Strza\u0142 budzi ca\u0142e pi\u0119tro.",
  "Na dachu wida\u0107 \u015Bwit. Je\u015Bli dotrzesz \u2014 odpal flar\u0119."
];

// src/game/checkpoint.ts
var CHECKPOINT_VERSION = 3;
var record = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var number = (v, min = 0, max = Infinity) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
var integer = (v, min = 0, max = Infinity) => number(v, min, max) && Number.isInteger(v);
var bool = (v) => typeof v === "boolean";
var stage = ["idle", "warning", "settled", "venting"];
function environment(v) {
  return record(v) && number(v.clock) && record(v.features) && Object.values(v.features).every((f) => record(f) && stage.some((s) => s === f.stage) && number(f.since) && number(f.progress, 0, 1) && bool(f.off));
}
function inventory(v) {
  if (!record(v) || !Array.isArray(v.owned) || !Array.isArray(v.slots) || v.slots.length !== 3 || !integer(v.active, 0, 2)) return false;
  const slots = v.slots, owned = v.owned;
  return !!slots[v.active] && owned.every(isWeapon) && slots.every((id) => id === null || isWeapon(id) && owned.includes(id)) && new Set(slots.filter(Boolean)).size === slots.filter(Boolean).length && record(v.magazines) && owned.every((id) => isWeapon(id) && record(v.magazines) && integer(v.magazines[id])) && record(v.stock) && integer(v.stock.rounds) && integer(v.stock.shells) && integer(v.stock.bolts);
}
function position(v) {
  return number(v.x, 0, MAP_W * TILE) && number(v.y, 0, MAP_H * TILE);
}
function savedFloor(v) {
  if (!record(v) || !integer(v.layout, 0, 4294967295) || !bool(v.hasKey) || !environment(v.environment)) return false;
  return typeof v.explored === "string" && v.explored.length === MAP_W * MAP_H && /^[01]+$/.test(v.explored) && Array.isArray(v.opened) && v.opened.every((id) => integer(id)) && Array.isArray(v.survivorsGone) && v.survivorsGone.every((id) => integer(id)) && Array.isArray(v.doors) && v.doors.every((d) => record(d) && integer(d.x, 0, MAP_W - 1) && integer(d.y, 0, MAP_H - 1) && bool(d.open) && bool(d.broken) && bool(d.locked) && number(d.hp, -20, 20)) && (v.tactical === void 0 || tactical(v.tactical)) && Array.isArray(v.zombies) && v.zombies.every((z) => record(z) && position(z) && number(z.hp) && integer(z.home, -1) && ["idle", "chase", "dead"].includes(String(z.state)) && ["shambler", "runner", "brute", "boss", "crawler"].includes(String(z.kind)) && bool(z.screamer) && bool(z.reinforcement) && number(z.alertT, -100) && number(z.lastX) && number(z.lastY));
}
function tactical(v) {
  return record(v) && number(v.clock) && number(v.playerNoise, 0, 100) && number(v.arousal, 0, 100) && number(v.waveBudget, 0, 6) && number(v.nextRoll) && number(v.lastWave, -100) && integer(v.waveCount) && Array.isArray(v.events) && record(v.devices) && record(v.barrels) && Object.values(v.devices).every((d) => record(d) && bool(d.on) && number(d.x) && number(d.y) && (d.kind === "radio" || d.kind === "tv")) && Object.values(v.barrels).every((b) => record(b) && ["idle", "warning", "spent"].includes(String(b.stage)) && number(b.fuse, -1e-3));
}
function floorQuest(v) {
  return record(v) && integer(v.stage, 0, 10) && bool(v.inspected) && bool(v.fuseTaken) && bool(v.codeFound) && bool(v.serviceUnlocked) && bool(v.serviceForced) && bool(v.lureUsed) && bool(v.lureResolved) && number(v.bypassProgress, 0, 1) && bool(v.bypassOpen) && bool(v.landingBypassOpen) && bool(v.landingStashOpened) && bool(v.resolved);
}
function building(v) {
  if (!record(v) || !bool(v.elevatorPowered) || !bool(v.elevatorEmergencyOnly) || !integer(v.elevatorFloor, 0, FLOOR_COUNT - 1) || !(v.elevatorOpenFloor === null || integer(v.elevatorOpenFloor, 0, FLOOR_COUNT - 1)) || !bool(v.elevatorBroken) || !bool(v.elevatorFaultUsed) || !integer(v.elevatorSpecialCount, 0, 100) || !number(v.elevatorArrival, 0, 30) || !integer(v.elevatorCallFloor, -1, FLOOR_COUNT - 1) || !integer(v.npcTotal, 0, 1e3) || !integer(v.npcDrought, 0, 1e3) || !number(v.nextNpcAt) || !record(v.quests) || !Object.values(v.quests).every(floorQuest) || !Array.isArray(v.journal) || !v.journal.every((entry) => typeof entry === "string")) return false;
  if (v.elevatorRide !== null) {
    const ride = v.elevatorRide;
    if (!record(ride) || !integer(ride.from, 0, FLOOR_COUNT - 1) || !integer(ride.to, 0, FLOOR_COUNT - 1) || !number(ride.elapsed, 0, 60) || !["doors", "accel", "moving", "jolt", "stranded", "escape", "arrive", "stop", "ledge"].includes(String(ride.phase)) || !["routine", "rattle", "stop", "threat", "mid-shaft", "fault"].includes(String(ride.variant)) || !number(ride.cabinX, -40, 40) || !number(ride.cabinY, -40, 40) || !number(ride.doorOpen, 0, 1) || !number(ride.leverProgress, 0, 1)) return false;
  }
  if (v.passage !== null) {
    const p = v.passage;
    if (!record(p) || !integer(p.from, 0, FLOOR_COUNT - 1) || !integer(p.to, 0, FLOOR_COUNT - 1) || !["stairsA", "stairsB", "service", "ledge"].includes(String(p.route)) || !number(p.x, -100, 300) || !number(p.y, -100, 300) || !["empty", "window", "stash", "obstacle", "traces", "broken-flight"].includes(String(p.feature)) || !bool(p.stashLooted) || !number(p.bypassProgress, 0, 1) || !bool(p.bypassOpen) || !bool(p.soundPlayed)) return false;
  }
  return true;
}
function parseCheckpoint(text) {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    if (!record(v) || v.version !== CHECKPOINT_VERSION || !integer(v.seed, 0, 4294967295) || !integer(v.floor, 0, FLOOR_COUNT - 1)) return null;
    if (!number(v.time) || !integer(v.kills) || !bool(v.bossKilled) || !inventory(v.pack) || !building(v.building)) return null;
    if (!record(v.hero) || !position(v.hero) || !number(v.hero.hp, 1, 100) || !number(v.hero.stamina, 0, 100) || !number(v.hero.battery, 0, 100) || !bool(v.hero.flash)) return null;
    if (!Array.isArray(v.floors) || v.floors.length !== FLOOR_COUNT || !v.floors.every((f) => f === null || savedFloor(f)) || !v.floors[v.floor]) return null;
    return v;
  } catch {
    return null;
  }
}

// src/game/path.ts
function astar(w, h, sx, sy, gx, gy, walkable) {
  if (sx === gx && sy === gy) return [];
  if (!walkable(gx, gy)) return null;
  const key = (x, y) => y * w + x;
  const open = [{ x: sx, y: sy, g: 0, f: 0 }];
  const gScore = /* @__PURE__ */ new Map();
  gScore.set(key(sx, sy), 0);
  const came = /* @__PURE__ */ new Map();
  const closed = /* @__PURE__ */ new Set();
  let nodes = 0;
  while (open.length && nodes < 2200) {
    nodes++;
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    if (cur.x === gx && cur.y === gy) {
      const path = [];
      let k = ck;
      let x = cur.x;
      let y = cur.y;
      while (!(x === sx && y === sy)) {
        path.push({ x, y });
        const prev = came.get(k);
        if (prev === void 0) break;
        x = prev % w;
        y = prev / w | 0;
        k = prev;
      }
      path.reverse();
      return path;
    }
    closed.add(ck);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!walkable(nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = cur.g + 1;
      if (ng < (gScore.get(nk) ?? 1e9)) {
        gScore.set(nk, ng);
        came.set(nk, ck);
        open.push({ x: nx, y: ny, g: ng, f: ng + Math.abs(nx - gx) + Math.abs(ny - gy) });
      }
    }
  }
  return null;
}

// src/game/rng.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const base = mulberry32(seed);
  const rng = base;
  rng.int = (n) => n <= 1 ? 0 : Math.floor(base() * n);
  rng.chance = (p) => base() < p;
  rng.pick = (arr) => arr[Math.floor(base() * arr.length)];
  return rng;
}
function hash2(x, y, salt = 0) {
  let n = x * 374761393 + y * 668265263 + salt * 1442695041 | 0;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

// src/game/environment-layout.ts
var CARDINAL = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
var walkTiles = /* @__PURE__ */ new Set([Tile.Floor, Tile.Rubble, Tile.Puddle, Tile.StairsUp, Tile.StairsDown, Tile.Door, Tile.DoorOpen]);
var maintenance = ["WARSZTAT", "KOT\u0141OWNIA", "PRALNIA", "\u0141AZIENKA", "SCHOWEK"];
var woodRooms = ["SALON", "SYPIALNIA", "POK\xD3J DZIECI\u0118CY", "LOKAL U\u017BYTKOWY", "SCHOWEK"];
var annexNames = ["DAWNY WARSZTAT", "SCHOWEK LOKATORA", "KRYJ\xD3WKA OCALA\u0141EGO", "MAGAZYN", "ZABARYKADOWANE MIESZKANIE"];
var shift = (p, v, n = 1) => ({ x: p.x + v.x * n, y: p.y + v.y * n });
var center = (p) => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE });
var sameCell = (p, q) => p.x === q.x && p.y === q.y;
function cellOf(x, y) {
  return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
}
function plannedBlocks(plan) {
  return plan.features.flatMap((f) => {
    switch (f.kind) {
      case "obstruction":
        return [f.at, f.park, f.gate];
      case "shelf":
        return [f.at, f.landing];
      case "wire":
      case "steam":
      case "gas":
      case "surface":
        return f.cells;
      case "weak":
        return [f.at];
      default:
        return [];
    }
  });
}
function plannedAccess(plan) {
  return plan.features.flatMap((f) => {
    switch (f.kind) {
      case "wall":
        return [f.front];
      case "obstruction":
      case "shelf":
        return [f.stand];
      case "steam":
        return [f.control, ...f.shortcut?.approaches ?? []];
      case "wire":
      case "gas":
        return f.control ? [f.control] : [];
      default:
        return [];
    }
  });
}
function routeCheck(f) {
  const size = f.w * f.h;
  const idx3 = (p) => p.y * f.w + p.x;
  const propBlock = new Uint8Array(size);
  const key = f.props.find((p) => p.id === f.keyPropId && p.loot === "key");
  const required = f.props.filter((p) => p.loot !== null && p.loot !== "key");
  for (const p of f.props) if (p.solid) {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) propBlock[y * f.w + x] = 1;
  }
  const start = idx3(cellOf(f.playerStart.x, f.playerStart.y));
  const reach = (blocked, lock) => {
    const seen = new Uint8Array(size);
    if (blocked[start]) return seen;
    const closed = new Set(f.doors.filter((d) => d.sealed || lock && d.locked).map(idx3));
    const q = new Int32Array(size);
    q[0] = start;
    seen[start] = 1;
    let tail = 1;
    const push = (i) => {
      if (!seen[i] && !blocked[i] && !closed.has(i) && walkTiles.has(f.tiles[i])) {
        seen[i] = 1;
        q[tail++] = i;
      }
    };
    for (let head = 0; head < tail; head++) {
      const i = q[head];
      if (i % f.w > 0) push(i - 1);
      if (i % f.w < f.w - 1) push(i + 1);
      if (i >= f.w) push(i - f.w);
      if (i < size - f.w) push(i + f.w);
    }
    return seen;
  };
  const search = (p, seen) => {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      if (CARDINAL.some((d) => seen[idx3(shift({ x, y }, d))])) return true;
    }
    return false;
  };
  const before = reach(propBlock, true);
  return {
    before,
    safe(blocks, access) {
      const block = propBlock.slice();
      for (const p of blocks) block[idx3(p)] = 1;
      const early = reach(block, true);
      if (!access.every((p) => early[idx3(p)]) || key && !search(key, early)) return false;
      if (f.stairsDown && !early[idx3(f.stairsDown)]) return false;
      const open = key ? reach(block, false) : early;
      return (!f.stairsUp || !!open[idx3(f.stairsUp)]) && required.every((p) => search(p, open));
    }
  };
}
function validateEnvironment(f) {
  const plan = f.environment;
  if (!plan) return null;
  return routeCheck(f).safe(plannedBlocks(plan), plannedAccess(plan)) ? null : "environment cuts off the safe route";
}
function populateEnvironment(f) {
  const plan = { features: [], annexes: [] };
  f.environment = plan;
  if (f.theme === "roof") return f;
  const rng = makeRng(f.seed ^ 2715449271);
  const idx3 = (p) => p.y * f.w + p.x;
  const tile2 = (p) => f.tiles[idx3(p)];
  const roomAt = (p) => f.rooms[f.roomOf[idx3(p)]];
  const start = cellOf(f.playerStart.x, f.playerStart.y);
  const dist = (p, q = start) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
  const within = (p) => p.x > 0 && p.y > 0 && p.x < f.w - 1 && p.y < f.h - 1;
  const route = routeCheck(f);
  const reserved = /* @__PURE__ */ new Set();
  const occupied = /* @__PURE__ */ new Set();
  const roomsUsed = /* @__PURE__ */ new Set();
  const baseRooms = [...f.rooms];
  for (const p of f.props) {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) occupied.add(idx3({ x, y }));
  }
  for (const actor of [...f.zombies, ...f.survivors]) occupied.add(idx3(cellOf(actor.x, actor.y)));
  const free = (p) => within(p) && tile2(p) === Tile.Floor && dist(p) >= 6 && !!route.before[idx3(p)] && (!roomAt(p) || roomAt(p)?.role === "normal") && !occupied.has(idx3(p)) && !reserved.has(idx3(p));
  const reserve = (spots) => {
    for (const p of spots) reserved.add(idx3(p));
  };
  const safe2 = (blocks, access) => route.safe([...plannedBlocks(plan), ...blocks], [...plannedAccess(plan), ...access]);
  const add = (feature) => plan.features.push(feature);
  const id = () => plan.features.length + 1;
  const shuffled = (list) => list.map((v) => ({ v, key: rng() })).sort((a, b) => a.key - b.key).map(({ v }) => v);
  function cache(room, slot, p, loot, kind = "supplycase") {
    return { ...p, id: 1e4 + room * 16 + slot, kind, w: 1, h: 1, solid: true, loot, opened: false, label: "przeszukaj skrytk\u0119" };
  }
  function annex(kind) {
    const choices = [];
    for (const side of [-1, 1]) for (let y = 5; y < f.h - 10; y++) {
      const x = side < 0 ? 1 : f.w - 3;
      const h = 5 + y % 2;
      const gate = { x: side < 0 ? x + 2 : x - 1, y: y + 1 };
      const front = shift(gate, { x: -side, y: 0 });
      const stand = shift(front, { x: -side, y: 0 });
      const park = shift(front, { x: 0, y: 1 });
      if (![front, stand, park].every(free)) continue;
      if (kind === "flooded" && !free(shift(stand, { x: 0, y: 1 }))) continue;
      let sealed = true;
      for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + 2; xx++) {
        if (f.tiles[yy * f.w + xx] !== Tile.Wall || reserved.has(yy * f.w + xx)) sealed = false;
      }
      if (sealed) choices.push({ gate, front, stand, park, side, x, y, h });
    }
    const ordered = shuffled(choices).sort((a, b) => {
      return f.index === 0 && kind === "obstruction" ? Math.floor(dist(a.front) / 8) - Math.floor(dist(b.front) / 8) : 0;
    });
    for (const c of ordered) {
      const { gate, front, stand, park, side, x, y, h } = c;
      const control = shift(stand, { x: 0, y: 1 });
      if (!safe2(kind === "obstruction" ? [front, park, gate] : kind === "wall" ? [front] : [], [kind === "wall" ? stand : kind === "flooded" ? control : stand])) continue;
      const r = { id: f.rooms.length, x, y, w: 2, h, role: "normal", lit: kind === "flooded" || rng.chance(0.27), flicker: true };
      const type = rng.int(annexNames.length);
      f.rooms.push(r);
      f.roomZones.push(kind === "flooded" ? "ZALANY MAGAZYN" : annexNames[type]);
      roomsUsed.add(r.id);
      for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + 2; xx++) {
        const i = yy * f.w + xx;
        reserved.add(i);
        f.wallStyle[i] = type < 3 ? 3 : 4;
        if (yy < y || yy >= y + h || xx < x || xx >= x + 2) continue;
        f.tiles[i] = Tile.Floor;
        f.floorStyle[i] = type === 4 ? 5 : type === 2 ? 0 : 3;
        f.roomOf[i] = r.id;
      }
      const inside2 = shift(gate, { x: side, y: 0 });
      f.floorStyle[idx3(gate)] = f.floorStyle[idx3(inside2)];
      const seal = kind === "flooded" ? null : id();
      const eligible = Object.entries(DISCOVERIES).filter(([floor]) => Number(floor) <= f.index).map(([, weapon]) => weapon);
      let reward = rng.pick(["ammo", "ammo", "med", "battery", f.index >= 4 ? "shells" : "ammo", f.index >= 6 ? "bolts" : "battery"]);
      if (eligible.length && rng.chance(kind === "flooded" ? 0.2 : 0.32)) reward = rng.pick(eligible);
      const props = [cache(r.id, 0, { x: side < 0 ? x : x + 1, y: y + h - 1 }, reward, reward === "med" ? "medbox" : "supplycase")];
      const second = rng.pick(["med", "battery", "ammo"]);
      if (type < 4 || kind === "flooded") props.push(cache(r.id, 1, { x: inside2.x, y: y + h - 1 }, second, second === "med" ? "medbox" : "supplycase"));
      const decor = ["washer", "locker", "chair", "barrel", "stove"][type];
      props.push({ ...cache(r.id, 2, { x: side < 0 ? x : x + 1, y }, null, decor), label: void 0 });
      const guard = kind !== "flooded" && f.index > 0 && (type === 4 || rng.chance(0.14)) ? { ...center({ x: inside2.x, y: y + h - 2 }), kind: "shambler", room: r.id } : void 0;
      plan.annexes.push({ room: r.id, seal, props, guard });
      if (r.lit) f.lights.push({ ...center({ x: inside2.x, y: y + 2 }), roomId: r.id, kind: "fluor", radius: 52, flicker: true });
      reserve([front, stand, park, ...kind === "flooded" ? [control] : []]);
      if (kind === "wall") {
        add({ id: id(), kind, at: gate, front, back: inside2, room: r.id, landing: [front, inside2] });
      } else if (kind === "obstruction") {
        f.tiles[idx3(gate)] = Tile.Door;
        f.doors.push({ ...gate, hp: 4, locked: false, sealed: true, open: false, broken: false });
        const material = rng.pick(["cabinet", "fridge", "dresser", "bookcase", "boards", "upturned"]);
        add({ id: id(), kind, at: front, gate, stand, park, room: r.id, material });
      } else {
        f.tiles[idx3(gate)] = Tile.DoorOpen;
        f.doors.push({ ...gate, hp: 4, locked: false, open: true, broken: false });
        const cells = [{ x, y: y + 2 }, { x: x + 1, y: y + 2 }, { x: inside2.x, y: y + 3 }];
        for (const p of cells) f.tiles[idx3(p)] = Tile.Puddle;
        add({ id: id(), kind: "wire", at: cells[1], room: r.id, mode: "pool", mount: "floor", phase: rng() * 5, cells, control });
      }
      return true;
    }
    return false;
  }
  annex("obstruction");
  annex("wall");
  const flooded = (f.index === 0 || f.index >= 3) && rng.chance(f.index === 0 ? 0.82 : 0.55) && annex("flooded");
  function rooms2(zones) {
    return shuffled(baseRooms.filter((r) => r.role === "normal" && !roomsUsed.has(r.id) && zones.includes(f.roomZones[r.id])));
  }
  function roomCells2(r) {
    const cells = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const p = { x, y };
      if (free(p)) cells.push(p);
    }
    return shuffled(cells);
  }
  function selectControl(r, at, area) {
    const near = roomCells2(r).filter((c) => dist(at, c) >= 2 && dist(at, c) <= 5 && !area.some((p) => sameCell(p, c)));
    return near.find((c) => safe2(area, [c]));
  }
  for (const r of rooms2([...maintenance, "KUCHNIA", "KORYTARZ"])) {
    const at = roomCells2(r).find((p) => safe2([p], []));
    if (!at) continue;
    const mode = f.index % 2 === 0 ? "pulse" : "steady";
    const control = f.roomZones[r.id] !== "KORYTARZ" && r.lit && rng.chance(0.7) ? selectControl(r, at, [at]) : void 0;
    const onWall = CARDINAL.some((d) => tile2(shift(at, d)) === Tile.Wall);
    add({ id: id(), kind: "wire", at, room: r.id, mode, mount: onWall ? "wall" : rng.pick(["ceiling", "floor"]), phase: rng() * 5, cells: [at], control });
    reserve(control ? [at, control] : [at]);
    if (f.roomZones[r.id] !== "KORYTARZ") roomsUsed.add(r.id);
    break;
  }
  if (!flooded && f.index >= 2 && rng.chance(0.36)) annex("flooded");
  function steamShortcut() {
    const blocked = new Set(plannedBlocks(plan).map(idx3));
    const props = new Set(f.props.filter((p) => p.solid).flatMap((p) => Array.from({ length: p.w * p.h }, (_, i) => idx3({ x: p.x + i % p.w, y: p.y + Math.floor(i / p.w) }))));
    const canPass = (x, y) => {
      const i = idx3({ x, y });
      return !!route.before[i] && !blocked.has(i) && !props.has(i) && walkTiles.has(f.tiles[i]);
    };
    for (const r of rooms2([...maintenance, "KORYTARZ"])) for (const front of roomCells2(r)) for (const heading of shuffled(CARDINAL)) {
      const gate = shift(front, heading), back = shift(gate, heading);
      const inlet = shift(front, heading, -1), approach = shift(inlet, heading, -1), other = shift(back, heading);
      if (tile2(gate) !== Tile.Wall || reserved.has(idx3(gate)) || ![inlet, approach, back, other].every(free)) continue;
      const next = roomAt(back);
      if (!next || next === r || roomsUsed.has(next.id) || roomAt(other) !== next || roomAt(inlet) !== r) continue;
      const detour = astar(f.w, f.h, approach.x, approach.y, other.x, other.y, canPass);
      if (!detour || detour.length < 14) continue;
      const cells = [inlet, front];
      const control = selectControl(r, inlet, [...cells, back]);
      if (!control || !safe2([...cells, back], [control, approach, other])) continue;
      f.tiles[idx3(gate)] = Tile.Rubble;
      f.floorStyle[idx3(gate)] = f.floorStyle[idx3(front)];
      f.breaches.push(gate);
      add({ id: id(), kind: "steam", at: inlet, cells, control, heading, phase: rng() * 5, shortcut: { gate, approaches: [approach, other] } });
      add({ id: id(), kind: "surface", material: "glass", at: back, cells: [back] });
      reserve([...cells, back, gate, control, approach, other]);
      roomsUsed.add(r.id);
      roomsUsed.add(next.id);
      return true;
    }
    return false;
  }
  let steamPlaced = f.index > 0 && rng.chance(0.38) && steamShortcut();
  if (!steamPlaced && (f.index < 2 || rng.chance(0.73))) for (const r of rooms2([...maintenance, "KORYTARZ"])) {
    for (const at of roomCells2(r)) {
      const heading = shuffled(CARDINAL).find((d) => roomAt(shift(at, d))?.id === r.id && free(shift(at, d)));
      if (!heading) continue;
      const cells = [at, shift(at, heading)];
      const control = selectControl(r, at, cells);
      if (!control) continue;
      add({ id: id(), kind: "steam", at, cells, control, heading, phase: rng() * 5 });
      reserve([...cells, control]);
      roomsUsed.add(r.id);
      steamPlaced = true;
      const shard = shift(cells[1], heading);
      if (rng.chance(0.48) && free(shard) && roomAt(shard)?.id === r.id && safe2([shard], [])) {
        add({ id: id(), kind: "surface", at: shard, cells: [shard], material: "glass" });
        reserve([shard]);
      }
      break;
    }
    if (steamPlaced) break;
  }
  if (f.index > 0 && rng.chance(0.69)) {
    let placed = false;
    for (const r of rooms2(["KUCHNIA", "KOT\u0141OWNIA", "WARSZTAT"])) {
      for (const at of roomCells2(r)) {
        const near = shuffled(CARDINAL.map((d) => shift(at, d))).filter((p) => free(p) && roomAt(p)?.id === r.id);
        if (near.length < 2) continue;
        const cells = [at, ...near.slice(0, 2)];
        const control = selectControl(r, at, cells);
        if (!control) continue;
        add({ id: id(), kind: "gas", at, cells, control });
        if (rng.chance(0.35)) add({ id: id(), kind: "wire", at: cells[1], room: r.id, mode: "pulse", mount: "ceiling", phase: rng() * 5, cells: [cells[1]] });
        reserve([...cells, control]);
        roomsUsed.add(r.id);
        placed = true;
        break;
      }
      if (placed) break;
    }
  }
  if (f.index > 0 && rng.chance(0.74)) for (const r of rooms2(woodRooms)) {
    const at = roomCells2(r).find((p) => CARDINAL.filter((d) => free(shift(p, d))).length >= 2 && safe2([p], []));
    if (!at) continue;
    add({ id: id(), kind: "weak", at });
    reserve([at]);
    roomsUsed.add(r.id);
    break;
  }
  if (f.index === 0 || rng.chance(0.75)) {
    let placed = false;
    for (const r of rooms2([...woodRooms, ...maintenance])) {
      for (const at of roomCells2(r)) {
        for (const d of shuffled(CARDINAL)) {
          const landing = shift(at, d);
          const stand = shift(at, { x: d.y, y: -d.x });
          if (![landing, stand].every((p) => free(p) && roomAt(p)?.id === r.id) || !safe2([at, landing], [stand])) continue;
          const loot = rng.pick(["med", "ammo", "battery", f.index >= 4 ? "shells" : "ammo"]);
          const stash = { ...cache(r.id, 4, at, loot, loot === "med" ? "medbox" : "supplycase"), solid: false };
          add({ id: id(), kind: "shelf", at, landing, stand, stash });
          reserve([at, landing, stand]);
          roomsUsed.add(r.id);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (placed) break;
    }
  }
  for (const material of [rng.pick(["glass", "cans", "planks"]), rng.pick(["glass", "cans", "planks"])]) {
    for (const r of rooms2(material === "planks" ? woodRooms : ["KORYTARZ", "PRALNIA", "KUCHNIA", "SCHOWEK", "WARSZTAT"])) {
      const at = roomCells2(r).find((p) => safe2([p], []));
      if (!at) continue;
      const cells = [at];
      const other = shuffled(CARDINAL.map((d) => shift(at, d))).find((p) => free(p) && roomAt(p)?.id === r.id && safe2([at, p], []));
      if (other) cells.push(other);
      add({ id: id(), kind: "surface", at, cells, material });
      reserve(cells);
      roomsUsed.add(r.id);
      break;
    }
  }
  return f;
}

// src/game/environment.ts
var WALL_WARNING = 2;
var FLOOR_WARNING = 1.05;
var SHELF_WARNING = 1.1;
var GAS_WARNING = 1.55;
var GAS_CLEAR = 2.8;
var FURNITURE = {
  cabinet: { text: "przesu\u0144 szaf\u0119", time: 2.7, noise: 6, effort: 12 },
  fridge: { text: "przesu\u0144 lod\xF3wk\u0119", time: 3.6, noise: 9, effort: 15 },
  dresser: { text: "przesu\u0144 komod\u0119", time: 1.35, noise: 3, effort: 6 },
  bookcase: { text: "przesu\u0144 rega\u0142", time: 2.05, noise: 5, effort: 9 },
  boards: { text: "zdejmij deski", time: 2.75, noise: 5, effort: 7 },
  upturned: { text: "odsu\u0144 przewr\xF3cony mebel", time: 1.8, noise: 4, effort: 8 }
};
var cellBounds = (p, inset = 0) => ({ x: p.x * TILE + inset, y: p.y * TILE + inset, w: TILE - inset * 2, h: TILE - inset * 2 });
var overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
var inside = (p, r) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
var distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
var lerp = (a, b, t) => a + (b - a) * t;
var newRecord = () => ({ stage: "idle", since: 0, progress: 0, off: false });
function touches(p, radius, r) {
  const dx = p.x - Math.max(r.x, Math.min(p.x, r.x + r.w));
  const dy = p.y - Math.max(r.y, Math.min(p.y, r.y + r.h));
  return dx * dx + dy * dy < radius * radius;
}
function createEnvironmentState() {
  return { clock: 0, features: {} };
}
function cycleFor(f, state, clock) {
  if (state.off) return "off";
  if (f.kind === "wire" && f.mode !== "pulse") return "live";
  const steam2 = f.kind === "steam";
  const t = (clock + f.phase) % (steam2 ? 6.3 : 5.6);
  if (t < (steam2 ? 3.5 : 3.3)) return "safe";
  if (t < (steam2 ? 4.85 : 4.55)) return "charging";
  return "live";
}
function effectBounds(f) {
  switch (f.kind) {
    case "wire":
      return f.cells.map((p) => cellBounds(p, f.mode === "pool" ? 0 : 2));
    case "wall":
      return f.landing.map((p) => cellBounds(p));
    case "steam":
      return f.cells.map((p) => {
        const r = cellBounds(p);
        return f.heading.x ? { ...r, y: r.y + 3, h: r.h - 6 } : { ...r, x: r.x + 3, w: r.w - 6 };
      });
    case "gas":
    case "surface":
      return f.cells.map((p) => cellBounds(p));
    case "shelf":
      return [cellBounds(f.landing)];
    case "weak":
      return [cellBounds(f.at)];
    default:
      return [];
  }
}
function furnitureBounds(f, progress) {
  return { ...cellBounds(f.at), x: lerp(f.at.x, f.park.x, progress) * TILE, y: lerp(f.at.y, f.park.y, progress) * TILE };
}
var Environment = class {
  constructor(floor, state, world) {
    this.floor = floor;
    this.state = state;
    this.world = world;
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
        this.adjacency.set(i, [...this.adjacency.get(i) ?? [], f]);
      }
      this.apply(f);
    }
    this.reindex();
  }
  floor;
  state;
  world;
  features;
  jets;
  sealed = /* @__PURE__ */ new Map();
  dark = /* @__PURE__ */ new Set();
  zones = /* @__PURE__ */ new Map();
  adjacency = /* @__PURE__ */ new Map();
  effects = /* @__PURE__ */ new Map();
  heard = /* @__PURE__ */ new Map();
  cycles = /* @__PURE__ */ new Map();
  warned = /* @__PURE__ */ new Set();
  blockers = [];
  work = null;
  get clock() {
    return this.state.clock;
  }
  get working() {
    return this.work;
  }
  read(f) {
    return this.state.features[f.id];
  }
  cancelWork() {
    this.work = null;
  }
  roomDark(room) {
    return this.dark.has(room);
  }
  roomHidden(room) {
    const id = this.sealed.get(room);
    return id !== void 0 && this.state.features[id].stage !== "settled";
  }
  idx(p) {
    return p.y * this.floor.w + p.x;
  }
  tile(p) {
    return this.floor.tiles[this.idx(p)];
  }
  apply(f) {
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
      case "weak":
        this.floor.tiles[this.idx(f.at)] = Tile.Hole;
        break;
      case "shelf":
        if (!this.floor.props.some((p) => p.id === f.stash.id)) this.floor.props.push({ ...f.stash });
        break;
    }
  }
  reindex() {
    this.blockers = [];
    for (const f of this.features) {
      const s = this.read(f);
      if (f.kind === "obstruction") this.blockers.push(furnitureBounds(f, s.progress));
      if (f.kind === "shelf") this.blockers.push(cellBounds(s.stage === "settled" ? f.landing : f.at));
    }
  }
  blocksTile(x, y) {
    return this.blockers.some((b) => overlap(cellBounds({ x, y }), b));
  }
  blocksBody(x, y, radius) {
    return this.blockers.some((b) => touches({ x, y }, radius, b));
  }
  slow(id) {
    return (this.effects.get(id)?.slow ?? 0) > this.clock;
  }
  inSteam(x, y) {
    return this.jets.some((f) => cycleFor(f, this.read(f), this.clock) === "live" && this.zoneAt(f, { x, y }));
  }
  status(f, stage2) {
    const s = this.read(f);
    s.stage = stage2;
    s.since = this.clock;
  }
  zoneAt(f, p) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    const tile2 = this.tile({ x: tx, y: ty });
    if (tx < 0 || ty < 0 || tx >= this.floor.w || ty >= this.floor.h || tile2 === Tile.Wall || tile2 === Tile.Door || tile2 === Tile.Window || tile2 === Tile.Sky || tile2 === Tile.Hole) return false;
    return !!this.zones.get(f.id)?.some((b) => inside(p, b));
  }
  hit(actor, damage, at, interval, slow) {
    const last = this.effects.get(actor.id);
    if (last && this.clock < last.next) return;
    this.effects.set(actor.id, { next: this.clock + interval, slow: Math.max(last?.slow ?? 0, this.clock + slow) });
    this.world.hit(actor, damage, at);
  }
  hitZone(f, actors, damage, interval, slow) {
    for (const a of actors) if (this.zoneAt(f, a)) this.hit(a, damage, center(f.at), interval, slow);
  }
  target() {
    const player = this.world.player();
    if (player.hidden || player.busy) return null;
    let best = null;
    let range = 20;
    for (const f of this.features) {
      const s = this.read(f);
      let location;
      let text = "";
      let hold = false;
      if (f.kind === "wire" && !s.off && f.control) {
        location = f.control;
        text = "od\u0142\u0105cz obw\xF3d";
      } else if (f.kind === "steam" && !s.off) {
        location = f.control;
        text = "zamknij zaw\xF3r pary";
      } else if (f.kind === "gas" && !s.off && s.stage !== "settled") {
        location = f.control;
        text = "zamknij zaw\xF3r gazu";
      } else if (f.kind === "shelf" && s.stage === "idle") {
        location = f.at;
        text = "przewr\xF3\u0107 rega\u0142";
      } else if (f.kind === "obstruction" && s.stage !== "settled") {
        if (distance(player, center(f.stand)) >= 13) continue;
        location = f.at;
        text = FURNITURE[f.material].text;
        hold = true;
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
      this.world.say("Obw\xF3d od\u0142\u0105czony. Lampy w tej cz\u0119\u015Bci bloku zgas\u0142y.");
    } else if (f.kind === "steam") {
      s.off = true;
      this.status(f, "settled");
      this.world.sound("valve", t.at);
      this.world.say("Para opada. Przej\u015Bcie jest bezpieczne.");
    } else if (f.kind === "gas") {
      s.off = true;
      this.status(f, "venting");
      this.world.sound("valve", t.at);
      this.world.say("Zaw\xF3r zamkni\u0119ty. Opary jeszcze si\u0119 utrzymuj\u0105.");
    } else if (f.kind === "shelf") this.tipShelf(f);
    return true;
  }
  updateWork(dt, holding, stamina, tool) {
    this.work = null;
    if (!holding) return null;
    const target = this.target();
    if (!target || target.feature.kind !== "obstruction") return null;
    const f = target.feature, s = this.read(f), spec = FURNITURE[f.material];
    const pace = (stamina < 18 ? 0.55 : 1) * (f.material === "boards" && tool ? 1.65 : 1);
    const next = Math.min(1, s.progress + dt * pace / spec.time);
    const pose = furnitureBounds(f, next);
    if (this.world.actors().some((a) => touches(a, a.radius, pose))) {
      if (this.ping(f, 1.2)) this.world.say("Co\u015B blokuje miejsce, w kt\xF3re przesuwasz przeszkod\u0119.");
      return null;
    }
    const stage2 = Math.floor(s.progress * 3);
    s.progress = next;
    this.reindex();
    this.work = { id: f.id, face: target.at, effort: spec.effort };
    if (f.material === "boards" && Math.floor(next * 3) > stage2 || this.ping(f, 0.48)) {
      this.world.sound(f.material === "fridge" ? "scrape" : "strain", target.at);
      this.world.alert(center(f.stand), spec.noise);
      this.world.dust(center(f.at), "#a08a69", f.material === "boards" ? 6 : 3, 22);
    }
    if (next >= 1) {
      this.status(f, "settled");
      this.apply(f);
      this.world.changed();
      this.world.sound("switch", center(f.gate));
      this.world.say("Przej\u015Bcie ods\u0142oni\u0119te. Za drzwiami jest jeszcze jeden pok\xF3j.");
    }
    return this.work;
  }
  ping(f, interval) {
    if ((this.heard.get(f.id) ?? -Infinity) > this.clock) return false;
    this.heard.set(f.id, this.clock + interval);
    return true;
  }
  tipShelf(f) {
    this.status(f, "warning");
    this.world.sound("strain", center(f.at));
    this.world.say("Rega\u0142 si\u0119 przechyla. Odsu\u0144 si\u0119 z drogi!");
  }
  strike(aim, reach) {
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
  footstep(p, sprint) {
    const key = this.idx({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
    for (const f of this.adjacency.get(key) ?? []) {
      if (f.kind !== "surface" || !this.zoneAt(f, p) || !this.ping(f, sprint ? 0.28 : 0.42)) continue;
      const s = this.read(f);
      s.progress = Math.min(1, s.progress + (sprint ? 0.4 : 0.19));
      s.since = this.clock;
      const distance2 = f.material === "cans" ? sprint ? 9 : 4 : f.material === "planks" ? sprint ? 7 : 1.7 : sprint ? 7 : 2.4;
      this.world.sound(f.material, p);
      this.world.alert(p, distance2);
      this.world.dust(p, f.material === "glass" ? "#bfd5d4" : "#aa9573", sprint ? 7 : 3, 32);
      if (sprint && f.material === "glass") this.hit(this.world.player(), 4, p, 1.35, 0.16);
    }
  }
  ignite(at) {
    for (const f of this.features) {
      if (f.kind !== "gas" || this.read(f).stage !== "idle" || !this.zoneAt(f, at)) continue;
      this.status(f, "warning");
      this.world.sound("hiss", center(f.at));
      if (distance(this.world.player(), center(f.at)) < 5 * TILE) this.world.say("Czu\u0107 gaz. Opary zaczynaj\u0105 si\u0119 zapala\u0107!");
    }
  }
  update(dt) {
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
        case "wire":
        case "steam": {
          const cycle = cycleFor(f, s, this.clock);
          const previous = this.cycles.get(f.id);
          this.cycles.set(f.id, cycle);
          if (near && cycle === "charging" && previous !== cycle) this.world.sound(f.kind === "wire" ? "arc" : "hiss", at);
          if (cycle !== "live") break;
          if (near && (previous !== "live" || f.kind === "wire" && this.ping(f, 1.12))) this.world.sound(f.kind === "wire" ? "shock" : "steam", at);
          this.hitZone(f, actors, f.kind === "wire" ? f.mode === "pulse" ? 16 : 11 : 9, f.kind === "wire" ? 1.15 : 0.9, f.kind === "wire" ? 0.8 : 0.42);
          if (f.kind === "wire" && f.mode === "pulse") this.ignite(at);
          break;
        }
        case "wall": {
          const face = center(f.front);
          const outwardX = f.front.x - f.at.x, outwardY = f.front.y - f.at.y;
          if (s.stage === "idle" && !p.hidden && distance(p, face) < 18 && (p.x - at.x) * outwardX + (p.y - at.y) * outwardY > TILE * 0.55 && this.world.clear(p, face)) {
            this.status(f, "warning");
            this.world.sound("crack", face);
            this.world.say("Tynk si\u0119 sypie. Cofnij si\u0119 od \u015Bciany!");
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
            this.world.say("Pod\u0142oga ugina si\u0119. Zejd\u017A z desek!");
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
  settle(f, noiseAt, radius) {
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
};

// src/game/vertical-layout.ts
var ELEVATOR_Y = 42;
var STAIRS_B_Y = 18;
var SERVICE_Y = 34;
var PASSABLE = /* @__PURE__ */ new Set([Tile.Floor, Tile.Rubble, Tile.Puddle, Tile.StairsUp, Tile.StairsDown, Tile.DoorOpen]);
var idx = (f, p) => p.y * f.w + p.x;
var inb = (f, p) => p.x >= 0 && p.y >= 0 && p.x < f.w && p.y < f.h;
function makeBuildingPlan(seed) {
  const rng = makeRng((seed ^ 9556539) >>> 0);
  const pool2 = [
    "broken-stairs",
    "flooded-route",
    "lure-horde",
    "service-shaft",
    "apartment-bypass"
  ];
  for (let i = pool2.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool2[i], pool2[j]] = [pool2[j], pool2[i]];
  }
  const floorQuests = {
    1: "repair-lift",
    2: pool2[0],
    3: pool2[1],
    5: pool2[2],
    6: pool2[3],
    8: pool2[4]
  };
  const variants = {};
  for (let fl = 0; fl < 10; fl++) {
    const roll = rng();
    if (roll < 0.14) variants[fl] = "rattle";
    else if (roll < 0.24) variants[fl] = "stop";
    else if (roll < 0.34) variants[fl] = "threat";
    else if (roll < 0.4 && fl >= 3 && fl <= 7) variants[fl] = "mid-shaft";
    else variants[fl] = "routine";
  }
  return {
    stairwellName: "KLATKA A",
    floorQuests,
    elevatorStops: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    serviceStops: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    elevatorVariants: variants
  };
}
function carveShaftAlcove(f, side, yTop, zoneName, route) {
  const x0 = side === "west" ? 1 : f.w - 3;
  const doorX = side === "west" ? 3 : f.w - 4;
  const outsideX = side === "west" ? 4 : f.w - 5;
  const yMid = yTop + 1;
  if (!inb(f, { x: outsideX, y: yMid })) return null;
  const outTile = f.tiles[idx(f, { x: outsideX, y: yMid })];
  if (outTile === Tile.Door) {
    const pairX = side === "west" ? outsideX + 1 : outsideX - 1;
    for (const cx of [outsideX, pairX]) {
      if (f.tiles[idx(f, { x: cx, y: yMid })] === Tile.Door) {
        f.tiles[idx(f, { x: cx, y: yMid })] = Tile.Floor;
        f.doors = f.doors.filter((d) => !(d.x === cx && d.y === yMid));
      }
    }
  } else if (!PASSABLE.has(outTile)) {
    return null;
  }
  for (let y = yTop; y <= yTop + 2; y++) {
    for (let x = x0; x <= x0 + 1; x++) {
      if (!inb(f, { x, y }) || f.tiles[idx(f, { x, y })] !== Tile.Wall) return null;
    }
  }
  const roomId = f.rooms.length;
  const room = {
    id: roomId,
    x: x0,
    y: yTop,
    w: 2,
    h: 3,
    role: "normal",
    lit: route !== "service",
    flicker: route === "elevator"
  };
  f.rooms.push(room);
  f.roomZones.push(zoneName);
  const cells = [];
  for (let y = yTop; y <= yTop + 2; y++) {
    for (let x = x0; x <= x0 + 1; x++) {
      const p = { x, y };
      cells.push(p);
      const i = idx(f, p);
      f.tiles[i] = Tile.Floor;
      f.floorStyle[i] = 3;
      f.roomOf[i] = roomId;
    }
  }
  for (let y = yTop - 1; y <= yTop + 3; y++) {
    for (let x = x0 - 1; x <= x0 + 2; x++) {
      if (!inb(f, { x, y })) continue;
      const onBorder = x === x0 - 1 || x === x0 + 2 || y === yTop - 1 || y === yTop + 3;
      if (onBorder && f.tiles[idx(f, { x, y })] === Tile.Wall) {
        f.wallStyle[idx(f, { x, y })] = 3;
      }
    }
  }
  const door = { x: doorX, y: yMid };
  f.tiles[idx(f, door)] = Tile.Door;
  f.floorStyle[idx(f, door)] = 3;
  f.props = f.props.filter((p) => !(outsideX >= p.x && outsideX < p.x + p.w && yMid >= p.y && yMid < p.y + p.h));
  f.doors = f.doors.filter((d) => !(d.x === door.x && d.y === door.y));
  f.doors.push({
    x: door.x,
    y: door.y,
    locked: false,
    hp: 6,
    open: route === "stairsB",
    broken: false,
    route
  });
  if (route === "stairsB") {
    f.tiles[idx(f, door)] = Tile.DoorOpen;
  }
  const center2 = { x: side === "west" ? x0 + 1 : x0, y: yMid };
  const panel = { x: side === "west" ? x0 : x0 + 1, y: yMid };
  const outside = { x: outsideX, y: yMid };
  return { room: roomId, cells, door, panel, center: center2, outside };
}
function installVerticalRoutes(f, runSeed) {
  if (f.theme === "roof" || f.index >= 10) return f;
  const rng = makeRng((f.seed ^ 1597463007) >>> 0);
  const plan = makeBuildingPlan(runSeed ?? f.seed);
  const elev = carveShaftAlcove(f, "west", ELEVATOR_Y, "WINDA OSOBOWA", "elevator");
  const serv = carveShaftAlcove(f, "east", SERVICE_Y, "PION TECHNICZNY", "service");
  const stB = carveShaftAlcove(f, "east", STAIRS_B_Y, "KLATKA B", "stairsB");
  if (stB) {
    f.tiles[idx(f, stB.panel)] = Tile.StairsUp;
  }
  const questKind = plan.floorQuests[f.index] ?? null;
  let landingFeature = rng.pick([
    "empty",
    "window",
    "stash",
    "obstacle",
    "traces",
    "window",
    "empty"
  ]);
  if (questKind === "broken-stairs") landingFeature = "broken-flight";
  f.vertical = {
    stairwell: plan.stairwellName,
    stairsUp: f.stairsUp,
    stairsDown: f.stairsDown,
    elevator: elev ? {
      room: elev.room,
      cells: elev.cells,
      door: elev.door,
      call: elev.outside,
      panel: elev.panel,
      center: elev.center,
      outside: elev.outside,
      label: "WINDA OSOBOWA"
    } : null,
    service: serv ? {
      room: serv.room,
      cells: serv.cells,
      door: serv.door,
      panel: serv.outside,
      center: serv.center,
      outside: serv.outside,
      label: "PION TECHNICZNY"
    } : null,
    stairsB: stB ? {
      room: stB.room,
      cells: stB.cells,
      door: stB.door,
      stairs: stB.panel,
      center: stB.center,
      outside: stB.outside,
      label: "KLATKA B"
    } : null,
    landingFeature,
    landingHasLoot: landingFeature === "stash" || landingFeature === "traces" && rng.chance(0.65),
    landingSoundHint: rng.chance(0.55),
    quest: null
  };
  return f;
}
function openRoomCells(f, room, avoid) {
  const out = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const p = { x, y };
      const i = idx(f, p);
      if (f.tiles[i] !== Tile.Floor || avoid.has(i)) continue;
      if (f.props.some((pr) => pr.solid && x >= pr.x && x < pr.x + pr.w && y >= pr.y && y < pr.y + pr.h)) continue;
      if (f.zombies.some((z) => Math.floor(z.x / TILE) === x && Math.floor(z.y / TILE) === y)) continue;
      out.push(p);
    }
  }
  return out;
}
function featureOccupied(f) {
  const set = /* @__PURE__ */ new Set();
  for (const feat of f.environment?.features ?? []) {
    set.add(idx(f, feat.at));
    if ("control" in feat && feat.control) set.add(idx(f, feat.control));
    if ("cells" in feat) for (const c of feat.cells) set.add(idx(f, c));
    if ("park" in feat) set.add(idx(f, feat.park));
    if ("landing" in feat && !Array.isArray(feat.landing)) set.add(idx(f, feat.landing));
  }
  return set;
}
function installVerticalQuests(f, runSeed) {
  if (!f.vertical || !f.environment || f.theme === "roof" || f.index >= 10) return f;
  const plan = makeBuildingPlan(runSeed ?? f.seed);
  const kind = plan.floorQuests[f.index];
  if (!kind) return f;
  const rng = makeRng((f.seed ^ 1015521573) >>> 0);
  const avoid = featureOccupied(f);
  const normalRooms = f.rooms.filter(
    (r) => r.role === "normal" && !["KORYTARZ", "WINDA OSOBOWA", "PION TECHNICZNY", "KLATKA B", "KLATKA SCHODOWA"].includes(f.roomZones[r.id])
  );
  if (kind === "repair-lift" && f.vertical.elevator) {
    let wire = f.environment.features.find((ft) => ft.kind === "wire" && ft.control);
    if (!wire) {
      const anyWire = f.environment.features.find((ft) => ft.kind === "wire");
      if (anyWire && anyWire.kind === "wire") {
        const wr = f.rooms[anyWire.room];
        const ctrl = wr ? openRoomCells(f, wr, avoid).find(
          (c) => Math.abs(c.x - anyWire.at.x) + Math.abs(c.y - anyWire.at.y) >= 2 && Math.abs(c.x - anyWire.at.x) + Math.abs(c.y - anyWire.at.y) <= 5
        ) : void 0;
        if (ctrl) {
          anyWire.control = ctrl;
          avoid.add(idx(f, ctrl));
          wire = anyWire;
        }
      }
    }
    const workshop = normalRooms.find((r) => f.roomZones[r.id] === "WARSZTAT") ?? normalRooms.find((r) => f.roomZones[r.id] === "SCHOWEK") ?? normalRooms[0];
    const fuseRoom = workshop;
    const fuseCell = fuseRoom ? openRoomCells(f, fuseRoom, avoid)[0] : void 0;
    f.vertical.quest = {
      kind: "repair-lift",
      wireId: wire?.id,
      fuseCell,
      fuseRoom: fuseRoom?.id,
      clueCell: f.vertical.elevator.outside,
      clueLabel: "Rozdzielnia B-4"
    };
    return f;
  }
  if (kind === "broken-stairs") {
    f.vertical.quest = {
      kind: "broken-stairs",
      clueCell: f.stairsUp ?? void 0,
      clueLabel: "Zawalony bieg schod\xF3w"
    };
    return f;
  }
  if (kind === "flooded-route" && f.vertical.service) {
    const wire = f.environment.features.find((ft) => ft.kind === "wire" && ft.control);
    const steam2 = f.environment.features.find((ft) => ft.kind === "steam");
    const out = f.vertical.service.outside;
    if (f.tiles[idx(f, out)] === Tile.Floor) f.tiles[idx(f, out)] = Tile.Puddle;
    f.vertical.quest = {
      kind: "flooded-route",
      wireId: wire?.id,
      steamId: steam2?.id,
      clueCell: out,
      clueLabel: "Zalany pion techniczny"
    };
    return f;
  }
  if (kind === "lure-horde" && f.stairsUp) {
    const stairRoom = f.rooms.find((r) => r.role === "stairs");
    const sideRoom = normalRooms.find((r) => {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const d = Math.hypot(cx - f.stairsUp.x, cy - f.stairsUp.y);
      return d >= 10 && d <= 28;
    }) ?? normalRooms[0];
    const beacon = sideRoom ? openRoomCells(f, sideRoom, avoid)[0] : void 0;
    const horde = [];
    if (stairRoom) {
      const spots = openRoomCells(f, stairRoom, avoid).filter((p) => Math.hypot(p.x - f.stairsUp.x, p.y - f.stairsUp.y) >= 1.5).slice(0, 3);
      for (const p of spots) {
        horde.push(p);
        f.zombies.push({
          x: (p.x + 0.5) * TILE,
          y: (p.y + 0.5) * TILE,
          kind: rng() < 0.35 ? "runner" : "shambler",
          room: stairRoom.id
        });
      }
    }
    f.vertical.quest = {
      kind: "lure-horde",
      beacon,
      clueRoom: sideRoom?.id,
      horde,
      clueLabel: "Konsola rozg\u0142oszeniowa"
    };
    return f;
  }
  if (kind === "service-shaft" && f.vertical.service) {
    const office = normalRooms.find((r) => ["LOKAL U\u017BYTKOWY", "WARSZTAT", "SCHOWEK", "KOT\u0141OWNIA"].includes(f.roomZones[r.id])) ?? normalRooms[0];
    const clueCell = office ? openRoomCells(f, office, avoid)[0] : void 0;
    const code = `${1 + rng.int(8)}-${1 + rng.int(8)}-${1 + rng.int(8)}`;
    f.vertical.quest = {
      kind: "service-shaft",
      clueCell,
      clueRoom: office?.id,
      code,
      clueLabel: "Instrukcja pionu technicznego"
    };
    return f;
  }
  if (kind === "apartment-bypass" && f.vertical.stairsB) {
    const eastRoom = normalRooms.slice().sort((a, b) => Math.abs(b.x - f.vertical.stairsB.outside.x) - Math.abs(a.x - f.vertical.stairsB.outside.x)).pop() ?? normalRooms[0];
    const corridor = f.rooms.find((r) => f.roomZones[r.id] === "KORYTARZ");
    const clueCell = corridor ? openRoomCells(f, corridor, avoid).find((p) => p.x >= 10 && p.x <= 24) : void 0;
    const bypassCell = eastRoom ? openRoomCells(f, eastRoom, avoid)[0] : void 0;
    f.vertical.quest = {
      kind: "apartment-bypass",
      clueCell,
      clueRoom: corridor?.id,
      bypassCell,
      clueLabel: "Plan ewakuacyjny Klatki B"
    };
    return f;
  }
  return f;
}

// src/game/tactical-layout.ts
function roomCells(f, room) {
  const cells = [];
  const q = f.vertical?.quest;
  const reserved = [
    q?.fuseCell,
    q?.beacon,
    q?.clueCell,
    q?.bypassCell,
    f.vertical?.elevator?.call,
    f.vertical?.elevator?.panel,
    f.vertical?.service?.panel,
    f.vertical?.stairsB?.stairs
  ].filter((p) => !!p);
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
    const i = y * f.w + x;
    if (reserved.some((p) => p.x === x && p.y === y)) continue;
    if (f.tiles[i] !== Tile.Floor && f.tiles[i] !== Tile.Rubble) continue;
    if (f.props.some((p) => p.solid && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) continue;
    if (f.zombies.some((z) => Math.floor(z.x / TILE) === x && Math.floor(z.y / TILE) === y)) continue;
    if (Math.hypot((x + 0.5) * TILE - f.playerStart.x, (y + 0.5) * TILE - f.playerStart.y) < 7 * TILE) continue;
    cells.push({ x, y });
  }
  return cells;
}
function installTacticalContent(f) {
  if (f.theme === "roof" || f.index >= 10) return f;
  const rng = makeRng((f.seed ^ 1688805179) >>> 0);
  const halls = f.rooms.filter((r) => f.roomZones[r.id] === "KORYTARZ");
  const usable = f.rooms.filter((r) => r.role === "normal" && !["KORYTARZ", "WINDA OSOBOWA", "PION TECHNICZNY", "KLATKA B"].includes(f.roomZones[r.id]));
  const tech = usable.filter((r) => ["SCHOWEK", "WARSZTAT", "KOT\u0141OWNIA", "PRALNIA"].includes(f.roomZones[r.id]));
  let nextProp = 52e3;
  const add = (kind, cell, label) => {
    const p = { id: nextProp++, kind, x: cell.x, y: cell.y, w: 1, h: 1, solid: false, loot: null, opened: false, label };
    f.props.push(p);
  };
  const radioRooms = usable.filter((r) => ["SALON", "SYPIALNIA", "LOKAL U\u017BYTKOWY", "WARSZTAT", "KUCHNIA"].includes(f.roomZones[r.id]));
  for (const room of radioRooms.slice(0, f.index === 0 ? 1 : 2)) {
    const cells = roomCells(f, room);
    if (cells.length) add("radio", cells[rng.int(cells.length)], "radio");
  }
  const barrelRooms = [...halls, ...tech];
  const barrelCount = Math.min(3, 1 + Math.floor(f.index / 3));
  for (let n = 0; n < barrelCount; n++) {
    const room = barrelRooms[rng.int(Math.max(1, barrelRooms.length))];
    const cells = room ? roomCells(f, room) : [];
    if (cells.length) add("explosive", cells[rng.int(cells.length)], "czerwona beczka");
  }
  const crawlerRooms = usable.length ? usable : halls;
  if (f.index > 0 && crawlerRooms.length) {
    const room = crawlerRooms[rng.int(crawlerRooms.length)];
    const cells = roomCells(f, room);
    if (cells.length) {
      const c = cells[rng.int(cells.length)];
      f.zombies.push({ x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE, kind: "crawler", room: room.id });
    }
  }
  for (let n = 0; n < Math.min(2, halls.length); n++) {
    const room = halls[(n + f.index) % halls.length];
    const cells = roomCells(f, room).filter((c) => c.x > 8 && c.x < f.w - 9);
    if (cells.length < 4) continue;
    const groupSize = n === 0 ? 1 : 2;
    const start = cells[rng.int(cells.length)];
    for (let k = 0; k < groupSize; k++) {
      const spawn = {
        x: (start.x + 0.5 + k * 0.65) * TILE,
        y: (start.y + 0.5) * TILE,
        kind: n === 0 ? "shambler" : k === 0 ? "shambler" : "runner",
        room: room.id
      };
      f.zombies.push(spawn);
    }
  }
  return f;
}

// src/game/generate.ts
var W = MAP_W;
var H = MAP_H;
var idx2 = (x, y) => y * W + x;
var inb2 = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
var ZONE_NAME = {
  living: "SALON",
  kitchen: "KUCHNIA",
  bath: "\u0141AZIENKA",
  bedroom: "SYPIALNIA",
  corridor: "KORYTARZ",
  stair: "KLATKA SCHODOWA",
  laundry: "PRALNIA",
  boiler: "KOT\u0141OWNIA",
  storage: "SCHOWEK",
  office: "LOKAL U\u017BYTKOWY",
  nursery: "POK\xD3J DZIECI\u0118CY",
  workshop: "WARSZTAT"
};
var PASSABLE2 = /* @__PURE__ */ new Set([Tile.Floor, Tile.Rubble, Tile.Puddle, Tile.StairsUp, Tile.StairsDown, Tile.Door, Tile.DoorOpen]);
function carveRect(tiles, x, y, w, h, value) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (inb2(xx, yy)) tiles[idx2(xx, yy)] = value;
    }
  }
}
function newBuild() {
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
    lights: []
  };
}
var N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
function reserveAround(b, x, y) {
  if (inb2(x, y)) b.occ[idx2(x, y)] = 1;
  for (const [dx, dy] of N4) if (inb2(x + dx, y + dy)) b.occ[idx2(x + dx, y + dy)] = 1;
}
function addBreach(b, x, y, fs) {
  if (!inb2(x, y)) return;
  if (b.breaches.some((br) => br.x === x && br.y === y)) return;
  b.tiles[idx2(x, y)] = Tile.Rubble;
  b.floorStyle[idx2(x, y)] = fs;
  reserveAround(b, x, y);
  b.breaches.push({ x, y });
}
function zoneStyles(zone, decay, service) {
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
function addRoom(b, x, y, w, h, zone, role, decay, service, rng) {
  const { fs, ws } = zoneStyles(zone, decay, service);
  const r = {
    id: b.rooms.length,
    x,
    y,
    w,
    h,
    role,
    lit: role === "stairs" ? true : rng.chance(0.86 - decay * 0.6),
    flicker: rng.chance(0.2 + decay * 0.55)
  };
  b.rooms.push(r);
  b.roomZones.push(ZONE_NAME[zone]);
  b.roomWs.push(ws);
  b.zones.push(zone);
  carveRect(b.tiles, x, y, w, h, Tile.Floor);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = idx2(xx, yy);
      b.roomOf[i] = r.id;
      b.floorStyle[i] = fs;
    }
  }
  return r;
}
function addDoor(b, x, y, locked, barricaded = false) {
  if (!inb2(x, y)) return;
  const i = idx2(x, y);
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
function addWindow(b, x, y, glow) {
  if (!inb2(x, y) || b.tiles[idx2(x, y)] !== Tile.Wall) return;
  b.tiles[idx2(x, y)] = Tile.Window;
  b.windows.push({ x, y, glow });
}
function addProp(b, kind, x, y, w, h, solid, loot = null, note) {
  const p = { id: b.props.length, kind, x, y, w, h, solid, loot, note, opened: false };
  b.props.push(p);
  if (solid) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inb2(xx, yy)) b.occ[idx2(xx, yy)] = 1;
  }
  return p;
}
function canPlace(b, room, x, y, w, h) {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < room.x || yy < room.y || xx >= room.x + room.w || yy >= room.y + room.h) return false;
      if (xx === cx && yy === cy) return false;
      if (b.tiles[idx2(xx, yy)] !== Tile.Floor) return false;
      if (b.occ[idx2(xx, yy)]) return false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = b.tiles[idx2(xx + dx, yy + dy)];
          if (t === Tile.Door || t === Tile.StairsUp || t === Tile.StairsDown) return false;
        }
      }
    }
  }
  return true;
}
var FURNITURE2 = {
  living: [
    { kind: "sofa", w: 2, h: 1 },
    { kind: "tv", w: 1, h: 1 },
    { kind: "table", w: 1, h: 1 },
    { kind: "bookshelf", w: 1, h: 1 },
    { kind: "plant", w: 1, h: 1 },
    { kind: "radiator", w: 1, h: 1 }
  ],
  kitchen: [
    { kind: "fridge", w: 1, h: 1 },
    { kind: "stove", w: 1, h: 1 },
    { kind: "sink", w: 1, h: 1 },
    { kind: "counter", w: 2, h: 1 },
    { kind: "table", w: 1, h: 1 },
    { kind: "trash", w: 1, h: 1 }
  ],
  bath: [
    { kind: "toilet", w: 1, h: 1 },
    { kind: "sink", w: 1, h: 1 },
    { kind: "medbox", w: 1, h: 1 },
    { kind: "bathtub", w: 2, h: 1 },
    { kind: "shower", w: 1, h: 1 },
    { kind: "washer", w: 1, h: 1 }
  ],
  bedroom: [
    { kind: "bed", w: 2, h: 1 },
    { kind: "wardrobe", w: 1, h: 1 },
    { kind: "bookshelf", w: 1, h: 1 },
    { kind: "chair", w: 1, h: 1 },
    { kind: "radiator", w: 1, h: 1 }
  ],
  nursery: [
    { kind: "bed", w: 2, h: 1 },
    { kind: "bookshelf", w: 1, h: 1 },
    { kind: "toy", w: 1, h: 1 },
    { kind: "chair", w: 1, h: 1 }
  ],
  laundry: [
    { kind: "washer", w: 1, h: 1 },
    { kind: "washer", w: 1, h: 1 },
    { kind: "sink", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "medbox", w: 1, h: 1 }
  ],
  boiler: [
    { kind: "pipes", w: 2, h: 1 },
    { kind: "barrel", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "extinguisher", w: 1, h: 1 },
    { kind: "crate", w: 1, h: 1 }
  ],
  storage: [
    { kind: "supplycase", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "crate", w: 1, h: 1 },
    { kind: "barrel", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "bike", w: 2, h: 1 }
  ],
  office: [
    { kind: "desk", w: 2, h: 1 },
    { kind: "chair", w: 1, h: 1 },
    { kind: "board", w: 2, h: 1 },
    { kind: "bookshelf", w: 1, h: 1 },
    { kind: "plant", w: 1, h: 1 }
  ],
  workshop: [
    { kind: "pipes", w: 2, h: 1 },
    { kind: "table", w: 1, h: 1 },
    { kind: "locker", w: 1, h: 1 },
    { kind: "crate", w: 1, h: 1 }
  ],
  corridor: [],
  stair: []
};
function placeAnchored(b, r, spec, ax, ay, wall2 = true) {
  const tx = r.x + (r.w - spec.w) * ax;
  const ty = r.y + (r.h - spec.h) * ay;
  let best;
  for (let y = r.y; y <= r.y + r.h - spec.h; y++) {
    for (let x = r.x; x <= r.x + r.w - spec.w; x++) {
      const edge = x === r.x || y === r.y || x + spec.w === r.x + r.w || y + spec.h === r.y + r.h;
      if (wall2 && !edge) continue;
      if (!canPlace(b, r, x, y, spec.w, spec.h)) continue;
      const cost = (tx - x) ** 2 + (ty - y) ** 2;
      if (!best || cost < best.cost) best = { x, y, cost };
    }
  }
  return best ? addProp(b, spec.kind, best.x, best.y, spec.w, spec.h, true) : void 0;
}
var ANCHORS = {
  bed: [0, 0],
  wardrobe: [1, 0],
  bookshelf: [1, 0.8],
  radiator: [0.6, 0],
  sofa: [0.5, 0],
  tv: [0.5, 1],
  table: [0.55, 0.4],
  chair: [0.55, 0.6],
  plant: [1, 1],
  fridge: [0, 0],
  stove: [0.28, 0],
  counter: [0.6, 0],
  sink: [1, 0],
  bathtub: [0, 1],
  toilet: [0, 0],
  medbox: [1, 0.3],
  shower: [1, 1],
  crate: [0, 0.3],
  supplycase: [0, 0],
  barrel: [1, 1],
  locker: [0.4, 0],
  desk: [0.35, 0],
  board: [0.8, 0],
  pipes: [0.5, 0],
  washer: [0, 0]
};
function furnishRoom(b, room, zone, decay) {
  const specs = FURNITURE2[zone];
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
function stockFloor(b, index, locked, start) {
  const zoneOf = (p) => b.zones[b.roomOf[idx2(p.x, p.y)]];
  const usedRooms = /* @__PURE__ */ new Set();
  const distribute = (loot, kinds2, zones, count, label) => {
    const pool2 = b.props.filter((p) => !p.loot && kinds2.includes(p.kind) && zones.includes(zoneOf(p)));
    for (let n = 0; n < count; n++) {
      const targetY = H * (n + 0.5) / count;
      const host = pool2.filter((p) => !p.loot && !usedRooms.has(b.roomOf[idx2(p.x, p.y)])).sort((a, c) => Math.abs(a.y - targetY) - Math.abs(c.y - targetY) || a.id - c.id)[0];
      if (!host) continue;
      host.loot = loot;
      host.label = label;
      if (loot === "note") host.note = NOTES[(index + n) % NOTES.length];
      usedRooms.add(b.roomOf[idx2(host.x, host.y)]);
    }
  };
  const weapon = DISCOVERIES[index];
  if (weapon) {
    let host;
    if (index < 2) {
      host = placeAnchored(b, start, { kind: index === 0 ? "locker" : "desk", w: index === 0 ? 1 : 2, h: 1 }, 1, 0.5);
    } else {
      host = b.props.filter((p) => p.kind === "wardrobe" && zoneOf(p) === "bedroom").sort((a, c) => c.y - a.y || a.x - c.x)[0];
    }
    if (!host) return false;
    host.loot = weapon;
    host.label = index === 0 ? "Szafka warsztatowa" : index === 1 ? "Biurko dozorcy" : index === 4 ? "Szafa my\u015Bliwego" : "Szafa sportowca";
  }
  if (locked) {
    const hall = b.rooms.filter((r) => b.zones[r.id] === "corridor")[1];
    const host = placeAnchored(b, hall, { kind: "locker", w: 1, h: 1 }, 0.5, 0);
    if (!host) return false;
    host.loot = "key";
    host.label = "Szafka na klucze";
  }
  distribute("med", ["medbox"], ["bath", "laundry"], 3, "Apteczka \u015Bcienna");
  distribute("ammo", ["supplycase", "crate"], ["storage", "workshop"], 3, "Kaseta z nabojami");
  distribute("battery", ["locker", "counter"], ["boiler", "workshop", "kitchen"], 3, "Szuflada z bateriami");
  if (index >= 4) distribute("shells", ["wardrobe", "locker"], ["bedroom", "storage"], 2, "Zapas \u015Brutu");
  if (index >= 6) distribute("bolts", ["wardrobe", "crate"], ["bedroom", "storage"], 2, "Futera\u0142 na be\u0142ty");
  distribute("note", ["desk", "bookshelf"], ["living", "bedroom", "office"], 3, "Notatki mieszka\u0144ca");
  return true;
}
function rngChance(x, y, n) {
  const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
  return v - Math.floor(v);
}
function paintWallBorders(b, decay, service) {
  const defaultWs = service ? 3 : decay > 0.6 ? 5 : decay > 0.35 ? 0 : 2;
  const order = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0]
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx2(x, y);
      if (b.tiles[i] !== Tile.Wall) continue;
      let ws = -1;
      let nearFloor = false;
      for (const [dx, dy] of order) {
        if (!inb2(x + dx, y + dy)) continue;
        const j = idx2(x + dx, y + dy);
        const t = b.tiles[j];
        if (!PASSABLE2.has(t)) continue;
        nearFloor = true;
        const rid = b.roomOf[j];
        if (ws < 0) ws = rid >= 0 ? b.roomWs[rid] : defaultWs;
      }
      b.wallStyle[i] = ws >= 0 ? ws : defaultWs;
      if (!nearFloor) continue;
      const kinds2 = ws === 1 ? ["pipe", "drip", "drip", "switch", "fuse", "crack", "mold", "number", "hole", "calendar"] : ws === 3 ? ["pipe", "panel", "panel", "drip", "switch", "fuse", "crack", "mold", "number", "hole", "conduit", "ventgrate", "exitsign", "sconce", "caution", "emergencylamp", "camera"] : ws === 4 ? ["scorch", "graffiti", "crack", "extinguisher", "hole", "hole", "panel", "caution", "emergencylamp"] : ws === 5 ? ["mold", "crack", "graffiti", "scorch", "poster", "hole", "hole", "drip", "reel", "missingposter", "emergencylamp"] : ["poster", "number", "switch", "crack", "clock", "graffiti", "elevator", "mirror", "hole", "reel", "intercom", "thermostat", "shelfbracket", "conduit", "exitsign", "sconce", "familyphoto", "calendar", "missingposter", "camera"];
      if (rngChance(x, y, 0.1) < 0.19) b.wallDecals.push({ x, y, kind: kinds2[Math.floor(rngChance(x, y, 99) * kinds2.length)] });
    }
  }
}
function makeLight(x, y, kind, flicker, roomId, radius) {
  return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, kind, flicker, roomId, radius: radius * TILE };
}
function buildLights(b, rng, decay, corridors) {
  for (const r of b.rooms) {
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
function addSurfaceDetails(b, rng, index, decay) {
  const details = {
    desk: "paper",
    bookshelf: "book",
    board: "paper",
    plant: "leaf",
    toy: "toy",
    medbox: "pills",
    bed: "cloth",
    sofa: "cloth",
    washer: "stain",
    sink: "stain",
    pipes: "moss",
    locker: "cable",
    tv: "cable",
    crate: "footprint",
    bench: "footprint",
    stove: index === 7 ? "scorch" : "stain"
  };
  const decorated = /* @__PURE__ */ new Set();
  for (const p of b.props) {
    const kind = details[p.kind];
    if (!kind || !rng.chance(0.6)) continue;
    for (const [x, y] of [[p.x, p.y + p.h], [p.x + p.w, p.y], [p.x - 1, p.y], [p.x, p.y - 1]]) {
      const i = idx2(x, y);
      if (!inb2(x, y) || b.tiles[i] !== Tile.Floor || b.occ[i] || decorated.has(i)) continue;
      if (b.roomOf[i] !== b.roomOf[idx2(p.x, p.y)]) continue;
      b.decals.push({ x, y, kind });
      decorated.add(i);
      break;
    }
  }
  const isStair = (i) => b.roomOf[i] >= 0 && b.roomZones[b.roomOf[i]] === "KLATKA SCHODOWA";
  const rubbleN = Math.round(decay * 55) + (index === 0 ? 12 : 0);
  for (let a = 0; a < rubbleN; a++) {
    const x = 2 + rng.int(W - 4);
    const y = 2 + rng.int(H - 4);
    const i = idx2(x, y);
    if (b.tiles[i] !== Tile.Floor || b.occ[i] || isStair(i)) continue;
    b.tiles[i] = Tile.Rubble;
  }
  if (decay >= 0.55 || index === 0) {
    const n = 10 + Math.round(decay * 28);
    for (let a = 0; a < n; a++) {
      const x = 2 + rng.int(W - 4);
      const y = 2 + rng.int(H - 4);
      const i = idx2(x, y);
      if (b.tiles[i] !== Tile.Floor || b.occ[i] || isStair(i)) continue;
      b.tiles[i] = Tile.Puddle;
    }
  }
  if (index === 7) {
    for (let a = 0; a < 40; a++) {
      const x = 2 + rng.int(W - 4);
      const y = 2 + rng.int(H - 4);
      const i = idx2(x, y);
      if (b.tiles[i] === Tile.Floor) b.floorStyle[i] = 4;
    }
  }
}
function placeWindows(b, rng, decay) {
  const glowChance = 0.46 - decay * 0.3;
  const blocked = new Set(b.wallDecals.map((d) => idx2(d.x, d.y)));
  for (const d of b.doors) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb2(d.x + dx, d.y + dy)) blocked.add(idx2(d.x + dx, d.y + dy));
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = idx2(x, y);
      if (b.tiles[i] !== Tile.Wall || blocked.has(i)) continue;
      let dir = null;
      let count = 0;
      for (const d of N4) {
        const t = b.tiles[idx2(x + d[0], y + d[1])];
        if (PASSABLE2.has(t)) {
          count++;
          dir = d;
        }
      }
      if (count !== 1 || !dir) continue;
      let exterior = true;
      for (let k = 1; k <= 3; k++) {
        const nx = x - dir[0] * k;
        const ny = y - dir[1] * k;
        if (!inb2(nx, ny)) break;
        const t = b.tiles[idx2(nx, ny)];
        if (PASSABLE2.has(t) || t === Tile.Window) {
          exterior = false;
          break;
        }
      }
      if (!exterior) continue;
      if (rng.chance(0.11)) {
        const glow = rng.chance(glowChance) ? rng.chance(0.22) ? "orange" : "fluor" : "none";
        addWindow(b, x, y, glow);
      }
    }
  }
}
function sealRooms(b) {
  for (const r of b.rooms) {
    const zone = b.roomZones[r.id];
    if (zone === "KORYTARZ") continue;
    const strict = r.role === "stairs" || r.role === "start";
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const onBorder = x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h;
        if (!onBorder || !inb2(x, y)) continue;
        const i = idx2(x, y);
        const t = b.tiles[i];
        if (t !== Tile.Floor && t !== Tile.Puddle) continue;
        if (strict) {
          b.tiles[i] = Tile.Wall;
          b.roomOf[i] = -1;
        } else {
          addBreach(b, x, y, b.floorStyle[idx2(r.x, r.y)]);
        }
      }
    }
  }
}
var MID = Math.floor(W / 2) - 1;
function blueprintFor(rng, index) {
  const variants = [
    { name: "korytarz dwupasmowy", corridors: [16, 42, 68], shafts: [{ x: 4, c0: 0, c1: 2 }, { x: W - 6, c0: 0, c1: 2 }, { x: MID, c0: 1, c1: 2 }] },
    { name: "krzy\u017C", corridors: [12, 38, 64], shafts: [{ x: 4, c0: 0, c1: 2 }, { x: W - 6, c0: 0, c1: 2 }, { x: MID, c0: 0, c1: 2 }] },
    { name: "eska", corridors: [18, 46, 72], shafts: [{ x: 4, c0: 0, c1: 2 }, { x: W - 6, c0: 0, c1: 1 }, { x: MID, c0: 1, c1: 2 }] },
    {
      name: "pier\u015Bcie\u0144 techniczny",
      corridors: [12, 30, 50, 70],
      shafts: [{ x: 4, c0: 0, c1: 3 }, { x: W - 6, c0: 0, c1: 3 }, { x: MID, c0: 1, c1: 2 }, { x: 16, c0: 2, c1: 3 }]
    }
  ];
  return variants[(index + rng.int(4)) % 4];
}
function serviceZones(rng) {
  return rng.pick([
    ["boiler", "laundry", "storage", "workshop"],
    ["storage", "workshop", "laundry", "office"],
    ["laundry", "storage", "boiler", "storage"],
    ["office", "storage", "workshop", "boiler"]
  ]);
}
function apartmentZones(rng, decay) {
  const tpl = [
    ["bedroom", "living", "kitchen", "bath"],
    ["bath", "living", "kitchen", "bedroom"],
    ["bedroom", "kitchen", "bath", "living"],
    ["nursery", "living", "bedroom", "kitchen"],
    ["living", "kitchen", "bath", "bedroom"],
    ["bedroom", "bath", "living", "kitchen"]
  ];
  const base = rng.pick(tpl).slice();
  if (decay > 0.6 && rng.chance(0.35)) base[2] = "storage";
  return base;
}
function buildFloor(index, seed) {
  const meta = FLOOR_META[index];
  const rng = makeRng(seed);
  const decay = meta.decay;
  const service = index <= 1;
  const b = newBuild();
  const bp = blueprintFor(rng, index);
  const cys = bp.corridors;
  for (const cy of cys) {
    carveRect(b.tiles, 4, cy, W - 8, 3, Tile.Floor);
    for (let y = cy; y < cy + 3; y++) for (let x = 4; x < W - 4; x++) b.floorStyle[idx2(x, y)] = service ? 3 : 2;
    const cr = addRoom(b, 6, cy, W - 12, 3, "corridor", "normal", decay, service, rng);
    cr.lit = true;
    cr.flicker = rng.chance(0.3 + decay * 0.4);
  }
  for (const sh of bp.shafts) {
    const y0 = cys[sh.c0];
    const y1 = cys[sh.c1] + 2;
    carveRect(b.tiles, sh.x, y0, 2, y1 - y0 + 1, Tile.Floor);
    for (let y = y0; y <= y1; y++) for (let x = sh.x; x < sh.x + 2; x++) b.floorStyle[idx2(x, y)] = 3;
  }
  for (const sh of bp.shafts) {
    if (sh.c1 - sh.c0 >= 1 && rng.chance(0.7)) {
      const dy = cys[sh.c0] + 5 + rng.int(Math.max(1, cys[sh.c0 + 1] - cys[sh.c0] - 8));
      if (b.tiles[idx2(sh.x, dy)] === Tile.Floor && b.tiles[idx2(sh.x + 1, dy)] === Tile.Floor) {
        addDoor(b, sh.x, dy, false);
        addDoor(b, sh.x + 1, dy, false);
      }
    }
  }
  const bands = [];
  const bandCount = cys.length + 1;
  for (let i = 0; i < bandCount; i++) {
    const y0 = i === 0 ? 3 : cys[i - 1] + 3;
    const y1 = i === cys.length ? H - 4 : cys[i] - 1;
    const cuts = bp.shafts.filter((sh) => sh.c0 <= i - 1 && sh.c1 >= i && sh.x > 6 && sh.x < W - 8).map((sh) => sh.x).sort((a, c) => a - c);
    const segments = [];
    let cur = 6;
    for (const sx of cuts) {
      if (sx - 1 - cur + 1 >= 7) segments.push([cur, sx - 1]);
      cur = sx + 2;
    }
    if (W - 7 - cur + 1 >= 7) segments.push([cur, W - 7]);
    bands.push({ y0, y1, upper: i > 0, lower: i < cys.length, segments });
  }
  let startRoom = null;
  let stairsRoom = null;
  let stairsUp = { x: 0, y: 0 };
  let stairsDown = null;
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
            b.tiles[idx2(stairsUp.x, stairsUp.y)] = Tile.StairsUp;
            stairsRoom = room;
            if (interiorW >= 5) addProp(b, "board", interiorX, ry, 2, 1, true);
            addProp(b, "extinguisher", interiorX + interiorW - 1, ry, 1, 1, true);
          } else {
            stairsDown = { x: x + Math.floor(w / 2), y: ry + 3 };
            b.tiles[idx2(stairsDown.x, stairsDown.y)] = Tile.StairsDown;
            startRoom = room;
            const medicine = placeAnchored(b, room, { kind: "medbox", w: 1, h: 1 }, 0, 0.75);
            if (medicine) {
              medicine.loot = "med";
              medicine.label = "Apteczka \u015Bcienna";
            }
            if (interiorW >= 5) placeAnchored(b, room, { kind: "bench", w: 2, h: 1 }, 0, 0);
          }
        } else {
          const mid = band.y0 + Math.floor(bandH / 2);
          const upperH = mid - band.y0 - 1;
          const lowerH = band.y1 - mid - 1;
          const zones = service ? serviceZones(rng) : apartmentZones(rng, decay);
          if (bi === 1 && cellNo < 2) {
            zones[0] = "workshop";
            zones[1] = "storage";
          }
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
            const makePair = (yTop, hh, zA, zB, split) => {
              if (split) {
                const leftW = vx - interiorX;
                const rightW = interiorX + interiorW - vx - 1;
                addRoom(b, interiorX, yTop, leftW, hh, zA, "normal", decay, service, rng);
                addRoom(b, vx + 1, yTop, rightW, hh, zB, "normal", decay, service, rng);
                const gy = yTop + rng.int(hh);
                if (rng.chance(0.5)) addDoor(b, vx, gy, false);
                else addBreach(b, vx, gy, b.floorStyle[idx2(interiorX, yTop)]);
              } else {
                addRoom(b, interiorX, yTop, interiorW, hh, zA, "normal", decay, service, rng);
              }
            };
            makePair(band.y0 + 1, upperH, zones[0], zones[3], splitUpper);
            const ufs = b.floorStyle[idx2(interiorX, band.y0 + 1)];
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
  for (const room of b.rooms) furnishRoom(b, room, b.zones[room.id], decay);
  for (const cy of cys) {
    const deco = service ? ["mailbox", "board", "bench", "extinguisher", "bike", "extinguisher", "mailbox"] : ["radiator", "extinguisher", "board", "bike", "bench", "plant", "radiator"];
    for (let x = 10; x < W - 10; x += 9) {
      const kind = rng.pick(deco);
      const pw = kind === "mailbox" || kind === "board" || kind === "bench" || kind === "bike" ? 2 : 1;
      const y = rng.chance(0.5) ? cy : cy + 2;
      let ok = true;
      for (let xx = x - 1; xx <= x + pw; xx++) {
        if (b.tiles[idx2(xx, y)] !== Tile.Floor || b.occ[idx2(xx, y)]) ok = false;
        if (PASSABLE2.has(b.tiles[idx2(xx, cy - 1)]) || PASSABLE2.has(b.tiles[idx2(xx, cy + 3)])) ok = false;
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
  b.occ.fill(0);
  for (const p of b.props) {
    if (!p.solid) continue;
    for (let yy = p.y; yy < p.y + p.h; yy++) for (let xx = p.x; xx < p.x + p.w; xx++) if (inb2(xx, yy)) b.occ[idx2(xx, yy)] = 1;
  }
  carveExtraBreaches(b, rng, decay);
  spawnCorpses(b, rng, index);
  spawnSurvivors(b, rng, index, startRoom);
  const spawns = spawnZombies(b, rng, index, startRoom);
  const sr = startRoom;
  const pc = { x: sr.x + 2, y: sr.y + 2 };
  return {
    index,
    theme: meta.theme,
    name: meta.name,
    sub: `${meta.sub} \xB7 ${bp.name}`,
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
    flare: null
  };
}
var LAYOUT_FAMILIES = ["POD\xC9STY", "PIER\u015ACIE\u0143", "DWA SKRZYD\u0141A", "\u0141AMANE KORYTARZE", "MIESZKANIA PRZECHODNIE", "BRY\u0141A L/U", "WSP\xD3LNY HOL"];
function layoutProfile(seed, floor = 0) {
  const rng = makeRng(seed + floor * 131 ^ 712088891);
  return { family: rng.int(LAYOUT_FAMILIES.length), start: rng.int(6) };
}
var STAIR_ANCHORS = [
  { x: 10, y: 9 },
  { x: 43, y: 9 },
  { x: 10, y: 77 },
  { x: 43, y: 77 },
  { x: 20, y: 9 },
  { x: 35, y: 77 }
];
function stairAnchor(seed, boundary) {
  if (boundary === 9) return { x: 15, y: 66 };
  return STAIR_ANCHORS[Math.floor(hash2(seed, boundary, 777) * STAIR_ANCHORS.length)];
}
var distCell = (a, c) => Math.abs(a.x - c.x) + Math.abs(a.y - c.y);
function buildVariedFloor(index, seed, buildingSeed) {
  const meta = FLOOR_META[index];
  const rng = makeRng(seed ^ 712088891);
  const profile = layoutProfile(buildingSeed, index);
  const family = profile.family;
  const b = newBuild();
  const service = index <= 1;
  const reserved = new Uint8Array(W * H);
  const graph = new Uint8Array(W * H);
  const line = (a, c, width = 2) => {
    const minX = Math.min(a.x, c.x), minY = Math.min(a.y, c.y);
    const spanX = Math.abs(a.x - c.x), spanY = Math.abs(a.y - c.y);
    if (spanX && spanY) return;
    for (let y = minY; y <= minY + spanY; y++) for (let x = minX; x <= minX + spanX; x++) {
      for (let yy = y; yy < y + width; yy++) for (let xx = x; xx < x + width; xx++) {
        if (xx < 4 || xx >= W - 4 || yy < 4 || yy >= H - 4 || reserved[idx2(xx, yy)]) continue;
        graph[idx2(xx, yy)] = 1;
      }
    }
  };
  const centres = [];
  const col = [10 + rng.int(6), 25 + rng.int(7), 39 + rng.int(6)];
  const row = [16 + rng.int(8), 39 + rng.int(10), 63 + rng.int(8)];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    centres.push({ x: col[i] + (i === 1 ? rng.int(5) - 2 : 0), y: row[j] + (j === 1 ? rng.int(5) - 2 : 0) });
  }
  const up = stairAnchor(buildingSeed, index);
  let down = index > 0 ? stairAnchor(buildingSeed, index - 1) : null;
  if (down && distCell(down, up) < 11) down = STAIR_ANCHORS[(STAIR_ANCHORS.findIndex((p) => p.x === down.x && p.y === down.y) + 3) % STAIR_ANCHORS.length];
  if (down && distCell(down, up) < 11) return null;
  const protectedRooms = [up, ...down ? [down] : []];
  for (const p of protectedRooms) for (let y = p.y - 3; y <= p.y + 3; y++) for (let x = p.x - 3; x <= p.x + 3; x++) {
    if (inb2(x, y)) reserved[idx2(x, y)] = 1;
  }
  const families = [
    [[0, 1], [1, 2], [0, 3], [2, 5], [3, 4], [4, 7], [5, 8], [6, 7], [7, 8]],
    [[0, 1], [1, 2], [2, 5], [5, 8], [8, 7], [7, 6], [6, 3], [3, 0], [1, 4], [4, 7]],
    [[0, 3], [3, 6], [2, 5], [5, 8], [3, 4], [4, 5], [0, 1], [1, 2], [6, 7]],
    [[0, 1], [1, 4], [4, 3], [3, 6], [6, 7], [7, 8], [8, 5], [5, 2], [4, 5]],
    [[0, 3], [3, 6], [3, 4], [4, 7], [7, 8], [4, 5], [5, 2], [1, 2]],
    [[0, 1], [1, 2], [2, 5], [5, 8], [8, 7], [7, 6], [6, 3], [3, 4], [4, 5]],
    [[4, 1], [4, 3], [4, 5], [4, 7], [0, 1], [1, 2], [3, 6], [5, 8], [6, 7]]
  ];
  let edges = families[family].slice();
  if (rng.chance(0.45)) edges.splice(rng.int(edges.length), 1, rng.pick(edges));
  if (family !== 1 && rng.chance(0.6)) edges.push(rng.pick([[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8]]));
  for (const [a, c] of edges) {
    const start = centres[a], end = centres[c];
    const broad = family === 6 && (a === 4 || c === 4) ? 4 : family === 1 ? 3 : 2;
    if (start.x === end.x || start.y === end.y) line(start, end, broad);
    else if (rng.chance(0.5)) {
      line(start, { x: end.x, y: start.y }, broad);
      line({ x: end.x, y: start.y }, end, broad);
    } else {
      line(start, { x: start.x, y: end.y }, broad);
      line({ x: start.x, y: end.y }, end, broad);
    }
  }
  for (const p of centres) line(p, p, family === 6 && distCell(p, centres[4]) < 2 ? 6 : 3);
  for (const endpoint of [{ x: 4, y: 43 }, { x: 51, y: 19 }, { x: 51, y: 35 }]) {
    const target = centres.slice().sort((a, c) => distCell(a, endpoint) - distCell(c, endpoint))[0];
    line(endpoint, { x: target.x, y: endpoint.y }, 2);
    line({ x: target.x, y: endpoint.y }, target, 2);
  }
  for (const [edge, base] of [[4, 25], [50, 25], [4, 56], [50, 56]]) {
    const y = base + rng.int(10) - 5;
    line({ x: edge, y }, { x: edge, y: y + 12 }, 2);
    const midpoint = { x: edge, y: y + 4 };
    const near = centres.slice().sort((a, c) => distCell(a, midpoint) - distCell(c, midpoint))[0];
    line(midpoint, { x: near.x, y: midpoint.y }, 2);
    line({ x: near.x, y: midpoint.y }, near, 2);
  }
  const visited = new Uint8Array(W * H);
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    if (!graph[idx2(x, y)] || visited[idx2(x, y)]) continue;
    let w = 1;
    while (x + w < W - 4 && graph[idx2(x + w, y)] && !visited[idx2(x + w, y)] && w < 10) w++;
    for (let xx = x; xx < x + w; xx++) visited[idx2(xx, y)] = 1;
    const r = addRoom(b, x, y, w, 1, "corridor", "normal", meta.decay, service, rng);
    r.lit = true;
  }
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) if (graph[idx2(x, y)]) b.tiles[idx2(x, y)] = Tile.Floor;
  const stairRooms = [];
  for (const [k, p] of protectedRooms.entries()) {
    const r = addRoom(b, p.x - 2, p.y - 2, 5, 5, "stair", k === 0 ? "stairs" : "start", meta.decay, service, rng);
    r.lit = true;
    stairRooms.push(r);
    b.tiles[idx2(p.x, p.y)] = k === 0 ? Tile.StairsUp : Tile.StairsDown;
    const targets = centres.slice().sort((a, c) => distCell(a, p) - distCell(c, p));
    const target = targets[0];
    const dx = target.x - p.x, dy = target.y - p.y;
    const door = Math.abs(dx) > Math.abs(dy) ? { x: p.x + (dx > 0 ? 3 : -3), y: p.y } : { x: p.x, y: p.y + (dy > 0 ? 3 : -3) };
    const outside = { x: door.x + (door.x - p.x ? Math.sign(door.x - p.x) : 0), y: door.y + (door.y - p.y ? Math.sign(door.y - p.y) : 0) };
    line(outside, { x: target.x, y: outside.y }, 2);
    line({ x: target.x, y: outside.y }, target, 2);
    for (let yy = 4; yy < H - 4; yy++) for (let xx = 4; xx < W - 4; xx++) if (graph[idx2(xx, yy)] && !reserved[idx2(xx, yy)] && b.tiles[idx2(xx, yy)] === Tile.Wall) {
      b.tiles[idx2(xx, yy)] = Tile.Floor;
      b.floorStyle[idx2(xx, yy)] = 3;
    }
    addDoor(b, door.x, door.y, k === 0 && index > 0 && index % 2 === 1);
  }
  const roomsAdded = [];
  const canRoom = (x, y, w, h) => {
    if (x < 6 || y < 5 || x + w > W - 6 || y + h > H - 5) return false;
    for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (b.tiles[idx2(xx, yy)] !== Tile.Wall || reserved[idx2(xx, yy)]) return false;
    for (let yy = y; yy < y + h; yy++) if (PASSABLE2.has(b.tiles[idx2(x - 2, yy)]) || PASSABLE2.has(b.tiles[idx2(x + w + 1, yy)])) return true;
    for (let xx = x; xx < x + w; xx++) if (PASSABLE2.has(b.tiles[idx2(xx, y - 2)]) || PASSABLE2.has(b.tiles[idx2(xx, y + h + 1)])) return true;
    return false;
  };
  for (let attempts = 0; attempts < 1500 && roomsAdded.length < 55; attempts++) {
    const w = 4 + rng.int(family === 2 ? 9 : family === 0 ? 4 : 7), h = 3 + rng.int(family === 4 ? 8 : 7);
    const x = 6 + rng.int(W - 12 - w), y = 5 + rng.int(H - 10 - h);
    if (!canRoom(x, y, w, h)) continue;
    const zone = service ? rng.pick(serviceZones(rng)) : rng.pick(apartmentZones(rng, meta.decay));
    const r = addRoom(b, x, y, w, h, zone, "normal", meta.decay, service, rng);
    roomsAdded.push(r);
  }
  if (roomsAdded.length < 10) return null;
  for (const r of roomsAdded) {
    const options = [];
    for (let y = r.y; y < r.y + r.h; y++) for (const side of [-1, 1]) {
      const x = side < 0 ? r.x - 1 : r.x + r.w;
      const farX = x + side;
      if (b.tiles[idx2(x, y)] === Tile.Wall && PASSABLE2.has(b.tiles[idx2(farX, y)])) options.push({ x, y, corridor: b.roomZones[b.roomOf[idx2(farX, y)]] === "KORYTARZ" });
    }
    for (let x = r.x; x < r.x + r.w; x++) for (const side of [-1, 1]) {
      const y = side < 0 ? r.y - 1 : r.y + r.h, farY = y + side;
      if (b.tiles[idx2(x, y)] === Tile.Wall && PASSABLE2.has(b.tiles[idx2(x, farY)])) options.push({ x, y, corridor: b.roomZones[b.roomOf[idx2(x, farY)]] === "KORYTARZ" });
    }
    const ordered = options.sort((a, c) => Number(c.corridor) - Number(a.corridor) || a.x - c.x || a.y - c.y);
    if (ordered[0]) addDoor(b, ordered[0].x, ordered[0].y, false);
    if (ordered.length > 1 && rng.chance(family === 4 ? 0.85 : 0.5)) {
      const alt = ordered.find((o) => distCell(o, ordered[0]) >= 3);
      if (alt) addDoor(b, alt.x, alt.y, false);
    }
  }
  const firstWorkshop = roomsAdded.find((r) => b.roomZones[r.id] === "WARSZTAT" || b.roomZones[r.id] === "SCHOWEK");
  if (!firstWorkshop) {
    b.roomZones[roomsAdded[0].id] = "WARSZTAT";
    b.zones[roomsAdded[0].id] = "workshop";
  }
  const bedroom = roomsAdded.find((r) => b.zones[r.id] === "bedroom" && r.w >= 5);
  if (!bedroom) {
    const r = roomsAdded[roomsAdded.length - 1];
    b.zones[r.id] = "bedroom";
    b.roomZones[r.id] = "SYPIALNIA";
  }
  const corridor = b.rooms.find((r) => b.roomZones[r.id] === "KORYTARZ" && r.w >= 4);
  if (!corridor) return null;
  let startRoom = stairRooms[1] ?? roomsAdded[profile.start % roomsAdded.length];
  if (index === 0) {
    const pool2 = roomsAdded.filter((r) => r.w >= 5 && r.h >= 4);
    if (pool2.length) startRoom = pool2[profile.start % pool2.length];
    startRoom.role = "start";
    startRoom.lit = true;
    b.zones[startRoom.id] = rng.pick(["workshop", "storage", "office", "living", "bedroom"]);
    b.roomZones[startRoom.id] = ZONE_NAME[b.zones[startRoom.id]];
  }
  for (const r of b.rooms) if (r.w >= 3 && r.h >= 3 && b.zones[r.id] !== "corridor") furnishRoom(b, r, b.zones[r.id], meta.decay);
  addSurfaceDetails(b, rng, index, meta.decay);
  if (!stockFloor(b, index, index > 0 && index % 2 === 1, startRoom)) return null;
  if (index === 0) {
    const host = b.props.find((p) => p.loot === "hatchet");
    if (!host) return null;
  }
  sealRooms(b);
  paintWallBorders(b, meta.decay, service);
  placeWindows(b, rng, meta.decay);
  buildLights(b, rng, meta.decay, []);
  b.occ.fill(0);
  for (const p of b.props) if (p.solid) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) b.occ[idx2(x, y)] = 1;
  spawnCorpses(b, rng, index);
  spawnSurvivors(b, rng, index, startRoom);
  const spawns = spawnZombies(b, rng, index, startRoom);
  const startCell = index === 0 ? { x: startRoom.x + Math.min(2, startRoom.w - 1), y: startRoom.y + Math.min(2, startRoom.h - 1) } : down;
  return {
    index,
    theme: meta.theme,
    name: meta.name,
    sub: `${meta.sub} \xB7 ${LAYOUT_FAMILIES[family]}`,
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
    playerStart: { x: (startCell.x + 0.5) * TILE, y: (startCell.y + 0.5) * TILE },
    stairsUp: up,
    stairsDown: index > 0 ? down : null,
    locked: index > 0 && index % 2 === 1,
    keyPropId: b.props.find((p) => p.loot === "key")?.id ?? null,
    flare: null
  };
}
function carveExtraBreaches(b, rng, decay) {
  const want = 4 + Math.round(decay * 12);
  let made = 0;
  for (let a = 0; a < 600 && made < want; a++) {
    const x = 6 + rng.int(W - 12);
    const y = 5 + rng.int(H - 10);
    if (b.tiles[idx2(x, y)] !== Tile.Wall) continue;
    const okPair = (ax, ay, bx, by) => {
      const ia = idx2(ax, ay);
      const ib = idx2(bx, by);
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
    const fs = lr ? b.floorStyle[idx2(x - 1, y)] : b.floorStyle[idx2(x, y - 1)];
    addBreach(b, x, y, fs);
    made++;
  }
}
function spawnCorpses(b, rng, index) {
  const want = 4 + Math.min(8, index);
  const kinds2 = ["shambler", "shambler", "runner", "brute"];
  let made = 0;
  for (let a = 0; a < 300 && made < want; a++) {
    const x = 4 + rng.int(W - 8);
    const y = 4 + rng.int(H - 8);
    const i = idx2(x, y);
    if (b.tiles[i] !== Tile.Floor || b.occ[i]) continue;
    const rid = b.roomOf[i];
    if (rid >= 0 && b.rooms[rid]?.role === "start") continue;
    b.corpses.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, kind: rng.pick(kinds2) });
    made++;
  }
}
var SURVIVOR_DIALOGS = [
  {
    name: "MAREK Z TRZECIEGO",
    lines: [
      "Cii! Nie \u015Bwie\u0107 po oknach... blabla... siedz\u0119 tu od wczoraj.",
      "Zabarykadowali\u015Bmy drzwi szaf\u0105, ale przeszli przez \u015Bcian\u0119 u s\u0105siada.",
      "We\u017A te naboje, mi r\u0119ce si\u0119 trz\u0119s\u0105. Uciekam na d\xF3\u0142 p\xF3ki czysto!"
    ],
    gift: "ammo"
  },
  {
    name: "PANI HALINA (M. 14)",
    lines: [
      "Jezus Maria, \u017Cywy cz\u0142owiek... szeptem, b\u0142agam, oni s\u0142ysz\u0105 ka\u017Cdy krok.",
      "Klucz do schod\xF3w wisi w szafce na korytarzu. Szukaj metalowych drzwiczek.",
      "Masz opatrunek z mojej apteczki. Nie czekaj na mnie, biegn\u0119!"
    ],
    gift: "med"
  },
  {
    name: "TOMEK \u2014 ELEKTRYK",
    lines: [
      "Pssst! My\u015Bla\u0142em \u017Ce to znowu te trupy drapi\u0105 w drzwi...",
      "Na dachu jest co\u015B ogromnego, s\u0142ysza\u0142em jak dudni w strop nad \xF3smym.",
      "\u0141ap bateri\u0119 do latarki. Ja pryskam przez klatk\u0119, powodzenia!"
    ],
    gift: "battery"
  },
  {
    name: "ANKA Z SI\xD3DEMKI",
    lines: [
      "Nie strzelaj! Jestem sama... schowa\u0142am si\u0119 w \u0142azience gdy wywa\u017Cyli zamek.",
      "Na korytarzu le\u017C\u0105 ci, kt\xF3rych pr\xF3bowali\u015Bmy zatrzyma\u0107 \u0142omami.",
      "We\u017A naboje mojego brata. Ja wybiegn\u0119 gdy ich odci\u0105gniesz!"
    ],
    gift: "ammo"
  },
  {
    name: "STARY DOZORCA",
    lines: [
      "Kto tam?! A, to ty... cicho, bo zlec\u0105 si\u0119 z ca\u0142ego pionu.",
      "Co drugie pi\u0119tro zamkn\u0105\u0142em krat\u0119. Klucze s\u0105 w szafkach na korytarzach.",
      "We\u017A apteczk\u0119 ze str\xF3\u017C\xF3wki. Uciekam st\u0105d!"
    ],
    gift: "med"
  }
];
function spawnSurvivors(b, rng, index, startRoom) {
  if (index === 10) return;
  const want = index === 0 ? 1 : 1 + (rng.chance(0.55) ? 1 : 0);
  const candidates = b.rooms.filter(
    (r) => r.role === "normal" && b.roomZones[r.id] !== "KORYTARZ" && b.roomZones[r.id] !== "KLATKA SCHODOWA" && r.id !== startRoom.id
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
      const i = idx2(tx, ty);
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
        variant: (index + b.survivors.length) % 2
      });
      break;
    }
  }
}
function spawnZombies(b, rng, index, startRoom) {
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
    { s: 3, r: 2, b: 0 }
  ];
  const want = counts[Math.min(index, counts.length - 1)];
  const kinds2 = [
    ...Array(want.s).fill("shambler"),
    ...Array(want.r).fill("runner"),
    ...Array(want.b).fill("brute")
  ];
  const sx = (startRoom.x + startRoom.w / 2) * TILE;
  const sy = (startRoom.y + startRoom.h / 2) * TILE;
  const candidates = [];
  for (let y = 3; y < H - 3; y++) {
    for (let x = 3; x < W - 3; x++) {
      const i = idx2(x, y);
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
  const out = [];
  for (let i = 0; i < kinds2.length && i < candidates.length; i++) out.push({ ...candidates[i], kind: kinds2[i] });
  return out;
}
function generateRoof(index, seed) {
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
      b.tiles[idx2(xx, yy)] = edge ? Tile.Wall : Tile.Floor;
      if (!edge) b.floorStyle[idx2(xx, yy)] = 6;
    }
  }
  for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) b.wallStyle[idx2(xx, yy)] = 6;
  const room = addRoom(b, x + 1, y + 1, rw - 2, rh - 2, "corridor", "start", 0, false, rng);
  b.roomZones[room.id] = "DACH";
  for (let yy = room.y; yy < room.y + room.h; yy++) for (let xx = room.x; xx < room.x + room.w; xx++) b.floorStyle[idx2(xx, yy)] = 6;
  const structures = [
    { x: x + 3, y: y + 7, w: 3, h: 2 },
    { x: x + rw - 7, y: y + 6, w: 3, h: 2 },
    { x: x + 4, y: y + 18, w: 4, h: 2 },
    { x: x + rw - 8, y: y + 19, w: 4, h: 2 },
    { x: x + 3, y: y + rh - 9, w: 4, h: 2 },
    { x: x + rw - 7, y: y + rh - 10, w: 3, h: 2 }
  ];
  for (const s of structures) carveRect(b.tiles, s.x, s.y, s.w, s.h, Tile.Wall);
  const vents = ["vent", "watertank", "antenna", "satellite", "vent", "vent"];
  structures.forEach((s, i) => addProp(b, vents[i], s.x, s.y - 1, 2, 1, true));
  addProp(b, "antenna", x + rw - 5, y + 3, 1, 1, true);
  addProp(b, "satellite", x + 2, y + 3, 2, 1, true);
  for (let a = 0; a < 42; a++) {
    const px = x + 2 + rng.int(rw - 4);
    const py = y + 2 + rng.int(rh - 4);
    const i = idx2(px, py);
    if (b.tiles[i] === Tile.Floor && rng.chance(0.7)) b.tiles[i] = Tile.Puddle;
  }
  const sx = x + 5;
  const sy = y + rh - 4;
  b.tiles[idx2(sx, sy)] = Tile.StairsDown;
  const fx = x + Math.floor(rw / 2);
  const fy = y + 8;
  b.tiles[idx2(fx, fy)] = Tile.Floor;
  addProp(b, "flare", fx, fy, 1, 1, true);
  addProp(b, "medbox", x + 2, y + rh - 4, 1, 1, true, "med");
  addProp(b, "supplycase", x + 2, y + rh - 5, 1, 1, true, "ammo");
  addProp(b, "locker", x + rw - 3, y + 6, 1, 1, true, "battery");
  addProp(b, "supplycase", x + rw - 3, y + 7, 1, 1, true, "shells");
  const spawns = [
    { x: (fx + 0.5) * TILE, y: (fy + 4.5) * TILE, kind: "boss", room: 0 },
    { x: (x + 5.5) * TILE, y: (y + 22.5) * TILE, kind: "shambler", room: 0 },
    { x: (x + rw - 5.5) * TILE, y: (y + 23.5) * TILE, kind: "shambler", room: 0 },
    { x: (x + 9.5) * TILE, y: (y + rh - 12.5) * TILE, kind: "shambler", room: 0 },
    { x: (x + rw - 9.5) * TILE, y: (y + rh - 13.5) * TILE, kind: "runner", room: 0 },
    { x: (x + 4.5) * TILE, y: (y + rh - 16.5) * TILE, kind: "runner", room: 0 },
    { x: (x + 6.5) * TILE, y: (y + 15.5) * TILE, kind: "brute", room: 0 }
  ];
  const windows = [];
  for (let a = 0; a < 22; a++) {
    windows.push({ x: 2 + rng.int(9), y: 4 + rng.int(H - 8), glow: rng.chance(0.6) ? "fluor" : "none" });
    windows.push({ x: W - 10 + rng.int(8), y: 4 + rng.int(H - 8), glow: rng.chance(0.5) ? "orange" : "none" });
  }
  const decals = [];
  for (let a = 0; a < 34; a++) {
    const px = x + 2 + rng.int(rw - 4);
    const py = y + 2 + rng.int(rh - 4);
    if (b.tiles[idx2(px, py)] === Tile.Floor) decals.push({ x: px, y: py, kind: rng.chance(0.6) ? "moss" : "crack" });
  }
  const wallDecals = [];
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
      { x: (x + 14.5) * TILE, y: (y + rh - 10.5) * TILE, kind: "brute" }
    ],
    survivors: [],
    lights: [
      { x: (fx + 0.5) * TILE, y: (fy + 0.5) * TILE, kind: "emergency", flicker: false, roomId: 0, radius: 7 * TILE },
      { x: (sx + 0.5) * TILE, y: (sy + 0.5) * TILE, kind: "fluor", flicker: true, roomId: 0, radius: 5 * TILE },
      { x: (x + rw - 5.5) * TILE, y: (y + 14.5) * TILE, kind: "sodium", flicker: false, roomId: 0, radius: 5 * TILE }
    ],
    playerStart: { x: (sx + 0.5) * TILE, y: (sy - 1.2) * TILE },
    stairsUp: null,
    stairsDown: { x: sx, y: sy },
    locked: false,
    keyPropId: null,
    flare: { x: fx, y: fy }
  };
}
function reachableTiles(floor, beforeKey) {
  const blocked = new Uint8Array(W * H);
  for (const p of floor.props) {
    if (!p.solid) continue;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) blocked[idx2(x, y)] = 1;
  }
  for (const d of floor.doors) if (d.sealed || beforeKey && d.locked) blocked[idx2(d.x, d.y)] = 1;
  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  const start = idx2(Math.floor(floor.playerStart.x / TILE), Math.floor(floor.playerStart.y / TILE));
  if (blocked[start]) return seen;
  queue[0] = start;
  seen[start] = 1;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const here = queue[head];
    for (const [dx, dy] of N4) {
      const x = here % W + dx, y = Math.floor(here / W) + dy;
      if (!inb2(x, y)) continue;
      const next = idx2(x, y);
      if (seen[next] || blocked[next] || !PASSABLE2.has(floor.tiles[next])) continue;
      queue[tail++] = next;
      seen[next] = 1;
    }
  }
  return seen;
}
function canSearchFrom(seen, p) {
  for (let y = p.y; y < p.y + p.h; y++) {
    for (let x = p.x; x < p.x + p.w; x++) {
      if (N4.some(([dx, dy]) => inb2(x + dx, y + dy) && seen[idx2(x + dx, y + dy)])) return true;
    }
  }
  return false;
}
function validateGeometry(floor) {
  const t = floor.tiles;
  for (const r of floor.rooms) {
    if (["KORYTARZ", "DACH", "WINDA OSOBOWA", "PION TECHNICZNY", "KLATKA B"].includes(floor.roomZones[r.id])) continue;
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const onBorder = x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h;
        if (!onBorder) continue;
        if (!inb2(x, y)) return `room ${r.id} touches map edge`;
        const v = t[idx2(x, y)];
        if (v === Tile.Floor || v === Tile.Puddle) return `room ${r.id} has open perimeter at ${x},${y}`;
      }
    }
  }
  for (const d of floor.doors) {
    const p = (x, y) => inb2(x, y) && PASSABLE2.has(t[idx2(x, y)]);
    const ns = p(d.x, d.y - 1) && p(d.x, d.y + 1);
    const ew = p(d.x - 1, d.y) && p(d.x + 1, d.y);
    if (!ns && !ew) return `door at ${d.x},${d.y} leads into a wall`;
  }
  return null;
}
function validateFloor(floor) {
  const startTx = Math.floor(floor.playerStart.x / TILE);
  const startTy = Math.floor(floor.playerStart.y / TILE);
  if (!inb2(startTx, startTy)) return "start out of bounds";
  const st = floor.tiles[idx2(startTx, startTy)];
  if (st === Tile.Wall || st === Tile.Window || st === Tile.Sky || st === Tile.Door) return "start blocked";
  const geo = validateGeometry(floor);
  if (geo) return geo;
  const accessible = reachableTiles(floor, false);
  for (const p of floor.props) {
    if ((p.loot || p.kind === "flare") && !canSearchFrom(accessible, p)) return `unreachable supply: ${p.id}`;
  }
  if (floor.theme === "roof") return floor.flare ? null : "no flare";
  if (!floor.stairsUp || !accessible[idx2(floor.stairsUp.x, floor.stairsUp.y)]) return "cannot reach stairs";
  const discovery = DISCOVERIES[floor.index];
  if (discovery && !floor.props.some((p) => p.loot === discovery)) return "missing weapon cache";
  if (floor.locked) {
    const key = floor.props.find((p) => p.id === floor.keyPropId && p.loot === "key");
    if (!key || !canSearchFrom(reachableTiles(floor, true), key)) return "cannot reach key before unlocking";
  }
  return validateEnvironment(floor);
}
function generateFloor(index, seed, runSeed, generatorVersion = 2) {
  const buildingSeed = runSeed ?? seed;
  for (let a = 0; a < 36; a++) {
    const s = seed + a * 997 >>> 0;
    try {
      const floor = index === 10 ? generateRoof(index, s) : generatorVersion === 1 ? buildFloor(index, s) : buildVariedFloor(index, s, buildingSeed);
      if (!floor || validateFloor(floor)) continue;
      if (index < 10) installVerticalRoutes(floor, buildingSeed);
      populateEnvironment(floor);
      if (index < 10) installVerticalQuests(floor, buildingSeed);
      installTacticalContent(floor);
      if (!validateFloor(floor)) return floor;
    } catch {
    }
  }
  const fallback = generatorVersion === 1 ? fallbackFloor(index, seed) : buildVariedFloor(index, seed ^ 1971560899, buildingSeed) ?? fallbackFloor(index, seed);
  if (index < 10) installVerticalRoutes(fallback, buildingSeed);
  populateEnvironment(fallback);
  if (index < 10) installVerticalQuests(fallback, buildingSeed);
  installTacticalContent(fallback);
  return fallback;
}
function fallbackFloor(index, seed) {
  const meta = FLOOR_META[index];
  if (index === 10) return generateRoof(index, seed ^ 2654435769);
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
  b.tiles[idx2(up.x, up.y)] = Tile.StairsUp;
  b.tiles[idx2(12, 76)] = Tile.StairsDown;
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
    flare: null
  };
}

// tests/environment.test.ts
var tile = (d, p) => d.tiles[p.y * d.w + p.x];
var samples = /* @__PURE__ */ new Map();
var kinds = /* @__PURE__ */ new Set();
var rooms = /* @__PURE__ */ new Set();
var safe = /* @__PURE__ */ new Set([Tile.Floor, Tile.Puddle, Tile.Rubble]);
var shortcuts = 0;
var tested = 0;
for (let i = 0; i < 11; i++) for (let n = 0; n < 32; n++) {
  const seed = 7 + n * 218951 + i * 3347;
  const d = generateFloor(i, seed);
  const plan = d.environment;
  assert.equal(validateFloor(d), null);
  assert.equal(validateEnvironment(d), null);
  if (n === 0) assert.deepEqual(generateFloor(i, seed).environment, plan, "Same layout seed, same sights and rewards");
  if (i === 10) assert.deepEqual(plan.features, [], "No hazards on the roof");
  else {
    assert.ok(plan.features.some((f) => f.kind === "obstruction"));
    assert.ok(plan.features.some((f) => f.kind === "wall"));
  }
  const start = { x: Math.floor(d.playerStart.x / TILE), y: Math.floor(d.playerStart.y / TILE) };
  for (const c of [...plannedBlocks(plan), ...plannedAccess(plan)]) {
    assert.ok(Math.abs(c.x - start.x) + Math.abs(c.y - start.y) >= 6);
    const room = d.rooms[d.roomOf[c.y * d.w + c.x]];
    assert.ok(!room || room.role === "normal", "No hazard on the start or the stairs");
  }
  const doors = new Set(d.doors.filter((p) => p.sealed).map((p) => `${p.x}:${p.y}`));
  for (const f of plan.features) {
    const label = f.kind === "obstruction" || f.kind === "surface" ? `${f.kind}:${f.material}` : f.kind === "wire" ? `${f.kind}:${f.mode}` : f.kind;
    kinds.add(label);
    if (!samples.has(label)) samples.set(label, { d, f });
    if (f.kind === "wire") kinds.add(`mount:${f.mount}`);
    if (f.kind === "wall") {
      assert.equal(tile(d, f.at), Tile.Wall);
      assert.ok(safe.has(tile(d, f.front)) && safe.has(tile(d, f.back)));
      assert.equal(d.roomOf[f.back.y * d.w + f.back.x], f.room);
    }
    if (f.kind === "obstruction") {
      assert.ok(doors.has(`${f.gate.x}:${f.gate.y}`));
      assert.ok([f.at, f.park, f.stand].every((p) => safe.has(tile(d, p))));
      assert.equal(Math.abs(f.park.x - f.at.x) + Math.abs(f.park.y - f.at.y), 1);
    }
    if (f.kind === "wire" && f.mode === "pool") {
      assert.ok(f.cells.every((p) => tile(d, p) === Tile.Puddle));
      const joined = [f.cells[0]];
      while (joined.length < f.cells.length) {
        const next = f.cells.find((c) => !joined.includes(c) && joined.some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) === 1));
        assert.ok(next, "No detached electrified water tiles");
        joined.push(next);
      }
    }
    if (f.kind === "steam" && f.shortcut) {
      assert.equal(tile(d, f.shortcut.gate), Tile.Rubble);
      const check = (p) => d.breaches.some((b) => sameCell(b, p));
      assert.ok(check(f.shortcut.gate));
      shortcuts++;
    }
  }
  for (const a of plan.annexes) {
    rooms.add(d.roomZones[a.room]);
    for (const p of a.props) if (isWeapon(p.loot)) {
      assert.ok(Object.entries(DISCOVERIES).some(([floor, weapon]) => p.loot === weapon && Number(floor) <= i));
    }
  }
  tested++;
}
for (const name of [
  "wall",
  "wire:steady",
  "wire:pulse",
  "wire:pool",
  "mount:wall",
  "mount:ceiling",
  "mount:floor",
  "shelf",
  "gas",
  "steam",
  "weak",
  "obstruction:cabinet",
  "obstruction:fridge",
  "obstruction:dresser",
  "obstruction:bookcase",
  "obstruction:boards",
  "obstruction:upturned",
  "surface:glass",
  "surface:cans",
  "surface:planks"
]) {
  assert.ok(kinds.has(name), `No generated ${name}`);
}
assert.ok(shortcuts > 15 && rooms.size >= 6, "Linked rooms were not represented in the sweep");
function create(d, f) {
  const floor = structuredClone(d);
  floor.environment.features = [f];
  floor.environment.annexes = floor.environment.annexes.filter((a) => a.seal === f.id);
  const hero = { id: 0, x: d.playerStart.x, y: d.playerStart.y, radius: 4.4, hidden: false, busy: false };
  const zombie = { id: 2, x: -50, y: -50, radius: 5 };
  const hits = [];
  const alerts = [];
  const sounds = [];
  let changes = 0;
  let blocked = false;
  const world = {
    player: () => hero,
    actors: () => [...hero.hidden ? [] : [hero], zombie],
    clear: () => !blocked,
    hit: (a, damage) => {
      hits.push({ id: a.id, damage });
    },
    sound: (sound) => sounds.push(sound),
    alert: (p, radius) => alerts.push({ p, radius }),
    dust: () => {
    },
    shake: () => {
    },
    say: () => {
    },
    changed: () => {
      changes++;
    }
  };
  const env = new Environment(floor, createEnvironmentState(), world);
  const tick = (seconds) => {
    for (let t = 0; t < seconds; t += 0.02) env.update(0.02);
  };
  return { f, floor, env, hero, zombie, hits, alerts, sounds, world, tick, block: (v) => {
    blocked = v;
  }, changes: () => changes };
}
function sample(kind, key = kind) {
  const v = samples.get(key);
  assert.equal(v.f.kind, kind);
  return create(v.d, v.f);
}
var pool = sample("wire", "wire:pool");
assert.ok(pool.f.control);
Object.assign(pool.hero, center(pool.f.cells[1]));
Object.assign(pool.zombie, center(pool.f.cells[2]));
pool.tick(0.95);
assert.deepEqual(pool.hits.map((h) => h.id), [0, 2], "Electricity hits both actors, not every frame");
pool.tick(0.3);
assert.deepEqual(pool.hits.map((h) => h.id), [0, 2, 0, 2]);
Object.assign(pool.hero, center(pool.f.control));
assert.equal(pool.env.use(), true);
assert.equal(pool.env.roomDark(pool.f.room), true);
pool.tick(2);
assert.equal(pool.hits.length, 4);
var restoredPool = new Environment(pool.floor, JSON.parse(JSON.stringify(pool.env.state)), pool.world);
assert.ok(restoredPool.roomDark(pool.f.room) && restoredPool.read(pool.f).off);
var pulse = sample("wire", "wire:pulse");
var bounds = effectBounds(pulse.f)[0];
pulse.env.state.clock = 5.6 - pulse.f.phase + 3.45;
assert.equal(cycleFor(pulse.f, pulse.env.read(pulse.f), pulse.env.clock), "charging");
Object.assign(pulse.hero, center(pulse.f.at));
pulse.tick(0.5);
assert.equal(pulse.hits.length, 0, "Visible warning is not the damaging phase");
Object.assign(pulse.hero, { x: bounds.x - 1, y: bounds.y + 2 });
pulse.tick(0.72);
assert.equal(pulse.hits.length, 0, "Inset region and damage bounds agree");
Object.assign(pulse.hero, center(pulse.f.at));
pulse.tick(0.1);
assert.equal(pulse.hits.length, 1);
var wall = sample("wall");
Object.assign(wall.hero, center(wall.f.back));
wall.tick(0.2);
assert.equal(wall.env.read(wall.f).stage, "idle");
Object.assign(wall.hero, center(wall.f.front));
wall.block(true);
wall.tick(0.3);
assert.equal(wall.env.read(wall.f).stage, "idle", "No warning through solid walls");
wall.block(false);
wall.tick(0.03);
assert.equal(wall.env.read(wall.f).stage, "warning");
Object.assign(wall.zombie, center(wall.f.front));
Object.assign(wall.hero, wall.floor.playerStart);
wall.tick(WALL_WARNING - 0.2);
assert.equal(tile(wall.floor, wall.f.at), Tile.Wall);
wall.tick(0.3);
assert.deepEqual(wall.hits.map((h) => h.id), [2]);
assert.equal(tile(wall.floor, wall.f.at), Tile.Rubble);
assert.equal(wall.env.roomHidden(wall.f.room), false);
assert.ok(wall.sounds.includes("collapse") && wall.alerts.length === 1);
wall.tick(5);
assert.equal(wall.changes(), 1, "One collapse, even after retreat/revisit");
var box = sample("obstruction", "obstruction:fridge");
Object.assign(box.hero, center(box.f.stand));
assert.ok(box.env.hint()?.hold);
assert.equal(box.env.use(), true);
assert.equal(box.env.read(box.f).progress, 0, "A tap is not a hold");
for (let t = 0; t < 1; t += 0.02) {
  box.env.updateWork(0.02, true, 100, false);
  box.env.update(0.02);
}
var moved = box.env.read(box.f).progress;
assert.ok(moved > 0.25 && moved < 0.3 && box.sounds.includes("scrape"));
assert.equal(box.env.blocksTile(box.f.park.x, box.f.park.y), true, "The collider follows a partly moved object");
box.env.updateWork(0.02, false, 100, false);
box.tick(1);
assert.equal(box.env.read(box.f).progress, moved);
Object.assign(box.zombie, center(box.f.park));
for (let t = 0; t < 4; t += 0.02) box.env.updateWork(0.02, true, 100, false);
assert.ok(box.env.read(box.f).progress < 1, "Cannot slide furniture through an actor");
Object.assign(box.zombie, { x: -100, y: -100 });
for (let t = 0; t < 4; t += 0.02) box.env.updateWork(0.02, true, 100, false);
assert.equal(tile(box.floor, box.f.gate), Tile.DoorOpen);
assert.ok(box.env.blocksTile(box.f.park.x, box.f.park.y) && !box.env.blocksTile(box.f.at.x, box.f.at.y));
var boardsA = sample("obstruction", "obstruction:boards");
var boardsB = sample("obstruction", "obstruction:boards");
Object.assign(boardsA.hero, center(boardsA.f.stand));
Object.assign(boardsB.hero, center(boardsB.f.stand));
boardsA.env.updateWork(1, true, 100, false);
boardsB.env.updateWork(1, true, 100, true);
assert.ok(boardsB.env.read(boardsB.f).progress > boardsA.env.read(boardsA.f).progress);
var steam = sample("steam");
steam.env.state.clock = 6.3 - steam.f.phase + 4.9;
var jet = effectBounds(steam.f)[0];
Object.assign(steam.hero, { x: steam.f.heading.x ? jet.x + 2 : jet.x - 1, y: steam.f.heading.x ? jet.y - 1 : jet.y + 2 });
steam.tick(0.14);
assert.equal(steam.hits.length, 0);
Object.assign(steam.hero, center(steam.f.at));
steam.tick(0.14);
assert.ok(steam.env.inSteam(steam.hero.x, steam.hero.y) && steam.hits.length === 1);
Object.assign(steam.hero, center(steam.f.control));
assert.ok(steam.env.use());
Object.assign(steam.hero, center(steam.f.at));
steam.tick(7);
assert.equal(steam.hits.length, 1);
var weak = sample("weak");
Object.assign(weak.hero, center(weak.f.at));
weak.tick(FLOOR_WARNING - 0.1);
assert.equal(tile(weak.floor, weak.f.at), Tile.Floor);
Object.assign(weak.hero, weak.floor.playerStart);
weak.tick(0.23);
assert.equal(tile(weak.floor, weak.f.at), Tile.Hole);
assert.deepEqual(weak.hits, []);
var shelf = sample("shelf");
Object.assign(shelf.hero, center(shelf.f.stand));
var point = center(shelf.f.at);
assert.equal(shelf.env.strike(Math.atan2(point.y - shelf.hero.y, point.x - shelf.hero.x), 22), true);
Object.assign(shelf.zombie, center(shelf.f.landing));
shelf.tick(SHELF_WARNING + 0.1);
assert.ok(!shelf.env.blocksTile(shelf.f.at.x, shelf.f.at.y) && shelf.env.blocksTile(shelf.f.landing.x, shelf.f.landing.y));
assert.deepEqual(shelf.hits.map((h) => h.id), [2]);
assert.equal(shelf.floor.props.filter((p) => p.id === shelf.f.stash.id).length, 1);
new Environment(shelf.floor, shelf.env.state, shelf.world);
assert.equal(shelf.floor.props.filter((p) => p.id === shelf.f.stash.id).length, 1, "Shelf may only reveal one stash");
var glass = sample("surface", "surface:glass");
Object.assign(glass.hero, center(glass.f.at));
glass.env.footstep(glass.hero, false);
glass.tick(0.5);
glass.env.footstep(glass.hero, true);
assert.equal(glass.hits.length, 1);
assert.ok(glass.alerts[1].radius > glass.alerts[0].radius);
var gas = sample("gas");
Object.assign(gas.hero, center(gas.f.cells[0]));
gas.env.ignite(gas.hero);
gas.tick(GAS_WARNING - 0.2);
assert.equal(gas.hits.length, 0, "Gas has a grace interval");
Object.assign(gas.hero, center(gas.f.control));
assert.ok(gas.env.use());
assert.equal(gas.env.read(gas.f).stage, "venting");
gas.tick(GAS_CLEAR + 0.1);
assert.equal(gas.env.read(gas.f).stage, "settled");
assert.equal(gas.hits.length, 0, "Closing the valve cancels the warning and damage");
var lit = sample("gas");
Object.assign(lit.zombie, center(lit.f.cells[1]));
lit.env.ignite(center(lit.f.at));
lit.tick(GAS_WARNING + 0.2);
assert.deepEqual(lit.hits.map((h) => h.id), [2]);
assert.ok(lit.sounds.includes("flare"));
assert.equal(parseCheckpoint("{this is not a save}"), null);
console.log(`OK: ${tested} floors with safe routes, seeded annexes and ${shortcuts} steam shortcuts; all environment states, damage, controls and interactions.`);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdGVzdHMvZW52aXJvbm1lbnQudGVzdC50cyIsICIuLi9zcmMvZ2FtZS9pbnZlbnRvcnkudHMiLCAiLi4vc3JjL2dhbWUvcGFsZXR0ZS50cyIsICIuLi9zcmMvZ2FtZS9jaGVja3BvaW50LnRzIiwgIi4uL3NyYy9nYW1lL3BhdGgudHMiLCAiLi4vc3JjL2dhbWUvcm5nLnRzIiwgIi4uL3NyYy9nYW1lL2Vudmlyb25tZW50LWxheW91dC50cyIsICIuLi9zcmMvZ2FtZS9lbnZpcm9ubWVudC50cyIsICIuLi9zcmMvZ2FtZS92ZXJ0aWNhbC1sYXlvdXQudHMiLCAiLi4vc3JjL2dhbWUvdGFjdGljYWwtbGF5b3V0LnRzIiwgIi4uL3NyYy9nYW1lL2dlbmVyYXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgYXNzZXJ0IGZyb20gXCJub2RlOmFzc2VydC9zdHJpY3RcIjtcbmltcG9ydCB7IHBhcnNlQ2hlY2twb2ludCB9IGZyb20gXCIuLi9zcmMvZ2FtZS9jaGVja3BvaW50XCI7XG5pbXBvcnQgeyBFbnZpcm9ubWVudCwgY3JlYXRlRW52aXJvbm1lbnRTdGF0ZSwgY3ljbGVGb3IsIGVmZmVjdEJvdW5kcywgRkxPT1JfV0FSTklORywgR0FTX0NMRUFSLCBHQVNfV0FSTklORywgU0hFTEZfV0FSTklORywgV0FMTF9XQVJOSU5HLCB0eXBlIEVudmlyb25tZW50V29ybGQgfSBmcm9tIFwiLi4vc3JjL2dhbWUvZW52aXJvbm1lbnRcIjtcbmltcG9ydCB7IGNlbnRlciwgcGxhbm5lZEFjY2VzcywgcGxhbm5lZEJsb2Nrcywgc2FtZUNlbGwsIHZhbGlkYXRlRW52aXJvbm1lbnQsIHR5cGUgQ2VsbCwgdHlwZSBGZWF0dXJlIH0gZnJvbSBcIi4uL3NyYy9nYW1lL2Vudmlyb25tZW50LWxheW91dFwiO1xuaW1wb3J0IHsgZ2VuZXJhdGVGbG9vciwgdmFsaWRhdGVGbG9vciB9IGZyb20gXCIuLi9zcmMvZ2FtZS9nZW5lcmF0ZVwiO1xuaW1wb3J0IHsgRElTQ09WRVJJRVMsIGlzV2VhcG9uIH0gZnJvbSBcIi4uL3NyYy9nYW1lL2ludmVudG9yeVwiO1xuaW1wb3J0IHsgVElMRSwgVGlsZSB9IGZyb20gXCIuLi9zcmMvZ2FtZS9wYWxldHRlXCI7XG5pbXBvcnQgdHlwZSB7IEZsb29yRGF0YSB9IGZyb20gXCIuLi9zcmMvZ2FtZS90eXBlc1wiO1xuXG5jb25zdCB0aWxlID0gKGQ6IEZsb29yRGF0YSwgcDogQ2VsbCkgPT4gZC50aWxlc1twLnkgKiBkLncgKyBwLnhdO1xuY29uc3Qgc2FtcGxlcyA9IG5ldyBNYXA8c3RyaW5nLCB7IGQ6IEZsb29yRGF0YTsgZjogRmVhdHVyZSB9PigpO1xuY29uc3Qga2luZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbmNvbnN0IHJvb21zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5jb25zdCBzYWZlID0gbmV3IFNldChbVGlsZS5GbG9vciwgVGlsZS5QdWRkbGUsIFRpbGUuUnViYmxlXSBhcyBudW1iZXJbXSk7XG5sZXQgc2hvcnRjdXRzID0gMDtcbmxldCB0ZXN0ZWQgPSAwO1xuZm9yIChsZXQgaSA9IDA7IGkgPCAxMTsgaSsrKSBmb3IgKGxldCBuID0gMDsgbiA8IDMyOyBuKyspIHtcbiAgY29uc3Qgc2VlZCA9IDcgKyBuICogMjE4OTUxICsgaSAqIDMzNDc7XG4gIGNvbnN0IGQgPSBnZW5lcmF0ZUZsb29yKGksIHNlZWQpO1xuICBjb25zdCBwbGFuID0gZC5lbnZpcm9ubWVudCE7XG4gIGFzc2VydC5lcXVhbCh2YWxpZGF0ZUZsb29yKGQpLCBudWxsKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRlRW52aXJvbm1lbnQoZCksIG51bGwpO1xuICBpZiAobiA9PT0gMCkgYXNzZXJ0LmRlZXBFcXVhbChnZW5lcmF0ZUZsb29yKGksIHNlZWQpLmVudmlyb25tZW50LCBwbGFuLCBcIlNhbWUgbGF5b3V0IHNlZWQsIHNhbWUgc2lnaHRzIGFuZCByZXdhcmRzXCIpO1xuICBpZiAoaSA9PT0gMTApIGFzc2VydC5kZWVwRXF1YWwocGxhbi5mZWF0dXJlcywgW10sIFwiTm8gaGF6YXJkcyBvbiB0aGUgcm9vZlwiKTtcbiAgZWxzZSB7XG4gICAgYXNzZXJ0Lm9rKHBsYW4uZmVhdHVyZXMuc29tZSgoZikgPT4gZi5raW5kID09PSBcIm9ic3RydWN0aW9uXCIpKTtcbiAgICBhc3NlcnQub2socGxhbi5mZWF0dXJlcy5zb21lKChmKSA9PiBmLmtpbmQgPT09IFwid2FsbFwiKSk7XG4gIH1cbiAgY29uc3Qgc3RhcnQgPSB7IHg6IE1hdGguZmxvb3IoZC5wbGF5ZXJTdGFydC54IC8gVElMRSksIHk6IE1hdGguZmxvb3IoZC5wbGF5ZXJTdGFydC55IC8gVElMRSkgfTtcbiAgZm9yIChjb25zdCBjIG9mIFsuLi5wbGFubmVkQmxvY2tzKHBsYW4pLCAuLi5wbGFubmVkQWNjZXNzKHBsYW4pXSkge1xuICAgIGFzc2VydC5vayhNYXRoLmFicyhjLnggLSBzdGFydC54KSArIE1hdGguYWJzKGMueSAtIHN0YXJ0LnkpID49IDYpO1xuICAgIGNvbnN0IHJvb20gPSBkLnJvb21zW2Qucm9vbU9mW2MueSAqIGQudyArIGMueF1dO1xuICAgIGFzc2VydC5vayghcm9vbSB8fCByb29tLnJvbGUgPT09IFwibm9ybWFsXCIsIFwiTm8gaGF6YXJkIG9uIHRoZSBzdGFydCBvciB0aGUgc3RhaXJzXCIpO1xuICB9XG4gIGNvbnN0IGRvb3JzID0gbmV3IFNldChkLmRvb3JzLmZpbHRlcigocCkgPT4gcC5zZWFsZWQpLm1hcCgocCkgPT4gYCR7cC54fToke3AueX1gKSk7XG4gIGZvciAoY29uc3QgZiBvZiBwbGFuLmZlYXR1cmVzKSB7XG4gICAgY29uc3QgbGFiZWwgPSBmLmtpbmQgPT09IFwib2JzdHJ1Y3Rpb25cIiB8fCBmLmtpbmQgPT09IFwic3VyZmFjZVwiID8gYCR7Zi5raW5kfToke2YubWF0ZXJpYWx9YCA6IGYua2luZCA9PT0gXCJ3aXJlXCIgPyBgJHtmLmtpbmR9OiR7Zi5tb2RlfWAgOiBmLmtpbmQ7XG4gICAga2luZHMuYWRkKGxhYmVsKTtcbiAgICBpZiAoIXNhbXBsZXMuaGFzKGxhYmVsKSkgc2FtcGxlcy5zZXQobGFiZWwsIHsgZCwgZiB9KTtcbiAgICBpZiAoZi5raW5kID09PSBcIndpcmVcIikga2luZHMuYWRkKGBtb3VudDoke2YubW91bnR9YCk7XG4gICAgaWYgKGYua2luZCA9PT0gXCJ3YWxsXCIpIHtcbiAgICAgIGFzc2VydC5lcXVhbCh0aWxlKGQsIGYuYXQpLCBUaWxlLldhbGwpO1xuICAgICAgYXNzZXJ0Lm9rKHNhZmUuaGFzKHRpbGUoZCwgZi5mcm9udCkpICYmIHNhZmUuaGFzKHRpbGUoZCwgZi5iYWNrKSkpO1xuICAgICAgYXNzZXJ0LmVxdWFsKGQucm9vbU9mW2YuYmFjay55ICogZC53ICsgZi5iYWNrLnhdLCBmLnJvb20pO1xuICAgIH1cbiAgICBpZiAoZi5raW5kID09PSBcIm9ic3RydWN0aW9uXCIpIHtcbiAgICAgIGFzc2VydC5vayhkb29ycy5oYXMoYCR7Zi5nYXRlLnh9OiR7Zi5nYXRlLnl9YCkpO1xuICAgICAgYXNzZXJ0Lm9rKFtmLmF0LCBmLnBhcmssIGYuc3RhbmRdLmV2ZXJ5KChwKSA9PiBzYWZlLmhhcyh0aWxlKGQsIHApKSkpO1xuICAgICAgYXNzZXJ0LmVxdWFsKE1hdGguYWJzKGYucGFyay54IC0gZi5hdC54KSArIE1hdGguYWJzKGYucGFyay55IC0gZi5hdC55KSwgMSk7XG4gICAgfVxuICAgIGlmIChmLmtpbmQgPT09IFwid2lyZVwiICYmIGYubW9kZSA9PT0gXCJwb29sXCIpIHtcbiAgICAgIGFzc2VydC5vayhmLmNlbGxzLmV2ZXJ5KChwKSA9PiB0aWxlKGQsIHApID09PSBUaWxlLlB1ZGRsZSkpO1xuICAgICAgY29uc3Qgam9pbmVkID0gW2YuY2VsbHNbMF1dO1xuICAgICAgd2hpbGUgKGpvaW5lZC5sZW5ndGggPCBmLmNlbGxzLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBuZXh0ID0gZi5jZWxscy5maW5kKChjKSA9PiAham9pbmVkLmluY2x1ZGVzKGMpICYmIGpvaW5lZC5zb21lKChwKSA9PiBNYXRoLmFicyhwLnggLSBjLngpICsgTWF0aC5hYnMocC55IC0gYy55KSA9PT0gMSkpO1xuICAgICAgICBhc3NlcnQub2sobmV4dCwgXCJObyBkZXRhY2hlZCBlbGVjdHJpZmllZCB3YXRlciB0aWxlc1wiKTtcbiAgICAgICAgam9pbmVkLnB1c2gobmV4dCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmLmtpbmQgPT09IFwic3RlYW1cIiAmJiBmLnNob3J0Y3V0KSB7XG4gICAgICBhc3NlcnQuZXF1YWwodGlsZShkLCBmLnNob3J0Y3V0LmdhdGUpLCBUaWxlLlJ1YmJsZSk7XG4gICAgICBjb25zdCBjaGVjayA9IChwOiBDZWxsKSA9PiBkLmJyZWFjaGVzLnNvbWUoKGIpID0+IHNhbWVDZWxsKGIsIHApKTtcbiAgICAgIGFzc2VydC5vayhjaGVjayhmLnNob3J0Y3V0LmdhdGUpKTtcbiAgICAgIHNob3J0Y3V0cysrO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IGEgb2YgcGxhbi5hbm5leGVzKSB7XG4gICAgcm9vbXMuYWRkKGQucm9vbVpvbmVzW2Eucm9vbV0pO1xuICAgIGZvciAoY29uc3QgcCBvZiBhLnByb3BzKSBpZiAoaXNXZWFwb24ocC5sb290KSkge1xuICAgICAgYXNzZXJ0Lm9rKE9iamVjdC5lbnRyaWVzKERJU0NPVkVSSUVTKS5zb21lKChbZmxvb3IsIHdlYXBvbl0pID0+IHAubG9vdCA9PT0gd2VhcG9uICYmIE51bWJlcihmbG9vcikgPD0gaSkpO1xuICAgIH1cbiAgfVxuICB0ZXN0ZWQrKztcbn1cbmZvciAoY29uc3QgbmFtZSBvZiBbXCJ3YWxsXCIsIFwid2lyZTpzdGVhZHlcIiwgXCJ3aXJlOnB1bHNlXCIsIFwid2lyZTpwb29sXCIsIFwibW91bnQ6d2FsbFwiLCBcIm1vdW50OmNlaWxpbmdcIiwgXCJtb3VudDpmbG9vclwiLCBcInNoZWxmXCIsIFwiZ2FzXCIsIFwic3RlYW1cIiwgXCJ3ZWFrXCIsXG4gIFwib2JzdHJ1Y3Rpb246Y2FiaW5ldFwiLCBcIm9ic3RydWN0aW9uOmZyaWRnZVwiLCBcIm9ic3RydWN0aW9uOmRyZXNzZXJcIiwgXCJvYnN0cnVjdGlvbjpib29rY2FzZVwiLCBcIm9ic3RydWN0aW9uOmJvYXJkc1wiLCBcIm9ic3RydWN0aW9uOnVwdHVybmVkXCIsIFwic3VyZmFjZTpnbGFzc1wiLCBcInN1cmZhY2U6Y2Fuc1wiLCBcInN1cmZhY2U6cGxhbmtzXCJdKSB7XG4gIGFzc2VydC5vayhraW5kcy5oYXMobmFtZSksIGBObyBnZW5lcmF0ZWQgJHtuYW1lfWApO1xufVxuYXNzZXJ0Lm9rKHNob3J0Y3V0cyA+IDE1ICYmIHJvb21zLnNpemUgPj0gNiwgXCJMaW5rZWQgcm9vbXMgd2VyZSBub3QgcmVwcmVzZW50ZWQgaW4gdGhlIHN3ZWVwXCIpO1xuXG5mdW5jdGlvbiBjcmVhdGU8RiBleHRlbmRzIEZlYXR1cmU+KGQ6IEZsb29yRGF0YSwgZjogRikge1xuICBjb25zdCBmbG9vciA9IHN0cnVjdHVyZWRDbG9uZShkKTtcbiAgZmxvb3IuZW52aXJvbm1lbnQhLmZlYXR1cmVzID0gW2ZdO1xuICBmbG9vci5lbnZpcm9ubWVudCEuYW5uZXhlcyA9IGZsb29yLmVudmlyb25tZW50IS5hbm5leGVzLmZpbHRlcigoYSkgPT4gYS5zZWFsID09PSBmLmlkKTtcbiAgY29uc3QgaGVybyA9IHsgaWQ6IDAsIHg6IGQucGxheWVyU3RhcnQueCwgeTogZC5wbGF5ZXJTdGFydC55LCByYWRpdXM6IDQuNCwgaGlkZGVuOiBmYWxzZSwgYnVzeTogZmFsc2UgfTtcbiAgY29uc3Qgem9tYmllID0geyBpZDogMiwgeDogLTUwLCB5OiAtNTAsIHJhZGl1czogNSB9O1xuICBjb25zdCBoaXRzOiB7IGlkOiBudW1iZXI7IGRhbWFnZTogbnVtYmVyIH1bXSA9IFtdO1xuICBjb25zdCBhbGVydHM6IHsgcDogQ2VsbDsgcmFkaXVzOiBudW1iZXIgfVtdID0gW107XG4gIGNvbnN0IHNvdW5kczogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGNoYW5nZXMgPSAwO1xuICBsZXQgYmxvY2tlZCA9IGZhbHNlO1xuICBjb25zdCB3b3JsZDogRW52aXJvbm1lbnRXb3JsZCA9IHtcbiAgICBwbGF5ZXI6ICgpID0+IGhlcm8sIGFjdG9yczogKCkgPT4gWy4uLihoZXJvLmhpZGRlbiA/IFtdIDogW2hlcm9dKSwgem9tYmllXSwgY2xlYXI6ICgpID0+ICFibG9ja2VkLFxuICAgIGhpdDogKGEsIGRhbWFnZSkgPT4geyBoaXRzLnB1c2goeyBpZDogYS5pZCwgZGFtYWdlIH0pOyB9LCBzb3VuZDogKHNvdW5kKSA9PiBzb3VuZHMucHVzaChzb3VuZCksIGFsZXJ0OiAocCwgcmFkaXVzKSA9PiBhbGVydHMucHVzaCh7IHAsIHJhZGl1cyB9KSxcbiAgICBkdXN0OiAoKSA9PiB7fSwgc2hha2U6ICgpID0+IHt9LCBzYXk6ICgpID0+IHt9LCBjaGFuZ2VkOiAoKSA9PiB7IGNoYW5nZXMrKzsgfSxcbiAgfTtcbiAgY29uc3QgZW52ID0gbmV3IEVudmlyb25tZW50KGZsb29yLCBjcmVhdGVFbnZpcm9ubWVudFN0YXRlKCksIHdvcmxkKTtcbiAgY29uc3QgdGljayA9IChzZWNvbmRzOiBudW1iZXIpID0+IHsgZm9yIChsZXQgdCA9IDA7IHQgPCBzZWNvbmRzOyB0ICs9IDAuMDIpIGVudi51cGRhdGUoMC4wMik7IH07XG4gIHJldHVybiB7IGYsIGZsb29yLCBlbnYsIGhlcm8sIHpvbWJpZSwgaGl0cywgYWxlcnRzLCBzb3VuZHMsIHdvcmxkLCB0aWNrLCBibG9jazogKHY6IGJvb2xlYW4pID0+IHsgYmxvY2tlZCA9IHY7IH0sIGNoYW5nZXM6ICgpID0+IGNoYW5nZXMgfTtcbn1cblxuZnVuY3Rpb24gc2FtcGxlPEsgZXh0ZW5kcyBGZWF0dXJlW1wia2luZFwiXT4oa2luZDogSywga2V5OiBzdHJpbmcgPSBraW5kKSB7XG4gIGNvbnN0IHYgPSBzYW1wbGVzLmdldChrZXkpITtcbiAgYXNzZXJ0LmVxdWFsKHYuZi5raW5kLCBraW5kKTtcbiAgcmV0dXJuIGNyZWF0ZSh2LmQsIHYuZiBhcyBFeHRyYWN0PEZlYXR1cmUsIHsga2luZDogSyB9Pik7XG59XG5cbmNvbnN0IHBvb2wgPSBzYW1wbGUoXCJ3aXJlXCIsIFwid2lyZTpwb29sXCIpO1xuYXNzZXJ0Lm9rKHBvb2wuZi5jb250cm9sKTtcbk9iamVjdC5hc3NpZ24ocG9vbC5oZXJvLCBjZW50ZXIocG9vbC5mLmNlbGxzWzFdKSk7XG5PYmplY3QuYXNzaWduKHBvb2wuem9tYmllLCBjZW50ZXIocG9vbC5mLmNlbGxzWzJdKSk7XG5wb29sLnRpY2soMC45NSk7XG5hc3NlcnQuZGVlcEVxdWFsKHBvb2wuaGl0cy5tYXAoKGgpID0+IGguaWQpLCBbMCwgMl0sIFwiRWxlY3RyaWNpdHkgaGl0cyBib3RoIGFjdG9ycywgbm90IGV2ZXJ5IGZyYW1lXCIpO1xucG9vbC50aWNrKDAuMzApO1xuYXNzZXJ0LmRlZXBFcXVhbChwb29sLmhpdHMubWFwKChoKSA9PiBoLmlkKSwgWzAsIDIsIDAsIDJdKTtcbk9iamVjdC5hc3NpZ24ocG9vbC5oZXJvLCBjZW50ZXIocG9vbC5mLmNvbnRyb2wpKTtcbmFzc2VydC5lcXVhbChwb29sLmVudi51c2UoKSwgdHJ1ZSk7XG5hc3NlcnQuZXF1YWwocG9vbC5lbnYucm9vbURhcmsocG9vbC5mLnJvb20pLCB0cnVlKTtcbnBvb2wudGljaygyKTtcbmFzc2VydC5lcXVhbChwb29sLmhpdHMubGVuZ3RoLCA0KTtcbmNvbnN0IHJlc3RvcmVkUG9vbCA9IG5ldyBFbnZpcm9ubWVudChwb29sLmZsb29yLCBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHBvb2wuZW52LnN0YXRlKSksIHBvb2wud29ybGQpO1xuYXNzZXJ0Lm9rKHJlc3RvcmVkUG9vbC5yb29tRGFyayhwb29sLmYucm9vbSkgJiYgcmVzdG9yZWRQb29sLnJlYWQocG9vbC5mKS5vZmYpO1xuXG5jb25zdCBwdWxzZSA9IHNhbXBsZShcIndpcmVcIiwgXCJ3aXJlOnB1bHNlXCIpO1xuY29uc3QgYm91bmRzID0gZWZmZWN0Qm91bmRzKHB1bHNlLmYpWzBdO1xucHVsc2UuZW52LnN0YXRlLmNsb2NrID0gNS42IC0gcHVsc2UuZi5waGFzZSArIDMuNDU7XG5hc3NlcnQuZXF1YWwoY3ljbGVGb3IocHVsc2UuZiwgcHVsc2UuZW52LnJlYWQocHVsc2UuZiksIHB1bHNlLmVudi5jbG9jayksIFwiY2hhcmdpbmdcIik7XG5PYmplY3QuYXNzaWduKHB1bHNlLmhlcm8sIGNlbnRlcihwdWxzZS5mLmF0KSk7XG5wdWxzZS50aWNrKDAuNSk7XG5hc3NlcnQuZXF1YWwocHVsc2UuaGl0cy5sZW5ndGgsIDAsIFwiVmlzaWJsZSB3YXJuaW5nIGlzIG5vdCB0aGUgZGFtYWdpbmcgcGhhc2VcIik7XG5PYmplY3QuYXNzaWduKHB1bHNlLmhlcm8sIHsgeDogYm91bmRzLnggLSAxLCB5OiBib3VuZHMueSArIDIgfSk7XG5wdWxzZS50aWNrKDAuNzIpO1xuYXNzZXJ0LmVxdWFsKHB1bHNlLmhpdHMubGVuZ3RoLCAwLCBcIkluc2V0IHJlZ2lvbiBhbmQgZGFtYWdlIGJvdW5kcyBhZ3JlZVwiKTtcbk9iamVjdC5hc3NpZ24ocHVsc2UuaGVybywgY2VudGVyKHB1bHNlLmYuYXQpKTtcbnB1bHNlLnRpY2soMC4xKTtcbmFzc2VydC5lcXVhbChwdWxzZS5oaXRzLmxlbmd0aCwgMSk7XG5cbmNvbnN0IHdhbGwgPSBzYW1wbGUoXCJ3YWxsXCIpO1xuT2JqZWN0LmFzc2lnbih3YWxsLmhlcm8sIGNlbnRlcih3YWxsLmYuYmFjaykpO1xud2FsbC50aWNrKDAuMik7XG5hc3NlcnQuZXF1YWwod2FsbC5lbnYucmVhZCh3YWxsLmYpLnN0YWdlLCBcImlkbGVcIik7XG5PYmplY3QuYXNzaWduKHdhbGwuaGVybywgY2VudGVyKHdhbGwuZi5mcm9udCkpO1xud2FsbC5ibG9jayh0cnVlKTtcbndhbGwudGljaygwLjMpO1xuYXNzZXJ0LmVxdWFsKHdhbGwuZW52LnJlYWQod2FsbC5mKS5zdGFnZSwgXCJpZGxlXCIsIFwiTm8gd2FybmluZyB0aHJvdWdoIHNvbGlkIHdhbGxzXCIpO1xud2FsbC5ibG9jayhmYWxzZSk7XG53YWxsLnRpY2soMC4wMyk7XG5hc3NlcnQuZXF1YWwod2FsbC5lbnYucmVhZCh3YWxsLmYpLnN0YWdlLCBcIndhcm5pbmdcIik7XG5PYmplY3QuYXNzaWduKHdhbGwuem9tYmllLCBjZW50ZXIod2FsbC5mLmZyb250KSk7XG5PYmplY3QuYXNzaWduKHdhbGwuaGVybywgd2FsbC5mbG9vci5wbGF5ZXJTdGFydCk7XG53YWxsLnRpY2soV0FMTF9XQVJOSU5HIC0gMC4yKTtcbmFzc2VydC5lcXVhbCh0aWxlKHdhbGwuZmxvb3IsIHdhbGwuZi5hdCksIFRpbGUuV2FsbCk7XG53YWxsLnRpY2soMC4zKTtcbmFzc2VydC5kZWVwRXF1YWwod2FsbC5oaXRzLm1hcCgoaCkgPT4gaC5pZCksIFsyXSk7XG5hc3NlcnQuZXF1YWwodGlsZSh3YWxsLmZsb29yLCB3YWxsLmYuYXQpLCBUaWxlLlJ1YmJsZSk7XG5hc3NlcnQuZXF1YWwod2FsbC5lbnYucm9vbUhpZGRlbih3YWxsLmYucm9vbSksIGZhbHNlKTtcbmFzc2VydC5vayh3YWxsLnNvdW5kcy5pbmNsdWRlcyhcImNvbGxhcHNlXCIpICYmIHdhbGwuYWxlcnRzLmxlbmd0aCA9PT0gMSk7XG53YWxsLnRpY2soNSk7XG5hc3NlcnQuZXF1YWwod2FsbC5jaGFuZ2VzKCksIDEsIFwiT25lIGNvbGxhcHNlLCBldmVuIGFmdGVyIHJldHJlYXQvcmV2aXNpdFwiKTtcblxuY29uc3QgYm94ID0gc2FtcGxlKFwib2JzdHJ1Y3Rpb25cIiwgXCJvYnN0cnVjdGlvbjpmcmlkZ2VcIik7XG5PYmplY3QuYXNzaWduKGJveC5oZXJvLCBjZW50ZXIoYm94LmYuc3RhbmQpKTtcbmFzc2VydC5vayhib3guZW52LmhpbnQoKT8uaG9sZCk7XG5hc3NlcnQuZXF1YWwoYm94LmVudi51c2UoKSwgdHJ1ZSk7XG5hc3NlcnQuZXF1YWwoYm94LmVudi5yZWFkKGJveC5mKS5wcm9ncmVzcywgMCwgXCJBIHRhcCBpcyBub3QgYSBob2xkXCIpO1xuZm9yIChsZXQgdCA9IDA7IHQgPCAxOyB0ICs9IDAuMDIpIHsgYm94LmVudi51cGRhdGVXb3JrKDAuMDIsIHRydWUsIDEwMCwgZmFsc2UpOyBib3guZW52LnVwZGF0ZSgwLjAyKTsgfVxuY29uc3QgbW92ZWQgPSBib3guZW52LnJlYWQoYm94LmYpLnByb2dyZXNzO1xuYXNzZXJ0Lm9rKG1vdmVkID4gMC4yNSAmJiBtb3ZlZCA8IDAuMyAmJiBib3guc291bmRzLmluY2x1ZGVzKFwic2NyYXBlXCIpKTtcbmFzc2VydC5lcXVhbChib3guZW52LmJsb2Nrc1RpbGUoYm94LmYucGFyay54LCBib3guZi5wYXJrLnkpLCB0cnVlLCBcIlRoZSBjb2xsaWRlciBmb2xsb3dzIGEgcGFydGx5IG1vdmVkIG9iamVjdFwiKTtcbmJveC5lbnYudXBkYXRlV29yaygwLjAyLCBmYWxzZSwgMTAwLCBmYWxzZSk7XG5ib3gudGljaygxKTtcbmFzc2VydC5lcXVhbChib3guZW52LnJlYWQoYm94LmYpLnByb2dyZXNzLCBtb3ZlZCk7XG5PYmplY3QuYXNzaWduKGJveC56b21iaWUsIGNlbnRlcihib3guZi5wYXJrKSk7XG5mb3IgKGxldCB0ID0gMDsgdCA8IDQ7IHQgKz0gMC4wMikgYm94LmVudi51cGRhdGVXb3JrKDAuMDIsIHRydWUsIDEwMCwgZmFsc2UpO1xuYXNzZXJ0Lm9rKGJveC5lbnYucmVhZChib3guZikucHJvZ3Jlc3MgPCAxLCBcIkNhbm5vdCBzbGlkZSBmdXJuaXR1cmUgdGhyb3VnaCBhbiBhY3RvclwiKTtcbk9iamVjdC5hc3NpZ24oYm94LnpvbWJpZSwgeyB4OiAtMTAwLCB5OiAtMTAwIH0pO1xuZm9yIChsZXQgdCA9IDA7IHQgPCA0OyB0ICs9IDAuMDIpIGJveC5lbnYudXBkYXRlV29yaygwLjAyLCB0cnVlLCAxMDAsIGZhbHNlKTtcbmFzc2VydC5lcXVhbCh0aWxlKGJveC5mbG9vciwgYm94LmYuZ2F0ZSksIFRpbGUuRG9vck9wZW4pO1xuYXNzZXJ0Lm9rKGJveC5lbnYuYmxvY2tzVGlsZShib3guZi5wYXJrLngsIGJveC5mLnBhcmsueSkgJiYgIWJveC5lbnYuYmxvY2tzVGlsZShib3guZi5hdC54LCBib3guZi5hdC55KSk7XG5cbmNvbnN0IGJvYXJkc0EgPSBzYW1wbGUoXCJvYnN0cnVjdGlvblwiLCBcIm9ic3RydWN0aW9uOmJvYXJkc1wiKSwgYm9hcmRzQiA9IHNhbXBsZShcIm9ic3RydWN0aW9uXCIsIFwib2JzdHJ1Y3Rpb246Ym9hcmRzXCIpO1xuT2JqZWN0LmFzc2lnbihib2FyZHNBLmhlcm8sIGNlbnRlcihib2FyZHNBLmYuc3RhbmQpKTsgT2JqZWN0LmFzc2lnbihib2FyZHNCLmhlcm8sIGNlbnRlcihib2FyZHNCLmYuc3RhbmQpKTtcbmJvYXJkc0EuZW52LnVwZGF0ZVdvcmsoMSwgdHJ1ZSwgMTAwLCBmYWxzZSk7IGJvYXJkc0IuZW52LnVwZGF0ZVdvcmsoMSwgdHJ1ZSwgMTAwLCB0cnVlKTtcbmFzc2VydC5vayhib2FyZHNCLmVudi5yZWFkKGJvYXJkc0IuZikucHJvZ3Jlc3MgPiBib2FyZHNBLmVudi5yZWFkKGJvYXJkc0EuZikucHJvZ3Jlc3MpO1xuXG5jb25zdCBzdGVhbSA9IHNhbXBsZShcInN0ZWFtXCIpO1xuc3RlYW0uZW52LnN0YXRlLmNsb2NrID0gNi4zIC0gc3RlYW0uZi5waGFzZSArIDQuOTtcbmNvbnN0IGpldCA9IGVmZmVjdEJvdW5kcyhzdGVhbS5mKVswXTtcbk9iamVjdC5hc3NpZ24oc3RlYW0uaGVybywgeyB4OiBzdGVhbS5mLmhlYWRpbmcueCA/IGpldC54ICsgMiA6IGpldC54IC0gMSwgeTogc3RlYW0uZi5oZWFkaW5nLnggPyBqZXQueSAtIDEgOiBqZXQueSArIDIgfSk7XG5zdGVhbS50aWNrKDAuMTQpO1xuYXNzZXJ0LmVxdWFsKHN0ZWFtLmhpdHMubGVuZ3RoLCAwKTtcbk9iamVjdC5hc3NpZ24oc3RlYW0uaGVybywgY2VudGVyKHN0ZWFtLmYuYXQpKTtcbnN0ZWFtLnRpY2soMC4xNCk7XG5hc3NlcnQub2soc3RlYW0uZW52LmluU3RlYW0oc3RlYW0uaGVyby54LCBzdGVhbS5oZXJvLnkpICYmIHN0ZWFtLmhpdHMubGVuZ3RoID09PSAxKTtcbk9iamVjdC5hc3NpZ24oc3RlYW0uaGVybywgY2VudGVyKHN0ZWFtLmYuY29udHJvbCkpO1xuYXNzZXJ0Lm9rKHN0ZWFtLmVudi51c2UoKSk7XG5PYmplY3QuYXNzaWduKHN0ZWFtLmhlcm8sIGNlbnRlcihzdGVhbS5mLmF0KSk7XG5zdGVhbS50aWNrKDcpO1xuYXNzZXJ0LmVxdWFsKHN0ZWFtLmhpdHMubGVuZ3RoLCAxKTtcblxuY29uc3Qgd2VhayA9IHNhbXBsZShcIndlYWtcIik7XG5PYmplY3QuYXNzaWduKHdlYWsuaGVybywgY2VudGVyKHdlYWsuZi5hdCkpO1xud2Vhay50aWNrKEZMT09SX1dBUk5JTkcgLSAwLjEpO1xuYXNzZXJ0LmVxdWFsKHRpbGUod2Vhay5mbG9vciwgd2Vhay5mLmF0KSwgVGlsZS5GbG9vcik7XG5PYmplY3QuYXNzaWduKHdlYWsuaGVybywgd2Vhay5mbG9vci5wbGF5ZXJTdGFydCk7XG53ZWFrLnRpY2soMC4yMyk7XG5hc3NlcnQuZXF1YWwodGlsZSh3ZWFrLmZsb29yLCB3ZWFrLmYuYXQpLCBUaWxlLkhvbGUpO1xuYXNzZXJ0LmRlZXBFcXVhbCh3ZWFrLmhpdHMsIFtdKTtcblxuY29uc3Qgc2hlbGYgPSBzYW1wbGUoXCJzaGVsZlwiKTtcbk9iamVjdC5hc3NpZ24oc2hlbGYuaGVybywgY2VudGVyKHNoZWxmLmYuc3RhbmQpKTtcbmNvbnN0IHBvaW50ID0gY2VudGVyKHNoZWxmLmYuYXQpO1xuYXNzZXJ0LmVxdWFsKHNoZWxmLmVudi5zdHJpa2UoTWF0aC5hdGFuMihwb2ludC55IC0gc2hlbGYuaGVyby55LCBwb2ludC54IC0gc2hlbGYuaGVyby54KSwgMjIpLCB0cnVlKTtcbk9iamVjdC5hc3NpZ24oc2hlbGYuem9tYmllLCBjZW50ZXIoc2hlbGYuZi5sYW5kaW5nKSk7XG5zaGVsZi50aWNrKFNIRUxGX1dBUk5JTkcgKyAwLjEpO1xuYXNzZXJ0Lm9rKCFzaGVsZi5lbnYuYmxvY2tzVGlsZShzaGVsZi5mLmF0LngsIHNoZWxmLmYuYXQueSkgJiYgc2hlbGYuZW52LmJsb2Nrc1RpbGUoc2hlbGYuZi5sYW5kaW5nLngsIHNoZWxmLmYubGFuZGluZy55KSk7XG5hc3NlcnQuZGVlcEVxdWFsKHNoZWxmLmhpdHMubWFwKChoKSA9PiBoLmlkKSwgWzJdKTtcbmFzc2VydC5lcXVhbChzaGVsZi5mbG9vci5wcm9wcy5maWx0ZXIoKHApID0+IHAuaWQgPT09IHNoZWxmLmYuc3Rhc2guaWQpLmxlbmd0aCwgMSk7XG5uZXcgRW52aXJvbm1lbnQoc2hlbGYuZmxvb3IsIHNoZWxmLmVudi5zdGF0ZSwgc2hlbGYud29ybGQpO1xuYXNzZXJ0LmVxdWFsKHNoZWxmLmZsb29yLnByb3BzLmZpbHRlcigocCkgPT4gcC5pZCA9PT0gc2hlbGYuZi5zdGFzaC5pZCkubGVuZ3RoLCAxLCBcIlNoZWxmIG1heSBvbmx5IHJldmVhbCBvbmUgc3Rhc2hcIik7XG5cbmNvbnN0IGdsYXNzID0gc2FtcGxlKFwic3VyZmFjZVwiLCBcInN1cmZhY2U6Z2xhc3NcIik7XG5PYmplY3QuYXNzaWduKGdsYXNzLmhlcm8sIGNlbnRlcihnbGFzcy5mLmF0KSk7XG5nbGFzcy5lbnYuZm9vdHN0ZXAoZ2xhc3MuaGVybywgZmFsc2UpO1xuZ2xhc3MudGljaygwLjUpO1xuZ2xhc3MuZW52LmZvb3RzdGVwKGdsYXNzLmhlcm8sIHRydWUpO1xuYXNzZXJ0LmVxdWFsKGdsYXNzLmhpdHMubGVuZ3RoLCAxKTtcbmFzc2VydC5vayhnbGFzcy5hbGVydHNbMV0ucmFkaXVzID4gZ2xhc3MuYWxlcnRzWzBdLnJhZGl1cyk7XG5cbmNvbnN0IGdhcyA9IHNhbXBsZShcImdhc1wiKTtcbk9iamVjdC5hc3NpZ24oZ2FzLmhlcm8sIGNlbnRlcihnYXMuZi5jZWxsc1swXSkpO1xuZ2FzLmVudi5pZ25pdGUoZ2FzLmhlcm8pO1xuZ2FzLnRpY2soR0FTX1dBUk5JTkcgLSAwLjIpO1xuYXNzZXJ0LmVxdWFsKGdhcy5oaXRzLmxlbmd0aCwgMCwgXCJHYXMgaGFzIGEgZ3JhY2UgaW50ZXJ2YWxcIik7XG5PYmplY3QuYXNzaWduKGdhcy5oZXJvLCBjZW50ZXIoZ2FzLmYuY29udHJvbCkpO1xuYXNzZXJ0Lm9rKGdhcy5lbnYudXNlKCkpO1xuYXNzZXJ0LmVxdWFsKGdhcy5lbnYucmVhZChnYXMuZikuc3RhZ2UsIFwidmVudGluZ1wiKTtcbmdhcy50aWNrKEdBU19DTEVBUiArIDAuMSk7XG5hc3NlcnQuZXF1YWwoZ2FzLmVudi5yZWFkKGdhcy5mKS5zdGFnZSwgXCJzZXR0bGVkXCIpO1xuYXNzZXJ0LmVxdWFsKGdhcy5oaXRzLmxlbmd0aCwgMCwgXCJDbG9zaW5nIHRoZSB2YWx2ZSBjYW5jZWxzIHRoZSB3YXJuaW5nIGFuZCBkYW1hZ2VcIik7XG5jb25zdCBsaXQgPSBzYW1wbGUoXCJnYXNcIik7XG5PYmplY3QuYXNzaWduKGxpdC56b21iaWUsIGNlbnRlcihsaXQuZi5jZWxsc1sxXSkpO1xubGl0LmVudi5pZ25pdGUoY2VudGVyKGxpdC5mLmF0KSk7XG5saXQudGljayhHQVNfV0FSTklORyArIDAuMik7XG5hc3NlcnQuZGVlcEVxdWFsKGxpdC5oaXRzLm1hcCgoaCkgPT4gaC5pZCksIFsyXSk7XG5hc3NlcnQub2sobGl0LnNvdW5kcy5pbmNsdWRlcyhcImZsYXJlXCIpKTtcbmFzc2VydC5lcXVhbChwYXJzZUNoZWNrcG9pbnQoXCJ7dGhpcyBpcyBub3QgYSBzYXZlfVwiKSwgbnVsbCk7XG5jb25zb2xlLmxvZyhgT0s6ICR7dGVzdGVkfSBmbG9vcnMgd2l0aCBzYWZlIHJvdXRlcywgc2VlZGVkIGFubmV4ZXMgYW5kICR7c2hvcnRjdXRzfSBzdGVhbSBzaG9ydGN1dHM7IGFsbCBlbnZpcm9ubWVudCBzdGF0ZXMsIGRhbWFnZSwgY29udHJvbHMgYW5kIGludGVyYWN0aW9ucy5gKTsiLCAiZXhwb3J0IGNvbnN0IFdFQVBPTl9JRFMgPSBbXCJjcm93YmFyXCIsIFwicGlzdG9sXCIsIFwiaGF0Y2hldFwiLCBcInJldm9sdmVyXCIsIFwic2hvdGd1blwiLCBcImNyb3NzYm93XCIsIFwibWFjaGV0ZVwiXSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIFdlYXBvbklkID0gdHlwZW9mIFdFQVBPTl9JRFNbbnVtYmVyXTtcbmV4cG9ydCB0eXBlIEFtbW9LaW5kID0gXCJyb3VuZHNcIiB8IFwic2hlbGxzXCIgfCBcImJvbHRzXCI7XG5leHBvcnQgdHlwZSBTbG90cyA9IFtXZWFwb25JZCB8IG51bGwsIFdlYXBvbklkIHwgbnVsbCwgV2VhcG9uSWQgfCBudWxsXTtcblxuZXhwb3J0IGludGVyZmFjZSBXZWFwb25TcGVjIHtcbiAgbmFtZTogc3RyaW5nO1xuICBjYXRlZ29yeTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBsb2NhdGlvbjogc3RyaW5nO1xuICBhbW1vOiBBbW1vS2luZCB8IG51bGw7XG4gIGNhcGFjaXR5OiBudW1iZXI7XG4gIGRhbWFnZTogbnVtYmVyO1xuICBjb29sZG93bjogbnVtYmVyO1xuICByZWFjaDogbnVtYmVyO1xuICByZWxvYWQ6IG51bWJlcjtcbiAgcGVsbGV0czogbnVtYmVyO1xuICBub2lzZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgV0VBUE9OUzogUmVjb3JkPFdlYXBvbklkLCBXZWFwb25TcGVjPiA9IHtcbiAgY3Jvd2JhcjogeyBuYW1lOiBcIlx1MDE0MW9tXCIsIGNhdGVnb3J5OiBcIkJyb1x1MDE0NCBiaWFcdTAxNDJhXCIsIGRlc2NyaXB0aW9uOiBcIlN0YXJ5LCBuaWV6YXdvZG55IFx1MDE0Mm9tLiBDaWNoeSB3IHdhbGNlLCBwcnp5ZGF0bnkgcHJ6eSB6YWJhcnlrYWRvd2FueWNoIGRyendpYWNoLlwiLCBsb2NhdGlvbjogXCJXeXBvc2FcdTAxN0NlbmllIHN0YXJ0b3dlXCIsIGFtbW86IG51bGwsIGNhcGFjaXR5OiAwLCBkYW1hZ2U6IDM0LCBjb29sZG93bjogMC40NiwgcmVhY2g6IDIyLCByZWxvYWQ6IDAsIHBlbGxldHM6IDEsIG5vaXNlOiAzIH0sXG4gIHBpc3RvbDogeyBuYW1lOiBcIlBpc3RvbGV0XCIsIGNhdGVnb3J5OiBcIkJyb1x1MDE0NCBrclx1MDBGM3RrYVwiLCBkZXNjcmlwdGlvbjogXCJQb3JcdTAxMTljem5hIGJyb1x1MDE0NCBuYSBjaWFzbmUga29yeXRhcnplLiBPc2llbSBzdHJ6YVx1MDE0Mlx1MDBGM3csIHphbmltIHRyemViYSBiXHUwMTE5ZHppZSBwcnplXHUwMTQyYWRvd2FcdTAxMDcuXCIsIGxvY2F0aW9uOiBcIld5cG9zYVx1MDE3Q2VuaWUgc3RhcnRvd2VcIiwgYW1tbzogXCJyb3VuZHNcIiwgY2FwYWNpdHk6IDgsIGRhbWFnZTogMjYsIGNvb2xkb3duOiAwLjI4LCByZWFjaDogMTQ0LCByZWxvYWQ6IDAuNzgsIHBlbGxldHM6IDEsIG5vaXNlOiAxNCB9LFxuICBoYXRjaGV0OiB7IG5hbWU6IFwiVG9wb3Jla1wiLCBjYXRlZ29yeTogXCJCcm9cdTAxNDQgYmlhXHUwMTQyYVwiLCBkZXNjcmlwdGlvbjogXCJDaVx1MDExOVx1MDE3Q3N6eSBvZCBcdTAxNDJvbXUuIFdvbG5pZWpzenkgemFtYWNoIHd5bmFncmFkemEgbW9jbmllanN6eW0gdWRlcnplbmllbSwgYmV6IHp1XHUwMTdDeXdhbmlhIGFtdW5pY2ppLlwiLCBsb2NhdGlvbjogXCJQaXduaWNhIC8gc3phZmthIHdhcnN6dGF0b3dhXCIsIGFtbW86IG51bGwsIGNhcGFjaXR5OiAwLCBkYW1hZ2U6IDUyLCBjb29sZG93bjogMC43LCByZWFjaDogMjQsIHJlbG9hZDogMCwgcGVsbGV0czogMSwgbm9pc2U6IDMuNSB9LFxuICByZXZvbHZlcjogeyBuYW1lOiBcIlJld29sd2VyXCIsIGNhdGVnb3J5OiBcIkJyb1x1MDE0NCBrclx1MDBGM3RrYVwiLCBkZXNjcmlwdGlvbjogXCJTemVcdTAxNUJcdTAxMDcgbW9jbnljaCBzdHJ6YVx1MDE0Mlx1MDBGM3cuIEtvcnp5c3RhIHogdGVnbyBzYW1lZ28gemFwYXN1IG5hYm9qXHUwMEYzdyBjbyBwaXN0b2xldC5cIiwgbG9jYXRpb246IFwiUGFydGVyIC8gYml1cmtvIGRvem9yY3lcIiwgYW1tbzogXCJyb3VuZHNcIiwgY2FwYWNpdHk6IDYsIGRhbWFnZTogNDksIGNvb2xkb3duOiAwLjQ5LCByZWFjaDogMTcwLCByZWxvYWQ6IDEuMywgcGVsbGV0czogMSwgbm9pc2U6IDE2IH0sXG4gIHNob3RndW46IHsgbmFtZTogXCJTdHJ6ZWxiYVwiLCBjYXRlZ29yeTogXCJCcm9cdTAxNDQgZFx1MDE0MnVnYVwiLCBkZXNjcmlwdGlvbjogXCJEd2EgXHUwMTQyYWR1bmtpIFx1MDE1QnJ1dHUgbmEgYmxpc2tpZSBzcG90a2FuaWEuIEh1ayBuaWVzaWUgc2lcdTAxMTkgcG8gY2FcdTAxNDJ5bSBwaVx1MDExOXRyemUuXCIsIGxvY2F0aW9uOiBcIlBpXHUwMTE5dHJvIElJSSAvIHN6YWZhIG15XHUwMTVCbGl3ZWdvXCIsIGFtbW86IFwic2hlbGxzXCIsIGNhcGFjaXR5OiAyLCBkYW1hZ2U6IDE0LCBjb29sZG93bjogMC42NCwgcmVhY2g6IDc2LCByZWxvYWQ6IDEuMTUsIHBlbGxldHM6IDYsIG5vaXNlOiAxOSB9LFxuICBjcm9zc2JvdzogeyBuYW1lOiBcIkt1c3phXCIsIGNhdGVnb3J5OiBcIkJyb1x1MDE0NCBtaW90YWpcdTAxMDVjYVwiLCBkZXNjcmlwdGlvbjogXCJKZWRlbiBjaWNoeSBiZVx1MDE0MnQgemFtaWFzdCBnXHUwMTQyb1x1MDE1Qm5lZ28gc3RyemFcdTAxNDJ1LiBQbyBrYVx1MDE3Q2R5bSB0cmFmaWVuaXUgcG90cnplYnVqZSBjaHdpbGkgbmEgcHJ6ZVx1MDE0MmFkb3dhbmllLlwiLCBsb2NhdGlvbjogXCJQaVx1MDExOXRybyBWIC8gc3phZmEgc3BvcnRvd2NhXCIsIGFtbW86IFwiYm9sdHNcIiwgY2FwYWNpdHk6IDEsIGRhbWFnZTogNzIsIGNvb2xkb3duOiAwLjcyLCByZWFjaDogMTY1LCByZWxvYWQ6IDEuNCwgcGVsbGV0czogMSwgbm9pc2U6IDIuNSB9LFxuICBtYWNoZXRlOiB7IG5hbWU6IFwiTWFjemV0YVwiLCBjYXRlZ29yeTogXCJCcm9cdTAxNDQgYmlhXHUwMTQyYVwiLCBkZXNjcmlwdGlvbjogXCJTenlia2EsIHN6ZXJva2EgbWFjemV0YS4gS3JcdTAwRjN0c3phIHByemVyd2EgbWlcdTAxMTlkenkgY2lcdTAxMTljaWFtaSBpIGR1XHUwMTdDYSBzemFuc2Egcm96cG9cdTAxNDJvd2llbmlhIHN0b2pcdTAxMDVjZWdvIHpvbWJpZS5cIiwgbG9jYXRpb246IFwiUGlcdTAxMTl0cm8gSSAvIHN6YWZhIHNwb3J0b3djYVwiLCBhbW1vOiBudWxsLCBjYXBhY2l0eTogMCwgZGFtYWdlOiA0MiwgY29vbGRvd246IDAuMzQsIHJlYWNoOiAyMywgcmVsb2FkOiAwLCBwZWxsZXRzOiAxLCBub2lzZTogMy44IH0sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIEludmVudG9yeVN0YXRlIHtcbiAgb3duZWQ6IFdlYXBvbklkW107XG4gIHNsb3RzOiBTbG90cztcbiAgYWN0aXZlOiBudW1iZXI7XG4gIG1hZ2F6aW5lczogUmVjb3JkPFdlYXBvbklkLCBudW1iZXI+O1xuICBzdG9jazogUmVjb3JkPEFtbW9LaW5kLCBudW1iZXI+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNXZWFwb24oaWQ6IHVua25vd24pOiBpZCBpcyBXZWFwb25JZCB7XG4gIHJldHVybiBXRUFQT05fSURTLmluY2x1ZGVzKGlkIGFzIFdlYXBvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0ZXJJbnZlbnRvcnkocHJlZmVycmVkPzogU2xvdHMpOiBJbnZlbnRvcnlTdGF0ZSB7XG4gIGNvbnN0IHNsb3RzOiBTbG90cyA9IFtcImNyb3diYXJcIiwgXCJwaXN0b2xcIiwgbnVsbF07XG4gIGlmIChwcmVmZXJyZWQ/Lmxlbmd0aCA9PT0gMyAmJiBwcmVmZXJyZWQuc29tZShCb29sZWFuKSAmJiBwcmVmZXJyZWQuZXZlcnkoKHYsIGkpID0+XG4gICAgdiA9PT0gbnVsbCB8fCAoKHYgPT09IFwiY3Jvd2JhclwiIHx8IHYgPT09IFwicGlzdG9sXCIpICYmIHByZWZlcnJlZC5pbmRleE9mKHYpID09PSBpKSkpIHtcbiAgICBzbG90cy5zcGxpY2UoMCwgMywgLi4ucHJlZmVycmVkKTtcbiAgfVxuICByZXR1cm4geyBvd25lZDogW1wiY3Jvd2JhclwiLCBcInBpc3RvbFwiXSwgc2xvdHMsIGFjdGl2ZTogc2xvdHMuZmluZEluZGV4KEJvb2xlYW4pLFxuICAgIG1hZ2F6aW5lczogeyBjcm93YmFyOiAwLCBwaXN0b2w6IDgsIGhhdGNoZXQ6IDAsIHJldm9sdmVyOiAwLCBzaG90Z3VuOiAwLCBjcm9zc2JvdzogMCwgbWFjaGV0ZTogMCB9LFxuICAgIHN0b2NrOiB7IHJvdW5kczogMTgsIHNoZWxsczogMCwgYm9sdHM6IDAgfSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29weUludmVudG9yeShpbnY6IEludmVudG9yeVN0YXRlKTogSW52ZW50b3J5U3RhdGUge1xuICByZXR1cm4geyAuLi5pbnYsIG93bmVkOiBbLi4uaW52Lm93bmVkXSwgc2xvdHM6IFsuLi5pbnYuc2xvdHNdLCBzdG9jazogeyAuLi5pbnYuc3RvY2sgfSwgbWFnYXppbmVzOiB7IC4uLmludi5tYWdhemluZXMgfSB9O1xufVxuXG4vLyBTbG90IGFzc2lnbm1lbnQgbmV2ZXIgcmVtb3ZlcyBhbiBpdGVtIGZyb20gdGhlIGJhY2twYWNrLiBNb3ZpbmcgYW4gZXF1aXBwZWQgaXRlbSBzd2FwcyBzbG90cy5cbmV4cG9ydCBmdW5jdGlvbiBhc3NpZ25TbG90KGludjogSW52ZW50b3J5U3RhdGUsIHNsb3Q6IG51bWJlciwgaWQ6IFdlYXBvbklkIHwgbnVsbCk6IEludmVudG9yeVN0YXRlIHtcbiAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHNsb3QpIHx8IHNsb3QgPCAwIHx8IHNsb3QgPiAyIHx8IChpZCAmJiAhaW52Lm93bmVkLmluY2x1ZGVzKGlkKSkpIHJldHVybiBpbnY7XG4gIGlmICghaWQgJiYgaW52LnNsb3RzLmZpbHRlcihCb29sZWFuKS5sZW5ndGggPCAyKSByZXR1cm4gaW52O1xuICBjb25zdCBuZXh0ID0gY29weUludmVudG9yeShpbnYpO1xuICBjb25zdCBoZWxkID0gaW52LnNsb3RzW2ludi5hY3RpdmVdO1xuICBjb25zdCBvbGQgPSBpZCA/IGludi5zbG90cy5pbmRleE9mKGlkKSA6IC0xO1xuICBpZiAob2xkID49IDApIG5leHQuc2xvdHNbb2xkXSA9IG5leHQuc2xvdHNbc2xvdF07XG4gIG5leHQuc2xvdHNbc2xvdF0gPSBpZDtcbiAgY29uc3QgZm91bmQgPSBuZXh0LnNsb3RzLmluZGV4T2YoaGVsZCk7XG4gIG5leHQuYWN0aXZlID0gaGVsZCAmJiBmb3VuZCA+PSAwID8gZm91bmQgOiBuZXh0LnNsb3RzW3Nsb3RdID8gc2xvdCA6IG5leHQuc2xvdHMuZmluZEluZGV4KEJvb2xlYW4pO1xuICByZXR1cm4gbmV4dDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRpc2NvdmVyKGludjogSW52ZW50b3J5U3RhdGUsIGlkOiBXZWFwb25JZCkge1xuICBpZiAoaW52Lm93bmVkLmluY2x1ZGVzKGlkKSkgcmV0dXJuIGZhbHNlO1xuICBpbnYub3duZWQucHVzaChpZCk7XG4gIGNvbnN0IHcgPSBXRUFQT05TW2lkXTtcbiAgaW52Lm1hZ2F6aW5lc1tpZF0gPSB3LmNhcGFjaXR5O1xuICBpZiAody5hbW1vKSBpbnYuc3RvY2tbdy5hbW1vXSArPSB3LmFtbW8gPT09IFwiYm9sdHNcIiA/IDYgOiB3LmNhcGFjaXR5ICogMjtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBjb25zdCBESVNDT1ZFUklFUzogUGFydGlhbDxSZWNvcmQ8bnVtYmVyLCBXZWFwb25JZD4+ID0geyAwOiBcImhhdGNoZXRcIiwgMTogXCJyZXZvbHZlclwiLCAyOiBcIm1hY2hldGVcIiwgNDogXCJzaG90Z3VuXCIsIDY6IFwiY3Jvc3Nib3dcIiB9OyIsICJleHBvcnQgY29uc3QgVElMRSA9IDE2O1xuZXhwb3J0IGNvbnN0IE1BUF9XID0gNTY7XG5leHBvcnQgY29uc3QgTUFQX0ggPSA4ODtcbmV4cG9ydCBjb25zdCBGTE9PUl9DT1VOVCA9IDExO1xuXG5leHBvcnQgY29uc3QgVGlsZSA9IHtcbiAgV2FsbDogMCxcbiAgRmxvb3I6IDEsXG4gIERvb3I6IDIsXG4gIERvb3JPcGVuOiAzLFxuICBTdGFpcnNVcDogNCxcbiAgU3RhaXJzRG93bjogNSxcbiAgV2luZG93OiA2LFxuICBSdWJibGU6IDcsXG4gIFB1ZGRsZTogOCxcbiAgU2t5OiA5LFxuICBIb2xlOiAxMCxcbn0gYXMgY29uc3Q7XG5cbmV4cG9ydCB0eXBlIFRpbGVJZCA9ICh0eXBlb2YgVGlsZSlba2V5b2YgdHlwZW9mIFRpbGVdO1xuXG5leHBvcnQgY29uc3QgQ09MID0ge1xuICBpbms6IFwiIzEwMGUwY1wiLFxuICB2b2lkOiBcIiMwNzA4MGNcIixcbiAgbmlnaHQ6IFwiIzFhMjg0OFwiLFxuICBuaWdodERlZXA6IFwiIzEyMTgyYVwiLFxuICBza3k6IFwiIzNhNTA3MFwiLFxuICBza3lIb3Jpem9uOiBcIiNlOGEwNjBcIixcbiAgY29uY3JldGU6IFwiIzhjODE3NFwiLFxuICBjb25jcmV0ZURhcms6IFwiIzVjNTY0ZVwiLFxuICBjb25jcmV0ZUxpZ2h0OiBcIiNjNGI0OWFcIixcbiAgc2VhbTogXCIjM2EzNDJlXCIsXG4gIHBsYXN0ZXI6IFwiI2NiYjg5YVwiLFxuICB3YWxscGFwZXI6IFwiI2Q0YzRhOFwiLFxuICB3YWxscGFwZXJJbms6IFwiI2E4OTA3OFwiLFxuICBwZWVsOiBcIiM2YTY1NjBcIixcbiAgd2FpbnNjb3Q6IFwiIzVhOGE4NFwiLFxuICB3YWluc2NvdERhcms6IFwiIzNlNjY2MlwiLFxuICB0ZWFsOiBcIiMzZThhODZcIixcbiAgcnVzdDogXCIjYzQ2MjJlXCIsXG4gIHJ1c3REYXJrOiBcIiM4YTNjMjJcIixcbiAgbW9sZDogXCIjNWE3YTQ4XCIsXG4gIG1vbGRMaWdodDogXCIjN2Q5YTVjXCIsXG4gIHdvb2Q6IFwiIzZiNGEzMlwiLFxuICB3b29kRGFyazogXCIjM2UyYTFjXCIsXG4gIHdvb2RMaWdodDogXCIjOGE2MjQwXCIsXG4gIGRvb3I6IFwiIzNhMmMyOFwiLFxuICBkb29yTGlnaHQ6IFwiIzVjNDAzOFwiLFxuICBmbHVvcjogXCIjZThlMDcwXCIsXG4gIGZsdW9yRGltOiBcIiM5YTk0NDBcIixcbiAgYmxvb2Q6IFwiIzhhMjgyOFwiLFxuICBibG9vZEJyaWdodDogXCIjYzQzODMwXCIsXG4gIGphY2tldDogXCIjZDRhODRhXCIsXG4gIGphY2tldERhcms6IFwiIzhmNzAyOFwiLFxuICBqYWNrZXREaXJ0OiBcIiM2YTU0MjhcIixcbiAgY2FwOiBcIiNiNDMzMzBcIixcbiAgY2FwTGlnaHQ6IFwiI2UwNTA0OFwiLFxuICBjYXBEYXJrOiBcIiM3YTIwMjBcIixcbiAgc2tpbjogXCIjZTRiODk4XCIsXG4gIHNraW5TaGFkZTogXCIjYzQ4YjZhXCIsXG4gIHBhbnRzOiBcIiM1YzQ2MzhcIixcbiAgcGFudHNEYXJrOiBcIiMzYTJjMjRcIixcbiAgc2hvZTogXCIjMmEyNDIwXCIsXG4gIHNoaXJ0OiBcIiMzYTNhM2VcIixcbiAgem9tYmllOiBcIiM3ZDhjNjhcIixcbiAgem9tYmllRGFyazogXCIjNTQ2MDQ4XCIsXG4gIHpvbWJpZUxpZ2h0OiBcIiM5YWFhNzhcIixcbiAgelNoaXJ0OiBcIiNlNGRjYzhcIixcbiAgelNoaXJ0RGFyazogXCIjYjBhODk4XCIsXG4gIGV5ZTogXCIjZTAzMDMwXCIsXG4gIHdoaXRlOiBcIiNmMmVmZTZcIixcbiAgbWV0YWw6IFwiIzZhNzA3OFwiLFxuICBtZXRhbERhcms6IFwiIzNhNDA0OFwiLFxuICBwdWRkbGU6IFwiIzNhNTg3OFwiLFxuICBwdWRkbGVMaWdodDogXCIjN2FhMGMwXCIsXG4gIGd1bjogXCIjMmEyYzMwXCIsXG4gIGJyYXNzOiBcIiNjOWEyNGFcIixcbn0gYXMgY29uc3Q7XG5cbmV4cG9ydCB0eXBlIFRoZW1lID0gXCJiYXNlbWVudFwiIHwgXCJsb2JieVwiIHwgXCJmbGF0XCIgfCBcImRlY2F5XCIgfCBcInJvb2ZcIjtcblxuZXhwb3J0IGludGVyZmFjZSBGbG9vck1ldGEge1xuICB0aGVtZTogVGhlbWU7XG4gIG5hbWU6IHN0cmluZztcbiAgc3ViOiBzdHJpbmc7XG4gIGRlY2F5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBGTE9PUl9NRVRBOiBGbG9vck1ldGFbXSA9IFtcbiAgeyB0aGVtZTogXCJiYXNlbWVudFwiLCBuYW1lOiBcIlBJV05JQ0FcIiwgc3ViOiBcInJ1cnksIHdpbGdvXHUwMTA3LCBjaWVtbm9cdTAxNUJcdTAxMDdcIiwgZGVjYXk6IDAgfSxcbiAgeyB0aGVtZTogXCJsb2JieVwiLCBuYW1lOiBcIlBBUlRFUlwiLCBzdWI6IFwiaG9sIGkgc2tyenlua2kgbmEgbGlzdHlcIiwgZGVjYXk6IDAgfSxcbiAgeyB0aGVtZTogXCJmbGF0XCIsIG5hbWU6IFwiUElcdTAxMThUUk8gSVwiLCBzdWI6IFwiXHUwMTVCd2llXHUwMTdDbyBvcHVzemN6b25lIG1pZXN6a2FuaWFcIiwgZGVjYXk6IDAuMDYgfSxcbiAgeyB0aGVtZTogXCJmbGF0XCIsIG5hbWU6IFwiUElcdTAxMThUUk8gSUlcIiwgc3ViOiBcInNwbFx1MDEwNWRyb3dhbmUgcG9rb2plXCIsIGRlY2F5OiAwLjIgfSxcbiAgeyB0aGVtZTogXCJmbGF0XCIsIG5hbWU6IFwiUElcdTAxMThUUk8gSUlJXCIsIHN1YjogXCJrdG9cdTAxNUIgdHUgamVzemN6ZSBieVx1MDE0MlwiLCBkZWNheTogMC4zNCB9LFxuICB7IHRoZW1lOiBcImZsYXRcIiwgbmFtZTogXCJQSVx1MDExOFRSTyBJVlwiLCBzdWI6IFwicm96Yml0ZSBzenlieSwgcGFwaWVyIG5hIHBvZFx1MDE0Mm9nYWNoXCIsIGRlY2F5OiAwLjQ4IH0sXG4gIHsgdGhlbWU6IFwiZGVjYXlcIiwgbmFtZTogXCJQSVx1MDExOFRSTyBWXCIsIHN1YjogXCJ6YWxhbmUgcGlcdTAxMTl0cm9cIiwgZGVjYXk6IDAuNiB9LFxuICB7IHRoZW1lOiBcImRlY2F5XCIsIG5hbWU6IFwiUElcdTAxMThUUk8gVklcIiwgc3ViOiBcInNwYWxvbmUgbWllc3prYW5pYVwiLCBkZWNheTogMC43MiB9LFxuICB7IHRoZW1lOiBcImRlY2F5XCIsIG5hbWU6IFwiUElcdTAxMThUUk8gVklJXCIsIHN1YjogXCJncnp5YiBwb1x1MDE3Q2VyYSBcdTAxNUJjaWFueVwiLCBkZWNheTogMC44NiB9LFxuICB7IHRoZW1lOiBcImRlY2F5XCIsIG5hbWU6IFwiUElcdTAxMThUUk8gVklJSVwiLCBzdWI6IFwicnVpbmEgdHVcdTAxN0MgcHJ6ZWQgZGFjaGVtXCIsIGRlY2F5OiAxIH0sXG4gIHsgdGhlbWU6IFwicm9vZlwiLCBuYW1lOiBcIkRBQ0hcIiwgc3ViOiBcIldpZWxraSBjemVrYSBwcnp5IGZsYXJ6ZVwiLCBkZWNheTogMCB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IE5PVEVTID0gW1xuICBcIk5pZSBvdHdpZXJhaiB3aW5keS4gQ29cdTAxNUIgdGFtIG9kZHljaGEuXCIsXG4gIFwiS2x1Y3ogZG8gc2Nob2RcdTAwRjN3OiBzemFma2EgdyBnXHUwMTQyXHUwMEYzd255bSBrb3J5dGFyenUuIE5pZSB6YXBvbW5paiBnbyB6YWJyYVx1MDEwNy5cIixcbiAgXCJcdTAxNUF3aWF0XHUwMTQybyBpY2ggXHUwMTVCY2lcdTAxMDVnYS4gR2FcdTAxNUIgbGF0YXJrXHUwMTE5IHByenkgZHJ6d2lhY2guXCIsXG4gIFwiU1x1MDE0MnlzemFcdTAxNDJhbSBiaWVnIHBpXHUwMTE5dHJvIHd5XHUwMTdDZWouIFRvIG5pZSBieVx1MDE0MnkgZHppZWNpLlwiLFxuICBcIkZsYXJhIGVraXB5IGxlXHUwMTdDeSBuYSBkYWNodSwgcHJ6eSBjemVyd29ueWNoIHNrcnp5bmthY2guXCIsXG4gIFwiSmVcdTAxNUJsaSBjenl0YXN6OiBuaWUga3J6eWN6LiBTXHUwMTQyeXN6XHUwMTA1IHByemV6IGJldG9uLlwiLFxuICBcIk5vd2FrIHogY3p0ZXJuYXN0a2kgemFyeWdsb3dhXHUwMTQyIFx1MDE0MmF6aWVua1x1MDExOS4gSnVcdTAxN0MgbmllIHB1a2EuXCIsXG4gIFwiQW11bmljamkgamVzdCBtYVx1MDE0Mm8uIExpY3ogc3RyemFcdTAxNDJ5LlwiLFxuICBcIlx1MDE0MW9tIGplc3QgY2ljaHkuIFN0cnphXHUwMTQyIGJ1ZHppIGNhXHUwMTQyZSBwaVx1MDExOXRyby5cIixcbiAgXCJOYSBkYWNodSB3aWRhXHUwMTA3IFx1MDE1QndpdC4gSmVcdTAxNUJsaSBkb3RyemVzeiBcdTIwMTQgb2RwYWwgZmxhclx1MDExOS5cIixcbl07XG4iLCAiaW1wb3J0IHR5cGUgeyBFbnZpcm9ubWVudFN0YXRlLCBGZWF0dXJlU3RhdGUgfSBmcm9tIFwiLi9lbnZpcm9ubWVudFwiO1xuaW1wb3J0IHsgaXNXZWFwb24sIHR5cGUgSW52ZW50b3J5U3RhdGUgfSBmcm9tIFwiLi9pbnZlbnRvcnlcIjtcbmltcG9ydCB7IEZMT09SX0NPVU5ULCBNQVBfSCwgTUFQX1csIFRJTEUgfSBmcm9tIFwiLi9wYWxldHRlXCI7XG5pbXBvcnQgdHlwZSB7IERvb3JJbmZvLCBab21iaWVLaW5kIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB0eXBlIHsgQnVpbGRpbmdTdGF0ZSwgRmxvb3JRdWVzdFN0YXRlIH0gZnJvbSBcIi4vdmVydGljYWwtbGF5b3V0XCI7XG5pbXBvcnQgdHlwZSB7IFRhY3RpY2FsU3RhdGUgfSBmcm9tIFwiLi90YWN0aWNhbFwiO1xuXG5leHBvcnQgY29uc3QgQ0hFQ0tQT0lOVF9LRVkgPSBcImJsb2s3LWNoZWNrcG9pbnRcIjtcbmV4cG9ydCBjb25zdCBDSEVDS1BPSU5UX1ZFUlNJT04gPSAzO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNhdmVkWm9tYmllIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIGhwOiBudW1iZXI7XG4gIGhvbWU6IG51bWJlcjtcbiAga2luZDogWm9tYmllS2luZDtcbiAgc3RhdGU6IFwiaWRsZVwiIHwgXCJjaGFzZVwiIHwgXCJkZWFkXCI7XG4gIGFsZXJ0VDogbnVtYmVyO1xuICBsYXN0WDogbnVtYmVyO1xuICBsYXN0WTogbnVtYmVyO1xuICBzY3JlYW1lcjogYm9vbGVhbjtcbiAgcmVpbmZvcmNlbWVudDogYm9vbGVhbjtcbiAgbWlzc2lvblRhZz86IFwibHVyZVwiO1xuICBkb3duVD86IG51bWJlcjtcbiAgYmlzZWN0ZWQ/OiBib29sZWFuO1xuICBzZWVuV2FyZHJvYmU/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNhdmVkRmxvb3Ige1xuICBsYXlvdXQ6IG51bWJlcjtcbiAgaGFzS2V5OiBib29sZWFuO1xuICBlbnZpcm9ubWVudDogRW52aXJvbm1lbnRTdGF0ZTtcbiAgZXhwbG9yZWQ6IHN0cmluZztcbiAgb3BlbmVkOiBudW1iZXJbXTtcbiAgc3Vydml2b3JzR29uZTogbnVtYmVyW107XG4gIGRvb3JzOiBEb29ySW5mb1tdO1xuICB6b21iaWVzOiBTYXZlZFpvbWJpZVtdO1xuICB0YWN0aWNhbD86IFRhY3RpY2FsU3RhdGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVuQ2hlY2twb2ludCB7XG4gIHZlcnNpb246IHR5cGVvZiBDSEVDS1BPSU5UX1ZFUlNJT047XG4gIHNlZWQ6IG51bWJlcjtcbiAgZmxvb3I6IG51bWJlcjtcbiAgdGltZTogbnVtYmVyO1xuICBraWxsczogbnVtYmVyO1xuICBoZXJvOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBocDogbnVtYmVyOyBzdGFtaW5hOiBudW1iZXI7IGJhdHRlcnk6IG51bWJlcjsgZmxhc2g6IGJvb2xlYW4gfTtcbiAgcGFjazogSW52ZW50b3J5U3RhdGU7XG4gIGJvc3NLaWxsZWQ6IGJvb2xlYW47XG4gIGJ1aWxkaW5nOiBCdWlsZGluZ1N0YXRlO1xuICBmbG9vcnM6IChTYXZlZEZsb29yIHwgbnVsbClbXTtcbn1cblxuY29uc3QgcmVjb3JkID0gKHY6IHVua25vd24pOiB2IGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0+IHR5cGVvZiB2ID09PSBcIm9iamVjdFwiICYmIHYgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodik7XG5jb25zdCBudW1iZXIgPSAodjogdW5rbm93biwgbWluID0gMCwgbWF4ID0gSW5maW5pdHkpOiB2IGlzIG51bWJlciA9PiB0eXBlb2YgdiA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodikgJiYgdiA+PSBtaW4gJiYgdiA8PSBtYXg7XG5jb25zdCBpbnRlZ2VyID0gKHY6IHVua25vd24sIG1pbiA9IDAsIG1heCA9IEluZmluaXR5KTogdiBpcyBudW1iZXIgPT4gbnVtYmVyKHYsIG1pbiwgbWF4KSAmJiBOdW1iZXIuaXNJbnRlZ2VyKHYpO1xuY29uc3QgYm9vbCA9ICh2OiB1bmtub3duKTogdiBpcyBib29sZWFuID0+IHR5cGVvZiB2ID09PSBcImJvb2xlYW5cIjtcbmNvbnN0IHN0YWdlOiBGZWF0dXJlU3RhdGVbXCJzdGFnZVwiXVtdID0gW1wiaWRsZVwiLCBcIndhcm5pbmdcIiwgXCJzZXR0bGVkXCIsIFwidmVudGluZ1wiXTtcblxuZnVuY3Rpb24gZW52aXJvbm1lbnQodjogdW5rbm93bik6IHYgaXMgRW52aXJvbm1lbnRTdGF0ZSB7XG4gIHJldHVybiByZWNvcmQodikgJiYgbnVtYmVyKHYuY2xvY2spICYmIHJlY29yZCh2LmZlYXR1cmVzKSAmJiBPYmplY3QudmFsdWVzKHYuZmVhdHVyZXMpLmV2ZXJ5KChmKSA9PlxuICAgIHJlY29yZChmKSAmJiBzdGFnZS5zb21lKChzKSA9PiBzID09PSBmLnN0YWdlKSAmJiBudW1iZXIoZi5zaW5jZSkgJiYgbnVtYmVyKGYucHJvZ3Jlc3MsIDAsIDEpICYmIGJvb2woZi5vZmYpKTtcbn1cblxuZnVuY3Rpb24gaW52ZW50b3J5KHY6IHVua25vd24pOiB2IGlzIEludmVudG9yeVN0YXRlIHtcbiAgaWYgKCFyZWNvcmQodikgfHwgIUFycmF5LmlzQXJyYXkodi5vd25lZCkgfHwgIUFycmF5LmlzQXJyYXkodi5zbG90cykgfHwgdi5zbG90cy5sZW5ndGggIT09IDMgfHwgIWludGVnZXIodi5hY3RpdmUsIDAsIDIpKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IHNsb3RzOiB1bmtub3duW10gPSB2LnNsb3RzLCBvd25lZDogdW5rbm93bltdID0gdi5vd25lZDtcbiAgcmV0dXJuICEhc2xvdHNbdi5hY3RpdmVdICYmIG93bmVkLmV2ZXJ5KGlzV2VhcG9uKSAmJiBzbG90cy5ldmVyeSgoaWQpID0+IGlkID09PSBudWxsIHx8IChpc1dlYXBvbihpZCkgJiYgb3duZWQuaW5jbHVkZXMoaWQpKSlcbiAgICAmJiBuZXcgU2V0KHNsb3RzLmZpbHRlcihCb29sZWFuKSkuc2l6ZSA9PT0gc2xvdHMuZmlsdGVyKEJvb2xlYW4pLmxlbmd0aFxuICAgICYmIHJlY29yZCh2Lm1hZ2F6aW5lcykgJiYgb3duZWQuZXZlcnkoKGlkKSA9PiBpc1dlYXBvbihpZCkgJiYgcmVjb3JkKHYubWFnYXppbmVzKSAmJiBpbnRlZ2VyKHYubWFnYXppbmVzW2lkXSkpXG4gICAgJiYgcmVjb3JkKHYuc3RvY2spICYmIGludGVnZXIodi5zdG9jay5yb3VuZHMpICYmIGludGVnZXIodi5zdG9jay5zaGVsbHMpICYmIGludGVnZXIodi5zdG9jay5ib2x0cyk7XG59XG5cbmZ1bmN0aW9uIHBvc2l0aW9uKHY6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSB7XG4gIHJldHVybiBudW1iZXIodi54LCAwLCBNQVBfVyAqIFRJTEUpICYmIG51bWJlcih2LnksIDAsIE1BUF9IICogVElMRSk7XG59XG5cbmZ1bmN0aW9uIHNhdmVkRmxvb3IodjogdW5rbm93bik6IHYgaXMgU2F2ZWRGbG9vciB7XG4gIGlmICghcmVjb3JkKHYpIHx8ICFpbnRlZ2VyKHYubGF5b3V0LCAwLCAweGZmZmZmZmZmKSB8fCAhYm9vbCh2Lmhhc0tleSkgfHwgIWVudmlyb25tZW50KHYuZW52aXJvbm1lbnQpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiB0eXBlb2Ygdi5leHBsb3JlZCA9PT0gXCJzdHJpbmdcIiAmJiB2LmV4cGxvcmVkLmxlbmd0aCA9PT0gTUFQX1cgKiBNQVBfSCAmJiAvXlswMV0rJC8udGVzdCh2LmV4cGxvcmVkKVxuICAgICYmIEFycmF5LmlzQXJyYXkodi5vcGVuZWQpICYmIHYub3BlbmVkLmV2ZXJ5KChpZCkgPT4gaW50ZWdlcihpZCkpXG4gICAgJiYgQXJyYXkuaXNBcnJheSh2LnN1cnZpdm9yc0dvbmUpICYmIHYuc3Vydml2b3JzR29uZS5ldmVyeSgoaWQpID0+IGludGVnZXIoaWQpKVxuICAgICYmIEFycmF5LmlzQXJyYXkodi5kb29ycykgJiYgdi5kb29ycy5ldmVyeSgoZCkgPT4gcmVjb3JkKGQpICYmIGludGVnZXIoZC54LCAwLCBNQVBfVyAtIDEpICYmIGludGVnZXIoZC55LCAwLCBNQVBfSCAtIDEpXG4gICAgICAmJiBib29sKGQub3BlbikgJiYgYm9vbChkLmJyb2tlbikgJiYgYm9vbChkLmxvY2tlZCkgJiYgbnVtYmVyKGQuaHAsIC0yMCwgMjApKVxuICAgICYmICh2LnRhY3RpY2FsID09PSB1bmRlZmluZWQgfHwgdGFjdGljYWwodi50YWN0aWNhbCkpXG4gICAgJiYgQXJyYXkuaXNBcnJheSh2LnpvbWJpZXMpICYmIHYuem9tYmllcy5ldmVyeSgoeikgPT4gcmVjb3JkKHopICYmIHBvc2l0aW9uKHopICYmIG51bWJlcih6LmhwKSAmJiBpbnRlZ2VyKHouaG9tZSwgLTEpXG4gICAgICAmJiBbXCJpZGxlXCIsIFwiY2hhc2VcIiwgXCJkZWFkXCJdLmluY2x1ZGVzKFN0cmluZyh6LnN0YXRlKSkgJiYgW1wic2hhbWJsZXJcIiwgXCJydW5uZXJcIiwgXCJicnV0ZVwiLCBcImJvc3NcIiwgXCJjcmF3bGVyXCJdLmluY2x1ZGVzKFN0cmluZyh6LmtpbmQpKVxuICAgICAgJiYgYm9vbCh6LnNjcmVhbWVyKSAmJiBib29sKHoucmVpbmZvcmNlbWVudCkgJiYgbnVtYmVyKHouYWxlcnRULCAtMTAwKSAmJiBudW1iZXIoei5sYXN0WCkgJiYgbnVtYmVyKHoubGFzdFkpKTtcbn1cblxuZnVuY3Rpb24gdGFjdGljYWwodjogdW5rbm93bik6IHYgaXMgVGFjdGljYWxTdGF0ZSB7XG4gIHJldHVybiByZWNvcmQodikgJiYgbnVtYmVyKHYuY2xvY2spICYmIG51bWJlcih2LnBsYXllck5vaXNlLCAwLCAxMDApICYmIG51bWJlcih2LmFyb3VzYWwsIDAsIDEwMClcbiAgICAmJiBudW1iZXIodi53YXZlQnVkZ2V0LCAwLCA2KSAmJiBudW1iZXIodi5uZXh0Um9sbCkgJiYgbnVtYmVyKHYubGFzdFdhdmUsIC0xMDApICYmIGludGVnZXIodi53YXZlQ291bnQpXG4gICAgJiYgQXJyYXkuaXNBcnJheSh2LmV2ZW50cykgJiYgcmVjb3JkKHYuZGV2aWNlcykgJiYgcmVjb3JkKHYuYmFycmVscylcbiAgICAmJiBPYmplY3QudmFsdWVzKHYuZGV2aWNlcykuZXZlcnkoKGQpID0+IHJlY29yZChkKSAmJiBib29sKGQub24pICYmIG51bWJlcihkLngpICYmIG51bWJlcihkLnkpICYmIChkLmtpbmQgPT09IFwicmFkaW9cIiB8fCBkLmtpbmQgPT09IFwidHZcIikpXG4gICAgJiYgT2JqZWN0LnZhbHVlcyh2LmJhcnJlbHMpLmV2ZXJ5KChiKSA9PiByZWNvcmQoYikgJiYgW1wiaWRsZVwiLCBcIndhcm5pbmdcIiwgXCJzcGVudFwiXS5pbmNsdWRlcyhTdHJpbmcoYi5zdGFnZSkpICYmIG51bWJlcihiLmZ1c2UsIC0wLjAwMSkpO1xufVxuXG5mdW5jdGlvbiBmbG9vclF1ZXN0KHY6IHVua25vd24pOiB2IGlzIEZsb29yUXVlc3RTdGF0ZSB7XG4gIHJldHVybiByZWNvcmQodilcbiAgICAmJiBpbnRlZ2VyKHYuc3RhZ2UsIDAsIDEwKVxuICAgICYmIGJvb2wodi5pbnNwZWN0ZWQpXG4gICAgJiYgYm9vbCh2LmZ1c2VUYWtlbilcbiAgICAmJiBib29sKHYuY29kZUZvdW5kKVxuICAgICYmIGJvb2wodi5zZXJ2aWNlVW5sb2NrZWQpXG4gICAgJiYgYm9vbCh2LnNlcnZpY2VGb3JjZWQpXG4gICAgJiYgYm9vbCh2Lmx1cmVVc2VkKVxuICAgICYmIGJvb2wodi5sdXJlUmVzb2x2ZWQpXG4gICAgJiYgbnVtYmVyKHYuYnlwYXNzUHJvZ3Jlc3MsIDAsIDEpXG4gICAgJiYgYm9vbCh2LmJ5cGFzc09wZW4pXG4gICAgJiYgYm9vbCh2LmxhbmRpbmdCeXBhc3NPcGVuKVxuICAgICYmIGJvb2wodi5sYW5kaW5nU3Rhc2hPcGVuZWQpXG4gICAgJiYgYm9vbCh2LnJlc29sdmVkKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRpbmcodjogdW5rbm93bik6IHYgaXMgQnVpbGRpbmdTdGF0ZSB7XG4gIGlmICghcmVjb3JkKHYpXG4gICAgfHwgIWJvb2wodi5lbGV2YXRvclBvd2VyZWQpXG4gICAgfHwgIWJvb2wodi5lbGV2YXRvckVtZXJnZW5jeU9ubHkpXG4gICAgfHwgIWludGVnZXIodi5lbGV2YXRvckZsb29yLCAwLCBGTE9PUl9DT1VOVCAtIDEpXG4gICAgfHwgISh2LmVsZXZhdG9yT3BlbkZsb29yID09PSBudWxsIHx8IGludGVnZXIodi5lbGV2YXRvck9wZW5GbG9vciwgMCwgRkxPT1JfQ09VTlQgLSAxKSlcbiAgICB8fCAhYm9vbCh2LmVsZXZhdG9yQnJva2VuKVxuICAgIHx8ICFib29sKHYuZWxldmF0b3JGYXVsdFVzZWQpXG4gICAgfHwgIWludGVnZXIodi5lbGV2YXRvclNwZWNpYWxDb3VudCwgMCwgMTAwKVxuICAgIHx8ICFudW1iZXIodi5lbGV2YXRvckFycml2YWwsIDAsIDMwKVxuICAgIHx8ICFpbnRlZ2VyKHYuZWxldmF0b3JDYWxsRmxvb3IsIC0xLCBGTE9PUl9DT1VOVCAtIDEpXG4gICAgfHwgIWludGVnZXIodi5ucGNUb3RhbCwgMCwgMTAwMCkgfHwgIWludGVnZXIodi5ucGNEcm91Z2h0LCAwLCAxMDAwKSB8fCAhbnVtYmVyKHYubmV4dE5wY0F0KVxuICAgIHx8ICFyZWNvcmQodi5xdWVzdHMpXG4gICAgfHwgIU9iamVjdC52YWx1ZXModi5xdWVzdHMpLmV2ZXJ5KGZsb29yUXVlc3QpXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodi5qb3VybmFsKVxuICAgIHx8ICF2LmpvdXJuYWwuZXZlcnkoKGVudHJ5KSA9PiB0eXBlb2YgZW50cnkgPT09IFwic3RyaW5nXCIpKSByZXR1cm4gZmFsc2U7XG4gIGlmICh2LmVsZXZhdG9yUmlkZSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHJpZGUgPSB2LmVsZXZhdG9yUmlkZTtcbiAgICBpZiAoIXJlY29yZChyaWRlKVxuICAgICAgfHwgIWludGVnZXIocmlkZS5mcm9tLCAwLCBGTE9PUl9DT1VOVCAtIDEpXG4gICAgICB8fCAhaW50ZWdlcihyaWRlLnRvLCAwLCBGTE9PUl9DT1VOVCAtIDEpXG4gICAgICB8fCAhbnVtYmVyKHJpZGUuZWxhcHNlZCwgMCwgNjApXG4gICAgICB8fCAhW1wiZG9vcnNcIiwgXCJhY2NlbFwiLCBcIm1vdmluZ1wiLCBcImpvbHRcIiwgXCJzdHJhbmRlZFwiLCBcImVzY2FwZVwiLCBcImFycml2ZVwiLCBcInN0b3BcIiwgXCJsZWRnZVwiXS5pbmNsdWRlcyhTdHJpbmcocmlkZS5waGFzZSkpXG4gICAgICB8fCAhW1wicm91dGluZVwiLCBcInJhdHRsZVwiLCBcInN0b3BcIiwgXCJ0aHJlYXRcIiwgXCJtaWQtc2hhZnRcIiwgXCJmYXVsdFwiXS5pbmNsdWRlcyhTdHJpbmcocmlkZS52YXJpYW50KSlcbiAgICAgIHx8ICFudW1iZXIocmlkZS5jYWJpblgsIC00MCwgNDApXG4gICAgICB8fCAhbnVtYmVyKHJpZGUuY2FiaW5ZLCAtNDAsIDQwKVxuICAgICAgfHwgIW51bWJlcihyaWRlLmRvb3JPcGVuLCAwLCAxKVxuICAgICAgfHwgIW51bWJlcihyaWRlLmxldmVyUHJvZ3Jlc3MsIDAsIDEpKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHYucGFzc2FnZSAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHAgPSB2LnBhc3NhZ2U7XG4gICAgaWYgKCFyZWNvcmQocClcbiAgICAgIHx8ICFpbnRlZ2VyKHAuZnJvbSwgMCwgRkxPT1JfQ09VTlQgLSAxKVxuICAgICAgfHwgIWludGVnZXIocC50bywgMCwgRkxPT1JfQ09VTlQgLSAxKVxuICAgICAgfHwgIVtcInN0YWlyc0FcIiwgXCJzdGFpcnNCXCIsIFwic2VydmljZVwiLCBcImxlZGdlXCJdLmluY2x1ZGVzKFN0cmluZyhwLnJvdXRlKSlcbiAgICAgIHx8ICFudW1iZXIocC54LCAtMTAwLCAzMDApXG4gICAgICB8fCAhbnVtYmVyKHAueSwgLTEwMCwgMzAwKVxuICAgICAgfHwgIVtcImVtcHR5XCIsIFwid2luZG93XCIsIFwic3Rhc2hcIiwgXCJvYnN0YWNsZVwiLCBcInRyYWNlc1wiLCBcImJyb2tlbi1mbGlnaHRcIl0uaW5jbHVkZXMoU3RyaW5nKHAuZmVhdHVyZSkpXG4gICAgICB8fCAhYm9vbChwLnN0YXNoTG9vdGVkKVxuICAgICAgfHwgIW51bWJlcihwLmJ5cGFzc1Byb2dyZXNzLCAwLCAxKVxuICAgICAgfHwgIWJvb2wocC5ieXBhc3NPcGVuKVxuICAgICAgfHwgIWJvb2wocC5zb3VuZFBsYXllZCkpIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2hlY2twb2ludCh0ZXh0OiBzdHJpbmcgfCBudWxsKTogUnVuQ2hlY2twb2ludCB8IG51bGwge1xuICBpZiAoIXRleHQpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHY6IHVua25vd24gPSBKU09OLnBhcnNlKHRleHQpO1xuICAgIGlmICghcmVjb3JkKHYpIHx8IHYudmVyc2lvbiAhPT0gQ0hFQ0tQT0lOVF9WRVJTSU9OIHx8ICFpbnRlZ2VyKHYuc2VlZCwgMCwgMHhmZmZmZmZmZikgfHwgIWludGVnZXIodi5mbG9vciwgMCwgRkxPT1JfQ09VTlQgLSAxKSkgcmV0dXJuIG51bGw7XG4gICAgaWYgKCFudW1iZXIodi50aW1lKSB8fCAhaW50ZWdlcih2LmtpbGxzKSB8fCAhYm9vbCh2LmJvc3NLaWxsZWQpIHx8ICFpbnZlbnRvcnkodi5wYWNrKSB8fCAhYnVpbGRpbmcodi5idWlsZGluZykpIHJldHVybiBudWxsO1xuICAgIGlmICghcmVjb3JkKHYuaGVybykgfHwgIXBvc2l0aW9uKHYuaGVybykgfHwgIW51bWJlcih2Lmhlcm8uaHAsIDEsIDEwMCkgfHwgIW51bWJlcih2Lmhlcm8uc3RhbWluYSwgMCwgMTAwKVxuICAgICAgfHwgIW51bWJlcih2Lmhlcm8uYmF0dGVyeSwgMCwgMTAwKSB8fCAhYm9vbCh2Lmhlcm8uZmxhc2gpKSByZXR1cm4gbnVsbDtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkodi5mbG9vcnMpIHx8IHYuZmxvb3JzLmxlbmd0aCAhPT0gRkxPT1JfQ09VTlQgfHwgIXYuZmxvb3JzLmV2ZXJ5KChmKSA9PiBmID09PSBudWxsIHx8IHNhdmVkRmxvb3IoZikpIHx8ICF2LmZsb29yc1t2LmZsb29yXSkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHYgYXMgdW5rbm93biBhcyBSdW5DaGVja3BvaW50O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuIiwgImV4cG9ydCBmdW5jdGlvbiBhc3RhcihcbiAgdzogbnVtYmVyLFxuICBoOiBudW1iZXIsXG4gIHN4OiBudW1iZXIsXG4gIHN5OiBudW1iZXIsXG4gIGd4OiBudW1iZXIsXG4gIGd5OiBudW1iZXIsXG4gIHdhbGthYmxlOiAoeDogbnVtYmVyLCB5OiBudW1iZXIpID0+IGJvb2xlYW4sXG4pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXSB8IG51bGwge1xuICBpZiAoc3ggPT09IGd4ICYmIHN5ID09PSBneSkgcmV0dXJuIFtdO1xuICBpZiAoIXdhbGthYmxlKGd4LCBneSkpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSAoeDogbnVtYmVyLCB5OiBudW1iZXIpID0+IHkgKiB3ICsgeDtcbiAgY29uc3Qgb3BlbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgZzogbnVtYmVyOyBmOiBudW1iZXIgfVtdID0gW3sgeDogc3gsIHk6IHN5LCBnOiAwLCBmOiAwIH1dO1xuICBjb25zdCBnU2NvcmUgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuICBnU2NvcmUuc2V0KGtleShzeCwgc3kpLCAwKTtcbiAgY29uc3QgY2FtZSA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gIGNvbnN0IGNsb3NlZCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBsZXQgbm9kZXMgPSAwO1xuICB3aGlsZSAob3Blbi5sZW5ndGggJiYgbm9kZXMgPCAyMjAwKSB7XG4gICAgbm9kZXMrKztcbiAgICBsZXQgYmkgPSAwO1xuICAgIGZvciAobGV0IGkgPSAxOyBpIDwgb3Blbi5sZW5ndGg7IGkrKykgaWYgKG9wZW5baV0uZiA8IG9wZW5bYmldLmYpIGJpID0gaTtcbiAgICBjb25zdCBjdXIgPSBvcGVuLnNwbGljZShiaSwgMSlbMF07XG4gICAgY29uc3QgY2sgPSBrZXkoY3VyLngsIGN1ci55KTtcbiAgICBpZiAoY2xvc2VkLmhhcyhjaykpIGNvbnRpbnVlO1xuICAgIGlmIChjdXIueCA9PT0gZ3ggJiYgY3VyLnkgPT09IGd5KSB7XG4gICAgICBjb25zdCBwYXRoOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXSA9IFtdO1xuICAgICAgbGV0IGsgPSBjaztcbiAgICAgIGxldCB4ID0gY3VyLng7XG4gICAgICBsZXQgeSA9IGN1ci55O1xuICAgICAgd2hpbGUgKCEoeCA9PT0gc3ggJiYgeSA9PT0gc3kpKSB7XG4gICAgICAgIHBhdGgucHVzaCh7IHgsIHkgfSk7XG4gICAgICAgIGNvbnN0IHByZXYgPSBjYW1lLmdldChrKTtcbiAgICAgICAgaWYgKHByZXYgPT09IHVuZGVmaW5lZCkgYnJlYWs7XG4gICAgICAgIHggPSBwcmV2ICUgdztcbiAgICAgICAgeSA9IChwcmV2IC8gdykgfCAwO1xuICAgICAgICBrID0gcHJldjtcbiAgICAgIH1cbiAgICAgIHBhdGgucmV2ZXJzZSgpO1xuICAgICAgcmV0dXJuIHBhdGg7XG4gICAgfVxuICAgIGNsb3NlZC5hZGQoY2spO1xuICAgIGZvciAoY29uc3QgW2R4LCBkeV0gb2YgW1xuICAgICAgWzEsIDBdLFxuICAgICAgWy0xLCAwXSxcbiAgICAgIFswLCAxXSxcbiAgICAgIFswLCAtMV0sXG4gICAgXSBhcyBjb25zdCkge1xuICAgICAgY29uc3QgbnggPSBjdXIueCArIGR4O1xuICAgICAgY29uc3QgbnkgPSBjdXIueSArIGR5O1xuICAgICAgaWYgKG54IDwgMCB8fCBueSA8IDAgfHwgbnggPj0gdyB8fCBueSA+PSBoKSBjb250aW51ZTtcbiAgICAgIGlmICghd2Fsa2FibGUobngsIG55KSkgY29udGludWU7XG4gICAgICBjb25zdCBuayA9IGtleShueCwgbnkpO1xuICAgICAgaWYgKGNsb3NlZC5oYXMobmspKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IG5nID0gY3VyLmcgKyAxO1xuICAgICAgaWYgKG5nIDwgKGdTY29yZS5nZXQobmspID8/IDFlOSkpIHtcbiAgICAgICAgZ1Njb3JlLnNldChuaywgbmcpO1xuICAgICAgICBjYW1lLnNldChuaywgY2spO1xuICAgICAgICBvcGVuLnB1c2goeyB4OiBueCwgeTogbnksIGc6IG5nLCBmOiBuZyArIE1hdGguYWJzKG54IC0gZ3gpICsgTWF0aC5hYnMobnkgLSBneSkgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuIiwgImV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcikge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiBmdW5jdGlvbiByYW5kKCkge1xuICAgIGEgfD0gMDtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSB8IDA7XG4gICAgbGV0IHQgPSBNYXRoLmltdWwoYSBeIChhID4+PiAxNSksIDEgfCBhKTtcbiAgICB0ID0gKHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgNjEgfCB0KSkgXiB0O1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJuZyB7XG4gICgpOiBudW1iZXI7XG4gIGludDogKG46IG51bWJlcikgPT4gbnVtYmVyO1xuICBjaGFuY2U6IChwOiBudW1iZXIpID0+IGJvb2xlYW47XG4gIHBpY2s6IDxUPihhcnI6IHJlYWRvbmx5IFRbXSkgPT4gVDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VSbmcoc2VlZDogbnVtYmVyKTogUm5nIHtcbiAgY29uc3QgYmFzZSA9IG11bGJlcnJ5MzIoc2VlZCk7XG4gIGNvbnN0IHJuZyA9IGJhc2UgYXMgUm5nO1xuICBybmcuaW50ID0gKG46IG51bWJlcikgPT4gKG4gPD0gMSA/IDAgOiBNYXRoLmZsb29yKGJhc2UoKSAqIG4pKTtcbiAgcm5nLmNoYW5jZSA9IChwOiBudW1iZXIpID0+IGJhc2UoKSA8IHA7XG4gIHJuZy5waWNrID0gPFQ+KGFycjogcmVhZG9ubHkgVFtdKSA9PiBhcnJbTWF0aC5mbG9vcihiYXNlKCkgKiBhcnIubGVuZ3RoKV07XG4gIHJldHVybiBybmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2FsdCA9IDApIHtcbiAgbGV0IG4gPSAoeCAqIDM3NDc2MTM5MyArIHkgKiA2NjgyNjUyNjMgKyBzYWx0ICogMTQ0MjY5NTA0MSkgfCAwO1xuICBuID0gTWF0aC5pbXVsKG4gXiAobiA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgobiBeIChuID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG4iLCAiaW1wb3J0IHsgRElTQ09WRVJJRVMsIHR5cGUgV2VhcG9uSWQgfSBmcm9tIFwiLi9pbnZlbnRvcnlcIjtcbmltcG9ydCB7IFRJTEUsIFRpbGUgfSBmcm9tIFwiLi9wYWxldHRlXCI7XG5pbXBvcnQgeyBhc3RhciB9IGZyb20gXCIuL3BhdGhcIjtcbmltcG9ydCB7IG1ha2VSbmcgfSBmcm9tIFwiLi9ybmdcIjtcbmltcG9ydCB0eXBlIHsgRmxvb3JEYXRhLCBMb290LCBQcm9wLCBSb29tLCBab21iaWVTcGF3biB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCB0eXBlIENlbGwgPSB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG5leHBvcnQgdHlwZSBPYnN0YWNsZSA9IFwiY2FiaW5ldFwiIHwgXCJmcmlkZ2VcIiB8IFwiZHJlc3NlclwiIHwgXCJib29rY2FzZVwiIHwgXCJib2FyZHNcIiB8IFwidXB0dXJuZWRcIjtcbmV4cG9ydCB0eXBlIFN1cmZhY2UgPSBcImdsYXNzXCIgfCBcImNhbnNcIiB8IFwicGxhbmtzXCI7XG50eXBlIFNpdGU8SyBleHRlbmRzIHN0cmluZz4gPSB7IGlkOiBudW1iZXI7IGtpbmQ6IEs7IGF0OiBDZWxsIH07XG5cbmV4cG9ydCB0eXBlIFdpcmUgPSBTaXRlPFwid2lyZVwiPiAmIHtcbiAgbW9kZTogXCJzdGVhZHlcIiB8IFwicHVsc2VcIiB8IFwicG9vbFwiO1xuICBtb3VudDogXCJ3YWxsXCIgfCBcImNlaWxpbmdcIiB8IFwiZmxvb3JcIjtcbiAgY2VsbHM6IENlbGxbXTtcbiAgcGhhc2U6IG51bWJlcjtcbiAgY29udHJvbD86IENlbGw7XG4gIHJvb206IG51bWJlcjtcbn07XG5leHBvcnQgdHlwZSBGcmFnaWxlV2FsbCA9IFNpdGU8XCJ3YWxsXCI+ICYgeyBmcm9udDogQ2VsbDsgYmFjazogQ2VsbDsgbGFuZGluZzogQ2VsbFtdOyByb29tOiBudW1iZXIgfTtcbmV4cG9ydCB0eXBlIEJsb2NrZWREb29yID0gU2l0ZTxcIm9ic3RydWN0aW9uXCI+ICYgeyBnYXRlOiBDZWxsOyBzdGFuZDogQ2VsbDsgcGFyazogQ2VsbDsgbWF0ZXJpYWw6IE9ic3RhY2xlOyByb29tOiBudW1iZXIgfTtcbmV4cG9ydCB0eXBlIFN0ZWFtID0gU2l0ZTxcInN0ZWFtXCI+ICYgeyBjZWxsczogQ2VsbFtdOyBoZWFkaW5nOiBDZWxsOyBwaGFzZTogbnVtYmVyOyBjb250cm9sOiBDZWxsOyBzaG9ydGN1dD86IHsgZ2F0ZTogQ2VsbDsgYXBwcm9hY2hlczogW0NlbGwsIENlbGxdIH0gfTtcbmV4cG9ydCB0eXBlIFNoZWxmID0gU2l0ZTxcInNoZWxmXCI+ICYgeyBsYW5kaW5nOiBDZWxsOyBzdGFuZDogQ2VsbDsgc3Rhc2g6IFByb3AgfTtcbmV4cG9ydCB0eXBlIEdhcyA9IFNpdGU8XCJnYXNcIj4gJiB7IGNlbGxzOiBDZWxsW107IGNvbnRyb2w6IENlbGwgfTtcbmV4cG9ydCB0eXBlIEZlYXR1cmUgPSBXaXJlIHwgRnJhZ2lsZVdhbGwgfCBCbG9ja2VkRG9vciB8IFN0ZWFtIHwgU2hlbGYgfCBHYXNcbiAgfCBTaXRlPFwid2Vha1wiPiB8IChTaXRlPFwic3VyZmFjZVwiPiAmIHsgY2VsbHM6IENlbGxbXTsgbWF0ZXJpYWw6IFN1cmZhY2UgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQW5uZXgge1xuICByb29tOiBudW1iZXI7XG4gIHNlYWw6IG51bWJlciB8IG51bGw7XG4gIHByb3BzOiBQcm9wW107XG4gIGd1YXJkPzogWm9tYmllU3Bhd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW52aXJvbm1lbnRQbGFuIHtcbiAgZmVhdHVyZXM6IEZlYXR1cmVbXTtcbiAgYW5uZXhlczogQW5uZXhbXTtcbn1cblxuY29uc3QgQ0FSRElOQUwgPSBbeyB4OiAxLCB5OiAwIH0sIHsgeDogLTEsIHk6IDAgfSwgeyB4OiAwLCB5OiAxIH0sIHsgeDogMCwgeTogLTEgfV07XG5jb25zdCB3YWxrVGlsZXMgPSBuZXcgU2V0PG51bWJlcj4oW1RpbGUuRmxvb3IsIFRpbGUuUnViYmxlLCBUaWxlLlB1ZGRsZSwgVGlsZS5TdGFpcnNVcCwgVGlsZS5TdGFpcnNEb3duLCBUaWxlLkRvb3IsIFRpbGUuRG9vck9wZW5dKTtcbmNvbnN0IG1haW50ZW5hbmNlID0gW1wiV0FSU1pUQVRcIiwgXCJLT1RcXHUwMTQxT1dOSUFcIiwgXCJQUkFMTklBXCIsIFwiXFx1MDE0MUFaSUVOS0FcIiwgXCJTQ0hPV0VLXCJdO1xuY29uc3Qgd29vZFJvb21zID0gW1wiU0FMT05cIiwgXCJTWVBJQUxOSUFcIiwgXCJQT0tcXHUwMGQzSiBEWklFQ0lcXHUwMTE4Q1lcIiwgXCJMT0tBTCBVXFx1MDE3YllUS09XWVwiLCBcIlNDSE9XRUtcIl07XG5jb25zdCBhbm5leE5hbWVzID0gW1wiREFXTlkgV0FSU1pUQVRcIiwgXCJTQ0hPV0VLIExPS0FUT1JBXCIsIFwiS1JZSlxcdTAwZDNXS0EgT0NBTEFcXHUwMTQxRUdPXCIsIFwiTUFHQVpZTlwiLCBcIlpBQkFSWUtBRE9XQU5FIE1JRVNaS0FOSUVcIl07XG5jb25zdCBzaGlmdCA9IChwOiBDZWxsLCB2OiBDZWxsLCBuID0gMSk6IENlbGwgPT4gKHsgeDogcC54ICsgdi54ICogbiwgeTogcC55ICsgdi55ICogbiB9KTtcbmV4cG9ydCBjb25zdCBjZW50ZXIgPSAocDogQ2VsbCkgPT4gKHsgeDogKHAueCArIDAuNSkgKiBUSUxFLCB5OiAocC55ICsgMC41KSAqIFRJTEUgfSk7XG5leHBvcnQgY29uc3Qgc2FtZUNlbGwgPSAocDogQ2VsbCwgcTogQ2VsbCkgPT4gcC54ID09PSBxLnggJiYgcC55ID09PSBxLnk7XG5cbmZ1bmN0aW9uIGNlbGxPZih4OiBudW1iZXIsIHk6IG51bWJlcik6IENlbGwge1xuICByZXR1cm4geyB4OiBNYXRoLmZsb29yKHggLyBUSUxFKSwgeTogTWF0aC5mbG9vcih5IC8gVElMRSkgfTtcbn1cblxuLy8gVGhlc2UgYmxvY2tzIGFyZSBjb25zaWRlcmVkIHNpbXVsdGFuZW91c2x5LCBpbmNsdWRpbmcgYm90aCBlbmRzIG9mIG1vdmluZyBmdXJuaXR1cmUuXG5leHBvcnQgZnVuY3Rpb24gcGxhbm5lZEJsb2NrcyhwbGFuOiBFbnZpcm9ubWVudFBsYW4pOiBDZWxsW10ge1xuICByZXR1cm4gcGxhbi5mZWF0dXJlcy5mbGF0TWFwKChmKSA9PiB7XG4gICAgc3dpdGNoIChmLmtpbmQpIHtcbiAgICAgIGNhc2UgXCJvYnN0cnVjdGlvblwiOiByZXR1cm4gW2YuYXQsIGYucGFyaywgZi5nYXRlXTtcbiAgICAgIGNhc2UgXCJzaGVsZlwiOiByZXR1cm4gW2YuYXQsIGYubGFuZGluZ107XG4gICAgICBjYXNlIFwid2lyZVwiOiBjYXNlIFwic3RlYW1cIjogY2FzZSBcImdhc1wiOiBjYXNlIFwic3VyZmFjZVwiOiByZXR1cm4gZi5jZWxscztcbiAgICAgIGNhc2UgXCJ3ZWFrXCI6IHJldHVybiBbZi5hdF07XG4gICAgICBkZWZhdWx0OiByZXR1cm4gW107XG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYW5uZWRBY2Nlc3MocGxhbjogRW52aXJvbm1lbnRQbGFuKTogQ2VsbFtdIHtcbiAgcmV0dXJuIHBsYW4uZmVhdHVyZXMuZmxhdE1hcCgoZikgPT4ge1xuICAgIHN3aXRjaCAoZi5raW5kKSB7XG4gICAgICBjYXNlIFwid2FsbFwiOiByZXR1cm4gW2YuZnJvbnRdO1xuICAgICAgY2FzZSBcIm9ic3RydWN0aW9uXCI6IGNhc2UgXCJzaGVsZlwiOiByZXR1cm4gW2Yuc3RhbmRdO1xuICAgICAgY2FzZSBcInN0ZWFtXCI6IHJldHVybiBbZi5jb250cm9sLCAuLi4oZi5zaG9ydGN1dD8uYXBwcm9hY2hlcyA/PyBbXSldO1xuICAgICAgY2FzZSBcIndpcmVcIjogY2FzZSBcImdhc1wiOiByZXR1cm4gZi5jb250cm9sID8gW2YuY29udHJvbF0gOiBbXTtcbiAgICAgIGRlZmF1bHQ6IHJldHVybiBbXTtcbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiByb3V0ZUNoZWNrKGY6IEZsb29yRGF0YSkge1xuICBjb25zdCBzaXplID0gZi53ICogZi5oO1xuICBjb25zdCBpZHggPSAocDogQ2VsbCkgPT4gcC55ICogZi53ICsgcC54O1xuICBjb25zdCBwcm9wQmxvY2sgPSBuZXcgVWludDhBcnJheShzaXplKTtcbiAgY29uc3Qga2V5ID0gZi5wcm9wcy5maW5kKChwKSA9PiBwLmlkID09PSBmLmtleVByb3BJZCAmJiBwLmxvb3QgPT09IFwia2V5XCIpO1xuICBjb25zdCByZXF1aXJlZCA9IGYucHJvcHMuZmlsdGVyKChwKSA9PiBwLmxvb3QgIT09IG51bGwgJiYgcC5sb290ICE9PSBcImtleVwiKTtcbiAgZm9yIChjb25zdCBwIG9mIGYucHJvcHMpIGlmIChwLnNvbGlkKSB7XG4gICAgZm9yIChsZXQgeSA9IHAueTsgeSA8IHAueSArIHAuaDsgeSsrKSBmb3IgKGxldCB4ID0gcC54OyB4IDwgcC54ICsgcC53OyB4KyspIHByb3BCbG9ja1t5ICogZi53ICsgeF0gPSAxO1xuICB9XG4gIGNvbnN0IHN0YXJ0ID0gaWR4KGNlbGxPZihmLnBsYXllclN0YXJ0LngsIGYucGxheWVyU3RhcnQueSkpO1xuICBjb25zdCByZWFjaCA9IChibG9ja2VkOiBVaW50OEFycmF5LCBsb2NrOiBib29sZWFuKSA9PiB7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBVaW50OEFycmF5KHNpemUpO1xuICAgIGlmIChibG9ja2VkW3N0YXJ0XSkgcmV0dXJuIHNlZW47XG4gICAgY29uc3QgY2xvc2VkID0gbmV3IFNldChmLmRvb3JzLmZpbHRlcigoZCkgPT4gZC5zZWFsZWQgfHwgKGxvY2sgJiYgZC5sb2NrZWQpKS5tYXAoaWR4KSk7XG4gICAgY29uc3QgcSA9IG5ldyBJbnQzMkFycmF5KHNpemUpO1xuICAgIHFbMF0gPSBzdGFydDtcbiAgICBzZWVuW3N0YXJ0XSA9IDE7XG4gICAgbGV0IHRhaWwgPSAxO1xuICAgIGNvbnN0IHB1c2ggPSAoaTogbnVtYmVyKSA9PiB7XG4gICAgICBpZiAoIXNlZW5baV0gJiYgIWJsb2NrZWRbaV0gJiYgIWNsb3NlZC5oYXMoaSkgJiYgd2Fsa1RpbGVzLmhhcyhmLnRpbGVzW2ldKSkge1xuICAgICAgICBzZWVuW2ldID0gMTtcbiAgICAgICAgcVt0YWlsKytdID0gaTtcbiAgICAgIH1cbiAgICB9O1xuICAgIGZvciAobGV0IGhlYWQgPSAwOyBoZWFkIDwgdGFpbDsgaGVhZCsrKSB7XG4gICAgICBjb25zdCBpID0gcVtoZWFkXTtcbiAgICAgIGlmIChpICUgZi53ID4gMCkgcHVzaChpIC0gMSk7XG4gICAgICBpZiAoaSAlIGYudyA8IGYudyAtIDEpIHB1c2goaSArIDEpO1xuICAgICAgaWYgKGkgPj0gZi53KSBwdXNoKGkgLSBmLncpO1xuICAgICAgaWYgKGkgPCBzaXplIC0gZi53KSBwdXNoKGkgKyBmLncpO1xuICAgIH1cbiAgICByZXR1cm4gc2VlbjtcbiAgfTtcbiAgY29uc3Qgc2VhcmNoID0gKHA6IFByb3AsIHNlZW46IFVpbnQ4QXJyYXkpID0+IHtcbiAgICBmb3IgKGxldCB5ID0gcC55OyB5IDwgcC55ICsgcC5oOyB5KyspIGZvciAobGV0IHggPSBwLng7IHggPCBwLnggKyBwLnc7IHgrKykge1xuICAgICAgaWYgKENBUkRJTkFMLnNvbWUoKGQpID0+IHNlZW5baWR4KHNoaWZ0KHsgeCwgeSB9LCBkKSldKSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcbiAgY29uc3QgYmVmb3JlID0gcmVhY2gocHJvcEJsb2NrLCB0cnVlKTtcbiAgcmV0dXJuIHtcbiAgICBiZWZvcmUsXG4gICAgc2FmZShibG9ja3M6IENlbGxbXSwgYWNjZXNzOiBDZWxsW10pIHtcbiAgICAgIGNvbnN0IGJsb2NrID0gcHJvcEJsb2NrLnNsaWNlKCk7XG4gICAgICBmb3IgKGNvbnN0IHAgb2YgYmxvY2tzKSBibG9ja1tpZHgocCldID0gMTtcbiAgICAgIGNvbnN0IGVhcmx5ID0gcmVhY2goYmxvY2ssIHRydWUpO1xuICAgICAgaWYgKCFhY2Nlc3MuZXZlcnkoKHApID0+IGVhcmx5W2lkeChwKV0pIHx8IChrZXkgJiYgIXNlYXJjaChrZXksIGVhcmx5KSkpIHJldHVybiBmYWxzZTtcbiAgICAgIGlmIChmLnN0YWlyc0Rvd24gJiYgIWVhcmx5W2lkeChmLnN0YWlyc0Rvd24pXSkgcmV0dXJuIGZhbHNlO1xuICAgICAgY29uc3Qgb3BlbiA9IGtleSA/IHJlYWNoKGJsb2NrLCBmYWxzZSkgOiBlYXJseTtcbiAgICAgIHJldHVybiAoIWYuc3RhaXJzVXAgfHwgISFvcGVuW2lkeChmLnN0YWlyc1VwKV0pICYmIHJlcXVpcmVkLmV2ZXJ5KChwKSA9PiBzZWFyY2gocCwgb3BlbikpO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUVudmlyb25tZW50KGY6IEZsb29yRGF0YSkge1xuICBjb25zdCBwbGFuID0gZi5lbnZpcm9ubWVudDtcbiAgaWYgKCFwbGFuKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHJvdXRlQ2hlY2soZikuc2FmZShwbGFubmVkQmxvY2tzKHBsYW4pLCBwbGFubmVkQWNjZXNzKHBsYW4pKSA/IG51bGwgOiBcImVudmlyb25tZW50IGN1dHMgb2ZmIHRoZSBzYWZlIHJvdXRlXCI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwb3B1bGF0ZUVudmlyb25tZW50KGY6IEZsb29yRGF0YSkge1xuICBjb25zdCBwbGFuOiBFbnZpcm9ubWVudFBsYW4gPSB7IGZlYXR1cmVzOiBbXSwgYW5uZXhlczogW10gfTtcbiAgZi5lbnZpcm9ubWVudCA9IHBsYW47XG4gIGlmIChmLnRoZW1lID09PSBcInJvb2ZcIikgcmV0dXJuIGY7XG4gIGNvbnN0IHJuZyA9IG1ha2VSbmcoZi5zZWVkIF4gMHhhMWRhNzdiNyk7XG4gIGNvbnN0IGlkeCA9IChwOiBDZWxsKSA9PiBwLnkgKiBmLncgKyBwLng7XG4gIGNvbnN0IHRpbGUgPSAocDogQ2VsbCkgPT4gZi50aWxlc1tpZHgocCldO1xuICBjb25zdCByb29tQXQgPSAocDogQ2VsbCkgPT4gZi5yb29tc1tmLnJvb21PZltpZHgocCldXTtcbiAgY29uc3Qgc3RhcnQgPSBjZWxsT2YoZi5wbGF5ZXJTdGFydC54LCBmLnBsYXllclN0YXJ0LnkpO1xuICBjb25zdCBkaXN0ID0gKHA6IENlbGwsIHEgPSBzdGFydCkgPT4gTWF0aC5hYnMocC54IC0gcS54KSArIE1hdGguYWJzKHAueSAtIHEueSk7XG4gIGNvbnN0IHdpdGhpbiA9IChwOiBDZWxsKSA9PiBwLnggPiAwICYmIHAueSA+IDAgJiYgcC54IDwgZi53IC0gMSAmJiBwLnkgPCBmLmggLSAxO1xuICBjb25zdCByb3V0ZSA9IHJvdXRlQ2hlY2soZik7XG4gIGNvbnN0IHJlc2VydmVkID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGNvbnN0IG9jY3VwaWVkID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGNvbnN0IHJvb21zVXNlZCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBjb25zdCBiYXNlUm9vbXMgPSBbLi4uZi5yb29tc107XG4gIGZvciAoY29uc3QgcCBvZiBmLnByb3BzKSB7XG4gICAgZm9yIChsZXQgeSA9IHAueTsgeSA8IHAueSArIHAuaDsgeSsrKSBmb3IgKGxldCB4ID0gcC54OyB4IDwgcC54ICsgcC53OyB4KyspIG9jY3VwaWVkLmFkZChpZHgoeyB4LCB5IH0pKTtcbiAgfVxuICBmb3IgKGNvbnN0IGFjdG9yIG9mIFsuLi5mLnpvbWJpZXMsIC4uLmYuc3Vydml2b3JzXSkgb2NjdXBpZWQuYWRkKGlkeChjZWxsT2YoYWN0b3IueCwgYWN0b3IueSkpKTtcbiAgY29uc3QgZnJlZSA9IChwOiBDZWxsKSA9PiB3aXRoaW4ocCkgJiYgdGlsZShwKSA9PT0gVGlsZS5GbG9vciAmJiBkaXN0KHApID49IDYgJiYgISFyb3V0ZS5iZWZvcmVbaWR4KHApXVxuICAgICYmICghcm9vbUF0KHApIHx8IHJvb21BdChwKT8ucm9sZSA9PT0gXCJub3JtYWxcIikgJiYgIW9jY3VwaWVkLmhhcyhpZHgocCkpICYmICFyZXNlcnZlZC5oYXMoaWR4KHApKTtcbiAgY29uc3QgcmVzZXJ2ZSA9IChzcG90czogQ2VsbFtdKSA9PiB7IGZvciAoY29uc3QgcCBvZiBzcG90cykgcmVzZXJ2ZWQuYWRkKGlkeChwKSk7IH07XG4gIGNvbnN0IHNhZmUgPSAoYmxvY2tzOiBDZWxsW10sIGFjY2VzczogQ2VsbFtdKSA9PiByb3V0ZS5zYWZlKFsuLi5wbGFubmVkQmxvY2tzKHBsYW4pLCAuLi5ibG9ja3NdLCBbLi4ucGxhbm5lZEFjY2VzcyhwbGFuKSwgLi4uYWNjZXNzXSk7XG4gIGNvbnN0IGFkZCA9IChmZWF0dXJlOiBGZWF0dXJlKSA9PiBwbGFuLmZlYXR1cmVzLnB1c2goZmVhdHVyZSk7XG4gIGNvbnN0IGlkID0gKCkgPT4gcGxhbi5mZWF0dXJlcy5sZW5ndGggKyAxO1xuICBjb25zdCBzaHVmZmxlZCA9IDxUPihsaXN0OiBUW10pID0+IGxpc3QubWFwKCh2KSA9PiAoeyB2LCBrZXk6IHJuZygpIH0pKS5zb3J0KChhLCBiKSA9PiBhLmtleSAtIGIua2V5KS5tYXAoKHsgdiB9KSA9PiB2KTtcblxuICBmdW5jdGlvbiBjYWNoZShyb29tOiBudW1iZXIsIHNsb3Q6IG51bWJlciwgcDogQ2VsbCwgbG9vdDogTG9vdCwga2luZDogUHJvcFtcImtpbmRcIl0gPSBcInN1cHBseWNhc2VcIik6IFByb3Age1xuICAgIHJldHVybiB7IC4uLnAsIGlkOiAxMDAwMCArIHJvb20gKiAxNiArIHNsb3QsIGtpbmQsIHc6IDEsIGg6IDEsIHNvbGlkOiB0cnVlLCBsb290LCBvcGVuZWQ6IGZhbHNlLCBsYWJlbDogXCJwcnplc3p1a2FqIHNrcnl0a1xcdTAxMTlcIiB9O1xuICB9XG5cbiAgZnVuY3Rpb24gYW5uZXgoa2luZDogXCJvYnN0cnVjdGlvblwiIHwgXCJ3YWxsXCIgfCBcImZsb29kZWRcIikge1xuICAgIGNvbnN0IGNob2ljZXM6IHsgZ2F0ZTogQ2VsbDsgZnJvbnQ6IENlbGw7IHN0YW5kOiBDZWxsOyBwYXJrOiBDZWxsOyBzaWRlOiBudW1iZXI7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBoOiBudW1iZXIgfVtdID0gW107XG4gICAgZm9yIChjb25zdCBzaWRlIG9mIFstMSwgMV0pIGZvciAobGV0IHkgPSA1OyB5IDwgZi5oIC0gMTA7IHkrKykge1xuICAgICAgY29uc3QgeCA9IHNpZGUgPCAwID8gMSA6IGYudyAtIDM7XG4gICAgICBjb25zdCBoID0gNSArICh5ICUgMik7XG4gICAgICBjb25zdCBnYXRlID0geyB4OiBzaWRlIDwgMCA/IHggKyAyIDogeCAtIDEsIHk6IHkgKyAxIH07XG4gICAgICBjb25zdCBmcm9udCA9IHNoaWZ0KGdhdGUsIHsgeDogLXNpZGUsIHk6IDAgfSk7XG4gICAgICBjb25zdCBzdGFuZCA9IHNoaWZ0KGZyb250LCB7IHg6IC1zaWRlLCB5OiAwIH0pO1xuICAgICAgY29uc3QgcGFyayA9IHNoaWZ0KGZyb250LCB7IHg6IDAsIHk6IDEgfSk7XG4gICAgICBpZiAoIVtmcm9udCwgc3RhbmQsIHBhcmtdLmV2ZXJ5KGZyZWUpKSBjb250aW51ZTtcbiAgICAgIGlmIChraW5kID09PSBcImZsb29kZWRcIiAmJiAhZnJlZShzaGlmdChzdGFuZCwgeyB4OiAwLCB5OiAxIH0pKSkgY29udGludWU7XG4gICAgICBsZXQgc2VhbGVkID0gdHJ1ZTtcbiAgICAgIGZvciAobGV0IHl5ID0geSAtIDE7IHl5IDw9IHkgKyBoOyB5eSsrKSBmb3IgKGxldCB4eCA9IHggLSAxOyB4eCA8PSB4ICsgMjsgeHgrKykge1xuICAgICAgICBpZiAoZi50aWxlc1t5eSAqIGYudyArIHh4XSAhPT0gVGlsZS5XYWxsIHx8IHJlc2VydmVkLmhhcyh5eSAqIGYudyArIHh4KSkgc2VhbGVkID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoc2VhbGVkKSBjaG9pY2VzLnB1c2goeyBnYXRlLCBmcm9udCwgc3RhbmQsIHBhcmssIHNpZGUsIHgsIHksIGggfSk7XG4gICAgfVxuICAgIGNvbnN0IG9yZGVyZWQgPSBzaHVmZmxlZChjaG9pY2VzKS5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAvLyBLZWVwIHRoZSBmaXJzdCBkaXNjb3Zlcnkgb24gdGhlIGJhc2VtZW50J3MgZXhwbG9yZWQgc2lkZSBvZiB0aGUgYnVpbGRpbmcuXG4gICAgICByZXR1cm4gZi5pbmRleCA9PT0gMCAmJiBraW5kID09PSBcIm9ic3RydWN0aW9uXCIgPyBNYXRoLmZsb29yKGRpc3QoYS5mcm9udCkgLyA4KSAtIE1hdGguZmxvb3IoZGlzdChiLmZyb250KSAvIDgpIDogMDtcbiAgICB9KTtcbiAgICBmb3IgKGNvbnN0IGMgb2Ygb3JkZXJlZCkge1xuICAgICAgY29uc3QgeyBnYXRlLCBmcm9udCwgc3RhbmQsIHBhcmssIHNpZGUsIHgsIHksIGggfSA9IGM7XG4gICAgICBjb25zdCBjb250cm9sID0gc2hpZnQoc3RhbmQsIHsgeDogMCwgeTogMSB9KTtcbiAgICAgIGlmICghc2FmZShraW5kID09PSBcIm9ic3RydWN0aW9uXCIgPyBbZnJvbnQsIHBhcmssIGdhdGVdIDoga2luZCA9PT0gXCJ3YWxsXCIgPyBbZnJvbnRdIDogW10sIFtraW5kID09PSBcIndhbGxcIiA/IHN0YW5kIDoga2luZCA9PT0gXCJmbG9vZGVkXCIgPyBjb250cm9sIDogc3RhbmRdKSkgY29udGludWU7XG4gICAgICBjb25zdCByOiBSb29tID0geyBpZDogZi5yb29tcy5sZW5ndGgsIHgsIHksIHc6IDIsIGgsIHJvbGU6IFwibm9ybWFsXCIsIGxpdDoga2luZCA9PT0gXCJmbG9vZGVkXCIgfHwgcm5nLmNoYW5jZSgwLjI3KSwgZmxpY2tlcjogdHJ1ZSB9O1xuICAgICAgY29uc3QgdHlwZSA9IHJuZy5pbnQoYW5uZXhOYW1lcy5sZW5ndGgpO1xuICAgICAgZi5yb29tcy5wdXNoKHIpO1xuICAgICAgZi5yb29tWm9uZXMucHVzaChraW5kID09PSBcImZsb29kZWRcIiA/IFwiWkFMQU5ZIE1BR0FaWU5cIiA6IGFubmV4TmFtZXNbdHlwZV0pO1xuICAgICAgcm9vbXNVc2VkLmFkZChyLmlkKTtcbiAgICAgIGZvciAobGV0IHl5ID0geSAtIDE7IHl5IDw9IHkgKyBoOyB5eSsrKSBmb3IgKGxldCB4eCA9IHggLSAxOyB4eCA8PSB4ICsgMjsgeHgrKykge1xuICAgICAgICBjb25zdCBpID0geXkgKiBmLncgKyB4eDtcbiAgICAgICAgcmVzZXJ2ZWQuYWRkKGkpO1xuICAgICAgICBmLndhbGxTdHlsZVtpXSA9IHR5cGUgPCAzID8gMyA6IDQ7XG4gICAgICAgIGlmICh5eSA8IHkgfHwgeXkgPj0geSArIGggfHwgeHggPCB4IHx8IHh4ID49IHggKyAyKSBjb250aW51ZTtcbiAgICAgICAgZi50aWxlc1tpXSA9IFRpbGUuRmxvb3I7XG4gICAgICAgIGYuZmxvb3JTdHlsZVtpXSA9IHR5cGUgPT09IDQgPyA1IDogdHlwZSA9PT0gMiA/IDAgOiAzO1xuICAgICAgICBmLnJvb21PZltpXSA9IHIuaWQ7XG4gICAgICB9XG4gICAgICBjb25zdCBpbnNpZGUgPSBzaGlmdChnYXRlLCB7IHg6IHNpZGUsIHk6IDAgfSk7XG4gICAgICBmLmZsb29yU3R5bGVbaWR4KGdhdGUpXSA9IGYuZmxvb3JTdHlsZVtpZHgoaW5zaWRlKV07XG4gICAgICBjb25zdCBzZWFsID0ga2luZCA9PT0gXCJmbG9vZGVkXCIgPyBudWxsIDogaWQoKTtcbiAgICAgIGNvbnN0IGVsaWdpYmxlID0gT2JqZWN0LmVudHJpZXMoRElTQ09WRVJJRVMpLmZpbHRlcigoW2Zsb29yXSkgPT4gTnVtYmVyKGZsb29yKSA8PSBmLmluZGV4KS5tYXAoKFssIHdlYXBvbl0pID0+IHdlYXBvbiEpO1xuICAgICAgbGV0IHJld2FyZDogTG9vdCA9IHJuZy5waWNrPExvb3Q+KFtcImFtbW9cIiwgXCJhbW1vXCIsIFwibWVkXCIsIFwiYmF0dGVyeVwiLCBmLmluZGV4ID49IDQgPyBcInNoZWxsc1wiIDogXCJhbW1vXCIsIGYuaW5kZXggPj0gNiA/IFwiYm9sdHNcIiA6IFwiYmF0dGVyeVwiXSk7XG4gICAgICBpZiAoZWxpZ2libGUubGVuZ3RoICYmIHJuZy5jaGFuY2Uoa2luZCA9PT0gXCJmbG9vZGVkXCIgPyAwLjIwIDogMC4zMikpIHJld2FyZCA9IHJuZy5waWNrPFdlYXBvbklkPihlbGlnaWJsZSk7XG4gICAgICBjb25zdCBwcm9wcyA9IFtjYWNoZShyLmlkLCAwLCB7IHg6IHNpZGUgPCAwID8geCA6IHggKyAxLCB5OiB5ICsgaCAtIDEgfSwgcmV3YXJkLCByZXdhcmQgPT09IFwibWVkXCIgPyBcIm1lZGJveFwiIDogXCJzdXBwbHljYXNlXCIpXTtcbiAgICAgIGNvbnN0IHNlY29uZCA9IHJuZy5waWNrPExvb3Q+KFtcIm1lZFwiLCBcImJhdHRlcnlcIiwgXCJhbW1vXCJdKTtcbiAgICAgIGlmICh0eXBlIDwgNCB8fCBraW5kID09PSBcImZsb29kZWRcIikgcHJvcHMucHVzaChjYWNoZShyLmlkLCAxLCB7IHg6IGluc2lkZS54LCB5OiB5ICsgaCAtIDEgfSwgc2Vjb25kLCBzZWNvbmQgPT09IFwibWVkXCIgPyBcIm1lZGJveFwiIDogXCJzdXBwbHljYXNlXCIpKTtcbiAgICAgIGNvbnN0IGRlY29yOiBQcm9wW1wia2luZFwiXSA9IChbXCJ3YXNoZXJcIiwgXCJsb2NrZXJcIiwgXCJjaGFpclwiLCBcImJhcnJlbFwiLCBcInN0b3ZlXCJdIGFzIGNvbnN0KVt0eXBlXTtcbiAgICAgIHByb3BzLnB1c2goeyAuLi5jYWNoZShyLmlkLCAyLCB7IHg6IHNpZGUgPCAwID8geCA6IHggKyAxLCB5IH0sIG51bGwsIGRlY29yKSwgbGFiZWw6IHVuZGVmaW5lZCB9KTtcbiAgICAgIGNvbnN0IGd1YXJkID0ga2luZCAhPT0gXCJmbG9vZGVkXCIgJiYgZi5pbmRleCA+IDAgJiYgKHR5cGUgPT09IDQgfHwgcm5nLmNoYW5jZSgwLjE0KSlcbiAgICAgICAgPyB7IC4uLmNlbnRlcih7IHg6IGluc2lkZS54LCB5OiB5ICsgaCAtIDIgfSksIGtpbmQ6IFwic2hhbWJsZXJcIiBhcyBjb25zdCwgcm9vbTogci5pZCB9IDogdW5kZWZpbmVkO1xuICAgICAgcGxhbi5hbm5leGVzLnB1c2goeyByb29tOiByLmlkLCBzZWFsLCBwcm9wcywgZ3VhcmQgfSk7XG4gICAgICBpZiAoci5saXQpIGYubGlnaHRzLnB1c2goeyAuLi5jZW50ZXIoeyB4OiBpbnNpZGUueCwgeTogeSArIDIgfSksIHJvb21JZDogci5pZCwga2luZDogXCJmbHVvclwiLCByYWRpdXM6IDUyLCBmbGlja2VyOiB0cnVlIH0pO1xuICAgICAgcmVzZXJ2ZShbZnJvbnQsIHN0YW5kLCBwYXJrLCAuLi4oa2luZCA9PT0gXCJmbG9vZGVkXCIgPyBbY29udHJvbF0gOiBbXSldKTtcbiAgICAgIGlmIChraW5kID09PSBcIndhbGxcIikge1xuICAgICAgICBhZGQoeyBpZDogaWQoKSwga2luZCwgYXQ6IGdhdGUsIGZyb250LCBiYWNrOiBpbnNpZGUsIHJvb206IHIuaWQsIGxhbmRpbmc6IFtmcm9udCwgaW5zaWRlXSB9KTtcbiAgICAgIH0gZWxzZSBpZiAoa2luZCA9PT0gXCJvYnN0cnVjdGlvblwiKSB7XG4gICAgICAgIGYudGlsZXNbaWR4KGdhdGUpXSA9IFRpbGUuRG9vcjtcbiAgICAgICAgZi5kb29ycy5wdXNoKHsgLi4uZ2F0ZSwgaHA6IDQsIGxvY2tlZDogZmFsc2UsIHNlYWxlZDogdHJ1ZSwgb3BlbjogZmFsc2UsIGJyb2tlbjogZmFsc2UgfSk7XG4gICAgICAgIGNvbnN0IG1hdGVyaWFsID0gcm5nLnBpY2s8T2JzdGFjbGU+KFtcImNhYmluZXRcIiwgXCJmcmlkZ2VcIiwgXCJkcmVzc2VyXCIsIFwiYm9va2Nhc2VcIiwgXCJib2FyZHNcIiwgXCJ1cHR1cm5lZFwiXSk7XG4gICAgICAgIGFkZCh7IGlkOiBpZCgpLCBraW5kLCBhdDogZnJvbnQsIGdhdGUsIHN0YW5kLCBwYXJrLCByb29tOiByLmlkLCBtYXRlcmlhbCB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGYudGlsZXNbaWR4KGdhdGUpXSA9IFRpbGUuRG9vck9wZW47XG4gICAgICAgIGYuZG9vcnMucHVzaCh7IC4uLmdhdGUsIGhwOiA0LCBsb2NrZWQ6IGZhbHNlLCBvcGVuOiB0cnVlLCBicm9rZW46IGZhbHNlIH0pO1xuICAgICAgICBjb25zdCBjZWxscyA9IFt7IHgsIHk6IHkgKyAyIH0sIHsgeDogeCArIDEsIHk6IHkgKyAyIH0sIHsgeDogaW5zaWRlLngsIHk6IHkgKyAzIH1dO1xuICAgICAgICBmb3IgKGNvbnN0IHAgb2YgY2VsbHMpIGYudGlsZXNbaWR4KHApXSA9IFRpbGUuUHVkZGxlO1xuICAgICAgICBhZGQoeyBpZDogaWQoKSwga2luZDogXCJ3aXJlXCIsIGF0OiBjZWxsc1sxXSwgcm9vbTogci5pZCwgbW9kZTogXCJwb29sXCIsIG1vdW50OiBcImZsb29yXCIsIHBoYXNlOiBybmcoKSAqIDUsIGNlbGxzLCBjb250cm9sIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFubmV4KFwib2JzdHJ1Y3Rpb25cIik7XG4gIGFubmV4KFwid2FsbFwiKTtcbiAgY29uc3QgZmxvb2RlZCA9IChmLmluZGV4ID09PSAwIHx8IGYuaW5kZXggPj0gMykgJiYgcm5nLmNoYW5jZShmLmluZGV4ID09PSAwID8gMC44MiA6IDAuNTUpICYmIGFubmV4KFwiZmxvb2RlZFwiKTtcblxuICBmdW5jdGlvbiByb29tcyh6b25lczogc3RyaW5nW10pIHtcbiAgICByZXR1cm4gc2h1ZmZsZWQoYmFzZVJvb21zLmZpbHRlcigocikgPT4gci5yb2xlID09PSBcIm5vcm1hbFwiICYmICFyb29tc1VzZWQuaGFzKHIuaWQpICYmIHpvbmVzLmluY2x1ZGVzKGYucm9vbVpvbmVzW3IuaWRdKSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gcm9vbUNlbGxzKHI6IFJvb20pIHtcbiAgICBjb25zdCBjZWxsczogQ2VsbFtdID0gW107XG4gICAgZm9yIChsZXQgeSA9IHIueTsgeSA8IHIueSArIHIuaDsgeSsrKSBmb3IgKGxldCB4ID0gci54OyB4IDwgci54ICsgci53OyB4KyspIHtcbiAgICAgIGNvbnN0IHAgPSB7IHgsIHkgfTtcbiAgICAgIGlmIChmcmVlKHApKSBjZWxscy5wdXNoKHApO1xuICAgIH1cbiAgICByZXR1cm4gc2h1ZmZsZWQoY2VsbHMpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2VsZWN0Q29udHJvbChyOiBSb29tLCBhdDogQ2VsbCwgYXJlYTogQ2VsbFtdKSB7XG4gICAgY29uc3QgbmVhciA9IHJvb21DZWxscyhyKS5maWx0ZXIoKGMpID0+IGRpc3QoYXQsIGMpID49IDIgJiYgZGlzdChhdCwgYykgPD0gNSAmJiAhYXJlYS5zb21lKChwKSA9PiBzYW1lQ2VsbChwLCBjKSkpO1xuICAgIHJldHVybiBuZWFyLmZpbmQoKGMpID0+IHNhZmUoYXJlYSwgW2NdKSk7XG4gIH1cblxuICBmb3IgKGNvbnN0IHIgb2Ygcm9vbXMoWy4uLm1haW50ZW5hbmNlLCBcIktVQ0hOSUFcIiwgXCJLT1JZVEFSWlwiXSkpIHtcbiAgICBjb25zdCBhdCA9IHJvb21DZWxscyhyKS5maW5kKChwKSA9PiBzYWZlKFtwXSwgW10pKTtcbiAgICBpZiAoIWF0KSBjb250aW51ZTtcbiAgICBjb25zdCBtb2RlID0gZi5pbmRleCAlIDIgPT09IDAgPyBcInB1bHNlXCIgOiBcInN0ZWFkeVwiO1xuICAgIGNvbnN0IGNvbnRyb2wgPSBmLnJvb21ab25lc1tyLmlkXSAhPT0gXCJLT1JZVEFSWlwiICYmIHIubGl0ICYmIHJuZy5jaGFuY2UoMC43KSA/IHNlbGVjdENvbnRyb2wociwgYXQsIFthdF0pIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IG9uV2FsbCA9IENBUkRJTkFMLnNvbWUoKGQpID0+IHRpbGUoc2hpZnQoYXQsIGQpKSA9PT0gVGlsZS5XYWxsKTtcbiAgICBhZGQoeyBpZDogaWQoKSwga2luZDogXCJ3aXJlXCIsIGF0LCByb29tOiByLmlkLCBtb2RlLCBtb3VudDogb25XYWxsID8gXCJ3YWxsXCIgOiBybmcucGljayhbXCJjZWlsaW5nXCIsIFwiZmxvb3JcIl0pLCBwaGFzZTogcm5nKCkgKiA1LCBjZWxsczogW2F0XSwgY29udHJvbCB9KTtcbiAgICByZXNlcnZlKGNvbnRyb2wgPyBbYXQsIGNvbnRyb2xdIDogW2F0XSk7XG4gICAgaWYgKGYucm9vbVpvbmVzW3IuaWRdICE9PSBcIktPUllUQVJaXCIpIHJvb21zVXNlZC5hZGQoci5pZCk7XG4gICAgYnJlYWs7XG4gIH1cblxuICBpZiAoIWZsb29kZWQgJiYgZi5pbmRleCA+PSAyICYmIHJuZy5jaGFuY2UoMC4zNikpIGFubmV4KFwiZmxvb2RlZFwiKTtcblxuICBmdW5jdGlvbiBzdGVhbVNob3J0Y3V0KCkge1xuICAgIGNvbnN0IGJsb2NrZWQgPSBuZXcgU2V0KHBsYW5uZWRCbG9ja3MocGxhbikubWFwKGlkeCkpO1xuICAgIGNvbnN0IHByb3BzID0gbmV3IFNldChmLnByb3BzLmZpbHRlcigocCkgPT4gcC5zb2xpZCkuZmxhdE1hcCgocCkgPT5cbiAgICAgIEFycmF5LmZyb20oeyBsZW5ndGg6IHAudyAqIHAuaCB9LCAoXywgaSkgPT4gaWR4KHsgeDogcC54ICsgaSAlIHAudywgeTogcC55ICsgTWF0aC5mbG9vcihpIC8gcC53KSB9KSkpKTtcbiAgICBjb25zdCBjYW5QYXNzID0gKHg6IG51bWJlciwgeTogbnVtYmVyKSA9PiB7XG4gICAgICBjb25zdCBpID0gaWR4KHsgeCwgeSB9KTtcbiAgICAgIHJldHVybiAhIXJvdXRlLmJlZm9yZVtpXSAmJiAhYmxvY2tlZC5oYXMoaSkgJiYgIXByb3BzLmhhcyhpKSAmJiB3YWxrVGlsZXMuaGFzKGYudGlsZXNbaV0pO1xuICAgIH07XG4gICAgZm9yIChjb25zdCByIG9mIHJvb21zKFsuLi5tYWludGVuYW5jZSwgXCJLT1JZVEFSWlwiXSkpIGZvciAoY29uc3QgZnJvbnQgb2Ygcm9vbUNlbGxzKHIpKSBmb3IgKGNvbnN0IGhlYWRpbmcgb2Ygc2h1ZmZsZWQoQ0FSRElOQUwpKSB7XG4gICAgICBjb25zdCBnYXRlID0gc2hpZnQoZnJvbnQsIGhlYWRpbmcpLCBiYWNrID0gc2hpZnQoZ2F0ZSwgaGVhZGluZyk7XG4gICAgICBjb25zdCBpbmxldCA9IHNoaWZ0KGZyb250LCBoZWFkaW5nLCAtMSksIGFwcHJvYWNoID0gc2hpZnQoaW5sZXQsIGhlYWRpbmcsIC0xKSwgb3RoZXIgPSBzaGlmdChiYWNrLCBoZWFkaW5nKTtcbiAgICAgIGlmICh0aWxlKGdhdGUpICE9PSBUaWxlLldhbGwgfHwgcmVzZXJ2ZWQuaGFzKGlkeChnYXRlKSkgfHwgIVtpbmxldCwgYXBwcm9hY2gsIGJhY2ssIG90aGVyXS5ldmVyeShmcmVlKSkgY29udGludWU7XG4gICAgICBjb25zdCBuZXh0ID0gcm9vbUF0KGJhY2spO1xuICAgICAgaWYgKCFuZXh0IHx8IG5leHQgPT09IHIgfHwgcm9vbXNVc2VkLmhhcyhuZXh0LmlkKSB8fCByb29tQXQob3RoZXIpICE9PSBuZXh0IHx8IHJvb21BdChpbmxldCkgIT09IHIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGV0b3VyID0gYXN0YXIoZi53LCBmLmgsIGFwcHJvYWNoLngsIGFwcHJvYWNoLnksIG90aGVyLngsIG90aGVyLnksIGNhblBhc3MpO1xuICAgICAgaWYgKCFkZXRvdXIgfHwgZGV0b3VyLmxlbmd0aCA8IDE0KSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGNlbGxzID0gW2lubGV0LCBmcm9udF07XG4gICAgICBjb25zdCBjb250cm9sID0gc2VsZWN0Q29udHJvbChyLCBpbmxldCwgWy4uLmNlbGxzLCBiYWNrXSk7XG4gICAgICBpZiAoIWNvbnRyb2wgfHwgIXNhZmUoWy4uLmNlbGxzLCBiYWNrXSwgW2NvbnRyb2wsIGFwcHJvYWNoLCBvdGhlcl0pKSBjb250aW51ZTtcbiAgICAgIGYudGlsZXNbaWR4KGdhdGUpXSA9IFRpbGUuUnViYmxlO1xuICAgICAgZi5mbG9vclN0eWxlW2lkeChnYXRlKV0gPSBmLmZsb29yU3R5bGVbaWR4KGZyb250KV07XG4gICAgICBmLmJyZWFjaGVzLnB1c2goZ2F0ZSk7XG4gICAgICBhZGQoeyBpZDogaWQoKSwga2luZDogXCJzdGVhbVwiLCBhdDogaW5sZXQsIGNlbGxzLCBjb250cm9sLCBoZWFkaW5nLCBwaGFzZTogcm5nKCkgKiA1LCBzaG9ydGN1dDogeyBnYXRlLCBhcHByb2FjaGVzOiBbYXBwcm9hY2gsIG90aGVyXSB9IH0pO1xuICAgICAgYWRkKHsgaWQ6IGlkKCksIGtpbmQ6IFwic3VyZmFjZVwiLCBtYXRlcmlhbDogXCJnbGFzc1wiLCBhdDogYmFjaywgY2VsbHM6IFtiYWNrXSB9KTtcbiAgICAgIHJlc2VydmUoWy4uLmNlbGxzLCBiYWNrLCBnYXRlLCBjb250cm9sLCBhcHByb2FjaCwgb3RoZXJdKTtcbiAgICAgIHJvb21zVXNlZC5hZGQoci5pZCk7XG4gICAgICByb29tc1VzZWQuYWRkKG5leHQuaWQpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGxldCBzdGVhbVBsYWNlZCA9IGYuaW5kZXggPiAwICYmIHJuZy5jaGFuY2UoMC4zOCkgJiYgc3RlYW1TaG9ydGN1dCgpO1xuICBpZiAoIXN0ZWFtUGxhY2VkICYmIChmLmluZGV4IDwgMiB8fCBybmcuY2hhbmNlKDAuNzMpKSkgZm9yIChjb25zdCByIG9mIHJvb21zKFsuLi5tYWludGVuYW5jZSwgXCJLT1JZVEFSWlwiXSkpIHtcbiAgICBmb3IgKGNvbnN0IGF0IG9mIHJvb21DZWxscyhyKSkge1xuICAgICAgY29uc3QgaGVhZGluZyA9IHNodWZmbGVkKENBUkRJTkFMKS5maW5kKChkKSA9PiByb29tQXQoc2hpZnQoYXQsIGQpKT8uaWQgPT09IHIuaWQgJiYgZnJlZShzaGlmdChhdCwgZCkpKTtcbiAgICAgIGlmICghaGVhZGluZykgY29udGludWU7XG4gICAgICBjb25zdCBjZWxscyA9IFthdCwgc2hpZnQoYXQsIGhlYWRpbmcpXTtcbiAgICAgIGNvbnN0IGNvbnRyb2wgPSBzZWxlY3RDb250cm9sKHIsIGF0LCBjZWxscyk7XG4gICAgICBpZiAoIWNvbnRyb2wpIGNvbnRpbnVlO1xuICAgICAgYWRkKHsgaWQ6IGlkKCksIGtpbmQ6IFwic3RlYW1cIiwgYXQsIGNlbGxzLCBjb250cm9sLCBoZWFkaW5nLCBwaGFzZTogcm5nKCkgKiA1IH0pO1xuICAgICAgcmVzZXJ2ZShbLi4uY2VsbHMsIGNvbnRyb2xdKTtcbiAgICAgIHJvb21zVXNlZC5hZGQoci5pZCk7XG4gICAgICBzdGVhbVBsYWNlZCA9IHRydWU7XG4gICAgICAvLyBTaWRlLWJ5LXNpZGUgY2x1ZXMgb24gdGhlIHNob3J0IHBhdGgsIG5vdCBvbiB0aGUgcm91dGUgYXJvdW5kIHRoZSBqZXQuXG4gICAgICBjb25zdCBzaGFyZCA9IHNoaWZ0KGNlbGxzWzFdLCBoZWFkaW5nKTtcbiAgICAgIGlmIChybmcuY2hhbmNlKDAuNDgpICYmIGZyZWUoc2hhcmQpICYmIHJvb21BdChzaGFyZCk/LmlkID09PSByLmlkICYmIHNhZmUoW3NoYXJkXSwgW10pKSB7XG4gICAgICAgIGFkZCh7IGlkOiBpZCgpLCBraW5kOiBcInN1cmZhY2VcIiwgYXQ6IHNoYXJkLCBjZWxsczogW3NoYXJkXSwgbWF0ZXJpYWw6IFwiZ2xhc3NcIiB9KTtcbiAgICAgICAgcmVzZXJ2ZShbc2hhcmRdKTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBpZiAoc3RlYW1QbGFjZWQpIGJyZWFrO1xuICB9XG5cbiAgaWYgKGYuaW5kZXggPiAwICYmIHJuZy5jaGFuY2UoMC42OSkpIHtcbiAgICBsZXQgcGxhY2VkID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCByIG9mIHJvb21zKFtcIktVQ0hOSUFcIiwgXCJLT1RcXHUwMTQxT1dOSUFcIiwgXCJXQVJTWlRBVFwiXSkpIHtcbiAgICAgIGZvciAoY29uc3QgYXQgb2Ygcm9vbUNlbGxzKHIpKSB7XG4gICAgICAgIGNvbnN0IG5lYXIgPSBzaHVmZmxlZChDQVJESU5BTC5tYXAoKGQpID0+IHNoaWZ0KGF0LCBkKSkpLmZpbHRlcigocCkgPT4gZnJlZShwKSAmJiByb29tQXQocCk/LmlkID09PSByLmlkKTtcbiAgICAgICAgaWYgKG5lYXIubGVuZ3RoIDwgMikgY29udGludWU7XG4gICAgICAgIGNvbnN0IGNlbGxzID0gW2F0LCAuLi5uZWFyLnNsaWNlKDAsIDIpXTtcbiAgICAgICAgY29uc3QgY29udHJvbCA9IHNlbGVjdENvbnRyb2wociwgYXQsIGNlbGxzKTtcbiAgICAgICAgaWYgKCFjb250cm9sKSBjb250aW51ZTtcbiAgICAgICAgYWRkKHsgaWQ6IGlkKCksIGtpbmQ6IFwiZ2FzXCIsIGF0LCBjZWxscywgY29udHJvbCB9KTtcbiAgICAgICAgaWYgKHJuZy5jaGFuY2UoMC4zNSkpIGFkZCh7IGlkOiBpZCgpLCBraW5kOiBcIndpcmVcIiwgYXQ6IGNlbGxzWzFdLCByb29tOiByLmlkLCBtb2RlOiBcInB1bHNlXCIsIG1vdW50OiBcImNlaWxpbmdcIiwgcGhhc2U6IHJuZygpICogNSwgY2VsbHM6IFtjZWxsc1sxXV0gfSk7XG4gICAgICAgIHJlc2VydmUoWy4uLmNlbGxzLCBjb250cm9sXSk7XG4gICAgICAgIHJvb21zVXNlZC5hZGQoci5pZCk7XG4gICAgICAgIHBsYWNlZCA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKHBsYWNlZCkgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgaWYgKGYuaW5kZXggPiAwICYmIHJuZy5jaGFuY2UoMC43NCkpIGZvciAoY29uc3QgciBvZiByb29tcyh3b29kUm9vbXMpKSB7XG4gICAgY29uc3QgYXQgPSByb29tQ2VsbHMocikuZmluZCgocCkgPT4gQ0FSRElOQUwuZmlsdGVyKChkKSA9PiBmcmVlKHNoaWZ0KHAsIGQpKSkubGVuZ3RoID49IDIgJiYgc2FmZShbcF0sIFtdKSk7XG4gICAgaWYgKCFhdCkgY29udGludWU7XG4gICAgYWRkKHsgaWQ6IGlkKCksIGtpbmQ6IFwid2Vha1wiLCBhdCB9KTtcbiAgICByZXNlcnZlKFthdF0pO1xuICAgIHJvb21zVXNlZC5hZGQoci5pZCk7XG4gICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZi5pbmRleCA9PT0gMCB8fCBybmcuY2hhbmNlKDAuNzUpKSB7XG4gICAgbGV0IHBsYWNlZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3QgciBvZiByb29tcyhbLi4ud29vZFJvb21zLCAuLi5tYWludGVuYW5jZV0pKSB7XG4gICAgICBmb3IgKGNvbnN0IGF0IG9mIHJvb21DZWxscyhyKSkge1xuICAgICAgICBmb3IgKGNvbnN0IGQgb2Ygc2h1ZmZsZWQoQ0FSRElOQUwpKSB7XG4gICAgICAgICAgY29uc3QgbGFuZGluZyA9IHNoaWZ0KGF0LCBkKTtcbiAgICAgICAgICBjb25zdCBzdGFuZCA9IHNoaWZ0KGF0LCB7IHg6IGQueSwgeTogLWQueCB9KTtcbiAgICAgICAgICBpZiAoIVtsYW5kaW5nLCBzdGFuZF0uZXZlcnkoKHApID0+IGZyZWUocCkgJiYgcm9vbUF0KHApPy5pZCA9PT0gci5pZCkgfHwgIXNhZmUoW2F0LCBsYW5kaW5nXSwgW3N0YW5kXSkpIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IGxvb3QgPSBybmcucGljazxMb290PihbXCJtZWRcIiwgXCJhbW1vXCIsIFwiYmF0dGVyeVwiLCBmLmluZGV4ID49IDQgPyBcInNoZWxsc1wiIDogXCJhbW1vXCJdKTtcbiAgICAgICAgICBjb25zdCBzdGFzaCA9IHsgLi4uY2FjaGUoci5pZCwgNCwgYXQsIGxvb3QsIGxvb3QgPT09IFwibWVkXCIgPyBcIm1lZGJveFwiIDogXCJzdXBwbHljYXNlXCIpLCBzb2xpZDogZmFsc2UgfTtcbiAgICAgICAgICBhZGQoeyBpZDogaWQoKSwga2luZDogXCJzaGVsZlwiLCBhdCwgbGFuZGluZywgc3RhbmQsIHN0YXNoIH0pO1xuICAgICAgICAgIHJlc2VydmUoW2F0LCBsYW5kaW5nLCBzdGFuZF0pO1xuICAgICAgICAgIHJvb21zVXNlZC5hZGQoci5pZCk7XG4gICAgICAgICAgcGxhY2VkID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBpZiAocGxhY2VkKSBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChwbGFjZWQpIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoY29uc3QgbWF0ZXJpYWwgb2YgW3JuZy5waWNrPFN1cmZhY2U+KFtcImdsYXNzXCIsIFwiY2Fuc1wiLCBcInBsYW5rc1wiXSksIHJuZy5waWNrPFN1cmZhY2U+KFtcImdsYXNzXCIsIFwiY2Fuc1wiLCBcInBsYW5rc1wiXSldKSB7XG4gICAgZm9yIChjb25zdCByIG9mIHJvb21zKG1hdGVyaWFsID09PSBcInBsYW5rc1wiID8gd29vZFJvb21zIDogW1wiS09SWVRBUlpcIiwgXCJQUkFMTklBXCIsIFwiS1VDSE5JQVwiLCBcIlNDSE9XRUtcIiwgXCJXQVJTWlRBVFwiXSkpIHtcbiAgICAgIGNvbnN0IGF0ID0gcm9vbUNlbGxzKHIpLmZpbmQoKHApID0+IHNhZmUoW3BdLCBbXSkpO1xuICAgICAgaWYgKCFhdCkgY29udGludWU7XG4gICAgICBjb25zdCBjZWxscyA9IFthdF07XG4gICAgICBjb25zdCBvdGhlciA9IHNodWZmbGVkKENBUkRJTkFMLm1hcCgoZCkgPT4gc2hpZnQoYXQsIGQpKSkuZmluZCgocCkgPT4gZnJlZShwKSAmJiByb29tQXQocCk/LmlkID09PSByLmlkICYmIHNhZmUoW2F0LCBwXSwgW10pKTtcbiAgICAgIGlmIChvdGhlcikgY2VsbHMucHVzaChvdGhlcik7XG4gICAgICBhZGQoeyBpZDogaWQoKSwga2luZDogXCJzdXJmYWNlXCIsIGF0LCBjZWxscywgbWF0ZXJpYWwgfSk7XG4gICAgICByZXNlcnZlKGNlbGxzKTtcbiAgICAgIHJvb21zVXNlZC5hZGQoci5pZCk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGY7XG59IiwgImltcG9ydCB7IGNlbnRlciwgc2FtZUNlbGwsIHR5cGUgQmxvY2tlZERvb3IsIHR5cGUgQ2VsbCwgdHlwZSBGZWF0dXJlLCB0eXBlIFNoZWxmLCB0eXBlIFN0ZWFtLCB0eXBlIFdpcmUgfSBmcm9tIFwiLi9lbnZpcm9ubWVudC1sYXlvdXRcIjtcbmltcG9ydCB7IFRJTEUsIFRpbGUgfSBmcm9tIFwiLi9wYWxldHRlXCI7XG5pbXBvcnQgdHlwZSB7IEZsb29yRGF0YSB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCB0eXBlIEVudmlyb25tZW50U291bmQgPSBcImFyY1wiIHwgXCJzaG9ja1wiIHwgXCJzd2l0Y2hcIiB8IFwic3RyYWluXCIgfCBcInNjcmFwZVwiIHwgXCJjcmFja1wiIHwgXCJjb2xsYXBzZVwiXG4gIHwgXCJoaXNzXCIgfCBcInN0ZWFtXCIgfCBcInZhbHZlXCIgfCBcImdsYXNzXCIgfCBcImNhbnNcIiB8IFwicGxhbmtzXCIgfCBcImZsYXJlXCI7XG5leHBvcnQgdHlwZSBTdGFnZSA9IFwiaWRsZVwiIHwgXCJ3YXJuaW5nXCIgfCBcInNldHRsZWRcIiB8IFwidmVudGluZ1wiO1xuZXhwb3J0IHR5cGUgQ3ljbGUgPSBcInNhZmVcIiB8IFwiY2hhcmdpbmdcIiB8IFwibGl2ZVwiIHwgXCJvZmZcIjtcblxuZXhwb3J0IGludGVyZmFjZSBGZWF0dXJlU3RhdGUgeyBzdGFnZTogU3RhZ2U7IHNpbmNlOiBudW1iZXI7IHByb2dyZXNzOiBudW1iZXI7IG9mZjogYm9vbGVhbiB9XG5leHBvcnQgaW50ZXJmYWNlIEVudmlyb25tZW50U3RhdGUgeyBjbG9jazogbnVtYmVyOyBmZWF0dXJlczogUmVjb3JkPG51bWJlciwgRmVhdHVyZVN0YXRlPiB9XG5leHBvcnQgaW50ZXJmYWNlIEJvdW5kcyB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3OiBudW1iZXI7IGg6IG51bWJlciB9XG5pbnRlcmZhY2UgQWN0b3IgZXh0ZW5kcyBDZWxsIHsgaWQ6IG51bWJlcjsgcmFkaXVzOiBudW1iZXIgfVxuaW50ZXJmYWNlIFBsYXllciBleHRlbmRzIEFjdG9yIHsgYnVzeTogYm9vbGVhbjsgaGlkZGVuOiBib29sZWFuIH1cblxuZXhwb3J0IGludGVyZmFjZSBFbnZpcm9ubWVudFdvcmxkIHtcbiAgcGxheWVyKCk6IFBsYXllcjtcbiAgYWN0b3JzKCk6IEFjdG9yW107XG4gIGNsZWFyKGZyb206IENlbGwsIHRvOiBDZWxsKTogYm9vbGVhbjtcbiAgY2hhbmdlZCgpOiB2b2lkO1xuICBoaXQoYWN0b3I6IEFjdG9yLCBkYW1hZ2U6IG51bWJlciwgZnJvbTogQ2VsbCk6IHZvaWQ7XG4gIGFsZXJ0KGF0OiBDZWxsLCB0aWxlczogbnVtYmVyKTogdm9pZDtcbiAgc291bmQoa2luZDogRW52aXJvbm1lbnRTb3VuZCwgYXQ6IENlbGwpOiB2b2lkO1xuICBkdXN0KGF0OiBDZWxsLCBjb2xvcjogc3RyaW5nLCBhbW91bnQ6IG51bWJlciwgc3BlZWQ6IG51bWJlciwgZ2xvdz86IGJvb2xlYW4pOiB2b2lkO1xuICBzaGFrZShhbW91bnQ6IG51bWJlcik6IHZvaWQ7XG4gIHNheSh0ZXh0OiBzdHJpbmcpOiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgV0FMTF9XQVJOSU5HID0gMjtcbmV4cG9ydCBjb25zdCBGTE9PUl9XQVJOSU5HID0gMS4wNTtcbmV4cG9ydCBjb25zdCBTSEVMRl9XQVJOSU5HID0gMS4xO1xuZXhwb3J0IGNvbnN0IEdBU19XQVJOSU5HID0gMS41NTtcbmV4cG9ydCBjb25zdCBHQVNfQ0xFQVIgPSAyLjg7XG5leHBvcnQgY29uc3QgV0FMTF9EVVNUID0gMS4xNTtcbmV4cG9ydCBjb25zdCBoZXJvSWQgPSAwO1xuXG5leHBvcnQgY29uc3QgRlVSTklUVVJFID0ge1xuICBjYWJpbmV0OiB7IHRleHQ6IFwicHJ6ZXN1XFx1MDE0NCBzemFmXFx1MDExOVwiLCB0aW1lOiAyLjcsIG5vaXNlOiA2LCBlZmZvcnQ6IDEyIH0sXG4gIGZyaWRnZTogeyB0ZXh0OiBcInByemVzdVxcdTAxNDQgbG9kXFx1MDBmM3drXFx1MDExOVwiLCB0aW1lOiAzLjYsIG5vaXNlOiA5LCBlZmZvcnQ6IDE1IH0sXG4gIGRyZXNzZXI6IHsgdGV4dDogXCJwcnplc3VcXHUwMTQ0IGtvbW9kXFx1MDExOVwiLCB0aW1lOiAxLjM1LCBub2lzZTogMywgZWZmb3J0OiA2IH0sXG4gIGJvb2tjYXNlOiB7IHRleHQ6IFwicHJ6ZXN1XFx1MDE0NCByZWdhXFx1MDE0MlwiLCB0aW1lOiAyLjA1LCBub2lzZTogNSwgZWZmb3J0OiA5IH0sXG4gIGJvYXJkczogeyB0ZXh0OiBcInpkZWptaWogZGVza2lcIiwgdGltZTogMi43NSwgbm9pc2U6IDUsIGVmZm9ydDogNyB9LFxuICB1cHR1cm5lZDogeyB0ZXh0OiBcIm9kc3VcXHUwMTQ0IHByemV3clxcdTAwZjNjb255IG1lYmVsXCIsIHRpbWU6IDEuOCwgbm9pc2U6IDQsIGVmZm9ydDogOCB9LFxufSBhcyBjb25zdDtcblxuZXhwb3J0IGNvbnN0IGNlbGxCb3VuZHMgPSAocDogQ2VsbCwgaW5zZXQgPSAwKTogQm91bmRzID0+ICh7IHg6IHAueCAqIFRJTEUgKyBpbnNldCwgeTogcC55ICogVElMRSArIGluc2V0LCB3OiBUSUxFIC0gaW5zZXQgKiAyLCBoOiBUSUxFIC0gaW5zZXQgKiAyIH0pO1xuY29uc3Qgb3ZlcmxhcCA9IChhOiBCb3VuZHMsIGI6IEJvdW5kcykgPT4gYS54IDwgYi54ICsgYi53ICYmIGEueCArIGEudyA+IGIueCAmJiBhLnkgPCBiLnkgKyBiLmggJiYgYS55ICsgYS5oID4gYi55O1xuY29uc3QgaW5zaWRlID0gKHA6IENlbGwsIHI6IEJvdW5kcykgPT4gcC54ID49IHIueCAmJiBwLnkgPj0gci55ICYmIHAueCA8IHIueCArIHIudyAmJiBwLnkgPCByLnkgKyByLmg7XG5jb25zdCBkaXN0YW5jZSA9IChhOiBDZWxsLCBiOiBDZWxsKSA9PiBNYXRoLmh5cG90KGEueCAtIGIueCwgYS55IC0gYi55KTtcbmNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuY29uc3QgbmV3UmVjb3JkID0gKCk6IEZlYXR1cmVTdGF0ZSA9PiAoeyBzdGFnZTogXCJpZGxlXCIsIHNpbmNlOiAwLCBwcm9ncmVzczogMCwgb2ZmOiBmYWxzZSB9KTtcblxuZnVuY3Rpb24gdG91Y2hlcyhwOiBDZWxsLCByYWRpdXM6IG51bWJlciwgcjogQm91bmRzKSB7XG4gIGNvbnN0IGR4ID0gcC54IC0gTWF0aC5tYXgoci54LCBNYXRoLm1pbihwLngsIHIueCArIHIudykpO1xuICBjb25zdCBkeSA9IHAueSAtIE1hdGgubWF4KHIueSwgTWF0aC5taW4ocC55LCByLnkgKyByLmgpKTtcbiAgcmV0dXJuIGR4ICogZHggKyBkeSAqIGR5IDwgcmFkaXVzICogcmFkaXVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRW52aXJvbm1lbnRTdGF0ZSgpOiBFbnZpcm9ubWVudFN0YXRlIHtcbiAgcmV0dXJuIHsgY2xvY2s6IDAsIGZlYXR1cmVzOiB7fSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3ljbGVGb3IoZjogV2lyZSB8IEV4dHJhY3Q8RmVhdHVyZSwgeyBraW5kOiBcInN0ZWFtXCIgfT4sIHN0YXRlOiBGZWF0dXJlU3RhdGUsIGNsb2NrOiBudW1iZXIpOiBDeWNsZSB7XG4gIGlmIChzdGF0ZS5vZmYpIHJldHVybiBcIm9mZlwiO1xuICBpZiAoZi5raW5kID09PSBcIndpcmVcIiAmJiBmLm1vZGUgIT09IFwicHVsc2VcIikgcmV0dXJuIFwibGl2ZVwiO1xuICBjb25zdCBzdGVhbSA9IGYua2luZCA9PT0gXCJzdGVhbVwiO1xuICBjb25zdCB0ID0gKGNsb2NrICsgZi5waGFzZSkgJSAoc3RlYW0gPyA2LjMgOiA1LjYpO1xuICBpZiAodCA8IChzdGVhbSA/IDMuNSA6IDMuMykpIHJldHVybiBcInNhZmVcIjtcbiAgaWYgKHQgPCAoc3RlYW0gPyA0Ljg1IDogNC41NSkpIHJldHVybiBcImNoYXJnaW5nXCI7XG4gIHJldHVybiBcImxpdmVcIjtcbn1cblxuLy8gQm90aCB0aGUgcmVuZGVyZXIgYW5kIGRhbWFnZSBjb2RlIHVzZSB0aGVzZSBleGFjdCByZWdpb25zIGluIHdvcmxkIHBpeGVscy5cbmV4cG9ydCBmdW5jdGlvbiBlZmZlY3RCb3VuZHMoZjogRmVhdHVyZSk6IEJvdW5kc1tdIHtcbiAgc3dpdGNoIChmLmtpbmQpIHtcbiAgICBjYXNlIFwid2lyZVwiOiByZXR1cm4gZi5jZWxscy5tYXAoKHApID0+IGNlbGxCb3VuZHMocCwgZi5tb2RlID09PSBcInBvb2xcIiA/IDAgOiAyKSk7XG4gICAgY2FzZSBcIndhbGxcIjogcmV0dXJuIGYubGFuZGluZy5tYXAoKHApID0+IGNlbGxCb3VuZHMocCkpO1xuICAgIGNhc2UgXCJzdGVhbVwiOiByZXR1cm4gZi5jZWxscy5tYXAoKHApID0+IHtcbiAgICAgIGNvbnN0IHIgPSBjZWxsQm91bmRzKHApO1xuICAgICAgcmV0dXJuIGYuaGVhZGluZy54ID8geyAuLi5yLCB5OiByLnkgKyAzLCBoOiByLmggLSA2IH0gOiB7IC4uLnIsIHg6IHIueCArIDMsIHc6IHIudyAtIDYgfTtcbiAgICB9KTtcbiAgICBjYXNlIFwiZ2FzXCI6IGNhc2UgXCJzdXJmYWNlXCI6IHJldHVybiBmLmNlbGxzLm1hcCgocCkgPT4gY2VsbEJvdW5kcyhwKSk7XG4gICAgY2FzZSBcInNoZWxmXCI6IHJldHVybiBbY2VsbEJvdW5kcyhmLmxhbmRpbmcpXTtcbiAgICBjYXNlIFwid2Vha1wiOiByZXR1cm4gW2NlbGxCb3VuZHMoZi5hdCldO1xuICAgIGRlZmF1bHQ6IHJldHVybiBbXTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZnVybml0dXJlQm91bmRzKGY6IEJsb2NrZWREb29yLCBwcm9ncmVzczogbnVtYmVyKTogQm91bmRzIHtcbiAgcmV0dXJuIHsgLi4uY2VsbEJvdW5kcyhmLmF0KSwgeDogbGVycChmLmF0LngsIGYucGFyay54LCBwcm9ncmVzcykgKiBUSUxFLCB5OiBsZXJwKGYuYXQueSwgZi5wYXJrLnksIHByb2dyZXNzKSAqIFRJTEUgfTtcbn1cblxudHlwZSBUYXJnZXQgPSB7IGZlYXR1cmU6IEZlYXR1cmU7IGF0OiBDZWxsOyBsYWJlbDogc3RyaW5nOyBob2xkOiBib29sZWFuOyBwcm9ncmVzczogbnVtYmVyIH07XG50eXBlIFdvcmsgPSB7IGlkOiBudW1iZXI7IGZhY2U6IENlbGw7IGVmZm9ydDogbnVtYmVyIH07XG5cbmV4cG9ydCBjbGFzcyBFbnZpcm9ubWVudCB7XG4gIHJlYWRvbmx5IGZlYXR1cmVzOiBGZWF0dXJlW107XG4gIHByaXZhdGUgcmVhZG9ubHkgamV0czogU3RlYW1bXTtcbiAgcHJpdmF0ZSByZWFkb25seSBzZWFsZWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGRhcmsgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSB6b25lcyA9IG5ldyBNYXA8bnVtYmVyLCBCb3VuZHNbXT4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBhZGphY2VuY3kgPSBuZXcgTWFwPG51bWJlciwgRmVhdHVyZVtdPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGVmZmVjdHMgPSBuZXcgTWFwPG51bWJlciwgeyBuZXh0OiBudW1iZXI7IHNsb3c6IG51bWJlciB9PigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGhlYXJkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBjeWNsZXMgPSBuZXcgTWFwPG51bWJlciwgQ3ljbGU+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgd2FybmVkID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIHByaXZhdGUgYmxvY2tlcnM6IEJvdW5kc1tdID0gW107XG4gIHByaXZhdGUgd29yazogV29yayB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZmxvb3I6IEZsb29yRGF0YSwgcmVhZG9ubHkgc3RhdGU6IEVudmlyb25tZW50U3RhdGUsIHByaXZhdGUgd29ybGQ6IEVudmlyb25tZW50V29ybGQpIHtcbiAgICB0aGlzLmZlYXR1cmVzID0gZmxvb3IuZW52aXJvbm1lbnQ/LmZlYXR1cmVzID8/IFtdO1xuICAgIHRoaXMuamV0cyA9IHRoaXMuZmVhdHVyZXMuZmlsdGVyKChmKSA9PiBmLmtpbmQgPT09IFwic3RlYW1cIik7XG4gICAgZm9yIChjb25zdCBhIG9mIGZsb29yLmVudmlyb25tZW50Py5hbm5leGVzID8/IFtdKSB7XG4gICAgICBpZiAoYS5zZWFsICE9PSBudWxsKSB0aGlzLnNlYWxlZC5zZXQoYS5yb29tLCBhLnNlYWwpO1xuICAgICAgZm9yIChjb25zdCBwIG9mIGEucHJvcHMpIGlmICghZmxvb3IucHJvcHMuc29tZSgocSkgPT4gcS5pZCA9PT0gcC5pZCkpIGZsb29yLnByb3BzLnB1c2goeyAuLi5wIH0pO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGYgb2YgdGhpcy5mZWF0dXJlcykge1xuICAgICAgaWYgKCFzdGF0ZS5mZWF0dXJlc1tmLmlkXSkgc3RhdGUuZmVhdHVyZXNbZi5pZF0gPSBuZXdSZWNvcmQoKTtcbiAgICAgIHRoaXMuem9uZXMuc2V0KGYuaWQsIGVmZmVjdEJvdW5kcyhmKSk7XG4gICAgICBpZiAoZi5raW5kID09PSBcIndpcmVcIiAmJiB0aGlzLnJlYWQoZikub2ZmKSB0aGlzLmRhcmsuYWRkKGYucm9vbSk7XG4gICAgICBpZiAoZi5raW5kID09PSBcInN1cmZhY2VcIikgZm9yIChjb25zdCBwIG9mIGYuY2VsbHMpIHtcbiAgICAgICAgY29uc3QgaSA9IHRoaXMuaWR4KHApO1xuICAgICAgICB0aGlzLmFkamFjZW5jeS5zZXQoaSwgWy4uLih0aGlzLmFkamFjZW5jeS5nZXQoaSkgPz8gW10pLCBmXSk7XG4gICAgICB9XG4gICAgICB0aGlzLmFwcGx5KGYpO1xuICAgIH1cbiAgICB0aGlzLnJlaW5kZXgoKTtcbiAgfVxuXG4gIGdldCBjbG9jaygpIHsgcmV0dXJuIHRoaXMuc3RhdGUuY2xvY2s7IH1cbiAgZ2V0IHdvcmtpbmcoKSB7IHJldHVybiB0aGlzLndvcms7IH1cbiAgcmVhZChmOiBGZWF0dXJlKSB7IHJldHVybiB0aGlzLnN0YXRlLmZlYXR1cmVzW2YuaWRdOyB9XG4gIGNhbmNlbFdvcmsoKSB7IHRoaXMud29yayA9IG51bGw7IH1cbiAgcm9vbURhcmsocm9vbTogbnVtYmVyKSB7IHJldHVybiB0aGlzLmRhcmsuaGFzKHJvb20pOyB9XG4gIHJvb21IaWRkZW4ocm9vbTogbnVtYmVyKSB7XG4gICAgY29uc3QgaWQgPSB0aGlzLnNlYWxlZC5nZXQocm9vbSk7XG4gICAgcmV0dXJuIGlkICE9PSB1bmRlZmluZWQgJiYgdGhpcy5zdGF0ZS5mZWF0dXJlc1tpZF0uc3RhZ2UgIT09IFwic2V0dGxlZFwiO1xuICB9XG5cbiAgcHJpdmF0ZSBpZHgocDogQ2VsbCkgeyByZXR1cm4gcC55ICogdGhpcy5mbG9vci53ICsgcC54OyB9XG4gIHByaXZhdGUgdGlsZShwOiBDZWxsKSB7IHJldHVybiB0aGlzLmZsb29yLnRpbGVzW3RoaXMuaWR4KHApXTsgfVxuXG4gIHByaXZhdGUgYXBwbHkoZjogRmVhdHVyZSkge1xuICAgIGlmICh0aGlzLnJlYWQoZikuc3RhZ2UgIT09IFwic2V0dGxlZFwiKSByZXR1cm47XG4gICAgc3dpdGNoIChmLmtpbmQpIHtcbiAgICAgIGNhc2UgXCJ3YWxsXCI6IHtcbiAgICAgICAgdGhpcy5mbG9vci50aWxlc1t0aGlzLmlkeChmLmF0KV0gPSBUaWxlLlJ1YmJsZTtcbiAgICAgICAgaWYgKCF0aGlzLmZsb29yLmJyZWFjaGVzLnNvbWUoKGIpID0+IHNhbWVDZWxsKGIsIGYuYXQpKSkgdGhpcy5mbG9vci5icmVhY2hlcy5wdXNoKGYuYXQpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJvYnN0cnVjdGlvblwiOiB7XG4gICAgICAgIGNvbnN0IGRvb3IgPSB0aGlzLmZsb29yLmRvb3JzLmZpbmQoKGQpID0+IHNhbWVDZWxsKGQsIGYuZ2F0ZSkpO1xuICAgICAgICBpZiAoZG9vcj8uc2VhbGVkKSB7XG4gICAgICAgICAgZG9vci5zZWFsZWQgPSBmYWxzZTtcbiAgICAgICAgICBkb29yLm9wZW4gPSB0cnVlO1xuICAgICAgICAgIHRoaXMuZmxvb3IudGlsZXNbdGhpcy5pZHgoZi5nYXRlKV0gPSBUaWxlLkRvb3JPcGVuO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcIndlYWtcIjogdGhpcy5mbG9vci50aWxlc1t0aGlzLmlkeChmLmF0KV0gPSBUaWxlLkhvbGU7IGJyZWFrO1xuICAgICAgY2FzZSBcInNoZWxmXCI6XG4gICAgICAgIGlmICghdGhpcy5mbG9vci5wcm9wcy5zb21lKChwKSA9PiBwLmlkID09PSBmLnN0YXNoLmlkKSkgdGhpcy5mbG9vci5wcm9wcy5wdXNoKHsgLi4uZi5zdGFzaCB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZWluZGV4KCkge1xuICAgIHRoaXMuYmxvY2tlcnMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGYgb2YgdGhpcy5mZWF0dXJlcykge1xuICAgICAgY29uc3QgcyA9IHRoaXMucmVhZChmKTtcbiAgICAgIGlmIChmLmtpbmQgPT09IFwib2JzdHJ1Y3Rpb25cIikgdGhpcy5ibG9ja2Vycy5wdXNoKGZ1cm5pdHVyZUJvdW5kcyhmLCBzLnByb2dyZXNzKSk7XG4gICAgICBpZiAoZi5raW5kID09PSBcInNoZWxmXCIpIHRoaXMuYmxvY2tlcnMucHVzaChjZWxsQm91bmRzKHMuc3RhZ2UgPT09IFwic2V0dGxlZFwiID8gZi5sYW5kaW5nIDogZi5hdCkpO1xuICAgIH1cbiAgfVxuXG4gIGJsb2Nrc1RpbGUoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICByZXR1cm4gdGhpcy5ibG9ja2Vycy5zb21lKChiKSA9PiBvdmVybGFwKGNlbGxCb3VuZHMoeyB4LCB5IH0pLCBiKSk7XG4gIH1cblxuICBibG9ja3NCb2R5KHg6IG51bWJlciwgeTogbnVtYmVyLCByYWRpdXM6IG51bWJlcikge1xuICAgIHJldHVybiB0aGlzLmJsb2NrZXJzLnNvbWUoKGIpID0+IHRvdWNoZXMoeyB4LCB5IH0sIHJhZGl1cywgYikpO1xuICB9XG5cbiAgc2xvdyhpZDogbnVtYmVyKSB7IHJldHVybiAodGhpcy5lZmZlY3RzLmdldChpZCk/LnNsb3cgPz8gMCkgPiB0aGlzLmNsb2NrOyB9XG5cbiAgaW5TdGVhbSh4OiBudW1iZXIsIHk6IG51bWJlcikge1xuICAgIHJldHVybiB0aGlzLmpldHMuc29tZSgoZikgPT4gY3ljbGVGb3IoZiwgdGhpcy5yZWFkKGYpLCB0aGlzLmNsb2NrKSA9PT0gXCJsaXZlXCIgJiYgdGhpcy56b25lQXQoZiwgeyB4LCB5IH0pKTtcbiAgfVxuXG4gIHByaXZhdGUgc3RhdHVzKGY6IEZlYXR1cmUsIHN0YWdlOiBTdGFnZSkge1xuICAgIGNvbnN0IHMgPSB0aGlzLnJlYWQoZik7XG4gICAgcy5zdGFnZSA9IHN0YWdlO1xuICAgIHMuc2luY2UgPSB0aGlzLmNsb2NrO1xuICB9XG5cbiAgcHJpdmF0ZSB6b25lQXQoZjogRmVhdHVyZSwgcDogQ2VsbCkge1xuICAgIGNvbnN0IHR4ID0gTWF0aC5mbG9vcihwLnggLyBUSUxFKSwgdHkgPSBNYXRoLmZsb29yKHAueSAvIFRJTEUpO1xuICAgIGNvbnN0IHRpbGUgPSB0aGlzLnRpbGUoeyB4OiB0eCwgeTogdHkgfSk7XG4gICAgaWYgKHR4IDwgMCB8fCB0eSA8IDAgfHwgdHggPj0gdGhpcy5mbG9vci53IHx8IHR5ID49IHRoaXMuZmxvb3IuaCB8fCB0aWxlID09PSBUaWxlLldhbGwgfHwgdGlsZSA9PT0gVGlsZS5Eb29yIHx8IHRpbGUgPT09IFRpbGUuV2luZG93IHx8IHRpbGUgPT09IFRpbGUuU2t5IHx8IHRpbGUgPT09IFRpbGUuSG9sZSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiAhIXRoaXMuem9uZXMuZ2V0KGYuaWQpPy5zb21lKChiKSA9PiBpbnNpZGUocCwgYikpO1xuICB9XG5cbiAgcHJpdmF0ZSBoaXQoYWN0b3I6IEFjdG9yLCBkYW1hZ2U6IG51bWJlciwgYXQ6IENlbGwsIGludGVydmFsOiBudW1iZXIsIHNsb3c6IG51bWJlcikge1xuICAgIGNvbnN0IGxhc3QgPSB0aGlzLmVmZmVjdHMuZ2V0KGFjdG9yLmlkKTtcbiAgICBpZiAobGFzdCAmJiB0aGlzLmNsb2NrIDwgbGFzdC5uZXh0KSByZXR1cm47XG4gICAgdGhpcy5lZmZlY3RzLnNldChhY3Rvci5pZCwgeyBuZXh0OiB0aGlzLmNsb2NrICsgaW50ZXJ2YWwsIHNsb3c6IE1hdGgubWF4KGxhc3Q/LnNsb3cgPz8gMCwgdGhpcy5jbG9jayArIHNsb3cpIH0pO1xuICAgIHRoaXMud29ybGQuaGl0KGFjdG9yLCBkYW1hZ2UsIGF0KTtcbiAgfVxuXG4gIHByaXZhdGUgaGl0Wm9uZShmOiBGZWF0dXJlLCBhY3RvcnM6IEFjdG9yW10sIGRhbWFnZTogbnVtYmVyLCBpbnRlcnZhbDogbnVtYmVyLCBzbG93OiBudW1iZXIpIHtcbiAgICBmb3IgKGNvbnN0IGEgb2YgYWN0b3JzKSBpZiAodGhpcy56b25lQXQoZiwgYSkpIHRoaXMuaGl0KGEsIGRhbWFnZSwgY2VudGVyKGYuYXQpLCBpbnRlcnZhbCwgc2xvdyk7XG4gIH1cblxuICBwcml2YXRlIHRhcmdldCgpOiBUYXJnZXQgfCBudWxsIHtcbiAgICBjb25zdCBwbGF5ZXIgPSB0aGlzLndvcmxkLnBsYXllcigpO1xuICAgIGlmIChwbGF5ZXIuaGlkZGVuIHx8IHBsYXllci5idXN5KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdDogVGFyZ2V0IHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHJhbmdlID0gMjA7XG4gICAgZm9yIChjb25zdCBmIG9mIHRoaXMuZmVhdHVyZXMpIHtcbiAgICAgIGNvbnN0IHMgPSB0aGlzLnJlYWQoZik7XG4gICAgICBsZXQgbG9jYXRpb246IENlbGwgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgdGV4dCA9IFwiXCI7XG4gICAgICBsZXQgaG9sZCA9IGZhbHNlO1xuICAgICAgaWYgKGYua2luZCA9PT0gXCJ3aXJlXCIgJiYgIXMub2ZmICYmIGYuY29udHJvbCkge1xuICAgICAgICBsb2NhdGlvbiA9IGYuY29udHJvbDsgdGV4dCA9IFwib2RcXHUwMTQyXFx1MDEwNWN6IG9id1xcdTAwZjNkXCI7XG4gICAgICB9IGVsc2UgaWYgKGYua2luZCA9PT0gXCJzdGVhbVwiICYmICFzLm9mZikge1xuICAgICAgICBsb2NhdGlvbiA9IGYuY29udHJvbDsgdGV4dCA9IFwiemFta25paiB6YXdcXHUwMGYzciBwYXJ5XCI7XG4gICAgICB9IGVsc2UgaWYgKGYua2luZCA9PT0gXCJnYXNcIiAmJiAhcy5vZmYgJiYgcy5zdGFnZSAhPT0gXCJzZXR0bGVkXCIpIHtcbiAgICAgICAgbG9jYXRpb24gPSBmLmNvbnRyb2w7IHRleHQgPSBcInphbWtuaWogemF3XFx1MDBmM3IgZ2F6dVwiO1xuICAgICAgfSBlbHNlIGlmIChmLmtpbmQgPT09IFwic2hlbGZcIiAmJiBzLnN0YWdlID09PSBcImlkbGVcIikge1xuICAgICAgICBsb2NhdGlvbiA9IGYuYXQ7IHRleHQgPSBcInByemV3clxcdTAwZjNcXHUwMTA3IHJlZ2FcXHUwMTQyXCI7XG4gICAgICB9IGVsc2UgaWYgKGYua2luZCA9PT0gXCJvYnN0cnVjdGlvblwiICYmIHMuc3RhZ2UgIT09IFwic2V0dGxlZFwiKSB7XG4gICAgICAgIGlmIChkaXN0YW5jZShwbGF5ZXIsIGNlbnRlcihmLnN0YW5kKSkgPj0gMTMpIGNvbnRpbnVlO1xuICAgICAgICBsb2NhdGlvbiA9IGYuYXQ7IHRleHQgPSBGVVJOSVRVUkVbZi5tYXRlcmlhbF0udGV4dDsgaG9sZCA9IHRydWU7XG4gICAgICB9XG4gICAgICBpZiAoIWxvY2F0aW9uKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGF0ID0gY2VudGVyKGxvY2F0aW9uKTtcbiAgICAgIGNvbnN0IGQgPSBkaXN0YW5jZShwbGF5ZXIsIGF0KTtcbiAgICAgIGlmIChkIDwgcmFuZ2UgJiYgdGhpcy53b3JsZC5jbGVhcihwbGF5ZXIsIGF0KSkge1xuICAgICAgICByYW5nZSA9IGQ7XG4gICAgICAgIGJlc3QgPSB7IGZlYXR1cmU6IGYsIGF0LCBsYWJlbDogdGV4dCwgaG9sZCwgcHJvZ3Jlc3M6IHMucHJvZ3Jlc3MgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGJlc3Q7XG4gIH1cblxuICBoaW50KCkge1xuICAgIGNvbnN0IHQgPSB0aGlzLnRhcmdldCgpO1xuICAgIHJldHVybiB0ID8geyBsYWJlbDogdC5sYWJlbCwgaG9sZDogdC5ob2xkLCBwcm9ncmVzczogdC5wcm9ncmVzcywgYWN0aXZlOiB0aGlzLndvcms/LmlkID09PSB0LmZlYXR1cmUuaWQgfSA6IG51bGw7XG4gIH1cblxuICB1c2UoKSB7XG4gICAgY29uc3QgdCA9IHRoaXMudGFyZ2V0KCk7XG4gICAgaWYgKCF0KSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgZiA9IHQuZmVhdHVyZTtcbiAgICBjb25zdCBzID0gdGhpcy5yZWFkKGYpO1xuICAgIGlmIChmLmtpbmQgPT09IFwid2lyZVwiKSB7XG4gICAgICBzLm9mZiA9IHRydWU7XG4gICAgICB0aGlzLmRhcmsuYWRkKGYucm9vbSk7XG4gICAgICB0aGlzLndvcmxkLnNvdW5kKFwic3dpdGNoXCIsIHQuYXQpO1xuICAgICAgdGhpcy53b3JsZC5zYXkoXCJPYndcXHUwMGYzZCBvZFxcdTAxNDJcXHUwMTA1Y3pvbnkuIExhbXB5IHcgdGVqIGN6XFx1MDExOVxcdTAxNWJjaSBibG9rdSB6Z2FzXFx1MDE0MnkuXCIpO1xuICAgIH0gZWxzZSBpZiAoZi5raW5kID09PSBcInN0ZWFtXCIpIHtcbiAgICAgIHMub2ZmID0gdHJ1ZTtcbiAgICAgIHRoaXMuc3RhdHVzKGYsIFwic2V0dGxlZFwiKTtcbiAgICAgIHRoaXMud29ybGQuc291bmQoXCJ2YWx2ZVwiLCB0LmF0KTtcbiAgICAgIHRoaXMud29ybGQuc2F5KFwiUGFyYSBvcGFkYS4gUHJ6ZWpcXHUwMTViY2llIGplc3QgYmV6cGllY3puZS5cIik7XG4gICAgfSBlbHNlIGlmIChmLmtpbmQgPT09IFwiZ2FzXCIpIHtcbiAgICAgIHMub2ZmID0gdHJ1ZTtcbiAgICAgIHRoaXMuc3RhdHVzKGYsIFwidmVudGluZ1wiKTtcbiAgICAgIHRoaXMud29ybGQuc291bmQoXCJ2YWx2ZVwiLCB0LmF0KTtcbiAgICAgIHRoaXMud29ybGQuc2F5KFwiWmF3XFx1MDBmM3IgemFta25pXFx1MDExOXR5LiBPcGFyeSBqZXN6Y3plIHNpXFx1MDExOSB1dHJ6eW11alxcdTAxMDUuXCIpO1xuICAgIH0gZWxzZSBpZiAoZi5raW5kID09PSBcInNoZWxmXCIpIHRoaXMudGlwU2hlbGYoZik7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICB1cGRhdGVXb3JrKGR0OiBudW1iZXIsIGhvbGRpbmc6IGJvb2xlYW4sIHN0YW1pbmE6IG51bWJlciwgdG9vbDogYm9vbGVhbik6IFdvcmsgfCBudWxsIHtcbiAgICB0aGlzLndvcmsgPSBudWxsO1xuICAgIGlmICghaG9sZGluZykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50YXJnZXQoKTtcbiAgICBpZiAoIXRhcmdldCB8fCB0YXJnZXQuZmVhdHVyZS5raW5kICE9PSBcIm9ic3RydWN0aW9uXCIpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGYgPSB0YXJnZXQuZmVhdHVyZSwgcyA9IHRoaXMucmVhZChmKSwgc3BlYyA9IEZVUk5JVFVSRVtmLm1hdGVyaWFsXTtcbiAgICBjb25zdCBwYWNlID0gKHN0YW1pbmEgPCAxOCA/IDAuNTUgOiAxKSAqIChmLm1hdGVyaWFsID09PSBcImJvYXJkc1wiICYmIHRvb2wgPyAxLjY1IDogMSk7XG4gICAgY29uc3QgbmV4dCA9IE1hdGgubWluKDEsIHMucHJvZ3Jlc3MgKyBkdCAqIHBhY2UgLyBzcGVjLnRpbWUpO1xuICAgIGNvbnN0IHBvc2UgPSBmdXJuaXR1cmVCb3VuZHMoZiwgbmV4dCk7XG4gICAgaWYgKHRoaXMud29ybGQuYWN0b3JzKCkuc29tZSgoYSkgPT4gdG91Y2hlcyhhLCBhLnJhZGl1cywgcG9zZSkpKSB7XG4gICAgICBpZiAodGhpcy5waW5nKGYsIDEuMikpIHRoaXMud29ybGQuc2F5KFwiQ29cXHUwMTViIGJsb2t1amUgbWllanNjZSwgdyBrdFxcdTAwZjNyZSBwcnplc3V3YXN6IHByemVzemtvZFxcdTAxMTkuXCIpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IHN0YWdlID0gTWF0aC5mbG9vcihzLnByb2dyZXNzICogMyk7XG4gICAgcy5wcm9ncmVzcyA9IG5leHQ7XG4gICAgdGhpcy5yZWluZGV4KCk7XG4gICAgdGhpcy53b3JrID0geyBpZDogZi5pZCwgZmFjZTogdGFyZ2V0LmF0LCBlZmZvcnQ6IHNwZWMuZWZmb3J0IH07XG4gICAgaWYgKChmLm1hdGVyaWFsID09PSBcImJvYXJkc1wiICYmIE1hdGguZmxvb3IobmV4dCAqIDMpID4gc3RhZ2UpIHx8IHRoaXMucGluZyhmLCAwLjQ4KSkge1xuICAgICAgdGhpcy53b3JsZC5zb3VuZChmLm1hdGVyaWFsID09PSBcImZyaWRnZVwiID8gXCJzY3JhcGVcIiA6IFwic3RyYWluXCIsIHRhcmdldC5hdCk7XG4gICAgICB0aGlzLndvcmxkLmFsZXJ0KGNlbnRlcihmLnN0YW5kKSwgc3BlYy5ub2lzZSk7XG4gICAgICB0aGlzLndvcmxkLmR1c3QoY2VudGVyKGYuYXQpLCBcIiNhMDhhNjlcIiwgZi5tYXRlcmlhbCA9PT0gXCJib2FyZHNcIiA/IDYgOiAzLCAyMik7XG4gICAgfVxuICAgIGlmIChuZXh0ID49IDEpIHtcbiAgICAgIHRoaXMuc3RhdHVzKGYsIFwic2V0dGxlZFwiKTtcbiAgICAgIHRoaXMuYXBwbHkoZik7XG4gICAgICB0aGlzLndvcmxkLmNoYW5nZWQoKTtcbiAgICAgIHRoaXMud29ybGQuc291bmQoXCJzd2l0Y2hcIiwgY2VudGVyKGYuZ2F0ZSkpO1xuICAgICAgdGhpcy53b3JsZC5zYXkoXCJQcnplalxcdTAxNWJjaWUgb2RzXFx1MDE0Mm9uaVxcdTAxMTl0ZS4gWmEgZHJ6d2lhbWkgamVzdCBqZXN6Y3plIGplZGVuIHBva1xcdTAwZjNqLlwiKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMud29yaztcbiAgfVxuXG4gIHByaXZhdGUgcGluZyhmOiBGZWF0dXJlLCBpbnRlcnZhbDogbnVtYmVyKSB7XG4gICAgaWYgKCh0aGlzLmhlYXJkLmdldChmLmlkKSA/PyAtSW5maW5pdHkpID4gdGhpcy5jbG9jaykgcmV0dXJuIGZhbHNlO1xuICAgIHRoaXMuaGVhcmQuc2V0KGYuaWQsIHRoaXMuY2xvY2sgKyBpbnRlcnZhbCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIHRpcFNoZWxmKGY6IFNoZWxmKSB7XG4gICAgdGhpcy5zdGF0dXMoZiwgXCJ3YXJuaW5nXCIpO1xuICAgIHRoaXMud29ybGQuc291bmQoXCJzdHJhaW5cIiwgY2VudGVyKGYuYXQpKTtcbiAgICB0aGlzLndvcmxkLnNheShcIlJlZ2FcXHUwMTQyIHNpXFx1MDExOSBwcnplY2h5bGEuIE9kc3VcXHUwMTQ0IHNpXFx1MDExOSB6IGRyb2dpIVwiKTtcbiAgfVxuXG4gIHN0cmlrZShhaW06IG51bWJlciwgcmVhY2g6IG51bWJlcikge1xuICAgIGNvbnN0IHAgPSB0aGlzLndvcmxkLnBsYXllcigpO1xuICAgIGZvciAoY29uc3QgZiBvZiB0aGlzLmZlYXR1cmVzKSB7XG4gICAgICBpZiAoZi5raW5kICE9PSBcInNoZWxmXCIgfHwgdGhpcy5yZWFkKGYpLnN0YWdlICE9PSBcImlkbGVcIikgY29udGludWU7XG4gICAgICBjb25zdCBhdCA9IGNlbnRlcihmLmF0KTtcbiAgICAgIGNvbnN0IGFuZyA9IE1hdGguYXRhbjIoYXQueSAtIHAueSwgYXQueCAtIHAueCkgLSBhaW07XG4gICAgICBpZiAoZGlzdGFuY2UoYXQsIHApID4gcmVhY2ggKyA0IHx8IE1hdGguY29zKGFuZykgPCAwLjY1IHx8ICF0aGlzLndvcmxkLmNsZWFyKHAsIGF0KSkgY29udGludWU7XG4gICAgICB0aGlzLnRpcFNoZWxmKGYpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGZvb3RzdGVwKHA6IENlbGwsIHNwcmludDogYm9vbGVhbikge1xuICAgIGNvbnN0IGtleSA9IHRoaXMuaWR4KHsgeDogTWF0aC5mbG9vcihwLnggLyBUSUxFKSwgeTogTWF0aC5mbG9vcihwLnkgLyBUSUxFKSB9KTtcbiAgICBmb3IgKGNvbnN0IGYgb2YgdGhpcy5hZGphY2VuY3kuZ2V0KGtleSkgPz8gW10pIHtcbiAgICAgIGlmIChmLmtpbmQgIT09IFwic3VyZmFjZVwiIHx8ICF0aGlzLnpvbmVBdChmLCBwKSB8fCAhdGhpcy5waW5nKGYsIHNwcmludCA/IDAuMjggOiAwLjQyKSkgY29udGludWU7XG4gICAgICBjb25zdCBzID0gdGhpcy5yZWFkKGYpO1xuICAgICAgcy5wcm9ncmVzcyA9IE1hdGgubWluKDEsIHMucHJvZ3Jlc3MgKyAoc3ByaW50ID8gMC40IDogMC4xOSkpO1xuICAgICAgcy5zaW5jZSA9IHRoaXMuY2xvY2s7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGYubWF0ZXJpYWwgPT09IFwiY2Fuc1wiID8gKHNwcmludCA/IDkgOiA0KSA6IGYubWF0ZXJpYWwgPT09IFwicGxhbmtzXCIgPyAoc3ByaW50ID8gNyA6IDEuNykgOiAoc3ByaW50ID8gNyA6IDIuNCk7XG4gICAgICB0aGlzLndvcmxkLnNvdW5kKGYubWF0ZXJpYWwsIHApO1xuICAgICAgdGhpcy53b3JsZC5hbGVydChwLCBkaXN0YW5jZSk7XG4gICAgICB0aGlzLndvcmxkLmR1c3QocCwgZi5tYXRlcmlhbCA9PT0gXCJnbGFzc1wiID8gXCIjYmZkNWQ0XCIgOiBcIiNhYTk1NzNcIiwgc3ByaW50ID8gNyA6IDMsIDMyKTtcbiAgICAgIGlmIChzcHJpbnQgJiYgZi5tYXRlcmlhbCA9PT0gXCJnbGFzc1wiKSB0aGlzLmhpdCh0aGlzLndvcmxkLnBsYXllcigpLCA0LCBwLCAxLjM1LCAwLjE2KTtcbiAgICB9XG4gIH1cblxuICBpZ25pdGUoYXQ6IENlbGwpIHtcbiAgICBmb3IgKGNvbnN0IGYgb2YgdGhpcy5mZWF0dXJlcykge1xuICAgICAgaWYgKGYua2luZCAhPT0gXCJnYXNcIiB8fCB0aGlzLnJlYWQoZikuc3RhZ2UgIT09IFwiaWRsZVwiIHx8ICF0aGlzLnpvbmVBdChmLCBhdCkpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5zdGF0dXMoZiwgXCJ3YXJuaW5nXCIpO1xuICAgICAgdGhpcy53b3JsZC5zb3VuZChcImhpc3NcIiwgY2VudGVyKGYuYXQpKTtcbiAgICAgIGlmIChkaXN0YW5jZSh0aGlzLndvcmxkLnBsYXllcigpLCBjZW50ZXIoZi5hdCkpIDwgNSAqIFRJTEUpIHRoaXMud29ybGQuc2F5KFwiQ3p1XFx1MDEwNyBnYXouIE9wYXJ5IHphY3p5bmFqXFx1MDEwNSBzaVxcdTAxMTkgemFwYWxhXFx1MDEwNyFcIik7XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlKGR0OiBudW1iZXIpIHtcbiAgICB0aGlzLnN0YXRlLmNsb2NrICs9IGR0O1xuICAgIGlmICghdGhpcy5mZWF0dXJlcy5sZW5ndGgpIHJldHVybjtcbiAgICBjb25zdCBwID0gdGhpcy53b3JsZC5wbGF5ZXIoKTtcbiAgICBjb25zdCBhY3RvcnMgPSB0aGlzLndvcmxkLmFjdG9ycygpO1xuICAgIGZvciAoY29uc3QgZiBvZiB0aGlzLmZlYXR1cmVzKSB7XG4gICAgICBjb25zdCBzID0gdGhpcy5yZWFkKGYpO1xuICAgICAgY29uc3QgYXQgPSBjZW50ZXIoZi5hdCk7XG4gICAgICBjb25zdCBuZWFyID0gZGlzdGFuY2UoYXQsIHApIDwgVElMRSAqIDc7XG4gICAgICBjb25zdCBhZ2UgPSB0aGlzLmNsb2NrIC0gcy5zaW5jZTtcbiAgICAgIHN3aXRjaCAoZi5raW5kKSB7XG4gICAgICAgIGNhc2UgXCJ3aXJlXCI6IGNhc2UgXCJzdGVhbVwiOiB7XG4gICAgICAgICAgY29uc3QgY3ljbGUgPSBjeWNsZUZvcihmLCBzLCB0aGlzLmNsb2NrKTtcbiAgICAgICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuY3ljbGVzLmdldChmLmlkKTtcbiAgICAgICAgICB0aGlzLmN5Y2xlcy5zZXQoZi5pZCwgY3ljbGUpO1xuICAgICAgICAgIGlmIChuZWFyICYmIGN5Y2xlID09PSBcImNoYXJnaW5nXCIgJiYgcHJldmlvdXMgIT09IGN5Y2xlKSB0aGlzLndvcmxkLnNvdW5kKGYua2luZCA9PT0gXCJ3aXJlXCIgPyBcImFyY1wiIDogXCJoaXNzXCIsIGF0KTtcbiAgICAgICAgICBpZiAoY3ljbGUgIT09IFwibGl2ZVwiKSBicmVhaztcbiAgICAgICAgICBpZiAobmVhciAmJiAocHJldmlvdXMgIT09IFwibGl2ZVwiIHx8IChmLmtpbmQgPT09IFwid2lyZVwiICYmIHRoaXMucGluZyhmLCAxLjEyKSkpKSB0aGlzLndvcmxkLnNvdW5kKGYua2luZCA9PT0gXCJ3aXJlXCIgPyBcInNob2NrXCIgOiBcInN0ZWFtXCIsIGF0KTtcbiAgICAgICAgICB0aGlzLmhpdFpvbmUoZiwgYWN0b3JzLCBmLmtpbmQgPT09IFwid2lyZVwiID8gKGYubW9kZSA9PT0gXCJwdWxzZVwiID8gMTYgOiAxMSkgOiA5LCBmLmtpbmQgPT09IFwid2lyZVwiID8gMS4xNSA6IDAuOSwgZi5raW5kID09PSBcIndpcmVcIiA/IDAuOCA6IDAuNDIpO1xuICAgICAgICAgIGlmIChmLmtpbmQgPT09IFwid2lyZVwiICYmIGYubW9kZSA9PT0gXCJwdWxzZVwiKSB0aGlzLmlnbml0ZShhdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcIndhbGxcIjoge1xuICAgICAgICAgIGNvbnN0IGZhY2UgPSBjZW50ZXIoZi5mcm9udCk7XG4gICAgICAgICAgY29uc3Qgb3V0d2FyZFggPSBmLmZyb250LnggLSBmLmF0LngsIG91dHdhcmRZID0gZi5mcm9udC55IC0gZi5hdC55O1xuICAgICAgICAgIGlmIChzLnN0YWdlID09PSBcImlkbGVcIiAmJiAhcC5oaWRkZW4gJiYgZGlzdGFuY2UocCwgZmFjZSkgPCAxOCAmJiAocC54IC0gYXQueCkgKiBvdXR3YXJkWCArIChwLnkgLSBhdC55KSAqIG91dHdhcmRZID4gVElMRSAqIDAuNTUgJiYgdGhpcy53b3JsZC5jbGVhcihwLCBmYWNlKSkge1xuICAgICAgICAgICAgdGhpcy5zdGF0dXMoZiwgXCJ3YXJuaW5nXCIpO1xuICAgICAgICAgICAgdGhpcy53b3JsZC5zb3VuZChcImNyYWNrXCIsIGZhY2UpO1xuICAgICAgICAgICAgdGhpcy53b3JsZC5zYXkoXCJUeW5rIHNpXFx1MDExOSBzeXBpZS4gQ29mbmlqIHNpXFx1MDExOSBvZCBcXHUwMTViY2lhbnkhXCIpO1xuICAgICAgICAgIH0gZWxzZSBpZiAocy5zdGFnZSA9PT0gXCJ3YXJuaW5nXCIpIHtcbiAgICAgICAgICAgIGlmIChhZ2UgPj0gV0FMTF9XQVJOSU5HKSB7XG4gICAgICAgICAgICAgIHRoaXMuaGl0Wm9uZShmLCBhY3RvcnMsIDI2LCAwLjgsIDAuNDgpO1xuICAgICAgICAgICAgICB0aGlzLnNldHRsZShmLCBmYWNlLCAxMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5lYXIgJiYgdGhpcy5waW5nKGYsIDAuNDggLSBhZ2UgKiAwLjEzKSkge1xuICAgICAgICAgICAgICB0aGlzLndvcmxkLnNvdW5kKFwiY3JhY2tcIiwgZmFjZSk7XG4gICAgICAgICAgICAgIHRoaXMud29ybGQuZHVzdChmYWNlLCBcIiNjNmFkOTBcIiwgMywgMjIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwid2Vha1wiOlxuICAgICAgICAgIGlmIChzLnN0YWdlID09PSBcImlkbGVcIiAmJiAhcC5oaWRkZW4gJiYgdGhpcy56b25lQXQoZiwgcCkpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhdHVzKGYsIFwid2FybmluZ1wiKTtcbiAgICAgICAgICAgIHRoaXMud29ybGQuc291bmQoXCJwbGFua3NcIiwgYXQpO1xuICAgICAgICAgICAgdGhpcy53b3JsZC5zYXkoXCJQb2RcXHUwMTQyb2dhIHVnaW5hIHNpXFx1MDExOS4gWmVqZFxcdTAxN2EgeiBkZXNlayFcIik7XG4gICAgICAgICAgfSBlbHNlIGlmIChzLnN0YWdlID09PSBcIndhcm5pbmdcIiAmJiBhZ2UgPj0gRkxPT1JfV0FSTklORykge1xuICAgICAgICAgICAgdGhpcy5oaXRab25lKGYsIGFjdG9ycywgMTYsIDAuOTUsIDEuMTUpO1xuICAgICAgICAgICAgY29uc3QgYXJvdW5kID0gW3sgeDogYXQueCArIFRJTEUsIHk6IGF0LnkgfSwgeyB4OiBhdC54IC0gVElMRSwgeTogYXQueSB9LCB7IHg6IGF0LngsIHk6IGF0LnkgKyBUSUxFIH0sIHsgeDogYXQueCwgeTogYXQueSAtIFRJTEUgfV07XG4gICAgICAgICAgICBjb25zdCBoZWFyZEF0ID0gYXJvdW5kLmZpbmQoKHEpID0+IHRoaXMud29ybGQuY2xlYXIoYXQsIHEpKSA/PyBhdDtcbiAgICAgICAgICAgIHRoaXMuc2V0dGxlKGYsIGhlYXJkQXQsIDYpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInNoZWxmXCI6XG4gICAgICAgICAgaWYgKHMuc3RhZ2UgPT09IFwid2FybmluZ1wiICYmIGFnZSA+PSBTSEVMRl9XQVJOSU5HKSB7XG4gICAgICAgICAgICB0aGlzLmhpdFpvbmUoZiwgYWN0b3JzLCAzMiwgMC44LCAwLjYyKTtcbiAgICAgICAgICAgIHRoaXMuc2V0dGxlKGYsIGF0LCA4KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJnYXNcIjpcbiAgICAgICAgICBpZiAocy5zdGFnZSA9PT0gXCJpZGxlXCIgJiYgIXAuaGlkZGVuICYmIGRpc3RhbmNlKGF0LCBwKSA8IDIuNSAqIFRJTEUgJiYgdGhpcy53b3JsZC5jbGVhcihwLCBhdCkpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy53YXJuZWQuaGFzKGYuaWQpKSB7XG4gICAgICAgICAgICAgIHRoaXMud2FybmVkLmFkZChmLmlkKTtcbiAgICAgICAgICAgICAgdGhpcy53b3JsZC5zYXkoXCJDenVcXHUwMTA3IGdhei4gUG9zenVrYWogemF3b3J1IGFsYm8gb21pXFx1MDE0NCBvcGFyeS5cIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5waW5nKGYsIDIuMSkpIHRoaXMud29ybGQuc291bmQoXCJoaXNzXCIsIGF0KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHMuc3RhZ2UgPT09IFwid2FybmluZ1wiICYmIGFnZSA+PSBHQVNfV0FSTklORykge1xuICAgICAgICAgICAgdGhpcy5oaXRab25lKGYsIGFjdG9ycywgMjQsIDAuODUsIDAuNDQpO1xuICAgICAgICAgICAgdGhpcy5zdGF0dXMoZiwgXCJzZXR0bGVkXCIpO1xuICAgICAgICAgICAgdGhpcy53b3JsZC5zb3VuZChcImZsYXJlXCIsIGF0KTtcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWxlcnQoYXQsIDEwKTtcbiAgICAgICAgICAgIGlmIChuZWFyKSB0aGlzLndvcmxkLnNoYWtlKDIuOCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChzLnN0YWdlID09PSBcInZlbnRpbmdcIiAmJiBhZ2UgPj0gR0FTX0NMRUFSKSB0aGlzLnN0YXR1cyhmLCBcInNldHRsZWRcIik7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzZXR0bGUoZjogRmVhdHVyZSwgbm9pc2VBdDogQ2VsbCwgcmFkaXVzOiBudW1iZXIpIHtcbiAgICB0aGlzLnN0YXR1cyhmLCBcInNldHRsZWRcIik7XG4gICAgdGhpcy5hcHBseShmKTtcbiAgICB0aGlzLnJlaW5kZXgoKTtcbiAgICB0aGlzLndvcmxkLmNoYW5nZWQoKTtcbiAgICB0aGlzLndvcmxkLmFsZXJ0KG5vaXNlQXQsIHJhZGl1cyk7XG4gICAgdGhpcy53b3JsZC5zb3VuZChcImNvbGxhcHNlXCIsIG5vaXNlQXQpO1xuICAgIGlmIChkaXN0YW5jZSh0aGlzLndvcmxkLnBsYXllcigpLCBub2lzZUF0KSA8IDcgKiBUSUxFKSB0aGlzLndvcmxkLnNoYWtlKGYua2luZCA9PT0gXCJ3YWxsXCIgPyAzLjMgOiAyLjEpO1xuICB9XG5cbiAgbWFya2VycygpIHtcbiAgICByZXR1cm4gdGhpcy5mZWF0dXJlcy5mbGF0TWFwKChmKSA9PiB7XG4gICAgICBjb25zdCBzID0gdGhpcy5yZWFkKGYpO1xuICAgICAgaWYgKGYua2luZCA9PT0gXCJ3YWxsXCIgJiYgcy5zdGFnZSA9PT0gXCJzZXR0bGVkXCIpIHJldHVybiBbeyBhdDogZi5hdCwgY29sb3I6IFwiI2M5OWI3MFwiIH1dO1xuICAgICAgaWYgKGYua2luZCA9PT0gXCJ3aXJlXCIgfHwgZi5raW5kID09PSBcInN0ZWFtXCIgfHwgZi5raW5kID09PSBcImdhc1wiKSB7XG4gICAgICAgIHJldHVybiBmLmNvbnRyb2wgJiYgIXMub2ZmICYmIHMuc3RhZ2UgIT09IFwic2V0dGxlZFwiID8gW3sgYXQ6IGYuY29udHJvbCwgY29sb3I6IFwiIzgzYmZjMFwiIH1dIDogW107XG4gICAgICB9XG4gICAgICByZXR1cm4gW107XG4gICAgfSk7XG4gIH1cbn0iLCAiaW1wb3J0IHsgVElMRSwgVGlsZSB9IGZyb20gXCIuL3BhbGV0dGVcIjtcbmltcG9ydCB7IG1ha2VSbmcgfSBmcm9tIFwiLi9ybmdcIjtcbmltcG9ydCB0eXBlIHsgRmxvb3JEYXRhLCBSb29tIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDZWxsIHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVxuXG5leHBvcnQgdHlwZSBWZXJ0aWNhbFF1ZXN0S2luZCA9XG4gIHwgXCJyZXBhaXItbGlmdFwiXG4gIHwgXCJicm9rZW4tc3RhaXJzXCJcbiAgfCBcImZsb29kZWQtcm91dGVcIlxuICB8IFwibHVyZS1ob3JkZVwiXG4gIHwgXCJzZXJ2aWNlLXNoYWZ0XCJcbiAgfCBcImFwYXJ0bWVudC1ieXBhc3NcIjtcblxuZXhwb3J0IHR5cGUgRWxldmF0b3JWYXJpYW50ID0gXCJyb3V0aW5lXCIgfCBcInJhdHRsZVwiIHwgXCJzdG9wXCIgfCBcInRocmVhdFwiIHwgXCJtaWQtc2hhZnRcIiB8IFwiZmF1bHRcIjtcblxuZXhwb3J0IHR5cGUgTGFuZGluZ0ZlYXR1cmVLaW5kID0gXCJlbXB0eVwiIHwgXCJ3aW5kb3dcIiB8IFwic3Rhc2hcIiB8IFwib2JzdGFjbGVcIiB8IFwidHJhY2VzXCIgfCBcImJyb2tlbi1mbGlnaHRcIjtcblxuZXhwb3J0IGludGVyZmFjZSBMaWZ0TGFuZGluZyB7XG4gIHJvb206IG51bWJlcjtcbiAgY2VsbHM6IENlbGxbXTtcbiAgZG9vcjogQ2VsbDtcbiAgY2FsbDogQ2VsbDtcbiAgcGFuZWw6IENlbGw7XG4gIGNlbnRlcjogQ2VsbDtcbiAgb3V0c2lkZTogQ2VsbDtcbiAgbGFiZWw6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBMYWRkZXJMYW5kaW5nIHtcbiAgcm9vbTogbnVtYmVyO1xuICBjZWxsczogQ2VsbFtdO1xuICBkb29yOiBDZWxsO1xuICBwYW5lbDogQ2VsbDtcbiAgY2VudGVyOiBDZWxsO1xuICBvdXRzaWRlOiBDZWxsO1xuICBsYWJlbDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0YWlyQkxhbmRpbmcge1xuICByb29tOiBudW1iZXI7XG4gIGNlbGxzOiBDZWxsW107XG4gIGRvb3I6IENlbGw7XG4gIHN0YWlyczogQ2VsbDtcbiAgY2VudGVyOiBDZWxsO1xuICBvdXRzaWRlOiBDZWxsO1xuICBsYWJlbDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZlcnRpY2FsUXVlc3RQbGFuIHtcbiAga2luZDogVmVydGljYWxRdWVzdEtpbmQ7XG4gIHdpcmVJZD86IG51bWJlcjtcbiAgc3RlYW1JZD86IG51bWJlcjtcbiAgLyoqIE5vbi1ibG9ja2luZyBpbnRlcmFjdGFibGUgdGlsZSBmb3IgcGlja2luZyB1cCBmdXNlIC8gcmVhZGluZyBjb2RlIC8gYWN0aXZhdGluZyBsdXJlIC8gcmVhZGluZyBwbGFuLiAqL1xuICBjbHVlQ2VsbD86IENlbGw7XG4gIGNsdWVSb29tPzogbnVtYmVyO1xuICBjbHVlTGFiZWw/OiBzdHJpbmc7XG4gIGNvZGU/OiBzdHJpbmc7XG4gIGZ1c2VDZWxsPzogQ2VsbDtcbiAgZnVzZVJvb20/OiBudW1iZXI7XG4gIGJlYWNvbj86IENlbGw7XG4gIGhvcmRlPzogQ2VsbFtdO1xuICAvKiogRm9yIGFwYXJ0bWVudC1ieXBhc3M6IGFuIG9ic3RhY2xlIGNlbGwgaW5zaWRlIHRoZSB3aW5nIGxlYWRpbmcgdG93YXJkIEtsYXRrYSBCLiAqL1xuICBieXBhc3NDZWxsPzogQ2VsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWZXJ0aWNhbEZsb29yIHtcbiAgc3RhaXJ3ZWxsOiBzdHJpbmc7XG4gIHN0YWlyc1VwOiBDZWxsIHwgbnVsbDtcbiAgc3RhaXJzRG93bjogQ2VsbCB8IG51bGw7XG4gIGVsZXZhdG9yOiBMaWZ0TGFuZGluZyB8IG51bGw7XG4gIHNlcnZpY2U6IExhZGRlckxhbmRpbmcgfCBudWxsO1xuICBzdGFpcnNCOiBTdGFpckJMYW5kaW5nIHwgbnVsbDtcbiAgbGFuZGluZ0ZlYXR1cmU6IExhbmRpbmdGZWF0dXJlS2luZDtcbiAgbGFuZGluZ0hhc0xvb3Q6IGJvb2xlYW47XG4gIGxhbmRpbmdTb3VuZEhpbnQ6IGJvb2xlYW47XG4gIHF1ZXN0OiBWZXJ0aWNhbFF1ZXN0UGxhbiB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlmdFJpZGUge1xuICBmcm9tOiBudW1iZXI7XG4gIHRvOiBudW1iZXI7XG4gIGVsYXBzZWQ6IG51bWJlcjtcbiAgcGhhc2U6IFwiZG9vcnNcIiB8IFwiYWNjZWxcIiB8IFwibW92aW5nXCIgfCBcImpvbHRcIiB8IFwic3RyYW5kZWRcIiB8IFwiZXNjYXBlXCIgfCBcImFycml2ZVwiIHwgXCJzdG9wXCIgfCBcImxlZGdlXCI7XG4gIHZhcmlhbnQ6IEVsZXZhdG9yVmFyaWFudDtcbiAgY2FiaW5YOiBudW1iZXI7XG4gIGNhYmluWTogbnVtYmVyO1xuICBzdG9wRmxvb3I/OiBudW1iZXI7XG4gIGRvb3JPcGVuOiBudW1iZXI7XG4gIGxldmVyUHJvZ3Jlc3M6IG51bWJlcjtcbiAgdGhyZWF0V2FybmVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQYXNzYWdlU3RhdGUge1xuICBmcm9tOiBudW1iZXI7XG4gIHRvOiBudW1iZXI7XG4gIHJvdXRlOiBcInN0YWlyc0FcIiB8IFwic3RhaXJzQlwiIHwgXCJzZXJ2aWNlXCIgfCBcImxlZGdlXCI7XG4gIC8qKiBMb2NhbCBjb29yZGluYXRlcyBpbnNpZGUgdGhlIHBsYXlhYmxlIGludGVybWVkaWF0ZSBzcGFjZS4gKi9cbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIGZlYXR1cmU6IExhbmRpbmdGZWF0dXJlS2luZDtcbiAgc3Rhc2hMb290ZWQ6IGJvb2xlYW47XG4gIGJ5cGFzc1Byb2dyZXNzOiBudW1iZXI7XG4gIGJ5cGFzc09wZW46IGJvb2xlYW47XG4gIHNvdW5kUGxheWVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZsb29yUXVlc3RTdGF0ZSB7XG4gIHN0YWdlOiBudW1iZXI7XG4gIGluc3BlY3RlZDogYm9vbGVhbjtcbiAgZnVzZVRha2VuOiBib29sZWFuO1xuICBjb2RlRm91bmQ6IGJvb2xlYW47XG4gIHNlcnZpY2VVbmxvY2tlZDogYm9vbGVhbjtcbiAgc2VydmljZUZvcmNlZDogYm9vbGVhbjtcbiAgbHVyZVVzZWQ6IGJvb2xlYW47XG4gIGx1cmVSZXNvbHZlZDogYm9vbGVhbjtcbiAgYnlwYXNzUHJvZ3Jlc3M6IG51bWJlcjtcbiAgYnlwYXNzT3BlbjogYm9vbGVhbjtcbiAgbGFuZGluZ0J5cGFzc09wZW46IGJvb2xlYW47XG4gIGxhbmRpbmdTdGFzaE9wZW5lZDogYm9vbGVhbjtcbiAgcmVzb2x2ZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRpbmdTdGF0ZSB7XG4gIGVsZXZhdG9yUG93ZXJlZDogYm9vbGVhbjtcbiAgZWxldmF0b3JFbWVyZ2VuY3lPbmx5OiBib29sZWFuO1xuICBlbGV2YXRvckZsb29yOiBudW1iZXI7XG4gIGVsZXZhdG9yT3BlbkZsb29yOiBudW1iZXIgfCBudWxsO1xuICBlbGV2YXRvckJyb2tlbjogYm9vbGVhbjtcbiAgZWxldmF0b3JGYXVsdFVzZWQ6IGJvb2xlYW47XG4gIGVsZXZhdG9yU3BlY2lhbENvdW50OiBudW1iZXI7XG4gIGVsZXZhdG9yQXJyaXZhbDogbnVtYmVyO1xuICBlbGV2YXRvckNhbGxGbG9vcjogbnVtYmVyO1xuICBlbGV2YXRvclJpZGU6IExpZnRSaWRlIHwgbnVsbDtcbiAgcGFzc2FnZTogUGFzc2FnZVN0YXRlIHwgbnVsbDtcbiAgcXVlc3RzOiBSZWNvcmQ8bnVtYmVyLCBGbG9vclF1ZXN0U3RhdGU+O1xuICBucGNUb3RhbDogbnVtYmVyO1xuICBucGNEcm91Z2h0OiBudW1iZXI7XG4gIG5leHROcGNBdDogbnVtYmVyO1xuICBqb3VybmFsOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBCdWlsZGluZ1BsYW4ge1xuICBzdGFpcndlbGxOYW1lOiBzdHJpbmc7XG4gIGZsb29yUXVlc3RzOiBQYXJ0aWFsPFJlY29yZDxudW1iZXIsIFZlcnRpY2FsUXVlc3RLaW5kPj47XG4gIGVsZXZhdG9yU3RvcHM6IG51bWJlcltdO1xuICBzZXJ2aWNlU3RvcHM6IG51bWJlcltdO1xuICBlbGV2YXRvclZhcmlhbnRzOiBSZWNvcmQ8bnVtYmVyLCBFbGV2YXRvclZhcmlhbnQ+O1xufVxuXG4vKiogRml4ZWQgYnVpbGRpbmcgc2hhZnQgY29vcmRpbmF0ZXMgKGNvbnNpc3RlbnQgYWNyb3NzIGFsbCBmbG9vcnMgMC4uOSBhbmQgYWxsIDQgYmx1ZXByaW50cykuICovXG5leHBvcnQgY29uc3QgRUxFVkFUT1JfWSA9IDQyOyAvLyB3ZXN0IG1hcmdpbiB4PTEuLjIsIHk9NDIuLjQ0LCBkb29yIHg9MywgeT00MyAtPiB3ZXN0IHNoYWZ0IHg9NFxuZXhwb3J0IGNvbnN0IFNUQUlSU19CX1kgPSAxODsgLy8gZWFzdCBtYXJnaW4geD01My4uNTQsIHk9MTguLjIwLCBkb29yIHg9NTIsIHk9MTkgLT4gZWFzdCBzaGFmdCB4PTUxXG5leHBvcnQgY29uc3QgU0VSVklDRV9ZID0gMzQ7ICAvLyBlYXN0IG1hcmdpbiB4PTUzLi41NCwgeT0zNC4uMzYsIGRvb3IgeD01MiwgeT0zNSAtPiBlYXN0IHNoYWZ0IHg9NTFcblxuY29uc3QgUEFTU0FCTEUgPSBuZXcgU2V0PG51bWJlcj4oW1RpbGUuRmxvb3IsIFRpbGUuUnViYmxlLCBUaWxlLlB1ZGRsZSwgVGlsZS5TdGFpcnNVcCwgVGlsZS5TdGFpcnNEb3duLCBUaWxlLkRvb3JPcGVuXSk7XG5jb25zdCBpZHggPSAoZjogRmxvb3JEYXRhLCBwOiBDZWxsKSA9PiBwLnkgKiBmLncgKyBwLng7XG5jb25zdCBpbmIgPSAoZjogRmxvb3JEYXRhLCBwOiBDZWxsKSA9PiBwLnggPj0gMCAmJiBwLnkgPj0gMCAmJiBwLnggPCBmLncgJiYgcC55IDwgZi5oO1xuXG5leHBvcnQgZnVuY3Rpb24gbWFrZUJ1aWxkaW5nUGxhbihzZWVkOiBudW1iZXIpOiBCdWlsZGluZ1BsYW4ge1xuICBjb25zdCBybmcgPSBtYWtlUm5nKChzZWVkIF4gMHg5MWQyM2IpID4+PiAwKTtcbiAgY29uc3QgcG9vbDogVmVydGljYWxRdWVzdEtpbmRbXSA9IFtcbiAgICBcImJyb2tlbi1zdGFpcnNcIixcbiAgICBcImZsb29kZWQtcm91dGVcIixcbiAgICBcImx1cmUtaG9yZGVcIixcbiAgICBcInNlcnZpY2Utc2hhZnRcIixcbiAgICBcImFwYXJ0bWVudC1ieXBhc3NcIixcbiAgXTtcbiAgLy8gRmlzaGVyLVlhdGVzIHNodWZmbGUgZGV0ZXJtaW5pc3RpY2FsbHkgZnJvbSBydW4gc2VlZFxuICBmb3IgKGxldCBpID0gcG9vbC5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgY29uc3QgaiA9IHJuZy5pbnQoaSArIDEpO1xuICAgIFtwb29sW2ldLCBwb29sW2pdXSA9IFtwb29sW2pdLCBwb29sW2ldXTtcbiAgfVxuICAvLyBJbnRlcmxlYXZlIHJpY2ggc2NlbmFyaW9zIHdpdGggY2FsbWVyIGZsb29ycyAoMCwgNCwgNywgOSBhcmUgY2FsbWVyIGJyZWF0aGVyczsgMS4uOCBob3N0IGFsbCA2IHVuaXF1ZSBzY2VuYXJpb3MpLlxuICAvLyBObyBhZGphY2VudCBmbG9vcnMgc2hhcmUgdGhlIHNhbWUgc2NlbmFyaW8ga2luZC5cbiAgY29uc3QgZmxvb3JRdWVzdHM6IFBhcnRpYWw8UmVjb3JkPG51bWJlciwgVmVydGljYWxRdWVzdEtpbmQ+PiA9IHtcbiAgICAxOiBcInJlcGFpci1saWZ0XCIsXG4gICAgMjogcG9vbFswXSxcbiAgICAzOiBwb29sWzFdLFxuICAgIDU6IHBvb2xbMl0sXG4gICAgNjogcG9vbFszXSxcbiAgICA4OiBwb29sWzRdLFxuICB9O1xuXG4gIC8vIE1vc3QgZWxldmF0b3IgcmlkZXMgYXJlIHNtb290aDsgc3BlY2lhbCB2YXJpYW50cyBhcmUgcmFyZSBhbmQgY2FwcGVkIHBlciBydW4uXG4gIGNvbnN0IHZhcmlhbnRzOiBSZWNvcmQ8bnVtYmVyLCBFbGV2YXRvclZhcmlhbnQ+ID0ge307XG4gIGZvciAobGV0IGZsID0gMDsgZmwgPCAxMDsgZmwrKykge1xuICAgIGNvbnN0IHJvbGwgPSBybmcoKTtcbiAgICBpZiAocm9sbCA8IDAuMTQpIHZhcmlhbnRzW2ZsXSA9IFwicmF0dGxlXCI7XG4gICAgZWxzZSBpZiAocm9sbCA8IDAuMjQpIHZhcmlhbnRzW2ZsXSA9IFwic3RvcFwiO1xuICAgIGVsc2UgaWYgKHJvbGwgPCAwLjM0KSB2YXJpYW50c1tmbF0gPSBcInRocmVhdFwiO1xuICAgIGVsc2UgaWYgKHJvbGwgPCAwLjQwICYmIGZsID49IDMgJiYgZmwgPD0gNykgdmFyaWFudHNbZmxdID0gXCJtaWQtc2hhZnRcIjtcbiAgICBlbHNlIHZhcmlhbnRzW2ZsXSA9IFwicm91dGluZVwiO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFpcndlbGxOYW1lOiBcIktMQVRLQSBBXCIsXG4gICAgZmxvb3JRdWVzdHMsXG4gICAgZWxldmF0b3JTdG9wczogWzAsIDEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDldLFxuICAgIHNlcnZpY2VTdG9wczogWzAsIDEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDldLFxuICAgIGVsZXZhdG9yVmFyaWFudHM6IHZhcmlhbnRzLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdEZsb29yUXVlc3RTdGF0ZSgpOiBGbG9vclF1ZXN0U3RhdGUge1xuICByZXR1cm4ge1xuICAgIHN0YWdlOiAwLFxuICAgIGluc3BlY3RlZDogZmFsc2UsXG4gICAgZnVzZVRha2VuOiBmYWxzZSxcbiAgICBjb2RlRm91bmQ6IGZhbHNlLFxuICAgIHNlcnZpY2VVbmxvY2tlZDogZmFsc2UsXG4gICAgc2VydmljZUZvcmNlZDogZmFsc2UsXG4gICAgbHVyZVVzZWQ6IGZhbHNlLFxuICAgIGx1cmVSZXNvbHZlZDogZmFsc2UsXG4gICAgYnlwYXNzUHJvZ3Jlc3M6IDAsXG4gICAgYnlwYXNzT3BlbjogZmFsc2UsXG4gICAgbGFuZGluZ0J5cGFzc09wZW46IGZhbHNlLFxuICAgIGxhbmRpbmdTdGFzaE9wZW5lZDogZmFsc2UsXG4gICAgcmVzb2x2ZWQ6IGZhbHNlLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbEJ1aWxkaW5nU3RhdGUoKTogQnVpbGRpbmdTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgZWxldmF0b3JQb3dlcmVkOiBmYWxzZSxcbiAgICBlbGV2YXRvckVtZXJnZW5jeU9ubHk6IHRydWUsXG4gICAgZWxldmF0b3JGbG9vcjogMSxcbiAgICBlbGV2YXRvck9wZW5GbG9vcjogbnVsbCxcbiAgICBlbGV2YXRvckJyb2tlbjogZmFsc2UsXG4gICAgZWxldmF0b3JGYXVsdFVzZWQ6IGZhbHNlLFxuICAgIGVsZXZhdG9yU3BlY2lhbENvdW50OiAwLFxuICAgIGVsZXZhdG9yQXJyaXZhbDogMCxcbiAgICBlbGV2YXRvckNhbGxGbG9vcjogLTEsXG4gICAgZWxldmF0b3JSaWRlOiBudWxsLFxuICAgIHBhc3NhZ2U6IG51bGwsXG4gICAgcXVlc3RzOiB7fSxcbiAgICBucGNUb3RhbDogMCxcbiAgICBucGNEcm91Z2h0OiAwLFxuICAgIG5leHROcGNBdDogMTgsXG4gICAgam91cm5hbDogW1xuICAgICAgXCJQaXduaWNhOiB6bmFqZFx1MDE3QSBkcm9nXHUwMTE5IG5hIHd5XHUwMTdDc3plIHBpXHUwMTE5dHJhIGkgZG90cnp5aiBuYSBkYWNoLlwiLFxuICAgICAgXCJCdWR5bmVrIG1hIGdcdTAxNDJcdTAwRjN3blx1MDEwNSBLbGF0a1x1MDExOSBBLCB3c2Nob2RuaVx1MDEwNSBLbGF0a1x1MDExOSBCLCB3aW5kXHUwMTE5IHcgemFjaG9kbmltIHN6eWJpZSBpIHBpb24gc2Vyd2lzb3d5LlwiLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhcnZlU2hhZnRBbGNvdmUoXG4gIGY6IEZsb29yRGF0YSxcbiAgc2lkZTogXCJ3ZXN0XCIgfCBcImVhc3RcIixcbiAgeVRvcDogbnVtYmVyLFxuICB6b25lTmFtZTogc3RyaW5nLFxuICByb3V0ZTogXCJlbGV2YXRvclwiIHwgXCJzZXJ2aWNlXCIgfCBcInN0YWlyc0JcIixcbikge1xuICBjb25zdCB4MCA9IHNpZGUgPT09IFwid2VzdFwiID8gMSA6IGYudyAtIDM7IC8vIDEuLjIgb3IgNTMuLjU0XG4gIGNvbnN0IGRvb3JYID0gc2lkZSA9PT0gXCJ3ZXN0XCIgPyAzIDogZi53IC0gNDsgLy8gMyBvciA1MlxuICBjb25zdCBvdXRzaWRlWCA9IHNpZGUgPT09IFwid2VzdFwiID8gNCA6IGYudyAtIDU7IC8vIDQgb3IgNTEgKGFsd2F5cyBvbiB0aGUgdmVydGljYWwgc2hhZnQhKVxuICBjb25zdCB5TWlkID0geVRvcCArIDE7XG5cbiAgLy8gVmVyaWZ5IHRoZSBvdXRzaWRlIHRpbGUgb24gdGhlIHNoYWZ0IGlzIHBhc3NhYmxlIChjbGVhciBhIHNoYWZ0IGRpdmlkZXIgZG9vciBpZiBvbmUgbGFuZGVkIGV4YWN0bHkgb24gdGhlIHRocmVzaG9sZClcbiAgaWYgKCFpbmIoZiwgeyB4OiBvdXRzaWRlWCwgeTogeU1pZCB9KSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IG91dFRpbGUgPSBmLnRpbGVzW2lkeChmLCB7IHg6IG91dHNpZGVYLCB5OiB5TWlkIH0pXTtcbiAgaWYgKG91dFRpbGUgPT09IFRpbGUuRG9vcikge1xuICAgIGNvbnN0IHBhaXJYID0gc2lkZSA9PT0gXCJ3ZXN0XCIgPyBvdXRzaWRlWCArIDEgOiBvdXRzaWRlWCAtIDE7XG4gICAgZm9yIChjb25zdCBjeCBvZiBbb3V0c2lkZVgsIHBhaXJYXSkge1xuICAgICAgaWYgKGYudGlsZXNbaWR4KGYsIHsgeDogY3gsIHk6IHlNaWQgfSldID09PSBUaWxlLkRvb3IpIHtcbiAgICAgICAgZi50aWxlc1tpZHgoZiwgeyB4OiBjeCwgeTogeU1pZCB9KV0gPSBUaWxlLkZsb29yO1xuICAgICAgICBmLmRvb3JzID0gZi5kb29ycy5maWx0ZXIoKGQpID0+ICEoZC54ID09PSBjeCAmJiBkLnkgPT09IHlNaWQpKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAoIVBBU1NBQkxFLmhhcyhvdXRUaWxlKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gRW5zdXJlIHRoZSBhbGNvdmUgYXJlYSBpdHNlbGYgaXMgY3VycmVudGx5IG91dGVyIHdhbGwgc28gd2UgbmV2ZXIgb3ZlcndyaXRlIGFub3RoZXIgcm9vbVxuICBmb3IgKGxldCB5ID0geVRvcDsgeSA8PSB5VG9wICsgMjsgeSsrKSB7XG4gICAgZm9yIChsZXQgeCA9IHgwOyB4IDw9IHgwICsgMTsgeCsrKSB7XG4gICAgICBpZiAoIWluYihmLCB7IHgsIHkgfSkgfHwgZi50aWxlc1tpZHgoZiwgeyB4LCB5IH0pXSAhPT0gVGlsZS5XYWxsKSByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICBjb25zdCByb29tSWQgPSBmLnJvb21zLmxlbmd0aDtcbiAgY29uc3Qgcm9vbTogUm9vbSA9IHtcbiAgICBpZDogcm9vbUlkLFxuICAgIHg6IHgwLFxuICAgIHk6IHlUb3AsXG4gICAgdzogMixcbiAgICBoOiAzLFxuICAgIHJvbGU6IFwibm9ybWFsXCIsXG4gICAgbGl0OiByb3V0ZSAhPT0gXCJzZXJ2aWNlXCIsXG4gICAgZmxpY2tlcjogcm91dGUgPT09IFwiZWxldmF0b3JcIixcbiAgfTtcbiAgZi5yb29tcy5wdXNoKHJvb20pO1xuICBmLnJvb21ab25lcy5wdXNoKHpvbmVOYW1lKTtcblxuICBjb25zdCBjZWxsczogQ2VsbFtdID0gW107XG4gIGZvciAobGV0IHkgPSB5VG9wOyB5IDw9IHlUb3AgKyAyOyB5KyspIHtcbiAgICBmb3IgKGxldCB4ID0geDA7IHggPD0geDAgKyAxOyB4KyspIHtcbiAgICAgIGNvbnN0IHAgPSB7IHgsIHkgfTtcbiAgICAgIGNlbGxzLnB1c2gocCk7XG4gICAgICBjb25zdCBpID0gaWR4KGYsIHApO1xuICAgICAgZi50aWxlc1tpXSA9IFRpbGUuRmxvb3I7XG4gICAgICBmLmZsb29yU3R5bGVbaV0gPSAzO1xuICAgICAgZi5yb29tT2ZbaV0gPSByb29tSWQ7XG4gICAgfVxuICB9XG5cbiAgLy8gU3Vycm91bmQgcGVyaW1ldGVyIHdpdGggd2FsbCBzdHlsZSAzXG4gIGZvciAobGV0IHkgPSB5VG9wIC0gMTsgeSA8PSB5VG9wICsgMzsgeSsrKSB7XG4gICAgZm9yIChsZXQgeCA9IHgwIC0gMTsgeCA8PSB4MCArIDI7IHgrKykge1xuICAgICAgaWYgKCFpbmIoZiwgeyB4LCB5IH0pKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IG9uQm9yZGVyID0geCA9PT0geDAgLSAxIHx8IHggPT09IHgwICsgMiB8fCB5ID09PSB5VG9wIC0gMSB8fCB5ID09PSB5VG9wICsgMztcbiAgICAgIGlmIChvbkJvcmRlciAmJiBmLnRpbGVzW2lkeChmLCB7IHgsIHkgfSldID09PSBUaWxlLldhbGwpIHtcbiAgICAgICAgZi53YWxsU3R5bGVbaWR4KGYsIHsgeCwgeSB9KV0gPSAzO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGRvb3I6IENlbGwgPSB7IHg6IGRvb3JYLCB5OiB5TWlkIH07XG4gIGYudGlsZXNbaWR4KGYsIGRvb3IpXSA9IFRpbGUuRG9vcjtcbiAgZi5mbG9vclN0eWxlW2lkeChmLCBkb29yKV0gPSAzO1xuICAvLyBSZW1vdmUgYW55IGJsb2NraW5nIHByb3Agb24gdGhlIG91dHNpZGUgdGlsZVxuICBmLnByb3BzID0gZi5wcm9wcy5maWx0ZXIoKHApID0+ICEob3V0c2lkZVggPj0gcC54ICYmIG91dHNpZGVYIDwgcC54ICsgcC53ICYmIHlNaWQgPj0gcC55ICYmIHlNaWQgPCBwLnkgKyBwLmgpKTtcbiAgLy8gUmVtb3ZlIGFueSBkb29yIG9uIHRoZSBvdXRzaWRlIHRpbGUgaXRzZWxmIHRoYXQgbWlnaHQgY2xhc2hcbiAgZi5kb29ycyA9IGYuZG9vcnMuZmlsdGVyKChkKSA9PiAhKGQueCA9PT0gZG9vci54ICYmIGQueSA9PT0gZG9vci55KSk7XG4gIGYuZG9vcnMucHVzaCh7XG4gICAgeDogZG9vci54LFxuICAgIHk6IGRvb3IueSxcbiAgICBsb2NrZWQ6IGZhbHNlLFxuICAgIGhwOiA2LFxuICAgIG9wZW46IHJvdXRlID09PSBcInN0YWlyc0JcIixcbiAgICBicm9rZW46IGZhbHNlLFxuICAgIHJvdXRlLFxuICB9KTtcbiAgaWYgKHJvdXRlID09PSBcInN0YWlyc0JcIikge1xuICAgIGYudGlsZXNbaWR4KGYsIGRvb3IpXSA9IFRpbGUuRG9vck9wZW47XG4gIH1cblxuICBjb25zdCBjZW50ZXI6IENlbGwgPSB7IHg6IHNpZGUgPT09IFwid2VzdFwiID8geDAgKyAxIDogeDAsIHk6IHlNaWQgfTtcbiAgY29uc3QgcGFuZWw6IENlbGwgPSB7IHg6IHNpZGUgPT09IFwid2VzdFwiID8geDAgOiB4MCArIDEsIHk6IHlNaWQgfTtcbiAgY29uc3Qgb3V0c2lkZTogQ2VsbCA9IHsgeDogb3V0c2lkZVgsIHk6IHlNaWQgfTtcblxuICByZXR1cm4geyByb29tOiByb29tSWQsIGNlbGxzLCBkb29yLCBwYW5lbCwgY2VudGVyLCBvdXRzaWRlIH07XG59XG5cbi8qKlxuICogQ2FydmVzIGNvbnNpc3RlbnQgdmVydGljYWwgc2hhZnRzIGludG8gdGhlIG91dGVyIGJ1aWxkaW5nIG1hcmdpbnMgQkVGT1JFIHBvcHVsYXRlRW52aXJvbm1lbnQuXG4gKiBOZXZlciBibG9ja3MgYW55IGNvcnJpZG9yIG9yIHJvb207IGFubmV4ZXMgYXV0b21hdGljYWxseSBhdm9pZCBhbHJlYWR5LWNhcnZlZCB3YWxsIHNwYWNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbFZlcnRpY2FsUm91dGVzKGY6IEZsb29yRGF0YSwgcnVuU2VlZD86IG51bWJlcikge1xuICBpZiAoZi50aGVtZSA9PT0gXCJyb29mXCIgfHwgZi5pbmRleCA+PSAxMCkgcmV0dXJuIGY7XG4gIGNvbnN0IHJuZyA9IG1ha2VSbmcoKGYuc2VlZCBeIDB4NWYzNzU5ZGYpID4+PiAwKTtcbiAgY29uc3QgcGxhbiA9IG1ha2VCdWlsZGluZ1BsYW4ocnVuU2VlZCA/PyBmLnNlZWQpO1xuXG4gIGNvbnN0IGVsZXYgPSBjYXJ2ZVNoYWZ0QWxjb3ZlKGYsIFwid2VzdFwiLCBFTEVWQVRPUl9ZLCBcIldJTkRBIE9TT0JPV0FcIiwgXCJlbGV2YXRvclwiKTtcbiAgY29uc3Qgc2VydiA9IGNhcnZlU2hhZnRBbGNvdmUoZiwgXCJlYXN0XCIsIFNFUlZJQ0VfWSwgXCJQSU9OIFRFQ0hOSUNaTllcIiwgXCJzZXJ2aWNlXCIpO1xuICBjb25zdCBzdEIgPSBjYXJ2ZVNoYWZ0QWxjb3ZlKGYsIFwiZWFzdFwiLCBTVEFJUlNfQl9ZLCBcIktMQVRLQSBCXCIsIFwic3RhaXJzQlwiKTtcblxuICBpZiAoc3RCKSB7XG4gICAgLy8gVmlzdWFsIHN0YWlycyB0aWxlIGluc2lkZSBLbGF0a2EgQlxuICAgIGYudGlsZXNbaWR4KGYsIHN0Qi5wYW5lbCldID0gVGlsZS5TdGFpcnNVcDtcbiAgfVxuXG4gIGNvbnN0IHF1ZXN0S2luZCA9IHBsYW4uZmxvb3JRdWVzdHNbZi5pbmRleF0gPz8gbnVsbDtcbiAgbGV0IGxhbmRpbmdGZWF0dXJlOiBMYW5kaW5nRmVhdHVyZUtpbmQgPSBybmcucGljayhbXG4gICAgXCJlbXB0eVwiLFxuICAgIFwid2luZG93XCIsXG4gICAgXCJzdGFzaFwiLFxuICAgIFwib2JzdGFjbGVcIixcbiAgICBcInRyYWNlc1wiLFxuICAgIFwid2luZG93XCIsXG4gICAgXCJlbXB0eVwiLFxuICBdKTtcbiAgaWYgKHF1ZXN0S2luZCA9PT0gXCJicm9rZW4tc3RhaXJzXCIpIGxhbmRpbmdGZWF0dXJlID0gXCJicm9rZW4tZmxpZ2h0XCI7XG5cbiAgZi52ZXJ0aWNhbCA9IHtcbiAgICBzdGFpcndlbGw6IHBsYW4uc3RhaXJ3ZWxsTmFtZSxcbiAgICBzdGFpcnNVcDogZi5zdGFpcnNVcCxcbiAgICBzdGFpcnNEb3duOiBmLnN0YWlyc0Rvd24sXG4gICAgZWxldmF0b3I6IGVsZXZcbiAgICAgID8ge1xuICAgICAgICAgIHJvb206IGVsZXYucm9vbSxcbiAgICAgICAgICBjZWxsczogZWxldi5jZWxscyxcbiAgICAgICAgICBkb29yOiBlbGV2LmRvb3IsXG4gICAgICAgICAgY2FsbDogZWxldi5vdXRzaWRlLFxuICAgICAgICAgIHBhbmVsOiBlbGV2LnBhbmVsLFxuICAgICAgICAgIGNlbnRlcjogZWxldi5jZW50ZXIsXG4gICAgICAgICAgb3V0c2lkZTogZWxldi5vdXRzaWRlLFxuICAgICAgICAgIGxhYmVsOiBcIldJTkRBIE9TT0JPV0FcIixcbiAgICAgICAgfVxuICAgICAgOiBudWxsLFxuICAgIHNlcnZpY2U6IHNlcnZcbiAgICAgID8ge1xuICAgICAgICAgIHJvb206IHNlcnYucm9vbSxcbiAgICAgICAgICBjZWxsczogc2Vydi5jZWxscyxcbiAgICAgICAgICBkb29yOiBzZXJ2LmRvb3IsXG4gICAgICAgICAgcGFuZWw6IHNlcnYub3V0c2lkZSxcbiAgICAgICAgICBjZW50ZXI6IHNlcnYuY2VudGVyLFxuICAgICAgICAgIG91dHNpZGU6IHNlcnYub3V0c2lkZSxcbiAgICAgICAgICBsYWJlbDogXCJQSU9OIFRFQ0hOSUNaTllcIixcbiAgICAgICAgfVxuICAgICAgOiBudWxsLFxuICAgIHN0YWlyc0I6IHN0QlxuICAgICAgPyB7XG4gICAgICAgICAgcm9vbTogc3RCLnJvb20sXG4gICAgICAgICAgY2VsbHM6IHN0Qi5jZWxscyxcbiAgICAgICAgICBkb29yOiBzdEIuZG9vcixcbiAgICAgICAgICBzdGFpcnM6IHN0Qi5wYW5lbCxcbiAgICAgICAgICBjZW50ZXI6IHN0Qi5jZW50ZXIsXG4gICAgICAgICAgb3V0c2lkZTogc3RCLm91dHNpZGUsXG4gICAgICAgICAgbGFiZWw6IFwiS0xBVEtBIEJcIixcbiAgICAgICAgfVxuICAgICAgOiBudWxsLFxuICAgIGxhbmRpbmdGZWF0dXJlLFxuICAgIGxhbmRpbmdIYXNMb290OiBsYW5kaW5nRmVhdHVyZSA9PT0gXCJzdGFzaFwiIHx8IChsYW5kaW5nRmVhdHVyZSA9PT0gXCJ0cmFjZXNcIiAmJiBybmcuY2hhbmNlKDAuNjUpKSxcbiAgICBsYW5kaW5nU291bmRIaW50OiBybmcuY2hhbmNlKDAuNTUpLFxuICAgIHF1ZXN0OiBudWxsLFxuICB9O1xuICByZXR1cm4gZjtcbn1cblxuZnVuY3Rpb24gb3BlblJvb21DZWxscyhmOiBGbG9vckRhdGEsIHJvb206IFJvb20sIGF2b2lkOiBTZXQ8bnVtYmVyPik6IENlbGxbXSB7XG4gIGNvbnN0IG91dDogQ2VsbFtdID0gW107XG4gIGZvciAobGV0IHkgPSByb29tLnk7IHkgPCByb29tLnkgKyByb29tLmg7IHkrKykge1xuICAgIGZvciAobGV0IHggPSByb29tLng7IHggPCByb29tLnggKyByb29tLnc7IHgrKykge1xuICAgICAgY29uc3QgcCA9IHsgeCwgeSB9O1xuICAgICAgY29uc3QgaSA9IGlkeChmLCBwKTtcbiAgICAgIGlmIChmLnRpbGVzW2ldICE9PSBUaWxlLkZsb29yIHx8IGF2b2lkLmhhcyhpKSkgY29udGludWU7XG4gICAgICBpZiAoZi5wcm9wcy5zb21lKChwcikgPT4gcHIuc29saWQgJiYgeCA+PSBwci54ICYmIHggPCBwci54ICsgcHIudyAmJiB5ID49IHByLnkgJiYgeSA8IHByLnkgKyBwci5oKSkgY29udGludWU7XG4gICAgICBpZiAoZi56b21iaWVzLnNvbWUoKHopID0+IE1hdGguZmxvb3Ioei54IC8gVElMRSkgPT09IHggJiYgTWF0aC5mbG9vcih6LnkgLyBUSUxFKSA9PT0geSkpIGNvbnRpbnVlO1xuICAgICAgb3V0LnB1c2gocCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZlYXR1cmVPY2N1cGllZChmOiBGbG9vckRhdGEpOiBTZXQ8bnVtYmVyPiB7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBmb3IgKGNvbnN0IGZlYXQgb2YgZi5lbnZpcm9ubWVudD8uZmVhdHVyZXMgPz8gW10pIHtcbiAgICBzZXQuYWRkKGlkeChmLCBmZWF0LmF0KSk7XG4gICAgaWYgKFwiY29udHJvbFwiIGluIGZlYXQgJiYgZmVhdC5jb250cm9sKSBzZXQuYWRkKGlkeChmLCBmZWF0LmNvbnRyb2wpKTtcbiAgICBpZiAoXCJjZWxsc1wiIGluIGZlYXQpIGZvciAoY29uc3QgYyBvZiBmZWF0LmNlbGxzKSBzZXQuYWRkKGlkeChmLCBjKSk7XG4gICAgaWYgKFwicGFya1wiIGluIGZlYXQpIHNldC5hZGQoaWR4KGYsIGZlYXQucGFyaykpO1xuICAgIGlmIChcImxhbmRpbmdcIiBpbiBmZWF0ICYmICFBcnJheS5pc0FycmF5KGZlYXQubGFuZGluZykpIHNldC5hZGQoaWR4KGYsIGZlYXQubGFuZGluZykpO1xuICB9XG4gIHJldHVybiBzZXQ7XG59XG5cbi8qKlxuICogSW5zdGFsbHMgdGhlIGZsb29yJ3MgbXVsdGktc3RlcCBzY2VuYXJpbyBBRlRFUiBwb3B1bGF0ZUVudmlyb25tZW50LCB1c2luZyBub24tYmxvY2tpbmdcbiAqIGludGVyYWN0YWJsZSBub2RlcyBhbmQgZXhpc3RpbmcgdmFsaWRhdGVkIGhhemFyZHMgc28gc2FmZSByb3V0ZXMgYXJlIG5ldmVyIGJyb2tlbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbGxWZXJ0aWNhbFF1ZXN0cyhmOiBGbG9vckRhdGEsIHJ1blNlZWQ/OiBudW1iZXIpIHtcbiAgaWYgKCFmLnZlcnRpY2FsIHx8ICFmLmVudmlyb25tZW50IHx8IGYudGhlbWUgPT09IFwicm9vZlwiIHx8IGYuaW5kZXggPj0gMTApIHJldHVybiBmO1xuICBjb25zdCBwbGFuID0gbWFrZUJ1aWxkaW5nUGxhbihydW5TZWVkID8/IGYuc2VlZCk7XG4gIGNvbnN0IGtpbmQgPSBwbGFuLmZsb29yUXVlc3RzW2YuaW5kZXhdO1xuICBpZiAoIWtpbmQpIHJldHVybiBmO1xuICBjb25zdCBybmcgPSBtYWtlUm5nKChmLnNlZWQgXiAweDNjODdhMTI1KSA+Pj4gMCk7XG4gIGNvbnN0IGF2b2lkID0gZmVhdHVyZU9jY3VwaWVkKGYpO1xuICBjb25zdCBub3JtYWxSb29tcyA9IGYucm9vbXMuZmlsdGVyKFxuICAgIChyKSA9PlxuICAgICAgci5yb2xlID09PSBcIm5vcm1hbFwiICYmXG4gICAgICAhW1wiS09SWVRBUlpcIiwgXCJXSU5EQSBPU09CT1dBXCIsIFwiUElPTiBURUNITklDWk5ZXCIsIFwiS0xBVEtBIEJcIiwgXCJLTEFUS0EgU0NIT0RPV0FcIl0uaW5jbHVkZXMoZi5yb29tWm9uZXNbci5pZF0pLFxuICApO1xuXG4gIGlmIChraW5kID09PSBcInJlcGFpci1saWZ0XCIgJiYgZi52ZXJ0aWNhbC5lbGV2YXRvcikge1xuICAgIGxldCB3aXJlID0gZi5lbnZpcm9ubWVudC5mZWF0dXJlcy5maW5kKChmdCkgPT4gZnQua2luZCA9PT0gXCJ3aXJlXCIgJiYgZnQuY29udHJvbCk7XG4gICAgaWYgKCF3aXJlKSB7XG4gICAgICBjb25zdCBhbnlXaXJlID0gZi5lbnZpcm9ubWVudC5mZWF0dXJlcy5maW5kKChmdCkgPT4gZnQua2luZCA9PT0gXCJ3aXJlXCIpO1xuICAgICAgaWYgKGFueVdpcmUgJiYgYW55V2lyZS5raW5kID09PSBcIndpcmVcIikge1xuICAgICAgICBjb25zdCB3ciA9IGYucm9vbXNbYW55V2lyZS5yb29tXTtcbiAgICAgICAgY29uc3QgY3RybCA9IHdyXG4gICAgICAgICAgPyBvcGVuUm9vbUNlbGxzKGYsIHdyLCBhdm9pZCkuZmluZChcbiAgICAgICAgICAgICAgKGMpID0+IE1hdGguYWJzKGMueCAtIGFueVdpcmUuYXQueCkgKyBNYXRoLmFicyhjLnkgLSBhbnlXaXJlLmF0LnkpID49IDIgJiYgTWF0aC5hYnMoYy54IC0gYW55V2lyZS5hdC54KSArIE1hdGguYWJzKGMueSAtIGFueVdpcmUuYXQueSkgPD0gNSxcbiAgICAgICAgICAgIClcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKGN0cmwpIHtcbiAgICAgICAgICBhbnlXaXJlLmNvbnRyb2wgPSBjdHJsO1xuICAgICAgICAgIGF2b2lkLmFkZChpZHgoZiwgY3RybCkpO1xuICAgICAgICAgIHdpcmUgPSBhbnlXaXJlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHdvcmtzaG9wID1cbiAgICAgIG5vcm1hbFJvb21zLmZpbmQoKHIpID0+IGYucm9vbVpvbmVzW3IuaWRdID09PSBcIldBUlNaVEFUXCIpID8/XG4gICAgICBub3JtYWxSb29tcy5maW5kKChyKSA9PiBmLnJvb21ab25lc1tyLmlkXSA9PT0gXCJTQ0hPV0VLXCIpID8/XG4gICAgICBub3JtYWxSb29tc1swXTtcbiAgICBjb25zdCBmdXNlUm9vbSA9IHdvcmtzaG9wO1xuICAgIGNvbnN0IGZ1c2VDZWxsID0gZnVzZVJvb20gPyBvcGVuUm9vbUNlbGxzKGYsIGZ1c2VSb29tLCBhdm9pZClbMF0gOiB1bmRlZmluZWQ7XG4gICAgZi52ZXJ0aWNhbC5xdWVzdCA9IHtcbiAgICAgIGtpbmQ6IFwicmVwYWlyLWxpZnRcIixcbiAgICAgIHdpcmVJZDogd2lyZT8uaWQsXG4gICAgICBmdXNlQ2VsbCxcbiAgICAgIGZ1c2VSb29tOiBmdXNlUm9vbT8uaWQsXG4gICAgICBjbHVlQ2VsbDogZi52ZXJ0aWNhbC5lbGV2YXRvci5vdXRzaWRlLFxuICAgICAgY2x1ZUxhYmVsOiBcIlJvemR6aWVsbmlhIEItNFwiLFxuICAgIH07XG4gICAgcmV0dXJuIGY7XG4gIH1cblxuICBpZiAoa2luZCA9PT0gXCJicm9rZW4tc3RhaXJzXCIpIHtcbiAgICBmLnZlcnRpY2FsLnF1ZXN0ID0ge1xuICAgICAga2luZDogXCJicm9rZW4tc3RhaXJzXCIsXG4gICAgICBjbHVlQ2VsbDogZi5zdGFpcnNVcCA/PyB1bmRlZmluZWQsXG4gICAgICBjbHVlTGFiZWw6IFwiWmF3YWxvbnkgYmllZyBzY2hvZFx1MDBGM3dcIixcbiAgICB9O1xuICAgIHJldHVybiBmO1xuICB9XG5cbiAgaWYgKGtpbmQgPT09IFwiZmxvb2RlZC1yb3V0ZVwiICYmIGYudmVydGljYWwuc2VydmljZSkge1xuICAgIGNvbnN0IHdpcmUgPSBmLmVudmlyb25tZW50LmZlYXR1cmVzLmZpbmQoKGZ0KSA9PiBmdC5raW5kID09PSBcIndpcmVcIiAmJiBmdC5jb250cm9sKTtcbiAgICBjb25zdCBzdGVhbSA9IGYuZW52aXJvbm1lbnQuZmVhdHVyZXMuZmluZCgoZnQpID0+IGZ0LmtpbmQgPT09IFwic3RlYW1cIik7XG4gICAgLy8gTWFyayBwdWRkbGUgdGlsZXMgdmlzdWFsbHkgbmVhciB0aGUgc2VydmljZSBkb29yd2F5IChwYXNzYWJsZSwgbm9uLWJsb2NraW5nKVxuICAgIGNvbnN0IG91dCA9IGYudmVydGljYWwuc2VydmljZS5vdXRzaWRlO1xuICAgIGlmIChmLnRpbGVzW2lkeChmLCBvdXQpXSA9PT0gVGlsZS5GbG9vcikgZi50aWxlc1tpZHgoZiwgb3V0KV0gPSBUaWxlLlB1ZGRsZTtcbiAgICBmLnZlcnRpY2FsLnF1ZXN0ID0ge1xuICAgICAga2luZDogXCJmbG9vZGVkLXJvdXRlXCIsXG4gICAgICB3aXJlSWQ6IHdpcmU/LmlkLFxuICAgICAgc3RlYW1JZDogc3RlYW0/LmlkLFxuICAgICAgY2x1ZUNlbGw6IG91dCxcbiAgICAgIGNsdWVMYWJlbDogXCJaYWxhbnkgcGlvbiB0ZWNobmljem55XCIsXG4gICAgfTtcbiAgICByZXR1cm4gZjtcbiAgfVxuXG4gIGlmIChraW5kID09PSBcImx1cmUtaG9yZGVcIiAmJiBmLnN0YWlyc1VwKSB7XG4gICAgY29uc3Qgc3RhaXJSb29tID0gZi5yb29tcy5maW5kKChyKSA9PiByLnJvbGUgPT09IFwic3RhaXJzXCIpO1xuICAgIGNvbnN0IHNpZGVSb29tID1cbiAgICAgIG5vcm1hbFJvb21zLmZpbmQoKHIpID0+IHtcbiAgICAgICAgY29uc3QgY3ggPSByLnggKyByLncgLyAyO1xuICAgICAgICBjb25zdCBjeSA9IHIueSArIHIuaCAvIDI7XG4gICAgICAgIGNvbnN0IGQgPSBNYXRoLmh5cG90KGN4IC0gZi5zdGFpcnNVcCEueCwgY3kgLSBmLnN0YWlyc1VwIS55KTtcbiAgICAgICAgcmV0dXJuIGQgPj0gMTAgJiYgZCA8PSAyODtcbiAgICAgIH0pID8/IG5vcm1hbFJvb21zWzBdO1xuICAgIGNvbnN0IGJlYWNvbiA9IHNpZGVSb29tID8gb3BlblJvb21DZWxscyhmLCBzaWRlUm9vbSwgYXZvaWQpWzBdIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhvcmRlOiBDZWxsW10gPSBbXTtcbiAgICBpZiAoc3RhaXJSb29tKSB7XG4gICAgICBjb25zdCBzcG90cyA9IG9wZW5Sb29tQ2VsbHMoZiwgc3RhaXJSb29tLCBhdm9pZClcbiAgICAgICAgLmZpbHRlcigocCkgPT4gTWF0aC5oeXBvdChwLnggLSBmLnN0YWlyc1VwIS54LCBwLnkgLSBmLnN0YWlyc1VwIS55KSA+PSAxLjUpXG4gICAgICAgIC5zbGljZSgwLCAzKTtcbiAgICAgIGZvciAoY29uc3QgcCBvZiBzcG90cykge1xuICAgICAgICBob3JkZS5wdXNoKHApO1xuICAgICAgICBmLnpvbWJpZXMucHVzaCh7XG4gICAgICAgICAgeDogKHAueCArIDAuNSkgKiBUSUxFLFxuICAgICAgICAgIHk6IChwLnkgKyAwLjUpICogVElMRSxcbiAgICAgICAgICBraW5kOiBybmcoKSA8IDAuMzUgPyBcInJ1bm5lclwiIDogXCJzaGFtYmxlclwiLFxuICAgICAgICAgIHJvb206IHN0YWlyUm9vbS5pZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIGYudmVydGljYWwucXVlc3QgPSB7XG4gICAgICBraW5kOiBcImx1cmUtaG9yZGVcIixcbiAgICAgIGJlYWNvbixcbiAgICAgIGNsdWVSb29tOiBzaWRlUm9vbT8uaWQsXG4gICAgICBob3JkZSxcbiAgICAgIGNsdWVMYWJlbDogXCJLb25zb2xhIHJvemdcdTAxNDJvc3plbmlvd2FcIixcbiAgICB9O1xuICAgIHJldHVybiBmO1xuICB9XG5cbiAgaWYgKGtpbmQgPT09IFwic2VydmljZS1zaGFmdFwiICYmIGYudmVydGljYWwuc2VydmljZSkge1xuICAgIGNvbnN0IG9mZmljZSA9XG4gICAgICBub3JtYWxSb29tcy5maW5kKChyKSA9PiBbXCJMT0tBTCBVXHUwMTdCWVRLT1dZXCIsIFwiV0FSU1pUQVRcIiwgXCJTQ0hPV0VLXCIsIFwiS09UXHUwMTQxT1dOSUFcIl0uaW5jbHVkZXMoZi5yb29tWm9uZXNbci5pZF0pKSA/P1xuICAgICAgbm9ybWFsUm9vbXNbMF07XG4gICAgY29uc3QgY2x1ZUNlbGwgPSBvZmZpY2UgPyBvcGVuUm9vbUNlbGxzKGYsIG9mZmljZSwgYXZvaWQpWzBdIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGNvZGUgPSBgJHsxICsgcm5nLmludCg4KX0tJHsxICsgcm5nLmludCg4KX0tJHsxICsgcm5nLmludCg4KX1gO1xuICAgIGYudmVydGljYWwucXVlc3QgPSB7XG4gICAgICBraW5kOiBcInNlcnZpY2Utc2hhZnRcIixcbiAgICAgIGNsdWVDZWxsLFxuICAgICAgY2x1ZVJvb206IG9mZmljZT8uaWQsXG4gICAgICBjb2RlLFxuICAgICAgY2x1ZUxhYmVsOiBcIkluc3RydWtjamEgcGlvbnUgdGVjaG5pY3puZWdvXCIsXG4gICAgfTtcbiAgICByZXR1cm4gZjtcbiAgfVxuXG4gIGlmIChraW5kID09PSBcImFwYXJ0bWVudC1ieXBhc3NcIiAmJiBmLnZlcnRpY2FsLnN0YWlyc0IpIHtcbiAgICAvLyBFdmFjdWF0aW9uIHBsYW4gbmVhciB0aGUgbWFpbiBjb3JyaWRvciBvciB3ZXN0ZXJuIHNpZGUgKyBieXBhc3Mgb2JzdGFjbGUgaW4gYW4gZWFzdCBhcGFydG1lbnRcbiAgICBjb25zdCBlYXN0Um9vbSA9XG4gICAgICBub3JtYWxSb29tc1xuICAgICAgICAuc2xpY2UoKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gTWF0aC5hYnMoYi54IC0gZi52ZXJ0aWNhbCEuc3RhaXJzQiEub3V0c2lkZS54KSAtIE1hdGguYWJzKGEueCAtIGYudmVydGljYWwhLnN0YWlyc0IhLm91dHNpZGUueCkpXG4gICAgICAgIC5wb3AoKSA/PyBub3JtYWxSb29tc1swXTtcbiAgICBjb25zdCBjb3JyaWRvciA9IGYucm9vbXMuZmluZCgocikgPT4gZi5yb29tWm9uZXNbci5pZF0gPT09IFwiS09SWVRBUlpcIik7XG4gICAgY29uc3QgY2x1ZUNlbGwgPSBjb3JyaWRvciA/IG9wZW5Sb29tQ2VsbHMoZiwgY29ycmlkb3IsIGF2b2lkKS5maW5kKChwKSA9PiBwLnggPj0gMTAgJiYgcC54IDw9IDI0KSA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBieXBhc3NDZWxsID0gZWFzdFJvb20gPyBvcGVuUm9vbUNlbGxzKGYsIGVhc3RSb29tLCBhdm9pZClbMF0gOiB1bmRlZmluZWQ7XG4gICAgZi52ZXJ0aWNhbC5xdWVzdCA9IHtcbiAgICAgIGtpbmQ6IFwiYXBhcnRtZW50LWJ5cGFzc1wiLFxuICAgICAgY2x1ZUNlbGwsXG4gICAgICBjbHVlUm9vbTogY29ycmlkb3I/LmlkLFxuICAgICAgYnlwYXNzQ2VsbCxcbiAgICAgIGNsdWVMYWJlbDogXCJQbGFuIGV3YWt1YWN5am55IEtsYXRraSBCXCIsXG4gICAgfTtcbiAgICByZXR1cm4gZjtcbiAgfVxuXG4gIHJldHVybiBmO1xufVxuIiwgImltcG9ydCB7IFRJTEUsIFRpbGUgfSBmcm9tIFwiLi9wYWxldHRlXCI7XG5pbXBvcnQgeyBtYWtlUm5nIH0gZnJvbSBcIi4vcm5nXCI7XG5pbXBvcnQgdHlwZSB7IEZsb29yRGF0YSwgUHJvcCwgUm9vbSwgWm9tYmllU3Bhd24gfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5mdW5jdGlvbiByb29tQ2VsbHMoZjogRmxvb3JEYXRhLCByb29tOiBSb29tKSB7XG4gIGNvbnN0IGNlbGxzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXSA9IFtdO1xuICBjb25zdCBxID0gZi52ZXJ0aWNhbD8ucXVlc3Q7XG4gIGNvbnN0IHJlc2VydmVkID0gW3E/LmZ1c2VDZWxsLCBxPy5iZWFjb24sIHE/LmNsdWVDZWxsLCBxPy5ieXBhc3NDZWxsLFxuICAgIGYudmVydGljYWw/LmVsZXZhdG9yPy5jYWxsLCBmLnZlcnRpY2FsPy5lbGV2YXRvcj8ucGFuZWwsIGYudmVydGljYWw/LnNlcnZpY2U/LnBhbmVsLCBmLnZlcnRpY2FsPy5zdGFpcnNCPy5zdGFpcnNdXG4gICAgLmZpbHRlcigocCk6IHAgaXMgeyB4OiBudW1iZXI7IHk6IG51bWJlciB9ID0+ICEhcCk7XG4gIGZvciAobGV0IHkgPSByb29tLnk7IHkgPCByb29tLnkgKyByb29tLmg7IHkrKykgZm9yIChsZXQgeCA9IHJvb20ueDsgeCA8IHJvb20ueCArIHJvb20udzsgeCsrKSB7XG4gICAgY29uc3QgaSA9IHkgKiBmLncgKyB4O1xuICAgIGlmIChyZXNlcnZlZC5zb21lKChwKSA9PiBwLnggPT09IHggJiYgcC55ID09PSB5KSkgY29udGludWU7XG4gICAgaWYgKGYudGlsZXNbaV0gIT09IFRpbGUuRmxvb3IgJiYgZi50aWxlc1tpXSAhPT0gVGlsZS5SdWJibGUpIGNvbnRpbnVlO1xuICAgIGlmIChmLnByb3BzLnNvbWUoKHApID0+IHAuc29saWQgJiYgeCA+PSBwLnggJiYgeCA8IHAueCArIHAudyAmJiB5ID49IHAueSAmJiB5IDwgcC55ICsgcC5oKSkgY29udGludWU7XG4gICAgaWYgKGYuem9tYmllcy5zb21lKCh6KSA9PiBNYXRoLmZsb29yKHoueCAvIFRJTEUpID09PSB4ICYmIE1hdGguZmxvb3Ioei55IC8gVElMRSkgPT09IHkpKSBjb250aW51ZTtcbiAgICBpZiAoTWF0aC5oeXBvdCgoeCArIDAuNSkgKiBUSUxFIC0gZi5wbGF5ZXJTdGFydC54LCAoeSArIDAuNSkgKiBUSUxFIC0gZi5wbGF5ZXJTdGFydC55KSA8IDcgKiBUSUxFKSBjb250aW51ZTtcbiAgICBjZWxscy5wdXNoKHsgeCwgeSB9KTtcbiAgfVxuICByZXR1cm4gY2VsbHM7XG59XG5cbi8qKiBBZGRzIHRhY3RpY2FsIGNvbnRlbnQgd2l0aG91dCBjaGFuZ2luZyB0aGUgdmFsaWRhdGVkIHNhZmUgcm91dGUgb3IgcGxhY2luZyBzb2xpZCBwcm9wcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsVGFjdGljYWxDb250ZW50KGY6IEZsb29yRGF0YSkge1xuICBpZiAoZi50aGVtZSA9PT0gXCJyb29mXCIgfHwgZi5pbmRleCA+PSAxMCkgcmV0dXJuIGY7XG4gIGNvbnN0IHJuZyA9IG1ha2VSbmcoKGYuc2VlZCBeIDB4NjRhOTFmM2IpID4+PiAwKTtcbiAgY29uc3QgaGFsbHMgPSBmLnJvb21zLmZpbHRlcigocikgPT4gZi5yb29tWm9uZXNbci5pZF0gPT09IFwiS09SWVRBUlpcIik7XG4gIGNvbnN0IHVzYWJsZSA9IGYucm9vbXMuZmlsdGVyKChyKSA9PiByLnJvbGUgPT09IFwibm9ybWFsXCIgJiYgIVtcIktPUllUQVJaXCIsIFwiV0lOREEgT1NPQk9XQVwiLCBcIlBJT04gVEVDSE5JQ1pOWVwiLCBcIktMQVRLQSBCXCJdLmluY2x1ZGVzKGYucm9vbVpvbmVzW3IuaWRdKSk7XG4gIGNvbnN0IHRlY2ggPSB1c2FibGUuZmlsdGVyKChyKSA9PiBbXCJTQ0hPV0VLXCIsIFwiV0FSU1pUQVRcIiwgXCJLT1RcdTAxNDFPV05JQVwiLCBcIlBSQUxOSUFcIl0uaW5jbHVkZXMoZi5yb29tWm9uZXNbci5pZF0pKTtcbiAgbGV0IG5leHRQcm9wID0gNTIwMDA7XG4gIGNvbnN0IGFkZCA9IChraW5kOiBQcm9wW1wia2luZFwiXSwgY2VsbDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBsYWJlbDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgcDogUHJvcCA9IHsgaWQ6IG5leHRQcm9wKyssIGtpbmQsIHg6IGNlbGwueCwgeTogY2VsbC55LCB3OiAxLCBoOiAxLCBzb2xpZDogZmFsc2UsIGxvb3Q6IG51bGwsIG9wZW5lZDogZmFsc2UsIGxhYmVsIH07XG4gICAgZi5wcm9wcy5wdXNoKHApO1xuICB9O1xuXG4gIC8vIFJhZGlvIHJlY2VpdmVycyBhcmUgZ3VhcmFudGVlZCBvbiBtb3N0IGZsb29yczsgZXhpc3RpbmcgdGVsZXZpc2lvbiBwcm9wcyBiZWNvbWUgdXNhYmxlIGFzIHdlbGwuXG4gIGNvbnN0IHJhZGlvUm9vbXMgPSB1c2FibGUuZmlsdGVyKChyKSA9PiBbXCJTQUxPTlwiLCBcIlNZUElBTE5JQVwiLCBcIkxPS0FMIFVcdTAxN0JZVEtPV1lcIiwgXCJXQVJTWlRBVFwiLCBcIktVQ0hOSUFcIl0uaW5jbHVkZXMoZi5yb29tWm9uZXNbci5pZF0pKTtcbiAgZm9yIChjb25zdCByb29tIG9mIHJhZGlvUm9vbXMuc2xpY2UoMCwgZi5pbmRleCA9PT0gMCA/IDEgOiAyKSkge1xuICAgIGNvbnN0IGNlbGxzID0gcm9vbUNlbGxzKGYsIHJvb20pO1xuICAgIGlmIChjZWxscy5sZW5ndGgpIGFkZChcInJhZGlvXCIsIGNlbGxzW3JuZy5pbnQoY2VsbHMubGVuZ3RoKV0sIFwicmFkaW9cIik7XG4gIH1cblxuICBjb25zdCBiYXJyZWxSb29tcyA9IFsuLi5oYWxscywgLi4udGVjaF07XG4gIGNvbnN0IGJhcnJlbENvdW50ID0gTWF0aC5taW4oMywgMSArIE1hdGguZmxvb3IoZi5pbmRleCAvIDMpKTtcbiAgZm9yIChsZXQgbiA9IDA7IG4gPCBiYXJyZWxDb3VudDsgbisrKSB7XG4gICAgY29uc3Qgcm9vbSA9IGJhcnJlbFJvb21zW3JuZy5pbnQoTWF0aC5tYXgoMSwgYmFycmVsUm9vbXMubGVuZ3RoKSldO1xuICAgIGNvbnN0IGNlbGxzID0gcm9vbSA/IHJvb21DZWxscyhmLCByb29tKSA6IFtdO1xuICAgIGlmIChjZWxscy5sZW5ndGgpIGFkZChcImV4cGxvc2l2ZVwiLCBjZWxsc1tybmcuaW50KGNlbGxzLmxlbmd0aCldLCBcImN6ZXJ3b25hIGJlY3prYVwiKTtcbiAgfVxuXG4gIC8vIE5hdHVyYWwgY3Jhd2xlcnMgaGF2ZSBsb3cgc2lsaG91ZXR0ZXMgYnV0IHJlYWRhYmxlIHBhbGUgaGFuZHMgYW5kIGEgYmxvb2QgdHJhaWwuXG4gIGNvbnN0IGNyYXdsZXJSb29tcyA9IHVzYWJsZS5sZW5ndGggPyB1c2FibGUgOiBoYWxscztcbiAgaWYgKGYuaW5kZXggPiAwICYmIGNyYXdsZXJSb29tcy5sZW5ndGgpIHtcbiAgICBjb25zdCByb29tID0gY3Jhd2xlclJvb21zW3JuZy5pbnQoY3Jhd2xlclJvb21zLmxlbmd0aCldO1xuICAgIGNvbnN0IGNlbGxzID0gcm9vbUNlbGxzKGYsIHJvb20pO1xuICAgIGlmIChjZWxscy5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IGMgPSBjZWxsc1tybmcuaW50KGNlbGxzLmxlbmd0aCldO1xuICAgICAgZi56b21iaWVzLnB1c2goeyB4OiAoYy54ICsgMC41KSAqIFRJTEUsIHk6IChjLnkgKyAwLjUpICogVElMRSwga2luZDogXCJjcmF3bGVyXCIsIHJvb206IHJvb20uaWQgfSk7XG4gICAgfVxuICB9XG5cbiAgLy8gRGVkaWNhdGVkIGNvcnJpZG9yIHBhdHJvbHM6IG9uZSBzb2xpdGFyeSByb3V0ZSBhbmQgYSBzbWFsbCB0d28tem9tYmllIGdyb3VwLlxuICBmb3IgKGxldCBuID0gMDsgbiA8IE1hdGgubWluKDIsIGhhbGxzLmxlbmd0aCk7IG4rKykge1xuICAgIGNvbnN0IHJvb20gPSBoYWxsc1sobiArIGYuaW5kZXgpICUgaGFsbHMubGVuZ3RoXTtcbiAgICBjb25zdCBjZWxscyA9IHJvb21DZWxscyhmLCByb29tKS5maWx0ZXIoKGMpID0+IGMueCA+IDggJiYgYy54IDwgZi53IC0gOSk7XG4gICAgaWYgKGNlbGxzLmxlbmd0aCA8IDQpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGdyb3VwU2l6ZSA9IG4gPT09IDAgPyAxIDogMjtcbiAgICBjb25zdCBzdGFydCA9IGNlbGxzW3JuZy5pbnQoY2VsbHMubGVuZ3RoKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCBncm91cFNpemU7IGsrKykge1xuICAgICAgY29uc3Qgc3Bhd246IFpvbWJpZVNwYXduID0ge1xuICAgICAgICB4OiAoc3RhcnQueCArIDAuNSArIGsgKiAwLjY1KSAqIFRJTEUsXG4gICAgICAgIHk6IChzdGFydC55ICsgMC41KSAqIFRJTEUsXG4gICAgICAgIGtpbmQ6IG4gPT09IDAgPyBcInNoYW1ibGVyXCIgOiBrID09PSAwID8gXCJzaGFtYmxlclwiIDogXCJydW5uZXJcIixcbiAgICAgICAgcm9vbTogcm9vbS5pZCxcbiAgICAgIH07XG4gICAgICBmLnpvbWJpZXMucHVzaChzcGF3bik7XG4gICAgfVxuICB9XG4gIHJldHVybiBmO1xufVxuIiwgImltcG9ydCB7IEZMT09SX01FVEEsIE1BUF9ILCBNQVBfVywgTk9URVMsIFRJTEUsIFRpbGUgfSBmcm9tIFwiLi9wYWxldHRlXCI7XG5pbXBvcnQgeyBtYWtlUm5nIH0gZnJvbSBcIi4vcm5nXCI7XG5pbXBvcnQgeyBoYXNoMiB9IGZyb20gXCIuL3JuZ1wiO1xuaW1wb3J0IHsgRElTQ09WRVJJRVMgfSBmcm9tIFwiLi9pbnZlbnRvcnlcIjtcbmltcG9ydCB7IHBvcHVsYXRlRW52aXJvbm1lbnQsIHZhbGlkYXRlRW52aXJvbm1lbnQgfSBmcm9tIFwiLi9lbnZpcm9ubWVudC1sYXlvdXRcIjtcbmltcG9ydCB7IGluc3RhbGxWZXJ0aWNhbFF1ZXN0cywgaW5zdGFsbFZlcnRpY2FsUm91dGVzIH0gZnJvbSBcIi4vdmVydGljYWwtbGF5b3V0XCI7XG5pbXBvcnQgeyBpbnN0YWxsVGFjdGljYWxDb250ZW50IH0gZnJvbSBcIi4vdGFjdGljYWwtbGF5b3V0XCI7XG5pbXBvcnQgdHlwZSB7XG4gIERlY2FsU3Bhd24sXG4gIERvb3JJbmZvLFxuICBGbG9vckRhdGEsXG4gIExpZ2h0Rml4dHVyZSxcbiAgUHJvcCxcbiAgUHJvcEtpbmQsXG4gIFJvb20sXG4gIFdhbGxEZWNhbCxcbiAgV2luZG93SW5mbyxcbiAgWm9tYmllS2luZCxcbn0gZnJvbSBcIi4vdHlwZXNcIjtcblxuY29uc3QgVyA9IE1BUF9XO1xuY29uc3QgSCA9IE1BUF9IO1xudHlwZSBSbmcgPSBSZXR1cm5UeXBlPHR5cGVvZiBtYWtlUm5nPjtcblxuY29uc3QgaWR4ID0gKHg6IG51bWJlciwgeTogbnVtYmVyKSA9PiB5ICogVyArIHg7XG5jb25zdCBpbmIgPSAoeDogbnVtYmVyLCB5OiBudW1iZXIpID0+IHggPj0gMCAmJiB5ID49IDAgJiYgeCA8IFcgJiYgeSA8IEg7XG5cbnR5cGUgWm9uZSA9XG4gIHwgXCJsaXZpbmdcIlxuICB8IFwia2l0Y2hlblwiXG4gIHwgXCJiYXRoXCJcbiAgfCBcImJlZHJvb21cIlxuICB8IFwiY29ycmlkb3JcIlxuICB8IFwic3RhaXJcIlxuICB8IFwibGF1bmRyeVwiXG4gIHwgXCJib2lsZXJcIlxuICB8IFwic3RvcmFnZVwiXG4gIHwgXCJvZmZpY2VcIlxuICB8IFwibnVyc2VyeVwiXG4gIHwgXCJ3b3Jrc2hvcFwiO1xuXG5jb25zdCBaT05FX05BTUU6IFJlY29yZDxab25lLCBzdHJpbmc+ID0ge1xuICBsaXZpbmc6IFwiU0FMT05cIixcbiAga2l0Y2hlbjogXCJLVUNITklBXCIsXG4gIGJhdGg6IFwiXHUwMTQxQVpJRU5LQVwiLFxuICBiZWRyb29tOiBcIlNZUElBTE5JQVwiLFxuICBjb3JyaWRvcjogXCJLT1JZVEFSWlwiLFxuICBzdGFpcjogXCJLTEFUS0EgU0NIT0RPV0FcIixcbiAgbGF1bmRyeTogXCJQUkFMTklBXCIsXG4gIGJvaWxlcjogXCJLT1RcdTAxNDFPV05JQVwiLFxuICBzdG9yYWdlOiBcIlNDSE9XRUtcIixcbiAgb2ZmaWNlOiBcIkxPS0FMIFVcdTAxN0JZVEtPV1lcIixcbiAgbnVyc2VyeTogXCJQT0tcdTAwRDNKIERaSUVDSVx1MDExOENZXCIsXG4gIHdvcmtzaG9wOiBcIldBUlNaVEFUXCIsXG59O1xuXG5jb25zdCBQQVNTQUJMRSA9IG5ldyBTZXQ8bnVtYmVyPihbVGlsZS5GbG9vciwgVGlsZS5SdWJibGUsIFRpbGUuUHVkZGxlLCBUaWxlLlN0YWlyc1VwLCBUaWxlLlN0YWlyc0Rvd24sIFRpbGUuRG9vciwgVGlsZS5Eb29yT3Blbl0pO1xuXG5mdW5jdGlvbiBjYXJ2ZVJlY3QodGlsZXM6IFVpbnQ4QXJyYXksIHg6IG51bWJlciwgeTogbnVtYmVyLCB3OiBudW1iZXIsIGg6IG51bWJlciwgdmFsdWU6IG51bWJlcikge1xuICBmb3IgKGxldCB5eSA9IHk7IHl5IDwgeSArIGg7IHl5KyspIHtcbiAgICBmb3IgKGxldCB4eCA9IHg7IHh4IDwgeCArIHc7IHh4KyspIHtcbiAgICAgIGlmIChpbmIoeHgsIHl5KSkgdGlsZXNbaWR4KHh4LCB5eSldID0gdmFsdWU7XG4gICAgfVxuICB9XG59XG5cbmludGVyZmFjZSBCdWlsZCB7XG4gIHRpbGVzOiBVaW50OEFycmF5O1xuICBmbG9vclN0eWxlOiBVaW50OEFycmF5O1xuICB3YWxsU3R5bGU6IFVpbnQ4QXJyYXk7XG4gIHJvb21PZjogSW50MTZBcnJheTtcbiAgcm9vbXM6IFJvb21bXTtcbiAgcm9vbVpvbmVzOiBzdHJpbmdbXTtcbiAgcm9vbVdzOiBudW1iZXJbXTtcbiAgem9uZXM6IFpvbmVbXTtcbiAgZG9vcnM6IERvb3JJbmZvW107XG4gIHdpbmRvd3M6IFdpbmRvd0luZm9bXTtcbiAgcHJvcHM6IFByb3BbXTtcbiAgb2NjOiBVaW50OEFycmF5O1xuICB3YWxsRGVjYWxzOiBXYWxsRGVjYWxbXTtcbiAgYnJlYWNoZXM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xuICBjb3Jwc2VzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBraW5kOiBab21iaWVLaW5kIH1bXTtcbiAgc3Vydml2b3JzOiBGbG9vckRhdGFbXCJzdXJ2aXZvcnNcIl07XG4gIGRlY2FsczogRGVjYWxTcGF3bltdO1xuICBsaWdodHM6IExpZ2h0Rml4dHVyZVtdO1xufVxuXG5mdW5jdGlvbiBuZXdCdWlsZCgpOiBCdWlsZCB7XG4gIHJldHVybiB7XG4gICAgdGlsZXM6IG5ldyBVaW50OEFycmF5KFcgKiBIKSxcbiAgICBmbG9vclN0eWxlOiBuZXcgVWludDhBcnJheShXICogSCksXG4gICAgd2FsbFN0eWxlOiBuZXcgVWludDhBcnJheShXICogSCksXG4gICAgcm9vbU9mOiBuZXcgSW50MTZBcnJheShXICogSCkuZmlsbCgtMSksXG4gICAgcm9vbXM6IFtdLFxuICAgIHJvb21ab25lczogW10sXG4gICAgcm9vbVdzOiBbXSxcbiAgICB6b25lczogW10sXG4gICAgZG9vcnM6IFtdLFxuICAgIHdpbmRvd3M6IFtdLFxuICAgIHByb3BzOiBbXSxcbiAgICBvY2M6IG5ldyBVaW50OEFycmF5KFcgKiBIKSxcbiAgICB3YWxsRGVjYWxzOiBbXSxcbiAgICBicmVhY2hlczogW10sXG4gICAgY29ycHNlczogW10sXG4gICAgc3Vydml2b3JzOiBbXSxcbiAgICBkZWNhbHM6IFtdLFxuICAgIGxpZ2h0czogW10sXG4gIH07XG59XG5cbmNvbnN0IE40ID0gW1xuICBbMSwgMF0sXG4gIFstMSwgMF0sXG4gIFswLCAxXSxcbiAgWzAsIC0xXSxcbl0gYXMgY29uc3Q7XG5cbmZ1bmN0aW9uIHJlc2VydmVBcm91bmQoYjogQnVpbGQsIHg6IG51bWJlciwgeTogbnVtYmVyKSB7XG4gIGlmIChpbmIoeCwgeSkpIGIub2NjW2lkeCh4LCB5KV0gPSAxO1xuICBmb3IgKGNvbnN0IFtkeCwgZHldIG9mIE40KSBpZiAoaW5iKHggKyBkeCwgeSArIGR5KSkgYi5vY2NbaWR4KHggKyBkeCwgeSArIGR5KV0gPSAxO1xufVxuXG5mdW5jdGlvbiBhZGRCcmVhY2goYjogQnVpbGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCBmczogbnVtYmVyKSB7XG4gIGlmICghaW5iKHgsIHkpKSByZXR1cm47XG4gIGlmIChiLmJyZWFjaGVzLnNvbWUoKGJyKSA9PiBici54ID09PSB4ICYmIGJyLnkgPT09IHkpKSByZXR1cm47XG4gIGIudGlsZXNbaWR4KHgsIHkpXSA9IFRpbGUuUnViYmxlO1xuICBiLmZsb29yU3R5bGVbaWR4KHgsIHkpXSA9IGZzO1xuICByZXNlcnZlQXJvdW5kKGIsIHgsIHkpO1xuICBiLmJyZWFjaGVzLnB1c2goeyB4LCB5IH0pO1xufVxuXG5mdW5jdGlvbiB6b25lU3R5bGVzKHpvbmU6IFpvbmUsIGRlY2F5OiBudW1iZXIsIHNlcnZpY2U6IGJvb2xlYW4pOiB7IGZzOiBudW1iZXI7IHdzOiBudW1iZXIgfSB7XG4gIGlmICh6b25lID09PSBcImJhdGhcIiB8fCB6b25lID09PSBcImxhdW5kcnlcIikgcmV0dXJuIHsgZnM6IDEsIHdzOiAxIH07XG4gIGlmICh6b25lID09PSBcImtpdGNoZW5cIikgcmV0dXJuIHsgZnM6IDIsIHdzOiBkZWNheSA+IDAuNSA/IDUgOiAwIH07XG4gIGlmICh6b25lID09PSBcImNvcnJpZG9yXCIpIHJldHVybiB7IGZzOiBzZXJ2aWNlID8gMyA6IDIsIHdzOiBkZWNheSA+IDAuNTUgPyA1IDogMiB9O1xuICBpZiAoem9uZSA9PT0gXCJzdGFpclwiKSByZXR1cm4geyBmczogMywgd3M6IDMgfTtcbiAgaWYgKHpvbmUgPT09IFwiYm9pbGVyXCIgfHwgem9uZSA9PT0gXCJ3b3Jrc2hvcFwiIHx8IHpvbmUgPT09IFwic3RvcmFnZVwiKSByZXR1cm4geyBmczogMywgd3M6IDMgfTtcbiAgaWYgKHpvbmUgPT09IFwibnVyc2VyeVwiKSByZXR1cm4geyBmczogNywgd3M6IDAgfTtcbiAgaWYgKGRlY2F5ID49IDAuODUpIHJldHVybiB7IGZzOiA0LCB3czogNCB9O1xuICBpZiAoZGVjYXkgPj0gMC43KSByZXR1cm4geyBmczogNSwgd3M6IDQgfTtcbiAgaWYgKGRlY2F5ID49IDAuNSkgcmV0dXJuIHsgZnM6IDUsIHdzOiA1IH07XG4gIHJldHVybiB7IGZzOiB6b25lID09PSBcImxpdmluZ1wiID8gNyA6IDAsIHdzOiAwIH07XG59XG5cbmZ1bmN0aW9uIGFkZFJvb20oXG4gIGI6IEJ1aWxkLFxuICB4OiBudW1iZXIsXG4gIHk6IG51bWJlcixcbiAgdzogbnVtYmVyLFxuICBoOiBudW1iZXIsXG4gIHpvbmU6IFpvbmUsXG4gIHJvbGU6IFJvb21bXCJyb2xlXCJdLFxuICBkZWNheTogbnVtYmVyLFxuICBzZXJ2aWNlOiBib29sZWFuLFxuICBybmc6IFJuZyxcbik6IFJvb20ge1xuICBjb25zdCB7IGZzLCB3cyB9ID0gem9uZVN0eWxlcyh6b25lLCBkZWNheSwgc2VydmljZSk7XG4gIGNvbnN0IHI6IFJvb20gPSB7XG4gICAgaWQ6IGIucm9vbXMubGVuZ3RoLFxuICAgIHgsXG4gICAgeSxcbiAgICB3LFxuICAgIGgsXG4gICAgcm9sZSxcbiAgICBsaXQ6IHJvbGUgPT09IFwic3RhaXJzXCIgPyB0cnVlIDogcm5nLmNoYW5jZSgwLjg2IC0gZGVjYXkgKiAwLjYpLFxuICAgIGZsaWNrZXI6IHJuZy5jaGFuY2UoMC4yICsgZGVjYXkgKiAwLjU1KSxcbiAgfTtcbiAgYi5yb29tcy5wdXNoKHIpO1xuICBiLnJvb21ab25lcy5wdXNoKFpPTkVfTkFNRVt6b25lXSk7XG4gIGIucm9vbVdzLnB1c2god3MpO1xuICBiLnpvbmVzLnB1c2goem9uZSk7XG4gIGNhcnZlUmVjdChiLnRpbGVzLCB4LCB5LCB3LCBoLCBUaWxlLkZsb29yKTtcbiAgZm9yIChsZXQgeXkgPSB5OyB5eSA8IHkgKyBoOyB5eSsrKSB7XG4gICAgZm9yIChsZXQgeHggPSB4OyB4eCA8IHggKyB3OyB4eCsrKSB7XG4gICAgICBjb25zdCBpID0gaWR4KHh4LCB5eSk7XG4gICAgICBiLnJvb21PZltpXSA9IHIuaWQ7XG4gICAgICBiLmZsb29yU3R5bGVbaV0gPSBmcztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHI7XG59XG5cbmZ1bmN0aW9uIGFkZERvb3IoYjogQnVpbGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCBsb2NrZWQ6IGJvb2xlYW4sIGJhcnJpY2FkZWQgPSBmYWxzZSkge1xuICBpZiAoIWluYih4LCB5KSkgcmV0dXJuO1xuICBjb25zdCBpID0gaWR4KHgsIHkpO1xuICBpZiAoYi50aWxlc1tpXSA9PT0gVGlsZS5XaW5kb3cgfHwgYi50aWxlc1tpXSA9PT0gVGlsZS5Ta3kpIHJldHVybjtcbiAgYi50aWxlc1tpXSA9IFRpbGUuRG9vcjtcbiAgcmVzZXJ2ZUFyb3VuZChiLCB4LCB5KTtcbiAgY29uc3QgZXhpc3RpbmcgPSBiLmRvb3JzLmZpbmQoKGQpID0+IGQueCA9PT0geCAmJiBkLnkgPT09IHkpO1xuICBpZiAoZXhpc3RpbmcpIHtcbiAgICBleGlzdGluZy5sb2NrZWQgPSBleGlzdGluZy5sb2NrZWQgfHwgbG9ja2VkO1xuICAgIGV4aXN0aW5nLmJhcnJpY2FkZWQgPSBleGlzdGluZy5iYXJyaWNhZGVkIHx8IGJhcnJpY2FkZWQ7XG4gICAgcmV0dXJuO1xuICB9XG4gIGIuZG9vcnMucHVzaCh7IHgsIHksIGxvY2tlZCwgYmFycmljYWRlZCwgaHA6IGxvY2tlZCA/IDggOiBiYXJyaWNhZGVkID8gNSA6IDQsIG9wZW46IGZhbHNlLCBicm9rZW46IGZhbHNlIH0pO1xufVxuXG5mdW5jdGlvbiBhZGRXaW5kb3coYjogQnVpbGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCBnbG93OiBXaW5kb3dJbmZvW1wiZ2xvd1wiXSkge1xuICBpZiAoIWluYih4LCB5KSB8fCBiLnRpbGVzW2lkeCh4LCB5KV0gIT09IFRpbGUuV2FsbCkgcmV0dXJuO1xuICBiLnRpbGVzW2lkeCh4LCB5KV0gPSBUaWxlLldpbmRvdztcbiAgYi53aW5kb3dzLnB1c2goeyB4LCB5LCBnbG93IH0pO1xufVxuXG5mdW5jdGlvbiBhZGRQcm9wKFxuICBiOiBCdWlsZCxcbiAga2luZDogUHJvcEtpbmQsXG4gIHg6IG51bWJlcixcbiAgeTogbnVtYmVyLFxuICB3OiBudW1iZXIsXG4gIGg6IG51bWJlcixcbiAgc29saWQ6IGJvb2xlYW4sXG4gIGxvb3Q6IFByb3BbXCJsb290XCJdID0gbnVsbCxcbiAgbm90ZT86IHN0cmluZyxcbikge1xuICBjb25zdCBwOiBQcm9wID0geyBpZDogYi5wcm9wcy5sZW5ndGgsIGtpbmQsIHgsIHksIHcsIGgsIHNvbGlkLCBsb290LCBub3RlLCBvcGVuZWQ6IGZhbHNlIH07XG4gIGIucHJvcHMucHVzaChwKTtcbiAgaWYgKHNvbGlkKSBmb3IgKGxldCB5eSA9IHk7IHl5IDwgeSArIGg7IHl5KyspIGZvciAobGV0IHh4ID0geDsgeHggPCB4ICsgdzsgeHgrKykgaWYgKGluYih4eCwgeXkpKSBiLm9jY1tpZHgoeHgsIHl5KV0gPSAxO1xuICByZXR1cm4gcDtcbn1cblxuZnVuY3Rpb24gY2FuUGxhY2UoYjogQnVpbGQsIHJvb206IFJvb20sIHg6IG51bWJlciwgeTogbnVtYmVyLCB3OiBudW1iZXIsIGg6IG51bWJlcikge1xuICBjb25zdCBjeCA9IHJvb20ueCArIE1hdGguZmxvb3Iocm9vbS53IC8gMik7XG4gIGNvbnN0IGN5ID0gcm9vbS55ICsgTWF0aC5mbG9vcihyb29tLmggLyAyKTtcbiAgZm9yIChsZXQgeXkgPSB5OyB5eSA8IHkgKyBoOyB5eSsrKSB7XG4gICAgZm9yIChsZXQgeHggPSB4OyB4eCA8IHggKyB3OyB4eCsrKSB7XG4gICAgICBpZiAoeHggPCByb29tLnggfHwgeXkgPCByb29tLnkgfHwgeHggPj0gcm9vbS54ICsgcm9vbS53IHx8IHl5ID49IHJvb20ueSArIHJvb20uaCkgcmV0dXJuIGZhbHNlO1xuICAgICAgaWYgKHh4ID09PSBjeCAmJiB5eSA9PT0gY3kpIHJldHVybiBmYWxzZTtcbiAgICAgIGlmIChiLnRpbGVzW2lkeCh4eCwgeXkpXSAhPT0gVGlsZS5GbG9vcikgcmV0dXJuIGZhbHNlO1xuICAgICAgaWYgKGIub2NjW2lkeCh4eCwgeXkpXSkgcmV0dXJuIGZhbHNlO1xuICAgICAgZm9yIChsZXQgZHkgPSAtMTsgZHkgPD0gMTsgZHkrKykge1xuICAgICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSB7XG4gICAgICAgICAgY29uc3QgdCA9IGIudGlsZXNbaWR4KHh4ICsgZHgsIHl5ICsgZHkpXTtcbiAgICAgICAgICBpZiAodCA9PT0gVGlsZS5Eb29yIHx8IHQgPT09IFRpbGUuU3RhaXJzVXAgfHwgdCA9PT0gVGlsZS5TdGFpcnNEb3duKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbnR5cGUgU3BlYyA9IHsga2luZDogUHJvcEtpbmQ7IHc6IG51bWJlcjsgaDogbnVtYmVyIH07XG5cbmNvbnN0IEZVUk5JVFVSRTogUmVjb3JkPFpvbmUsIFNwZWNbXT4gPSB7XG4gIGxpdmluZzogW1xuICAgIHsga2luZDogXCJzb2ZhXCIsIHc6IDIsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwidHZcIiwgdzogMSwgaDogMSB9LFxuICAgIHsga2luZDogXCJ0YWJsZVwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcImJvb2tzaGVsZlwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcInBsYW50XCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwicmFkaWF0b3JcIiwgdzogMSwgaDogMSB9LFxuICBdLFxuICBraXRjaGVuOiBbXG4gICAgeyBraW5kOiBcImZyaWRnZVwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcInN0b3ZlXCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwic2lua1wiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcImNvdW50ZXJcIiwgdzogMiwgaDogMSB9LFxuICAgIHsga2luZDogXCJ0YWJsZVwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcInRyYXNoXCIsIHc6IDEsIGg6IDEgfSxcbiAgXSxcbiAgYmF0aDogW1xuICAgIHsga2luZDogXCJ0b2lsZXRcIiwgdzogMSwgaDogMSB9LFxuICAgIHsga2luZDogXCJzaW5rXCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwibWVkYm94XCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwiYmF0aHR1YlwiLCB3OiAyLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcInNob3dlclwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcIndhc2hlclwiLCB3OiAxLCBoOiAxIH0sXG4gIF0sXG4gIGJlZHJvb206IFtcbiAgICB7IGtpbmQ6IFwiYmVkXCIsIHc6IDIsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwid2FyZHJvYmVcIiwgdzogMSwgaDogMSB9LFxuICAgIHsga2luZDogXCJib29rc2hlbGZcIiwgdzogMSwgaDogMSB9LFxuICAgIHsga2luZDogXCJjaGFpclwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcInJhZGlhdG9yXCIsIHc6IDEsIGg6IDEgfSxcbiAgXSxcbiAgbnVyc2VyeTogW1xuICAgIHsga2luZDogXCJiZWRcIiwgdzogMiwgaDogMSB9LFxuICAgIHsga2luZDogXCJib29rc2hlbGZcIiwgdzogMSwgaDogMSB9LFxuICAgIHsga2luZDogXCJ0b3lcIiwgdzogMSwgaDogMSB9LFxuICAgIHsga2luZDogXCJjaGFpclwiLCB3OiAxLCBoOiAxIH0sXG4gIF0sXG4gIGxhdW5kcnk6IFtcbiAgICB7IGtpbmQ6IFwid2FzaGVyXCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwid2FzaGVyXCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwic2lua1wiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcImxvY2tlclwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcIm1lZGJveFwiLCB3OiAxLCBoOiAxIH0sXG4gIF0sXG4gIGJvaWxlcjogW1xuICAgIHsga2luZDogXCJwaXBlc1wiLCB3OiAyLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcImJhcnJlbFwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcImxvY2tlclwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcImV4dGluZ3Vpc2hlclwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcImNyYXRlXCIsIHc6IDEsIGg6IDEgfSxcbiAgXSxcbiAgc3RvcmFnZTogW1xuICAgIHsga2luZDogXCJzdXBwbHljYXNlXCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwibG9ja2VyXCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwiY3JhdGVcIiwgdzogMSwgaDogMSB9LFxuICAgIHsga2luZDogXCJiYXJyZWxcIiwgdzogMSwgaDogMSB9LFxuICAgIHsga2luZDogXCJsb2NrZXJcIiwgdzogMSwgaDogMSB9LFxuICAgIHsga2luZDogXCJiaWtlXCIsIHc6IDIsIGg6IDEgfSxcbiAgXSxcbiAgb2ZmaWNlOiBbXG4gICAgeyBraW5kOiBcImRlc2tcIiwgdzogMiwgaDogMSB9LFxuICAgIHsga2luZDogXCJjaGFpclwiLCB3OiAxLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcImJvYXJkXCIsIHc6IDIsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwiYm9va3NoZWxmXCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwicGxhbnRcIiwgdzogMSwgaDogMSB9LFxuICBdLFxuICB3b3Jrc2hvcDogW1xuICAgIHsga2luZDogXCJwaXBlc1wiLCB3OiAyLCBoOiAxIH0sXG4gICAgeyBraW5kOiBcInRhYmxlXCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwibG9ja2VyXCIsIHc6IDEsIGg6IDEgfSxcbiAgICB7IGtpbmQ6IFwiY3JhdGVcIiwgdzogMSwgaDogMSB9LFxuICBdLFxuICBjb3JyaWRvcjogW10sXG4gIHN0YWlyOiBbXSxcbn07XG5cbmZ1bmN0aW9uIHBsYWNlQW5jaG9yZWQoYjogQnVpbGQsIHI6IFJvb20sIHNwZWM6IFNwZWMsIGF4OiBudW1iZXIsIGF5OiBudW1iZXIsIHdhbGwgPSB0cnVlKSB7XG4gIGNvbnN0IHR4ID0gci54ICsgKHIudyAtIHNwZWMudykgKiBheDtcbiAgY29uc3QgdHkgPSByLnkgKyAoci5oIC0gc3BlYy5oKSAqIGF5O1xuICBsZXQgYmVzdDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgY29zdDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG4gIGZvciAobGV0IHkgPSByLnk7IHkgPD0gci55ICsgci5oIC0gc3BlYy5oOyB5KyspIHtcbiAgICBmb3IgKGxldCB4ID0gci54OyB4IDw9IHIueCArIHIudyAtIHNwZWMudzsgeCsrKSB7XG4gICAgICBjb25zdCBlZGdlID0geCA9PT0gci54IHx8IHkgPT09IHIueSB8fCB4ICsgc3BlYy53ID09PSByLnggKyByLncgfHwgeSArIHNwZWMuaCA9PT0gci55ICsgci5oO1xuICAgICAgaWYgKHdhbGwgJiYgIWVkZ2UpIGNvbnRpbnVlO1xuICAgICAgaWYgKCFjYW5QbGFjZShiLCByLCB4LCB5LCBzcGVjLncsIHNwZWMuaCkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgY29zdCA9ICh0eCAtIHgpICoqIDIgKyAodHkgLSB5KSAqKiAyO1xuICAgICAgaWYgKCFiZXN0IHx8IGNvc3QgPCBiZXN0LmNvc3QpIGJlc3QgPSB7IHgsIHksIGNvc3QgfTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJlc3QgPyBhZGRQcm9wKGIsIHNwZWMua2luZCwgYmVzdC54LCBiZXN0LnksIHNwZWMudywgc3BlYy5oLCB0cnVlKSA6IHVuZGVmaW5lZDtcbn1cblxuY29uc3QgQU5DSE9SUzogUGFydGlhbDxSZWNvcmQ8UHJvcEtpbmQsIFtudW1iZXIsIG51bWJlcl0+PiA9IHtcbiAgYmVkOiBbMCwgMF0sIHdhcmRyb2JlOiBbMSwgMF0sIGJvb2tzaGVsZjogWzEsIDAuOF0sIHJhZGlhdG9yOiBbMC42LCAwXSxcbiAgc29mYTogWzAuNSwgMF0sIHR2OiBbMC41LCAxXSwgdGFibGU6IFswLjU1LCAwLjRdLCBjaGFpcjogWzAuNTUsIDAuNl0sIHBsYW50OiBbMSwgMV0sXG4gIGZyaWRnZTogWzAsIDBdLCBzdG92ZTogWzAuMjgsIDBdLCBjb3VudGVyOiBbMC42LCAwXSwgc2luazogWzEsIDBdLFxuICBiYXRodHViOiBbMCwgMV0sIHRvaWxldDogWzAsIDBdLCBtZWRib3g6IFsxLCAwLjNdLCBzaG93ZXI6IFsxLCAxXSxcbiAgY3JhdGU6IFswLCAwLjNdLCBzdXBwbHljYXNlOiBbMCwgMF0sIGJhcnJlbDogWzEsIDFdLCBsb2NrZXI6IFswLjQsIDBdLFxuICBkZXNrOiBbMC4zNSwgMF0sIGJvYXJkOiBbMC44LCAwXSwgcGlwZXM6IFswLjUsIDBdLCB3YXNoZXI6IFswLCAwXSxcbn07XG5cbmZ1bmN0aW9uIGZ1cm5pc2hSb29tKGI6IEJ1aWxkLCByb29tOiBSb29tLCB6b25lOiBab25lLCBkZWNheTogbnVtYmVyKSB7XG4gIGNvbnN0IHNwZWNzID0gRlVSTklUVVJFW3pvbmVdO1xuICBpZiAoIXNwZWNzLmxlbmd0aCkgcmV0dXJuO1xuICBjb25zdCBtaXJyb3IgPSByb29tLmlkICUgMiAhPT0gMDtcbiAgY29uc3QgYnVkZ2V0ID0gTWF0aC5taW4oc3BlY3MubGVuZ3RoLCBNYXRoLm1heCgzLCBNYXRoLmZsb29yKHJvb20udyAqIHJvb20uaCAvIDcpKSAtIChkZWNheSA+IDAuOCA/IDEgOiAwKSk7XG4gIGxldCBwbGFjZWQgPSAwO1xuICBmb3IgKGNvbnN0IHNwZWMgb2Ygc3BlY3MpIHtcbiAgICBpZiAocGxhY2VkID49IGJ1ZGdldCkgYnJlYWs7XG4gICAgY29uc3QgW2F4LCBheV0gPSBBTkNIT1JTW3NwZWMua2luZF0gPz8gWzAsIDFdO1xuICAgIGNvbnN0IGxvb3NlID0gc3BlYy5raW5kID09PSBcImNoYWlyXCIgfHwgc3BlYy5raW5kID09PSBcInRhYmxlXCIgfHwgc3BlYy5raW5kID09PSBcInRveVwiO1xuICAgIGlmIChwbGFjZUFuY2hvcmVkKGIsIHJvb20sIHNwZWMsIG1pcnJvciA/IDEgLSBheCA6IGF4LCBheSwgIWxvb3NlKSkgcGxhY2VkKys7XG4gIH1cbiAgaWYgKCh6b25lID09PSBcImxpdmluZ1wiIHx8IHpvbmUgPT09IFwiYmVkcm9vbVwiKSAmJiByb29tLncgPj0gNSAmJiByb29tLmggPj0gNSkge1xuICAgIGFkZFByb3AoYiwgXCJjYXJwZXRcIiwgcm9vbS54ICsgTWF0aC5mbG9vcihyb29tLncgLyAyKSAtIDEsIHJvb20ueSArIE1hdGguZmxvb3Iocm9vbS5oIC8gMiksIDIsIDIsIGZhbHNlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdG9ja0Zsb29yKGI6IEJ1aWxkLCBpbmRleDogbnVtYmVyLCBsb2NrZWQ6IGJvb2xlYW4sIHN0YXJ0OiBSb29tKSB7XG4gIGNvbnN0IHpvbmVPZiA9IChwOiBQcm9wKSA9PiBiLnpvbmVzW2Iucm9vbU9mW2lkeChwLngsIHAueSldXTtcbiAgY29uc3QgdXNlZFJvb21zID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGNvbnN0IGRpc3RyaWJ1dGUgPSAobG9vdDogUHJvcFtcImxvb3RcIl0sIGtpbmRzOiBQcm9wS2luZFtdLCB6b25lczogWm9uZVtdLCBjb3VudDogbnVtYmVyLCBsYWJlbDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgcG9vbCA9IGIucHJvcHMuZmlsdGVyKHAgPT4gIXAubG9vdCAmJiBraW5kcy5pbmNsdWRlcyhwLmtpbmQpICYmIHpvbmVzLmluY2x1ZGVzKHpvbmVPZihwKSkpO1xuICAgIGZvciAobGV0IG4gPSAwOyBuIDwgY291bnQ7IG4rKykge1xuICAgICAgY29uc3QgdGFyZ2V0WSA9IEggKiAobiArIDAuNSkgLyBjb3VudDtcbiAgICAgIGNvbnN0IGhvc3QgPSBwb29sLmZpbHRlcihwID0+ICFwLmxvb3QgJiYgIXVzZWRSb29tcy5oYXMoYi5yb29tT2ZbaWR4KHAueCwgcC55KV0pKVxuICAgICAgICAuc29ydCgoYSwgYykgPT4gTWF0aC5hYnMoYS55IC0gdGFyZ2V0WSkgLSBNYXRoLmFicyhjLnkgLSB0YXJnZXRZKSB8fCBhLmlkIC0gYy5pZClbMF07XG4gICAgICBpZiAoIWhvc3QpIGNvbnRpbnVlO1xuICAgICAgaG9zdC5sb290ID0gbG9vdDtcbiAgICAgIGhvc3QubGFiZWwgPSBsYWJlbDtcbiAgICAgIGlmIChsb290ID09PSBcIm5vdGVcIikgaG9zdC5ub3RlID0gTk9URVNbKGluZGV4ICsgbikgJSBOT1RFUy5sZW5ndGhdO1xuICAgICAgdXNlZFJvb21zLmFkZChiLnJvb21PZltpZHgoaG9zdC54LCBob3N0LnkpXSk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHdlYXBvbiA9IERJU0NPVkVSSUVTW2luZGV4XTtcbiAgaWYgKHdlYXBvbikge1xuICAgIGxldCBob3N0OiBQcm9wIHwgdW5kZWZpbmVkO1xuICAgIGlmIChpbmRleCA8IDIpIHtcbiAgICAgIGhvc3QgPSBwbGFjZUFuY2hvcmVkKGIsIHN0YXJ0LCB7IGtpbmQ6IGluZGV4ID09PSAwID8gXCJsb2NrZXJcIiA6IFwiZGVza1wiLCB3OiBpbmRleCA9PT0gMCA/IDEgOiAyLCBoOiAxIH0sIDEsIDAuNSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhvc3QgPSBiLnByb3BzLmZpbHRlcihwID0+IHAua2luZCA9PT0gXCJ3YXJkcm9iZVwiICYmIHpvbmVPZihwKSA9PT0gXCJiZWRyb29tXCIpXG4gICAgICAgIC5zb3J0KChhLCBjKSA9PiBjLnkgLSBhLnkgfHwgYS54IC0gYy54KVswXTtcbiAgICB9XG4gICAgaWYgKCFob3N0KSByZXR1cm4gZmFsc2U7XG4gICAgaG9zdC5sb290ID0gd2VhcG9uO1xuICAgIGhvc3QubGFiZWwgPSBpbmRleCA9PT0gMCA/IFwiU3phZmthIHdhcnN6dGF0b3dhXCIgOiBpbmRleCA9PT0gMSA/IFwiQml1cmtvIGRvem9yY3lcIiA6IGluZGV4ID09PSA0ID8gXCJTemFmYSBteVx1MDE1Qmxpd2Vnb1wiIDogXCJTemFmYSBzcG9ydG93Y2FcIjtcbiAgfVxuICBpZiAobG9ja2VkKSB7XG4gICAgY29uc3QgaGFsbCA9IGIucm9vbXMuZmlsdGVyKHIgPT4gYi56b25lc1tyLmlkXSA9PT0gXCJjb3JyaWRvclwiKVsxXTtcbiAgICBjb25zdCBob3N0ID0gcGxhY2VBbmNob3JlZChiLCBoYWxsLCB7IGtpbmQ6IFwibG9ja2VyXCIsIHc6IDEsIGg6IDEgfSwgMC41LCAwKTtcbiAgICBpZiAoIWhvc3QpIHJldHVybiBmYWxzZTtcbiAgICBob3N0Lmxvb3QgPSBcImtleVwiO1xuICAgIGhvc3QubGFiZWwgPSBcIlN6YWZrYSBuYSBrbHVjemVcIjtcbiAgfVxuICBkaXN0cmlidXRlKFwibWVkXCIsIFtcIm1lZGJveFwiXSwgW1wiYmF0aFwiLCBcImxhdW5kcnlcIl0sIDMsIFwiQXB0ZWN6a2EgXHUwMTVCY2llbm5hXCIpO1xuICBkaXN0cmlidXRlKFwiYW1tb1wiLCBbXCJzdXBwbHljYXNlXCIsIFwiY3JhdGVcIl0sIFtcInN0b3JhZ2VcIiwgXCJ3b3Jrc2hvcFwiXSwgMywgXCJLYXNldGEgeiBuYWJvamFtaVwiKTtcbiAgZGlzdHJpYnV0ZShcImJhdHRlcnlcIiwgW1wibG9ja2VyXCIsIFwiY291bnRlclwiXSwgW1wiYm9pbGVyXCIsIFwid29ya3Nob3BcIiwgXCJraXRjaGVuXCJdLCAzLCBcIlN6dWZsYWRhIHogYmF0ZXJpYW1pXCIpO1xuICBpZiAoaW5kZXggPj0gNCkgZGlzdHJpYnV0ZShcInNoZWxsc1wiLCBbXCJ3YXJkcm9iZVwiLCBcImxvY2tlclwiXSwgW1wiYmVkcm9vbVwiLCBcInN0b3JhZ2VcIl0sIDIsIFwiWmFwYXMgXHUwMTVCcnV0dVwiKTtcbiAgaWYgKGluZGV4ID49IDYpIGRpc3RyaWJ1dGUoXCJib2x0c1wiLCBbXCJ3YXJkcm9iZVwiLCBcImNyYXRlXCJdLCBbXCJiZWRyb29tXCIsIFwic3RvcmFnZVwiXSwgMiwgXCJGdXRlcmFcdTAxNDIgbmEgYmVcdTAxNDJ0eVwiKTtcbiAgZGlzdHJpYnV0ZShcIm5vdGVcIiwgW1wiZGVza1wiLCBcImJvb2tzaGVsZlwiXSwgW1wibGl2aW5nXCIsIFwiYmVkcm9vbVwiLCBcIm9mZmljZVwiXSwgMywgXCJOb3RhdGtpIG1pZXN6a2FcdTAxNDRjYVwiKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHJuZ0NoYW5jZSh4OiBudW1iZXIsIHk6IG51bWJlciwgbjogbnVtYmVyKSB7XG4gIGNvbnN0IHYgPSBNYXRoLnNpbih4ICogMTI3LjEgKyB5ICogMzExLjcgKyBuICogNzQuNykgKiA0Mzc1OC41NDUzO1xuICByZXR1cm4gdiAtIE1hdGguZmxvb3Iodik7XG59XG5cbi8qKiBTdHlsIFx1MDE1QmNpYW55IHphbGVcdTAxN0N5IG9kIHBvbWllc3pjemVuaWEsIGRvIGt0XHUwMEYzcmVnbyBcdTAxNUJjaWFuYSBqZXN0IHp3clx1MDBGM2NvbmEgKGZyb250ZW0gbmEgcG9cdTAxNDJ1ZG5pZSkuICovXG5mdW5jdGlvbiBwYWludFdhbGxCb3JkZXJzKGI6IEJ1aWxkLCBkZWNheTogbnVtYmVyLCBzZXJ2aWNlOiBib29sZWFuKSB7XG4gIGNvbnN0IGRlZmF1bHRXcyA9IHNlcnZpY2UgPyAzIDogZGVjYXkgPiAwLjYgPyA1IDogZGVjYXkgPiAwLjM1ID8gMCA6IDI7XG4gIGNvbnN0IG9yZGVyID0gW1xuICAgIFswLCAxXSxcbiAgICBbMCwgLTFdLFxuICAgIFsxLCAwXSxcbiAgICBbLTEsIDBdLFxuICBdIGFzIGNvbnN0O1xuICBmb3IgKGxldCB5ID0gMDsgeSA8IEg7IHkrKykge1xuICAgIGZvciAobGV0IHggPSAwOyB4IDwgVzsgeCsrKSB7XG4gICAgICBjb25zdCBpID0gaWR4KHgsIHkpO1xuICAgICAgaWYgKGIudGlsZXNbaV0gIT09IFRpbGUuV2FsbCkgY29udGludWU7XG4gICAgICBsZXQgd3MgPSAtMTtcbiAgICAgIGxldCBuZWFyRmxvb3IgPSBmYWxzZTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkeV0gb2Ygb3JkZXIpIHtcbiAgICAgICAgaWYgKCFpbmIoeCArIGR4LCB5ICsgZHkpKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgaiA9IGlkeCh4ICsgZHgsIHkgKyBkeSk7XG4gICAgICAgIGNvbnN0IHQgPSBiLnRpbGVzW2pdO1xuICAgICAgICBpZiAoIVBBU1NBQkxFLmhhcyh0KSkgY29udGludWU7XG4gICAgICAgIG5lYXJGbG9vciA9IHRydWU7XG4gICAgICAgIGNvbnN0IHJpZCA9IGIucm9vbU9mW2pdO1xuICAgICAgICBpZiAod3MgPCAwKSB3cyA9IHJpZCA+PSAwID8gYi5yb29tV3NbcmlkXSA6IGRlZmF1bHRXcztcbiAgICAgIH1cbiAgICAgIGIud2FsbFN0eWxlW2ldID0gd3MgPj0gMCA/IHdzIDogZGVmYXVsdFdzO1xuICAgICAgaWYgKCFuZWFyRmxvb3IpIGNvbnRpbnVlO1xuICAgICAgLy8gV3lwb3NhXHUwMTdDZW5pZSB0ZWNobmljem5lIHRyYWZpYSBuYSBcdTAxNUJjaWFueSB3IG9kcG93aWVkbmljaCBzdHJlZmFjaC5cbiAgICAgIGNvbnN0IGtpbmRzOiBXYWxsRGVjYWxbXCJraW5kXCJdW10gPVxuICAgICAgICB3cyA9PT0gMVxuICAgICAgICAgID8gW1wicGlwZVwiLCBcImRyaXBcIiwgXCJkcmlwXCIsIFwic3dpdGNoXCIsIFwiZnVzZVwiLCBcImNyYWNrXCIsIFwibW9sZFwiLCBcIm51bWJlclwiLCBcImhvbGVcIiwgXCJjYWxlbmRhclwiXVxuICAgICAgICAgIDogd3MgPT09IDNcbiAgICAgICAgICAgID8gW1wicGlwZVwiLCBcInBhbmVsXCIsIFwicGFuZWxcIiwgXCJkcmlwXCIsIFwic3dpdGNoXCIsIFwiZnVzZVwiLCBcImNyYWNrXCIsIFwibW9sZFwiLCBcIm51bWJlclwiLCBcImhvbGVcIiwgXCJjb25kdWl0XCIsIFwidmVudGdyYXRlXCIsIFwiZXhpdHNpZ25cIiwgXCJzY29uY2VcIiwgXCJjYXV0aW9uXCIsIFwiZW1lcmdlbmN5bGFtcFwiLCBcImNhbWVyYVwiXVxuICAgICAgICAgICAgOiB3cyA9PT0gNFxuICAgICAgICAgICAgICA/IFtcInNjb3JjaFwiLCBcImdyYWZmaXRpXCIsIFwiY3JhY2tcIiwgXCJleHRpbmd1aXNoZXJcIiwgXCJob2xlXCIsIFwiaG9sZVwiLCBcInBhbmVsXCIsIFwiY2F1dGlvblwiLCBcImVtZXJnZW5jeWxhbXBcIl1cbiAgICAgICAgICAgICAgOiB3cyA9PT0gNVxuICAgICAgICAgICAgICAgID8gW1wibW9sZFwiLCBcImNyYWNrXCIsIFwiZ3JhZmZpdGlcIiwgXCJzY29yY2hcIiwgXCJwb3N0ZXJcIiwgXCJob2xlXCIsIFwiaG9sZVwiLCBcImRyaXBcIiwgXCJyZWVsXCIsIFwibWlzc2luZ3Bvc3RlclwiLCBcImVtZXJnZW5jeWxhbXBcIl1cbiAgICAgICAgICAgICAgICA6IFtcInBvc3RlclwiLCBcIm51bWJlclwiLCBcInN3aXRjaFwiLCBcImNyYWNrXCIsIFwiY2xvY2tcIiwgXCJncmFmZml0aVwiLCBcImVsZXZhdG9yXCIsIFwibWlycm9yXCIsIFwiaG9sZVwiLCBcInJlZWxcIiwgXCJpbnRlcmNvbVwiLCBcInRoZXJtb3N0YXRcIiwgXCJzaGVsZmJyYWNrZXRcIiwgXCJjb25kdWl0XCIsIFwiZXhpdHNpZ25cIiwgXCJzY29uY2VcIiwgXCJmYW1pbHlwaG90b1wiLCBcImNhbGVuZGFyXCIsIFwibWlzc2luZ3Bvc3RlclwiLCBcImNhbWVyYVwiXTtcbiAgICAgIGlmIChybmdDaGFuY2UoeCwgeSwgMC4xKSA8IDAuMTkpIGIud2FsbERlY2Fscy5wdXNoKHsgeCwgeSwga2luZDoga2luZHNbTWF0aC5mbG9vcihybmdDaGFuY2UoeCwgeSwgOTkpICoga2luZHMubGVuZ3RoKV0gfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VMaWdodCh4OiBudW1iZXIsIHk6IG51bWJlciwga2luZDogTGlnaHRGaXh0dXJlW1wia2luZFwiXSwgZmxpY2tlcjogYm9vbGVhbiwgcm9vbUlkOiBudW1iZXIsIHJhZGl1czogbnVtYmVyKTogTGlnaHRGaXh0dXJlIHtcbiAgcmV0dXJuIHsgeDogKHggKyAwLjUpICogVElMRSwgeTogKHkgKyAwLjUpICogVElMRSwga2luZCwgZmxpY2tlciwgcm9vbUlkLCByYWRpdXM6IHJhZGl1cyAqIFRJTEUgfTtcbn1cblxuZnVuY3Rpb24gYnVpbGRMaWdodHMoYjogQnVpbGQsIHJuZzogUm5nLCBkZWNheTogbnVtYmVyLCBjb3JyaWRvcnM6IG51bWJlcltdKSB7XG4gIGZvciAoY29uc3QgciBvZiBiLnJvb21zKSB7XG4gICAgY29uc3QgYyA9IHsgeDogci54ICsgTWF0aC5mbG9vcihyLncgLyAyKSwgeTogci55ICsgTWF0aC5mbG9vcihyLmggLyAyKSB9O1xuICAgIGlmIChyLnJvbGUgPT09IFwic3RhaXJzXCIpIGIubGlnaHRzLnB1c2gobWFrZUxpZ2h0KGMueCwgYy55LCBcImVtZXJnZW5jeVwiLCB0cnVlLCByLmlkLCA1LjIpKTtcbiAgICBlbHNlIGlmIChyLmxpdCkge1xuICAgICAgY29uc3Qgd2FybSA9IGIucm9vbVpvbmVzW3IuaWRdID09PSBcIlNBTE9OXCIgfHwgYi5yb29tWm9uZXNbci5pZF0gPT09IFwiU1lQSUFMTklBXCI7XG4gICAgICBiLmxpZ2h0cy5wdXNoKG1ha2VMaWdodChjLngsIGMueSwgd2FybSAmJiBybmcuY2hhbmNlKDAuNCkgPyBcInNvZGl1bVwiIDogXCJmbHVvclwiLCByLmZsaWNrZXIsIHIuaWQsIHdhcm0gPyA1LjYgOiA2LjIpKTtcbiAgICB9IGVsc2UgaWYgKHJuZy5jaGFuY2UoMC4yOCAtIGRlY2F5ICogMC4xMikpIHtcbiAgICAgIGIubGlnaHRzLnB1c2gobWFrZUxpZ2h0KGMueCwgYy55LCBcImVtZXJnZW5jeVwiLCB0cnVlLCByLmlkLCAzLjIpKTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBjeSBvZiBjb3JyaWRvcnMpIHtcbiAgICBmb3IgKGxldCB4ID0gODsgeCA8IFcgLSA4OyB4ICs9IDcpIHtcbiAgICAgIGIubGlnaHRzLnB1c2gobWFrZUxpZ2h0KHgsIGN5ICsgMSwgXCJmbHVvclwiLCBybmcuY2hhbmNlKDAuMiArIGRlY2F5ICogMC41KSwgMCwgNS40KSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZFN1cmZhY2VEZXRhaWxzKGI6IEJ1aWxkLCBybmc6IFJuZywgaW5kZXg6IG51bWJlciwgZGVjYXk6IG51bWJlcikge1xuICBjb25zdCBkZXRhaWxzOiBQYXJ0aWFsPFJlY29yZDxQcm9wS2luZCwgRGVjYWxTcGF3bltcImtpbmRcIl0+PiA9IHtcbiAgICBkZXNrOiBcInBhcGVyXCIsIGJvb2tzaGVsZjogXCJib29rXCIsIGJvYXJkOiBcInBhcGVyXCIsIHBsYW50OiBcImxlYWZcIiwgdG95OiBcInRveVwiLCBtZWRib3g6IFwicGlsbHNcIiwgYmVkOiBcImNsb3RoXCIsIHNvZmE6IFwiY2xvdGhcIixcbiAgICB3YXNoZXI6IFwic3RhaW5cIiwgc2luazogXCJzdGFpblwiLCBwaXBlczogXCJtb3NzXCIsIGxvY2tlcjogXCJjYWJsZVwiLCB0djogXCJjYWJsZVwiLFxuICAgIGNyYXRlOiBcImZvb3RwcmludFwiLCBiZW5jaDogXCJmb290cHJpbnRcIiwgc3RvdmU6IGluZGV4ID09PSA3ID8gXCJzY29yY2hcIiA6IFwic3RhaW5cIixcbiAgfTtcbiAgY29uc3QgZGVjb3JhdGVkID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGZvciAoY29uc3QgcCBvZiBiLnByb3BzKSB7XG4gICAgY29uc3Qga2luZCA9IGRldGFpbHNbcC5raW5kXTtcbiAgICBpZiAoIWtpbmQgfHwgIXJuZy5jaGFuY2UoMC42KSkgY29udGludWU7XG4gICAgZm9yIChjb25zdCBbeCwgeV0gb2YgW1twLngsIHAueSArIHAuaF0sIFtwLnggKyBwLncsIHAueV0sIFtwLnggLSAxLCBwLnldLCBbcC54LCBwLnkgLSAxXV0pIHtcbiAgICAgIGNvbnN0IGkgPSBpZHgoeCwgeSk7XG4gICAgICBpZiAoIWluYih4LCB5KSB8fCBiLnRpbGVzW2ldICE9PSBUaWxlLkZsb29yIHx8IGIub2NjW2ldIHx8IGRlY29yYXRlZC5oYXMoaSkpIGNvbnRpbnVlO1xuICAgICAgaWYgKGIucm9vbU9mW2ldICE9PSBiLnJvb21PZltpZHgocC54LCBwLnkpXSkgY29udGludWU7XG4gICAgICBiLmRlY2Fscy5wdXNoKHsgeCwgeSwga2luZCB9KTtcbiAgICAgIGRlY29yYXRlZC5hZGQoaSk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgY29uc3QgaXNTdGFpciA9IChpOiBudW1iZXIpID0+IGIucm9vbU9mW2ldID49IDAgJiYgYi5yb29tWm9uZXNbYi5yb29tT2ZbaV1dID09PSBcIktMQVRLQSBTQ0hPRE9XQVwiO1xuICBjb25zdCBydWJibGVOID0gTWF0aC5yb3VuZChkZWNheSAqIDU1KSArIChpbmRleCA9PT0gMCA/IDEyIDogMCk7XG4gIGZvciAobGV0IGEgPSAwOyBhIDwgcnViYmxlTjsgYSsrKSB7XG4gICAgY29uc3QgeCA9IDIgKyBybmcuaW50KFcgLSA0KTtcbiAgICBjb25zdCB5ID0gMiArIHJuZy5pbnQoSCAtIDQpO1xuICAgIGNvbnN0IGkgPSBpZHgoeCwgeSk7XG4gICAgaWYgKGIudGlsZXNbaV0gIT09IFRpbGUuRmxvb3IgfHwgYi5vY2NbaV0gfHwgaXNTdGFpcihpKSkgY29udGludWU7XG4gICAgYi50aWxlc1tpXSA9IFRpbGUuUnViYmxlO1xuICB9XG4gIGlmIChkZWNheSA+PSAwLjU1IHx8IGluZGV4ID09PSAwKSB7XG4gICAgY29uc3QgbiA9IDEwICsgTWF0aC5yb3VuZChkZWNheSAqIDI4KTtcbiAgICBmb3IgKGxldCBhID0gMDsgYSA8IG47IGErKykge1xuICAgICAgY29uc3QgeCA9IDIgKyBybmcuaW50KFcgLSA0KTtcbiAgICAgIGNvbnN0IHkgPSAyICsgcm5nLmludChIIC0gNCk7XG4gICAgICBjb25zdCBpID0gaWR4KHgsIHkpO1xuICAgICAgaWYgKGIudGlsZXNbaV0gIT09IFRpbGUuRmxvb3IgfHwgYi5vY2NbaV0gfHwgaXNTdGFpcihpKSkgY29udGludWU7XG4gICAgICBiLnRpbGVzW2ldID0gVGlsZS5QdWRkbGU7XG4gICAgfVxuICB9XG4gIGlmIChpbmRleCA9PT0gNykge1xuICAgIGZvciAobGV0IGEgPSAwOyBhIDwgNDA7IGErKykge1xuICAgICAgY29uc3QgeCA9IDIgKyBybmcuaW50KFcgLSA0KTtcbiAgICAgIGNvbnN0IHkgPSAyICsgcm5nLmludChIIC0gNCk7XG4gICAgICBjb25zdCBpID0gaWR4KHgsIHkpO1xuICAgICAgaWYgKGIudGlsZXNbaV0gPT09IFRpbGUuRmxvb3IpIGIuZmxvb3JTdHlsZVtpXSA9IDQ7XG4gICAgfVxuICB9XG59XG5cbi8qKiBPa25hIHR5bGtvIHcgXHUwMTVCY2lhbmFjaCB6ZXduXHUwMTE5dHJ6bnljaDogcG8gZHJ1Z2llaiBzdHJvbmllIG11cnUgbmllIG1hIHBvZFx1MDE0Mm9naSB3IHphc2lcdTAxMTlndSAzIGthZmxpLiAqL1xuZnVuY3Rpb24gcGxhY2VXaW5kb3dzKGI6IEJ1aWxkLCBybmc6IFJuZywgZGVjYXk6IG51bWJlcikge1xuICBjb25zdCBnbG93Q2hhbmNlID0gMC40NiAtIGRlY2F5ICogMC4zO1xuICBjb25zdCBibG9ja2VkID0gbmV3IFNldDxudW1iZXI+KGIud2FsbERlY2Fscy5tYXAoKGQpID0+IGlkeChkLngsIGQueSkpKTtcbiAgZm9yIChjb25zdCBkIG9mIGIuZG9vcnMpIGZvciAobGV0IGR5ID0gLTE7IGR5IDw9IDE7IGR5KyspIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIGlmIChpbmIoZC54ICsgZHgsIGQueSArIGR5KSkgYmxvY2tlZC5hZGQoaWR4KGQueCArIGR4LCBkLnkgKyBkeSkpO1xuICBmb3IgKGxldCB5ID0gMTsgeSA8IEggLSAxOyB5KyspIHtcbiAgICBmb3IgKGxldCB4ID0gMTsgeCA8IFcgLSAxOyB4KyspIHtcbiAgICAgIGNvbnN0IGkgPSBpZHgoeCwgeSk7XG4gICAgICBpZiAoYi50aWxlc1tpXSAhPT0gVGlsZS5XYWxsIHx8IGJsb2NrZWQuaGFzKGkpKSBjb250aW51ZTtcbiAgICAgIGxldCBkaXI6IHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0gfCBudWxsID0gbnVsbDtcbiAgICAgIGxldCBjb3VudCA9IDA7XG4gICAgICBmb3IgKGNvbnN0IGQgb2YgTjQpIHtcbiAgICAgICAgY29uc3QgdCA9IGIudGlsZXNbaWR4KHggKyBkWzBdLCB5ICsgZFsxXSldO1xuICAgICAgICBpZiAoUEFTU0FCTEUuaGFzKHQpKSB7XG4gICAgICAgICAgY291bnQrKztcbiAgICAgICAgICBkaXIgPSBkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY291bnQgIT09IDEgfHwgIWRpcikgY29udGludWU7XG4gICAgICBsZXQgZXh0ZXJpb3IgPSB0cnVlO1xuICAgICAgZm9yIChsZXQgayA9IDE7IGsgPD0gMzsgaysrKSB7XG4gICAgICAgIGNvbnN0IG54ID0geCAtIGRpclswXSAqIGs7XG4gICAgICAgIGNvbnN0IG55ID0geSAtIGRpclsxXSAqIGs7XG4gICAgICAgIGlmICghaW5iKG54LCBueSkpIGJyZWFrO1xuICAgICAgICBjb25zdCB0ID0gYi50aWxlc1tpZHgobngsIG55KV07XG4gICAgICAgIGlmIChQQVNTQUJMRS5oYXModCkgfHwgdCA9PT0gVGlsZS5XaW5kb3cpIHtcbiAgICAgICAgICBleHRlcmlvciA9IGZhbHNlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIWV4dGVyaW9yKSBjb250aW51ZTtcbiAgICAgIGlmIChybmcuY2hhbmNlKDAuMTEpKSB7XG4gICAgICAgIGNvbnN0IGdsb3cgPSBybmcuY2hhbmNlKGdsb3dDaGFuY2UpID8gKHJuZy5jaGFuY2UoMC4yMikgPyBcIm9yYW5nZVwiIDogXCJmbHVvclwiKSA6IFwibm9uZVwiO1xuICAgICAgICBhZGRXaW5kb3coYiwgeCwgeSwgZ2xvdyk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbi8qKiBVc3pjemVsbmllbmllOiBrYVx1MDE3Q2R5IHBva1x1MDBGM2ogKHBvemEga29yeXRhcnphbWkpIG11c2kgbWllXHUwMTA3IHBlXHUwMTQybnkgb2J3XHUwMEYzZCBcdTAxNUJjaWFuIC8gZHJ6d2kgLyB3eVx1MDE0Mm9tXHUwMEYzdy4gKi9cbmZ1bmN0aW9uIHNlYWxSb29tcyhiOiBCdWlsZCkge1xuICBmb3IgKGNvbnN0IHIgb2YgYi5yb29tcykge1xuICAgIGNvbnN0IHpvbmUgPSBiLnJvb21ab25lc1tyLmlkXTtcbiAgICBpZiAoem9uZSA9PT0gXCJLT1JZVEFSWlwiKSBjb250aW51ZTtcbiAgICBjb25zdCBzdHJpY3QgPSByLnJvbGUgPT09IFwic3RhaXJzXCIgfHwgci5yb2xlID09PSBcInN0YXJ0XCI7XG4gICAgZm9yIChsZXQgeSA9IHIueSAtIDE7IHkgPD0gci55ICsgci5oOyB5KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLnggLSAxOyB4IDw9IHIueCArIHIudzsgeCsrKSB7XG4gICAgICAgIGNvbnN0IG9uQm9yZGVyID0geCA9PT0gci54IC0gMSB8fCB4ID09PSByLnggKyByLncgfHwgeSA9PT0gci55IC0gMSB8fCB5ID09PSByLnkgKyByLmg7XG4gICAgICAgIGlmICghb25Cb3JkZXIgfHwgIWluYih4LCB5KSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGkgPSBpZHgoeCwgeSk7XG4gICAgICAgIGNvbnN0IHQgPSBiLnRpbGVzW2ldO1xuICAgICAgICBpZiAodCAhPT0gVGlsZS5GbG9vciAmJiB0ICE9PSBUaWxlLlB1ZGRsZSkgY29udGludWU7XG4gICAgICAgIGlmIChzdHJpY3QpIHtcbiAgICAgICAgICBiLnRpbGVzW2ldID0gVGlsZS5XYWxsO1xuICAgICAgICAgIGIucm9vbU9mW2ldID0gLTE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYWRkQnJlYWNoKGIsIHgsIHksIGIuZmxvb3JTdHlsZVtpZHgoci54LCByLnkpXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuLyogPT09PT09PT09PT09IFdJRVx1MDE3QkE6IHBsYW55IHBpXHUwMTE5dGVyID09PT09PT09PT09PSAqL1xuXG5pbnRlcmZhY2UgU2hhZnQge1xuICB4OiBudW1iZXI7XG4gIGMwOiBudW1iZXI7XG4gIGMxOiBudW1iZXI7XG59XG5pbnRlcmZhY2UgQmx1ZXByaW50IHtcbiAgbmFtZTogc3RyaW5nO1xuICBjb3JyaWRvcnM6IG51bWJlcltdO1xuICBzaGFmdHM6IFNoYWZ0W107XG59XG5cbmNvbnN0IE1JRCA9IE1hdGguZmxvb3IoVyAvIDIpIC0gMTtcblxuZnVuY3Rpb24gYmx1ZXByaW50Rm9yKHJuZzogUm5nLCBpbmRleDogbnVtYmVyKTogQmx1ZXByaW50IHtcbiAgY29uc3QgdmFyaWFudHM6IEJsdWVwcmludFtdID0gW1xuICAgIHsgbmFtZTogXCJrb3J5dGFyeiBkd3VwYXNtb3d5XCIsIGNvcnJpZG9yczogWzE2LCA0MiwgNjhdLCBzaGFmdHM6IFt7IHg6IDQsIGMwOiAwLCBjMTogMiB9LCB7IHg6IFcgLSA2LCBjMDogMCwgYzE6IDIgfSwgeyB4OiBNSUQsIGMwOiAxLCBjMTogMiB9XSB9LFxuICAgIHsgbmFtZTogXCJrcnp5XHUwMTdDXCIsIGNvcnJpZG9yczogWzEyLCAzOCwgNjRdLCBzaGFmdHM6IFt7IHg6IDQsIGMwOiAwLCBjMTogMiB9LCB7IHg6IFcgLSA2LCBjMDogMCwgYzE6IDIgfSwgeyB4OiBNSUQsIGMwOiAwLCBjMTogMiB9XSB9LFxuICAgIHsgbmFtZTogXCJlc2thXCIsIGNvcnJpZG9yczogWzE4LCA0NiwgNzJdLCBzaGFmdHM6IFt7IHg6IDQsIGMwOiAwLCBjMTogMiB9LCB7IHg6IFcgLSA2LCBjMDogMCwgYzE6IDEgfSwgeyB4OiBNSUQsIGMwOiAxLCBjMTogMiB9XSB9LFxuICAgIHtcbiAgICAgIG5hbWU6IFwicGllclx1MDE1QmNpZVx1MDE0NCB0ZWNobmljem55XCIsXG4gICAgICBjb3JyaWRvcnM6IFsxMiwgMzAsIDUwLCA3MF0sXG4gICAgICBzaGFmdHM6IFt7IHg6IDQsIGMwOiAwLCBjMTogMyB9LCB7IHg6IFcgLSA2LCBjMDogMCwgYzE6IDMgfSwgeyB4OiBNSUQsIGMwOiAxLCBjMTogMiB9LCB7IHg6IDE2LCBjMDogMiwgYzE6IDMgfV0sXG4gICAgfSxcbiAgXTtcbiAgcmV0dXJuIHZhcmlhbnRzWyhpbmRleCArIHJuZy5pbnQoNCkpICUgNF07XG59XG5cbmZ1bmN0aW9uIHNlcnZpY2Vab25lcyhybmc6IFJuZyk6IFpvbmVbXSB7XG4gIHJldHVybiBybmcucGljayhbXG4gICAgW1wiYm9pbGVyXCIsIFwibGF1bmRyeVwiLCBcInN0b3JhZ2VcIiwgXCJ3b3Jrc2hvcFwiXSxcbiAgICBbXCJzdG9yYWdlXCIsIFwid29ya3Nob3BcIiwgXCJsYXVuZHJ5XCIsIFwib2ZmaWNlXCJdLFxuICAgIFtcImxhdW5kcnlcIiwgXCJzdG9yYWdlXCIsIFwiYm9pbGVyXCIsIFwic3RvcmFnZVwiXSxcbiAgICBbXCJvZmZpY2VcIiwgXCJzdG9yYWdlXCIsIFwid29ya3Nob3BcIiwgXCJib2lsZXJcIl0sXG4gIF0gYXMgWm9uZVtdW10pO1xufVxuXG5mdW5jdGlvbiBhcGFydG1lbnRab25lcyhybmc6IFJuZywgZGVjYXk6IG51bWJlcik6IFpvbmVbXSB7XG4gIGNvbnN0IHRwbDogWm9uZVtdW10gPSBbXG4gICAgW1wiYmVkcm9vbVwiLCBcImxpdmluZ1wiLCBcImtpdGNoZW5cIiwgXCJiYXRoXCJdLFxuICAgIFtcImJhdGhcIiwgXCJsaXZpbmdcIiwgXCJraXRjaGVuXCIsIFwiYmVkcm9vbVwiXSxcbiAgICBbXCJiZWRyb29tXCIsIFwia2l0Y2hlblwiLCBcImJhdGhcIiwgXCJsaXZpbmdcIl0sXG4gICAgW1wibnVyc2VyeVwiLCBcImxpdmluZ1wiLCBcImJlZHJvb21cIiwgXCJraXRjaGVuXCJdLFxuICAgIFtcImxpdmluZ1wiLCBcImtpdGNoZW5cIiwgXCJiYXRoXCIsIFwiYmVkcm9vbVwiXSxcbiAgICBbXCJiZWRyb29tXCIsIFwiYmF0aFwiLCBcImxpdmluZ1wiLCBcImtpdGNoZW5cIl0sXG4gIF07XG4gIGNvbnN0IGJhc2UgPSBybmcucGljayh0cGwpLnNsaWNlKCk7XG4gIGlmIChkZWNheSA+IDAuNiAmJiBybmcuY2hhbmNlKDAuMzUpKSBiYXNlWzJdID0gXCJzdG9yYWdlXCI7XG4gIHJldHVybiBiYXNlO1xufVxuXG5pbnRlcmZhY2UgQmFuZCB7XG4gIHkwOiBudW1iZXI7XG4gIHkxOiBudW1iZXI7XG4gIHVwcGVyOiBib29sZWFuO1xuICBsb3dlcjogYm9vbGVhbjtcbiAgc2VnbWVudHM6IFtudW1iZXIsIG51bWJlcl1bXTtcbn1cblxuZnVuY3Rpb24gYnVpbGRGbG9vcihpbmRleDogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBGbG9vckRhdGEgfCBudWxsIHtcbiAgY29uc3QgbWV0YSA9IEZMT09SX01FVEFbaW5kZXhdO1xuICBjb25zdCBybmcgPSBtYWtlUm5nKHNlZWQpO1xuICBjb25zdCBkZWNheSA9IG1ldGEuZGVjYXk7XG4gIGNvbnN0IHNlcnZpY2UgPSBpbmRleCA8PSAxO1xuICBjb25zdCBiID0gbmV3QnVpbGQoKTtcbiAgY29uc3QgYnAgPSBibHVlcHJpbnRGb3Iocm5nLCBpbmRleCk7XG4gIGNvbnN0IGN5cyA9IGJwLmNvcnJpZG9ycztcblxuICAvLyBLb3J5dGFyemUgKHBvZFx1MDE0Mm9nYSB4IDQuLlctNSwgcG9rXHUwMEYzai1rb3J5dGFyeiA2Li5XLTcpXG4gIGZvciAoY29uc3QgY3kgb2YgY3lzKSB7XG4gICAgY2FydmVSZWN0KGIudGlsZXMsIDQsIGN5LCBXIC0gOCwgMywgVGlsZS5GbG9vcik7XG4gICAgZm9yIChsZXQgeSA9IGN5OyB5IDwgY3kgKyAzOyB5KyspIGZvciAobGV0IHggPSA0OyB4IDwgVyAtIDQ7IHgrKykgYi5mbG9vclN0eWxlW2lkeCh4LCB5KV0gPSBzZXJ2aWNlID8gMyA6IDI7XG4gICAgY29uc3QgY3IgPSBhZGRSb29tKGIsIDYsIGN5LCBXIC0gMTIsIDMsIFwiY29ycmlkb3JcIiwgXCJub3JtYWxcIiwgZGVjYXksIHNlcnZpY2UsIHJuZyk7XG4gICAgY3IubGl0ID0gdHJ1ZTtcbiAgICBjci5mbGlja2VyID0gcm5nLmNoYW5jZSgwLjMgKyBkZWNheSAqIDAuNCk7XG4gIH1cbiAgLy8gU3p5YnkgXHUwMTQyXHUwMTA1Y3pcdTAxMDUgZG9rXHUwMTQyYWRuaWUgd3NrYXphbmUga29yeXRhcnplIChiZXogd3lzdGFqXHUwMTA1Y3ljaCBcdTAxNUJsZXB5Y2ggb2RjaW5rXHUwMEYzdylcbiAgZm9yIChjb25zdCBzaCBvZiBicC5zaGFmdHMpIHtcbiAgICBjb25zdCB5MCA9IGN5c1tzaC5jMF07XG4gICAgY29uc3QgeTEgPSBjeXNbc2guYzFdICsgMjtcbiAgICBjYXJ2ZVJlY3QoYi50aWxlcywgc2gueCwgeTAsIDIsIHkxIC0geTAgKyAxLCBUaWxlLkZsb29yKTtcbiAgICBmb3IgKGxldCB5ID0geTA7IHkgPD0geTE7IHkrKykgZm9yIChsZXQgeCA9IHNoLng7IHggPCBzaC54ICsgMjsgeCsrKSBiLmZsb29yU3R5bGVbaWR4KHgsIHkpXSA9IDM7XG4gIH1cbiAgZm9yIChjb25zdCBzaCBvZiBicC5zaGFmdHMpIHtcbiAgICBpZiAoc2guYzEgLSBzaC5jMCA+PSAxICYmIHJuZy5jaGFuY2UoMC43KSkge1xuICAgICAgY29uc3QgZHkgPSBjeXNbc2guYzBdICsgNSArIHJuZy5pbnQoTWF0aC5tYXgoMSwgY3lzW3NoLmMwICsgMV0gLSBjeXNbc2guYzBdIC0gOCkpO1xuICAgICAgaWYgKGIudGlsZXNbaWR4KHNoLngsIGR5KV0gPT09IFRpbGUuRmxvb3IgJiYgYi50aWxlc1tpZHgoc2gueCArIDEsIGR5KV0gPT09IFRpbGUuRmxvb3IpIHtcbiAgICAgICAgYWRkRG9vcihiLCBzaC54LCBkeSwgZmFsc2UpO1xuICAgICAgICBhZGREb29yKGIsIHNoLnggKyAxLCBkeSwgZmFsc2UpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFBhc3kgbWlcdTAxMTlkenkga29yeXRhcnphbWk7IHNlZ21lbnR5IG9taWphalx1MDEwNSBzenlieSwgXHUwMTVCY2lhbnkgd3NwXHUwMEYzXHUwMTQyZHppZWxvbmUgKGdydWJvXHUwMTVCXHUwMTA3IDEpXG4gIGNvbnN0IGJhbmRzOiBCYW5kW10gPSBbXTtcbiAgY29uc3QgYmFuZENvdW50ID0gY3lzLmxlbmd0aCArIDE7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYmFuZENvdW50OyBpKyspIHtcbiAgICBjb25zdCB5MCA9IGkgPT09IDAgPyAzIDogY3lzW2kgLSAxXSArIDM7XG4gICAgY29uc3QgeTEgPSBpID09PSBjeXMubGVuZ3RoID8gSCAtIDQgOiBjeXNbaV0gLSAxO1xuICAgIGNvbnN0IGN1dHMgPSBicC5zaGFmdHNcbiAgICAgIC5maWx0ZXIoKHNoKSA9PiBzaC5jMCA8PSBpIC0gMSAmJiBzaC5jMSA+PSBpICYmIHNoLnggPiA2ICYmIHNoLnggPCBXIC0gOClcbiAgICAgIC5tYXAoKHNoKSA9PiBzaC54KVxuICAgICAgLnNvcnQoKGEsIGMpID0+IGEgLSBjKTtcbiAgICBjb25zdCBzZWdtZW50czogW251bWJlciwgbnVtYmVyXVtdID0gW107XG4gICAgbGV0IGN1ciA9IDY7XG4gICAgZm9yIChjb25zdCBzeCBvZiBjdXRzKSB7XG4gICAgICBpZiAoc3ggLSAxIC0gY3VyICsgMSA+PSA3KSBzZWdtZW50cy5wdXNoKFtjdXIsIHN4IC0gMV0pO1xuICAgICAgY3VyID0gc3ggKyAyO1xuICAgIH1cbiAgICBpZiAoVyAtIDcgLSBjdXIgKyAxID49IDcpIHNlZ21lbnRzLnB1c2goW2N1ciwgVyAtIDddKTtcbiAgICBiYW5kcy5wdXNoKHsgeTAsIHkxLCB1cHBlcjogaSA+IDAsIGxvd2VyOiBpIDwgY3lzLmxlbmd0aCwgc2VnbWVudHMgfSk7XG4gIH1cblxuICBsZXQgc3RhcnRSb29tOiBSb29tIHwgbnVsbCA9IG51bGw7XG4gIGxldCBzdGFpcnNSb29tOiBSb29tIHwgbnVsbCA9IG51bGw7XG4gIGxldCBzdGFpcnNVcCA9IHsgeDogMCwgeTogMCB9O1xuICBsZXQgc3RhaXJzRG93bjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG4gIGNvbnN0IGxvY2tlZCA9IGluZGV4ID4gMCAmJiBpbmRleCAlIDIgPT09IDE7XG5cbiAgZm9yIChjb25zdCBbYmksIGJhbmRdIG9mIGJhbmRzLmVudHJpZXMoKSkge1xuICAgIGNvbnN0IGJhbmRIID0gYmFuZC55MSAtIGJhbmQueTAgKyAxO1xuICAgIGNvbnN0IGlzVG9wID0gYmkgPT09IDA7XG4gICAgY29uc3QgaXNCb3R0b20gPSBiaSA9PT0gYmFuZHMubGVuZ3RoIC0gMTtcbiAgICBsZXQgY2VsbE5vID0gMDtcbiAgICBmb3IgKGNvbnN0IFtzMCwgczFdIG9mIGJhbmQuc2VnbWVudHMpIHtcbiAgICAgIGxldCB4ID0gczA7XG4gICAgICB3aGlsZSAoczEgLSB4ICsgMSA+PSA3KSB7XG4gICAgICAgIGxldCB3ID0gTWF0aC5taW4oNyArIHJuZy5pbnQoNCksIHMxIC0geCArIDEpO1xuICAgICAgICBjb25zdCByZW0gPSBzMSAtICh4ICsgdyAtIDEpO1xuICAgICAgICBpZiAocmVtID4gMCAmJiByZW0gPCA2KSB3ICs9IHJlbTtcbiAgICAgICAgY29uc3QgcmVzZXJ2ZVN0YWlycyA9IGlzVG9wICYmIGNlbGxObyA9PT0gMDtcbiAgICAgICAgY29uc3QgcmVzZXJ2ZVN0YXJ0ID0gaXNCb3R0b20gJiYgY2VsbE5vID09PSAwO1xuICAgICAgICBjb25zdCBpbnRlcmlvclggPSB4ICsgMTtcbiAgICAgICAgY29uc3QgaW50ZXJpb3JXID0gdyAtIDI7XG5cbiAgICAgICAgaWYgKHJlc2VydmVTdGFpcnMgfHwgcmVzZXJ2ZVN0YXJ0KSB7XG4gICAgICAgICAgY29uc3QgcnkgPSByZXNlcnZlU3RhaXJzID8gYmFuZC55MSAtIDUgOiBiYW5kLnkwICsgMTtcbiAgICAgICAgICBjb25zdCByb29tID0gYWRkUm9vbShiLCBpbnRlcmlvclgsIHJ5LCBpbnRlcmlvclcsIDUsIFwic3RhaXJcIiwgcmVzZXJ2ZVN0YWlycyA/IFwic3RhaXJzXCIgOiBcInN0YXJ0XCIsIGRlY2F5LCBzZXJ2aWNlLCBybmcpO1xuICAgICAgICAgIHJvb20ubGl0ID0gdHJ1ZTtcbiAgICAgICAgICBjb25zdCBkeCA9IHggKyAyICsgcm5nLmludChNYXRoLm1heCgxLCB3IC0gNCkpO1xuICAgICAgICAgIGFkZERvb3IoYiwgZHgsIHJlc2VydmVTdGFpcnMgPyBiYW5kLnkxIDogYmFuZC55MCwgcmVzZXJ2ZVN0YWlycyAmJiBsb2NrZWQpO1xuICAgICAgICAgIGlmIChyZXNlcnZlU3RhaXJzKSB7XG4gICAgICAgICAgICBzdGFpcnNVcCA9IHsgeDogeCArIE1hdGguZmxvb3IodyAvIDIpLCB5OiByeSArIDIgfTtcbiAgICAgICAgICAgIGIudGlsZXNbaWR4KHN0YWlyc1VwLngsIHN0YWlyc1VwLnkpXSA9IFRpbGUuU3RhaXJzVXA7XG4gICAgICAgICAgICBzdGFpcnNSb29tID0gcm9vbTtcbiAgICAgICAgICAgIGlmIChpbnRlcmlvclcgPj0gNSkgYWRkUHJvcChiLCBcImJvYXJkXCIsIGludGVyaW9yWCwgcnksIDIsIDEsIHRydWUpO1xuICAgICAgICAgICAgYWRkUHJvcChiLCBcImV4dGluZ3Vpc2hlclwiLCBpbnRlcmlvclggKyBpbnRlcmlvclcgLSAxLCByeSwgMSwgMSwgdHJ1ZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWlyc0Rvd24gPSB7IHg6IHggKyBNYXRoLmZsb29yKHcgLyAyKSwgeTogcnkgKyAzIH07XG4gICAgICAgICAgICBiLnRpbGVzW2lkeChzdGFpcnNEb3duLngsIHN0YWlyc0Rvd24ueSldID0gVGlsZS5TdGFpcnNEb3duO1xuICAgICAgICAgICAgc3RhcnRSb29tID0gcm9vbTtcbiAgICAgICAgICAgIGNvbnN0IG1lZGljaW5lID0gcGxhY2VBbmNob3JlZChiLCByb29tLCB7IGtpbmQ6IFwibWVkYm94XCIsIHc6IDEsIGg6IDEgfSwgMCwgMC43NSk7XG4gICAgICAgICAgICBpZiAobWVkaWNpbmUpIHsgbWVkaWNpbmUubG9vdCA9IFwibWVkXCI7IG1lZGljaW5lLmxhYmVsID0gXCJBcHRlY3prYSBcdTAxNUJjaWVubmFcIjsgfVxuICAgICAgICAgICAgaWYgKGludGVyaW9yVyA+PSA1KSBwbGFjZUFuY2hvcmVkKGIsIHJvb20sIHsga2luZDogXCJiZW5jaFwiLCB3OiAyLCBoOiAxIH0sIDAsIDApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBtaWQgPSBiYW5kLnkwICsgTWF0aC5mbG9vcihiYW5kSCAvIDIpO1xuICAgICAgICAgIGNvbnN0IHVwcGVySCA9IG1pZCAtIGJhbmQueTAgLSAxO1xuICAgICAgICAgIGNvbnN0IGxvd2VySCA9IGJhbmQueTEgLSBtaWQgLSAxO1xuICAgICAgICAgIGNvbnN0IHpvbmVzID0gc2VydmljZSA/IHNlcnZpY2Vab25lcyhybmcpIDogYXBhcnRtZW50Wm9uZXMocm5nLCBkZWNheSk7XG4gICAgICAgICAgaWYgKGJpID09PSAxICYmIGNlbGxObyA8IDIpIHsgem9uZXNbMF0gPSBcIndvcmtzaG9wXCI7IHpvbmVzWzFdID0gXCJzdG9yYWdlXCI7IH1cbiAgICAgICAgICBpZiAoIXNlcnZpY2UgJiYgaXNCb3R0b20gJiYgY2VsbE5vID09PSAxKSB6b25lc1swXSA9IFwiYmVkcm9vbVwiO1xuICAgICAgICAgIGNvbnN0IHZ4ID0geCArIE1hdGguZmxvb3IodyAvIDIpO1xuICAgICAgICAgIGNvbnN0IHNwbGl0TG93ZXIgPSB3ID49IDkgJiYgbG93ZXJIID49IDIgJiYgcm5nLmNoYW5jZSgwLjYyKTtcbiAgICAgICAgICBjb25zdCBzcGxpdFVwcGVyID0gdyA+PSAxMiAmJiB1cHBlckggPj0gMiAmJiBybmcuY2hhbmNlKDAuNSk7XG4gICAgICAgICAgY29uc3QgYW55U3BsaXQgPSBzcGxpdExvd2VyIHx8IHNwbGl0VXBwZXI7XG4gICAgICAgICAgbGV0IGR4ID0geCArIDIgKyBybmcuaW50KE1hdGgubWF4KDEsIHcgLSA0KSk7XG4gICAgICAgICAgaWYgKGFueVNwbGl0ICYmIGR4ID09PSB2eCkgZHggPSB2eCArIDE7XG4gICAgICAgICAgbGV0IGdhcFggPSB4ICsgMiArIHJuZy5pbnQoTWF0aC5tYXgoMSwgdyAtIDQpKTtcbiAgICAgICAgICBpZiAoYW55U3BsaXQgJiYgZ2FwWCA9PT0gdngpIGdhcFggPSB2eCAtIDE7XG4gICAgICAgICAgY29uc3QgYmFyVXAgPSAhc2VydmljZSAmJiBybmcuY2hhbmNlKDAuMik7XG4gICAgICAgICAgY29uc3QgYmFyTG8gPSAhc2VydmljZSAmJiBybmcuY2hhbmNlKDAuMik7XG5cbiAgICAgICAgICBpZiAodXBwZXJIID49IDIgJiYgbG93ZXJIID49IDIpIHtcbiAgICAgICAgICAgIGlmIChiYW5kLnVwcGVyKSBhZGREb29yKGIsIGR4LCBiYW5kLnkwLCBmYWxzZSwgYmFyVXApO1xuICAgICAgICAgICAgaWYgKGJhbmQubG93ZXIpIGFkZERvb3IoYiwgZHgsIGJhbmQueTEsIGZhbHNlLCBiYXJMbyk7XG5cbiAgICAgICAgICAgIGNvbnN0IG1ha2VQYWlyID0gKHlUb3A6IG51bWJlciwgaGg6IG51bWJlciwgekE6IFpvbmUsIHpCOiBab25lLCBzcGxpdDogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICBpZiAoc3BsaXQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsZWZ0VyA9IHZ4IC0gaW50ZXJpb3JYO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJpZ2h0VyA9IGludGVyaW9yWCArIGludGVyaW9yVyAtIHZ4IC0gMTtcbiAgICAgICAgICAgICAgICBhZGRSb29tKGIsIGludGVyaW9yWCwgeVRvcCwgbGVmdFcsIGhoLCB6QSwgXCJub3JtYWxcIiwgZGVjYXksIHNlcnZpY2UsIHJuZyk7XG4gICAgICAgICAgICAgICAgYWRkUm9vbShiLCB2eCArIDEsIHlUb3AsIHJpZ2h0VywgaGgsIHpCLCBcIm5vcm1hbFwiLCBkZWNheSwgc2VydmljZSwgcm5nKTtcbiAgICAgICAgICAgICAgICBjb25zdCBneSA9IHlUb3AgKyBybmcuaW50KGhoKTtcbiAgICAgICAgICAgICAgICBpZiAocm5nLmNoYW5jZSgwLjUpKSBhZGREb29yKGIsIHZ4LCBneSwgZmFsc2UpO1xuICAgICAgICAgICAgICAgIGVsc2UgYWRkQnJlYWNoKGIsIHZ4LCBneSwgYi5mbG9vclN0eWxlW2lkeChpbnRlcmlvclgsIHlUb3ApXSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYWRkUm9vbShiLCBpbnRlcmlvclgsIHlUb3AsIGludGVyaW9yVywgaGgsIHpBLCBcIm5vcm1hbFwiLCBkZWNheSwgc2VydmljZSwgcm5nKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIG1ha2VQYWlyKGJhbmQueTAgKyAxLCB1cHBlckgsIHpvbmVzWzBdLCB6b25lc1szXSwgc3BsaXRVcHBlcik7XG4gICAgICAgICAgICAvLyBwcnplalx1MDE1QmNpZSBtaVx1MDExOWR6eSBnXHUwMEYzcm5cdTAxMDUgYSBkb2xuXHUwMTA1IGN6XHUwMTE5XHUwMTVCY2lcdTAxMDUgbWllc3prYW5pYVxuICAgICAgICAgICAgY29uc3QgdWZzID0gYi5mbG9vclN0eWxlW2lkeChpbnRlcmlvclgsIGJhbmQueTAgKyAxKV07XG4gICAgICAgICAgICBpZiAocm5nLmNoYW5jZSgwLjQ1IC0gZGVjYXkgKiAwLjI1KSkgYWRkRG9vcihiLCBnYXBYLCBtaWQsIGZhbHNlKTtcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICBhZGRCcmVhY2goYiwgZ2FwWCwgbWlkLCB1ZnMpO1xuICAgICAgICAgICAgICBpZiAoZ2FwWCArIDEgPCBpbnRlcmlvclggKyBpbnRlcmlvclcgJiYgZ2FwWCArIDEgIT09IHZ4ICYmIHJuZy5jaGFuY2UoMC40NSkpIGFkZEJyZWFjaChiLCBnYXBYICsgMSwgbWlkLCB1ZnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWFrZVBhaXIobWlkICsgMSwgbG93ZXJILCB6b25lc1sxXSwgem9uZXNbMl0sIHNwbGl0TG93ZXIpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoYmFuZEggLSAyID49IDMpIHtcbiAgICAgICAgICAgIGlmIChiYW5kLnVwcGVyKSBhZGREb29yKGIsIGR4LCBiYW5kLnkwLCBmYWxzZSwgYmFyVXApO1xuICAgICAgICAgICAgaWYgKGJhbmQubG93ZXIpIGFkZERvb3IoYiwgZHgsIGJhbmQueTEsIGZhbHNlLCBiYXJMbyk7XG4gICAgICAgICAgICBhZGRSb29tKGIsIGludGVyaW9yWCwgYmFuZC55MCArIDEsIGludGVyaW9yVywgYmFuZEggLSAyLCB6b25lc1swXSwgXCJub3JtYWxcIiwgZGVjYXksIHNlcnZpY2UsIHJuZyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHggKz0gdyAtIDE7XG4gICAgICAgIGNlbGxObysrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmICghc3RhcnRSb29tIHx8ICFzdGFpcnNSb29tKSByZXR1cm4gbnVsbDtcbiAgLy8gQ29tcGxldGUgZXZlcnkgZG9vcndheSBiZWZvcmUgZnVybmlzaGluZyBzbyB0aGF0IGFsbCBhY2Nlc3MgbGFuZXMgc3RheSBmcmVlLlxuICBmb3IgKGNvbnN0IHJvb20gb2YgYi5yb29tcykgZnVybmlzaFJvb20oYiwgcm9vbSwgYi56b25lc1tyb29tLmlkXSwgZGVjYXkpO1xuXG4gIC8vIERla29yYWNqZSBrb3J5dGFyenkgKG5pZSBwcnp5IHdlalx1MDE1QmNpYWNoIGRvIHN6eWJcdTAwRjN3IGkgZHJ6d2kpXG4gIGZvciAoY29uc3QgY3kgb2YgY3lzKSB7XG4gICAgY29uc3QgZGVjbzogUHJvcEtpbmRbXSA9IHNlcnZpY2VcbiAgICAgID8gW1wibWFpbGJveFwiLCBcImJvYXJkXCIsIFwiYmVuY2hcIiwgXCJleHRpbmd1aXNoZXJcIiwgXCJiaWtlXCIsIFwiZXh0aW5ndWlzaGVyXCIsIFwibWFpbGJveFwiXVxuICAgICAgOiBbXCJyYWRpYXRvclwiLCBcImV4dGluZ3Vpc2hlclwiLCBcImJvYXJkXCIsIFwiYmlrZVwiLCBcImJlbmNoXCIsIFwicGxhbnRcIiwgXCJyYWRpYXRvclwiXTtcbiAgICBmb3IgKGxldCB4ID0gMTA7IHggPCBXIC0gMTA7IHggKz0gOSkge1xuICAgICAgY29uc3Qga2luZCA9IHJuZy5waWNrKGRlY28pO1xuICAgICAgY29uc3QgcHcgPSBraW5kID09PSBcIm1haWxib3hcIiB8fCBraW5kID09PSBcImJvYXJkXCIgfHwga2luZCA9PT0gXCJiZW5jaFwiIHx8IGtpbmQgPT09IFwiYmlrZVwiID8gMiA6IDE7XG4gICAgICBjb25zdCB5ID0gcm5nLmNoYW5jZSgwLjUpID8gY3kgOiBjeSArIDI7XG4gICAgICBsZXQgb2sgPSB0cnVlO1xuICAgICAgZm9yIChsZXQgeHggPSB4IC0gMTsgeHggPD0geCArIHB3OyB4eCsrKSB7XG4gICAgICAgIGlmIChiLnRpbGVzW2lkeCh4eCwgeSldICE9PSBUaWxlLkZsb29yIHx8IGIub2NjW2lkeCh4eCwgeSldKSBvayA9IGZhbHNlO1xuICAgICAgICBpZiAoUEFTU0FCTEUuaGFzKGIudGlsZXNbaWR4KHh4LCBjeSAtIDEpXSkgfHwgUEFTU0FCTEUuaGFzKGIudGlsZXNbaWR4KHh4LCBjeSArIDMpXSkpIG9rID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoIW9rKSBjb250aW51ZTtcbiAgICAgIGFkZFByb3AoYiwga2luZCwgeCwgeSwgcHcsIDEsIHRydWUpO1xuICAgIH1cbiAgfVxuXG4gIGFkZFN1cmZhY2VEZXRhaWxzKGIsIHJuZywgaW5kZXgsIGRlY2F5KTtcbiAgc2VhbFJvb21zKGIpO1xuICBwYWludFdhbGxCb3JkZXJzKGIsIGRlY2F5LCBzZXJ2aWNlKTtcbiAgcGxhY2VXaW5kb3dzKGIsIHJuZywgZGVjYXkpO1xuICBidWlsZExpZ2h0cyhiLCBybmcsIGRlY2F5LCBjeXMpO1xuXG4gIGlmICghc3RvY2tGbG9vcihiLCBpbmRleCwgbG9ja2VkLCBzdGFydFJvb20pKSByZXR1cm4gbnVsbDtcblxuICAvLyBSZXNldHVqIHJlemVyd2FjamU7IHpvc3Rhalx1MDEwNSB0eWxrbyByZWFsbmUgbWVibGVcbiAgYi5vY2MuZmlsbCgwKTtcbiAgZm9yIChjb25zdCBwIG9mIGIucHJvcHMpIHtcbiAgICBpZiAoIXAuc29saWQpIGNvbnRpbnVlO1xuICAgIGZvciAobGV0IHl5ID0gcC55OyB5eSA8IHAueSArIHAuaDsgeXkrKykgZm9yIChsZXQgeHggPSBwLng7IHh4IDwgcC54ICsgcC53OyB4eCsrKSBpZiAoaW5iKHh4LCB5eSkpIGIub2NjW2lkeCh4eCwgeXkpXSA9IDE7XG4gIH1cblxuICBjYXJ2ZUV4dHJhQnJlYWNoZXMoYiwgcm5nLCBkZWNheSk7XG4gIHNwYXduQ29ycHNlcyhiLCBybmcsIGluZGV4KTtcbiAgc3Bhd25TdXJ2aXZvcnMoYiwgcm5nLCBpbmRleCwgc3RhcnRSb29tKTtcbiAgY29uc3Qgc3Bhd25zID0gc3Bhd25ab21iaWVzKGIsIHJuZywgaW5kZXgsIHN0YXJ0Um9vbSk7XG4gIGNvbnN0IHNyOiBSb29tID0gc3RhcnRSb29tO1xuICBjb25zdCBwYyA9IHsgeDogc3IueCArIDIsIHk6IHNyLnkgKyAyIH07XG4gIHJldHVybiB7XG4gICAgaW5kZXgsXG4gICAgdGhlbWU6IG1ldGEudGhlbWUsXG4gICAgbmFtZTogbWV0YS5uYW1lLFxuICAgIHN1YjogYCR7bWV0YS5zdWJ9IFx1MDBCNyAke2JwLm5hbWV9YCxcbiAgICBzZWVkLFxuICAgIHc6IFcsXG4gICAgaDogSCxcbiAgICB0aWxlczogYi50aWxlcyxcbiAgICBmbG9vclN0eWxlOiBiLmZsb29yU3R5bGUsXG4gICAgd2FsbFN0eWxlOiBiLndhbGxTdHlsZSxcbiAgICByb29tczogYi5yb29tcyxcbiAgICByb29tWm9uZXM6IGIucm9vbVpvbmVzLFxuICAgIHJvb21PZjogYi5yb29tT2YsXG4gICAgcHJvcHM6IGIucHJvcHMsXG4gICAgZG9vcnM6IGIuZG9vcnMsXG4gICAgem9tYmllczogc3Bhd25zLFxuICAgIHdpbmRvd3M6IGIud2luZG93cyxcbiAgICBkZWNhbHM6IGIuZGVjYWxzLFxuICAgIHdhbGxEZWNhbHM6IGIud2FsbERlY2FscyxcbiAgICBicmVhY2hlczogYi5icmVhY2hlcyxcbiAgICBjb3Jwc2VzOiBiLmNvcnBzZXMsXG4gICAgc3Vydml2b3JzOiBiLnN1cnZpdm9ycyxcbiAgICBsaWdodHM6IGIubGlnaHRzLFxuICAgIHBsYXllclN0YXJ0OiB7IHg6IChwYy54ICsgMC41KSAqIFRJTEUsIHk6IChwYy55ICsgMC41KSAqIFRJTEUgfSxcbiAgICBzdGFpcnNVcCxcbiAgICBzdGFpcnNEb3duOiBpbmRleCA+IDAgPyBzdGFpcnNEb3duIDogbnVsbCxcbiAgICBsb2NrZWQsXG4gICAga2V5UHJvcElkOiBiLnByb3BzLmZpbmQoKHApID0+IHAubG9vdCA9PT0gXCJrZXlcIik/LmlkID8/IG51bGwsXG4gICAgZmxhcmU6IG51bGwsXG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBMQVlPVVRfRkFNSUxJRVMgPSBbXCJQT0RcdTAwQzlTVFlcIiwgXCJQSUVSXHUwMTVBQ0lFXHUwMTQzXCIsIFwiRFdBIFNLUlpZRFx1MDE0MUFcIiwgXCJcdTAxNDFBTUFORSBLT1JZVEFSWkVcIiwgXCJNSUVTWktBTklBIFBSWkVDSE9ETklFXCIsIFwiQlJZXHUwMTQxQSBML1VcIiwgXCJXU1BcdTAwRDNMTlkgSE9MXCJdIGFzIGNvbnN0O1xuXG5leHBvcnQgZnVuY3Rpb24gbGF5b3V0UHJvZmlsZShzZWVkOiBudW1iZXIsIGZsb29yID0gMCkge1xuICBjb25zdCBybmcgPSBtYWtlUm5nKChzZWVkICsgZmxvb3IgKiAxMzEpIF4gMHgyYTcxOWQzYik7XG4gIHJldHVybiB7IGZhbWlseTogcm5nLmludChMQVlPVVRfRkFNSUxJRVMubGVuZ3RoKSwgc3RhcnQ6IHJuZy5pbnQoNikgfTtcbn1cblxuY29uc3QgU1RBSVJfQU5DSE9SUyA9IFtcbiAgeyB4OiAxMCwgeTogOSB9LCB7IHg6IDQzLCB5OiA5IH0sIHsgeDogMTAsIHk6IDc3IH0sXG4gIHsgeDogNDMsIHk6IDc3IH0sIHsgeDogMjAsIHk6IDkgfSwgeyB4OiAzNSwgeTogNzcgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBzdGFpckFuY2hvcihzZWVkOiBudW1iZXIsIGJvdW5kYXJ5OiBudW1iZXIpIHtcbiAgaWYgKGJvdW5kYXJ5ID09PSA5KSByZXR1cm4geyB4OiAxNSwgeTogNjYgfTsgLy8gcm9vZidzIHBoeXNpY2FsIGFycml2YWxcbiAgcmV0dXJuIFNUQUlSX0FOQ0hPUlNbTWF0aC5mbG9vcihoYXNoMihzZWVkLCBib3VuZGFyeSwgNzc3KSAqIFNUQUlSX0FOQ0hPUlMubGVuZ3RoKV07XG59XG5cbnR5cGUgQ2VsbCA9IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbmNvbnN0IGRpc3RDZWxsID0gKGE6IENlbGwsIGM6IENlbGwpID0+IE1hdGguYWJzKGEueCAtIGMueCkgKyBNYXRoLmFicyhhLnkgLSBjLnkpO1xuXG4vKiogVG9wb2xvZ3kgZmlyc3Q6IHJvb21zLCBzaGFmdHMgYW5kIG1hbmRhdG9yeSByb3V0ZXMgYXJlIHBsYWNlZCBiZWZvcmUgYW55IGZ1cm5pdHVyZSBvciBsb290LiAqL1xuZnVuY3Rpb24gYnVpbGRWYXJpZWRGbG9vcihpbmRleDogbnVtYmVyLCBzZWVkOiBudW1iZXIsIGJ1aWxkaW5nU2VlZDogbnVtYmVyKTogRmxvb3JEYXRhIHwgbnVsbCB7XG4gIGNvbnN0IG1ldGEgPSBGTE9PUl9NRVRBW2luZGV4XTtcbiAgY29uc3Qgcm5nID0gbWFrZVJuZyhzZWVkIF4gMHgyYTcxOWQzYik7XG4gIGNvbnN0IHByb2ZpbGUgPSBsYXlvdXRQcm9maWxlKGJ1aWxkaW5nU2VlZCwgaW5kZXgpO1xuICBjb25zdCBmYW1pbHkgPSBwcm9maWxlLmZhbWlseTtcbiAgY29uc3QgYiA9IG5ld0J1aWxkKCk7XG4gIGNvbnN0IHNlcnZpY2UgPSBpbmRleCA8PSAxO1xuICBjb25zdCByZXNlcnZlZCA9IG5ldyBVaW50OEFycmF5KFcgKiBIKTtcbiAgY29uc3QgZ3JhcGggPSBuZXcgVWludDhBcnJheShXICogSCk7XG4gIGNvbnN0IGxpbmUgPSAoYTogQ2VsbCwgYzogQ2VsbCwgd2lkdGggPSAyKSA9PiB7XG4gICAgY29uc3QgbWluWCA9IE1hdGgubWluKGEueCwgYy54KSwgbWluWSA9IE1hdGgubWluKGEueSwgYy55KTtcbiAgICBjb25zdCBzcGFuWCA9IE1hdGguYWJzKGEueCAtIGMueCksIHNwYW5ZID0gTWF0aC5hYnMoYS55IC0gYy55KTtcbiAgICBpZiAoc3BhblggJiYgc3BhblkpIHJldHVybjtcbiAgICBmb3IgKGxldCB5ID0gbWluWTsgeSA8PSBtaW5ZICsgc3Bhblk7IHkrKykgZm9yIChsZXQgeCA9IG1pblg7IHggPD0gbWluWCArIHNwYW5YOyB4KyspIHtcbiAgICAgIGZvciAobGV0IHl5ID0geTsgeXkgPCB5ICsgd2lkdGg7IHl5KyspIGZvciAobGV0IHh4ID0geDsgeHggPCB4ICsgd2lkdGg7IHh4KyspIHtcbiAgICAgICAgaWYgKHh4IDwgNCB8fCB4eCA+PSBXIC0gNCB8fCB5eSA8IDQgfHwgeXkgPj0gSCAtIDQgfHwgcmVzZXJ2ZWRbaWR4KHh4LCB5eSldKSBjb250aW51ZTtcbiAgICAgICAgZ3JhcGhbaWR4KHh4LCB5eSldID0gMTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIGNvbnN0IGNlbnRyZXM6IENlbGxbXSA9IFtdO1xuICBjb25zdCBjb2wgPSBbMTAgKyBybmcuaW50KDYpLCAyNSArIHJuZy5pbnQoNyksIDM5ICsgcm5nLmludCg2KV07XG4gIGNvbnN0IHJvdyA9IFsxNiArIHJuZy5pbnQoOCksIDM5ICsgcm5nLmludCgxMCksIDYzICsgcm5nLmludCg4KV07XG4gIGZvciAobGV0IGogPSAwOyBqIDwgMzsgaisrKSBmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xuICAgIGNlbnRyZXMucHVzaCh7IHg6IGNvbFtpXSArIChpID09PSAxID8gcm5nLmludCg1KSAtIDIgOiAwKSwgeTogcm93W2pdICsgKGogPT09IDEgPyBybmcuaW50KDUpIC0gMiA6IDApIH0pO1xuICB9XG4gIGNvbnN0IHVwID0gc3RhaXJBbmNob3IoYnVpbGRpbmdTZWVkLCBpbmRleCk7XG4gIGxldCBkb3duID0gaW5kZXggPiAwID8gc3RhaXJBbmNob3IoYnVpbGRpbmdTZWVkLCBpbmRleCAtIDEpIDogbnVsbDtcbiAgLy8gVHdvIGNvbnNlY3V0aXZlIGFuY2hvcnMgbXVzdCBub3Qgb3ZlcmxhcDsgc2VsZWN0IGEgZGV0ZXJtaW5pc3RpYyBuZWlnaGJvdXIgaWYgbmVlZGVkLlxuICBpZiAoZG93biAmJiBkaXN0Q2VsbChkb3duLCB1cCkgPCAxMSkgZG93biA9IFNUQUlSX0FOQ0hPUlNbKFNUQUlSX0FOQ0hPUlMuZmluZEluZGV4KChwKSA9PiBwLnggPT09IGRvd24hLnggJiYgcC55ID09PSBkb3duIS55KSArIDMpICUgU1RBSVJfQU5DSE9SUy5sZW5ndGhdO1xuICBpZiAoZG93biAmJiBkaXN0Q2VsbChkb3duLCB1cCkgPCAxMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHByb3RlY3RlZFJvb21zID0gW3VwLCAuLi4oZG93biA/IFtkb3duXSA6IFtdKV07XG4gIGZvciAoY29uc3QgcCBvZiBwcm90ZWN0ZWRSb29tcykgZm9yIChsZXQgeSA9IHAueSAtIDM7IHkgPD0gcC55ICsgMzsgeSsrKSBmb3IgKGxldCB4ID0gcC54IC0gMzsgeCA8PSBwLnggKyAzOyB4KyspIHtcbiAgICBpZiAoaW5iKHgsIHkpKSByZXNlcnZlZFtpZHgoeCwgeSldID0gMTtcbiAgfVxuXG4gIC8vIFNldmVuIGdyYXBoIGZhbWlsaWVzIHVzZSBkaWZmZXJlbnQgZWRnZSBzZXRzLCBub2RlIHBvc2l0aW9ucyBhbmQgb3B0aW9uYWwgbG9vcHMuXG4gIGNvbnN0IGZhbWlsaWVzOiBbbnVtYmVyLCBudW1iZXJdW11bXSA9IFtcbiAgICBbWzAsMV0sWzEsMl0sWzAsM10sWzIsNV0sWzMsNF0sWzQsN10sWzUsOF0sWzYsN10sWzcsOF1dLFxuICAgIFtbMCwxXSxbMSwyXSxbMiw1XSxbNSw4XSxbOCw3XSxbNyw2XSxbNiwzXSxbMywwXSxbMSw0XSxbNCw3XV0sXG4gICAgW1swLDNdLFszLDZdLFsyLDVdLFs1LDhdLFszLDRdLFs0LDVdLFswLDFdLFsxLDJdLFs2LDddXSxcbiAgICBbWzAsMV0sWzEsNF0sWzQsM10sWzMsNl0sWzYsN10sWzcsOF0sWzgsNV0sWzUsMl0sWzQsNV1dLFxuICAgIFtbMCwzXSxbMyw2XSxbMyw0XSxbNCw3XSxbNyw4XSxbNCw1XSxbNSwyXSxbMSwyXV0sXG4gICAgW1swLDFdLFsxLDJdLFsyLDVdLFs1LDhdLFs4LDddLFs3LDZdLFs2LDNdLFszLDRdLFs0LDVdXSxcbiAgICBbWzQsMV0sWzQsM10sWzQsNV0sWzQsN10sWzAsMV0sWzEsMl0sWzMsNl0sWzUsOF0sWzYsN11dLFxuICBdO1xuICBsZXQgZWRnZXMgPSBmYW1pbGllc1tmYW1pbHldLnNsaWNlKCk7XG4gIGlmIChybmcuY2hhbmNlKDAuNDUpKSBlZGdlcy5zcGxpY2Uocm5nLmludChlZGdlcy5sZW5ndGgpLCAxLCBybmcucGljayhlZGdlcykpO1xuICBpZiAoZmFtaWx5ICE9PSAxICYmIHJuZy5jaGFuY2UoMC42KSkgZWRnZXMucHVzaChybmcucGljayhbWzAsMV0sWzEsMl0sWzMsNF0sWzQsNV0sWzYsN10sWzcsOF0sWzAsM10sWzEsNF0sWzIsNV0sWzMsNl0sWzQsN10sWzUsOF1dKSk7XG4gIGZvciAoY29uc3QgW2EsIGNdIG9mIGVkZ2VzKSB7XG4gICAgY29uc3Qgc3RhcnQgPSBjZW50cmVzW2FdLCBlbmQgPSBjZW50cmVzW2NdO1xuICAgIGNvbnN0IGJyb2FkID0gZmFtaWx5ID09PSA2ICYmIChhID09PSA0IHx8IGMgPT09IDQpID8gNCA6IGZhbWlseSA9PT0gMSA/IDMgOiAyO1xuICAgIGlmIChzdGFydC54ID09PSBlbmQueCB8fCBzdGFydC55ID09PSBlbmQueSkgbGluZShzdGFydCwgZW5kLCBicm9hZCk7XG4gICAgZWxzZSBpZiAocm5nLmNoYW5jZSgwLjUpKSB7IGxpbmUoc3RhcnQsIHsgeDogZW5kLngsIHk6IHN0YXJ0LnkgfSwgYnJvYWQpOyBsaW5lKHsgeDogZW5kLngsIHk6IHN0YXJ0LnkgfSwgZW5kLCBicm9hZCk7IH1cbiAgICBlbHNlIHsgbGluZShzdGFydCwgeyB4OiBzdGFydC54LCB5OiBlbmQueSB9LCBicm9hZCk7IGxpbmUoeyB4OiBzdGFydC54LCB5OiBlbmQueSB9LCBlbmQsIGJyb2FkKTsgfVxuICB9XG4gIGZvciAoY29uc3QgcCBvZiBjZW50cmVzKSBsaW5lKHAsIHAsIGZhbWlseSA9PT0gNiAmJiBkaXN0Q2VsbChwLCBjZW50cmVzWzRdKSA8IDIgPyA2IDogMyk7XG4gIC8vIEZpeGVkIGZhY2FkZSBzaGFmdHMgYXJlIGNvbnNpc3RlbnQgYmV0d2VlbiBmbG9vcnMgYnV0IHRoZWlyIGFwcHJvYWNoZXMgdmFyeS5cbiAgZm9yIChjb25zdCBlbmRwb2ludCBvZiBbeyB4OiA0LCB5OiA0MyB9LCB7IHg6IDUxLCB5OiAxOSB9LCB7IHg6IDUxLCB5OiAzNSB9XSkge1xuICAgIGNvbnN0IHRhcmdldCA9IGNlbnRyZXMuc2xpY2UoKS5zb3J0KChhLCBjKSA9PiBkaXN0Q2VsbChhLCBlbmRwb2ludCkgLSBkaXN0Q2VsbChjLCBlbmRwb2ludCkpWzBdO1xuICAgIGxpbmUoZW5kcG9pbnQsIHsgeDogdGFyZ2V0LngsIHk6IGVuZHBvaW50LnkgfSwgMik7XG4gICAgbGluZSh7IHg6IHRhcmdldC54LCB5OiBlbmRwb2ludC55IH0sIHRhcmdldCwgMik7XG4gIH1cbiAgLy8gU2hvcnQgZmFjYWRlIGdhbGxlcmllcyBwcm92aWRlIHNpdGVzIGZvciBoaWRkZW4gcm9vbXMgd2l0aG91dCByZXN0b3JpbmcgYSBmdWxsLWxlbmd0aCB0cnVuay5cbiAgZm9yIChjb25zdCBbZWRnZSwgYmFzZV0gb2YgW1s0LCAyNV0sIFs1MCwgMjVdLCBbNCwgNTZdLCBbNTAsIDU2XV0gYXMgY29uc3QpIHtcbiAgICBjb25zdCB5ID0gYmFzZSArIHJuZy5pbnQoMTApIC0gNTtcbiAgICBsaW5lKHt4OmVkZ2UseX0se3g6ZWRnZSx5OnkrMTJ9LDIpO1xuICAgIGNvbnN0IG1pZHBvaW50PXt4OmVkZ2UseTp5KzR9O1xuICAgIGNvbnN0IG5lYXI9Y2VudHJlcy5zbGljZSgpLnNvcnQoKGEsYyk9PmRpc3RDZWxsKGEsbWlkcG9pbnQpLWRpc3RDZWxsKGMsbWlkcG9pbnQpKVswXTtcbiAgICBsaW5lKG1pZHBvaW50LHt4Om5lYXIueCx5Om1pZHBvaW50Lnl9LDIpO1xuICAgIGxpbmUoe3g6bmVhci54LHk6bWlkcG9pbnQueX0sbmVhciwyKTtcbiAgfVxuICAvLyBJbnRlcnNlY3RpbmcgY29ycmlkb3Igc3RyaXBzIGFyZSByZXByZXNlbnRlZCBhcyBpbmRpdmlkdWFsIHJvb21zIGZvciBsb2NhbCBsaWdodGluZyBhbmQgem9uZXMuXG4gIGNvbnN0IHZpc2l0ZWQgPSBuZXcgVWludDhBcnJheShXICogSCk7XG4gIGZvciAobGV0IHkgPSA0OyB5IDwgSCAtIDQ7IHkrKykgZm9yIChsZXQgeCA9IDQ7IHggPCBXIC0gNDsgeCsrKSB7XG4gICAgaWYgKCFncmFwaFtpZHgoeCx5KV0gfHwgdmlzaXRlZFtpZHgoeCx5KV0pIGNvbnRpbnVlO1xuICAgIGxldCB3ID0gMTtcbiAgICB3aGlsZSAoeCt3IDwgVy00ICYmIGdyYXBoW2lkeCh4K3cseSldICYmICF2aXNpdGVkW2lkeCh4K3cseSldICYmIHcgPCAxMCkgdysrO1xuICAgIGZvciAobGV0IHh4PXg7eHg8eCt3O3h4KyspIHZpc2l0ZWRbaWR4KHh4LHkpXT0xO1xuICAgIGNvbnN0IHIgPSBhZGRSb29tKGIseCx5LHcsMSxcImNvcnJpZG9yXCIsXCJub3JtYWxcIixtZXRhLmRlY2F5LHNlcnZpY2Uscm5nKTtcbiAgICByLmxpdD10cnVlO1xuICB9XG4gIC8vIEtlZXAgZXZlcnkgZ3JhcGggdGlsZSBldmVuIHdoZXJlIHRoZSBzdHJpcHMgY3Jvc3MgcmVzZXJ2ZWQgYXJlYXMuXG4gIGZvciAobGV0IHk9NDt5PEgtNDt5KyspIGZvcihsZXQgeD00O3g8Vy00O3grKykgaWYoZ3JhcGhbaWR4KHgseSldKSBiLnRpbGVzW2lkeCh4LHkpXT1UaWxlLkZsb29yO1xuXG4gIGNvbnN0IHN0YWlyUm9vbXM6IFJvb21bXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrLHBdIG9mIHByb3RlY3RlZFJvb21zLmVudHJpZXMoKSkge1xuICAgIGNvbnN0IHI9YWRkUm9vbShiLHAueC0yLHAueS0yLDUsNSxcInN0YWlyXCIsaz09PTA/XCJzdGFpcnNcIjpcInN0YXJ0XCIsbWV0YS5kZWNheSxzZXJ2aWNlLHJuZyk7XG4gICAgci5saXQ9dHJ1ZTtcbiAgICBzdGFpclJvb21zLnB1c2gocik7XG4gICAgYi50aWxlc1tpZHgocC54LHAueSldID0gaz09PTA/VGlsZS5TdGFpcnNVcDpUaWxlLlN0YWlyc0Rvd247XG4gICAgLy8gQ29ubmVjdCB0aGUgbGFuZGluZyB0aHJvdWdoIG9uZSBkZWxpYmVyYXRlIGRvb3J3YXkgYW5kIGEgc2hvcnQgc3B1ci5cbiAgICBjb25zdCB0YXJnZXRzPWNlbnRyZXMuc2xpY2UoKS5zb3J0KChhLGMpPT5kaXN0Q2VsbChhLHApLWRpc3RDZWxsKGMscCkpO1xuICAgIGNvbnN0IHRhcmdldD10YXJnZXRzWzBdO1xuICAgIGNvbnN0IGR4PXRhcmdldC54LXAueCxkeT10YXJnZXQueS1wLnk7XG4gICAgY29uc3QgZG9vcj0gTWF0aC5hYnMoZHgpPk1hdGguYWJzKGR5KSA/IHt4OnAueCsoZHg+MD8zOi0zKSx5OnAueX0gOiB7eDpwLngseTpwLnkrKGR5PjA/MzotMyl9O1xuICAgIGNvbnN0IG91dHNpZGU9e3g6ZG9vci54Kyhkb29yLngtcC54P01hdGguc2lnbihkb29yLngtcC54KTowKSx5OmRvb3IueSsoZG9vci55LXAueT9NYXRoLnNpZ24oZG9vci55LXAueSk6MCl9O1xuICAgIGxpbmUob3V0c2lkZSx7eDp0YXJnZXQueCx5Om91dHNpZGUueX0sMik7XG4gICAgbGluZSh7eDp0YXJnZXQueCx5Om91dHNpZGUueX0sdGFyZ2V0LDIpO1xuICAgIC8vIFJlLWNhcnZlIGp1c3QgdGhpcyBzcHVyIHdpdGhvdXQgY3Jvc3NpbmcgYW55IG9mIHRoZSBwcm90ZWN0ZWQgc3RhaXIgaW50ZXJpb3JzLlxuICAgIGZvcihsZXQgeXk9NDt5eTxILTQ7eXkrKylmb3IobGV0IHh4PTQ7eHg8Vy00O3h4KyspaWYoZ3JhcGhbaWR4KHh4LHl5KV0mJiFyZXNlcnZlZFtpZHgoeHgseXkpXSYmYi50aWxlc1tpZHgoeHgseXkpXT09PVRpbGUuV2FsbCl7XG4gICAgICBiLnRpbGVzW2lkeCh4eCx5eSldPVRpbGUuRmxvb3I7Yi5mbG9vclN0eWxlW2lkeCh4eCx5eSldPTM7XG4gICAgfVxuICAgIGFkZERvb3IoYixkb29yLngsZG9vci55LGs9PT0wICYmIGluZGV4PjAgJiYgaW5kZXglMj09PTEpO1xuICB9XG5cbiAgLy8gUm9vbXMgYXJlIHBhY2tlZCBpbnRvIHRoZSBzcGFjZXMgbGVmdCBieSB0aGUgYWN0dWFsIGNvbm5lY3RlZCBjaXJjdWxhdGlvbiBncmFwaC5cbiAgY29uc3Qgcm9vbXNBZGRlZDogUm9vbVtdPVtdO1xuICBjb25zdCBjYW5Sb29tPSh4Om51bWJlcix5Om51bWJlcix3Om51bWJlcixoOm51bWJlcik9PntcbiAgICBpZih4PDZ8fHk8NXx8eCt3PlctNnx8eStoPkgtNSlyZXR1cm4gZmFsc2U7XG4gICAgZm9yKGxldCB5eT15LTE7eXk8PXkraDt5eSsrKWZvcihsZXQgeHg9eC0xO3h4PD14K3c7eHgrKykgaWYoYi50aWxlc1tpZHgoeHgseXkpXSE9PVRpbGUuV2FsbHx8cmVzZXJ2ZWRbaWR4KHh4LHl5KV0pcmV0dXJuIGZhbHNlO1xuICAgIGZvcihsZXQgeXk9eTt5eTx5K2g7eXkrKykgaWYoUEFTU0FCTEUuaGFzKGIudGlsZXNbaWR4KHgtMix5eSldKXx8UEFTU0FCTEUuaGFzKGIudGlsZXNbaWR4KHgrdysxLHl5KV0pKXJldHVybiB0cnVlO1xuICAgIGZvcihsZXQgeHg9eDt4eDx4K3c7eHgrKykgaWYoUEFTU0FCTEUuaGFzKGIudGlsZXNbaWR4KHh4LHktMildKXx8UEFTU0FCTEUuaGFzKGIudGlsZXNbaWR4KHh4LHkraCsxKV0pKXJldHVybiB0cnVlO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcbiAgZm9yKGxldCBhdHRlbXB0cz0wO2F0dGVtcHRzPDE1MDAmJnJvb21zQWRkZWQubGVuZ3RoPDU1O2F0dGVtcHRzKyspe1xuICAgIGNvbnN0IHc9NCtybmcuaW50KGZhbWlseT09PTI/OTpmYW1pbHk9PT0wPzQ6NyksaD0zK3JuZy5pbnQoZmFtaWx5PT09ND84OjcpO1xuICAgIGNvbnN0IHg9NitybmcuaW50KFctMTItdykseT01K3JuZy5pbnQoSC0xMC1oKTtcbiAgICBpZighY2FuUm9vbSh4LHksdyxoKSljb250aW51ZTtcbiAgICBjb25zdCB6b25lPXNlcnZpY2U/cm5nLnBpY2soc2VydmljZVpvbmVzKHJuZykpOnJuZy5waWNrKGFwYXJ0bWVudFpvbmVzKHJuZyxtZXRhLmRlY2F5KSk7XG4gICAgY29uc3Qgcj1hZGRSb29tKGIseCx5LHcsaCx6b25lLFwibm9ybWFsXCIsbWV0YS5kZWNheSxzZXJ2aWNlLHJuZyk7XG4gICAgcm9vbXNBZGRlZC5wdXNoKHIpO1xuICB9XG4gIGlmKHJvb21zQWRkZWQubGVuZ3RoPDEwKXJldHVybiBudWxsO1xuXG4gIC8vIEpvaW4gcm9vbXMgdG8gY29ycmlkb3JzIG9yIG5laWdoYm91cmluZyByb29tcy4gRXZlcnkgcm9vbSBtdXN0IGhhdmUgYW4gZW50cmFuY2UuXG4gIGZvcihjb25zdCByIG9mIHJvb21zQWRkZWQpe1xuICAgIGNvbnN0IG9wdGlvbnM6IHt4Om51bWJlcjt5Om51bWJlcjsgY29ycmlkb3I6Ym9vbGVhbn1bXT1bXTtcbiAgICBmb3IobGV0IHk9ci55O3k8ci55K3IuaDt5KyspZm9yKGNvbnN0IHNpZGUgb2YgWy0xLDFdKXtcbiAgICAgIGNvbnN0IHg9c2lkZTwwP3IueC0xOnIueCtyLnc7XG4gICAgICBjb25zdCBmYXJYPXgrc2lkZTtcbiAgICAgIGlmKGIudGlsZXNbaWR4KHgseSldPT09VGlsZS5XYWxsICYmIFBBU1NBQkxFLmhhcyhiLnRpbGVzW2lkeChmYXJYLHkpXSkpIG9wdGlvbnMucHVzaCh7eCx5LGNvcnJpZG9yOmIucm9vbVpvbmVzW2Iucm9vbU9mW2lkeChmYXJYLHkpXV09PT1cIktPUllUQVJaXCJ9KTtcbiAgICB9XG4gICAgZm9yKGxldCB4PXIueDt4PHIueCtyLnc7eCsrKWZvcihjb25zdCBzaWRlIG9mIFstMSwxXSl7XG4gICAgICBjb25zdCB5PXNpZGU8MD9yLnktMTpyLnkrci5oLGZhclk9eStzaWRlO1xuICAgICAgaWYoYi50aWxlc1tpZHgoeCx5KV09PT1UaWxlLldhbGwgJiYgUEFTU0FCTEUuaGFzKGIudGlsZXNbaWR4KHgsZmFyWSldKSkgb3B0aW9ucy5wdXNoKHt4LHksY29ycmlkb3I6Yi5yb29tWm9uZXNbYi5yb29tT2ZbaWR4KHgsZmFyWSldXT09PVwiS09SWVRBUlpcIn0pO1xuICAgIH1cbiAgICBjb25zdCBvcmRlcmVkPW9wdGlvbnMuc29ydCgoYSxjKT0+TnVtYmVyKGMuY29ycmlkb3IpLU51bWJlcihhLmNvcnJpZG9yKXx8YS54LWMueHx8YS55LWMueSk7XG4gICAgaWYob3JkZXJlZFswXSkgYWRkRG9vcihiLG9yZGVyZWRbMF0ueCxvcmRlcmVkWzBdLnksZmFsc2UpO1xuICAgIGlmKG9yZGVyZWQubGVuZ3RoPjEgJiYgcm5nLmNoYW5jZShmYW1pbHk9PT00PzAuODU6MC41KSkge1xuICAgICAgY29uc3QgYWx0PW9yZGVyZWQuZmluZCgobyk9PmRpc3RDZWxsKG8sb3JkZXJlZFswXSk+PTMpO1xuICAgICAgaWYoYWx0KSBhZGREb29yKGIsYWx0LngsYWx0LnksZmFsc2UpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJlc2VydmUgb25lIHJlYWwgY29ycmlkb3ItY29ubmVjdGVkIHdvcmtzaG9wIGFuZCBzdG9yYWdlIHJvb20gZm9yIGNvbnRleHR1YWwgbWFuZGF0b3J5IGxvb3QuXG4gIGNvbnN0IGZpcnN0V29ya3Nob3A9cm9vbXNBZGRlZC5maW5kKHI9PmIucm9vbVpvbmVzW3IuaWRdPT09XCJXQVJTWlRBVFwifHxiLnJvb21ab25lc1tyLmlkXT09PVwiU0NIT1dFS1wiKTtcbiAgaWYoIWZpcnN0V29ya3Nob3ApIHtiLnJvb21ab25lc1tyb29tc0FkZGVkWzBdLmlkXT1cIldBUlNaVEFUXCI7Yi56b25lc1tyb29tc0FkZGVkWzBdLmlkXT1cIndvcmtzaG9wXCI7fVxuICBjb25zdCBiZWRyb29tPXJvb21zQWRkZWQuZmluZChyPT5iLnpvbmVzW3IuaWRdPT09XCJiZWRyb29tXCImJnIudz49NSk7XG4gIGlmKCFiZWRyb29tKXtjb25zdCByPXJvb21zQWRkZWRbcm9vbXNBZGRlZC5sZW5ndGgtMV07Yi56b25lc1tyLmlkXT1cImJlZHJvb21cIjtiLnJvb21ab25lc1tyLmlkXT1cIlNZUElBTE5JQVwiO31cbiAgY29uc3QgY29ycmlkb3I9Yi5yb29tcy5maW5kKHI9PmIucm9vbVpvbmVzW3IuaWRdPT09XCJLT1JZVEFSWlwiJiZyLnc+PTQpO1xuICBpZighY29ycmlkb3IpcmV0dXJuIG51bGw7XG4gIC8vIFRoZSBhY3R1YWwgc3RhcnQgbWF5IGJlIGEgcm9vbSwgd29yayBhcmVhLCBsb2JieSBvciBzdGFpciBsYW5kaW5nLCBpbmRlcGVuZGVudCBvZiBleGl0LlxuICBsZXQgc3RhcnRSb29tPXN0YWlyUm9vbXNbMV0/P3Jvb21zQWRkZWRbcHJvZmlsZS5zdGFydCVyb29tc0FkZGVkLmxlbmd0aF07XG4gIGlmKGluZGV4PT09MCl7XG4gICAgY29uc3QgcG9vbD1yb29tc0FkZGVkLmZpbHRlcihyPT5yLnc+PTUmJnIuaD49NCk7XG4gICAgaWYocG9vbC5sZW5ndGgpc3RhcnRSb29tPXBvb2xbcHJvZmlsZS5zdGFydCVwb29sLmxlbmd0aF07XG4gICAgc3RhcnRSb29tLnJvbGU9XCJzdGFydFwiO1xuICAgIHN0YXJ0Um9vbS5saXQ9dHJ1ZTtcbiAgICBiLnpvbmVzW3N0YXJ0Um9vbS5pZF09cm5nLnBpY2soW1wid29ya3Nob3BcIixcInN0b3JhZ2VcIixcIm9mZmljZVwiLFwibGl2aW5nXCIsXCJiZWRyb29tXCJdKTtcbiAgICBiLnJvb21ab25lc1tzdGFydFJvb20uaWRdPVpPTkVfTkFNRVtiLnpvbmVzW3N0YXJ0Um9vbS5pZF1dO1xuICB9XG4gIC8vIEZ1cm5pc2ggb25seSBhZnRlciBhbGwgZG9vcnMgYW5kIHBhc3NhZ2VzIGV4aXN0LlxuICBmb3IoY29uc3QgciBvZiBiLnJvb21zKSBpZihyLnc+PTMmJnIuaD49MyAmJiBiLnpvbmVzW3IuaWRdIT09XCJjb3JyaWRvclwiKWZ1cm5pc2hSb29tKGIscixiLnpvbmVzW3IuaWRdLG1ldGEuZGVjYXkpO1xuICBhZGRTdXJmYWNlRGV0YWlscyhiLHJuZyxpbmRleCxtZXRhLmRlY2F5KTtcbiAgaWYoIXN0b2NrRmxvb3IoYixpbmRleCxpbmRleD4wJiZpbmRleCUyPT09MSxzdGFydFJvb20pKXJldHVybiBudWxsO1xuICBpZihpbmRleD09PTApe1xuICAgIGNvbnN0IGhvc3Q9Yi5wcm9wcy5maW5kKHA9PnAubG9vdD09PVwiaGF0Y2hldFwiKTtcbiAgICBpZighaG9zdClyZXR1cm4gbnVsbDtcbiAgfVxuICBzZWFsUm9vbXMoYik7XG4gIHBhaW50V2FsbEJvcmRlcnMoYixtZXRhLmRlY2F5LHNlcnZpY2UpO1xuICBwbGFjZVdpbmRvd3MoYixybmcsbWV0YS5kZWNheSk7XG4gIGJ1aWxkTGlnaHRzKGIscm5nLG1ldGEuZGVjYXksW10pO1xuICBiLm9jYy5maWxsKDApO1xuICBmb3IoY29uc3QgcCBvZiBiLnByb3BzKWlmKHAuc29saWQpZm9yKGxldCB5PXAueTt5PHAueStwLmg7eSsrKWZvcihsZXQgeD1wLng7eDxwLngrcC53O3grKyliLm9jY1tpZHgoeCx5KV09MTtcbiAgc3Bhd25Db3Jwc2VzKGIscm5nLGluZGV4KTtcbiAgc3Bhd25TdXJ2aXZvcnMoYixybmcsaW5kZXgsc3RhcnRSb29tKTtcbiAgY29uc3Qgc3Bhd25zPXNwYXduWm9tYmllcyhiLHJuZyxpbmRleCxzdGFydFJvb20pO1xuICBjb25zdCBzdGFydENlbGwgPSBpbmRleD09PTAgPyB7eDpzdGFydFJvb20ueCtNYXRoLm1pbigyLHN0YXJ0Um9vbS53LTEpLHk6c3RhcnRSb29tLnkrTWF0aC5taW4oMixzdGFydFJvb20uaC0xKX0gOiBkb3duITtcbiAgcmV0dXJuIHtpbmRleCx0aGVtZTptZXRhLnRoZW1lLG5hbWU6bWV0YS5uYW1lLHN1YjpgJHttZXRhLnN1Yn0gXHUwMEI3ICR7TEFZT1VUX0ZBTUlMSUVTW2ZhbWlseV19YCxzZWVkLHc6VyxoOkgsXG4gICAgdGlsZXM6Yi50aWxlcyxmbG9vclN0eWxlOmIuZmxvb3JTdHlsZSx3YWxsU3R5bGU6Yi53YWxsU3R5bGUscm9vbXM6Yi5yb29tcyxyb29tWm9uZXM6Yi5yb29tWm9uZXMscm9vbU9mOmIucm9vbU9mLFxuICAgIHByb3BzOmIucHJvcHMsZG9vcnM6Yi5kb29ycyx6b21iaWVzOnNwYXducyx3aW5kb3dzOmIud2luZG93cyxkZWNhbHM6Yi5kZWNhbHMsd2FsbERlY2FsczpiLndhbGxEZWNhbHMsXG4gICAgYnJlYWNoZXM6Yi5icmVhY2hlcyxjb3Jwc2VzOmIuY29ycHNlcyxzdXJ2aXZvcnM6Yi5zdXJ2aXZvcnMsbGlnaHRzOmIubGlnaHRzLFxuICAgIHBsYXllclN0YXJ0Ont4OihzdGFydENlbGwueCsuNSkqVElMRSx5OihzdGFydENlbGwueSsuNSkqVElMRX0sc3RhaXJzVXA6dXAsc3RhaXJzRG93bjppbmRleD4wP2Rvd246bnVsbCxcbiAgICBsb2NrZWQ6aW5kZXg+MCYmaW5kZXglMj09PTEsa2V5UHJvcElkOmIucHJvcHMuZmluZChwPT5wLmxvb3Q9PT1cImtleVwiKT8uaWQ/P251bGwsZmxhcmU6bnVsbH07XG59XG5cbmZ1bmN0aW9uIGNhcnZlRXh0cmFCcmVhY2hlcyhiOiBCdWlsZCwgcm5nOiBSbmcsIGRlY2F5OiBudW1iZXIpIHtcbiAgY29uc3Qgd2FudCA9IDQgKyBNYXRoLnJvdW5kKGRlY2F5ICogMTIpO1xuICBsZXQgbWFkZSA9IDA7XG4gIGZvciAobGV0IGEgPSAwOyBhIDwgNjAwICYmIG1hZGUgPCB3YW50OyBhKyspIHtcbiAgICBjb25zdCB4ID0gNiArIHJuZy5pbnQoVyAtIDEyKTtcbiAgICBjb25zdCB5ID0gNSArIHJuZy5pbnQoSCAtIDEwKTtcbiAgICBpZiAoYi50aWxlc1tpZHgoeCwgeSldICE9PSBUaWxlLldhbGwpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG9rUGFpciA9IChheDogbnVtYmVyLCBheTogbnVtYmVyLCBieDogbnVtYmVyLCBieTogbnVtYmVyKSA9PiB7XG4gICAgICBjb25zdCBpYSA9IGlkeChheCwgYXkpO1xuICAgICAgY29uc3QgaWIgPSBpZHgoYngsIGJ5KTtcbiAgICAgIGlmIChiLnRpbGVzW2lhXSAhPT0gVGlsZS5GbG9vciB8fCBiLnRpbGVzW2liXSAhPT0gVGlsZS5GbG9vcikgcmV0dXJuIGZhbHNlO1xuICAgICAgY29uc3QgcmEgPSBiLnJvb21PZltpYV07XG4gICAgICBjb25zdCByYiA9IGIucm9vbU9mW2liXTtcbiAgICAgIGlmIChyYSA8IDAgfHwgcmIgPCAwIHx8IHJhID09PSByYikgcmV0dXJuIGZhbHNlO1xuICAgICAgZm9yIChjb25zdCByIG9mIFtyYSwgcmJdKSB7XG4gICAgICAgIGlmIChiLnJvb21zW3JdPy5yb2xlICE9PSBcIm5vcm1hbFwiKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChiLnJvb21ab25lc1tyXSA9PT0gXCJLT1JZVEFSWlwiKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9O1xuICAgIGNvbnN0IGxyID0gb2tQYWlyKHggLSAxLCB5LCB4ICsgMSwgeSk7XG4gICAgY29uc3QgdWQgPSBva1BhaXIoeCwgeSAtIDEsIHgsIHkgKyAxKTtcbiAgICBpZiAoIWxyICYmICF1ZCkgY29udGludWU7XG4gICAgaWYgKGIuZG9vcnMuc29tZSgoZCkgPT4gTWF0aC5hYnMoZC54IC0geCkgKyBNYXRoLmFicyhkLnkgLSB5KSA8PSAyKSkgY29udGludWU7XG4gICAgaWYgKGIuYnJlYWNoZXMuc29tZSgoYnIpID0+IE1hdGguYWJzKGJyLnggLSB4KSArIE1hdGguYWJzKGJyLnkgLSB5KSA8PSAyKSkgY29udGludWU7XG4gICAgY29uc3QgZnMgPSBsciA/IGIuZmxvb3JTdHlsZVtpZHgoeCAtIDEsIHkpXSA6IGIuZmxvb3JTdHlsZVtpZHgoeCwgeSAtIDEpXTtcbiAgICBhZGRCcmVhY2goYiwgeCwgeSwgZnMpO1xuICAgIG1hZGUrKztcbiAgfVxufVxuXG5mdW5jdGlvbiBzcGF3bkNvcnBzZXMoYjogQnVpbGQsIHJuZzogUm5nLCBpbmRleDogbnVtYmVyKSB7XG4gIGNvbnN0IHdhbnQgPSA0ICsgTWF0aC5taW4oOCwgaW5kZXgpO1xuICBjb25zdCBraW5kczogWm9tYmllS2luZFtdID0gW1wic2hhbWJsZXJcIiwgXCJzaGFtYmxlclwiLCBcInJ1bm5lclwiLCBcImJydXRlXCJdO1xuICBsZXQgbWFkZSA9IDA7XG4gIGZvciAobGV0IGEgPSAwOyBhIDwgMzAwICYmIG1hZGUgPCB3YW50OyBhKyspIHtcbiAgICBjb25zdCB4ID0gNCArIHJuZy5pbnQoVyAtIDgpO1xuICAgIGNvbnN0IHkgPSA0ICsgcm5nLmludChIIC0gOCk7XG4gICAgY29uc3QgaSA9IGlkeCh4LCB5KTtcbiAgICBpZiAoYi50aWxlc1tpXSAhPT0gVGlsZS5GbG9vciB8fCBiLm9jY1tpXSkgY29udGludWU7XG4gICAgY29uc3QgcmlkID0gYi5yb29tT2ZbaV07XG4gICAgaWYgKHJpZCA+PSAwICYmIGIucm9vbXNbcmlkXT8ucm9sZSA9PT0gXCJzdGFydFwiKSBjb250aW51ZTtcbiAgICBiLmNvcnBzZXMucHVzaCh7IHg6ICh4ICsgMC41KSAqIFRJTEUsIHk6ICh5ICsgMC41KSAqIFRJTEUsIGtpbmQ6IHJuZy5waWNrKGtpbmRzKSB9KTtcbiAgICBtYWRlKys7XG4gIH1cbn1cblxuY29uc3QgU1VSVklWT1JfRElBTE9HUzogeyBuYW1lOiBzdHJpbmc7IGxpbmVzOiBzdHJpbmdbXTsgZ2lmdDogXCJtZWRcIiB8IFwiYW1tb1wiIHwgXCJiYXR0ZXJ5XCIgfVtdID0gW1xuICB7XG4gICAgbmFtZTogXCJNQVJFSyBaIFRSWkVDSUVHT1wiLFxuICAgIGxpbmVzOiBbXG4gICAgICBcIkNpaSEgTmllIFx1MDE1QndpZVx1MDEwNyBwbyBva25hY2guLi4gYmxhYmxhLi4uIHNpZWR6XHUwMTE5IHR1IG9kIHdjem9yYWouXCIsXG4gICAgICBcIlphYmFyeWthZG93YWxpXHUwMTVCbXkgZHJ6d2kgc3phZlx1MDEwNSwgYWxlIHByemVzemxpIHByemV6IFx1MDE1QmNpYW5cdTAxMTkgdSBzXHUwMTA1c2lhZGEuXCIsXG4gICAgICBcIldlXHUwMTdBIHRlIG5hYm9qZSwgbWkgclx1MDExOWNlIHNpXHUwMTE5IHRyelx1MDExOXNcdTAxMDUuIFVjaWVrYW0gbmEgZFx1MDBGM1x1MDE0MiBwXHUwMEYza2kgY3p5c3RvIVwiLFxuICAgIF0sXG4gICAgZ2lmdDogXCJhbW1vXCIsXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIlBBTkkgSEFMSU5BIChNLiAxNClcIixcbiAgICBsaW5lczogW1xuICAgICAgXCJKZXp1cyBNYXJpYSwgXHUwMTdDeXd5IGN6XHUwMTQyb3dpZWsuLi4gc3plcHRlbSwgYlx1MDE0MmFnYW0sIG9uaSBzXHUwMTQyeXN6XHUwMTA1IGthXHUwMTdDZHkga3Jvay5cIixcbiAgICAgIFwiS2x1Y3ogZG8gc2Nob2RcdTAwRjN3IHdpc2kgdyBzemFmY2UgbmEga29yeXRhcnp1LiBTenVrYWogbWV0YWxvd3ljaCBkcnp3aWN6ZWsuXCIsXG4gICAgICBcIk1hc3ogb3BhdHJ1bmVrIHogbW9qZWogYXB0ZWN6a2kuIE5pZSBjemVrYWogbmEgbW5pZSwgYmllZ25cdTAxMTkhXCIsXG4gICAgXSxcbiAgICBnaWZ0OiBcIm1lZFwiLFxuICB9LFxuICB7XG4gICAgbmFtZTogXCJUT01FSyBcdTIwMTQgRUxFS1RSWUtcIixcbiAgICBsaW5lczogW1xuICAgICAgXCJQc3NzdCEgTXlcdTAxNUJsYVx1MDE0MmVtIFx1MDE3Q2UgdG8gem5vd3UgdGUgdHJ1cHkgZHJhcGlcdTAxMDUgdyBkcnp3aS4uLlwiLFxuICAgICAgXCJOYSBkYWNodSBqZXN0IGNvXHUwMTVCIG9ncm9tbmVnbywgc1x1MDE0MnlzemFcdTAxNDJlbSBqYWsgZHVkbmkgdyBzdHJvcCBuYWQgXHUwMEYzc215bS5cIixcbiAgICAgIFwiXHUwMTQxYXAgYmF0ZXJpXHUwMTE5IGRvIGxhdGFya2kuIEphIHByeXNrYW0gcHJ6ZXoga2xhdGtcdTAxMTksIHBvd29kemVuaWEhXCIsXG4gICAgXSxcbiAgICBnaWZ0OiBcImJhdHRlcnlcIixcbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiQU5LQSBaIFNJXHUwMEQzREVNS0lcIixcbiAgICBsaW5lczogW1xuICAgICAgXCJOaWUgc3RyemVsYWohIEplc3RlbSBzYW1hLi4uIHNjaG93YVx1MDE0MmFtIHNpXHUwMTE5IHcgXHUwMTQyYXppZW5jZSBnZHkgd3l3YVx1MDE3Q3lsaSB6YW1lay5cIixcbiAgICAgIFwiTmEga29yeXRhcnp1IGxlXHUwMTdDXHUwMTA1IGNpLCBrdFx1MDBGM3J5Y2ggcHJcdTAwRjNib3dhbGlcdTAxNUJteSB6YXRyenltYVx1MDEwNyBcdTAxNDJvbWFtaS5cIixcbiAgICAgIFwiV2VcdTAxN0EgbmFib2plIG1vamVnbyBicmF0YS4gSmEgd3liaWVnblx1MDExOSBnZHkgaWNoIG9kY2lcdTAxMDVnbmllc3ohXCIsXG4gICAgXSxcbiAgICBnaWZ0OiBcImFtbW9cIixcbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiU1RBUlkgRE9aT1JDQVwiLFxuICAgIGxpbmVzOiBbXG4gICAgICBcIkt0byB0YW0/ISBBLCB0byB0eS4uLiBjaWNobywgYm8gemxlY1x1MDEwNSBzaVx1MDExOSB6IGNhXHUwMTQyZWdvIHBpb251LlwiLFxuICAgICAgXCJDbyBkcnVnaWUgcGlcdTAxMTl0cm8gemFta25cdTAxMDVcdTAxNDJlbSBrcmF0XHUwMTE5LiBLbHVjemUgc1x1MDEwNSB3IHN6YWZrYWNoIG5hIGtvcnl0YXJ6YWNoLlwiLFxuICAgICAgXCJXZVx1MDE3QSBhcHRlY3prXHUwMTE5IHplIHN0clx1MDBGM1x1MDE3Q1x1MDBGM3draS4gVWNpZWthbSBzdFx1MDEwNWQhXCIsXG4gICAgXSxcbiAgICBnaWZ0OiBcIm1lZFwiLFxuICB9LFxuXTtcblxuZnVuY3Rpb24gc3Bhd25TdXJ2aXZvcnMoYjogQnVpbGQsIHJuZzogUm5nLCBpbmRleDogbnVtYmVyLCBzdGFydFJvb206IFJvb20pIHtcbiAgaWYgKGluZGV4ID09PSAxMCkgcmV0dXJuO1xuICBjb25zdCB3YW50ID0gaW5kZXggPT09IDAgPyAxIDogMSArIChybmcuY2hhbmNlKDAuNTUpID8gMSA6IDApO1xuICBjb25zdCBjYW5kaWRhdGVzID0gYi5yb29tcy5maWx0ZXIoXG4gICAgKHIpID0+IHIucm9sZSA9PT0gXCJub3JtYWxcIiAmJiBiLnJvb21ab25lc1tyLmlkXSAhPT0gXCJLT1JZVEFSWlwiICYmIGIucm9vbVpvbmVzW3IuaWRdICE9PSBcIktMQVRLQSBTQ0hPRE9XQVwiICYmIHIuaWQgIT09IHN0YXJ0Um9vbS5pZCxcbiAgKTtcbiAgZm9yIChsZXQgaSA9IGNhbmRpZGF0ZXMubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xuICAgIGNvbnN0IGogPSBybmcuaW50KGkgKyAxKTtcbiAgICBbY2FuZGlkYXRlc1tpXSwgY2FuZGlkYXRlc1tqXV0gPSBbY2FuZGlkYXRlc1tqXSwgY2FuZGlkYXRlc1tpXV07XG4gIH1cbiAgZm9yIChjb25zdCByb29tIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoYi5zdXJ2aXZvcnMubGVuZ3RoID49IHdhbnQpIGJyZWFrO1xuICAgIGZvciAobGV0IGEgPSAwOyBhIDwgMTg7IGErKykge1xuICAgICAgY29uc3QgdHggPSByb29tLnggKyBybmcuaW50KHJvb20udyk7XG4gICAgICBjb25zdCB0eSA9IHJvb20ueSArIHJuZy5pbnQocm9vbS5oKTtcbiAgICAgIGNvbnN0IGkgPSBpZHgodHgsIHR5KTtcbiAgICAgIGlmIChiLnRpbGVzW2ldICE9PSBUaWxlLkZsb29yIHx8IGIub2NjW2ldKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHRwbCA9IFNVUlZJVk9SX0RJQUxPR1NbKGluZGV4ICsgYi5zdXJ2aXZvcnMubGVuZ3RoICsgcm5nLmludChTVVJWSVZPUl9ESUFMT0dTLmxlbmd0aCkpICUgU1VSVklWT1JfRElBTE9HUy5sZW5ndGhdO1xuICAgICAgYi5vY2NbaV0gPSAxO1xuICAgICAgYi5zdXJ2aXZvcnMucHVzaCh7XG4gICAgICAgIGlkOiBiLnN1cnZpdm9ycy5sZW5ndGgsXG4gICAgICAgIHg6ICh0eCArIDAuNSkgKiBUSUxFLFxuICAgICAgICB5OiAodHkgKyAwLjUpICogVElMRSxcbiAgICAgICAgcm9vbTogcm9vbS5pZCxcbiAgICAgICAgbmFtZTogdHBsLm5hbWUsXG4gICAgICAgIGxpbmVzOiB0cGwubGluZXMsXG4gICAgICAgIGdpZnQ6IHRwbC5naWZ0LFxuICAgICAgICB2YXJpYW50OiAoaW5kZXggKyBiLnN1cnZpdm9ycy5sZW5ndGgpICUgMixcbiAgICAgIH0pO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHNwYXduWm9tYmllcyhiOiBCdWlsZCwgcm5nOiBSbmcsIGluZGV4OiBudW1iZXIsIHN0YXJ0Um9vbTogUm9vbSk6IEZsb29yRGF0YVtcInpvbWJpZXNcIl0ge1xuICBjb25zdCBjb3VudHMgPSBbXG4gICAgeyBzOiA0LCByOiAwLCBiOiAwIH0sXG4gICAgeyBzOiA2LCByOiAxLCBiOiAwIH0sXG4gICAgeyBzOiA3LCByOiAxLCBiOiAwIH0sXG4gICAgeyBzOiA4LCByOiAyLCBiOiAwIH0sXG4gICAgeyBzOiA4LCByOiAzLCBiOiAwIH0sXG4gICAgeyBzOiA5LCByOiA0LCBiOiAxIH0sXG4gICAgeyBzOiAxMCwgcjogNSwgYjogMSB9LFxuICAgIHsgczogMTEsIHI6IDUsIGI6IDIgfSxcbiAgICB7IHM6IDEyLCByOiA2LCBiOiAyIH0sXG4gICAgeyBzOiAxMywgcjogNywgYjogMiB9LFxuICAgIHsgczogMywgcjogMiwgYjogMCB9LFxuICBdO1xuICBjb25zdCB3YW50ID0gY291bnRzW01hdGgubWluKGluZGV4LCBjb3VudHMubGVuZ3RoIC0gMSldO1xuICBjb25zdCBraW5kczogWm9tYmllS2luZFtdID0gW1xuICAgIC4uLkFycmF5KHdhbnQucykuZmlsbChcInNoYW1ibGVyXCIpLFxuICAgIC4uLkFycmF5KHdhbnQucikuZmlsbChcInJ1bm5lclwiKSxcbiAgICAuLi5BcnJheSh3YW50LmIpLmZpbGwoXCJicnV0ZVwiKSxcbiAgXTtcbiAgY29uc3Qgc3ggPSAoc3RhcnRSb29tLnggKyBzdGFydFJvb20udyAvIDIpICogVElMRTtcbiAgY29uc3Qgc3kgPSAoc3RhcnRSb29tLnkgKyBzdGFydFJvb20uaCAvIDIpICogVElMRTtcbiAgY29uc3QgY2FuZGlkYXRlczogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgcm9vbTogbnVtYmVyIH1bXSA9IFtdO1xuICBmb3IgKGxldCB5ID0gMzsgeSA8IEggLSAzOyB5KyspIHtcbiAgICBmb3IgKGxldCB4ID0gMzsgeCA8IFcgLSAzOyB4KyspIHtcbiAgICAgIGNvbnN0IGkgPSBpZHgoeCwgeSk7XG4gICAgICBjb25zdCB0ID0gYi50aWxlc1tpXTtcbiAgICAgIGlmICh0ICE9PSBUaWxlLkZsb29yICYmIHQgIT09IFRpbGUuUnViYmxlICYmIHQgIT09IFRpbGUuUHVkZGxlKSBjb250aW51ZTtcbiAgICAgIGlmIChiLm9jY1tpXSkgY29udGludWU7XG4gICAgICBjb25zdCBweCA9ICh4ICsgMC41KSAqIFRJTEU7XG4gICAgICBjb25zdCBweSA9ICh5ICsgMC41KSAqIFRJTEU7XG4gICAgICBpZiAoTWF0aC5oeXBvdChweCAtIHN4LCBweSAtIHN5KSA8IDExICogVElMRSkgY29udGludWU7XG4gICAgICBjb25zdCByaWQgPSBiLnJvb21PZltpXTtcbiAgICAgIGlmIChyaWQgPj0gMCAmJiBiLnJvb21zW3JpZF0/LnJvbGUgPT09IFwic3RhcnRcIikgY29udGludWU7XG4gICAgICBjYW5kaWRhdGVzLnB1c2goeyB4OiBweCwgeTogcHksIHJvb206IHJpZCA+PSAwID8gcmlkIDogMCB9KTtcbiAgICB9XG4gIH1cbiAgZm9yIChsZXQgaSA9IGNhbmRpZGF0ZXMubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xuICAgIGNvbnN0IGogPSBybmcuaW50KGkgKyAxKTtcbiAgICBbY2FuZGlkYXRlc1tpXSwgY2FuZGlkYXRlc1tqXV0gPSBbY2FuZGlkYXRlc1tqXSwgY2FuZGlkYXRlc1tpXV07XG4gIH1cbiAgY29uc3Qgb3V0OiBGbG9vckRhdGFbXCJ6b21iaWVzXCJdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwga2luZHMubGVuZ3RoICYmIGkgPCBjYW5kaWRhdGVzLmxlbmd0aDsgaSsrKSBvdXQucHVzaCh7IC4uLmNhbmRpZGF0ZXNbaV0sIGtpbmQ6IGtpbmRzW2ldIH0pO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PSBEQUNIID09PT09PT09PT09PT09PT09ICovXG5cbmZ1bmN0aW9uIGdlbmVyYXRlUm9vZihpbmRleDogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBGbG9vckRhdGEge1xuICBjb25zdCBybmcgPSBtYWtlUm5nKHNlZWQpO1xuICBjb25zdCBtZXRhID0gRkxPT1JfTUVUQVtpbmRleF07XG4gIGNvbnN0IGIgPSBuZXdCdWlsZCgpO1xuICBiLnRpbGVzLmZpbGwoVGlsZS5Ta3kpO1xuICBjb25zdCB4ID0gMTA7XG4gIGNvbnN0IHkgPSAyMDtcbiAgY29uc3QgcncgPSBXIC0gMjA7XG4gIGNvbnN0IHJoID0gSCAtIDM4O1xuICBmb3IgKGxldCB5eSA9IHk7IHl5IDwgeSArIHJoOyB5eSsrKSB7XG4gICAgZm9yIChsZXQgeHggPSB4OyB4eCA8IHggKyBydzsgeHgrKykge1xuICAgICAgY29uc3QgZWRnZSA9IHh4ID09PSB4IHx8IHl5ID09PSB5IHx8IHh4ID09PSB4ICsgcncgLSAxIHx8IHl5ID09PSB5ICsgcmggLSAxO1xuICAgICAgYi50aWxlc1tpZHgoeHgsIHl5KV0gPSBlZGdlID8gVGlsZS5XYWxsIDogVGlsZS5GbG9vcjtcbiAgICAgIGlmICghZWRnZSkgYi5mbG9vclN0eWxlW2lkeCh4eCwgeXkpXSA9IDY7XG4gICAgfVxuICB9XG4gIGZvciAobGV0IHl5ID0geTsgeXkgPCB5ICsgcmg7IHl5KyspIGZvciAobGV0IHh4ID0geDsgeHggPCB4ICsgcnc7IHh4KyspIGIud2FsbFN0eWxlW2lkeCh4eCwgeXkpXSA9IDY7XG4gIGNvbnN0IHJvb20gPSBhZGRSb29tKGIsIHggKyAxLCB5ICsgMSwgcncgLSAyLCByaCAtIDIsIFwiY29ycmlkb3JcIiwgXCJzdGFydFwiLCAwLCBmYWxzZSwgcm5nKTtcbiAgYi5yb29tWm9uZXNbcm9vbS5pZF0gPSBcIkRBQ0hcIjtcbiAgZm9yIChsZXQgeXkgPSByb29tLnk7IHl5IDwgcm9vbS55ICsgcm9vbS5oOyB5eSsrKSBmb3IgKGxldCB4eCA9IHJvb20ueDsgeHggPCByb29tLnggKyByb29tLnc7IHh4KyspIGIuZmxvb3JTdHlsZVtpZHgoeHgsIHl5KV0gPSA2O1xuICBjb25zdCBzdHJ1Y3R1cmVzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3OiBudW1iZXI7IGg6IG51bWJlciB9W10gPSBbXG4gICAgeyB4OiB4ICsgMywgeTogeSArIDcsIHc6IDMsIGg6IDIgfSxcbiAgICB7IHg6IHggKyBydyAtIDcsIHk6IHkgKyA2LCB3OiAzLCBoOiAyIH0sXG4gICAgeyB4OiB4ICsgNCwgeTogeSArIDE4LCB3OiA0LCBoOiAyIH0sXG4gICAgeyB4OiB4ICsgcncgLSA4LCB5OiB5ICsgMTksIHc6IDQsIGg6IDIgfSxcbiAgICB7IHg6IHggKyAzLCB5OiB5ICsgcmggLSA5LCB3OiA0LCBoOiAyIH0sXG4gICAgeyB4OiB4ICsgcncgLSA3LCB5OiB5ICsgcmggLSAxMCwgdzogMywgaDogMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc3RydWN0dXJlcykgY2FydmVSZWN0KGIudGlsZXMsIHMueCwgcy55LCBzLncsIHMuaCwgVGlsZS5XYWxsKTtcbiAgY29uc3QgdmVudHM6IFByb3BLaW5kW10gPSBbXCJ2ZW50XCIsIFwid2F0ZXJ0YW5rXCIsIFwiYW50ZW5uYVwiLCBcInNhdGVsbGl0ZVwiLCBcInZlbnRcIiwgXCJ2ZW50XCJdO1xuICBzdHJ1Y3R1cmVzLmZvckVhY2goKHMsIGkpID0+IGFkZFByb3AoYiwgdmVudHNbaV0sIHMueCwgcy55IC0gMSwgMiwgMSwgdHJ1ZSkpO1xuICBhZGRQcm9wKGIsIFwiYW50ZW5uYVwiLCB4ICsgcncgLSA1LCB5ICsgMywgMSwgMSwgdHJ1ZSk7XG4gIGFkZFByb3AoYiwgXCJzYXRlbGxpdGVcIiwgeCArIDIsIHkgKyAzLCAyLCAxLCB0cnVlKTtcblxuICBmb3IgKGxldCBhID0gMDsgYSA8IDQyOyBhKyspIHtcbiAgICBjb25zdCBweCA9IHggKyAyICsgcm5nLmludChydyAtIDQpO1xuICAgIGNvbnN0IHB5ID0geSArIDIgKyBybmcuaW50KHJoIC0gNCk7XG4gICAgY29uc3QgaSA9IGlkeChweCwgcHkpO1xuICAgIGlmIChiLnRpbGVzW2ldID09PSBUaWxlLkZsb29yICYmIHJuZy5jaGFuY2UoMC43KSkgYi50aWxlc1tpXSA9IFRpbGUuUHVkZGxlO1xuICB9XG4gIGNvbnN0IHN4ID0geCArIDU7XG4gIGNvbnN0IHN5ID0geSArIHJoIC0gNDtcbiAgYi50aWxlc1tpZHgoc3gsIHN5KV0gPSBUaWxlLlN0YWlyc0Rvd247XG4gIGNvbnN0IGZ4ID0geCArIE1hdGguZmxvb3IocncgLyAyKTtcbiAgY29uc3QgZnkgPSB5ICsgODtcbiAgYi50aWxlc1tpZHgoZngsIGZ5KV0gPSBUaWxlLkZsb29yO1xuXG4gIGFkZFByb3AoYiwgXCJmbGFyZVwiLCBmeCwgZnksIDEsIDEsIHRydWUpO1xuICBhZGRQcm9wKGIsIFwibWVkYm94XCIsIHggKyAyLCB5ICsgcmggLSA0LCAxLCAxLCB0cnVlLCBcIm1lZFwiKTtcbiAgYWRkUHJvcChiLCBcInN1cHBseWNhc2VcIiwgeCArIDIsIHkgKyByaCAtIDUsIDEsIDEsIHRydWUsIFwiYW1tb1wiKTtcbiAgYWRkUHJvcChiLCBcImxvY2tlclwiLCB4ICsgcncgLSAzLCB5ICsgNiwgMSwgMSwgdHJ1ZSwgXCJiYXR0ZXJ5XCIpO1xuICBhZGRQcm9wKGIsIFwic3VwcGx5Y2FzZVwiLCB4ICsgcncgLSAzLCB5ICsgNywgMSwgMSwgdHJ1ZSwgXCJzaGVsbHNcIik7XG5cbiAgY29uc3Qgc3Bhd25zOiBGbG9vckRhdGFbXCJ6b21iaWVzXCJdID0gW1xuICAgIHsgeDogKGZ4ICsgMC41KSAqIFRJTEUsIHk6IChmeSArIDQuNSkgKiBUSUxFLCBraW5kOiBcImJvc3NcIiwgcm9vbTogMCB9LFxuICAgIHsgeDogKHggKyA1LjUpICogVElMRSwgeTogKHkgKyAyMi41KSAqIFRJTEUsIGtpbmQ6IFwic2hhbWJsZXJcIiwgcm9vbTogMCB9LFxuICAgIHsgeDogKHggKyBydyAtIDUuNSkgKiBUSUxFLCB5OiAoeSArIDIzLjUpICogVElMRSwga2luZDogXCJzaGFtYmxlclwiLCByb29tOiAwIH0sXG4gICAgeyB4OiAoeCArIDkuNSkgKiBUSUxFLCB5OiAoeSArIHJoIC0gMTIuNSkgKiBUSUxFLCBraW5kOiBcInNoYW1ibGVyXCIsIHJvb206IDAgfSxcbiAgICB7IHg6ICh4ICsgcncgLSA5LjUpICogVElMRSwgeTogKHkgKyByaCAtIDEzLjUpICogVElMRSwga2luZDogXCJydW5uZXJcIiwgcm9vbTogMCB9LFxuICAgIHsgeDogKHggKyA0LjUpICogVElMRSwgeTogKHkgKyByaCAtIDE2LjUpICogVElMRSwga2luZDogXCJydW5uZXJcIiwgcm9vbTogMCB9LFxuICAgIHsgeDogKHggKyA2LjUpICogVElMRSwgeTogKHkgKyAxNS41KSAqIFRJTEUsIGtpbmQ6IFwiYnJ1dGVcIiwgcm9vbTogMCB9LFxuICBdO1xuXG4gIGNvbnN0IHdpbmRvd3M6IFdpbmRvd0luZm9bXSA9IFtdO1xuICBmb3IgKGxldCBhID0gMDsgYSA8IDIyOyBhKyspIHtcbiAgICB3aW5kb3dzLnB1c2goeyB4OiAyICsgcm5nLmludCg5KSwgeTogNCArIHJuZy5pbnQoSCAtIDgpLCBnbG93OiBybmcuY2hhbmNlKDAuNikgPyBcImZsdW9yXCIgOiBcIm5vbmVcIiB9KTtcbiAgICB3aW5kb3dzLnB1c2goeyB4OiBXIC0gMTAgKyBybmcuaW50KDgpLCB5OiA0ICsgcm5nLmludChIIC0gOCksIGdsb3c6IHJuZy5jaGFuY2UoMC41KSA/IFwib3JhbmdlXCIgOiBcIm5vbmVcIiB9KTtcbiAgfVxuICBjb25zdCBkZWNhbHM6IERlY2FsU3Bhd25bXSA9IFtdO1xuICBmb3IgKGxldCBhID0gMDsgYSA8IDM0OyBhKyspIHtcbiAgICBjb25zdCBweCA9IHggKyAyICsgcm5nLmludChydyAtIDQpO1xuICAgIGNvbnN0IHB5ID0geSArIDIgKyBybmcuaW50KHJoIC0gNCk7XG4gICAgaWYgKGIudGlsZXNbaWR4KHB4LCBweSldID09PSBUaWxlLkZsb29yKSBkZWNhbHMucHVzaCh7IHg6IHB4LCB5OiBweSwga2luZDogcm5nLmNoYW5jZSgwLjYpID8gXCJtb3NzXCIgOiBcImNyYWNrXCIgfSk7XG4gIH1cbiAgY29uc3Qgd2FsbERlY2FsczogV2FsbERlY2FsW10gPSBbXTtcbiAgZm9yIChsZXQgYSA9IDA7IGEgPCAxODsgYSsrKSB3YWxsRGVjYWxzLnB1c2goeyB4OiB4ICsgcm5nLmludChydyksIHksIGtpbmQ6IHJuZy5jaGFuY2UoMC41KSA/IFwibW9sZFwiIDogXCJjcmFja1wiIH0pO1xuXG4gIHJldHVybiB7XG4gICAgaW5kZXgsXG4gICAgdGhlbWU6IG1ldGEudGhlbWUsXG4gICAgbmFtZTogbWV0YS5uYW1lLFxuICAgIHN1YjogbWV0YS5zdWIsXG4gICAgc2VlZCxcbiAgICB3OiBXLFxuICAgIGg6IEgsXG4gICAgdGlsZXM6IGIudGlsZXMsXG4gICAgZmxvb3JTdHlsZTogYi5mbG9vclN0eWxlLFxuICAgIHdhbGxTdHlsZTogYi53YWxsU3R5bGUsXG4gICAgcm9vbXM6IGIucm9vbXMsXG4gICAgcm9vbVpvbmVzOiBiLnJvb21ab25lcyxcbiAgICByb29tT2Y6IGIucm9vbU9mLFxuICAgIHByb3BzOiBiLnByb3BzLFxuICAgIGRvb3JzOiBbXSxcbiAgICB6b21iaWVzOiBzcGF3bnMsXG4gICAgd2luZG93cyxcbiAgICBkZWNhbHMsXG4gICAgd2FsbERlY2FscyxcbiAgICBicmVhY2hlczogW10sXG4gICAgY29ycHNlczogW1xuICAgICAgeyB4OiAoeCArIDExLjUpICogVElMRSwgeTogKHkgKyAxMS41KSAqIFRJTEUsIGtpbmQ6IFwic2hhbWJsZXJcIiB9LFxuICAgICAgeyB4OiAoeCArIHJ3IC0gMTAuNSkgKiBUSUxFLCB5OiAoeSArIDE2LjUpICogVElMRSwga2luZDogXCJydW5uZXJcIiB9LFxuICAgICAgeyB4OiAoeCArIDE0LjUpICogVElMRSwgeTogKHkgKyByaCAtIDEwLjUpICogVElMRSwga2luZDogXCJicnV0ZVwiIH0sXG4gICAgXSxcbiAgICBzdXJ2aXZvcnM6IFtdLFxuICAgIGxpZ2h0czogW1xuICAgICAgeyB4OiAoZnggKyAwLjUpICogVElMRSwgeTogKGZ5ICsgMC41KSAqIFRJTEUsIGtpbmQ6IFwiZW1lcmdlbmN5XCIsIGZsaWNrZXI6IGZhbHNlLCByb29tSWQ6IDAsIHJhZGl1czogNyAqIFRJTEUgfSxcbiAgICAgIHsgeDogKHN4ICsgMC41KSAqIFRJTEUsIHk6IChzeSArIDAuNSkgKiBUSUxFLCBraW5kOiBcImZsdW9yXCIsIGZsaWNrZXI6IHRydWUsIHJvb21JZDogMCwgcmFkaXVzOiA1ICogVElMRSB9LFxuICAgICAgeyB4OiAoeCArIHJ3IC0gNS41KSAqIFRJTEUsIHk6ICh5ICsgMTQuNSkgKiBUSUxFLCBraW5kOiBcInNvZGl1bVwiLCBmbGlja2VyOiBmYWxzZSwgcm9vbUlkOiAwLCByYWRpdXM6IDUgKiBUSUxFIH0sXG4gICAgXSxcbiAgICBwbGF5ZXJTdGFydDogeyB4OiAoc3ggKyAwLjUpICogVElMRSwgeTogKHN5IC0gMS4yKSAqIFRJTEUgfSxcbiAgICBzdGFpcnNVcDogbnVsbCxcbiAgICBzdGFpcnNEb3duOiB7IHg6IHN4LCB5OiBzeSB9LFxuICAgIGxvY2tlZDogZmFsc2UsXG4gICAga2V5UHJvcElkOiBudWxsLFxuICAgIGZsYXJlOiB7IHg6IGZ4LCB5OiBmeSB9LFxuICB9O1xufVxuXG4vKiA9PT09PT09PT09PT0gV0FMSURBQ0pBID09PT09PT09PT09PSAqL1xuXG5mdW5jdGlvbiByZWFjaGFibGVUaWxlcyhmbG9vcjogRmxvb3JEYXRhLCBiZWZvcmVLZXk6IGJvb2xlYW4pIHtcbiAgY29uc3QgYmxvY2tlZCA9IG5ldyBVaW50OEFycmF5KFcgKiBIKTtcbiAgZm9yIChjb25zdCBwIG9mIGZsb29yLnByb3BzKSB7XG4gICAgaWYgKCFwLnNvbGlkKSBjb250aW51ZTtcbiAgICBmb3IgKGxldCB5ID0gcC55OyB5IDwgcC55ICsgcC5oOyB5KyspIGZvciAobGV0IHggPSBwLng7IHggPCBwLnggKyBwLnc7IHgrKykgYmxvY2tlZFtpZHgoeCwgeSldID0gMTtcbiAgfVxuICBmb3IgKGNvbnN0IGQgb2YgZmxvb3IuZG9vcnMpIGlmIChkLnNlYWxlZCB8fCAoYmVmb3JlS2V5ICYmIGQubG9ja2VkKSkgYmxvY2tlZFtpZHgoZC54LCBkLnkpXSA9IDE7XG4gIGNvbnN0IHNlZW4gPSBuZXcgVWludDhBcnJheShXICogSCk7XG4gIGNvbnN0IHF1ZXVlID0gbmV3IEludDMyQXJyYXkoVyAqIEgpO1xuICBjb25zdCBzdGFydCA9IGlkeChNYXRoLmZsb29yKGZsb29yLnBsYXllclN0YXJ0LnggLyBUSUxFKSwgTWF0aC5mbG9vcihmbG9vci5wbGF5ZXJTdGFydC55IC8gVElMRSkpO1xuICBpZiAoYmxvY2tlZFtzdGFydF0pIHJldHVybiBzZWVuO1xuICBxdWV1ZVswXSA9IHN0YXJ0O1xuICBzZWVuW3N0YXJ0XSA9IDE7XG4gIGxldCB0YWlsID0gMTtcbiAgZm9yIChsZXQgaGVhZCA9IDA7IGhlYWQgPCB0YWlsOyBoZWFkKyspIHtcbiAgICBjb25zdCBoZXJlID0gcXVldWVbaGVhZF07XG4gICAgZm9yIChjb25zdCBbZHgsIGR5XSBvZiBONCkge1xuICAgICAgY29uc3QgeCA9IGhlcmUgJSBXICsgZHgsIHkgPSBNYXRoLmZsb29yKGhlcmUgLyBXKSArIGR5O1xuICAgICAgaWYgKCFpbmIoeCwgeSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgbmV4dCA9IGlkeCh4LCB5KTtcbiAgICAgIGlmIChzZWVuW25leHRdIHx8IGJsb2NrZWRbbmV4dF0gfHwgIVBBU1NBQkxFLmhhcyhmbG9vci50aWxlc1tuZXh0XSkpIGNvbnRpbnVlO1xuICAgICAgcXVldWVbdGFpbCsrXSA9IG5leHQ7XG4gICAgICBzZWVuW25leHRdID0gMTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHNlZW47XG59XG5cbmZ1bmN0aW9uIGNhblNlYXJjaEZyb20oc2VlbjogVWludDhBcnJheSwgcDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgdzogbnVtYmVyOyBoOiBudW1iZXIgfSkge1xuICBmb3IgKGxldCB5ID0gcC55OyB5IDwgcC55ICsgcC5oOyB5KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcC54OyB4IDwgcC54ICsgcC53OyB4KyspIHtcbiAgICAgIGlmIChONC5zb21lKChbZHgsIGR5XSkgPT4gaW5iKHggKyBkeCwgeSArIGR5KSAmJiBzZWVuW2lkeCh4ICsgZHgsIHkgKyBkeSldKSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqIEtvbnRyb2xhIGdlb21ldHJpaTogc3pjemVsbmUgb2J3b2R5IHBva29pIGkgZHJ6d2kgcHJvd2Fkelx1MDEwNWNlIHogcG9kXHUwMTQyb2dpIG5hIHBvZFx1MDE0Mm9nXHUwMTE5LiAqL1xuZnVuY3Rpb24gdmFsaWRhdGVHZW9tZXRyeShmbG9vcjogRmxvb3JEYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gIGNvbnN0IHQgPSBmbG9vci50aWxlcztcbiAgZm9yIChjb25zdCByIG9mIGZsb29yLnJvb21zKSB7XG4gICAgaWYgKFtcIktPUllUQVJaXCIsIFwiREFDSFwiLCBcIldJTkRBIE9TT0JPV0FcIiwgXCJQSU9OIFRFQ0hOSUNaTllcIiwgXCJLTEFUS0EgQlwiXS5pbmNsdWRlcyhmbG9vci5yb29tWm9uZXNbci5pZF0pKSBjb250aW51ZTtcbiAgICBmb3IgKGxldCB5ID0gci55IC0gMTsgeSA8PSByLnkgKyByLmg7IHkrKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueCAtIDE7IHggPD0gci54ICsgci53OyB4KyspIHtcbiAgICAgICAgY29uc3Qgb25Cb3JkZXIgPSB4ID09PSByLnggLSAxIHx8IHggPT09IHIueCArIHIudyB8fCB5ID09PSByLnkgLSAxIHx8IHkgPT09IHIueSArIHIuaDtcbiAgICAgICAgaWYgKCFvbkJvcmRlcikgY29udGludWU7XG4gICAgICAgIGlmICghaW5iKHgsIHkpKSByZXR1cm4gYHJvb20gJHtyLmlkfSB0b3VjaGVzIG1hcCBlZGdlYDtcbiAgICAgICAgY29uc3QgdiA9IHRbaWR4KHgsIHkpXTtcbiAgICAgICAgaWYgKHYgPT09IFRpbGUuRmxvb3IgfHwgdiA9PT0gVGlsZS5QdWRkbGUpIHJldHVybiBgcm9vbSAke3IuaWR9IGhhcyBvcGVuIHBlcmltZXRlciBhdCAke3h9LCR7eX1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IGQgb2YgZmxvb3IuZG9vcnMpIHtcbiAgICBjb25zdCBwID0gKHg6IG51bWJlciwgeTogbnVtYmVyKSA9PiBpbmIoeCwgeSkgJiYgUEFTU0FCTEUuaGFzKHRbaWR4KHgsIHkpXSk7XG4gICAgY29uc3QgbnMgPSBwKGQueCwgZC55IC0gMSkgJiYgcChkLngsIGQueSArIDEpO1xuICAgIGNvbnN0IGV3ID0gcChkLnggLSAxLCBkLnkpICYmIHAoZC54ICsgMSwgZC55KTtcbiAgICBpZiAoIW5zICYmICFldykgcmV0dXJuIGBkb29yIGF0ICR7ZC54fSwke2QueX0gbGVhZHMgaW50byBhIHdhbGxgO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVGbG9vcihmbG9vcjogRmxvb3JEYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gIGNvbnN0IHN0YXJ0VHggPSBNYXRoLmZsb29yKGZsb29yLnBsYXllclN0YXJ0LnggLyBUSUxFKTtcbiAgY29uc3Qgc3RhcnRUeSA9IE1hdGguZmxvb3IoZmxvb3IucGxheWVyU3RhcnQueSAvIFRJTEUpO1xuICBpZiAoIWluYihzdGFydFR4LCBzdGFydFR5KSkgcmV0dXJuIFwic3RhcnQgb3V0IG9mIGJvdW5kc1wiO1xuICBjb25zdCBzdCA9IGZsb29yLnRpbGVzW2lkeChzdGFydFR4LCBzdGFydFR5KV07XG4gIGlmIChzdCA9PT0gVGlsZS5XYWxsIHx8IHN0ID09PSBUaWxlLldpbmRvdyB8fCBzdCA9PT0gVGlsZS5Ta3kgfHwgc3QgPT09IFRpbGUuRG9vcikgcmV0dXJuIFwic3RhcnQgYmxvY2tlZFwiO1xuICBjb25zdCBnZW8gPSB2YWxpZGF0ZUdlb21ldHJ5KGZsb29yKTtcbiAgaWYgKGdlbykgcmV0dXJuIGdlbztcbiAgY29uc3QgYWNjZXNzaWJsZSA9IHJlYWNoYWJsZVRpbGVzKGZsb29yLCBmYWxzZSk7XG4gIGZvciAoY29uc3QgcCBvZiBmbG9vci5wcm9wcykge1xuICAgIGlmICgocC5sb290IHx8IHAua2luZCA9PT0gXCJmbGFyZVwiKSAmJiAhY2FuU2VhcmNoRnJvbShhY2Nlc3NpYmxlLCBwKSkgcmV0dXJuIGB1bnJlYWNoYWJsZSBzdXBwbHk6ICR7cC5pZH1gO1xuICB9XG4gIGlmIChmbG9vci50aGVtZSA9PT0gXCJyb29mXCIpIHJldHVybiBmbG9vci5mbGFyZSA/IG51bGwgOiBcIm5vIGZsYXJlXCI7XG4gIGlmICghZmxvb3Iuc3RhaXJzVXAgfHwgIWFjY2Vzc2libGVbaWR4KGZsb29yLnN0YWlyc1VwLngsIGZsb29yLnN0YWlyc1VwLnkpXSkgcmV0dXJuIFwiY2Fubm90IHJlYWNoIHN0YWlyc1wiO1xuICBjb25zdCBkaXNjb3ZlcnkgPSBESVNDT1ZFUklFU1tmbG9vci5pbmRleF07XG4gIGlmIChkaXNjb3ZlcnkgJiYgIWZsb29yLnByb3BzLnNvbWUocCA9PiBwLmxvb3QgPT09IGRpc2NvdmVyeSkpIHJldHVybiBcIm1pc3Npbmcgd2VhcG9uIGNhY2hlXCI7XG4gIGlmIChmbG9vci5sb2NrZWQpIHtcbiAgICBjb25zdCBrZXkgPSBmbG9vci5wcm9wcy5maW5kKHAgPT4gcC5pZCA9PT0gZmxvb3Iua2V5UHJvcElkICYmIHAubG9vdCA9PT0gXCJrZXlcIik7XG4gICAgaWYgKCFrZXkgfHwgIWNhblNlYXJjaEZyb20ocmVhY2hhYmxlVGlsZXMoZmxvb3IsIHRydWUpLCBrZXkpKSByZXR1cm4gXCJjYW5ub3QgcmVhY2gga2V5IGJlZm9yZSB1bmxvY2tpbmdcIjtcbiAgfVxuICByZXR1cm4gdmFsaWRhdGVFbnZpcm9ubWVudChmbG9vcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUZsb29yKGluZGV4OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgcnVuU2VlZD86IG51bWJlciwgZ2VuZXJhdG9yVmVyc2lvbiA9IDIpOiBGbG9vckRhdGEge1xuICBjb25zdCBidWlsZGluZ1NlZWQgPSBydW5TZWVkID8/IHNlZWQ7XG4gIGZvciAobGV0IGEgPSAwOyBhIDwgMzY7IGErKykge1xuICAgIGNvbnN0IHMgPSAoc2VlZCArIGEgKiA5OTcpID4+PiAwO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmbG9vciA9IGluZGV4ID09PSAxMCA/IGdlbmVyYXRlUm9vZihpbmRleCwgcykgOiBnZW5lcmF0b3JWZXJzaW9uID09PSAxID8gYnVpbGRGbG9vcihpbmRleCwgcykgOiBidWlsZFZhcmllZEZsb29yKGluZGV4LCBzLCBidWlsZGluZ1NlZWQpO1xuICAgICAgaWYgKCFmbG9vciB8fCB2YWxpZGF0ZUZsb29yKGZsb29yKSkgY29udGludWU7XG4gICAgICBpZiAoaW5kZXggPCAxMCkgaW5zdGFsbFZlcnRpY2FsUm91dGVzKGZsb29yLCBidWlsZGluZ1NlZWQpO1xuICAgICAgcG9wdWxhdGVFbnZpcm9ubWVudChmbG9vcik7XG4gICAgICBpZiAoaW5kZXggPCAxMCkgaW5zdGFsbFZlcnRpY2FsUXVlc3RzKGZsb29yLCBidWlsZGluZ1NlZWQpO1xuICAgICAgaW5zdGFsbFRhY3RpY2FsQ29udGVudChmbG9vcik7XG4gICAgICBpZiAoIXZhbGlkYXRlRmxvb3IoZmxvb3IpKSByZXR1cm4gZmxvb3I7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBrb2xlam5hIHByXHUwMEYzYmEgeiBpbm55bSB6aWFybmVtXG4gICAgfVxuICB9XG4gIGNvbnN0IGZhbGxiYWNrID0gZ2VuZXJhdG9yVmVyc2lvbiA9PT0gMSA/IGZhbGxiYWNrRmxvb3IoaW5kZXgsIHNlZWQpIDogYnVpbGRWYXJpZWRGbG9vcihpbmRleCwgc2VlZCBeIDB4NzU4M2ExYzMsIGJ1aWxkaW5nU2VlZCkgPz8gZmFsbGJhY2tGbG9vcihpbmRleCwgc2VlZCk7XG4gIGlmIChpbmRleCA8IDEwKSBpbnN0YWxsVmVydGljYWxSb3V0ZXMoZmFsbGJhY2ssIGJ1aWxkaW5nU2VlZCk7XG4gIHBvcHVsYXRlRW52aXJvbm1lbnQoZmFsbGJhY2spO1xuICBpZiAoaW5kZXggPCAxMCkgaW5zdGFsbFZlcnRpY2FsUXVlc3RzKGZhbGxiYWNrLCBidWlsZGluZ1NlZWQpO1xuICBpbnN0YWxsVGFjdGljYWxDb250ZW50KGZhbGxiYWNrKTtcbiAgcmV0dXJuIGZhbGxiYWNrO1xufVxuXG5mdW5jdGlvbiBmYWxsYmFja0Zsb29yKGluZGV4OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IEZsb29yRGF0YSB7XG4gIGNvbnN0IG1ldGEgPSBGTE9PUl9NRVRBW2luZGV4XTtcbiAgaWYgKGluZGV4ID09PSAxMCkgcmV0dXJuIGdlbmVyYXRlUm9vZihpbmRleCwgc2VlZCBeIDB4OWUzNzc5YjkpO1xuICBjb25zdCBiID0gbmV3QnVpbGQoKTtcbiAgY29uc3QgY3lzID0gWzE2LCA0MiwgNjhdO1xuICBmb3IgKGNvbnN0IGN5IG9mIGN5cykgY2FydmVSZWN0KGIudGlsZXMsIDQsIGN5LCBXIC0gOCwgMywgVGlsZS5GbG9vcik7XG4gIGNhcnZlUmVjdChiLnRpbGVzLCA0LCAxNiwgMiwgNTUsIFRpbGUuRmxvb3IpO1xuICBjYXJ2ZVJlY3QoYi50aWxlcywgVyAtIDYsIDE2LCAyLCA1NSwgVGlsZS5GbG9vcik7XG4gIGNvbnN0IHJuZyA9IG1ha2VSbmcoc2VlZCk7XG4gIGNvbnN0IHN0YXJ0ID0gYWRkUm9vbShiLCA4LCA3MiwgMTAsIDgsIFwic3RhaXJcIiwgXCJzdGFydFwiLCAwLCBmYWxzZSwgcm5nKTtcbiAgYWRkUm9vbShiLCA4LCA3LCAxMCwgOCwgXCJzdGFpclwiLCBcInN0YWlyc1wiLCAwLCBmYWxzZSwgcm5nKTtcbiAgYWRkRG9vcihiLCAxMiwgNzEsIGZhbHNlKTtcbiAgYWRkRG9vcihiLCAxMiwgMTUsIGZhbHNlKTtcbiAgY29uc3QgdXAgPSB7IHg6IDEyLCB5OiA5IH07XG4gIGIudGlsZXNbaWR4KHVwLngsIHVwLnkpXSA9IFRpbGUuU3RhaXJzVXA7XG4gIGIudGlsZXNbaWR4KDEyLCA3NildID0gVGlsZS5TdGFpcnNEb3duO1xuICBhZGRQcm9wKGIsIFwibWVkYm94XCIsIDgsIDczLCAxLCAxLCB0cnVlLCBcIm1lZFwiKTtcbiAgYWRkUHJvcChiLCBcInN1cHBseWNhc2VcIiwgOCwgNzQsIDEsIDEsIHRydWUsIFwiYW1tb1wiKTtcbiAgY29uc3QgZGlzY292ZXJ5ID0gRElTQ09WRVJJRVNbaW5kZXhdO1xuICBpZiAoZGlzY292ZXJ5KSB7XG4gICAgY29uc3Qgcm9vbSA9IGFkZFJvb20oYiwgMjIsIDcyLCA4LCA3LCBpbmRleCA9PT0gMCA/IFwid29ya3Nob3BcIiA6IGluZGV4ID09PSAxID8gXCJvZmZpY2VcIiA6IFwiYmVkcm9vbVwiLCBcIm5vcm1hbFwiLCAwLCBmYWxzZSwgcm5nKTtcbiAgICBhZGREb29yKGIsIDI1LCA3MSwgZmFsc2UpO1xuICAgIGNvbnN0IGZpeHR1cmUgPSBpbmRleCA9PT0gMCA/IFwibG9ja2VyXCIgOiBpbmRleCA9PT0gMSA/IFwiZGVza1wiIDogXCJ3YXJkcm9iZVwiO1xuICAgIGFkZFByb3AoYiwgZml4dHVyZSwgcm9vbS54LCByb29tLnkgKyA0LCBmaXh0dXJlID09PSBcImRlc2tcIiA/IDIgOiAxLCAxLCB0cnVlLCBkaXNjb3ZlcnkpO1xuICB9XG4gIHBhaW50V2FsbEJvcmRlcnMoYiwgMCwgZmFsc2UpO1xuICBidWlsZExpZ2h0cyhiLCBybmcsIDAsIGN5cyk7XG4gIHJldHVybiB7XG4gICAgaW5kZXgsXG4gICAgdGhlbWU6IG1ldGEudGhlbWUsXG4gICAgbmFtZTogbWV0YS5uYW1lLFxuICAgIHN1YjogbWV0YS5zdWIsXG4gICAgc2VlZCxcbiAgICB3OiBXLFxuICAgIGg6IEgsXG4gICAgdGlsZXM6IGIudGlsZXMsXG4gICAgZmxvb3JTdHlsZTogYi5mbG9vclN0eWxlLFxuICAgIHdhbGxTdHlsZTogYi53YWxsU3R5bGUsXG4gICAgcm9vbXM6IGIucm9vbXMsXG4gICAgcm9vbVpvbmVzOiBiLnJvb21ab25lcyxcbiAgICByb29tT2Y6IGIucm9vbU9mLFxuICAgIHByb3BzOiBiLnByb3BzLFxuICAgIGRvb3JzOiBiLmRvb3JzLFxuICAgIHpvbWJpZXM6IFt7IHg6IDIwLjUgKiBUSUxFLCB5OiA0Mi41ICogVElMRSwga2luZDogXCJzaGFtYmxlclwiLCByb29tOiAwIH1dLFxuICAgIHdpbmRvd3M6IFtdLFxuICAgIGRlY2FsczogW10sXG4gICAgd2FsbERlY2FsczogW10sXG4gICAgYnJlYWNoZXM6IFtdLFxuICAgIGNvcnBzZXM6IFtdLFxuICAgIHN1cnZpdm9yczogW10sXG4gICAgbGlnaHRzOiBiLmxpZ2h0cyxcbiAgICBwbGF5ZXJTdGFydDogeyB4OiAoc3RhcnQueCArIDIuNSkgKiBUSUxFLCB5OiAoc3RhcnQueSArIDIuNSkgKiBUSUxFIH0sXG4gICAgc3RhaXJzVXA6IHVwLFxuICAgIHN0YWlyc0Rvd246IGluZGV4ID4gMCA/IHsgeDogMTIsIHk6IDc2IH0gOiBudWxsLFxuICAgIGxvY2tlZDogZmFsc2UsXG4gICAga2V5UHJvcElkOiBudWxsLFxuICAgIGZsYXJlOiBudWxsLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdGVzdEdlbmVyYXRlKHNlZWRzID0gMjApOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzZWVkczsgaSsrKSB7XG4gICAgZm9yIChsZXQgZiA9IDA7IGYgPCAxMTsgZisrKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmbG9vciA9IGdlbmVyYXRlRmxvb3IoZiwgMTAwMCArIGkgKiAxNyk7XG4gICAgICAgIGNvbnN0IHYgPSB2YWxpZGF0ZUZsb29yKGZsb29yKTtcbiAgICAgICAgaWYgKHYpIGVycm9ycy5wdXNoKGBzZWVkICR7MTAwMCArIGkgKiAxN30gZmxvb3IgJHtmfTogJHt2fWApO1xuICAgICAgICBpZiAoZiA8PSA5ICYmIGZsb29yLnJvb21zLmxlbmd0aCA8IDEwKSBlcnJvcnMucHVzaChgc2VlZCAkezEwMDAgKyBpICogMTd9IGZsb29yICR7Zn06IGZhbGxiYWNrYCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKGB0aHJvdyAke2l9LyR7Zn06ICR7U3RyaW5nKGUpfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gZXJyb3JzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLE9BQU8sWUFBWTs7O0FDQVosSUFBTSxhQUFhLENBQUMsV0FBVyxVQUFVLFdBQVcsWUFBWSxXQUFXLFlBQVksU0FBUztBQXNDaEcsU0FBUyxTQUFTLElBQTZCO0FBQ3BELFNBQU8sV0FBVyxTQUFTLEVBQWM7QUFDM0M7QUF3Q08sSUFBTSxjQUFpRCxFQUFFLEdBQUcsV0FBVyxHQUFHLFlBQVksR0FBRyxXQUFXLEdBQUcsV0FBVyxHQUFHLFdBQVc7OztBQ2hGaEksSUFBTSxPQUFPO0FBQ2IsSUFBTSxRQUFRO0FBQ2QsSUFBTSxRQUFRO0FBQ2QsSUFBTSxjQUFjO0FBRXBCLElBQU0sT0FBTztBQUFBLEVBQ2xCLE1BQU07QUFBQSxFQUNOLE9BQU87QUFBQSxFQUNQLE1BQU07QUFBQSxFQUNOLFVBQVU7QUFBQSxFQUNW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LEdBQUcsR0FBRyxRQUFRLENBQUMsS0FDakgsS0FBSyxFQUFFLElBQUksS0FBSyxLQUFLLEVBQUUsTUFBTSxLQUFLLEtBQUssRUFBRSxNQUFNLEtBQUssT0FBTyxFQUFFLElBQUksS0FBSyxFQUFFLENBQUMsTUFDMUUsRUFBRSxhQUFhLFVBQWEsU0FBUyxFQUFFLFFBQVEsTUFDaEQsTUFBTSxRQUFRLEVBQUUsT0FBTyxLQUFLLEVBQUUsUUFBUSxNQUFNLENBQUMsTUFBTSxPQUFPLENBQUMsS0FBSyxTQUFTLENBQUMsS0FBSyxPQUFPLEVBQUUsRUFBRSxLQUFLLFFBQVEsRUFBRSxNQUFNLEVBQUUsS0FDL0csQ0FBQyxRQUFRLFNBQVMsTUFBTSxFQUFFLFNBQVMsT0FBTyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsWUFBWSxVQUFVLFNBQVMsUUFBUSxTQUFTLEVBQUUsU0FBUyxPQUFPLEVBQUUsSUFBSSxDQUFDLEtBQ2pJLEtBQUssRUFBRSxRQUFRLEtBQUssS0FBSyxFQUFFLGFBQWEsS0FBSyxPQUFPLEVBQUUsUUFBUSxJQUFJLEtBQUssT0FBTyxFQUFFLEtBQUssS0FBSyxPQUFPLEVBQUUsS0FBSyxDQUFDO0FBQ2xIO0FBRUEsU0FBUyxTQUFTLEdBQWdDO0FBQ2hELFNBQU8sT0FBTyxDQUFDLEtBQUssT0FBTyxFQUFFLEtBQUssS0FBSyxPQUFPLEVBQUUsYUFBYSxHQUFHLEdBQUcsS0FBSyxPQUFPLEVBQUUsU0FBUyxHQUFHLEdBQUcsS0FDM0YsT0FBTyxFQUFFLFlBQVksR0FBRyxDQUFDLEtBQUssT0FBTyxFQUFFLFFBQVEsS0FBSyxPQUFPLEVBQUUsVUFBVSxJQUFJLEtBQUssUUFBUSxFQUFFLFNBQVMsS0FDbkcsTUFBTSxRQUFRLEVBQUUsTUFBTSxLQUFLLE9BQU8sRUFBRSxPQUFPLEtBQUssT0FBTyxFQUFFLE9BQU8sS0FDaEUsT0FBTyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxNQUFNLE9BQU8sQ0FBQyxLQUFLLEtBQUssRUFBRSxFQUFFLEtBQUssT0FBTyxFQUFFLENBQUMsS0FB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R0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxDQUFDO0FBQUEsSUFDdEQsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxDQUFDO0FBQUEsSUFDNUQsQ0FBQyxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsQ0FBQztBQUFBLElBQ3RELENBQUMsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLENBQUM7QUFBQSxJQUN0RCxDQUFDLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsQ0FBQztBQUFBLElBQ2hELENBQUMsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLENBQUM7QUFBQSxJQUN0RCxDQUFDLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxDQUFDO0FBQUEsRUFDeEQ7QUFDQSxNQUFJLFFBQVEsU0FBUyxNQUFNLEVBQUUsTUFBTTtBQUNuQyxNQUFJLElBQUksT0FBTyxJQUFJLEVBQUcsT0FBTSxPQUFPLElBQUksSUFBSSxNQUFNLE1BQU0sR0FBRyxHQUFHLElBQUksS0FBSyxLQUFLLENBQUM7QUFDNUUsTUFBSSxXQUFXLEtBQUssSUFBSSxPQUFPLEdBQUcsRUFBRyxPQUFNLEtBQUssSUFBSSxLQUFLLENBQUMsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLEdBQUUsQ0FBQyxHQUFFLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ25JLGFBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxPQUFPO0FBQzFCLFVBQU0sUUFBUSxRQUFRLENBQUMsR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUN6QyxVQUFNLFFBQVEsV0FBVyxNQUFNLE1BQU0sS0FB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LFFBQVEsT0FBTyxXQUFXLGVBQWU7QUFDL0MsT0FBTyxPQUFPLE1BQU0sTUFBTSxPQUFPLE1BQU0sRUFBRSxFQUFFLENBQUM7QUFDNUMsTUFBTSxJQUFJLFNBQVMsTUFBTSxNQUFNLEtBQUs7QUFDcEMsTUFBTSxLQUFLLEdBQUc7QUFDZCxNQUFNLElBQUksU0FBUyxNQUFNLE1BQU0sSUFBSTtBQUNuQyxPQUFPLE1BQU0sTUFBTSxLQUFLLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsRUFBRSxTQUFTLE1BQU0sT0FBTyxDQUFDLEVBQUUsTUFBTTtBQUV6RCxJQUFNLE1BQU0sT0FBTyxLQUFLO0FBQ3hCLE9BQU8sT0FBTyxJQUFJLE1BQU0sT0FBTyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUM5QyxJQUFJLElBQUksT0FBTyxJQUFJLElBQUk7QUFDdkIsSUFBSSxLQUFLLGNBQWMsR0FBRztBQUMxQixPQUFPLE1BQU0sSUFBSSxLQUFLLFFBQVEsR0FBRywwQkFBMEI7QUFDM0QsT0FBTyxPQUFPLElBQUksTUFBTSxPQUFPLElBQUksRUFBRSxPQUFPLENBQUM7QUFDN0MsT0FBTyxHQUFHLElBQUksSUFBSSxJQUFJLENBQUM7QUFDdkIsT0FBTyxNQUFNLElBQUksSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFLE9BQU8sU0FBUztBQUNqRCxJQUFJLEtBQUssWUFBWSxHQUFHO0FBQ3hCLE9BQU8sTUFBTSxJQUFJLElBQUksS0FBSyxJQUFJLENBQUMsRUFBRSxPQUFPLFNBQVM7QUFDakQsT0FBTyxNQUFNLElBQUksS0FBSyxRQUFRLEdBQUcsa0RBQWtEO0FBQ25GLElBQU0sTUFBTSxPQUFPLEtBQUs7QUFDeEIsT0FBTyxPQUFPLElBQUksUUFBUSxPQUFPLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ2hELElBQUksSUFBSSxPQUFPLE9BQU8sSUFBSSxFQUFFLEVBQUUsQ0FBQztBQUMvQixJQUFJLEtBQUssY0FBYyxHQUFHO0FBQzFCLE9BQU8sVUFBVSxJQUFJLEtBQUssSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDL0MsT0FBTyxHQUFHLElBQUksT0FBTyxTQUFTLE9BQU8sQ0FBQztBQUN0QyxPQUFPLE1BQU0sZ0JBQWdCLHNCQUFzQixHQUFHLElBQUk7QUFDMUQsUUFBUSxJQUFJLE9BQU8sTUFBTSxnREFBZ0QsU0FBUyw4RUFBOEU7IiwKICAibmFtZXMiOiBbImlkeCIsICJ0aWxlIiwgInNhZmUiLCAiaW5zaWRlIiwgInJvb21zIiwgInJvb21DZWxscyIsICJzdGVhbSIsICJzdGFnZSIsICJ0aWxlIiwgImRpc3RhbmNlIiwgInBvb2wiLCAiY2VudGVyIiwgInN0ZWFtIiwgImlkeCIsICJpbmIiLCAiUEFTU0FCTEUiLCAiRlVSTklUVVJFIiwgIndhbGwiLCAia2luZHMiLCAicG9vbCJdCn0K
