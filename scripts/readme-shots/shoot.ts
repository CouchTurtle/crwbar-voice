// Renders the README images from the real UI with demo data.
//
//   bun scripts/readme-shots/shoot.ts
//
// Starts its own Vite server (not on Tauri's port 1420), drives the app through
// mock.ts in your installed Chrome with a fresh profile, and writes
// docs/images/{icon,app,overlay}.png. Nothing reads your real settings or
// history; every word on screen comes from fixtures.ts.
import { chromium, type Page } from "@playwright/test";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "vite";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/images");
const SCALE = 2;
const WINDOW = { width: 680, height: 570 }; // the real main window, lib.rs

const server = await createServer({
  root: ROOT,
  server: { port: 1430, strictPort: false, hmr: false },
  logLevel: "error",
});
await server.listen();
const base = server.resolvedUrls!.local[0];
const browser = await chromium.launch({ channel: "chrome", headless: true });

const open = async (
  path: string,
  viewport: { width: number; height: number },
) => {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: SCALE,
    colorScheme: "dark",
  });
  page.on("pageerror", (e) => console.error(`[${path}] ${e.message}`));
  await page.goto(base + path);
  return page;
};

const shot = async (page: Page, transparent = false) =>
  (await page.screenshot({ omitBackground: transparent })).toString("base64");

// ---- raw scenes -------------------------------------------------------------

async function transcribeScene() {
  const page = await open(
    "scripts/readme-shots/app.html?scene=transcribe",
    WINDOW,
  );
  await page.getByText("Transcribe", { exact: true }).first().click();
  await page.getByRole("button", { name: "Choose audio file…" }).click();
  await page.getByText("left", { exact: false }).waitFor();
  await page.waitForTimeout(600);
  return shot(page);
}

async function historyScene() {
  const page = await open(
    "scripts/readme-shots/app.html?scene=history",
    WINDOW,
  );
  await page.getByText("History", { exact: true }).first().click();
  await page.getByPlaceholder("Search transcripts").fill("budget");
  await page.locator("mark").first().waitFor();
  await page.waitForTimeout(400);
  return shot(page);
}

async function overlayScene(
  scene: string,
  size: { width: number; height: number },
) {
  const page = await open(
    `scripts/readme-shots/overlay.html?scene=${scene}`,
    size,
  );
  await page.waitForFunction(() => (window as any).__sceneReady === true);
  await page.waitForTimeout(900); // let the enter animation settle
  return shot(page, true);
}

// ---- composition ------------------------------------------------------------

const windowFrame = (image: string) => `
  <div class="window">
    <div class="titlebar">
      <span class="light" style="background:#ff5f57"></span>
      <span class="light" style="background:#febc2e"></span>
      <span class="light" style="background:#28c840"></span>
      <span class="title">crwbar voice</span>
    </div>
    <img src="data:image/png;base64,${image}" width="${WINDOW.width}" height="${WINDOW.height}">
  </div>`;

async function compose(body: string, file: string) {
  const page = await browser.newPage({ deviceScaleFactor: SCALE });
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; }
    #stage { display: inline-flex; gap: 48px; padding: 40px; align-items: center; }
    #stage.column { flex-direction: column; gap: 28px; }
    .window {
      border-radius: 12px; overflow: hidden; background: #0c0e0d;
      box-shadow: 0 0 0 0.5px rgba(255,255,255,.14), 0 24px 60px rgba(0,0,0,.32);
    }
    .window img { display: block; }
    .titlebar {
      position: relative; height: 28px; display: flex; align-items: center;
      gap: 8px; padding: 0 12px; background: #2b2b2b;
      border-bottom: 1px solid rgba(0,0,0,.6);
      font: 600 13px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
    }
    .light { width: 12px; height: 12px; border-radius: 50%; }
    .title {
      position: absolute; inset: 0; display: flex; align-items: center;
      justify-content: center; color: rgba(255,255,255,.85);
    }
    .overlay img { display: block; filter: drop-shadow(0 10px 24px rgba(0,0,0,.28)); }
  </style></head><body>${body}</body></html>`);
  await page.waitForTimeout(200);
  await page
    .locator("#stage")
    .screenshot({ path: join(OUT, file), omitBackground: true });
  console.log(`wrote docs/images/${file}`);
}

const img = (data: string, w: number, h: number) =>
  `<div class="overlay"><img src="data:image/png;base64,${data}" width="${w}" height="${h}"></div>`;

try {
  await mkdir(OUT, { recursive: true });
  await copyFile(
    join(ROOT, "src-tauri/icons/128x128@2x.png"),
    join(OUT, "icon.png"),
  );
  console.log("wrote docs/images/icon.png");

  const [transcribe, history] = [await transcribeScene(), await historyScene()];
  await compose(
    `<div id="stage">${windowFrame(transcribe)}${windowFrame(history)}</div>`,
    "app.png",
  );

  const pill = { width: 256, height: 46 };
  const card = { width: 400, height: 120 };
  const recording = await overlayScene("overlay-recording", pill);
  const live = await overlayScene("overlay-streaming", card);
  const done = await overlayScene("overlay-done", pill);
  await compose(
    `<div id="stage" class="column">${img(recording, pill.width, pill.height)}${img(live, card.width, card.height)}${img(done, pill.width, pill.height)}</div>`,
    "overlay.png",
  );
} finally {
  await browser.close();
  await server.close();
}
