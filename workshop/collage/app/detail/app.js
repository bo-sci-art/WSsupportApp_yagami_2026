// 画面・コンテキスト
let dpr = Math.max(1, window.devicePixelRatio || 1);
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const stageWrap = document.getElementById('stageWrap');
const trashZoneEl = document.getElementById('trashZone');
let cssW = canvas.clientWidth, cssH = canvas.clientHeight;

function resizeCanvasToCSS() {
  // ★ここを canvas に固定：座標計算(clientToCanvas)と完全一致させる
  const rect = canvas.getBoundingClientRect();
  dpr = Math.max(1, window.devicePixelRatio || 1);
  cssW = rect.width; cssH = rect.height;
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);  // 以降はCSSピクセルで描画
}

resizeCanvasToCSS();
window.addEventListener('resize', () => { resizeCanvasToCSS(); computeContain(); render(); });
window.addEventListener('orientationchange', () => { resizeCanvasToCSS(); computeContain(); render(); });

// ステージ上のスクロール/ズーム/ダブルタップズームを止める
if (stageWrap) {
  stageWrap.addEventListener('touchmove', (e) => {
    e.preventDefault();               // スクロール抑止
  }, { passive: false });
}

// iOSのピンチズーム・ジェスチャ保険
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
});

// ダブルタップズーム防止
let __lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - __lastTouchEnd <= 300) e.preventDefault();
  __lastTouchEnd = now;
}, { passive: false });



// 写真の状態
let baseImg = null;
let fit = { x:0, y:0, w:cssW, h:cssH, scale:1 };

function loadImage(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function computeContain(){
  const W = canvas.width  / dpr;  // 実キャンバスサイズ（CSS px）
  const H = canvas.height / dpr;

  if (!baseImg) { fit = {x:0,y:0,w:W,h:H,scale:1}; return; }

  const iw = baseImg.naturalWidth, ih = baseImg.naturalHeight;

  // ★ ここを contain → cover に変える：全面に広げて中央トリミング
  const scale = Math.max(W/iw, H/ih);   // ← cover は max
  const w = Math.round(iw * scale), h = Math.round(ih * scale);
  const x = Math.round((W - w)/2),  y = Math.round((H - h)/2);
  fit = { x, y, w, h, scale };
}


// ======== スタンプの状態管理（アップロードより前に置く） ========
const stamps = [];          // 配置したスタンプの配列
let selectedIndex = -1;     // 選択中スタンプのインデックス

function ensureFlipProps() {
  for (const s of stamps) {
    if (s.flipX === undefined) s.flipX = false;
    if (s.flipY === undefined) s.flipY = false;
  }
}

// Undo/Redo ヒストリ
const history = { stack: [], index: -1 };
function pushHistory() {
  const snapshot = stamps.map(s => ({ ...s }));
  history.stack.splice(history.index + 1);
  history.stack.push(snapshot);
  history.index = history.stack.length - 1;
  refreshUndoRedo();
}
function loadHistory(dir) {
  const next = history.index + dir;
  if (next < 0 || next >= history.stack.length) return;
  const snap = history.stack[next];
  stamps.length = 0;
  snap.forEach(s => stamps.push({ ...s }));
  selectedIndex = -1;
  history.index = next;
  render();
  refreshUndoRedo();
}

// ボタンがない環境でも落ちないように防御
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const saveWorkBtn = document.getElementById('saveWorkBtn');


function refreshUndoRedo() {
  if (!undoBtn || !redoBtn) return;
  if (undoBtn)  undoBtn.disabled  = history.index <= 0;
  if (redoBtn)  redoBtn.disabled  = history.index >= history.stack.length - 1;
  if (deleteSelectedBtn) deleteSelectedBtn.disabled = (selectedIndex < 0);
  if (clearAllBtn) clearAllBtn.disabled = (stamps.length === 0);
  if (saveWorkBtn) saveWorkBtn.disabled = (!baseImg && stamps.length === 0);
}

// --- Undo / Redo ボタンクリックを接続 ---
if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    loadHistory(-1); // 1つ戻す
  });
}
if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    loadHistory(+1); // 1つ進める
  });
}
if (deleteSelectedBtn) {
  deleteSelectedBtn.addEventListener('click', () => {
    if (selectedIndex < 0) return;
    stamps.splice(selectedIndex, 1);
    selectedIndex = -1;
    render();
    pushHistory();
    refreshUndoRedo();
  });
}
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', () => {
    if (!stamps.length) return;

    // 誤操作防止（簡易確認ダイアログ）
    const ok = confirm('本当に全部のスタンプを消しますか？');
    if (!ok) return;

    stamps.length = 0;           // すべて削除（写真は残す）
    selectedIndex = -1;
    render();
    pushHistory();               // Undoで戻せるように履歴に積む
    refreshUndoRedo();
  });
}
// ===== 作品画像を投稿ページ用にlocalStorageへ保存（自動投稿の下準備） =====
function persistArtworkImage(quality, maxDim) {
  quality = quality || 0.85;
  maxDim = maxDim || 1400;
  try {
    const prevSel = selectedIndex;
    selectedIndex = -1;
    render();

    const srcW = canvas.width, srcH = canvas.height;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const octx = off.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, outW, outH);
    octx.drawImage(canvas, 0, 0, srcW, srcH, 0, 0, outW, outH);

    const dataURL = off.toDataURL('image/jpeg', quality);
    localStorage.setItem('artworkImage', dataURL);
    localStorage.setItem('artworkImageExt', 'jpg');

    selectedIndex = prevSel;
    render();
    return true;
  } catch (e) {
    console.error('作品画像の保存(localStorage)に失敗しました:', e);
    return false;
  }
}

