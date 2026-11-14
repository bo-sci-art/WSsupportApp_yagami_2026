# WS支援アプリ 矢上小版（2026/11/18 矢上小学校4年2組 出前授業）

大人向けの WS 支援アプリ（10/18・12/12 の WS 用）を参考に、小学4年生が使えるように作り直した矢上小専用のアプリです。
大人版のリポジトリ・データ・Worker とは一切つながっていません（コピー元として読んだだけです）。

- 公開 URL（GitHub Pages）：https://bo-sci-art.github.io/WSsupportApp_yagami_2026/
- 防災行動マップ（保護者向けカードの QR の行き先）：https://bo-sci-art.github.io/WSsupportApp_yagami_2026/workshop/present/
- 作品の保存先：Cloudflare Worker `yagami-submit`（文章・地点は D1、画像は R2）。準備手順は [docs/cloudflare_setup.md](docs/cloudflare_setup.md)
- 言い換え・ルビの一覧：[docs/wording_changes.md](docs/wording_changes.md)

## 画面の流れ（授業案 rev3 との対応）

| コマ | 時間 | 授業の内容 | 画面 | ファイル |
|---|---|---|---|---|
| 1コマ目 | 11:00〜11:10 | 導入（作品例を見せてゴールを確認） | （iPad は使わない） | |
| | 11:10〜11:18 | ハザードマップを読む | S0 はじめる → S1 ハザードマップ（3か所に名前つきの目印） → S2 担当の場所（3つのボタン）と読み取ったハザードマップ → 「1コマ目はここまで！」 | `workshop/start/`、`workshop/map/app/`、`workshop/map/Log/log_hazard_map.html`、`workshop/map/Log/break.html` |
| | 11:18〜11:40 | 「いつ・どこへ逃げる？」のインプット、紙に下書き | （iPad は使わない。データはそのまま） | |
| 休み | 11:40〜11:45 | | | |
| 2コマ目 | 11:45〜11:48 | 下書きの確認 | （iPad は使わない） | |
| | 11:48〜12:00 | マーブリング | S0 の「つづきから」 → S3 マーブリング | `workshop/marbling/app/` |
| | 12:00〜12:10 | コラージュ | S5 コラージュ | `workshop/collage/app/` |
| | 12:10〜12:14 | タイトル・伝えたいこと・登録（4分） | S7 タイトル・伝えたいこと・いつの行動か・番号 → S8 確認して登録（1画面） | `workshop/message/artwork/`、`workshop/message/lastconfirm/` |
| | 12:14〜12:20 | 発表（3か所から1人ずつ） | S9 防災行動マップ（前のスクリーンに映す。場所のボタン、または `?place=hiyoshi5`／`kagami`／`yagami`） | `workshop/present/` |
| | 12:20〜12:25 | まとめ | | |

授業のあと、保護者は持ち帰りカードの QR から防災行動マップを開き、番号（例 4201）かタイトルで子どもの作品を探す。

- 場所（3か所）と座標：`workshop/common/places.js`（座標は OpenStreetMap の区画の中心。地理院地図で要確認）
- いつの行動か：保存する値は「事前／災害時／復旧時」のまま、画面は「災害の前／災害のとき／災害のあと」
- 作者は「クラス＋出席番号」の4桁（4201〜4228）。Worker でも確かめる
- 旧授業案のマーブリングの記録（S4）・コラージュの記録（S6）は削除した。D1 の `Mabling`・`collage` 列は空のまま残す
- 「伝えたいこと」は D1 の `Body` 列、場所は `place` 列（hiyoshi5／kagami／yagami）

## 作品が消えないためのしくみ

- 1コマ目と2コマ目のあいだ：今いる画面を `localStorage.wsResumePage` に覚え、スタート画面の「つづきから」で再開する（タブを閉じても・iPad がスリープしても残る）。「さいしょから」は確認してから消す
- マーブリング：「つぎへ」「もどる」で自動保存（描いていなければ上書きしない）。戻ってきたら前の絵を表示し、そこから描き直せる
- コラージュ：スタンプを置く・動かす・消すたびに自動保存（IndexedDB `ws_art_db/images/collage_stamps`）。マーブリングを作り直してもスタンプの配置は残る
- 作品画像（長辺1000px JPEG）は `localStorage.artworkImage` と IndexedDB `artwork_image` の両方に保存。最終確認で見つからないときはマーブリング画像＋スタンプ配置から作り直す
- iPad への保存は、登録のあとに1回だけ（「ファイル」アプリの「ダウンロード」に入る）

## 設定を変える場所

- Worker の URL：`workshop/common/config.js`（`DEFAULT_WORKER`）と `workshop/message/lastconfirm/final_submit_script.js`（`WORKER_URL`）
- 送信用の合言葉：`final_submit_script.js` の `SUBMIT_SECRET`（Worker 側の `SUBMIT_SECRET` と同じ値）
- 地図の初期位置（矢上小学校の周辺 35.5523, 139.6569）：`map/app/detail/script.js`、`map/Log/log_hazard_map_script.js`、`present/script.js` の `YAGAMI_CENTER` / `defaultCenter`

## 作品の管理画面（先生用）

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

## テスト

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
node tools/serve.mjs 5500
```

（別のターミナルで）手元の Worker を動かし、通しテスト・30件同時送信テストを行います。

```bash
node tools/e2e_flow.mjs http://127.0.0.1:8787 local-admin-key-for-test
```

```bash
node tools/load_test_30.mjs http://127.0.0.1:8787 local-admin-key-for-test 28
```

`tools/e2e_flow.mjs` は iPad の画面サイズ（横 1180×820・縦 820×1180）で S0→S9 を通しで動かし、全画面のスクリーンショットを `tools/out/screens/` に保存し、ルビのない漢字・横のはみ出し・JS エラーを調べます。テストで登録した作品は最後に DELETE で消します。

