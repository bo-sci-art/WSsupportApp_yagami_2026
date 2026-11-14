# Cloudflare の準備手順（矢上小版 Worker `yagami-submit`）

千葉さんが手元の PC（Windows・PowerShell または Git Bash）で行う手順です。所要時間は 15〜20 分くらいです。
作るもの：Worker `yagami-submit`、D1 データベース `yagami-artworks`、R2 バケット `yagami-artworks`。
大人版の Worker とリポジトリには一切さわりません。

> 前提：Node.js 18 以上が入っていること（`node -v` で確認）。
>
> **PowerShell で実行するときは、`npm` を `npm.cmd`、`npx` を `npx.cmd` と打ってください**（例：`npx.cmd wrangler login`）。
> PowerShell の設定で `npm` / `npx` がそのままでは動かないためです（Windows の設定は変えなくてよい）。Git Bash ならそのままで動きます。
>
> コマンドを使わずに、Cloudflare のダッシュボード（画面）だけで作ることもできます → 下の「[ダッシュボードで作る場合](#ダッシュボードで作る場合コマンドを使わない)」

---

## ダッシュボードで作る場合（コマンドを使わない）

https://dash.cloudflare.com にログインして、次の順に進めます。

1. **D1**：「ストレージとデータベース」→「D1 SQL データベース」→「作成」。名前は `yagami-artworks`。
   できたデータベースの「コンソール」で、`worker/schema.sql` の `CREATE TABLE …;` と2つの `CREATE INDEX …;` を **1つずつ** 貼りつけて実行する（`--` で始まる説明の行は貼らなくてよい）。「テーブル」に `artworks` が出れば OK。
2. **R2**：「R2 オブジェクトストレージ」→「バケットを作成」。名前は `yagami-artworks`（初めてのときは R2 を有効にする。無料の範囲で使える）。
3. **Worker**：「Workers & Pages」→「作成」→「Worker を作成」（Hello World）。名前は `yagami-submit` にしてデプロイ。
   「コードを編集」で中身を全部消し、`worker/src/index.js` の中身を全部貼りつけてデプロイ。
4. **つなぐ**：`yagami-submit` の「設定」で、次を追加する（名前は大文字・小文字もこのとおりに）。

   | 場所 | 種類 | 名前 | 値・選ぶもの |
   |---|---|---|---|
   | バインディング | D1 データベース | `DB` | `yagami-artworks` |
   | バインディング | R2 バケット | `IMAGES` | `yagami-artworks` |
   | 変数とシークレット | テキスト | `ALLOWED_ORIGINS` | `https://bo-sci-art.github.io` |
   | 変数とシークレット | シークレット | `SUBMIT_SECRET` | `yagami-ws-20261118` |
   | 変数とシークレット | シークレット | `ADMIN_KEY` | 千葉さんだけが知る長い文字列（アプリには書かない） |

5. **確かめる**：Worker の URL のあとに `/artworks` をつけてブラウザで開き、`{"type":"FeatureCollection","features":[]}` と出れば OK。
   URL が `https://yagami-submit.kazuki131214.workers.dev` でなければ、`workshop/common/config.js` の `DEFAULT_WORKER` と `workshop/message/lastconfirm/final_submit_script.js` の `WORKER_URL` を直す。
6. **GitHub Pages**：リポジトリの Settings →「Pages」で Branch を `main`、フォルダを `/ (root)` にして Save。

※ あとで `worker/src/index.js` を直したときは、3 と同じように「コードを編集」で貼りかえてデプロイする。

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

表示された中の `database_id = "xxxxxxxx-...."` の「"」の中の文字（36文字）をコピーし、`worker/wrangler.toml` の

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

の `REPLACE_WITH_D1_DATABASE_ID` を、その値に書きかえて保存します。

> 「wrangler.toml に追加しますか？（Would you like Wrangler to add it on your behalf?）」と聞かれたら `n` と答えます（設定はもう書いてあるので、自分で ID だけ書きかえます）。

続けて、テーブルを作ります（`schema.sql` には授業案 rev3 の列「伝えたいこと（Body）」「場所（place）」も入っています）。

```bash
npx wrangler d1 execute yagami-artworks --remote --file=schema.sql
```

「続けますか？」と聞かれたら `y`。「🚣 ... commands executed successfully」のように出れば OK です。

## 3. R2（作品画像）を作る

```bash
npx wrangler r2 bucket create yagami-artworks
```

> R2 を初めて使うアカウントでは「R2 を有効にしてください」というエラーになります。そのときは Cloudflare のダッシュボード（https://dash.cloudflare.com ）の左のメニューの「R2」を開き、画面の案内にしたがって R2 を有効にしてから、もう一度このコマンドを実行します。有効にするときに支払い方法（クレジットカードなど）の登録を求められることがありますが、無料枠（保存 10GB まで）の範囲なので料金はかかりません（作品30点・画像1枚 0.3MB 以下）。

## 4. デプロイ（Worker を Cloudflare に上げる）

```bash
npx wrangler deploy
```

> 初めて Worker を上げるアカウントでは、「workers.dev のサブドメインを登録しますか？」と聞かれることがあります。`y` と答えて、好きな名前（例：`kazuki131214`）を入れます。この名前が URL の真ん中に入ります。

最後に `https://yagami-submit.〇〇〇.workers.dev` という URL が表示されるので、確認します。

- `https://yagami-submit.kazuki131214.workers.dev` なら、アプリ側の変更はいりません。
- 違う URL だったら、`workshop/common/config.js` の `DEFAULT_WORKER` と、`workshop/message/lastconfirm/final_submit_script.js` の `WORKER_URL` をその URL に直して push します。

## 5. 合言葉（シークレット）を登録する

送信用の合言葉 `SUBMIT_SECRET`（アプリのコードと同じ値にする）：

```bash
npx wrangler secret put SUBMIT_SECRET
```

「Enter a secret value:」と出たら `yagami-ws-20261118` と入力して Enter（入力した文字は画面に出ません）。
（アプリ側の値は `workshop/message/lastconfirm/final_submit_script.js` の `SUBMIT_SECRET`。変えるときは両方そろえる）

管理用の合言葉 `ADMIN_KEY`（作品の削除・書き出しに使う。**アプリには書かない**）：

```bash
npx wrangler secret put ADMIN_KEY
```

だれにも推測されない長い文字列を入力します（パスワードマネージャーで作った32文字など）。この値は千葉さんだけが控えておきます。

合言葉は登録した時点で Worker に反映されます（もう一度デプロイしなくて大丈夫です）。

## 6. 動作確認

ブラウザで次の URL を開きます（最初は作品が0件）。

https://yagami-submit.kazuki131214.workers.dev/artworks

`{"type":"FeatureCollection","features":[]}` と表示されれば OK。PowerShell で確かめるときは `curl` ではなく `curl.exe` を使います。

```bash
curl.exe https://yagami-submit.kazuki131214.workers.dev/artworks
```

28件同時送信テスト（4年2組の人数分。全件登録・直後に表示・場所ごとの件数を確認し、最後にテスト作品を自動で削除）：

```bash
cd C:\Users\kazuk\WSsupportApp_yagami_2026
```

```bash
node tools/load_test_30.mjs https://yagami-submit.kazuki131214.workers.dev <ADMIN_KEY>
```

最後に「結果: OK」と出れば OK です。

アプリを最初から最後まで通すテスト（GitHub Pages の公開後。「つづきから」・同じ場所に10件・S8 が1画面に収まるか、も確かめる。スクリーンショットは `tools/out/screens/` に保存）：

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

## 作品の管理画面（ふだんはこれを使う）

テスト作品やいたずらの作品を、ボタンで消したり、マップから隠したりできます。PC の Chrome か Edge（横幅 1280px 以上）で使います。

- 場所：防災行動マップのヘッダー右にある小さな歯車（⚙）を押す。または `https://bo-sci-art.github.io/WSsupportApp_yagami_2026/workshop/present/admin.html` を開く
- 入り方：合言葉の欄に `ADMIN_KEY` を入れて「入る」を押す。ちがうときは「合言葉がちがいます」と出る
  - 「このPCで覚える」にチェックをつけると、このブラウザに覚えて、次からは入力なしで一覧が開く
  - チェックをつけないと、タブを閉じたら忘れる
- 一覧：非公開の作品もふくめて全件を id の順に出す。非公開の作品はグレーで「非公開」と出る。場所・状態での絞り込みと、出席番号・タイトルでの検索ができる
- 操作：作品のチェックボックス（行のどこを押してもよい）で選び、下の3つのボタンを押す。確認のパネルで選んだ作品を確かめてから「実行する」
  - 削除する：D1 の行と R2 の画像の両方を消す（元に戻せない）
  - 非公開にする：マップと作品ページに出なくなる。データは残る
  - 公開に戻す：マップにもう一度出る
  - 終わると「〇件成功・〇件失敗」が出て、一覧を読み直す
- ログアウト：ヘッダーの「ログアウト（覚えた合言葉を消す）」を押すと、覚えた合言葉を消す。学校など自分のものでない PC で使ったあとは必ず押す
- 合言葉はアプリのコードに書いていません。入れた値は、そのブラウザの中（localStorage か sessionStorage の `yagamiAdminKey`）にだけ入ります

手元の Worker で試すときは `http://127.0.0.1:5500/workshop/present/admin.html?worker=http://127.0.0.1:8787` を開き、合言葉に `local-admin-key-for-test` を入れます。

---

## 運用で使うコマンド

### 授業案 rev3 より前に D1 を作っていた場合

「伝えたいこと」と「場所」の列を足してから、Worker をデプロイし直します（新しく作る場合は不要）。

```bash
npx wrangler d1 execute yagami-artworks --remote --command "ALTER TABLE artworks ADD COLUMN Body TEXT; ALTER TABLE artworks ADD COLUMN place TEXT; CREATE INDEX IF NOT EXISTS idx_artworks_place ON artworks (place, id);"
```

```bash
npx wrangler deploy
```


全作品のバックアップ（GeoJSON をダウンロード。研究用にも）：

```bash
curl.exe -H "Authorization: Bearer <ADMIN_KEY>" -o yagami_artworks.geojson https://yagami-submit.kazuki131214.workers.dev/export
```

テスト作品などを1件消す（**予備の方法**。ふだんは上の管理画面で消す。`<id>` は管理画面の id、またはマップの作品ページの URL `detail.html?id=<id>` の数字）

※ Worker は、番号が 4201〜4228 でない作品、場所が3か所のどれでもない作品を受け付けません（`worker/src/index.js` の `NUMBER_RE`・`PLACES`）。クラスや人数が変わるときはここと `workshop/common/places.js` の `YAGAMI_NUMBER_RE` を直します。：

```bash
curl.exe -X DELETE -H "Authorization: Bearer <ADMIN_KEY>" https://yagami-submit.kazuki131214.workers.dev/artworks/<id>
```

D1 の中身を直接見る：

```bash
npx wrangler d1 execute yagami-artworks --remote --command "SELECT id, place, field_25, Message, status, created_at FROM artworks ORDER BY place, field_25"
```

あとで「運営が確認してから公開」にしたいとき：`worker/src/index.js` の INSERT 文の `'approved'` を `'pending'` にしてデプロイし、公開するときは管理画面の「公開に戻す」を押すか、次を実行します（`GET /artworks` は `status='approved'` の作品だけを返すようにすでになっています）。

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
- 公開・非公開の切り替えは `PATCH /artworks/<id>`（中身は `{"status":"approved"}` か `{"status":"hidden"}`、`Authorization: Bearer <ADMIN_KEY>` が必要）。管理画面はこれを使っています。
