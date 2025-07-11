// Global variables
let cameras = [];
let currentCameraIndex = 0;
let currentImageIndex = 0;
let currentCameraImages = [];
let zoomCanvas, zoomCtx;
let mainImage;
let clicks = []; // Store click coordinates
let cursorSquare;
let cropIndicators = []; // Store crop indicator elements

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupKeyboardShortcuts();
});

async function initializeApp() {
    try {
        // Initialize zoom canvas
        zoomCanvas = document.getElementById('zoom-canvas');
        zoomCtx = zoomCanvas.getContext('2d');
        mainImage = document.getElementById('main-image');
        cursorSquare = document.getElementById('cursor-square');
        
        await loadCameras();
        if (cameras.length > 0) {
            // Check for camera parameter in URL
            const urlParams = new URLSearchParams(window.location.search);
            const cameraParam = urlParams.get('camera');
            
            if (cameraParam) {
                // Find the camera index
                const cameraIndex = cameras.findIndex(cam => cam.name === cameraParam);
                if (cameraIndex !== -1) {
                    currentCameraIndex = cameraIndex;
                }
            }
            
            await loadCurrentCameraImages();
            showCurrentImage();
        } else {
            showNoImages();
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        showNoImages();
    }
    
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('next-image-btn').addEventListener('click', nextImage);
    document.getElementById('prev-image-btn').addEventListener('click', previousImage);
    document.getElementById('next-camera-btn').addEventListener('click', nextCamera);
    document.getElementById('prev-camera-btn').addEventListener('click', previousCamera);
    document.getElementById('next-unviewed-btn').addEventListener('click', nextUnviewedImage);
    document.getElementById('latest-btn').addEventListener('click', goToLatest);
    document.getElementById('refresh-btn').addEventListener('click', refreshData);
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
    
    // Add zoom and click functionality to main image
    mainImage.addEventListener('mousemove', handleImageHover);
    mainImage.addEventListener('mouseleave', clearZoomPreview);
    mainImage.addEventListener('click', handleImageClick);
    
    // Add window resize listener to reposition crop indicators
    window.addEventListener('resize', positionCropIndicators);
    mainImage.addEventListener('load', positionCropIndicators);
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(event) {
        switch(event.key) {
            case 'ArrowRight':
                event.preventDefault();
                nextImage();
                break;
            case ' ':
                event.preventDefault();
                nextUnviewedImage();
                break;
            case 'ArrowLeft':
                event.preventDefault();
                previousImage();
                break;
            case 'ArrowUp':
                event.preventDefault();
                nextCamera();
                break;
            case 'ArrowDown':
                event.preventDefault();
                previousCamera();
                break;
            case 'f':
            case 'F':
                event.preventDefault();
                toggleFullscreen();
                break;
            case 'r':
            case 'R':
                event.preventDefault();
                refreshData();
                break;
        }
    });
}

async function loadCameras() {
    try {
        const response = await fetch('/api/cameras');
        cameras = await response.json();
        updateCameraInfo();
    } catch (error) {
        console.error('Error loading cameras:', error);
        cameras = [];
    }
}

async function loadCurrentCameraImages() {
    if (cameras.length === 0) return;
    
    const currentCamera = cameras[currentCameraIndex];
    showLoading();
    
    try {
        const response = await fetch(`/api/cameras/${currentCamera.name}/images?limit=1000`);
        const data = await response.json();
        currentCameraImages = data.images || [];
        
        // Start with the latest image
        currentImageIndex = 0;
        
        hideLoading();
        updateImageInfo();
    } catch (error) {
        console.error('Error loading camera images:', error);
        currentCameraImages = [];
        hideLoading();
    }
}

