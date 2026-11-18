// 作品の修正（PUT /artworks/:id）を手元の Worker で確かめるテスト
//
// 使い方（Node.js 18 以上）:
//   node tools/test_edit_api.mjs [WorkerのURL=http://127.0.0.1:8787] [ADMIN_KEY=local-admin-key-for-test]
//
// テストで登録した作品は、最後に DELETE で消す。本番の Worker では使わない（作品を登録して直すため）。
const BASE = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/+$/, "");
const KEY = process.argv[3] || "local-admin-key-for-test";
const SECRET = process.env.SUBMIT_SECRET || "yagami-ws-20261118";
const AUTH = { Authorization: "Bearer " + KEY };
const PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? "OK  " : "NG  ") + name + (extra !== undefined ? "  → " + extra : "")); if (!cond) fails++; };
const put = (id, body, headers = AUTH) => fetch(`${BASE}/artworks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const exportAll = async () => (await (await fetch(BASE + "/export", { headers: AUTH })).json()).features;
const findExport = async (id) => (await exportAll()).find(f => f.properties.id === String(id));
const findPublic = async (id) => (await (await fetch(BASE + "/artworks")).json()).features.find(f => f.properties.id === String(id));

const ids = [];
async function submit(props) {
  const r = await (await fetch(BASE + "/submit", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: SECRET, lat: 35.554, lon: 139.65763, imageBase64: PX, imageExt: "png",
      properties: { field_25: "4201", place: "yagami", field_23: "事前", field_24: "高潮", Message: "修正テスト", Body: "もとの文", ...props } }) })).json();
  ids.push(r.id);
  return r.id;
}

try {
  const id = await submit({});
  const before = await findExport(id);
  ok("テスト作品を登録", !!before, "id " + id);

  // 1. 合言葉
  let r = await put(id, { Message: "x" }, {});
  ok("1. 合言葉なし → 401", r.status === 401, r.status);
  r = await put(id, { Message: "x" }, { Authorization: "Bearer wrong-key" });
  ok("1. 合言葉ちがい → 401", r.status === 401, r.status);
  r = await put(id, { Message: "直したタイトル{なお}" });
  let j = await r.json();
  ok("1. 正しい合言葉 → 200・直した作品が返る", r.status === 200 && j.ok && j.properties.Message === "直したタイトル{なお}", JSON.stringify(j.properties && j.properties.Message));

  // 2. 入力チェック
  const bad = async (name, body, code) => { const r = await put(id, body); const j = await r.json().catch(() => ({})); ok("2. " + name + " → 400 " + code, r.status === 400 && j.error === code, r.status + " " + j.error); };
  await bad("番号 4236", { field_25: "4236" }, "invalid number");
  await bad("番号 4200", { field_25: "4200" }, "invalid number");
  await bad("番号 文字", { field_25: "abcd" }, "invalid number");
  await bad("場所 ちがう", { place: "tokyo" }, "invalid place");
  await bad("いつの行動 ちがう", { field_23: "事前, あした" }, "invalid phase");
  await bad("ハザードマップ ちがう", { field_24: ["高潮", "津波"] }, "invalid hazard");
  await bad("タイトル 長すぎ", { Message: "あ".repeat(301) }, "too long");
  await bad("直す項目なし", { image_key: "x", status: "hidden" }, "nothing to update");
  await bad("JSON でない", "xx", "invalid json");
  r = await put(999999, { Message: "x" });
  ok("2. ない id → 404", r.status === 404, r.status);

  // 3. 場所を変えると座標も変わる
  r = await put(id, { place: "kagami", field_23: ["事前", "災害時"], field_24: "洪水（外水氾濫）, 内水氾濫", field_25: "4235", Body: "直した文" });
  j = await r.json();
  const pub = await findPublic(id);
  const c = pub && pub.geometry.coordinates;
  ok("3. 場所 kagami → 座標が鏡ヶ淵公園に", j.ok && c && c[0] === 139.65512 && c[1] === 35.54543, JSON.stringify(c));
  ok("3. いつの行動を2つ・ハザードマップを2つ保存", pub.properties.field_23 === "事前, 災害時" && pub.properties.field_24 === "洪水（外水氾濫）, 内水氾濫", pub.properties.field_23 + " / " + pub.properties.field_24);
  ok("3. 番号 4235・伝えたいことを保存", pub.properties.field_25 === "4235" && pub.properties.Body === "直した文");

  // 4. 画像と status は変わらない
  const after = await findExport(id);
  ok("4. 画像が変わらない", JSON.stringify(after.properties.images) === JSON.stringify(before.properties.images), after.properties.images[0]);
  ok("4. status が変わらない", after.properties.status === before.properties.status, after.properties.status);
  ok("4. 登録日時が変わらない", after.properties.created_at === before.properties.created_at);
  ok("4. 画像がまだ見られる", (await fetch(BASE + "/" + after.properties.images[0])).status === 200);

  // 5. updated_at
  ok("5. /export に updated_at", /^\d{4}-\d\d-\d\dT/.test(after.properties.updated_at || ""), after.properties.updated_at);
  ok("5. 公開の /artworks には updated_at を出さない", !("updated_at" in pub.properties));

  // 6. 既存の操作
  r = await fetch(`${BASE}/artworks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...AUTH }, body: JSON.stringify({ status: "hidden" }) });
  ok("6. 非公開にする（PATCH）", r.status === 200 && !(await findPublic(id)));
  r = await put(id, { Message: "非公開のまま直す" });
  ok("6. 非公開の作品も直せる・非公開のまま", r.status === 200 && (await findExport(id)).properties.status === "hidden" && !(await findPublic(id)));
  r = await fetch(`${BASE}/artworks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...AUTH }, body: JSON.stringify({ status: "approved" }) });
  ok("6. 公開に戻す（PATCH）", r.status === 200 && !!(await findPublic(id)));
  const imgUrl = BASE + "/" + after.properties.images[0];
  r = await fetch(`${BASE}/artworks/${id}`, { method: "DELETE", headers: AUTH });
  ok("6. 削除（DELETE）→ D1 の行と R2 の画像が消える", r.status === 200 && !(await findExport(id)) && (await fetch(imgUrl)).status === 404);
  ids.splice(ids.indexOf(id), 1);

  // CORS
  r = await fetch(`${BASE}/artworks/1`, { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:5500", "Access-Control-Request-Method": "PUT" } });
  ok("CORS に PUT", /PUT/.test(r.headers.get("access-control-allow-methods") || ""), r.headers.get("access-control-allow-methods"));

  // extra にほかの項目が入っていても残る（D1 を直接さわれないので、2回直して updated_at が上書きされることだけ確かめる）
  const id2 = await submit({ Message: "2回目" });
  await put(id2, { Message: "1回目の修正" });
  const t1 = (await findExport(id2)).properties.updated_at;
  await new Promise(r => setTimeout(r, 20));
  await put(id2, { Message: "2回目の修正" });
  const t2 = (await findExport(id2)).properties.updated_at;
  ok("5. 直すたびに updated_at が新しくなる", t1 && t2 && t2 > t1, t1 + " → " + t2);
} finally {
  for (const id of ids) await fetch(`${BASE}/artworks/${id}`, { method: "DELETE", headers: AUTH });
  console.log(`後片付け：テスト作品 ${ids.length} 件を削除`);
}
console.log(fails ? `\n${fails}件 NG` : "\nすべて OK");
process.exit(fails ? 1 : 0);
