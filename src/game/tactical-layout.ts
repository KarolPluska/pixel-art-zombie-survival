import { placeDeviceNeatly } from "./apartment-layout";
import { TILE, Tile } from "./palette";
import { makeRng } from "./rng";
import type { FloorData, Prop, Room, ZombieSpawn } from "./types";

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function questReserved(f: FloorData): { x: number; y: number }[] {
  const q = f.vertical?.quest;
  const list = [
    q?.fuseCell,
    q?.beacon,
    q?.clueCell,
    q?.bypassCell,
    f.vertical?.elevator?.call,
    f.vertical?.elevator?.panel,
    f.vertical?.service?.panel,
    f.vertical?.stairsB?.stairs,
  ].filter((p): p is { x: number; y: number } => !!p);
  if (f.environment) {
    for (const ft of f.environment.features) {
      list.push(ft.at);
      if ("control" in ft && ft.control) list.push(ft.control);
      if ("park" in ft) list.push(ft.park);
      if ("stand" in ft) list.push(ft.stand);
      if ("front" in ft) list.push(ft.front);
      if ("cells" in ft) list.push(...ft.cells);
    }
  }
  return list;
}

function edgeBarrelCells(f: FloorData, room: Room, avoid: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const isCorr = f.roomZones[room.id] === "KORYTARZ";
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const i = y * f.w + x;
      if (f.tiles[i] !== Tile.Floor) continue;
      if (avoid.some((c) => c.x === x && c.y === y)) continue;
      if (f.props.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) continue;
      if (f.doors.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) <= 2)) continue;
      if (Math.hypot((x + 0.5) * TILE - f.playerStart.x, (y + 0.5) * TILE - f.playerStart.y) < 8 * TILE) continue;
      // Place flush against a real wall so barrels look intentionally stored, leaving walkthrough completely open!
      const wallAdj = N4.some(([dx, dy]) => f.tiles[(y + dy) * f.w + (x + dx)] === Tile.Wall);
      if (!wallAdj) continue;
      const openNeighbors = N4.filter(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        const ni = ny * f.w + nx;
        return f.tiles[ni] === Tile.Floor && !f.props.some((p) => p.solid && nx >= p.x && nx < p.x + p.w && ny >= p.y && ny < p.y + p.h);
      }).length;
      if (isCorr ? openNeighbors < 3 : openNeighbors < 2) continue;
      out.push({ x, y });
    }
  }
  return out;
}

