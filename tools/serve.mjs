// 静的ファイルを配信するだけの簡単なサーバー（テスト用。GitHub Pages の代わり）
// 使い方: node tools/serve.mjs [port]   → http://127.0.0.1:5500/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 5500);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".geojson": "application/geo+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".mp4": "video/mp4", ".svg": "image/svg+xml"
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || f.includes(`${path.sep}.git`) || f.includes(`${path.sep}worker${path.sep}`)) {
    res.writeHead(403); return res.end();
  }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} at http://127.0.0.1:${port}/`));
