// workshop/common/ruby.js（矢上小版）
// 画面の文字の中の「漢字{かな}」を <ruby>漢字<rt>かな</rt></ruby> に置きかえる。
//   例：大雨{おおあめ}のとき → 大雨（おおあめ）にルビ
// ページを開いたときと、あとから JavaScript で文字が足されたとき（地図のポップアップなど）の両方に効く。
// ※ 入力欄（input / textarea）の中身や、送信するデータは変えない。
// <html data-ruby="first"> のページでは、同じ言葉のふりがなは最初の1回だけ（防災行動マップ用。画面が重くならないように）
// となりあう2つの言葉のふりがながぶつかるときだけ、その間を少しあける
(function () {
  var FIRST_ONLY = document.documentElement.getAttribute('data-ruby') === 'first';
  var seen = {};   // FIRST_ONLY：もうふりがなを出した言葉

  function isShown(el) {
    while (el && el.nodeType === 1) {
      var st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      el = el.parentElement;
    }
    return true;
  }
  var RE = /([々一-鿿豈-﫿]+)\{([ぁ-ゟ゠-ヿー]+)\}/g;
  var TEST = /[々一-鿿豈-﫿]\{[ぁ-ヿー]+\}/;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, RT: 1, NOSCRIPT: 1 };

  function convertTextNode(node) {
    var text = node.nodeValue;
    if (!text || !TEST.test(text)) return;
    var p = node.parentNode;
    if (!p || SKIP[p.nodeName]) return;
    // ひとまとまりの span に入れる（親が flex / grid のとき、語ごとに間があかないように）
    var frag = document.createElement('span');
    frag.className = 'rb-run';
    var shown = FIRST_ONLY && isShown(p);
    var last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (FIRST_ONLY && seen[m[1]]) {   // 2回目からはふりがななし
        var plain = document.createElement('span');
        plain.className = 'rb-seen';
        plain.textContent = m[1];
        frag.appendChild(plain);
        last = RE.lastIndex;
        continue;
      }
      if (FIRST_ONLY && shown) seen[m[1]] = true;   // 見えている所で出したときだけ「出した」ことにする
      var r = document.createElement('ruby');
      r.appendChild(document.createTextNode(m[1]));
      var rt = document.createElement('rt');
      rt.textContent = m[2];
      r.appendChild(rt);
      frag.appendChild(r);
      last = RE.lastIndex;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    p.replaceChild(frag, node);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { convertTextNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (SKIP[root.nodeName]) return;
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var list = [], n;
    while ((n = tw.nextNode())) if (TEST.test(n.nodeValue)) list.push(n);
    list.forEach(convertTextNode);
  }

  // 「漢字{かな}」→ ふつうの文字（送信や alert 用）
  window.plainRuby = function (s) { return String(s == null ? '' : s).replace(RE, '$1'); };
  // 「漢字{かな}」→ <ruby>（innerHTML 用）
  window.rubyHTML = function (s) { return String(s == null ? '' : s).replace(RE, '<ruby>$1<rt>$2</rt></ruby>'); };

  // となりあう ruby のふりがながぶつかるときだけ、間をあける
  function spacePass() {
    var list = document.querySelectorAll('ruby');
    for (var i = 0; i < list.length; i++) {
      var a = list[i], b = a.nextSibling;
      if (!b || b.nodeName !== 'RUBY') continue;
      var ra = a.querySelector('rt'), rb = b.querySelector('rt');
      if (!ra || !rb) continue;
      var wa = a.getBoundingClientRect().width, wb = b.getBoundingClientRect().width;
      if (!wa || !wb) continue;   // 見えていないものは、見えたときにやり直す
      var oa = Math.max(0, (ra.getBoundingClientRect().width - wa) / 2);
      var ob = Math.max(0, (rb.getBoundingClientRect().width - wb) / 2);
      var need = oa + ob + 1;
      var cur = parseFloat(a.style.marginRight) || 0;
      if (need > 1.5 && Math.abs(need - cur) > 0.5) a.style.marginRight = need.toFixed(1) + 'px';
    }
  }
  var spaceTimer = null;
  function scheduleSpace(ms) { clearTimeout(spaceTimer); spaceTimer = setTimeout(spacePass, ms || 60); }

  function start() {
    walk(document.body);
    scheduleSpace(0);
    window.addEventListener('load', function () { scheduleSpace(0); });
    window.addEventListener('resize', function () { scheduleSpace(150); });
    document.addEventListener('click', function () { scheduleSpace(350); }, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { scheduleSpace(0); });
    if (document.title) document.title = window.plainRuby(document.title);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') convertTextNode(m.target);
        else m.addedNodes.forEach(walk);
      });
      scheduleSpace(80);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
