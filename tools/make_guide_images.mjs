// 防災行動マップの「使い方」の画像を、実際の画面から作る（workshop/present/guide_0N.jpg）
//
// 使い方：
//   1) node tools/serve.mjs 5500   と   手元の Worker（cd worker && npm.cmd run dev）を動かす
//   2) node tools/make_guide_images.mjs [WorkerのURL] [ADMIN_KEY]
//
// 既存の防災行動マップ（大人版）の作品3件を見本として手元の Worker に登録し、画面を撮って、最後に見本の作品を消す。
// 撮るときに、説明したいところをオレンジの枠と番号で目立たせる。
import { chromium } from "playwright";
import path from "node:path";

const WORKER = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/+$/, "");
const ADMIN_KEY = process.argv[3] || "local-admin-key-for-test";
const APP = "http://localhost:5500";
const OUT = path.resolve("workshop/present");

const PLACES = [
  { id: "hiyoshi5", lat: 35.55112, lon: 139.65574 },
  { id: "kagami", lat: 35.54543, lon: 139.65512 },
  { id: "yagami", lat: 35.55400, lon: 139.65763 }
];
// 見本の作品：既存の防災行動マップ（大人版・10/18 の WS）の作品を、公開されている画像と文章からそのまま使う（読むだけ）
// 作品73「子どもたちと防災！」を中心に、場所ごとに1作品ずつ
const ADULT = "https://bo-sci-art.github.io/WSspportApp_2026/data";
const SAMPLES = [
  { adultId: "73", place: "hiyoshi5", number: "4201", phase: "事前", hazards: "洪水（外水氾濫）, 高潮, 土砂災害（急傾斜地の崩壊）" },
  { adultId: "54", place: "kagami",   number: "4202", phase: "災害時", hazards: "洪水（外水氾濫）" },
  { adultId: "67", place: "yagami",   number: "4203", phase: "災害時", hazards: "洪水（外水氾濫）, 高潮" }
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, locale: "ja-JP" });
const page = await ctx.newPage();
await page.goto(`${APP}/workshop/start/index.html?worker=${encodeURIComponent(WORKER)}`);

const adult = await fetch(ADULT + "/artworks.geojson").then(r => r.json());
const ids = [];
for (const sm of SAMPLES) {
  const ft = adult.features.find(x => String(x.properties.id || x.properties.OBJECTID) === sm.adultId);
  if (!ft) throw new Error("大人版の作品が見つからない: " + sm.adultId);
  const p = ft.properties;
  const buf = Buffer.from(await fetch(ADULT + "/" + p.images[0]).then(r => r.arrayBuffer()));
  const pl = PLACES.find(x => x.id === sm.place);
  const r = await fetch(`${WORKER}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    secret: "yagami-ws-20261118", lat: pl.lat, lon: pl.lon, imageBase64: "data:image/jpeg;base64," + buf.toString("base64"), imageExt: "jpg",
    properties: { field_23: sm.phase, field_24: sm.hazards, field_25: sm.number, Message: p.Message, Body: String(p.collage || p.Mabling || "").replace(/^・/gm, ""), place: sm.place }
  }) }).then(r => r.json());
  if (!r.ok) throw new Error("登録できない: " + JSON.stringify(r));
  ids.push(r.id);
}

try {
// 撮影中は見本の作品だけを見せる（手元で試した作品が写らないように）
await page.route(WORKER + "/artworks", async route => {
  const res = await route.fetch();
  const j = await res.json();
  j.features = j.features.filter(f => ids.includes(String(f.properties.id)));
  await route.fulfill({ response: res, json: j });
});
page.on("console", m => { if (m.type() === "error") console.log("  [console]", m.text()); });
page.on("pageerror", e => console.log("  [pageerror]", e.message));
page.on("dialog", d => { console.log("  [dialog]", d.message()); d.dismiss(); });
// 目立たせる枠（番号つき）を画面に重ねる
async function mark(selectors, opts = {}) {
  await page.evaluate(({ selectors, opts }) => {
    document.querySelectorAll(".guide-mark").forEach(e => e.remove());
    const els = [];
    selectors.forEach(sel => { (opts.all ? [...document.querySelectorAll(sel)] : [document.querySelector(sel)]).forEach(e => { if (e) els.push(e); }); });
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const pad = opts.pad == null ? 6 : opts.pad;
      const box = document.createElement("div");
      box.className = "guide-mark";
      box.style.cssText = `position:fixed;z-index:99999;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border:5px solid #f97316;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,${opts.dim == null ? .35 : opts.dim});pointer-events:none;`;
      document.body.appendChild(box);
      if (opts.finger) {
        const f = document.createElement("div");
        f.className = "guide-mark";
        f.textContent = "👆";
        f.style.cssText = `position:fixed;z-index:100000;left:${r.left + r.width * .55}px;top:${r.top + r.height * .45}px;font-size:64px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));pointer-events:none;`;
        document.body.appendChild(f);
      }
    });
    // 1つ目以外の枠の暗い影は重ならないように消す
    document.querySelectorAll(".guide-mark").forEach((e, i) => { if (i > 0 && e.textContent !== "👆") e.style.boxShadow = "none"; });
  }, { selectors, opts });
  await page.waitForTimeout(200);
}

await page.goto(`${APP}/workshop/present/index.html`);
await page.evaluate(() => { localStorage.setItem("has_seen_map_tutorial_rev3", "true"); });
await page.goto(`${APP}/workshop/present/index.html`);
await page.waitForSelector(".art-card", { timeout: 15000 });
await page.waitForTimeout(2500);

// 1：地図のピン（場所の名前と作品の数）
await mark([".place-pin .pp-box"], { pad: 6, dim: 0, all: true });
await page.screenshot({ path: path.join(OUT, "guide_01.jpg"), type: "jpeg", quality: 82 });

// 2：場所のボタンと、番号・タイトルで探す
await mark(["#sidebar-places"], { pad: 4 });
await page.screenshot({ path: path.join(OUT, "guide_02.jpg"), type: "jpeg", quality: 82 });

// 3：左の一覧の作品をタップ
await page.click('.place-tab[data-place="hiyoshi5"]');
await page.waitForTimeout(1500);
await mark(["#art-list-container .art-card"], { pad: 4, finger: true });
await page.screenshot({ path: path.join(OUT, "guide_03.jpg"), type: "jpeg", quality: 82 });

// 4：作品のページ
await page.evaluate(() => document.querySelectorAll(".guide-mark").forEach(e => e.remove()));
await page.evaluate(() => { localStorage.setItem("has_seen_detail_tutorial_rev3", "true"); });
await page.click("#art-list-container .art-card");
await page.waitForURL(/detail\.html/);
await page.waitForFunction(() => document.getElementById("art-title").textContent.length > 3, null, { timeout: 15000 });
await page.waitForTimeout(2000);
await mark([".dv-info"], { pad: 2, dim: .15 });
await page.screenshot({ path: path.join(OUT, "guide_04.jpg"), type: "jpeg", quality: 82 });

} finally {
await browser.close();
for (const id of ids) await fetch(`${WORKER}/artworks/${id}`, { method: "DELETE", headers: { Authorization: "Bearer " + ADMIN_KEY } });
}
console.log(`使い方の画像を作りました（guide_01〜04.jpg）。見本の作品 ${ids.length} 件は削除しました。`);