function showCurrentImage() {
    if (currentCameraImages.length === 0) {
        showNoImages();
        return;
    }
    
    const currentImage = currentCameraImages[currentImageIndex];
    const mainImage = document.getElementById('main-image');
    
    // Show loading state
    showLoading();
    mainImage.style.display = 'none';
    
    // Load the image
    const img = new Image();
    img.onload = function() {
        mainImage.src = currentImage.path;
        mainImage.classList.add('loaded');
        hideLoading();
        mainImage.style.display = 'block';
        
        // Initialize zoom preview
        clearZoomPreview();
        
        // Small delay to ensure image is rendered before positioning indicators
        setTimeout(() => {
            // Load and display saved crops
            loadSavedCrops();
        }, 100);
        
        // Track the view
        trackImageView();
    };
    img.onerror = function() {
        console.error('Failed to load image:', currentImage.path);
        hideLoading();
        showNoImages();
    };
    img.src = currentImage.path;
    
    updateImageInfo();
    updateNavigationButtons();
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('no-image').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showNoImages() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('no-image').style.display = 'block';
    document.getElementById('main-image').style.display = 'none';
}

function updateImageInfo() {
    const cameraNameElement = document.getElementById('camera-name');
    const imageDetailsElement = document.getElementById('image-details');
    const imageCountElement = document.getElementById('image-count');
    
    if (cameras.length === 0) {
        cameraNameElement.textContent = 'No Cameras Available';
        imageDetailsElement.textContent = 'No images found';
        imageCountElement.textContent = '';
        return;
    }
    
    const currentCamera = cameras[currentCameraIndex];
    cameraNameElement.textContent = currentCamera.displayName;
    
    if (currentCameraImages.length === 0) {
        imageDetailsElement.textContent = 'No images available for this camera';
        imageCountElement.textContent = '';
        return;
    }
    
    const currentImage = currentCameraImages[currentImageIndex];
    const timestamp = new Date(currentImage.timestamp).toLocaleString();
    const sizeKB = Math.round(currentImage.size / 1024);
    const viewCount = currentImage.viewCount || 0;
    
    imageDetailsElement.textContent = `${currentImage.filename} • ${timestamp} • ${sizeKB} KB • Views: ${viewCount}`;
    imageCountElement.textContent = `Image ${currentImageIndex + 1} of ${currentCameraImages.length}`;
}

function updateCameraInfo() {
    const currentCameraInfo = document.getElementById('current-camera-info');
    const totalCamerasInfo = document.getElementById('total-cameras-info');
    
    if (cameras.length === 0) {
        currentCameraInfo.textContent = 'No cameras available';
        totalCamerasInfo.textContent = 'Please check that the capture system is running';
        return;
    }
    
    const currentCamera = cameras[currentCameraIndex];
    currentCameraInfo.textContent = `${currentCamera.displayName} (${currentCameraIndex + 1}/${cameras.length})`;
    totalCamerasInfo.textContent = `${cameras.length} cameras total`;
}

function updateNavigationButtons() {
    const nextImageBtn = document.getElementById('next-image-btn');
    const prevImageBtn = document.getElementById('prev-image-btn');
    const nextCameraBtn = document.getElementById('next-camera-btn');
    const prevCameraBtn = document.getElementById('prev-camera-btn');
    
    // Image navigation
    nextImageBtn.disabled = currentImageIndex >= currentCameraImages.length - 1;
    prevImageBtn.disabled = currentImageIndex <= 0;
    
    // Camera navigation
    nextCameraBtn.disabled = cameras.length <= 1;
    prevCameraBtn.disabled = cameras.length <= 1;
}

async function nextImage() {
    if (currentImageIndex < currentCameraImages.length - 1) {
        currentImageIndex++;
        showCurrentImage();
    }
}

async function previousImage() {
    if (currentImageIndex > 0) {
        currentImageIndex--;
        showCurrentImage();
    }
}

async function nextCamera() {
    if (cameras.length > 1) {
        currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
        currentImageIndex = 0;
        await loadCurrentCameraImages();
        showCurrentImage();
        updateCameraInfo();
    }
}

async function previousCamera() {
    if (cameras.length > 1) {
        currentCameraIndex = currentCameraIndex === 0 ? cameras.length - 1 : currentCameraIndex - 1;
        currentImageIndex = 0;
        await loadCurrentCameraImages();
        showCurrentImage();
        updateCameraInfo();
    }
}

