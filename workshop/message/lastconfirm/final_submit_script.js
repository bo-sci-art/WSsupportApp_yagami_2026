/**
 * Final Submit Page Script - 矢上小版（Cloudflare Worker yagami-submit：D1＋R2 に登録）
 *
 * Purpose: 入力内容と作品画像を Cloudflare Worker（POST /submit）に送り、
 *          D1（文章・地点）と R2（画像）に登録する。GitHub には保存しない
 *
 * Field Mappings (Worker側 properties):
 * - Used hazard maps → field_24
 * - Marbling description → Mabling
 * - Collage description → collage
 * - 防災行動のタイミング（事前／災害時／復旧時） → field_23（カンマ区切り）
 * - Message (artwork title) → Message
 * - Creator name → field_25
 * - Target location → lat / lon
 * - 作品画像 → localStorage.artworkImage（コラージュページの保存操作で自動生成）
 */

// =====================================
// Configuration
// =====================================
const CONFIG = {
    // Cloudflare Worker のURL（作品投稿の受付窓口）
    WORKER_URL: 'https://yagami-submit.kazuki131214.workers.dev',   // 矢上小版の Worker（D1＋R2）。デプロイ後に URL が違っていたらここを直す
    // Workerの環境変数 SUBMIT_SECRET と同じ値にしてください
    // ※ページのソースを見ればだれでも分かる合言葉（いたずら投稿は防げない）。ADMIN_KEY はここに書かない
    SUBMIT_SECRET: 'yagami-ws-20261118',

    // Page URLs - 実際のプロジェクト構成に合わせて修正してください
    PAGES: {
        hazard: '../../map/Log/log_hazard_map.html',        // ← 対象地点/ハザードマップ選択ページ
        marbling: '../../marbling/Log/log_marbling.html',      // ← マーブリング体験ページ
        collage: '../../collage/app/index.html',
        artwork: '../../message/artwork/artwork_submit.html',   // ← 作品情報入力ページ
        next: '../../present/index.html',     // ← 次の防災行動ページ（仮）
        map: '../../present/index.html',      // ← 作品集マップ
        home: '../../start/index.html'
    }
};

// =====================================
// State Management
// =====================================
let appData = {
    hazardMap: {
        hazards: [],
        location: { lat: null, lon: null }
    },
    marbling: {
        description: ''
    },
    collage: {
        description: '',
        phases: []
    },
    artwork: {
        title: '',
        creatorName: '',
        creationDate: ''
    }
};

let previewMap = null;
let previewMarker = null;
let isSubmitting = false;

// =====================================
// Initialize Page
// =====================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('Final Submit Page v3.0 (Serverless) - Initializing...');

    loadAllData();
    displayDataSummary();
    checkMissingData();
    ensureArtworkImage().then(function () {
        checkArtworkImage_sync();
        displayArtworkPreview_sync();
    });
    checkPendingSubmission();
    initInlineEditing();

    console.log('Final Submit Page - Ready');
});

// =====================================
// Load Data from localStorage
// =====================================
function loadAllData() {
    try {
        const hazardMapData = localStorage.getItem('hazardMapLog');
        if (hazardMapData) {
            const parsed = JSON.parse(hazardMapData);
            appData.hazardMap = parsed.hazardMap ?? parsed;
            console.log('Loaded hazard map data:', appData.hazardMap);
        }

        const marblingData = localStorage.getItem('marblingLog');
        if (marblingData) {
            const parsed = JSON.parse(marblingData);
            appData.marbling = parsed.marbling ?? parsed;
            console.log('Loaded marbling data:', appData.marbling);
        }

        const collageData = localStorage.getItem('collageLog');
        if (collageData) {
            const parsed = JSON.parse(collageData);
            appData.collage = parsed.collage ?? parsed;
            console.log('Loaded collage data:', appData.collage);
        }

        const artworkData = localStorage.getItem('artworkSubmit');
        if (artworkData) {
            const parsed = JSON.parse(artworkData);
            appData.artwork.title = parsed.title ?? '';
            appData.artwork.creatorName = parsed.creatorName ?? '';
            appData.artwork.creationDate = parsed.creationDate ?? '';
            console.log('Loaded artwork data:', appData.artwork);
        }
    } catch (error) {
        console.error('Error loading data from localStorage:', error);
        alert('データを よみこめませんでした。まえの がめんに もどってね。');
    }
}

