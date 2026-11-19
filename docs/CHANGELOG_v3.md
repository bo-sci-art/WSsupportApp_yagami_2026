# v3 の変更（矢上小の授業のあとのフィードバックを反映）

- もとの状態：git のタグ `v2-after-lesson`（`5306e6a`）
- 依頼：`docs/v3_修正依頼プロンプト.md`
- 「汎用」は、ほかの学校版（箕輪小版など）にもそのまま移すとよい変更。「矢上固有」は、矢上小版だけの変更（移すときは設定を戻す）。
- コミットメッセージの先頭にも【汎用】【矢上固有】を付けている。

| # | 区別 | 変更 | コミット |
|---|---|---|---|
| 1 | 汎用 | コラージュでタップした位置とスタンプの位置がずれる不具合を直す | `f418a9c` |
| 2 | 汎用 | コラージュの途中でマーブリングを直せるようにする | `a0a5b34`・`a7b000f` |
| 3 | 汎用 | 登録したあとに作品の画像を端末に自動で保存する機能を削除する | `e0b3c59` |
| 4 | 矢上固有 | 新しい作品の登録を受け付けないようにする（閲覧専用） | `b2478d3` |

---

## 1.【汎用】コラージュでタップ位置とスタンプの位置がずれる

**なぜ**：授業中、iPad の Safari で、タップした所とスタンプの位置がずれる児童がいた（リロードや「もどる」で直った）。

**原因**（WebKit・Chromium で再現。本番でも同じことが起きるのを確かめた）
- 縦向きで開いてから横向きにすると、キャンバスの内部の大きさ（`width`/`height` 属性）がレイアウトを押し広げ、キャンバスが画面より縦に長く（1899px）なっていた。下のほうは画面の外になり、タップ位置もずれる。リロードすると、そのときの向きで測り直すので直る。
- `resize` / `orientationchange` のときしか大きさを測り直していなかったので、window の大きさが変わらずにレイアウトだけ変わると、見た目と内部の大きさがずれた（タップとスタンプが約38pxずれた）。
- 向きを変えると、置いてあるスタンプが絵の上で動いていた（絵の大きさが変わっても、スタンプの位置を合わせ直していなかった）。

**何を**
- `#stage` を枠いっぱいに重ねる（`position:absolute; inset:0`）。内部の大きさがレイアウトに影響しない。
- `ResizeObserver`・`pageshow`（戻るボタン）・`visualViewport` の resize・`orientationchange`（少し待ってもう一度）で、キャンバスの大きさを合わせ直す（`syncCanvasSize`）。ResizeObserver の中では次の描画のときに合わせ直す（Safari の「ResizeObserver loop」を出さないため）。
- 合わせ直すときは、置いてあるスタンプと「ひとつもどす」の記録を、絵の中の割合で新しい大きさに移す（`remapStamps`）。

**どのファイルを**
- `workshop/collage/app/detail/app.js`、`workshop/collage/app/detail/styles.css`、`workshop/collage/app/detail/index.html`（`?v=`）
- テスト：`tools/test_collage_tap.mjs`（iPad の横向き・縦向きの両方から：開いた直後・中のレイアウトだけ変わったあと・向きを変えたあと・戻るボタンのあと。タップとスタンプの差 0〜1px、向きを変えてもスタンプは絵の同じ所）

## 2.【汎用】コラージュの途中でマーブリングを直せるようにする

**なぜ**：直す機会が確認画面の「作り直す」にしかなく、ほとんど使われなかった。児童が直したくなるのはコラージュを作っている最中。しくみ（マーブリングの復元・スタンプの保存）はできていたが、児童に伝わっていなかった。

**何を**
- `common/nav.js` に、画面ごとに「もどる」の文字を変える `prevLabel` と、別の画面からもどってきたときの案内 `returnNotice`（`{ param, badge, html }`）を足す。`returnNotice` は URL に `param` がついて開いたときだけ、ヘッダーに「✏️ 修正中」と同じ見た目のバッジを、ヘッダーの下に案内を重ねて出す（案内はタップを下の絵に通す）。
- コラージュ：「◀ もどる」を「◀ マーブリングを直{なお}す」にし、行き先に `?from=collage` をつける。
- マーブリング：コラージュからもどってきたら「✏️ 直{なお}しています」と「スタンプは消{き}えないよ。直{なお}したら『つぎへ』でコラージュにもどれるよ」を出す。
- マーブリング：前の絵の復元が終わったら `WS_marblingRestored = true`（テストで使う）。
- 復元した絵がにじまないかを測った：WebKit で、保存 → 復元 → 保存を2往復（「色を動かす」を3秒入れても）して、画素の平均の差 0.00〜0.04（にじまない）。「色を塗る」モードでは流体の計算が止まっていて、色素の拡散（`DENSITY_DISSIPATION`）も 0 のため。

