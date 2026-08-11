/**
 * Development helper: captures the app's screens to `.screenshots/` so layout
 * regressions are visible without clicking through the whole console.
 *
 *   node scripts/screenshot.mjs                 # default pages, light theme
 *   node scripts/screenshot.mjs --dark          # dark theme
 *   node scripts/screenshot.mjs --mobile        # 390x844 viewport
 *
 * Requires `npm run dev` to already be running on :3000.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), ".screenshots");

const dark = process.argv.includes("--dark");
const mobile = process.argv.includes("--mobile");

const PAGES = [
  { name: "login", url: "/login" },
  { name: "register", url: "/register" },
  { name: "pending", url: "/pending?registered=1" },
  { name: "forgot-password", url: "/forgot-password" },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: dark ? "dark" : "light",
});

fs.mkdirSync(OUT, { recursive: true });

const suffix = `${dark ? "-dark" : ""}${mobile ? "-mobile" : ""}`;

for (const target of PAGES) {
  const page = await context.newPage();
  await page.goto(`${BASE}${target.url}`, { waitUntil: "networkidle" });
  // Let webfonts settle so text metrics match a real visit.
  await page.waitForTimeout(400);

  const file = path.join(OUT, `${target.name}${suffix}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`${target.name}${suffix}  ->  ${path.relative(process.cwd(), file)}`);
  await page.close();
}

await browser.close();
