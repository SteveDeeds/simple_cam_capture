// Crop Review v2 - Factors-based review system
class CropReviewV2 {
    constructor() {
        this.crops = [];
        this.currentIndex = 0;
        this.factors = {
            positive: [],
            negative: []
        };
        this.selectedFactors = {
            positive: new Set(),
            negative: new Set()
        };
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Crop Review v2');
        
        try {
            await this.loadFactors();
            await this.loadCrops();
            this.setupEventListeners();
            this.renderFactors();
            this.displayCurrentCrop();
        } catch (error) {
            console.error('❌ Failed to initialize:', error);
            this.showError('Failed to initialize the review system');
        }
    }

    async loadFactors() {
        try {
            console.log('📋 Loading factors...');
            const response = await fetch('/api/factors');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const allFactors = await response.json();
            this.factors.positive = allFactors.filter(f => f.type === 'positive');
            this.factors.negative = allFactors.filter(f => f.type === 'negative');
            
            console.log(`✅ Loaded ${this.factors.positive.length} positive and ${this.factors.negative.length} negative factors`);
        } catch (error) {
            console.error('❌ Failed to load factors:', error);
            throw new Error('Could not load factors from server');
        }
    }

    async loadCrops() {
        try {
            console.log('🌾 Loading crops...');
            
            // Check if a specific crop ID is requested via URL parameter
            const urlParams = new URLSearchParams(window.location.search);
            const specificCropId = urlParams.get('crop');
            
            if (specificCropId) {
                console.log(`🎯 Loading specific crop ID: ${specificCropId}`);
                const response = await fetch(`/api/crops/${specificCropId}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const specificCrop = await response.json();
                this.crops = [specificCrop];
                this.currentIndex = 0;
                console.log(`✅ Loaded specific crop: ${specificCrop.camera_name}`);
            } else {
                // First try to load unreviewed crops
                const response = await fetch('/api/crops/unreviewed?limit=100');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                this.crops = await response.json();
                console.log(`✅ Loaded ${this.crops.length} unreviewed crops`);
                
                // If no unreviewed crops, fallback to most recent crop
                if (this.crops.length === 0) {
                    console.log('📅 No unreviewed crops found, loading most recent crop...');
                    const recentResponse = await fetch('/api/crops/most-recent');
                    if (recentResponse.ok) {
                        const mostRecentCrop = await recentResponse.json();
                        this.crops = [mostRecentCrop];
                        console.log(`✅ Loaded most recent crop: ${mostRecentCrop.camera_name}`);
                    } else {
                        console.log('❌ No crops available at all');
                    }
                }
            }
            
            this.updateNavigationInfo();
        } catch (error) {
            console.error('❌ Failed to load crops:', error);
            throw new Error('Could not load crops from server');
        }
    }

    renderFactors() {
        const container = document.getElementById('allFactors');
        container.innerHTML = '';

        // Combine all factors and sort alphabetically
        const allFactors = [
            ...this.factors.positive.map(f => ({...f, type: 'positive'})),
            ...this.factors.negative.map(f => ({...f, type: 'negative'}))
        ].sort((a, b) => a.name.localeCompare(b.name));

        // Calculate midpoint for column-by-column layout
        const midpoint = Math.ceil(allFactors.length / 2);
        const leftColumn = allFactors.slice(0, midpoint);
        const rightColumn = allFactors.slice(midpoint);

        // Add factors in column-by-column order
        const maxLength = Math.max(leftColumn.length, rightColumn.length);
        for (let i = 0; i < maxLength; i++) {
            // Add left column factor
            if (i < leftColumn.length) {
                const factor = leftColumn[i];
                const factorElement = this.createFactorElement(factor);
                factorElement.style.gridColumn = '1';
                factorElement.style.gridRow = `${i + 1}`;
                container.appendChild(factorElement);
            }
            
            // Add right column factor
            if (i < rightColumn.length) {
                const factor = rightColumn[i];
                const factorElement = this.createFactorElement(factor);
                factorElement.style.gridColumn = '2';
                factorElement.style.gridRow = `${i + 1}`;
                container.appendChild(factorElement);
            }
        }
    }

    createFactorElement(factor) {
        const factorElement = document.createElement('div');
        factorElement.className = `factor-item ${factor.type}`;
        factorElement.dataset.factorId = factor.id;
        factorElement.dataset.factorType = factor.type;

        const isSelected = this.selectedFactors[factor.type].has(factor.id);
        if (isSelected) {
            factorElement.classList.add('selected');
        }

        factorElement.innerHTML = `
            <input type="checkbox" class="factor-checkbox" ${isSelected ? 'checked' : ''}>
            <span class="factor-name">${factor.name}</span>
        `;

        factorElement.addEventListener('click', () => this.toggleFactor(factor.id, factor.type));
        return factorElement;
    }

    toggleFactor(factorId, type) {
        // Remove from the opposite type if it exists
        const oppositeType = type === 'positive' ? 'negative' : 'positive';
        this.selectedFactors[oppositeType].delete(factorId);
        
        // Toggle in the current type
        if (this.selectedFactors[type].has(factorId)) {
            this.selectedFactors[type].delete(factorId);
        } else {
            this.selectedFactors[type].add(factorId);
        }

        // Re-render both columns to update visual state
        this.renderFactors();
        
        console.log('🏷️ Updated factors:', {
            positive: Array.from(this.selectedFactors.positive),
            negative: Array.from(this.selectedFactors.negative)
        });
    }

    setupEventListeners() {
        // Action buttons
        document.getElementById('saveNextBtn').addEventListener('click', () => this.saveAndNext());
        document.getElementById('skipBtn').addEventListener('click', () => this.skip());
        document.getElementById('previousBtn').addEventListener('click', () => this.previous());
        document.getElementById('deleteBtn').addEventListener('click', () => this.deleteCrop());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'TEXTAREA') return; // Don't interfere with textarea input
            
            switch (e.key) {
                case 'Enter':
                case 'n':
                    e.preventDefault();
                    this.saveAndNext();
                    break;
                case 'ArrowLeft':
                case 'p':
                    e.preventDefault();
                    this.previous();
                    break;
                case 'ArrowRight':
                case 's':
                    e.preventDefault();
                    this.skip();
                    break;
                case 'Delete':
                    e.preventDefault();
                    this.deleteCrop();
                    break;
            }
        });
    }

    async displayCurrentCrop() {
        const currentCrop = this.getCurrentCrop();
        
        if (!currentCrop) {
            this.showNoImage();
            return;
        }

        console.log('🖼️ Displaying crop:', currentCrop.id);
        
        // Show loading state
        this.showImageLoading();
        
        // Clear previous review data
        this.clearReviewForm();
        
        try {
            // Load existing review if it exists
            await this.loadExistingReview(currentCrop.id);
            
            // Load crop images (original, enhanced, filtered) and original camera image
            await this.loadCropImages();
            
            // Update info
            this.updateImageInfo(currentCrop);
            
        } catch (error) {
            console.error('❌ Failed to display crop:', error);
            this.showError('Failed to load crop image');
        }
        
        this.updateNavigationInfo();
    }

    async loadExistingReview(cropId) {
        try {
            const response = await fetch(`/api/crops/${cropId}/review`);
            if (response.ok) {
                const review = await response.json();
                
                // Load factors
                if (review.factors) {
                    this.selectedFactors.positive = new Set(review.factors.positive.map(f => f.id));
                    this.selectedFactors.negative = new Set(review.factors.negative.map(f => f.id));
                    this.renderFactors();
                }
                
                // Load Jonathan classification
                if (review.is_jonathan) {
                    const radio = document.querySelector(`input[name="isJonathan"][value="${review.is_jonathan}"]`);
                    if (radio) radio.checked = true;
                }
                
                // Load notes
                if (review.notes) {
                    document.getElementById('reviewNotes').value = review.notes;
                }
                
                console.log('📝 Loaded existing review data');
            }
        } catch (error) {
            console.warn('⚠️ Could not load existing review:', error);
            // This is not a critical error, continue without existing data
        }
    }

    clearReviewForm() {
        // Clear factor selections
        this.selectedFactors.positive.clear();
        this.selectedFactors.negative.clear();
        this.renderFactors();
        
        // Clear radio buttons
        document.querySelectorAll('input[name="isJonathan"]').forEach(radio => radio.checked = false);
        
        // Clear notes
        document.getElementById('reviewNotes').value = '';
    }

    updateImageInfo(crop) {
        const cameraNameEl = document.getElementById('originalCameraName');
        const imageNameEl = document.getElementById('originalImageName');
        const imageTimeEl = document.getElementById('originalImageTime');
        
        if (cameraNameEl) {
            cameraNameEl.textContent = crop.original_camera || '-';
        }
        if (imageNameEl) {
            imageNameEl.textContent = crop.original_filename || '-';
        }
        if (imageTimeEl) {
            imageTimeEl.textContent = crop.saved_at ? 
                new Date(crop.saved_at).toLocaleString() : '-';
        }
    }

    showImageLoading() {
        // Show loading state for crop images
        const cropImages = ['originalCropImage', 'enhancedCropImage', 'filteredCropImage'];
        cropImages.forEach(id => {
            const img = document.getElementById(id);
            if (img) {
                img.style.display = 'none';
                img.src = '';
            }
        });
        
        // Show loading for original image
        const originalImg = document.getElementById('originalImage');
        const originalLoading = document.getElementById('originalLoading');
        const noOriginalImage = document.getElementById('noOriginalImage');
        
        if (originalImg) originalImg.style.display = 'none';
        if (originalLoading) originalLoading.style.display = 'block';
        if (noOriginalImage) noOriginalImage.style.display = 'none';
    }

    showImage() {
        // Show crop images
        const cropImages = ['originalCropImage', 'enhancedCropImage', 'filteredCropImage'];
        cropImages.forEach(id => {
            const img = document.getElementById(id);
            if (img && img.src) {
                img.style.display = 'block';
            }
        });
        
        // Show original image
        const originalImg = document.getElementById('originalImage');
        const originalLoading = document.getElementById('originalLoading');
        const noOriginalImage = document.getElementById('noOriginalImage');
        
        if (originalImg && originalImg.src) {
            originalImg.style.display = 'block';
        }
        if (originalLoading) originalLoading.style.display = 'none';
        if (noOriginalImage) noOriginalImage.style.display = 'none';
    }

    showImageError() {
        // Hide crop images
        const cropImages = ['originalCropImage', 'enhancedCropImage', 'filteredCropImage'];
        cropImages.forEach(id => {
            const img = document.getElementById(id);
            if (img) {
                img.style.display = 'none';
                img.src = '';
            }
        });
        
        // Show error for original image
        const originalImg = document.getElementById('originalImage');
        const originalLoading = document.getElementById('originalLoading');
        const noOriginalImage = document.getElementById('noOriginalImage');
        
        if (originalImg) originalImg.style.display = 'none';
        if (originalLoading) originalLoading.style.display = 'none';
        if (noOriginalImage) {
            noOriginalImage.style.display = 'block';
            noOriginalImage.textContent = 'Failed to load image';
        }
    }

    showNoImage() {
        // Hide crop images
        const cropImages = ['originalCropImage', 'enhancedCropImage', 'filteredCropImage'];
        cropImages.forEach(id => {
            const img = document.getElementById(id);
            if (img) {
                img.style.display = 'none';
                img.src = '';
            }
        });
        
        // Show no image message
        const originalImg = document.getElementById('originalImage');
        const originalLoading = document.getElementById('originalLoading');
        const noOriginalImage = document.getElementById('noOriginalImage');
        
        if (originalImg) originalImg.style.display = 'none';
        if (originalLoading) originalLoading.style.display = 'none';
        if (noOriginalImage) {
            noOriginalImage.style.display = 'block';
            noOriginalImage.textContent = 'No more crops to review';
        }
    }

    updateNavigationInfo() {
        document.getElementById('currentIndex').textContent = this.crops.length > 0 ? this.currentIndex + 1 : 0;
        document.getElementById('totalCrops').textContent = this.crops.length;
    }

    getCurrentCrop() {
        return this.crops[this.currentIndex] || null;
    }

    async saveAndNext() {
        await this.saveCurrentReview();
        this.next();
    }

    async saveCurrentReview() {
        const currentCrop = this.getCurrentCrop();
        if (!currentCrop) return;

        this.showLoadingOverlay('Saving review...');

        try {
            // Gather review data
            const isJonathan = document.querySelector('input[name="isJonathan"]:checked')?.value || null;
            const notes = document.getElementById('reviewNotes').value.trim() || null;
            const positiveFactorIds = Array.from(this.selectedFactors.positive);
            const negativeFactorIds = Array.from(this.selectedFactors.negative);

            console.log('💾 Saving review:', {
                cropId: currentCrop.id,
                isJonathan,
                notes,
                positiveFactorIds,
                negativeFactorIds
            });

            // Save the review
            const response = await fetch(`/api/crops/${currentCrop.id}/review`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    notes,
                    is_jonathan: isJonathan,
                    positive_factors: positiveFactorIds,
                    negative_factors: negativeFactorIds
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to save review: HTTP ${response.status}`);
            }

            console.log('✅ Review saved successfully');

        } catch (error) {
            console.error('❌ Failed to save review:', error);
            this.showError('Failed to save review');
            throw error;
        } finally {
            this.hideLoadingOverlay();
        }
    }