// =====================================
// Display Data Summary
// =====================================
function displayDataSummary() {
    // Location
    const loc = appData.hazardMap.location;
    const locationEl = document.getElementById('summary-location');
    if (loc?.lat && loc?.lon) {
        locationEl.textContent = '📍 地図{ちず}の ピンの 場所{ばしょ}';
        locationEl.classList.remove('empty');
        renderSummaryMap(loc.lat, loc.lon);
    } else {
        locationEl.textContent = '（まだ えらんでいないよ）';
        locationEl.classList.add('empty');
    }

    // Hazards
    const hazardsEl = document.getElementById('summary-hazards');
    if (appData.hazardMap.hazards && appData.hazardMap.hazards.length > 0) {
        hazardsEl.innerHTML = appData.hazardMap.hazards
            .map(h => `<span class="tag">${escapeHTML(HAZARD_LABELS[h] || h)}</span>`)
            .join(' ');
        hazardsEl.classList.remove('empty');
    } else {
        hazardsEl.textContent = '（まだ えらんでいないよ）';
        hazardsEl.classList.add('empty');
    }

    // Marbling
    const marblingEl = document.getElementById('summary-marbling');
    if (appData.marbling.description) {
        marblingEl.textContent = appData.marbling.description;
        marblingEl.classList.remove('empty');
    } else {
        marblingEl.textContent = '（まだ 書{か}いていないよ）';
        marblingEl.classList.add('empty');
    }

    // Collage
    const collageEl = document.getElementById('summary-collage');
    if (appData.collage.description) {
        collageEl.textContent = appData.collage.description;
        collageEl.classList.remove('empty');
    } else {
        collageEl.textContent = '（まだ 書{か}いていないよ）';
        collageEl.classList.add('empty');
    }

    // 防災行動のタイミング
    const phasesEl = document.getElementById('summary-phases');
    if (phasesEl) {
        const ph = appData.collage.phases || [];
        if (ph.length > 0) {
            phasesEl.innerHTML = ph.map(x => `<span class="tag">${escapeHTML(PHASE_LABELS[x] || x)}</span>`).join(' ');
            phasesEl.classList.remove('empty');
        } else {
            phasesEl.textContent = '（まだ えらんでいないよ）';
            phasesEl.classList.add('empty');
        }
    }

    // Title
    const titleEl = document.getElementById('summary-title');
    if (appData.artwork.title) {
        titleEl.textContent = appData.artwork.title;
        titleEl.classList.remove('empty');
    } else {
        titleEl.textContent = '（まだ 書{か}いていないよ）';
        titleEl.classList.add('empty');
    }

    // Creator
    const creatorEl = document.getElementById('summary-creator');
    if (appData.artwork.creatorName) {
        creatorEl.textContent = appData.artwork.creatorName;
        creatorEl.classList.remove('empty');
    } else {
        creatorEl.textContent = '（まだ 書{か}いていないよ）';
        creatorEl.classList.add('empty');
    }
}