async function goToLatest() {
    currentImageIndex = 0; // Latest is always first in our sorted array
    showCurrentImage();
}

async function refreshData() {
    showLoading();
    await loadCameras();
    if (cameras.length > 0) {
        await loadCurrentCameraImages();
        showCurrentImage();
    }
    updateCameraInfo();
}

function toggleFullscreen() {
    const container = document.querySelector('.container');
    container.classList.toggle('fullscreen');
    
    const button = document.getElementById('fullscreen-btn');
    if (container.classList.contains('fullscreen')) {
        button.textContent = 'Exit Fullscreen';
    } else {
        button.textContent = 'Fullscreen';
    }
}

// Zoom preview functionality
function handleImageHover(event) {
    if (!mainImage.complete || !mainImage.naturalWidth) return;
    
    const rect = mainImage.getBoundingClientRect();
    const containerRect = mainImage.parentElement.getBoundingClientRect();
    
    // Calculate the actual displayed image dimensions and position
    const imageAspectRatio = mainImage.naturalWidth / mainImage.naturalHeight;
    const containerAspectRatio = rect.width / rect.height;
    
    let displayedWidth, displayedHeight, offsetX, offsetY;
    
    if (imageAspectRatio > containerAspectRatio) {
        // Image is wider - fit to width, letterbox top/bottom
        displayedWidth = rect.width;
        displayedHeight = rect.width / imageAspectRatio;
        offsetX = 0;
        offsetY = (rect.height - displayedHeight) / 2;
    } else {
        // Image is taller - fit to height, letterbox left/right
        displayedWidth = rect.height * imageAspectRatio;
        displayedHeight = rect.height;
        offsetX = (rect.width - displayedWidth) / 2;
        offsetY = 0;
    }
    
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Check if mouse is within the actual image bounds
    if (mouseX < offsetX || mouseX > offsetX + displayedWidth || 
        mouseY < offsetY || mouseY > offsetY + displayedHeight) {
        cursorSquare.style.display = 'none';
        clearZoomPreview();
        return;
    }
    
    // Show cursor square and position it
    cursorSquare.style.display = 'block';
    cursorSquare.style.left = mouseX + 'px';
    cursorSquare.style.top = mouseY + 'px';
    
    // Calculate cursor square size to match zoom preview area
    // Zoom preview shows 10% of image width from original image
    const zoomSize = Math.round(mainImage.naturalWidth * 0.1);
    const scaleX = displayedWidth / mainImage.naturalWidth;
    const scaleY = displayedHeight / mainImage.naturalHeight;
    const cursorWidth = zoomSize * scaleX;
    const cursorHeight = zoomSize * scaleY;
    
    cursorSquare.style.width = cursorWidth + 'px';
    cursorSquare.style.height = cursorHeight + 'px';
    
    // Calculate relative coordinates within the actual image
    const relativeX = (mouseX - offsetX) / displayedWidth;
    const relativeY = (mouseY - offsetY) / displayedHeight;
    
    // Update coordinates display
    const coordsElement = document.getElementById('zoom-coordinates');
    coordsElement.textContent = `X: ${Math.round(relativeX * 100)}%, Y: ${Math.round(relativeY * 100)}%`;
    
    // Draw zoomed area
    drawZoomPreview(relativeX, relativeY);
}

