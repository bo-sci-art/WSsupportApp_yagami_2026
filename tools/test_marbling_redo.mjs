// コラージュの途中でマーブリングを直す（v3 項目2）を確かめるテスト
//
// 使い方:
//   1) node tools/serve.mjs 5500 でアプリを配る（Worker はいらない）
//   2) node tools/test_marbling_redo.mjs [--app http://127.0.0.1:5500] [--browser webkit|chromium]
//
// 確かめること：コラージュ →「◀ マーブリングを直す」→ マーブリング（案内が出る・前の絵がそのまま）→ 描き足す →「つぎへ」→ コラージュ
//   を2往復しても、コラージュの下地は直したあとのマーブリングになり、スタンプも全部残っている
// スクリーンショットは tools/out/marbling_redo/ に保存する
import { webkit, chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const APP = opt("--app", "http://127.0.0.1:5500").replace(/\/+$/, "");
const ENGINE = opt("--browser", "webkit");
const OUT = path.resolve("tools/out/marbling_redo");
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? "OK  " : "NG  ") + name + (extra !== undefined ? "  → " + extra : "")); if (!cond) fails++; };
const PLAIN = (s) => s.replace(/\s+/g, "");

const browser = ENGINE === "webkit" ? await webkit.launch() : await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext(ENGINE === "webkit" ? { ...devices["iPad Pro 11 landscape"] } : { viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", e => ok("JS エラーなし", false, e.message));
page.on("dialog", d => d.accept());
const frl = () => page.frameLocator("iframe[data-ws-work]");
const mfr = () => page.frames().find(f => f.url().includes("marbling/app/detail"));
const cfr = () => page.frames().find(f => f.url().includes("collage/app/detail"));
const collageReady = () => page.waitForFunction(() => { const f = document.querySelector("iframe[data-ws-work]"); try { return f.contentWindow.WS_isReady; } catch (e) { return false; } }, null, { timeout: 20000 });
const plainText = (sel) => page.locator(sel).evaluate(el => { const c = el.cloneNode(true); c.querySelectorAll("rt").forEach(r => r.remove()); return c.textContent; });

async function paint(color, y0) {
  const c = await frl().locator("canvas").first().boundingBox();
  const sw = frl().locator("#swatches button, #swatches .swatch").nth(color);
  if (await sw.count()) await sw.click();
  await page.mouse.move(c.x + c.width * 0.25, c.y + c.height * y0);
  await page.mouse.down();
  for (let i = 0; i <= 24; i++) await page.mouse.move(c.x + c.width * (0.25 + i * 0.02), c.y + c.height * (y0 + Math.sin(i / 3) * 0.1));
  await page.mouse.up();
  await page.waitForTimeout(600);
}
// 保存されているマーブリングの絵（IndexedDB）を、間引いた画素の配列で
const savedMarbling = (fr) => fr.evaluate(async () => {
  const blob = await idbGet("latest_marbling_base"); if (!blob) return null;
  const bm = await createImageBitmap(blob); const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
  const x = c.getContext("2d"); x.drawImage(bm, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, a = [];
  for (let i = 0; i < d.length; i += 4 * 97) a.push(d[i], d[i + 1], d[i + 2]);
  return a;
});
const diff = (a, b) => { if (!a || !b || a.length !== b.length) { console.log("   （比べられない：", a ? a.length : null, b ? b.length : null, "）"); return 999; } let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
// コラージュの下地（いま表示している絵）を間引いた画素で
const collageBase = () => cfr().evaluate(() => {
  if (!baseImg) return null;
  const c = document.createElement("canvas"); c.width = 200; c.height = 150; const x = c.getContext("2d"); x.drawImage(baseImg, 0, 0, 200, 150);
  return Array.from(x.getImageData(0, 0, 200, 150).data.filter((_, i) => i % 4 !== 3 && i % 37 === 0));
});
async function addStamp(rx, ry, thumb) {
  const st = await frl().locator("#stage").boundingBox();
  await frl().locator(".thumb").nth(thumb).click();
  await page.mouse.click(st.x + st.width * rx, st.y + st.height * ry);
  await page.waitForTimeout(500);
}

// はじめ：マーブリングをかいてコラージュへ
await page.goto(APP + "/workshop/start/index.html", { waitUntil: "domcontentloaded" });
await page.goto(APP + "/workshop/marbling/app/index.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
ok("ふつうに開いたマーブリングには案内が出ない", (await page.locator(".ws-return-notice").count()) === 0);
await paint(0, 0.35);
await page.click("#nextBtn");
await page.waitForURL(/workshop\/collage\/app\//, { waitUntil: "domcontentloaded" });
await collageReady(); await page.waitForTimeout(800);
const back = PLAIN(await plainText("#backBtn"));
ok("コラージュの「もどる」は「◀ マーブリングを直す」", back === "◀マーブリングを直す", back);
await addStamp(0.3, 0.3, 4);
await addStamp(0.7, 0.6, 2);
let base0 = await collageBase();
let stampsExpected = await cfr().evaluate(() => stamps.length);

for (let round = 1; round <= 2; round++) {
  // コラージュ →「マーブリングを直す」
  await page.click("#backBtn");
  await page.waitForURL(/workshop\/marbling\/app\/index\.html\?from=collage/, { waitUntil: "domcontentloaded" });
  // 前の絵の復元（load の 0.3 秒後）が終わるまで待つ
  await page.waitForFunction(() => { const f = document.querySelector("iframe[data-ws-work]"); try { return f.contentWindow.WS_marblingRestored; } catch (e) { return false; } }, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const badge = PLAIN(await plainText(".ws-header .ws-edit-badge").catch(() => ""));
  const note = PLAIN(await plainText(".ws-return-notice").catch(() => ""));
  ok(`[${round}往復目] マーブリングに「✏️ 直しています」と案内`, badge === "✏️直しています" && /スタンプは消えないよ。直したら「つぎへ」でコラージュにもどれるよ/.test(note), badge + " / " + note);
  const pass = await page.locator(".ws-return-notice").evaluate(el => getComputedStyle(el).pointerEvents);
  ok(`[${round}往復目] 案内の上からでも絵がかける（タップを通す）`, pass === "none");
  // 前の絵がそのまま表示されている（にじんでいない）：保存されている絵と、いまの絵を保存し直したものを比べる
  const before = await savedMarbling(mfr());
  await mfr().evaluate(async () => { window.__marblingDirty = true; await window.WS_saveMarbling(); });
  const same = diff(before, await savedMarbling(mfr()));
  ok(`[${round}往復目] もどったマーブリングは前の絵のまま`, same < 1, `画素の平均の差 ${same.toFixed(2)}`);
  await page.screenshot({ path: path.join(OUT, `${ENGINE}_${round}_marbling.png`) });
  // 描き足して「つぎへ」
  await paint(round === 1 ? 6 : 3, round === 1 ? 0.6 : 0.8);
  await page.click("#nextBtn");
  await page.waitForURL(/workshop\/collage\/app\//, { waitUntil: "domcontentloaded" });
  await collageReady(); await page.waitForTimeout(800);
  const n = await cfr().evaluate(() => stamps.length);
  ok(`[${round}往復目] コラージュにもどるとスタンプが全部ある`, n === stampsExpected, `${n} 個（前は ${stampsExpected} 個）`);
  const base1 = await collageBase();
  const changed = diff(base0, base1);
  ok(`[${round}往復目] コラージュの下地は直したあとのマーブリング`, base1 && changed > 0.5, `下地の画素の平均の差 ${changed.toFixed(2)}`);
  await page.screenshot({ path: path.join(OUT, `${ENGINE}_${round}_collage.png`) });
  base0 = base1;
  await addStamp(0.5, 0.85, 7);
  stampsExpected = await cfr().evaluate(() => stamps.length);
}
// 最後にタイトルの画面へ進んで、作品画像にスタンプと直したマーブリングが入っている
await page.click("#nextBtn");
await page.waitForURL(/workshop\/message\/artwork\//, { waitUntil: "domcontentloaded" });
const hasImg = await page.evaluate(() => (localStorage.getItem("artworkImage") || "").length > 1000);
ok("タイトルの画面へ進むと作品画像ができている", hasImg);
await browser.close();
console.log(`\nスクリーンショット：${OUT}`);
console.log(fails ? `${fails}件 NG` : "すべて OK");
process.exit(fails ? 1 : 0);
