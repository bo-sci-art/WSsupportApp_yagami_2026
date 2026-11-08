# Cloudflare の準備手順（矢上小版 Worker `yagami-submit`）

千葉さんが手元の PC（Windows・PowerShell または Git Bash）で行う手順です。所要時間は 15〜20 分くらいです。
作るもの：Worker `yagami-submit`、D1 データベース `yagami-artworks`、R2 バケット `yagami-artworks`。
大人版の Worker とリポジトリには一切さわりません。

> 前提：Node.js 18 以上が入っていること（`node -v` で確認）。

---

## 0. このリポジトリの worker フォルダに入る

```bash
cd C:\Users\kazuk\WSsupportApp_yagami_2026\worker
```

```bash
npm install
```

## 1. Cloudflare にログイン

```bash
npx wrangler login
```

ブラウザが開くので、大人版の Worker と同じ Cloudflare アカウントで「Allow」を押します。
`npx wrangler whoami` でアカウント名が出れば OK です。

## 2. D1（作品の文章・地点）を作る

```bash
npx wrangler d1 create yagami-artworks
```

表示された中の `database_id = "xxxxxxxx-...."` をコピーし、`worker/wrangler.toml` の

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

を、その値に書きかえて保存します。続けて、テーブルを作ります。

```bash
npx wrangler d1 execute yagami-artworks --remote --file=schema.sql
```

## 3. R2（作品画像）を作る

```bash
npx wrangler r2 bucket create yagami-artworks
```

> R2 を初めて使うアカウントでは、Cloudflare のダッシュボード（R2 のページ）で R2 を有効にするよう求められることがあります。無料枠の範囲で使えます（作品30点・画像1枚 0.3MB 以下）。

## 4. 合言葉（シークレット）を登録する

送信用の合言葉 `SUBMIT_SECRET`（アプリのコードと同じ値にする）：

```bash
npx wrangler secret put SUBMIT_SECRET
```

聞かれたら `yagami-ws-20261118` と入力します。
（アプリ側の値は `workshop/message/lastconfirm/final_submit_script.js` の `SUBMIT_SECRET`。変えるときは両方そろえる）

管理用の合言葉 `ADMIN_KEY`（作品の削除・書き出しに使う。**アプリには書かない**）：

```bash
npx wrangler secret put ADMIN_KEY
```

聞かれたら、だれにも推測されない長い文字列を入力します（パスワードマネージャーで作った32文字など）。この値は千葉さんだけが控えておきます。

## 5. デプロイ

```bash
npx wrangler deploy
```

最後に表示される URL を確認します。

- `https://yagami-submit.kazuki131214.workers.dev` なら、アプリ側の変更はいりません。
- 違う URL だったら、`workshop/common/config.js` の `DEFAULT_WORKER` と、`workshop/message/lastconfirm/final_submit_script.js` の `WORKER_URL` をその URL に直して push します。

## 6. 動作確認

作品一覧（最初は空）：

```bash
curl https://yagami-submit.kazuki131214.workers.dev/artworks
```

`{"type":"FeatureCollection","features":[]}` が返れば OK。

30件同時送信テスト（全件登録・直後に表示を確認し、最後にテスト作品を自動で削除）：

```bash
cd C:\Users\kazuk\WSsupportApp_yagami_2026
```

```bash
node tools/load_test_30.mjs https://yagami-submit.kazuki131214.workers.dev <ADMIN_KEY>
```

最後に「結果: OK」と出れば OK です。

アプリを最初から最後まで通すテスト（GitHub Pages の公開後。スクリーンショットは `tools/out/screens/` に保存）：

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
node tools/e2e_flow.mjs https://yagami-submit.kazuki131214.workers.dev <ADMIN_KEY> --app https://bo-sci-art.github.io/WSsupportApp_yagami_2026
```

---

## 運用で使うコマンド

全作品のバックアップ（GeoJSON をダウンロード。研究用にも）：

```bash
curl -H "Authorization: Bearer <ADMIN_KEY>" -o yagami_artworks.geojson https://yagami-submit.kazuki131214.workers.dev/export
```

テスト作品などを1件消す（`<id>` はマップの作品ページの URL `detail.html?id=<id>` の数字）：

```bash
curl -X DELETE -H "Authorization: Bearer <ADMIN_KEY>" https://yagami-submit.kazuki131214.workers.dev/artworks/<id>
```

D1 の中身を直接見る：

```bash
npx wrangler d1 execute yagami-artworks --remote --command "SELECT id, field_25, Message, status, created_at FROM artworks ORDER BY id"
```

あとで「運営が確認してから公開」にしたいとき：`worker/src/index.js` の INSERT 文の `'approved'` を `'pending'` にしてデプロイし、公開するときに次を実行します（`GET /artworks` は `status='approved'` の作品だけを返すようにすでになっています）。

```bash
npx wrangler d1 execute yagami-artworks --remote --command "UPDATE artworks SET status='approved' WHERE id=<id>"
```

---

## 手元（ローカル）で試すとき

Cloudflare にログインしなくても、手元の PC だけで Worker を動かせます。`worker/.dev.vars` に次の2行を書きます（このファイルは git に入りません）。

```
SUBMIT_SECRET=yagami-ws-20261118
ADMIN_KEY=local-admin-key-for-test
```

```bash
cd C:\Users\kazuk\WSsupportApp_yagami_2026\worker
```

```bash
npm run db:init:local
```

```bash
npm run dev
```

アプリは別のターミナルで `node tools/serve.mjs 5500` を動かし、
`http://127.0.0.1:5500/workshop/start/index.html?worker=http://127.0.0.1:8787` を開くと手元の Worker に送られます
（`?worker=default` を開くと本番の Worker にもどる。localhost 以外の URL は受けつけません）。

## 補足

- `SUBMIT_SECRET` はアプリのコードに書かれるため、ページのソースを見ればだれでも分かります（いたずら投稿は防げません）。今回はこの方式でよいことになっています。
- CORS は `https://bo-sci-art.github.io` と localhost だけを許可しています（`wrangler.toml` の `ALLOWED_ORIGINS`）。
- 画像は推測しにくいランダムなキーで R2 に保存し、`GET /images/<key>` で返します。作品を DELETE すると画像も消えます。