function roomCells(f: FloorData, room: Room, avoid: { x: number; y: number }[]) {
  const cells: { x: number; y: number }[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const i = y * f.w + x;
      if (avoid.some((p) => p.x === x && p.y === y)) continue;
      if (f.tiles[i] !== Tile.Floor && f.tiles[i] !== Tile.Rubble) continue;
      if (f.props.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) continue;
      if (f.zombies.some((z) => Math.floor(z.x / TILE) === x && Math.floor(z.y / TILE) === y)) continue;
      if (Math.hypot((x + 0.5) * TILE - f.playerStart.x, (y + 0.5) * TILE - f.playerStart.y) < 7 * TILE) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Adds tactical devices (usable wall-mounted TV + radio receivers) and contextually stored
 * explosive barrels without obstructing any safe lane, doorway or furniture access zone.
 * For planned apartment floors (v2), corridor patrols & crawlers are seeded by populateFloorZombies.
 */
export function installTacticalContent(f: FloorData) {
  if (f.theme === "roof" || f.index >= 10) return f;
  const rng = makeRng((f.seed ^ 0x64a91f3b) >>> 0);
  const avoid = questReserved(f);
  const isPlanned = !!f.apartments?.length;
  const halls = f.rooms.filter((r) => f.roomZones[r.id] === "KORYTARZ");
  const usable = f.rooms.filter(
    (r) =>
      r.role === "normal" &&
      !["KORYTARZ", "WINDA OSOBOWA", "PION TECHNICZNY", "KLATKA B", "KLATKA SCHODOWA", "ZALANY MAGAZYN"].includes(
        f.roomZones[r.id],
      ) &&
      !f.environment?.annexes.some((a) => a.room === r.id),
  );
  const tech = usable.filter((r) => ["SCHOWEK", "WARSZTAT", "KOTŁOWNIA", "PRALNIA"].includes(f.roomZones[r.id]));
  let nextProp = 52000;

  // 1) Guarantee at least one usable wall-mounted TV facing lounge seating (reuses existing furnished TV cleanly!)
  const existingTv = f.props.find((p) => p.kind === "tv");
  if (existingTv) {
    existingTv.label = existingTv.label ?? "telewizor";
  } else {
    const tvOrder = usable.filter((r) => ["SALON", "SYPIALNIA", "LOKAL UŻYTKOWY", "WARSZTAT"].includes(f.roomZones[r.id]));
    for (const room of [...tvOrder, ...usable]) {
      const placed = placeDeviceNeatly(f, room, "tv", nextProp, "telewizor", avoid, f.playerStart, rng, TILE);
      if (placed) {
        nextProp++;
        avoid.push({ x: placed.x, y: placed.y });
        break;
      }
    }
  }

  // 2) Guarantee 1–2 radio receivers neatly mounted along real walls / next to furniture (NEVER dropped floating mid-floor!)
  const wantRadios = f.index === 0 ? 1 : 2;
  const radioRooms = usable
    .filter((r) => ["SALON", "KUCHNIA", "LOKAL UŻYTKOWY", "WARSZTAT", "SYPIALNIA", "PRZEDPOKÓJ"].includes(f.roomZones[r.id]))
    .slice()
    .sort((a, c) => {
      // Spread radios across different apartments/locations
      const pa = ["LOKAL UŻYTKOWY", "WARSZTAT", "SALON", "KUCHNIA"].indexOf(f.roomZones[a.id]);
      const pc = ["LOKAL UŻYTKOWY", "WARSZTAT", "SALON", "KUCHNIA"].indexOf(f.roomZones[c.id]);
      return (pa < 0 ? 9 : pa) - (pc < 0 ? 9 : pc) + (rng() - 0.5) * 2;
    });
  let placedRadios = 0;
  const usedApt = new Set<number>();
  for (const room of radioRooms) {
    if (placedRadios >= wantRadios) break;
    if (room.apartmentId !== undefined && usedApt.has(room.apartmentId) && radioRooms.length > wantRadios) continue;
    const placed = placeDeviceNeatly(f, room, "radio", nextProp, "radio", avoid, f.playerStart, rng, TILE);
    if (placed) {
      nextProp++;
      placedRadios++;
      avoid.push({ x: placed.x, y: placed.y });
      if (room.apartmentId !== undefined) usedApt.add(room.apartmentId);
    }
  }
  if (placedRadios === 0) {
    for (const room of usable) {
      const placed = placeDeviceNeatly(f, room, "radio", nextProp, "radio", avoid, f.playerStart, rng, TILE);
      if (placed) {
        nextProp++;
        avoid.push({ x: placed.x, y: placed.y });
        break;
      }
    }
  }

  // 3) Explosive barrels tucked safely against solid walls in technical spaces & wide corridor corners
  const barrelPool = [...tech, ...halls.filter((h) => h.w >= 4)];
  const barrelCount = Math.min(3, 1 + Math.floor(f.index / 3));
  let placedBarrels = 0;
  for (let attempt = 0; attempt < barrelCount * 6 && placedBarrels < barrelCount && barrelPool.length; attempt++) {
    const room = barrelPool[rng.int(barrelPool.length)];
    const cells = edgeBarrelCells(f, room, avoid);
    if (!cells.length) continue;
    const cell = cells[rng.int(cells.length)];
    if (f.props.some((p) => p.kind === "explosive" && Math.abs(p.x - cell.x) + Math.abs(p.y - cell.y) <= 8)) continue;
    const barrel: Prop = {
      id: nextProp++,
      kind: "explosive",
      x: cell.x,
      y: cell.y,
      w: 1,
      h: 1,
      solid: false,
      loot: null,
      opened: false,
      label: "czerwona beczka",
    };
    f.props.push(barrel);
    avoid.push(cell);
    placedBarrels++;
  }

  // Legacy generatorVersion === 1 fallback patrols/crawler kept intact for old-format saves
  if (!isPlanned) {
    const crawlerRooms = usable.length ? usable : halls;
    if (f.index > 0 && crawlerRooms.length) {
      const room = crawlerRooms[rng.int(crawlerRooms.length)];
      const cells = roomCells(f, room, avoid);
      if (cells.length) {
        const c = cells[rng.int(cells.length)];
        f.zombies.push({ x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE, kind: "crawler", room: room.id, role: "crawler" });
      }
    }
    for (let n = 0; n < Math.min(2, halls.length); n++) {
      const room = halls[(n + f.index) % halls.length];
      const cells = roomCells(f, room, avoid).filter((c) => c.x > 8 && c.x < f.w - 9);
      if (cells.length < 4) continue;
      const groupSize = n === 0 ? 1 : 2;
      const start = cells[rng.int(cells.length)];
      for (let k = 0; k < groupSize; k++) {
        const spawn: ZombieSpawn = {
          x: (start.x + 0.5 + k * 0.65) * TILE,
          y: (start.y + 0.5) * TILE,
          kind: n === 0 ? "shambler" : k === 0 ? "shambler" : "runner",
          room: room.id,
        };
        f.zombies.push(spawn);
      }
    }
  }
  return f;
}
