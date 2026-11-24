import { DISCOVERIES, type WeaponId } from "./inventory";
import { TILE, Tile } from "./palette";
import { astar } from "./path";
import { makeRng } from "./rng";
import type { FloorData, Loot, Prop, Room, ZombieSpawn } from "./types";

export type Cell = { x: number; y: number };
export type Obstacle = "cabinet" | "fridge" | "dresser" | "bookcase" | "boards" | "upturned";
export type Surface = "glass" | "cans" | "planks";
type Site<K extends string> = { id: number; kind: K; at: Cell };

export type Wire = Site<"wire"> & {
  mode: "steady" | "pulse" | "pool";
  mount: "wall" | "ceiling" | "floor";
  cells: Cell[];
  phase: number;
  control?: Cell;
  room: number;
};
export type FragileWall = Site<"wall"> & { front: Cell; back: Cell; landing: Cell[]; room: number };
export type BlockedDoor = Site<"obstruction"> & { gate: Cell; stand: Cell; park: Cell; material: Obstacle; room: number };
export type Steam = Site<"steam"> & { cells: Cell[]; heading: Cell; phase: number; control: Cell; shortcut?: { gate: Cell; approaches: [Cell, Cell] } };
export type Shelf = Site<"shelf"> & { landing: Cell; stand: Cell; stash: Prop };
export type Gas = Site<"gas"> & { cells: Cell[]; control: Cell };
export type Feature = Wire | FragileWall | BlockedDoor | Steam | Shelf | Gas
  | Site<"weak"> | (Site<"surface"> & { cells: Cell[]; material: Surface });

export interface Annex {
  room: number;
  seal: number | null;
  props: Prop[];
  guard?: ZombieSpawn;
}

export interface EnvironmentPlan {
  features: Feature[];
  annexes: Annex[];
}

const CARDINAL = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const walkTiles = new Set<number>([Tile.Floor, Tile.Rubble, Tile.Puddle, Tile.StairsUp, Tile.StairsDown, Tile.Door, Tile.DoorOpen]);
const maintenance = ["WARSZTAT", "KOT\u0141OWNIA", "PRALNIA", "\u0141AZIENKA", "SCHOWEK"];
const woodRooms = ["SALON", "SYPIALNIA", "POK\u00d3J DZIECI\u0118CY", "LOKAL U\u017bYTKOWY", "SCHOWEK"];
const annexNames = ["DAWNY WARSZTAT", "SCHOWEK LOKATORA", "KRYJ\u00d3WKA OCALA\u0141EGO", "MAGAZYN", "ZABARYKADOWANE MIESZKANIE"];
const shift = (p: Cell, v: Cell, n = 1): Cell => ({ x: p.x + v.x * n, y: p.y + v.y * n });
export const center = (p: Cell) => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE });
export const sameCell = (p: Cell, q: Cell) => p.x === q.x && p.y === q.y;

function cellOf(x: number, y: number): Cell {
  return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
}

// These blocks are considered simultaneously, including both ends of moving furniture.
export function plannedBlocks(plan: EnvironmentPlan): Cell[] {
  return plan.features.flatMap((f) => {
    switch (f.kind) {
      case "obstruction": return [f.at, f.park, f.gate];
      case "shelf": return [f.at, f.landing];
      case "wire": case "steam": case "gas": case "surface": return f.cells;
      case "weak": return [f.at];
      default: return [];
    }
  });
}

export function plannedAccess(plan: EnvironmentPlan): Cell[] {
  return plan.features.flatMap((f) => {
    switch (f.kind) {
      case "wall": return [f.front];
      case "obstruction": case "shelf": return [f.stand];
      case "steam": return [f.control, ...(f.shortcut?.approaches ?? [])];
      case "wire": case "gas": return f.control ? [f.control] : [];
      default: return [];
    }
  });
}

