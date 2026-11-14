/* =========================================================
   作品ページ（矢上小版・授業案 rev3）
   作品の画像・タイトル・伝えたいこと・場所・災害・いつの行動か・作者の番号を1画面で見せる。
   （授業案 rev3：「共感した」「実践したい」のボタンは使わない）
   「前の作品／次の作品」は、同じ場所（?place= があるとき）の作品を番号の順に移動する（発表用）。
   ========================================================= */
document.addEventListener("DOMContentLoaded", function () {

  const DATA_BASE = (window.YAGAMI_CONFIG && window.YAGAMI_CONFIG.WORKER_URL) || "https://yagami-submit.kazuki131214.workers.dev";
  const HIDDEN_IDS = [];
  const PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  const rb = (s) => window.rubyHTML ? window.rubyHTML(s) : s;
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } };

  const urlParams = new URLSearchParams(window.location.search);
  const artId = urlParams.get("id");
  const listPlace = urlParams.get("place");   // マップで場所を選んでいたときだけ入る
  const mapUrl = "index.html" + (listPlace ? "?place=" + encodeURIComponent(listPlace) : "");
  document.getElementById("back-to-map-btn").onclick = () => { window.location.href = mapUrl; };
  setupDetailTutorial();
  if (!artId) { alert("作品が見つかりませんでした。マップに戻ります。"); window.location.href = mapUrl; return; }

  // 災害の名前（保存されている正式名 → 画面の言葉）
  const HAZARD_LABELS = {
    "洪水（外水氾濫）": "洪水{こうずい}（外水氾濫{がいすいはんらん}）",
    "高潮": "高潮{たかしお}",
    "内水氾濫": "水{みず}が街{まち}からあふれる（内水氾濫{ないすいはんらん}）",
    "土砂災害（急傾斜地の崩壊）": "土砂{どしゃ}災害{さいがい}（急傾斜地{きゅうけいしゃち}の崩壊{ほうかい}）",
    "地震の揺れ（震度）": "地震{じしん}の揺{ゆ}れ（震度{しんど}）"
  };
  // 国土地理院の重ねるハザードマップ（作品が選んだ災害だけボタンを出す）
  const HZ = "https://disaportaldata.gsi.go.jp/raster/";
  const HZ_DEFS = [
    { re:/洪水/, key:"flood_l2", label:"洪水{こうずい}", url:HZ+"01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png" },
    { re:/高潮/, key:"hightide", label:"高潮{たかしお}", url:HZ+"03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png" },
    { re:/土砂|急傾斜/, key:"kyukei", label:"土砂{どしゃ}災害{さいがい}", url:HZ+"05_kyukeishakeikaikuiki/{z}/{x}/{y}.png" }
  ];

  let ALL = [], feature = null, P = null;

  fetch(DATA_BASE + "/artworks", { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(gj => {
      ALL = gj.features.filter(f => f.properties && f.properties.id && !HIDDEN_IDS.includes(f.properties.id));
      feature = ALL.find(f => String(f.properties.id) === String(artId));
      if (!feature) { alert("作品が見つかりませんでした。マップに戻ります。"); window.location.href = mapUrl; return; }
      P = feature.properties;
      markViewed();
      renderArtwork();
      renderMap();
      setupPrevNext();
      updateHeaderStats();
    })
    .catch(err => { console.error("作品データ読込失敗", err); alert("作品データを読み込めませんでした。"); });

  function placeOf(f) {
    const c = f.geometry && f.geometry.coordinates;
    return window.yagamiPlaceOf(f.properties.place, c && c[1], c && c[0]);
  }

  function renderArtwork() {
    const img = document.getElementById("art-image");
    img.src = (P.images && P.images[0]) ? DATA_BASE + "/" + P.images[0] : PLACEHOLDER;
    img.onerror = function () { this.style.visibility = "hidden"; };
    document.getElementById("art-title").textContent = P.Message || "";
    // 旧データ（伝えたいことがない作品）は、マーブリング・コラージュの説明があればそれを出す
    const body = P.Body || [P.Mabling, P.collage].filter(Boolean).join("\n");
    const bodyEl = document.getElementById("art-body");
    bodyEl.textContent = body || "";
    // 3行に入りきらないときは「全文を見る」で全部を出す（右側をスクロールさせないため）
    setTimeout(() => {
      if (!body || bodyEl.scrollHeight <= bodyEl.clientHeight + 2) return;
      const more = document.createElement("button");
      more.type = "button"; more.className = "dv-more";
      more.innerHTML = rb("▼ 全文{ぜんぶん}を見{み}る");
      more.onclick = () => {
        const ov = document.createElement("div");
        ov.className = "dv-full";
        ov.innerHTML = '<div class="dv-full-card"><div class="dv-card-head">' + rb("💬 この作品{さくひん}で伝{つた}えたいこと") + '</div><p class="dv-full-text" data-user-text></p><button type="button" class="dv-nav-btn primary">' + rb("とじる") + '</button></div>';
        ov.querySelector(".dv-full-text").textContent = body;
        ov.onclick = (e) => { if (e.target === ov || e.target.closest("button")) ov.remove(); };
        document.body.appendChild(ov);
      };
      bodyEl.insertAdjacentElement("afterend", more);
    }, 300);
    if (!body) document.getElementById("body-card").style.display = "none";
    const pl = placeOf(feature);
    document.getElementById("art-place").innerHTML = pl ? rb(pl.name) : "—";
    const hz = String(P.field_24 || "").split(/[,、]\s*/).map(s => s.trim()).filter(Boolean);
    document.getElementById("art-hazards").innerHTML = hz.length ? hz.map(h => '<span class="dv-tag">' + rb(HAZARD_LABELS[h] || esc(h)) + '</span>').join("") : "—";
    const ph = String(P.field_23 || "").split(/[,、]\s*/).map(s => s.trim()).filter(Boolean);
    document.getElementById("art-phase").innerHTML = ph.length ? ph.map(v => '<span class="dv-tag">' + rb(window.yagamiPhaseLabel(v)) + '</span>').join("") : "—";
    document.getElementById("art-number").textContent = P.field_25 || "—";
  }

  function renderMap() {
    const c = feature.geometry.coordinates;
    const pl = placeOf(feature);
    const center = pl ? [pl.lat, pl.lon] : [c[1], c[0]];
    const map = L.map("surrounding-map", { center, zoom: 16, zoomControl: true, attributionControl: true });
    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "地理院タイル" }).addTo(map);
    const color = pl ? pl.color : "#4f8b80";
    L.marker(center, { icon: L.divIcon({ className: "dv-pin", html: '<span style="background:' + color + '"></span>', iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(map);
    const box = document.getElementById("hz-chips");
    // 作品が選んだ災害のハザードマップを、ボタン1つでまとめて重ねる／外す（右側をスクロールさせないため）
    const defs = HZ_DEFS.filter(d => d.re.test(P.field_24 || ""));
    if (defs.length) {
      const layers = defs.map(d => L.tileLayer(d.url, { maxZoom: 17, opacity: defs.length > 1 ? .55 : .7 }));
      const names = defs.map(d => d.label).join("・");
      const b = document.createElement("button");
      b.type = "button"; b.className = "dv-hz-chip";
      const label = (on) => (on ? "✓ " : "🗺️ ") + rb("ハザードマップ（") + rb(names) + rb(on ? "）を重{かさ}ねています" : "）を重{かさ}ねる");
      b.innerHTML = label(false);
      let on = false;
      b.onclick = () => {
        on = !on;
        layers.forEach(l => on ? l.addTo(map) : map.removeLayer(l));
        b.classList.toggle("on", on);
        b.innerHTML = label(on);
      };
      box.appendChild(b);
    }
    // 内水氾濫は国土地理院のタイルがないので、地図に重ねる代わりに、わいわい防災マップ（内水）へのリンクを出す
    if (/内水/.test(P.field_24 || "")) {
      const note = document.createElement("div");
      note.className = "dv-hz-note";
      note.innerHTML = rb("「水{みず}が街{まち}からあふれる（内水氾濫{ないすいはんらん}）」は、") +
        '<a href="https://wwwm.city.yokohama.lg.jp/yokohama/Map?mid=65&mpx=139.65512&mpy=35.54543&mps=10000&mtp=dm&gprj=3" target="_blank" rel="noopener">' + rb("横浜市{よこはまし}の「わいわい防災{ぼうさい}マップ」") + "</a>" +
        rb("で確{たし}かめられます（ほかのサイトがひらきます）。");
      box.appendChild(note);
    }
    if (!box.children.length) box.innerHTML = '<span class="dv-hz-none">' + rb("この作品{さくひん}の災害{さいがい}は、ここでは重{かさ}ねられません") + "</span>";
    setTimeout(() => map.invalidateSize(), 200);
  }

  // ---- 前の作品・次の作品（同じ場所の中を番号の順に） ----
  function setupPrevNext() {
    const curPlace = listPlace && window.yagamiPlace(listPlace) ? listPlace : null;
    const list = ALL.filter(f => { if (!curPlace) return true; const q = placeOf(f); return q && q.id === curPlace; })
      .sort((a, b) => String(a.properties.field_25 || "9999").localeCompare(String(b.properties.field_25 || "9999")) || (Number(a.properties.id) - Number(b.properties.id)));
    const i = list.findIndex(f => String(f.properties.id) === String(artId));
    const prev = document.getElementById("prev-btn"), next = document.getElementById("next-btn"), pos = document.getElementById("nav-pos");
    const go = (f) => { window.location.href = "detail.html?id=" + f.properties.id + (curPlace ? "&place=" + curPlace : ""); };
    if (i < 0 || list.length < 2) { prev.style.visibility = "hidden"; next.style.visibility = "hidden"; pos.textContent = ""; return; }
    pos.textContent = (i + 1) + " / " + list.length;
    if (i > 0) prev.onclick = () => go(list[i - 1]); else prev.disabled = true;
    if (i < list.length - 1) next.onclick = () => go(list[i + 1]); else next.disabled = true;
  }

  // ---- 鑑賞済み・ヘッダー・リアクション ----
  function markViewed() {
    const v = lsGet("bousai_viewed");
    if (!v.includes(artId)) { v.push(artId); localStorage.setItem("bousai_viewed", JSON.stringify(v)); }
  }
  function updateHeaderStats() {
    const v = document.getElementById("view-count");
    if (v) v.textContent = lsGet("bousai_viewed").filter(id => ALL.some(f => String(f.properties.id) === String(id))).length + "/" + (ALL.length || "?");
  }
  // ---- 使い方（3ページ） ----
  function setupDetailTutorial() {
    const overlay = document.getElementById("detail-tutorial-overlay");
    const titleEl = document.getElementById("dt-title"), descEl = document.getElementById("dt-desc");
    const nextBtn = document.getElementById("dt-next-btn"), skipBtn = document.getElementById("dt-skip-btn");
    const dots = document.querySelectorAll(".dt-dot"), helpBtn = document.getElementById("detail-help-btn");
    if (!overlay) return;
    const steps = [
      { img: "detail_guide_01.jpg?v=1", title: "作品{さくひん}の見方{みかた}", desc: "背景{はいけい}の<strong>マーブリング</strong>は、その場所{ばしょ}の<strong>災害{さいがい}リスク</strong>を、<br>上{うえ}に貼{は}った<strong>コラージュ</strong>（スタンプ）は、<strong>防災行動{ぼうさいこうどう}</strong>を表{あらわ}しています。" },
      { img: "detail_guide_02.jpg?v=1", title: "作者{さくしゃ}のメッセージ", desc: "作品{さくひん}のとなりには、タイトルと<strong>この作品{さくひん}で伝{つた}えたいこと</strong>、<br><strong>作品{さくひん}の情報{じょうほう}</strong>（場所{ばしょ}・災害{さいがい}・いつの行動{こうどう}・作者{さくしゃ}）が出{で}ています。" },
      { img: "detail_guide_03.jpg?v=1", title: "この場所{ばしょ}の危険性{きけんせい}", desc: "「ハザードマップを重{かさ}ねる」を押{お}すと、作品{さくひん}がハザードマップに重{かさ}なります。<br>「次{つぎ}の作品{さくひん}」ボタンで、同{おな}じ場所{ばしょ}をテーマにした作品{さくひん}を順番{じゅんばん}に見{み}ることができます。" }
    ];
    let page = 0;
    function update() {
      const s = steps[page];
      titleEl.innerHTML = rb(s.title); descEl.innerHTML = rb(s.desc);
      const im = document.getElementById("dt-img");
      if (im) { im.style.visibility = "hidden"; im.onload = () => { im.style.visibility = "visible"; }; im.onerror = () => { im.style.visibility = "hidden"; }; im.src = s.img; im.onclick = () => { if (page < steps.length - 1) { page++; update(); } }; }
      dots.forEach((d, i) => d.classList.toggle("active", i === page));
      nextBtn.innerText = (page === steps.length - 1) ? "とじる" : "つぎへ ＞";
    }
    const close = () => { try { localStorage.setItem("has_seen_detail_tutorial_rev3", "true"); } catch (e) {} overlay.style.display = "none"; };
    if (!localStorage.getItem("has_seen_detail_tutorial_rev3")) { update(); overlay.style.display = "flex"; } else overlay.style.display = "none";
    if (helpBtn) helpBtn.addEventListener("click", () => { page = 0; update(); overlay.style.display = "flex"; });
    nextBtn.onclick = () => { if (page < steps.length - 1) { page++; update(); } else close(); };
  }
});
