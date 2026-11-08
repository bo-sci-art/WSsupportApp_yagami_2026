/* =========================================================
   作品詳細（detail） Leaflet + 国土地理院 / GeoJSON版
   - ArcGIS/Survey123 を廃止。data/artworks.geojson を読む
   - UI・鑑賞フロー(3ステップ quest)は既存のまま
   ========================================================= */
document.addEventListener("DOMContentLoaded", function () {

  const DATA_BASE = "https://raw.githubusercontent.com/bo-sci-art/WSspportApp_2026/main/data"; // 統合時は "../../data"
  const HIDDEN_IDS = [];
  const PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

  // ---- チュートリアル（既存のまま・画像onerrorのみ調整） ----
  setupDetailTutorial();

  const urlParams = new URLSearchParams(window.location.search);
  const artId = urlParams.get("id");
  if (!artId) { alert("作品が見つかりませんでした。マップに戻ります。"); window.location.href = "index.html"; return; }

  // ---- 地図タイル（国土地理院） ----
  const GSI_PALE = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
  const HZ = "https://disaportaldata.gsi.go.jp/raster/";
  function baseTile(){ return L.tileLayer(GSI_PALE, { maxZoom:18, attribution:"地理院タイル（淡色地図）" }); }
  function hzTile(key){
    if (key==="flood_l2") return L.tileLayer(HZ+"01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png",{maxZoom:17,opacity:.7});
    if (key==="tsunami")  return L.tileLayer(HZ+"04_tsunami_newlegend_data/{z}/{x}/{y}.png",{maxZoom:17,opacity:.7});
    if (key==="hightide") return L.tileLayer(HZ+"03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png",{maxZoom:17,opacity:.7});
    if (key==="kyukei")   return L.tileLayer(HZ+"05_kyukeishakeikaikuiki/{z}/{x}/{y}.png",{maxZoom:17,opacity:.7});
    if (key==="swale")    return L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/swale/{z}/{x}/{y}.png",{maxZoom:17,maxNativeZoom:16,opacity:.65});
    return null;
  }
  // 作品の災害種(field_24キーワード)→国土地理院レイヤー
  const HAZARD_DEFS = {
    "洪水":  { name:"洪水（外水氾濫）", key:"flood_l2" },
    "高潮":  { name:"高潮", key:"hightide" },
    "津波":  { name:"津波", key:"tsunami" },
    "土砂":  { name:"土砂災害（急傾斜地の崩壊）", key:"kyukei" }
  };

  const phaseKeywords = {
    prior: ["備蓄","水","食料","ハザードマップ","訓練","家具","固定","ガラス","ブロック塀","散歩","確認","話し合い","家族","連絡","知","学","準備","日頃","靴","備え","アプリ","登録"],
    during: ["逃げ","避難","高台","走","垂直","2階","3階","浸水","揺れ","机の下","守","火","消火","煙","119","110","通報","助け","声かけ","安否","ライト","懐中電灯","停電","ブレーカー"],
    recovery: ["片付け","掃除","泥","ゴミ","ボランティア","助け合い","協力","炊き出し","避難所","トイレ","衛生","薬","病院","給水","復旧","再開","つながり","励まし","絆","相談","申請"]
  };

  const CATCOLOR = { mizu:"#2F80C4", jiban:"#B5793A", jishin:"#E0574A", other:"#888888" };
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
  /* 防災行動のタイミング（2026/10）：登録時の設問（field_23）を優先。未回答の過去作品はキーワードで推定 */
  const PHASE_LABEL_TO_KEY = { "事前":"prior", "災害時":"during", "復旧時":"recovery" };
  function phasesOf(p){
    const f23 = (p.field_23 || "").trim();
    if (f23) return f23.split(/[,、]\s*/).map(x => PHASE_LABEL_TO_KEY[x.trim()]).filter(Boolean);
    const t = (p.Message||"") + (p.collage||"") + (p.Mabling||"");
    return Object.keys(phaseKeywords).filter(k => phaseKeywords[k].some(kw => t.includes(kw)));
  }

  function makeIcon(color, big){
    const w = big?34:26, h = big?46:36;
    const svg='<svg width="'+w+'" height="'+h+'" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">'
      +'<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.4 18.6 0 12 0z" fill="'+color+'" stroke="#fff" stroke-width="2.5"/>'
      +'<circle cx="12" cy="12" r="4.3" fill="#fff"/></svg>';
    return L.divIcon({ className:"art-pin", html:svg, iconSize:[w,h], iconAnchor:[w/2,h] });
  }
  function numIcon(num,color){
    return L.divIcon({ className:"num-pin", iconSize:[28,28], iconAnchor:[14,14],
      html:'<div style="background:'+color+';color:#fff;border:2px solid #fff;border-radius:50%;width:24px;height:24px;line-height:22px;text-align:center;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,.4)">'+num+'</div>' });
  }

  // ---- 状態 ----
  let ALL = [], feature = null, P = null;
  let surMap = null, artMarker = null;
  const surHz = {};        // 周辺地図のハザードタイル
  let nearMap = null, nearMarkers = null;

  const lsGet = k => JSON.parse(localStorage.getItem(k) || "[]");

  // ---- データ読み込み ----
  fetch(DATA_BASE + "/artworks.geojson")
    .then(r => { if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
    .then(gj => {
      ALL = gj.features.filter(f => f.properties && f.properties.id && !HIDDEN_IDS.includes(f.properties.id));
      feature = ALL.find(f => String(f.properties.id) === String(artId));
      if (!feature) { alert("作品が見つかりませんでした。マップに戻ります。"); window.location.href="index.html"; return; }
      P = feature.properties;
      initArtwork();
      initSurMap();
      showQuestMenu();
    })
    .catch(err => { console.error("作品データ読込失敗", err); alert("作品データを読み込めませんでした。"); });

  function setText(id, text){ const el=document.getElementById(id); if(el) el.textContent = text || "（コメントなし）"; }

  function initArtwork(){
    const info = document.getElementById("artwork-info");
    if (info) info.innerHTML = '<div class="simple-author-label">作者: '+(P.field_25||"匿名")+'</div>';
    const img = document.getElementById("art-image");
    if (img){ img.src = (P.images&&P.images[0]) ? DATA_BASE+"/"+P.images[0] : PLACEHOLDER; img.onerror=function(){ this.style.visibility="hidden"; }; }
    setText("mabling-text", P.Mabling);
    setText("collage-text", P.collage);
    setText("author-message-text", P.Message);
    updateHeaderStats();
    setupReactionButtons();
  }

  function initSurMap(){
    const c = feature.geometry.coordinates; // [lon,lat]
    surMap = L.map("surrounding-map", { center:[c[1],c[0]], zoom:15, zoomControl:true });
    baseTile().addTo(surMap);
    artMarker = L.marker([c[1],c[0]], { icon: makeIcon(CATCOLOR[category(P.field_24)], true) }).addTo(surMap);
    setTimeout(()=>surMap.invalidateSize(), 200);
  }
  function resetSurHazards(){
    Object.keys(surHz).forEach(k => { if (surMap.hasLayer(surHz[k])) surMap.removeLayer(surHz[k]); });
  }

  // ---- クエスト制御 ----
  const questMenuPanel = document.getElementById("quest-menu-panel");
  const interactionPanel = document.getElementById("interaction-panel");

  window.showQuestMenu = function(){ questMenuPanel.style.display="block"; interactionPanel.style.display="none"; };

  window.startQuest = function(stepNum){
    questMenuPanel.style.display="none";
    interactionPanel.style.display="flex";

    ["step1","step2","step3"].forEach(id=>{
      ["-info","-controls","-btn-area","-content"].forEach(sfx=>{
        const el=document.getElementById(id+sfx); if(el) el.style.display="none";
      });
    });
    const splitLayout=document.getElementById("split-layout-container"); if(splitLayout) splitLayout.style.display="none";
    const infoBox=document.querySelector(".info-box-container");
    const verifyTitle=document.querySelector(".verify-title");

    if (stepNum===1){
      if(splitLayout) splitLayout.style.display="flex";
      document.getElementById("step1-info").style.display="block";
      document.getElementById("step1-controls").style.display="block";
      const b=document.getElementById("step1-btn-area"); if(b) b.style.display="block";
      if(verifyTitle) verifyTitle.textContent="▼ ハザードマップを重ねてピン周辺の災害リスクを確認しよう";
      if(infoBox) infoBox.classList.remove("action-mode");
      resetSurHazards();
      resetResources();
      generateHazardCheckboxes();
      setText("mabling-text", P.Mabling);
      setTimeout(()=>surMap.invalidateSize(), 100);

    } else if (stepNum===2){
      if(splitLayout) splitLayout.style.display="flex";
      document.getElementById("step2-info").style.display="block";
      document.getElementById("step2-controls").style.display="block";
      const b=document.getElementById("step2-btn-area"); if(b) b.style.display="block";
      if(verifyTitle) verifyTitle.textContent="▼ 作者が考えた防災行動を、地図と見比べてみよう";
      if(infoBox) infoBox.classList.add("action-mode");
      resetSurHazards();
      setText("collage-text", P.collage);
      showResources();
      setTimeout(()=>surMap.invalidateSize(), 100);

    } else if (stepNum===3){
      resetResources();
      document.getElementById("step3-content").style.display="block";
      const addr = extractAddressee(P.Message, P.collage, P.Mabling);
      const addrEl=document.getElementById("message-addressee"); if(addrEl) addrEl.textContent=addr;
      setText("author-message-text", P.Message);
      const sig=document.getElementById("author-name-signature"); if(sig) sig.textContent=(P.field_25||"作者")+" より";
    }
  };

  function generateHazardCheckboxes(){
    const container = document.getElementById("step1-hazard-check-area");
    if (!container) return;
    container.innerHTML = "";
    const riskText = P.field_24 || "";
    let hit = 0;
    Object.keys(HAZARD_DEFS).forEach(key=>{
      if (riskText.includes(key)){
        hit++;
        const d = HAZARD_DEFS[key];
        const div = document.createElement("div");
        div.className = "hazard-check-item";
        const cid = "chk-hz-"+d.key;
        div.innerHTML = '<input type="checkbox" id="'+cid+'"><label for="'+cid+'">'+d.name+'</label>';
        container.appendChild(div);
        div.querySelector("input").addEventListener("change", e=>{
          if (e.target.checked){ if(!surHz[d.key]) surHz[d.key]=hzTile(d.key); if(surHz[d.key]){ surHz[d.key].addTo(surMap); surHz[d.key].bringToFront(); } }
          else if (surHz[d.key]) surMap.removeLayer(surHz[d.key]);
        });
      }
    });
    // 震度・液状化・地震火災・内水は国土地理院のオープンタイルが無いため外部リンクを案内
    if (/震度|液状化|火災|内水/.test(riskText)){
      const note=document.createElement("div");
      note.style.cssText="font-size:.8em;margin-top:6px;line-height:1.5;";
      note.innerHTML='震度・液状化危険度・地震火災（焼失棟数）・内水氾濫は <a href="https://wwwm.city.yokohama.lg.jp/yokohama/Portal" target="_blank" rel="noopener" style="color:#4f8b80;font-weight:bold">横浜市の「わいわい防災マップ」</a> で確認できます（外部サイト）。';
      container.appendChild(note);
    }
    if (hit===0 && !/震度|液状化|火災|内水/.test(riskText)){
      container.innerHTML = "<p style='font-size:0.8em; color:#999;'>※特に関連するハザードマップ情報はありません</p>";
    }
  }

  // ---- STEP2: 防災資源（指定緊急避難場所 / 地域防災拠点 / 災害時給水所） ----
  const RES_FILES = { shelters:"bousai_shelters.geojson", bases:"bousai_bases.geojson", water:"bousai_water.geojson" };
  let RES = null; // {shelters:[],bases:[],water:[]}
  const resLayers = { shelters:null, bases:null, water:null };
  const RES_STYLE = {
    shelters:{ color:"#2e9e5b", glyph:"避", label:"指定緊急避難場所" },
    bases:   { color:"#2f6fb0", glyph:"拠", label:"地域防災拠点" },
    water:   { color:"#0f9bb5", glyph:"水", label:"災害時給水所" }
  };
  const HAZKEY_DEFS = [
    { re:/洪水/,                     key:"flood",     label:"洪水" },
    { re:/高潮/,                     key:"hightide",  label:"高潮" },
    { re:/津波/,                     key:"tsunami",   label:"津波" },
    { re:/土砂|崖|土石流|地滑り|急傾斜/, key:"landslide", label:"土砂災害" },
    { re:/地震|震度|液状化/,          key:"quake",     label:"地震" },
    { re:/火災|火事|延焼/,            key:"fire",      label:"大規模な火事" },
    { re:/内水/,                     key:"inland",    label:"内水氾濫" }
  ];
  function hazKeysFromField(f24){
    const s=f24||"", keys=[], labels=[];
    HAZKEY_DEFS.forEach(d=>{ if(d.re.test(s)){ keys.push(d.key); labels.push(d.label); } });
    return { keys, labels };
  }
  function resDivIcon(color, glyph){
    return L.divIcon({ className:"res-pin", iconSize:[22,22], iconAnchor:[11,11],
      html:'<div style="background:'+color+';color:#fff;border:2px solid #fff;border-radius:50%;width:18px;height:18px;line-height:15px;text-align:center;font-size:10px;box-shadow:0 1px 3px rgba(0,0,0,.4)">'+glyph+'</div>' });
  }
  function distSq(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return dx*dx+dy*dy; }
  function nearest(feats, center, n){
    return feats.map(f=>({f,d:distSq(f.geometry.coordinates,center)}))
                .sort((x,y)=>x.d-y.d).slice(0,n).map(o=>o.f);
  }
  function loadResources(){
    if (RES) return Promise.resolve(RES);
    const get = name => fetch(DATA_BASE+"/"+name).then(r=>{ if(!r.ok) throw new Error(name+" "+r.status); return r.json(); });
    return Promise.all([get(RES_FILES.shelters), get(RES_FILES.bases), get(RES_FILES.water)])
      .then(([a,b,c])=>{ RES={ shelters:a.features||[], bases:b.features||[], water:c.features||[] }; return RES; });
  }
  function buildResLayer(kind, feats){
    const st=RES_STYLE[kind], grp=L.layerGroup();
    feats.forEach(f=>{
      const c=f.geometry.coordinates, p=f.properties||{};
      const extra = (kind==="water" && p.kind) ? "<br>種別: "+p.kind : "";
      L.marker([c[1],c[0]], { icon:resDivIcon(st.color, st.glyph) })
        .bindPopup("<b>"+st.label+"</b><br>"+(p.name||"")+extra+(p.address?"<br>"+p.address:""))
        .addTo(grp);
    });
    return grp;
  }
  function resetResources(){
    Object.keys(resLayers).forEach(k=>{
      if(resLayers[k] && surMap && surMap.hasLayer(resLayers[k])) surMap.removeLayer(resLayers[k]);
      resLayers[k]=null;
    });
  }
  function renderResControls(container, pick, hz){
    if(!container) return;
    container.style.display = "block"; // 親の中央寄せflexを解除して崩れ防止
    const hazNote = hz.labels.length
      ? '避難場所は「'+hz.labels.join('・')+'」に対応する場所を表示しています。'
      : '避難場所を表示しています。';
    let toggles='';
    Object.keys(RES_STYLE).forEach(k=>{
      const st=RES_STYLE[k];
      toggles+='<label class="res-toggle" for="chk-res-'+k+'">'
        +'<input type="checkbox" id="chk-res-'+k+'" checked>'
        +'<span class="res-badge" style="background:'+st.color+'">'+st.glyph+'</span>'
        +'<span>'+st.label+'（'+pick[k].length+'）</span>'
        +'</label>';
    });
    container.innerHTML =
        '<div class="res-note">'+hazNote+'<br>ピン周辺の防災資源を表示/非表示できます。</div>'
      + '<div class="res-toggle-row">'+toggles+'</div>'
      + '<div class="res-source">出典: 指定緊急避難場所（国土地理院）／地域防災拠点・災害時給水所（横浜市オープンデータ, CC BY 4.0）</div>';
    Object.keys(RES_STYLE).forEach(k=>{
      const cb=document.getElementById("chk-res-"+k);
      if(!cb) return;
      cb.addEventListener("change", e=>{
        if(!resLayers[k]) return;
        if(e.target.checked) resLayers[k].addTo(surMap); else surMap.removeLayer(resLayers[k]);
      });
    });
  }
  function showResources(){
    const container = document.getElementById("step2-resource-check-area");
    if (container) container.innerHTML='<div style="font-size:.8em;color:#888;">防災資源を読み込み中…</div>';
    const center = feature.geometry.coordinates; // [lon,lat]
    const hz = hazKeysFromField(P.field_24);
    loadResources().then(R=>{
      resetResources();
      let shelters = R.shelters;
      if (hz.keys.length) shelters = shelters.filter(f => f.properties && f.properties.haz && hz.keys.some(k=>f.properties.haz[k]));
      const pick = {
        shelters: nearest(shelters, center, 12),
        bases:    nearest(R.bases,  center, 6),
        water:    nearest(R.water,  center, 8)
      };
      Object.keys(pick).forEach(k=>{ resLayers[k]=buildResLayer(k, pick[k]); resLayers[k].addTo(surMap); });
      renderResControls(container, pick, hz);
    }).catch(err=>{
      console.error("防災資源の読込に失敗", err);
      if (container) container.innerHTML='<div style="background:#fbeec2;border-radius:8px;padding:10px 12px;font-size:.82em;color:#8a6d10;line-height:1.6;">防災資源データを読み込めませんでした（データ公開後に表示されます）。</div>';
    });
  }

  // ---- 宛名 ----
  function findPersonText(text){
    if(!text) return null;
    let t=text.replace(/[\r\n\s]+/g,"").split(/[、。.,．]/)[0].substring(0,40);
    const m=t.match(/.*?(人|者|民|方|達|学生|慶應生|生徒|たち|家族|みんな|さん|ちゃん|友|自分|ママ|パパ)/);
    return m ? m[0]+"へ" : null;
  }
  function extractAddressee(message, collage, mabling){
    return findPersonText(message) || findPersonText(collage) || findPersonText(mabling) || "地域のみんなへ";
  }

  // ---- クエスト完了 ----
  window.finishQuest = function(stepNum){
    showQuestMenu();
    const addResult=(item,text)=>{ if(item && !item.querySelector(".quest-result-text")){ const d=document.createElement("div"); d.className="quest-result-text"; d.innerHTML=text; item.appendChild(d); } };
    const enableReplay=(item,step)=>{ if(item){ item.onclick=function(){ startQuest(step); }; item.title="クリックしてもう一度確認する"; } };

    if (stepNum===1){
      const it=document.getElementById("quest-item-1"); const bt=it.querySelector("button");
      it.classList.add("completed"); it.classList.remove("active"); if(bt) bt.style.display="none";
      addResult(it, P.Mabling||"災害リスク"); enableReplay(it,1);
      const it2=document.getElementById("quest-item-2"), b2=document.getElementById("btn-step2");
      if(it2&&b2){ it2.classList.remove("locked"); it2.classList.add("active"); b2.disabled=false; b2.innerText="コラージュを鑑賞する ＞"; }
    } else if (stepNum===2){
      const it=document.getElementById("quest-item-2"); const bt=it.querySelector("button");
      it.classList.add("completed"); it.classList.remove("active"); if(bt) bt.style.display="none";
      addResult(it, P.collage||"防災行動"); enableReplay(it,2);
      const it3=document.getElementById("quest-item-3"), b3=document.getElementById("btn-step3");
      if(it3&&b3){ it3.classList.remove("locked"); it3.classList.add("active"); b3.disabled=false; b3.innerText="手紙を開く 💌"; }
    } else if (stepNum===3){
      const it=document.getElementById("quest-item-3"); const bt=document.getElementById("btn-step3");
      it.classList.add("completed"); it.classList.remove("active"); if(bt) bt.style.display="none";
      addResult(it, P.Message||"作者からのメッセージ"); enableReplay(it,3);
      const viewed=lsGet("bousai_viewed");
      if(!viewed.includes(artId)){ viewed.push(artId); localStorage.setItem("bousai_viewed", JSON.stringify(viewed)); updateHeaderStats(); }
      const post=document.getElementById("post-quest-area"); if(post) post.style.display="block";
      const guide=document.querySelector(".appreciation-guide"); if(guide) guide.style.display="none";
    }
  };

  // ---- 近くの作品（GeoJSONからクライアント側で） ----
  function riskRegex(cat){ const r = CAT_RULES.find(x => x.cat === cat); return r ? r.re : /.*/; }
  function getRiskCategory(p){ return category(p.field_24); }
  function getPhaseCategory(p){ return phasesOf(p)[0] || "other"; }
  function phaseMatch(p, phase){ return phasesOf(p).includes(phase); }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

  window.closeNearbyOverlay = function(){ document.getElementById("nearby-overlay").style.display="none"; };

  window.goToNearbyWorks = function(){
    const overlay=document.getElementById("nearby-overlay");
    if(overlay){ overlay.style.display="flex"; void overlay.offsetWidth; }
    setTimeout(()=>{
      if(!nearMap){
        const c=feature.geometry.coordinates;
        nearMap=L.map("nearby-map-view",{center:[c[1],c[0]],zoom:13,zoomControl:false});
        baseTile().addTo(nearMap);
        nearMarkers=L.layerGroup().addTo(nearMap);
      }
      setTimeout(()=>nearMap.invalidateSize(),100);
      loadDualRecommendation();
    }, 300);
  };

  function loadDualRecommendation(){
    const gridRisk=document.getElementById("grid-risk"), gridTime=document.getElementById("grid-time");
    const myRisk=getRiskCategory(P), myPhase=getPhaseCategory(P);
    const rx=riskRegex(myRisk);
    let riskC = ALL.filter(f=>String(f.properties.id)!==String(artId) && rx.test(f.properties.field_24||""));
    shuffle(riskC); const riskF=riskC.slice(0,2);
    const used=riskF.map(f=>f.properties.id);
    let timeC = ALL.filter(f=>String(f.properties.id)!==String(artId) && !used.includes(f.properties.id) && phaseMatch(f.properties,myPhase));
    shuffle(timeC); const timeF=timeC.slice(0,2);

    gridRisk.innerHTML=""; gridTime.innerHTML="";
    if(nearMarkers) nearMarkers.clearLayers();
    let n=1; const bounds=[];
    const addCard=(container,f,num,badgeClass,color)=>{
      const p=f.properties, oid=p.id;
      const img=(p.images&&p.images[0])?DATA_BASE+"/"+p.images[0]:PLACEHOLDER;
      const item=document.createElement("div");
      item.className="nearby-item compact"; item.style.borderColor=color;
      item.onclick=()=>{ window.location.href="detail.html?id="+oid; };
      item.innerHTML='<div class="compact-thumb-box"><div class="number-badge-float '+badgeClass+'">'+num+'</div>'
        +'<img class="compact-thumb" src="'+img+'" onerror="this.style.visibility=\'hidden\'"></div>'
        +'<div class="compact-info"><div class="compact-author">👤 '+(p.field_25||"匿名")+'</div></div>';
      container.appendChild(item);
      const c=f.geometry&&f.geometry.coordinates;
      if(c){ L.marker([c[1],c[0]],{icon:numIcon(num,color)}).addTo(nearMarkers); bounds.push([c[1],c[0]]); }
    };
    if(riskF.length) riskF.forEach(f=>addCard(gridRisk,f,n++,"badge-risk","#EE8972"));
    else gridRisk.innerHTML="<p style='font-size:0.8em; color:#999; padding:5px;'>該当なし</p>";
    if(timeF.length) timeF.forEach(f=>addCard(gridTime,f,n++,"badge-time","#6BAA9F"));
    else gridTime.innerHTML="<p style='font-size:0.8em; color:#999; padding:5px;'>該当なし</p>";
    if(nearMap && bounds.length) nearMap.fitBounds(L.latLngBounds(bounds).pad(0.3),{maxZoom:15});
  }

  // ---- 最終CTA ----
  window.showFinalCTA = function(){
    document.getElementById("nearby-overlay").style.display="none";
    document.getElementById("final-cta-overlay").style.display="flex";
    const total = ALL.length;
    const span=document.getElementById("total-art-count");
    let cur=0; const timer=setInterval(()=>{ cur+=Math.ceil(total/20); if(cur>=total){ cur=total; clearInterval(timer);} if(span) span.textContent=cur; }, 50);
    const bg=document.getElementById("final-background"); if(bg) bg.innerHTML="";
    const pool = shuffle(ALL.filter(f=>String(f.properties.id)!==String(artId) && f.properties.Message)).slice(0,10);
    pool.forEach((f,i)=>{
      const p=f.properties;
      let to="地域のみんなへ"; const idx=(p.Message||"").indexOf("へ"); if(idx>0&&idx<15) to=p.Message.substring(0,idx+1);
      const img=(p.images&&p.images[0])?DATA_BASE+"/"+p.images[0]:PLACEHOLDER;
      createFloatingElement(bg, img, "💭 "+to, i);
    });
  };
  function createFloatingElement(container, imgSrc, text, index){
    if(!container) return;
    const div=document.createElement("div"); div.className="floating-card";
    div.innerHTML='<div class="floating-bubble">'+text+'</div><img src="'+imgSrc+'" class="floating-img" onerror="this.style.visibility=\'hidden\'">';
    const left = (index%2===0) ? (Math.floor(Math.random()*15)+10) : (Math.floor(Math.random()*15)+75);
    div.style.left=left+"%"; div.style.animationDuration="15s"; div.style.animationDelay=(index*3.0)+"s";
    container.appendChild(div);
  }

  // ---- ヘッダー統計・リアクション ----
  function updateHeaderStats(){
    document.getElementById("header-heart-count").textContent = lsGet("bousai_hearts").length;
    document.getElementById("header-action-count").textContent = lsGet("bousai_actions").length;
    const v=document.getElementById("view-count");
    if(v) v.textContent = lsGet("bousai_viewed").length + "/" + (ALL.length||"?");
  }
  function setupReactionButtons(){
    const bh=document.getElementById("btn-heart"), ba=document.getElementById("btn-action");
    updateHeaderStats();
    if(!bh||!ba) return;
    if(lsGet("bousai_hearts").includes(artId)){ bh.classList.add("active"); bh.innerHTML='<span class="emoji">💖</span> 想いに共感した'; }
    if(lsGet("bousai_actions").includes(artId)){ ba.classList.add("active"); ba.innerHTML='<span class="emoji">⭐</span> 防災行動を実践したい'; }
    bh.addEventListener("click", ()=>{
      let l=lsGet("bousai_hearts");
      if(l.includes(artId)){ l=l.filter(x=>x!==artId); bh.classList.remove("active"); bh.innerHTML='<span class="emoji">🤍</span> 想いに共感した'; }
      else { l.push(artId); bh.classList.add("active"); bh.innerHTML='<span class="emoji">💖</span> 想いに共感した'; }
      localStorage.setItem("bousai_hearts", JSON.stringify(l)); updateHeaderStats();
    });
    ba.addEventListener("click", ()=>{
      let l=lsGet("bousai_actions");
      if(l.includes(artId)){ l=l.filter(x=>x!==artId); ba.classList.remove("active"); ba.innerHTML='<span class="emoji">⭐</span> 防災行動を実践したい'; }
      else { l.push(artId); ba.classList.add("active"); ba.innerHTML='<span class="emoji">✨</span> 防災行動を実践したい'; }
      localStorage.setItem("bousai_actions", JSON.stringify(l)); updateHeaderStats();
    });
  }

  const findNearbyBtn=document.getElementById("find-nearby-btn");
  if(findNearbyBtn) findNearbyBtn.addEventListener("click", window.goToNearbyWorks);

  // ---- 詳細チュートリアル ----
  function setupDetailTutorial(){
    const overlay=document.getElementById("detail-tutorial-overlay");
    const imgEl=document.getElementById("dt-img"), titleEl=document.getElementById("dt-title"), descEl=document.getElementById("dt-desc");
    const nextBtn=document.getElementById("dt-next-btn"), skipBtn=document.getElementById("dt-skip-btn");
    const dots=document.querySelectorAll(".dt-dot"), helpBtn=document.getElementById("detail-help-btn");
    if(!overlay) return;
    const steps=[
      {title:"ようこそ", img:"tutorial_d_01.png", desc:"鑑賞するアート作品には、<br>作者が見つけたこの場所の<strong>災害リスク</strong>と<br>それに対する<strong>防災行動</strong>が隠されています。"},
      {title:"災害リスク", img:"tutorial_d_02.png", desc:"背景の模様には<strong>『マーブリング』技法</strong>が使われ、作者が見つけた災害リスクが表現されています。"},
      {title:"防災行動", img:"tutorial_d_03.png", desc:"背景の模様に図形を貼る<strong>『コラージュ』技法</strong>が使われ、作者が伝えたい防災行動が表現されています。"},
      {title:"鑑賞のしかた", img:"tutorial_d_04.png", desc:"上から順番に鑑賞を進め、作品に込められた<strong>作者のメッセージ</strong>を受け取りましょう。"}
    ];
    let page=0;
    function update(){
      const s=steps[page];
      if(titleEl) titleEl.innerHTML=s.title; if(descEl) descEl.innerHTML=s.desc;
      if(imgEl){ imgEl.src=s.img; imgEl.onerror=()=>{ imgEl.style.visibility="hidden"; }; imgEl.onload=()=>{ imgEl.style.visibility="visible"; }; }
      dots.forEach((d,i)=>d.classList.toggle("active", i===page));
      if(nextBtn) nextBtn.innerText = (page===steps.length-1)?"完了":"次へ ＞";
    }
    if(!localStorage.getItem("has_seen_detail_tutorial")){ update(); overlay.style.display="flex"; } else overlay.style.display="none";
    if(helpBtn) helpBtn.addEventListener("click", ()=>{ page=0; update(); overlay.style.display="flex"; });
    if(skipBtn) skipBtn.onclick=()=>{ localStorage.setItem("has_seen_detail_tutorial","true"); overlay.style.display="none"; };
    if(nextBtn) nextBtn.onclick=()=>{ if(page<steps.length-1){ page++; update(); } else { localStorage.setItem("has_seen_detail_tutorial","true"); overlay.style.display="none"; } };
  }

});
