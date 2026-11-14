// 最初の画面 → 登録 → 防災行動マップ表示 までの通しテスト＋全画面のスクリーンショット
//
// 使い方:
//   1) node tools/serve.mjs 5500                 （アプリを http://127.0.0.1:5500 で配信）
//   2) Worker を用意する
//        ローカル：cd worker && npx wrangler dev --local --port 8787
//        本番   ：デプロイ済みの URL
//   3) node tools/e2e_flow.mjs <WorkerのURL> <ADMIN_KEY> [--app http://127.0.0.1:5500]
//
// 授業案 rev3 の流れ（S0→S1→S2→ここまで→（タブを閉じて）つづきから→S3→S5→S7→S8→登録→S9）を
// iPad の画面サイズ（横 1180×820、縦 820×1180）で1回ずつ通しで動かし、
// tools/out/screens/ に全画面のスクリーンショットを保存する。
// あわせて、各画面で「ルビのない漢字」「横にはみ出し」をチェックし、tools/out/report.json に書く。
// あわせて「同じ場所に10件登録してマップから全部開けるか」も確かめる。
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
      // 見えていないもの・出典・凡例のマーク・図の中の文字・作品データ（児童の書いた文章・地名）は対象外
      if (el.classList && (el.classList.contains("leaflet-control-attribution") || el.hasAttribute("data-user-text") || el.classList.contains("summary-value") || el.classList.contains("art-message") || el.classList.contains("art-title") || el.classList.contains("res-source") || el.classList.contains("attr") || el.classList.contains("res-badge") || el.classList.contains("rb-seen") || el.classList.contains("no-ruby") || el.classList.contains("ribbon-text") || tag === "svg" || tag === "text")) { skip = true; break; }
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
  // 起動直後などに撮影がまれに失敗するので、3回まで撮り直す
  for (let i = 0; ; i++) {
    try { await page.screenshot({ path: path.join(OUT, file) }); break; }
    catch (e) { if (i >= 2) throw e; await page.waitForTimeout(1000); }
  }
  await check(page, name, run);
  run.shots.push(file);
}

// ふりがな（<rt>）をのぞいた文字（「水{みず}が街{まち}…」→「水が街…」）
const PLAIN = (el) => { const c = el.cloneNode(true); c.querySelectorAll("rt").forEach(r => r.remove()); return c.textContent.replace(/\s+/g, ""); };

