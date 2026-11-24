import { TILE, Tile } from "./palette";
import { makeRng } from "./rng";
import type { FloorData, Prop, Room, ZombieSpawn } from "./types";

function roomCells(f: FloorData, room: Room) {
  const cells: { x: number; y: number }[] = [];
  const q = f.vertical?.quest;
  const reserved = [q?.fuseCell, q?.beacon, q?.clueCell, q?.bypassCell,
    f.vertical?.elevator?.call, f.vertical?.elevator?.panel, f.vertical?.service?.panel, f.vertical?.stairsB?.stairs]
    .filter((p): p is { x: number; y: number } => !!p);
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
    const i = y * f.w + x;
    if (reserved.some((p) => p.x === x && p.y === y)) continue;
    if (f.tiles[i] !== Tile.Floor && f.tiles[i] !== Tile.Rubble) continue;
    if (f.props.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) continue;
    if (f.zombies.some((z) => Math.floor(z.x / TILE) === x && Math.floor(z.y / TILE) === y)) continue;
    if (Math.hypot((x + 0.5) * TILE - f.playerStart.x, (y + 0.5) * TILE - f.playerStart.y) < 7 * TILE) continue;
    cells.push({ x, y });
  }
  return cells;
}

/** Adds tactical content without changing the validated safe route or placing solid props. */
export function installTacticalContent(f: FloorData) {
  if (f.theme === "roof" || f.index >= 10) return f;
  const rng = makeRng((f.seed ^ 0x64a91f3b) >>> 0);
  const halls = f.rooms.filter((r) => f.roomZones[r.id] === "KORYTARZ");
  const usable = f.rooms.filter((r) => r.role === "normal" && !["KORYTARZ", "WINDA OSOBOWA", "PION TECHNICZNY", "KLATKA B"].includes(f.roomZones[r.id]));
  const tech = usable.filter((r) => ["SCHOWEK", "WARSZTAT", "KOTŁOWNIA", "PRALNIA"].includes(f.roomZones[r.id]));
  let nextProp = 52000;
  const add = (kind: Prop["kind"], cell: { x: number; y: number }, label: string) => {
    const p: Prop = { id: nextProp++, kind, x: cell.x, y: cell.y, w: 1, h: 1, solid: false, loot: null, opened: false, label };
    f.props.push(p);
  };

  // Radio receivers and one usable TV are guaranteed on every ordinary floor.
  const televisionRoom = usable.find((r) => ["SALON", "SYPIALNIA", "LOKAL UŻYTKOWY", "WARSZTAT"].includes(f.roomZones[r.id])) ?? usable[0];
  if (televisionRoom) {
    const cells = roomCells(f, televisionRoom);
    if (cells.length) add("tv", cells[rng.int(cells.length)], "telewizor");
  }
  const radioRooms = usable.filter((r) => ["SALON", "SYPIALNIA", "LOKAL UŻYTKOWY", "WARSZTAT", "KUCHNIA"].includes(f.roomZones[r.id]));
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

  // Natural crawlers have low silhouettes but readable pale hands and a blood trail.
  const crawlerRooms = usable.length ? usable : halls;
  if (f.index > 0 && crawlerRooms.length) {
    const room = crawlerRooms[rng.int(crawlerRooms.length)];
    const cells = roomCells(f, room);
    if (cells.length) {
      const c = cells[rng.int(cells.length)];
      f.zombies.push({ x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE, kind: "crawler", room: room.id });
    }
  }

  // Dedicated corridor patrols: one solitary route and a small two-zombie group.
  for (let n = 0; n < Math.min(2, halls.length); n++) {
    const room = halls[(n + f.index) % halls.length];
    const cells = roomCells(f, room).filter((c) => c.x > 8 && c.x < f.w - 9);
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
  return f;
}