if (saveWorkBtn) {
  saveWorkBtn.addEventListener('click', () => {
    persistArtworkImage();

    // 選択枠を一時非表示でレンダリング
    const prevSel = selectedIndex;
    selectedIndex = -1;
    render();

    // 作品名：collage-YYYYMMDD-HHMMSS.png
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const fname = `collage-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 選択表示を戻す
    selectedIndex = prevSel;
    render();
  });
}

// 画像×色 の結果をキャッシュ
const tintCache = new Map();

/** 白ベースPNGを任意色でティントしたキャンバスを返す */
function getTintedImage(img, color){
  const key = (img.src || img) + '|' + color;
  const cached = tintCache.get(key);
  if (cached) return cached;

  const w = img.naturalWidth  || img.width  || 1;
  const h = img.naturalHeight || img.height || 1;

  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const octx = off.getContext('2d');

  // 元画像 → その上に色をsource-atopでのせる（透明部は塗られない）
  octx.clearRect(0,0,w,h);
  octx.drawImage(img, 0, 0, w, h);
  octx.globalCompositeOperation = 'source-atop';
  octx.fillStyle = color || '#ffffff';
  octx.fillRect(0, 0, w, h);
  octx.globalCompositeOperation = 'source-over';

  tintCache.set(key, off);
  return off;
}


// ★ 選択枠の見た目定数（装飾のみ。四隅ドラッグ／回転ハンドルは廃止し、操作はジェスチャーに統一）
const SELECT_PADDING = 10;   // CSS px: 本体との間隔
const SELECT_RADIUS  = 14;   // CSS px: 角丸半径
const BRACKET_LEN    = 16;   // CSS px: 角ブラケットの一辺の長さ

let dragMode = 'none';       // 'none' | 'move' | 'pinch' | 'pending' | 'multi-idle'
let lastPointerType = 'touch'; // 直近の入力デバイス種別。'mouse'ならレガシーなハンドル操作を有効化する

// ★ マウス（PC）専用：角ハンドルでリサイズ／回転ハンドルで回転（タッチのピンチ操作の代替）
const MOUSE_HANDLE_HIT   = 10; // CSS px：角ハンドルの当たり判定半径（マウスは指と違い高精度なので十分）
const MOUSE_ROTATE_DIST  = 26; // CSS px：選択枠上辺から回転ハンドルまでの距離
const MOUSE_ROTATE_HIT   = 8;  // CSS px：回転ハンドルの当たり判定半径

// キャンバス座標(CSS px)をスタンプのローカル座標（中心原点・逆回転済み）へ変換
function toLocal(s, px, py) {
  const dx = px - s.x, dy = py - s.y;
  const rad = (s.angleDeg || 0) * Math.PI / 180;
  const c = Math.cos(-rad), si = Math.sin(-rad);
  return { x: dx * c - dy * si, y: dx * si + dy * c };
}

// 選択中スタンプに限定してハンドルの当たり判定を行う（旧実装は全スタンプに対して判定しており、
// それが「別のスタンプが誤って掴まれる」原因だったため、選択中スタンプのみに限定している）
function hitMouseHandle(s, localX, localY) {
  const r = localRectOf(s);
  const pad = SELECT_PADDING;
  const rr = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };

  const topCenter = { x: rr.x + rr.w / 2, y: rr.y };
  const rotPos = { x: topCenter.x, y: topCenter.y - MOUSE_ROTATE_DIST };
  if (Math.hypot(localX - rotPos.x, localY - rotPos.y) <= MOUSE_ROTATE_HIT + 4) {
    return { mode: 'rotate' };
  }

  const corners = [
    { x: rr.x,         y: rr.y,         idx: 0 }, // TL
    { x: rr.x + rr.w,  y: rr.y,         idx: 1 }, // TR
    { x: rr.x + rr.w,  y: rr.y + rr.h,  idx: 2 }, // BR
    { x: rr.x,         y: rr.y + rr.h,  idx: 3 }, // BL
  ];
  for (const c of corners) {
    if (Math.abs(localX - c.x) <= MOUSE_HANDLE_HIT && Math.abs(localY - c.y) <= MOUSE_HANDLE_HIT) {
      return { mode: 'resize', handleIndex: c.idx };
    }
  }
  return { mode: 'none' };
}

function getResizeCursor(handleIndex) {
  return (handleIndex === 0 || handleIndex === 2) ? 'nwse-resize' : 'nesw-resize';
}

// ★ local rect of selected stamp (center-origin, after scale)
function localRectOf(s) {
  const w = s.w * s.scale;
  const h = s.h * s.scale;
  return { x: -w/2, y: -h/2, w, h };
}

// 角丸矩形のパス
function roundRectPath(c, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w/2, h/2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y,     x + w, y + h, r);
  c.arcTo(x + w, y + h, x,     y + h, r);
  c.arcTo(x,     y + h, x,     y,     r);
  c.arcTo(x,     y,     x + w, y,     r);
  c.closePath();
}

// 選択中スタンプの角に出すL字ブラケット（装飾のみ。固定pxで描くのでスタンプが小さくても潰れない）
function drawCornerBrackets(c, rect, len) {
  const { x, y, w, h } = rect;
  const corners = [
    [x,     y,      1,  0,  0,  1],  // TL
    [x + w, y,     -1,  0,  0,  1],  // TR
    [x + w, y + h, -1,  0,  0, -1],  // BR
    [x,     y + h,  1,  0,  0, -1],  // BL
  ];
  c.beginPath();
  for (const [cx, cy, dx1, dy1, dx2, dy2] of corners) {
    c.moveTo(cx + dx1 * len, cy + dy1 * len);
    c.lineTo(cx, cy);
    c.lineTo(cx + dx2 * len, cy + dy2 * len);
  }
  c.stroke();
}

function render(){
  ctx.clearRect(0,0,cssW,cssH);

  if (baseImg) {
    ctx.drawImage(baseImg, fit.x, fit.y, fit.w, fit.h);
  } else {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0,0,cssW,cssH);
  }

  for (const s of stamps) {
    // 念のため後方互換の初期化
    if (s.flipX === undefined) s.flipX = false;
    if (s.flipY === undefined) s.flipY = false;
    const w = s.w * s.scale, h = s.h * s.scale;
    ctx.globalAlpha = s.alpha;
    // 色が指定されていればティント画像、なければ元画像
    const src = (s.color && s.color.toLowerCase() !== '#ffffff')
                  ? getTintedImage(s.tex, s.color)
                  : s.tex;
    ctx.save();
    ctx.translate(s.x, s.y);
    const rad = (s.angleDeg || 0) * Math.PI / 180;
    ctx.rotate(rad);

    // 反転は符号付きスケールで表現（拡大率は既存の s.scale のまま）
    const sx = s.flipX ? -1 : 1;
    const sy = s.flipY ? -1 : 1;
    ctx.scale(sx, sy);

    ctx.drawImage(src, -w/2, -h/2, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  if (selectedIndex >= 0) {
    const s = stamps[selectedIndex];
    const r = localRectOf(s);
    const pad = SELECT_PADDING;
    const rr = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };

    ctx.save();
    ctx.translate(s.x, s.y);
    const rad = (s.angleDeg || 0) * Math.PI / 180;
    ctx.rotate(rad);

    // ふんわりした選択グロー（角丸矩形）
    ctx.save();
    ctx.shadowColor = 'rgba(99,102,241,0.55)';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(99,102,241,0.9)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, rr.x, rr.y, rr.w, rr.h, SELECT_RADIUS);
    ctx.stroke();
    ctx.restore();

    // 角のL字ブラケット（白縁＋アクセント色の二重線で視認性を確保）
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    drawCornerBrackets(ctx, rr, BRACKET_LEN);
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2.4;
    drawCornerBrackets(ctx, rr, BRACKET_LEN);

    // マウス操作時のみ：回転ハンドル（PC向けレガシー操作の取っ手）
    if (lastPointerType === 'mouse') {
      const topCenter = { x: rr.x + rr.w / 2, y: rr.y };
      const rotPos = { x: topCenter.x, y: topCenter.y - MOUSE_ROTATE_DIST };
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(topCenter.x, topCenter.y);
      ctx.lineTo(rotPos.x, rotPos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rotPos.x, rotPos.y, MOUSE_ROTATE_HIT, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }
}


// 既存のすぐ上/下どこでもOK
const ALPHA_MIN = 0.2;
const ALPHA_MAX = 1.0;


// UI（あれば反映、無ければ安全にスキップ）
const alphaEl = document.getElementById('alpha');
const alphaOut = document.getElementById('alphaOut');
const colorEl  = document.getElementById('color');
const colorOut = document.getElementById('colorOut');
const colorPreview = document.getElementById('colorPreview');


// --- パレット（マーブリングと同じ） ---
const PALETTES = {
  Basic: ['#FF3B30','#FF9500','#FFCC00','#34C759','#007AFF','#5856D6','#FF2D55'],
  Pastel: ['#FFD1DC','#B5EAD7','#C7CEEA','#FFDAC1','#E2F0CB','#B5B9FF','#FFB7B2','#FF9CEE','#B28DFF'],
  Warm:   ['#FF3B30','#FF9500','#FFCC00','#FFB7B2','#FFD1DC','#FF9CEE','#FFDAC1','#FF2D55','#FF5E3A'],
  Cool:   ['#007AFF','#34C759','#5856D6','#B5EAD7','#B5B9FF','#C7CEEA','#E2F0CB','#A0CED9','#5AC8FA']
};

const COLOR_NAMES = {
  '#000000':'黒','#ffffff':'白','#FF3B30':'赤','#FF9500':'オレンジ','#FFCC00':'黄','#34C759':'緑','#007AFF':'青','#5856D6':'紫','#FF2D55':'ピンク',
  '#FFD1DC':'パステルピンク','#B5EAD7':'パステルグリーン','#C7CEEA':'パステルブルー','#FFDAC1':'パステルオレンジ','#E2F0CB':'パステルイエロー','#B5B9FF':'パステルパープル','#FFB7B2':'パステルレッド','#FF9CEE':'パステルライトピンク','#B28DFF':'パステルバイオレット',
  '#FF5E3A':'ライトオレンジ','#A0CED9':'ライトブルー','#5AC8FA':'ライトシアン'
};

const paletteSelect = document.getElementById('palette-select');
const swatchesEl = document.getElementById('swatches');

// marblingと同じキー名で保存（ページ間で色を揃えたいならこれが楽）
let paletteName  = localStorage.getItem('paletteName')  || 'Basic';
let lastColorHex = localStorage.getItem('lastColorHex') || null;

if (paletteSelect) paletteSelect.value = paletteName;

// 表示（テキスト＆丸プレビュー）を同期：既存のupdateColorUIがあるならそれを使ってOK
function updateColorUI(hex) {
  if (colorOut)     colorOut.textContent = hex.toUpperCase();
  if (colorPreview) colorPreview.style.background = hex;
}

// swatchesを生成
function renderSwatches(palette, selectedHex) {
  if (!swatchesEl) return;
  swatchesEl.innerHTML = '';

  PALETTES[palette].forEach(hex => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.setAttribute('role','option');
    btn.setAttribute('tabindex','0');
    btn.setAttribute('aria-label', COLOR_NAMES[hex] || hex);
    btn.setAttribute('data-color', hex);
    btn.style.setProperty('--swatch-color', hex);
    btn.setAttribute('aria-selected', selectedHex === hex ? 'true' : 'false');
    if (selectedHex === hex) btn.classList.add('is-active');

    btn.addEventListener('click', () => {
      if (!colorEl) return;
      colorEl.value = hex;
      updateColorUI(hex);
      localStorage.setItem('lastColorHex', hex);

      // ★コラージュ反映：選択中スタンプがあれば色を更新して再描画
      if (selectedIndex >= 0) {
        stamps[selectedIndex].color = hex;
        render();
      }

      updateSwatchActive(hex);
    });

    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); btn.nextElementSibling?.focus(); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); btn.previousElementSibling?.focus(); }
      if (e.key === 'Enter' || e.key === ' ') btn.click();
    });

    swatchesEl.appendChild(btn);
  });
}

function updateSwatchActive(hex) {
  if (!swatchesEl) return;
  Array.from(swatchesEl.children).forEach(btn => {
    const btnHex = btn.getAttribute('data-color');
    const active = (btnHex === hex);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

// パレット変更
if (paletteSelect) {
  paletteSelect.addEventListener('change', () => {
    paletteName = paletteSelect.value;
    localStorage.setItem('paletteName', paletteName);

    let currentHex = colorEl ? colorEl.value : null;
    if (!currentHex || !PALETTES[paletteName].includes(currentHex)) {
      currentHex = PALETTES[paletteName][0];
      if (colorEl) colorEl.value = currentHex;
    }

    updateColorUI(currentHex);
    renderSwatches(paletteName, currentHex);
    updateSwatchActive(currentHex);

    // 選択中スタンプがあれば即反映
    if (selectedIndex >= 0) {
      stamps[selectedIndex].color = currentHex;
      render();
    }
  });
}

// 初期化（色・パレット復元）
if (colorEl) {
  let initialHex = lastColorHex || colorEl.value || '#FF3B30';
  if (!PALETTES[paletteName].includes(initialHex)) initialHex = PALETTES[paletteName][0];

  colorEl.value = initialHex;
  updateColorUI(initialHex);
  renderSwatches(paletteName, initialHex);
  updateSwatchActive(initialHex);
}

// カラーピッカー側の変更（手で自由色を選んだ時）
if (colorEl) {
  colorEl.addEventListener('input', () => {
    const hex = colorEl.value;
    updateColorUI(hex);
    localStorage.setItem('lastColorHex', hex);

    // パレット内ならハイライト、外なら解除（マーブリングと同じ）
    if (PALETTES[paletteName].includes(hex)) updateSwatchActive(hex);
    else updateSwatchActive(null);

    if (selectedIndex >= 0) {
      stamps[selectedIndex].color = hex;
      render();
    }
  });

  // 既存仕様：changeで履歴に積む（あなたのapp.jsの仕様に合わせる）
  colorEl.addEventListener('change', () => {
    if (selectedIndex >= 0) pushHistory();
  });
}

// 初期反映
if (colorEl) updateColorUI(colorEl.value);

if (alphaEl) {
  alphaEl.addEventListener('change', () => {
    if (selectedIndex >= 0) pushHistory();
  });
}


// ======== キャンバス座標ユーティリティ ========
function clientToCanvas(ev){
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}
function imageSizeFromTex(img){
  const w = img.naturalWidth  || 200;
  const h = img.naturalHeight || 200;
  return { w, h };
}
function hitTest(x, y, s){
  const hw = (s.w * s.scale) / 2;
  const hh = (s.h * s.scale) / 2;
  const rad = (s.angleDeg || 0) * Math.PI / 180;
  // キャンバス座標→スタンプのローカル座標（中心原点）へ逆回転
  const dx = x - s.x;
  const dy = y - s.y;
  const cos = Math.cos(-rad), sin = Math.sin(-rad);
  const lx = cos * dx - sin * dy;
  const ly = sin * dx + cos * dy;
  return (lx >= -hw && lx <= hw && ly >= -hh && ly <= hh);
}

function selectIndex(i){
  stamps.forEach(s => s.selected = false);
  selectedIndex = i;
  if (i>=0){
    stamps[i].selected = true;
    
  if (alphaEl){
    // 透明度スライダーは「右ほど透明」＝ alpha を反転してつまみ位置に
    const s = (ALPHA_MIN + ALPHA_MAX) - stamps[i].alpha; // スライダー値
    alphaEl.value = String(s);
    const t = (s - ALPHA_MIN) / (ALPHA_MAX - ALPHA_MIN); // 透明度(0..1)
    if (alphaOut) alphaOut.textContent = Math.round(t * 100) + '%';
  }    

  if (colorEl){
      colorEl.value = stamps[i].color || '#ffffff';
      if (colorOut) colorOut.textContent = (stamps[i].color || '#ffffff').toUpperCase();
  }
  }
  refreshUndoRedo();
}

// ======== スライダー（サイズ／不透明度）参照＆反映 ========
if (alphaEl){
  alphaEl.addEventListener('input', () => {
    // %表示は常に更新（未選択でも反映）
    const s = Number(alphaEl.value);
    const t = (s - ALPHA_MIN) / (ALPHA_MAX - ALPHA_MIN); // 透明度(0..1)
    if (alphaOut) alphaOut.textContent = Math.round(t * 100) + '%';

    // スタンプ選択中のみ描画alphaを更新
    if (selectedIndex >= 0){
      stamps[selectedIndex].alpha = (ALPHA_MIN + ALPHA_MAX) - s; // 1.2 - s
      render();
    }
  });
}

// カラー反映
if (colorEl){
  colorEl.addEventListener('input', () => {
    if (selectedIndex >= 0){
      const s = stamps[selectedIndex];
      s.color = colorEl.value;
      if (colorOut) colorOut.textContent = colorEl.value.toUpperCase();
      render();
    }
  });
  // 履歴に1回だけ積む
  colorEl.addEventListener('change', () => {
    if (selectedIndex >= 0) pushHistory();
  });
}

const flipXBtn = document.getElementById('flipXBtn');
const flipYBtn = document.getElementById('flipYBtn');
const flipResetBtn = document.getElementById('flipResetBtn');

function toggleFlip(axis) {
  if (selectedIndex < 0) return;
  ensureFlipProps();
  const s = stamps[selectedIndex];
  if (axis === 'x') s.flipX = !s.flipX;
  if (axis === 'y') s.flipY = !s.flipY;
  render();
  pushHistory();           // 履歴に積む
}

if (flipXBtn) flipXBtn.addEventListener('click', () => toggleFlip('x'));
if (flipYBtn) flipYBtn.addEventListener('click', () => toggleFlip('y'));
if (flipResetBtn) flipResetBtn.addEventListener('click', () => {
  if (selectedIndex < 0) return;
  ensureFlipProps();
  const s = stamps[selectedIndex];
  s.flipX = false; s.flipY = false;
  render();
  pushHistory();
});

// キーボードショートカット：H / V
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (selectedIndex < 0) return;
  if (e.key === 'h' || e.key === 'H') { toggleFlip('x'); }
  if (e.key === 'v' || e.key === 'V') { toggleFlip('y'); }
});


// --- 配置＆ドラッグ（1本指: 移動 / 空タップで新規配置 / ドラッグでゴミ箱へ削除、2本指: ピンチ拡縮＋回転） ---
let dragging = false;
let dragDX = 0, dragDY = 0;
let pendingCreate = null; // 空白タップの仮位置。2本目の指が触れたらピンチ優先にするため pointerup で確定させる
let mouseDragStart = null; // マウスの角ハンドル／回転ハンドル操作の開始状態

const activePointers = new Map(); // pointerId -> {x, y} CSS px（キャンバス相対）
let pinchStart = null;            // { dist, angRad, scale, angleDeg }

function twoPointerMetrics() {
  const pts = Array.from(activePointers.values());
  if (pts.length < 2) return null;
  const [p1, p2] = pts;
  return {
    dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
    angRad: Math.atan2(p2.y - p1.y, p2.x - p1.x)
  };
}

const TRASH_HIT_PAD = 14; // trashZoneの当たり判定に足すpx（見た目より少し広めに）
function getTrashRect() {
  return trashZoneEl ? trashZoneEl.getBoundingClientRect() : null;
}
function isOverTrash(clientX, clientY) {
  const rc = getTrashRect();
  if (!rc) return false;
  return clientX >= rc.left - TRASH_HIT_PAD && clientX <= rc.right + TRASH_HIT_PAD &&
         clientY >= rc.top  - TRASH_HIT_PAD && clientY <= rc.bottom + TRASH_HIT_PAD;
}
function setTrashArmed(on) { trashZoneEl?.classList.toggle('armed', !!on); }
function showTrash(show) {
  if (!trashZoneEl) return;
  trashZoneEl.classList.toggle('visible', !!show);
  if (!show) setTrashArmed(false);
}

function createStampAt(x, y) {
  if (!currentStampTex) return;
  const { w: iw, h: ih } = imageSizeFromTex(currentStampTex);
  const baseScale = defaultScaleForTex(currentStampTex);
  const multiplier = 1.0;
  const scale = baseScale * multiplier;
  // 透明度スライダー値 s を alpha に反転
  const sVal = alphaEl ? Number(alphaEl.value) : ALPHA_MAX; // 右端=1→透明度100%
  const alpha = (ALPHA_MIN + ALPHA_MAX) - sVal;
  const stamp = {
    id: `${currentStampId || 'stamp'}-${Date.now()}`,
    tex: currentStampTex,
    x, y,
    w: iw, h: ih,
    baseScale,
    scale,
    multiplier,
    alpha,
    color: (colorEl ? colorEl.value : '#ffffff'),
    angleDeg: 0,
    selected: false,
    flipX: false,
    flipY: false
  };
  stamps.push(stamp);
  selectIndex(stamps.length - 1);
  render();
  pushHistory();
}

canvas.addEventListener('pointerdown', (ev)=>{
  canvas.setPointerCapture(ev.pointerId);
  const prevPointerType = lastPointerType;
  lastPointerType = ev.pointerType || 'mouse';
  const p = clientToCanvas(ev);
  activePointers.set(ev.pointerId, { x: p.x, y: p.y });

  // マウス操作：選択中スタンプの角ハンドル／回転ハンドルを優先判定（PC向けレガシー操作。
  // 選択中スタンプ1つに限定しているので、他スタンプを誤って掴む問題は起きない）
  if (ev.pointerType === 'mouse' && selectedIndex >= 0) {
    const s = stamps[selectedIndex];
    const lp = toLocal(s, p.x, p.y);
    const h = hitMouseHandle(s, lp.x, lp.y);
    if (h.mode === 'resize') {
      dragMode = 'mouse-resize';
      mouseDragStart = { scale: s.scale, dist0: Math.max(1e-6, Math.hypot(p.x - s.x, p.y - s.y)) };
      render();
      return;
    }
    if (h.mode === 'rotate') {
      dragMode = 'mouse-rotate';
      mouseDragStart = { angle0: Math.atan2(p.y - s.y, p.x - s.x), angleRad: (s.angleDeg || 0) * Math.PI / 180 };
      render();
      return;
    }
  }

  // 2本指目：選択中スタンプがあればピンチ拡縮＋回転ジェスチャーへ（指の位置はスタンプの上でなくてもよい）
  if (activePointers.size >= 2) {
    dragging = false;
    showTrash(false);
    pendingCreate = null;
    if (selectedIndex >= 0) {
      const s = stamps[selectedIndex];
      const m = twoPointerMetrics();
      dragMode = 'pinch';
      pinchStart = {
        dist: Math.max(1e-6, m.dist),
        angRad: m.angRad,
        scale: s.scale,
        angleDeg: s.angleDeg || 0
      };
    } else {
      dragMode = 'multi-idle'; // 対象がないので何もしない
    }
    render();
    return;
  }

  // 1本指：既存スタンプ本体に当たれば選択して移動開始
  for (let i = stamps.length - 1; i >= 0; i--) {
    const s = stamps[i];
    if (hitTest(p.x, p.y, s)) {
      selectIndex(i);
      dragMode = 'move';
      dragging = true;
      dragDX = p.x - s.x;
      dragDY = p.y - s.y;
      showTrash(true);
      render();
      return;
    }
  }

  // 何にも当たらなかった：即座には配置せず保留（この直後に2本目が触れたらピンチ優先）
  if (!currentStampTex) return;
  pendingCreate = { x: p.x, y: p.y };
  dragMode = 'pending';
});

// ======== 初期スケール算出（「良い感じ」の大きさ） ========
const BASE_RATIO = 0.08;

function defaultScaleForTex(img){
  const baseW = baseImg ? fit.w : (canvas.width / dpr);
  const targetDisplayWidth = Math.max(64, Math.round(baseW * BASE_RATIO));
  const iw = img.naturalWidth || 200;
  return targetDisplayWidth / iw;
}

canvas.addEventListener('pointermove', (ev)=>{
  if (ev.pointerType && ev.pointerType !== lastPointerType) {
    lastPointerType = ev.pointerType;
    if (selectedIndex >= 0) render(); // 回転ハンドルの表示切り替えのため再描画
  }

  if (!activePointers.has(ev.pointerId)) {
    // マウス等：ホバー時のカーソル表示
    if (dragMode === 'none' && selectedIndex >= 0) {
      const s = stamps[selectedIndex];
      const p = clientToCanvas(ev);
      if (ev.pointerType === 'mouse') {
        const lp = toLocal(s, p.x, p.y);
        const h = hitMouseHandle(s, lp.x, lp.y);
        if (h.mode === 'resize') canvas.style.cursor = getResizeCursor(h.handleIndex);
        else if (h.mode === 'rotate') canvas.style.cursor = 'grab';
        else canvas.style.cursor = hitTest(p.x, p.y, s) ? 'move' : 'default';
      } else {
        canvas.style.cursor = hitTest(p.x, p.y, s) ? 'move' : 'default';
      }
    } else if (dragMode === 'none') {
      canvas.style.cursor = 'default';
    }
    return;
  }
  const p = clientToCanvas(ev);
  activePointers.set(ev.pointerId, { x: p.x, y: p.y });

  if (dragMode === 'mouse-resize' && selectedIndex >= 0) {
    const s = stamps[selectedIndex];
    const dist = Math.hypot(p.x - s.x, p.y - s.y);
    const ratio = dist / mouseDragStart.dist0;
    const minScaleW = 16 / s.w;
    const minScaleH = 16 / s.h;
    s.scale = Math.max(mouseDragStart.scale * ratio, Math.max(minScaleW, minScaleH));
    render();
    return;
  }

  if (dragMode === 'mouse-rotate' && selectedIndex >= 0) {
    const s = stamps[selectedIndex];
    const angle = Math.atan2(p.y - s.y, p.x - s.x);
    const delta = angle - mouseDragStart.angle0;
    s.angleDeg = ((mouseDragStart.angleRad + delta) * 180 / Math.PI) % 360;
    render();
    return;
  }

  if (dragMode === 'pinch' && pinchStart && selectedIndex >= 0) {
    const m = twoPointerMetrics();
    if (!m) return;
    const s = stamps[selectedIndex];
    const ratio = m.dist / pinchStart.dist;
    const minScaleW = 16 / s.w;
    const minScaleH = 16 / s.h;
    s.scale = Math.max(pinchStart.scale * ratio, Math.max(minScaleW, minScaleH));
    const deltaAngDeg = (m.angRad - pinchStart.angRad) * 180 / Math.PI;
    s.angleDeg = (pinchStart.angleDeg + deltaAngDeg) % 360;
    render();
    return;
  }

  if (dragMode === 'move' && dragging && selectedIndex >= 0) {
    const s = stamps[selectedIndex];
    s.x = p.x - dragDX;
    s.y = p.y - dragDY;
    setTrashArmed(isOverTrash(ev.clientX, ev.clientY));
    render();
  }
});

canvas.addEventListener('pointerleave', (ev)=>{
  if (!activePointers.has(ev.pointerId) && dragMode === 'none') {
    canvas.style.cursor = 'default';
  }
});

function endPointer(ev) {
  activePointers.delete(ev.pointerId);
  canvas.releasePointerCapture?.(ev.pointerId);

  if (dragMode === 'mouse-resize' || dragMode === 'mouse-rotate') {
    if (selectedIndex >= 0) pushHistory();
    mouseDragStart = null;
    dragMode = 'none';
    return;
  }

  if (dragMode === 'pending') {
    if (pendingCreate) createStampAt(pendingCreate.x, pendingCreate.y);
    pendingCreate = null;
    dragMode = 'none';
    return;
  }

  if (dragMode === 'multi-idle') {
    if (activePointers.size < 2) dragMode = 'none';
    return;
  }

  if (dragMode === 'pinch') {
    if (selectedIndex >= 0) pushHistory();
    pinchStart = null;
    if (activePointers.size === 1 && selectedIndex >= 0) {
      // 1本になった指でそのまま移動へシームレスに継続
      const s = stamps[selectedIndex];
      const [remaining] = activePointers.values();
      dragMode = 'move';
      dragging = true;
      dragDX = remaining.x - s.x;
      dragDY = remaining.y - s.y;
      showTrash(true);
    } else {
      dragMode = 'none';
    }
    render();
    return;
  }

  if (dragMode === 'move') {
    const wasArmed = isOverTrash(ev.clientX, ev.clientY);
    showTrash(false);
    if (wasArmed && selectedIndex >= 0) {
      stamps.splice(selectedIndex, 1);
      selectedIndex = -1;
      pushHistory();
      refreshUndoRedo();
    } else {
      pushHistory();
    }
    dragging = false;
    dragMode = 'none';
    render();
    return;
  }

  dragMode = 'none';
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

const saveBtn = document.getElementById('saveBtn');
if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    persistArtworkImage();

    // 選択枠を含めずに書き出したい場合：一時的に選択解除で描画→出力→元に戻す
    const prevSel = selectedIndex;
    selectedIndex = -1;
    render();

    // PNG データURLを作ってダウンロード
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'collage.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 表示を元に戻す
    selectedIndex = prevSel;
    render();
  });
}

const clearBtn = document.getElementById('clearBtn');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    // スタンプのみ全削除（写真は残す）
    stamps.length = 0;
    selectedIndex = -1;
    render();
    pushHistory();
  });
}

// === PNGスタンプの定義（asset/stamps 配下） ===
const STAMP_BASE = 'asset/stamps/';
// ここにファイル名（拡張子なし）を並べるだけでOK
const STAMP_NAMES = [
  'ashiato_white',
  'bag_white',
  'hanen_white',
  'happa_white',
  'hashiru_white',
  'heart_white',
  'hito_white',
  'honyuubin_white',
  'hoshi_white',
  'ie_white',
  'inu_white',
  'kaidan_white',
  'kouyouju_white',
  'kuruma_white',
  'maru_white',
  'ryukku2_white',
  'sankaku_white',
  'shikaku_white',
  'shizuku_white',
  'sinyouju_white',
  'te_white',
  'te2_white',
  'tori_white'
];

// id/src を自動生成
const STAMP_ASSETS = STAMP_NAMES.map(name => ({
  id: name,
  src: `${STAMP_BASE}${name}.png`
}));

const thumbsEl = document.getElementById('thumbs');
let currentStampTex = null;
let currentStampId  = null;

// サムネ＆選択挙動
STAMP_ASSETS.forEach(asset => {
  const img = new Image();
  img.src = asset.src;

  const cell = document.createElement('div');
  cell.className = 'thumb';

  const tag = document.createElement('img');
  tag.src = asset.src;
  tag.alt = asset.id;
  cell.appendChild(tag);

  cell.addEventListener('click', () => {
    currentStampTex = img;
    currentStampId  = asset.id;
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('selected'));
    cell.classList.add('selected');
  });

  thumbsEl.appendChild(cell);
});

// 初期選択（最初の1個）
if (STAMP_ASSETS.length > 0) {
  const first = STAMP_ASSETS[0];
  currentStampTex = new Image();
  currentStampTex.src = first.src;
  currentStampId = first.id;
  thumbsEl.firstElementChild?.classList.add('selected');
}

// キーボードでサムネ選択（← → ↑ ↓）
window.addEventListener('keydown', (ev) => {
  const cells = Array.from(document.querySelectorAll('.thumbs .thumb'));
  if (!cells.length) return;

  let idx = cells.findIndex(c => c.classList.contains('selected'));
  if (idx < 0) idx = 0;

  const cols = 4; // 4列固定
  const rows = Math.ceil(cells.length / cols);

  let next = idx;
  if (ev.key === 'ArrowRight') next = Math.min(idx + 1, cells.length - 1);
  if (ev.key === 'ArrowLeft')  next = Math.max(idx - 1, 0);
  if (ev.key === 'ArrowDown')  next = Math.min(idx + cols, cells.length - 1);
  if (ev.key === 'ArrowUp')    next = Math.max(idx - cols, 0);
  if (next === idx) return;

  // 見た目の選択状態と、実際の currentStamp を更新
  cells.forEach(c => c.classList.remove('selected'));
  const nextCell = cells[next];
  nextCell.classList.add('selected');
  nextCell.scrollIntoView({ block: 'nearest' });

  // 背景imgのsrcから currentStampTex / currentStampId を復元
  const tag = nextCell.querySelector('img');
  if (tag) {
    const asset = STAMP_ASSETS.find(a => a.src === tag.src || tag.src.endsWith(a.src));
    if (asset) {
      const img = new Image();
      img.src = asset.src;
      currentStampTex = img;
      currentStampId  = asset.id;
    }
  }
});

// ===== IndexedDB: 画像(Blob)を保存/読み込みする共通ヘルパー =====
const DB_NAME = "ws_art_db";
const STORE_NAME = "images";
const KEY_LATEST_MARBLING = "latest_marbling_base";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

// 例：コラージュ app.js の先頭〜 baseImg が定義されている付近に追加してOK
async function loadMarblingBaseIfExists() {
  const blob = await idbGet(KEY_LATEST_MARBLING);
  if (!blob) return false;

  const url = URL.createObjectURL(blob);
  baseImg = await loadImage(url); // 既にあなたの app.js にある loadImage を使う :contentReference[oaicite:3]{index=3}
  computeContain();
  render();
  refreshUndoRedo();
  return true;
}

// 起動時に呼ぶ（DOMができてから）
window.addEventListener("DOMContentLoaded", () => {
  loadMarblingBaseIfExists().catch(console.error);
});
