/**
 * S8 確認して登録（矢上小版・授業案 rev3）
 * 入力内容と作品画像を Cloudflare Worker（POST /submit）に送り、D1（文章・地点）と R2（画像）に登録する。
 *
 * 送る項目（Worker の properties）
 * - Message  : 作品のタイトル
 * - Body     : この作品で伝えたいこと
 * - field_23 : いつの行動か（事前／災害時／復旧時）
 * - field_24 : 読み取ったハザードマップ（カンマ区切り）
 * - field_25 : 作者の番号（4201〜4228）
 * - place    : 場所（hiyoshi5 / kagami / yagami）、lat / lon はその場所の固定の座標
 * - Mabling・collage は使わない（空のまま）
 * 作品画像：localStorage.artworkImage（コラージュの自動保存で作られる）
 */

const CONFIG = {
    // Cloudflare Worker の URL（作品の受付窓口）。デプロイ後に URL が違っていたらここと common/config.js を直す
    WORKER_URL: 'https://yagami-submit.kazuki131214.workers.dev',
    // Worker の SUBMIT_SECRET と同じ値（ページのソースを見ればだれでも分かる。ADMIN_KEY はここに書かない）
    SUBMIT_SECRET: 'yagami-ws-20261118',
    PAGES: {
        artwork: '../artwork/artwork_submit.html',
        artworkEdit: '../artwork/artwork_submit.html?edit=1',
        placeEdit: '../../map/Log/log_hazard_map.html?edit=1',
        marblingApp: '../../marbling/app/index.html?edit=1',   // 作り直し（修正完了で確認画面にもどる）
        collageApp: '../../collage/app/index.html?edit=1',
        map: '../../present/index.html'
    }
};
function workerBase() { return ((window.YAGAMI_CONFIG && window.YAGAMI_CONFIG.WORKER_URL) || CONFIG.WORKER_URL).replace(/\/+$/, ''); }

const HAZARD_LABELS = {
    '洪水（外水氾濫）': '洪水{こうずい}（外水氾濫{がいすいはんらん}）',
    '高潮': '高潮{たかしお}',
    '土砂災害（急傾斜地の崩壊）': '土砂{どしゃ}災害{さいがい}（急傾斜地{きゅうけいしゃち}の崩壊{ほうかい}）',
    '地震の揺れ（震度）': '地震{じしん}の揺{ゆ}れ（震度{しんど}）'
};

let appData = { hazards: [], location: null, art: {} };
let isSubmitting = false;

function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function rb(s) { return window.rubyHTML ? window.rubyHTML(s) : s; }

function loadData() {
    const h = readJSON('hazardMapLog');
    appData.hazards = Array.isArray(h.hazards) ? h.hazards : [];
    appData.location = h.location || null;
    appData.art = readJSON('artworkSubmit');
}

// ---------- 確認の一覧 ----------
function row(label, valueHTML, editKey, empty) {
    return '<div class="s8-row' + (empty ? ' empty' : '') + '">'
        + '<div class="s8-row-label">' + rb(label) + '</div>'
        + '<div class="s8-row-value">' + valueHTML + '</div>'
        + '<button type="button" class="s8-edit" data-edit="' + editKey + '">✏️ ' + rb('直{なお}す') + '</button>'
        + '</div>';
}
function renderSummary() {
    const a = appData.art;
    const place = appData.location && window.yagamiPlace(appData.location.place);
    const NONE = rb('（まだ入力{にゅうりょく}していません）');
    const NONE_SEL = rb('（まだ選{えら}んでいません）');
    const html = [
        row('タイトル', a.title ? '<span class="s8-v-title" data-user-text>' + esc(a.title) + '</span>' : NONE, 'artwork', !a.title),
        row('伝{つた}えたいこと', a.body ? '<span class="s8-v-body" data-user-text>' + esc(a.body) + '</span>' : NONE, 'artwork', !a.body),
        row('いつの行動{こうどう}', a.phase ? '<span class="s8-tag">' + rb(window.yagamiPhaseLabel(a.phase)) + '</span>' : NONE_SEL, 'artwork', !a.phase),
        row('番号{ばんごう}', window.YAGAMI_NUMBER_RE.test(a.number || '') ? '<span class="s8-v-num">' + esc(a.number) + '</span>' : NONE, 'artwork', !window.YAGAMI_NUMBER_RE.test(a.number || '')),
        row('場所{ばしょ}', place ? '📍 ' + rb(place.name) : NONE_SEL, 'place', !place),
        row('災害{さいがい}', appData.hazards.length ? appData.hazards.map(x => '<span class="s8-tag">' + rb(HAZARD_LABELS[x] || esc(x)) + '</span>').join('') : NONE_SEL, 'place', !appData.hazards.length)
    ].join('');
    const list = document.getElementById('summaryList');
    list.innerHTML = html;
    list.querySelectorAll('.s8-edit').forEach(b => b.addEventListener('click', () => {
        location.href = b.dataset.edit === 'place' ? CONFIG.PAGES.placeEdit : CONFIG.PAGES.artworkEdit;
    }));
}
function missingItems() {
    const a = appData.art, m = [];
    if (!a.title) m.push('タイトル');
    if (!a.body) m.push('伝えたいこと');
    if (!a.phase) m.push('いつの行動か');
    if (!window.YAGAMI_NUMBER_RE.test(a.number || '')) m.push('番号');
    if (!(appData.location && window.yagamiPlace(appData.location.place))) m.push('場所');
    if (!appData.hazards.length) m.push('災害');
    return m;
}

