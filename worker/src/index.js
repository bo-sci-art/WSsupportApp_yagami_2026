// yagami-submit：矢上小版 防災アートの作品登録 Worker
//   作品の文章・地点 → Cloudflare D1（テーブル artworks）
//   作品画像         → Cloudflare R2（バケット yagami-artworks）
//
// エンドポイント
//   POST   /submit          作品の登録（アプリの buildSubmitPayload の形をそのまま受け取る）→ { ok:true, id }
//   GET    /artworks        作品一覧（GeoJSON、項目名は大人版の artworks.geojson と同じ）。キャッシュしない
//   GET    /images/:key     R2 の画像
//   GET    /export          全作品を GeoJSON でダウンロード（ADMIN_KEY が必要）
//   DELETE /artworks/:id    作品を1件削除（画像も消す。ADMIN_KEY が必要）
//
// シークレット（wrangler secret put で登録）
//   SUBMIT_SECRET  アプリが送る合言葉（アプリのコードに書かれるので、だれでも見られる）
//   ADMIN_KEY      管理用の合言葉（アプリには書かない）。Authorization: Bearer <ADMIN_KEY> で送る
//
// 環境変数（wrangler.toml の [vars]）
//   ALLOWED_ORIGINS  CORS を許可するオリジン（カンマ区切り）。localhost / 127.0.0.1 は常に許可

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;          // 画像の上限（1000px JPEG なら 0.3MB 前後）
const MAX_TEXT = { field_23: 100, field_24: 500, field_25: 60, Message: 300, Body: 1000, place: 20, collage: 3000, Mabling: 3000, hazard: 500, target: 200, creationDate: 20 };
// 矢上小版（授業案 rev3）：作者は「クラス＋出席番号」の4桁（4201〜4228）、場所は3か所のどれか
const NUMBER_RE = /^42(0[1-9]|1[0-9]|2[0-8])$/;
const PLACES = ["hiyoshi5", "kagami", "yagami"];
const TEXT_FIELDS = Object.keys(MAX_TEXT);
const IMAGE_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "POST" && (path === "/submit" || path === "/")) return await submit(request, env, cors);
      if (request.method === "GET" && path === "/artworks") return await listArtworks(env, cors, url);
      if (request.method === "GET" && path.startsWith("/images/")) return await getImage(path.slice(8), env, cors);
      if (request.method === "GET" && path === "/export") return await exportAll(request, env, cors, url);
      if (request.method === "DELETE" && path.startsWith("/artworks/")) return await deleteArtwork(request, path.slice(10), env, cors, url);
      if (request.method === "GET" && path === "/") return json({ ok: true, name: "yagami-submit" }, 200, cors);

      return json({ ok: false, error: "not found" }, 404, cors);
    } catch (e) {
      console.error(e && e.stack || e);
      return json({ ok: false, error: "server error" }, 500, cors);
    }
  }
};

// ---------------------------------------------------------------------------
// POST /submit
// ---------------------------------------------------------------------------
async function submit(request, env, cors) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "invalid json" }, 400, cors); }

  if (!env.SUBMIT_SECRET || !safeEqual(String(body.secret || ""), env.SUBMIT_SECRET)) {
    return json({ ok: false, error: "secret mismatch" }, 403, cors);
  }

  const lat = Number(body.lat), lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ ok: false, error: "invalid location" }, 400, cors);
  }

  const props = body.properties && typeof body.properties === "object" ? body.properties : {};
  const fields = {};
  for (const k of TEXT_FIELDS) {
    const v = props[k];
    fields[k] = (v === null || v === undefined) ? null : String(v).slice(0, MAX_TEXT[k]);
  }
  if (!fields.field_25 || !NUMBER_RE.test(fields.field_25)) return json({ ok: false, error: "invalid number" }, 400, cors);
  if (!fields.place || PLACES.indexOf(fields.place) < 0) return json({ ok: false, error: "invalid place" }, 400, cors);
  if (!fields.creationDate) fields.creationDate = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

  // 画像（data URL か base64）
  const img = decodeImage(body.imageBase64, body.imageExt);
  if (img.error) return json({ ok: false, error: img.error }, 400, cors);

  // 1) 画像を R2 に保存（キーは推測しにくいランダムな値）
  const imageKey = crypto.randomUUID() + "." + img.ext;
  await env.IMAGES.put(imageKey, img.bytes, { httpMetadata: { contentType: img.type } });

  // 2) D1 に1行追加（id は D1 が採番するので、同時に登録しても衝突しない）
  let id;
  try {
    const row = await env.DB.prepare(
      `INSERT INTO artworks (lat, lon, field_23, field_24, field_25, Message, collage, Mabling, hazard, target, creationDate, image_key, status, created_at, Body, place)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'approved', ?13, ?14, ?15) RETURNING id`
    ).bind(lat, lon, fields.field_23, fields.field_24, fields.field_25, fields.Message, fields.collage, fields.Mabling,
           fields.hazard, fields.target, fields.creationDate, imageKey, new Date().toISOString(), fields.Body, fields.place).first();
    id = row && row.id;
  } catch (e) {
    await env.IMAGES.delete(imageKey).catch(() => {});   // 画像だけ残らないように
    throw e;
  }

  return json({ ok: true, id: String(id) }, 200, cors);
}

