// Global variables
let crops = [];
let currentCropIndex = 0;
let currentCrop = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeCropReview();
    setupEventListeners();
    setupKeyboardShortcuts();
});

async function initializeCropReview() {
    try {
        // Check if we have a specific crop ID in the URL
        const urlParams = new URLSearchParams(window.location.search);
        const cropId = urlParams.get('crop');
        
        if (cropId) {
            // Load specific crop
            await loadSpecificCrop(cropId);
        } else {
            // Load unreviewed crops list
            await loadCrops();
        }
        
        if (crops.length > 0 || currentCrop) {
            showCurrentCrop();
        } else {
            showNoCrops();
        }
    } catch (error) {
        console.error('Error initializing crop review:', error);
        showNoCrops();
    }
}

function setupEventListeners() {
    document.getElementById('save-next-btn').addEventListener('click', saveAndNext);
    document.getElementById('skip-btn').addEventListener('click', skipCrop);
    document.getElementById('prev-crop-btn').addEventListener('click', previousCrop);
    document.getElementById('delete-crop-btn').addEventListener('click', deleteCrop);
    
    // Auto-save when any classification changes
    const classificationNames = ['is_jonathan', 'top_clothing'];
    classificationNames.forEach(name => {
        const radioInputs = document.querySelectorAll(`input[name="${name}"]`);
        radioInputs.forEach(input => {
            input.addEventListener('change', autoSave);
        });
    });
    
    // Auto-save when activities checkboxes change
    const activityCheckboxes = document.querySelectorAll('input[name="activities"]');
    activityCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', autoSave);
    });
    
    // Auto-save when general classification changes (keeping for backward compatibility)
    const generalClassification = document.getElementById('general-classification');
    let generalTimeout;
    if (generalClassification) {
        generalClassification.addEventListener('input', () => {
            clearTimeout(generalTimeout);
            generalTimeout = setTimeout(autoSave, 1000);
        });
    }
    
    // Auto-save when notes change (with debounce)
    const notesTextarea = document.getElementById('notes');
    let notesTimeout;
    notesTextarea.addEventListener('input', () => {
        clearTimeout(notesTimeout);
        notesTimeout = setTimeout(autoSave, 1000); // Save 1 second after typing stops
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(event) {
        // Don't trigger shortcuts if user is typing in a text input or textarea
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        switch(event.key) {
            case 'Enter':
                event.preventDefault();
                saveAndNext();
                break;
            case 'ArrowLeft':
                event.preventDefault();
                previousCrop();
                break;
            case 'ArrowRight':
                event.preventDefault();
                skipCrop();
                break;
            case '1':
                event.preventDefault();
                selectRadio('is_jonathan', 'yes');
                break;
            case '2':
                event.preventDefault();
                selectRadio('is_jonathan', 'not sure');
                break;
            case '3':
                event.preventDefault();
                selectRadio('is_jonathan', 'no');
                break;
        }
    });
}

function selectRadio(fieldName, value) {
    const radio = document.querySelector(`input[name="${fieldName}"][value="${value}"]`);
    if (radio) {
        radio.checked = true;
        autoSave();
    }
}

async function loadCrops() {
    try {
        const response = await fetch('/api/crops/unreviewed');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        crops = await response.json();
        updateCropCounter();
    } catch (error) {
        console.error('Error loading crops:', error);
        crops = [];
    }
}

