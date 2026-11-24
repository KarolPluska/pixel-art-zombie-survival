import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = "http://127.0.0.1:5188";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5188", "--strictPort"], { stdio: "ignore" });
let browser;
const errors = [];

try {
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    try { ready = (await fetch(url)).ok; } catch { /* wait */ }
    if (!ready) await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("button", { name: "WEJDŹ DO BLOKU" }).click();
  await page.locator(".hud-kit").waitFor();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".noise-meter").count(), 1);

  const movement = await page.evaluate(() => {
    const g = window.game;
    g.floor.zombies = []; g.director.cooldown = 1e6;
    g.tactical.state.playerNoise = 0;
    const original = g.moveBody;
    g.keys.clear(); g.keys.add("ShiftLeft"); g.keys.add("KeyW");
    g.moveBody = (x, y) => ({ x, y });
    g.updatePlayer(0.5);
    const stationary = g.tactical.state.playerNoise;
    g.moveBody = (x, y, r, dx, dy) => ({ x: x + dx, y: y + dy });
    g.updatePlayer(0.5);
    const running = g.tactical.state.playerNoise;
    g.keys.delete("ShiftLeft"); g.keys.add("ControlLeft");
    g.updatePlayer(0.25);
    const careful = g.tactical.state.playerNoise;
    g.moveBody = original; g.keys.clear();
    return { stationary, running, careful };
  });
  assert.equal(movement.stationary, 0, "Holding sprint against a wall must not create noise");
  assert.ok(movement.running > 10 && movement.careful > movement.running, "Real movement should raise the noise meter");

  const device = await page.evaluate(() => {
    const g = window.game;
    g.floor.survivors = []; g.activeDialog = null; g.director.choice = null; g.director.hidden = false;
    const p = g.data().props.find((p) => p.kind === "radio");
    g.px = (p.x + 0.5) * 16; g.py = (p.y + 0.5) * 16;
    g.interactLock = 0; g.interact();
    const on = g.tactical.state.devices[p.id]?.on;
    const debug = { hint: g.tacticalHint(), hidden: g.director.hidden, grabbed: g.grabbedBy, lock: g.interactLock, quest: g.data().vertical.quest?.kind, radio: { x: p.x, y: p.y }, player: { x: g.px, y: g.py } };
    const z = g.makeZombie({ x: p.x * 16 + 28, y: (p.y + 0.5) * 16, kind: "shambler", room: 0 });
    const distracted = g.updateZombieStimulus(z, false, 14 * 16);
    const deviceTarget = { kind: z.stimulus, x: z.lastX, y: z.lastY };
    const closeOverride = g.updateZombieStimulus(z, true, 2 * 16);
    const playerTarget = { kind: z.stimulus, see: closeOverride };
    const configuredFirstDelay = g.tactical.state.deviceNextRoll - g.tactical.clock;
    // Advance device roll and use the actual safe spawn planner.
    g.tactical.state.deviceNextRoll = g.tactical.clock;
    const firstDelay = configuredFirstDelay;
    const before = g.floor.zombies.length;
    g.updateTactical(0.016);
    const spawned = g.floor.zombies.length - before;
    const spawnRules = g.floor.zombies.slice(before).every((z) => Math.hypot(z.x - g.px, z.y - g.py) >= 8 * 16
      && !g.floor.explored[g.idx(Math.floor(z.x / 16), Math.floor(z.y / 16))]
      && z.stimulus === "device" && Math.hypot(z.lastX - deviceTarget.x, z.lastY - deviceTarget.y) < 2);
    const nextDelay = g.tactical.state.deviceNextRoll - g.tactical.clock;
    const tv = g.data().props.find((prop) => prop.kind === "tv");
    if (tv) {
      g.tactical.ensureDevice(tv.id, "tv", (tv.x + 0.5) * 16, (tv.y + 0.5) * 16);
      g.tactical.setDevice(tv.id, true);
    }
    const secondBefore = g.tactical.state.waveCount;
    g.tactical.state.lastWave = g.tactical.clock - 20;
    g.tactical.state.deviceNextRoll = g.tactical.clock;
    g.updateTactical(0.016);
    const secondWave = g.tactical.state.waveCount > secondBefore;
    const multipleActive = Object.values(g.tactical.state.devices).filter((d) => d.on).length;
    const oldTotal = g.tactical.state.devices[p.id].activeTotal;
    g.interactLock = 0; g.interact();
    const off = !g.tactical.state.devices[p.id].on;
    const totalKept = g.tactical.state.devices[p.id].activeTotal >= oldTotal;
    return { on, debug, distracted, deviceTarget, playerTarget, spawned, off, totalKept, firstDelay, nextDelay, spawnRules, secondWave, multipleActive };
  });
  console.log("device debug", device.on, device.debug);
  assert.equal(device.on, true);
  assert.equal(device.distracted, false, "A distant device should override pursuit target");
  assert.equal(device.deviceTarget.kind, "device");
  assert.deepEqual(device.playerTarget, { kind: "player", see: true });
  assert.ok(device.spawned > 0, "An active radio should be able to call a real reinforcement group");
  assert.equal(device.spawnRules, true, "Reinforcements must spawn out of sight at a safe distance and investigate the radio");
  assert.ok(device.off && device.totalKept);
  assert.ok(device.firstDelay >= 8 && device.firstDelay <= 15, `First radio horde delay: ${device.firstDelay}`);
  assert.ok(device.nextDelay >= 15 && device.nextDelay <= 25, `Next radio horde delay: ${device.nextDelay}`);
  assert.equal(device.secondWave, true, "Continued device noise must produce further groups under the shared budget");
  assert.ok(device.multipleActive >= 2, "Radio and television must be able to run simultaneously");

  const barrel = await page.evaluate(() => {
    const g = window.game;
    const p = g.data().props.find((p) => p.kind === "explosive");
    const chain = g.data().props.find((other) => other.kind === "explosive" && other.id !== p.id);
    if (chain) { chain.x = p.x + 1; chain.y = p.y; g.tactical.ensureBarrel(chain.id); }
    const z = g.makeZombie({ x: (p.x + 0.5) * 16 + 8, y: (p.y + 0.5) * 16, kind: "brute", room: 0 });
    z.speed = 0; g.floor.zombies = [z];
    g.px = p.x * 16 + 200; g.py = (p.y + 0.5) * 16;
    g.armBarrel(p.id, true);
    const beforeHp = z.hp;
    for (let i = 0; i < 82; i++) g.updateTactical(0.016);
    const after = { stage: g.tactical.state.barrels[p.id].stage, chain: chain ? g.tactical.state.barrels[chain.id].stage : "none", hp: z.hp, down: z.downT, arousal: g.tactical.state.arousal };
    const hpAfterOne = z.hp;
    for (let i = 0; i < 20; i++) g.updateTactical(0.016);
    return { beforeHp, after, hpAfterOne, hpAfterTwo: z.hp };
  });
  assert.equal(barrel.after.stage, "spent");
  assert.ok(barrel.after.chain === "spent" || barrel.after.chain === "none", "Nearby barrels should join the chain reaction once");
  assert.ok(barrel.after.hp < barrel.beforeHp && barrel.after.down > 0);
  assert.equal(barrel.hpAfterTwo, barrel.hpAfterOne, "One barrel must not apply damage every frame");

  const grab = await page.evaluate(() => {
    const g = window.game;
    g.floor.zombies = []; g.hp = 100; g.dead = false; g.director.hidden = false;
    g.px = 200; g.py = 200; g.camX = 0; g.camY = 0; g.grabProtection = 0;
    const z = g.makeZombie({ x: 209, y: 200, kind: "shambler", room: 0 });
    z.grabCd = 0; z.speed = 0; g.floor.zombies = [z];
    g.updateZombies(0.016);
    return { windup: z.grabWindup, grabbed: g.grabbedBy };
  });
  assert.ok(grab.windup > 0 && grab.grabbed === null, "Grab must have a readable windup");
  await page.waitForFunction(() => window.game.grabbedBy !== null, { timeout: 3000 });
  for (let i = 0; i < 4; i++) await page.keyboard.press("e");
  assert.equal(await page.evaluate(() => window.game.grabStruggles), 4);
  await page.keyboard.down("e");
  await page.waitForTimeout(450);
  await page.keyboard.up("e");
  const released = await page.evaluate(() => {
    const g = window.game;
    return { grabbed: g.grabbedBy, count: g.grabStruggles, down: g.floor.zombies[0].downT, protection: g.grabProtection };
  });
  assert.equal(released.grabbed, null);
  assert.equal(released.count, 5, "Exactly five separate E activations release the player");
  assert.ok(released.down > 0 && released.protection > 0);

  const machete = await page.evaluate(() => {
    const g = window.game;
    const z = g.makeZombie({ x: 250, y: 250, kind: "shambler", room: 0 });
    const id = z.id, initialKills = g.kills;
    let hits = 0;
    while (z.kind !== "crawler" && z.hp > 0 && hits < 12) { g.hurtZombie(z, 3, 1, 0, "machete"); hits++; }
    const transformed = { id: z.id, kind: z.kind, hp: z.hp, bisected: z.bisected, kills: g.kills };
    g.hurtZombie(z, 1000, 1, 0, "machete");
    return { id, initialKills, transformed, dead: z.state, kills: g.kills };
  });
  assert.equal(machete.transformed.id, machete.id, "Transformation preserves zombie identity");
  assert.equal(machete.transformed.kind, "crawler");
  assert.ok(machete.transformed.hp > 0 && machete.transformed.bisected);
  assert.equal(machete.transformed.kills, machete.initialKills, "No reward before final death");
  assert.equal(machete.dead, "dead");
  assert.equal(machete.kills, machete.initialKills + 1);

  const hatchet = await page.evaluate(() => {
    const g = window.game;
    const z = g.makeZombie({ x: 260, y: 260, kind: "shambler", room: 0 });
    z.hp = z.maxHp = 100;
    const id = z.id, kills = g.kills;
    for (let i = 0; i < 24 && z.kind !== "crawler" && z.hp > 0; i++) g.hurtZombie(z, 2, 1, 0, "hatchet");
    return { originalId: id, preservedId: z.id, kind: z.kind, bisected: z.bisected, hp: z.hp, kills };
  });
  assert.equal(hatchet.originalId, hatchet.preservedId);
  assert.equal(hatchet.kind, "crawler");
  assert.equal(hatchet.bisected, true);
  assert.ok(hatchet.hp > 0 && hatchet.hp < 100);

  const wallBlast = await page.evaluate(() => {
    const g = window.game;
    const p = g.data().props.find((p) => p.kind === "explosive");
    g.tactical.state.barrels[p.id] = { stage: "idle", fuse: 0 };
    const wallIndex = p.y * g.data().w + p.x + 1;
    const oldTile = g.data().tiles[wallIndex];
    g.data().tiles[wallIndex] = 0;
    const z = g.makeZombie({ x: (p.x + 2.5) * 16, y: (p.y + 0.5) * 16, kind: "brute", room: 0 });
    const hp = z.hp;
    g.explodeBarrel(p.id);
    g.data().tiles[wallIndex] = oldTile;
    return { before: hp, after: z.hp };
  });
  assert.equal(wallBlast.after, wallBlast.before, "Walls must block blast damage");

  const npc = await page.evaluate(() => {
    const g = window.game;
    g.director.floorAge = 20; g.npcWait = 0; g.building.nextNpcAt = 0; g.building.npcDrought = 3;
    const before = g.building.npcTotal;
    g.scheduleNpc(0.016);
    return { before, after: g.building.npcTotal, directorCount: g.director.npcEncounterCount };
  });
  assert.ok(npc.after > npc.before && npc.directorCount > 0, "Pity scheduler should produce an NPC encounter");

  // Persistence: enabled device and spent barrel must survive a real App save/reload/resume.
  await page.evaluate(() => {
    const g = window.game;
    const radio = g.data().props.find((p) => p.kind === "radio");
    g.tactical.ensureDevice(radio.id, "radio", (radio.x + 0.5) * 16, (radio.y + 0.5) * 16);
    g.tactical.setDevice(radio.id, true);
    g.setPaused(true);
  });
  const saveCheck = await page.evaluate(async () => {
    const { parseCheckpoint } = await import("/src/game/checkpoint.ts");
    const text = localStorage.getItem("blok7-checkpoint");
    const v = text ? JSON.parse(text) : null;
    const f = v?.floors?.[v.floor];
    return { exists: !!text, valid: !!parseCheckpoint(text), version: v?.version,
      details: v && { floor: v.floor, hero: v.hero, npc: [v.building.npcTotal, v.building.npcDrought, v.building.nextNpcAt],
        explored: f?.explored?.length, zombies: f?.zombies?.map((z) => ({ kind: z.kind, x: z.x, y: z.y, hp: z.hp, home: z.home, state: z.state, alertT: z.alertT, lastX: z.lastX, lastY: z.lastY })),
        tactical: f?.tactical && { clock: f.tactical.clock, playerNoise: f.tactical.playerNoise, arousal: f.tactical.arousal, budget: f.tactical.waveBudget, roll: f.tactical.nextRoll, lastWave: f.tactical.lastWave, count: f.tactical.waveCount },
        environmentClock: f?.environment?.clock } };
  });

  assert.equal(saveCheck.exists, true);
  assert.equal(saveCheck.valid, true);
  assert.equal(saveCheck.version, 3);
  await page.reload();
  await page.getByRole("button", { name: "Wznów wyprawę" }).click();
  await page.locator(".hud-kit").waitFor();
  const restored = await page.evaluate(() => {
    const g = window.game;
    const radio = g.data().props.find((p) => p.kind === "radio");
    const barrel = g.data().props.find((p) => p.kind === "explosive");
    return { radio: g.tactical.state.devices[radio.id]?.on, barrel: g.tactical.state.barrels[barrel.id]?.stage };
  });
  assert.deepEqual(restored, { radio: true, barrel: "spent" });

  if (process.env.CAPTURE_UI) {
    await mkdir(".qa", { recursive: true });
    await page.screenshot({ path: ".qa/tactical-hud.png" });
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(", ")}`);
  console.log("OK: movement-only noise, radio lure/target switching and safe horde, one-shot barrels, five-E grab/release, machete crawler identity and NPC pity schedule.");
} finally {
  await browser?.close();
  server.kill();
}