    skip() {
        console.log('⏭️ Skipping crop');
        this.next();
    }

    next() {
        if (this.currentIndex < this.crops.length - 1) {
            this.currentIndex++;
            this.displayCurrentCrop();
        } else {
            console.log('📝 Reached end of crops');
            this.showMessage('🎉 All crops reviewed! Loading more...');
            this.loadCrops(); // Try to load more crops
        }
    }

    previous() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.displayCurrentCrop();
        }
    }

    async deleteCrop() {
        const currentCrop = this.getCurrentCrop();
        if (!currentCrop) return;

        if (!confirm('Are you sure you want to delete this crop? This action cannot be undone.')) {
            return;
        }

        this.showLoadingOverlay('Deleting crop...');

        try {
            const response = await fetch(`/api/crops/${currentCrop.id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`Failed to delete crop: HTTP ${response.status}`);
            }

            console.log('🗑️ Crop deleted successfully');
            
            // Check total remaining unreviewed crops for debugging
            try {
                const statsResponse = await fetch('/api/crop-stats');
                if (statsResponse.ok) {
                    const stats = await statsResponse.json();
                    console.log('📊 Crop stats after deletion:', stats);
                    console.log(`📈 Total unreviewed crops remaining: ${stats.unreviewed_crops || 0}`);
                }
            } catch (e) {
                console.log('⚠️ Could not fetch crop stats:', e);
            }
            
            // Remove from local array
            this.crops.splice(this.currentIndex, 1);
            console.log(`📦 Local crops array now has ${this.crops.length} items`);
            
            // If no crops left in current array, try to load more
            if (this.crops.length === 0) {
                console.log('📦 No more crops in current list, loading next available crop...');
                await this.loadNextAvailableCrop();
            } else {
                // Adjust current index if necessary
                if (this.currentIndex >= this.crops.length) {
                    this.currentIndex = Math.max(0, this.crops.length - 1);
                }
                this.displayCurrentCrop();
            }

        } catch (error) {
            console.error('❌ Failed to delete crop:', error);
            this.showError('Failed to delete crop');
        } finally {
            this.hideLoadingOverlay();
        }
    }

    async loadNextAvailableCrop() {
        try {
            console.log('🔍 Checking for next available crop...');
            
            // Try to get the next unreviewed crop
            const response = await fetch('/api/crops/unreviewed?limit=1');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const crops = await response.json();
            console.log('📊 API Response for unreviewed crops:', crops);
            console.log('📈 Number of unreviewed crops found:', crops ? crops.length : 0);
            
            if (crops && crops.length > 0) {
                // Found another crop to review
                this.crops = crops;
                this.currentIndex = 0;
                console.log(`✅ Loaded next available crop: ${crops[0].camera_name} (ID: ${crops[0].id})`);
                this.displayCurrentCrop();
                this.updateNavigationInfo();
            } else {
                // No more crops available
                console.log('🎉 No more crops to review! Response was:', crops);
                this.showNoCropsMessage();
            }
        } catch (error) {
            console.error('❌ Failed to load next crop:', error);
            this.showError('Failed to load next crop');
        }
    }

    showNoCropsMessage() {
        // Clear the interface and show completion message
        document.getElementById('originalImage').style.display = 'none';
        document.getElementById('originalLoading').style.display = 'none';
        document.getElementById('noOriginalImage').style.display = 'block';
        document.getElementById('noOriginalImage').textContent = '🎉 All legitimate crops have been reviewed!';
        
        // Clear crop images
        const cropImages = ['originalCropImage', 'enhancedCropImage', 'filteredCropImage'];
        cropImages.forEach(id => {
            const img = document.getElementById(id);
            if (img) img.src = '';
        });
        
        // Clear info
        document.getElementById('originalCameraName').textContent = '-';
        document.getElementById('originalImageName').textContent = '-';
        document.getElementById('originalImageTime').textContent = '-';
        
        // Update navigation
        document.getElementById('currentIndex').textContent = '0';
        document.getElementById('totalCrops').textContent = '0';
        
        // Show suggestion to go back to dashboard
        const reviewSection = document.querySelector('.review-section');
        if (reviewSection) {
            reviewSection.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <h2>🎉 All Done!</h2>
                    <p>All legitimate crops have been reviewed.</p>
                    <p style="font-size: 0.9em; color: #666; margin-top: 1rem;">
                        ${this.showTestDataInfo ? 'Note: Some test data crops remain but are hidden from review.' : ''}
                    </p>
                    <div style="margin-top: 2rem;">
                        <a href="/crop-dashboard.html" class="btn btn-primary">📊 Back to Crop Dashboard</a>
                        <a href="/dashboard.html" class="btn btn-secondary" style="margin-left: 1rem;">🏠 Main Dashboard</a>
                    </div>
                </div>
            `;
        }
    }

    showLoadingOverlay(message = 'Processing...') {
        const overlay = document.getElementById('loadingOverlay');
        const spinner = overlay.querySelector('.loading-spinner');
        spinner.textContent = message;
        overlay.style.display = 'flex';
    }

    hideLoadingOverlay() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    showError(message) {
        alert(`Error: ${message}`);
    }

    showMessage(message) {
        alert(message);
    }

    async loadCropImages() {
        if (!this.crops || this.crops.length === 0) return;
        
        const currentCrop = this.crops[this.currentIndex];
        if (!currentCrop) return;
        
        console.log('🖼️ Loading crop images...');
        
        try {
            // Get crop path and normalize for web
            const cropPath = currentCrop.crop_folder.replace(/\\/g, '/');
            const imagePath = `/${cropPath}/${currentCrop.crop_filename}`;
            console.log('📁 Crop path:', cropPath);
            console.log('🖼️ Full image path:', imagePath);
            
            // Load original crop
            const originalImg = document.getElementById('originalCropImage');
            if (originalImg) {
                console.log('📤 Setting original crop image src:', imagePath);
                originalImg.src = imagePath;
                originalImg.style.display = 'block';
            } else {
                console.error('❌ originalCropImage element not found');
            }
            
            // Load enhanced crop (with enhance filter)
            console.log('🔧 Loading enhanced crop...');
            await this.loadProcessedImage(imagePath, 'enhancedCropImage', 'enhance');
            
            // Load filtered crop (with sharpen filter)
            console.log('🔧 Loading filtered crop...');
            await this.loadProcessedImage(imagePath, 'filteredCropImage', 'sharpen');
            
            // Load original camera image and set up overlay
            await this.loadOriginalImage(currentCrop);
            
        } catch (error) {
            console.error('❌ Error loading crop images:', error);
        }
    }
    
    async loadOriginalImage(crop) {
        try {
            // Get original image path
            const originalPath = crop.original_path || `saved_images/${crop.original_camera}/${crop.original_filename}`;
            const normalizedPath = originalPath.replace(/\\/g, '/');
            const imagePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
            
            console.log('🏞️ Loading original image from:', imagePath);
            
            const originalImg = document.getElementById('originalImage');
            const originalLoading = document.getElementById('originalLoading');
            const noOriginalImage = document.getElementById('noOriginalImage');
            
            if (!originalImg) {
                console.error('❌ originalImage element not found');
                return;
            }
            
            // Show loading state
            if (originalLoading) originalLoading.style.display = 'block';
            if (noOriginalImage) noOriginalImage.style.display = 'none';
            originalImg.style.display = 'none';
            
            originalImg.onload = () => {
                console.log('✅ Original image loaded successfully');
                originalImg.classList.add('loaded');
                originalImg.style.display = 'block';
                if (originalLoading) originalLoading.style.display = 'none';
                if (noOriginalImage) noOriginalImage.style.display = 'none';
                this.positionCropOverlay(crop);
            };
            
            originalImg.onerror = () => {
                console.error('❌ Failed to load original image:', imagePath);
                originalImg.style.display = 'none';
                if (originalLoading) originalLoading.style.display = 'none';
                if (noOriginalImage) {
                    noOriginalImage.style.display = 'block';
                    noOriginalImage.textContent = 'Failed to load original image';
                }
            };
            
            originalImg.src = imagePath;
            
        } catch (error) {
            console.error('❌ Error loading original image:', error);
            const noOriginalImage = document.getElementById('noOriginalImage');
            const originalLoading = document.getElementById('originalLoading');
            if (originalLoading) originalLoading.style.display = 'none';
            if (noOriginalImage) {
                noOriginalImage.style.display = 'block';
                noOriginalImage.textContent = 'Error loading original image';
            }
        }
    }
    
    positionCropOverlay(crop) {
        const overlay = document.getElementById('cropOverlay');
        const originalImg = document.getElementById('originalImage');
        const container = document.getElementById('originalImageContainer');
        
        if (!overlay || !originalImg || !container || !originalImg.complete) return;
        
        const containerRect = container.getBoundingClientRect();
        const imageRect = originalImg.getBoundingClientRect();
        
        // Calculate scale factors
        const scaleX = originalImg.naturalWidth / imageRect.width;
        const scaleY = originalImg.naturalHeight / imageRect.height;
        
        // Calculate overlay position
        const overlayLeft = (crop.crop_left / scaleX) + (imageRect.left - containerRect.left);
        const overlayTop = (crop.crop_top / scaleY) + (imageRect.top - containerRect.top);
        const overlayWidth = crop.crop_width / scaleX;
        const overlayHeight = crop.crop_height / scaleY;
        
        overlay.style.left = `${overlayLeft}px`;
        overlay.style.top = `${overlayTop}px`;
        overlay.style.width = `${overlayWidth}px`;
        overlay.style.height = `${overlayHeight}px`;
        overlay.style.display = 'block';
    }

    // Image processing functions
    async loadProcessedImage(imagePath, targetElementId, filterType) {
        console.log(`🔄 Processing ${filterType} filter for ${targetElementId} with path: ${imagePath}`);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                console.log(`✅ Image loaded for ${filterType} processing`);
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
                        this.applyBicubicInterpolation(ctx, canvas, 4);
                        this.applySharpenFilter(ctx, canvas.width, canvas.height);
                    } else if (filterType === 'enhance') {
                        this.applyEnhanceFilter(ctx, canvas.width, canvas.height);
                    }
                    
                    // Convert canvas to data URL and set as image src
                    const targetImg = document.getElementById(targetElementId);
                    if (targetImg) {
                        targetImg.src = canvas.toDataURL();
                        targetImg.style.display = 'block';
                        console.log(`✅ ${filterType} filter applied to ${targetElementId}`);
                    } else {
                        console.error(`❌ Target element ${targetElementId} not found`);
                    }
                    resolve();
                } catch (error) {
                    console.error(`❌ Error processing ${filterType} filter:`, error);
                    // Fallback to original image
                    const targetImg = document.getElementById(targetElementId);
                    if (targetImg) {
                        targetImg.src = imagePath;
                        targetImg.style.display = 'block';
                    }
                    reject(error);
                }
            };
            
            img.onerror = () => {
                console.error(`❌ Failed to load image for processing: ${imagePath}`);
                // Fallback to original image
                const targetImg = document.getElementById(targetElementId);
                if (targetImg) {
                    targetImg.src = imagePath;
                }
                reject(new Error('Failed to load image'));
            };
            
            img.src = imagePath;
        });
    }
    
    applyEnhanceFilter(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            // Increase contrast and brightness
            data[i] = Math.min(255, data[i] * 1.2 + 20);     // Red
            data[i + 1] = Math.min(255, data[i + 1] * 1.2 + 20); // Green
            data[i + 2] = Math.min(255, data[i + 2] * 1.2 + 20); // Blue
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    applySharpenFilter(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const output = new Uint8ClampedArray(data);
        
        // Sharpen kernel
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) { // RGB channels
                    let sum = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                            sum += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                        }
                    }
                    output[(y * width + x) * 4 + c] = Math.max(0, Math.min(255, sum));
                }
            }
        }
        
        const outputImageData = new ImageData(output, width, height);
        ctx.putImageData(outputImageData, 0, 0);
    }
    
    applyBicubicInterpolation(ctx, canvas, scaleFactor) {
        const originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const newWidth = canvas.width * scaleFactor;
        const newHeight = canvas.height * scaleFactor;
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        const newImageData = ctx.createImageData(newWidth, newHeight);
        
        for (let y = 0; y < newHeight; y++) {
            for (let x = 0; x < newWidth; x++) {
                const srcX = x / scaleFactor;
                const srcY = y / scaleFactor;
                
                const color = this.bicubicInterpolate(originalImageData, srcX, srcY);
                const idx = (y * newWidth + x) * 4;
                
                newImageData.data[idx] = color[0];     // R
                newImageData.data[idx + 1] = color[1]; // G
                newImageData.data[idx + 2] = color[2]; // B
                newImageData.data[idx + 3] = 255;      // A
            }
        }
        
        ctx.putImageData(newImageData, 0, 0);
    }
    
    bicubicInterpolate(imageData, x, y) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        
        const result = [0, 0, 0];
        
        for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let dy = -1; dy <= 2; dy++) {
                for (let dx = -1; dx <= 2; dx++) {
                    const px = Math.max(0, Math.min(width - 1, x0 + dx));
                    const py = Math.max(0, Math.min(height - 1, y0 + dy));
                    const idx = (py * width + px) * 4 + c;
                    
                    const wx = this.cubicWeight(x - (x0 + dx));
                    const wy = this.cubicWeight(y - (y0 + dy));
                    
                    sum += data[idx] * wx * wy;
                }
            }
            result[c] = Math.max(0, Math.min(255, sum));
        }
        
        return result;
    }
    
    cubicWeight(t) {
        const a = -0.5;
        const absT = Math.abs(t);
        
        if (absT <= 1) {
            return (a + 2) * absT * absT * absT - (a + 3) * absT * absT + 1;
        } else if (absT <= 2) {
            return a * absT * absT * absT - 5 * a * absT * absT + 8 * a * absT - 4 * a;
        } else {
            return 0;
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new CropReviewV2();
});

// Add keyboard shortcut hints to the page
document.addEventListener('DOMContentLoaded', () => {
    const hints = document.createElement('div');
    hints.style.cssText = `
        position: fixed;
        bottom: 70px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px;
        border-radius: 8px;
        font-size: 12px;
        font-family: monospace;
        z-index: 1000;
        opacity: 0.7;
    `;
    hints.innerHTML = `
        <div><strong>Keyboard Shortcuts:</strong></div>
        <div>Enter or N: Save & Next</div>
        <div>← or P: Previous</div>
        <div>→ or S: Skip</div>
        <div>Delete: Delete crop</div>
    `;
    document.body.appendChild(hints);
});