function drawZoomPreview(relativeX, relativeY) {
    if (!mainImage.complete || !mainImage.naturalWidth) return;
    
    // Clear canvas
    zoomCtx.fillStyle = '#000';
    zoomCtx.fillRect(0, 0, zoomCanvas.width, zoomCanvas.height);
    
    // Calculate source coordinates on the original image
    const sourceX = relativeX * mainImage.naturalWidth;
    const sourceY = relativeY * mainImage.naturalHeight;
    
    // Zoom area size (10% of image width from original image)
    const zoomSize = Math.round(mainImage.naturalWidth * 0.1);
    const halfZoom = zoomSize / 2;
    
    // Ensure we don't go outside image bounds
    const startX = Math.max(0, Math.min(sourceX - halfZoom, mainImage.naturalWidth - zoomSize));
    const startY = Math.max(0, Math.min(sourceY - halfZoom, mainImage.naturalHeight - zoomSize));
    
    try {
        // Draw the zoomed portion
        zoomCtx.drawImage(
            mainImage,
            startX, startY, zoomSize, zoomSize,  // Source rectangle
            0, 0, zoomCanvas.width, zoomCanvas.height  // Destination rectangle
        );
        
        // Draw crosshair in center
        zoomCtx.strokeStyle = '#ff0000';
        zoomCtx.lineWidth = 2;
        zoomCtx.beginPath();
        // Horizontal line
        zoomCtx.moveTo(zoomCanvas.width/2 - 10, zoomCanvas.height/2);
        zoomCtx.lineTo(zoomCanvas.width/2 + 10, zoomCanvas.height/2);
        // Vertical line
        zoomCtx.moveTo(zoomCanvas.width/2, zoomCanvas.height/2 - 10);
        zoomCtx.lineTo(zoomCanvas.width/2, zoomCanvas.height/2 + 10);
        zoomCtx.stroke();
        
    } catch (error) {
        console.error('Error drawing zoom preview:', error);
    }
}

function clearZoomPreview() {
    cursorSquare.style.display = 'none';
    
    zoomCtx.fillStyle = '#000';
    zoomCtx.fillRect(0, 0, zoomCanvas.width, zoomCanvas.height);
    
    // Draw placeholder text
    zoomCtx.fillStyle = '#666';
    zoomCtx.font = '14px Arial';
    zoomCtx.textAlign = 'center';
    zoomCtx.fillText('Hover over image', zoomCanvas.width/2, zoomCanvas.height/2);
    
    document.getElementById('zoom-coordinates').textContent = 'Hover over image';
}

function handleImageClick(event) {
    if (!mainImage.complete || !mainImage.naturalWidth) return;
    
    const rect = mainImage.getBoundingClientRect();
    
    // Calculate the actual displayed image dimensions and position
    const imageAspectRatio = mainImage.naturalWidth / mainImage.naturalHeight;
    const containerAspectRatio = rect.width / rect.height;
    
    let displayedWidth, displayedHeight, offsetX, offsetY;
    
    if (imageAspectRatio > containerAspectRatio) {
        // Image is wider - fit to width, letterbox top/bottom
        displayedWidth = rect.width;
        displayedHeight = rect.width / imageAspectRatio;
        offsetX = 0;
        offsetY = (rect.height - displayedHeight) / 2;
    } else {
        // Image is taller - fit to height, letterbox left/right
        displayedWidth = rect.height * imageAspectRatio;
        displayedHeight = rect.height;
        offsetX = (rect.width - displayedWidth) / 2;
        offsetY = 0;
    }
    
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Check if click is within the actual image bounds
    if (mouseX < offsetX || mouseX > offsetX + displayedWidth || 
        mouseY < offsetY || mouseY > offsetY + displayedHeight) {
        return; // Ignore clicks outside the actual image
    }
    
    // Calculate relative coordinates within the actual image
    const relativeX = (mouseX - offsetX) / displayedWidth;
    const relativeY = (mouseY - offsetY) / displayedHeight;
    
    // Store click coordinates
    const click = {
        x: relativeX,
        y: relativeY,
        timestamp: new Date().toISOString(),
        imageIndex: currentImageIndex,
        cameraIndex: currentCameraIndex
    };
    
    clicks.push(click);
    
    // Save the image
    saveClickedImage(click);
    
    // Show immediate crop indicator
    showImmediateCropIndicator(click, displayedWidth, displayedHeight, offsetX, offsetY);
    
    // Visual feedback for click
    showClickFeedback(mouseX, mouseY);
    
    // Update instructions
    const instructionsElement = document.getElementById('zoom-instructions');
    instructionsElement.textContent = `Clicks recorded: ${clicks.length}`;
    
    console.log('Click recorded:', click);
}

