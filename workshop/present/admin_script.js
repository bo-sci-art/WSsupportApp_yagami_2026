// 管理画面（先生用）：作品の一覧・削除・非公開・公開に戻す
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
    showLogin("合言葉がちがいます（または変わりました）。もう一度入れてください。");
  }

  // ---------------- 表示用の言葉 ----------------
  function placeName(p) {
    var pl = window.yagamiPlaceOf ? window.yagamiPlaceOf(p.place, Number(p.lat), Number(p.lon)) : null;
    if (pl) return pl.plain;
    return p.place || "（なし）";
  }
  function stripRuby(s) { return String(s || "").replace(/\{[^}]*\}/g, ""); }
  function phaseName(v) {
    if (!v) return "";
    return window.yagamiPhaseLabel ? stripRuby(window.yagamiPhaseLabel(v)) : v;
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
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !$("confirmOverlay").hidden) closeConfirm(); });

  $("workerInfo").textContent = "Worker：" + WORKER.replace(/^https?:\/\//, "");

  // 覚えている合言葉があれば、そのまま一覧へ
  if (storedKey()) reload(); else showLogin();
})();
