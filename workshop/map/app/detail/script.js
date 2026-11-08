/* =========================================================
   対象区域の選定：ハザードマップ（OSS版 / Leaflet + 国土地理院タイル）
   - ArcGIS 非依存。GSIオープンタイルのみで動作。
   - 各ハザードに「何を示すか」の説明を凡例と一体表示。
   ========================================================= */

/* ===== ベースマップ ===== */
const bases = {
  white: L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {maxZoom:18, attribution:"地理院タイル（淡色地図）"}),
  sat:   L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", {maxZoom:18, attribution:"地理院タイル（写真）"})
};

/* ===== 災害レイヤー定義（説明＋凡例つき） ===== */
const HZ = "https://disaportaldata.gsi.go.jp/raster/";
const hazards = {
  flood_l2: {
    layer: L.tileLayer(HZ+"01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png", {maxZoom:17, opacity:.7, attribution:"重ねるハザードマップ（国土地理院）"}),
    name: "川{かわ}の水{みず}があふれる（洪水{こうずい}）",
    desc: "とても 大{おお}きな 雨{あめ}で 川{かわ}の 水{みず}が あふれると、色{いろ}の ついた 場所{ばしょ}が 水{みず}に つかるかもしれません。色{いろ}が こいほど 深{ふか}くなります。",
    legend: "shinsui"
  },
  tsunami: {
    layer: L.tileLayer(HZ+"04_tsunami_newlegend_data/{z}/{x}/{y}.png", {maxZoom:17, opacity:.7, attribution:"重ねるハザードマップ（国土地理院）"}),
    name: "津波{つなみ}",
    desc: "地震{じしん}の あと、海{うみ}から 大{おお}きな 波{なみ}が おしよせると、色{いろ}の ついた 場所{ばしょ}が 水{みず}に つかるかもしれません。",
    legend: "shinsui"
  },
  hightide: {
    layer: L.tileLayer(HZ+"03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png", {maxZoom:17, opacity:.7, attribution:"重ねるハザードマップ（国土地理院）"}),
    name: "台風{たいふう}で 海{うみ}の水{みず}があふれる（高潮{たかしお}）",
    desc: "台風{たいふう}などで 海{うみ}の 水{みず}が もり上{あ}がると、色{いろ}の ついた 場所{ばしょ}が 水{みず}に つかるかもしれません。",
    legend: "shinsui"
  },
  kyukei: {
    layer: L.tileLayer(HZ+"05_kyukeishakeikaikuiki/{z}/{x}/{y}.png", {maxZoom:17, opacity:.7, attribution:"重ねるハザードマップ（国土地理院）"}),
    name: "がけくずれ（土砂{どしゃ}災害{さいがい}）",
    desc: "大雨{おおあめ}や 地震{じしん}で がけが くずれるかもしれない 場所{ばしょ}です。",
    legend: "dosha"
  }
};

/* ===== 地図：矢上小学校の周辺（矢上小版） ===== */
const YAGAMI_CENTER = [35.5523, 139.6569];
const map = L.map("viewDiv", {center:YAGAMI_CENTER, zoom:16, zoomControl:true, layers:[bases.white]});
L.control.scale({imperial:false}).addTo(map);
let curBase = bases.white;

document.getElementById("bm-white").onclick = () => setBase("white");
document.getElementById("bm-sat").onclick   = () => setBase("sat");
function setBase(k){
  map.removeLayer(curBase);
  curBase = (k === "sat") ? bases.sat : bases.white;
  curBase.addTo(map); curBase.bringToBack();
  document.getElementById("bm-white").classList.toggle("active", k === "white");
  document.getElementById("bm-sat").classList.toggle("active", k === "sat");
}

/* ===== チェック連動 ===== */
Object.keys(hazards).forEach(k => {
  const el = document.getElementById("chk-" + k);
  if (!el) return;
  el.onchange = e => {
    if (e.target.checked) hazards[k].layer.addTo(map); else map.removeLayer(hazards[k].layer);
    refreshLegend();
  };
});

/* ===== 「?」で説明を表示（未チェックでも見られる） ===== */
document.querySelectorAll(".info-btn").forEach(b => {
  b.onclick = () => {
    const k = b.dataset.k, el = document.getElementById("chk-" + k);
    if (el && !el.checked) { el.checked = true; hazards[k].layer.addTo(map); }
    refreshLegend();
    const box = document.getElementById("legend-box");
    box.scrollIntoView({behavior:"smooth", block:"nearest"});
    const card = document.getElementById("lg-" + k);
    if (card) { card.style.outline = "2px solid var(--sub-color)"; setTimeout(() => card.style.outline = "none", 1200); }
  };
});

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
  s += '<text x="'+((22+W)/2)+'" y="10" font-size="8" text-anchor="middle" fill="#666">▲10mより うえは</text>';
  s += '<text x="'+((22+W)/2)+'" y="19" font-size="8" text-anchor="middle" fill="#666">やねより うえ</text>';
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