function showClickFeedback(x, y) {
    // Create a temporary visual indicator
    const indicator = document.createElement('div');
    indicator.style.position = 'absolute';
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
    indicator.style.width = '10px';
    indicator.style.height = '10px';
    indicator.style.backgroundColor = '#ff0000';
    indicator.style.borderRadius = '50%';
    indicator.style.transform = 'translate(-50%, -50%)';
    indicator.style.pointerEvents = 'none';
    indicator.style.zIndex = '1000';
    indicator.style.animation = 'clickPulse 1s ease-out forwards';
    
    const imageContainer = document.querySelector('.image-container');
    imageContainer.style.position = 'relative';
    imageContainer.appendChild(indicator);
    
    // Remove after animation
    setTimeout(() => {
        if (indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    }, 1000);
}

async function saveClickedImage(click) {
    try {
        const currentImage = currentCameraImages[currentImageIndex];
        const currentCamera = cameras[currentCameraIndex];
        
        const saveData = {
            imagePath: currentImage.path,
            cameraName: currentCamera.name,
            timestamp: currentImage.timestamp,
            coordinates: {
                x: click.x,
                y: click.y
            }
        };
        
        const response = await fetch('/api/save-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(saveData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Image saved successfully:', result.filename);
            
            // Show temporary success message
            const instructionsElement = document.getElementById('zoom-instructions');
            const originalText = instructionsElement.textContent;
            instructionsElement.textContent = `✓ Image saved! (${clicks.length} total)`;
            instructionsElement.style.color = '#00ff00';
            
            setTimeout(() => {
                instructionsElement.textContent = originalText;
                instructionsElement.style.color = '';
            }, 2000);
        } else {
            console.error('Failed to save image:', result.error);
        }
        
    } catch (error) {
        console.error('Error saving image:', error);
    }
}

// Track image view
async function trackImageView() {
    try {
        if (currentCameraImages.length === 0 || cameras.length === 0) return;
        
        const currentImage = currentCameraImages[currentImageIndex];
        const currentCamera = cameras[currentCameraIndex];
        
        const viewData = {
            cameraName: currentCamera.name,
            filename: currentImage.filename
        };
        
        const response = await fetch('/api/track-view', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(viewData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`View tracked: ${result.viewCount} views for ${viewData.filename}`);
            
            // Update the view count in the local image data
            currentCameraImages[currentImageIndex].viewCount = result.viewCount;
            
            // Update UI to show view count
            updateImageInfo();
        }
        
    } catch (error) {
        console.error('Error tracking view:', error);
    }
}

// Go to next unviewed image
async function nextUnviewedImage() {
    try {
        if (currentCameraImages.length === 0) return;
        
        // Sort current images by view count (ascending) then by timestamp (newest first)
        const sortedImages = [...currentCameraImages].sort((a, b) => {
            const aViewCount = a.viewCount || 0;
            const bViewCount = b.viewCount || 0;
            
            if (aViewCount !== bViewCount) {
                return aViewCount - bViewCount; // Least viewed first
            }
            return new Date(b.timestamp) - new Date(a.timestamp); // Newest first for ties
        });
        
        // Find the least viewed image
        const leastViewedImage = sortedImages[0];
        
        if (leastViewedImage) {
            // Find this image's index in the original currentCameraImages array
            const imageIndex = currentCameraImages.findIndex(img => 
                img.filename === leastViewedImage.filename
            );
            
            if (imageIndex !== -1) {
                currentImageIndex = imageIndex;
                showCurrentImage();
                
                // Show feedback about view count
                const instructionsElement = document.getElementById('zoom-instructions');
                const originalText = instructionsElement.textContent;
                const viewCount = leastViewedImage.viewCount || 0;
                
                if (viewCount === 0) {
                    instructionsElement.textContent = `📈 Jumped to unviewed image`;
                } else {
                    instructionsElement.textContent = `📈 Jumped to image with ${viewCount} views`;
                }
                instructionsElement.style.color = '#3498db';
                
                setTimeout(() => {
                    instructionsElement.textContent = originalText;
                    instructionsElement.style.color = '';
                }, 3000);
            } else {
                console.log('Image index not found in current camera images');
            }
        } else {
            console.log('No images available');
        }
        
    } catch (error) {
        console.error('Error getting next unviewed image:', error);
    }
}

