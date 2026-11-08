/**
 * Artwork Submit Page - JavaScript
 * Handles form input, image upload, validation, and localStorage saving
 */

// ============================================
// Configuration
// ============================================

const CONFIG = {
    // Navigation URLs
    backUrl: '../../collage/Log/log_collage.html',
    nextUrl: '../lastconfirm/final_submit.html', // Placeholder for confirmation page
    
    // localStorage key
    storageKey: 'artworkSubmit',
    
    // Validation
    maxImageSize: 10 * 1024 * 1024, // 10MB
};

// ============================================
// State Management
// ============================================

const state = {
    title: '',
    //imageFile: null,
    //imageDataUrl: null,
    creatorName: ''
};

// ============================================
// DOM Elements
// ============================================

const elements = {
    titleInput: document.getElementById('artworkTitle'),
    //imageInput: document.getElementById('artworkImage'),
    nameInput: document.getElementById('creatorName'),
    //imagePreview: document.getElementById('imagePreview'),
    previewImg: document.getElementById('previewImg'),
    removeImageBtn: document.getElementById('removeImage'),
    titleValidation: document.getElementById('titleValidation'),
    //imageValidation: document.getElementById('imageValidation'),
    nameValidation: document.getElementById('nameValidation'),
    backBtn: document.getElementById('backBtn'),
    nextBtn: document.getElementById('nextBtn')
};

// ============================================
// Initialization
// ============================================

function init() {
    console.log('Initializing Artwork Submit page...');
    
    // Load saved data if exists
    loadSavedData();
    
    // Set up event listeners
    setupEventListeners();
    
    // Update button state
    updateNextButtonState();
    
    console.log('Initialization complete');
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
    // Title input
    if (elements.titleInput) {
        elements.titleInput.addEventListener('input', handleTitleInput);
        elements.titleInput.addEventListener('blur', () => validateField('title'));
    }
    
    // Image upload
    if (elements.imageInput) {
        elements.imageInput.addEventListener('change', handleImageUpload);
    }
    
    // Remove image
    if (elements.removeImageBtn) {
        elements.removeImageBtn.addEventListener('click', removeImage);
    }
    
    // Name input
    if (elements.nameInput) {
        elements.nameInput.addEventListener('input', handleNameInput);
        elements.nameInput.addEventListener('blur', () => validateField('name'));
    }
    
    // Navigation buttons
    if (elements.backBtn) {
        elements.backBtn.addEventListener('click', handleBack);
    }
    
    if (elements.nextBtn) {
        elements.nextBtn.addEventListener('click', handleNext);
    }
}

// ============================================
// Input Handlers
// ============================================

function handleTitleInput(event) {
    state.title = event.target.value.trim();
    
    if (state.title.length > 0) {
        elements.titleValidation.style.display = 'none';
    }
    
    updateNextButtonState();
    autoSave();
}

function handleNameInput(event) {
    state.creatorName = event.target.value.trim();
    
    if (state.creatorName.length > 0) {
        elements.nameValidation.style.display = 'none';
    }
    
    updateNextButtonState();
    autoSave();
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');
        event.target.value = '';
        return;
    }
    
    // Validate file size
    if (file.size > CONFIG.maxImageSize) {
        alert('ファイルサイズは10MB以下にしてください。');
        event.target.value = '';
        return;
    }
    
    // Read and display image
    const reader = new FileReader();
    
    reader.onload = function(e) {
        state.imageFile = file;
        state.imageDataUrl = e.target.result;
        
        // Display preview
        elements.previewImg.src = e.target.result;
        elements.imagePreview.style.display = 'block';
        
        // Hide validation message
        elements.imageValidation.style.display = 'none';
        
        // Update button state
        updateNextButtonState();
        
        // Save to localStorage
        autoSave();
    };
    
    reader.onerror = function() {
        alert('画像の読み込みに失敗しました。');
    };
    
    reader.readAsDataURL(file);
}

function removeImage() {
    state.imageFile = null;
    state.imageDataUrl = null;
    
    elements.imageInput.value = '';
    elements.imagePreview.style.display = 'none';
    elements.previewImg.src = '';
    
    updateNextButtonState();
    autoSave();
}

// ============================================
// Validation
// ============================================

function validateField(fieldName) {
    switch(fieldName) {
        case 'title':
            if (state.title.length === 0) {
                elements.titleValidation.style.display = 'block';
                return false;
            }
            elements.titleValidation.style.display = 'none';
            return true;
            
        case 'image':
            if (!state.imageDataUrl) {
                elements.imageValidation.style.display = 'block';
                return false;
            }
            elements.imageValidation.style.display = 'none';
            return true;
            
        case 'name':
            if (state.creatorName.length === 0) {
                elements.nameValidation.style.display = 'block';
                return false;
            }
            elements.nameValidation.style.display = 'none';
            return true;
            
        default:
            return false;
    }
}

function validateForm() {
    const titleValid = validateField('title');
    const nameValid = validateField('name');
    return titleValid && nameValid;
}

function updateNextButtonState() {
    const hasTitle = elements.titleInput.value.trim().length > 0;
    const hasImage = state.imageDataUrl !== null;
    const hasName = elements.nameInput.value.trim().length > 0;
    
    elements.nextBtn.disabled = !(hasTitle && hasImage && hasName);
}

// ============================================
// Data Persistence (localStorage)
// ============================================

function saveData() {
    const data = {
        title: elements.titleInput.value.trim(),
        imageDataUrl: state.imageDataUrl,
        creatorName: elements.nameInput.value.trim()
    };
    
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
    console.log('Data saved to localStorage');
}

function autoSave() {
    saveData();
}

function loadSavedData() {
    const savedData = localStorage.getItem(CONFIG.storageKey);
    
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            console.log('Loaded saved data');
            
            // Restore title
            if (data.title) {
                elements.titleInput.value = data.title;
                state.title = data.title;
            }
            
            // Restore image
            if (data.imageDataUrl) {
                state.imageDataUrl = data.imageDataUrl;
                elements.previewImg.src = data.imageDataUrl;
                elements.imagePreview.style.display = 'block';
            }
            
            // Restore name
            if (data.creatorName) {
                elements.nameInput.value = data.creatorName;
                state.creatorName = data.creatorName;
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
    console.log('Proceeding to confirmation page...');
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
    });
}

// ============================================
// Initialize on DOM Ready
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        setupKeyboardShortcuts();
    });
} else {
    init();
    setupKeyboardShortcuts();
}

// ============================================
// Save before leaving
// ============================================

window.addEventListener('beforeunload', () => {
    saveData();
});
