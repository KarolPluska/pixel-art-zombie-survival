import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateFloor, stairAnchor, validateFloor, LAYOUT_FAMILIES } from "../src/game/generate";
import { validateEnvironment } from "../src/game/environment-layout";
import { MAP_H, MAP_W, TILE, Tile } from "../src/game/palette";

const legacyMaps: { seed: number; tiles: string; start: { x: number; y: number }; up: { x: number; y: number } }[] =
  JSON.parse(readFileSync("reports/baseline-maps.json", "utf8"));
const summary = JSON.parse(readFileSync("reports/layout-metrics.json", "utf8")).summary;
const families = new Set<string>();
const starts = new Set<string>();
const signatures = new Set<string>();
const valid = new Set<number>([Tile.Floor, Tile.Rubble, Tile.Puddle, Tile.StairsUp, Tile.StairsDown, Tile.Door, Tile.DoorOpen]);
let checked = 0;

for (const { seed, tiles, start, up } of legacyMaps) {
  const legacy = generateFloor(0, seed, seed, 1);
  assert.equal(Array.from(legacy.tiles).join(""), tiles, "Existing save must replay the old geometry exactly");
  assert.deepEqual(legacy.playerStart, start);
  assert.deepEqual(legacy.stairsUp, up);

  for (let index = 0; index <= 3; index++) {
    const floor = generateFloor(index, (seed + index * 131) >>> 0, seed);
    assert.equal(validateFloor(floor), null);
    assert.equal(validateEnvironment(floor), null);
    assert.ok(floor.rooms.length >= 10, "Fallback cannot dominate the audit");
    const family = LAYOUT_FAMILIES.find((v) => floor.sub.endsWith(v));
    assert.ok(family, `Unexpected fallback on seed ${seed} floor ${index}`);
    families.add(family);
    if (index === 0) starts.add(`${floor.playerStart.x},${floor.playerStart.y}`);
    if (index > 0) assert.deepEqual(floor.stairsDown, stairAnchor(seed, index - 1));
    assert.deepEqual(floor.stairsUp, stairAnchor(seed, index));
    assert.ok(floor.vertical?.elevator && floor.vertical?.service && floor.vertical?.stairsB);
    const sx = Math.floor(floor.playerStart.x / TILE), sy = Math.floor(floor.playerStart.y / TILE);
    assert.ok(valid.has(floor.tiles[sy * MAP_W + sx]));
    for (const d of floor.doors) {
      const i = d.y * MAP_W + d.x;
      if (d.route) continue;
      assert.ok(valid.has(floor.tiles[i]));
    }
    // Floor-wide obstacles still allow every mandatory item and connection through the existing validator.
    assert.equal(floor.tiles.length, MAP_W * MAP_H);
    checked++;
  }
  const floor = generateFloor(0, seed, seed);
  const corridor = floor.rooms.filter(r => floor.roomZones[r.id] === "KORYTARZ").map(r => `${r.x},${r.y},${r.w},${r.h}`).join("|");
  signatures.add(corridor);
}
assert.ok(families.size >= 6, `Only ${families.size} structural families`);
assert.ok(starts.size >= 20, `Only ${starts.size} distinct starts`);
assert.ok(signatures.size >= 24, `Only ${signatures.size} distinct corridor networks`);
assert.equal(summary.current.fallbacks, 0);
assert.ok(summary.current.uniqueCorridorSignatures > summary.baseline.uniqueCorridorSignatures * 4);
console.log(`OK: ${checked} new floors, ${legacyMaps.length} legacy save maps reproduced, ${families.size} families, ${starts.size} starts and ${signatures.size} corridor networks.`);