// Load and display saved crops for the current image
async function loadSavedCrops() {
    try {
        // Clear existing crop indicators
        clearCropIndicators();
        
        if (currentCameraImages.length === 0 || cameras.length === 0) return;
        
        const currentImage = currentCameraImages[currentImageIndex];
        const currentCamera = cameras[currentCameraIndex];
        
        // Get the filename from the path
        const filename = currentImage.path.split('/').pop();
        
        const response = await fetch(`/api/images/${encodeURIComponent(currentCamera.name)}/${encodeURIComponent(filename)}/crops`);
        const data = await response.json();
        
        if (data.crops && data.crops.length > 0) {
            displayCropIndicators(data.crops);
            // Position indicators after a small delay to ensure DOM is updated
            setTimeout(positionCropIndicators, 50);
        }
        
    } catch (error) {
        console.error('Error loading saved crops:', error);
    }
}

// Display blue rectangles for saved crops
function displayCropIndicators(crops) {
    const imageContainer = document.querySelector('.image-container');
    
    crops.forEach(crop => {
        const indicator = document.createElement('div');
        indicator.className = 'crop-indicator';
        indicator.style.position = 'absolute';
        indicator.style.backgroundColor = 'transparent';
        indicator.style.border = '2px solid #0064ff';
        indicator.style.borderRadius = '2px';
        indicator.style.pointerEvents = 'none';
        indicator.style.zIndex = '100';
        indicator.style.boxShadow = '0 0 4px rgba(0, 100, 255, 0.5)';
        
        // Store crop data for positioning
        indicator.dataset.cropX = crop.click_x;
        indicator.dataset.cropY = crop.click_y;
        indicator.dataset.cropLeft = crop.crop_left;
        indicator.dataset.cropTop = crop.crop_top;
        indicator.dataset.cropWidth = crop.crop_width;
        indicator.dataset.cropHeight = crop.crop_height;
        indicator.dataset.originalWidth = crop.original_width;
        indicator.dataset.originalHeight = crop.original_height;
        indicator.dataset.cropTime = new Date(crop.saved_at).toLocaleString();
        
        // Add tooltip
        indicator.title = `Crop area: ${crop.crop_width}×${crop.crop_height}px at (${Math.round(crop.click_x * 100)}%, ${Math.round(crop.click_y * 100)}%) - ${indicator.dataset.cropTime}`;
        
        imageContainer.appendChild(indicator);
        cropIndicators.push(indicator);
    });
    
    // Position indicators will be called with delay from loadSavedCrops
}

