// workshop/common/places.js（矢上小版・授業案 rev3）
// 作品にする場所は、先生が児童に割り振った3か所のどれか。座標は固定。
// 座標は OpenStreetMap の公園・学校の区画の中心（2026/11/10 千葉が地理院地図で確認する）
//   id    : 保存する値（D1 の place 列）
//   name  : 画面に出す名前（ふりがなは 漢字{かな} の書き方。ruby.js が <ruby> にする）
//   plain : ふりがななしの名前
(function () {
  window.YAGAMI_PLACES = [
    { id: 'hiyoshi5', name: '日吉{ひよし}五丁目{ごちょうめ}公園{こうえん}', plain: '日吉五丁目公園', short: '日吉{ひよし}五丁目{ごちょうめ}公園{こうえん}', lat: 35.55112, lon: 139.65574, color: '#2f80ed' },
    { id: 'kagami',   name: '日吉{ひよし}六丁目{ろくちょうめ}鏡ヶ淵{かがみがふち}公園{こうえん}', plain: '日吉六丁目鏡ヶ淵公園', short: '鏡ヶ淵{かがみがふち}公園{こうえん}', lat: 35.54543, lon: 139.65512, color: '#16a34a' },
    { id: 'yagami',   name: '矢上{やがみ}小学校{しょうがっこう}', plain: '矢上小学校', short: '矢上{やがみ}小学校{しょうがっこう}', lat: 35.55400, lon: 139.65763, color: '#e8590c' }
  ];
  window.yagamiPlace = function (id) {
    for (var i = 0; i < window.YAGAMI_PLACES.length; i++) if (window.YAGAMI_PLACES[i].id === id) return window.YAGAMI_PLACES[i];
    return null;
  };
  // 古いデータ（place が空）でも、座標がいちばん近い場所にまとめる（200m 以内）
  window.yagamiPlaceOf = function (placeId, lat, lon) {
    var p = window.yagamiPlace(placeId);
    if (p) return p;
    if (!isFinite(lat) || !isFinite(lon)) return null;
    var best = null, bd = 1e9;
    window.YAGAMI_PLACES.forEach(function (q) {
      var dy = (q.lat - lat) * 111000, dx = (q.lon - lon) * 91000, d = Math.sqrt(dx * dx + dy * dy);
      if (d < bd) { bd = d; best = q; }
    });
    return bd <= 200 ? best : null;
  };
  // いつの行動か（保存する値は 事前／災害時／復旧時 のまま。画面の言葉は授業のインプットに合わせる）
  window.YAGAMI_PHASES = [
    { value: '事前',   label: '災害{さいがい}の前{まえ}',   desc: '災害{さいがい}が起{お}きる前{まえ}の準備{じゅんび}', key: 'prior' },
    { value: '災害時', label: '災害{さいがい}のとき',      desc: '身{み}を守{まも}る・避難{ひなん}する', key: 'during' },
    { value: '復旧時', label: '災害{さいがい}のあと',      desc: 'くらしを取{と}り戻{もど}す', key: 'recovery' }
  ];
  window.yagamiPhaseLabel = function (v) {
    for (var i = 0; i < window.YAGAMI_PHASES.length; i++) if (window.YAGAMI_PHASES[i].value === v) return window.YAGAMI_PHASES[i].label;
    return v || '';
  };
  // 作者の番号：クラス＋出席番号の4桁（4年2組 → 4201〜4228）
  window.YAGAMI_NUMBER_RE = /^42(0[1-9]|1[0-9]|2[0-8])$/;
  // 地図に3か所が全部入る範囲
  window.yagamiPlacesBounds = function () {
    return window.YAGAMI_PLACES.map(function (p) { return [p.lat, p.lon]; });
  };
})();
