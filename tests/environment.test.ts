import assert from "node:assert/strict";
import { parseCheckpoint } from "../src/game/checkpoint";
import { Environment, createEnvironmentState, cycleFor, effectBounds, FLOOR_WARNING, GAS_CLEAR, GAS_WARNING, SHELF_WARNING, WALL_WARNING, type EnvironmentWorld } from "../src/game/environment";
import { center, plannedAccess, plannedBlocks, sameCell, validateEnvironment, type Cell, type Feature } from "../src/game/environment-layout";
import { generateFloor, validateFloor } from "../src/game/generate";
import { DISCOVERIES, isWeapon } from "../src/game/inventory";
import { TILE, Tile } from "../src/game/palette";
import type { FloorData } from "../src/game/types";

const tile = (d: FloorData, p: Cell) => d.tiles[p.y * d.w + p.x];
const samples = new Map<string, { d: FloorData; f: Feature }>();
const kinds = new Set<string>();
const rooms = new Set<string>();
const safe = new Set([Tile.Floor, Tile.Puddle, Tile.Rubble] as number[]);
let shortcuts = 0;
let tested = 0;
for (let i = 0; i < 11; i++) for (let n = 0; n < 32; n++) {
  const seed = 7 + n * 218951 + i * 3347;
  const d = generateFloor(i, seed);
  const plan = d.environment!;
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
      const check = (p: Cell) => d.breaches.some((b) => sameCell(b, p));
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
for (const name of ["wall", "wire:steady", "wire:pulse", "wire:pool", "mount:wall", "mount:ceiling", "mount:floor", "shelf", "gas", "steam", "weak",
  "obstruction:cabinet", "obstruction:fridge", "obstruction:dresser", "obstruction:bookcase", "obstruction:boards", "obstruction:upturned", "surface:glass", "surface:cans", "surface:planks"]) {
  assert.ok(kinds.has(name), `No generated ${name}`);
}
assert.ok(shortcuts > 15 && rooms.size >= 6, "Linked rooms were not represented in the sweep");

function create<F extends Feature>(d: FloorData, f: F) {
  const floor = structuredClone(d);
  floor.environment!.features = [f];
  floor.environment!.annexes = floor.environment!.annexes.filter((a) => a.seal === f.id);
  const hero = { id: 0, x: d.playerStart.x, y: d.playerStart.y, radius: 4.4, hidden: false, busy: false };
  const zombie = { id: 2, x: -50, y: -50, radius: 5 };
  const hits: { id: number; damage: number }[] = [];
  const alerts: { p: Cell; radius: number }[] = [];
  const sounds: string[] = [];
  let changes = 0;
  let blocked = false;
  const world: EnvironmentWorld = {
    player: () => hero, actors: () => [...(hero.hidden ? [] : [hero]), zombie], clear: () => !blocked,
    hit: (a, damage) => { hits.push({ id: a.id, damage }); }, sound: (sound) => sounds.push(sound), alert: (p, radius) => alerts.push({ p, radius }),
    dust: () => {}, shake: () => {}, say: () => {}, changed: () => { changes++; },
  };
  const env = new Environment(floor, createEnvironmentState(), world);
  const tick = (seconds: number) => { for (let t = 0; t < seconds; t += 0.02) env.update(0.02); };
  return { f, floor, env, hero, zombie, hits, alerts, sounds, world, tick, block: (v: boolean) => { blocked = v; }, changes: () => changes };
}

function sample<K extends Feature["kind"]>(kind: K, key: string = kind) {
  const v = samples.get(key)!;
  assert.equal(v.f.kind, kind);
  return create(v.d, v.f as Extract<Feature, { kind: K }>);
}

const pool = sample("wire", "wire:pool");
assert.ok(pool.f.control);
Object.assign(pool.hero, center(pool.f.cells[1]));
Object.assign(pool.zombie, center(pool.f.cells[2]));
pool.tick(0.95);
assert.deepEqual(pool.hits.map((h) => h.id), [0, 2], "Electricity hits both actors, not every frame");
pool.tick(0.30);
assert.deepEqual(pool.hits.map((h) => h.id), [0, 2, 0, 2]);
Object.assign(pool.hero, center(pool.f.control));
assert.equal(pool.env.use(), true);
assert.equal(pool.env.roomDark(pool.f.room), true);
pool.tick(2);
assert.equal(pool.hits.length, 4);
const restoredPool = new Environment(pool.floor, JSON.parse(JSON.stringify(pool.env.state)), pool.world);
assert.ok(restoredPool.roomDark(pool.f.room) && restoredPool.read(pool.f).off);

const pulse = sample("wire", "wire:pulse");
const bounds = effectBounds(pulse.f)[0];
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

const wall = sample("wall");
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

const box = sample("obstruction", "obstruction:fridge");
Object.assign(box.hero, center(box.f.stand));
assert.ok(box.env.hint()?.hold);
assert.equal(box.env.use(), true);
assert.equal(box.env.read(box.f).progress, 0, "A tap is not a hold");
for (let t = 0; t < 1; t += 0.02) { box.env.updateWork(0.02, true, 100, false); box.env.update(0.02); }
const moved = box.env.read(box.f).progress;
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

const boardsA = sample("obstruction", "obstruction:boards"), boardsB = sample("obstruction", "obstruction:boards");
Object.assign(boardsA.hero, center(boardsA.f.stand)); Object.assign(boardsB.hero, center(boardsB.f.stand));
boardsA.env.updateWork(1, true, 100, false); boardsB.env.updateWork(1, true, 100, true);
assert.ok(boardsB.env.read(boardsB.f).progress > boardsA.env.read(boardsA.f).progress);

const steam = sample("steam");
steam.env.state.clock = 6.3 - steam.f.phase + 4.9;
const jet = effectBounds(steam.f)[0];
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

const weak = sample("weak");
Object.assign(weak.hero, center(weak.f.at));
weak.tick(FLOOR_WARNING - 0.1);
assert.equal(tile(weak.floor, weak.f.at), Tile.Floor);
Object.assign(weak.hero, weak.floor.playerStart);
weak.tick(0.23);
assert.equal(tile(weak.floor, weak.f.at), Tile.Hole);
assert.deepEqual(weak.hits, []);

const shelf = sample("shelf");
Object.assign(shelf.hero, center(shelf.f.stand));
const point = center(shelf.f.at);
assert.equal(shelf.env.strike(Math.atan2(point.y - shelf.hero.y, point.x - shelf.hero.x), 22), true);
Object.assign(shelf.zombie, center(shelf.f.landing));
shelf.tick(SHELF_WARNING + 0.1);
assert.ok(!shelf.env.blocksTile(shelf.f.at.x, shelf.f.at.y) && shelf.env.blocksTile(shelf.f.landing.x, shelf.f.landing.y));
assert.deepEqual(shelf.hits.map((h) => h.id), [2]);
assert.equal(shelf.floor.props.filter((p) => p.id === shelf.f.stash.id).length, 1);
new Environment(shelf.floor, shelf.env.state, shelf.world);
assert.equal(shelf.floor.props.filter((p) => p.id === shelf.f.stash.id).length, 1, "Shelf may only reveal one stash");

const glass = sample("surface", "surface:glass");
Object.assign(glass.hero, center(glass.f.at));
glass.env.footstep(glass.hero, false);
glass.tick(0.5);
glass.env.footstep(glass.hero, true);
assert.equal(glass.hits.length, 1);
assert.ok(glass.alerts[1].radius > glass.alerts[0].radius);

const gas = sample("gas");
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
const lit = sample("gas");
Object.assign(lit.zombie, center(lit.f.cells[1]));
lit.env.ignite(center(lit.f.at));
lit.tick(GAS_WARNING + 0.2);
assert.deepEqual(lit.hits.map((h) => h.id), [2]);
assert.ok(lit.sounds.includes("flare"));
assert.equal(parseCheckpoint("{this is not a save}"), null);
console.log(`OK: ${tested} floors with safe routes, seeded annexes and ${shortcuts} steam shortcuts; all environment states, damage, controls and interactions.`);