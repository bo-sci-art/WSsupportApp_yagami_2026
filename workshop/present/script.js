/* =========================================================
   防災行動マップ（present） Leaflet + 国土地理院版
   - ArcGIS / Survey123 を廃止し、data/artworks.geojson を読む
   - UI・挙動は既存のまま。地図エンジンとハザード重ねのみ差し替え
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const escHtml = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

  // Leaflet未読込ガード（診断用）
  if (typeof L === "undefined") {
    const v = document.getElementById("viewDiv");
    if (v) v.innerHTML = '<div style="padding:24px;color:#c0503a;font-weight:bold;">地図ライブラリ(Leaflet)を読み込めませんでした。leaflet.js が同じフォルダにあるか確認してください。</div>';
    return;
  }

  // 矢上小版：作品は Worker（yagami-submit）の GET /artworks、画像は GET /images/:key から読む
  //   images[0] は "images/<key>" なので、DATA_BASE + "/" + images[0] がそのまま画像の URL になる
  const DATA_BASE = (window.YAGAMI_CONFIG && window.YAGAMI_CONFIG.WORKER_URL) || "https://yagami-submit.kazuki131214.workers.dev";
  const YAGAMI_CENTER = [35.5523, 139.6569];   // 矢上小学校の周辺
  const HIDDEN_IDS = [];   // 非表示にしたい作品idを入れる（取り下げ用の安全弁）

  /* ---------- 1. 地図（国土地理院タイル） ---------- */
  const bases = {
    white: L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {maxZoom:18, attribution:"地理院タイル（淡色地図）"}),
    sat:   L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", {maxZoom:18, attribution:"地理院タイル（写真）"})
  };
  const map = L.map("viewDiv", { center:YAGAMI_CENTER, zoom:16, layers:[bases.white], zoomControl:true });
  L.control.scale({imperial:false}).addTo(map);
  let curBase = bases.white;
  function setBase(k){
    map.removeLayer(curBase);
    curBase = (k === "sat") ? bases.sat : bases.white;
    curBase.addTo(map); curBase.bringToBack();
    document.getElementById("white-map-btn").classList.toggle("active", k === "white");
    document.getElementById("satellite-btn").classList.toggle("active", k === "sat");
  }
  document.getElementById("white-map-btn").onclick = () => setBase("white");
  document.getElementById("satellite-btn").onclick = () => setBase("sat");

  /* ---------- 2. ハザードタイル（国土地理院／map/app/detail から流用） ---------- */
  const HZ = "https://disaportaldata.gsi.go.jp/raster/";
  const hazards = {
    flood_l2: { layer:L.tileLayer(HZ+"01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png",{maxZoom:17,opacity:.7,attribution:"重ねるハザードマップ（国土地理院）"}),
      name:"洪水{こうずい}（外水氾濫{がいすいはんらん}）", legend:"shinsui",
      desc:"・想定{そうてい}最大{さいだい}規模{きぼ}の大雨{おおあめ}により、川{かわ}の水{みず}が堤防{ていぼう}を越{こ}えてまちへ流{なが}れ込{こ}む浸水{しんすい}です。<br>・発生{はっせい}しえるもっとも深{ふか}い場合{ばあい}を示{しめ}しています。<br>・「水{みず}が街{まち}からあふれる（内水氾濫{ないすいはんらん}）」とは、起{お}きる原因{げんいん}がちがいます。" },
    hightide: { layer:L.tileLayer(HZ+"03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png",{maxZoom:17,opacity:.7,attribution:"重ねるハザードマップ（国土地理院）"}),
      name:"高潮{たかしお}", legend:"shinsui",
      desc:"・台風{たいふう}などによる気圧{きあつ}低下{ていか}と強風{きょうふう}で海面{かいめん}が上昇{じょうしょう}し、海水{かいすい}が陸{りく}へ流{なが}れ込{こ}む浸水{しんすい}です。" },
    kyukei: { layer:L.tileLayer(HZ+"05_kyukeishakeikaikuiki/{z}/{x}/{y}.png",{maxZoom:17,opacity:.7,attribution:"重ねるハザードマップ（国土地理院）"}),
      name:"土砂{どしゃ}災害{さいがい}（急傾斜地{きゅうけいしゃち}の崩壊{ほうかい}）", legend:"dosha",
      desc:"大雨{おおあめ}や地震{じしん}でがけ（傾斜{けいしゃ}30度{ど}以上{いじょう}・高{たか}さ5m以上{いじょう}の急{きゅう}斜面{しゃめん}）が崩{くず}れ落{お}ち、生命{せいめい}や身体{しんたい}に危害{きがい}が生{しょう}じるおそれがある区域{くいき}です。" }
  };