function decodeImage(src, extIn) {
  if (!src || typeof src !== "string") return { error: "image missing" };
  let b64 = src, type = null;
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(src);
  if (m) { type = m[1].toLowerCase(); b64 = m[2]; }
  let ext = String(extIn || "").toLowerCase().replace(/[^a-z]/g, "");
  if (type) ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type] || ext;
  if (!IMAGE_TYPES[ext]) ext = "jpg";
  if (b64.length > MAX_IMAGE_BYTES * 4 / 3 + 4) return { error: "image too large" };
  let bytes;
  try {
    const bin = atob(b64.replace(/\s/g, ""));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (e) { return { error: "invalid image" }; }
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return { error: "invalid image size" };
  return { bytes, ext, type: IMAGE_TYPES[ext] };
}

// ---------------------------------------------------------------------------
// GET /artworks（公開：status='approved' のみ）／ GET /export（管理：全件）
// ---------------------------------------------------------------------------
async function listArtworks(env, cors) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM artworks WHERE status = 'approved' ORDER BY id ASC`
  ).all();
  return json(toGeoJSON(results), 200, { ...cors, "Cache-Control": "no-store" });
}

async function exportAll(request, env, cors, url) {
  if (!isAdmin(request, env, url)) return json({ ok: false, error: "unauthorized" }, 401, cors);
  const { results } = await env.DB.prepare(`SELECT * FROM artworks ORDER BY id ASC`).all();
  const gj = toGeoJSON(results, true);
  const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return new Response(JSON.stringify(gj, null, 2), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/geo+json; charset=utf-8",
      "Content-Disposition": `attachment; filename="yagami_artworks_${stamp}.geojson"`,
      "Cache-Control": "no-store"
    }
  });
}

// 大人版の artworks.geojson と同じ形・同じ項目名
function toGeoJSON(rows, includeAdmin) {
  return {
    type: "FeatureCollection",
    features: (rows || []).map(r => {
      const properties = {
        id: String(r.id),
        field_23: r.field_23,
        field_24: r.field_24,
        field_25: r.field_25,
        Message: r.Message,
        Body: r.Body,
        place: r.place,
        collage: r.collage,
        Mabling: r.Mabling,
        creationDate: r.creationDate,
        images: r.image_key ? ["images/" + r.image_key] : [],
        status: r.status
      };
      if (r.hazard != null) properties.hazard = r.hazard;
      if (r.target != null) properties.target = r.target;
      if (includeAdmin) properties.created_at = r.created_at;
      return { type: "Feature", geometry: { type: "Point", coordinates: [r.lon, r.lat] }, properties };
    })
  };
}

// ---------------------------------------------------------------------------
// GET /images/:key
// ---------------------------------------------------------------------------
async function getImage(key, env, cors) {
  key = decodeURIComponent(key);
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(key)) return json({ ok: false, error: "bad key" }, 400, cors);
  const obj = await env.IMAGES.get(key);
  if (!obj) return json({ ok: false, error: "not found" }, 404, cors);
  const headers = new Headers(cors);
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");   // キーは作品ごとに一意で、中身は変わらない
  return new Response(obj.body, { headers });
}

// ---------------------------------------------------------------------------
// DELETE /artworks/:id
// ---------------------------------------------------------------------------
async function deleteArtwork(request, idStr, env, cors, url) {
  if (!isAdmin(request, env, url)) return json({ ok: false, error: "unauthorized" }, 401, cors);
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "bad id" }, 400, cors);
  const row = await env.DB.prepare(`SELECT image_key FROM artworks WHERE id = ?1`).bind(id).first();
  if (!row) return json({ ok: false, error: "not found" }, 404, cors);
  await env.DB.prepare(`DELETE FROM artworks WHERE id = ?1`).bind(id).run();
  if (row.image_key) await env.IMAGES.delete(row.image_key).catch(() => {});
  return json({ ok: true, id: String(id), deleted: true }, 200, cors);
}

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------
function isAdmin(request, env) {
  if (!env.ADMIN_KEY) return false;
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return !!m && safeEqual(m[1].trim(), env.ADMIN_KEY);
}

function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin && (isLocal || allowed.includes(origin))) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...(headers || {}), "Content-Type": "application/json; charset=utf-8" }
  });
}
