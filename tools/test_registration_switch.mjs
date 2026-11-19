// 作品の受け付けを止める・再開する（v3 項目4）を確かめるテスト
//
// 使い方（手元の Worker とアプリを動かしてから）:
//   受け付けを止めた Worker（wrangler.toml のまま）：
//     node tools/test_registration_switch.mjs http://127.0.0.1:8787 local-admin-key-for-test --worker closed [--app http://127.0.0.1:5500]
//   受け付けている Worker（cd worker && npx.cmd wrangler dev --local --var REGISTRATION_OPEN:true）：
//     node tools/test_registration_switch.mjs http://127.0.0.1:8787 local-admin-key-for-test --worker open [--app http://127.0.0.1:5500]
//
// 画面の設定（config.js の REGISTRATION_OPEN）は、テストの中で false と true の両方に差しかえて確かめる。
// どちらのときも、防災行動マップと管理画面（一覧・確認と修正・並び順）が使えることも確かめる。
// テストで登録した作品は最後に消す。スクリーンショットは tools/out/registration/ に保存する。
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const W = (args[0] && !args[0].startsWith("--") ? args[0] : "http://127.0.0.1:8787").replace(/\/+$/, "");
const KEY = args[1] && !args[1].startsWith("--") ? args[1] : "local-admin-key-for-test";
const APP = opt("--app", "http://127.0.0.1:5500").replace(/\/+$/, "");
const WORKER_OPEN = opt("--worker", "closed") === "open";
const OUT = path.resolve("tools/out/registration");
fs.mkdirSync(OUT, { recursive: true });
const AUTH = { Authorization: "Bearer " + KEY };
const SECRET = process.env.SUBMIT_SECRET || "yagami-ws-20261118";
const PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? "OK  " : "NG  ") + name + (extra !== undefined ? "  → " + extra : "")); if (!cond) fails++; };
const made = [];
const tag = `[Worker ${WORKER_OPEN ? "受付中" : "停止中"}]`;

// ---- Worker ----
const sub = await fetch(W + "/submit", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ secret: SECRET, lat: 35.554, lon: 139.65763, imageBase64: PX, imageExt: "png", properties: { field_25: "4230", place: "yagami", Message: "受付テスト" } }) });
const subJ = await sub.json().catch(() => ({}));
if (WORKER_OPEN) { ok(`${tag} POST /submit を受け付ける`, sub.status === 200 && subJ.ok, sub.status); if (subJ.id) made.push(subJ.id); }
else ok(`${tag} POST /submit を 403 registration closed で断る`, sub.status === 403 && subJ.error === "registration closed" && /終わりました/.test(subJ.message || ""), sub.status + " " + JSON.stringify(subJ));
const list = await (await fetch(W + "/artworks")).json();
ok(`${tag} GET /artworks（マップの一覧）は使える`, Array.isArray(list.features) && list.features.length > 0, list.features.length + "件");
const target = list.features[0].properties;   // 管理画面で直す作品（あとで元にもどす）
const ex = await fetch(W + "/export", { headers: AUTH });
ok(`${tag} GET /export（管理の一覧）は使える`, ex.status === 200);

