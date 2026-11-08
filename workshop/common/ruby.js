// workshop/common/ruby.js（矢上小版）
// 画面の文字の中の「漢字{かな}」を <ruby>漢字<rt>かな</rt></ruby> に置きかえる。
//   例：大雨{おおあめ}のとき → 大雨（おおあめ）にルビ
// ページを開いたときと、あとから JavaScript で文字が足されたとき（地図のポップアップなど）の両方に効く。
// ※ 入力欄（input / textarea）の中身や、送信するデータは変えない。
(function () {
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
    var last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
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

  function start() {
    walk(document.body);
    if (document.title) document.title = window.plainRuby(document.title);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') convertTextNode(m.target);
        else m.addedNodes.forEach(walk);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
