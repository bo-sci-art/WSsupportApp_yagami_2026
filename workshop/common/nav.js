// workshop/common/nav.js（矢上小版）
// ヘッダー（もどる／つぎへ・4ステップ表示）を作る。
// 各ページで window.WS_STEP を定義しておく：
//   title     : 左に出す画面名（<ruby> を使ってよい）
//   flow      : { current: 1〜4 }（ステップ表示。ラベルは共通）
//   prev/next : 戻る先・進む先の URL
//   nextLabel : 「つぎへ ▶」の代わりの文字（任意）
//   mapUrl    : 「ハザードマップ」ボタンで開く地図（任意）
//   frameSave : iframe 内の保存関数名（例 'WS_flushSave'）。「つぎへ」「もどる」の前に呼んで、保存が終わってから移動する
//   beforeNext: async function（任意）。false を返すと移動しない
// ※大人版にあった「作品を保存しましたか？」の確認バナーは使わない（自動保存にしたため）
(function () {
  var S = window.WS_STEP || {};
  var LABELS = ['ハザードマップ', 'マーブリング', 'コラージュ', 'メッセージ'];

  var header = document.createElement('header');
  header.className = 'ws-header';

  var stepperHtml = '';
  if (S.flow && S.flow.current) {
    stepperHtml = '<div class="ws-stepper" role="list">' + LABELS.map(function (label, i) {
      var n = i + 1, cur = n === S.flow.current, done = n < S.flow.current;
      var cls = 'ws-stepper__item' + (done ? ' done' : '') + (cur ? ' current' : '') + (!done && !cur ? ' todo' : '');
      return '<div class="' + cls + '" role="listitem" aria-current="' + (cur ? 'step' : 'false') + '">' +
               '<div class="ws-stepper__dot">' + (done ? '✓' : n) + '</div>' +
               '<div class="ws-stepper__label">' + label + '</div>' +
             '</div>';
    }).join('') + '</div>';
  }

  header.innerHTML =
    '<div class="left">' + (S.title || '') + '</div>' +
    '<div class="center">' + stepperHtml + '</div>' +
    '<div class="right">' +
      (S.mapUrl ? '<button class="btn" id="mapBtn" type="button">🗺 ハザードマップ</button>' : '') +
      (S.prev ? '<button class="btn" id="backBtn" type="button">◀ もどる</button>' : '') +
      (S.next ? '<button class="btn accent" id="nextBtn" type="button">' + (S.nextLabel || 'つぎへ ▶') + '</button>' : '') +
    '</div>';
  document.body.prepend(header);

  // --- ハザードマップのパネル（マーブリング・コラージュ中に見返す用） ---
  if (S.mapUrl) {
    var panel = document.createElement('aside');
    panel.className = 'panel';
    panel.id = 'mapPanel';
    panel.innerHTML =
      '<header><div>ハザードマップ</div><button id="mapClose" class="btn" type="button">✕ とじる</button></header>' +
      '<div class="body"><iframe src="' + S.mapUrl + '" referrerpolicy="no-referrer-when-downgrade"></iframe></div>';
    document.body.appendChild(panel);
    document.getElementById('mapBtn').addEventListener('click', function () { panel.classList.add('open'); });
    document.getElementById('mapClose').addEventListener('click', function () { panel.classList.remove('open'); });
  }

  // --- iframe 内の作品を保存してから移動する ---
  function saveFrame() {
    if (!S.frameSave) return Promise.resolve();
    var fr = document.querySelector('iframe[data-ws-work]') || document.querySelector('main iframe');
    try {
      var fn = fr && fr.contentWindow && fr.contentWindow[S.frameSave];
      if (typeof fn === 'function') {
        // 保存が終わらなくても 4 秒で先へ進む（固まらないように）
        return Promise.race([Promise.resolve(fn()), new Promise(function (r) { setTimeout(r, 4000); })]);
      }
    } catch (e) { console.warn('[nav.js] 保存に失敗', e); }
    return Promise.resolve();
  }

  var busy = false;
  function go(url, btn, isNext) {
    if (busy || !url) return;
    busy = true;
    var label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'ほぞん中…'; }
    saveFrame().then(function () {
      if (isNext && typeof S.beforeNext === 'function') return S.beforeNext();
    }).then(function (ok) {
      if (ok === false) throw new Error('cancel');
      location.href = url;
    }).catch(function () {
      busy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
    });
  }

  var nextBtn = document.getElementById('nextBtn');
  var backBtn = document.getElementById('backBtn');
  if (nextBtn) nextBtn.addEventListener('click', function () { go(S.next, nextBtn, true); });
  if (backBtn) backBtn.addEventListener('click', function () { go(S.prev, backBtn, false); });
})();