// =====================================
// Check Missing Data & Show Badges
// =====================================
function checkMissingData() {
    const missing = [];
    const badges = {
        hazard: false,
        marbling: false,
        collage: false,
        artwork: false
    };

    if (!appData.hazardMap.hazards || appData.hazardMap.hazards.length === 0) {
        missing.push('見{み}た ハザードマップを えらんでね');
        badges.hazard = true;
    }
    if (!appData.hazardMap.location?.lat || !appData.hazardMap.location?.lon) {
        missing.push('作品{さくひん}にする 場所{ばしょ}を えらんでね');
        badges.hazard = true;
    }

    if (!appData.marbling.description || appData.marbling.description.trim() === '') {
        missing.push('マーブリングの ことを 書{か}いてね');
        badges.marbling = true;
    }

    if (!appData.collage.description || appData.collage.description.trim() === '') {
        missing.push('コラージュの ことを 書{か}いてね');
        badges.collage = true;
    }
    if (!appData.collage.phases || appData.collage.phases.length === 0) {
        missing.push('いつの 行動{こうどう}かを えらんでね');
        badges.collage = true;
    }

    if (!appData.artwork.title || appData.artwork.title.trim() === '') {
        missing.push('タイトルを 書{か}いてね');
        badges.artwork = true;
    }
    if (!appData.artwork.creatorName || appData.artwork.creatorName.trim() === '') {
        missing.push('ペンネームを 書{か}いてね');
        badges.artwork = true;
    }

    Object.keys(badges).forEach(key => {
        const badge = document.getElementById(`badge-${key}`);
        if (badge) {
            badge.style.display = badges[key] ? 'flex' : 'none';
        }
    });

    const alertEl = document.getElementById('alert-missing');
    const listEl = document.getElementById('missing-items-list');

    if (missing.length > 0) {
        if (alertEl) alertEl.style.display = 'flex';
        if (listEl) listEl.innerHTML = missing.map(item => `<li>${item}</li>`).join('');
    } else {
        if (alertEl) alertEl.style.display = 'none';
    }
}

// =====================================
// 作品画像（localStorage.artworkImage）の有無をチェック
// =====================================
function checkArtworkImage_sync() {
    const alertEl = document.getElementById('image-missing-alert');
    const btn = document.getElementById('btn-submit-artwork');
    const hasImage = !!localStorage.getItem('artworkImage');

    if (alertEl) alertEl.style.display = hasImage ? 'none' : 'flex';
    if (btn) btn.disabled = !hasImage;
}

// =====================================
// 作品画像プレビューを表示
// =====================================
function displayArtworkPreview_sync() {
    const img = document.getElementById('artwork-preview-img');
    const empty = document.getElementById('artwork-preview-empty');
    const data = localStorage.getItem('artworkImage');
    if (data) {
        if (img) { img.src = data; img.style.display = 'block'; }
        if (empty) empty.style.display = 'none';
    } else {
        if (img) img.style.display = 'none';
        if (empty) empty.style.display = 'block';
    }
}

// =====================================
// 送信ペイロードの作成
// =====================================
function buildSubmitPayload(imageDataURL) {
    const loc = appData.hazardMap.location;
    const hazards = (appData.hazardMap.hazards || []).join(', ');

    return {
        secret: CONFIG.SUBMIT_SECRET,
        lat: loc.lat,
        lon: loc.lon,
        properties: {
            field_23: (appData.collage.phases || []).join(', ') || null,   // 防災行動のタイミング
            field_24: hazards,
            field_25: appData.artwork.creatorName || '匿名',
            Message: appData.artwork.title || '',
            collage: appData.collage.description || '',
            Mabling: appData.marbling.description || '',
            creationDate: appData.artwork.creationDate || new Date().toISOString().slice(0, 10)
        },
        imageBase64: imageDataURL,
        imageExt: localStorage.getItem('artworkImageExt') || 'jpg'
    };
}

// =====================================
// 送信ボタンの押下（Survey123の代わり）
// =====================================
async function submitArtwork() {
    if (isSubmitting) return;

    const loc = appData.hazardMap.location;
    if (!loc || !loc.lat || !loc.lon) {
        alert('さくひんに する ばしょが えらばれていません。「なおす」から えらんでね。');
        return;
    }

    const imageDataURL = localStorage.getItem('artworkImage');
    if (!imageDataURL) {
        alert('さくひんの えが みつかりません。コラージュの がめんに もどってね。');
        return;
    }

    const payload = buildSubmitPayload(imageDataURL);
    await sendSubmitPayload(payload);
}

