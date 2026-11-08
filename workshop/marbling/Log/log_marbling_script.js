/**
 * Log Marbling Page - JavaScript
 * Handles text input, validation, and localStorage saving
 */

// ============================================
// Configuration
// ============================================

const CONFIG = {
    // Navigation URLs
    backUrl: '../app/index.html',
    nextUrl: '../../collage/Mission/collage_intro.html', // Placeholder for collage page
    
    // localStorage key
    storageKey: 'marblingLog',
    
    // Validation
    minLength: 1, // At least 1 character required
};

// ============================================
// State Management
// ============================================

const state = {
    description: ''
};

// ============================================
// DOM Elements
// ============================================

const elements = {
    descriptionTextarea: document.getElementById('marblingDescription'),
    descriptionValidation: document.getElementById('descriptionValidation'),
    characterCount: document.getElementById('characterCount'),
    currentCount: document.getElementById('currentCount'),
    backBtn: document.getElementById('backBtn'),
    nextBtn: document.getElementById('nextBtn')
};

// ============================================
// Initialization
// ============================================

function init() {
    console.log('Initializing Log Marbling page...');
    
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
    
    if (description.length < CONFIG.minLength) {
        elements.descriptionValidation.style.display = 'block';
        return false;
    }
    
    elements.descriptionValidation.style.display = 'none';
    return true;
}

function updateNextButtonState() {
    const hasDescription = elements.descriptionTextarea.value.trim().length >= CONFIG.minLength;
    elements.nextBtn.disabled = !hasDescription;
}

// ============================================
// Data Persistence (localStorage)
// ============================================

function saveData() {
    const data = {
        marbling: {
            description: elements.descriptionTextarea.value.trim()
        }
    };
    
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
    console.log('Data saved to localStorage:', data);
}

function autoSave() {
    // Auto-save while typing (debounced by input event naturally)
    if (state.description.length > 0) {
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
            if (data.marbling && data.marbling.description) {
                elements.descriptionTextarea.value = data.marbling.description;
                state.description = data.marbling.description;
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
    if (state.description.length > 0) {
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
// Auto-save indicator (optional enhancement)
// ============================================

let saveTimeout;
function showSaveIndicator() {
    // Could add a "保存済み" indicator here if desired
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        // Clear indicator after 2 seconds
    }, 2000);
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