// ---------- 作品画像 ----------
function wsIdbGet(key) {
    return new Promise(function (resolve) {
        try {
            const req = indexedDB.open('ws_art_db', 1);
            req.onupgradeneeded = function () { if (!req.result.objectStoreNames.contains('images')) req.result.createObjectStore('images'); };
            req.onsuccess = function () {
                try {
                    const g = req.result.transaction('images', 'readonly').objectStore('images').get(key);
                    g.onsuccess = function () { resolve(g.result || null); };
                    g.onerror = function () { resolve(null); };
                } catch (e) { resolve(null); }
            };
            req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
    });
}
function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
}
function loadImg(src) {
    return new Promise(function (resolve, reject) { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
}
// マーブリング画像＋スタンプ配置から作品画像を作り直す（自動保存の画像が見つからないときの予備）
async function rebuildArtworkFromParts() {
    const base = await wsIdbGet('latest_marbling_base');
    if (!base) return null;
    const baseImg = await loadImg(URL.createObjectURL(base));
    const scale = Math.min(1, 1000 / Math.max(baseImg.naturalWidth, baseImg.naturalHeight));
    const W = Math.round(baseImg.naturalWidth * scale), H = Math.round(baseImg.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(baseImg, 0, 0, W, H);
    const saved = await wsIdbGet('collage_stamps');
    for (const d of ((saved && saved.stamps) || [])) {
        const name = String(d.name || '').replace(/(-[0-9]+)+$/, '');
        let tex;
        try { tex = await loadImg('../../collage/app/detail/asset/stamps/' + name + '.png'); } catch (e) { continue; }
        const w = d.nw * W, h = w * (tex.naturalHeight / tex.naturalWidth);
        let src = tex;
        if (d.color && d.color.toLowerCase() !== '#ffffff') {
            const t = document.createElement('canvas'); t.width = tex.naturalWidth; t.height = tex.naturalHeight;
            const tc = t.getContext('2d');
            tc.drawImage(tex, 0, 0); tc.globalCompositeOperation = 'source-in';
            tc.fillStyle = d.color; tc.fillRect(0, 0, t.width, t.height);
            src = t;
        }
        ctx.save();
        ctx.globalAlpha = d.alpha == null ? 0.68 : d.alpha;
        ctx.translate(d.nx * W, d.ny * H);
        ctx.rotate((d.angleDeg || 0) * Math.PI / 180);
        ctx.scale(d.flipX ? -1 : 1, d.flipY ? -1 : 1);
        ctx.drawImage(src, -w / 2, -h / 2, w, h);
        ctx.restore();
    }
    return c.toDataURL('image/jpeg', 0.85);
}
// 作品画像を必ず用意する：localStorage → IndexedDB（コラージュの自動保存）→ 部品から作り直し
async function ensureArtworkImage() {
    if (localStorage.getItem('artworkImage')) return;
    try {
        const blob = await wsIdbGet('artwork_image');
        let dataURL = blob ? await blobToDataURL(blob) : null;
        if (!dataURL) dataURL = await rebuildArtworkFromParts();
        if (dataURL) { localStorage.setItem('artworkImage', dataURL); localStorage.setItem('artworkImageExt', 'jpg'); }
    } catch (e) { console.error('作品画像の用意に失敗', e); }
}
function showArtwork() {
    const img = document.getElementById('artwork-preview-img');
    const empty = document.getElementById('artwork-preview-empty');
    const data = localStorage.getItem('artworkImage');
    if (data) { img.src = data; img.style.display = 'block'; empty.style.display = 'none'; }
    else { img.style.display = 'none'; empty.style.display = 'flex'; empty.innerHTML = rb('作品{さくひん}の絵{え}が見{み}つかりません。「コラージュを作{つく}り直{なお}す」を押{お}してください。'); }
}

// ---------- 送信 ----------
function buildSubmitPayload(imageDataURL) {
    const a = appData.art;
    const place = window.yagamiPlace(appData.location && appData.location.place);
    return {
        secret: CONFIG.SUBMIT_SECRET,
        lat: place.lat,
        lon: place.lon,
        properties: {
            field_23: a.phase || null,
            field_24: appData.hazards.join(', '),
            field_25: a.number,
            Message: a.title || '',
            Body: a.body || '',
            place: place.id,
            creationDate: a.creationDate || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
        },
        imageBase64: imageDataURL,
        imageExt: localStorage.getItem('artworkImageExt') || 'jpg'
    };
}
async function submitArtwork() {
    if (isSubmitting) return;
    loadData();
    const miss = missingItems();
    if (miss.length) { setStatus('error', 'まだ入{はい}っていない項目{こうもく}があります：' + miss.join('・')); return; }
    const imageDataURL = localStorage.getItem('artworkImage');
    if (!imageDataURL) { setStatus('error', '作品{さくひん}の絵{え}が見{み}つかりません。「コラージュを作{つく}り直{なお}す」を押{お}してください。'); return; }
    await sendSubmitPayload(buildSubmitPayload(imageDataURL));
}
async function sendSubmitPayload(payload) {
    isSubmitting = true;
    setButton('sending');
    setStatus('info', '登録{とうろく}しています。少{すこ}し待{ま}ってください…');
    try {
        localStorage.setItem('pendingArtworkSubmitPayload', JSON.stringify(payload));
        const res = await fetch(workerBase() + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        let json = null;
        try { json = await res.json(); } catch (e) { /* ignore */ }
        if (res.ok && json && json.ok) {
            localStorage.removeItem('pendingArtworkSubmitPayload');
            if (json.id) localStorage.setItem('lastSubmittedArtworkId', json.id);
            setButton('success');
            setStatus(null);
            showCompletion();
        } else {
            setButton('error');
            setStatus('error', '送信{そうしん}できませんでした。先生{せんせい}を呼{よ}んでください（' + ((json && json.error) ? json.error : 'status ' + res.status) + '）');
        }
    } catch (err) {
        console.error('送信エラー:', err);
        setButton('error');
        setStatus('error', 'インターネットにつながりませんでした。もう一度{いちど}押{お}してください。それでもだめなときは先生{せんせい}を呼{よ}んでください。');
    } finally {
        isSubmitting = false;
    }
}
function setButton(state) {
    const btn = document.getElementById('btn-submit-artwork');
    if (state === 'sending') { btn.disabled = true; btn.innerHTML = rb('送信{そうしん}しています…'); }
    else if (state === 'success') { btn.disabled = true; btn.innerHTML = rb('✅ 登録{とうろく}できました'); }
    else { btn.disabled = false; btn.innerHTML = rb('📤 もう一度{いちど}送信{そうしん}する'); }
}
function setStatus(kind, msg) {
    const el = document.getElementById('submit-status');
    if (!kind) { el.style.display = 'none'; return; }
    el.className = 's8-status ' + kind;
    el.innerHTML = (kind === 'error' ? '⚠ ' : '') + rb(msg);
    el.style.display = 'block';
}
function showCompletion() { document.getElementById('step-complete').style.display = 'flex'; }

// 前回の送信が終わっていない（電波が切れたなど）ときは、もう一度送れるようにする
function checkPendingSubmission() {
    const pending = localStorage.getItem('pendingArtworkSubmitPayload');
    if (!pending) return;
    setStatus('info', 'まだ送{おく}れていない作品{さくひん}があります。「登録{とうろく}する」を押{お}すと、もう一度{いちど}送{おく}ります。');
}

// ---------- 作り直し・移動 ----------
function redoWork(page) {
    const msg = page === 'marblingApp'
        ? 'マーブリングを作り直す画面を開きます。\n「修正完了」を押すと、この画面に戻ります。\n（コラージュのスタンプと入力した内容は残ります）'
        : 'コラージュを作り直す画面を開きます。\n「修正完了」を押すと、この画面に戻ります。\n（入力した内容は残ります）';
    if (confirm(msg)) location.href = CONFIG.PAGES[page];
}
window.redoWork = redoWork;
function goToMap() {
    const p = appData.location && appData.location.place;
    location.href = CONFIG.PAGES.map + (p ? '?place=' + encodeURIComponent(p) : '');
}
window.goToMap = goToMap;

// 完成した作品を iPad に保存（「ファイル」アプリの「ダウンロード」に入る）
async function downloadArtwork() {
    const dataURL = localStorage.getItem('artworkImage');
    if (!dataURL) { alert('作品の画像が見つかりません。'); return; }
    const blob = await (await fetch(dataURL)).blob();
    const url = URL.createObjectURL(blob);
    const id = localStorage.getItem('lastSubmittedArtworkId') || '';
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yagami_' + (id ? id + '_' : '') + (appData.art.number || 'sakuhin') + '.jpg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    document.getElementById('download-note').style.display = 'block';
}
window.downloadArtwork = downloadArtwork;

document.addEventListener('DOMContentLoaded', async () => {
    loadData();
    renderSummary();
    document.getElementById('btn-back').addEventListener('click', () => { location.href = CONFIG.PAGES.artwork; });
    document.getElementById('btn-submit-artwork').addEventListener('click', submitArtwork);
    checkPendingSubmission();
    // 登録が終わったあとにこの画面を開き直したときは、二重に登録しないように完了画面を出す
    if (localStorage.getItem('lastSubmittedArtworkId')) { setButton('success'); showCompletion(); }
    await ensureArtworkImage();
    showArtwork();
});
