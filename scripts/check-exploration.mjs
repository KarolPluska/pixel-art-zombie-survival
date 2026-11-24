import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = "http://127.0.0.1:5186";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5186", "--strictPort"], { stdio: "ignore" });
let browser;
const errors = [];

async function start(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (bytes) => {
      if (bytes instanceof Uint32Array && bytes.length === 1) { bytes[0] = 7; return bytes; }
      return original(bytes);
    };
  });
  await page.goto(url);
  await page.getByRole("button", { name: "WEJD\u0179 DO BLOKU" }).click();
  await page.locator(".hud-kit").waitFor();
}

async function screen(page, name) {
  if (!process.env.CAPTURE_UI) return;
  await mkdir(".qa", { recursive: true });
  await page.screenshot({ path: `.qa/${name}.png` });
}

async function select(page, kind, member, from = 0) {
  return page.evaluate(({ kind, member, from }) => {
    const g = window.game;
    for (let i = from; i < 10; i++) {
      if (g.floorIndex !== i) g.enter(i, "up");
      const f = g.environment.features.find((f) => f.kind === kind && (kind !== "wire" || f.mode === "pool"));
      if (!f) continue;
      if (kind === "gas" && g.environment.features.some((wire) => wire.kind === "wire" && f.cells.some((p) => p.x === wire.at.x && p.y === wire.at.y))) continue;
      g.floor.zombies = []; g.floor.survivors = []; g.activeDialog = null;
      g.director.cooldown = 1e6; g.transition = null; g.interactLock = 0; g.bannerT = 0;
      g.hurt = 0; g.invuln = 0; g.hp = 100; g.flashOn = true;
      const center = (p) => ({ x: (p.x + .5) * 16, y: (p.y + .5) * 16 });
      const pos = center(f[member]);
      const at = center(f.at);
      g.px = pos.x; g.py = pos.y;
      g.camX = g.px - g.viewW / 2; g.camY = g.py - g.viewH / 2;
      g.mouseSX = g.viewW / 2 + at.x - pos.x || 100;
      g.mouseSY = g.viewH / 2 + at.y - pos.y;
      g.aim = Math.atan2(at.y - pos.y, at.x - pos.x);
      g.computeVisibility(); g.emitHud(true); g.draw();
      return { ...f, floor: i };
    }
    throw new Error(`Missing generated feature: ${kind}`);
  }, { kind, member, from });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 80 && !ready; attempt++) {
    try { ready = (await fetch(url)).ok; } catch { /* Wait for Vite. */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Vite did not start");
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await start(page);
  await page.evaluate(() => document.fonts.ready);

  const door = await select(page, "obstruction", "stand");
  const fraction = () => page.evaluate((id) => window.game.environment.state.features[id].progress, door.id);
  await page.getByRole("progressbar", { name: /przesuwania/ }).waitFor();
  assert.ok(await page.evaluate((d) => window.game.environment.roomHidden(d.room) && !window.game.walkable(d.gate.x, d.gate.y, false), door));
  await page.keyboard.press("e");
  assert.ok(await fraction() < 0.08, "A quick press does not clear the furniture");
  await page.keyboard.down("e");
  await page.waitForFunction((id) => window.game.environment.state.features[id].progress > 0.26, door.id);
  await page.keyboard.up("e");
  await page.waitForTimeout(100);
  const savedFraction = await fraction();
  assert.ok(savedFraction > 0.26 && savedFraction < 0.76);
  await screen(page, "exploration-obstruction");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Pauza" }).waitFor();
  assert.equal(await page.evaluate((d) => JSON.parse(localStorage.getItem("blok7-checkpoint")).floors[d.floor].environment.features[d.id].progress, door), savedFraction);

  await page.reload();
  await page.getByRole("button", { name: "Wzn\u00f3w wypraw\u0119" }).click();
  await page.getByRole("progressbar", { name: /przesuwania/ }).waitFor();
  assert.equal(await fraction(), savedFraction, "Reload retains the exact partial push");
  await page.keyboard.down("e");
  await page.waitForFunction((id) => window.game.environment.state.features[id].stage === "settled", door.id);
  await page.keyboard.up("e");
  assert.ok(await page.evaluate((d) => window.game.walkable(d.gate.x, d.gate.y, true) && !window.game.walkable(d.park.x, d.park.y, true), door));
  await page.keyboard.press(door.gate.x < door.at.x ? "ArrowLeft" : "ArrowRight", { delay: 630 });
  const room = await page.evaluate(() => window.game.data().roomOf[window.game.idx(Math.floor(window.game.px / 16), Math.floor(window.game.py / 16))]);
  assert.equal(room, door.room, "The player can cross the newly opened doorway using movement controls");
  const cache = await page.evaluate((d) => {
    const g = window.game;
    const p = g.data().environment.annexes.find((a) => a.room === d.room).props.find((p) => p.loot);
    g.hp = 60; g.battery = 54;
    for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0]]) {
      const x = (p.x + .5 + dx) * 16, y = (p.y + .5 + dy) * 16;
      if (g.canOccupy(x, y, 4.4)) { g.px = x; g.py = y; break; }
    }
    g.emitHud(true);
    return { id: p.id, loot: p.loot };
  }, door);
  await page.keyboard.press("e");
  await page.waitForFunction((id) => window.game.data().props.find((p) => p.id === id).opened, cache.id);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Zapisz i wr/ }).click();
  await page.reload();
  await page.getByRole("button", { name: "Wzn\u00f3w wypraw\u0119" }).click();
  await page.locator(".hud-kit").waitFor();
  assert.deepEqual(await page.evaluate((id) => {
    const p = window.game.data().props.find((p) => p.id === id);
    return { id: p.id, loot: p.loot, opened: p.opened };
  }, cache.id), { ...cache, opened: true });

  const wall = await select(page, "wall", "back");
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate((id) => window.game.environment.state.features[id].stage, wall.id), "idle");
  await select(page, "wall", "front", wall.floor);
  await page.waitForFunction((id) => window.game.environment.state.features[id].stage === "warning", wall.id);
  await screen(page, "exploration-wall-warning");
  const wallResult = await page.evaluate(async (f) => {
    const g = window.game;
    const candidates = [];
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = f.front.x + dx, y = f.front.y + dy;
      const distance = Math.hypot(dx, dy);
      if (distance < 3 || distance > 6) continue;
      const px = (x + .5) * 16, py = (y + .5) * 16;
      if (g.canOccupy(px, py, 4.4) && g.rayClear(f.front.x, f.front.y, x, y)) candidates.push({ x: px, y: py, distance });
    }
    const retreat = candidates.sort((a, b) => a.distance - b.distance)[0];
    if (!retreat) throw new Error('No walkable retreat from fragile wall');
    g.px = retreat.x; g.py = retreat.y;
    const z = g.makeZombie({ x: (f.front.x + .5) * 16, y: (f.front.y + .5) * 16, room: 0, kind: "brute" });
    z.speed = 0; g.floor.zombies = [z];
    const hp = g.hp;
    await new Promise((resolve) => {
      const tick = () => g.environment.state.features[f.id].stage === "settled" ? resolve() : requestAnimationFrame(tick);
      tick();
    });
    g.floor.zombies = [];
    g.px = (f.front.x + .5) * 16; g.py = (f.front.y + .5) * 16;
    g.computeVisibility(); g.emitHud(true);
    return { escape: g.hp === hp, hit: z.hp < z.maxHp, open: g.canOccupy((f.at.x + .5) * 16, (f.at.y + .5) * 16, 4.4), discovered: !!g.floor.explored[g.idx(f.back.x, f.back.y)] };
  }, wall);
  assert.deepEqual(wallResult, { escape: true, hit: true, open: true, discovered: true });
  await screen(page, "exploration-wall-open");

  const pool = await select(page, "wire", "control");
  const poolResult = await page.evaluate(async (f) => {
    const g = window.game, p = f.cells[0];
    g.px = (p.x + .5) * 16; g.py = (p.y + .5) * 16;
    const other = f.cells[1];
    const z = g.makeZombie({ x: (other.x + .5) * 16, y: (other.y + .5) * 16, room: f.room, kind: "brute" });
    z.speed = 0; z.attackCd = 5; g.floor.zombies = [z];
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const out = { hp: g.hp, shocked: z.hp < z.maxHp, slow: g.environment.slow(0) };
    g.floor.zombies = [];
    g.camX = g.px - g.viewW / 2; g.camY = g.py - g.viewH / 2;
    return out;
  }, pool);
  assert.deepEqual(poolResult, { hp: 89, shocked: true, slow: true });
  await screen(page, "exploration-live-water");
  await select(page, "wire", "control", pool.floor);
  await page.keyboard.press("e");
  assert.ok(await page.evaluate((f) => window.game.environment.read(f).off && window.game.environment.roomDark(f.room), pool));
  const after = await page.evaluate((f) => {
    const g = window.game;
    g.enter((f.floor + 1) % 10, "up"); g.enter(f.floor, "down");
    const p = f.cells[0]; g.px = (p.x + .5) * 16; g.py = (p.y + .5) * 16;
    g.flashOn = false; g.darknessContext = null; g.battery = 70; g.updateAutoFlash();
    const fixture = g.data().lights.find((l) => l.roomId === f.room);
    return { flash: g.flashOn && g.autoFlash, saved: g.environment.read(f).off, lights: g.fixtureIntensity(fixture) };
  }, pool);
  assert.deepEqual(after, { flash: true, saved: true, lights: 0 });

  const weak = await select(page, "weak", "at", 1);
  await page.waitForFunction((f) => window.game.environment.read(f).stage === "settled", weak);
  assert.ok(await page.evaluate((f) => {
    const g = window.game;
    return g.hp === 84 && !g.walkable(f.at.x, f.at.y, false) && g.canOccupy(g.px, g.py, 4.4);
  }, weak), "A fall hurts and moves the body to walkable ground, leaving an impassable hole");

  const steam = await select(page, "steam", "control", 1);
  assert.ok(await page.evaluate((f) => {
    const g = window.game;
    g.environment.state.clock = 6.3 - f.phase + 5;
    return !g.walkable(f.at.x, f.at.y, true);
  }, steam), "A live steam jet temporarily blocks the short route");
  await page.keyboard.press("e");
  assert.ok(await page.evaluate((f) => window.game.environment.read(f).off && window.game.walkable(f.at.x, f.at.y, true), steam));
  const gas = await select(page, "gas", "at", 1);
  await page.keyboard.press("2");
  await page.keyboard.press("Space");
  assert.equal(await page.evaluate((f) => window.game.environment.read(f).stage, gas), "warning");
  await select(page, "gas", "control", gas.floor);
  await page.keyboard.press("e");
  assert.ok(await page.evaluate((f) => window.game.environment.read(f).stage === "venting", gas));

  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Pauza" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Wzn\u00f3w wypraw\u0119" }).click();
  await page.locator(".hud-kit").waitFor();
  assert.deepEqual(await page.evaluate(({ wall, pool, weak, door, cache }) => {
    const g = window.game;
    g.enter(weak.floor, "start");
    const pit = !g.walkable(weak.at.x, weak.at.y, false);
    g.enter(pool.floor, "start");
    const power = g.environment.read(pool).off;
    g.enter(wall.floor, "start");
    const breach = g.walkable(wall.at.x, wall.at.y, true);
    g.enter(door.floor, "start");
    return { pit, power, breach, cache: g.data().props.find((p) => p.id === cache.id).opened };
  }, { wall, pool, weak, door, cache }), { pit: true, power: true, breach: true, cache: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await start(mobile);
  const mobileDoor = await select(mobile, "obstruction", "stand");
  const use = await mobile.locator(".touch-actions").getByRole("button", { name: "U\u017cyj" }).boundingBox();
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: use.x + use.width / 2, y: use.y + use.height / 2 }] });
  await mobile.waitForFunction((id) => window.game.environment.state.features[id].progress > 0.15, mobileDoor.id);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await mobile.waitForFunction(() => !window.game.touchHold);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok(await mobile.evaluate(() => {
    const meter = document.querySelector(".work-meter").getBoundingClientRect();
    const kit = document.querySelector(".hud-kit").getBoundingClientRect();
    return meter.bottom < kit.top;
  }), "The mobile work meter should not cover the weapon HUD");
  await screen(mobile, "exploration-mobile");
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(", ")}`);
  console.log("OK: keyboard/touch hold, collision and stash access, local resume, wall warning/retreat, zombie damage, valves, and persistent circuits and pits.");
} finally {
  await browser?.close();
  server.kill();
}