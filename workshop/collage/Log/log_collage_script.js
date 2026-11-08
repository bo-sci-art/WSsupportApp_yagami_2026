/**
 * Log Collage Page - JavaScript
 * Handles text input, validation, and localStorage saving
 */

// ============================================
// Configuration
// ============================================

const CONFIG = {
    // Navigation URLs
    backUrl: '../app/index.html',
    nextUrl: '../../message/artwork/artwork_submit.html', // Placeholder for message creation page
    
    // localStorage key
    storageKey: 'collageLog',
    
    // Validation
    minLength: 1, // At least 1 character required
};

// ============================================
// State Management
// ============================================

const state = {
    description: '',
    phases: []          // 防災行動のタイミング（事前／災害時／復旧時）
};

// ============================================
// DOM Elements
// ============================================

const elements = {
    descriptionTextarea: document.getElementById('collageDescription'),
    descriptionValidation: document.getElementById('descriptionValidation'),
    characterCount: document.getElementById('characterCount'),
    currentCount: document.getElementById('currentCount'),
    backBtn: document.getElementById('backBtn'),
    nextBtn: document.getElementById('nextBtn'),
    phaseOptions: document.getElementById('phaseOptions'),
    phaseValidation: document.getElementById('phaseValidation')
};

// ============================================
// Initialization
// ============================================

function init() {
    console.log('Initializing Log Collage page...');
    
    // Load saved data if exists
    loadSavedData();
    
    // Set up event listeners
    setupEventListeners();
    
    // Update button state
    updateNextButtonState();
    
    // Update character count
    updateCharacterCount();
    
    console.log('Initialization complete');
}

// ============================================
// Text Input Handling
// ============================================

function setupEventListeners() {
    // Textarea input event
    if (elements.descriptionTextarea) {
        elements.descriptionTextarea.addEventListener('input', handleTextInput);
        elements.descriptionTextarea.addEventListener('blur', handleTextBlur);
    }
    
    // 防災行動のタイミング
    if (elements.phaseOptions) {
        elements.phaseOptions.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', handlePhaseChange);
        });
        renderPhaseSelection();
    }

    // Navigation buttons
    if (elements.backBtn) {
        elements.backBtn.addEventListener('click', handleBack);
    }
    
    if (elements.nextBtn) {
        elements.nextBtn.addEventListener('click', handleNext);
    }
}

function handleTextInput(event) {
    state.description = event.target.value.trim();
    
    // Hide validation message when user starts typing
    if (state.description.length > 0) {
        elements.descriptionValidation.style.display = 'none';
    }
    
    // Update character count
    updateCharacterCount();
    
    // Update button state
    updateNextButtonState();
    
    // Auto-save to localStorage
    autoSave();
}

function handlePhaseChange() {
    state.phases = Array.from(elements.phaseOptions.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
    renderPhaseSelection();
    if (state.phases.length > 0) elements.phaseValidation.style.display = 'none';
    updateNextButtonState();
    saveData();
}

function renderPhaseSelection() {
    elements.phaseOptions.querySelectorAll('.phase-option').forEach(opt => {
        const cb = opt.querySelector('input');
        cb.checked = state.phases.includes(cb.value);
        opt.classList.toggle('selected', cb.checked);
    });
}

function handleTextBlur() {
    // Validate on blur
    if (state.description.length === 0) {
        elements.descriptionValidation.style.display = 'block';
    }
}

function updateCharacterCount() {
    const currentLength = elements.descriptionTextarea.value.length;
    elements.currentCount.textContent = currentLength;
}

// ============================================
// Validation
// ============================================

function validateForm() {
    const description = elements.descriptionTextarea.value.trim();
    
    let ok = true;
    if (description.length < CONFIG.minLength) {
        elements.descriptionValidation.style.display = 'block';
        ok = false;
    } else {
        elements.descriptionValidation.style.display = 'none';
    }
    if (state.phases.length === 0) {
        elements.phaseValidation.style.display = 'block';
        ok = false;
    } else {
        elements.phaseValidation.style.display = 'none';
    }
    return ok;
}

function updateNextButtonState() {
    const hasDescription = elements.descriptionTextarea.value.trim().length >= CONFIG.minLength;
    elements.nextBtn.disabled = !(hasDescription && state.phases.length > 0);
}

// ============================================
// Data Persistence (localStorage)
// ============================================

function saveData() {
    const data = {
        collage: {
            description: elements.descriptionTextarea.value.trim(),
            phases: state.phases.slice()
        }
    };
    
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
    console.log('Data saved to localStorage:', data);
}

function autoSave() {
    // Auto-save while typing (debounced by input event naturally)
    if (state.description.length > 0 || state.phases.length > 0) {
        saveData();
    }
}

function loadSavedData() {
    const savedData = localStorage.getItem(CONFIG.storageKey);
    
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            console.log('Loaded saved data:', data);
            
            // Restore description
            if (data.collage && data.collage.description) {
                elements.descriptionTextarea.value = data.collage.description;
                state.description = data.collage.description;
            }
            if (data.collage && Array.isArray(data.collage.phases)) {
                state.phases = data.collage.phases.slice();
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
    if (state.description.length > 0 || state.phases.length > 0) {
        saveData();
    }
    window.location.href = CONFIG.backUrl;
}

function handleNext() {
    // Validate before proceeding
    if (!validateForm()) {
        console.log('Validation failed');
        // Focus on textarea
        elements.descriptionTextarea.focus();
        return;
    }
    
    // Save data to localStorage
    saveData();
    
    // Navigate to next page
    console.log('Proceeding to next page...');
    window.location.href = CONFIG.nextUrl;
}

// ============================================
// Keyboard Shortcuts
// ============================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Ctrl/Cmd + Enter to submit
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            if (!elements.nextBtn.disabled) {
                handleNext();
            }
        }
        
        // Escape to clear validation message
        if (event.key === 'Escape') {
            elements.descriptionValidation.style.display = 'none';
        }
    });
}

// ============================================
// Form validation on paste
// ============================================

function setupPasteHandler() {
    if (elements.descriptionTextarea) {
        elements.descriptionTextarea.addEventListener('paste', (event) => {
            // Allow paste, then validate after a brief delay
            setTimeout(() => {
                state.description = elements.descriptionTextarea.value.trim();
                updateCharacterCount();
                updateNextButtonState();
                autoSave();
            }, 10);
        });
    }
}

// ============================================
// Initialize on DOM Ready
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        setupKeyboardShortcuts();
        setupPasteHandler();
    });
} else {
    init();
    setupKeyboardShortcuts();
    setupPasteHandler();
}

// ============================================
// Warn before leaving if there's unsaved content
// ============================================

window.addEventListener('beforeunload', (event) => {
    // Save before unload
    if (state.description.length > 0) {
        saveData();
    }
});