// =====================================
// Workerへ送信（失敗時はlocalStorageに退避して再送可能に）
// =====================================
async function sendSubmitPayload(payload) {
    isSubmitting = true;
    setSubmitUIState('sending');

    try {
        localStorage.setItem('pendingArtworkSubmitPayload', JSON.stringify(payload));

        const res = await fetch(workerBase() + '/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        let json = null;
        try { json = await res.json(); } catch (e) { /* ignore */ }

        if (res.ok && json && json.ok) {
            localStorage.removeItem('pendingArtworkSubmitPayload');
            if (json.id) localStorage.setItem('lastSubmittedArtworkId', json.id);

            const banner = document.getElementById('pending-submit-banner');
            if (banner) banner.remove();

            setSubmitUIState('success');
            showCompletion();
        } else {
            const msg = '送{おく}れませんでした。先生{せんせい}を よんでね（' + ((json && json.error) ? json.error : 'status ' + res.status) + '）';
            setSubmitUIState('error', msg);
        }
    } catch (err) {
        console.error('送信エラー:', err);
        setSubmitUIState('error', 'インターネットに つながりませんでした。もう一度{いちど} おしてね。だめなら 先生{せんせい}を よんでね。');
    } finally {
        isSubmitting = false;
    }
}

// =====================================
// 送信ボタン・ステータス表示の切り替え
// =====================================
function setSubmitUIState(state, message) {
    const btn = document.getElementById('btn-submit-artwork');
    const statusEl = document.getElementById('submit-status');
    if (!btn || !statusEl) return;

    if (state === 'sending') {
        btn.disabled = true;
        btn.textContent = '送{おく}っています…';
        statusEl.style.display = 'block';
        statusEl.className = 'submit-status info';
        statusEl.textContent = '登録{とうろく}しています。まってね…';
    } else if (state === 'success') {
        btn.disabled = true;
        btn.textContent = '✅ 登録{とうろく}できたよ';
        statusEl.style.display = 'none';
    } else if (state === 'error') {
        btn.disabled = false;
        btn.textContent = '📤 もう一度{いちど} 送{おく}る';
        statusEl.style.display = 'block';
        statusEl.className = 'submit-status error';
        statusEl.textContent = '⚠ ' + message;
    }
}

// =====================================
// 完了画面を表示
// =====================================
function showCompletion() {
    const completeSection = document.getElementById('step-complete');
    if (completeSection) {
        completeSection.style.display = 'block';
        completeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    celebrateCompletion();
}

function celebrateCompletion() {
    console.log('🎉 Completion celebrated!');
}

// =====================================
// 前回送信が完了していないデータが残っていれば再送を案内
// =====================================
function checkPendingSubmission() {
    const pending = localStorage.getItem('pendingArtworkSubmitPayload');
    if (!pending) return;

    const section = document.getElementById('step-survey');
    if (!section) return;

    const banner = document.createElement('div');
    banner.className = 'alert-card warning';
    banner.id = 'pending-submit-banner';
    banner.innerHTML = `
        <div class="alert-icon">⏳</div>
        <div class="alert-content">
            <h3 class="alert-title">まだ 送{おく}れていない 作品{さくひん}が あるよ</h3>
            <p class="info-note">もう一度{いちど} 送{おく}るときは「もう一度{いちど} 送{おく}る」を おしてね。</p>
            <div class="action-section" style="margin-top:0.75rem;">
                <button class="btn btn-primary" id="btn-retry-pending" type="button">もう一度{いちど} 送{おく}る</button>
                <button class="btn btn-secondary" id="btn-discard-pending" type="button">送{おく}らない</button>
            </div>
        </div>
    `;

    const header = section.querySelector('.step-header');
    if (header && header.nextSibling) {
        section.insertBefore(banner, header.nextSibling);
    } else {
        section.insertBefore(banner, section.firstChild);
    }

    const retryBtn = document.getElementById('btn-retry-pending');
    const discardBtn = document.getElementById('btn-discard-pending');

    if (retryBtn) {
        retryBtn.addEventListener('click', async () => {
            try {
                const payload = JSON.parse(pending);
                await sendSubmitPayload(payload);
            } catch (e) {
                console.error(e);
            }
        });
    }
    if (discardBtn) {
        discardBtn.addEventListener('click', () => {
            localStorage.removeItem('pendingArtworkSubmitPayload');
            banner.remove();
        });
    }
}

// =====================================
// Navigation Functions
// =====================================
function navigateToPage(page) {
    if (CONFIG.PAGES[page]) {
        if (confirm(`${getPageName(page)}の がめんに もどりますか？\n（かいた ないようは のこっています）`)) {
            window.location.href = CONFIG.PAGES[page];
        }
    }
}

function getPageName(page) {
    const names = {
        hazard: 'ばしょ',
        marbling: 'マーブリング',
        collage: 'コラージュ',
        artwork: 'タイトル'
    };
    return names[page] || '';
}

function goBack() {
    navigateToPage('artwork');
}

function goToNextAction() {
    window.location.href = CONFIG.PAGES.next;
}

function viewMap() {
    window.open(CONFIG.PAGES.map, '_blank');
}

function goHome() {
    if (confirm('さいしょの がめんに もどりますか？')) {
        window.location.href = CONFIG.PAGES.home;
    }
}

// =====================================
// Map Preview (Leaflet)
// =====================================
function renderSummaryMap(lat, lon) {
    const mapEl = document.getElementById('summary-map');
    if (!mapEl) return;

    if (!lat || !lon) {
        mapEl.innerHTML = '<div style="padding:12px;color:#999;text-align:center;">地図{ちず}を 出{だ}せません</div>';
        return;
    }

    if (!previewMap) {
        previewMap = L.map('summary-map', {
            zoomControl: true,
            scrollWheelZoom: false,
            dragging: true,
            touchZoom: true
        });
        L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
            attribution: '地理院タイル', maxZoom: 18
        }).addTo(previewMap);
    }

    previewMap.setView([lat, lon], 16);

    if (previewMarker) previewMarker.remove();
    previewMarker = L.marker([lat, lon]).addTo(previewMap);

    setTimeout(() => {
        if (previewMap) previewMap.invalidateSize();
    }, 100);
}

