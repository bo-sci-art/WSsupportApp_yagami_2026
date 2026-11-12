/**
 * S7 タイトル・伝えたいこと・いつの行動か・番号（矢上小版・授業案 rev3）
 * 保存先：localStorage.artworkSubmit = { title, body, phase, number, creationDate }
 *   phase  : 事前／災害時／復旧時（保存する値は変えない。画面は「災害の前／とき／あと」）
 *   number : クラス＋出席番号の4桁（4201〜4228）
 */
const CONFIG = {
    backUrl: '../../collage/app/index.html',
    nextUrl: '../lastconfirm/final_submit.html',
    storageKey: 'artworkSubmit'
};


// 確認画面の「直す」から開いたとき（?edit=1）：「修正完了」で確認画面にもどる
const EDIT = /[?&]edit=1(&|$)/.test(location.search);
const CONFIRM_URL = '../lastconfirm/final_submit.html';
function applyEditMode(nextBtn, backBtn) {
    if (!EDIT) return;
    nextBtn.innerHTML = window.rubyHTML('✓ 修正{しゅうせい}完了{かんりょう}');
    if (backBtn) backBtn.style.visibility = 'hidden';
    const t = document.querySelector('.step-indicator');
    if (t) t.innerHTML = '✏️ ' + window.rubyHTML('修正中{しゅうせいちゅう}');
}

const el = {
    title: document.getElementById('artworkTitle'),
    body: document.getElementById('artworkBody'),
    number: document.getElementById('creatorNumber'),
    phases: document.getElementById('phaseOptions'),
    titleV: document.getElementById('titleValidation'),
    bodyV: document.getElementById('bodyValidation'),
    phaseV: document.getElementById('phaseValidation'),
    numberV: document.getElementById('numberValidation'),
    back: document.getElementById('backBtn'),
    next: document.getElementById('nextBtn')
};

const state = { title: '', body: '', phase: '', number: '', creationDate: '' };

function load() {
    try {
        const d = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}');
        state.title = d.title || '';
        state.body = d.body || '';
        state.phase = d.phase || '';
        state.number = d.number || '';
        state.creationDate = d.creationDate || '';
    } catch (e) { console.warn(e); }
    el.title.value = state.title;
    el.body.value = state.body;
    el.number.value = state.number;
}
function save() {
    if (!state.creationDate) state.creationDate = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(Object.assign({}, state, { updatedAt: new Date().toISOString() })));
}

function renderPhases() {
    el.phases.innerHTML = '';
    window.YAGAMI_PHASES.forEach(p => {
        const label = document.createElement('label');
        label.className = 'phase-option' + (state.phase === p.value ? ' selected' : '');
        label.innerHTML = '<input type="radio" name="phase" value="' + p.value + '"' + (state.phase === p.value ? ' checked' : '') + '>'
            + '<span class="phase-name">' + window.rubyHTML(p.label) + '</span>'
            + '<span class="phase-desc">' + window.rubyHTML(p.desc) + '</span>';
        label.querySelector('input').addEventListener('change', () => {
            state.phase = p.value;
            el.phases.querySelectorAll('.phase-option').forEach(o => o.classList.toggle('selected', o.querySelector('input').checked));
            el.phaseV.style.display = 'none';
            save(); update();
        });
        el.phases.appendChild(label);
    });
}

function numberOK(v) { return window.YAGAMI_NUMBER_RE.test(v); }
function update() {
    el.next.disabled = !(state.title && state.body && state.phase && numberOK(state.number));
}

el.title.addEventListener('input', () => { state.title = el.title.value.trim(); if (state.title) el.titleV.style.display = 'none'; save(); update(); });
el.body.addEventListener('input', () => { state.body = el.body.value.trim(); if (state.body) el.bodyV.style.display = 'none'; save(); update(); });
el.number.addEventListener('input', () => {
    // 全角の数字も半角にして、数字だけ残す
    const v = el.number.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '').slice(0, 4);
    if (v !== el.number.value) el.number.value = v;
    state.number = v;
    if (numberOK(v)) el.numberV.style.display = 'none';
    save(); update();
});
el.title.addEventListener('blur', () => { if (!state.title) el.titleV.style.display = 'block'; });
el.body.addEventListener('blur', () => { if (!state.body) el.bodyV.style.display = 'block'; });
el.number.addEventListener('blur', () => { if (state.number && !numberOK(state.number)) el.numberV.style.display = 'block'; });

el.back.addEventListener('click', () => { save(); location.href = CONFIG.backUrl; });
el.next.addEventListener('click', () => {
    let ok = true;
    if (!state.title) { el.titleV.style.display = 'block'; ok = false; }
    if (!state.body) { el.bodyV.style.display = 'block'; ok = false; }
    if (!state.phase) { el.phaseV.style.display = 'block'; ok = false; }
    if (!numberOK(state.number)) { el.numberV.style.display = 'block'; ok = false; }
    if (!ok) return;
    save();
    location.href = EDIT ? CONFIRM_URL : CONFIG.nextUrl;
});

// ---------- 作品を見ながら書けるように：コラージュの自動保存の画像を出す ----------
function idbGetArtwork() {
    return new Promise(resolve => {
        try {
            const req = indexedDB.open('ws_art_db', 1);
            req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('images')) req.result.createObjectStore('images'); };
            req.onsuccess = () => {
                try {
                    const g = req.result.transaction('images', 'readonly').objectStore('images').get('artwork_image');
                    g.onsuccess = () => resolve(g.result || null);
                    g.onerror = () => resolve(null);
                } catch (e) { resolve(null); }
            };
            req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
    });
}
async function showArtwork() {
    const img = document.getElementById('artPreview');
    const empty = document.getElementById('artEmpty');
    let src = null;
    try { src = localStorage.getItem('artworkImage'); } catch (e) { /* ignore */ }
    if (!src) { const blob = await idbGetArtwork(); if (blob) src = URL.createObjectURL(blob); }
    if (!src) { empty.innerHTML = window.rubyHTML('作品{さくひん}の絵{え}が見{み}つかりません'); return; }
    img.src = src;
    img.style.display = 'block';
    empty.style.display = 'none';
    document.getElementById('artHint').style.display = 'block';
    const zoom = document.getElementById('artZoom');
    document.getElementById('artZoomImg').src = src;
    document.getElementById('artFrame').addEventListener('click', () => { zoom.style.display = 'flex'; });
    zoom.addEventListener('click', () => { zoom.style.display = 'none'; });
}

document.addEventListener('DOMContentLoaded', () => { load(); renderPhases(); update(); applyEditMode(el.next, el.back); showArtwork(); });