async function flow(label, viewport, placeId, number, hazards) {
  const run = { label, viewport, n: 1, shots: [], pages: [], steps: [], errors: [], checks: {} };
  report.runs.push(run);
  const step = (s) => { run.steps.push(s); console.log(`[${label}] ${s}`); };

  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, acceptDownloads: true, locale: "ja-JP" });
  let page = await ctx.newPage();
  const watch = (p) => { p.on("pageerror", e => run.errors.push(`${p.url().replace(APP, "")}: ${e.message}`)); p.on("dialog", d => d.accept()); };
  watch(page);

  // S0 はじめる（データがないので「はじめる」だけが出る）
  await page.goto(`${APP}/workshop/start/index.html?worker=${encodeURIComponent(WORKER)}`);
  await page.waitForSelector("#startBtn", { state: "visible" });
  await shot(page, run, "S0_start");
  await page.click("#startBtn");

  // S1 ハザードマップを見る（3か所の目印）
  await page.waitForURL(/map\/app/);
  const mapFrame = page.frameLocator("iframe[data-ws-work]");
  await mapFrame.locator("#chk-flood_l2").check();
  await mapFrame.locator("#chk-kyukei").check();
  run.checks.s1Places = await mapFrame.locator(".place-marker").count();
  run.checks.naisuiLink = await mapFrame.locator(".hg-mizu .ext-link").evaluate((a) => {
    const head = a.parentElement.querySelector(".fopt-head"), desc = a.parentElement.querySelector(".fopt-desc");
    const PL = (el) => { const c = el.cloneNode(true); c.querySelectorAll("rt").forEach(r => r.remove()); return c.textContent.replace(/\s+/g, ""); };
    return { href: a.href, target: a.target, head: head && PL(head), desc: !!desc && PL(desc).includes("内水氾濫"), rubies: a.parentElement.querySelectorAll(".fopt-head ruby, .fopt-desc ruby").length };
  });
  if (hazards.includes("内水氾濫")) {
    // リンクを押す → 新しいタブで開く → アプリのタブに戻っても、S1 の ✓ が残っている
    const [pop] = await Promise.all([ctx.waitForEvent("page", { timeout: 15000 }), mapFrame.locator(".hg-mizu .ext-link").click()]);
    run.checks.naisuiPopup = pop.url();
    await pop.close();
    await page.bringToFront();
    run.checks.naisuiKeepS1 = await mapFrame.locator("#chk-flood_l2").isChecked() && /map\/app/.test(page.url());
    step(`S1 内水氾濫のリンク：新しいタブで ${run.checks.naisuiPopup.slice(0, 60)}… が開いた、もどっても ✓ が残る=${run.checks.naisuiKeepS1}`);
  }
  await shot(page, run, "S1_hazardmap");
  step(`S1 ハザードマップ：洪水・土砂災害を表示、場所の目印 ${run.checks.s1Places} 個`);
  await page.click("#nextBtn");

  // S2 場所（3つのボタン）と災害
  await page.waitForURL(/map\/Log\/log_hazard_map/);
  run.checks.s2Buttons = await page.locator(".place-btn").count();
  run.checks.s2Hazards = await page.locator(".hazard-option").count();
  await page.click(`.place-btn[data-place="${placeId}"]`);
  for (const h of hazards) await page.locator(`.hazard-option input[value="${h}"]`).check();
  await page.waitForTimeout(800);
  await shot(page, run, "S2_place");
  run.checks.s2Saved = await page.evaluate(() => (JSON.parse(localStorage.getItem("hazardMapLog") || "{}").hazards || []));
  step(`S2 場所：ボタン ${run.checks.s2Buttons} 個から ${placeId} を選択、災害の選択肢 ${run.checks.s2Hazards} 個、選んだ災害 ${run.checks.s2Saved.join("・")}`);
  await page.click("#nextBtn");

  // 1コマ目はここまで
  await page.waitForURL(/map\/Log\/break/);
  await shot(page, run, "S2b_break");
  step("1コマ目はここまで：画面が出た");

  // 休み時間：タブを閉じて開き直す → 「つづきから」
  await page.close();
  page = await ctx.newPage();
  watch(page);
  await page.goto(`${APP}/workshop/start/index.html`);
  await page.waitForSelector("#resumeBtn", { state: "visible" });
  run.checks.resumeWhere = (await page.locator("#resumeWhere").innerText()).replace(/\s+/g, "");
  await shot(page, run, "S0b_resume");
  await page.click("#resumeBtn");
  await page.waitForURL(/marbling\/app/);
  const savedPlace = await page.evaluate(() => (JSON.parse(localStorage.getItem("hazardMapLog") || "{}").location || {}).place);
  run.checks.resumeOK = savedPlace === placeId;
  step(`つづきから：タブを閉じて開き直し → マーブリングから再開（${run.checks.resumeWhere}）、場所 ${savedPlace}`);

  // S3 マーブリング
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

  // S5 コラージュ（スタンプを2つ置く）
  await page.waitForURL(/collage\/app/);
  const cfr = () => page.frames().find(f => f.url().includes("collage/app/detail"));
  await page.waitForTimeout(1500);
  const cl = page.frameLocator("iframe[data-ws-work]");
  const stage = await cl.locator("#stage").boundingBox();
  await cl.locator(".thumb").nth(4).click();
  await page.mouse.click(stage.x + stage.width * 0.35, stage.y + stage.height * 0.5);
  await cl.locator(".thumb").nth(11).click();
  await cl.locator(".swatch").nth(2).click();
  await page.mouse.click(stage.x + stage.width * 0.65, stage.y + stage.height * 0.4);
  await page.waitForTimeout(800);
  // 濃さのレバー：いちばん右（こく）にすると、選んでいるスタンプが濃くなる
  run.checks.alpha = await cfr().evaluate(() => {
    const el = document.getElementById("alpha");
    if (!el) return { slider: false };
    const i = stamps.length - 1;
    selectIndex(i);
    const before = stamps[i].alpha;
    el.value = "1"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    const after = stamps[i].alpha;
    el.value = "0.3"; el.dispatchEvent(new Event("input", { bubbles: true }));
    const light = stamps[i].alpha;
    el.value = "1"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    return { slider: true, before, after, light };
  });
  await page.waitForTimeout(800);
  await shot(page, run, "S5_collage");
  const stampsBefore = await cfr().evaluate(() => stamps.length);
  step(`S5 コラージュ：スタンプ ${stampsBefore} 個、濃さのレバー ${JSON.stringify(run.checks.alpha)}`);

  // マーブリングに戻って描き足す（スタンプが消えないこと）
  await page.click("#backBtn");
  await page.waitForURL(/marbling\/app/);
  await page.waitForTimeout(2000);
  await paint(5);
  await page.click("#nextBtn");
  await page.waitForURL(/collage\/app/);
  await page.waitForTimeout(2000);
  const stampsAfter = await cfr().evaluate(() => stamps.length);
  run.checks.alphaKept = await cfr().evaluate(() => stamps.length ? Math.round(stamps[stamps.length - 1].alpha * 100) / 100 : null);
  run.restore = { stampsBefore, stampsAfter };
  step(`マーブリングに戻って描き足し → コラージュ：スタンプ ${stampsAfter} 個（前は ${stampsBefore} 個）`);
  await page.click("#nextBtn");

  // S7 タイトル・伝えたいこと・いつの行動か・番号
  await page.waitForURL(/message\/artwork/);
  await page.fill("#artworkTitle", `E2Eテスト（${label}）大雨のときは早めに高いところへ！`);
  await page.fill("#artworkBody", "大雨で川があふれそうなときは、家族といっしょに早めに高い場所へ避難してほしいです。");
  await page.locator(".phase-option").nth(1).click();
  await page.fill("#creatorNumber", "12");
  run.checks.badNumberBlocked = await page.locator("#nextBtn").isDisabled();
  await page.fill("#creatorNumber", "４２０" + number.slice(-1));   // 全角でも半角になる
  await page.fill("#creatorNumber", number);
  run.checks.numberInputmode = await page.getAttribute("#creatorNumber", "inputmode");
  await shot(page, run, "S7_message");
  step(`S7 入力：番号「12」では進めない=${run.checks.badNumberBlocked}、番号 ${number}、数字キーボード=${run.checks.numberInputmode}`);
  await page.click("#nextBtn");

  // S8 確認して登録（スクロールなしで「登録する」が見える）
  await page.waitForURL(/lastconfirm/);
  await page.waitForSelector("#artwork-preview-img", { state: "visible", timeout: 10000 });
  run.checks.s8 = await page.evaluate(() => {
    const de = document.documentElement, b = document.getElementById("btn-submit-artwork").getBoundingClientRect();
    return { scroll: de.scrollHeight - innerHeight, submitVisible: b.bottom <= innerHeight && b.top >= 0, rows: document.querySelectorAll(".s8-row").length, empty: document.querySelectorAll(".s8-row.empty").length };
  });
  const imgInfo = await page.evaluate(async () => {
    const d = localStorage.getItem("artworkImage");
    const img = new Image(); img.src = d; await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight, kb: Math.round(d.length * 0.75 / 1024) };
  });
  run.artworkImage = imgInfo;
  run.checks.s8Hazards = await page.evaluate((src) => [...document.querySelectorAll(".s8-tag")].map(eval(src)), PLAIN.toString());
  await shot(page, run, "S8_confirm");
  step(`S8 確認：災害 ${run.checks.s8Hazards.join("・")}`);
  step(`S8 確認：項目 ${run.checks.s8.rows}（未入力 ${run.checks.s8.empty}）、スクロール ${run.checks.s8.scroll}px、登録ボタンが見える=${run.checks.s8.submitVisible}、画像 ${imgInfo.w}×${imgInfo.h}`);

  // 「直す」→ S7（修正中）→「修正完了」で確認画面にもどる
  await page.locator(".s8-edit").first().click();
  await page.waitForURL(/artwork_submit\.html\?edit=1/);
  run.checks.editLabel = (await page.locator("#nextBtn").innerText()).replace(/\s+/g, "");
  await page.fill("#artworkTitle", `E2Eテスト（${label}）警報が出たら早めに高い場所へ`);
  await page.click("#nextBtn");
  await page.waitForURL(/lastconfirm/);
  run.checks.editBack = (await page.locator(".s8-v-title").innerText()).includes("警報が出たら");
  step(`直す：ボタン「${run.checks.editLabel}」で確認画面にもどった、タイトルが変わった=${run.checks.editBack}`);

  // 作り直し（マーブリング・コラージュ）
  const artNow = () => page.evaluate(() => localStorage.getItem("artworkImage") || "");
  const stampCount = () => page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("ws_art_db", 1);
    r.onsuccess = () => { const g = r.result.transaction("images").objectStore("images").get("collage_stamps"); g.onsuccess = () => res(((g.result || {}).stamps || []).length); };
  }));
  await page.waitForSelector("#artwork-preview-img", { state: "visible", timeout: 10000 });
  const art0 = await artNow();
  await page.click(`[onclick="redoWork('marblingApp')"]`);
  await page.waitForURL(/marbling\/app\/index\.html\?edit=1/);
  await page.waitForTimeout(2000);
  const editUI = await page.evaluate(() => ({ next: (document.getElementById("nextBtn") || {}).textContent || "", back: !!document.getElementById("backBtn"), badge: !!document.querySelector(".ws-edit-badge") }));
  await shot(page, run, "S8c_redo_marbling");
  await paint(1);
  await page.click("#nextBtn");
  await page.waitForURL(/lastconfirm/, { timeout: 20000 });
  await page.waitForSelector("#artwork-preview-img", { state: "visible", timeout: 10000 });
  const art1 = await artNow();
  const stamps1 = await stampCount();
  step(`作り直し（マーブリング）：確認画面にもどった・作品画像 ${art1 !== art0 ? "更新" : "そのまま"}・スタンプ ${stamps1} 個`);
  await page.click(`[onclick="redoWork('collageApp')"]`);
  await page.waitForURL(/collage\/app\/index\.html\?edit=1/);
  await page.waitForTimeout(2000);
  const st2 = await page.frameLocator("iframe[data-ws-work]").locator("#stage").boundingBox();
  await page.frameLocator("iframe[data-ws-work]").locator(".thumb").nth(0).click();
  await page.mouse.click(st2.x + st2.width * 0.5, st2.y + st2.height * 0.7);
  await page.waitForTimeout(800);
  await page.click("#nextBtn");
  await page.waitForURL(/lastconfirm/, { timeout: 20000 });
  await page.waitForSelector("#artwork-preview-img", { state: "visible", timeout: 10000 });
  const art2 = await artNow();
  const stamps2 = await stampCount();
  run.redo = { editUI, marblingUpdated: art1 !== art0, stampsAfterMarblingRedo: stamps1, collageUpdated: art2 !== art1, stampsAfterCollageRedo: stamps2 };
  step(`作り直し（コラージュ）：確認画面にもどった・作品画像 ${art2 !== art1 ? "更新" : "そのまま"}・スタンプ ${stamps2} 個`);

  // 登録
  // 登録すると、作品がこの端末に自動で保存される（保存ボタンはない）
  let downloads = 0;
  page.on("download", () => { downloads++; });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#btn-submit-artwork")]);
  await page.waitForSelector("#step-complete", { state: "visible", timeout: 20000 });
  const id = await page.evaluate(() => localStorage.getItem("lastSubmittedArtworkId"));
  run.submittedId = id;
  run.download = dl.suggestedFilename();
  run.checks.saveButton = await page.locator("#btn-download").count();
  await shot(page, run, "S8b_done");
  step(`S8 登録：id=${id}、端末に自動で保存：${run.download}、保存ボタン ${run.checks.saveButton} 個`);
  // 画面を開き直しても、もう一度は保存しない（二重に保存しない）
  await page.reload();
  await page.waitForSelector("#step-complete", { state: "visible", timeout: 10000 });
  await page.waitForTimeout(1500);
  run.checks.downloads = downloads;
  step(`開き直したあとの保存の回数：${downloads} 回（1回なら二重に保存していない）`);
  const saved = await fetch(`${WORKER}/artworks`).then(r => r.json());
  const mine = saved.features.find(f => f.properties.id === id);
  run.checks.savedFields = mine && { place: mine.properties.place, number: mine.properties.field_25, phase: mine.properties.field_23, body: !!mine.properties.Body, lat: mine.geometry.coordinates[1] };
  step(`保存された値：${JSON.stringify(run.checks.savedFields)}`);

  // S9 防災行動マップ（自分の場所が開く）
  await page.click("#btn-goto-map");
  await page.waitForURL(/present\/index/);
  // はじめて開いたので、マップの使い方（写真つき4枚）が自動で出る
  await page.waitForSelector("#tutorial-overlay", { state: "visible", timeout: 10000 });
  run.checks.guide = [];
  run.checks.guideButtons = await page.locator("#tutorial-overlay .tutorial-footer button").count();
  for (let g = 0; g < 4; g++) {
    await page.waitForTimeout(500);
    run.checks.guide.push(await page.evaluate(() => { const i = document.getElementById("tutorial-img"); return i.complete && i.naturalWidth > 0; }));
    await shot(page, run, `S9a_guide${g + 1}`);
    await page.click("#next-btn");
  }
  run.checks.guideClosed = !(await page.locator("#tutorial-overlay").isVisible());
  step(`マップの使い方：自動で表示、写真 ${run.checks.guide.filter(Boolean).length}/4 枚、最後に閉じた=${run.checks.guideClosed}`);
  await page.waitForSelector(`#card-${id}`, { timeout: 15000 });
  await page.waitForTimeout(1200);
  run.checks.mapPlaceActive = await page.locator(`.place-tab.active[data-place="${placeId}"]`).count() === 1;
  run.checks.placePins = await page.locator(".place-pin").count();
  await shot(page, run, "S9_present");
  step(`S9 マップ：作品 ${id} が ${placeId} の一覧に表示、場所のピン ${run.checks.placePins} 個`);
  await page.fill("#art-search", number);
  await page.waitForTimeout(400);
  run.checks.search = await page.evaluate(([id, num]) => { const cards = [...document.querySelectorAll(".art-card")]; return { count: cards.length, hasMine: cards.some(c => c.id === "card-" + id), allMatch: cards.every(c => (c.querySelector(".art-num") || {}).textContent === num) }; }, [id, number]);
  step(`番号で探す：「${number}」→ ${run.checks.search.count} 件（自分の作品あり=${run.checks.search.hasMine}、全部同じ番号=${run.checks.search.allMatch}）`);
  await page.fill("#art-search", "");
  await page.evaluate(() => document.querySelector('.chip[data-cat="mizu"]').click());
  await page.waitForTimeout(500);
  run.checks.mizuFilter = await page.locator(`#card-${id}`).isVisible();
  await page.evaluate(() => document.querySelector('.chip[data-cat="all"]').click());
  await page.waitForTimeout(300);
  step(`マップの「水害」で絞り込み：自分の作品が出る=${run.checks.mizuFilter}`);
  await page.click(`#card-${id}`);
  await page.waitForURL(/detail\.html/);
  await page.waitForTimeout(1500);
  await shot(page, run, "S9b_detail_tutorial");
  const skip = page.locator("#dt-skip-btn");
  if (await skip.isVisible()) await skip.click();
  await page.waitForTimeout(800);
  run.checks.detail = { number: await page.locator("#art-number").innerText(), body: (await page.locator("#art-body").innerText()).length > 0 };
  run.checks.detailHz = await page.evaluate((src) => {
    const PL = eval(src);
    const note = document.querySelector(".dv-hz-note"), a = note && note.querySelector("a");
    return { tags: [...document.querySelectorAll("#art-hazards .dv-tag")].map(PL), note: !!note, href: a ? a.href : "", target: a ? a.target : "",
             none: !!document.querySelector(".dv-hz-none"), overlayBtn: !!document.querySelector(".dv-hz-chip") };
  }, PLAIN.toString());
  step(`作品ページ：災害 ${run.checks.detailHz.tags.join("・")}、内水氾濫の注記=${run.checks.detailHz.note}、重ねるボタン=${run.checks.detailHz.overlayBtn}`);
  await shot(page, run, "S9c_detail");
  step(`作品ページ：番号 ${run.checks.detail.number}、伝えたいこと ${run.checks.detail.body ? "あり" : "なし"}`);

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