async function loadSpecificCrop(cropId) {
    try {
        const response = await fetch(`/api/crops/${cropId}/review`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Set up single crop mode
        crops = [data.crop];
        currentCropIndex = 0;
        currentCrop = data.crop;
        
        // Update counter to show single crop mode
        const counter = document.getElementById('crop-counter');
        if (counter) {
            counter.textContent = `Reviewing Crop #${cropId}`;
        }
        
        // Hide navigation buttons for single crop mode
        const prevBtn = document.getElementById('prev-crop-btn');
        const skipBtn = document.getElementById('skip-btn');
        if (prevBtn) prevBtn.style.display = 'none';
        if (skipBtn) skipBtn.style.display = 'none';
        
        // Change "Save & Next" to just "Save"
        const saveNextBtn = document.getElementById('save-next-btn');
        if (saveNextBtn) {
            saveNextBtn.textContent = 'Save Review';
        }
        
        // Load existing review data if it exists
        if (data.review) {
            populateReviewForm(data.review);
        }
        
    } catch (error) {
        console.error('Error loading specific crop:', error);
        crops = [];
        currentCrop = null;
    }
}

async function showCurrentCrop() {
    if (currentCropIndex >= crops.length) {
        showAllCropsReviewed();
        return;
    }
    
    currentCrop = crops[currentCropIndex];
    
    // Show loading
    showLoading();
    
    try {
        // Load original image first (independent of crop processing)
        const originalImage = document.getElementById('original-image');
        originalImage.src = currentCrop.original_path || `/saved_images/${currentCrop.original_camera}/${currentCrop.original_filename}`;
        
        // Set up original image loading
        originalImage.onload = () => {
            originalImage.classList.add('loaded');
            positionCropOverlay();
            hideLoading();
        };
        
        originalImage.onerror = () => {
            console.error('Failed to load original image');
            hideLoading();
        };
        
        // Load crop images asynchronously (don't block original image)
        const cropPath = `/${currentCrop.crop_folder}/${currentCrop.crop_filename}`.replace(/\\/g, '/');
        
        // Load original crop immediately
        document.getElementById('crop-original').src = cropPath;
        
        // Load processed crops in background (async)
        setTimeout(async () => {
            try {
                await loadProcessedImage(cropPath, 'crop-enhanced', 'sharpen');
                await loadProcessedImage(cropPath, 'crop-filtered', 'enhance');
            } catch (error) {
                console.error('Error processing crop images:', error);
                // Fallback to original crop for failed processing
                document.getElementById('crop-enhanced').src = cropPath;
                document.getElementById('crop-filtered').src = cropPath;
            }
        }, 100);
        
        // Update info
        updateCropInfo();
        
        // Load existing review data if any
        await loadExistingReview();
        
        updateCropCounter();
        
    } catch (error) {
        console.error('Error showing current crop:', error);
        hideLoading();
    }
}

function positionCropOverlay() {
    const originalImage = document.getElementById('original-image');
    const overlay = document.getElementById('crop-overlay');
    
    if (!currentCrop || !originalImage.complete) return;
    
    const imageRect = originalImage.getBoundingClientRect();
    const containerRect = originalImage.parentElement.getBoundingClientRect();
    
    // Calculate scale factors
    const scaleX = originalImage.naturalWidth / imageRect.width;
    const scaleY = originalImage.naturalHeight / imageRect.height;
    
    // Calculate overlay position
    const overlayLeft = (currentCrop.crop_left / scaleX) + (imageRect.left - containerRect.left);
    const overlayTop = (currentCrop.crop_top / scaleY) + (imageRect.top - containerRect.top);
    const overlayWidth = currentCrop.crop_width / scaleX;
    const overlayHeight = currentCrop.crop_height / scaleY;
    
    overlay.style.left = `${overlayLeft}px`;
    overlay.style.top = `${overlayTop}px`;
    overlay.style.width = `${overlayWidth}px`;
    overlay.style.height = `${overlayHeight}px`;
    overlay.style.display = 'block';
}

function updateCropInfo() {
    if (!currentCrop) return;
    
    document.getElementById('camera-name').textContent = currentCrop.original_camera;
    document.getElementById('image-details').textContent = `Image: ${currentCrop.original_filename}`;
    
    const savedDate = new Date(currentCrop.saved_at).toLocaleString();
    const cropSize = `${currentCrop.crop_width}×${currentCrop.crop_height}`;
    document.getElementById('crop-info').textContent = `Crop: ${cropSize} • Saved: ${savedDate}`;
}

async function loadExistingReview() {
    try {
        const response = await fetch(`/api/crops/${currentCrop.id}/review`);
        if (!response.ok) {
            // This is expected if a review doesn't exist yet (404).
            return;
        }
        const data = await response.json();
        if (data.review) {
            populateReviewForm(data.review);
        }
    } catch (error) {
        // 404 is expected when no review exists yet - don't log as error
        if (!error.message || !error.message.includes('404')) {
            console.error('Error loading existing review:', error);
        }
    }
}

function populateReviewForm(review) {
    // Set is_jonathan field
    if (review.is_jonathan) {
        const radio = document.querySelector(`input[name="is_jonathan"][value="${review.is_jonathan}"]`);
        if (radio) radio.checked = true;
    }
    
    // Set activities checkboxes
    if (review.activities) {
        try {
            const activities = JSON.parse(review.activities);
            activities.forEach(activity => {
                const checkbox = document.querySelector(`input[name="activities"][value="${activity}"]`);
                if (checkbox) checkbox.checked = true;
            });
        } catch (e) {
            console.warn('Could not parse activities JSON:', review.activities);
        }
    }
    
    // Set top_clothing field
    if (review.top_clothing) {
        const radio = document.querySelector(`input[name="top_clothing"][value="${review.top_clothing}"]`);
        if (radio) radio.checked = true;
    }
    
    // Set general classification (deprecated but kept for backward compatibility)
    if (review.classification) {
        const classificationInput = document.getElementById('general-classification');
        if (classificationInput) {
            classificationInput.value = review.classification;
        }
    }
    
    // Set notes
    if (review.notes) {
        document.getElementById('notes').value = review.notes;
    }
}


async function autoSave() {
    if (!currentCrop) return;
    
    // Collect all classification fields
    const isJonathan = document.querySelector('input[name="is_jonathan"]:checked')?.value;
    const topClothing = document.querySelector('input[name="top_clothing"]:checked')?.value;
    const notes = document.getElementById('notes').value;
    
    // Collect selected activities
    const selectedActivities = Array.from(document.querySelectorAll('input[name="activities"]:checked'))
        .map(checkbox => checkbox.value);
    const activitiesJson = selectedActivities.length > 0 ? JSON.stringify(selectedActivities) : null;
    
    // Only save if at least one field has a value (removed generalClassification from required check)
    if (isJonathan || topClothing || notes || selectedActivities.length > 0) {
        try {
            await fetch(`/api/crops/${currentCrop.id}/review`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    notes,
                    is_jonathan: isJonathan,
                    activities: activitiesJson,
                    top_clothing: topClothing,
                    reviewed_at: new Date().toISOString()
                })
            });
        } catch (error) {
            console.error('Error auto-saving review:', error);
        }
    }
}