// =====================================
// Utility Functions
// =====================================
function logAppData() {
    console.log('=== App Data ===');
    console.log('Hazard Map:', appData.hazardMap);
    console.log('Marbling:', appData.marbling);
    console.log('Collage:', appData.collage);
    console.log('Artwork:', appData.artwork);
    console.log('================');
}

// Expose to global for debugging
window.logAppData = logAppData;


// =====================================
// 最終確認画面での修正（インライン編集）
// 各項目の「✏️ 修正する」から、この画面のまま修正・保存できる
// 保存先は各セクションと同じ localStorage のキー（各ページに戻っても同じ内容が表示される）
// =====================================
const EDIT_CONFIG = {
    // ※ map/Log/log_hazard_map_script.js の hazardOptions と同じ並びにしてください
    HAZARD_OPTIONS: [
        '洪水（外水氾濫）',
        '内水氾濫',
        '高潮',
        '津波',
        '土砂災害（急傾斜地の崩壊）',
        '液状化危険度',
        '地震の揺れ（震度）',
        '地震火災（焼失棟数）'
    ],
    PHASE_OPTIONS: ['事前', '災害時', '復旧時'],   // ※ collage/Log/log_collage.html の選択肢と同じにしてください
    DEFAULT_CENTER: [35.5523, 139.6569]   // 矢上小学校の周辺（ハザードマップページと同じ）
};

let editingKey = null;
let editTempLatLng = null;

function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
}

function initInlineEditing() {
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditor(btn.dataset.edit));
    });
}

