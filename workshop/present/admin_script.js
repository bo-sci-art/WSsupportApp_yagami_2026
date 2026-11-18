// 管理画面（先生用）：作品の一覧・削除・非公開・公開に戻す・確認と修正（PUT /artworks/:id）
// 合言葉（ADMIN_KEY）はコードに書かない。入力した値を localStorage（このPCで覚える）か sessionStorage（タブを閉じたら忘れる）に入れるだけ。
(function () {
  "use strict";

  var WORKER = (window.YAGAMI_CONFIG && window.YAGAMI_CONFIG.WORKER_URL) || "";
  var KEY_NAME = "yagamiAdminKey";
  var OPS = {
    delete: { label: "削除", verb: "削除します", method: "DELETE", btnClass: "btn-danger" },
    hide:   { label: "非公開", verb: "非公開にします", method: "PATCH", status: "hidden", btnClass: "btn-primary" },
    show:   { label: "公開", verb: "公開に戻します", method: "PATCH", status: "approved", btnClass: "btn-primary" }
  };

  var $ = function (id) { return document.getElementById(id); };
  var items = [];             // /export の作品（properties に lat/lon を足したもの）
  var selected = new Set();   // 選んでいる作品の id（文字列）
  var pendingOp = null;       // 確認パネルで聞いている操作
  var running = false;

  // ---------------- 合言葉の保存 ----------------
  function storedKey() {
    try { return localStorage.getItem(KEY_NAME) || sessionStorage.getItem(KEY_NAME) || ""; } catch (e) { return ""; }
  }
  function saveKey(key, remember) {
    try {
      if (remember) { localStorage.setItem(KEY_NAME, key); sessionStorage.removeItem(KEY_NAME); }
      else { sessionStorage.setItem(KEY_NAME, key); localStorage.removeItem(KEY_NAME); }
    } catch (e) {}
  }
  function forgetKey() {
    try { localStorage.removeItem(KEY_NAME); sessionStorage.removeItem(KEY_NAME); } catch (e) {}
  }

  // ---------------- Worker を呼ぶ ----------------
  function api(method, path, key, body) {
    var opt = { method: method, headers: { "Authorization": "Bearer " + key }, cache: "no-store" };
    if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    return fetch(WORKER + path, opt);
  }

  function loadList(key) {
    return api("GET", "/export", key).then(function (r) {
      if (r.status === 401) { var e = new Error("unauthorized"); e.unauthorized = true; throw e; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (gj) {
      items = (gj.features || []).map(function (f) {
        var p = Object.assign({}, f.properties || {});
        var c = (f.geometry && f.geometry.coordinates) || [];
        p.lon = c[0]; p.lat = c[1];
        return p;
      }).sort(function (a, b) { return Number(a.id) - Number(b.id); });
      // もう無い作品の選択は外す
      var ids = new Set(items.map(function (p) { return String(p.id); }));
      selected.forEach(function (id) { if (!ids.has(id)) selected.delete(id); });
    });
  }

  // ---------------- 画面の切り替え ----------------
  function showLogin(message) {
    $("listView").hidden = true;
    $("actionBar").hidden = true;
    $("logoutBtn").hidden = true;
    $("loginView").hidden = false;
    $("loginError").hidden = !message;
    $("loginError").textContent = message || "";
    $("keyInput").value = "";
    $("keyInput").focus();
  }
  function showList() {
    $("loginView").hidden = true;
    $("listView").hidden = false;
    $("actionBar").hidden = false;
    $("logoutBtn").hidden = false;
    render();
  }
  function unauthorized() {
    forgetKey();
    closeConfirm(true);
    closeEdit(true);
    closeDialog(false);
    showLogin("合言葉がちがいます（または変わりました）。もう一度入れてください。");
  }

  // ---------------- 表示用の言葉 ----------------
  function placeName(p) {
    var pl = window.yagamiPlaceOf ? window.yagamiPlaceOf(p.place, Number(p.lat), Number(p.lon)) : null;
    if (pl) return pl.plain;
    return p.place || "（なし）";
  }
  function stripRuby(s) { return String(s || "").replace(/\{[^}]*\}/g, ""); }
  function listOf(v) { return String(v || "").split(/[,、]\s*/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function phaseName(v) {
    return listOf(v).map(function (x) { return window.yagamiPhaseLabel ? stripRuby(window.yagamiPhaseLabel(x)) : x; }).join("・");
  }
  function jstDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    var j = new Date(d.getTime() + 9 * 3600e3);
    var z = function (n) { return (n < 10 ? "0" : "") + n; };
    return j.getUTCFullYear() + "/" + z(j.getUTCMonth() + 1) + "/" + z(j.getUTCDate()) + " " + z(j.getUTCHours()) + ":" + z(j.getUTCMinutes());
  }
  function imageURL(p) {
    var img = p.images && p.images[0];
    if (!img) return "";
    return /^https?:/.test(img) ? img : WORKER + "/" + String(img).replace(/^\/+/, "");
  }
  function itemLabel(p) {
    return "id " + p.id + "　" + (p.field_25 || "番号なし") + "　「" + (p.Message || "（タイトルなし）") + "」";
  }

  // ---------------- 一覧 ----------------
  function visibleItems() {
    var place = $("placeFilter").value;
    var status = $("statusFilter").value;
    var q = $("searchInput").value.trim().toLowerCase();
    return items.filter(function (p) {
      if (place) {
        var pl = window.yagamiPlaceOf ? window.yagamiPlaceOf(p.place, Number(p.lat), Number(p.lon)) : null;
        if (!pl || pl.id !== place) return false;
      }
      if (status === "hidden" && p.status !== "hidden") return false;
      if (status === "approved" && p.status === "hidden") return false;
      if (q) {
        var hay = (String(p.field_25 || "") + " " + String(p.Message || "")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function render() {
    var list = visibleItems();
    var tbody = $("rows");
    tbody.textContent = "";
    list.forEach(function (p) {
      var id = String(p.id);
      var hidden = p.status === "hidden";
      var tr = document.createElement("tr");
      tr.dataset.id = id;
      if (hidden) tr.classList.add("is-hidden");
      if (selected.has(id)) tr.classList.add("selected");

      var tdChk = cell("c-chk");
      var chk = document.createElement("input");
      chk.type = "checkbox"; chk.checked = selected.has(id); chk.setAttribute("aria-label", "id " + id + " を選ぶ");
      chk.addEventListener("click", function (ev) { ev.stopPropagation(); toggle(id, chk.checked); });
      tdChk.appendChild(chk);

      var tdImg = cell("c-img");
      var src = imageURL(p);
      if (src) { var img = document.createElement("img"); img.loading = "lazy"; img.alt = ""; img.src = src; tdImg.appendChild(img); }

      var tdStatus = cell("c-status");
      var badge = document.createElement("span");
      badge.className = "badge " + (hidden ? "badge-off" : "badge-on");
      badge.textContent = hidden ? "非公開" : "公開中";
      tdStatus.appendChild(badge);

      tr.appendChild(tdChk);
      tr.appendChild(tdImg);
      tr.appendChild(cell("c-id", id));
      tr.appendChild(cell("c-num", p.field_25 || ""));
      tr.appendChild(cell("td-title", p.Message || "（タイトルなし）"));
      tr.appendChild(cell("c-place", placeName(p)));
      tr.appendChild(cell("c-phase", phaseName(p.field_23)));
      tr.appendChild(cell("c-date", jstDate(p.created_at)));
      tr.appendChild(tdStatus);
      var tdUpd = cell("c-upd");
      if (p.updated_at) {
        tr.classList.add("is-edited");
        var ub = document.createElement("span"); ub.className = "badge badge-edited"; ub.textContent = "修正済み";
        var ud = document.createElement("div"); ud.className = "upd-date"; ud.textContent = jstDate(p.updated_at);
        tdUpd.appendChild(ub); tdUpd.appendChild(ud);
      } else tdUpd.textContent = "—";
      tr.appendChild(tdUpd);
      var tdEdit = cell("c-edit");
      var eb = document.createElement("button");
      eb.type = "button"; eb.className = "btn btn-edit"; eb.textContent = "確認・修正";
      eb.setAttribute("aria-label", "id " + id + " を確認・修正する");
      // ボタンを押したときは、行のチェックをつけない
      eb.addEventListener("click", function (ev) { ev.stopPropagation(); openEdit(id); });
      tdEdit.appendChild(eb);
      tr.appendChild(tdEdit);
      tr.addEventListener("click", function () { toggle(id, !selected.has(id)); });
      tbody.appendChild(tr);
    });

    var nHidden = items.filter(function (p) { return p.status === "hidden"; }).length;
    $("countInfo").textContent = "全" + items.length + "件（公開中 " + (items.length - nHidden) + "・非公開 " + nHidden + "）" +
      (list.length !== items.length ? "／表示 " + list.length + "件" : "");
    $("emptyMsg").hidden = list.length > 0;
    $("emptyMsg").textContent = items.length ? "条件に合う作品がありません。" : "作品がありません。";
    updateSelection();
  }

  function cell(cls, text) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    if (text !== undefined) td.textContent = text;
    return td;
  }

  function toggle(id, on) {
    if (on) selected.add(id); else selected.delete(id);
    var tr = $("rows").querySelector('tr[data-id="' + id + '"]');
    if (tr) { tr.classList.toggle("selected", on); tr.querySelector("input").checked = on; }
    updateSelection();
  }

  function updateSelection() {
    var vis = visibleItems();
    var nVisSel = vis.filter(function (p) { return selected.has(String(p.id)); }).length;
    $("checkAll").checked = vis.length > 0 && nVisSel === vis.length;
    $("checkAll").indeterminate = nVisSel > 0 && nVisSel < vis.length;
    $("selInfo").textContent = selected.size + "件を選んでいます" +
      (selected.size > nVisSel ? "（うち " + (selected.size - nVisSel) + "件は今の絞り込みでは見えていません）" : "");
    document.querySelectorAll(".act-btns button").forEach(function (b) { b.disabled = selected.size === 0 || running; });
  }

  function selectVisible(on) {
    visibleItems().forEach(function (p) { if (on) selected.add(String(p.id)); else selected.delete(String(p.id)); });
    render();
  }

  function showResult(text, ok) {
    var el = $("resultMsg");
    el.textContent = text;
    el.className = "adm-result " + (ok ? "ok" : "ng");
    el.hidden = false;
    window.scrollTo(0, 0);
  }

  // ---------------- 確認パネル ----------------
  function openConfirm(opKey) {
    var op = OPS[opKey];
    var targets = items.filter(function (p) { return selected.has(String(p.id)); });
    if (!targets.length) return;
    pendingOp = { key: opKey, targets: targets };
    $("confirmTitle").textContent = targets.length + "件を" + op.verb + "。よろしいですか？";
    $("confirmWarn").hidden = opKey !== "delete";
    var ul = $("confirmList");
    ul.textContent = "";
    targets.forEach(function (p) {
      var li = document.createElement("li");
      li.textContent = itemLabel(p) + (p.status === "hidden" ? "（今は非公開）" : "");
      ul.appendChild(li);
    });
    $("confirmProgress").hidden = true;
    $("confirmOk").className = "btn " + op.btnClass;
    $("confirmOk").textContent = op.label === "削除" ? "削除する" : op.label === "非公開" ? "非公開にする" : "公開に戻す";
    $("confirmOk").disabled = false;
    $("confirmCancel").disabled = false;
    $("confirmOverlay").hidden = false;
    $("confirmCancel").focus();
  }
  function closeConfirm(force) {
    if (running && !force) return;
    $("confirmOverlay").hidden = true;
    pendingOp = null;
  }

  // 1件ずつ順番に呼ぶ
  function runOp() {
    if (!pendingOp || running) return;
    var op = OPS[pendingOp.key];
    var targets = pendingOp.targets.slice();
    var key = storedKey();
    var ok = 0, ng = 0, failed = [];
    running = true;
    $("resultMsg").hidden = true;
    $("confirmOk").disabled = true;
    $("confirmCancel").disabled = true;
    $("confirmProgress").hidden = false;
    updateSelection();

    var i = 0;
    function next() {
      if (i >= targets.length) return finish();
      var p = targets[i++];
      $("confirmProgress").textContent = "実行中… " + i + " / " + targets.length;
      var body = op.method === "PATCH" ? { status: op.status } : null;
      return api(op.method, "/artworks/" + encodeURIComponent(p.id), key, body).then(function (r) {
        if (r.status === 401) { var e = new Error("unauthorized"); e.unauthorized = true; throw e; }
        if (r.ok) { ok++; selected.delete(String(p.id)); }
        else { ng++; failed.push("id " + p.id + "（HTTP " + r.status + "）"); }
      }, function () {
        ng++; failed.push("id " + p.id + "（通信できませんでした）");
      }).then(next);
    }
    function finish() {
      running = false;
      closeConfirm(true);
      var text = op.label + "：" + ok + "件成功・" + ng + "件失敗" + (failed.length ? "　失敗：" + failed.join("、") : "");
      showResult(text, ng === 0);
      return reload();
    }
    next().catch(function (e) {
      running = false;
      if (e && e.unauthorized) unauthorized();
      else { closeConfirm(true); showResult("エラー：" + (e && e.message || e), false); reload(); }
    });
  }

  function reload() {
    var key = storedKey();
    if (!key) { showLogin(); return Promise.resolve(); }
    $("reloadBtn").disabled = true;
    return loadList(key).then(function () { showList(); }).catch(function (e) {
      if (e && e.unauthorized) unauthorized();
      else { showList(); showResult("一覧を読めませんでした（" + (e && e.message || e) + "）。Worker の URL：" + WORKER, false); }
    }).then(function () { $("reloadBtn").disabled = false; });
  }

  // ---------------- ページの中の確認（confirm() のかわり） ----------------
  var dlgResolve = null;
  function askDialog(title, bodyHTML, okLabel, okClass) {
    $("dlgTitle").textContent = title;
    $("dlgBody").innerHTML = bodyHTML || "";
    $("dlgOk").textContent = okLabel || "OK";
    $("dlgOk").className = "btn " + (okClass || "btn-primary");
    $("dlgOverlay").hidden = false;
    $("dlgOk").focus();
    return new Promise(function (resolve) { dlgResolve = resolve; });
  }
  function closeDialog(result) {
    if ($("dlgOverlay").hidden) return;
    $("dlgOverlay").hidden = true;
    var r = dlgResolve; dlgResolve = null;
    if (r) r(result);
  }

  // ---------------- 確認・修正パネル ----------------
  // 見たハザードマップ（保存する正式名 → 画面の言葉）。detail_script.js の HAZARD_LABELS と同じ
  var HAZARDS = [
    ["洪水（外水氾濫）", "洪水{こうずい}（外水氾濫{がいすいはんらん}）"],
    ["高潮", "高潮{たかしお}"],
    ["内水氾濫", "水{みず}が街{まち}からあふれる（内水氾濫{ないすいはんらん}）"],
    ["土砂災害（急傾斜地の崩壊）", "土砂{どしゃ}災害{さいがい}（急傾斜地{きゅうけいしゃち}の崩壊{ほうかい}）"],
    ["地震の揺れ（震度）", "地震{じしん}の揺{ゆ}れ（震度{しんど}）"]
  ];
  var FIELD_NAMES = { field_25: "出席番号", Message: "タイトル", Body: "伝えたいこと", place: "場所", field_23: "いつの行動か", field_24: "見たハザードマップ" };
  var MAX = { Message: 300, Body: 1000 };
  var editing = null;     // { id, orig: {...} }
  var saving = false;

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function rubyHTML(t) { return window.rubyHTML ? window.rubyHTML(esc(t)) : esc(t); }
  function placeOfItem(p) { return window.yagamiPlaceOf ? window.yagamiPlaceOf(p.place, Number(p.lat), Number(p.lon)) : null; }

  // パネルの選択肢を作る（最初に1回）
  function buildChoices() {
    var box = $("efPlaces");
    (window.YAGAMI_PLACES || []).forEach(function (pl) {
      var lb = document.createElement("label"); lb.className = "ef-choice ef-place";
      lb.innerHTML = '<input type="radio" name="efPlace" value="' + pl.id + '"><span class="ef-dot" style="background:' + pl.color + '"></span><span>' + rubyHTML(pl.name) + "</span>";
      box.appendChild(lb);
    });
    (window.YAGAMI_PHASES || []).forEach(function (ph) {
      var lb = document.createElement("label"); lb.className = "ef-choice";
      lb.innerHTML = '<input type="checkbox" name="efPhase" value="' + esc(ph.value) + '"><span>' + rubyHTML(ph.label) + '</span><small>' + rubyHTML(ph.desc) + "</small>";
      $("efPhases").appendChild(lb);
    });
    HAZARDS.forEach(function (h) {
      var lb = document.createElement("label"); lb.className = "ef-choice";
      lb.innerHTML = '<input type="checkbox" name="efHazard" value="' + esc(h[0]) + '"><span>' + rubyHTML(h[1]) + "</span>";
      $("efHazards").appendChild(lb);
    });
  }

  function checkedValues(name) {
    return Array.prototype.map.call(document.querySelectorAll('input[name="' + name + '"]:checked'), function (i) { return i.value; });
  }
  function currentValues() {
    var pl = document.querySelector('input[name="efPlace"]:checked');
    // 選択肢の順にならべる（変更前と同じ並びで比べるため）
    var order = function (list, all) { return all.filter(function (v) { return list.indexOf(v) >= 0; }); };
    return {
      field_25: $("efNumber").value.trim(),
      Message: $("efTitle").value.trim(),
      Body: $("efBody").value.trim(),
      place: pl ? pl.value : "",
      field_23: order(checkedValues("efPhase"), (window.YAGAMI_PHASES || []).map(function (x) { return x.value; })).join(", "),
      field_24: order(checkedValues("efHazard"), HAZARDS.map(function (h) { return h[0]; })).join(", ")
    };
  }
  function changedFields() {
    if (!editing) return [];
    var now = currentValues();
    return Object.keys(FIELD_NAMES).filter(function (k) { return now[k] !== editing.orig[k]; });
  }
  // 直したところに色をつける・場所が変わったら知らせる
  function refreshEdit() {
    var ch = changedFields();
    document.querySelectorAll("#editForm .ef").forEach(function (el) { el.classList.toggle("changed", ch.indexOf(el.dataset.field) >= 0); });
    var now = currentValues(), note = $("efPlaceNote");
    if (ch.indexOf("place") >= 0) {
      var pl = window.yagamiPlace(now.place);
      note.innerHTML = "📍 地図のピンも「" + rubyHTML(pl ? pl.name : now.place) + "」に移ります";
      note.hidden = false;
    } else note.hidden = true;
    $("editSave").disabled = saving || ch.length === 0;
    $("editSave").textContent = ch.length ? "保存する（" + ch.length + "か所）" : "保存する";
  }

  function openEdit(id) {
    var p = items.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    var pl = placeOfItem(p);
    var orderedList = function (v, all) { var l = listOf(v); return all.filter(function (x) { return l.indexOf(x) >= 0; }).concat(l.filter(function (x) { return all.indexOf(x) < 0; })); };
    var phasesAll = (window.YAGAMI_PHASES || []).map(function (x) { return x.value; }), hazAll = HAZARDS.map(function (h) { return h[0]; });
    editing = {
      id: String(p.id),
      orig: {
        field_25: String(p.field_25 || ""),
        Message: String(p.Message || "").trim(),
        Body: String(p.Body || "").trim(),
        place: pl ? pl.id : String(p.place || ""),
        field_23: orderedList(p.field_23, phasesAll).join(", "),
        field_24: orderedList(p.field_24, hazAll).join(", ")
      }
    };
    $("editTitle").textContent = "作品の確認・修正（id " + p.id + "）";
    var src = imageURL(p);
    $("editImg").hidden = !src; if (src) $("editImg").src = src;
    $("editId").textContent = p.id;
    $("editStatus").innerHTML = p.status === "hidden" ? '<span class="badge badge-off">非公開</span>' : '<span class="badge badge-on">公開中</span>';
    $("editCreated").textContent = jstDate(p.created_at) || "—";
    $("editUpdated").textContent = p.updated_at ? jstDate(p.updated_at) : "（まだ直していません）";
    $("efNumber").value = editing.orig.field_25;
    $("efTitle").value = editing.orig.Message;
    $("efBody").value = editing.orig.Body;
    document.querySelectorAll('input[name="efPlace"]').forEach(function (i) { i.checked = i.value === editing.orig.place; });
    var ph = listOf(editing.orig.field_23), hz = listOf(editing.orig.field_24);
    document.querySelectorAll('input[name="efPhase"]').forEach(function (i) { i.checked = ph.indexOf(i.value) >= 0; });
    document.querySelectorAll('input[name="efHazard"]').forEach(function (i) { i.checked = hz.indexOf(i.value) >= 0; });
    // 選択肢にない古い値があるときは知らせる（保存すると消える）
    var unknown = ph.filter(function (x) { return phasesAll.indexOf(x) < 0; }).concat(hz.filter(function (x) { return hazAll.indexOf(x) < 0; }));
    showEditError(unknown.length ? "選択肢にない値が入っています：" + unknown.join("、") + "（保存すると消えます）" : "");
    saving = false;
    $("editOverlay").hidden = false;
    $("editOverlay").scrollTop = 0;
    refreshEdit();
    $("efTitle").focus();
  }
  function closeEdit(force) {
    if (saving && !force) return;
    $("editOverlay").hidden = true;
    editing = null;
  }
  function tryCloseEdit() {
    if (!editing || saving) return;
    if (!changedFields().length) { closeEdit(); return; }
    askDialog("保存せずに閉じますか？", "<p>直したところは消えます。</p>", "保存せずに閉じる", "btn-danger").then(function (ok) { if (ok) closeEdit(); });
  }
  function showEditError(t) { $("editError").textContent = t || ""; $("editError").hidden = !t; }

  // 画面の中で先に確かめる
  function validate(v) {
    if (!window.YAGAMI_NUMBER_RE.test(v.field_25)) return "出席番号は 4201〜4235 の4けたの数字で入れてください。";
    if (!v.Message) return "タイトルが空です。タイトルを入れてください。";
    if (v.Message.length > MAX.Message) return "タイトルが長すぎます（" + MAX.Message + "文字まで）。";
    if (v.Body.length > MAX.Body) return "伝えたいことが長すぎます（" + MAX.Body + "文字まで）。";
    if (!window.yagamiPlace(v.place)) return "場所を3つの中から1つ選んでください。";
    if (!v.field_24) return "見たハザードマップを1つ以上選んでください。";
    if (!v.field_23) return "いつの行動かを1つ以上選んでください。";
    return "";
  }
  // Worker のエラーを、やさしい言葉にする
  function friendlyError(code, field, max) {
    switch (code) {
      case "invalid number": return "出席番号は 4201〜4235 で入れてください。";
      case "invalid place": return "場所を3つの中から選んでください。";
      case "invalid phase": return "いつの行動かを選び直してください。";
      case "invalid hazard": return "見たハザードマップを選び直してください。";
      case "too long": return "「" + (FIELD_NAMES[field] || field) + "」が長すぎます（" + max + "文字まで）。";
      case "not found": return "この作品は見つかりませんでした。もう削除されているかもしれません。一覧を読み直してください。";
      case "nothing to update": return "直したところがありません。";
      default: return "保存できませんでした（" + code + "）。もう一度ためしてください。";
    }
  }
  // 確認の一覧で見せる言葉
  function showValue(k, v) {
    if (!v) return '<span class="dlg-none">（なし）</span>';
    if (k === "place") { var pl = window.yagamiPlace(v); return esc(pl ? pl.plain : v); }
    if (k === "field_23") return esc(phaseName(v));
    if (k === "field_24") return esc(listOf(v).map(function (x) { var h = HAZARDS.filter(function (y) { return y[0] === x; })[0]; return h ? stripRuby(h[1]) : x; }).join("・"));
    return esc(v);
  }

  function saveEdit() {
    if (!editing || saving) return;
    var v = currentValues(), ch = changedFields();
    if (!ch.length) { showEditError("直したところがありません。"); return; }
    var bad = validate(v);
    if (bad) { showEditError(bad); return; }
    showEditError("");
    var rows = ch.map(function (k) {
      return "<tr><th>" + FIELD_NAMES[k] + '</th><td class="dlg-before">' + showValue(k, editing.orig[k]) + '</td><td class="dlg-arrow">→</td><td class="dlg-after">' + showValue(k, v[k]) + "</td></tr>";
    }).join("");
    var target = editing;
    askDialog("この内容で保存しますか？", '<p>id ' + esc(target.id) + ' の作品を、次のように直します。</p><table class="dlg-diff"><thead><tr><th></th><th>変更前</th><th></th><th>変更後</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      (ch.indexOf("place") >= 0 ? '<p class="dlg-note">📍 地図のピンも新しい場所に移ります。</p>' : ""), "保存する").then(function (ok) {
      if (!ok || editing !== target) return;
      var body = {};
      ch.forEach(function (k) { body[k] = v[k]; });
      saving = true;
      $("editSave").disabled = true; $("editSave").textContent = "保存中…";
      api("PUT", "/artworks/" + encodeURIComponent(target.id), storedKey(), body).then(function (r) {
        if (r.status === 401) { saving = false; unauthorized(); return; }
        return r.json().catch(function () { return {}; }).then(function (j) {
          saving = false;
          if (r.ok && j.ok) {
            closeEdit(true);
            return reload().then(function () { showResult("保存しました（id " + target.id + "：" + ch.map(function (k) { return FIELD_NAMES[k]; }).join("・") + "）", true); });
          }
          showEditError(friendlyError(j.error || ("HTTP " + r.status), j.field, j.max));
          refreshEdit();
        });
      }, function () {
        saving = false;
        showEditError("通信できませんでした。インターネットにつながっているか確かめて、もう一度「保存する」を押してください。");
        refreshEdit();
      });
    });
  }

  buildChoices();
  $("editForm").addEventListener("input", refreshEdit);
  $("editForm").addEventListener("change", refreshEdit);
  $("editForm").addEventListener("submit", function (ev) { ev.preventDefault(); saveEdit(); });
  $("editCancel").addEventListener("click", tryCloseEdit);
  $("editClose").addEventListener("click", tryCloseEdit);
  $("dlgOk").addEventListener("click", function () { closeDialog(true); });
  $("dlgCancel").addEventListener("click", function () { closeDialog(false); });
  // 出席番号は数字だけ（全角の数字は半角にする）
  $("efNumber").addEventListener("input", function () {
    var t = this.value.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[^0-9]/g, "").slice(0, 4);
    if (t !== this.value) this.value = t;
  });

  // ---------------- 入口 ----------------
  $("loginForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var key = $("keyInput").value.trim();
    if (!key) return;
    var remember = $("rememberChk").checked;
    $("loginBtn").disabled = true;
    $("loginError").hidden = true;
    loadList(key).then(function () {
      saveKey(key, remember);
      $("resultMsg").hidden = true;
      showList();
    }).catch(function (e) {
      if (e && e.unauthorized) { forgetKey(); showLogin("合言葉がちがいます"); }
      else { $("loginError").hidden = false; $("loginError").textContent = "Worker につながりませんでした（" + (e && e.message || e) + "）"; }
    }).then(function () { $("loginBtn").disabled = false; });
  });

  $("logoutBtn").addEventListener("click", function () {
    forgetKey();
    items = []; selected.clear();
    $("resultMsg").hidden = true;
    showLogin();
  });

  // ---------------- 一覧の操作 ----------------
  (window.YAGAMI_PLACES || []).forEach(function (pl) {
    var o = document.createElement("option");
    o.value = pl.id; o.textContent = pl.plain;
    $("placeFilter").appendChild(o);
  });
  $("placeFilter").addEventListener("change", render);
  $("statusFilter").addEventListener("change", render);
  $("searchInput").addEventListener("input", render);
  $("reloadBtn").addEventListener("click", function () { $("resultMsg").hidden = true; reload(); });
  $("checkAll").addEventListener("click", function () { selectVisible($("checkAll").checked); });
  $("selectAllBtn").addEventListener("click", function () { selectVisible(true); });
  $("selectNoneBtn").addEventListener("click", function () { selected.clear(); render(); });
  document.querySelectorAll(".act-btns button").forEach(function (b) {
    b.addEventListener("click", function () { openConfirm(b.dataset.op); });
  });
  $("confirmCancel").addEventListener("click", function () { closeConfirm(); });
  $("confirmOk").addEventListener("click", runOp);
  $("confirmOverlay").addEventListener("click", function (ev) { if (ev.target === $("confirmOverlay")) closeConfirm(); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (!$("dlgOverlay").hidden) closeDialog(false);
    else if (!$("editOverlay").hidden) tryCloseEdit();
    else if (!$("confirmOverlay").hidden) closeConfirm();
  });

  $("workerInfo").textContent = "Worker：" + WORKER.replace(/^https?:\/\//, "");

  // 覚えている合言葉があれば、そのまま一覧へ
  if (storedKey()) reload(); else showLogin();
})();