// 同じ場所に10件登録して、マップから10件とも開けるか
async function samePlaceTen() {
  const t = { label: "same-place-10", ok: false, opened: 0, ids: [] };
  report.samePlace = t;
  const tag = "E2E同じ場所-" + Date.now();
  const img = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${WORKER}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      secret: "yagami-ws-20261118", lat: 35.55112, lon: 139.65574, imageBase64: img, imageExt: "jpg",
      properties: { field_23: "事前", field_24: "洪水（外水氾濫）", field_25: String(4211 + i), Message: `${tag} #${i + 1}`, Body: "テスト", place: "hiyoshi5" } }) }).then(r => r.json());
    if (r.ok) t.ids.push(r.id);
  }
  const browser = await chromium.launch();
  try {
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: "ja-JP" })).newPage();
  // 手元の Worker を使うように覚えさせる（スタート画面の ?worker= と同じしくみ）
  await page.goto(`${APP}/workshop/start/index.html?worker=${encodeURIComponent(WORKER)}`);
  await page.evaluate(() => localStorage.setItem("has_seen_map_tutorial_rev3", "true"));
  await page.goto(`${APP}/workshop/present/index.html?place=hiyoshi5`);
  await page.waitForSelector(`#card-${t.ids[0]}`, { timeout: 15000 });
  t.listed = await page.locator(".art-card").count();
  await page.screenshot({ path: path.join(OUT, "same_place_10_list.png") });
  for (const id of t.ids) {
    await page.goto(`${APP}/workshop/present/index.html?place=hiyoshi5`);
    await page.waitForSelector(`#card-${id}`, { timeout: 15000 });
    await page.click(`#card-${id}`);
    await page.waitForURL(/detail\.html/);
    await page.waitForFunction(() => document.getElementById("art-title").textContent.length > 1, null, { timeout: 10000 });
    if ((await page.locator("#art-title").innerText()).startsWith(tag)) t.opened++;
  }
  } finally {
  await browser.close();
  for (const id of t.ids) await fetch(`${WORKER}/artworks/${id}`, { method: "DELETE", headers: { Authorization: "Bearer " + ADMIN_KEY } });
  }
  t.ok = t.ids.length === 10 && t.opened === 10;
  console.log(`[同じ場所に10件] 登録 ${t.ids.length} 件、一覧に ${t.listed} 件、マップから開けた作品 ${t.opened} 件 → ${t.ok ? "OK" : "NG"}（テスト作品は削除）`);
}

