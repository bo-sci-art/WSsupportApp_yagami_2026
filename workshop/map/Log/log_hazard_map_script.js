/**
 * Log Hazard Map Page - JavaScript
 * Handles hazard selection, map interaction, location selection, and localStorage saving
 */

// ============================================
// Configuration
// ============================================

const CONFIG = {
    // Default map center (Tsunashima Station, Yokohama)
    defaultCenter: [35.5314, 139.6321],
    defaultZoom: 15,
    
    // Navigation URLs
    backUrl: '../app/index.html',
    nextUrl: '../../marbling/Mission/marbling_intro.html', // Placeholder for next page
    
    // localStorage key
    storageKey: 'hazardMapLog',
    
    // Hazard options (fixed list)
    hazardOptions: [
        '洪水（外水氾濫）',
        '内水氾濫',
        '高潮',
        '津波',
        '土砂災害（急傾斜地の崩壊）',
        '液状化危険度',
        '地震の揺れ（震度）',
        '地震火災（焼失棟数）'
    ]
};

// ============================================
// State Management
// ============================================

const state = {
    selectedHazards: new Set(),
    tempLocation: null,      // Temporary pin location (not confirmed)
    confirmedLocation: null, // Confirmed location
    map: null,
    tempMarker: null,
    confirmedMarker: null
};

// ============================================
// DOM Elements
// ============================================

const elements = {
    hazardSelection: document.getElementById('hazardSelection'),
    hazardValidation: document.getElementById('hazardValidation'),
    map: document.getElementById('map'),
    mapInstruction: document.getElementById('mapInstruction'),
    locationConfirmation: document.getElementById('locationConfirmation'),
    locationCoords: document.getElementById('locationCoords'),
    locationStatus: document.getElementById('locationStatus'),
    confirmLocationBtn: document.getElementById('confirmLocationBtn'),
    locationConfirmed: document.getElementById('locationConfirmed'),
    confirmedCoords: document.getElementById('confirmedCoords'),
    changeLocationBtn: document.getElementById('changeLocationBtn'),
    locationValidation: document.getElementById('locationValidation'),
    backBtn: document.getElementById('backBtn'),
    nextBtn: document.getElementById('nextBtn')
};

// ============================================
// Initialization
// ============================================

function init() {
    console.log('Initializing Log Hazard Map page...');
    
    // Load saved data if exists
    loadSavedData();
    
    // Render hazard checkboxes
    renderHazardOptions();
    
    // Initialize map
    initMap();
    
    // Set up event listeners
    setupEventListeners();
    
    // Update button state
    updateNextButtonState();
    
    console.log('Initialization complete');
}

// ============================================
// Hazard Selection
// ============================================

function renderHazardOptions() {
    elements.hazardSelection.innerHTML = '';
    
    CONFIG.hazardOptions.forEach((hazard, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'hazard-option';
        optionDiv.dataset.hazard = hazard;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `hazard-${index}`;
        checkbox.value = hazard;
        
        // Restore saved state
        if (state.selectedHazards.has(hazard)) {
            checkbox.checked = true;
            optionDiv.classList.add('selected');
        }
        
        const label = document.createElement('label');
        label.htmlFor = `hazard-${index}`;
        label.textContent = hazard;
        
        optionDiv.appendChild(checkbox);
        optionDiv.appendChild(label);
        
        // Click event on entire div
        optionDiv.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            handleHazardToggle(hazard, checkbox.checked, optionDiv);
        });
        
        // Change event on checkbox
        checkbox.addEventListener('change', (e) => {
            handleHazardToggle(hazard, e.target.checked, optionDiv);
        });
        
        elements.hazardSelection.appendChild(optionDiv);
    });
}

function handleHazardToggle(hazard, checked, optionDiv) {
    if (checked) {
        state.selectedHazards.add(hazard);
        optionDiv.classList.add('selected');
    } else {
        state.selectedHazards.delete(hazard);
        optionDiv.classList.remove('selected');
    }
    
    // Hide validation message if at least one is selected
    if (state.selectedHazards.size > 0) {
        elements.hazardValidation.style.display = 'none';
    }
    
    updateNextButtonState();
    console.log('Selected hazards:', Array.from(state.selectedHazards));
}

// ============================================
// Map Initialization
// ============================================

function initMap() {
    // Initialize Leaflet map
    state.map = L.map('map').setView(CONFIG.defaultCenter, CONFIG.defaultZoom);
    
    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(state.map);
    
    // Map click event
    state.map.on('click', handleMapClick);
    
    console.log('Map initialized');
}