async function saveAndNext() {
    await autoSave();
    nextCrop();
}

function skipCrop() {
    nextCrop();
}

function nextCrop() {
    if (currentCropIndex < crops.length - 1) {
        currentCropIndex++;
        clearForm();
        showCurrentCrop();
    } else {
        showAllCropsReviewed();
    }
}

function previousCrop() {
    if (currentCropIndex > 0) {
        currentCropIndex--;
        clearForm();
        showCurrentCrop();
    }
}

function clearForm() {
    // Clear radio buttons
    const radioNames = ['is_jonathan', 'top_clothing'];
    radioNames.forEach(name => {
        const radioInputs = document.querySelectorAll(`input[name="${name}"]`);
        radioInputs.forEach(input => input.checked = false);
    });
    
    // Clear activity checkboxes
    const activityCheckboxes = document.querySelectorAll('input[name="activities"]');
    activityCheckboxes.forEach(checkbox => checkbox.checked = false);
    
    // Clear general classification (deprecated)
    const classificationInput = document.getElementById('general-classification');
    if (classificationInput) {
        classificationInput.value = '';
    }
    
    // Clear notes
    document.getElementById('notes').value = '';
}

function updateCropCounter() {
    const counter = document.getElementById('crop-counter');
    if (crops.length === 0) {
        counter.textContent = 'No crops to review';
    } else {
        counter.textContent = `Crop ${currentCropIndex + 1} of ${crops.length}`;
    }
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('original-image').classList.remove('loaded');
    document.getElementById('crop-overlay').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showNoCrops() {
    hideLoading();
    document.getElementById('crop-counter').textContent = 'No crops available for review';
    document.getElementById('progress-info').textContent = 'Check back later for new crops';
}

function showAllCropsReviewed() {
    hideLoading();
    document.getElementById('crop-counter').textContent = 'All crops reviewed!';
    document.getElementById('progress-info').textContent = 'Great job! Check back later for new crops';
    
    // Optionally redirect or show completion message
    setTimeout(() => {
        if (confirm('All crops have been reviewed! Would you like to go to the dashboard?')) {
            window.location.href = 'dashboard.html';
        }
    }, 2000);
}

// Image processing functions
async function loadProcessedImage(imagePath, targetElementId, filterType) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                
                canvas.width = img.width;
                canvas.height = img.height;
                
                // Draw original image
                ctx.drawImage(img, 0, 0);
                
                // Apply filter based on type
                if (filterType === 'sharpen') {
                    // First apply 4x bicubic interpolation, then sharpen
                    applyBicubicInterpolation(ctx, canvas, 4);
                    applySharpenFilter(ctx, canvas.width, canvas.height);
                } else if (filterType === 'enhance') {
                    applyEnhanceFilter(ctx, canvas.width, canvas.height);
                }
                
                // Convert canvas to data URL and set as image src
                const targetImg = document.getElementById(targetElementId);
                targetImg.src = canvas.toDataURL();
                resolve();
            } catch (error) {
                console.error(`Error processing ${filterType} filter:`, error);
                // Fallback to original image
                document.getElementById(targetElementId).src = imagePath;
                reject(error);
            }
        };
        
        img.onerror = () => {
            console.error(`Failed to load image for processing: ${imagePath}`);
            // Fallback to original image
            document.getElementById(targetElementId).src = imagePath;
            reject(new Error('Image load failed'));
        };
        
        img.src = imagePath;
    });
}