**どのファイルを**
- `workshop/common/nav.js`、`workshop/common/styles.css`（`.ws-return-notice`）、`workshop/collage/app/index.html`、`workshop/marbling/app/index.html`、`workshop/marbling/app/detail/script.js`、各ページの `?v=`
- テスト：`tools/test_marbling_redo.mjs`（2往復しても、直したマーブリングが下地になり、スタンプが全部残る）

## 3.【汎用】登録したあとの端末への自動保存を削除する

**なぜ**：登録できたら作品の画像を端末にダウンロードしていたが、不要になった。

**何を**
- `prepareArtworkFile`・`saveArtworkToDevice`・`artworkFileUrl` と、その呼び出しを消す。`#download-note` と `.s8-download-note` の CSS を消す。
- もう使わない localStorage の `artworkSavedId` を、スタート画面の「消す一覧」から外す。
- マーブリング・コラージュの「つぎへ」「もどる」での自動保存（IndexedDB・localStorage）は残す（項目2で使う）。

**どのファイルを**
- `workshop/message/lastconfirm/final_submit_script.js`・`final_submit.html`・`final_submit_styles.css`、`workshop/start/index.html`、`README.md`
- テスト：`tools/e2e_flow.mjs`（登録してもダウンロードが起きない・保存のボタンもメッセージも出ない）

## 4.【矢上固有】新しい作品の登録を受け付けない（閲覧専用）

**なぜ**：矢上小の授業が終わったため。担任の先生はこのあとも管理画面で作品の情報を直すので、マップと管理画面は使えるままにする。

**何を**
- 画面：`common/config.js` の `var REGISTRATION_OPEN = false;`（1か所）。
  - スタート画面：「防災行動マップを見る」だけを出し、「矢上小学校の授業は終わりました。みんなの作品は、防災行動マップで見られます。」を添える（「はじめる」「つづきから」「さいしょから」は出さない）。
  - 確認画面：URL を直接開いても「登録する」は押せず、「作品の登録の受け付けは終わりました。…」を出す。押しても・関数を直接呼んでも送信しない。Worker が 403 `registration closed` を返したときも同じ案内を出す。
- Worker：`POST /submit` は `REGISTRATION_OPEN` が `"false"` のとき 403 と `{"ok":false,"error":"registration closed","message":"作品の登録の受け付けは終わりました"}`。値がないときは受け付ける（ほかの学校版でそのまま使えるように）。矢上小は `worker/wrangler.toml` の `[vars]` に `REGISTRATION_OPEN = "false"`。
- 一覧（`GET /artworks`）・画像・管理（`/export`・`PUT`・`PATCH`・`DELETE`）は、止めているときも使える。

**ほかの学校版に移すとき**：項目4はそのまま移してよいが、`config.js` と `wrangler.toml` の `REGISTRATION_OPEN` を `true` にしておく（授業のあとに `false` にする）。

**どのファイルを**
- `workshop/common/config.js`、`workshop/start/index.html`、`workshop/message/lastconfirm/final_submit_script.js`、`worker/src/index.js`、`worker/wrangler.toml`、各ページの `?v=`、`README.md`、`docs/cloudflare_setup.md`
- テスト：`tools/test_registration_switch.mjs`（Worker の受付中・停止中の両方で、画面の設定を false・true の両方に差しかえて確かめる。どちらのときもマップと管理画面が使える）。`tools/e2e_flow.mjs` は、テストの中だけ画面の設定を true にして登録までの流れを確かめる。

---

## 本番に出す手順（まだしていない）

main に push すると、GitHub Pages（画面）と Workers Builds（Worker）の両方が新しくなる。

1. push する前に、本番の作品を書き出しておく（管理画面の書き出し、または `docs/cloudflare_setup.md` の `curl.exe ... /export`）
2. main に push する
3. Cloudflare の **Workers & Pages → yagami-submit → Deployments** で、その commit の Build が「Success」になるのを待つ
4. 確かめる：`curl.exe -i -X POST -H "Content-Type: application/json" -d "{}" https://yagami-submit.kazuki131214.workers.dev/submit` が `403` `registration closed` を返す
5. スタート画面が「防災行動マップを見る」だけになり、防災行動マップと管理画面（確認・修正）が使えることを確かめる
6. iPad の Safari で、コラージュ（縦で開いてから横にする）と「マーブリングを直す」を試す（項目1・2は、受け付けを止めているとスタート画面から入れないので、手元の環境で確かめるか、管理用に一時的に受け付けを開く）

## 気づいたこと（今回は直していない）

- `workshop/collage/app/detail/app.js` に、HTML にないボタン（`saveBtn`・`saveWorkBtn`）からダウンロードするコードが残っている（動くことはない）。
- Chromium のテスト環境（ソフトウェア描画）では、最初のマーブリングの保存が失敗することがある（`createImageData` のエラー）。WebKit と既存の e2e では起きない。
- 作品を登録して使うテストの道具（e2e・28件同時送信・修正のテスト・使い方の写真づくり）は、手元の Worker を `--var REGISTRATION_OPEN:true` で動かす必要がある。
