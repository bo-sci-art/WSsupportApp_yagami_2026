-- yagami-submit：作品テーブル（Cloudflare D1）
-- 項目名は大人版の artworks.geojson の properties と同じ
-- status：今は登録時に 'approved' を入れて全件表示する。
--         あとで「運営が確認してから公開」にするときは、登録時を 'pending' にして、
--         GET /artworks が 'approved' だけを返すしくみ（実装済み）をそのまま使う。
CREATE TABLE IF NOT EXISTS artworks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  field_23     TEXT,            -- 防災行動のタイミング（事前／災害時／復旧時、カンマ区切り）
  field_24     TEXT,            -- 見たハザードマップ（カンマ区切り）
  field_25     TEXT,            -- 作者の番号（クラス＋出席番号の4桁 4201〜4228）
  Message      TEXT,            -- 作品タイトル
  Body         TEXT,            -- この作品で伝えたいこと（授業案 rev3）
  place        TEXT,            -- 場所（hiyoshi5 / kagami / yagami）（授業案 rev3）
  collage      TEXT,            -- （使わない：旧授業案のコラージュの説明）
  Mabling      TEXT,            -- （使わない：旧授業案のマーブリングの説明）
  hazard       TEXT,            -- （予備：大人版データとの互換用）
  target       TEXT,            -- （予備：大人版データとの互換用）
  creationDate TEXT,            -- 制作日 YYYY-MM-DD
  image_key    TEXT,            -- R2 の画像キー
  status       TEXT NOT NULL DEFAULT 'approved',
  created_at   TEXT NOT NULL,   -- 登録日時（UTC, ISO 8601）
  extra        TEXT             -- （予備：あとで足す項目を JSON で入れる用）
);

CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks (status, id);
CREATE INDEX IF NOT EXISTS idx_artworks_place ON artworks (place, id);