await flow("landscape", { width: 1180, height: 820 }, "kagami", "4201", ["洪水（外水氾濫）", "内水氾濫"]);
await flow("portrait", { width: 820, height: 1180 }, "yagami", "4228", ["洪水（外水氾濫）", "土砂災害（急傾斜地の崩壊）"]);
await samePlaceTen();

fs.writeFileSync(path.resolve("tools/out/report.json"), JSON.stringify(report, null, 2));
const problems = [];
if (!report.samePlace.ok) problems.push("同じ場所に10件：全部開けない");
for (const r of report.runs) {
  const c = r.checks;
  if (r.errors.length) problems.push(`[${r.label}] JSエラー: ${r.errors.join(" / ")}`);
  if (!r.deleted) problems.push(`[${r.label}] 削除できていない`);
  if (c.s1Places !== 3) problems.push(`[${r.label}] S1 の場所の目印が3つでない`);
  const NAISUI_LABEL = "水が街からあふれる（内水氾濫）";
  const nl = c.naisuiLink || {};
  if (!/mid=65/.test(nl.href || "") || !/mpx=139\.65512/.test(nl.href || "") || nl.target !== "_blank" || nl.head !== "水が街からあふれる" || !nl.desc || nl.rubies < 4) problems.push(`[${r.label}] S1 の内水氾濫の見出し・説明・リンクがおかしい ${JSON.stringify(nl)}`);
  if (r.label === "landscape") {
    if (!/wwwm\.city\.yokohama\.lg\.jp/.test(c.naisuiPopup || "") || !c.naisuiKeepS1) problems.push(`[${r.label}] 内水氾濫のリンクが新しいタブで開かない／もどると入力が消える`);
    if (!(c.s2Saved || []).includes("内水氾濫")) problems.push(`[${r.label}] S2 で内水氾濫が保存されない ${JSON.stringify(c.s2Saved)}`);
    if (!(c.s8Hazards || []).includes(NAISUI_LABEL)) problems.push(`[${r.label}] 確認画面に「${NAISUI_LABEL}」が出ない ${JSON.stringify(c.s8Hazards)}`);
    const d = c.detailHz || {};
    if (!d.tags.includes(NAISUI_LABEL) || !d.note || !/mid=65/.test(d.href) || d.target !== "_blank" || d.none) problems.push(`[${r.label}] 作品ページの内水氾濫の表示・注記がおかしい ${JSON.stringify(d)}`);
  } else {
    const d = c.detailHz || {};
    if (d.note) problems.push(`[${r.label}] 内水氾濫を選んでいないのに注記が出る`);
  }
  if (!c.mizuFilter) problems.push(`[${r.label}] 「水害」で絞り込むと自分の作品が出ない`);
  if (c.s2Buttons !== 3 || c.s2Hazards !== 5) problems.push(`[${r.label}] S2 のボタン・選択肢の数がおかしい`);
  if (!c.resumeOK) problems.push(`[${r.label}] つづきから再開できない`);
  if (r.restore.stampsAfter !== r.restore.stampsBefore) problems.push(`[${r.label}] スタンプが復元されない`);
  if (!c.alpha || !c.alpha.slider || c.alpha.after !== 1 || !(c.alpha.light < 0.4)) problems.push(`[${r.label}] 濃さのレバーが効かない ${JSON.stringify(c.alpha)}`);
  if (c.alphaKept !== 1) problems.push(`[${r.label}] 濃さが保存されない（もどったあと ${c.alphaKept}）`);
  if (!c.badNumberBlocked) problems.push(`[${r.label}] 4けたでない番号で進めてしまう`);
  if (c.numberInputmode !== "numeric") problems.push(`[${r.label}] 番号で数字キーボードが出ない`);
  if (c.s8.scroll > 0 || !c.s8.submitVisible || c.s8.rows !== 6 || c.s8.empty) problems.push(`[${r.label}] S8 が1画面に収まらない／未入力あり ${JSON.stringify(c.s8)}`);
  if (!/修正/.test(c.editLabel) || !c.editBack) problems.push(`[${r.label}] 「直す」から確認画面にもどれない`);
  if (r.redo) {
    if (r.redo.editUI.back || !/修正/.test(r.redo.editUI.next) || !r.redo.editUI.badge) problems.push(`[${r.label}] 修正用の画面のボタンがおかしい ${JSON.stringify(r.redo.editUI)}`);
    if (!r.redo.marblingUpdated) problems.push(`[${r.label}] マーブリングを作り直しても作品画像が変わらない`);
    if (r.redo.stampsAfterMarblingRedo !== r.restore.stampsAfter) problems.push(`[${r.label}] マーブリングの作り直しでスタンプが変わった`);
    if (!r.redo.collageUpdated || r.redo.stampsAfterCollageRedo !== r.redo.stampsAfterMarblingRedo + 1) problems.push(`[${r.label}] コラージュの作り直しが反映されない`);
  }
  const sf = c.savedFields || {};
  if (!sf.body || !/^42\d\d$/.test(sf.number || "") || !sf.place || sf.phase !== "災害時") problems.push(`[${r.label}] 保存された値がおかしい ${JSON.stringify(sf)}`);
  if (!c.guide || c.guide.filter(Boolean).length !== 4 || !c.guideClosed) problems.push(`[${r.label}] マップの使い方の写真が出ない／閉じない ${JSON.stringify(c.guide)}`);
  if (c.saveButton !== 0 || !/^yagami_\d+_42\d\d\.jpg$/.test(r.download || "") || c.downloads !== 1) problems.push(`[${r.label}] 登録したときの自動保存がおかしい（保存ボタン ${c.saveButton}、ファイル ${r.download}、保存 ${c.downloads} 回）`);
  if (c.guideButtons !== 1) problems.push(`[${r.label}] マップの使い方のボタンが ${c.guideButtons} 個（1つにする）`);
  if (!c.mapPlaceActive || c.placePins !== 3) problems.push(`[${r.label}] マップで自分の場所が開かない／ピンが3つでない`);
  if (!c.search.hasMine || !c.search.allMatch) problems.push(`[${r.label}] 番号で探す結果がおかしい ${JSON.stringify(c.search)}`);
  for (const p of r.pages) for (const f of p.frames) {
    if (f.noRuby.length) problems.push(`[${r.label}] ${p.name} ${f.url}: ルビなし ${JSON.stringify(f.noRuby)}`);
    if (f.hOverflow > 0) problems.push(`[${r.label}] ${p.name} ${f.url}: 横にはみ出し ${f.hOverflow}px`);
  }
}
console.log(problems.length ? "\n要確認:\n" + problems.join("\n") : "\n問題なし");