function handleMapClick(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    console.log('Map clicked:', lat, lon);
    
    // Store as temporary location
    state.tempLocation = { lat, lon };
    
    // Remove previous temporary marker
    if (state.tempMarker) {
        state.map.removeLayer(state.tempMarker);
    }
    
    // Add new temporary marker (yellow/orange)
    state.tempMarker = L.marker([lat, lon], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(state.map);
    
    // Update instruction
    elements.mapInstruction.textContent = '📍 ピンが配置されました。下のボタンで確定してください';
    
    // Show confirmation UI
    elements.locationConfirmation.style.display = 'flex';
    elements.locationCoords.textContent = `緯度: ${lat.toFixed(6)}, 経度: ${lon.toFixed(6)}`;
    elements.locationStatus.textContent = '未確定';
    
    // Hide confirmed section if visible
    elements.locationConfirmed.style.display = 'none';
    elements.locationValidation.style.display = 'none';
}

function confirmLocation() {
    if (!state.tempLocation) return;
    
    // Move temp location to confirmed
    state.confirmedLocation = { ...state.tempLocation };
    
    console.log('Location confirmed:', state.confirmedLocation);
    
    // Remove temporary marker
    if (state.tempMarker) {
        state.map.removeLayer(state.tempMarker);
        state.tempMarker = null;
    }
    
    // Add confirmed marker (green)
    if (state.confirmedMarker) {
        state.map.removeLayer(state.confirmedMarker);
    }
    
    state.confirmedMarker = L.marker([state.confirmedLocation.lat, state.confirmedLocation.lon], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(state.map);
    
    // Update UI
    elements.mapInstruction.textContent = '✓ 地点／区域が確定されました';
    elements.locationConfirmation.style.display = 'none';
    elements.locationConfirmed.style.display = 'block';
    elements.confirmedCoords.textContent = `緯度: ${state.confirmedLocation.lat.toFixed(6)}, 経度: ${state.confirmedLocation.lon.toFixed(6)}`;
    elements.locationValidation.style.display = 'none';
    
    // Clear temp location
    state.tempLocation = null;
    
    updateNextButtonState();
}

function changeLocation() {
    console.log('Changing location...');
    
    // Remove confirmed marker
    if (state.confirmedMarker) {
        state.map.removeLayer(state.confirmedMarker);
        state.confirmedMarker = null;
    }
    
    // Clear confirmed location
    state.confirmedLocation = null;
    
    // Update UI
    elements.locationConfirmed.style.display = 'none';
    elements.mapInstruction.textContent = '📍 地図をクリックして対象地点を選択してください';
    
    updateNextButtonState();
}

// ============================================
// Validation
// ============================================

function validateForm() {
    let isValid = true;
    
    // Check hazards
    if (state.selectedHazards.size === 0) {
        elements.hazardValidation.style.display = 'block';
        isValid = false;
    } else {
        elements.hazardValidation.style.display = 'none';
    }
    
    // Check location
    if (!state.confirmedLocation) {
        elements.locationValidation.style.display = 'block';
        isValid = false;
    } else {
        elements.locationValidation.style.display = 'none';
    }
    
    return isValid;
}

function updateNextButtonState() {
    const hasHazards = state.selectedHazards.size > 0;
    const hasLocation = state.confirmedLocation !== null;
    
    elements.nextBtn.disabled = !(hasHazards && hasLocation);
}

// ============================================
// Data Persistence (localStorage)
// ============================================

function saveData() {
    const data = {
        hazards: Array.from(state.selectedHazards),
        location: state.confirmedLocation
    };
    
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
    console.log('Data saved to localStorage:', data);
}

function loadSavedData() {
    const savedData = localStorage.getItem(CONFIG.storageKey);
    
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            console.log('Loaded saved data:', data);
            
            // Restore hazards
            if (data.hazards && Array.isArray(data.hazards)) {
                data.hazards.forEach(hazard => state.selectedHazards.add(hazard));
            }
            
            // Restore location
            if (data.location && data.location.lat && data.location.lon) {
                state.confirmedLocation = data.location;
                
                // Will be rendered after map initialization
                setTimeout(() => {
                    if (state.confirmedLocation) {
                        // Add confirmed marker
                        state.confirmedMarker = L.marker([state.confirmedLocation.lat, state.confirmedLocation.lon], {
                            icon: L.icon({
                                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                                iconSize: [25, 41],
                                iconAnchor: [12, 41],
                                popupAnchor: [1, -34],
                                shadowSize: [41, 41]
                            })
                        }).addTo(state.map);
                        
                        // Center map on location
                        state.map.setView([state.confirmedLocation.lat, state.confirmedLocation.lon], CONFIG.defaultZoom);
                        
                        // Update UI
                        elements.mapInstruction.textContent = '✓ 地点／区域が確定されました';
                        elements.locationConfirmed.style.display = 'block';
                        elements.confirmedCoords.textContent = `緯度: ${state.confirmedLocation.lat.toFixed(6)}, 経度: ${state.confirmedLocation.lon.toFixed(6)}`;
                    }
                }, 500);
            }
        } catch (e) {
            console.error('Error loading saved data:', e);
        }
    }
}

// ============================================
// Navigation
// ============================================

function handleBack() {
    // Save current state before leaving
    saveData();
    window.location.href = CONFIG.backUrl;
}

function handleNext() {
    // Validate before proceeding
    if (!validateForm()) {
        console.log('Validation failed');
        return;
    }
    
    // Save data to localStorage
    saveData();
    
    // Navigate to next page
    console.log('Proceeding to next page...');
    window.location.href = CONFIG.nextUrl;
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
    // Confirm location button
    elements.confirmLocationBtn.addEventListener('click', confirmLocation);
    
    // Change location button
    elements.changeLocationBtn.addEventListener('click', changeLocation);
    
    // Navigation buttons
    elements.backBtn.addEventListener('click', handleBack);
    elements.nextBtn.addEventListener('click', handleNext);
}

// ============================================
// Initialize on DOM Ready
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