function routeCheck(f: FloorData) {
  const size = f.w * f.h;
  const idx = (p: Cell) => p.y * f.w + p.x;
  const propBlock = new Uint8Array(size);
  const key = f.props.find((p) => p.id === f.keyPropId && p.loot === "key");
  const required = f.props.filter((p) => p.loot !== null && p.loot !== "key");
  for (const p of f.props) if (p.solid) {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) propBlock[y * f.w + x] = 1;
  }
  const start = idx(cellOf(f.playerStart.x, f.playerStart.y));
  const reach = (blocked: Uint8Array, lock: boolean) => {
    const seen = new Uint8Array(size);
    if (blocked[start]) return seen;
    const closed = new Set(f.doors.filter((d) => d.sealed || (lock && d.locked)).map(idx));
    const q = new Int32Array(size);
    q[0] = start;
    seen[start] = 1;
    let tail = 1;
    const push = (i: number) => {
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
  const search = (p: Prop, seen: Uint8Array) => {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      if (CARDINAL.some((d) => seen[idx(shift({ x, y }, d))])) return true;
    }
    return false;
  };
  const before = reach(propBlock, true);
  return {
    before,
    safe(blocks: Cell[], access: Cell[]) {
      const block = propBlock.slice();
      for (const p of blocks) block[idx(p)] = 1;
      const early = reach(block, true);
      if (!access.every((p) => early[idx(p)]) || (key && !search(key, early))) return false;
      if (f.stairsDown && !early[idx(f.stairsDown)]) return false;
      const open = key ? reach(block, false) : early;
      return (!f.stairsUp || !!open[idx(f.stairsUp)]) && required.every((p) => search(p, open));
    },
  };
}

export function validateEnvironment(f: FloorData) {
  const plan = f.environment;
  if (!plan) return null;
  return routeCheck(f).safe(plannedBlocks(plan), plannedAccess(plan)) ? null : "environment cuts off the safe route";
}