/* ===== 凡例・説明 ===== */
const LEGEND_GRAPHIC = {
  shinsui: '<div style="display:grid;grid-template-columns:minmax(0,1fr) 116px;gap:6px;align-items:start"><img style="width:100%;height:auto;max-width:none;display:block" src="https://disaportal.gsi.go.jp/hazardmap/copyright/img/shinsui_legend3.png" alt="水につかる深さの色" onerror="this.replaceWith(document.createTextNode(\'（色の見方の画像を読みこめませんでした）\'))">' + depthGuideSVG() + '</div>'
         + '<div class="lg-guide-note">右{みぎ}の 図{ず}は 高{たか}さの めやすだよ（大人{おとな} ' + DEPTH_GUIDE.adultM + 'm・子{こ}ども ' + DEPTH_GUIDE.childM + 'm・2かいだての 家{いえ} やく' + DEPTH_GUIDE.houseM + 'm）</div>',
  dosha: '<div class="lg-css-row"><span class="lg-swatch" style="background:#fae600"></span>黄色{きいろ}：がけくずれで けがを するかもしれない 場所{ばしょ}</div><div class="lg-css-row"><span class="lg-swatch" style="background:#fa2800"></span>赤{あか}：がけくずれで とても あぶない 場所{ばしょ}</div>'
};
function refreshLegend(){
  const box = document.getElementById("legend-box");
  const active = Object.keys(hazards).filter(k => map.hasLayer(hazards[k].layer));
  if (!active.length){ box.innerHTML = '<div class="legend-empty">災害{さいがい}を えらぶと、色{いろ}の 見方{みかた}が 出{で}るよ</div>'; return; }
  box.innerHTML = '<div class="lg-safety-note">※色{いろ}が ついていない 場所{ばしょ}も、ぜったいに 安全{あんぜん}とは かぎりません。</div>' + active.map(k => {
    const h = hazards[k];
    return '<div class="legend-item" id="lg-' + k + '">' +
             '<div class="lg-name">' + h.name + '</div>' +
             '<div class="lg-desc">' + h.desc + '</div>' +
             LEGEND_GRAPHIC[h.legend] +
           '</div>';
  }).join("");
}

/* ===== 災害種チップ ===== */
document.querySelectorAll(".chip").forEach(c => {
  c.onclick = () => {
    document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
    c.classList.add("active");
    const cat = c.dataset.cat;
    document.querySelectorAll(".hazard-group").forEach(g => {
      g.style.display = (cat === "all" || g.dataset.cat === cat) ? "" : "none";
    });
  };
});

/* ===== 周辺の防災資源（避難場所・拠点・給水所）※既定は非表示・トグルで表示 ===== */
const RES_DATA_BASE = "../../../../data";   // 矢上小版：このリポジトリの data/ を読む
const RES_DEFS = {
  shelters: { file:"bousai_shelters.geojson", color:"#2e9e5b", label:"ひなん 場所{ばしょ}" },
  bases:    { file:"bousai_bases.geojson",    color:"#2f6fb0", label:"ひなん 生活{せいかつ}を する 学校{がっこう}など" },
  water:    { file:"bousai_water.geojson",    color:"#0f9bb5", label:"水{みず}を もらえる 場所{ばしょ}" }
};
const resLayers = { shelters:null, bases:null, water:null };

(function initResources(){
  const keys = Object.keys(RES_DEFS);
  Promise.all(keys.map(function(k){
    return fetch(RES_DATA_BASE + "/" + RES_DEFS[k].file)
      .then(function(r){ if(!r.ok) throw new Error(RES_DEFS[k].file + " " + r.status); return r.json(); })
      .then(function(gj){ return { k:k, features:(gj.features||[]) }; });
  })).then(function(results){
    const counts = {};
    results.forEach(function(res){
      const def = RES_DEFS[res.k];
      const grp = L.layerGroup();
      res.features.forEach(function(f){
        const c = f.geometry && f.geometry.coordinates;
        if (!c) return;
        const p = f.properties || {};
        const extra = (res.k === "water" && p.kind) ? "<br>" + p.kind : "";
        L.circleMarker([c[1], c[0]], { radius:5, color:"#fff", weight:1.5, fillColor:def.color, fillOpacity:.9 })
          .bindPopup("<b>" + def.label + "</b><br>" + (p.name||"") + extra + (p.address ? "<br>" + p.address : ""))
          .addTo(grp);
      });
      resLayers[res.k] = grp;   // 既定は地図に載せない
      counts[res.k] = res.features.length;
    });
    renderResourceToggles(counts);
  }).catch(function(err){
    console.error("防災資源の読込に失敗", err);
    const el = document.getElementById("resource-toggles");
    if (el) el.innerHTML = '<div style="font-size:.78em;color:#999">にげる 場所{ばしょ}の データを 読{よ}みこめませんでした。</div>';
  });
})();

function renderResourceToggles(counts){
  const el = document.getElementById("resource-toggles");
  if (!el) return;
  el.innerHTML = Object.keys(RES_DEFS).map(function(k){
    const def = RES_DEFS[k];
    return '<label class="res-toggle"><input type="checkbox" data-res="'+k+'">'
      + '<span class="res-dot" style="background:'+def.color+'"></span>'
      + def.label + '</label>';
  }).join("");
  el.querySelectorAll('input[data-res]').forEach(function(cb){
    cb.addEventListener('change', function(e){
      const k = e.target.getAttribute('data-res');
      if (!resLayers[k]) return;
      if (e.target.checked) resLayers[k].addTo(map);
      else map.removeLayer(resLayers[k]);
    });
  });
}