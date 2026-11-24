import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = "http://127.0.0.1:5192";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5192", "--strictPort"], { stdio: "ignore" });
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* wait for server */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  await mkdir(".qa", { recursive: true });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const report = await browser.newPage({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 1 });
  await report.goto(`${base}/layout-comparison.html`);
  await report.locator("article").first().waitFor();
  await report.screenshot({ path: ".qa/layout-comparison.png", fullPage: true });
  await report.close();

  for (const seed of [101, 8020, 15939, 23858]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((seed) => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (arr) => {
        if (arr instanceof Uint32Array && arr.length === 1) { arr[0] = seed; return arr; }
        return original(arr);
      };
    }, seed);
    await page.goto(base);
    await page.getByRole("button", { name: "WEJDŹ DO BLOKU" }).click();
    await page.locator(".hud-kit").waitFor();
    await page.waitForTimeout(700);
    if (errors.length) throw new Error(`${seed}: ${errors.join("; ")}`);
    await page.screenshot({ path: `.qa/start-seed-${seed}.png` });
    console.log(seed, await page.evaluate(() => ({
      start: [Math.floor(window.game.px / 16), Math.floor(window.game.py / 16)],
      family: window.game.data().sub.split(" · ").at(-1),
      zone: window.game.currentZone(),
      camera: [window.game.viewW, window.game.viewH],
    })));
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill();
}