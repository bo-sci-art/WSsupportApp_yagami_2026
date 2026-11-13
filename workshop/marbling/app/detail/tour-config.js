// tour-config.js
export const GUIDE = {
  chapters: [
    {
      id: "intro",
      title: "導入",
      steps: [
        {
          id: "welcome",
          type: "modal",
          content: {
            title: "ようこそ！マーブリングの世界へ！",
            body: "マーブリング作品制作を体験しましょう。<ruby>途<rt>と</rt></ruby>中でスキップもできます。"
          },
          cta: { primary: "はじめる", secondary: "スキップ" },
          advance: { mode: "click-cta" }
        }
      ]
    },
    {
      id: "draw",
      title: "描画",
      steps: [
        {
          id: "pick-color",
          type: "spotlight",
          targets: ["#ctrl-fore-color", "#ctrl-palette"],  
          content: { title: "色を選ぼう", body: "ここで色を選びます。" },
          advance: { mode: "event", name: "color:change", fallbackClickSelector: "#ctrl-fore-color" }
        },
        {
          id: "brush",
          type: "spotlight",
          target: "#ctrl-brush",
          content: { title: "太さを調整", body: "スライダーで線の太さを変えます。" },
          advance: { mode: "next" }
        },
        {
          id: "eraser",
          type: "spotlight",
          target: "#ctrl-eraser",  // ←ここをあなたの消しゴムボタンのIDに合わせて変更
          content: {
            title: "消しゴム",
            body: "消しゴムをONにすると、<ruby>塗<rt>ぬ</rt></ruby>った色を消すことができます。"
          },
          advance: { mode: "next" }
        },
        {
          id: "stroke",
          type: "spotlight",
          targets: ["main#stage canvas", "#ctrl-mode-paint"],
          box: "multi",
          content: { title: "線を<ruby>描<rt>えが</rt></ruby>こう", body: "「色を<ruby>塗<rt>ぬ</rt></ruby>る」を選<ruby>択<rt>たく</rt></ruby>し、キャンバス上をドラッグすると線を<ruby>描<rt>えが</rt></ruby>けます。" },
          advance: { mode: "next" }
        }
      ]
    },
    {
      id: "fluid",
      title: "流体",
      steps: [
        {
          id: "play",
          type: "spotlight",
          targets: ["main#stage canvas", "#ctrl-mode-fluid"],
          box: "multi",
          content: { title: "流してみよう", body: "このボタンを<ruby>押<rt>お</rt></ruby>すと、流体の動きを表現することができます。" },
          advance: { mode: "next" }
        },
//        {
//          id: "splat",
//          type: "spotlight",
//          target: "#ctrl-random-splat",
//          content: { title: "滴を落とす", body: "ランダムに絵の具を落とします。" },
//          advance: { mode: "event", name: "fluid:splat" }
//        }
      ]
    },
    {
      id: "export",
      title: "保存",
      steps: [
        {
          id: "done",
          type: "modal",
          target: "#help-btn",
          content: {
            title: "完<ruby>了<rt>りょう</rt></ruby>！",
            body: "では作品を制作しましょう。作品は「もどる」「つぎへ」を押すと自動で保存されます。"
          },
          cta: { primary: "閉じる" },
          advance: { mode: "click-cta" }
        }
      ]
    }
  ]
};