function setEditingUI(key) {
    editingKey = key;
    document.querySelectorAll('.edit-btn').forEach(b => { b.disabled = !!key; });
    document.querySelectorAll('.summary-card').forEach(c => c.classList.remove('editing'));
    const submitBtn = document.getElementById('btn-submit-artwork');
    if (key) {
        const card = document.getElementById('editor-' + key).closest('.summary-card');
        if (card) card.classList.add('editing');
        if (submitBtn) submitBtn.disabled = true;   // 編集中は登録できないようにする
    } else {
        checkArtworkImage();                         // 画像の有無に応じて登録ボタンを戻す
    }
}

function openEditor(key) {
    if (editingKey) return;
    const box = document.getElementById('editor-' + key);
    if (!box) return;

    let body = '';
    if (key === 'hazards') {
        const selected = appData.hazardMap.hazards || [];
        const options = EDIT_CONFIG.HAZARD_OPTIONS.slice();
        selected.forEach(h => { if (!options.includes(h)) options.push(h); });
        body = '<p class="editor-hint">見{み}た ハザードマップを ぜんぶ えらんでね</p>'
             + '<div class="editor-hazards">'
             + options.map((h, i) => '<label><input type="checkbox" value="' + escapeHTML(h) + '"' + (selected.includes(h) ? ' checked' : '') + '>' + escapeHTML(HAZARD_LABELS[h] || h) + '</label>').join('')
             + '</div>';
    } else if (key === 'location') {
        body = '<p class="editor-hint">下{した}の 地図{ちず}を タッチすると、場所{ばしょ}を えらびなおせるよ</p>';
    } else if (key === 'marbling' || key === 'collage') {
        const v = key === 'marbling' ? appData.marbling.description : appData.collage.description;
        body = '<textarea>' + escapeHTML(v) + '</textarea>';
    } else if (key === 'phases') {
        const selected = appData.collage.phases || [];
        body = '<p class="editor-hint">あてはまるものを ぜんぶ えらんでね</p>'
             + '<div class="editor-hazards">'
             + EDIT_CONFIG.PHASE_OPTIONS.map(h => '<label><input type="checkbox" value="' + h + '"' + (selected.includes(h) ? ' checked' : '') + '>' + (PHASE_LABELS[h] || h) + '</label>').join('')
             + '</div>';
    } else if (key === 'title' || key === 'creator') {
        const v = key === 'title' ? appData.artwork.title : appData.artwork.creatorName;
        body = '<input type="text" value="' + escapeHTML(v) + '">';
    }
    box.innerHTML = body
        + '<div class="editor-error"></div>'
        + '<div class="editor-actions">'
        + '<button type="button" class="btn btn-secondary" data-act="cancel">やめる</button>'
        + '<button type="button" class="btn btn-primary" data-act="save">これで いい</button>'
        + '</div>';
    box.style.display = 'block';
    box.querySelector('[data-act="cancel"]').addEventListener('click', () => closeEditor(key, false));
    box.querySelector('[data-act="save"]').addEventListener('click', () => saveEditor(key));

    // 表示中の値は隠して、編集欄だけを見せる（地点は地図を使うので表示したまま）
    if (key !== 'location') {
        const valueEl = document.getElementById(key === 'creator' ? 'summary-creator' : 'summary-' + key);
        if (valueEl) valueEl.style.display = 'none';
    } else {
        startLocationEdit();
    }
    setEditingUI(key);
    const field = box.querySelector('textarea, input[type=text]');
    if (field) field.focus();
}

function closeEditor(key, saved) {
    const box = document.getElementById('editor-' + key);
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
    const valueEl = document.getElementById(key === 'creator' ? 'summary-creator' : 'summary-' + key);
    if (valueEl) valueEl.style.display = '';
    if (key === 'location') stopLocationEdit();
    setEditingUI(null);

    displayDataSummary();
    checkMissingData();

    if (saved && valueEl) {
        const note = document.createElement('div');
        note.className = 'summary-saved';
        note.textContent = '✓ なおしたよ';
        valueEl.insertAdjacentElement('afterend', note);
        setTimeout(() => note.remove(), 2500);
    }
}

