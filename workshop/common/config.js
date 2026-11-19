// workshop/common/config.js（矢上小版）
// 作品の登録・読み込み先（Cloudflare Worker yagami-submit）。デプロイ後に URL が違っていたら、ここだけ直す。
// ローカルで試すとき：ページの URL に ?worker=http://127.0.0.1:8787 をつけると、その Worker を使う（その iPad／ブラウザに記憶される）
// 作品の受け付け（v3）：授業が終わったら false にする。true にもどすと、今までどおり登録できる。
//   false のとき：スタート画面は「防災行動マップを見る」だけ・確認画面の「登録する」は押せない。
//   Worker 側も worker/wrangler.toml の [vars] REGISTRATION_OPEN を同じ値にすること（画面を直接開かれても登録させないため）
//   防災行動マップと管理画面は、どちらのときも使える
var REGISTRATION_OPEN = false;   // 矢上小：2026/11/18 の授業が終わったので、受け付けを止めている
(function () {
  var DEFAULT_WORKER = 'https://yagami-submit.kazuki131214.workers.dev';
  var url = DEFAULT_WORKER;
  try {
    var q = new URLSearchParams(location.search).get('worker');
    if (q === 'default') localStorage.removeItem('yagamiWorkerOverride');
    else if (q && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(q)) localStorage.setItem('yagamiWorkerOverride', q);
    url = localStorage.getItem('yagamiWorkerOverride') || DEFAULT_WORKER;
  } catch (e) {}
  window.YAGAMI_CONFIG = { WORKER_URL: url.replace(/\/+$/, ''), REGISTRATION_OPEN: REGISTRATION_OPEN };
})();