// ---- 画面（config.js の REGISTRATION_OPEN を差しかえる） ----
const browser = await chromium.launch();
for (const screenOpen of [false, true]) {
  const st = `${tag}[画面 ${screenOpen ? "true" : "false"}]`;
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.route(/\/workshop\/common\/config\.js/, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/var REGISTRATION_OPEN = (true|false);/, `var REGISTRATION_OPEN = ${screenOpen};`);
    await route.fulfill({ response: res, body });
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => ok(`${st} JS エラーなし`, false, e.message));
  page.on("dialog", d => d.accept());
  let submits = 0;
  page.on("request", r => { if (r.method() === "POST" && /\/submit$/.test(r.url())) submits++; });
  const plain = (sel) => page.locator(sel).evaluate(el => { const c = el.cloneNode(true); c.querySelectorAll("rt").forEach(r => r.remove()); return c.textContent.replace(/\s+/g, ""); });

  // スタート画面（途中のデータがある状態でも）
  await page.goto(`${APP}/workshop/start/index.html?worker=${encodeURIComponent(W)}`);
  await page.evaluate(() => localStorage.setItem("wsResumePage", "collage/app/index.html"));
  await page.reload();
  await page.waitForTimeout(500);
  const vis = async (id) => page.locator("#" + id).isVisible();
  if (!screenOpen) {
    ok(`${st} スタート画面は「防災行動マップを見る」だけ`, await vis("closedMapBtn") && !(await vis("startBtn")) && !(await vis("resumeBtn")) && !(await vis("restartBtn")) && !(await vis("nextPersonBtn")));
    const lead = await plain("#viewClosed .lead");
    ok(`${st} 授業が終わったことがわかる一文（ふりがなつき）`, /授業は終わりました/.test(lead) && (await page.locator("#viewClosed .lead ruby").count()) >= 3, lead);
    await page.screenshot({ path: path.join(OUT, `start_closed.png`) });
    await page.click("#closedMapBtn");
    await page.waitForURL(/workshop\/present\/index\.html/);
    ok(`${st} 「防災行動マップを見る」でマップが開く`, true);
  } else {
    ok(`${st} スタート画面は今までどおり（つづきから・さいしょから）`, await vis("resumeBtn") && await vis("restartBtn") && !(await vis("closedMapBtn")));
  }

  // 確認画面を URL で直接開く（必要なデータを入れて）
  await page.goto(`${APP}/workshop/start/index.html`);
  await page.evaluate(([px]) => {
    localStorage.removeItem("lastSubmittedArtworkId");
    localStorage.setItem("hazardMapLog", JSON.stringify({ hazards: ["高潮"], location: { lat: 35.554, lon: 139.65763, place: "yagami", name: "矢上小学校" } }));
    localStorage.setItem("artworkSubmit", JSON.stringify({ title: "受付テスト", body: "テスト", phase: "事前", number: "4231" }));
    localStorage.setItem("artworkImage", px);
  }, [PX]);
  await page.goto(`${APP}/workshop/message/lastconfirm/final_submit.html`);
  await page.waitForTimeout(1200);
  const btn = page.locator("#btn-submit-artwork");
  if (!screenOpen) {
    ok(`${st} 確認画面の「登録する」は押せない`, await btn.isDisabled(), await plain("#btn-submit-artwork"));
    ok(`${st} 受け付けが終わったことを出す`, /受け付けは終わりました/.test(await plain("#submit-status")), await plain("#submit-status"));
    await btn.click({ force: true }).catch(() => {});
    await page.evaluate(() => typeof submitArtwork === "function" && submitArtwork());
    await page.waitForTimeout(800);
    ok(`${st} 押しても（関数を直接呼んでも）送信しない`, submits === 0, submits + "回");
    await page.screenshot({ path: path.join(OUT, `confirm_closed.png`) });
  } else {
    ok(`${st} 確認画面の「登録する」は押せる`, await btn.isEnabled());
    await btn.click();
    await page.waitForTimeout(2500);
    if (WORKER_OPEN) {
      const id = await page.evaluate(() => localStorage.getItem("lastSubmittedArtworkId"));
      ok(`${st} 登録できる（今までどおり）`, !!id && await page.locator("#step-complete").isVisible(), "id " + id);
      if (id) made.push(id);
    } else {
      ok(`${st} Worker が止めているときは、受け付けが終わったことを出す`, /受け付けは終わりました/.test(await plain("#submit-status")), await plain("#submit-status"));
      await page.screenshot({ path: path.join(OUT, `confirm_open_worker_closed.png`) });
    }
  }

  // 防災行動マップ
  await page.goto(`${APP}/workshop/present/index.html`);
  await page.evaluate(() => localStorage.setItem("has_seen_map_tutorial_rev3", "true"));
  await page.reload();
  await page.locator(".art-card").first().waitFor({ timeout: 15000 });
  ok(`${st} 防災行動マップに作品が出る`, (await page.locator(".art-card").count()) > 0, (await page.locator(".art-card").count()) + "件");

  // 管理画面：一覧・並び順・確認と修正（直してから元にもどす）
  await page.goto(`${APP}/workshop/present/admin.html`);
  await page.fill("#keyInput", KEY); await page.click("#loginBtn");
  await page.locator("#listView").waitFor();
  await page.selectOption("#sortOrder", "number");
  ok(`${st} 管理画面の一覧・並び順が使える`, (await page.locator("#rows tr").count()) > 0);
  await page.locator(`#rows tr[data-id="${target.id}"] .btn-edit`).click();
  await page.fill("#efTitle", target.Message + "（受付テスト）");
  await page.click("#editSave"); await page.click("#dlgOk");
  await page.locator("#resultMsg").filter({ hasText: "保存しました" }).waitFor({ timeout: 10000 }).catch(() => {});
  const after = (await (await fetch(W + "/export", { headers: AUTH })).json()).features.find(f => f.properties.id === target.id);
  ok(`${st} 管理画面の確認・修正が使える`, after && after.properties.Message === target.Message + "（受付テスト）");
  await fetch(`${W}/artworks/${target.id}`, { method: "PUT", headers: { ...AUTH, "Content-Type": "application/json" }, body: JSON.stringify({ Message: target.Message }) });
  await ctx.close();
}
await browser.close();
for (const id of made) await fetch(`${W}/artworks/${id}`, { method: "DELETE", headers: AUTH });
console.log(`後片付け：テストで登録した作品 ${made.length} 件を削除（直したタイトルは元にもどした）`);
console.log(fails ? `\n${fails}件 NG` : "\nすべて OK");
process.exit(fails ? 1 : 0);
