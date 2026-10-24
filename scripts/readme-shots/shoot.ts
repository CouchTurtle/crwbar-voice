// Renders the README images from the real UI with demo data.
//
//   bun scripts/readme-shots/shoot.ts
//
// Starts its own Vite server (not on Tauri's port 1420), drives the app through
// mock.ts in your installed Chrome with a fresh profile, and writes
// docs/images/{icon,app,overlay}.png. Nothing reads your real settings or
// history; every word on screen comes from fixtures.ts.
//
// The icon is taken from an installed app (CRWBAR_APP, default
// /Applications/crwbar voice.app) as macOS draws it, rim and shadow included —
// the bundle's raw artwork is only the inner tile.
import { chromium, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
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
  init?: () => void,
) => {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: SCALE,
    colorScheme: "dark",
  });
  if (init) await page.addInitScript(init);
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
  // As on macOS 26: the page tints the card and draws its shadow, and the
  // native glass under it blurs the desktop (drawn into the picture below).
  const page = await open(
    `scripts/readme-shots/overlay.html?scene=${scene}`,
    size,
    () => ((window as any).__CRWBAR_GLASS__ = true),
  );
  await page.waitForFunction(() => (window as any).__sceneReady === true);
  await page.waitForTimeout(900); // let the enter animation settle
  const card = await page.locator(".scard").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius);
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      radius: Math.min(radius, r.height / 2),
    };
  });
  return { image: await shot(page, true), card, size };
}

type OverlayShot = Awaited<ReturnType<typeof overlayScene>>;

/** An overlay window placed on the desktop, with the blur its glass would add. */
const onDesk = (
  { image, card, size }: OverlayShot,
  left: number,
  top: number,
) =>
  `<div class="glass" style="left:${left + card.x}px;top:${top + card.y}px;width:${card.width}px;height:${card.height}px;border-radius:${card.radius}px"></div>` +
  `<img class="pill" src="data:image/png;base64,${image}" style="left:${left}px;top:${top}px" width="${size.width}" height="${size.height}">`;

const DESK = { width: 680, height: 300 };

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
    .desk {
      position: relative; width: ${DESK.width}px; height: ${DESK.height}px;
      border-radius: 16px; overflow: hidden;
      background: linear-gradient(160deg, #56627a, #2f3646);
      font: 600 15px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
    }
    .doc {
      position: absolute; left: 60px; top: 22px; width: 400px; height: 300px;
      box-sizing: border-box; padding: 24px 28px; border-radius: 10px;
      background: #fbfbfa; color: #1c1c1e; box-shadow: 0 10px 30px rgba(0,0,0,.25);
      display: flex; flex-direction: column; gap: 10px;
    }
    .doc i { display: block; height: 8px; border-radius: 4px; background: #d6d5d1; }
    .doc .photo { height: 64px; width: 60%; border-radius: 6px; background: #e9c46a; }
    .panel {
      position: absolute; right: 34px; top: 52px; width: 150px; height: 220px;
      border-radius: 10px; background: #1b1f27; box-shadow: 0 10px 30px rgba(0,0,0,.3);
    }
    .glass {
      position: absolute;
      -webkit-backdrop-filter: blur(22px) saturate(1.6);
      backdrop-filter: blur(22px) saturate(1.6);
    }
    .pill { position: absolute; display: block; }
  </style></head><body>${body}</body></html>`);
  await page.waitForTimeout(200);
  await page
    .locator("#stage")
    .screenshot({ path: join(OUT, file), omitBackground: true });
  console.log(`wrote docs/images/${file}`);
}

try {
  await mkdir(OUT, { recursive: true });
  const app = process.env.CRWBAR_APP ?? "/Applications/crwbar voice.app";
  execFileSync("osascript", [
    "-l",
    "JavaScript",
    join(ROOT, "scripts/readme-shots/system-icon.js"),
    app,
    join(OUT, "icon.png"),
    "256",
  ]);
  console.log(`wrote docs/images/icon.png (from ${app})`);

  const [transcribe, history] = [await transcribeScene(), await historyScene()];
  await compose(
    `<div id="stage">${windowFrame(transcribe)}${windowFrame(history)}</div>`,
    "app.png",
  );

  // The overlay windows' real sizes (overlay.rs), with the glass's shadow room.
  const pill = { width: 280, height: 70 };
  const card = { width: 424, height: 144 };
  const recording = await overlayScene("overlay-recording", pill);
  const live = await overlayScene("overlay-streaming", card);
  const done = await overlayScene("overlay-done", pill);
  const desk =
    `<div class="doc">Notes — Friday<i style="width:92%"></i><i style="width:80%"></i>` +
    `<i style="width:88%"></i><span class="photo"></span><i style="width:70%"></i></div>` +
    `<div class="panel"></div>` +
    onDesk(live, (DESK.width - card.width) / 2, 14) +
    onDesk(recording, 70, 212) +
    onDesk(done, DESK.width - 70 - pill.width, 212);
  await compose(
    `<div id="stage"><div class="desk">${desk}</div></div>`,
    "overlay.png",
  );
} finally {
  await browser.close();
  await server.close();
}
