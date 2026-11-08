// 最初の画面 → 登録 → 防災行動マップ表示 までの通しテスト＋全画面のスクリーンショット
//
// 使い方:
//   1) node tools/serve.mjs 5500                 （アプリを http://127.0.0.1:5500 で配信）
//   2) Worker を用意する
//        ローカル：cd worker && npx wrangler dev --local --port 8787
//        本番   ：デプロイ済みの URL
//   3) node tools/e2e_flow.mjs <WorkerのURL> <ADMIN_KEY> [--app http://127.0.0.1:5500]
//
// iPad の画面サイズ（横 1180×820、縦 820×1180）で1回ずつ通しで動かし、
// tools/out/screens/ に全画面のスクリーンショットを保存する。
// あわせて、各画面で「ルビのない漢字」「横にはみ出し」をチェックし、tools/out/report.json に書く。
// テストで登録した作品は最後に DELETE で消し、消えたことを確かめる。

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const WORKER = (args[0] || "http://127.0.0.1:8787").replace(/\/+$/, "");
const ADMIN_KEY = args[1] || "local-admin-key-for-test";
const APP = (args.includes("--app") ? args[args.indexOf("--app") + 1] : "http://127.0.0.1:5500").replace(/\/+$/, "");
const OUT = path.resolve("tools/out/screens");
fs.mkdirSync(OUT, { recursive: true });

const report = { worker: WORKER, app: APP, runs: [] };

// ルビのない漢字・横のはみ出しを調べる（各フレームで実行）
const CHECK = () => {
  const KANJI = /[々一-鿿]/;
  const bad = new Set();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const t = n.nodeValue;
    if (!KANJI.test(t)) continue;
    let el = n.parentElement, skip = false;
    while (el) {
      const tag = el.tagName;
      if (tag === "RUBY" || tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "TITLE") { skip = true; break; }
      // 見えていないもの・地図の出典・作品データ（児童の書いた文章・地名）は対象外
      if (el.classList && (el.classList.contains("leaflet-control-attribution") || el.hasAttribute("data-user-text") || el.classList.contains("summary-value") || el.classList.contains("art-message") || el.classList.contains("art-title"))) { skip = true; break; }
      el = el.parentElement;
    }
    if (skip) continue;
    const pe = n.parentElement;
    const st = pe && getComputedStyle(pe);
    if (!pe || st.display === "none" || st.visibility === "hidden" || pe.offsetParent === null && st.position !== "fixed") continue;
    bad.add(t.trim().slice(0, 40));
  }
  const de = document.documentElement;
  return { noRuby: [...bad], hOverflow: de.scrollWidth - de.clientWidth };
};

async function check(page, name, run) {
  const res = { name, frames: [] };
  for (const f of page.frames()) {
    try {
      const r = await f.evaluate(CHECK);
      res.frames.push({ url: f.url().replace(APP, ""), ...r });
    } catch (e) { /* 読み込み中のフレーム */ }
  }
  run.pages.push(res);
}

async function shot(page, run, name) {
  const file = `${run.label}_${String(run.n++).padStart(2, "0")}_${name}.png`;
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, file) });
  await check(page, name, run);
  run.shots.push(file);
}