// Position crop indicators based on current image dimensions
function positionCropIndicators() {
    if (!mainImage.complete || !mainImage.naturalWidth || cropIndicators.length === 0) return;
    
    const rect = mainImage.getBoundingClientRect();
    
    // Calculate the actual displayed image dimensions and position (same logic as click handler)
    const imageAspectRatio = mainImage.naturalWidth / mainImage.naturalHeight;
    const containerAspectRatio = rect.width / rect.height;
    
    let displayedWidth, displayedHeight, offsetX, offsetY;
    
    if (imageAspectRatio > containerAspectRatio) {
        // Image is wider - fit to width, letterbox top/bottom
        displayedWidth = rect.width;
        displayedHeight = rect.width / imageAspectRatio;
        offsetX = 0;
        offsetY = (rect.height - displayedHeight) / 2;
    } else {
        // Image is taller - fit to height, letterbox left/right
        displayedWidth = rect.height * imageAspectRatio;
        displayedHeight = rect.height;
        offsetX = (rect.width - displayedWidth) / 2;
        offsetY = 0;
    }
    
    // Calculate scale factors
    const scaleX = displayedWidth / mainImage.naturalWidth;
    const scaleY = displayedHeight / mainImage.naturalHeight;
    
    cropIndicators.forEach(indicator => {
        const cropLeft = parseInt(indicator.dataset.cropLeft);
        const cropTop = parseInt(indicator.dataset.cropTop);
        const cropWidth = parseInt(indicator.dataset.cropWidth);
        const cropHeight = parseInt(indicator.dataset.cropHeight);
        
        // Convert crop area from original image coordinates to displayed coordinates
        const displayLeft = offsetX + (cropLeft * scaleX);
        const displayTop = offsetY + (cropTop * scaleY);
        const displayWidth = cropWidth * scaleX;
        const displayHeight = cropHeight * scaleY;
        
        // Position and size the indicator to match the actual crop area
        indicator.style.left = displayLeft + 'px';
        indicator.style.top = displayTop + 'px';
        indicator.style.width = displayWidth + 'px';
        indicator.style.height = displayHeight + 'px';
        indicator.style.display = 'block';
    });
}

// Clear all crop indicators
function clearCropIndicators() {
    cropIndicators.forEach(indicator => {
        if (indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    });
    cropIndicators = [];
}

// Show immediate crop indicator after user clicks
function showImmediateCropIndicator(click, displayedWidth, displayedHeight, offsetX, offsetY) {
    if (!mainImage.complete || !mainImage.naturalWidth) return;
    
    const imageContainer = document.querySelector('.image-container');
    
    // Calculate crop area (same logic as server: 10% of image width around click point)
    const cropSize = Math.round(mainImage.naturalWidth * 0.1);
    const halfCrop = cropSize / 2;
    
    // Convert click coordinates to original image pixel coordinates
    const centerX = click.x * mainImage.naturalWidth;
    const centerY = click.y * mainImage.naturalHeight;
    
    // Calculate crop bounds in original image coordinates
    const cropLeft = Math.max(0, Math.min(centerX - halfCrop, mainImage.naturalWidth - cropSize));
    const cropTop = Math.max(0, Math.min(centerY - halfCrop, mainImage.naturalHeight - cropSize));
    const actualCropSize = Math.min(cropSize, mainImage.naturalWidth - cropLeft, mainImage.naturalHeight - cropTop);
    
    // Calculate scale factors
    const scaleX = displayedWidth / mainImage.naturalWidth;
    const scaleY = displayedHeight / mainImage.naturalHeight;
    
    // Convert crop area to displayed coordinates
    const displayLeft = offsetX + (cropLeft * scaleX);
    const displayTop = offsetY + (cropTop * scaleY);
    const displayWidth = actualCropSize * scaleX;
    const displayHeight = actualCropSize * scaleY;
    
    // Create immediate indicator
    const indicator = document.createElement('div');
    indicator.className = 'crop-indicator immediate-crop';
    indicator.style.position = 'absolute';
    indicator.style.backgroundColor = 'transparent';
    indicator.style.border = '3px solid #00ff00'; // Green for new crop
    indicator.style.borderRadius = '2px';
    indicator.style.pointerEvents = 'none';
    indicator.style.zIndex = '150'; // Higher than existing indicators
    indicator.style.boxShadow = '0 0 6px rgba(0, 255, 0, 0.7)';
    indicator.style.left = displayLeft + 'px';
    indicator.style.top = displayTop + 'px';
    indicator.style.width = displayWidth + 'px';
    indicator.style.height = displayHeight + 'px';
    indicator.style.display = 'block';
    indicator.style.animation = 'cropAppear 0.3s ease-out';
    
    indicator.title = `New crop: ${actualCropSize}×${actualCropSize}px at (${Math.round(click.x * 100)}%, ${Math.round(click.y * 100)}%)`;
    
    imageContainer.appendChild(indicator);
    cropIndicators.push(indicator);
    
    // Change color to blue after a delay to match saved crops
    setTimeout(() => {
        indicator.style.border = '2px solid #0064ff';
        indicator.style.boxShadow = '0 0 4px rgba(0, 100, 255, 0.5)';
        indicator.style.zIndex = '100';
        indicator.classList.remove('immediate-crop');
    }, 2000);
}

// Motion detection processing functions
function convertToGrayscale(imageData) {
    const data = new Uint8ClampedArray(imageData.data);
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = gray;     // red
        data[i + 1] = gray; // green
        data[i + 2] = gray; // blue
        // alpha remains unchanged
    }
    return new ImageData(data, imageData.width, imageData.height);
}

