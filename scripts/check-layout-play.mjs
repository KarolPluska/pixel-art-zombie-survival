import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const baseline = JSON.parse(await readFile("reports/baseline-maps.json", "utf8"));
const base = "http://127.0.0.1:5193";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5193", "--strictPort"], { stdio: "ignore" });
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (arr) => {
      if (arr instanceof Uint32Array && arr.length === 1) { arr[0] = 101; return arr; }
      return random(arr);
    };
  });
  await page.goto(base);
  await page.getByRole("button", { name: "WEJDŹ DO BLOKU" }).click();
  await page.locator(".hud-kit").waitFor();
  const now = await page.evaluate(() => {
    const g = window.game;
    return { layout: g.data().seed, start: [g.px, g.py], tiles: Array.from(g.data().tiles).join(""), camera: [g.viewW, g.viewH], version: g.checkpoint()?.generatorVersion };
  });
  assert.equal(now.version, 2);
  assert.deepEqual(now.camera, [480, 300]);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Pauza" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Wznów wyprawę" }).click();
  await page.locator(".hud-kit").waitFor();
  const replay = await page.evaluate(() => {
    const g = window.game;
    return { layout: g.data().seed, start: [g.px, g.py], tiles: Array.from(g.data().tiles).join(""), camera: [g.viewW, g.viewH], version: g.checkpoint()?.generatorVersion };
  });
  assert.deepEqual(replay, now, "New floor layout must replay exactly after saving");

  // A v3 save without generatorVersion belongs to the old generator and must keep its visited map.
  // Stop this Game first, otherwise its pagehide autosave would overwrite our fixture with the new generator version.
  await page.evaluate(() => window.game.destroy());
  await page.evaluate(async () => {
    const { generateFloor } = await import("/src/game/generate.ts");
    const g = window.game;
    const old = generateFloor(0, 101, 101, 1);
    const saved = g.checkpoint();
    // Prevent pagehide/autosave from overwriting this legacy fixture during navigation.
    g.checkpoint = () => null;
    delete saved.generatorVersion;
    saved.floors[0].layout = old.seed;
    saved.floors[0].explored = "0".repeat(old.w * old.h);
    saved.floors[0].opened = [];
    saved.floors[0].doors = old.doors;
    saved.floors[0].environment = { clock: 0, features: {} };
    saved.floors[0].tactical = undefined;
    saved.hero.x = old.playerStart.x;
    saved.hero.y = old.playerStart.y;
    localStorage.setItem("blok7-checkpoint", JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole("button", { name: "Wznów wyprawę" }).click();
  await page.locator(".hud-kit").waitFor();
  const restored = await page.evaluate(() => {
    const g = window.game;
    return { layout: g.data().seed, tiles: Array.from(g.data().tiles).join(""), version: g.checkpoint()?.generatorVersion };
  });
  assert.equal(restored.version, 1);
  assert.equal(restored.layout, baseline[0].layout);
  assert.equal(restored.tiles, baseline[0].tiles);
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(", ")}`);
  console.log("OK: new layout save/reload and v3 legacy save geometry retained; 480x300 canvas camera unchanged.");
} finally {
  await browser?.close();
  server.kill();
}