function applyBicubicInterpolation(ctx, canvas, scaleFactor) {
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    const newWidth = originalWidth * scaleFactor;
    const newHeight = originalHeight * scaleFactor;
    
    // Get original image data
    const originalData = ctx.getImageData(0, 0, originalWidth, originalHeight);
    
    // Resize canvas
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Create new image data
    const newImageData = ctx.createImageData(newWidth, newHeight);
    const newData = newImageData.data;
    
    // Bicubic interpolation
    for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
            // Map new coordinates to original coordinates
            const srcX = x / scaleFactor;
            const srcY = y / scaleFactor;
            
            // Get bicubic interpolated pixel
            const pixel = bicubicInterpolate(originalData, originalWidth, originalHeight, srcX, srcY);
            
            const newIndex = (y * newWidth + x) * 4;
            newData[newIndex] = pixel.r;
            newData[newIndex + 1] = pixel.g;
            newData[newIndex + 2] = pixel.b;
            newData[newIndex + 3] = pixel.a;
        }
    }
    
    // Put the interpolated data back
    ctx.putImageData(newImageData, 0, 0);
}

function bicubicInterpolate(imageData, width, height, x, y) {
    const data = imageData.data;
    
    // Get integer coordinates
    const x1 = Math.floor(x);
    const y1 = Math.floor(y);
    
    // Get fractional parts
    const dx = x - x1;
    const dy = y - y1;
    
    // Sample 4x4 neighborhood
    const samples = [];
    for (let j = -1; j <= 2; j++) {
        for (let i = -1; i <= 2; i++) {
            const px = Math.max(0, Math.min(width - 1, x1 + i));
            const py = Math.max(0, Math.min(height - 1, y1 + j));
            const index = (py * width + px) * 4;
            samples.push({
                r: data[index],
                g: data[index + 1],
                b: data[index + 2],
                a: data[index + 3]
            });
        }
    }
    
    // Apply bicubic weights
    const result = { r: 0, g: 0, b: 0, a: 0 };
    
    for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
            const wx = cubicWeight(dx - i + 1);
            const wy = cubicWeight(dy - j + 1);
            const weight = wx * wy;
            const sample = samples[j * 4 + i];
            
            result.r += sample.r * weight;
            result.g += sample.g * weight;
            result.b += sample.b * weight;
            result.a += sample.a * weight;
        }
    }
    
    return {
        r: Math.max(0, Math.min(255, Math.round(result.r))),
        g: Math.max(0, Math.min(255, Math.round(result.g))),
        b: Math.max(0, Math.min(255, Math.round(result.b))),
        a: Math.max(0, Math.min(255, Math.round(result.a)))
    };
}

