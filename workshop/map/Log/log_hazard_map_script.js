/**
 * S2 作品にする場所と災害を選ぶ（矢上小版・授業案 rev3）
 * - 場所は、先生が割り振った3か所（common/places.js）から1つ選ぶ。座標は固定
 * - 読み取ったハザードマップを選ぶ（いくつでも）
 * - 保存先：localStorage.hazardMapLog = { hazards:[正式名…], location:{ lat, lon, place, name } }
 *   （保存する災害の値は大人版と同じ正式名。防災行動マップの絞り込みがそのまま動く）
 */

const CONFIG = {
    backUrl: '../app/index.html',
    nextUrl: './break.html',          // 1コマ目はここまで（休み時間のあと、マーブリングから）
    storageKey: 'hazardMapLog',
    // 授業案 rev3：液状化危険度・地震火災・内水氾濫・津波は使わない（津波はこの3か所ではアプリの地図に重ねられないため）
    hazardOptions: [
        '洪水（外水氾濫）',
        '高潮',
        '土砂災害（急傾斜地の崩壊）',
        '地震の揺れ（震度）'
    ],
    hazardLabels: {
        '洪水（外水氾濫）': '洪水{こうずい}（外水氾濫{がいすいはんらん}）',
        '高潮': '高潮{たかしお}',
        '土砂災害（急傾斜地の崩壊）': '土砂{どしゃ}災害{さいがい}（急傾斜地{きゅうけいしゃち}の崩壊{ほうかい}）',
        '地震の揺れ（震度）': '地震{じしん}の揺{ゆ}れ（震度{しんど}）'
    }
};


// 確認画面の「直す」から開いたとき（?edit=1）：「修正完了」で確認画面にもどる
const EDIT = /[?&]edit=1(&|$)/.test(location.search);
const CONFIRM_URL = '../../message/lastconfirm/final_submit.html';
function applyEditMode(nextBtn, backBtn) {
    if (!EDIT) return;
    nextBtn.innerHTML = window.rubyHTML('✓ 修正{しゅうせい}完了{かんりょう}');
    if (backBtn) backBtn.style.visibility = 'hidden';
    const t = document.querySelector('.step-indicator');
    if (t) t.innerHTML = '✏️ ' + window.rubyHTML('修正中{しゅうせいちゅう}');
}

const state = { selectedHazards: new Set(), place: null, map: null, markers: {} };

const el = {
    hazardSelection: document.getElementById('hazardSelection'),
    hazardValidation: document.getElementById('hazardValidation'),
    placeButtons: document.getElementById('placeButtons'),
    locationValidation: document.getElementById('locationValidation'),
    backBtn: document.getElementById('backBtn'),
    nextBtn: document.getElementById('nextBtn')
};

function rb(s) { return window.rubyHTML ? window.rubyHTML(s) : s; }

// ---------- 保存と読み込み ----------
function loadSaved() {
    try {
        const d = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}');
        (d.hazards || []).forEach(h => { if (CONFIG.hazardOptions.includes(h)) state.selectedHazards.add(h); });
        if (d.location && d.location.place && window.yagamiPlace(d.location.place)) state.place = d.location.place;
    } catch (e) { console.warn(e); }
}
function save() {
    const p = window.yagamiPlace(state.place);
    const data = {
        hazards: Array.from(state.selectedHazards),
        location: p ? { lat: p.lat, lon: p.lon, place: p.id, name: p.plain } : null
    };
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
}