/* ===== 浸水深の目安ピクトグラム（凡例の右に表示） =====
     数値はここで調整できます（単位 m） */
  const DEPTH_GUIDE = { maxM: 8, adultM: 1.7, childM: 1.2, eaveM: 5.0, houseM: 7.0 };
  function depthGuideSVG(){
    const g = DEPTH_GUIDE, W = 116, H = 210, top = 22, bottom = 14;
    const ground = H - bottom, ppm = (ground - top) / g.maxM, y = m => ground - m * ppm;
    // 凡例と同じ色（国土地理院 浸水深の新凡例）
    const bands = [[0,.3,"#FFFFB3"],[.3,.5,"#F7F5A9"],[.5,1,"#F8E1A6"],[1,3,"#FFD8C0"],[3,5,"#FFB7B7"],[5,g.maxM,"#FF9191"]];
    const ink = "#4A4A4A";
    let s = '<svg class="depth-guide" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="浸水深の目安（人と家の高さ）" font-family="sans-serif">';
    bands.forEach(b => { s += '<rect x="22" y="'+y(b[1])+'" width="'+(W-22)+'" height="'+(y(b[0])-y(b[1]))+'" fill="'+b[2]+'"/>'; });
    // 目盛り（表の区切りと同じ値）
    [[.5,"0.5m"],[3,"3m"],[5,"5m"]].forEach(t => {
      s += '<line x1="20" x2="'+W+'" y1="'+y(t[0])+'" y2="'+y(t[0])+'" stroke="#999" stroke-width=".6" stroke-dasharray="2 2"/>';
      s += '<text x="19" y="'+(y(t[0])+3)+'" font-size="8" text-anchor="end" fill="#666">'+t[1]+'</text>';
    });
    s += '<text x="19" y="'+(ground+3)+'" font-size="8" text-anchor="end" fill="#666">0m</text>';
    s += '<text x="'+((22+W)/2)+'" y="10" font-size="8" text-anchor="middle" fill="#666">▲10m以上は</text>';
    s += '<text x="'+((22+W)/2)+'" y="19" font-size="8" text-anchor="middle" fill="#666">屋根より上</text>';
    // 人（大人・子ども）
    const person = (cx, hM) => {
      const h = hM * ppm, r = h * .11, hy = ground - h + r, bt = hy + r + 1, w = h * .30, legTop = ground - h * .45;
      return '<circle cx="'+cx+'" cy="'+hy+'" r="'+r+'" fill="'+ink+'"/>'
        + '<rect x="'+(cx-w/2)+'" y="'+bt+'" width="'+w+'" height="'+(legTop-bt)+'" rx="'+(w*.3)+'" fill="'+ink+'"/>'
        + '<rect x="'+(cx-w/2)+'" y="'+(legTop-1)+'" width="'+(w*.44)+'" height="'+(ground-legTop+1)+'" fill="'+ink+'"/>'
        + '<rect x="'+(cx+w*.06)+'" y="'+(legTop-1)+'" width="'+(w*.44)+'" height="'+(ground-legTop+1)+'" fill="'+ink+'"/>';
    };
    s += person(30, g.adultM) + person(41, g.childM);
    // 家（2階建て：軒の高さ・屋根の高さ）
    const hx1 = 52, hx2 = W - 4, ey = y(g.eaveM), ry = y(g.houseM), fy = y(3.0);   // 2階床面：手引き「日本の二階建て家屋の床面高は3.0m以上」
    s += '<polygon points="'+(hx1-3)+','+ey+' '+((hx1+hx2)/2)+','+ry+' '+(hx2+3)+','+ey+'" fill="'+ink+'"/>';
    s += '<rect x="'+hx1+'" y="'+ey+'" width="'+(hx2-hx1)+'" height="'+(ground-ey)+'" fill="none" stroke="'+ink+'" stroke-width="2"/>';
    s += '<line x1="'+hx1+'" x2="'+hx2+'" y1="'+fy+'" y2="'+fy+'" stroke="'+ink+'" stroke-width="1.2"/>';
    const win = (x, m1, m2) => '<rect x="'+x+'" y="'+y(m2)+'" width="13" height="'+(y(m1)-y(m2))+'" fill="#fff" stroke="'+ink+'" stroke-width="1"/>';
    s += win(hx1+7, 3.4, 4.4) + win(hx2-20, 3.4, 4.4) + win(hx2-20, .9, 2.0);
    s += '<rect x="'+(hx1+7)+'" y="'+y(2.0)+'" width="11" height="'+(ground-y(2.0))+'" fill="#fff" stroke="'+ink+'" stroke-width="1"/>';
    s += '<line x1="20" x2="'+W+'" y1="'+ground+'" y2="'+ground+'" stroke="'+ink+'" stroke-width="1.2"/>';
    s += '</svg>';
    return s;
  }
  const LEGEND_GRAPHIC = {
    shinsui: '<div style="display:grid;grid-template-columns:minmax(0,1fr) 116px;gap:6px;align-items:start">' + '<img style="width:100%;height:auto;max-width:none;display:block" src="https://disaportal.gsi.go.jp/hazardmap/copyright/img/shinsui_legend3.png" alt="浸水深凡例" onerror="this.replaceWith(document.createTextNode(\'（凡例画像を読み込めませんでした）\'))">' + depthGuideSVG() + '</div>'
      + '<div style="font-size:.75em;color:#888;margin-top:4px;line-height:1.5">右{みぎ}の図{ず}は高{たか}さの目安{めやす}です（大人{おとな}' + DEPTH_GUIDE.adultM + 'm・子{こ}ども' + DEPTH_GUIDE.childM + 'm・2階建{かいだ}ての家{いえ} 約{やく}' + DEPTH_GUIDE.houseM + 'm）</div>',
    dosha: '<div class="lg-css-row"><span class="lg-swatch" style="background:#fae600"></span>土砂{どしゃ}災害{さいがい}警戒{けいかい}区域{くいき}（イエローゾーン）：危害{きがい}が生{しょう}じるおそれあり。</div><div class="lg-css-row"><span class="lg-swatch" style="background:#fa2800"></span>土砂{どしゃ}災害{さいがい}特別{とくべつ}警戒{けいかい}区域{くいき}（レッドゾーン）：著{いちじる}しい危害{きがい}が生{しょう}じるおそれあり。</div>'
  };
  Object.keys(hazards).forEach(k => {
    const el = document.getElementById("haz-" + k);
    if (!el) return;
    el.onchange = e => {
      if (e.target.checked){ hazards[k].layer.addTo(map); hazards[k].layer.bringToFront(); }
      else map.removeLayer(hazards[k].layer);
      refreshLegend();
    };
  });
  document.querySelectorAll(".haz-info").forEach(b => {
    b.onclick = () => {
      const k = b.dataset.k, el = document.getElementById("haz-" + k);
      if (el && !el.checked) { el.checked = true; hazards[k].layer.addTo(map); hazards[k].layer.bringToFront(); }
      refreshLegend();
      const box = document.getElementById("legend-container");
      const card = document.getElementById("lg-" + k);
      if (card) { card.scrollIntoView({behavior:"smooth", block:"nearest"}); card.style.outline = "2px solid #6BAA9F"; setTimeout(() => card.style.outline = "none", 1200); }
    };
  });
  function refreshLegend(){
    const box = document.getElementById("legend-container");
    const active = Object.keys(hazards).filter(k => map.hasLayer(hazards[k].layer));
    if (!active.length){ box.innerHTML = '<div class="legend-empty">災害{さいがい}を選{えら}ぶと、説明{せつめい}と凡例{はんれい}が表示{ひょうじ}されます</div>'; return; }
    box.innerHTML = '<div class="lg-safety-note">※色{いろ}がついていない場所{ばしょ}も安全{あんぜん}とは限{かぎ}りません。想定{そうてい}を超{こ}える災害{さいがい}が起{お}きることもあります。</div>' + active.map(k => {
      const h = hazards[k];
      return '<div class="legend-item" id="lg-'+k+'"><div class="lg-name">'+h.name+'</div><div class="lg-desc">'+h.desc+'</div>'+LEGEND_GRAPHIC[h.legend]+'</div>';
    }).join("");
  }
  refreshLegend();

  /* ---------- 3. カテゴリ・状態 ---------- */
  /* 災害種の分類（授業案 rev3：液状化・地震火災・津波は使わない。内水氾濫は 11/14 に戻した。地図には重ねず、わいわい防災マップへのリンク）
     水害：洪水（外水氾濫）・内水氾濫（水が街からあふれる）・高潮
     地盤：土砂災害（急傾斜地の崩壊）
     地震：地震の揺れ（震度）
     ※ 1作品で複数の災害を選んでいる場合は、該当する分類すべてで絞り込みに出る */
  const CAT_RULES = [
    { cat:"mizu",   re:/洪水|内水|高潮/ },
    { cat:"jiban",  re:/土砂|急傾斜/ },
    { cat:"jishin", re:/震度|揺れ/ }
  ];
  function categories(f24){
    const s = f24 || "";
    const r = CAT_RULES.filter(x => x.re.test(s)).map(x => x.cat);
    return r.length ? r : ["other"];
  }
  const CATCOLOR = { mizu:"#2F80C4", jiban:"#B5793A", jishin:"#E0574A", other:"#888888" };

  /* いつの行動か：保存する値は 事前／災害時／復旧時。画面は「災害の前／とき／あと」 */
  const PHASE_LABEL_TO_KEY = { "事前":"prior", "災害時":"during", "復旧時":"recovery" };
  function phasesOf(p){
    const f23 = (p.field_23 || "").trim();
    return f23 ? f23.split(/[,、]\s*/).map(x => PHASE_LABEL_TO_KEY[x.trim()]).filter(Boolean) : [];
  }

  let currentCategory = "all", currentPhase = "all", currentPlace = "all", searchText = "";
  let isHeartFilterOn = false, isActionFilterOn = false;
  let ALL = [];                 // 全作品（features）
  const placeLayer = L.layerGroup().addTo(map);

  const ls = (k) => JSON.parse(localStorage.getItem(k) || "[]");
  const getHearts = () => ls("bousai_hearts");
  const getActions = () => ls("bousai_actions");
  const getViewed  = () => ls("bousai_viewed");
  const rb = (s) => window.rubyHTML ? window.rubyHTML(s) : s;

  // 作品の場所（place が空の古いデータは、座標が近い場所にまとめる）
  function placeOf(f){
    const c = f.geometry && f.geometry.coordinates;
    return window.yagamiPlaceOf(f.properties.place, c && c[1], c && c[0]);
  }

  /* ---------- 4. フィルタ判定 ---------- */
  function passFilter(f, ignorePlace){
    const p = f.properties;
    if (HIDDEN_IDS.includes(p.id)) return false;
    if (!ignorePlace && currentPlace !== "all"){
      const pl = placeOf(f);
      if (!pl || pl.id !== currentPlace) return false;
    }
    if (currentCategory !== "all" && !categories(p.field_24).includes(currentCategory)) return false;
    if (currentPhase !== "all" && !phasesOf(p).includes(currentPhase)) return false;
    if (isHeartFilterOn || isActionFilterOn){
      const hearts = getHearts(), actions = getActions();
      let ok = false;
      if (isHeartFilterOn && hearts.includes(p.id)) ok = true;
      if (isActionFilterOn && actions.includes(p.id)) ok = true;
      if (!ok) return false;
    }
    if (searchText){
      const q = searchText.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).toLowerCase();
      const hay = ((p.field_25 || "") + " " + (p.Message || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  function countAt(placeId){
    return ALL.filter(f => {
      if (!passFilter(f, true)) return false;
      if (placeId === "all") return true;
      const q = placeOf(f);
      return q && q.id === placeId;
    }).length;
  }

  /* ---------- 5. 地図：場所ごとのピン（作品の数つき） ---------- */
  // 3か所の同じ座標にそれぞれ10作品ほどが登録されるので、作品ごとのピンではなく場所のピンを出す
  function placeIcon(pl, count, selected){
    return L.divIcon({
      className: "place-pin" + (selected ? " sel" : ""),
      html: '<div class="pp-box" style="--pc:' + pl.color + '"><span class="pp-name">' + rb(pl.short) + '</span><span class="pp-count">' + count + '</span></div><div class="pp-tip" style="--pc:' + pl.color + '"></div>',
      iconSize: [0, 0], iconAnchor: [0, 0]
    });
  }
  function renderMarkers(){
    placeLayer.clearLayers();
    window.YAGAMI_PLACES.forEach(pl => {
      L.marker([pl.lat, pl.lon], { icon: placeIcon(pl, countAt(pl.id), currentPlace === pl.id), zIndexOffset: currentPlace === pl.id ? 1000 : 0 })
        .on("click", () => selectPlace(pl.id, true))
        .addTo(placeLayer);
    });
  }

  /* ---------- 6. 場所のボタン・検索 ---------- */
  function renderPlaceTabs(){
    const box = document.getElementById("place-tabs");
    if (!box) return;
    const items = [{ id:"all", short:"すべて", color:"#4f8b80" }].concat(window.YAGAMI_PLACES);
    box.innerHTML = items.map(pl =>
      '<button type="button" class="place-tab' + (currentPlace === pl.id ? " active" : "") + '" data-place="' + pl.id + '" style="--pc:' + pl.color + '">'
      + '<span class="pt-name">' + rb(pl.short) + '</span><span class="pt-count">' + countAt(pl.id) + '</span></button>'
    ).join("");
    box.querySelectorAll(".place-tab").forEach(b => { b.onclick = () => selectPlace(b.dataset.place, true); });
  }
  function selectPlace(id, move){
    currentPlace = id;
    try { history.replaceState(null, "", id === "all" ? location.pathname : location.pathname + "?place=" + id); } catch(e){}
    applyFilters();
    if (move){
      const pl = window.yagamiPlace(id);
      if (pl) map.setView([pl.lat, pl.lon], 17);
      else map.fitBounds(window.yagamiPlacesBounds(), { padding:[60,60], maxZoom:16 });
    }
    const lc = document.getElementById("art-list-container");
    if (lc) lc.scrollTop = 0;
  }
  const searchInput = document.getElementById("art-search");
  if (searchInput) searchInput.addEventListener("input", () => { searchText = searchInput.value.trim(); applyFilters(); });

  /* ---------- 7. サイドバーの作品リスト ---------- */
  function renderList(){
    const listContainer = document.getElementById("art-list-container");
    const viewed = getViewed(), hearts = getHearts(), actions = getActions();
    const items = ALL.filter(f => passFilter(f));
    listContainer.innerHTML = "";
    const head = document.createElement("div");
    head.className = "list-head";
    const cur = window.yagamiPlace(currentPlace);
    head.innerHTML = '<span class="lh-name">' + (cur ? "📍 " + rb(cur.name) : rb("すべての場所{ばしょ}")) + '</span>' + '<span class="lh-count">' + items.length + rb("作品{さくひん}") + '</span>';
    listContainer.appendChild(head);
    if (items.length === 0){
      const e = document.createElement("div");
      e.style.cssText = "text-align:center; padding:30px; color:#888;";
      e.innerHTML = rb(ALL.length ? "条件{じょうけん}に合{あ}う作品{さくひん}はありません" : "まだ作品{さくひん}はありません");
      listContainer.appendChild(e);
      return;
    }
    // 番号の順に並べる（保護者が自分の子どもの作品を見つけやすいように）
    items.sort((a, b) => String(a.properties.field_25 || "9999").localeCompare(String(b.properties.field_25 || "9999")) || (Number(a.properties.id) - Number(b.properties.id)));
    items.forEach(f => {
      const p = f.properties, id = p.id;
      const q = placeOf(f);
      let icons = "";
      const ribbon = viewed.includes(id) ? '<div class="ribbon-wrapper"><div class="ribbon-text">' + "鑑賞済み" + '</div></div>' : "";
      const imgUrl = (p.images && p.images[0]) ? DATA_BASE + "/" + p.images[0] : "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
      const card = document.createElement("div");
      card.className = "art-card";
      card.id = "card-" + id;
      card.innerHTML = ribbon +
        '<img src="' + imgUrl + '" class="art-card-img" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
        '<div class="art-card-info">' +
          '<div class="art-title art-message">' + escHtml(p.Message || "") + '</div>' +
          '<div class="art-meta"><span class="art-num">' + escHtml(p.field_25 || "") + '</span>' +
          (q ? '<span class="art-place" style="--pc:' + q.color + '">' + rb(q.short) + '</span>' : '') +
          '<span class="art-icons">' + icons + '</span></div>' +
        '</div>';
      card.addEventListener("click", () => { window.location.href = "detail.html?id=" + id + (currentPlace !== "all" ? "&place=" + currentPlace : ""); });
      listContainer.appendChild(card);
    });
  }

  /* ---------- 8. フィルタ操作 ---------- */
  function applyFilters(){ renderMarkers(); renderPlaceTabs(); renderList(); updateHeaderStats(); }
  const searchBtn = document.getElementById("search-area-btn");
  if (searchBtn) searchBtn.style.display = "none";

  document.querySelectorAll(".chip[data-cat]").forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll(".chip[data-cat]").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentCategory = chip.dataset.cat;
      applyFilters();
    };
  });
  document.querySelectorAll(".chip[data-phase]").forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll(".chip[data-phase]").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentPhase = chip.dataset.phase;
      applyFilters();
    };
  });
  const heartBtn = document.getElementById("filter-heart-btn");
  if (heartBtn) heartBtn.onclick = () => {
    isHeartFilterOn = !isHeartFilterOn;
    heartBtn.classList.toggle("active", isHeartFilterOn);
    heartBtn.innerHTML = isHeartFilterOn ? "💖 共感{きょうかん}した" : "♡ 共感{きょうかん}した";
    applyFilters();
  };
  const actionBtn = document.getElementById("filter-action-btn");
  if (actionBtn) actionBtn.onclick = () => {
    isActionFilterOn = !isActionFilterOn;
    actionBtn.classList.toggle("active", isActionFilterOn);
    actionBtn.innerHTML = isActionFilterOn ? "⭐ 実践{じっせん}したい" : "✨ 実践{じっせん}したい";
    applyFilters();
  };

  function updateHeaderStats(){
    const total = ALL.filter(f => !HIDDEN_IDS.includes(f.properties.id)).length;
    const viewed = getViewed().filter(id => !HIDDEN_IDS.includes(id)).length;
    const el = document.getElementById("view-count");
    if (el) el.textContent = viewed + "/" + total;
  }

  /* ---------- 9. 防災情報パネル・タブ・チュートリアル等 ---------- */
  const controlPanel = document.getElementById("control-panel");
  document.getElementById("menu-btn").onclick = () => { controlPanel.style.display = "flex"; };
  document.getElementById("close-panel-btn").onclick = () => { controlPanel.style.display = "none"; };
  document.getElementById("open-hazard-btn").onclick = () => {
    controlPanel.style.display = "flex";
    document.getElementById("hazard-tab").click();
    highlightHazardGroup(currentCategory);
  };
  ["hazard"].forEach(tab => {
    const b = document.getElementById(tab + "-tab");
    if (b) b.onclick = () => {
      document.getElementById(tab + "-content").style.display = "block";
    };
  });
  function highlightHazardGroup(cat){
    document.querySelectorAll(".hazard-group").forEach(g => g.classList.remove("highlight"));
    const id = cat === "mizu" ? "group-mizu" : cat === "jiban" ? "group-jiban" : cat === "jishin" ? "group-jishin" : "";
    if (id){
      const t = document.getElementById(id);
      if (t){ t.classList.add("highlight"); t.scrollIntoView({behavior:"smooth",block:"center"}); setTimeout(() => t.classList.remove("highlight"), 3000); }
    }
  }

  // 絞り込みの開閉
  const fHeader = document.querySelector(".filter-main-header");
  if (fHeader) fHeader.onclick = () => {
    document.querySelector(".filter-content").classList.toggle("closed");
    document.querySelector(".toggle-icon").classList.toggle("closed");
  };

  // 災害種チップに色ドットを付与
  function addCategoryDots(){
    document.querySelectorAll(".chip[data-cat]").forEach(chip => {
      const cat = chip.dataset.cat;
      if (cat === "all" || chip.querySelector(".cat-dot")) return;
      const dot = document.createElement("span");
      dot.className = "cat-dot"; dot.style.background = CATCOLOR[cat] || "#888";
      chip.prepend(dot);
    });
    ["mizu","jiban","jishin"].forEach(cat => {
      const head = document.querySelector("#group-"+cat+" .hazard-group-header");
      if (head && !head.querySelector(".cat-dot")){
        const dot = document.createElement("span");
        dot.className = "cat-dot"; dot.style.background = CATCOLOR[cat];
        head.prepend(dot);
      }
    });
  }

  // トップに戻る
  const backBtn = document.getElementById("back-to-top-btn");
  if (backBtn) backBtn.onclick = () => { window.location.href = "../start/index.html"; };

  setupTutorial();

  /* ---------- 10. データ読み込み ---------- */
  const listContainer = document.getElementById("art-list-container");
  listContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#888;">作品{さくひん}を読{よ}み込{こ}み中{ちゅう}…</div>';
  fetch(DATA_BASE + "/artworks", { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(gj => {
      ALL = gj.features.filter(f => f.properties && f.properties.id && !HIDDEN_IDS.includes(f.properties.id));
      addCategoryDots();
      applyFilters();

      const qp = new URLSearchParams(location.search).get("place");
      if (qp && window.yagamiPlace(qp)) selectPlace(qp, true);
      else map.fitBounds(window.yagamiPlacesBounds(), { padding:[60,60], maxZoom:16 });
    })
    .catch(err => {
      console.error("作品データの読み込みに失敗", err);
      listContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#c0503a;">作品{さくひん}データを読{よ}み込{こ}めませんでした。<br><span style="font-size:.9em;color:#888;">インターネットにつながっているか確認{かくにん}してください。</span></div>';
    });

  /* ---------- チュートリアル（既存のまま） ---------- */
  function setupTutorial(){
    const overlay = document.getElementById("tutorial-overlay");
    const helpBtn = document.getElementById("header-help-btn");
    const skipBtn = document.getElementById("skip-btn");
    const nextBtn = document.getElementById("next-btn");
    const imgEl = document.getElementById("tutorial-img");
    const titleEl = document.getElementById("tutorial-title");
    const descEl = document.getElementById("tutorial-desc");
    const dots = document.querySelectorAll(".tutorial-dots .dot");
    if (!overlay) return;
    // 授業案 rev3：実際の画面の写真で、マップの見方を4枚で説明する（写真は tools/make_guide_images.mjs で作る）
    const steps = [
      { title:"① 矢上小{やがみしょう}のみんなの作品{さくひん}", img:"guide_01.jpg?v=1",
        desc:"矢上小学校{やがみしょうがっこう}4年{ねん}2組{くみ}のみんなが、ハザードマップを読{よ}んで作{つく}った<strong>防災{ぼうさい}アート</strong>がのっています。<br>地図{ちず}のピンには、<strong>場所{ばしょ}の名前{なまえ}と作品{さくひん}の数{かず}</strong>が出{で}ています。" },
      { title:"② 場所{ばしょ}を選{えら}ぶ・番号{ばんごう}で探{さが}す", img:"guide_02.jpg?v=1",
        desc:"左上{ひだりうえ}の<strong>場所{ばしょ}のボタン</strong>か、地図{ちず}のピンを押{お}すと、その場所{ばしょ}の作品{さくひん}が並{なら}びます。<br><strong>番号{ばんごう}（例{れい} 4201）</strong>やタイトルでも探{さが}せます。" },
      { title:"③ 作品{さくひん}をタップ", img:"guide_03.jpg?v=1",
        desc:"左{ひだり}の一覧{いちらん}の作品{さくひん}を<strong>タップ</strong>すると、<br>その作品{さくひん}のくわしいページが開{ひら}きます。" },
      { title:"④ 作品{さくひん}のページ", img:"guide_04.jpg?v=1",
        desc:"タイトル・<strong>伝{つた}えたいこと</strong>・場所{ばしょ}・災害{さいがい}・いつの行動{こうどう}かを見{み}られます。<br>地図{ちず}にハザードマップを重{かさ}ねて、<strong>その場所{ばしょ}の危険性{きけんせい}</strong>も見{み}られます。" }
    ];
    const rbx = (t) => window.rubyHTML ? window.rubyHTML(t) : t;
    let page = 0;
    function update(){
      const s = steps[page];
      titleEl.innerHTML = rbx(s.title); descEl.innerHTML = rbx(s.desc);
      imgEl.src = s.img; imgEl.onerror = () => { imgEl.style.visibility = "hidden"; };
      imgEl.onload = () => { imgEl.style.visibility = "visible"; };
      dots.forEach((d,i) => d.classList.toggle("active", i === page));
      if (nextBtn) nextBtn.textContent = (page === steps.length-1) ? "とじる" : "つぎへ ＞";
    }
    const close = () => { try { localStorage.setItem("has_seen_map_tutorial_rev3", "true"); } catch (e) {} overlay.style.display = "none"; };
    // はじめて開いたとき（保護者がカードの QR から開いたときなど）は、使い方を自動で出す
    let seen = false; try { seen = !!localStorage.getItem("has_seen_map_tutorial_rev3"); } catch (e) {}
    if (!seen) { page = 0; update(); overlay.style.display = "flex"; }
    if (helpBtn) helpBtn.onclick = () => { page = 0; update(); overlay.style.display = "flex"; };
    if (nextBtn) nextBtn.onclick = () => { if (page < steps.length-1){ page++; update(); } else close(); };
    // 写真を押すと、つぎのページへ
    if (imgEl) imgEl.onclick = () => { if (page < steps.length-1){ page++; update(); } };
  }
});
