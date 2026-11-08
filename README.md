# WS支援アプリ 矢上小版（2026/11/18 矢上小学校4年2組 出前授業）

大人向けの WS 支援アプリ（10/18・12/12 の WS 用）を参考に、小学4年生が使えるように作り直した矢上小専用のアプリです。
大人版のリポジトリ・データ・Worker とは一切つながっていません（コピー元として読んだだけです）。

- 公開 URL（GitHub Pages）：https://bo-sci-art.github.io/WSsupportApp_yagami_2026/
- 防災行動マップ（保護者向けカードの QR の行き先）：https://bo-sci-art.github.io/WSsupportApp_yagami_2026/workshop/present/
- 作品の保存先：Cloudflare Worker `yagami-submit`（文章・地点は D1、画像は R2）。準備手順は [docs/cloudflare_setup.md](docs/cloudflare_setup.md)
- 言い換え・ルビの一覧：[docs/wording_changes.md](docs/wording_changes.md)

## 画面の流れ（授業案との対応）

| 画面 | ファイル | 授業案の場面 |
|---|---|---|
| S0 はじめる | `workshop/start/` | 導入①〜⑥（11:00〜）。前の人のデータは「はじめる」を押したときに消す |
| S1 ハザードマップを見る | `workshop/map/app/` | ハザードマップを読む（11:12〜） |
| S2 作品にする場所と災害をえらぶ | `workshop/map/Log/` | 〃 |
| S3 マーブリング | `workshop/marbling/app/`（`mabling-for-kids-2026` を組みこみ） | 災害リスクを表現する（11:22〜） |
| S4 マーブリングの記録 | `workshop/marbling/Log/` | 〃 |
| S5 コラージュ | `workshop/collage/app/` | 防災行動を表現する（11:50〜） |
| S6 コラージュの記録 | `workshop/collage/Log/` | タイトル・メッセージ（12:03〜） |
| S7 タイトルとペンネーム | `workshop/message/artwork/` | 〃 |
| S8 たしかめて登録 | `workshop/message/lastconfirm/` | 〃（マップに投稿・iPad に保存） |
| S9 防災行動マップ | `workshop/present/` | 発表・まとめ（12:08〜） |

ミッション画面と導入スライドは、授業では先生（千葉）が一斉に説明するので使いません。

## 作品が消えないためのしくみ

- マーブリング：「つぎへ」「もどる」で自動保存（描いていなければ上書きしない）。戻ってきたら前の絵を表示し、そこから描き直せる
- コラージュ：スタンプを置く・動かす・消すたびに自動保存（IndexedDB `ws_art_db/images/collage_stamps`）。マーブリングを作り直してもスタンプの配置は残る
- 作品画像（長辺1000px JPEG）は `localStorage.artworkImage` と IndexedDB `artwork_image` の両方に保存。最終確認で見つからないときはマーブリング画像＋スタンプ配置から作り直す
- iPad への保存は、登録のあとに1回だけ（「ファイル」アプリの「ダウンロード」に入る）

## 設定を変える場所

- Worker の URL：`workshop/common/config.js`（`DEFAULT_WORKER`）と `workshop/message/lastconfirm/final_submit_script.js`（`WORKER_URL`）
- 送信用の合言葉：`final_submit_script.js` の `SUBMIT_SECRET`（Worker 側の `SUBMIT_SECRET` と同じ値）
- 地図の初期位置（矢上小学校の周辺 35.5523, 139.6569）：`map/app/detail/script.js`、`map/Log/log_hazard_map_script.js`、`present/script.js` の `YAGAMI_CENTER` / `defaultCenter`

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
node tools/load_test_30.mjs http://127.0.0.1:8787 local-admin-key-for-test
```

`tools/e2e_flow.mjs` は iPad の画面サイズ（横 1180×820・縦 820×1180）で S0→S9 を通しで動かし、全画面のスクリーンショットを `tools/out/screens/` に保存し、ルビのない漢字・横のはみ出し・JS エラーを調べます。テストで登録した作品は最後に DELETE で消します。