function cubicWeight(t) {
    const abs_t = Math.abs(t);
    if (abs_t <= 1) {
        return 1.5 * abs_t * abs_t * abs_t - 2.5 * abs_t * abs_t + 1;
    } else if (abs_t <= 2) {
        return -0.5 * abs_t * abs_t * abs_t + 2.5 * abs_t * abs_t - 4 * abs_t + 2;
    }
    return 0;
}

function applySharpenFilter(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const newData = new Uint8ClampedArray(data);
    
    // Sharpening kernel
    const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ];
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            for (let c = 0; c < 3; c++) { // RGB channels only
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + c;
                        const kernelIndex = (ky + 1) * 3 + (kx + 1);
                        sum += data[pixelIndex] * kernel[kernelIndex];
                    }
                }
                const newPixelIndex = (y * width + x) * 4 + c;
                newData[newPixelIndex] = Math.max(0, Math.min(255, sum));
            }
        }
    }
    
    const newImageData = new ImageData(newData, width, height);
    ctx.putImageData(newImageData, 0, 0);
}

function applyEnhanceFilter(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Convert to HSL for better control
        const [h, s, l] = rgbToHsl(r, g, b);
        
        // Enhance midtones (adjust lightness curve)
        let newL = l;
        if (l > 0.2 && l < 0.8) {
            // Boost midtones
            newL = l + (0.5 - l) * 0.3;
        }
        
        // Increase saturation
        const newS = Math.min(1, s * 1.4);
        
        // Convert back to RGB
        const [newR, newG, newB] = hslToRgb(h, newS, newL);
        
        data[i] = newR;
        data[i + 1] = newG;
        data[i + 2] = newB;
    }
    
    ctx.putImageData(imageData, 0, 0);
}

// Color space conversion utilities
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    let r, g, b;
    
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

async function deleteCrop() {
    if (!crops[currentCropIndex]) {
        console.error('No crop to delete');
        return;
    }
    
    const currentCrop = crops[currentCropIndex];
    
    // Show confirmation dialog
    const confirmed = confirm(
        `Are you sure you want to delete this crop?\n\n` +
        `Camera: ${currentCrop.original_camera}\n` +
        `Image: ${currentCrop.original_filename}\n` +
        `Created: ${new Date(currentCrop.saved_at).toLocaleString()}\n\n` +
        `This action cannot be undone.`
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        const response = await fetch(`/api/crops/${currentCrop.id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete crop: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('Crop deleted successfully:', result);
        
        // Remove the crop from the local array
        crops.splice(currentCropIndex, 1);
        
        // Navigate to the next crop or load more crops
        if (crops.length === 0) {
            // No more crops in current list, try to load next available crop from database
            await loadNextAvailableCrop();
        } else {
            // Stay at the same index (which now points to the next crop)
            // unless we were at the last crop, then go to the previous one
            if (currentCropIndex >= crops.length) {
                currentCropIndex = crops.length - 1;
            }
            // If we deleted a crop in the middle, currentCropIndex now points to the next crop
            clearForm();
            showCurrentCrop();
        }
        
        updateCropCounter();
        
    } catch (error) {
        console.error('Error deleting crop:', error);
        alert('Failed to delete crop. Please try again.');
    }
}

async function loadNextAvailableCrop() {
    try {
        // Try to load unreviewed crops from the database
        const response = await fetch('/api/crops/unreviewed');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const newCrops = await response.json();
        
        if (newCrops.length > 0) {
            // Found more crops, load them and start at the first one
            crops = newCrops;
            currentCropIndex = 0;
            clearForm();
            showCurrentCrop();
            updateCropCounter();
        } else {
            // No more crops available
            showNoCrops();
        }
        
    } catch (error) {
        console.error('Error loading next available crop:', error);
        showNoCrops();
    }
}
