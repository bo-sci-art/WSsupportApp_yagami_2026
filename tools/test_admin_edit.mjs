// 管理画面の「確認・修正」パネルを、手元の Worker・アプリで確かめるテスト（PC 幅と iPad 縦の幅）
//
// 使い方:
//   1) node tools/serve.mjs 5500   と   手元の Worker（cd worker && npm.cmd run dev）を動かす
//   2) node tools/test_admin_edit.mjs [WorkerのURL=http://127.0.0.1:8787] [ADMIN_KEY=local-admin-key-for-test] [--app http://127.0.0.1:5500]
//
// スクリーンショットは tools/out/admin_edit/ に保存する。テストで登録した作品は最後に消す。
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const W = (args[0] && !args[0].startsWith("--") ? args[0] : "http://127.0.0.1:8787").replace(/\/+$/, "");
const KEY = args[1] && !args[1].startsWith("--") ? args[1] : "local-admin-key-for-test";
const APP = (args.includes("--app") ? args[args.indexOf("--app") + 1] : "http://127.0.0.1:5500").replace(/\/+$/, "");
const OUT = path.resolve("tools/out/admin_edit");
fs.mkdirSync(OUT, { recursive: true });
const AUTH = { Authorization: "Bearer " + KEY };
const SECRET = process.env.SUBMIT_SECRET || "yagami-ws-20261118";

let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? "OK  " : "NG  ") + name + (extra !== undefined ? "  → " + extra : "")); if (!cond) fails++; };
const exportOne = async (id) => (await (await fetch(W + "/export", { headers: AUTH })).json()).features.find(f => f.properties.id === String(id));

