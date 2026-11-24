import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = "http://127.0.0.1:5184";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5184", "--strictPort"], { stdio: "ignore" });
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
  await page.waitForTimeout(400);

  // Pixel-art menu skin.
  const skin = await page.evaluate(() => {
    const button = getComputedStyle(document.querySelector(".action-primary"));
    const icon = document.querySelector(".terminal-header .ui-icon");
    return { clip: button.clipPath, border: button.borderTopWidth, font: button.fontFamily, iconStroke: icon?.getAttribute("stroke-width") };
  });
  assert.match(skin.clip, /polygon/, "Buttons should have stepped pixel corners");
  assert.equal(skin.border, "3px", "Buttons should have chunky borders");
  assert.match(skin.font, /Pixelify/, "Buttons should use the pixel font");
  assert.equal(skin.iconStroke, "2", "UI icons should have crisp, thick strokes");

  await page.getByRole("button", { name: /Ekwipunek/ }).click();
  await page.getByRole("dialog", { name: "Ekwipunek" }).waitFor();
  const inventory = await page.evaluate(() => {
    const dialog = document.querySelector(".field-dialog");
    const style = getComputedStyle(dialog);
    const sprites = [...dialog.querySelectorAll(".weapon-sprite")];
    return {
      border: style.borderTopWidth,
      dither: style.backgroundImage,
      rects: dialog.querySelectorAll(".weapon-sprite rect").length,
      raster: sprites.every((s) => s.getAttribute("shape-rendering") === "crispEdges" && s.getAttribute("viewBox") === "0 0 80 36"),
    };
  });
  assert.equal(inventory.border, "4px", "Dialogs should have a pixel frame");
  assert.match(inventory.dither, /repeating-linear-gradient/, "Dialogs should be dithered");
  assert.ok(inventory.rects > 100, `Weapon icons should be pixel rasters, got ${inventory.rects} rects`);
  assert.equal(inventory.raster, true, "All weapon icons should render on a crisp 80x36 raster");
  await capture(page, "inventory-pixel");
  await page.getByRole("tab", { name: /Do odkrycia/ }).click();
  const hidden = await page.evaluate(() => document.querySelectorAll(".weapon-row .weapon-sprite rect").length);
  assert.ok(hidden > 60, "Undiscovered weapons should also use the pixel raster");
  await capture(page, "inventory-hidden");

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "WEJDŹ DO BLOKU" }).click();
  await page.locator(".hud-kit").waitFor();
  await page.waitForTimeout(350);

  // Four new director events, each on a freshly generated floor.
  const results = await page.evaluate(() => {
    const g = window.game;
    const out = {};
    for (const kind of ["cache", "radio", "intercom", "ambush"]) {
      let started = false;
      let director = null;
      for (let floor = 2; floor <= 8 && !started; floor++) {
        g.enter(floor, "up");
        director = g.director;
        for (let i = 0; i < 40 && !started; i++) started = director.start(kind);
      }
      if (!started) { out[kind] = { started: false }; continue; }
      if (kind === "ambush") {
        const extra = director.extraZombies();
        for (let i = 0; i < 430; i++) director.update(0.016);
        const ev = director.events.find((e) => e.kind === "ambush");
        out[kind] = { started: true, extra, stage: ev ? ev.stage : "done" };
      } else {
        const site = director.sites().find((s) => s.kind === kind);
        if (!site) { out[kind] = { started: true, site: false }; continue; }
        g.px = (site.x + 0.5) * 16;
        g.py = (site.y + 0.5) * 16;
        g.interactLock = 0;
        g.transition = null;
        g.computeVisibility();
        let mapOk = true;
        try { g.drawMinimap(g.ctx); } catch { mapOk = false; }
        const prompt = director.prompt();
        const opened = director.interact();
        const options = director.choice ? director.choice.options.length : 0;
        if (director.choice) director.choose(0);
        out[kind] = {
          started: true, site: true, mapOk, prompt, opened, options,
          closed: director.choice === null,
          remaining: director.sites().some((s) => s.kind === kind),
        };
      }
    }
    return out;
  });

  for (const kind of ["cache", "radio", "intercom", "ambush"]) {
    assert.equal(results[kind].started, true, `${kind} should be able to start on a generated floor`);
  }
  for (const kind of ["cache", "radio", "intercom"]) {
    const r = results[kind];
    assert.equal(r.site, true, `${kind} should expose a map site`);
    assert.equal(r.mapOk, true, `${kind} marker must not break the minimap`);
    assert.equal(r.opened, true, `${kind} should react to E`);
    assert.equal(r.options, 3, `${kind} should offer three choices`);
    assert.equal(r.closed, true, `${kind} choice should close after selecting`);
    assert.equal(r.remaining, false, `${kind} should be removed after resolving`);
  }
  assert.match(results.cache.prompt, /skrzynię/);
  assert.match(results.radio.prompt, /radio/);
  assert.match(results.intercom.prompt, /domofon/);
  assert.ok(results.ambush.extra > 0, "Ambush should spawn extra zombies");
  assert.equal(results.ambush.stage, 1, "Ambush should alert its zombies after the delay");

  await capture(page, "game-new-events");
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(", ")}`);
  console.log("OK: pixel-art panels/buttons, raster weapon icons, 4 new events, map markers, E prompts and choices.");
} finally {
  await browser?.close();
  server.kill();
}