// ---------- 災害の選択 ----------
function renderHazards() {
    el.hazardSelection.innerHTML = '';
    CONFIG.hazardOptions.forEach((hazard, i) => {
        const div = document.createElement('div');
        div.className = 'hazard-option' + (state.selectedHazards.has(hazard) ? ' selected' : '');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.id = 'hazard-' + i; cb.value = hazard; cb.checked = state.selectedHazards.has(hazard);
        const label = document.createElement('label');
        label.htmlFor = cb.id;
        label.innerHTML = rb(CONFIG.hazardLabels[hazard] || hazard);
        div.appendChild(cb); div.appendChild(label);
        // 文字やチェックボックスを押したときはブラウザが切りかえる（二重に切りかえないように）
        div.addEventListener('click', e => {
            if (e.target === cb || e.target.closest('label')) return;
            cb.checked = !cb.checked; toggleHazard(hazard, cb.checked, div);
        });
        cb.addEventListener('change', () => toggleHazard(hazard, cb.checked, div));
        el.hazardSelection.appendChild(div);
    });
}
function toggleHazard(hazard, on, div) {
    if (on) state.selectedHazards.add(hazard); else state.selectedHazards.delete(hazard);
    div.classList.toggle('selected', on);
    if (state.selectedHazards.size) el.hazardValidation.style.display = 'none';
    save(); updateNext();
}

// ---------- 場所の選択（3か所のボタン） ----------
function renderPlaces() {
    el.placeButtons.innerHTML = '';
    window.YAGAMI_PLACES.forEach(p => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'place-btn' + (state.place === p.id ? ' selected' : '');
        b.dataset.place = p.id;
        b.style.setProperty('--place-color', p.color);
        b.innerHTML = '<span class="place-dot"></span><span class="place-name">' + rb(p.name) + '</span><span class="place-check">✓</span>';
        b.addEventListener('click', () => selectPlace(p.id));
        el.placeButtons.appendChild(b);
    });
}
function selectPlace(id) {
    state.place = id;
    el.placeButtons.querySelectorAll('.place-btn').forEach(b => b.classList.toggle('selected', b.dataset.place === id));
    el.locationValidation.style.display = 'none';
    showPlaceOnMap(true);
    save(); updateNext();
}

// ---------- 地図（3か所を表示し、選んだ場所を大きく） ----------
function placeIcon(p, selected) {
    const size = selected ? 22 : 14;
    return L.divIcon({
        className: 'place-marker' + (selected ? ' selected' : ''),
        html: '<span class="pm-dot" style="background:' + p.color + ';width:' + size + 'px;height:' + size + 'px"></span>'
            + '<span class="pm-label">' + rb(p.short) + '</span>',
        iconSize: [size, size], iconAnchor: [size / 2, size / 2]
    });
}
function initMap() {
    state.map = L.map('map', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }).addTo(state.map);
    window.YAGAMI_PLACES.forEach(p => {
        state.markers[p.id] = L.marker([p.lat, p.lon], { icon: placeIcon(p, false) })
            .on('click', () => selectPlace(p.id))
            .addTo(state.map);
    });
    state.map.fitBounds(window.yagamiPlacesBounds(), { padding: [40, 40] });
    showPlaceOnMap(false);
}
function showPlaceOnMap(animate) {
    if (!state.map) return;
    window.YAGAMI_PLACES.forEach(p => {
        const m = state.markers[p.id];
        m.setIcon(placeIcon(p, p.id === state.place));
        m.setZIndexOffset(p.id === state.place ? 1000 : 0);
    });
    const p = window.yagamiPlace(state.place);
    if (p) state.map.setView([p.lat, p.lon], 17, { animate: !!animate });
}

// ---------- つぎへ・もどる ----------
function updateNext() { el.nextBtn.disabled = !(state.place && state.selectedHazards.size > 0); }
function handleNext() {
    let ok = true;
    if (!state.place) { el.locationValidation.style.display = 'block'; ok = false; }
    if (!state.selectedHazards.size) { el.hazardValidation.style.display = 'block'; ok = false; }
    if (!ok) return;
    save();
    location.href = EDIT ? CONFIRM_URL : CONFIG.nextUrl;
}

document.addEventListener('DOMContentLoaded', () => {
    loadSaved();
    renderPlaces();
    renderHazards();
    initMap();
    updateNext();
    applyEditMode(el.nextBtn, el.backBtn);
    el.backBtn.addEventListener('click', () => { save(); location.href = CONFIG.backUrl; });
    el.nextBtn.addEventListener('click', handleNext);
});