function showEditorError(key, msg) {
    const el = document.querySelector('#editor-' + key + ' .editor-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function saveEditor(key) {
    const box = document.getElementById('editor-' + key);

    if (key === 'hazards') {
        const values = Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
        if (values.length === 0) return showEditorError(key, '1つ いじょう えらんでね');
        appData.hazardMap.hazards = values;
        saveHazardMapLog();
    } else if (key === 'location') {
        if (!editTempLatLng) return showEditorError(key, '地図{ちず}を タッチして 場所{ばしょ}を えらんでね');
        appData.hazardMap.location = Object.assign({}, appData.hazardMap.location || {}, { lat: editTempLatLng.lat, lon: editTempLatLng.lng });
        saveHazardMapLog();
    } else if (key === 'marbling' || key === 'collage') {
        const v = box.querySelector('textarea').value.trim();
        if (!v) return showEditorError(key, '書{か}いてね');
        appData[key].description = v;
        const storageKey = key === 'marbling' ? 'marblingLog' : 'collageLog';
        const raw = readJSON(storageKey);
        raw[key] = Object.assign({}, raw[key] || {}, { description: v });
        localStorage.setItem(storageKey, JSON.stringify(raw));
    } else if (key === 'phases') {
        const values = Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
        if (values.length === 0) return showEditorError(key, '1つ以上選んでください');
        appData.collage.phases = values;
        const raw = readJSON('collageLog');
        raw.collage = Object.assign({}, raw.collage || {}, { phases: values });
        localStorage.setItem('collageLog', JSON.stringify(raw));
    } else if (key === 'title' || key === 'creator') {
        const v = box.querySelector('input[type=text]').value.trim();
        if (!v) return showEditorError(key, key === 'title' ? '作品タイトルを入力してください' : '制作者名（ペンネーム）を入力してください');
        if (key === 'title') appData.artwork.title = v; else appData.artwork.creatorName = v;
        const raw = readJSON('artworkSubmit');
        if (key === 'title') raw.title = v; else raw.creatorName = v;
        localStorage.setItem('artworkSubmit', JSON.stringify(raw));
    }
    closeEditor(key, true);
}

// ハザードマップページと同じ形（{ hazards, location }）で保存する
function saveHazardMapLog() {
    const raw = readJSON('hazardMapLog');
    const target = raw.hazardMap ? raw.hazardMap : raw;
    target.hazards = appData.hazardMap.hazards || [];
    target.location = appData.hazardMap.location || { lat: null, lon: null };
    localStorage.setItem('hazardMapLog', JSON.stringify(raw));
}

// ---- 地点の選び直し（確認用の地図をそのまま使う） ----
function startLocationEdit() {
    const loc = appData.hazardMap.location || {};
    if (!previewMap) {
        const c = (loc.lat && loc.lon) ? [loc.lat, loc.lon] : EDIT_CONFIG.DEFAULT_CENTER;
        renderSummaryMap(c[0], c[1]);
        if (!(loc.lat && loc.lon) && previewMarker) { previewMarker.remove(); previewMarker = null; }
    }
    editTempLatLng = null;
    if (!previewMap) return;
    previewMap.getContainer().style.cursor = 'crosshair';
    previewMap.on('click', onEditMapClick);
}

function onEditMapClick(e) {
    editTempLatLng = e.latlng;
    if (previewMarker) previewMarker.setLatLng(e.latlng);
    else previewMarker = L.marker(e.latlng).addTo(previewMap);
    const err = document.querySelector('#editor-location .editor-error');
    if (err) err.style.display = 'none';
    const locationEl = document.getElementById('summary-location');
    if (locationEl) locationEl.textContent = '新しい地点／区域: 緯度 ' + e.latlng.lat.toFixed(6) + ', 経度 ' + e.latlng.lng.toFixed(6) + '（まだ保存されていません）';
}

function stopLocationEdit() {
    if (!previewMap) return;
    previewMap.off('click', onEditMapClick);
    previewMap.getContainer().style.cursor = '';
    editTempLatLng = null;
    const loc = appData.hazardMap.location || {};
    if (!(loc.lat && loc.lon) && previewMarker) { previewMarker.remove(); previewMarker = null; }
}


// =====================================================================
// 矢上小版：追加の処理
// =====================================================================
function workerBase() { return ((window.YAGAMI_CONFIG && window.YAGAMI_CONFIG.WORKER_URL) || CONFIG.WORKER_URL).replace(/\/+$/, ''); }

// 画面に出す言葉（保存する値は大人版と同じ正式名のまま）
const HAZARD_LABELS = {
    '洪水（外水氾濫）': '川{かわ}の水{みず}が あふれる（洪水{こうずい}）',
    '内水氾濫': '下水{げすい}や 水路{すいろ}から 水{みず}が あふれる',
    '高潮': '台風{たいふう}で 海{うみ}の水{みず}が あふれる（高潮{たかしお}）',
    '津波': '津波{つなみ}',
    '土砂災害（急傾斜地の崩壊）': 'がけくずれ',
    '液状化危険度': '地震{じしん}で 地面{じめん}が やわらかくなる（液状化{えきじょうか}）',
    '地震の揺れ（震度）': '地震{じしん}の ゆれ',
    '地震火災（焼失棟数）': '地震{じしん}の 火事{かじ}'
};
const PHASE_LABELS = { '事前': '事前{じぜん}（おきる 前{まえ}）', '災害時': '災害時{さいがいじ}（おきている とき）', '復旧時': '復旧時{ふっきゅうじ}（おきた あと）' };

// --- IndexedDB（コラージュと同じ ws_art_db / images） ---
function wsIdbGet(key) {
    return new Promise(function (resolve) {
        try {
            const req = indexedDB.open('ws_art_db', 1);
            req.onupgradeneeded = function () {
                if (!req.result.objectStoreNames.contains('images')) req.result.createObjectStore('images');
            };
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
    return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
}
function loadImg(src) {
    return new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = src;
    });
}

// マーブリング画像＋スタンプ配置から作品画像を作り直す（コラージュの描き方と同じ考え方）
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
    const list = (saved && saved.stamps) || [];
    for (const d of list) {
        let tex;
        try { tex = await loadImg('../../collage/app/detail/asset/stamps/' + d.name + '.png'); } catch (e) { continue; }
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
    const empty = document.getElementById('artwork-preview-empty');
    if (empty) empty.style.display = 'block';
    if (localStorage.getItem('artworkImage')) return;
    try {
        const blob = await wsIdbGet('artwork_image');
        let dataURL = blob ? await blobToDataURL(blob) : null;
        if (!dataURL) dataURL = await rebuildArtworkFromParts();
        if (dataURL) {
            localStorage.setItem('artworkImage', dataURL);
            localStorage.setItem('artworkImageExt', 'jpg');
        }
    } catch (e) { console.error('作品画像の用意に失敗', e); }
}

// 完成した作品を iPad に保存（今と同じダウンロード方式：「ファイル」アプリに入る）
async function downloadArtwork() {
    const dataURL = localStorage.getItem('artworkImage');
    if (!dataURL) { alert('さくひんの えが みつかりません。'); return; }
    const blob = await (await fetch(dataURL)).blob();
    const url = URL.createObjectURL(blob);
    const name = (appData.artwork.creatorName || 'sakuhin').replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 20);
    const id = localStorage.getItem('lastSubmittedArtworkId') || '';
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yagami_' + (id ? id + '_' : '') + name + '.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    const note = document.getElementById('download-note');
    if (note) note.style.display = 'block';
}
window.downloadArtwork = downloadArtwork;