function subtractImages(current, previous) {
    const data = new Uint8ClampedArray(current.data);
    for (let i = 0; i < data.length; i += 4) {
        // Calculate absolute difference for each channel
        data[i] = Math.abs(current.data[i] - previous.data[i]);
        data[i + 1] = Math.abs(current.data[i + 1] - previous.data[i + 1]);
        data[i + 2] = Math.abs(current.data[i + 2] - previous.data[i + 2]);
        // alpha remains unchanged
    }
    return new ImageData(data, current.width, current.height);
}

function averageImages(subtracted, original) {
    const data = new Uint8ClampedArray(original.data);
    for (let i = 0; i < data.length; i += 4) {
        // Average the RGB channels
        data[i] = (subtracted.data[i] + original.data[i]) / 2;
        data[i + 1] = (subtracted.data[i + 1] + original.data[i + 1]) / 2;
        data[i + 2] = (subtracted.data[i + 2] + original.data[i + 2]) / 2;
        // alpha remains unchanged
    }
    return new ImageData(data, original.width, original.height);
}

function processMotionDetection() {
    if (!currentImageData || !previousImageData) {
        return;
    }
    
    try {
        document.getElementById('motion-loading').style.display = 'block';
        document.getElementById('motion-status').textContent = 'Processing motion detection...';
        
        // Convert both images to grayscale
        const currentGray = convertToGrayscale(currentImageData);
        const previousGray = convertToGrayscale(previousImageData);
        
        // Subtract previous from current
        const subtractedImage = subtractImages(currentGray, previousGray);
        
        // Average the subtracted image with the original
        const motionEnhanced = averageImages(subtractedImage, currentImageData);
        
        // Draw the result to the motion canvas
        motionCtx.putImageData(motionEnhanced, 0, 0);
        
        document.getElementById('motion-loading').style.display = 'none';
        document.getElementById('motion-status').textContent = 'Motion detection complete';
    } catch (error) {
        console.error('Error processing motion detection:', error);
        document.getElementById('motion-loading').style.display = 'none';
        document.getElementById('motion-status').textContent = 'Error processing motion';
    }
}

function captureImageDataForMotion() {
    if (!motionCanvas || !motionCtx) {
        return;
    }
    
    const mainImage = document.getElementById('main-image');
    if (!mainImage.complete || !mainImage.naturalWidth) {
        return;
    }
    
    try {
        // Store previous image data
        if (currentImageData) {
            previousImageData = currentImageData;
        }
        
        // Set canvas size to match the image display size
        const rect = mainImage.getBoundingClientRect();
        motionCanvas.width = rect.width;
        motionCanvas.height = rect.height;
        
        // Draw current image to a temporary canvas to get image data
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = rect.width;
        tempCanvas.height = rect.height;
        
        tempCtx.drawImage(mainImage, 0, 0, rect.width, rect.height);
        currentImageData = tempCtx.getImageData(0, 0, rect.width, rect.height);
        
        // Process motion detection if we have both current and previous images
        if (currentImageData && previousImageData) {
            processMotionDetection();
        } else {
            document.getElementById('motion-status').textContent = 'Waiting for next image...';
        }
    } catch (error) {
        console.error('Error capturing image data for motion:', error);
        document.getElementById('motion-status').textContent = 'Error capturing image data';
    }
}
