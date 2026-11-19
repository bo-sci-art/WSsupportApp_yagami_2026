// コラージュ：タップした位置にスタンプが置かれるか（レイアウトが変わったあとも）を確かめるテスト（v3 項目1）
//
// 使い方:
//   1) node tools/serve.mjs 5500 でアプリを配る（Worker はいらない）
//   2) node tools/test_collage_tap.mjs [--app http://127.0.0.1:5500] [--browser webkit|chromium]
//      ふつうは WebKit（iPad の Safari と同じエンジン）で、iPad の横向き・縦向きの両方から始めて確かめる
//
// 確かめること（横向き・縦向きそれぞれ）
//   - 開いた直後・中のレイアウトだけ変わったあと・向きを変えたあと・戻るボタンで戻ったあとに、タップした所にスタンプが置かれる
//   - 向きを変えても、置いてあるスタンプが絵の同じ所に残る
// スクリーンショットは tools/out/collage_tap/ に保存する
import { webkit, chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const APP = opt("--app", "http://127.0.0.1:5500").replace(/\/+$/, "");
const ENGINE = opt("--browser", "webkit");
const OUT = path.resolve("tools/out/collage_tap");
fs.mkdirSync(OUT, { recursive: true });
const TOL = 3;   // タップとスタンプの差の許容（px）

let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? "OK  " : "NG  ") + name + (extra !== undefined ? "  → " + extra : "")); if (!cond) fails++; };

const L = { width: 1194, height: 834 }, P = { width: 834, height: 1194 };
const browser = ENGINE === "webkit" ? await webkit.launch() : await chromium.launch({ args: ["--use-gl=swiftshader"] });
for (const [label, start, other] of [["横向き", L, P], ["縦向き", P, L]]) {
  const ctx = await browser.newContext(ENGINE === "webkit" ? { ...devices["iPad Pro 11"], viewport: start } : { viewport: start, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", e => ok(`[${label}] JS エラーなし`, false, e.message));
  const fr = () => page.frames().find(f => f.url().includes("collage/app/detail"));
  const frl = page.frameLocator("iframe[data-ws-work]");
  const ready = () => page.waitForFunction(() => { const f = document.querySelector("iframe[data-ws-work]"); try { return f.contentWindow.WS_isReady; } catch (e) { return false; } }, null, { timeout: 20000 });
  const sizes = () => fr().evaluate(() => { const r = canvas.getBoundingClientRect(); return Math.max(Math.abs(r.width - canvas.width / dpr), Math.abs(r.height - canvas.height / dpr)); });
  const rel = () => fr().evaluate(() => stamps.map(s => [(s.x - fit.x) / fit.w, (s.y - fit.y) / fit.h]));
  async function tap(name, rx, ry) {
    const n0 = await fr().evaluate(() => stamps.length);
    const st = await frl.locator("#stage").boundingBox();
    await frl.locator(".thumb").nth(2).click();
    const tx = st.x + st.width * rx, ty = st.y + st.height * ry;
    await page.mouse.click(tx, ty);
    await page.waitForTimeout(400);
    const r = await fr().evaluate(([tx, ty, n0]) => {
      if (stamps.length !== n0 + 1) return null;
      const s = stamps[stamps.length - 1], c = canvas.getBoundingClientRect(), fe = window.frameElement.getBoundingClientRect();
      const k = c.width / (canvas.width / dpr);
      return Math.round(Math.hypot(fe.left + c.left + s.x * k - tx, fe.top + c.top + s.y * k - ty));
    }, [tx, ty, n0]);
    const gap = await sizes();
    ok(`[${label}] ${name}：タップした所にスタンプ`, r !== null && r <= TOL && gap < 1, r === null ? "スタンプができなかった" : `差 ${r}px・見た目と内部の大きさの差 ${Math.round(gap)}px`);
  }

  await page.goto(APP + "/workshop/start/index.html", { waitUntil: "domcontentloaded" });
  await page.goto(APP + "/workshop/collage/app/index.html", { waitUntil: "domcontentloaded" });
  await ready(); await page.waitForTimeout(800);
  await tap("開いた直後", 0.3, 0.3);
  await tap("開いた直後（2つ目）", 0.7, 0.7);

  // 中のレイアウトだけが変わる（window の大きさは同じ）
  await fr().evaluate(() => { document.body.style.gridTemplateColumns = "380px 1fr"; });
  await page.waitForTimeout(500);
  await tap("中のレイアウトだけ変わった", 0.5, 0.5);
  await page.screenshot({ path: path.join(OUT, `${ENGINE}_${label}_1_layout.png`) });
  await fr().evaluate(() => { document.body.style.gridTemplateColumns = ""; });
  await page.waitForTimeout(500);

  // 向きを変える：置いてあるスタンプは絵の同じ所に残る
  const before = await rel();
  await page.setViewportSize(other);
  await page.waitForTimeout(900);
  const after = await rel();
  const moved = Math.max(...before.map((b, i) => Math.hypot(b[0] - after[i][0], b[1] - after[i][1])));
  ok(`[${label}] 向きを変えても、スタンプは絵の同じ所`, moved < 0.005, `いちばん動いたスタンプ：絵の幅の ${(moved * 100).toFixed(2)}%`);
  await tap("向きを変えた", 0.08, 0.92);   // まだスタンプのない、すみの所
  await page.screenshot({ path: path.join(OUT, `${ENGINE}_${label}_2_rotated.png`) });

  // つぎへ → 戻るボタン（もとの向きにもどしてから）
  await page.click("#nextBtn");
  await page.waitForURL(/workshop\/message\/artwork\//, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.setViewportSize(start);
  await page.waitForTimeout(300);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await ready().catch(() => {}); await page.waitForTimeout(1500);
  await tap("別の画面で向きを変えて戻った", 0.92, 0.08);
  await page.screenshot({ path: path.join(OUT, `${ENGINE}_${label}_3_back.png`) });
  await ctx.close();
}
await browser.close();
console.log(`\nスクリーンショット：${OUT}`);
console.log(fails ? `${fails}件 NG` : "すべて OK");
process.exit(fails ? 1 : 0);
