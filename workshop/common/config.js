// workshop/common/config.js（矢上小版）
// 作品の登録・読み込み先（Cloudflare Worker yagami-submit）。デプロイ後に URL が違っていたら、ここだけ直す。
// ローカルで試すとき：ページの URL に ?worker=http://127.0.0.1:8787 をつけると、その Worker を使う（その iPad／ブラウザに記憶される）
(function () {
  var DEFAULT_WORKER = 'https://yagami-submit.kazuki131214.workers.dev';
  var url = DEFAULT_WORKER;
  try {
    var q = new URLSearchParams(location.search).get('worker');
    if (q === 'default') localStorage.removeItem('yagamiWorkerOverride');
    else if (q && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(q)) localStorage.setItem('yagamiWorkerOverride', q);
    url = localStorage.getItem('yagamiWorkerOverride') || DEFAULT_WORKER;
  } catch (e) {}
  window.YAGAMI_CONFIG = { WORKER_URL: url.replace(/\/+$/, '') };
})();
