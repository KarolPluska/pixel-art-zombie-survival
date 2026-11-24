import assert from "node:assert/strict";
import { generateFloor, validateFloor } from "../src/game/generate";
import { DISCOVERIES, WEAPONS, assignSlot, discover, starterInventory } from "../src/game/inventory";

const starter = starterInventory();
assert.deepEqual(starter.slots, ["crowbar", "pistol", null]);
assert.equal(assignSlot(starter, 2, "shotgun"), starter);
assert.equal(assignSlot(starter, 3, "pistol"), starter);
assert.deepEqual(starterInventory(["pistol", "pistol", null]).slots, starter.slots);
assert.deepEqual(starterInventory([null, "crowbar", "pistol"]).slots, [null, "crowbar", "pistol"]);
let inv = starterInventory();
for (const id of ["hatchet", "revolver", "shotgun", "crossbow"] as const) {
  assert.equal(discover(inv, id), true);
  const stock = { ...inv.stock };
  assert.equal(discover(inv, id), false);
  assert.deepEqual(inv.stock, stock);
  assert.equal(inv.magazines[id], WEAPONS[id].capacity);
}
assert.deepEqual(inv.slots, starter.slots);
inv = assignSlot(inv, 2, "hatchet");
inv = assignSlot(inv, 0, "revolver");
assert.deepEqual(inv.slots, ["revolver", "pistol", "hatchet"]);
assert.ok(inv.owned.includes("crowbar"));
inv = assignSlot(inv, 2, "revolver");
assert.deepEqual(inv.slots, ["hatchet", "pistol", "revolver"]);
assert.equal(inv.slots[inv.active], "revolver");
inv = assignSlot(inv, 1, null);
inv = assignSlot(inv, 2, null);
assert.equal(inv.slots[inv.active], "hatchet");
assert.equal(assignSlot(inv, 0, null), inv);
assert.equal(inv.owned.length, 6);

let tested = 0;
const decorationKinds = new Set<string>();
const floorDetails = new Set<string>();
for (let n = 0; n < 64; n++) {
  for (let i = 0; i < 11; i++) {
    const floor = generateFloor(i, (n * 218951 + i * 3347 + 7) >>> 0);
    for (const decal of floor.wallDecals) decorationKinds.add(decal.kind);
    for (const decal of floor.decals) floorDetails.add(decal.kind);
    assert.equal(validateFloor(floor), null);
    assert.ok(floor.theme === "roof" || floor.rooms.length >= 10, "Unexpected fallback");
    const cache = DISCOVERIES[i];
    if (cache) assert.equal(floor.props.filter(p => p.loot === cache).length, 1);
    for (const p of floor.props) {
      const r = floor.rooms[floor.roomOf[p.y * floor.w + p.x]];
      const zone = r ? floor.roomZones[r.id] : "";
      if (i < 10 && p.loot === "ammo") assert.ok(["SCHOWEK", "WARSZTAT"].includes(zone));
      if (i < 10 && p.loot === "med") assert.equal(p.kind, "medbox");
      if (p.loot === "key") { assert.equal(p.kind, "locker"); assert.equal(zone, "KORYTARZ"); }
      if (p.loot === "note") assert.ok(p.kind === "desk" || p.kind === "bookshelf");
      if ((p.kind === "crate" || p.kind === "supplycase") && i < 10) {
        assert.ok(["KOTŁOWNIA", "WARSZTAT", "SCHOWEK"].includes(zone), "Crate in a residential room");
        assert.ok(p.x === r.x || p.y === r.y || p.x + p.w === r.x + r.w || p.y + p.h === r.y + r.h, "Unanchored crate");
      }
    }
    tested++;
  }
}
for (const kind of ["familyphoto", "calendar", "missingposter", "caution", "emergencylamp", "camera"]) {
  assert.ok(decorationKinds.has(kind), `Missing environmental detail: ${kind}`);
}
for (const kind of ["book", "cloth", "pills"]) assert.ok(floorDetails.has(kind), `Missing floor detail: ${kind}`);
console.log(`OK: inventory, three-slot swaps, discovery and ammunition; ${tested} floors with reachable, contextual loot.`);