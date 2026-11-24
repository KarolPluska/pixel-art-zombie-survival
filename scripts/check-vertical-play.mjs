import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = "http://127.0.0.1:5187";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5187", "--strictPort"], { stdio: "ignore" });
let browser;
const errors = [];

async function capture(page, name) {
  if (!process.env.CAPTURE_UI) return;
  await mkdir(".qa", { recursive: true });
  await page.screenshot({ path: `.qa/${name}.png` });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 80 && !ready; attempt++) {
    try { ready = (await fetch(url)).ok; } catch { /* Wait for Vite. */ }
    if (!ready) await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, "Vite did not start");

  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.addInitScript(() => {
    const orig = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (arr) => {
      if (arr instanceof Uint32Array && arr.length === 1) { arr[0] = 42; return arr; }
      return orig(arr);
    };
  });

  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "WEJDŹ DO BLOKU" }).click();
  await page.locator(".hud-kit").waitFor();
  await page.waitForTimeout(300);

  // 1. Playable Stairwell & Półpiętro on Floor 0 -> Floor 1
  const stairEntered = await page.evaluate(() => {
    const g = window.game;
    g.floor.zombies = []; g.director.cooldown = 1e6; g.interactLock = 0;
    const up = g.data().stairsUp;
    g.px = (up.x + 0.5) * 16; g.py = (up.y + 0.5) * 16;
    g.interact();
    g.emitHud(true); g.draw();
    return { active: !!g.building.passage, from: g.building.passage?.from, to: g.building.passage?.to, zone: g.currentZone() };
  });
  assert.equal(stairEntered.active, true, "Entering stairs should open the playable stairwell");
  assert.equal(stairEntered.from, 0);
  assert.equal(stairEntered.to, 1);
  assert.match(stairEntered.zone, /KLATKA A · MIĘDZY/);
  await capture(page, "vertical-stairwell");

  // Retreat back to Floor 0, then re-enter and walk all the way to Floor 1
  const stairFlow = await page.evaluate(() => {
    const g = window.game;
    // Retreat via bottom-left doorway
    g.building.passage.x = 34; g.building.passage.y = 95;
    g.interactLock = 0;
    g.interact();
    const retreated = !g.building.passage && g.floorIndex === 0;
    // Re-enter and climb to upper exit
    const up = g.data().stairsUp;
    g.px = (up.x + 0.5) * 16; g.py = (up.y + 0.5) * 16;
    g.interactLock = 0; g.interact();
    g.building.passage.x = 110; g.building.passage.y = 94;
    g.interactLock = 0; g.interact();
    return { retreated, arrivedFloor: g.floorIndex, passageClosed: !g.building.passage };
  });
  assert.deepEqual(stairFlow, { retreated: true, arrivedFloor: 1, passageClosed: true });

  // 2. Scenario A (repair-lift) on Floor 1 -> full multi-step sequence + elevator ride + scripted fault!
  const liftSetup = await page.evaluate(() => {
    const g = window.game;
    g.floor.zombies = []; g.director.cooldown = 1e6; g.interactLock = 0;
    const v = g.data().vertical;
    const q = v.quest;
    // Step 1: Inspect dead elevator call panel
    g.px = (v.elevator.call.x + 0.5) * 16; g.py = (v.elevator.call.y + 0.5) * 16;
    g.interact();
    const afterInspect = g.questState(1).stage;
    // Step 2: Disable workshop wire if present
    if (q.wireId !== undefined) {
      const w = g.environment.features.find((f) => f.id === q.wireId);
      if (w?.control) {
        g.px = (w.control.x + 0.5) * 16; g.py = (w.control.y + 0.5) * 16;
        g.interactLock = 0; g.interact();
      }
    }
    // Step 3: Pick up spare fuse B-4
    g.px = (q.fuseCell.x + 0.5) * 16; g.py = (q.fuseCell.y + 0.5) * 16;
    g.interactLock = 0; g.interact();
    const hasFuse = g.questState(1).fuseTaken;
    // Step 4: Return to elevator, install fuse
    g.px = (v.elevator.call.x + 0.5) * 16; g.py = (v.elevator.call.y + 0.5) * 16;
    g.interactLock = 0; g.interact();
    const powered = g.building.elevatorPowered;
    // Step 5: Call elevator (test E spam safety too!)
    g.interactLock = 0; g.interact(); g.interact(); g.interact();
    // Advance arrival timer cleanly
    for (let i = 0; i < 300 && g.building.elevatorArrival > 0; i++) g.update(0.016);
    const doorOpen = g.building.elevatorOpenFloor === 1;
    // Walk inside cabin & open floor panel
    g.px = (v.elevator.panel.x + 0.5) * 16; g.py = (v.elevator.panel.y + 0.5) * 16;
    g.interactLock = 0; g.interact();
    return { afterInspect, hasFuse, powered, doorOpen, choiceOpen: !!g.verticalChoice };
  });
  assert.ok(liftSetup.afterInspect >= 1 && liftSetup.afterInspect <= 2, `Unexpected stage after inspect: ${liftSetup.afterInspect}`);
  assert.deepEqual({ hasFuse: liftSetup.hasFuse, powered: liftSetup.powered, doorOpen: liftSetup.doorOpen, choiceOpen: liftSetup.choiceOpen }, { hasFuse: true, powered: true, doorOpen: true, choiceOpen: true });

  // Choose Floor 2 (option 0) to start the ride + scripted fault!
  await page.keyboard.press("1");
  await page.waitForFunction(() => !!window.game.building.elevatorRide);

  // Test pause during ride: ride timer must freeze while paused!
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Pauza" }).waitFor();
  const frozenBefore = await page.evaluate(() => window.game.building.elevatorRide.elapsed);
  await page.waitForTimeout(160);
  const frozenAfter = await page.evaluate(() => window.game.building.elevatorRide.elapsed);
  assert.equal(frozenAfter, frozenBefore, "Pause must freeze elevator ride progress");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Pauza" }).waitFor({ state: "hidden" });

  // Advance ride into scripted fault -> stranded phase (moving -> jolt -> blackout -> emergency light -> stranded)
  const faultState = await page.evaluate(() => {
    const g = window.game;
    const seenPhases = [];
    for (let i = 0; i < 700; i++) {
      const p = g.building.elevatorRide?.phase;
      if (p && seenPhases[seenPhases.length - 1] !== p) seenPhases.push(p);
      if (p === "stranded") break;
      g.update(0.016);
    }
    g.draw();
    g.emitHud(true);
    return {
      phases: seenPhases,
      floorReached: g.building.elevatorFloor,
      objective: g.objective(),
      prompt: g.prompt(),
    };
  });
  assert.ok(faultState.phases.includes("doors") && faultState.phases.includes("accel") && faultState.phases.includes("moving") && faultState.phases.includes("jolt") && faultState.phases.includes("stranded"), `Unexpected fault phases: ${faultState.phases}`);
  assert.equal(faultState.floorReached, 2, "Fault should occur after confirming arrival on Floor 2");
  assert.match(faultState.objective, /awaryjnie/i);
  await capture(page, "vertical-lift-fault");

  // Pull emergency lever inside cabin (E spam safe!) -> exits onto Floor 2, elevator remains broken
  const escapedLift = await page.evaluate(() => {
    const g = window.game;
    g.interactLock = 0;
    g.interact(); g.interact(); g.interact();
    for (let i = 0; i < 120 && g.building.elevatorRide; i++) g.update(0.016);
    g.emitHud(true);
    return { floor: g.floorIndex, ride: g.building.elevatorRide, broken: g.building.elevatorBroken };
  });
  assert.deepEqual(escapedLift, { floor: 2, ride: null, broken: true });

  // 3. Test Journal dialog (`J`) and checkpoint persistence across reload!
  await page.keyboard.press("j");
  await page.getByRole("dialog", { name: "Dziennik ocalałego" }).waitFor();
  await capture(page, "vertical-journal");
  const journalCount = await page.locator(".journal-entries li").count();
  assert.ok(journalCount >= 4, `Journal should record discovered clues, got ${journalCount}`);
  await page.keyboard.press("Escape");

  // Save via Pause -> reload -> Resume and confirm Floor 2 + broken elevator + journal persisted
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Pauza" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Wznów wyprawę" }).click();
  await page.locator(".hud-kit").waitFor();
  const afterReload = await page.evaluate(() => ({
    floor: window.game.floorIndex,
    broken: window.game.building.elevatorBroken,
    fuseTaken: window.game.questState(1).fuseTaken,
    journal: window.game.building.journal.length,
  }));
  assert.equal(afterReload.floor, 2);
  assert.equal(afterReload.broken, true);
  assert.equal(afterReload.fuseTaken, true);
  assert.ok(afterReload.journal >= 4);

  // 4. Verify Scenarios B (broken-stairs), D (lure-horde), E (service-shaft + playable ladder), F (apartment-bypass)
  const scenariosCheck = await page.evaluate(() => {
    const g = window.game;
    const out = {};
    for (let fl = 2; fl <= 8; fl++) {
      g.enter(fl, "start");
      g.floor.zombies = g.floor.zombies.filter((z) => z.missionTag === "lure");
      g.director.cooldown = 1e6;
      const v = g.data().vertical;
      const q = v?.quest;
      if (!q) continue;
      if (q.kind === "broken-stairs") {
        const up = g.data().stairsUp;
        g.px = (up.x + 0.5) * 16; g.py = (up.y + 0.5) * 16;
        g.interactLock = 0; g.interact();
        const isBroken = g.building.passage?.feature === "broken-flight";
        g.building.passage.x = 120; g.building.passage.y = 22;
        g.keys.add("KeyE");
        for (let i = 0; i < 180 && !g.building.passage.bypassOpen; i++) g.update(0.016);
        g.keys.delete("KeyE");
        const opened = g.building.passage.bypassOpen;
        g.interactLock = 0; g.interact();
        out.brokenStairs = { isBroken, opened, arrived: g.floorIndex === fl + 1 };
      } else if (q.kind === "lure-horde" && q.beacon) {
        g.px = (q.beacon.x + 0.5) * 16; g.py = (q.beacon.y + 0.5) * 16;
        g.interactLock = 0; g.interact();
        out.lureHorde = { used: g.questState(fl).lureUsed };
      } else if (q.kind === "service-shaft" && q.clueCell) {
        g.px = (q.clueCell.x + 0.5) * 16; g.py = (q.clueCell.y + 0.5) * 16;
        g.interactLock = 0; g.interact();
        const gotCode = g.questState(fl).codeFound;
        g.px = (v.service.panel.x + 0.5) * 16; g.py = (v.service.panel.y + 0.5) * 16;
        g.interactLock = 0; g.interact();
        const unlocked = g.questState(fl).serviceUnlocked;
        g.interactLock = 0; g.interact();
        if (g.verticalChoice?.mode === "service") g.chooseOption(1);
        const inShaft = g.building.passage?.route === "service";
        g.building.passage.y = 15;
        g.interactLock = 0; g.interact();
        out.serviceShaft = { gotCode, unlocked, inShaft, arrived: g.floorIndex === fl + 1 };
      } else if (q.kind === "apartment-bypass" && q.bypassCell) {
        g.px = (q.bypassCell.x + 0.5) * 16; g.py = (q.bypassCell.y + 0.5) * 16;
        g.keys.add("KeyE");
        for (let i = 0; i < 190 && !g.questState(fl).bypassOpen; i++) g.update(0.016);
        g.keys.delete("KeyE");
        out.apartmentBypass = { opened: g.questState(fl).bypassOpen };
      }
    }
    return out;
  });

  assert.deepEqual(scenariosCheck.brokenStairs, { isBroken: true, opened: true, arrived: true });
  assert.deepEqual(scenariosCheck.lureHorde, { used: true });
  assert.deepEqual(scenariosCheck.serviceShaft, { gotCode: true, unlocked: true, inShaft: true, arrived: true });
  assert.deepEqual(scenariosCheck.apartmentBypass, { opened: true });

  assert.deepEqual(errors, [], `Browser errors: ${errors.join(", ")}`);
  console.log("OK: playable stairwell/landing, Scenario A + elevator fault + emergency latch, pause freeze, E spam resistance, journal, checkpoint resume, and Scenarios B/D/E/F.");
} finally {
  await browser?.close();
  server.kill();
}
