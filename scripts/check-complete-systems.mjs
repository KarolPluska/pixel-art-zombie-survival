import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const url = "http://127.0.0.1:5194";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5194", "--strictPort"], { stdio: "ignore" });
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("button", { name: "WEJDŹ DO BLOKU" }).click();
  await page.locator(".hud-kit").waitFor();

  const freight = await page.evaluate(() => {
    const g = window.game;
    g.enter(2, "start");
    g.floor.zombies = [];
    // Isolate the service panel from unrelated floor quests and wardrobes.
    g.data().vertical.quest = null;
    for (const p of g.data().props) if (["wardrobe", "locker"].includes(p.kind)) { p.loot = "note"; p.opened = false; }
    const service = g.data().vertical.service;
    g.px = (service.outside.x + 0.5) * 16;
    g.py = (service.outside.y + 0.5) * 16;
    g.interactLock = 0;
    g.interact();
    const choice = g.verticalChoice?.mode;
    g.chooseOption(0);
    for (let i = 0; i < 120; i++) g.tickVertical(0.025);
    const open = g.serviceLiftState().openFloor;
    g.px = (service.center.x + 0.5) * 16;
    g.py = (service.center.y + 0.5) * 16;
    g.startFreightRide();
    g.chooseOption(0);
    const started = g.building.elevatorRide?.kind;
    const phases = [];
    for (let i = 0; i < 420 && g.building.elevatorRide; i++) {
      phases.push(g.building.elevatorRide.phase);
      g.updateLiftRide(0.025);
    }
    return { choice, open, started, floor: g.floorIndex, kind: g.building.serviceLift.floor,
      arrivalOpen: g.serviceLiftState().openFloor, phases: [...new Set(phases)], hasPassage: !!g.building.passage };
  });
  assert.equal(freight.choice, "service");
  assert.equal(freight.open, 2);
  assert.equal(freight.started, "freight");
  assert.equal(freight.floor, 3);
  assert.equal(freight.kind, 3);
  assert.equal(freight.arrivalOpen, 3);
  assert.equal(freight.hasPassage, false);
  assert.ok(freight.phases.includes("doors") && freight.phases.includes("accel") && freight.phases.includes("moving") && freight.phases.includes("arrive"));
  console.log("OK: freight elevator call/cabin/ride/arrival", freight.phases);

  const rideVariants = await page.evaluate(() => {
    const g = window.game;
    const result = {};
    for (const variant of ["stop", "mid-shaft", "rattle", "threat"]) {
      g.enter(2, "start");
      g.building.elevatorRide = { from: 2, to: 4, elapsed: 0, phase: "moving", variant,
        cabinX: 0, cabinY: 0, doorOpen: 0, leverProgress: 0, ...(variant === "stop" ? { stopFloor: 3 } : {}) };
      g.verticalChoice = null; g.building.passage = null;
      let sawChoice = false, warned = false;
      for (let i = 0; i < 500 && g.building.elevatorRide; i++) {
        g.updateLiftRide(0.025);
        if (g.building.elevatorRide?.threatWarned) warned = true;
        if (g.verticalChoice && g.building.elevatorRide?.phase === "stop") {
          sawChoice = true;
          g.chooseOption(1); // continue the journey after the unplanned stop
        }
      }
      result[variant] = { floor: g.floorIndex, sawChoice, ledge: g.building.passage?.route === "ledge", warned };
    }
    return result;
  });
  assert.equal(rideVariants.stop.floor, 4);
  assert.equal(rideVariants.stop.sawChoice, true);
  assert.equal(rideVariants["mid-shaft"].ledge, true);
  assert.equal(rideVariants.rattle.floor, 4);
  assert.equal(rideVariants.threat.floor, 4);
  assert.equal(rideVariants.threat.warned, true);

  // Service-lift state survives a real pause/reload/resume cycle.
  await page.evaluate(() => { const g = window.game; g.enter(3, "start"); g.serviceLiftState().openFloor = 3; g.setPaused(true); });
  await page.reload();
  await page.getByRole("button", { name: "Wznów wyprawę" }).click();
  await page.locator(".hud-kit").waitFor();
  assert.equal(await page.evaluate(() => window.game.serviceLiftState().openFloor), 3);

  const hiding = await page.evaluate(() => {
    const g = window.game;
    g.floor.zombies = []; g.floor.survivors = []; g.activeDialog = null; g.director.choice = null;
    g.director.hidden = false; g.tactical.state.events = [];
    let spot = null;
    for (const p of g.data().props) {
      if (!["wardrobe", "locker"].includes(p.kind) || (p.loot && !p.opened)) continue;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const x = (p.x + 0.5 + dx) * 16, y = (p.y + 0.5 + dy) * 16;
        if (!g.canOccupy(x, y, 4.4)) continue;
        if (g.data().props.some((q) => ["radio", "tv"].includes(q.kind) && Math.hypot((q.x + 0.5) * 16 - x, (q.y + 0.5) * 16 - y) < 25)) continue;
        g.px = x; g.py = y; g.interactLock = 0; g.computeVisibility();
        if (g.director.nearHideSpot()) { spot = { p, x, y }; break; }
      }
      if (spot) break;
    }
    if (!spot) throw new Error("No usable wardrobe");
    g.interactLock = 0; g.interact();
    const hiddenOnE = g.director.hidden;
    const farZombie = g.makeZombie({ x: spot.x + 110, y: spot.y, kind: "shambler", room: 0 });
    farZombie.state = "chase"; farZombie.alertT = 0.1;
    g.floor.zombies = [farZombie];
    g.updateZombies(0.7);
    const farForgot = farZombie.state === "idle" && !farZombie.seenWardrobe;
    g.toggleHide();

    const nearZombie = g.makeZombie({ x: spot.x + 5, y: spot.y, kind: "shambler", room: 0 });
    nearZombie.speed = 0;
    g.floor.zombies = [nearZombie];
    g.px = spot.x; g.py = spot.y; g.interactLock = 0;
    g.interact();
    const witnessed = g.director.isWitness(nearZombie.id) && !!nearZombie.seenWardrobe;
    const seenSpot = { ...nearZombie.seenWardrobe };
    // Let the engine register the active hide state before advancing the struggle timer.
    g.update(0.016);
    g.update(3.1);
    const forcedOut = !g.director.hidden;
    const validExit = g.canOccupy(g.px, g.py, 4.4);
    return { hiddenOnE, farForgot, witnessed, seenSpot, forcedOut, validExit };
  });
  console.log("hiding state", hiding);
  assert.equal(hiding.hiddenOnE, true);
  assert.equal(hiding.farForgot, true);
  assert.equal(hiding.witnessed, true);
  assert.ok(hiding.seenSpot);
  assert.equal(hiding.forcedOut, true);
  assert.equal(hiding.validExit, true);
  console.log("OK: both wardrobe cases", hiding);

  const grabExplosion = await page.evaluate(() => {
    const g = window.game;
    g.floor.zombies = []; g.director.hidden = false;
    const barrel = g.data().props.find((p) => p.kind === "explosive");
    const z = g.makeZombie({ x: (barrel.x + 0.5) * 16 + 5, y: (barrel.y + 0.5) * 16, kind: "shambler", room: 0 });
    g.floor.zombies = [z];
    g.grabbedBy = z.id; g.grabStruggles = 2;
    g.explodeBarrel(barrel.id);
    return { dead: z.state, grabbed: g.grabbedBy, struggles: g.grabStruggles, protection: g.grabProtection };
  });
  assert.equal(grabExplosion.dead, "dead");
  assert.equal(grabExplosion.grabbed, null);
  assert.equal(grabExplosion.struggles, 0);
  assert.ok(grabExplosion.protection > 0);

  const escort = await page.evaluate(() => {
    const g = window.game;
    g.floor.zombies = [];
    const d = g.director;
    let started = false;
    for (let i = 0; i < 12 && !started; i++) started = d.start("escort");
    if (!started) return { started };
    const civ = d.civ(d.escortId);
    const initialPath = d.path(civ, { x: g.px, y: g.py });
    const goal = g.data().stairsUp;
    civ.x = (goal.x + 0.5) * 16;
    civ.y = (goal.y + 0.5) * 16;
    const before = g.pack.stock.rounds;
    for (let i = 0; i < 5; i++) d.update(0.1);
    return { started, initialPath: initialPath.length, resolved: d.escortId === -1 && civ.state === "leave", reward: g.pack.stock.rounds - before };
  });
  assert.equal(escort.started, true);
  assert.ok(escort.initialPath >= 0);
  assert.equal(escort.resolved, true);
  assert.equal(escort.reward, 14);
  console.log("OK: escort path and completion", escort);

  const frequency = await page.evaluate(() => {
    const g = window.game;
    const before = g.building.npcTotal;
    const perFloor = [];
    for (let floor = 0; floor < 9; floor++) {
      g.enter(floor, "start");
      g.floor.zombies = [];
      g.director.floorAge = 22;
      g.time = Math.max(g.time, g.building.nextNpcAt);
      for (let i = 0; i < 360; i++) {
        g.time += 0.1;
        g.director.update(0.1);
        g.scheduleNpc(0.1);
      }
      perFloor.push({ floor, encounters: g.director.npcEncounterCount });
    }
    return { before, after: g.building.npcTotal, perFloor, withPeople: perFloor.filter((f) => f.encounters > 0).length };
  });
  assert.ok(frequency.withPeople >= 4, `Too few natural NPC floors: ${JSON.stringify(frequency.perFloor)}`);
  assert.ok(frequency.after > frequency.before);
  console.log("OK: NPC frequency", frequency);

  assert.deepEqual(errors, [], `Browser errors: ${errors.join(", ")}`);
} finally {
  await browser?.close();
  server.kill();
}
