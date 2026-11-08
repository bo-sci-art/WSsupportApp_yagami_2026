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
      desc:"・想定{そうてい}最大{さいだい}規模{きぼ}の大雨{おおあめ}により、川{かわ}の水{みず}が堤防{ていぼう}を越{こ}えてまちへ流{なが}れ込{こ}む浸水{しんすい}です。<br>・発生{はっせい}しえるもっとも深{ふか}い場合{ばあい}を示{しめ}しています。<br>・下水{げすい}があふれる「内水氾濫{ないすいはんらん}」とは発生{はっせい}原因{げんいん}が異{こと}なります。" },
    tsunami: { layer:L.tileLayer(HZ+"04_tsunami_newlegend_data/{z}/{x}/{y}.png",{maxZoom:17,opacity:.7,attribution:"重ねるハザードマップ（国土地理院）"}),
      name:"津波{つなみ}", legend:"shinsui",
      desc:"・地震{じしん}などの地殻{ちかく}変動{へんどう}で発生{はっせい}した海面{かいめん}の変化{へんか}が大波{おおなみ}となって押{お}し寄{よ}せる浸水{しんすい}です。<br>・台風{たいふう}などが原因{げんいん}で海面{かいめん}が上昇{じょうしょう}する「高潮{たかしお}」とは発生{はっせい}原因{げんいん}が異{こと}なります。" },
    hightide: { layer:L.tileLayer(HZ+"03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png",{maxZoom:17,opacity:.7,attribution:"重ねるハザードマップ（国土地理院）"}),
      name:"高潮{たかしお}", legend:"shinsui",
      desc:"・台風{たいふう}などによる気圧{きあつ}低下{ていか}と強風{きょうふう}で海面{かいめん}が上昇{じょうしょう}し、海水{かいすい}が陸{りく}へ流{なが}れ込{こ}む浸水{しんすい}です。<br>・地震{じしん}などの地殻{ちかく}変動{へんどう}が原因{げんいん}で発生{はっせい}する「津波{つなみ}」とは発生{はっせい}原因{げんいん}が異{こと}なります。" },
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
  /* 災害種の分類（2026/10 改訂）
     水害：洪水（外水氾濫）・内水氾濫・高潮
     地盤：土砂災害（急傾斜地の崩壊）
     地震：地震の揺れ（震度）・液状化（液状化危険度）・地震火災（焼失棟数）・津波
     ※ 1作品で複数の災害を選んでいる場合は、該当する分類すべてで絞り込みに出る */
  const CAT_RULES = [
    { cat:"mizu",   re:/洪水|内水|高潮/ },
    { cat:"jiban",  re:/土砂|急傾斜/ },
    { cat:"jishin", re:/震度|揺れ|液状化|火災|津波/ }
  ];
  function categories(f24){
    const s = f24 || "";
    const r = CAT_RULES.filter(x => x.re.test(s)).map(x => x.cat);
    return r.length ? r : ["other"];
  }
  function category(f24){ return categories(f24)[0]; }   // ピンの色は先頭の分類
  const CATCOLOR = { mizu:"#2F80C4", jiban:"#B5793A", jishin:"#E0574A", other:"#888888" };
  const CATLABEL = { mizu:"水害{すいがい}", jiban:"地盤{じばん}", jishin:"地震{じしん}" };

  // 作品ピン（ティアドロップ形）
  function makeIcon(color, big){
    const w = big ? 34 : 26, h = big ? 46 : 36;
    const svg = '<svg width="'+w+'" height="'+h+'" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.4 18.6 0 12 0z" fill="'+color+'" stroke="#ffffff" stroke-width="2.5"/>'
      + '<circle cx="12" cy="12" r="4.3" fill="#ffffff"/></svg>';
    return L.divIcon({ className:"art-pin"+(big?" sel":""), html:svg, iconSize:[w,h], iconAnchor:[w/2,h], tooltipAnchor:[0,-h+10] });
  }

  const phaseKeywords = {
    prior: ["備蓄","水","食料","ハザードマップ","訓練","家具","固定","ガラス","ブロック塀","散歩","確認","話し合い","家族","連絡","知","学","準備","日頃","靴","備え","アプリ","登録"],
    during: ["逃げ","避難","高台","走","垂直","2階","3階","浸水","揺れ","机の下","守","火","消火","煙","119","110","通報","助け","声かけ","安否","ライト","懐中電灯","停電","ブレーカー"],
    recovery: ["片付け","掃除","泥","ゴミ","ボランティア","助け合い","協力","炊き出し","避難所","トイレ","衛生","薬","病院","給水","復旧","再開","つながり","励まし","絆","相談","申請"]
  };


  /* 防災行動のタイミング（2026/10）：登録時の設問（field_23）を優先。未回答の過去作品はキーワードで推定 */
  const PHASE_LABEL_TO_KEY = { "事前":"prior", "災害時":"during", "復旧時":"recovery" };
  function phasesOf(p){
    const f23 = (p.field_23 || "").trim();
    if (f23) return f23.split(/[,、]\s*/).map(x => PHASE_LABEL_TO_KEY[x.trim()]).filter(Boolean);
    const t = (p.Message||"") + (p.collage||"") + (p.Mabling||"");
    return Object.keys(phaseKeywords).filter(k => phaseKeywords[k].some(kw => t.includes(kw)));
  }

  let currentCategory = "all", currentPhase = "all";
  let isHeartFilterOn = false, isActionFilterOn = false;
  let ALL = [];                 // 全作品（features）
  const markerById = {};        // id -> circleMarker
  let selectedId = null;
  let isProgrammaticScroll = false;
  const artLayer = L.layerGroup().addTo(map);

  const ls = (k) => JSON.parse(localStorage.getItem(k) || "[]");
  const getHearts = () => ls("bousai_hearts");
  const getActions = () => ls("bousai_actions");
  const getViewed  = () => ls("bousai_viewed");

  /* ---------- 4. フィルタ判定 ---------- */
  function passFilter(p){
    if (HIDDEN_IDS.includes(p.id)) return false;
    if (currentCategory !== "all" && !categories(p.field_24).includes(currentCategory)) return false;
    if (currentPhase !== "all" && !phasesOf(p).includes(currentPhase)) return false;
    if (isHeartFilterOn || isActionFilterOn){
      const hearts = getHearts(), actions = getActions();
      let ok = false;
      if (isHeartFilterOn && hearts.includes(p.id)) ok = true;
      if (isActionFilterOn && actions.includes(p.id)) ok = true;
      if (!ok) return false;
    }
    return true;
  }

  /* ---------- 5. 宛名の抽出（旧ロジック踏襲） ---------- */
  function findPersonText(text){
    if (!text) return null;
    let t = text.replace(/[\r\n\s]+/g, "").split(/[、。.,．]/)[0].substring(0, 40);
    const m = t.match(/.*?(人|者|民|方|達|学生|慶應生|生徒|たち|家族|みんな|さん|ちゃん|友|自分|ママ|パパ)/);
    return m ? m[0] + "へ" : null;
  }
  function extractAddressee(p){
    return findPersonText(p.Message) || findPersonText(p.collage) || findPersonText(p.Mabling) || (p.target || "みんなへ");
  }

  /* ---------- 6. 地図ピン ---------- */
  function renderMarkers(){
    artLayer.clearLayers();
    for (const k in markerById) delete markerById[k];
    ALL.forEach(f => {
      const p = f.properties;
      if (!passFilter(p)) return;
      const c = f.geometry && f.geometry.coordinates;
      if (!c) return;
      const cat = category(p.field_24);
      const color = CATCOLOR[cat];
      const m = L.marker([c[1], c[0]], { icon: makeIcon(color, false) });
      m._color = color;
      m.on("click", () => highlightCardInSidebar(p.id));
      m.addTo(artLayer);
      markerById[p.id] = m;
    });
  }

  function highlightMapPin(id){
    // 選択解除（通常サイズに戻す・ラベル消す）
    Object.values(markerById).forEach(m => {
      m.setIcon(makeIcon(m._color, false));
      m.setZIndexOffset(0);
      if (m.getTooltip()) m.unbindTooltip();
    });
    selectedId = id;
    const m = markerById[id];
    if (!m) return;
    m.setIcon(makeIcon(m._color, true));
    m.setZIndexOffset(1000);
    const f = ALL.find(x => x.properties.id === id);
    if (f){
      m.bindTooltip("✉️ " + extractAddressee(f.properties), { permanent:true, direction:"top", className:"addressee-tip" }).openTooltip();
    }
  }

  /* ---------- 7. サイドバーの作品リスト ---------- */
  function inView(f){
    const c = f.geometry && f.geometry.coordinates;
    return c && map.getBounds().contains([c[1], c[0]]);
  }
  function renderList(){
    const listContainer = document.getElementById("art-list-container");
    const viewed = getViewed(), hearts = getHearts(), actions = getActions();
    const items = ALL.filter(f => passFilter(f.properties) && inView(f));
    listContainer.innerHTML = "";
    if (items.length === 0){
      listContainer.innerHTML = '<div style="text-align:center; padding:30px; color:#888;"><p>このエリアに条件{じょうけん}に合{あ}う作品{さくひん}はありません</p><p style="font-size:0.9em;">地図{ちず}を動{うご}かして<br>「このエリアで再{さい}検索{けんさく}」を押{お}してください</p></div>';
      return;
    }
    items.forEach(f => {
      const p = f.properties, id = p.id;
      let icons = "";
      if (hearts.includes(id))  icons += " <span style='color:#ff69b4;'>💖</span>";
      if (actions.includes(id)) icons += " <span style='color:#fbc02d;'>✨</span>";
      const ribbon = viewed.includes(id) ? '<div class="ribbon-wrapper"><div class="ribbon-text">鑑賞済{かんしょうず}み</div></div>' : "";
      const imgUrl = (p.images && p.images[0]) ? DATA_BASE + "/" + p.images[0] : "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
      const card = document.createElement("div");
      card.className = "art-card";
      card.id = "card-" + id;
      card.innerHTML = ribbon +
        '<img src="'+imgUrl+'" class="art-card-img" id="img-'+id+'" onerror="this.style.visibility=\'hidden\'">' +
        '<div class="art-card-info"><div class="art-title art-message">'+escHtml(p.Message||"")+'</div><div class="art-title">作者{さくしゃ}：'+escHtml(p.field_25||"作者{さくしゃ}不明{ふめい}")+
        '<span style="float:right; font-size:0.8em;">'+icons+'</span></div></div>';
      card.addEventListener("click", () => {
        highlightCardInSidebar(id);
        setTimeout(() => { window.location.href = "detail.html?id=" + id; }, 300);
      });
      listContainer.appendChild(card);
    });
    if (items.length === 1) setTimeout(() => highlightCardInSidebar(items[0].properties.id), 100);
  }

  function highlightCardInSidebar(id){
    isProgrammaticScroll = true;
    document.querySelectorAll(".art-card").forEach(c => c.classList.remove("active-card"));
    const target = document.getElementById("card-" + id);
    if (target){ target.classList.add("active-card"); target.scrollIntoView({ behavior:"smooth", block:"center" }); }
    highlightMapPin(id);
    setTimeout(() => { isProgrammaticScroll = false; }, 800);
  }

  function detectCenterCard(){
    const container = document.getElementById("art-list-container");
    const rect = container.getBoundingClientRect();
    const centerY = rect.top + rect.height/2;
    let best = null, min = Infinity;
    document.querySelectorAll(".art-card").forEach(card => {
      const r = card.getBoundingClientRect();
      const d = Math.abs((r.top + r.height/2) - centerY);
      if (d < min){ min = d; best = card; }
    });
    if (best){
      const id = best.id.replace("card-", "");
      if (id !== selectedId){
        document.querySelectorAll(".art-card").forEach(c => c.classList.remove("active-card"));
        best.classList.add("active-card");
        highlightMapPin(id);
      }
    }
  }
  document.getElementById("art-list-container").addEventListener("scroll", () => {
    if (!isProgrammaticScroll) detectCenterCard();
  });

  // 「このエリアで再検索」
  const searchBtn = document.getElementById("search-area-btn");
  map.on("moveend", () => { searchBtn.style.display = "block"; });
  searchBtn.onclick = () => { renderList(); searchBtn.style.display = "none"; };

  /* ---------- 8. フィルタ操作 ---------- */
  function applyFilters(){ renderMarkers(); renderList(); updateHeaderStats(); }

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
    document.getElementById("header-heart-count").textContent = getHearts().length;
    document.getElementById("header-action-count").textContent = getActions().length;
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
      try {
        if (ALL.length) {
          const b = L.latLngBounds(ALL.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]).concat([YAGAMI_CENTER]));
          map.fitBounds(b.pad(0.15), { maxZoom:16 });
        }
      } catch(e){}
      if (!ALL.length) listContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#888;">まだ作品{さくひん}はありません</div>';
      searchBtn.style.display = "none";
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
    const steps = [
      { title:"防災{ぼうさい}行動{こうどう}マップについて", img:"tutorial_01.png",
        desc:"このマップでは、矢上小{やがみしょう}のみんなが制作{せいさく}した作品{さくひん}を鑑賞{かんしょう}します。<br><strong>作品{さくひん}には、「大切{たいせつ}な誰{だれ}かを守{まも}りたい」という作者{さくしゃ}のメッセージが込{こ}められています。</strong>" },
      { title:"自分{じぶん}宛{あ}ての作品{さくひん}を探{さが}す", img:"tutorial_05.png",
        desc:"<strong>ピンにはメッセージの宛名{あてな}が書{か}かれています</strong>。<br>「家族{かぞく}へ」など、自分{じぶん}に近{ちか}い宛名{あてな}を探{さが}してみてください。" },
      { title:"作品{さくひん}を見{み}つける", img:"tutorial_02.png",
        desc:"「災害{さいがい}の種類{しゅるい}」や「防災{ぼうさい}行動{こうどう}のタイミング」で<br>見{み}たい作品{さくひん}を絞{しぼ}り込{こ}めます。" },
      { title:"地図{ちず}を重{かさ}ねる", img:"tutorial_03.png",
        desc:"右上{みぎうえ}の「防災{ぼうさい}情報{じょうほう}」ボタンを押{お}すと、<br>ハザードマップを地図{ちず}に重{かさ}ねて確認{かくにん}できます。" },
      { title:"作品{さくひん}を鑑賞{かんしょう}する", img:"tutorial_04.png",
        desc:"<strong>作品{さくひん}をタップすると鑑賞{かんしょう}画面{がめん}へ進{すす}みます。</strong><br>作者{さくしゃ}が込{こ}めたメッセージを確認{かくにん}しましょう。" }
    ];
    let page = 0;
    function update(){
      const s = steps[page];
      titleEl.innerHTML = s.title; descEl.innerHTML = s.desc;
      imgEl.src = s.img; imgEl.onerror = () => { imgEl.style.visibility = "hidden"; };
      imgEl.onload = () => { imgEl.style.visibility = "visible"; };
      dots.forEach((d,i) => d.classList.toggle("active", i === page));
      if (nextBtn) nextBtn.textContent = (page === steps.length-1) ? "とじる" : "つぎへ ＞";
    }
    if (helpBtn) helpBtn.onclick = () => { page = 0; update(); overlay.style.display = "flex"; };
    if (skipBtn) skipBtn.onclick = () => { overlay.style.display = "none"; };
    if (nextBtn) nextBtn.onclick = () => { if (page < steps.length-1){ page++; update(); } else overlay.style.display = "none"; };
  }
});