async function flow(label, viewport) {
  const run = { label, viewport, n: 1, shots: [], pages: [], steps: [], errors: [] };
  report.runs.push(run);
  const step = (s) => { run.steps.push(s); console.log(`[${label}] ${s}`); };

  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, acceptDownloads: true, locale: "ja-JP" });
  const page = await ctx.newPage();
  page.on("pageerror", e => run.errors.push(`${page.url().replace(APP, "")}: ${e.message}`));
  page.on("dialog", d => d.accept());

  // S0 はじめる
  await page.goto(`${APP}/workshop/start/index.html?worker=${encodeURIComponent(WORKER)}`);
  await page.waitForURL(/start/);
  await shot(page, run, "S0_start");
  await page.click("#startBtn");

  // S1 ハザードマップを見る
  await page.waitForURL(/map\/app/);
  const mapFrame = page.frameLocator("iframe[data-ws-work]");
  await mapFrame.locator("#chk-flood_l2").check();
  await mapFrame.locator("#chk-kyukei").check();
  await shot(page, run, "S1_hazardmap");
  step("S1 ハザードマップ：洪水・がけくずれを表示");
  await page.click("#nextBtn");

  // S2 場所と災害をえらぶ
  await page.waitForURL(/map\/Log/);
  await page.locator(".hazard-option").nth(0).click();
  await page.locator(".hazard-option").nth(4).click();
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.click("#confirmLocationBtn");
  await shot(page, run, "S2_location");
  step("S2 場所：地図をタップして決定");
  await page.click("#nextBtn");

  // S3 マーブリング
  await page.waitForURL(/marbling\/app/);
  const mf = page.frames().find(f => f.url().includes("marbling/app/detail"));
  await page.waitForTimeout(1500);
  async function paint(color) {
    const c = await page.frameLocator("iframe[data-ws-work]").locator("canvas").boundingBox();
    const sw = page.frameLocator("iframe[data-ws-work]").locator("#swatches button, #swatches .swatch").nth(color);
    if (await sw.count()) await sw.click();
    await page.mouse.move(c.x + c.width * 0.3, c.y + c.height * 0.4);
    await page.mouse.down();
    for (let i = 0; i <= 20; i++) await page.mouse.move(c.x + c.width * (0.3 + i * 0.02), c.y + c.height * (0.4 + Math.sin(i / 3) * 0.15));
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  await paint(0);
  await paint(3);
  await shot(page, run, "S3_marbling");
  step("S3 マーブリング：2色で描画");
  await page.click("#nextBtn");

  // S4 マーブリングの記録
  await page.waitForURL(/marbling\/Log/);
  await page.fill("#marblingDescription", "大雨のとき、川の水があふれて、まちに水がながれこむようすを青と茶色で表しました。");
  await shot(page, run, "S4_marbling_log");
  step("S4 マーブリングの記録：入力");
  await page.click("#nextBtn");

  // S5 コラージュ（スタンプを2つ置く）
  await page.waitForURL(/collage\/app/);
  const cfr = () => page.frames().find(f => f.url().includes("collage/app/detail"));
  await page.waitForTimeout(1500);
  const cl = page.frameLocator("iframe[data-ws-work]");
  const stage = await cl.locator("#stage").boundingBox();
  await cl.locator(".thumb").nth(4).click();     // 走る人
  await page.mouse.click(stage.x + stage.width * 0.35, stage.y + stage.height * 0.5);
  await cl.locator(".thumb").nth(11).click();    // 階段
  await cl.locator(".swatch").nth(2).click();    // 赤
  await page.mouse.click(stage.x + stage.width * 0.65, stage.y + stage.height * 0.4);
  await page.waitForTimeout(800);
  await shot(page, run, "S5_collage");
  const stampsBefore = await cfr().evaluate(() => stamps.length);
  step(`S5 コラージュ：スタンプ ${stampsBefore} 個`);

  // マーブリングに戻って作り直す（スタンプが消えないこと）
  await page.click("#backBtn");                  // → マーブリングの記録
  await page.waitForURL(/marbling\/Log/);
  await page.click("#backBtn");                  // → マーブリング
  await page.waitForURL(/marbling\/app/);
  await page.waitForTimeout(2000);
  await shot(page, run, "S3b_marbling_back");
  await paint(5);
  step("S3 に戻ってマーブリングを描き足し");
  await page.click("#nextBtn");
  await page.waitForURL(/marbling\/Log/);
  const kept = await page.inputValue("#marblingDescription");
  await page.click("#nextBtn");
  await page.waitForURL(/collage\/app/);
  await page.waitForTimeout(2000);
  const stampsAfter = await cfr().evaluate(() => stamps.length);
  await shot(page, run, "S5b_collage_restored");
  run.restore = { stampsBefore, stampsAfter, marblingLogKept: kept.length > 0 };
  step(`S5 コラージュに戻る：スタンプ ${stampsAfter} 個（前は ${stampsBefore} 個）、記録の文章 ${kept.length ? "のこっている" : "消えた"}`);
  await page.click("#nextBtn");

  // S6 コラージュの記録
  await page.waitForURL(/collage\/Log/);
  await page.fill("#collageDescription", "大雨のときは、早めに学校の3かいへにげる行動を表しました。家族に見てほしいです。");
  await page.locator(".phase-option").nth(1).click();
  await shot(page, run, "S6_collage_log");
  step("S6 コラージュの記録：入力・災害時");
  await page.click("#nextBtn");

  // S7 タイトルとペンネーム
  await page.waitForURL(/message\/artwork/);
  await page.fill("#artworkTitle", `E2Eテスト（${label}）大雨のときは早めに高いところへ！`);
  await page.fill("#creatorName", "テストマン");
  await shot(page, run, "S7_title");
  step("S7 タイトル・ペンネーム：入力");
  await page.click("#nextBtn");

  // S8 たしかめて登録
  await page.waitForURL(/lastconfirm/);
  await page.waitForSelector("#artwork-preview-img", { state: "visible", timeout: 10000 });
  const imgInfo = await page.evaluate(async () => {
    const d = localStorage.getItem("artworkImage");
    const img = new Image(); img.src = d; await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight, kb: Math.round(d.length * 0.75 / 1024) };
  });
  run.artworkImage = imgInfo;
  await shot(page, run, "S8_confirm");
  step(`S8 最終確認：作品画像 ${imgInfo.w}×${imgInfo.h}（約${imgInfo.kb}KB）`);
  await page.click("#btn-submit-artwork");
  await page.waitForSelector("#step-complete", { state: "visible", timeout: 20000 });
  const id = await page.evaluate(() => localStorage.getItem("lastSubmittedArtworkId"));
  run.submittedId = id;
  await page.locator("#step-complete").scrollIntoViewIfNeeded();
  await shot(page, run, "S8b_done");
  step(`S8 登録：id=${id}`);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.click("#btn-download")]);
  run.download = dl.suggestedFilename();
  step(`S8 iPadに保存：${run.download}`);

  // S9 防災行動マップ
  await page.click("button[onclick=\"goToNextAction()\"]");
  await page.waitForURL(/present\/index/);
  await page.waitForSelector(`#card-${id}`, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot(page, run, "S9_present");
  step(`S9 マップ：作品 ${id} が一覧に表示`);
  await page.click(`#card-${id}`);
  await page.waitForURL(/detail\.html/);
  await page.waitForTimeout(1500);
  await shot(page, run, "S9b_detail_tutorial");
  const skip = page.locator("#dt-skip-btn");
  if (await skip.isVisible()) await skip.click();
  await page.waitForTimeout(800);
  await shot(page, run, "S9c_detail");

  // マーブリング中・コラージュ中の「ハザードマップ」パネル
  await page.goto(`${APP}/workshop/collage/app/index.html`);
  await page.waitForTimeout(1500);
  await page.click("#mapBtn");
  await page.waitForTimeout(1500);
  await shot(page, run, "S5c_collage_mappanel");

  // テスト作品を削除
  const del = await fetch(`${WORKER}/artworks/${id}`, { method: "DELETE", headers: { Authorization: "Bearer " + ADMIN_KEY } }).then(r => r.json());
  const left = await fetch(`${WORKER}/artworks`).then(r => r.json());
  run.deleted = del.ok && !left.features.some(f => f.properties.id === id);
  step(`後片付け：DELETE /artworks/${id} → ${run.deleted ? "消えた" : "残っている！"}`);

  await browser.close();
  delete run.n;
}

await flow("landscape", { width: 1180, height: 820 });
await flow("portrait", { width: 820, height: 1180 });

fs.writeFileSync(path.resolve("tools/out/report.json"), JSON.stringify(report, null, 2));
const problems = [];
for (const r of report.runs) {
  if (r.errors.length) problems.push(`[${r.label}] JSエラー: ${r.errors.join(" / ")}`);
  if (!r.deleted) problems.push(`[${r.label}] 削除できていない`);
  if (r.restore.stampsAfter !== r.restore.stampsBefore) problems.push(`[${r.label}] スタンプが復元されない`);
  for (const p of r.pages) for (const f of p.frames) {
    if (f.noRuby.length) problems.push(`[${r.label}] ${p.name} ${f.url}: ルビなし ${JSON.stringify(f.noRuby)}`);
    if (f.hOverflow > 0) problems.push(`[${r.label}] ${p.name} ${f.url}: 横にはみ出し ${f.hOverflow}px`);
  }
}
console.log(problems.length ? "\n要確認:\n" + problems.join("\n") : "\n問題なし");