const browser = await chromium.launch();
const ids = [];
try {
  // テスト用の作品（画像はキャンバスで作る）
  const page0 = await browser.newPage();
  const img = await page0.evaluate(() => { const c = document.createElement("canvas"); c.width = 400; c.height = 300; const x = c.getContext("2d"); x.fillStyle = "#5AC8FA"; x.fillRect(0, 0, 400, 300); x.fillStyle = "#FF2D55"; x.beginPath(); x.arc(200, 150, 80, 0, 7); x.fill(); return c.toDataURL("image/png"); });
  await page0.close();
  for (const [num, place, title] of [["4209", "yagami", "テスト：まちがえた{まちがえた}タイトル"], ["4210", "hiyoshi5", "テスト：そのままの作品"]]) {
    const r = await (await fetch(W + "/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, lat: 35.554, lon: 139.65763, imageBase64: img, imageExt: "png",
      properties: { field_25: num, place, field_23: "事前", field_24: "高潮", Message: title, Body: "大雨{おおあめ}のときは早めに逃げる。" } }) })).json();
    ids.push(r.id);
  }
  const [id, id2] = ids;

  for (const [label, viewport] of [["pc", { width: 1280, height: 800 }], ["ipad", { width: 768, height: 1024 }]]) {
    // 毎回、登録したときの値にもどしてから試す
    await fetch(`${W}/artworks/${id}`, { method: "PUT", headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ field_25: "4209", place: "yagami", field_23: "事前", field_24: "高潮", Message: "テスト：まちがえた{まちがえた}タイトル" }) });
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("dialog", d => { ok(`[${label}] ブラウザの confirm/alert は出さない`, false, d.message()); d.dismiss(); });
    page.on("pageerror", e => ok(`[${label}] JS エラーなし`, false, e.message));
    await page.goto(`${APP}/workshop/present/admin.html?worker=${encodeURIComponent(W)}`);
    await page.fill("#keyInput", KEY);
    await page.click("#loginBtn");
    await page.locator("#listView").waitFor();
    await page.fill("#searchInput", "4209");
    const row = page.locator(`#rows tr[data-id="${id}"]`);
    await row.waitFor();

    // 確認・修正ボタン：行のチェックはつかない
    await row.locator(".btn-edit").click();
    await page.locator("#editOverlay").waitFor();
    ok(`[${label}] 「確認・修正」でパネルが開く`, await page.locator("#editOverlay").isVisible());
    ok(`[${label}] ボタンを押しても行のチェックはつかない`, !(await row.locator("input[type=checkbox]").isChecked()));
    ok(`[${label}] 今の値が入っている`, (await page.inputValue("#efNumber")) === "4209" && (await page.inputValue("#efTitle")) === "テスト：まちがえた{まちがえた}タイトル" && await page.locator('input[name="efPlace"][value="yagami"]').isChecked());
    ok(`[${label}] まだ直していないので「保存する」は押せない`, await page.locator("#editSave").isDisabled());
    await page.screenshot({ path: path.join(OUT, `${label}_01_panel.png`) });

    // やめる（何も直していない）→ そのまま閉じる
    await page.click("#editCancel");
    ok(`[${label}] 直していなければ「やめる」でそのまま閉じる`, await page.locator("#editOverlay").isHidden());

    // 直す
    await row.locator(".btn-edit").click();
    await page.fill("#efNumber", "4236");
    await page.fill("#efTitle", "直したタイトル");
    await page.locator('input[name="efPlace"][value="kagami"]').check();
    await page.locator('input[name="efPhase"][value="災害時"]').check();
    await page.locator('input[name="efHazard"][value="内水氾濫"]').check();
    const changed = await page.locator("#editForm .ef.changed").evaluateAll(els => els.map(e => e.dataset.field));
    ok(`[${label}] 直したところに色がつく`, ["Message", "place", "field_24", "field_23", "field_25"].every(f => changed.includes(f)) && !changed.includes("Body"), changed.join(","));
    const note = await page.locator("#efPlaceNote").innerText();
    ok(`[${label}] 場所を変えると「地図のピンも〇〇に移ります」`, /ピンも.*鏡ヶ淵.*移ります/.test(note.replace(/\s/g, "")), note.replace(/\s+/g, ""));
    await page.screenshot({ path: path.join(OUT, `${label}_02_changed.png`), fullPage: false });

    // 番号がちがうと、やさしいことばで止める
    await page.locator("#editSave").scrollIntoViewIfNeeded();
    ok(`[${label}] 「保存する」までスクロールで届く`, await page.locator("#editSave").isVisible());
    await page.click("#editSave");
    const err = await page.locator("#editError").innerText();
    ok(`[${label}] 番号 4236 →「出席番号は 4201〜4235…」`, /出席番号は 4201〜4235/.test(err), err);
    ok(`[${label}] 番号がちがうときは保存の確認を出さない`, await page.locator("#dlgOverlay").isHidden());
    await page.fill("#efNumber", label === "pc" ? "4219" : "4220");

    // やめる（直している）→ 「保存せずに閉じますか？」→ もどる
    await page.click("#editCancel");
    ok(`[${label}] 直しているときの「やめる」→「保存せずに閉じますか？」`, (await page.locator("#dlgTitle").innerText()) === "保存せずに閉じますか？");
    await page.click("#dlgCancel");
    ok(`[${label}] 「もどる」でパネルに戻り、直した内容は残る`, await page.locator("#editOverlay").isVisible() && (await page.inputValue("#efTitle")) === "直したタイトル");

    // 保存する → 変更前 → 変更後
    await page.click("#editSave");
    await page.locator("#dlgOverlay").waitFor();
    const diff = await page.locator(".dlg-diff tbody tr").allInnerTexts();
    ok(`[${label}] 保存の確認に「変更前 → 変更後」`, diff.length === 5 && diff.some(t => /場所.*矢上小学校.*鏡ヶ淵公園/.test(t.replace(/\s/g, ""))), diff.map(t => t.replace(/\s+/g, " ")).join(" | "));
    await page.screenshot({ path: path.join(OUT, `${label}_03_confirm.png`) });
    await page.click("#dlgOk");
    await page.locator("#resultMsg").filter({ hasText: "保存しました" }).waitFor({ timeout: 10000 });
    ok(`[${label}] 「保存しました」が出て、パネルが閉じる`, await page.locator("#editOverlay").isHidden(), await page.locator("#resultMsg").innerText());

    const f = await exportOne(id);
    const P = f.properties;
    ok(`[${label}] Worker に保存された`, P.field_25 === (label === "pc" ? "4219" : "4220") && P.Message === "直したタイトル" && P.place === "kagami" && P.field_23 === "事前, 災害時" && P.field_24 === "高潮, 内水氾濫",
      [P.field_25, P.Message, P.place, P.field_23, P.field_24].join(" / "));
    ok(`[${label}] 伝えたいこと（ふりがな記法つき）はそのまま`, P.Body === "大雨{おおあめ}のときは早めに逃げる。", P.Body);
    ok(`[${label}] ピンが鏡ヶ淵公園に移った`, f.geometry.coordinates[0] === 139.65512 && f.geometry.coordinates[1] === 35.54543);

    // 一覧：修正済みの印
    await page.fill("#searchInput", "");
    const edited = page.locator(`#rows tr[data-id="${id}"]`);
    ok(`[${label}] 一覧に「修正済み」と最終修正の日時`, await edited.locator(".badge-edited").isVisible() && /\d{4}\/\d\d\/\d\d/.test(await edited.locator(".upd-date").innerText()));
    ok(`[${label}] 直していない作品は「—」`, (await page.locator(`#rows tr[data-id="${id2}"] .c-upd`).innerText()).trim() === "—");
    ok(`[${label}] 一覧のタイトルも新しくなる`, (await page.locator(`#rows tr[data-id="${id}"] .td-title`).innerText()).includes("直したタイトル"));
    await page.screenshot({ path: path.join(OUT, `${label}_04_list.png`) });

    // ふりがな記法のタイトルを直すとき：入力欄ではそのまま見える
    await page.locator(`#rows tr[data-id="${id2}"] .btn-edit`).click();
    ok(`[${label}] 入力欄では {かな} をそのまま編集できる`, (await page.inputValue("#efBody")) === "大雨{おおあめ}のときは早めに逃げる。");
    if (label === "ipad") {
      // iPad 縦：パネルの下まで届く
      await page.locator("#editSave").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, `${label}_05_panel_bottom.png`) });
      const box = await page.locator(".edit-panel").boundingBox();
      ok(`[ipad] パネルが画面の幅に入る`, box.x >= 0 && box.x + box.width <= 768, `${Math.round(box.x)}〜${Math.round(box.x + box.width)}`);
      // 一覧は PC（1280px）向けのままでよい。パネルの中が横にはみ出さないことを確かめる
      const hOver = await page.evaluate(() => { const el = document.querySelector(".edit-panel"); return el.scrollWidth - el.clientWidth; });
      ok(`[ipad] パネルの中が横にはみ出さない`, hOver <= 0, hOver);
    }
    await page.click("#editCancel");

    // 削除・非公開・公開に戻すは今まで通り（行を押すとチェックがつく）
    await page.locator(`#rows tr[data-id="${id2}"] .td-title`).click();
    ok(`[${label}] 行を押すとチェックがつく（今まで通り）`, await page.locator(`#rows tr[data-id="${id2}"] input[type=checkbox]`).isChecked());
    await page.click('.act-btns button[data-op="hide"]');
    await page.click("#confirmOk");
    await page.locator("#resultMsg").filter({ hasText: /^非公開：1件成功・0件失敗$/ }).waitFor({ timeout: 10000 });
    await page.locator(`#rows tr[data-id="${id2}"]`).click();
    await page.click('.act-btns button[data-op="show"]');
    await page.click("#confirmOk");
    await page.locator("#resultMsg").filter({ hasText: /^公開：1件成功・0件失敗$/ }).waitFor({ timeout: 10000 });
    ok(`[${label}] 非公開にする・公開に戻すも動く`, (await exportOne(id2)).properties.status === "approved");
    await ctx.close();
  }

  // 削除（画面から）
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${APP}/workshop/present/admin.html?worker=${encodeURIComponent(W)}`);
  await page.fill("#keyInput", KEY); await page.click("#loginBtn");
  await page.locator("#listView").waitFor();
  for (const i of ids) await page.locator(`#rows tr[data-id="${i}"] input[type=checkbox]`).check();
  await page.click('.act-btns button[data-op="delete"]');
  await page.click("#confirmOk");
  await page.locator("#resultMsg").filter({ hasText: "削除：2件成功・0件失敗" }).waitFor({ timeout: 10000 });
  ok("削除（画面から）も今まで通り", !(await exportOne(ids[0])) && !(await exportOne(ids[1])));
  ids.length = 0;
  await ctx.close();
} finally {
  for (const i of ids) await fetch(`${W}/artworks/${i}`, { method: "DELETE", headers: AUTH });
  await browser.close();
}
console.log(`\nスクリーンショット：${OUT}`);
console.log(fails ? `${fails}件 NG` : "すべて OK");
process.exit(fails ? 1 : 0);
