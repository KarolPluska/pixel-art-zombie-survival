import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = "http://127.0.0.1:5185";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "5185", "--strictPort"], { stdio: "ignore" });
let browser;

async function ready() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(base)).ok) return; } catch { /* Wait for preview server. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite preview did not start");
}

try {
  await ready();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.getByRole("heading", { name: "BLOK 7" }).count(), 1);
  await page.getByRole("button", { name: "WEJDŹ DO BLOKU" }).click();
  await page.locator(".hud-kit").waitFor();
  await page.waitForTimeout(900);
  const canvas = await page.evaluate(() => {
    const c = document.querySelector(".stage > canvas");
    return { width: c.width, height: c.height, dev: "game" in window };
  });
  assert.ok(canvas.width > 0 && canvas.height > 0, "The world canvas must render");
  assert.equal(canvas.dev, false, "Production build must not expose the dev handle");
  if (process.env.CAPTURE_UI) {
    await mkdir(".qa", { recursive: true });
    await page.screenshot({ path: ".qa/game-build.png" });
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(", ")}`);
  console.log(`OK: production single-file build boots, renders a ${canvas.width}x${canvas.height} canvas without page errors.`);
} finally {
  await browser?.close();
  server.kill();
}
