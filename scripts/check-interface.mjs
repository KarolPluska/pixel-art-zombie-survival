import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = "http://127.0.0.1:5183";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5183", "--strictPort"], { stdio: "ignore" });
let browser;

async function ready() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(base)).ok) return; } catch { /* Wait for Vite. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite did not start");
}

async function capture(page, name) {
  if (!process.env.CAPTURE_UI) return;
  await mkdir(".qa", { recursive: true });
  await page.screenshot({ path: `.qa/${name}.png` });
}

try {
  await ready();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  assert.equal(await page.getByRole("heading", { name: "BLOK 7" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "WEJDŹ DO BLOKU" }).isVisible(), true);
  assert.match(await page.locator(".title-scene").evaluate((el) => getComputedStyle(el).backgroundImage), /roof-flare/);
  await capture(page, "title-desktop");

  await page.getByRole("button", { name: "STEROWANIE" }).click();
  assert.equal(await page.getByRole("dialog", { name: "Poradnik ocalałego" }).isVisible(), true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Ekwipunek/ }).click();
  assert.equal(await page.getByRole("dialog", { name: "Ekwipunek" }).isVisible(), true);
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("dialog", { name: "Ekwipunek" }).isVisible(), true);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "WEJDŹ DO BLOKU" }).click();
  await page.locator(".hud-kit").waitFor();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".vital-row").count(), 3);
  assert.deepEqual(await page.locator(".key-hints kbd").allTextContents(), ["F", "E", "TAB"]);
  await page.waitForTimeout(2400);
  await capture(page, "game-start");
  await page.keyboard.press("Tab");
  await page.getByRole("dialog", { name: "Ekwipunek" }).waitFor();
  const time = await page.evaluate(() => window.game.time);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.game.time), time, "Inventory should pause the world");
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("dialog", { name: "Ekwipunek" }).isVisible(), true, "Tab must remain usable for dialog focus");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Ekwipunek" }).waitFor({ state: "hidden" });

  const initial = await page.evaluate(() => {
    const g = window.game;
    const scale = Math.max(2, Math.min(4, Math.floor(Math.min(innerWidth / 400, innerHeight / 260))));
    return { width: g.viewW, height: g.viewH, scale, canvasWidth: g.canvas.width };
  });
  assert.equal(initial.width, Math.floor(1440 / initial.scale));
  assert.equal(initial.height, Math.floor(900 / initial.scale));
  assert.equal(initial.width, initial.canvasWidth, "World camera size must remain unchanged");

  const darkRoom = await page.evaluate(() => {
    const g = window.game;
    for (let floor = 1; floor < 9; floor++) {
      g.enter(floor, "up");
      for (const room of g.data().rooms) {
        if (room.lit) continue;
        for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
          if (g.canOccupy((x + .5) * 16, (y + .5) * 16, 4.4)) {
            g.px = (x + .5) * 16; g.py = (y + .5) * 16;
            g.flashOn = false; g.autoFlash = false; g.darknessContext = null; g.battery = 100;
            g.updateAutoFlash();
            return { floor, x, y, on: g.flashOn, automatic: g.autoFlash };
          }
        }
      }
    }
    return null;
  });
  assert.ok(darkRoom && darkRoom.on && darkRoom.automatic, "Flashlight should turn on in a dark room");
  await page.keyboard.press("f");
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.game.flashOn), false, "Manual switch-off should persist in the same room");
  const relit = await page.evaluate(() => {
    const g = window.game;
    const light = g.data().rooms.find((r) => r.lit);
    g.px = (light.x + .5) * 16; g.py = (light.y + .5) * 16;
    g.updateAutoFlash();
    const dark = g.data().rooms.find((r) => !r.lit);
    g.px = (dark.x + .5) * 16; g.py = (dark.y + .5) * 16;
    g.updateAutoFlash();
    return g.flashOn;
  });
  assert.equal(relit, true, "Entering a different dark area should reactivate the flashlight");
  const blackout = await page.evaluate(() => {
    const g = window.game;
    const light = g.data().rooms.find((r) => r.lit);
    g.px = (light.x + .5) * 16; g.py = (light.y + .5) * 16;
    g.flashOn = false; g.autoFlash = false; g.darknessContext = null; g.director.blackoutT = 4;
    g.updateAutoFlash();
    return g.flashOn && g.autoFlash;
  });
  assert.equal(blackout, true, "A power outage should also trigger the flashlight");
  const battery = await page.evaluate(() => {
    const g = window.game; g.battery = 100; g.flashOn = true; g.releaseInput(); g.updatePlayer(60); return g.battery;
  });
  assert.ok(battery > 92 && battery < 94, `Unexpected battery drain: ${battery}`);

  const spot = await page.evaluate(() => {
    const g = window.game;
    g.enter(2, "up");
    for (const prop of g.data().props) {
      if (!["wardrobe", "locker"].includes(prop.kind) || (prop.loot && !prop.opened)) continue;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const x = (prop.x + .5 + dx) * 16, y = (prop.y + .5 + dy) * 16;
        if (!g.canOccupy(x, y, 4.4)) continue;
        g.px = x; g.py = y; g.interactLock = 0; g.transition = null; g.computeVisibility();
        if (g.director.nearHideSpot()) return { x, y };
      }
    }
    return null;
  });
  assert.ok(spot, "A usable hiding spot should exist");
  await page.keyboard.press("e");
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.game.director.hidden), true, "One E press should enter the wardrobe");
  assert.match(await page.locator(".state.hide").innerText(), /E wychodzi/);
  await page.keyboard.press("e");
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.game.director.hidden), false, "The next E press should exit");
  const after = await page.evaluate(() => ({ x: window.game.px, y: window.game.py }));
  assert.ok(Math.hypot(after.x - spot.x, after.y - spot.y) < 10, "Exiting should restore a walkable position");

  const labels = await page.evaluate(() => {
    const g = window.game, ctx = g.ctx, original = ctx.fillText;
    const seen = [];
    ctx.fillText = function(text, ...args) { seen.push(text); return original.call(this, text, ...args); };
    g.drawMinimap(ctx);
    ctx.fillText = original;
    return seen;
  });
  for (const label of ["MAPA", "CEL", "ZAPASY", "ZOMBIE", "LUDZIE", "SZAFA", "OBÓZ"]) assert.ok(labels.includes(label), `Missing map legend: ${label}`);
  const markerColors = await page.evaluate(() => {
    const g = window.game;
    g.enter(2, "up");
    const floor = g.data();
    const supply = floor.props.find((prop) => prop.loot === "ammo");
    if (!supply) return null;
    g.floor.explored[supply.y * floor.w + supply.x] = 1;
    g.floor.zombies = [];
    const goal = g.goalTile();
    const canvas = g.canvas, ctx = g.ctx;
    g.drawMinimap(ctx);
    const frameW = floor.w + 8, frameH = floor.h + 10 + 20 + 8;
    const left = g.viewW - frameW - 7, top = Math.max(8, g.viewH - frameH - 7);
    const mapX = left + 4, mapY = top + 14;
    const pixel = (x, y) => Array.from(ctx.getImageData(mapX + x - 1, mapY + y - 1, 1, 1).data).slice(0, 3);
    return { goal: pixel(goal.x, goal.y), supply: pixel(supply.x, supply.y) };
  });
  assert.deepEqual(markerColors?.goal, [242, 199, 126], "The current objective should be marked on the map");
  assert.deepEqual(markerColors?.supply, [161, 191, 137], "Discovered supplies should be marked on the map");

  const campReady = await page.evaluate(() => {
    const g = window.game; g.enter(6, "up");
    const d = g.director;
    for (let i = 0; i < 40 && !d.camp; i++) d.start("camp");
    const camp = d.events.find((event) => event.kind === "camp");
    if (!camp) return false;
    camp.variant = "friendly";
    const npc = d.civ(camp.civs[0]);
    g.px = npc.x + 10; g.py = npc.y; g.interactLock = 0;
    g.camX = g.px - g.viewW / 2; g.camY = g.py - g.viewH / 2;
    g.computeVisibility(); g.draw();
    return true;
  });
  assert.equal(campReady, true, "A camp should be placed on the floor");
  await page.keyboard.press("e");
  assert.equal(await page.evaluate(() => !!window.game.director.choice), true, "Camp interaction must still work with E");
  await page.waitForTimeout(200);
  await capture(page, "game-desktop");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => !!window.game.director.choice), true, "Tab should move focus without dismissing a choice");
  await page.keyboard.press("1");
  assert.equal(await page.evaluate(() => window.game.director.choice), null);

  const alarmReady = await page.evaluate(() => {
    const g = window.game; g.enter(5, "up");
    const d = g.director;
    for (let i = 0; i < 40 && !d.alarm; i++) d.start("alarm");
    if (!d.alarm) return false;
    g.px = d.alarm.x; g.py = d.alarm.y + 12; g.interactLock = 0;
    return true;
  });
  assert.equal(alarmReady, true);
  await page.keyboard.press("e");
  assert.equal(await page.evaluate(() => window.game.director.alarm), null, "E should switch off the alarm");

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await mobilePage.goto(base);
  await mobilePage.evaluate(() => document.fonts.ready);
  await mobilePage.waitForTimeout(600);
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await capture(mobilePage, "title-mobile");
  await mobilePage.getByRole("button", { name: "WEJDŹ DO BLOKU" }).click();
  await mobilePage.locator(".hud-kit").waitFor();
  await mobilePage.waitForTimeout(2400);
  const mobile = await mobilePage.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, stage: document.querySelector(".stage").getBoundingClientRect().height, height: innerHeight, touch: getComputedStyle(document.querySelector(".touch")).display }));
  assert.equal(mobile.overflow, false);
  assert.equal(mobile.stage, mobile.height);
  assert.notEqual(mobile.touch, "none");
  await capture(mobilePage, "game-mobile");
  await mobilePage.close();

  const roofReady = await page.evaluate(() => {
    const g = window.game; g.enter(10, "up");
    const boss = g.floor.zombies.find((z) => z.kind === "boss");
    if (!boss) return false;
    g.hurtZombie(boss, boss.hp + 1, 1, 0);
    for (const z of g.floor.zombies) if (z !== boss) z.state = "dead";
    const flare = g.data().flare;
    g.px = (flare.x + .5) * 16 + 10; g.py = (flare.y + .5) * 16;
    g.hp = 100; g.interactLock = 0;
    return boss.state === "dead";
  });
  assert.equal(roofReady, true, "Boss should remain defeatable");
  await page.keyboard.down("e");
  const escaped = await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 720 && !g.ended; i++) { g.hp = 100; g.update(.016); }
    return { won: g.won, ended: g.ended, helicopter: g.heliPhase };
  });
  await page.keyboard.up("e");
  assert.equal(escaped.won, true, "Holding E should launch the rescue sequence");
  assert.equal(escaped.ended, true);
  assert.equal(escaped.helicopter, "landed");
  await page.getByRole("heading", { name: "ŚWIT" }).waitFor();
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(", ")}`);
  console.log("OK: title, inventory, camera scale, flashlight, E hiding, map markers, events, mobile viewport and helicopter finale.");
} finally {
  await browser?.close();
  server.kill();
}