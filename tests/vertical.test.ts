import assert from "node:assert/strict";
import { CHECKPOINT_VERSION, parseCheckpoint } from "../src/game/checkpoint";
import { generateFloor, validateFloor } from "../src/game/generate";
import { starterInventory } from "../src/game/inventory";
import {
  ELEVATOR_Y,
  SERVICE_Y,
  STAIRS_B_Y,
  defaultFloorQuestState,
  initialBuildingState,
  makeBuildingPlan,
  type VerticalQuestKind,
} from "../src/game/vertical-layout";

const ALL_SCENARIOS: VerticalQuestKind[] = [
  "repair-lift",
  "broken-stairs",
  "flooded-route",
  "lure-horde",
  "service-shaft",
  "apartment-bypass",
];

let floorsChecked = 0;
const seenVariants = new Set<string>();
const seenLandingFeatures = new Set<string>();

for (let run = 0; run < 24; run++) {
  const runSeed = (101 + run * 7919) >>> 0;
  const plan = makeBuildingPlan(runSeed);
  const runQuests = new Set<VerticalQuestKind>();
  let prevQuest: VerticalQuestKind | null = null;

  for (let i = 0; i <= 10; i++) {
    const floor = generateFloor(i, (runSeed + i * 131) >>> 0, runSeed);
    assert.equal(validateFloor(floor), null, `Invalid floor ${i} on seed ${runSeed}`);
    floorsChecked++;

    if (i === 10) {
      assert.equal(floor.vertical, undefined, "Roof should not receive stairwell/lift scenarios");
      continue;
    }

    const v = floor.vertical!;
    assert.ok(v, `Missing vertical layout on floor ${i}`);
    assert.ok(v.elevator, `Missing elevator on floor ${i}`);
    assert.ok(v.service, `Missing service shaft on floor ${i}`);
    assert.ok(v.stairsB, `Missing Klatka B on floor ${i}`);

    // Spatial consistency across the entire building!
    assert.equal(v.elevator.door.y, ELEVATOR_Y + 1, "Elevator shaft must align vertically across floors");
    assert.equal(v.service.door.y, SERVICE_Y + 1, "Service shaft must align vertically across floors");
    assert.equal(v.stairsB.door.y, STAIRS_B_Y + 1, "Klatka B must align vertically across floors");

    seenLandingFeatures.add(v.landingFeature);
    seenVariants.add(plan.elevatorVariants[i]);

    const q = v.quest;
    if (q) {
      assert.notEqual(q.kind, prevQuest, `Adjacent floors ${i - 1} and ${i} must not share scenario ${q.kind}`);
      runQuests.add(q.kind);
      prevQuest = q.kind;

      if (q.kind === "repair-lift") {
        assert.ok(q.fuseCell, "repair-lift must place a spare fuse cell");
      } else if (q.kind === "lure-horde") {
        assert.ok(q.beacon, "lure-horde must place an acoustic beacon");
      } else if (q.kind === "service-shaft") {
        assert.ok(q.clueCell && q.code, "service-shaft must place emergency code plaque");
      } else if (q.kind === "apartment-bypass") {
        assert.ok(q.bypassCell, "apartment-bypass must place movable bypass obstacle");
      }
    } else {
      prevQuest = null;
    }
  }

  for (const kind of ALL_SCENARIOS) {
    assert.ok(runQuests.has(kind), `Run ${runSeed} missing scenario ${kind}`);
  }
  // Calmer breather floors must exist in every run
  assert.equal(plan.floorQuests[0], undefined);
  assert.equal(plan.floorQuests[4], undefined);
  assert.equal(plan.floorQuests[7], undefined);
}

for (const f of ["empty", "window", "stash", "obstacle", "traces", "broken-flight"]) {
  assert.ok(seenLandingFeatures.has(f), `Missing landing feature variety: ${f}`);
}
assert.ok(seenVariants.has("routine") && seenVariants.has("rattle") && seenVariants.has("stop"));

// Checkpoint v2 round-trip validation with active elevator ride and passage
const state = initialBuildingState();
state.elevatorPowered = true;
state.elevatorBroken = true;
state.quests[1] = { ...defaultFloorQuestState(), stage: 4, fuseTaken: true, resolved: true };
state.elevatorRide = {
  from: 1, to: 2, elapsed: 2.5, phase: "stranded", variant: "fault",
  cabinX: 4, cabinY: -2, doorOpen: 0, leverProgress: 0,
};
state.journal.push("Testowy wpis dziennika.");

const floor0 = generateFloor(0, 7, 7);
const sample = {
  version: CHECKPOINT_VERSION,
  seed: 7,
  floor: 0,
  time: 42,
  kills: 3,
  hero: { x: floor0.playerStart.x, y: floor0.playerStart.y, hp: 85, stamina: 90, battery: 75, flash: true },
  pack: starterInventory(),
  bossKilled: false,
  building: state,
  floors: Array.from({ length: 11 }, (_, i) =>
    i === 0
      ? {
          layout: floor0.seed,
          hasKey: false,
          environment: { clock: 10, features: {} },
          explored: "0".repeat(floor0.w * floor0.h),
          opened: [],
          survivorsGone: [],
          doors: [],
          zombies: [],
        }
      : null,
  ),
};

const parsed = parseCheckpoint(JSON.stringify(sample));
assert.ok(parsed, "Valid v2 checkpoint must parse cleanly");
assert.equal(parsed.building.elevatorRide?.phase, "stranded");
assert.equal(parsed.building.quests[1]?.fuseTaken, true);
assert.equal(parsed.building.journal.includes("Testowy wpis dziennika."), true);

console.log(`OK: ${floorsChecked} floors verified (24 full buildings): aligned shafts, all 6 scenarios interleaved with calm floors, landing variety, and v2 checkpoint round-trip.`);