export function populateEnvironment(f: FloorData) {
  const plan: EnvironmentPlan = { features: [], annexes: [] };
  f.environment = plan;
  if (f.theme === "roof") return f;
  const rng = makeRng(f.seed ^ 0xa1da77b7);
  const idx = (p: Cell) => p.y * f.w + p.x;
  const tile = (p: Cell) => f.tiles[idx(p)];
  const roomAt = (p: Cell) => f.rooms[f.roomOf[idx(p)]];
  const start = cellOf(f.playerStart.x, f.playerStart.y);
  const dist = (p: Cell, q = start) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
  const within = (p: Cell) => p.x > 0 && p.y > 0 && p.x < f.w - 1 && p.y < f.h - 1;
  const route = routeCheck(f);
  const reserved = new Set<number>();
  const occupied = new Set<number>();
  const roomsUsed = new Set<number>();
  const baseRooms = [...f.rooms];
  for (const p of f.props) {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) occupied.add(idx({ x, y }));
  }
  for (const actor of [...f.zombies, ...f.survivors]) occupied.add(idx(cellOf(actor.x, actor.y)));
  const free = (p: Cell) => within(p) && tile(p) === Tile.Floor && dist(p) >= 6 && !!route.before[idx(p)]
    && (!roomAt(p) || roomAt(p)?.role === "normal") && !occupied.has(idx(p)) && !reserved.has(idx(p));
  const reserve = (spots: Cell[]) => { for (const p of spots) reserved.add(idx(p)); };
  const safe = (blocks: Cell[], access: Cell[]) => route.safe([...plannedBlocks(plan), ...blocks], [...plannedAccess(plan), ...access]);
  const add = (feature: Feature) => plan.features.push(feature);
  const id = () => plan.features.length + 1;
  const shuffled = <T>(list: T[]) => list.map((v) => ({ v, key: rng() })).sort((a, b) => a.key - b.key).map(({ v }) => v);

  function cache(room: number, slot: number, p: Cell, loot: Loot, kind: Prop["kind"] = "supplycase"): Prop {
    return { ...p, id: 10000 + room * 16 + slot, kind, w: 1, h: 1, solid: true, loot, opened: false, label: "przeszukaj skrytk\u0119" };
  }

  function annex(kind: "obstruction" | "wall" | "flooded") {
    const choices: { gate: Cell; front: Cell; stand: Cell; park: Cell; side: number; x: number; y: number; h: number }[] = [];
    for (const side of [-1, 1]) for (let y = 5; y < f.h - 10; y++) {
      const x = side < 0 ? 1 : f.w - 3;
      const h = 5 + (y % 2);
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
      // Keep the first discovery on the basement's explored side of the building.
      return f.index === 0 && kind === "obstruction" ? Math.floor(dist(a.front) / 8) - Math.floor(dist(b.front) / 8) : 0;
    });
    for (const c of ordered) {
      const { gate, front, stand, park, side, x, y, h } = c;
      const control = shift(stand, { x: 0, y: 1 });
      if (!safe(kind === "obstruction" ? [front, park, gate] : kind === "wall" ? [front] : [], [kind === "wall" ? stand : kind === "flooded" ? control : stand])) continue;
      const r: Room = { id: f.rooms.length, x, y, w: 2, h, role: "normal", lit: kind === "flooded" || rng.chance(0.27), flicker: true };
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
      const inside = shift(gate, { x: side, y: 0 });
      f.floorStyle[idx(gate)] = f.floorStyle[idx(inside)];
      const seal = kind === "flooded" ? null : id();
      const eligible = Object.entries(DISCOVERIES).filter(([floor]) => Number(floor) <= f.index).map(([, weapon]) => weapon!);
      let reward: Loot = rng.pick<Loot>(["ammo", "ammo", "med", "battery", f.index >= 4 ? "shells" : "ammo", f.index >= 6 ? "bolts" : "battery"]);
      if (eligible.length && rng.chance(kind === "flooded" ? 0.20 : 0.32)) reward = rng.pick<WeaponId>(eligible);
      const props = [cache(r.id, 0, { x: side < 0 ? x : x + 1, y: y + h - 1 }, reward, reward === "med" ? "medbox" : "supplycase")];
      const second = rng.pick<Loot>(["med", "battery", "ammo"]);
      if (type < 4 || kind === "flooded") props.push(cache(r.id, 1, { x: inside.x, y: y + h - 1 }, second, second === "med" ? "medbox" : "supplycase"));
      const decor: Prop["kind"] = (["washer", "locker", "chair", "barrel", "stove"] as const)[type];
      props.push({ ...cache(r.id, 2, { x: side < 0 ? x : x + 1, y }, null, decor), label: undefined });
      const guard = kind !== "flooded" && f.index > 0 && (type === 4 || rng.chance(0.14))
        ? { ...center({ x: inside.x, y: y + h - 2 }), kind: "shambler" as const, room: r.id } : undefined;
      plan.annexes.push({ room: r.id, seal, props, guard });
      if (r.lit) f.lights.push({ ...center({ x: inside.x, y: y + 2 }), roomId: r.id, kind: "fluor", radius: 52, flicker: true });
      reserve([front, stand, park, ...(kind === "flooded" ? [control] : [])]);
      if (kind === "wall") {
        add({ id: id(), kind, at: gate, front, back: inside, room: r.id, landing: [front, inside] });
      } else if (kind === "obstruction") {
        f.tiles[idx(gate)] = Tile.Door;
        f.doors.push({ ...gate, hp: 4, locked: false, sealed: true, open: false, broken: false });
        const material = rng.pick<Obstacle>(["cabinet", "fridge", "dresser", "bookcase", "boards", "upturned"]);
        add({ id: id(), kind, at: front, gate, stand, park, room: r.id, material });
      } else {
        f.tiles[idx(gate)] = Tile.DoorOpen;
        f.doors.push({ ...gate, hp: 4, locked: false, open: true, broken: false });
        const cells = [{ x, y: y + 2 }, { x: x + 1, y: y + 2 }, { x: inside.x, y: y + 3 }];
        for (const p of cells) f.tiles[idx(p)] = Tile.Puddle;
        add({ id: id(), kind: "wire", at: cells[1], room: r.id, mode: "pool", mount: "floor", phase: rng() * 5, cells, control });
      }
      return true;
    }
    return false;
  }

  annex("obstruction");
  annex("wall");
  const flooded = (f.index === 0 || f.index >= 3) && rng.chance(f.index === 0 ? 0.82 : 0.55) && annex("flooded");

  function rooms(zones: string[]) {
    return shuffled(baseRooms.filter((r) => r.role === "normal" && !roomsUsed.has(r.id) && zones.includes(f.roomZones[r.id])));
  }

  function roomCells(r: Room) {
    const cells: Cell[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const p = { x, y };
      if (free(p)) cells.push(p);
    }
    return shuffled(cells);
  }

  function selectControl(r: Room, at: Cell, area: Cell[]) {
    const near = roomCells(r).filter((c) => dist(at, c) >= 2 && dist(at, c) <= 5 && !area.some((p) => sameCell(p, c)));
    return near.find((c) => safe(area, [c]));
  }

  for (const r of rooms([...maintenance, "KUCHNIA", "KORYTARZ"])) {
    const at = roomCells(r).find((p) => safe([p], []));
    if (!at) continue;
    const mode = f.index % 2 === 0 ? "pulse" : "steady";
    const control = f.roomZones[r.id] !== "KORYTARZ" && r.lit && rng.chance(0.7) ? selectControl(r, at, [at]) : undefined;
    const onWall = CARDINAL.some((d) => tile(shift(at, d)) === Tile.Wall);
    add({ id: id(), kind: "wire", at, room: r.id, mode, mount: onWall ? "wall" : rng.pick(["ceiling", "floor"]), phase: rng() * 5, cells: [at], control });
    reserve(control ? [at, control] : [at]);
    if (f.roomZones[r.id] !== "KORYTARZ") roomsUsed.add(r.id);
    break;
  }

  if (!flooded && f.index >= 2 && rng.chance(0.36)) annex("flooded");

  function steamShortcut() {
    const blocked = new Set(plannedBlocks(plan).map(idx));
    const props = new Set(f.props.filter((p) => p.solid).flatMap((p) =>
      Array.from({ length: p.w * p.h }, (_, i) => idx({ x: p.x + i % p.w, y: p.y + Math.floor(i / p.w) }))));
    const canPass = (x: number, y: number) => {
      const i = idx({ x, y });
      return !!route.before[i] && !blocked.has(i) && !props.has(i) && walkTiles.has(f.tiles[i]);
    };
    for (const r of rooms([...maintenance, "KORYTARZ"])) for (const front of roomCells(r)) for (const heading of shuffled(CARDINAL)) {
      const gate = shift(front, heading), back = shift(gate, heading);
      const inlet = shift(front, heading, -1), approach = shift(inlet, heading, -1), other = shift(back, heading);
      if (tile(gate) !== Tile.Wall || reserved.has(idx(gate)) || ![inlet, approach, back, other].every(free)) continue;
      const next = roomAt(back);
      if (!next || next === r || roomsUsed.has(next.id) || roomAt(other) !== next || roomAt(inlet) !== r) continue;
      const detour = astar(f.w, f.h, approach.x, approach.y, other.x, other.y, canPass);
      if (!detour || detour.length < 14) continue;
      const cells = [inlet, front];
      const control = selectControl(r, inlet, [...cells, back]);
      if (!control || !safe([...cells, back], [control, approach, other])) continue;
      f.tiles[idx(gate)] = Tile.Rubble;
      f.floorStyle[idx(gate)] = f.floorStyle[idx(front)];
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
  if (!steamPlaced && (f.index < 2 || rng.chance(0.73))) for (const r of rooms([...maintenance, "KORYTARZ"])) {
    for (const at of roomCells(r)) {
      const heading = shuffled(CARDINAL).find((d) => roomAt(shift(at, d))?.id === r.id && free(shift(at, d)));
      if (!heading) continue;
      const cells = [at, shift(at, heading)];
      const control = selectControl(r, at, cells);
      if (!control) continue;
      add({ id: id(), kind: "steam", at, cells, control, heading, phase: rng() * 5 });
      reserve([...cells, control]);
      roomsUsed.add(r.id);
      steamPlaced = true;
      // Side-by-side clues on the short path, not on the route around the jet.
      const shard = shift(cells[1], heading);
      if (rng.chance(0.48) && free(shard) && roomAt(shard)?.id === r.id && safe([shard], [])) {
        add({ id: id(), kind: "surface", at: shard, cells: [shard], material: "glass" });
        reserve([shard]);
      }
      break;
    }
    if (steamPlaced) break;
  }

  if (f.index > 0 && rng.chance(0.69)) {
    let placed = false;
    for (const r of rooms(["KUCHNIA", "KOT\u0141OWNIA", "WARSZTAT"])) {
      for (const at of roomCells(r)) {
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

  if (f.index > 0 && rng.chance(0.74)) for (const r of rooms(woodRooms)) {
    const at = roomCells(r).find((p) => CARDINAL.filter((d) => free(shift(p, d))).length >= 2 && safe([p], []));
    if (!at) continue;
    add({ id: id(), kind: "weak", at });
    reserve([at]);
    roomsUsed.add(r.id);
    break;
  }

  if (f.index === 0 || rng.chance(0.75)) {
    let placed = false;
    for (const r of rooms([...woodRooms, ...maintenance])) {
      for (const at of roomCells(r)) {
        for (const d of shuffled(CARDINAL)) {
          const landing = shift(at, d);
          const stand = shift(at, { x: d.y, y: -d.x });
          if (![landing, stand].every((p) => free(p) && roomAt(p)?.id === r.id) || !safe([at, landing], [stand])) continue;
          const loot = rng.pick<Loot>(["med", "ammo", "battery", f.index >= 4 ? "shells" : "ammo"]);
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

  for (const material of [rng.pick<Surface>(["glass", "cans", "planks"]), rng.pick<Surface>(["glass", "cans", "planks"])]) {
    for (const r of rooms(material === "planks" ? woodRooms : ["KORYTARZ", "PRALNIA", "KUCHNIA", "SCHOWEK", "WARSZTAT"])) {
      const at = roomCells(r).find((p) => safe([p], []));
      if (!at) continue;
      const cells = [at];
      const other = shuffled(CARDINAL.map((d) => shift(at, d))).find((p) => free(p) && roomAt(p)?.id === r.id && safe([at, p], []));
      if (other) cells.push(other);
      add({ id: id(), kind: "surface", at, cells, material });
      reserve(cells);
      roomsUsed.add(r.id);
      break;
    }
  }
  return f;
}