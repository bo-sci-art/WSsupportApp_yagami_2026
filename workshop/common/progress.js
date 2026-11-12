// workshop/common/progress.js（矢上小版・授業案 rev3）
// 今いる画面を localStorage（wsResumePage）に覚えておく。スタート画面の「つづきから」でここにもどる。
// 1コマ目と2コマ目のあいだ（休み時間）や、iPad のスリープ・タブの閉じ直しのあとでも続きから始められるように。
// ※ 確認画面からの作り直し（?edit=1）や作品の仕上げ（?compose=1）のときは、確認画面を覚える。
(function () {
  try {
    var path = location.pathname;
    var i = path.indexOf('/workshop/');
    if (i < 0) return;
    var rel = path.slice(i + '/workshop/'.length);      // 例 marbling/app/index.html
    if (/[?&](edit|compose)=1(&|$)/.test(location.search)) rel = 'message/lastconfirm/final_submit.html';
    localStorage.setItem('wsResumePage', rel);
  } catch (e) { /* localStorage が使えないときは何もしない */ }
})();
